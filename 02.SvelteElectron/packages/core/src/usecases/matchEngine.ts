import {
  clamp,
  createBatter,
  createRunner,
  createInitialMatchState,
  FIELDER_DEFAULT_POSITIONS,
  type AnimationCue,
  type BallHitType,
  type BallInPlay,
  type BatterStats,
  type FieldPosition,
  type FielderStats,
  type FieldingResult,
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
  type PitcherStats,
  type RunnerStats,
  type WeatherType
} from "../domain/matchState";
import { getMatchEngineTuning } from "../domain/matchEngineTuning";

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
  ballInPlay?: BallInPlay;
  fieldingResult?: FieldingResult;
  animationCues: AnimationCue[];
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
    const outcome: PitchOutcome = { resultCode: "GAME_OVER", quality: 0, comment: "이미 종료된 경기입니다.", animationCues: [] };
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
  let resultCode = applyHitUpgrade(resolvePitchResult(quality, decision), preState.batter.power, preState.weather);
  const ballInPlay = resolveBallInPlay(resultCode, decision, quality);

  // ── Phase 4: 수비 처리 (INPLAY_OUT 케이스에서만) ───────────────────────────
  let fieldingResult: FieldingResult | undefined;
  if (ballInPlay && resultCode === "INPLAY_OUT") {
    const fd = resolveFieldingResult(ballInPlay, preState.fielders);
    fieldingResult = fd.fieldingResult;
    resultCode = fd.adjustedResultCode;
  }

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
      const walkRun = advanceOnWalk(nextRunners, createRunner(preState.batter));
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
    // 병살타: 0아웃/1아웃 + 1루 주자 있을 때 확률적으로 더블플레이
    const gidpResult = tryDoublePlay(nextRunners, preState.outs);
    if (gidpResult.isDoublePlay) {
      nextOuts += 1;
      nextRunners = gidpResult.runners;
      runningLogs.push("병살타!");
    }
  } else if (resultCode === "FIELDING_ERROR") {
    // 실책: 아웃 없음 — 타자 1루 출루, 기존 주자 진루
    nextCount = { balls: 0, strikes: 0 };
    const errResult = advanceOnHit(nextRunners, "HIT_SINGLE", createRunner(preState.batter));
    nextRunners = errResult.runners;
    nextScore = addRuns(nextScore, nextHalf, errResult.runs);
    nextOuts += errResult.extraOuts;
    const errName = fieldingResult?.fielder.name ?? "수비수";
    runningLogs.push(`실책! (${errName})`);
  } else {
    const hitResult = advanceOnHit(nextRunners, resultCode, createRunner(preState.batter));
    nextRunners = hitResult.runners;
    nextScore = addRuns(nextScore, nextHalf, hitResult.runs);
    nextOuts += hitResult.extraOuts;
    nextCount = { balls: 0, strikes: 0 };
    runningLogs.push(...hitResult.logs);
  }

  // defenseStat 업데이트
  const nextDefenseStat = { ...preState.defenseStat };
  if (fieldingResult) {
    if (fieldingResult.isError) {
      nextDefenseStat.errors += 1;
    } else {
      if (fieldingResult.throwResult === "out") {
        nextDefenseStat.throwOuts += 1;
        nextDefenseStat.assists += 1;
      } else if (fieldingResult.throwResult === "safe") {
        nextDefenseStat.throwSafes += 1;
      }
    }
  }

  if (nextOuts >= 3) {
    nextOuts = 0;
    nextCount = { balls: 0, strikes: 0 };
    nextRunners = { first: null, second: null, third: null };
    if (nextHalf === "top") { nextHalf = "bottom"; }
    else { nextHalf = "top"; nextInning += 1; }
  }

  // ── 3. 스태미나/멘탈 계산 ────────────────────────────────────────────────────
  const tuning = getMatchEngineTuning();
  const powerStaminaCost: Record<PitchPower, number> = tuning.staminaPowerCost;
  const baseStaminaLoss =
    tuning.staminaBase +
    (decision.strategy === "aggressive" ? tuning.staminaAggressiveBonus : 0) +
    (decision.pitchType === "fastball" ? tuning.staminaFastballBonus : 0) +
    powerStaminaCost[decision.power];
  const staminaCapFactor = 1 - clamp((preState.pitcher.staminaCap - 55) * 0.005, -0.15, 0.15);
  // 비선형 피로: 스태미나 40 미만부터 감소 가속 (최대 2배)
  const fatigueMult = preState.stamina < 40 ? 1 + (40 - preState.stamina) * 0.025 : 1;
  const staminaLoss = baseStaminaLoss * staminaCapFactor * fatigueMult;

  const mentalResilFactor = 1 - clamp((preState.pitcher.mentalResil - 50) * 0.004, -0.15, 0.15);
  const rawMentalDelta = resolveMentalDelta(resultCode) * mentalResilFactor;
  // 이닝 전환(아웃3개로 리셋됐을 때) 멘탈 소폭 회복
  const inningChangedThisPitch = nextOuts === 0 && preState.outs > 0;
  const mentalRecovery = inningChangedThisPitch ? tuning.mentalRecoveryOnInningEnd : 0;
  const mentalDelta = rawMentalDelta + mentalRecovery;
  const nextStamina = clamp(preState.stamina - staminaLoss, 0, 100);
  const nextMental = clamp(preState.mental + mentalDelta, 0, 100);

  // ── 4. 타자 교체 / 패턴 히스토리 ────────────────────────────────────────────
  const isKOut = (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") && preState.count.strikes === 2;
  const abEnded = isKOut || resultCode === "WALK" || resultCode === "INPLAY_OUT" || resultCode === "FIELDING_ERROR" ||
    resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE" || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN";
  let nextBatter: BatterStats = preState.batter;
  let nextLineupIndex = preState.lineupIndex;
  if (abEnded) {
    nextLineupIndex = (preState.lineupIndex + 1) % preState.opponentLineup.length;
    nextBatter = { ...preState.opponentLineup[nextLineupIndex] };
  }
  const nextLastPitchTypes = [...preState.lastPitchTypes, decision.pitchType].slice(-5);

  // ── 5. 로그 조합 ──────────────────────────────────────────────────────────
  const pitchLog = buildPitchLog(preState, decision, resultCode, quality);
  const allNewLogs = [...stealResult.stealLogs, pitchLog, ...runningLogs];

  // ── 6. AnimationCue 생성 ──────────────────────────────────────────────────
  const animationCues = buildAnimationCues({
    decision,
    resultCode,
    ballInPlay,
    fieldingResult,
    preRunners: preState.runners,
  });

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
    lineupIndex: nextLineupIndex,
    lastPitchTypes: nextLastPitchTypes,
    defenseStat: nextDefenseStat,
    logs: [...state.logs, ...allNewLogs]
  };

  if (shouldAutoFinish(nextState)) {
    nextState = { ...nextState, isFinished: true, logs: [...nextState.logs, finishLog(nextState)] };
  }

  const outcome: PitchOutcome = { resultCode, quality, comment: getResultComment(resultCode), ballInPlay, fieldingResult, animationCues };
  return { nextState, outcome };
}

