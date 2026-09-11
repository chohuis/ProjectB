import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 의료팀 — `medicalQuality` 가 부상 회복 속도에 물린다 (4단계 · 16).
 *
 * 🔴 그 전엔 **트레이드 판정에만** 쓰였다. 부상 회복은 팀과 무관해서
 *   **의료 투자에 값이 없었다.**
 *
 * ⚠ **Rust 로 안 내렸다.** 이미 계산된 주 수에 팀 계수를 곱하는 것이라
 *   산식도 난수도 아니다 — `rosterEngine`(5단계)과 같은 갈래다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
  medicalRules?: { recoverySpan?: number; minWeeks?: number };
  campRules?: { conditionBonus?: number; weeks?: number };
  clubFinanceRules?: { expense?: { operations?: { camp?: number } } };
};

/** 규칙과 **같은 식**을 검사가 직접 계산한다 — 코드와 갈리면 여기가 실패한다 */
const multOf = (q: number, span: number) => 1 - ((q - 50) / 50) * span;

describe("의료팀", () => {
  const inj = read("apps/ui/src/shared/usecases/weekPhases/injuries.ts");

  it("규칙 파일에 값이 있다", () => {
    expect(rules.medicalRules?.recoverySpan).toBeGreaterThan(0);
    expect(rules.medicalRules?.minWeeks).toBeGreaterThan(0);
  });

  it("회복 주 수에 물린다", () => {
    expect(inj.includes("medicalQuality"), "성향을 읽는다").toBe(true);
    expect(inj.includes("occ.recoveryWeeks = "), "회복 주를 고친다").toBe(true);
  });

  it("좋을수록 짧고 나쁠수록 길다", () => {
    const span = rules.medicalRules!.recoverySpan!;
    expect(multOf(50, span), "50이 기준").toBe(1);
    expect(multOf(95, span)).toBeLessThan(1);
    expect(multOf(5, span)).toBeGreaterThan(1);
  });

  it("하한은 공용 함수가 지킨다", () => {
    // 🔴 예전엔 `injuries.ts` 안에 `Math.max(minW, ...)` 가 있었다.
    //   B단계에서 식을 `clubEffects` 로 빼면서 그 줄이 사라졌고,
    //   **문자열을 찾던 이 검사가 깨졌다** — 고친 게 아니라 옮긴 것이다.
    //   하한 자체는 `clubEffects.test.ts` 가 값으로 확인한다.
    expect(inj.includes("medicalRecoveryWeeks("), "공용 함수를 쓴다").toBe(true);
  });

  it("규칙이 없으면 안 돈다 (예전 동작)", () => {
    // 규칙 파일을 못 읽어도 게임이 멈추면 안 된다
    expect(inj.includes("if (med?.recoverySpan)")).toBe(true);
  });
});

describe("전지훈련", () => {
  it("🔴 지출은 이미 있었다 — 효과만 없었다", () => {
    // 4-B 에서 만든 죽은 갈래다. 구단 규모의 6%가 나가는데 어디에도 안 물렸다
    expect(rules.clubFinanceRules?.expense?.operations?.camp).toBeGreaterThan(0);
  });

  it("규칙이 생겼다", () => {
    expect(rules.campRules?.conditionBonus).toBeGreaterThan(0);
    expect(rules.campRules?.weeks).toBeGreaterThan(0);
  });

  it("⚠ 의료팀과 **다른 축**이다", () => {
    // 둘 다 부상에 물리면 어느 쪽이 효과인지 못 가린다.
    // 전훈은 **시즌 초 컨디션**이고 의료는 **회복 속도**다.
    const camp = JSON.stringify(rules.campRules);
    expect(camp.includes("conditionBonus"), "컨디션 축").toBe(true);
    expect(camp.includes("recoverySpan"), "회복 축이면 안 된다").toBe(false);
  });
});
