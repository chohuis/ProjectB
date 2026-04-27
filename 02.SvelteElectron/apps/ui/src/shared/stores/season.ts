import { derived, get, writable } from "svelte/store";
import type {
  MatchResult,
  PendingAction,
  PlayerGameLine,
  SaveSeason,
  ScheduleEntry,
  Standing,
} from "../types/season";
import type { BatterSeasonStats, PlayerSeasonStats, PitcherSeasonStats } from "../types/save";
import { calcAvg, calcEra, calcOps, calcWhip, makeEmptySeason, SAVE_SEASON_VERSION } from "../types/season";

// ── seasonStore 내부 상태 ─────────────────────────────────────
export type SeasonStoreState = SaveSeason;

function buildInitialState(): SeasonStoreState {
  return makeEmptySeason("LEAGUE_HIGHSCHOOL", 2026, 24, []);
}

// ── 스토어 생성 ───────────────────────────────────────────────
function createSeasonStore() {
  const { subscribe, update, set } = writable<SeasonStoreState>(buildInitialState());

  return {
    subscribe,

    // 앱 시작 시 save_season.json에서 복원
    async load() {
      try {
        const saved = await window.projectB?.seasonLoad?.();
        if (saved) set(saved);
      } catch (e) {
        console.warn("[seasonStore] load failed, using defaults", e);
      }
    },

    // 현재 상태를 save_season.json에 저장
    async save() {
      const s = get({ subscribe });
      const data: SaveSeason = { ...s, savedAt: new Date().toISOString() };
      try {
        await window.projectB?.seasonSave?.(data);
      } catch (e) {
        console.warn("[seasonStore] save failed", e);
      }
    },

    // 새 시즌 초기화
    initSeason(leagueId: string, seasonYear: number, totalWeeks: number, teamIds: string[]) {
      set(makeEmptySeason(leagueId, seasonYear, totalWeeks, teamIds));
    },

    // 시즌 일정 설정 (일정 생성기가 호출)
    setSchedule(schedule: ScheduleEntry[]) {
      update((s) => ({ ...s, schedule }));
    },

    // 현재 주차 증가
    advanceWeek() {
      update((s) => ({ ...s, currentWeek: s.currentWeek + 1 }));
    },

    // 경기 결과 반영: 순위 업데이트 + 스탯 누적
    applyMatchResult(scheduleId: string, result: MatchResult) {
      update((s) => {
        const schedule = s.schedule.map((entry) =>
          entry.id === scheduleId ? { ...entry, result } : entry
        );
        const standings = updateStandings(s.standings, result);
        const stats     = accumulateStats(s.stats, result.playerLines);
        return { ...s, schedule, standings, stats };
      });
    },

    // 정지 조건 추가
    pushPendingAction(action: PendingAction) {
      update((s) => ({ ...s, pendingActions: [...s.pendingActions, action] }));
    },

    // 정지 조건 제거 (처리 완료)
    resolvePendingAction(type: PendingAction["type"], id: string) {
      update((s) => ({
        ...s,
        pendingActions: s.pendingActions.filter((a) => {
          if (a.type !== type) return true;
          if (a.type === "game"    && type === "game")    return a.scheduleId !== id;
          if (a.type === "message" && type === "message") return a.messageId  !== id;
          if (a.type === "event"   && type === "event")   return a.eventId    !== id;
          return true;
        }),
      }));
    },
  };
}

// ── 순위표 업데이트 ────────────────────────────────────────────
function updateStandings(standings: Standing[], result: MatchResult): Standing[] {
  return standings.map((s) => {
    if (s.teamId !== result.winnerId && s.teamId !== result.loserId) return s;

    const isWinner = s.teamId === result.winnerId;
    const isDraw   = result.loserId === null;

    const wins   = s.wins   + (isWinner && !isDraw ? 1 : 0);
    const losses = s.losses + (!isWinner && !isDraw ? 1 : 0);
    const draws  = s.draws  + (isDraw ? 1 : 0);
    const total  = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;

    const isHome = s.teamId === result.winnerId;
    const runsFor     = s.runsFor     + (isHome ? result.homeScore : result.awayScore);
    const runsAgainst = s.runsAgainst + (isHome ? result.awayScore : result.homeScore);

    const streakChar = isDraw ? "D" : isWinner ? "W" : "L";
    const streak     = updateStreak(s.streak, streakChar);
    const last10     = updateLast10(s.last10, streakChar);

    return { ...s, wins, losses, draws, winPct, runsFor, runsAgainst, streak, last10 };
  });
}

