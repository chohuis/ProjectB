import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gradeChip, hidesNumbers, isCrisis, kindOnlyHint, costKindHint,
} from "../eventTierCopy";
import type { DecisionEffect } from "../../types/main";

/**
 * 등급 화면의 규칙 (PLAN_EVENT_TIERS §2·§9 · C 4-5).
 *
 * 🔴 **여기가 지키는 것은 「숫자가 안 샌다」 하나다.** 유니크·히든의 힌트에
 *   숫자가 한 번이라도 새면 기획이 통째로 무너진다(크기를 모른 채 고르는 것이
 *   그 등급의 감각이다) — 그런데 힌트를 만드는 자리가 화면이라 눈으로만 보면
 *   놓친다. 실제 데이터 꼴을 그대로 넣어 잰다.
 */
describe("등급 칩", () => {
  it("노말은 칩이 없다 — 늘 오는 것에 이름표를 붙이면 이름표가 배경이 된다", () => {
    expect(gradeChip("normal")).toBeNull();
    expect(gradeChip(undefined)).toBeNull();
    expect(gradeChip(null)).toBeNull();
  });

  it("레어·유니크·히든만 칩을 가진다", () => {
    expect(gradeChip("rare")?.label).toBe("레어");
    expect(gradeChip("unique")?.label).toBe("유니크");
    expect(gradeChip("hidden")?.label).toBe("히든");
  });

  it("밝은 지면과 어두운 지면의 색이 **둘 다** 있다 — 분류 칩이 한쪽만 들고 있어 겪은 형태다", () => {
    for (const g of ["rare", "unique", "hidden"] as const) {
      const c = gradeChip(g)!;
      expect(c.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.accentDark).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.accent).not.toBe(c.accentDark);
    }
  });
});

describe("위기 표시 (§9)", () => {
  it("레어·유니크 중 몸 계열만 위기다", () => {
    expect(isCrisis("rare", "body")).toBe(true);
    expect(isCrisis("unique", "body")).toBe(true);
  });
  it("노말은 칩이 없으니 위기도 없다", () => {
    expect(isCrisis("normal", "body")).toBe(false);
  });
  it("히든은 뺀다 — 히든 칩 자체가 사건의 표시라 겹치면 무엇이 드문 것인지 안 보인다", () => {
    expect(isCrisis("hidden", "body")).toBe(false);
  });
  it("몸이 아닌 결은 위기가 아니다", () => {
    expect(isCrisis("rare", "career")).toBe(false);
    expect(isCrisis("unique", undefined)).toBe(false);
  });
});

describe("숫자를 감추는 등급 (§2)", () => {
  it("유니크·히든만 감춘다", () => {
    expect(hidesNumbers("unique")).toBe(true);
    expect(hidesNumbers("hidden")).toBe(true);
    expect(hidesNumbers("rare")).toBe(false);
    expect(hidesNumbers("normal")).toBe(false);
    expect(hidesNumbers(undefined)).toBe(false);
  });
});

describe("종류만 힌트", () => {
  /** 실제 데이터 — `EVT_HS_COMMON_RETIRE_GIFT` 의 첫 갈래 (2026-09-08 실측) */
  const retireGift: DecisionEffect = {
    moraleDelta: 5, diligenceDelta: 2, moneyDelta: -15,
    relationDelta: { kind: "teammate", delta: 8 }, statDelta: { stamina: 1 },
  };

  it("🔴 숫자가 한 글자도 없다", () => {
    expect(kindOnlyHint(retireGift)).not.toMatch(/\d/);
  });

  it("얻는 쪽으로 줄을 다 채우지 않는다 — 내주는 쪽 한 자리를 떼어 둔다", () => {
    // 앞에서부터 자르면 「돈을 내준다」가 통째로 사라졌다(그래서 이 검사가 있다)
    expect(kindOnlyHint(retireGift)).toContain("돈을 내준다");
  });

  it("피로는 부호가 뒤집힌다 — 피로가 오르는 것이 내주는 쪽이다", () => {
    expect(kindOnlyHint({ statDelta: { clutch: 1 }, fatigueDelta: 8 }))
      .toBe("큰 것을 얻는다 · 몸을 갈아 넣는다");
    expect(kindOnlyHint({ fatigueDelta: -8 })).toBe("몸이 편해진다");
  });

  it("부상 위험도 뒤집힌다 — 음수가 덜 다치는 쪽이다", () => {
    expect(kindOnlyHint({ injuryRiskMod: { pct: -10, weeks: 4 } })).toBe("몸이 편해진다");
  });

  it("같은 종류가 양쪽에 서면 내주는 쪽만 남긴다 — 「얻고 잃는다」는 아무 말도 아니다", () => {
    expect(kindOnlyHint({ moneyDelta: -10, luxurySpend: { cost: 10, onTeammate: false } }))
      .toBe("돈을 내준다");
  });

  it("종류를 못 세우면 빈 문자열이다 — 「무언가 일어난다」로 메우지 않는다", () => {
    expect(kindOnlyHint(undefined)).toBe("");
    expect(kindOnlyHint({ addTag: ["라이벌:PLY_1"] })).toBe("");
  });

  it("세 종류를 넘기지 않는다 — 힌트가 본문만큼 길면 종류가 안 읽힌다", () => {
    const wide: DecisionEffect = {
      statDelta: { control: 1 }, xp: { velocity: 3 }, moneyDelta: 5,
      fameDelta: 2, moraleDelta: 4, relationDelta: { kind: "coach", delta: 3 },
    };
    expect(kindOnlyHint(wide).split(" · ").length).toBeLessThanOrEqual(3);
  });
});

