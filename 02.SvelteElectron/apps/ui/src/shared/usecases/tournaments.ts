// 전국대회 진행 (Phase 5-4)
//
// store에 두지 않는 이유: 대회 개설·라운드 진행은 순위표를 읽고 Rust를 여러 번
// 호출하고 일정에 경기를 얹는 오케스트레이션이다. CLAUDE.md "절대 금지" 1항.

import type { SaveSeason, ScheduleEntry, Standing } from "../types/season";
import {
  TOURNAMENTS, advanceRound, openTournament, roundSchedule,
  type TournamentBracket, type TournamentDef,
} from "../utils/tournament";
import { standingsForSeed, syntheticStandings } from "../utils/standingsSnapshot";

/**
 * 시드 산출에 쓸 순위표를 고른다 (Phase 5-5a).
 *
 * 대회마다 보는 시점이 다르다 — 개나리기는 전년, 장미기·무궁화기는 전반기,
 * 패왕기는 후반기. 현재 누적 순위를 전부에 쓰면 패왕기가 "그해 최강전"이 아니라
 * "3월부터 잘한 팀 대회"가 된다.
 */
function seedStandings(
  def: TournamentDef,
  season: SaveSeason,
  firstSeasonFallback: Standing[] | null,
): Standing[] {
  const current = season.leagueState[def.leagueId]?.standings ?? season.standings ?? [];
  return standingsForSeed(
    def.seedSource, def.leagueId, current, season.standingsSnapshots ?? {}, firstSeasonFallback,
  );
}

export interface TournamentOpenResult {
  bracket: TournamentBracket;
  /** 1라운드에서 실제로 치를 경기 (부전승 제외) */
  entries: ScheduleEntry[];
  regionQuota: Record<string, number>;
  wildcards: string[];
}

/** 해당 주차에 시작하는 대회를 연다. 없으면 null. */
export async function openTournamentsForWeek(
  week: number,
  season: SaveSeason,
  protagonistTeamId: string,
  /** 첫 시즌에 전년 순위가 없을 때 쓸 합성 순위 (전력★+과거기록) — leagueId별 */
  worldTeams: { id: string; leagueId: string; power?: number; history?: { seasonRanks?: { rank: number }[] } }[] = [],
): Promise<TournamentOpenResult[]> {
  const due = TOURNAMENTS.filter(
    (t) => t.startWeek === week && !season.tournaments?.[t.id],
  );
  const out: TournamentOpenResult[] = [];

  for (const def of due) {
    const fallback = def.seedSource === "prev_season"
      ? syntheticStandings(worldTeams.filter((t) => t.leagueId === def.leagueId))
      : null;
    const { bracket, entrants } = await openTournament(
      def, seedStandings(def, season, fallback), protagonistTeamId, season.seasonYear,
    );
    if (!bracket) {
      console.warn(`[tournaments] ${def.name} 개설 실패 — 참가팀 0`);
      continue;
    }
    out.push({
      bracket,
      entries: await roundSchedule(bracket, 1),
      regionQuota: entrants.regionQuota,
      wildcards: entrants.wildcards,
    });
  }
  return out;
}

/** 진행 중인 대회에서 이번 주에 치를 라운드를 찾는다. */
export function pendingRounds(
  week: number,
  season: SaveSeason,
): { bracket: TournamentBracket; round: number }[] {
  const out: { bracket: TournamentBracket; round: number }[] = [];
  for (const bracket of Object.values(season.tournaments ?? {})) {
    for (let r = 1; r <= bracket.totalRounds; r++) {
      const live = bracket.matches.filter((m) => m.round === r && !m.isBye);
      if (live.length === 0) continue;
      if (live[0].week !== week) continue;
      // 아직 승자가 안 난 경기가 남아 있는 라운드만
      if (live.some((m) => !m.winnerTeamId)) out.push({ bracket, round: r });
    }
  }
  return out;
}

/**
 * 라운드 결과를 반영하고 **다음 라운드 일정까지** 돌려준다.
 * 승자 판정 자체는 매치 엔진(호출부) 몫이다 — 여기서 이기고 지는 것을 정하지 않는다.
 */
export async function applyRoundResults(
  bracket: TournamentBracket,
  round: number,
  results: { matchId: string; winnerTeamId: string }[],
  protagonistTeamId: string,
): Promise<{ bracket: TournamentBracket; nextEntries: ScheduleEntry[] }> {
  const next = await advanceRound(bracket, round, results, protagonistTeamId);
  const nextEntries =
    round < next.totalRounds ? await roundSchedule(next, round + 1) : [];
  return { bracket: next, nextEntries };
}

/** 이미 결과가 확정된 대회 (결승 승자 존재) */
export function finishedTournaments(season: SaveSeason): { id: string; champion: string }[] {
  return Object.values(season.tournaments ?? {})
    .map((b) => {
      const final = b.matches.find((m) => m.round === b.totalRounds);
      return final?.winnerTeamId
        ? { id: b.tournamentId, champion: final.winnerTeamId }
        : null;
    })
    .filter((x): x is { id: string; champion: string } => x !== null);
}
