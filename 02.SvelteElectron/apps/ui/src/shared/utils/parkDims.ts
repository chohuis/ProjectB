import type { StadiumRef, TeamRef } from "../stores/master";

/**
 * 구장 담장 — 엔진에 넘길 값.
 *
 * 🔴 **안 넘기면 엔진이 중립 기본값을 쓴다.** 27개 구장을 채워 놓고도
 *   같은 야구를 하게 된다 — 이 저장소의 반복 결함(값은 있는데 안 쓴다)이다.
 *
 * ⚠ 중앙 거리는 예전에도 있었지만 **성격별 한 값씩**이었고
 *   (타자친화 100 · 중립 110 · 투수친화 122) `.dist` 참조가 0건이었다.
 */
export interface ParkDims {
  lf: number;
  cf: number;
  rf: number;
  fence: number;
}

/**
 * 중립 구장 평균 — `stadiums.json` 중립 9개 실측(2026-08-30).
 *
 * ⚠ **엔진 기본값과 같아야 한다.** 갈리면 "안 넘겼을 때"와 "중립을
 *   넘겼을 때"가 다른 야구가 된다.
 */
export const NEUTRAL_DIMS: ParkDims = { lf: 98.4, cf: 122.1, rf: 98.6, fence: 3.1 };

/**
 * 홈팀의 구장 담장.
 *
 * ⚠ 구장을 못 찾으면 중립이다 — 지어내지 않는다.
 */
export function parkDimsForHomeTeam(
  homeTeamId: string | null | undefined,
  teams: readonly Pick<TeamRef, "id" | "stadium">[],
  stadiums: readonly StadiumRef[],
): ParkDims {
  if (!homeTeamId) return NEUTRAL_DIMS;
  const t = teams.find((x) => x.id === homeTeamId);
  if (!t?.stadium) return NEUTRAL_DIMS;
  const s = stadiums.find((x) => x.id === t.stadium);
  return s?.dist ?? NEUTRAL_DIMS;
}
