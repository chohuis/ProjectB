/**
 * **성장형이 몸값을 본다** (2026-09-10 · 사용자 확정 ①).
 *
 * 🔴 30판 실측에서 성장형이 안전형에 **모든 칸에서 졌다** — 통산승 36 대 73,
 *   **최고 OVR 마저 81 대 83**. 성장을 고르는 쪽이 성장에서 지면 자해다.
 *   `growthValue` 가 `bodyCost` 를 한 번도 안 봤기 때문이다.
 *
 * ⚠ 여기서 지키는 것은 **두 방향**이다:
 *   ① 자해를 안 한다 — 보상이 같으면 몸이 덜 상하는 쪽
 *   ② **성향이 안 무너진다** — 보상이 크면 여전히 밀어붙인다
 *   ②가 깨지면 성향 셋이 둘이 된다.
 */
import { describe, it, expect } from "vitest";
import { GROWTH_BODY_WEIGHT, growthValue, bodyCost, primaryStatsFor } from "../simPersona";
import type { DecisionEffect } from "../../types/main";

const prim = primaryStatsFor("highschool", false);
const v = (fx: DecisionEffect) => growthValue(fx, prim);

describe("성장형 몸값 계수", () => {
  it("0 이 아니다 — 안 보면 자해한다", () => {
    expect(GROWTH_BODY_WEIGHT).toBeGreaterThan(0);
  });

  it("🔴 스탯 +1 을 못 이긴다 — 넘으면 `safe` 와 같아진다", () => {
    // 주력 스탯 +1 = 120. 몸값 10 짜리 갈래의 벌점이 10 × 계수다
    expect(GROWTH_BODY_WEIGHT * 10).toBeLessThan(120);
  });
});

describe("① 자해를 안 한다", () => {
  it("보상이 같으면 몸이 덜 상하는 쪽이 높다", () => {
    const 편한쪽: DecisionEffect = { xp: { command: 5 }, fatigueDelta: 2 };
    const 험한쪽: DecisionEffect = { xp: { command: 5 }, fatigueDelta: 14 };
    expect(v(편한쪽)).toBeGreaterThan(v(험한쪽));
  });

  it("보상이 없는데 몸만 상하는 갈래는 쉬는 것보다 낮다", () => {
    expect(v({ fatigueDelta: 10 })).toBeLessThan(v({ fatigueDelta: -5 }));
  });

  it("컨디션이 깎이는 것도 몸값이다", () => {
    expect(v({ xp: { command: 4 }, conditionDelta: -12 })).toBeLessThan(
      v({ xp: { command: 4 }, conditionDelta: 0 }),
    );
  });

  it("🔴 꼬리를 막는다 — 몸값 35짜리는 XP 8 로는 못 산다", () => {
    // 수술을 만든 것은 평균이 아니라 이런 갈래다(피로 +15 · 부상위험 +20)
    const 꼬리: DecisionEffect = {
      xp: { command: 8 },
      fatigueDelta: 15,
      injuryRiskMod: { pct: 20, weeks: 4 },
    };
    expect(bodyCost(꼬리)).toBeGreaterThanOrEqual(35);
    expect(v(꼬리)).toBeLessThan(v({ xp: { command: 2 } }));
  });
});

describe("② 성향이 안 무너진다 — 여전히 밀어붙인다", () => {
  it("🔴 스탯이 걸리면 몸값 35 도 산다", () => {
    const 값하는것: DecisionEffect = {
      statDelta: { command: 1 },
      fatigueDelta: 15,
      injuryRiskMod: { pct: 20, weeks: 4 },
    };
    expect(v(값하는것)).toBeGreaterThan(v({ moraleDelta: 3, fatigueDelta: -5 }));
  });

  it("구종·잠재력도 몸값을 이긴다 — 이 게임의 축이다", () => {
    expect(v({ pitchGrant: { id: "X" }, fatigueDelta: 12 })).toBeGreaterThan(
      v({ fatigueDelta: 0 }),
    );
    expect(v({ potentialDelta: 1, fatigueDelta: 12 })).toBeGreaterThan(v({ fatigueDelta: 0 }));
  });

  it("안전형과 답이 갈리는 자리가 남는다", () => {
    // 안전형은 몸값만 본다 — 스탯이 걸려도 편한 쪽을 고른다
    const 험하고값진: DecisionEffect = { statDelta: { command: 1 }, fatigueDelta: 12 };
    const 편하고빈: DecisionEffect = { fatigueDelta: -2 };
    expect(v(험하고값진)).toBeGreaterThan(v(편하고빈)); // 성장형은 값진 쪽
    expect(bodyCost(편하고빈)).toBeLessThan(bodyCost(험하고값진)); // 안전형은 편한 쪽
  });
});
