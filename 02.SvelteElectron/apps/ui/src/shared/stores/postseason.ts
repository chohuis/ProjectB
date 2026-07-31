import type { PostseasonSeries, ScheduleEntry } from "../types/season";
import type { SeasonStoreState } from "./season";
import { gameStore } from "./game";
import { get } from "svelte/store";

export function injectPostseasonEntries(s: SeasonStoreState, entries: ScheduleEntry[]): SeasonStoreState {
  if (entries.length === 0) return s;
  return { ...s, schedule: [...s.schedule, ...entries] };
}

export function initPostseasonBracket(s: SeasonStoreState, leagueId: string, series: PostseasonSeries[]): SeasonStoreState {
  return { ...s, postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: series } };
}

export function updatePostseasonBracket(s: SeasonStoreState, leagueId: string, updatedSeries: PostseasonSeries[]): SeasonStoreState {
  return { ...s, postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: updatedSeries } };
}

// ── 전국대회 (Phase 5-4) ──────────────────────────────────────

export function setTournamentBracket(
  s: SeasonStoreState,
  bracket: import("../utils/tournament").TournamentBracket,
): SeasonStoreState {
  return { ...s, tournaments: { ...(s.tournaments ?? {}), [bracket.tournamentId]: bracket } };
}

export function captureStandingsSnapshot(
  s: SeasonStoreState,
  key: import("../utils/standingsSnapshot").SnapshotKey,
): SeasonStoreState {
  const snapshots = { ...(s.standingsSnapshots ?? {}) };
  for (const [leagueId, st] of Object.entries(s.leagueState)) {
    if (!st?.standings || st.standings.length === 0) continue;
    snapshots[leagueId] = { ...(snapshots[leagueId] ?? {}), [key]: st.standings.map((x) => ({ ...x })) };
  }
  return { ...s, standingsSnapshots: snapshots };
}

export function setSurvivalState(
  s: SeasonStoreState,
  survival: import("../utils/survivalLeague").SurvivalState,
): SeasonStoreState {
  return { ...s, survival };
}

/** 독립 단계 일정은 leagueSchedules에 쌓인다 — 단계마다 새 경기가 붙는다 */
export function injectLeagueEntries(
  s: SeasonStoreState,
  leagueId: string,
  entries: ScheduleEntry[],
): SeasonStoreState {
  if (entries.length === 0) return s;
  const cur = s.leagueSchedules[leagueId] ?? [];
  const have = new Set(cur.map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (fresh.length === 0) return s;
  return { ...s, leagueSchedules: { ...s.leagueSchedules, [leagueId]: [...cur, ...fresh] } };
}

export function setGroupStage(
  s: SeasonStoreState,
  stage: import("../utils/tournament").GroupStage,
): SeasonStoreState {
  return { ...s, groupStages: { ...(s.groupStages ?? {}), [stage.tournamentId]: stage } };
}

/** 이미 있는 id는 넣지 않는다 — 같은 주를 두 번 처리해도 경기가 중복되지 않게 */
export function injectTournamentEntries(s: SeasonStoreState, entries: ScheduleEntry[]): SeasonStoreState {
  const have = new Set(s.schedule.map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (fresh.length === 0) return s;
  return { ...s, schedule: [...s.schedule, ...fresh] };
}

/**
 * 주차가 지났는데 아직 안 치러진 **대회 경기를 이번 주로 당긴다.**
 *
 * ⚠ 이게 없으면 대회가 1라운드에서 영영 멈춘다. 경기 처리 루프는
 * `e.week === 이번주`만 보는데(배경 리그는 `<= 이번주`라 다르다), 대회 다음
 * 라운드는 앞 라운드 결과가 나온 **뒤에** 일정에 들어간다. 그 사이 주차가
 * 넘어가면 그 경기는 아무도 안 보는 상태로 남는다.
 * 실측: 개나리기 R2 8경기가 `week 2`인 채 W40까지 미처리로 남았다.
 *
 * 실제 대회도 앞 라운드가 밀리면 다음 라운드가 곧바로 붙는다 — 날짜를
 * 당기는 게 규칙에 어긋나지 않는다.
 */
export function pullOverdueTournamentGames(
  s: SeasonStoreState, week: number, gameDate: string,
): SeasonStoreState {
  let changed = false;
  const schedule = s.schedule.map((e) => {
    if (!e.isTournament || e.result || e.week >= week) return e;
    changed = true;
    return { ...e, week, gameDate };
  });
  return changed ? { ...s, schedule } : s;
}

export function setAblConferences(s: SeasonStoreState, east: string[], west: string[]): SeasonStoreState {
  return { ...s, ablEastTeams: east, ablWestTeams: west };
}

export async function flushAllLeagueStatsToDb(s: SeasonStoreState, seasonYear: number): Promise<void> {
  if (!window.projectB?.npcFlushSeasonStats) return;
  const slotId = get(gameStore).currentSlotId ?? "default";
  for (const [leagueId, ls] of Object.entries(s.leagueState)) {
    if (!ls.stats || Object.keys(ls.stats).length === 0) continue;
    const statsByPlayer: Record<string, object> = {};
    for (const [npcId, stat] of Object.entries(ls.stats)) {
      if (stat.type === "pitcher") {
        statsByPlayer[npcId] = {
          role: "pitcher", games: stat.g, wins: stat.w, losses: stat.l,
          saves: stat.sv, holds: stat.hd, ip: stat.ip, er: stat.er,
          hitsAllowed: stat.h, strikeouts: stat.k, walks: stat.bb, pitchCount: 0,
          atBats: 0, hits: 0, homeRuns: 0, rbi: 0, walksBat: 0, strikeoutsBat: 0, stolenBases: 0,
        };
      } else {
        statsByPlayer[npcId] = {
          role: "batter", games: stat.g, wins: 0, losses: 0, saves: 0, holds: 0,
          ip: 0, er: 0, hitsAllowed: 0, strikeouts: 0, walks: 0, pitchCount: 0,
          atBats: stat.ab, hits: stat.h, homeRuns: stat.hr, rbi: stat.rbi,
          walksBat: stat.bb, strikeoutsBat: stat.k, stolenBases: stat.sb,
        };
      }
    }
    await window.projectB.npcFlushSeasonStats(
      JSON.stringify({ slotId, season: seasonYear, leagueId, statsByPlayer })
    );
  }
}
