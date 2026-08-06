import type { CareerSeasonRecord, UniversityTier } from "../types/save";

// ── 대학 요건 — **팀 데이터에서 파생한다** ────────────────────────
//
// ⚠ 여기 `UNIVERSITY_REQUIREMENTS` 하드코딩 표가 있었다. 대학 7개가 적혀
// 있었는데 **그중 실재하는 팀은 하나뿐**이었다 — Phase 5에서 팀이 50개로
// 늘고 ID 체계가 바뀌었는데 표가 따라가지 않았다.
//
// 표에 없으면 `minAcademicGrade ?? 9` · `minBaseballScore ?? 0`으로 떨어져
// **49개 대학이 전부 무조건 합격**이었고, 등급이 없으니 스카우트 보너스도
// 전부 최하(D, -3)였다. 어디를 쓰든 붙고 어디를 가든 손해가 같았다.
//
// 이제 `refs.json`의 `power`(전력★ 1~5)에서 등급을 낸다. 대학 50팀 전부
// `power`를 갖고 있어 빠지는 팀이 없고, 팀이 늘어도 따라온다.
//
//   power 5 → S ( 1팀)   power 4 → A ( 7팀)   power 3 → B (15팀)
//   power 2 → C (23팀)   power 1 → D ( 4팀)          (2026-08-06 실측)

/** 전력★ → 등급. 범위를 벗어난 값은 가운데로 — 등급 없는 대학을 만들지 않는다 */
export function tierOfPower(power: number | null | undefined): UniversityTier {
  switch (Math.round(power ?? 3)) {
    case 5:  return "S";
    case 4:  return "A";
    case 3:  return "B";
    case 2:  return "C";
    case 1:  return "D";
    default: return power != null && power > 5 ? "S" : "D";
  }
}

/** 등급별 입학 기준. 옛 표(S 4/40 · A 5/20 · C 7/0)를 다섯 단계로 폈다 */
export const TIER_REQUIREMENTS: Record<UniversityTier, {
  minAcademicGrade: number;
  minBaseballScore: number;
}> = {
  S: { minAcademicGrade: 4, minBaseballScore: 40 },
  A: { minAcademicGrade: 5, minBaseballScore: 25 },
  B: { minAcademicGrade: 6, minBaseballScore: 12 },
  // ⚠ C를 0이 아니라 4로 뒀다. 50팀 중 23팀이 C라 0이면 **절반이 무조건 합격**이다
  C: { minAcademicGrade: 7, minBaseballScore: 4 },
  D: { minAcademicGrade: 9, minBaseballScore: 0 },
};

export interface UniversityRequirement {
  tier: UniversityTier;
  minAcademicGrade: number;
  minBaseballScore: number;
}

/** 팀의 전력★으로 요건을 만든다 */
export function requirementOfPower(power: number | null | undefined): UniversityRequirement {
  const tier = tierOfPower(power);
  return { tier, ...TIER_REQUIREMENTS[tier] };
}

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
  power: number | null | undefined,
  avgPct: number,        // 석차백분율 평균 (낮을수록 좋음)
  baseballScore: number,
): { eligible: boolean; meetsAcademic: boolean; meetsBaseball: boolean } {
  const req = requirementOfPower(power);
  const grade = pctToGrade(avgPct);
  const meetsAcademic = grade <= req.minAcademicGrade;
  const meetsBaseball = baseballScore >= req.minBaseballScore;
  return { eligible: meetsAcademic && meetsBaseball, meetsAcademic, meetsBaseball };
}

// ── 대학 재학 중 스카우트 보너스 (대학 teamId 기준) ──────────────
export function getUniversityScoutBonus(power: number | null | undefined): number {
  return UNIVERSITY_SCOUT_BONUS[tierOfPower(power)] ?? 0;
}

// ── 드래프트 라운드 → 1군/2군 연봉 계산 ─────────────────────────
export function calcDraftSalary(round: number, ovr: number): number {
  if (round <= 6) {
    return Math.max(3000, Math.round((ovr - 45) * 220));
  }
  return Math.max(1500, Math.round((ovr - 45) * 120));
}

// ── 독립 리그 ─────────────────────────────────────────────────────
//
// ⚠ **상무는 지원 대상이 아니다.** `TEAM_IND_SANGMU_PHOENIX`가 독립 리그에
// 들어 있지만 병역 경로(`SportsUnitApplicationModal`)가 정본이라 여기서 뺀다.
// 안 빼면 고교생이 상무에 원서를 넣을 수 있다.
export const SANGMU_TEAM_ID = "TEAM_IND_SANGMU_PHOENIX";

export const isApplicableIndependent = (teamId: string): boolean => teamId !== SANGMU_TEAM_ID;

/**
 * 독립 리그 입단 컷(OVR). **팀의 전력★에서 낸다.**
 *
 * ⚠ 예전엔 엔진이 지망 순서로만 컷을 정했다(1지망 52 · 2지망 48 · 3지망 44).
 * 어느 팀을 쓰든 같았고 **1지망에 약팀을 써도 컷이 52**였다.
 *
 *   power 4 → 54   power 3 → 49   power 2 → 44   power 1 → 39   (2026-08-06 실측 분포)
 */
export function indieCutOfPower(power: number | null | undefined): number {
  const p = Math.round(power ?? 2);
  if (p >= 4) return 54;
  if (p === 3) return 49;
  if (p === 2) return 44;
  return 39;
}
