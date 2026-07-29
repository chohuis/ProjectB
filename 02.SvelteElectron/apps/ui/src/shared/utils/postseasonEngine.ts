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

// 고교 buildHsBracket · 대학 buildUnivBracket은 Phase 5-5a에서 폐기했다.
// 시즌 결산이 패왕기(고교 11월)·왕중왕전(대학 5월)로 옮겨갔다 — top4 준결승/결승을
// 남겨두면 결승이 두 번 열린다. Rust build_hs_bracket / build_univ_bracket도 제거됨.

/**
 * 프로 2군 축약 포스트시즌 (Phase 5-7).
 *
 * 상위 4팀 단판 사다리(3위vs4위 → 승자vs2위 → 승자vs1위).
 * 독립 사다리와 모양은 같지만 **결승도 단판**이다(독립 챔결은 3전2승).
 */
export async function buildFarmBracket(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.engine(
    "buildFarmBracketNative", JSON.stringify({ standings }),
  );
  return JSON.parse(raw);
}

/**
 * 독립 4차 Stage 사다리 (Phase 5-6).
 *
 * 준PO(3위 vs 4위, 단판) → PO(2위 vs 준PO승자, 단판) → 챔피언결정전(1위 vs PO승자, 3전2승).
 * 구 buildIndBracket은 "1위 vs 2위 단판" 하나뿐이라 4팀 사다리를 표현하지 못했다.
 */
export async function buildIndLadder(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.engine(
    "buildIndLadderNative", JSON.stringify({ standings }),
  );
  return JSON.parse(raw);
}

export async function buildJblBracket(standings: Standing[]): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonBuildJbl(
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
