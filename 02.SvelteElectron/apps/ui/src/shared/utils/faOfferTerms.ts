/**
 * FA 제안 카드에 그릴 **계약 조건 줄** (PLAN_CONTRACT_TERMS §1-2 · §3 「1.0 에 넣는다」).
 *
 * Rust `eval_fa_bid` 가 계약금·팀 옵션·노트레이드를 **이미 내고**
 * `faEngine.toContract` 가 그대로 계약에 옮기는데, 제안 카드는 연봉·기간 두 줄만
 * 보여 줬다 — 조건이 **서명한 뒤 선수 상세에서야** 보였다(§1-2).
 *
 * ## 규칙 셋
 *
 * 🔴 **없는 조항은 줄을 안 적는다.** "계약금 없음"·"옵션 0년" 같은 줄을 만들지
 * 않는다 — 카드가 네 줄 더 길어지기만 하고 읽히는 건 없다(§6 「없는 조항은 안 적는다」).
 *
 * 🔴 **항목 이름만이다.** 부제·대시 설명·효과 설명을 안 붙인다(사용자 지시 · §9 시안).
 * 표기는 협상 화면(`ContractNegotiationModal`)과 맞췄다 — 같은 계약을 두 화면이
 * 다른 말로 부르면 안 된다.
 *
 * 🔴 **문장이 없다.** 여기 있는 건 항목 이름과 단위뿐이고, 소식 문안의 정본은
 * `resource/data/master/messages/contract_terms.json`(B-13)이다. 카드는 소식이
 * 아니라 그 파일을 안 읽는다 — 읽어야 할 자리가 생기면 그때 로더를 붙인다.
 *
 * ⚠ **금액 단위는 만원이다.** 카드가 이미 `만원`으로 그리고 있고
 * (`FaMarketModal` 의 연봉 줄), 게임 안의 돈이 전부 그 단위다(CLAUDE.md).
 * 협상 화면은 `억/만` 으로 접어 그리는데 **카드는 안 접는다** — 한 카드 안에서
 * 연봉 줄과 총액 줄의 단위가 갈리면 비교가 안 된다.
 */

export interface FaOfferTermsInput {
  salary: number;
  durationYears: number;
  signingBonus?: number;
  teamOptionYears?: number;
  playerOptionYears?: number;
  noTrade?: boolean;
}

export type FaTermKey = "signingBonus" | "teamOption" | "playerOption" | "noTrade" | "total";

export interface FaTermLine {
  key: FaTermKey;
  /** 항목 이름 — 협상 화면과 같은 말 */
  label: string;
  /** 값. 빈 문자열이면 **이름만 그린다**(노트레이드) */
  value: string;
}

/** 항목 이름 — 한 곳에만 둔다. 화면이 따로 적으면 두 벌이 된다 */
export const FA_TERM_LABEL: Record<FaTermKey, string> = {
  signingBonus: "계약금",
  teamOption:   "팀 옵션",
  playerOption: "선수 옵션",
  noTrade:      "노트레이드",
  total:        "총액",
};

function manwon(v: number): string {
  return `${Math.round(v).toLocaleString()}만원`;
}

/**
 * 총액 — 연봉 × 기간 + 계약금.
 *
 * 협상 화면의 `totalValue`(`ContractNegotiationModal`)와 **같은 식이다.**
 * 두 화면이 다른 총액을 보이면 어느 쪽이 맞는지 알 길이 없다.
 */
export function faTotalValue(o: FaOfferTermsInput): number {
  const years = o.durationYears > 0 ? o.durationYears : 0;
  return o.salary * years + (o.signingBonus ?? 0);
}

/**
 * 카드에 그릴 줄들 — **있는 항목만** 낸다.
 *
 * 연봉·기간 줄은 카드가 이미 갖고 있어 여기서 안 낸다.
 */
export function faOfferTermLines(o: FaOfferTermsInput): FaTermLine[] {
  const lines: FaTermLine[] = [];

  if ((o.signingBonus ?? 0) > 0) {
    lines.push({ key: "signingBonus", label: FA_TERM_LABEL.signingBonus, value: manwon(o.signingBonus!) });
  }
  if ((o.teamOptionYears ?? 0) > 0) {
    lines.push({ key: "teamOption", label: FA_TERM_LABEL.teamOption, value: `${o.teamOptionYears}년` });
  }
  if ((o.playerOptionYears ?? 0) > 0) {
    lines.push({ key: "playerOption", label: FA_TERM_LABEL.playerOption, value: `${o.playerOptionYears}년` });
  }
  // 조항은 있고 없고뿐이라 값이 없다 — 이름 하나로 그린다
  if (o.noTrade === true) {
    lines.push({ key: "noTrade", label: FA_TERM_LABEL.noTrade, value: "" });
  }
  // 총액은 조항이 아니라 계산값이다. 연봉이 있으면 늘 낸다 —
  // 다만 **1년 · 계약금 없음**이면 연봉 줄과 같은 값이라 안 낸다
  const years = o.durationYears > 0 ? o.durationYears : 0;
  if (o.salary > 0 && years > 0 && (years > 1 || (o.signingBonus ?? 0) > 0)) {
    lines.push({ key: "total", label: FA_TERM_LABEL.total, value: manwon(faTotalValue(o)) });
  }

  return lines;
}