describe("대가 종류 (§4)", () => {
  it("이벤트에 붙은 대가는 늘 내주는 말로 적는다", () => {
    expect(costKindHint([{ relationDelta: { kind: "teammate", delta: -6 } }]))
      .toBe("관계를 내준다");
  });
  it("데이터가 `+` 로 적어 둔 대가(피로 +10)도 내주는 쪽이다", () => {
    expect(costKindHint([{ fatigueDelta: 10 }])).toBe("몸을 갈아 넣는다");
  });
  it("대가가 없으면 빈 문자열 — 부르는 쪽이 줄을 안 그린다", () => {
    expect(costKindHint(undefined)).toBe("");
    expect(costKindHint([])).toBe("");
  });
  it("🔴 대가에도 숫자가 없다", () => {
    expect(costKindHint([{ moneyDelta: -300, relationDelta: { kind: "manager", delta: -5 } }]))
      .not.toMatch(/\d/);
  });
});

/**
 * ⚠ 이 저장소의 vitest 는 `environment: "node"` 라 컴포넌트를 못 띄운다
 * (`roleChoicePanel.test.ts` 가 그은 선). 규칙은 위에서 순수 함수로 재고,
 * **화면이 그 규칙을 쓰는지는 소스 문자열로** 본다.
 *
 * 🔴 이게 없으면 다음 사람이 힌트 줄을 손보다가 `veiled` 분기를 지워도 검사가
 *   전부 초록이다 — 유니크의 숫자가 다시 새는데 아무도 모른다.
 */
describe("화면이 가림 규칙을 실제로 쓰는가 (소스 문자열)", () => {
  const src = (p: string) =>
    readFileSync(resolve(__dirname, "../../../", p), "utf8");

  it("소식함이 `hidesNumbers` 로 판정하고 `kindOnlyHint` 로 다시 짓는다", () => {
    const s = src("pages/news/NewsPage.svelte");
    expect(s).toContain("hidesNumbers");
    expect(s).toContain("kindOnlyHint");
    // 꼬리도 같이 뗀다 — 여기만 빠지면 퍼센트로 크기가 샌다
    expect(s).toContain("effTail && !veiled");
  });

  it("이벤트 모달도 같은 규칙을 쓴다", () => {
    const s = src("features/events/ui/EventPendingModal.svelte");
    expect(s).toContain("hidesNumbers");
    expect(s).toContain("kindOnlyHint");
  });

  it("칩은 한 컴포넌트가 그린다 — 세 자리가 각자 그리면 색이 셋으로 갈린다", () => {
    for (const p of [
      "pages/news/NewsPage.svelte",
      "features/events/ui/EventPendingModal.svelte",
      "features/season-end/ui/SeasonEndModal.svelte",
    ]) {
      expect(src(p)).toContain("EventTierChip");
    }
  });

  it("대가 한 줄은 두 자리 다 있다", () => {
    expect(src("pages/news/NewsPage.svelte")).toContain("COST_LEAD");
    expect(src("features/events/ui/EventPendingModal.svelte")).toContain("COST_LEAD");
  });

  it("업적 셋의 열쇠가 계측에 실려 있다", () => {
    const s = src("shared/utils/achievementEngine.ts");
    for (const k of ["eventUniqueTotal", "eventHiddenTotal", "eventRareSeasonMax"]) {
      expect(s).toContain(k);
    }
  });
});