function calculatePitchQuality(state: MatchState, decision: PitchDecision): number {
  const tuning = getMatchEngineTuning();
  const pitchBase: Record<PitchType, number> = tuning.pitchBase;
  const strategyBonus: Record<PitchStrategy, number> = tuning.strategyBonus;
  const powerBonus: Record<PitchPower, number> = tuning.powerBonus;

  // 코너(1,3,7,9): 타자가 치기 어려워 투수 유리
  // 엣지(2,4,6,8): 중간
  // 중앙(5): 타자가 가장 치기 쉬워 투수 불리
  const locationBonus: Record<PitchLocation, number> = tuning.locationBonus;

  // command: 제구력 → 로케이션 정확도 + 기본 제구 보정
  const commandBonus = (state.pitcher.command - 50) * 0.10;
  // velocity: 구속 → 패스트볼 집중 보정, 변화구 소폭
  const velocityBonus =
    decision.pitchType === "fastball"
      ? (state.pitcher.velocity - 50) * 0.12
      : (state.pitcher.velocity - 50) * 0.03;
  // control: 제구 → 볼카운트가 투수 불리할수록 control 가치 상승
  const controlBonus = (state.pitcher.control - 50) * 0.06;
  // movement: 변화구에서만 추가 quality 보정
  const movementBonus =
    decision.pitchType !== "fastball"
      ? (state.pitcher.movement - 50) * 0.08
      : 0;

  // 타자 페널티: 컨택이 높을수록 투구 유효성 감소, 선구안이 높을수록 볼 판단력 향상
  const contactPenalty = (state.batter.contact - 50) * 0.10;
  const eyePenalty = (state.batter.eye - 50) * 0.06;
  // discipline: 높을수록 헛스윙(STRIKE_SWING) 유도가 어려워짐 → quality 소폭 페널티
  const disciplinePenalty = (state.batter.discipline - 50) * 0.04;
  // platoon: 반대 손 투수 상대 시 페널티 (현재 matchState는 손 정보 없으므로 중립 처리)
  // 향후 투수 handedness 추가 시 활성화; 지금은 platoon 50 기준 보정 없음
  const batterPenalty = contactPenalty + eyePenalty + disciplinePenalty;

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
  // 상황 압박: 득점권 주자 + 아웃 수에 따른 quality 분산 증가 (평균은 유지, 변동폭 확대)
  const jamMod = jamPressureModifier(state);
  // 이닝 압박: 후반 접전일수록 멘탈 영향 증폭
  const clutchMod = clutchModifier(state);

  return Number(
    (
      pitchBase[decision.pitchType] +
      strategyBonus[decision.strategy] +
      powerBonus[decision.power] +
      locationBonus[decision.location] +
      commandBonus +
      velocityBonus +
      controlBonus +
      movementBonus +
      countMod +
      fullCountNoise -
      batterPenalty +
      mentalBonus -
      staminaPenalty +
      weatherMod +
      parkMod +
      patternMod +
      jamMod +
      clutchMod +
      randomNoise
    ).toFixed(2)
  );
}

