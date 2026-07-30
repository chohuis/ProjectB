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
// 1 = 풀 시뮬(경기 단위) / 2 = 순위표 드리프트만 / 3 = 비활성(데이터 미생성)
export type LeagueRadius = 1 | 2 | 3;

/** 국내 리그 — 주인공 소속과 무관하게 항상 풀 시뮬 (DESIGN §2 "국내 전 리그 상시") */
const DOMESTIC_LEAGUES = new Set([
  "LEAGUE_HIGHSCHOOL",
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
  "LEAGUE_KBL_FARM",
]);

/** 해외 리그 — 진출 전까지 드리프트만 (DESIGN §2.2 Lazy 활성화) */
const FOREIGN_LEAGUES = new Set([
  "LEAGUE_ABL",
  "LEAGUE_JBL",
  "LEAGUE_ABL_FARM",
  "LEAGUE_JBL_FARM",
]);

/** 커리어 단계 → 그 단계에서 주인공이 뛰는 해외 리그 (있으면 그것도 풀 시뮬) */
const FOREIGN_HOME: Partial<Record<CareerStage, string[]>> = {
  pro_abl: ["LEAGUE_ABL", "LEAGUE_ABL_FARM"],
  pro_jbl: ["LEAGUE_JBL", "LEAGUE_JBL_FARM"],
};

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
  if (FOREIGN_LEAGUES.has(leagueId)) {
    return FOREIGN_HOME[careerStage]?.includes(leagueId) ? 1 : 2;
  }
  return 1; // 게이트 대상 아닌 리그는 기존대로 풀 처리
}

export function isLeagueDriftOnly(careerStage: CareerStage, leagueId: string): boolean {
  return getLeagueRadius(careerStage, leagueId) === 2;
}

export function isLeagueInactive(careerStage: CareerStage, leagueId: string): boolean {
  return getLeagueRadius(careerStage, leagueId) === 3;
}
