// ── 구단 성향이 만드는 효과 — **계산은 여기 한 곳** ────────────────────────
//
// 🔴 **화면이 값을 다시 계산하면 실제와 갈린다.** 의료 배수를 `injuries.ts`
//   가 쓰고 팀 상세가 또 적으면, 규칙 파일을 바꿨을 때 한쪽만 따라간다.
//   이 저장소에서 반복된 형태다(스태프 계수 15건 · 로스터 상한 · 투수 비율).
//
// ⚠ **순수 함수다** — 스토어를 안 읽는다. 검사가 직접 부른다.

/** 부상 회복 배수 — `medicalQuality` 50이 1.0. 좋을수록 짧아진다 */
export function medicalRecoveryMult(quality: number, span: number): number {
  return 1 - ((quality - 50) / 50) * span;
}

/**
 * 회복 주 수 — 배수를 적용하고 하한을 지킨다.
 *
 * ⚠ **0주가 되면 부상이 없는 것과 같다.** 하한이 그걸 막는다.
 */
export function medicalRecoveryWeeks(
  weeks: number,
  quality: number,
  span: number,
  minWeeks: number,
): number {
  return Math.max(minWeeks, Math.round(weeks * medicalRecoveryMult(quality, span)));
}

/**
 * 전지훈련 컨디션 가산 — `farmInvestment` 50이 기준이다.
 *
 * ⚠ **의료팀과 다른 축이다.** 둘 다 부상에 물리면 어느 쪽이 효과인지
 *   못 가린다 — 전훈은 컨디션, 의료는 회복 속도다.
 */
export function campConditionBonus(farmInvestment: number, bonus: number): number {
  return Math.round(bonus * (farmInvestment / 50));
}

/** 화면에 쓸 등급 — 성향 값 하나를 다섯 칸으로 */
export function qualityGrade(v: number): string {
  if (v >= 80) return "최상";
  if (v >= 65) return "상";
  if (v >= 45) return "보통";
  if (v >= 30) return "하";
  return "최하";
}
