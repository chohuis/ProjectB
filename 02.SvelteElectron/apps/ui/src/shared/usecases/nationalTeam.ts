/**
 * 국가대표 · 국제대회 (Phase 7-3)
 *
 * **경기는 시뮬하지 않는다** (사용자 확정) — 대표팀 전력으로 순위를 확률 산출하고
 * 그 순위가 병역 면제를 정한다. 사용자가 보는 건 발탁·결과·면제다.
 *
 * 대회는 4년 주기이고 `yearMod`가 서로 달라 **한 해에 둘이 겹치지 않는다.**
 *
 * 흐름:
 * ```
 * 개막 주(week)          발탁 → 소속팀에서 이탈 (부상과 같은 취급)
 * 개막 + durationWeeks   결과 산출 → 메달·면제 → 복귀
 * ```
 */
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { loadRosterRules } from "../repo/newGameV3";
import { autoLog } from "../stores/autoAdvance";
import type { PlayerSeasonStats } from "../types/save";

export interface TournamentDef {
  id: string; name: string;
  cycleYears: number; yearMod: number;
  week: number; durationWeeks: number;
  rosterSize: number; fieldSize: number; exemptionRank: number;
}

export interface SquadResult {
  tournament: TournamentDef | null;
  squad: string[];
  protagonistSelected: boolean;
  squadStrength: number;
}

export interface TournamentResult {
  rank: number; fieldSize: number; exemption: boolean; medal: string | null;
}

const engine = <T>(fn: string, payload: unknown): Promise<T> =>
  window.projectB!.engine(fn, JSON.stringify(payload)).then((raw) => {
    const v = JSON.parse(raw) as T & { error?: string };
    if (v && typeof v === "object" && "error" in v && v.error) throw new Error(String(v.error));
    return v as T;
  });

/** 그 해 대회. 없으면 null */
export function tournamentOfYear(rules: unknown, year: number): TournamentDef | null {
  const list = (rules as { tournaments?: TournamentDef[] } | undefined)?.tournaments ?? [];
  return list.find((t) => t.cycleYears > 0 && year % t.cycleYears === t.yearMod) ?? null;
}

/**
 * 대표 후보의 성적 점수. 승강 판정과 **같은 축**을 쓴다 —
 * 따로 만들면 "대표는 뽑혔는데 2군으로 내려간" 모순이 생긴다.
 */
function formOf(npcId: string, stats: Record<string, Record<string, PlayerSeasonStats>>): number {
  for (const lid of ["LEAGUE_KBL", "LEAGUE_KBL_FARM"]) {
    const st = stats[lid]?.[npcId];
    if (!st) continue;
    if (st.type === "pitcher") {
      if (st.ip <= 0) return 0;
      const sample = Math.min(1, st.ip / 40);
      return Math.max(-1, Math.min(1, ((4.5 - st.era) / 4.5) * sample));
    }
    if (st.pa <= 0) return 0;
    const sample = Math.min(1, st.pa / 120);
    return Math.max(-1, Math.min(1, ((st.ops - 0.7) / 0.7) * sample));
  }
  return 0;
}

