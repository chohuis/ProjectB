import {
  clamp,
  createBatter,
  createInitialMatchState,
  type HalfInning,
  type MatchCount,
  type MatchRunners,
  type MatchStartOptions,
  type MatchState,
  type PitchLocation,
  type PitchPower,
  type PitchResultCode,
  type PitchStrategy,
  type PitchType
} from "../domain/matchState";

export interface PitchDecision {
  pitchType: PitchType;
  location: PitchLocation;
  strategy: PitchStrategy;
  power: PitchPower;
}

export interface PitchOutcome {
  resultCode: PitchResultCode;
  quality: number;
  comment: string;
}

export interface MatchStepResult {
  nextState: MatchState;
  outcome: PitchOutcome;
}

export function startMatch(options: MatchStartOptions = {}): MatchState {
  return createInitialMatchState(options);
}

export function finishMatch(state: MatchState): { nextState: MatchState; summary: string } {
  if (state.isFinished) {
    return { nextState: state, summary: buildSummary(state) };
  }

  const nextState: MatchState = {
    ...state,
    isFinished: true,
    logs: [...state.logs, "경기 종료"]
  };

  return { nextState, summary: buildSummary(nextState) };
}

export function stepPitch(state: MatchState, decision: PitchDecision): MatchStepResult {
  if (state.isFinished) {
    const outcome: PitchOutcome = {
      resultCode: "GAME_OVER",
      quality: 0,
      comment: "이미 종료된 경기입니다."
    };
    return { nextState: state, outcome };
  }

  const quality = calculatePitchQuality(state, decision);
  let resultCode = applyBatterPower(resolvePitchResult(quality), state.batter.power);

  let nextCount = { ...state.count };
  let nextOuts = state.outs;
  let nextRunners: MatchRunners = { ...state.runners };
  let nextScore = { ...state.score };
  let nextInning = state.inning;
  let nextHalf: HalfInning = state.half;

  if (resultCode === "BALL") {
    nextCount.balls += 1;
    if (nextCount.balls >= 4) {
      resultCode = "WALK";
      nextCount = { balls: 0, strikes: 0 };
      const walkRun = advanceOnWalk(nextRunners);
      nextRunners = walkRun.runners;
      nextScore = addRuns(nextScore, nextHalf, walkRun.runs);
    }
  } else if (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") {
    nextCount.strikes += 1;
    if (nextCount.strikes >= 3) {
      nextOuts += 1;
      nextCount = { balls: 0, strikes: 0 };
    }
  } else if (resultCode === "FOUL") {
    if (nextCount.strikes < 2) {
      nextCount.strikes += 1;
    }
  } else if (resultCode === "INPLAY_OUT") {
    nextOuts += 1;
    nextCount = { balls: 0, strikes: 0 };
  } else {
    const hitResult = advanceOnHit(nextRunners, resultCode);
    nextRunners = hitResult.runners;
    nextScore = addRuns(nextScore, nextHalf, hitResult.runs);
    nextCount = { balls: 0, strikes: 0 };
  }

  if (nextOuts >= 3) {
    nextOuts = 0;
    nextCount = { balls: 0, strikes: 0 };
    nextRunners = { first: false, second: false, third: false };
    if (nextHalf === "top") {
      nextHalf = "bottom";
    } else {
      nextHalf = "top";
      nextInning += 1;
    }
  }

  const powerStaminaCost: Record<PitchPower, number> = { low: 0.1, normal: 0.3, high: 0.55 };
  const baseStaminaLoss =
    0.85 +
    (decision.strategy === "aggressive" ? 0.25 : 0) +
    (decision.pitchType === "fastball" ? 0.2 : 0) +
    powerStaminaCost[decision.power];
  // 체력 내구(staminaCap)가 높을수록 소모율 감소 (±15% 범위)
  const staminaCapFactor = 1 - clamp((state.pitcher.staminaCap - 55) * 0.005, -0.15, 0.15);
  const staminaLoss = baseStaminaLoss * staminaCapFactor;

  // 멘탈 회복력(mentalResil)이 높을수록 멘탈 진폭 완화 (±15% 범위)
  const mentalResilFactor = 1 - clamp((state.pitcher.mentalResil - 50) * 0.004, -0.15, 0.15);
  const mentalDelta = resolveMentalDelta(resultCode) * mentalResilFactor;
  const nextStamina = clamp(state.stamina - staminaLoss, 0, 100);
  const nextMental = clamp(state.mental + mentalDelta, 0, 100);

  // AB 종료 여부 판정 (타자 교체 트리거)
  const isKOut =
    (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") &&
    state.count.strikes === 2;
  const abEnded =
    isKOut ||
    resultCode === "WALK" ||
    resultCode === "INPLAY_OUT" ||
    resultCode === "HIT_SINGLE" ||
    resultCode === "HIT_DOUBLE" ||
    resultCode === "HIT_TRIPLE" ||
    resultCode === "HOME_RUN";
  const nextBatter = abEnded ? createBatter(state.batterMean) : state.batter;

  let nextState: MatchState = {
    ...state,
    inning: nextInning,
    half: nextHalf,
    outs: nextOuts,
    count: nextCount,
    runners: nextRunners,
    score: nextScore,
    pitchCount: state.pitchCount + 1,
    stamina: Number(nextStamina.toFixed(1)),
    mental: Number(nextMental.toFixed(1)),
    batter: nextBatter,
    logs: [...state.logs, buildPitchLog(state, decision, resultCode, quality)]
  };

  if (shouldAutoFinish(nextState)) {
    nextState = {
      ...nextState,
      isFinished: true,
      logs: [...nextState.logs, "규정 이닝 종료"]
    };
  }

  const outcome: PitchOutcome = {
    resultCode,
    quality,
    comment: getResultComment(resultCode)
  };

  return { nextState, outcome };
}

function calculatePitchQuality(state: MatchState, decision: PitchDecision): number {
  const pitchBase: Record<PitchType, number> = {
    fastball: 63,
    slider: 60,
    curve: 58,
    changeup: 57
  };

  const strategyBonus: Record<PitchStrategy, number> = {
    aggressive: 2,
    balanced: 0,
    safe: -2
  };

  const powerBonus: Record<PitchPower, number> = {
    low: -1.5,
    normal: 0,
    high: 2.8
  };

  const locationBonus: Record<PitchLocation, number> = {
    1: 2,
    2: 1,
    3: 2,
    4: 1,
    5: 4,
    6: 1,
    7: 2,
    8: 1,
    9: 2
  };

  // command: 제구력 → 로케이션 정확도 + 기본 제구 보정
  const commandBonus = (state.pitcher.command - 50) * 0.10;
  // velocity: 구속 → 패스트볼 집중 보정, 변화구 소폭
  const velocityBonus =
    decision.pitchType === "fastball"
      ? (state.pitcher.velocity - 50) * 0.12
      : (state.pitcher.velocity - 50) * 0.03;

  // 타자 페널티: 컨택이 높을수록 투구 유효성 감소, 선구안이 높을수록 볼 판단력 향상
  const contactPenalty = (state.batter.contact - 50) * 0.10;
  const eyePenalty = (state.batter.eye - 50) * 0.06;
  const batterPenalty = contactPenalty + eyePenalty;

  // 볼카운트 보정: 투수/타자 유리 상황에 따른 Quality 조정
  const countMod = countModifier(state.count);
  // 풀카운트(3-2): 추가 분산으로 긴장감 표현
  const fullCountNoise =
    state.count.balls === 3 && state.count.strikes === 2
      ? Math.random() * 6 - 3
      : 0;

  const staminaPenalty = Math.max(0, (50 - state.stamina) * 0.18);
  const mentalBonus = (state.mental - 50) * 0.08;
  const randomNoise = Math.random() * 16 - 8;

  return Number(
    (
      pitchBase[decision.pitchType] +
      strategyBonus[decision.strategy] +
      powerBonus[decision.power] +
      locationBonus[decision.location] +
      commandBonus +
      velocityBonus +
      countMod +
      fullCountNoise -
      batterPenalty +
      mentalBonus -
      staminaPenalty +
      randomNoise
    ).toFixed(2)
  );
}

function resolvePitchResult(quality: number): PitchResultCode {
  const roll = Math.random();

  if (quality >= 72) {
    if (roll < 0.52) return "STRIKE_SWING";
    if (roll < 0.82) return "STRIKE_LOOK";
    if (roll < 0.92) return "FOUL";
    return "BALL";
  }

  if (quality >= 60) {
    if (roll < 0.36) return "STRIKE_LOOK";
    if (roll < 0.58) return "STRIKE_SWING";
    if (roll < 0.78) return "FOUL";
    return "BALL";
  }

  if (quality >= 52) {
    if (roll < 0.24) return "STRIKE_LOOK";
    if (roll < 0.44) return "FOUL";
    if (roll < 0.72) return "INPLAY_OUT";
    return "BALL";
  }

  if (quality >= 45) {
    if (roll < 0.16) return "FOUL";
    if (roll < 0.44) return "INPLAY_OUT";
    if (roll < 0.8) return "HIT_SINGLE";
    return "BALL";
  }

  if (quality >= 38) {
    if (roll < 0.2) return "INPLAY_OUT";
    if (roll < 0.62) return "HIT_SINGLE";
    if (roll < 0.9) return "HIT_DOUBLE";
    return "BALL";
  }

  if (quality >= 32) {
    if (roll < 0.18) return "INPLAY_OUT";
    if (roll < 0.45) return "HIT_SINGLE";
    if (roll < 0.8) return "HIT_DOUBLE";
    return "HIT_TRIPLE";
  }

  if (roll < 0.25) return "BALL";
  if (roll < 0.58) return "HIT_SINGLE";
  if (roll < 0.82) return "HIT_DOUBLE";
  if (roll < 0.92) return "HIT_TRIPLE";
  return "HOME_RUN";
}

function advanceOnWalk(runners: MatchRunners): { runners: MatchRunners; runs: number } {
  let runs = 0;
  const next = { ...runners };

  if (next.first && next.second && next.third) {
    runs += 1;
  }

  next.third = next.third || next.second;
  next.second = next.second || next.first;
  next.first = true;

  return { runners: next, runs };
}

function advanceOnHit(runners: MatchRunners, resultCode: PitchResultCode): { runners: MatchRunners; runs: number } {
  const next = { first: false, second: false, third: false };
  let runs = 0;

  if (resultCode === "HOME_RUN") {
    runs += (runners.first ? 1 : 0) + (runners.second ? 1 : 0) + (runners.third ? 1 : 0) + 1;
    return { runners: next, runs };
  }

  if (resultCode === "HIT_TRIPLE") {
    runs += (runners.first ? 1 : 0) + (runners.second ? 1 : 0) + (runners.third ? 1 : 0);
    next.third = true;
    return { runners: next, runs };
  }

  if (resultCode === "HIT_DOUBLE") {
    runs += (runners.second ? 1 : 0) + (runners.third ? 1 : 0);
    next.third = runners.first;
    next.second = true;
    return { runners: next, runs };
  }

  if (resultCode === "HIT_SINGLE") {
    runs += runners.third ? 1 : 0;
    next.third = runners.second;
    next.second = runners.first;
    next.first = true;
    return { runners: next, runs };
  }

  return { runners: { ...runners }, runs: 0 };
}

function addRuns(score: { home: number; away: number }, half: HalfInning, runs: number): { home: number; away: number } {
  if (runs <= 0) return score;
  if (half === "top") {
    return { ...score, away: score.away + runs };
  }
  return { ...score, home: score.home + runs };
}

function resolveMentalDelta(resultCode: PitchResultCode): number {
  switch (resultCode) {
    case "STRIKE_LOOK":
    case "STRIKE_SWING":
      return 0.5;
    case "INPLAY_OUT":
      return 0.8;
    case "BALL":
      return -0.4;
    case "FOUL":
      return -0.1;
    case "WALK":
      return -0.9;
    case "HIT_SINGLE":
      return -1.0;
    case "HIT_DOUBLE":
      return -1.4;
    case "HIT_TRIPLE":
      return -1.8;
    case "HOME_RUN":
      return -2.4;
    default:
      return 0;
  }
}

function shouldAutoFinish(state: MatchState): boolean {
  if (state.inning <= state.inningLimit) {
    return false;
  }
  return state.score.home !== state.score.away;
}

function getResultComment(resultCode: PitchResultCode): string {
  switch (resultCode) {
    case "STRIKE_SWING":
      return "헛스윙 스트라이크";
    case "STRIKE_LOOK":
      return "루킹 스트라이크";
    case "BALL":
      return "볼";
    case "FOUL":
      return "파울";
    case "INPLAY_OUT":
      return "타구 아웃";
    case "WALK":
      return "볼넷";
    case "HIT_SINGLE":
      return "안타";
    case "HIT_DOUBLE":
      return "2루타";
    case "HIT_TRIPLE":
      return "3루타";
    case "HOME_RUN":
      return "홈런";
    case "GAME_OVER":
      return "경기 종료";
    default:
      return "결과 없음";
  }
}

function countModifier(count: MatchCount): number {
  const { balls: b, strikes: s } = count;
  if (s === 2 && b === 0) return 5;   // 0-2: 투수 절대 유리
  if (s === 2 && b === 1) return 3;   // 1-2: 투수 유리
  if (s === 2 && b === 2) return 2;   // 2-2: 약간 투수 유리
  if (b === 3 && s === 0) return -8;  // 3-0: 타자 절대 유리 (투수 스트라이크 필요)
  if (b === 3 && s === 1) return -5;  // 3-1: 타자 유리
  // 3-2는 fullCountNoise로 처리, 여기선 0
  return 0;
}

function applyBatterPower(code: PitchResultCode, power: number): PitchResultCode {
  if (code !== "HIT_SINGLE" && code !== "HIT_DOUBLE") return code;
  const powerFactor = (power - 50) / 50; // -1 ~ +1
  if (code === "HIT_SINGLE") {
    // 강타자: 단타 일부가 2루타로 업그레이드 (기본 15%, 파워에 따라 ±10%)
    if (Math.random() < Math.max(0, 0.15 + powerFactor * 0.10)) return "HIT_DOUBLE";
  }
  if (code === "HIT_DOUBLE") {
    // 강타자: 2루타 일부가 홈런으로 업그레이드 (기본 5%, 파워에 따라 ±8%)
    if (Math.random() < Math.max(0, 0.05 + powerFactor * 0.08)) return "HOME_RUN";
  }
  return code;
}

function buildPitchLog(state: MatchState, decision: PitchDecision, resultCode: PitchResultCode, quality: number): string {
  return `[${state.inning}회${state.half === "top" ? "초" : "말"}] ${decision.pitchType} Z${decision.location} ${decision.strategy}/${decision.power} -> ${resultCode} (Q:${quality.toFixed(1)})`;
}

function buildSummary(state: MatchState): string {
  return `${state.score.away}:${state.score.home} 종료 (투구수 ${state.pitchCount}, 체력 ${state.stamina.toFixed(1)}, 멘탈 ${state.mental.toFixed(1)})`;
}
