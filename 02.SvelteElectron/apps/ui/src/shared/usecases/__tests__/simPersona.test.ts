/**
 * **계측 플레이어가 하나뿐이고 대부분의 주에 첫 갈래를 골랐다**
 * (2026-09-09 · 계측 2-3 · 사용자 지적).
 *
 * 🔴 첫 갈래는 사람의 취향이 아니라 **데이터 작성 순서**다. 그걸로 잰 밸런스는
 *   「JSON 에 먼저 적힌 쪽」의 밸런스가 된다. 성향 셋이 **서로 다른 자**를
 *   쓰는지 여기서 못박는다 — 셋이 같은 답을 내면 성향을 나눈 뜻이 없다.
 */
import { describe, it, expect } from "vitest";
import { SIM_PERSONAS, primaryStatsFor, bodyCost, growthValue, seededIndex } from "../simPersona";
import type { DecisionEffect } from "../../types/main";

describe("성향 셋", () => {
  it("셋이다", () => {
    expect([...SIM_PERSONAS]).toEqual(["growth", "safe", "lazy"]);
  });

  it("무대별 주력 스탯은 `BALANCE_BACKLOG §16-2` 를 따른다", () => {
    expect(primaryStatsFor("highschool", false)).toEqual(["velocity", "command", "control"]);
    expect(primaryStatsFor("pro_kbl", false)).toEqual(["stamina", "control", "command"]);
    // 2군은 콜업이 보직 적합도를 타므로 다른 축이다
    expect(primaryStatsFor("pro_kbl", true)).toContain("movement");
  });
});

describe("`growth` — 즉시 스탯이 있으면 그것 먼저", () => {
  const prim = primaryStatsFor("highschool", false);
  const v = (fx: DecisionEffect) => growthValue(fx, prim);

  it("🔴 즉시 스탯 +1 이 XP 10 을 이긴다 — 사용자 확정 순서다", () => {
    expect(v({ statDelta: { command: 1 } })).toBeGreaterThan(v({ xp: { command: 10 } }));
  });

  it("같은 +1 이어도 주력 스탯이 더 값나간다", () => {
    expect(v({ statDelta: { command: 1 } })).toBeGreaterThan(v({ statDelta: { clutch: 1 } }));
  });

  it("`ovr` 은 안 센다 — 파생값이라 올릴 수 없다", () => {
    expect(v({ statDelta: { ovr: 5 } })).toBe(0);
  });

  it("구종·잠재력·훈련효율도 성장으로 본다", () => {
    expect(v({ pitchGrant: { id: "X" } })).toBeGreaterThan(0);
    expect(v({ potentialDelta: 1 })).toBeGreaterThan(0);
    expect(v({ trainEffBoost: { pct: 20, weeks: 4 } })).toBeGreaterThan(0);
  });

  it("효과가 없으면 0 — 빈 갈래가 이길 수 없다", () => {
    expect(v({})).toBe(0);
    expect(growthValue(undefined, prim)).toBe(0);
  });
});

describe("`safe` — 몸에 나쁜 정도", () => {
  it("피로가 크면 나쁘다", () => {
    expect(bodyCost({ fatigueDelta: 10 })).toBeGreaterThan(bodyCost({ fatigueDelta: 2 }));
  });

  it("컨디션은 **내려가는 것**이 나쁘다 — 부호를 뒤집어 본다", () => {
    expect(bodyCost({ conditionDelta: -10 })).toBeGreaterThan(bodyCost({ conditionDelta: 10 }));
  });

  it("부상 위험은 음수가 「덜 다친다」다", () => {
    expect(bodyCost({ injuryRiskMod: { pct: -20, weeks: 4 } })).toBeLessThan(
      bodyCost({ injuryRiskMod: { pct: 20, weeks: 4 } }),
    );
  });

  it("🔴 `growth` 와 반대로 고른다 — 스탯을 주지만 몸을 갈아 넣는 갈래", () => {
    const prim = primaryStatsFor("highschool", false);
    const hard: DecisionEffect = { statDelta: { command: 1 }, fatigueDelta: 15 };
    const easy: DecisionEffect = { moraleDelta: 2, fatigueDelta: -5 };
    // 성장은 hard 를 고른다
    expect(growthValue(hard, prim)).toBeGreaterThan(growthValue(easy, prim));
    // 안전은 easy 를 고른다
    expect(bodyCost(easy)).toBeLessThan(bodyCost(hard));
  });
});

describe("`lazy` — 씨앗 고정 무작위", () => {
  it("같은 씨앗이면 같은 답 — 계측이 재현된다", () => {
    expect(seededIndex(12345, 4)).toBe(seededIndex(12345, 4));
  });

  it("범위 안이다", () => {
    for (let n = 2; n <= 8; n++) {
      for (let s = 0; s < 200; s++) {
        const i = seededIndex(s, n);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      }
    }
  });

  it("🔴 **첫 갈래로 쏠리지 않는다** — 그게 고치려던 것이다", () => {
    const n = 3;
    const hits = [0, 0, 0];
    for (let s = 0; s < 300; s++) hits[seededIndex(s * 977 + 13, n)]++;
    // 한 자리가 절반을 넘으면 무작위가 아니다
    for (const h of hits) expect(h, `쏠림 ${hits.join("/")}`).toBeLessThan(150);
    for (const h of hits) expect(h, `안 닿는 자리 ${hits.join("/")}`).toBeGreaterThan(0);
  });

  it("갈래가 하나면 0", () => {
    expect(seededIndex(999, 1)).toBe(0);
  });
});