/** 국가대표 발탁 — 개막 주에 부른다 */
export async function callUpNationalSquad(seasonYear: number): Promise<SquadResult | null> {
  const rulesFile = await loadRosterRules();
  const rules = rulesFile.internationalRules;
  if (!rules) return null;

  const g = get(gameStore);
  const m = get(masterStore);
  const s = get(seasonStore);
  const live = get(npcLiveStatsStore);

  const leagueStats: Record<string, Record<string, PlayerSeasonStats>> = {};
  for (const lid of ["LEAGUE_KBL", "LEAGUE_KBL_FARM"]) {
    const ls = s.leagueState?.[lid];
    if (ls?.stats) leagueStats[lid] = ls.stats;
  }

  // 후보 = 국내 프로 한국인 현역. 복무 중·면제자는 뽑아도 의미가 없다
  const proLeagues = new Set(["LEAGUE_KBL", "LEAGUE_KBL_FARM"]);
  const candidates = m.entities
    .filter((e) => e.role === "player" && e.status === "active"
      && proLeagues.has(e.leagueId ?? "") && e.militaryStatus !== "현역")
    .map((e) => {
      const ls = live[e.id];
      const p = e.details?.player;
      const ovr = ls?.pitching?.ovr ?? ls?.batting?.ovr
        ?? (p as { pitching?: { ovr?: number }; batting?: { ovr?: number } })?.pitching?.ovr
        ?? (p as { batting?: { ovr?: number } })?.batting?.ovr ?? 50;
      return {
        npcId: e.id, name: e.name || e.id, teamId: e.teamId ?? "",
        position: p?.position ?? "", ovr, age: e.age,
        form: formOf(e.id, leagueStats),
        isProtagonist: e.id === g.protagonist.id,
      };
    });

  if (candidates.length === 0) return null;

  const res = await engine<SquadResult>("selectNationalSquadNative", {
    candidates, rules, year: seasonYear, worldSeed: (s.worldSeed ?? 0) >>> 0,
  });
  if (!res.tournament || res.squad.length === 0) return null;

  autoLog(`[국가대표] ${seasonYear} ${res.tournament.name} 발탁 ${res.squad.length}명 ` +
    `(평균 ${res.squadStrength.toFixed(1)})${res.protagonistSelected ? " · 주인공 포함" : ""}`);
  return res;
}

/** 대회 결과 — 폐막 주에 부른다 */
export async function resolveTournament(
  tournament: TournamentDef,
  squadStrength: number,
  seasonYear: number,
): Promise<TournamentResult> {
  const res = await engine<TournamentResult>("simulateTournamentNative", {
    tournament, squadStrength, year: seasonYear,
    worldSeed: (get(seasonStore).worldSeed ?? 0) >>> 0,
  });
  autoLog(`[국가대표] ${tournament.name} ${res.rank}위/${res.fieldSize}개국` +
    `${res.medal ? ` · ${res.medal}메달` : ""}${res.exemption ? " · 병역 면제" : ""}`);
  return res;
}

// ── 주간 훅 ──────────────────────────────────────────────────────────────────

/**
 * 매주 부른다. 개막 주면 발탁, 폐막 주면 결과·면제, 그 사이면 잔여 주만 줄인다.
 *
 * 이탈자는 `seasonStore.nationalDuty`에 남고, 승강의 상시 콜업이 **부상자와
 * 같은 목록으로** 받아 그 자리를 메운다 — 따로 처리하면 대표 차출 기간에
 * 1군이 빈 채로 돈다.
 */
export async function runNationalTeamWeek(
  weekNum: number,
  weekInYear: number,
): Promise<string[]> {
  const logs: string[] = [];
  const s = get(seasonStore);
  const year = s.seasonYear;

  // 진행 중이면 잔여 주 감소 → 0이면 폐막
  const active = s.activeTournament;
  if (active) {
    if (weekInYear >= active.endWeek) {
      const res = await resolveTournament(active.def, active.squadStrength, year);
      const squad = Object.keys(s.nationalDuty ?? {});
      seasonStore.endNationalDuty();

      if (res.exemption && squad.length > 0) {
        gameStore.grantMilitaryExemption(squad, year, active.def.name);
        logs.push(`${active.def.name} ${res.rank}위 — 대표팀 ${squad.length}명 병역 면제`);
      } else {
        logs.push(`${active.def.name} ${res.rank}위/${res.fieldSize}개국` +
          (res.medal ? ` · ${res.medal}메달` : ""));
      }
    }
    return logs;
  }

  // 개막 주인가
  const rules = (await loadRosterRules()).internationalRules;
  const def = tournamentOfYear(rules, year);
  if (!def || weekInYear !== def.week) return logs;

  const squad = await callUpNationalSquad(year);
  if (!squad?.tournament) return logs;

  seasonStore.startNationalDuty(
    squad.squad, squad.tournament, squad.squadStrength,
    def.week + Math.max(1, def.durationWeeks),
  );
  logs.push(`${def.name} 대표팀 발표 — ${squad.squad.length}명 차출`);
  if (squad.protagonistSelected) logs.push(`국가대표에 발탁됐다.`);
  return logs;
}