function resolvePitchResult(quality: number, decision: PitchDecision): PitchResultCode {
  const roll = Math.random();
  const base = resolveBaseResult(quality, roll);
  if (base === "STRIKE") return resolveStrikeType(decision, roll);
  return base;
}

function resolveBaseResult(quality: number, roll: number): PitchResultCode | "STRIKE" {
  if (quality >= 72) {
    if (roll < 0.82) return "STRIKE";
    if (roll < 0.92) return "FOUL";
    return "BALL";
  }
  if (quality >= 60) {
    if (roll < 0.58) return "STRIKE";
    if (roll < 0.78) return "FOUL";
    return "BALL";
  }
  if (quality >= 52) {
    if (roll < 0.24) return "STRIKE";
    if (roll < 0.44) return "FOUL";
    if (roll < 0.72) return "INPLAY_OUT";
    return "BALL";
  }
  if (quality >= 45) {
    if (roll < 0.16) return "FOUL";
    if (roll < 0.44) return "INPLAY_OUT";
    if (roll < 0.80) return "HIT_SINGLE";
    return "BALL";
  }
  if (quality >= 38) {
    if (roll < 0.20) return "INPLAY_OUT";
    if (roll < 0.62) return "HIT_SINGLE";
    if (roll < 0.90) return "HIT_DOUBLE";
    return "BALL";
  }
  if (quality >= 32) {
    if (roll < 0.18) return "INPLAY_OUT";
    if (roll < 0.45) return "HIT_SINGLE";
    if (roll < 0.80) return "HIT_DOUBLE";
    return "HIT_TRIPLE";
  }
  if (roll < 0.25) return "BALL";
  if (roll < 0.58) return "HIT_SINGLE";
  if (roll < 0.82) return "HIT_DOUBLE";
  if (roll < 0.92) return "HIT_TRIPLE";
  return "HOME_RUN";
}

// LOOK/SWING: 구종·로케이션에 따라 차별화
// 변화구·코너 → LOOK 비율 높음 (타자가 체크)
// 패스트볼·중앙 → SWING 비율 높음 (타자가 속아 스윙)
function resolveStrikeType(decision: PitchDecision, roll: number): "STRIKE_LOOK" | "STRIKE_SWING" {
  const isCorner = [1, 3, 7, 9].includes(decision.location);
  const isFastball = decision.pitchType === "fastball";
  const isBreaking = decision.pitchType === "curve" || decision.pitchType === "changeup";

  let lookProb = 0.50;
  if (isCorner)              lookProb += 0.15;
  if (isBreaking)            lookProb += 0.12;
  if (isFastball)            lookProb -= 0.18;
  if (decision.location === 5) lookProb -= 0.10;

  return roll < clamp(lookProb, 0.15, 0.85) ? "STRIKE_LOOK" : "STRIKE_SWING";
}

// ── Phase 3: Ball-in-play 탐지 엔진 ───────────────────────────────────────────