function updateStreak(current: string, result: "W" | "L" | "D"): string {
  if (!current) return `${result}1`;
  const char = current[0];
  const n    = parseInt(current.slice(1), 10);
  return char === result ? `${result}${n + 1}` : `${result}1`;
}

function updateLast10(current: string, result: "W" | "L" | "D"): string {
  const entries: Array<{ char: string; n: number }> = [];
  const re = /([WLD])(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(current)) !== null) entries.push({ char: m[1], n: parseInt(m[2]) });
  const last = entries[entries.length - 1];
  if (last && last.char === result) { last.n++; } else { entries.push({ char: result, n: 1 }); }
  const total = entries.reduce((a, e) => a + e.n, 0);
  if (total > 10) {
    let excess = total - 10;
    while (excess > 0 && entries.length > 0) {
      const first = entries[0];
      if (first.n <= excess) { excess -= first.n; entries.shift(); }
      else { first.n -= excess; excess = 0; }
    }
  }
  return entries.map((e) => `${e.char}${e.n}`).join("");
}

// ── 스탯 누적 ─────────────────────────────────────────────────
function accumulateStats(
  stats: Record<string, PlayerSeasonStats>,
  lines: PlayerGameLine[],
): Record<string, PlayerSeasonStats> {
  const next = { ...stats };
  for (const line of lines) {
    if (line.role === "pitcher") {
      const prev = (next[line.playerId] as PitcherSeasonStats | undefined) ?? {
        type: "pitcher", g:0, gs:0, w:0, l:0, sv:0, hd:0, ip:0, er:0, h:0, k:0, bb:0, era:0, whip:0,
      };
      const ip  = prev.ip  + (line.ip  ?? 0);
      const er  = prev.er  + (line.er  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
      const w   = prev.w   + (line.decision === "W"  ? 1 : 0);
      const l   = prev.l   + (line.decision === "L"  ? 1 : 0);
      const sv  = prev.sv  + (line.decision === "SV" ? 1 : 0);
      const hd  = prev.hd  + (line.decision === "HD" ? 1 : 0);
      next[line.playerId] = {
        type:"pitcher", g: prev.g+1, gs: prev.gs, w, l, sv, hd, ip, er, h, k, bb,
        era: calcEra(er, ip), whip: calcWhip(bb, h, ip),
      };
    } else {
      const prev = (next[line.playerId] as BatterSeasonStats | undefined) ?? {
        type:"batter", g:0, pa:0, ab:0, h:0, hr:0, rbi:0, sb:0, bb:0, k:0, avg:0, obp:0, slg:0, ops:0,
      };
      const ab  = prev.ab  + (line.ab  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const hr  = prev.hr  + (line.hr  ?? 0);
      const rbi = prev.rbi + (line.rbi ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const sb  = prev.sb  + (line.sb  ?? 0);
      const pa  = prev.pa  + ab + bb;
      const avg = calcAvg(h, ab);
      const obp = pa > 0 ? Math.round(((h + bb) / pa) * 1000) / 1000 : 0;
      const slg = ab > 0 ? Math.round(((h + hr * 3) / ab) * 1000) / 1000 : 0;
      next[line.playerId] = {
        type:"batter", g: prev.g+1, pa, ab, h, hr, rbi, sb, bb, k,
        avg, obp, slg, ops: calcOps(obp, slg),
      };
    }
  }
  return next;
}

export const seasonStore = createSeasonStore();

// ── 파생 스토어 ───────────────────────────────────────────────
export const currentStandings = derived(
  seasonStore,
  ($s) => [...$s.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins),
);

export const hasPendingAction = derived(
  seasonStore,
  ($s) => $s.pendingActions.length > 0,
);

export const nextPendingAction = derived(
  seasonStore,
  ($s) => $s.pendingActions[0] ?? null,
);

export const currentWeekSchedule = derived(seasonStore, ($s) =>
  $s.schedule.filter((e) => e.week === $s.currentWeek),
);
