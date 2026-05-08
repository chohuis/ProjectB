export interface MatchEngineTuning {
  pitchBase: Record<"fastball" | "sinker" | "cutter" | "slider" | "curve" | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball", number>;
  strategyBonus: Record<"aggressive" | "balanced" | "safe", number>;
  powerBonus: Record<"low" | "normal" | "high", number>;
  locationBonus: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>;
  staminaBase: number;
  staminaAggressiveBonus: number;
  staminaFastballBonus: number;
  staminaPowerCost: Record<"low" | "normal" | "high", number>;
  mentalRecoveryOnInningEnd: number;
  hitUpgradeSingleToDoubleBase: number;
  hitUpgradeDoubleToHomeRunBase: number;
  weatherPowerModifier: Record<"sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out", number>;
  weatherQualityModifier: {
    rainyFastball: number;
    rainyBreaking: number;
    windyOut: number;
    windyIn: number;
    cloudy: number;
  };
  parkQualityModifier: Record<"neutral" | "pitcher_park" | "hitter_park" | "dome", number>;
  doublePlayBaseProb: number;
}

export const DEFAULT_MATCH_ENGINE_TUNING: MatchEngineTuning = {
  pitchBase: {
    fastball: 63, sinker: 61, cutter: 60,
    slider: 60, curve: 58,
    changeup: 57, splitter: 58, forkball: 57,
    screwball: 56, knuckleball: 54,
  },
  strategyBonus: { aggressive: 2, balanced: 0, safe: -2 },
  powerBonus: { low: -1.5, normal: 0, high: 2.8 },
  locationBonus: { 1: 3, 2: 0, 3: 3, 4: 0, 5: -4, 6: 0, 7: 3, 8: 0, 9: 3 },
  staminaBase: 0.85,
  staminaAggressiveBonus: 0.25,
  staminaFastballBonus: 0.2,
  staminaPowerCost: { low: 0.1, normal: 0.3, high: 0.55 },
  mentalRecoveryOnInningEnd: 1.5,
  hitUpgradeSingleToDoubleBase: 0.15,
  hitUpgradeDoubleToHomeRunBase: 0.05,
  weatherPowerModifier: { sunny: 0, cloudy: 0, rainy: 0, windy_in: -0.1, windy_out: 0.1 },
  weatherQualityModifier: {
    rainyFastball: -1,
    rainyBreaking: -3,
    windyOut: -2,
    windyIn: 2,
    cloudy: -0.5,
  },
  parkQualityModifier: { neutral: 0, pitcher_park: 3, hitter_park: -3, dome: 0 },
  doublePlayBaseProb: 0.4,
};

let activeMatchEngineTuning: MatchEngineTuning = JSON.parse(JSON.stringify(DEFAULT_MATCH_ENGINE_TUNING));

export function getMatchEngineTuning(): MatchEngineTuning {
  return activeMatchEngineTuning;
}

export function setMatchEngineTuning(next: MatchEngineTuning): void {
  activeMatchEngineTuning = JSON.parse(JSON.stringify(next));
}
