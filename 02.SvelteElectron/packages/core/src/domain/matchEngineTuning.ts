/**
 * 매치 엔진 튜닝 — **이 파일은 Rust 정본의 거울이다.**
 *
 * 정본은 `packages/engine-native/src/tuning.rs` 하나다. 엔진은 그 상수만 읽고,
 * **JS 에서 값을 넣는 길은 없다**(napi 에 튜닝 setter 가 없다 · 실측
 * 2026-09-30). 여기 있는 값은 **화면이 읽는 몫**이다 — 지금은 경기 화면의
 * 투구 스태미나 소모 표시(`utils/pitchCost.ts`)가 쓴다.
 *
 * 🔴 **정본이 셋이었다** (2026-09-30 전수). Rust · 이 거울 ·
 *   `resource/data/master/balance/match_engine_tuning.json` 셋이 같은 표를
 *   들고 있었고, JSON 은 **넉 달 전 값**이었다(`pitchBase 63/60/58/57` ·
 *   4구종 · Rust 는 10구종 52.5~57.5). 그 JSON 을 `setMatchEngineTuning` 이
 *   먹였지만 **읽는 코드가 0** 이라 엔진에는 한 방울도 안 갔고, 화면은
 *   그 JSON 의 스태미나 값을 읽어 **엔진의 두 배**를 보여 주고 있었다
 *   (`staminaBase 0.85` 대 Rust `0.45`).
 *   그래서 JSON 과 `set/getMatchEngineTuning` 을 지웠다 — 남은 것은
 *   **정본 하나 + 거울 하나**다.
 *
 * ⚠ **거울이 Rust 와 같은지는 기계가 본다** —
 *   `apps/ui/src/shared/utils/__tests__/matchTuningMirror.test.ts` 가
 *   `tuning.rs` 를 읽어 대조한다. 손으로 한쪽만 고치면 그 검사가 빨강이다.
 */
export interface MatchEngineTuning {
  pitchBase: Record<
    | "fastball"
    | "sinker"
    | "cutter"
    | "slider"
    | "curve"
    | "changeup"
    | "splitter"
    | "forkball"
    | "screwball"
    | "knuckleball",
    number
  >;
  strategyBonus: Record<"aggressive" | "balanced" | "safe", number>;
  powerBonus: Record<"low" | "normal" | "high", number>;
  /** @deprecated Phase A 이후 사용 안 함. locationCenterPenalty / locationDistanceScale 로 대체 */
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
    npcStarterStaminaLimit: number; // NPC 선발 즉시 교체 체력 임계값
    npcStarterPitchCountSoft: number; // NPC 선발 교체 검토 시작 투구수
    npcStarterPitchCountHard: number; // NPC 선발 강제 교체 투구수
    protagonistPitchCountSoft: number; // 주인공 교체 검토 시작 투구수
    protagonistPitchCountHard: number; // 주인공 강제 교체 투구수 (절대 한도)
    protagonistStaminaEmergency: number; // 주인공 긴급 강판 체력 임계값
  };

  // ── 마운드 방문 효과 ────────────────────────────────────────────────────────
  moundVisitMentalRecovery: number; // 방문당 멘탈 회복 기본량 (motivator 배율 적용 전)
  moundVisitStaminaRecovery: number; // 방문당 체력 소폭 회복량
  moundVisitMinPitchGap: number; // 방문 간 최소 투구수 간격

  // ── 공격 전술 확률 ──────────────────────────────────────────────────────────
  offenseBuntBaseProb: number; // 번트 기본 시도 확률 (offenseMind 보정 전)
  offenseStealModifier: number; // 도루 시도율 감독 보정 계수

  // ── Phase A: 착탄 분산 시스템 (Gaussian) ─────────────────────────────────────
  dispersionBase: number; // control=50 기준 σ (스트라이크존 반폭 단위)
  dispersionControlScale: number; // control 1pt당 σ 감소량
  dispersionStaminaScale: number; // stamina 50 이하 1pt당 σ 증가량
  dispersionMentalScale: number; // mental  50 이하 1pt당 σ 증가량
  shadowZoneHalf: number; // 경계선 shadow zone 반폭
  locationCenterPenalty: number; // 중심(dist=0) 기준 quality 패널티
  locationDistanceScale: number; // dist 1 단위당 quality 보너스

  // ── Phase B: 타자 스윙 결정 ──────────────────────────────────────────────────
  swingMarginBase: number; // discipline=50 기준 스윙존 마진 (스트라이크존 밖)
  swingDisciplineScale: number; // discipline 1pt당 마진 감소량
  swingEyeScale: number; // eye 1pt당 마진 감소량
  swingFastballBonus: number; // fastball 추가 마진 (반응시간 부족)
  shadowUmpireStrikeProb: number; // shadow zone 심판 스트라이크 콜 확률
}

