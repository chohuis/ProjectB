import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { faOfferTermLines, faTotalValue, FA_TERM_LABEL, type FaOfferTermsInput } from "../faOfferTerms";

/**
 * FA 제안 카드의 조건 줄 (PLAN_CONTRACT_TERMS §1-2 · §7 ②).
 *
 * ⚠ **컴포넌트를 띄우지 않는다.** 이 저장소의 vitest 는 `environment: "node"` 라
 * DOM 이 없다(`vitest.config.ts`). 그래서 줄을 만드는 순수 함수를 직접 재고,
 * 화면이 그 함수를 쓰는지는 **소스 문자열 대조**로 본다 —
 * `roleAskWeek.test.ts` 의 배선 검사와 같은 방식이다.
 *
 * 🔴 **헤드리스로 FA 제안이 뜨는 세이브를 만들지 못했다.** 주인공 FA 는 프로
 * 5년차(`faRules.eligibleYears`) 뒤에야 열리고, `generateFaOffers` 는
 * `window.projectB.faGenerateOffers` 를 타므로 Electron 없이는 값이 안 온다.
 * 그래서 실측 자리를 이 단위 검사가 대신한다.
 */

function offer(over: Partial<FaOfferTermsInput> = {}): FaOfferTermsInput {
  return {
    salary: 12000,
    durationYears: 3,
    signingBonus: 0,
    teamOptionYears: 0,
    playerOptionYears: 0,
    noTrade: false,
    ...over,
  };
}

const keysOf = (o: FaOfferTermsInput) => faOfferTermLines(o).map((l) => l.key);

describe("있는 항목만 줄로 나온다", () => {
  it("조항이 하나도 없으면 총액 한 줄뿐이다", () => {
    expect(keysOf(offer())).toEqual(["total"]);
  });

  it("계약금이 있으면 계약금 줄이 는다", () => {
    expect(keysOf(offer({ signingBonus: 3000 }))).toEqual(["signingBonus", "total"]);
  });

  it("팀 옵션·선수 옵션은 각각 연수가 1 이상일 때만 나온다", () => {
    expect(keysOf(offer({ teamOptionYears: 1 }))).toEqual(["teamOption", "total"]);
    expect(keysOf(offer({ playerOptionYears: 2 }))).toEqual(["playerOption", "total"]);
  });

  it("노트레이드는 참일 때만 나온다", () => {
    expect(keysOf(offer({ noTrade: true }))).toEqual(["noTrade", "total"]);
  });

  it("Rust 가 넷을 다 냈으면 다섯 줄이고 순서가 고정이다", () => {
    const all = offer({ signingBonus: 3000, teamOptionYears: 1, playerOptionYears: 2, noTrade: true });
    expect(keysOf(all)).toEqual(["signingBonus", "teamOption", "playerOption", "noTrade", "total"]);
  });
});

describe("없는 조항은 줄 자체가 없다 — 「없음」·「0년」을 안 적는다", () => {
  it("0 이나 false 는 줄을 안 만든다", () => {
    const lines = faOfferTermLines(offer({ signingBonus: 0, teamOptionYears: 0, playerOptionYears: 0, noTrade: false }));
    for (const key of ["signingBonus", "teamOption", "playerOption", "noTrade"] as const) {
      expect(lines.some((l) => l.key === key)).toBe(false);
    }
  });

  it("칸이 아예 없어도(undefined) 줄을 안 만든다 — Rust 가 안 채운 옛 제안", () => {
    const lines = faOfferTermLines({ salary: 9000, durationYears: 2 });
    expect(lines.map((l) => l.key)).toEqual(["total"]);
  });

  it("「없음」·「0년」 같은 값이 어느 줄에도 없다", () => {
    const lines = faOfferTermLines(offer({ signingBonus: 3000, teamOptionYears: 1, noTrade: true }));
    for (const l of lines) {
      expect(l.value.includes("없음")).toBe(false);
      expect(l.value.includes("0년")).toBe(false);
    }
  });

  // 대조군 — 조건을 빼면 줄이 는다. 이게 안 늘면 위 검사들이 아무것도 안 보는 것이다
  it("대조군: 같은 제안에 조항을 얹으면 줄 수가 는다", () => {
    expect(faOfferTermLines(offer()).length).toBe(1);
    expect(faOfferTermLines(offer({ signingBonus: 3000, noTrade: true })).length).toBe(3);
  });
});

describe("값과 표기", () => {
  it("금액은 만원 · 옵션은 연수다", () => {
    const lines = faOfferTermLines(offer({ signingBonus: 3000, teamOptionYears: 2 }));
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(byKey.signingBonus.value).toBe(`${(3000).toLocaleString()}만원`);
    expect(byKey.teamOption.value).toBe("2년");
  });

  it("노트레이드는 값이 없다 — 항목 이름 하나로 그린다", () => {
    const line = faOfferTermLines(offer({ noTrade: true })).find((l) => l.key === "noTrade")!;
    expect(line.value).toBe("");
  });

  it("총액은 연봉 × 기간 + 계약금이다 — 협상 화면과 같은 식", () => {
    expect(faTotalValue(offer({ salary: 12000, durationYears: 3, signingBonus: 3000 }))).toBe(39000);
    const line = faOfferTermLines(offer({ signingBonus: 3000 })).find((l) => l.key === "total")!;
    expect(line.value).toBe(`${(39000).toLocaleString()}만원`);
  });

  it("1년 · 계약금 없음이면 총액이 연봉과 같아 줄을 안 적는다", () => {
    expect(keysOf(offer({ durationYears: 1, signingBonus: 0 }))).toEqual([]);
    expect(keysOf(offer({ durationYears: 1, signingBonus: 500 }))).toEqual(["signingBonus", "total"]);
  });

  it("항목 이름은 협상 화면과 같은 말이다", () => {
    const SRC = readFileSync(resolve(__dirname, "../../../features/contract/ui/ContractNegotiationModal.svelte"), "utf8");
    for (const key of ["signingBonus", "teamOption", "playerOption", "total"] as const) {
      expect(SRC.includes(FA_TERM_LABEL[key])).toBe(true);
    }
  });

  it("이름에 부제·대시 설명을 안 붙인다", () => {
    for (const label of Object.values(FA_TERM_LABEL)) {
      expect(label.includes("—")).toBe(false);
      expect(label.includes("(")).toBe(false);
    }
  });
});

describe("카드 배선 — 화면이 이 함수를 쓴다", () => {
  const SRC = readFileSync(resolve(__dirname, "../../../features/contract/ui/FaMarketModal.svelte"), "utf8");

  it("제안 카드가 `faOfferTermLines(offer)` 를 돈다", () => {
    expect(SRC.includes('import { faOfferTermLines } from "../../../shared/utils/faOfferTerms"')).toBe(true);
    expect(SRC.includes("{#each faOfferTermLines(offer) as term (term.key)}")).toBe(true);
    expect(SRC.includes("{term.label}")).toBe(true);
    expect(SRC.includes("{term.value}")).toBe(true);
  });

  it("항목 이름을 화면에 따로 적지 않는다 — 표가 두 벌이 되면 한쪽만 고쳐진다", () => {
    for (const label of Object.values(FA_TERM_LABEL)) {
      expect(SRC.includes(`>${label}<`)).toBe(false);
    }
  });

  it("값이 없는 조항은 값 칸 자체를 안 그린다", () => {
    expect(SRC.includes("{#if term.value}")).toBe(true);
  });
});
