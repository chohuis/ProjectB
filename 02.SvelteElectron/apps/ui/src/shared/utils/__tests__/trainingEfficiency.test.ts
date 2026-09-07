import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  conditionFactor, fatigueFactor, diligenceFactor,
  trainingEfficiency, trainingEfficiencyDelta, TRAINING_SLOT_MULTS,
} from "../growthEngine";

/**
 * 🔴 **여기가 사본을 지키는 자리다.**
 *
 * `growthEngine.ts` 의 계수 셋은 Rust `growth_engine.rs::week_xp` 를 화면에
 * 보여 주려고 옮겨 적은 것이다(결정 ④ · 사용자 확정). 사본이므로 **한쪽만
 * 고쳐진 채 남을 수 있다** — 이 저장소가 여러 번 겪은 형태다.
 *
 * 그래서 두 가지를 본다:
 *   ① Rust 단위검사가 적어 둔 **같은 수**가 나오는가
 *   ② Rust 원본에 그 식이 **아직 그대로 있는가** (파일을 읽어 확인한다)
 */

const RUST = resolve(__dirname, "../../../../../../packages/engine-native/src/growth_engine.rs");
const src = readFileSync(RUST, "utf8");

describe("훈련 효율 계수 — Rust week_xp 와 같은 수를 낸다", () => {
  /** Rust `week_xp(base, cond, fat, dev, dil)` 를 TS 계수로 다시 만든다 */
  const weekXp = (base: number, cond: number, fat: number, dev: number, dil: number) =>
    base * conditionFactor(cond) * fatigueFactor(fat) * (dev / 62) * diligenceFactor(dil);

  it("보통 상태 — week_xp(4, 100, 0, 62, 99) = 5.6", () => {
    expect(weekXp(4, 100, 0, 62, 99)).toBeCloseTo(5.6, 3);
  });

  it("고피로 절단 — fatigue 90 이면 0.35 배 (1.96)", () => {
    expect(weekXp(4, 100, 90, 62, 99)).toBeCloseTo(1.96, 3);
  });

  it("중피로 절단 — fatigue 75 이면 0.65 배 (3.64)", () => {
    expect(weekXp(4, 100, 75, 62, 99)).toBeCloseTo(3.64, 3);
  });

  it("계단 문턱이 85·70 이다", () => {
    expect(fatigueFactor(85)).toBe(0.35);
    expect(fatigueFactor(84.9)).toBe(0.65);
    expect(fatigueFactor(70)).toBe(0.65);
    expect(fatigueFactor(69.9)).toBeCloseTo(0.8, 5);
    // 바닥 0.80 — 피로 40 이상은 다 같다
    expect(fatigueFactor(40)).toBe(0.8);
    expect(fatigueFactor(0)).toBe(1);
  });

  it("성실 계수는 1 에서 0.608, 99 에서 1.4", () => {
    expect(diligenceFactor(1)).toBeCloseTo(0.6 + 0.8 / 99, 5);
    expect(diligenceFactor(99)).toBeCloseTo(1.4, 5);
  });
});

describe("Rust 원본이 아직 같은 식을 들고 있다", () => {
  it("week_xp 의 계수 넷이 그대로다", () => {
    expect(src).toContain("let cond_factor = condition / 100.0;");
    expect(src).toContain("if fatigue >= 85.0 { 0.35 }");
    expect(src).toContain("else if fatigue >= 70.0 { 0.65 }");
    expect(src).toContain("(1.0 - fatigue / 200.0).max(0.80)");
    expect(src).toContain("let diligence_factor = 0.6 + (diligence / 99.0) * 0.8;");
  });

  it("슬롯 배수 2.8 / 1.3 / 0.9 가 그대로다", () => {
    expect(src).toContain("SLOT_MULTS: [(f64, f64); 3] = [(2.8, 1.0), (1.3, 0.5), (0.9, 0.5)]");
    expect([...TRAINING_SLOT_MULTS]).toEqual([2.8, 1.3, 0.9]);
  });
});

describe("화면이 쓰는 한 숫자", () => {
  it("기준(컨디션 100 · 피로 0 · 성실 49.5)이 ±0% 다", () => {
    const e = trainingEfficiency({ condition: 100, fatigue: 0, diligence: 49.5 });
    expect(e.total).toBeCloseTo(1, 5);
    expect(e.pct).toBe(0);
  });

  it("피로가 쌓이면 깎인다", () => {
    const good = trainingEfficiency({ condition: 90, fatigue: 20, diligence: 60 });
    const bad  = trainingEfficiency({ condition: 90, fatigue: 88, diligence: 60 });
    expect(bad.total).toBeLessThan(good.total);
    expect(bad.pct).toBeLessThan(0);
  });
});

describe("선택지 꼬리 — 지금 값에서 잰다", () => {
  it("같은 「피로 −8」이라도 문턱 앞뒤에서 다르다", () => {
    const nearEdge = trainingEfficiencyDelta(
      { condition: 80, fatigue: 74, diligence: 60 }, { fatigueDelta: -8 });
    const farAway = trainingEfficiencyDelta(
      { condition: 80, fatigue: 30, diligence: 60 }, { fatigueDelta: -8 });
    // 74 → 66 은 0.65 → 0.80 으로 **문턱을 넘는다**(+23%) ·
    // 30 → 22 는 완만한 구간이라 0.85 → 0.89 (+5%) 다
    expect(nearEdge).toBe(23);
    expect(farAway).toBe(5);
    expect(nearEdge!).toBeGreaterThan(farAway!);
  });

  it("움직이는 값이 없으면 null 이다", () => {
    expect(trainingEfficiencyDelta({ condition: 80, fatigue: 30, diligence: 60 }, {})).toBeNull();
    expect(trainingEfficiencyDelta(
      { condition: 80, fatigue: 30, diligence: 60 }, { moraleDelta: 6 } as never)).toBeNull();
  });

  it("성실이 오르면 효율도 오른다", () => {
    const d = trainingEfficiencyDelta(
      { condition: 80, fatigue: 30, diligence: 50 }, { diligenceDelta: 20 });
    expect(d).toBeGreaterThan(0);
  });

  it("컨디션은 100 까지다 — 1~99 로 자르지 않는다", () => {
    const d = trainingEfficiencyDelta(
      { condition: 96, fatigue: 30, diligence: 60 }, { conditionDelta: 4 });
    expect(d).toBeGreaterThan(0);
  });
});
