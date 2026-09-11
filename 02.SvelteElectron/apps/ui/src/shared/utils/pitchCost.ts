/**
 * 투구 선택이 스태미나를 얼마나 먹나.
 *
 * ⚠ **엔진은 스태미나로 구종을 막지 않는다.** 계획서(§3-8)의 완료 조건은
 * "스태미나에 따라 선택지가 줄어든다"였는데, `match_engine.rs`를 읽어 보니
 * 그런 규칙이 없다 — 낮은 스태미나는 **모든** 구질의 품질을 함께 깎을 뿐이고
 * (`stamina_penalty = max(0, 50 - stamina) * 0.18`) 구종별 차단은 없다.
 *
 * 그래서 화면이 구종을 흐리게 만들면 **엔진에 없는 규칙을 지어내는 것**이다.
 * 이 프로젝트가 이미 한 번 밟은 실수다 — "부상위험 %"는 `(피로-55)*0.9`로
 * 화면이 만든 값이었고 엔진의 부상 판정과 아무 관계가 없었다(§U3).
 *
 * 대신 **실제로 있는 것**을 보여준다: 선택마다 스태미나 소모가 다르다.
 * 그 값은 `balance/match_engine_tuning.json`이 정본이고 엔진과 같은 파일을
 * 읽으므로 숫자가 두 벌이 되지 않는다.
 */

export interface PitchCostRules {
  staminaBase: number;
  staminaAggressiveBonus: number;
  staminaFastballBonus: number;
  staminaPowerCost: { low: number; normal: number; high: number };
}

let _rules: PitchCostRules | null = null;

export function primePitchCost(tuning: Partial<PitchCostRules> | null | undefined): void {
  if (!tuning || typeof tuning.staminaBase !== "number") {
    _rules = null;
    return;
  }
  _rules = {
    staminaBase: tuning.staminaBase,
    staminaAggressiveBonus: tuning.staminaAggressiveBonus ?? 0,
    staminaFastballBonus: tuning.staminaFastballBonus ?? 0,
    staminaPowerCost: {
      low: tuning.staminaPowerCost?.low ?? 0,
      normal: tuning.staminaPowerCost?.normal ?? 0,
      high: tuning.staminaPowerCost?.high ?? 0,
    },
  };
}

export function pitchCostRules(): PitchCostRules | null {
  return _rules;
}

export type CostStrategy = "aggressive" | "balanced" | "safe";
export type CostPower = "low" | "normal" | "high";

/**
 * 이 선택 한 구가 먹는 스태미나.
 *
 * ⚠ 실제 소모는 여기에 투수의 `staminaCap`과 피로 가속(<40)이 곱해진다.
 * 그 둘은 선택과 무관하므로 **선택끼리 비교**하는 이 화면에서는 뺀다 —
 * 곱해도 순서가 안 바뀐다.
 */
export function staminaCostOf(
  isFastball: boolean,
  strategy: CostStrategy,
  power: CostPower,
): number | null {
  if (!_rules) return null;
  return (
    _rules.staminaBase +
    (strategy === "aggressive" ? _rules.staminaAggressiveBonus : 0) +
    (isFastball ? _rules.staminaFastballBonus : 0) +
    _rules.staminaPowerCost[power]
  );
}

/** 이 선택지 하나를 골랐을 때 늘어나는 소모. 버튼 옆에 붙일 값 */
export function deltaOf(kind: "fastball" | CostStrategy | CostPower): number | null {
  if (!_rules) return null;
  switch (kind) {
    case "fastball":
      return _rules.staminaFastballBonus;
    case "aggressive":
      return _rules.staminaAggressiveBonus;
    case "balanced":
    case "safe":
      return 0;
    case "low":
      return _rules.staminaPowerCost.low;
    case "normal":
      return _rules.staminaPowerCost.normal;
    case "high":
      return _rules.staminaPowerCost.high;
  }
}

/**
 * 남은 스태미나로 몇 구나 더 던지나 — 지금 선택 기준.
 *
 * "체력 82"보다 "이 선택이면 약 60구"가 결정에 쓰인다. 어림값이므로
 * **정확한 척하지 않는다** — 피로 가속(<40)은 여기 안 넣는다.
 */
export function pitchesLeft(stamina: number, costPerPitch: number | null): number | null {
  if (costPerPitch == null || costPerPitch <= 0 || stamina <= 0) return null;
  return Math.floor(stamina / costPerPitch);
}
