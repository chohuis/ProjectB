import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_MATCH_ENGINE_TUNING,
  type MatchEngineTuning,
} from "@core/domain/matchEngineTuning";

/**
 * **매치 엔진 수치의 거울이 Rust 와 같은가** (2026-09-30).
 *
 * 🔴 왜 있나. 같은 표가 **셋**이었다 — `packages/engine-native/src/tuning.rs`
 *   (정본 · 엔진이 읽는 유일한 것) · `packages/core` 의
 *   `DEFAULT_MATCH_ENGINE_TUNING`(거울 · 화면이 읽는다) ·
 *   `resource/data/master/balance/match_engine_tuning.json`. JSON 은 넉 달 전
 *   값이었고(`pitchBase` 4구종 63/60/58/57 · Rust 는 10구종 52.5~57.5),
 *   **기계가 보는 검사가 하나도 없었다.** Rust 쪽 주석이 「거울이 하나 있다 ·
 *   고칠 때 둘 다 고친다」고 적고 있을 뿐이었다 — 그 주석이 여러 칸에서
 *   이미 깨져 있었다(실측: 주인공 긴급 강판 체력 15 대 5 등).
 *   JSON 은 지웠고, 남은 거울 하나를 여기서 묶는다.
 *
 * ⚠ **값을 글자로 박지 않는다.** 여기 숫자를 베껴 적으면 값을 고칠 때 검사도
 *   같이 고치게 되어 아무것도 못 잡는다. `tuning.rs` 를 읽어서 비교한다
 *   (`parkSourcesAgree.test.ts` 와 같은 방법).
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`) — 줄 단위로 훑는다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const RUST = readFileSync(resolve(ROOT, "packages/engine-native/src/tuning.rs"), "utf8");

/** `pub const NAME: 타입 = 값;` 의 값 */
function constOf(name: string): number {
  const needle = `pub const ${name}:`;
  const at = RUST.indexOf(needle);
  expect(at, `Rust 에 \`${name}\` 이 없다 — 검사가 낡았다`).toBeGreaterThan(-1);
  const eq = RUST.indexOf("=", at + needle.length);
  const end = RUST.indexOf(";", eq);
  expect(end, `\`${name}\` 의 값을 못 읽었다`).toBeGreaterThan(eq);
  return Number(RUST.slice(eq + 1, end).trim());
}

