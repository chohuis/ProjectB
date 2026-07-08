import type { CareerStage } from "../types/save";

// DESIGN.md §2.1 — 주인공 반경 시뮬 (Radius Simulation) 표를 코드화한 단일 진실.
// 1 = 풀 시뮬(주인공 소속 리그) / 2 = 순위표 드리프트만 / 3 = 비활성(데이터 미생성)
export type LeagueRadius = 1 | 2 | 3;

const RADIUS_TABLE: Partial<Record<CareerStage, { radius1: string[]; radius2: string[] }>> = {
  highschool: {
    radius1: ["LEAGUE_HIGHSCHOOL"],
    radius2: ["LEAGUE_KBL"],
  },
  university: {
    radius1: ["LEAGUE_UNIVERSITY"],
    radius2: ["LEAGUE_KBL"],
  },
  independent: {
    radius1: ["LEAGUE_INDEPENDENT"],
    radius2: ["LEAGUE_KBL"],
  },
  pro_kbl: {
    radius1: ["LEAGUE_KBL"],
    radius2: ["LEAGUE_ABL", "LEAGUE_JBL"],
  },
  pro_abl: {
    radius1: ["LEAGUE_ABL"],
    radius2: ["LEAGUE_KBL", "LEAGUE_JBL"],
  },
  pro_jbl: {
    radius1: ["LEAGUE_JBL"],
    radius2: ["LEAGUE_KBL", "LEAGUE_ABL"],
  },
  // 군복무 중: 주인공은 어느 리그에도 뛰지 않으므로 프로 3리그 모두 드리프트로 유지.
  // DESIGN.md에 군복무 반경이 명시돼 있지 않아 임시 확정 — 필요 시 §2.1에 반영할 것.
  military: {
    radius1: [],
    radius2: ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"],
  },
  // 레거시 "pro" 스테이지 (R3a 잔여 항목, 아직 미제거) — pro_kbl과 동일 취급
  pro: {
    radius1: ["LEAGUE_KBL"],
    radius2: ["LEAGUE_ABL", "LEAGUE_JBL"],
  },
};

// 반경 게이트가 적용되는 리그만 — 팜리그 등 그 외 리그는 항상 기존(반경 미적용) 동작 유지 (R5 대상)
export const RADIUS_GATED_LEAGUES = new Set([
  "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL",
]);

export function getLeagueRadius(careerStage: CareerStage, leagueId: string): LeagueRadius {
  if (!RADIUS_GATED_LEAGUES.has(leagueId)) return 1; // 게이트 대상 아님 — 항상 풀 처리
  const rules = RADIUS_TABLE[careerStage];
  if (!rules) return 3;
  if (rules.radius1.includes(leagueId)) return 1;
  if (rules.radius2.includes(leagueId)) return 2;
  return 3;
}

export function isLeagueDriftOnly(careerStage: CareerStage, leagueId: string): boolean {
  return getLeagueRadius(careerStage, leagueId) === 2;
}

export function isLeagueInactive(careerStage: CareerStage, leagueId: string): boolean {
  return getLeagueRadius(careerStage, leagueId) === 3;
}
