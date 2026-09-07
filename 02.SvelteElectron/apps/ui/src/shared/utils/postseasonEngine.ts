import type { PostseasonSeries, ScheduleEntry, Standing } from "../types/season";
import { seedOf } from "./seedOf";

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

/**
 * 비주인공 시리즈 씨앗.
 *
 * 🔴 **씨앗을 안 넘기면 Rust 가 `thread_rng` 로 떨어진다** — 같은 세이브를
 *   두 번 돌리면 **다른 팀이 우승한다**(2026-09-07 실측: 독립리그 준PO 승자가
 *   판마다 갈렸다). 엔진에는 `seed` 자리가 처음부터 있었는데 **부르는 쪽이
 *   안 채우고 있었다.**
 *
 * ⚠ **판마다 달라야 한다.** 한 포스트시즌에서 이 함수는 여러 번 불린다
 *   (브라켓 생성 직후 · 주인공 탈락 뒤 · 주인공 시리즈가 끝날 때마다).
 *   같은 씨앗을 그대로 재사용하면 LCG 가 매번 처음부터 같은 수열을 내서
 *   **매 라운드 홈이 이기는** 편향이 생긴다. 그래서 **이미 승자가 정해진
 *   시리즈 수**를 섞는다 — 브라켓이 나아갈 때마다 달라지는 값이다.
 */
export function postseasonSeed(
  worldSeed: number,
  seasonYear: number,
  leagueId: string,
  bracket: PostseasonSeries[],
): number {
  return seedOf(worldSeed, seasonYear, leagueId, "postseason",
    bracket.filter((s) => s.winner).length);
}

export async function resolveNonProtagonistSeries(
  bracket: PostseasonSeries[],
  protagonistTeamId: string,
  seed = 0,
): Promise<PostseasonSeries[]> {
  const raw = await window.projectB!.postseasonResolveNpc(
    JSON.stringify({ bracket, protagonistTeamId, seed })
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