const INPLAY_CODES = new Set<PitchResultCode>(["INPLAY_OUT", "FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]);

function resolveBallInPlay(
  resultCode: PitchResultCode,
  decision: PitchDecision,
  quality: number
): BallInPlay | undefined {
  if (!INPLAY_CODES.has(resultCode)) return undefined;
  const hitType = resolveHitType(resultCode, decision, quality);
  const zone    = resolveZone(hitType, decision.location);
  const hardness = resolveHardness(resultCode, decision, quality);
  return { hitType, zone, hardness };
}

function resolveHitType(
  resultCode: PitchResultCode,
  decision: PitchDecision,
  quality: number
): BallHitType {
  // 번트: safe 전략 + low 파워
  if (decision.strategy === "safe" && decision.power === "low") return "bunt";

  // 홈런: 항상 flyBall
  if (resultCode === "HOME_RUN") return "flyBall";
  // 3루타: 갭 타구 — flyBall 또는 lineDrive
  if (resultCode === "HIT_TRIPLE") return Math.random() < 0.70 ? "flyBall" : "lineDrive";
  // 2루타: 직선 또는 뜬공
  if (resultCode === "HIT_DOUBLE") return Math.random() < 0.55 ? "lineDrive" : "flyBall";

  // 내야 플라이: quality 높을 때(실투 아님) INPLAY_OUT 중 30% 확률
  if (resultCode === "INPLAY_OUT" && quality >= 60 && Math.random() < 0.30) return "popup";

  // 투구 종류별 타구 경향
  const gbPitches = new Set<PitchType>(["sinker", "cutter", "slider"]);
  const fbPitches = new Set<PitchType>(["changeup", "curve", "forkball", "screwball", "knuckleball"]);
  const roll = Math.random();

  if (gbPitches.has(decision.pitchType)) {
    if (roll < 0.68) return "groundBall";
    if (roll < 0.85) return "lineDrive";
    return "flyBall";
  }
  if (fbPitches.has(decision.pitchType)) {
    if (roll < 0.15) return "groundBall";
    if (roll < 0.48) return "lineDrive";
    return "flyBall";
  }
  // fastball / splitter: 균형
  if (roll < 0.38) return "groundBall";
  if (roll < 0.68) return "lineDrive";
  return "flyBall";
}

function resolveZone(hitType: BallHitType, location: PitchLocation): FieldPosition {
  // 투수 시점: 좌(1,4,7)=타자 당겨치기→우측방향, 우(3,6,9)=밀어치기→좌측방향, 중(2,5,8)=센터
  const isLeft   = (location === 1 || location === 4 || location === 7);
  const isRight  = (location === 3 || location === 6 || location === 9);

  if (hitType === "bunt") {
    const zones: FieldPosition[] = ["P", "C", "1B", "3B"];
    return zones[Math.floor(Math.random() * zones.length)];
  }
  if (hitType === "popup") {
    const zones: FieldPosition[] = ["C", "1B", "2B", "3B", "SS"];
    return zones[Math.floor(Math.random() * zones.length)];
  }
  if (hitType === "groundBall") {
    if (isLeft)  return Math.random() < 0.52 ? "3B" : "SS";
    if (isRight) return Math.random() < 0.55 ? "1B" : "2B";
    return Math.random() < 0.50 ? "SS" : "2B";
  }
  if (hitType === "flyBall") {
    if (isLeft)  return Math.random() < 0.72 ? "RF" : "CF";
    if (isRight) return Math.random() < 0.72 ? "LF" : "CF";
    const r = Math.random();
    return r < 0.60 ? "CF" : r < 0.80 ? "LF" : "RF";
  }
  // lineDrive: 내야~외야 혼합
  if (isLeft)  return Math.random() < 0.45 ? "1B" : "RF";
  if (isRight) return Math.random() < 0.45 ? "3B" : "LF";
  return Math.random() < 0.45 ? "2B" : "CF";
}

function resolveHardness(
  resultCode: PitchResultCode,
  decision: PitchDecision,
  quality: number
): 1 | 2 | 3 | 4 | 5 {
  let base: number;
  switch (resultCode) {
    case "HOME_RUN":    base = 5.0; break;
    case "HIT_TRIPLE":  base = 4.2; break;
    case "HIT_DOUBLE":  base = 3.5; break;
    case "HIT_SINGLE":  base = 2.8; break;
    default:            base = 2.0; // INPLAY_OUT, FIELDING_ERROR
  }

  if (decision.power === "high") base += 0.5;
  if (decision.power === "low")  base -= 0.5;

  // 낮은 quality = 실투 = 더 강하게 맞음
  if (quality < 40) base += 0.5;
  if (quality < 32) base += 0.5;

  base += (Math.random() - 0.5) * 1.2; // ±0.6 노이즈
  return clamp(Math.round(base), 1, 5) as 1 | 2 | 3 | 4 | 5;
}

// ── Phase 4: 수비 처리 엔진 ───────────────────────────────────────────────────

function calcErrorProb(ballInPlay: BallInPlay, fielder: FielderStats): number {
  const baseByHitType: Record<BallHitType, number> = {
    popup:      0.04,
    bunt:       0.08,
    flyBall:    0.06,
    groundBall: 0.11,
    lineDrive:  0.09,
  };
  let prob = baseByHitType[ballInPlay.hitType];
  // 강한 타구일수록 실책 확률 증가
  prob += (ballInPlay.hardness - 3) * 0.025;
  // fielding 능력치 보정
  prob -= (fielder.fielding - 50) * 0.003;
  return clamp(prob, 0.01, 0.40);
}

function makeDefaultFielder(position: FieldPosition): FielderStats {
  return { position, name: position, fielding: 50, arm: 50, speed: 50, x: 50, y: 50 };
}

function resolveFieldingResult(
  ballInPlay: BallInPlay,
  fielders: FielderStats[],
): { fieldingResult: FieldingResult; adjustedResultCode: PitchResultCode } {
  const fielder = fielders.find(f => f.position === ballInPlay.zone) ?? makeDefaultFielder(ballInPlay.zone);

  const isError = Math.random() < calcErrorProb(ballInPlay, fielder);

  let threwTo: FieldPosition | undefined;
  let throwResult: "out" | "safe" | undefined;
  let adjustedResultCode: PitchResultCode = isError ? "FIELDING_ERROR" : "INPLAY_OUT";

  if (!isError) {
    // 땅볼·라인드라이브·번트: 1루 송구 필요 (1루수 본인이면 제외)
    const needsThrow = ballInPlay.hitType === "groundBall"
      || ballInPlay.hitType === "lineDrive"
      || ballInPlay.hitType === "bunt";
    if (needsThrow && ballInPlay.zone !== "1B") {
      threwTo = "1B";
      const armMod = (fielder.arm - 50) * 0.004;
      const hardnessPenalty = (ballInPlay.hardness - 3) * 0.02;
      const successProb = clamp(0.88 + armMod - hardnessPenalty, 0.45, 0.97);
      throwResult = Math.random() < successProb ? "out" : "safe";
      if (throwResult === "safe") adjustedResultCode = "FIELDING_ERROR";
    }
    // flyBall·popup·1루수 직접처리: 송구 없이 아웃
  }

  return {
    fieldingResult: {
      fielder,
      isError,
      threwTo,
      throwResult,
      runnerExtraAdvance: isError ? 1 : 0,
    },
    adjustedResultCode,
  };
}

// ── Phase 5: AnimationCue 생성 시스템 ────────────────────────────────────────

// 0-100 좌표계 내 주요 지점
const MOUND_POS  = { x: 50, y: 62 } as const;
const HOME_POS   = { x: 50, y: 88 } as const;
const BASE_POS = {
  "1B":  { x: 78, y: 70 },
  "2B":  { x: 50, y: 52 },
  "3B":  { x: 22, y: 70 },
  "home": { x: 50, y: 88 },
} as const;

function getResultTone(code: PitchResultCode): "good" | "bad" | "neutral" {
  switch (code) {
    case "STRIKE_SWING": case "STRIKE_LOOK": case "INPLAY_OUT": return "good";
    case "HIT_SINGLE": case "HIT_DOUBLE": case "HIT_TRIPLE":
    case "HOME_RUN":   case "WALK":       case "FIELDING_ERROR": return "bad";
    default: return "neutral";
  }
}

function battedDuration(hitType: BallHitType): number {
  switch (hitType) {
    case "bunt":      return 280;
    case "popup":     return 520;
    case "groundBall": return 380;
    case "lineDrive": return 330;
    case "flyBall":   return 680;
  }
}

function battedArc(hitType: BallHitType): number {
  switch (hitType) {
    case "popup":     return 0.85;
    case "flyBall":   return 0.60;
    case "lineDrive": return 0.15;
    case "groundBall": return 0.05;
    case "bunt":      return 0.08;
  }
}

function buildRunnerAdvanceCues(code: PitchResultCode, pre: MatchRunners): AnimationCue[] {
  const cues: AnimationCue[] = [];

  const push = (id: "batter" | "first" | "second" | "third", base: "1B" | "2B" | "3B" | "home", ms: number) =>
    cues.push({ type: "runner_advance", runnerId: id, toBase: base, duration: ms });

  if (code === "HOME_RUN") {
    push("batter", "home", 600);
    if (pre.third)  push("third",  "home", 380);
    if (pre.second) push("second", "home", 460);
    if (pre.first)  push("first",  "home", 540);
  } else if (code === "HIT_TRIPLE") {
    push("batter", "3B", 580);
    if (pre.third)  push("third",  "home", 360);
    if (pre.second) push("second", "home", 440);
    if (pre.first)  push("first",  "home", 520);
  } else if (code === "HIT_DOUBLE") {
    push("batter", "2B", 520);
    if (pre.third)  push("third",  "home", 360);
    if (pre.second) push("second", "home", 440);
    if (pre.first)  push("first",  "3B",   520);
  } else if (code === "HIT_SINGLE" || code === "FIELDING_ERROR") {
    push("batter", "1B", 440);
    if (pre.third)  push("third",  "home", 320);
    if (pre.second) push("second", "3B",   400);
    if (pre.first)  push("first",  "2B",   480);
  } else if (code === "WALK") {
    push("batter", "1B", 380);
    if (pre.first)  push("first",  "2B",   420);
    if (pre.first && pre.second) push("second", "3B", 460);
    if (pre.first && pre.second && pre.third) push("third", "home", 380);
  }

  return cues;
}

function buildAnimationCues(params: {
  decision:      PitchDecision;
  resultCode:    PitchResultCode;
  ballInPlay?:   BallInPlay;
  fieldingResult?: FieldingResult;
  preRunners:    MatchRunners;
}): AnimationCue[] {
  const { decision, resultCode, ballInPlay, fieldingResult, preRunners } = params;
  const cues: AnimationCue[] = [];

  // 1. 투구 궤적 (항상)
  const pitchDuration = decision.power === "high" ? 240 : decision.power === "low" ? 340 : 290;
  cues.push({ type: "ball_pitch", from: { ...MOUND_POS }, to: { ...HOME_POS }, duration: pitchDuration });

  if (!ballInPlay) {
    // 2a. 비인플레이: 결과 오버레이만
    cues.push({ type: "show_result", text: getResultComment(resultCode), tone: getResultTone(resultCode), x: 50, y: 50 });
    return cues;
  }

  // 2b. 인플레이: 타구 궤적
  const zonePos = { ...FIELDER_DEFAULT_POSITIONS[ballInPlay.zone] };
  const arc     = battedArc(ballInPlay.hitType);
  const bDur    = battedDuration(ballInPlay.hitType);
  cues.push({ type: "ball_batted", from: { ...HOME_POS }, to: zonePos, arc, hitType: ballInPlay.hitType, duration: bDur });

  // 3. 수비수 이동 (타구 방향으로)
  cues.push({ type: "fielder_move", position: ballInPlay.zone, to: zonePos, duration: Math.round(bDur * 0.85) });

  // 4. 송구 궤적 (있을 때)
  if (fieldingResult?.threwTo) {
    const throwTo = { ...FIELDER_DEFAULT_POSITIONS[fieldingResult.threwTo] };
    const throwDur = Math.round(200 + (100 - (fieldingResult.fielder.arm ?? 50)) * 1.2);
    cues.push({ type: "ball_throw", from: zonePos, to: throwTo, duration: throwDur });
  }

  // 5. 주자 이동
  cues.push(...buildRunnerAdvanceCues(resultCode, preRunners));

  // 6. 결과 표시
  const resultText = resultCode === "FIELDING_ERROR"
    ? `실책! (${fieldingResult?.fielder.name ?? ""})`
    : getResultComment(resultCode);
  cues.push({ type: "show_result", text: resultText, tone: getResultTone(resultCode), x: 50, y: 40 });

  return cues;
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

  // holdRunners: 투수 견제력 — 도루 시도율 억제 (50 기준, 높을수록 억제)
  const holdFactor = clamp(1 - (state.pitcher.holdRunners - 50) * 0.008, 0.4, 1.6);

  // 1루→2루 도루: 1루주자 있고 2루 비어있음
  if (first && !second) {
    const r = first;
    const attemptProb = clamp((r.speed - 40) * 0.008 * (r.instinct / 50) * holdFactor, 0, 0.28);
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
    const attemptProb = clamp((r.speed - 58) * 0.006 * (r.instinct / 55) * holdFactor, 0, 0.14);
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
    case "FIELDING_ERROR":
      return -1.2;
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
    case "FIELDING_ERROR":
      return "실책";
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
  const tuning = getMatchEngineTuning();
  if (code !== "HIT_SINGLE" && code !== "HIT_DOUBLE") return code;
  const powerFactor = (power - 50) / 50; // -1 ~ +1
  const windBonus = weatherPowerModifier(weather);
  if (code === "HIT_SINGLE") {
    if (Math.random() < Math.max(0, tuning.hitUpgradeSingleToDoubleBase + powerFactor * 0.10 + windBonus)) return "HIT_DOUBLE";
  }
  if (code === "HIT_DOUBLE") {
    if (Math.random() < Math.max(0, tuning.hitUpgradeDoubleToHomeRunBase + powerFactor * 0.08 + windBonus)) return "HOME_RUN";
  }
  return code;
}

function weatherQualityModifier(weather: WeatherType, pitchType: PitchType): number {
  const tuning = getMatchEngineTuning();
  switch (weather) {
    case "rainy":
      // 비: 그립 불안정 → 변화구 -3, 패스트볼 -1
      return pitchType === "fastball" ? tuning.weatherQualityModifier.rainyFastball : tuning.weatherQualityModifier.rainyBreaking;
    case "windy_out":
      // 외야 방향 바람: 투수 불리 (-2)
      return tuning.weatherQualityModifier.windyOut;
    case "windy_in":
      // 내야 방향 바람: 공이 가라앉음 → 투수 유리 (+2)
      return tuning.weatherQualityModifier.windyIn;
    case "cloudy":
      return tuning.weatherQualityModifier.cloudy;
    case "sunny":
    default:
      return 0;
  }
}

function weatherPowerModifier(weather: WeatherType): number {
  const tuning = getMatchEngineTuning();
  return tuning.weatherPowerModifier[weather] ?? 0;
}

function parkQualityModifier(park: ParkType): number {
  const tuning = getMatchEngineTuning();
  return tuning.parkQualityModifier[park] ?? 0;
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

// 병살타 판정: 0~1아웃 + 1루 주자 있을 때 확률적으로 더블플레이
function tryDoublePlay(
  runners: MatchRunners,
  outsBeforePlay: number
): { isDoublePlay: boolean; runners: MatchRunners } {
  // 2아웃이면 병살 불가
  if (outsBeforePlay >= 2) return { isDoublePlay: false, runners };
  // 1루 주자 없으면 병살 불가
  if (!runners.first) return { isDoublePlay: false, runners };

  // 기본 병살 확률 40% (실제 MLB 평균과 유사)
  // 주자가 많을수록(만루 등) 소폭 증가
  const tuning = getMatchEngineTuning();
  const baseProb = tuning.doublePlayBaseProb + (runners.second ? 0.05 : 0) + (runners.third ? 0.03 : 0);
  if (Math.random() >= baseProb) return { isDoublePlay: false, runners };

  // 병살 성립: 1루 주자 아웃, 주자들 한 베이스씩 전진
  const next: MatchRunners = {
    first: null,
    second: runners.first,  // 원래 1루주자가 2루로 (실제로는 아웃이지만 다른 주자 밀어냄)
    third: runners.second ?? runners.third
  };
  // 실제로는 1루주자가 아웃되고 타자도 아웃: 남은 주자들은 그대로
  return {
    isDoublePlay: true,
    runners: { first: null, second: runners.second, third: runners.third }
  };
}

// 상황 압박: 득점권 주자(2루/3루) + 2아웃 시 quality 추가 노이즈 (투수에게 불리한 방향)
// battingClutch가 높은 타자는 득점권에서 추가 저항력 발휘 (압박 가중)
function jamPressureModifier(state: MatchState): number {
  const hasScoringPosition = !!(state.runners.second || state.runners.third);
  const isTwoOut = state.outs === 2;
  if (!hasScoringPosition) return 0;

  // 득점권 주자 있을 때 기본 압박 -1
  let pressure = -1;
  // 2아웃 + 득점권: 집중 압박 추가 -1
  if (isTwoOut) pressure -= 1;
  // 만루: 최대 압박 -1 추가
  if (state.runners.first && state.runners.second && state.runners.third) pressure -= 1;

  // 멘탈이 낮을수록 압박에 더 취약 (멘탈 30 미만 시 추가 -1.5)
  if (state.mental < 30) pressure -= 1.5;
  else if (state.mental < 50) pressure -= 0.5;

  // battingClutch: 타자가 득점권에서 강할수록 투수 추가 압박 (최대 ±1)
  pressure -= (state.batter.battingClutch - 50) * 0.02;

  return pressure;
}

// 이닝 압박: 후반부 접전일수록 투수에게 추가 부담
// clutch 스탯이 높으면 압박 감소폭이 작아짐 (위기에 강함)
function clutchModifier(state: MatchState): number {
  const inningRatio = state.inning / state.inningLimit; // 0~1+
  if (inningRatio < 0.67) return 0; // 전반부는 영향 없음

  const scoreDiff = Math.abs(state.score.home - state.score.away);
  if (scoreDiff > 3) return 0; // 4점 차 이상 대세 결정 → 압박 없음

  // 후반 + 접전: 점수차가 좁을수록, 이닝이 늦을수록 압박 증가
  const inningPressure = (inningRatio - 0.67) * 6; // 최대 ~2
  const scorePressure = Math.max(0, (3 - scoreDiff) * 0.5); // 0~1.5
  const rawPressure = -(inningPressure + scorePressure) * 0.8;

  // clutch 스탯: 50 기준, 높을수록 압박 완화 (최대 ±40%)
  const clutchFactor = 1 - clamp((state.pitcher.clutch - 50) * 0.008, -0.3, 0.3);
  return rawPressure * clutchFactor;
}

function buildPitchLog(state: MatchState, decision: PitchDecision, resultCode: PitchResultCode, quality: number): string {
  return `[${state.inning}회${state.half === "top" ? "초" : "말"}] ${decision.pitchType} Z${decision.location} ${decision.strategy}/${decision.power} -> ${resultCode} (Q:${quality.toFixed(1)})`;
}

function buildSummary(state: MatchState): string {
  return `${state.score.away}:${state.score.home} 종료 (투구수 ${state.pitchCount}, 체력 ${state.stamina.toFixed(1)}, 멘탈 ${state.mental.toFixed(1)})`;
}

// ── 자동 경기 시뮬레이터 ────────────────────────────────────────────────────
export interface GameSummary {
  homeScore: number;
  awayScore: number;
  strikeouts: number;
  hits: number;
  walks: number;
}

const CORNERS: PitchLocation[] = [1, 3, 7, 9];
const EDGES:   PitchLocation[] = [2, 4, 6, 8];
const AUTO_TYPES: PitchType[] = ["fastball", "fastball", "slider", "changeup"];

function autoPickDecision(state: MatchState): PitchDecision {
  const { balls, strikes } = state.count;
  if (balls >= 3) {
    return { pitchType: "fastball", location: EDGES[Math.floor(Math.random() * 4)], strategy: "safe", power: "normal" };
  }
  if (strikes === 2) {
    return { pitchType: "slider", location: CORNERS[Math.floor(Math.random() * 4)], strategy: "aggressive", power: "normal" };
  }
  const all = [...CORNERS, ...EDGES] as PitchLocation[];
  return {
    pitchType: AUTO_TYPES[Math.floor(Math.random() * AUTO_TYPES.length)],
    location:  all[Math.floor(Math.random() * all.length)],
    strategy: "balanced",
    power: "normal",
  };
}

/**
 * 주인공 투수 스탯 기반 1경기 자동 시뮬.
 * homeScore = 주인공 팀 득점(타선 추정), awayScore = 상대 득점(주인공 허용).
 */
export function runSimpleGame(
  pitcher: Partial<PitcherStats>,
  opponentOvr: number,
  protagonistOvr = 62,
): GameSummary {
  let state = startMatch({ pitcher, batterMean: opponentOvr });
  let strikeouts = 0;
  let hits = 0;
  let walks = 0;

  let safety = 600;
  while (!state.isFinished && safety-- > 0) {
    const prevStrikes = state.count.strikes;
    const { nextState, outcome } = stepPitch(state, autoPickDecision(state));
    const code = outcome.resultCode;
    if ((code === "STRIKE_LOOK" || code === "STRIKE_SWING") && prevStrikes === 2) strikeouts++;
    if (code === "HIT_SINGLE" || code === "HIT_DOUBLE" || code === "HIT_TRIPLE" || code === "HOME_RUN") hits++;
    if (code === "WALK") walks++;
    state = nextState;
  }

  // 상대 실점 = 엔진의 away(상대 공격) + home(동일 투수 bottom)을 모두 허용 실점으로 처리
  const runsAllowed = state.score.away + state.score.home;

  // 주인공 팀 타선 = OVR 차이 기반 + 노이즈 (3점 기준, 차이 10당 0.5점 보정)
  const offenseBase = 3.0 + (protagonistOvr - opponentOvr) * 0.05;
  const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  let homeScore = Math.max(0, Math.round(offenseBase + noise));
  let awayScore = runsAllowed;
  if (homeScore === awayScore) { homeScore > 0 ? homeScore-- : awayScore++; }

  return { homeScore, awayScore, strikeouts, hits, walks };
}
