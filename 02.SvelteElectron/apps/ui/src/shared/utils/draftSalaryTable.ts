/**
 * 신인 지명 계약 — 순번이 정하고 팀 예산이 민다.
 *
 * 예전엔 여기 팀 ID 8개짜리 배수 맵이 박혀 있었다. 그 8개가 refs.json에
 * 존재하지 않는 팀이라 **모든 팀이 배수 1.0으로 떨어지고 있었다** — 명문 구단과
 * 하위 구단의 신인 계약이 똑같았다는 뜻이다.
 *
 * 팀 사정은 예산 지수(팀 예산 / 리그 평균)로 반영한다. 로스터 생성의 연봉
 * 계산이 쓰는 것과 **같은 입력**이다 (`buildSalaryIndex` in newGameV3.ts,
 * design/roster.md §5). 하드코딩 맵을 다시 만들지 않는다 — CLAUDE.md 금지 항목.
 */

/** 예산 지수를 이 폭 안으로 가둔다 — 로스터 연봉 계산과 같은 clamp */
const INDEX_MIN = 0.85;
const INDEX_MAX = 1.15;

function baseSalary(pickNo: number): number {
  if (pickNo === 1)  return 9000;
  if (pickNo <= 4)   return 7500;
  if (pickNo <= 8)   return 6000;
  if (pickNo <= 16)  return 4500;
  if (pickNo <= 32)  return 3500;
  if (pickNo <= 48)  return 2800;
  if (pickNo <= 64)  return 2200;
  return 1500;
}

function baseBonus(pickNo: number): number {
  if (pickNo === 1)  return 6000;
  if (pickNo <= 4)   return 4000;
  if (pickNo <= 8)   return 2500;
  if (pickNo <= 16)  return 1500;
  if (pickNo <= 32)  return 800;
  if (pickNo <= 48)  return 300;
  return 0;
}

/**
 * @param teamIndex 팀 예산 / 리그 평균. 모르면 1.0(평균팀)을 넘긴다 —
 *                  0을 넘기면 신인 계약이 통째로 0이 된다.
 */
export function calcKblDraftContract(pickNo: number, teamIndex = 1.0): {
  salary: number;
  durationYears: 3;
  signingBonus: number;
} {
  const mult = Math.min(INDEX_MAX, Math.max(INDEX_MIN, teamIndex || 1.0));
  const salary       = Math.round(baseSalary(pickNo) * mult / 100) * 100;
  const signingBonus = Math.round(baseBonus(pickNo)  * mult / 100) * 100;
  return { salary, durationYears: 3, signingBonus };
}
