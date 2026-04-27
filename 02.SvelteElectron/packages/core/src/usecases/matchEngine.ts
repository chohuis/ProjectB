import {
  clamp,
  createBatter,
  createRunner,
  createInitialMatchState,
  type HalfInning,
  type MatchCount,
  type MatchRunners,
  type MatchStartOptions,
  type MatchState,
  type ParkType,
  type PitchLocation,
  type PitchPower,
  type PitchResultCode,
  type PitchStrategy,
  type PitchType,
  type RunnerStats,
  type WeatherType
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
    const outcome: PitchOutcome = { resultCode: "GAME_OVER", quality: 0, comment: "이미 종료된 경기입니다." };
    return { nextState: state, outcome };
  }

  // ── 1. 도루 시도 (투구 전) ─────────────────────────────────────────────────
  const stealResult = attemptSteals(state);
  let preRunners = stealResult.runners;
  let preOuts = stealResult.outs;
  let preInning = state.inning;
  let preHalf: HalfInning = state.half;

  if (preOuts >= 3) {
    preOuts = 0;
    preRunners = { first: null, second: null, third: null };
    if (preHalf === "top") { preHalf = "bottom"; }
    else { preHalf = "top"; preInning += 1; }
  }

  const preState: MatchState = { ...state, runners: preRunners, outs: preOuts, inning: preInning, half: preHalf };

  // ── 2. 투구 결과 결정 ──────────────────────────────────────────────────────
  const quality = calculatePitchQuality(preState, decision);
  let resultCode = applyHitUpgrade(resolvePitchResult(quality), preState.batter.power, preState.weather);

  let nextCount = { ...preState.count };
  let nextOuts = preState.outs;
  let nextRunners: MatchRunners = { ...preState.runners };
  let nextScore = { ...preState.score };
  let nextInning = preState.inning;
  let nextHalf: HalfInning = preState.half;
  const runningLogs: string[] = [];

  if (resultCode === "BALL") {
    nextCount.balls += 1;
    if (nextCount.balls >= 4) {
      resultCode = "WALK";
      nextCount = { balls: 0, strikes: 0 };
      const walkRun = advanceOnWalk(nextRunners, createRunner(preState.batterMean));
      nextRunners = walkRun.runners;
      nextScore = addRuns(nextScore, nextHalf, walkRun.runs);
    }
  } else if (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") {
    nextCount.strikes += 1;
    if (nextCount.strikes >= 3) { nextOuts += 1; nextCount = { balls: 0, strikes: 0 }; }
  } else if (resultCode === "FOUL") {
    if (nextCount.strikes < 2) nextCount.strikes += 1;
  } else if (resultCode === "INPLAY_OUT") {
    nextOuts += 1;
    nextCount = { balls: 0, strikes: 0 };
  } else {
    const hitResult = advanceOnHit(nextRunners, resultCode, createRunner(preState.batterMean));
    nextRunners = hitResult.runners;
    nextScore = addRuns(nextScore, nextHalf, hitResult.runs);
    nextOuts += hitResult.extraOuts;
    nextCount = { balls: 0, strikes: 0 };
    runningLogs.push(...hitResult.logs);
  }

  if (nextOuts >= 3) {
    nextOuts = 0;
    nextCount = { balls: 0, strikes: 0 };
    nextRunners = { first: null, second: null, third: null };
    if (nextHalf === "top") { nextHalf = "bottom"; }
    else { nextHalf = "top"; nextInning += 1; }
  }

  // ── 3. 스태미나/멘탈 계산 ────────────────────────────────────────────────────
  const powerStaminaCost: Record<PitchPower, number> = { low: 0.1, normal: 0.3, high: 0.55 };
  const baseStaminaLoss =
    0.85 +
    (decision.strategy === "aggressive" ? 0.25 : 0) +
    (decision.pitchType === "fastball" ? 0.2 : 0) +
    powerStaminaCost[decision.power];
  const staminaCapFactor = 1 - clamp((preState.pitcher.staminaCap - 55) * 0.005, -0.15, 0.15);
  const staminaLoss = baseStaminaLoss * staminaCapFactor;

  const mentalResilFactor = 1 - clamp((preState.pitcher.mentalResil - 50) * 0.004, -0.15, 0.15);
  const mentalDelta = resolveMentalDelta(resultCode) * mentalResilFactor;
  const nextStamina = clamp(preState.stamina - staminaLoss, 0, 100);
  const nextMental = clamp(preState.mental + mentalDelta, 0, 100);

  // ── 4. 타자 교체 / 패턴 히스토리 ────────────────────────────────────────────
  const isKOut = (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") && preState.count.strikes === 2;
  const abEnded = isKOut || resultCode === "WALK" || resultCode === "INPLAY_OUT" ||
    resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN";
  const nextBatter = abEnded ? createBatter(preState.batterMean) : preState.batter;
  const nextLastPitchTypes = [...preState.lastPitchTypes, decision.pitchType].slice(-5);

  // ── 5. 로그 조합 ──────────────────────────────────────────────────────────
  const pitchLog = buildPitchLog(preState, decision, resultCode, quality);
  const allNewLogs = [...stealResult.stealLogs, pitchLog, ...runningLogs];

  let nextState: MatchState = {
    ...preState,
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
    lastPitchTypes: nextLastPitchTypes,
    logs: [...state.logs, ...allNewLogs]
  };

  if (shouldAutoFinish(nextState)) {
    nextState = { ...nextState, isFinished: true, logs: [...nextState.logs, finishLog(nextState)] };
  }

  const outcome: PitchOutcome = { resultCode, quality, comment: getResultComment(resultCode) };
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

  // 코너(1,3,7,9): 타자가 치기 어려워 투수 유리
  // 엣지(2,4,6,8): 중간
  // 중앙(5): 타자가 가장 치기 쉬워 투수 불리
  const locationBonus: Record<PitchLocation, number> = {
    1: 3,
    2: 0,
    3: 3,
    4: 0,
    5: -4,
    6: 0,
    7: 3,
    8: 0,
    9: 3
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

  // 3단계 보정: 날씨 / 구장 / 투구 패턴
  const weatherMod = weatherQualityModifier(state.weather, decision.pitchType);
  const parkMod = parkQualityModifier(state.park);
  const patternMod = pitchPatternModifier(decision.pitchType, state.lastPitchTypes);

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
      weatherMod +
      parkMod +
      patternMod +
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

function advanceOnWalk(
  runners: MatchRunners,
  newRunner: RunnerStats
): { runners: MatchRunners; runs: number } {
  let runs = 0;
  let { first, second, third } = runners;

  if (first) {
    if (second) {
      if (third) { runs = 1; } // 만루: 3루주자 홈으로
      third = second;
      second = first;
    } else {
      second = first;
    }
  }
  first = newRunner;

  return { runners: { first, second, third }, runs };
}

function advanceOnHit(
  runners: MatchRunners,
  resultCode: PitchResultCode,
  newRunner: RunnerStats
): { runners: MatchRunners; runs: number; extraOuts: number; logs: string[] } {
  const next: MatchRunners = { first: null, second: null, third: null };
  let runs = 0;
  let extraOuts = 0;
  const logs: string[] = [];

  if (resultCode === "HOME_RUN") {
    runs = (runners.first ? 1 : 0) + (runners.second ? 1 : 0) + (runners.third ? 1 : 0) + 1;
    return { runners: next, runs, extraOuts, logs };
  }

  if (resultCode === "HIT_TRIPLE") {
    runs = (runners.first ? 1 : 0) + (runners.second ? 1 : 0) + (runners.third ? 1 : 0);
    next.third = newRunner;
    return { runners: next, runs, extraOuts, logs };
  }

  if (resultCode === "HIT_DOUBLE") {
    if (runners.third) runs += 1;
    if (runners.second) runs += 1;
    if (runners.first) {
      const r = runners.first;
      const result = tryExtraBase(r, "1st_scores_double");
      if (result === "advance") {
        runs += 1;
        logs.push(`적극 주루! 1루 주자 홈인 (스피드 ${r.speed})`);
      } else if (result === "out") {
        extraOuts += 1;
        logs.push(`주루 아웃! 1루 주자 홈 태그아웃 (스피드 ${r.speed})`);
      } else {
        next.third = r;
      }
    }
    next.second = newRunner;
    return { runners: next, runs, extraOuts, logs };
  }

  if (resultCode === "HIT_SINGLE") {
    if (runners.third) runs += 1;

    if (runners.second) {
      const r = runners.second;
      const result = tryExtraBase(r, "2nd_scores_single");
      if (result === "advance") {
        runs += 1;
        logs.push(`적극 주루! 2루 주자 홈인 (스피드 ${r.speed})`);
      } else if (result === "out") {
        extraOuts += 1;
        logs.push(`주루 아웃! 2루 주자 홈 태그아웃 (스피드 ${r.speed})`);
      } else {
        next.third = r;
      }
    }

    if (runners.first) {
      const r = runners.first;
      if (!next.third) {
        const result = tryExtraBase(r, "1st_to_3rd_single");
        if (result === "advance") {
          next.third = r;
          logs.push(`적극 주루! 1루 주자 3루까지 (스피드 ${r.speed})`);
        } else if (result === "out") {
          extraOuts += 1;
          logs.push(`주루 아웃! 1루 주자 3루 태그아웃 (스피드 ${r.speed})`);
        } else {
          next.second = r;
        }
      } else {
        next.second = r;
      }
    }

    next.first = newRunner;
    return { runners: next, runs, extraOuts, logs };
  }

  return { runners: { ...runners }, runs: 0, extraOuts: 0, logs: [] };
}

// 여분 베이스 시도 결과: advance(성공) | stop(시도 안 함/안전 정지) | out(태그아웃)
function tryExtraBase(
  runner: RunnerStats,
  context: "1st_to_3rd_single" | "2nd_scores_single" | "1st_scores_double"
): "advance" | "stop" | "out" {
  const configs = {
    "1st_to_3rd_single": { attemptBase: 0.20, successBase: 0.72 },
    "2nd_scores_single": { attemptBase: 0.35, successBase: 0.63 },
    "1st_scores_double": { attemptBase: 0.30, successBase: 0.58 },
  } as const;

  const { attemptBase, successBase } = configs[context];
  const speedMod = (runner.speed - 50) * 0.005;
  const instinctMod = (runner.instinct - 50) * 0.003;

  const attemptProb = clamp(attemptBase + speedMod + instinctMod, 0.02, 0.75);
  if (Math.random() >= attemptProb) return "stop";

  const successProb = clamp(successBase + speedMod, 0.15, 0.95);
  return Math.random() < successProb ? "advance" : "out";
}

// 도루 시도 (투구 직전 자동 판정)
function attemptSteals(
  state: MatchState
): { runners: MatchRunners; outs: number; stealLogs: string[] } {
  let { first, second, third } = state.runners;
  let outs = state.outs;
  const stealLogs: string[] = [];

  // 1루→2루 도루: 1루주자 있고 2루 비어있음
  if (first && !second) {
    const r = first;
    const attemptProb = clamp((r.speed - 40) * 0.008 * (r.instinct / 50), 0, 0.28);
    if (Math.random() < attemptProb) {
      const successRate = clamp(0.28 + (r.speed - 50) * 0.007, 0.15, 0.90);
      if (Math.random() < successRate) {
        second = r;
        first = null;
        stealLogs.push(`도루 성공! 1루→2루 (스피드 ${r.speed})`);
      } else {
        first = null;
        outs += 1;
        stealLogs.push(`도루 실패! 1루 주자 아웃 (스피드 ${r.speed})`);
      }
    }
  }

  // 2루→3루 도루: 2루주자 있고 3루 비어있음 (발 빠른 주자만 시도)
  if (second && !third && second.speed > 68) {
    const r = second;
    const attemptProb = clamp((r.speed - 58) * 0.006 * (r.instinct / 55), 0, 0.14);
    if (Math.random() < attemptProb) {
      const successRate = clamp(0.22 + (r.speed - 65) * 0.008, 0.10, 0.78);
      if (Math.random() < successRate) {
        third = r;
        second = null;
        stealLogs.push(`도루 성공! 2루→3루 (스피드 ${r.speed})`);
      } else {
        second = null;
        outs += 1;
        stealLogs.push(`도루 실패! 2루 주자 아웃 (스피드 ${r.speed})`);
      }
    }
  }

  return { runners: { first, second, third }, outs, stealLogs };
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
  // 끝내기: 규정 이닝 이후 말 공격에서 홈팀이 앞서는 순간 즉시 종료
  if (state.half === "bottom" && state.inning >= state.inningLimit && state.score.home > state.score.away) {
    return true;
  }
  // 이닝 전환 후 규정 이닝 초과 + 점수차 있으면 종료
  if (state.inning > state.inningLimit && state.score.home !== state.score.away) {
    return true;
  }
  return false;
}

function finishLog(state: MatchState): string {
  if (state.half === "bottom" && state.inning >= state.inningLimit && state.score.home > state.score.away) {
    return "끝내기!";
  }
  return "규정 이닝 종료";
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

function applyHitUpgrade(code: PitchResultCode, power: number, weather: WeatherType): PitchResultCode {
  if (code !== "HIT_SINGLE" && code !== "HIT_DOUBLE") return code;
  const powerFactor = (power - 50) / 50; // -1 ~ +1
  const windBonus = weatherPowerModifier(weather);
  if (code === "HIT_SINGLE") {
    if (Math.random() < Math.max(0, 0.15 + powerFactor * 0.10 + windBonus)) return "HIT_DOUBLE";
  }
  if (code === "HIT_DOUBLE") {
    if (Math.random() < Math.max(0, 0.05 + powerFactor * 0.08 + windBonus)) return "HOME_RUN";
  }
  return code;
}

function weatherQualityModifier(weather: WeatherType, pitchType: PitchType): number {
  switch (weather) {
    case "rainy":
      // 비: 그립 불안정 → 변화구 -3, 패스트볼 -1
      return pitchType === "fastball" ? -1 : -3;
    case "windy_out":
      // 외야 방향 바람: 투수 불리 (-2)
      return -2;
    case "windy_in":
      // 내야 방향 바람: 공이 가라앉음 → 투수 유리 (+2)
      return 2;
    case "cloudy":
      return -0.5;
    case "sunny":
    default:
      return 0;
  }
}

function weatherPowerModifier(weather: WeatherType): number {
  switch (weather) {
    case "windy_out": return 0.10;  // 바람 타고 장타 업그레이드 +10%
    case "windy_in":  return -0.10; // 역풍으로 장타 억제 -10%
    default:          return 0;
  }
}

function parkQualityModifier(park: ParkType): number {
  switch (park) {
    case "pitcher_park": return 3;   // 넓은 파울존, 깊은 외야 → 투수 유리
    case "hitter_park":  return -3;  // 짧은 펜스, 좁은 파울존 → 타자 유리
    default:             return 0;
  }
}

function pitchPatternModifier(pitchType: PitchType, lastPitches: PitchType[]): number {
  if (lastPitches.length === 0) return 0;

  // 직전부터 거꾸로 같은 구종 연속 카운트
  let consecutive = 0;
  for (let i = lastPitches.length - 1; i >= 0; i--) {
    if (lastPitches[i] === pitchType) consecutive++;
    else break;
  }
  if (consecutive >= 3) return -4; // 3구 연속: 패턴 완전히 읽힘
  if (consecutive >= 2) return -2; // 2구 연속: 패턴 노출
  if (consecutive >= 1) return -1; // 1구 연속: 미세 손해

  // 최근 3구에 없던 구종: 기습 효과
  if (!lastPitches.slice(-3).includes(pitchType)) return 1;
  return 0;
}

function buildPitchLog(state: MatchState, decision: PitchDecision, resultCode: PitchResultCode, quality: number): string {
  return `[${state.inning}회${state.half === "top" ? "초" : "말"}] ${decision.pitchType} Z${decision.location} ${decision.strategy}/${decision.power} -> ${resultCode} (Q:${quality.toFixed(1)})`;
}

function buildSummary(state: MatchState): string {
  return `${state.score.away}:${state.score.home} 종료 (투구수 ${state.pitchCount}, 체력 ${state.stamina.toFixed(1)}, 멘탈 ${state.mental.toFixed(1)})`;
}
