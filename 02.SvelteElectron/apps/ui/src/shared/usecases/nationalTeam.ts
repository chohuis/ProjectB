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
import { finiteOr } from "../utils/payloadNum";

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
    // ⚠ 통계값을 그대로 쓰면 안 된다 — 없으면 NaN이 되고 `JSON.stringify`가
    // 그걸 **null로 바꿔** 엔진이 페이로드 전체를 거부한다.
    // 실측: "selectNationalSquadNative: invalid type: null, expected f64"로
    // 국가대표 선발이 죽어 있었다.
    if (st.type === "pitcher") {
      const ip = finiteOr(st.ip);
      if (ip <= 0) return 0;
      const sample = Math.min(1, ip / 40);
      return finiteOr(Math.max(-1, Math.min(1, ((4.5 - finiteOr(st.era, 4.5)) / 4.5) * sample)));
    }
    const pa = finiteOr(st.pa);
    if (pa <= 0) return 0;
    const sample = Math.min(1, pa / 120);
    return finiteOr(Math.max(-1, Math.min(1, ((finiteOr(st.ops, 0.7) - 0.7) / 0.7) * sample)));
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

  // 후보 = 국내 프로 한국인 현역. 복무 중인 선수는 뽑아도 의미가 없다.
  //
  // ⚠ **국적을 봐야 한다.** 예전엔 `militaryStatus !== "현역"`만 걸렀는데
  // 외국인은 병역이 "면제"라 그 조건을 그냥 통과한다 — KBL 외국인이
  // 한국 국가대표로 뽑혔다. 구 세이브(국적 없음)는 KOR로 읽는다.
  const proLeagues = new Set(["LEAGUE_KBL", "LEAGUE_KBL_FARM"]);
  const candidates = m.entities
    .filter((e) => e.role === "player" && e.status === "active"
      && proLeagues.has(e.leagueId ?? "") && e.militaryStatus !== "현역"
      && (e.nationality ?? "KOR") === "KOR")
    .map((e) => {
      const ls = live[e.id];
      const p = e.details?.player;
      const ovr = ls?.pitching?.ovr ?? ls?.batting?.ovr
        ?? (p as { pitching?: { ovr?: number }; batting?: { ovr?: number } })?.pitching?.ovr
        ?? (p as { batting?: { ovr?: number } })?.batting?.ovr ?? 50;
      return {
        npcId: e.id, name: e.name || e.id, teamId: e.teamId ?? "",
        position: p?.position ?? "",
        // 엔진 `NationalCandidate`는 ovr·form이 f64, age가 i32다 —
        // 하나라도 null/NaN이면 선발 전체가 거부된다
        ovr: finiteOr(ovr, 50),
        age: Math.round(finiteOr(e.age, 25)),
        form: finiteOr(formOf(e.id, leagueStats)),
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
      const wasSelected = squad.includes(get(gameStore).protagonist.id);
      seasonStore.endNationalDuty();

      if (res.exemption && squad.length > 0) {
        gameStore.grantMilitaryExemption(squad, year, active.def.name);
        logs.push(`${active.def.name} ${res.rank}위 — 대표팀 ${squad.length}명 병역 면제`);
      } else {
        logs.push(`${active.def.name} ${res.rank}위/${res.fieldSize}개국` +
          (res.medal ? ` · ${res.medal}메달` : ""));
      }
      emitTournamentResultNews(active.def, res, squad.length, wasSelected, weekNum, year);
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
  emitSquadNews(def, squad, weekNum, year);
  return logs;
}

// ── 뉴스 (Phase 7-6b) ────────────────────────────────────────────────────────
//
// 7-3은 대회를 **로그로만** 냈다. 자동진행 로그는 개발용이라 플레이어는 국가대표
// 발탁도 메달도 병역 면제도 못 본다 — 세계에서 제일 큰 사건이 화면에 없었다.

/** 발탁 발표 */
function emitSquadNews(
  def: TournamentDef,
  squad: SquadResult,
  weekNum: number,
  year: number,
): void {
  const m = get(masterStore);
  const nameOf = (id: string) => m.entities.find((e) => e.id === id)?.name ?? id;
  const teamOf = (id: string) => {
    const t = m.entities.find((e) => e.id === id)?.teamId ?? "";
    return m.teams.find((x) => x.id === t)?.name ?? "-";
  };

  // 명단은 이름만 나열하면 안 읽힌다 — 소속을 붙여 "누가 어디서 왔나"를 보여준다
  const roster = squad.squad
    .slice(0, 20)
    .map((id, i) => `  ${String(i + 1).padStart(2)}. ${nameOf(id)} (${teamOf(id)})`)
    .join("\n");
  const more = squad.squad.length > 20 ? `\n  … 외 ${squad.squad.length - 20}명` : "";

  gameStore.addMessage({
    id: `msg-natl-squad-${year}-w${weekNum}`,
    category: "news",
    sender: "대한야구협회",
    subject: `${year} ${def.name} 국가대표 명단 발표`,
    preview: `${squad.squad.length}명 차출${squad.protagonistSelected ? " · 나도 포함됐다" : ""}`,
    body: [
      `${year} ${def.name}에 나설 국가대표 ${squad.squad.length}명이 발표됐습니다.`,
      "",
      squad.protagonistSelected
        ? "명단에 내 이름이 있었다."
        : "이번에는 명단에 들지 못했다.",
      "",
      roster + more,
      "",
      def.exemptionRank > 0
        ? `${def.exemptionRank}위 이내 입상 시 병역 특례가 주어집니다.`
        : "이 대회에는 병역 특례가 걸려 있지 않습니다.",
      "",
      "대회 기간 동안 차출된 선수는 소속팀 경기에 나서지 않습니다.",
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
  });
}

/** 대회 결과 */
function emitTournamentResultNews(
  def: TournamentDef,
  res: TournamentResult,
  squadSize: number,
  wasSelected: boolean,
  weekNum: number,
  year: number,
): void {
  const medalLine = res.medal
    ? `${res.medal}메달 — ${res.rank}위 / ${res.fieldSize}개국`
    : `${res.rank}위 / ${res.fieldSize}개국`;

  // 같은 순위라도 읽히는 감정이 다르다. 메달·면제·불발을 나눠 쓴다
  const lead =
    res.rank === 1 ? "우승했습니다."
    : res.medal ? `${res.medal}메달을 따냈습니다.`
    : res.rank <= Math.ceil(res.fieldSize / 2) ? "아쉽게 시상대에는 오르지 못했습니다."
    : "기대에 미치지 못한 결과였습니다.";

  const exemptionLine = res.exemption
    ? `\n입상 기준(${def.exemptionRank}위 이내)을 충족해 **대표팀 ${squadSize}명 전원에게 병역 특례**가 주어집니다.`
    : def.exemptionRank > 0
      ? `\n병역 특례 기준(${def.exemptionRank}위 이내)에는 닿지 못했습니다.`
      : "";

  gameStore.addMessage({
    id: `msg-natl-result-${year}-w${weekNum}`,
    category: "news",
    sender: "대한야구협회",
    subject: `${year} ${def.name} — ${medalLine}`,
    preview: lead + (res.exemption ? " · 병역 특례 확정" : ""),
    body: [
      `${year} ${def.name}이 막을 내렸습니다.`,
      "",
      `최종 성적: ${medalLine}`,
      lead,
      exemptionLine,
      "",
      wasSelected
        ? res.exemption
          ? "대표팀의 일원으로 그 자리에 있었다. 병역 문제가 해결됐다."
          : "대표팀의 일원으로 그 자리에 있었다."
        : "이번 대회는 지켜보는 쪽이었다.",
      "",
      "차출됐던 선수들이 소속팀으로 복귀합니다.",
    ].filter((x) => x !== "").join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
  });
}
