import type { CareerStage } from "../types/save";
import { isLeagueInScope } from "../config/releaseScope";

// DESIGN.md §2 — 시뮬 반경. **v2에서 전면 개정됐다.**
//
// v1(Lite)은 "주인공 소속 리그만 풀 시뮬, 나머지는 드리프트/비활성"이었다.
// v2는 **국내 전 리그를 항상 풀 시뮬**하고 해외(ABL·JBL)만 드리프트로 둔다.
//
// 이 파일이 v1인 채로 남아 있어서 Phase 5-5·5-6에서 깐 대학 225경기·독립 152경기가
// **생성만 되고 시뮬되지 않았다** — `backgroundLeague.ts`가 반경 2·3을 건너뛴다.
//
// 1 = 풀 시뮬(경기 단위) / 3 = 비활성(데이터 미생성)
//
// ⚠ **2(순위표 드리프트만)는 2026-08-20에 없앴다.** 해외까지 풀 시뮬로
// 올리면서 2를 내는 곳이 사라졌고, 그러자 `driftBackgroundLeagues`가 매주
// 두 번 불리면서 늘 빈 목록을 받았다 — 죽은 갈래라 장치째 지웠다.
// `releaseScope`로 리그를 다시 닫아도 **3**(비활성)이지 2가 아니다
export type LeagueRadius = 1 | 3;

/** 국내 리그 — 주인공 소속과 무관하게 항상 풀 시뮬 (DESIGN §2 "국내 전 리그 상시") */
const DOMESTIC_LEAGUES = new Set([
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
  "LEAGUE_KBL_FARM",
]);

/**
 * 해외 리그 — **2026-08-20부터 국내와 같이 풀 시뮬한다** (사용자 확정).
 *
 * 예전엔 주인공이 진출하기 전까지 드리프트(반경 2)였다. 로스터가 없으니
 * 순위표 숫자만 굴렀고, 화면에서 팀을 열면 선수가 없었다.
 *
 * ⚠ **드리프트를 없앤 게 아니라 대상이 없어진 것이다.** 주인공이 국내에
 * 있어도 해외가 반경 1이므로 `driftBackgroundLeagues`는 이제 빈 목록을
 * 받는다 — 죽은 장치를 남기지 않으려면 따로 정리해야 한다.
 */
const FOREIGN_LEAGUES = new Set(["LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]);

/**
 * 반경 게이트가 적용되는 리그.
 *
 * v1은 여기서 팜리그를 빼서 "게이트 대상 아님 → 항상 풀"로 처리했다. v2는
 * 국내 팜도 명시적으로 국내에 넣었으므로 결과는 같지만 의도가 드러난다.
 */
export const RADIUS_GATED_LEAGUES = new Set([...DOMESTIC_LEAGUES, ...FOREIGN_LEAGUES]);

export function getLeagueRadius(careerStage: CareerStage, leagueId: string): LeagueRadius {
  // 1차 출시 범위 밖(해외)은 **비활성**이다 — 드리프트도 돌지 않는다.
  // 드리프트만 돌려두면 선수 없는 리그의 순위표가 화면에 뜬다 (releaseScope.ts).
  if (!isLeagueInScope(leagueId)) return 3;
  if (DOMESTIC_LEAGUES.has(leagueId)) return 1;
  // 해외도 풀 시뮬이다 (2026-08-20 사용자 확정).
  //
  // ⚠ 여기 있던 `FOREIGN_HOME`(커리어 단계 → 그 단계의 해외 리그)은 **같이
  // 지웠다.** 해외가 전부 반경 1이 되면서 그 표를 읽는 곳이 0이 됐다 —
  // 남기면 죽은 갈래다
  if (FOREIGN_LEAGUES.has(leagueId)) return 1;
  return 1; // 게이트 대상 아닌 리그는 기존대로 풀 처리
}

export function isLeagueInactive(careerStage: CareerStage, leagueId: string): boolean {
  return getLeagueRadius(careerStage, leagueId) === 3;
}
