import type { PostseasonSeries, ScheduleEntry, Standing } from "../types/season";

// ── 순수 TS 헬퍼 (계산만, 상태 없음) ────────────────────────────
export function winsNeeded(bestOf: 1 | 3 | 5 | 7): number {
  return Math.ceil(bestOf / 2);
}

export function nextGameNum(series: PostseasonSeries): number {
  return series.homeWins + series.awayWins + 1;
}

export function getActiveSeries(bracket: PostseasonSeries[]): PostseasonSeries | null {
  return bracket.find((s) => !s.winner && s.homeTeamId !== "" && s.awayTeamId !== "") ?? null;
}

// ── Rust IPC 래퍼 ────────────────────────────────────────────────
export async function buildKblBracket(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonBuildKbl(
    JSON.stringify({ standings })
  );
  return JSON.parse(raw);
}

export async function buildAblBracket(
  eastStandings: Standing[],
  westStandings: Standing[],
): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonBuildAbl(
    JSON.stringify({ eastStandings, westStandings })
  );
  return JSON.parse(raw);
}

export async function buildUnivBracket(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonBuildUniv(
    JSON.stringify({ standings })
  );
  return JSON.parse(raw);
}

export async function buildIndBracket(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonBuildInd(
    JSON.stringify({ standings })
  );
  return JSON.parse(raw);
}

export async function applyGameToSeries(
  series: PostseasonSeries,
  winnerId: string,
): Promise<PostseasonSeries> {
  const raw = await window.projectB!.postseasonApplyGame(
    JSON.stringify({ series, winnerId })
  );
  return JSON.parse(raw);
}

export async function fillNextSeries(
  bracket: PostseasonSeries[],
  completed: PostseasonSeries,
): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonFillNext(
    JSON.stringify({ bracket, completed })
  );
  return JSON.parse(raw);
}

export async function resolveNonProtagonistSeries(
  bracket: PostseasonSeries[],
  protagonistTeamId: string,
): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonResolveNpc(
    JSON.stringify({ bracket, protagonistTeamId })
  );
  return JSON.parse(raw);
}

export async function makeSeriesGame(
  series: PostseasonSeries,
  gameNum: number,
  baseWeek: number,
  protagonistTeamId: string,
  seasonYear: number,
): Promise<ScheduleEntry> {
  const raw = await window.projectB!.postseasonMakeGame(
    JSON.stringify({ series, gameNum, baseWeek, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function shuffleAblConferences(
  allTeams: string[],
): Promise<{ east: string[]; west: string[] }> {
  const raw = await window.projectB!.postseasonShuffleAbl(
    JSON.stringify({ allTeams })
  );
  return JSON.parse(raw);
}
