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

  // ── 감독 교체 판단 임계값 ────────────────────────────────────────────────────
  managerChangeThresholds: {
    npcStarterStaminaLimit: number;   // NPC 선발 즉시 교체 체력 임계값
    npcStarterPitchCountSoft: number; // NPC 선발 교체 검토 시작 투구수
    npcStarterPitchCountHard: number; // NPC 선발 강제 교체 투구수
    protagonistPitchCountSoft: number;// 주인공 교체 검토 시작 투구수
    protagonistPitchCountHard: number;// 주인공 강제 교체 투구수 (절대 한도)
    protagonistStaminaEmergency: number; // 주인공 긴급 강판 체력 임계값
  };

  // ── 마운드 방문 효과 ────────────────────────────────────────────────────────
  moundVisitMentalRecovery: number;  // 방문당 멘탈 회복 기본량 (motivator 배율 적용 전)
  moundVisitStaminaRecovery: number; // 방문당 체력 소폭 회복량
  moundVisitMinPitchGap: number;     // 방문 간 최소 투구수 간격

  // ── 공격 전술 확률 ──────────────────────────────────────────────────────────
  offenseBuntBaseProb: number;       // 번트 기본 시도 확률 (offenseMind 보정 전)
  offenseStealModifier: number;      // 도루 시도율 감독 보정 계수
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
    rainyFastball: -1, rainyBreaking: -3,
    windyOut: -2, windyIn: 2, cloudy: -0.5,
  },
  parkQualityModifier: { neutral: 0, pitcher_park: 3, hitter_park: -3, dome: 0 },
  doublePlayBaseProb: 0.4,

  managerChangeThresholds: {
    npcStarterStaminaLimit: 25,
    npcStarterPitchCountSoft: 80,
    npcStarterPitchCountHard: 110,
    protagonistPitchCountSoft: 90,
    protagonistPitchCountHard: 120,
    protagonistStaminaEmergency: 5,
  },

  moundVisitMentalRecovery: 8,
  moundVisitStaminaRecovery: 3,
  moundVisitMinPitchGap: 6,

  offenseBuntBaseProb: 0.25,
  offenseStealModifier: 0.006,
};

let activeMatchEngineTuning: MatchEngineTuning = JSON.parse(JSON.stringify(DEFAULT_MATCH_ENGINE_TUNING));

export function getMatchEngineTuning(): MatchEngineTuning {
  return activeMatchEngineTuning;
}

export function setMatchEngineTuning(next: MatchEngineTuning): void {
  activeMatchEngineTuning = JSON.parse(JSON.stringify(next));
}
