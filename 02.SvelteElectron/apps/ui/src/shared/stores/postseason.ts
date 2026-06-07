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
