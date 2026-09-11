// 전국대회 진행 (Phase 5-4)
//
// store에 두지 않는 이유: 대회 개설·라운드 진행은 순위표를 읽고 Rust를 여러 번
// 호출하고 일정에 경기를 얹는 오케스트레이션이다. CLAUDE.md "절대 금지" 1항.

import type { SaveSeason, ScheduleEntry, Standing } from "../types/season";
import {
  GROUPS_BY_LEAGUE,
  TOURNAMENTS,
  advanceRound,
  buildFinalBracket,
  buildGroupStage,
  groupQualifiers,
  hasGroupStage,
  openTournament,
  regionRankings,
  roundSchedule,
  selectEntrants,
  winPctMap,
  type GroupStage,
  type TournamentBracket,
  type TournamentDef,
} from "../utils/tournament";
import { standingsForSeed, syntheticStandings } from "../utils/standingsSnapshot";
import { allScheduleEntries } from "../utils/scheduleView";

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
    def.seedSource,
    def.leagueId,
    current,
    season.standingsSnapshots ?? {},
    firstSeasonFallback,
  );
}

export interface TournamentOpenResult {
  /** 넉아웃 대회면 본선 브래킷. 조별예선 대회는 예선이 끝나야 생긴다 */
  bracket: TournamentBracket | null;
  /** 조별예선 대회일 때만 */
  stage: GroupStage | null;
  /** 이번에 일정에 넣을 경기 (넉아웃 1라운드 · 또는 예선 전 경기) */
  entries: ScheduleEntry[];
  regionQuota: Record<string, number>;
  wildcards: string[];
}

/** 해당 주차에 시작하는 대회를 연다. 없으면 빈 배열. */
export async function openTournamentsForWeek(
  week: number,
  season: SaveSeason,
  protagonistTeamId: string,
  /** 첫 시즌에 전년 순위가 없을 때 쓸 합성 순위 (전력★+과거기록) — leagueId별 */
  worldTeams: {
    id: string;
    leagueId: string;
    power?: number;
    history?: { seasonRanks?: { rank: number }[] };
  }[] = [],
  worldSeed = 0,
): Promise<TournamentOpenResult[]> {
  const due = TOURNAMENTS.filter(
    (t) => t.startWeek === week && !season.tournaments?.[t.id] && !season.groupStages?.[t.id],
  );
  const out: TournamentOpenResult[] = [];

  for (const def of due) {
    const fallback =
      def.seedSource === "prev_season"
        ? syntheticStandings(worldTeams.filter((t) => t.leagueId === def.leagueId))
        : null;
    const standings = seedStandings(def, season, fallback);

    if (hasGroupStage(def)) {
      // 은하기·여명기 — 참가팀만 뽑고 조 추첨. 본선 브래킷은 예선이 끝나야 만든다.
      const groups = GROUPS_BY_LEAGUE[def.leagueId] ?? {};
      const entrants = await selectEntrants(
        regionRankings(standings, groups),
        def,
        winPctMap(standings),
      );
      if (entrants.seededTeams.length === 0) {
        console.warn(`[tournaments] ${def.name} 개설 실패 — 참가팀 0`);
        continue;
      }
      const stage = await buildGroupStage(
        def,
        entrants.seededTeams,
        protagonistTeamId,
        season.seasonYear,
        worldSeed,
      );
      if (!stage) {
        console.warn(`[tournaments] ${def.name} 조 추첨 실패`);
        continue;
      }
      out.push({
        bracket: null,
        stage,
        entries: stage.matches,
        regionQuota: entrants.regionQuota,
        wildcards: entrants.wildcards,
      });
      continue;
    }

    const { bracket, entrants } = await openTournament(
      def,
      standings,
      protagonistTeamId,
      season.seasonYear,
    );
    if (!bracket) {
      console.warn(`[tournaments] ${def.name} 개설 실패 — 참가팀 0`);
      continue;
    }
    out.push({
      bracket,
      stage: null,
      entries: await roundSchedule(bracket, 1),
      regionQuota: entrants.regionQuota,
      wildcards: entrants.wildcards,
    });
  }
  return out;
}

/**
 * 예선이 끝난 대회를 본선으로 넘긴다.
 *
 * @returns 본선 브래킷과 1라운드 일정. 아직 예선이 안 끝났으면 null.
 */
export async function promoteFinishedGroupStages(
  season: SaveSeason,
  protagonistTeamId: string,
): Promise<{ def: TournamentDef; bracket: TournamentBracket; entries: ScheduleEntry[] }[]> {
  const out: { def: TournamentDef; bracket: TournamentBracket; entries: ScheduleEntry[] }[] = [];
  // 규칙은 `scheduleView` 하나다 — 여기서 다시 합치면 한 곳만 고쳐진다
  const resultOf = new Map(
    allScheduleEntries(season)
      .filter((e) => e.result)
      .map((e) => [e.id, e]),
  );

  for (const stage of Object.values(season.groupStages ?? {})) {
    if (season.tournaments?.[stage.tournamentId]) continue; // 이미 본선 진행 중
    const def = TOURNAMENTS.find((t) => t.id === stage.tournamentId);
    if (!def) continue;
    if (!stage.matches.every((m) => resultOf.has(m.id))) continue; // 예선 미완

    const { qualified } = await groupQualifiers(stage);
    if (qualified.length === 0) continue;
    const bracket = await buildFinalBracket(def, qualified, protagonistTeamId, season.seasonYear);
    if (!bracket) continue;
    out.push({ def, bracket, entries: await roundSchedule(bracket, 1) });
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
 * 대진이 확정됐는데 **일정에 아직 안 들어간** 라운드 경기를 돌려준다.
 *
 * ⚠ 이게 없으면 **모든 대회가 1라운드에서 멈춘다.** `applyRoundResults`가
 * 만든 다음 라운드 일정을 호출부가 `week <= 현재주`로 거르는데, 뒤 주차
 * 경기는 그 자리에서 **버려지고 다시 넣는 경로가 없었다.** 다음 주가 되면
 * 그 라운드는 "대진은 있는데 일정에 없는" 상태라 결과가 영영 안 나온다.
 * (실측: 8개 대회 전부 1라운드만 치르고 우승팀 0)
 */
export async function missingRoundEntries(
  bracket: TournamentBracket,
  round: number,
  scheduledIds: ReadonlySet<string>,
): Promise<ScheduleEntry[]> {
  const live = bracket.matches.filter(
    (m) => m.round === round && !m.isBye && m.homeTeamId && m.awayTeamId,
  );
  if (live.length === 0 || live.every((m) => scheduledIds.has(m.id))) return [];
  const all = await roundSchedule(bracket, round);
  return all.filter((e) => !scheduledIds.has(e.id));
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
  const nextEntries = round < next.totalRounds ? await roundSchedule(next, round + 1) : [];
  return { bracket: next, nextEntries };
}

/** 이미 결과가 확정된 대회 (결승 승자 존재) */
export function finishedTournaments(season: SaveSeason): { id: string; champion: string }[] {
  return Object.values(season.tournaments ?? {})
    .map((b) => {
      const final = b.matches.find((m) => m.round === b.totalRounds);
      return final?.winnerTeamId ? { id: b.tournamentId, champion: final.winnerTeamId } : null;
    })
    .filter((x): x is { id: string; champion: string } => x !== null);
}