/** `pub fn 이름(...) { … }` 의 본문(중괄호 포함) */
function bodyOf(fnName: string): string {
  const at = RUST.indexOf(`pub fn ${fnName}(`);
  expect(at, `Rust 에 \`fn ${fnName}\` 이 없다 — 검사가 낡았다`).toBeGreaterThan(-1);
  const open = RUST.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < RUST.length; i++) {
    if (RUST[i] === "{") depth++;
    else if (RUST[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return RUST.slice(open, i + 1);
}

/**
 * `match` 갈래 하나의 값. `arm` 은 갈래 머리 그대로(`PitchType::Fastball`)이고
 * `"_"` 면 기본 갈래다.
 */
function armOf(fnName: string, arm: string): number {
  for (const line of bodyOf(fnName).split("\n")) {
    const t = line.trim();
    if (!t.startsWith(arm)) continue;
    const arrow = t.indexOf("=>");
    if (arrow < 0) continue;
    let v = t.slice(arrow + 2).trim();
    if (v.endsWith(",")) v = v.slice(0, -1).trim();
    const n = Number(v);
    expect(Number.isFinite(n), `\`${fnName}\` 의 \`${arm}\` 값을 못 읽었다: "${v}"`).toBe(true);
    return n;
  }
  throw new Error(`\`${fnName}\` 에 \`${arm}\` 갈래가 없다 — 검사가 낡았다`);
}

/** 상수 하나로 끝나는 칸 — 「거울의 길」 → 「Rust 상수 이름」 */
const CONSTS: Array<[string, number, string]> = [
  ["staminaBase", DEFAULT_MATCH_ENGINE_TUNING.staminaBase, "STAMINA_BASE"],
  [
    "staminaAggressiveBonus",
    DEFAULT_MATCH_ENGINE_TUNING.staminaAggressiveBonus,
    "STAMINA_AGGRESSIVE_BONUS",
  ],
  [
    "staminaFastballBonus",
    DEFAULT_MATCH_ENGINE_TUNING.staminaFastballBonus,
    "STAMINA_FASTBALL_BONUS",
  ],
  [
    "mentalRecoveryOnInningEnd",
    DEFAULT_MATCH_ENGINE_TUNING.mentalRecoveryOnInningEnd,
    "MENTAL_RECOVERY_INNING_END",
  ],
  [
    "hitUpgradeSingleToDoubleBase",
    DEFAULT_MATCH_ENGINE_TUNING.hitUpgradeSingleToDoubleBase,
    "HIT_UPGRADE_SINGLE_TO_DOUBLE_BASE",
  ],
  [
    "hitUpgradeDoubleToHomeRunBase",
    DEFAULT_MATCH_ENGINE_TUNING.hitUpgradeDoubleToHomeRunBase,
    "HIT_UPGRADE_DOUBLE_TO_HR_BASE",
  ],
  ["doublePlayBaseProb", DEFAULT_MATCH_ENGINE_TUNING.doublePlayBaseProb, "DOUBLE_PLAY_BASE_PROB"],
  ["moundVisitMentalRecovery", DEFAULT_MATCH_ENGINE_TUNING.moundVisitMentalRecovery, "MOUND_VISIT_MENTAL_RECOVERY"], // prettier-ignore
  ["moundVisitStaminaRecovery", DEFAULT_MATCH_ENGINE_TUNING.moundVisitStaminaRecovery, "MOUND_VISIT_STAMINA_RECOVERY"], // prettier-ignore
  ["moundVisitMinPitchGap", DEFAULT_MATCH_ENGINE_TUNING.moundVisitMinPitchGap, "MOUND_VISIT_MIN_PITCH_GAP"], // prettier-ignore
  ["offenseStealModifier", DEFAULT_MATCH_ENGINE_TUNING.offenseStealModifier, "OFFENSE_STEAL_MODIFIER"], // prettier-ignore
  ["dispersionBase", DEFAULT_MATCH_ENGINE_TUNING.dispersionBase, "DISPERSION_BASE"],
  ["dispersionControlScale", DEFAULT_MATCH_ENGINE_TUNING.dispersionControlScale, "DISPERSION_CONTROL_SCALE"], // prettier-ignore
  ["dispersionStaminaScale", DEFAULT_MATCH_ENGINE_TUNING.dispersionStaminaScale, "DISPERSION_STAMINA_SCALE"], // prettier-ignore
  ["dispersionMentalScale", DEFAULT_MATCH_ENGINE_TUNING.dispersionMentalScale, "DISPERSION_MENTAL_SCALE"], // prettier-ignore
  ["shadowZoneHalf", DEFAULT_MATCH_ENGINE_TUNING.shadowZoneHalf, "SHADOW_ZONE_HALF"],
  ["locationCenterPenalty", DEFAULT_MATCH_ENGINE_TUNING.locationCenterPenalty, "LOCATION_CENTER_PENALTY"], // prettier-ignore
  ["locationDistanceScale", DEFAULT_MATCH_ENGINE_TUNING.locationDistanceScale, "LOCATION_DISTANCE_SCALE"], // prettier-ignore
  ["swingMarginBase", DEFAULT_MATCH_ENGINE_TUNING.swingMarginBase, "SWING_MARGIN_BASE"],
  ["swingDisciplineScale", DEFAULT_MATCH_ENGINE_TUNING.swingDisciplineScale, "SWING_DISCIPLINE_SCALE"], // prettier-ignore
  ["swingEyeScale", DEFAULT_MATCH_ENGINE_TUNING.swingEyeScale, "SWING_EYE_SCALE"],
  ["swingFastballBonus", DEFAULT_MATCH_ENGINE_TUNING.swingFastballBonus, "SWING_FASTBALL_BONUS"],
  ["shadowUmpireStrikeProb", DEFAULT_MATCH_ENGINE_TUNING.shadowUmpireStrikeProb, "SHADOW_UMPIRE_STRIKE_PROB"], // prettier-ignore
  // 감독 교체 임계값 여섯
  ["managerChangeThresholds.npcStarterStaminaLimit", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.npcStarterStaminaLimit, "NPC_STARTER_STAMINA_LIMIT"], // prettier-ignore
  ["managerChangeThresholds.npcStarterPitchCountSoft", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.npcStarterPitchCountSoft, "NPC_STARTER_PITCH_COUNT_SOFT"], // prettier-ignore
  ["managerChangeThresholds.npcStarterPitchCountHard", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.npcStarterPitchCountHard, "NPC_STARTER_PITCH_COUNT_HARD"], // prettier-ignore
  ["managerChangeThresholds.protagonistPitchCountSoft", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.protagonistPitchCountSoft, "PROTAGONIST_PITCH_COUNT_SOFT"], // prettier-ignore
  ["managerChangeThresholds.protagonistPitchCountHard", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.protagonistPitchCountHard, "PROTAGONIST_PITCH_COUNT_HARD"], // prettier-ignore
  ["managerChangeThresholds.protagonistStaminaEmergency", DEFAULT_MATCH_ENGINE_TUNING.managerChangeThresholds.protagonistStaminaEmergency, "PROTAGONIST_STAMINA_EMERGENCY"], // prettier-ignore
];

/** `match` 갈래로 끝나는 칸 — 「거울의 길」 → 「Rust fn · 갈래」 */
const ARMS: Array<[string, number, string, string]> = [
  ...(
    [
      ["fastball", "Fastball"],
      ["sinker", "Sinker"],
      ["cutter", "Cutter"],
      ["slider", "Slider"],
      ["curve", "Curve"],
      ["changeup", "Changeup"],
      ["splitter", "Splitter"],
      ["forkball", "Forkball"],
      ["screwball", "Screwball"],
      ["knuckleball", "Knuckleball"],
    ] as const
  ).map(
    ([k, v]) =>
      [
        `pitchBase.${k}`,
        DEFAULT_MATCH_ENGINE_TUNING.pitchBase[k],
        "pitch_base",
        `PitchType::${v}`,
      ] as [string, number, string, string],
  ),
  ["strategyBonus.aggressive", DEFAULT_MATCH_ENGINE_TUNING.strategyBonus.aggressive, "strategy_bonus", "PitchStrategy::Aggressive"], // prettier-ignore
  ["strategyBonus.balanced", DEFAULT_MATCH_ENGINE_TUNING.strategyBonus.balanced, "strategy_bonus", "PitchStrategy::Balanced"], // prettier-ignore
  ["strategyBonus.safe", DEFAULT_MATCH_ENGINE_TUNING.strategyBonus.safe, "strategy_bonus", "PitchStrategy::Safe"], // prettier-ignore
  ["powerBonus.low", DEFAULT_MATCH_ENGINE_TUNING.powerBonus.low, "power_bonus", "PitchPower::Low"], // prettier-ignore
  ["powerBonus.normal", DEFAULT_MATCH_ENGINE_TUNING.powerBonus.normal, "power_bonus", "PitchPower::Normal"], // prettier-ignore
  ["powerBonus.high", DEFAULT_MATCH_ENGINE_TUNING.powerBonus.high, "power_bonus", "PitchPower::High"], // prettier-ignore
  ["staminaPowerCost.low", DEFAULT_MATCH_ENGINE_TUNING.staminaPowerCost.low, "stamina_power_cost", "PitchPower::Low"], // prettier-ignore
  ["staminaPowerCost.normal", DEFAULT_MATCH_ENGINE_TUNING.staminaPowerCost.normal, "stamina_power_cost", "PitchPower::Normal"], // prettier-ignore
  ["staminaPowerCost.high", DEFAULT_MATCH_ENGINE_TUNING.staminaPowerCost.high, "stamina_power_cost", "PitchPower::High"], // prettier-ignore
  // 날씨·구장 — 「그 밖 전부」는 Rust 의 기본 갈래(`_`)다
  ["weatherPowerModifier.windy_in", DEFAULT_MATCH_ENGINE_TUNING.weatherPowerModifier.windy_in, "weather_power_modifier", "WeatherType::WindyIn"], // prettier-ignore
  ["weatherPowerModifier.windy_out", DEFAULT_MATCH_ENGINE_TUNING.weatherPowerModifier.windy_out, "weather_power_modifier", "WeatherType::WindyOut"], // prettier-ignore
  ["weatherPowerModifier.sunny", DEFAULT_MATCH_ENGINE_TUNING.weatherPowerModifier.sunny, "weather_power_modifier", "_"], // prettier-ignore
  ["weatherPowerModifier.cloudy", DEFAULT_MATCH_ENGINE_TUNING.weatherPowerModifier.cloudy, "weather_power_modifier", "_"], // prettier-ignore
  ["weatherPowerModifier.rainy", DEFAULT_MATCH_ENGINE_TUNING.weatherPowerModifier.rainy, "weather_power_modifier", "_"], // prettier-ignore
  ["weatherQualityModifier.windyOut", DEFAULT_MATCH_ENGINE_TUNING.weatherQualityModifier.windyOut, "weather_quality_modifier", "WeatherType::WindyOut"], // prettier-ignore
  ["weatherQualityModifier.windyIn", DEFAULT_MATCH_ENGINE_TUNING.weatherQualityModifier.windyIn, "weather_quality_modifier", "WeatherType::WindyIn"], // prettier-ignore
  ["weatherQualityModifier.cloudy", DEFAULT_MATCH_ENGINE_TUNING.weatherQualityModifier.cloudy, "weather_quality_modifier", "WeatherType::Cloudy"], // prettier-ignore
  ["parkQualityModifier.pitcher_park", DEFAULT_MATCH_ENGINE_TUNING.parkQualityModifier.pitcher_park, "park_quality_modifier", "ParkType::PitcherPark"], // prettier-ignore
  ["parkQualityModifier.hitter_park", DEFAULT_MATCH_ENGINE_TUNING.parkQualityModifier.hitter_park, "park_quality_modifier", "ParkType::HitterPark"], // prettier-ignore
  ["parkQualityModifier.neutral", DEFAULT_MATCH_ENGINE_TUNING.parkQualityModifier.neutral, "park_quality_modifier", "_"], // prettier-ignore
  ["parkQualityModifier.dome", DEFAULT_MATCH_ENGINE_TUNING.parkQualityModifier.dome, "park_quality_modifier", "_"], // prettier-ignore
];

/**
 * Rust 에 짝이 없는 칸 — **이유를 적어야 여기 들어온다.**
 *
 * 이 목록이 있어야 새 칸이 조용히 안 재진 채로 들어오지 않는다(아래 마지막
 * 검사가 「비교했거나 여기 적혀 있거나」를 강제한다).
 */
const NO_RUST_TWIN: Array<[keyof MatchEngineTuning, string]> = [
  ["locationBonus", "Phase A 이후 엔진이 안 쓴다 — 거울 타입에도 `@deprecated` 가 붙어 있다"],
  ["offenseBuntBaseProb", "엔진의 번트는 `SAC_BUNT_ATTEMPT_PROB`(0.074 · 다른 저울)이고 감독 성향 배수로 간다 — 같은 값이 아니다"], // prettier-ignore
];

describe("매치 엔진 거울이 Rust 와 같다", () => {
  it.each(CONSTS)("%s = Rust `%s`", (path, mine, rustName) => {
    expect(mine, `${path} 가 Rust \`${rustName}\` 과 다르다`).toBe(constOf(rustName));
  });

  it.each(ARMS)("%s = Rust `%s` 의 `%s`", (path, mine, fnName, arm) => {
    expect(mine, `${path} 가 Rust \`${fnName}\` 의 \`${arm}\` 과 다르다`).toBe(armOf(fnName, arm));
  });

  /**
   * 비 오는 날 품질은 갈래 안에서 다시 갈린다 —
   * `if t == PitchType::Fastball { -1.0 } else { -3.0 }`.
   */
  it("weatherQualityModifier 의 비 오는 날 둘", () => {
    const body = bodyOf("weather_quality_modifier");
    const at = body.indexOf("if t == PitchType::Fastball");
    expect(at, "Rust 의 비 갈래 모양이 바뀌었다 — 검사가 낡았다").toBeGreaterThan(-1);
    const o1 = body.indexOf("{", at);
    const c1 = body.indexOf("}", o1);
    const o2 = body.indexOf("{", c1);
    const c2 = body.indexOf("}", o2);
    const fastball = Number(body.slice(o1 + 1, c1).trim());
    const breaking = Number(body.slice(o2 + 1, c2).trim());
    expect(Number.isFinite(fastball) && Number.isFinite(breaking)).toBe(true);
    expect(DEFAULT_MATCH_ENGINE_TUNING.weatherQualityModifier.rainyFastball).toBe(fastball);
    expect(DEFAULT_MATCH_ENGINE_TUNING.weatherQualityModifier.rainyBreaking).toBe(breaking);
  });

  /** 값이 안 읽히면 위 검사들이 조용히 `NaN` 을 비교하게 된다 */
  it("읽은 값이 다 숫자다 — 파싱이 헛돌면 안 된다", () => {
    expect(CONSTS.length).toBeGreaterThan(20);
    expect(ARMS.length).toBeGreaterThan(20);
    for (const [, , rustName] of CONSTS) expect(Number.isFinite(constOf(rustName))).toBe(true);
    for (const [, , fnName, arm] of ARMS) expect(Number.isFinite(armOf(fnName, arm))).toBe(true);
  });

  /**
   * 🔴 **새 칸이 조용히 안 재진 채로 들어오지 않게.** 거울의 최상위 칸은
   *   전부 「비교했거나 짝이 없다고 적혀 있거나」여야 한다.
   */
  it("거울의 모든 칸이 재지거나 이유가 적혀 있다", () => {
    const checked = new Set<string>();
    for (const [p] of CONSTS) checked.add(p.split(".")[0]);
    for (const [p] of ARMS) checked.add(p.split(".")[0]);
    for (const [k] of NO_RUST_TWIN) checked.add(k);
    const missing = Object.keys(DEFAULT_MATCH_ENGINE_TUNING).filter((k) => !checked.has(k));
    expect(missing, `안 재는 칸: ${missing.join(" ")}`).toEqual([]);
  });
});
