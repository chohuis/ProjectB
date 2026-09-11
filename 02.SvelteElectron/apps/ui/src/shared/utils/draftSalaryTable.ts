/**
 * 신인 지명 계약 — **정본은 `generation_rules.json draftRules.contract`다.**
 *
 * 예전엔 이 파일에 표가 직접 박혀 있었고 두 군데가 다 틀렸다:
 * 1순위 연봉 9,000만원(KBO 신인 연봉 규정 위반)에 하위 지명 1,500만원
 * (KBL 최저연봉 3,000만원 미달). 게다가 팀 배수 맵의 키가 전부 없는 팀이라
 * 모든 구단이 배수 1.0으로 떨어지고 있었다.
 *
 * 규칙 파일을 Rust(`draft.rs`)와 **같이 읽는다** — NPC 신인과 주인공 신인이
 * 다른 표를 쓰면 화면에 나란히 뜨는 순간 어긋난다.
 */

export interface PickContract {
  untilPick: number;
  salary: number;
  bonus: number;
}

export interface DraftContractRules {
  durationYears: number;
  byPick: PickContract[];
  teamIndexMin?: number;
  teamIndexMax?: number;
}

export interface DraftContract {
  salary: number;
  durationYears: number;
  signingBonus: number;
}

/**
 * @param teamIndex 팀 예산 / 리그 평균 (`buildSalaryIndex`). 모르면 1.0.
 *                  **계약금에만** 곱한다 — 신인 연봉은 규정상 균일이다
 */
export function calcKblDraftContract(
  pickNo: number,
  rules: DraftContractRules,
  teamIndex = 1.0,
): DraftContract {
  const row =
    rules.byPick.find((r) => pickNo <= r.untilPick) ?? rules.byPick[rules.byPick.length - 1];
  if (!row) return { salary: 0, durationYears: rules.durationYears, signingBonus: 0 };

  const lo = rules.teamIndexMin ?? 0.85;
  const hi = rules.teamIndexMax ?? 1.15;
  const idx = Math.min(hi, Math.max(lo, teamIndex || 1.0));
  return {
    salary: row.salary,
    durationYears: rules.durationYears,
    signingBonus: Math.round((row.bonus * idx) / 100) * 100,
  };
}
