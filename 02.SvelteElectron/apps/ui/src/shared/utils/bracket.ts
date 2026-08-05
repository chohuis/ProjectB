import type { PostseasonSeries } from "../types/season";

/**
 * 포스트시즌 대진을 **라운드 열로 푼다**. (U6)
 *
 * `postseasonBrackets`에는 완전한 대진이 들어 있었다 — `nextSeriesId`로
 * 진출 경로가, `homeFrom`/`awayFrom`으로 어디서 올라오는지가, `bestOf`와
 * 승수로 시리즈 상태가. **그런데 그리는 화면이 한 곳도 없었다.**
 *
 * ⚠ 라운드 순서를 `round` 문자열로 정하면 안 된다. "와일드카드"·"준플레이오프"
 * 같은 이름은 리그마다 다르고 KBL/ABL/JBL이 서로 다른 말을 쓴다.
 * **결승에서 거꾸로 세는 깊이**가 유일하게 리그와 무관한 기준이다.
 */

export interface BracketRound {
  /** 표시 이름 — 그 라운드 시리즈들이 공유하는 `round` 값 */
  label: string;
  /** 결승이 0, 한 단계 앞이 1 … */
  depth: number;
  series: PostseasonSeries[];
}

export type SeriesState = "waiting" | "live" | "done";

/** 대진의 한 칸이 지금 어떤 상태인가 */
export function seriesState(s: PostseasonSeries): SeriesState {
  if (s.winner) return "done";
  // 양쪽이 다 정해져야 시작한다. 한쪽이라도 빈 문자열이면 앞 시리즈 대기다
  if (!s.homeTeamId || !s.awayTeamId) return "waiting";
  return "live";
}

/** 이기려면 몇 승이 필요한가 — 5전 3선승 */
export function winsNeeded(bestOf: PostseasonSeries["bestOf"]): number {
  return Math.floor(bestOf / 2) + 1;
}

/** "5전 3선승" · 단판은 "단판" */
export function bestOfLabel(bestOf: PostseasonSeries["bestOf"]): string {
  return bestOf === 1 ? "단판" : `${bestOf}전 ${winsNeeded(bestOf)}선승`;
}

/**
 * 결승에서 거꾸로 센 깊이. 순환 참조가 있어도 멈춘다 —
 * 데이터가 깨져도 화면이 무한 루프에 빠지면 안 된다.
 */
function depthOf(s: PostseasonSeries, byId: Map<string, PostseasonSeries>): number {
  let d = 0;
  let cur = s;
  const seen = new Set<string>([s.id]);
  while (cur.nextSeriesId) {
    const next = byId.get(cur.nextSeriesId);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    cur = next;
    d++;
  }
  return d;
}

/**
 * 라운드를 **첫 경기부터 결승 순으로** 돌려준다.
 *
 * 같은 라운드에 이름이 여러 개면(데이터 결함) 깊이가 같은 것끼리 묶고
 * 이름은 첫 시리즈 것을 쓴다 — 조용히 버리는 것보다 낫다.
 */
export function toRounds(series: readonly PostseasonSeries[]): BracketRound[] {
  if (series.length === 0) return [];
  const byId = new Map(series.map((s) => [s.id, s]));

  const groups = new Map<number, PostseasonSeries[]>();
  for (const s of series) {
    const d = depthOf(s, byId);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(s);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])          // 깊은 쪽(=먼저 하는 경기)이 왼쪽
    .map(([depth, list]) => ({
      depth,
      label: list[0].round,
      series: list,
    }));
}

/** 대진 전체가 끝났는가 — 결승(깊이 0)에 승자가 있으면 */
export function bracketChampion(series: readonly PostseasonSeries[]): string | null {
  const byId = new Map(series.map((s) => [s.id, s]));
  const final = series.find((s) => depthOf(s, byId) === 0);
  return final?.winner ?? null;
}
