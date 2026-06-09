import type { CareerSeasonRecord, UniversityTier } from "../types/save";

// ── 대학 요건 상수 ────────────────────────────────────────────────
export const UNIVERSITY_REQUIREMENTS: Record<string, {
  tier: UniversityTier;
  minAcademicGrade: number;
  minBaseballScore: number;
}> = {
  TEAM_UNIV_KOREA:    { tier: "S", minAcademicGrade: 4, minBaseballScore: 40 },
  TEAM_UNIV_YONSEI:   { tier: "S", minAcademicGrade: 4, minBaseballScore: 40 },
  TEAM_UNIV_KNSU:     { tier: "A", minAcademicGrade: 5, minBaseballScore: 20 },
  TEAM_UNIV_HANYANG:  { tier: "A", minAcademicGrade: 5, minBaseballScore: 20 },
  TEAM_UNIV_DONGGUK:  { tier: "B", minAcademicGrade: 6, minBaseballScore: 10 },
  TEAM_UNIV_KNU:      { tier: "C", minAcademicGrade: 7, minBaseballScore: 0  },
  TEAM_UNIV_CHUNGBUK: { tier: "D", minAcademicGrade: 9, minBaseballScore: 0  },
};

// ── 등급별 드래프트 스카우트 보너스 ─────────────────────────────────
export const UNIVERSITY_SCOUT_BONUS: Record<UniversityTier, number> = {
  S: 15, A: 8, B: 3, C: 0, D: -3,
};

// ── 석차백분율 → 9등급 환산 ──────────────────────────────────────
export function pctToGrade(pct: number): number {
  if (pct <= 4)  return 1;
  if (pct <= 11) return 2;
  if (pct <= 23) return 3;
  if (pct <= 40) return 4;
  if (pct <= 60) return 5;
  if (pct <= 77) return 6;
  if (pct <= 89) return 7;
  if (pct <= 96) return 8;
  return 9;
}

// ── 석차백분율 → GPA 4.5 환산 ────────────────────────────────────
export function toGpa45(pct: number): number {
  if (pct <= 4)  return 4.5;
  if (pct <= 11) return 4.2;
  if (pct <= 23) return 3.8;
  if (pct <= 40) return 3.5;
  if (pct <= 60) return 3.0;
  if (pct <= 77) return 2.5;
  if (pct <= 89) return 2.0;
  if (pct <= 96) return 1.5;
  return 1.0;
}

// ── 고교 야구 점수 계산 (careerRecords 기반) ─────────────────────
export function calcHsBaseballScore(records: CareerSeasonRecord[]): number {
  return records
    .filter((r) => r.leagueId === "LEAGUE_HIGHSCHOOL")
    .reduce((total, r) => {
      let score = 0;
      if (r.psResult === "champion")     score += 100;
      else if (r.psResult === "runnerUp") score += 60;
      else if (r.psResult === "semiFinal") score += 30;
      else if (r.psResult === "notQualified") score += 10;
      score += (r.awards?.length ?? 0) * 15;
      return total + score;
    }, 0);
}

// ── 지원 자격 확인 ────────────────────────────────────────────────
export function checkUniversityEligibility(
  teamId: string,
  avgPct: number,        // 석차백분율 평균 (낮을수록 좋음)
  baseballScore: number,
): { eligible: boolean; meetsAcademic: boolean; meetsBaseball: boolean } {
  const req = UNIVERSITY_REQUIREMENTS[teamId];
  if (!req) return { eligible: false, meetsAcademic: false, meetsBaseball: false };
  const grade = pctToGrade(avgPct);
  const meetsAcademic = grade <= req.minAcademicGrade;
  const meetsBaseball = baseballScore >= req.minBaseballScore;
  return { eligible: meetsAcademic && meetsBaseball, meetsAcademic, meetsBaseball };
}

// ── 대학 재학 중 스카우트 보너스 (대학 teamId 기준) ──────────────
export function getUniversityScoutBonus(teamId: string): number {
  const req = UNIVERSITY_REQUIREMENTS[teamId];
  if (!req) return 0;
  return UNIVERSITY_SCOUT_BONUS[req.tier] ?? 0;
}

// ── 드래프트 라운드 → 1군/2군 연봉 계산 ─────────────────────────
export function calcDraftSalary(round: number, ovr: number): number {
  if (round <= 6) {
    return Math.max(3000, Math.round((ovr - 45) * 220));
  }
  return Math.max(1500, Math.round((ovr - 45) * 120));
}
