import { describe, it, expect } from "vitest";
import { deriveProfileFromBudgetIndex } from "../game";

/**
 * 구단 성향을 예산 지수에서 유도한다 — **KBL 20팀은 성향 데이터가 없다.**
 *
 * 손으로 만든 값이 `teams/pro_korea/*.json`에 있지만 구 데이터다. seeds로
 * 국내 팀을 통째 교체하면서 팀 자체가 바뀌었다(부산 자이언트웨일스 →
 * 부산 웨이브스). 그래서 복구가 아니라 유도다.
 */
describe("예산 지수 → 구단 성향", () => {
  it("리그 평균(지수 1.0)이면 기본값과 같다 — 기준점", () => {
    const p = deriveProfileFromBudgetIndex(1.0);
    for (const [k, v] of Object.entries(p)) expect(v, k).toBe(50);
  });

  it("부자 구단은 돈을 쓰고 지금 이기려 한다", () => {
    const rich = deriveProfileFromBudgetIndex(1.5);
    expect(rich.ownerSpendingWillingness).toBeGreaterThan(50);
    expect(rich.winNowPressure).toBeGreaterThan(50);
    expect(rich.prestige).toBeGreaterThan(50);
  });

  it("⚠ 부자 구단은 **육성과 인내가 낮다** — 방향이 반대인 항목", () => {
    // 여기가 뒤집히면 가난한 팀이 육성을 안 하게 되어 2군이 마른다
    const rich = deriveProfileFromBudgetIndex(1.5);
    expect(rich.developmentFocus).toBeLessThan(50);
    expect(rich.farmInvestment).toBeLessThan(50);
    expect(rich.ownerPatience).toBeLessThan(50);
  });

  it("가난한 구단은 정확히 반대다", () => {
    const poor = deriveProfileFromBudgetIndex(0.5);
    expect(poor.ownerSpendingWillingness).toBeLessThan(50);
    expect(poor.winNowPressure).toBeLessThan(50);
    expect(poor.developmentFocus).toBeGreaterThan(50);
    expect(poor.ownerPatience).toBeGreaterThan(50);
  });

  it("⚠ 극단값이 5~95를 안 벗어난다 — 0이나 100이면 성향이 사라진다", () => {
    for (const idx of [0, 0.01, 5, 100]) {
      const p = deriveProfileFromBudgetIndex(idx);
      for (const [k, v] of Object.entries(p)) {
        expect(v, `${k} @ 지수 ${idx}`).toBeGreaterThanOrEqual(5);
        expect(v, `${k} @ 지수 ${idx}`).toBeLessThanOrEqual(95);
      }
    }
  });

  it("예산과 무관한 항목은 안 움직인다 — 대조군", () => {
    for (const idx of [0.5, 1.0, 1.5]) {
      const p = deriveProfileFromBudgetIndex(idx);
      expect(p.stability, "stability").toBe(50);
      expect(p.discipline, "discipline").toBe(50);
      expect(p.clubhouseCulture, "clubhouseCulture").toBe(50);
    }
  });
});