export const DEFAULT_MATCH_ENGINE_TUNING: MatchEngineTuning = {
  // ⚠ **정본은 `packages/engine-native/src/tuning.rs pitch_base` 다.** 여기는
  //   그 거울이고, 이 파일 머리말이 「Rust 값과 동기」라고 못박고 있다 —
  //   한쪽만 고치면 이 프로젝트가 여러 번 당한 「표가 둘」이 된다.
  //   폭 9 → 5 (2026-09-27 · 결정 ⑤ · 평균 54.4 불변 · 근거는 Rust 쪽 주석).
  //   창 52~57 → 52.5~57.5 (2026-09-28 · 결정 ⑤ 수준 중립 · 폭 5 그대로 · 전부
  //   +0.5). +1 은 지나쳤다 — 근거는 Rust 쪽 주석.
  pitchBase: {
    fastball: 57.5,
    sinker: 56.5,
    cutter: 56,
    slider: 56,
    curve: 54.5,
    changeup: 54,
    splitter: 54.5,
    forkball: 54,
    screwball: 53.5,
    knuckleball: 52.5,
  },
  strategyBonus: { aggressive: 2, balanced: 0, safe: -2 },
  powerBonus: { low: -1.5, normal: 0, high: 2.8 },
  locationBonus: { 1: 3, 2: 0, 3: 3, 4: 0, 5: -4, 6: 0, 7: 3, 8: 0, 9: 3 },
  staminaBase: 0.45,
  staminaAggressiveBonus: 0.12,
  staminaFastballBonus: 0.1,
  staminaPowerCost: { low: 0.05, normal: 0.15, high: 0.3 },
  mentalRecoveryOnInningEnd: 1.5,
  hitUpgradeSingleToDoubleBase: 0.18,
  hitUpgradeDoubleToHomeRunBase: 0.22,
  weatherPowerModifier: { sunny: 0, cloudy: 0, rainy: 0, windy_in: -0.1, windy_out: 0.1 },
  weatherQualityModifier: {
    rainyFastball: -1,
    rainyBreaking: -3,
    windyOut: -2,
    windyIn: 2,
    cloudy: -0.5,
  },
  parkQualityModifier: { neutral: 0, pitcher_park: 3, hitter_park: -3, dome: 0 },
  doublePlayBaseProb: 0.22,

  managerChangeThresholds: {
    npcStarterStaminaLimit: 35,
    npcStarterPitchCountSoft: 65,
    npcStarterPitchCountHard: 110,
    protagonistPitchCountSoft: 90,
    protagonistPitchCountHard: 120,
    // 🔴 **거울이 어긋나 있었다** (2026-09-30 실측 · 새 검사가 잡았다). Rust
    //   `PROTAGONIST_STAMINA_EMERGENCY` 는 **15** 다 — 2026-08-13 에 35 에서
    //   내려온 값이고(「NPC와 같은 기준」이라던 35 가 NPC 의 어떤 값과도
    //   대응하지 않았다) 여기만 5 로 남아 있었다. 엔진 동작은 안 바뀐다 —
    //   이 거울을 읽는 자리는 화면의 투구 소모 표시뿐이고 이 칸은 안 쓴다.
    protagonistStaminaEmergency: 15,
  },

  moundVisitMentalRecovery: 8,
  moundVisitStaminaRecovery: 3,
  moundVisitMinPitchGap: 6,

  offenseBuntBaseProb: 0.25,
  offenseStealModifier: 0.006,

  dispersionBase: 0.15,
  dispersionControlScale: 0.003,
  dispersionStaminaScale: 0.002,
  dispersionMentalScale: 0.001,
  shadowZoneHalf: 0.2,
  locationCenterPenalty: -4.0,
  locationDistanceScale: 5.0,

  swingMarginBase: 0.18,
  swingDisciplineScale: 0.003,
  swingEyeScale: 0.002,
  swingFastballBonus: 0.08,
  shadowUmpireStrikeProb: 0.45,
};

// ⚠ **`get`/`setMatchEngineTuning` 과 `activeMatchEngineTuning` 을 2026-09-30에
//   지웠다.** 넣은 값을 읽는 코드가 **0** 이었다 — 엔진은 Rust 상수만 보고
//   (`napi` 에 튜닝 setter 가 없다), `getMatchEngineTuning` 호출부도 0 이었다.
//   부팅 때 `apps/desktop/ipc/tuning.cjs applyTuningFromFile` 이 마스터 JSON 을
//   읽어 여기 심는 것이 유일한 손이었고, 심은 값은 아무도 안 읽었다.
//   「값을 파일로 바꿀 수 있다」는 주석이 **네 곳**에 적혀 있었지만 사실이
//   아니었다. 되살리려면 Rust 쪽에 받는 자리를 먼저 만든다 — 그게 없으면
//   또 「층마다 맞는데 잇는 선이 없는」 꼴이다.
