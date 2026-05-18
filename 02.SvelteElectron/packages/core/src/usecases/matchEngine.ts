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
  type EntryTrigger,
  type FieldPosition,
  type FielderStats,
  type FieldingResult,
  type HalfInning,
  type ManagerStats,
  type MatchCount,
  type MatchRunners,
  type MatchStartOptions,
  type MatchState,
  type NpcPitcherTracker,
  type ParkType,
  type PitchLocation,
  type PitchPower,
  type PitchResultCode,
  type PitchStrategy,
  type PitchType,
  type PitcherRole,
  type PitcherStats,
  type RunnerStats,
  type WeatherType,
} from "../domain/matchState";
import { getMatchEngineTuning } from "../domain/matchEngineTuning";

// ── 공개 타입 ─────────────────────────────────────────────────────────────────

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

export interface HalfInningSimResult {
  nextState: MatchState;
  runs: number;
  hits: number;
  walks: number;
  strikeouts: number;
  logs: string[];
}

export type ExitReason = "pitch_limit" | "stamina" | "performance" | "tactical";

export type GamePhaseResult =
  | { phase: "pre_entry_sim" }
  | { phase: "protagonist_entry"; state: MatchState }
  | { phase: "protagonist_pitch" }
  | { phase: "auto_batting"; result: HalfInningSimResult }
  | { phase: "protagonist_exit"; reason: ExitReason; state: MatchState }
  | { phase: "post_exit_sim" }
  | { phase: "game_over"; state: MatchState; summary: string };

export interface GameSummary {
  homeScore: number;
  awayScore: number;
  strikeouts: number;
  hits: number;
  walks: number;
}

// ── 내부 헬퍼: 현재 half 기준 투수/타자/스태미나 결정 ─────────────────────────

function isOurTeamFieldingNow(state: MatchState): boolean {
  return (state.half === "top" && state.protagonistSide === "home") ||
    (state.half === "bottom" && state.protagonistSide === "away");
}

function isProtagonistActivelyPitching(state: MatchState): boolean {
  return isOurTeamFieldingNow(state) && state.protagonistHasEntered && !state.protagonistExited;
}

function getActivePitcher(state: MatchState): PitcherStats {
  const ourTeamFielding = isOurTeamFieldingNow(state);
  if (!ourTeamFielding) return state.opponentNpcPitcher;
  if (state.protagonistHasEntered && !state.protagonistExited) return state.protagonistPitcher;
  return state.myNpcPitcher;
}

function getActiveStamina(state: MatchState): number {
  const ourTeamFielding = isOurTeamFieldingNow(state);
  if (!ourTeamFielding) return state.npcPitcherStamina.opponent;
  if (state.protagonistHasEntered && !state.protagonistExited) return state.protagonistStamina;
  return state.npcPitcherStamina.my;
}

function getActiveMental(state: MatchState): number {
  const ourTeamFielding = isOurTeamFieldingNow(state);
  if (!ourTeamFielding) return state.npcPitcherMental.opponent;
  if (state.protagonistHasEntered && !state.protagonistExited) return state.protagonistMental;
  return state.npcPitcherMental.my;
}

function getCurrentBatter(state: MatchState): BatterStats {
  const isTop = state.half === "top";
  const lineup = isTop ? state.awayLineup : state.homeLineup;
  const idx    = isTop ? state.awayLineupIndex : state.homeLineupIndex;
  return lineup[idx] ?? createBatter(state.batterMean);
}

function getCurrentLineupIndex(state: MatchState): number {
  return state.half === "top" ? state.awayLineupIndex : state.homeLineupIndex;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

export function startMatch(options: MatchStartOptions = {}): MatchState {
  return createInitialMatchState(options);
}

export function finishMatch(state: MatchState): { nextState: MatchState; summary: string } {
  if (state.isFinished) return { nextState: state, summary: buildSummary(state) };
  const nextState: MatchState = {
    ...state, isFinished: true,
    logs: [...state.logs, "경기 종료"],
  };
  return { nextState, summary: buildSummary(nextState) };
}

/** 주인공이 지금 투구 차례인지 판별 (UI에서 투구 버튼 활성화 여부 판단용) */
export function isProtagonistPitching(state: MatchState): boolean {
  return isProtagonistActivelyPitching(state);
}

/**
 * 주인공 인터랙티브 투구 — 주인공이 투구 중인 half에서만 호출 가능.
 * 3아웃으로 half가 전환되면 nextState.half가 바뀐 채로 반환됨.
 * 이후 advanceGamePhase()로 다음 액션 결정.
 */
export function stepPitch(state: MatchState, decision: PitchDecision): MatchStepResult {
  if (state.isFinished) {
    return {
      nextState: state,
      outcome: { resultCode: "GAME_OVER", quality: 0, comment: "이미 종료된 경기입니다.", animationCues: [] },
    };
  }
  if (!isProtagonistActivelyPitching(state)) {
    throw new Error("현재 주인공 투구 차례가 아닙니다. isProtagonistPitching()을 먼저 확인하세요.");
  }
  return stepPitchCore(state, decision, true);
}

/**
 * 현재 게임 상태에서 다음 액션을 결정하는 오케스트레이터.
 * half 전환 직후 또는 게임 시작 후 호출.
 */
export function advanceGamePhase(state: MatchState): GamePhaseResult {
  if (state.isFinished) {
    return { phase: "game_over", state, summary: buildSummary(state) };
  }

  // 주인공 등판 전 (RP/CP 대기 중)
  if (!state.protagonistHasEntered) {
    if (shouldProtagonistEnter(state)) {
      const entryState = protagonistEntersMidInning(state);
      return { phase: "protagonist_entry", state: entryState };
    }
    return { phase: "pre_entry_sim" };
  }

  // 주인공 강판 후
  if (state.protagonistExited) {
    return { phase: "post_exit_sim" };
  }

  // 주인공 강판 조건 확인
  const exitCheck = shouldProtagonistExit(state);
  if (exitCheck.shouldExit && exitCheck.reason) {
    const exitState = protagonistExitsGame(state, exitCheck.reason);
    return { phase: "protagonist_exit", reason: exitCheck.reason, state: exitState };
  }

  // 주인공 투구 차례
  if (isProtagonistActivelyPitching(state)) {
    return { phase: "protagonist_pitch" };
  }

  // 아군 타격 또는 상대 공격 → 자동 시뮬
  const result = autoSimulateHalfInning(state);
  return { phase: "auto_batting", result };
}

/** 등판 전 자동 시뮬: 주인공이 등판 조건을 충족할 때까지 NPC끼리 진행 */
export function autoSimulateUntilEntry(state: MatchState): MatchState {
  let s = { ...state };
  let safety = 5000;

  while (!s.isFinished && !s.protagonistHasEntered && safety-- > 0) {
    if (shouldProtagonistEnter(s)) {
      s = protagonistEntersMidInning(s);
      break;
    }
    // NPC끼리 한 투구씩 진행 (mid_inning 트리거는 타석 단위로 체크)
    const result = stepPitchCore(s, autoPickDecision(s), false);
    s = result.nextState;
  }

  return s;
}

/** 강판 후 게임 종료까지 자동 시뮬 */
export function autoSimulateToGameEnd(state: MatchState): MatchState {
  let s = { ...state };
  let safety = 5000;

  while (!s.isFinished && safety-- > 0) {
    const result = stepPitchCore(s, autoPickDecision(s), false);
    s = result.nextState;
  }

  if (!s.isFinished) {
    s = { ...s, isFinished: true, logs: [...s.logs, "경기 종료"] };
  }
  return s;
}

/** 반이닝 자동 시뮬 (아군 타격 또는 NPC 대 NPC) */
export function autoSimulateHalfInning(state: MatchState): HalfInningSimResult {
  const startHalf   = state.half;
  const startInning = state.inning;
  let s = { ...state };
  let runs = 0, hits = 0, walks = 0, strikeouts = 0;
  const logs: string[] = [];
  let safety = 300;

  while (!s.isFinished && safety-- > 0) {
    // half가 전환되면 이 반이닝 완료
    if (s.half !== startHalf || s.inning !== startInning) break;

    const prevStrikes = s.count.strikes;
    const prevScore   = { ...s.score };
    const result      = stepPitchCore(s, autoPickDecision(s), false);
    const code        = result.outcome.resultCode;

    // 득점 집계
    const battingTeam = startHalf === "top" ? "away" : "home";
    runs += result.nextState.score[battingTeam] - prevScore[battingTeam];

    if (code === "HIT_SINGLE" || code === "HIT_DOUBLE" || code === "HIT_TRIPLE" || code === "HOME_RUN") hits++;
    if (code === "WALK") walks++;
    if ((code === "STRIKE_LOOK" || code === "STRIKE_SWING") && prevStrikes === 2) strikeouts++;

    logs.push(...result.nextState.logs.slice(s.logs.length));
    s = result.nextState;
  }

  return { nextState: s, runs, hits, walks, strikeouts, logs };
}

/**
 * 감독 자동 마운드 방문 판단 — 투구 직후 호출.
 * 조건 충족 시 방문 효과를 적용한 새 상태 반환, 아니면 그대로 반환.
 */
export function autoMoundVisitIfNeeded(state: MatchState): MatchState {
  if (state.moundVisitsLeft <= 0) return state;
  if (!state.protagonistHasEntered || state.protagonistExited) return state;

  const tuning = getMatchEngineTuning();
  if (state.pitchCount - state.lastMoundVisitPitch < tuning.moundVisitMinPitchGap) return state;

  const { protagonistMental, runners, inning, inningLimit } = state;
  const { clutchDecision, tacticalIQ } = state.myManager;

  // clutchDecision: 위기 감지 민감도 — 높을수록 더 이른 멘탈에서 방문 결정
  const crisisThreshold = 35 + (clutchDecision - 50) * 0.2;   // 25~45

  // tacticalIQ: 상황 판단력 — 높을수록 득점권+후반에서 더 적극적으로 방문
  const situationalThreshold = 52 + (tacticalIQ - 50) * 0.1; // 47~57

  const hasScoringPosition = !!(runners.second || runners.third);
  const isLateGame = inning >= inningLimit - 2;

  const shouldVisit =
    protagonistMental < crisisThreshold ||
    (protagonistMental < situationalThreshold && hasScoringPosition && isLateGame);

  if (!shouldVisit) return state;
  return requestMoundVisit(state);
}

/** 마운드 방문 */
export function requestMoundVisit(state: MatchState): MatchState {
  if (state.moundVisitsLeft <= 0) return state;
  if (!state.protagonistHasEntered || state.protagonistExited) return state;

  const tuning = getMatchEngineTuning();
  if (state.pitchCount - state.lastMoundVisitPitch < tuning.moundVisitMinPitchGap) return state;

  const motivatorFactor   = state.myManager.motivator / 50;
  const mentalRecovery    = tuning.moundVisitMentalRecovery * motivatorFactor;
  const staminaRecovery   = tuning.moundVisitStaminaRecovery;
  const nextMental        = Number(clamp(state.protagonistMental + mentalRecovery, 0, 100).toFixed(1));
  const nextStamina       = Number(clamp(state.protagonistStamina + staminaRecovery, 0, 100).toFixed(1));

  return {
    ...state,
    protagonistMental:  nextMental,
    protagonistStamina: nextStamina,
    lastPitchTypes:     [],  // 투구 패턴 리셋 (전략 협의)
    moundVisitsLeft:    state.moundVisitsLeft - 1,
    lastMoundVisitPitch: state.pitchCount,
    logs: [...state.logs, `마운드 방문 (멘탈+${mentalRecovery.toFixed(1)}, 체력+${staminaRecovery})`],
  };
}

/** 주인공 강판 판단 */
export function shouldProtagonistExit(
  state: MatchState
): { shouldExit: boolean; reason: ExitReason | null } {
  if (!state.protagonistHasEntered || state.protagonistExited) {
    return { shouldExit: false, reason: null };
  }

  const tuning      = getMatchEngineTuning();
  const thr         = tuning.managerChangeThresholds;
  const { pitchCountSinceEntry, protagonistStamina, protagonistMental } = state;
  const { tacticalIQ, clutchDecision } = state.myManager;

  // 절대 한도 (감독 무관)
  if (pitchCountSinceEntry >= thr.protagonistPitchCountHard) {
    return { shouldExit: true, reason: "pitch_limit" };
  }
  if (protagonistStamina <= thr.protagonistStaminaEmergency) {
    return { shouldExit: true, reason: "stamina" };
  }

  // 위험도 점수 계산
  let dangerScore = 0;

  if (pitchCountSinceEntry >= thr.protagonistPitchCountSoft) {
    dangerScore += 20 + (pitchCountSinceEntry - thr.protagonistPitchCountSoft) * 1.2;
  }
  if (protagonistStamina < 30) dangerScore += (30 - protagonistStamina) * 1.5;
  if (protagonistMental  < 30) dangerScore += (30 - protagonistMental)  * 1.0;

  const inningRatio = state.inning / state.inningLimit;
  if (inningRatio >= 0.8) dangerScore += 12;

  const hasScoringPosition = !!(state.runners.second || state.runners.third);
  const isLateGame = state.inning >= state.inningLimit - 1;
  if (hasScoringPosition && isLateGame) dangerScore += 18;

  // 감독 tacticalIQ: 높을수록 더 예민하게 교체 결정
  const baseThreshold = 65;
  const iqAdj         = (tacticalIQ - 50) * 0.4;
  const clutchAdj     = isLateGame ? (clutchDecision - 50) * 0.3 : 0;
  const changeThreshold = baseThreshold - iqAdj - clutchAdj;

  if (dangerScore >= changeThreshold) {
    return { shouldExit: true, reason: "tactical" };
  }

  return { shouldExit: false, reason: null };
}

// ── 내부 함수: 등판 진입/강판 ─────────────────────────────────────────────────

function shouldProtagonistEnter(state: MatchState): boolean {
  if (state.protagonistHasEntered || state.protagonistExited || state.isFinished) return false;
  if (!isOurTeamFieldingNow(state)) return false; // 공격 half엔 등판 없음

  const trigger = state.entryTrigger;
  const tuning  = getMatchEngineTuning();
  const thr     = tuning.managerChangeThresholds;

  switch (trigger.type) {
    case "inning_start":
      return state.inning >= trigger.inning
        && state.outs === 0
        && state.count.balls === 0
        && state.count.strikes === 0;

    case "mid_inning": {
      if (state.inning < trigger.inning) return false;
      const { tacticalIQ } = state.myManager;
      // 높은 tacticalIQ → 더 일찍 교체 결정
      const iqFactor = 1 - (tacticalIQ - 50) * 0.004;
      const staminaThreshold = thr.npcStarterStaminaLimit * iqFactor;
      const pitchThreshold   = thr.npcStarterPitchCountSoft
        - (tacticalIQ - 50) * 0.5;

      return state.npcPitcherStamina.my <= staminaThreshold
        || state.npcPitcherPitchCount.my >= pitchThreshold;
    }

    case "close_game": {
      if (state.inning < trigger.inningThreshold) return false;
      const myScore  = state.score[state.protagonistSide];
      const oppSide  = state.protagonistSide === "home" ? "away" : "home";
      const oppScore = state.score[oppSide];
      const lead     = myScore - oppScore;
      return lead > 0 && lead <= trigger.maxLeadDiff;
    }

    case "manual":
      return state.inning === trigger.inning
        && state.half === trigger.half
        && state.outs === trigger.outs;
  }
}

function protagonistEntersMidInning(state: MatchState): MatchState {
  const halfLabel = state.half === "top" ? "초" : "말";
  const entryLog = `[${state.inning}회${halfLabel} ${state.outs}아웃] 주인공 등판!`;
  return {
    ...state,
    protagonistHasEntered: true,
    pitchCountSinceEntry:  0,
    inheritedRunners:      { ...state.runners },
    lastPitchTypes:        [],
    logs:       [...state.logs, entryLog],
    preEntryLogs: [...state.preEntryLogs, entryLog],
  };
}

function protagonistExitsGame(state: MatchState, reason: ExitReason): MatchState {
  const reasonLabel: Record<ExitReason, string> = {
    pitch_limit:  "투구수 제한",
    stamina:      "체력 부족",
    performance:  "부진",
    tactical:     "전술적 교체",
  };
  const log = `주인공 강판 (${reasonLabel[reason]}) — NPC 구원 투수 등판`;
  return {
    ...state,
    protagonistExited: true,
    logs: [...state.logs, log],
  };
}

// ── 투구 위치 이탈 시스템 ─────────────────────────────────────────────────────

const ADJACENT_LOCATIONS: Record<PitchLocation, PitchLocation[]> = {
  1: [2, 4],        2: [1, 3, 5],     3: [2, 6],
  4: [1, 5, 7],     5: [2, 4, 6, 8],  6: [3, 5, 9],
  7: [4, 8],        8: [5, 7, 9],     9: [6, 8],
};

function resolveEffectiveLocation(
  intended: PitchLocation,
  pitcher: PitcherStats,
  stamina: number,
  mental: number,
  state: MatchState,
): { effectiveLocation: PitchLocation; isBallZone: boolean; missLog: string | null } {
  const tuning = getMatchEngineTuning();
  // control=50 기준: 높을수록 miss 감소, 낮을수록 증가 (최소 3% floor)
  const baseMissProb = Math.max(0.03, tuning.controlMissBaseProb - (pitcher.control - 50) * tuning.controlMissControlScale);
  const staminaMult = stamina < 50 ? 1 + (50 - stamina) * tuning.controlMissStaminaScale : 1.0;
  const mentalMult  = mental  < 50 ? 1 + (50 - mental)  * tuning.controlMissMentalScale  : 1.0;
  const hasScoringPosition = !!(state.runners.second || state.runners.third);
  const isFullBase  = !!(state.runners.first && state.runners.second && state.runners.third);
  const isLateGame  = state.inning >= state.inningLimit - 2;
  const pressureMult = 1.0
    + (hasScoringPosition ? 0.15 : 0)
    + (isFullBase ? 0.10 : 0)
    + (isLateGame ? 0.08 : 0);
  const missProb = clamp(baseMissProb * staminaMult * mentalMult * pressureMult, 0.0, 0.60);

  if (Math.random() >= missProb) {
    return { effectiveLocation: intended, isBallZone: false, missLog: null };
  }
  if (Math.random() < tuning.controlMissBallZoneRatio) {
    return { effectiveLocation: intended, isBallZone: true, missLog: "제구 실패 (볼존 이탈)" };
  }
  const adj = ADJACENT_LOCATIONS[intended];
  const effectiveLocation = adj[Math.floor(Math.random() * adj.length)] as PitchLocation;
  return { effectiveLocation, isBallZone: false, missLog: `제구 불안 (${intended}→${effectiveLocation})` };
}

// ── 핵심 투구 처리 엔진 (내부용) ──────────────────────────────────────────────

function stepPitchCore(
  state: MatchState,
  decision: PitchDecision,
  isProtagonist: boolean,
): MatchStepResult {
  if (state.isFinished) {
    const outcome: PitchOutcome = {
      resultCode: "GAME_OVER", quality: 0,
      comment: "이미 종료된 경기입니다.", animationCues: [],
    };
    return { nextState: state, outcome };
  }

  // ── 1. 도루 시도 (투구 전) ──────────────────────────────────────────────────
  const activePitcher = getActivePitcher(state);
  const stealResult   = attemptSteals(state, activePitcher);
  let preRunners = stealResult.runners;
  let preOuts    = stealResult.outs;
  let preInning  = state.inning;
  let preHalf: HalfInning = state.half;

  if (preOuts >= 3) {
    preOuts    = 0;
    preRunners = { first: null, second: null, third: null };
    if (preHalf === "top") { preHalf = "bottom"; }
    else { preHalf = "top"; preInning += 1; }
  }

  const preState: MatchState = {
    ...state,
    runners: preRunners, outs: preOuts, inning: preInning, half: preHalf,
  };

  // ── 2. 현재 투수·타자·스태미나 결정 ────────────────────────────────────────
  const currentPitcher = getActivePitcher(preState);
  const currentBatter  = getCurrentBatter(preState);
  const currentStamina = getActiveStamina(preState);
  const currentMental  = getActiveMental(preState);

  // ── 3. 제구 이탈 체크 → 투구 결과 계산 ────────────────────────────────────
  const missResult = resolveEffectiveLocation(decision.location, currentPitcher, currentStamina, currentMental, preState);
  const effectiveDecision: PitchDecision = { ...decision, location: missResult.effectiveLocation };
  const quality = calculatePitchQuality(preState, currentPitcher, currentBatter, currentStamina, currentMental, effectiveDecision);
  let resultCode: PitchResultCode = missResult.isBallZone
    ? "BALL"
    : applyHitUpgrade(resolvePitchResult(quality, effectiveDecision), currentBatter.power, preState.weather);
  const ballInPlay = missResult.isBallZone ? undefined : resolveBallInPlay(resultCode, effectiveDecision, quality);

  // 수비 처리 (INPLAY_OUT 케이스)
  let fieldingResult: FieldingResult | undefined;
  if (ballInPlay && resultCode === "INPLAY_OUT") {
    const fd = resolveFieldingResult(ballInPlay, preState.fielders);
    fieldingResult = fd.fieldingResult;
    resultCode     = fd.adjustedResultCode;
  }

  let nextCount:   MatchCount   = { ...preState.count };
  let nextOuts:    number       = preState.outs;
  let nextRunners: MatchRunners = { ...preState.runners };
  let nextScore                 = { ...preState.score };
  let nextInningScores          = { home: [...preState.inningScores.home], away: [...preState.inningScores.away] };
  let nextInning = preState.inning;
  let nextHalf: HalfInning = preState.half;
  const runningLogs: string[] = [];

  const addRunsResult = (runs: number) => {
    if (runs <= 0) return;
    const team = nextHalf === "top" ? "away" : "home";
    const idx  = Math.min(nextInning - 1, nextInningScores[team].length - 1);
    nextScore = { ...nextScore, [team]: nextScore[team] + runs };
    if (idx >= 0) nextInningScores[team][idx] += runs;
  };

  if (resultCode === "BALL") {
    nextCount.balls += 1;
    if (nextCount.balls >= 4) {
      resultCode = "WALK";
      nextCount  = { balls: 0, strikes: 0 };
      const walkRun = advanceOnWalk(nextRunners, createRunner(currentBatter));
      nextRunners   = walkRun.runners;
      addRunsResult(walkRun.runs);
    }
  } else if (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") {
    nextCount.strikes += 1;
    if (nextCount.strikes >= 3) { nextOuts += 1; nextCount = { balls: 0, strikes: 0 }; }
  } else if (resultCode === "FOUL") {
    if (nextCount.strikes < 2) nextCount.strikes += 1;
  } else if (resultCode === "INPLAY_OUT") {
    nextOuts += 1;
    nextCount = { balls: 0, strikes: 0 };
    const gidpResult = tryDoublePlay(nextRunners, preState.outs);
    if (gidpResult.isDoublePlay) {
      nextOuts    += 1;
      nextRunners  = gidpResult.runners;
      runningLogs.push("병살타!");
    }
  } else if (resultCode === "FIELDING_ERROR") {
    nextCount = { balls: 0, strikes: 0 };
    const errResult = advanceOnHit(nextRunners, "HIT_SINGLE", createRunner(currentBatter));
    nextRunners = errResult.runners;
    addRunsResult(errResult.runs);
    nextOuts += errResult.extraOuts;
    runningLogs.push(`실책! (${fieldingResult?.fielder.name ?? "수비수"})`);
  } else {
    const hitResult = advanceOnHit(nextRunners, resultCode, createRunner(currentBatter));
    nextRunners = hitResult.runners;
    addRunsResult(hitResult.runs);
    nextOuts += hitResult.extraOuts;
    nextCount  = { balls: 0, strikes: 0 };
    runningLogs.push(...hitResult.logs);
  }

  // defenseStat 업데이트
  const nextDefenseStat = { ...preState.defenseStat };
  if (fieldingResult) {
    if (fieldingResult.isError) {
      nextDefenseStat.errors += 1;
    } else if (fieldingResult.throwResult === "out") {
      nextDefenseStat.throwOuts += 1;
      nextDefenseStat.assists   += 1;
    } else if (fieldingResult.throwResult === "safe") {
      nextDefenseStat.throwSafes += 1;
    }
  }

  // 3아웃 → half 전환
  if (nextOuts >= 3) {
    nextOuts    = 0;
    nextCount   = { balls: 0, strikes: 0 };
    nextRunners = { first: null, second: null, third: null };
    if (nextHalf === "top") { nextHalf = "bottom"; }
    else { nextHalf = "top"; nextInning += 1; }
  }

  // ── 4. 스태미나/멘탈 업데이트 ────────────────────────────────────────────────
  const tuning = getMatchEngineTuning();
  const powerStaminaCost: Record<PitchPower, number> = tuning.staminaPowerCost;
  const baseStaminaLoss =
    tuning.staminaBase +
    (decision.strategy === "aggressive" ? tuning.staminaAggressiveBonus : 0) +
    (decision.pitchType === "fastball"  ? tuning.staminaFastballBonus   : 0) +
    powerStaminaCost[decision.power];
  const staminaCapFactor = 1 - clamp((currentPitcher.staminaCap - 55) * 0.005, -0.15, 0.15);
  const fatigueMult      = currentStamina < 40 ? 1 + (40 - currentStamina) * 0.025 : 1;
  const staminaLoss      = baseStaminaLoss * staminaCapFactor * fatigueMult;

  const mentalResilFactor  = 1 - clamp((currentPitcher.mentalResil - 50) * 0.004, -0.15, 0.15);
  const rawMentalDelta     = resolveMentalDelta(resultCode) * mentalResilFactor;
  const inningChanged      = nextOuts === 0 && preState.outs > 0;
  const mentalRecovery     = inningChanged ? tuning.mentalRecoveryOnInningEnd : 0;
  const mentalDelta        = rawMentalDelta + mentalRecovery;

  const nextStamina = Number(clamp(currentStamina - staminaLoss, 0, 100).toFixed(1));
  const nextMental  = Number(clamp(currentMental  + mentalDelta, 0, 100).toFixed(1));

  // 스태미나/멘탈을 올바른 대상에 적용
  let nextProtagonistStamina = preState.protagonistStamina;
  let nextProtagonistMental  = preState.protagonistMental;
  let nextNpcStamina: NpcPitcherTracker = { ...preState.npcPitcherStamina };
  let nextNpcMental:  NpcPitcherTracker = { ...preState.npcPitcherMental };
  let nextNpcPitchCount: NpcPitcherTracker = { ...preState.npcPitcherPitchCount };

  if (isProtagonist && isProtagonistActivelyPitching(preState)) {
    nextProtagonistStamina = nextStamina;
    nextProtagonistMental  = nextMental;
  } else if (isOurTeamFieldingNow(preState)) {
    nextNpcStamina.my    = nextStamina;
    nextNpcMental.my     = nextMental;
    nextNpcPitchCount.my = preState.npcPitcherPitchCount.my + 1;
  } else {
    nextNpcStamina.opponent    = nextStamina;
    nextNpcMental.opponent     = nextMental;
    nextNpcPitchCount.opponent = preState.npcPitcherPitchCount.opponent + 1;
  }

  // ── 5. 타자 교체 ─────────────────────────────────────────────────────────────
  const isKOut = (resultCode === "STRIKE_LOOK" || resultCode === "STRIKE_SWING") && preState.count.strikes === 2;
  const abEnded = isKOut
    || resultCode === "WALK"   || resultCode === "INPLAY_OUT"   || resultCode === "FIELDING_ERROR"
    || resultCode === "HIT_SINGLE" || resultCode === "HIT_DOUBLE"
    || resultCode === "HIT_TRIPLE" || resultCode === "HOME_RUN";

  let nextHomeLineupIndex = preState.homeLineupIndex;
  let nextAwayLineupIndex = preState.awayLineupIndex;
  if (abEnded) {
    if (preState.half === "top") {
      nextAwayLineupIndex = (preState.awayLineupIndex + 1) % preState.awayLineup.length;
    } else {
      nextHomeLineupIndex = (preState.homeLineupIndex + 1) % preState.homeLineup.length;
    }
  }

  const nextLastPitchTypes = [...preState.lastPitchTypes, decision.pitchType].slice(-5);
  const nextPitchCountSinceEntry = (isProtagonist && isProtagonistActivelyPitching(preState))
    ? preState.pitchCountSinceEntry + 1
    : preState.pitchCountSinceEntry;

  // ── 6. 로그 조합 ──────────────────────────────────────────────────────────────
  const pitchLog  = buildPitchLog(preState, effectiveDecision, resultCode, quality);
  const allNewLogs = [
    ...stealResult.stealLogs,
    ...(missResult.missLog ? [missResult.missLog] : []),
    pitchLog,
    ...runningLogs,
  ];

  // ── 7. 애니메이션 큐 생성 ─────────────────────────────────────────────────────
  const animationCues = buildAnimationCues({ decision: effectiveDecision, resultCode, ballInPlay, fieldingResult, preRunners: preState.runners });

  let nextState: MatchState = {
    ...preState,
    inning: nextInning, half: nextHalf,
    outs: nextOuts, count: nextCount,
    runners: nextRunners,
    score: nextScore,
    inningScores: nextInningScores,
    pitchCount: state.pitchCount + 1,
    protagonistStamina: nextProtagonistStamina,
    protagonistMental:  nextProtagonistMental,
    npcPitcherStamina:  nextNpcStamina,
    npcPitcherMental:   nextNpcMental,
    npcPitcherPitchCount: nextNpcPitchCount,
    pitchCountSinceEntry: nextPitchCountSinceEntry,
    homeLineupIndex: nextHomeLineupIndex,
    awayLineupIndex: nextAwayLineupIndex,
    lastPitchTypes:  nextLastPitchTypes,
    defenseStat:     nextDefenseStat,
    logs: [...state.logs, ...allNewLogs],
  };

  if (shouldAutoFinish(nextState)) {
    nextState = { ...nextState, isFinished: true, logs: [...nextState.logs, finishLog(nextState)] };
  }

  const outcome: PitchOutcome = {
    resultCode, quality, comment: getResultComment(resultCode),
    ballInPlay, fieldingResult, animationCues,
  };
  return { nextState, outcome };
}

// ── 투구 품질 계산 ─────────────────────────────────────────────────────────────

function calculatePitchQuality(
  state: MatchState,
  pitcher: PitcherStats,
  batter: BatterStats,
  stamina: number,
  mental: number,
  decision: PitchDecision,
): number {
  const tuning = getMatchEngineTuning();
  const pitchBase:     Record<PitchType,     number> = tuning.pitchBase;
  const strategyBonus: Record<PitchStrategy, number> = tuning.strategyBonus;
  const powerBonus:    Record<PitchPower,    number> = tuning.powerBonus;
  const locationBonus: Record<PitchLocation, number> = tuning.locationBonus;

  const commandBonus  = (pitcher.command  - 50) * 0.10;
  const velocityBonus = decision.pitchType === "fastball"
    ? (pitcher.velocity - 50) * 0.12
    : (pitcher.velocity - 50) * 0.03;
  const controlBonus  = (pitcher.control  - 50) * 0.06;
  const movementBonus = decision.pitchType !== "fastball"
    ? (pitcher.movement - 50) * 0.08 : 0;

  const contactPenalty    = (batter.contact    - 50) * 0.10;
  const eyePenalty        = (batter.eye        - 50) * 0.06;
  const disciplinePenalty = (batter.discipline - 50) * 0.04;
  const batterPenalty     = contactPenalty + eyePenalty + disciplinePenalty;

  const countMod       = countModifier(state.count);
  const fullCountNoise = state.count.balls === 3 && state.count.strikes === 2
    ? Math.random() * 6 - 3 : 0;

  const staminaPenalty = Math.max(0, (50 - stamina) * 0.18);
  const mentalBonus    = (mental - 50) * 0.08;
  const randomNoise    = Math.random() * 16 - 8;

  const weatherMod = weatherQualityModifier(state.weather, decision.pitchType);
  const parkMod    = parkQualityModifier(state.park);
  const patternMod = pitchPatternModifier(decision.pitchType, state.lastPitchTypes);
  const jamMod     = jamPressureModifier(state, mental, batter.battingClutch);
  const clutchMod  = clutchModifier(state, pitcher.clutch);

  return Number((
    pitchBase[decision.pitchType] +
    strategyBonus[decision.strategy] +
    powerBonus[decision.power] +
    locationBonus[decision.location] +
    commandBonus + velocityBonus + controlBonus + movementBonus +
    countMod + fullCountNoise -
    batterPenalty +
    mentalBonus - staminaPenalty +
    weatherMod + parkMod + patternMod + jamMod + clutchMod +
    randomNoise
  ).toFixed(2));
}

function resolvePitchResult(quality: number, decision: PitchDecision): PitchResultCode {
  const roll = Math.random();
  const base = resolveBaseResult(quality, roll);
  if (base === "STRIKE") return resolveStrikeType(decision, roll);
  return base;
}

function resolveBaseResult(quality: number, roll: number): PitchResultCode | "STRIKE" {
  if (quality >= 72) {
    // 지배적 투구: 스트라이크 80%, 파울 10%, 볼 10%
    if (roll < 0.80) return "STRIKE";
    if (roll < 0.90) return "FOUL";
    return "BALL";
  }
  if (quality >= 60) {
    // 양호한 투구: 스트라이크 50%, 파울 12%, 볼 14%, 약타구 14%, 단타 10%
    if (roll < 0.50) return "STRIKE";
    if (roll < 0.62) return "FOUL";
    if (roll < 0.76) return "BALL";
    if (roll < 0.90) return "INPLAY_OUT";
    return "HIT_SINGLE";
  }
  if (quality >= 52) {
    // 경계선 투구: 스트라이크 15%, 파울 12%, 볼 19%, 약타구 40%, 단타 14%
    if (roll < 0.15) return "STRIKE";
    if (roll < 0.27) return "FOUL";
    if (roll < 0.46) return "BALL";
    if (roll < 0.86) return "INPLAY_OUT";
    return "HIT_SINGLE";
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

function resolveStrikeType(decision: PitchDecision, roll: number): "STRIKE_LOOK" | "STRIKE_SWING" {
  const isCorner   = [1, 3, 7, 9].includes(decision.location);
  const isFastball = decision.pitchType === "fastball";
  const isBreaking = decision.pitchType === "curve" || decision.pitchType === "changeup";
  let lookProb = 0.50;
  if (isCorner)              lookProb += 0.15;
  if (isBreaking)            lookProb += 0.12;
  if (isFastball)            lookProb -= 0.18;
  if (decision.location === 5) lookProb -= 0.10;
  return roll < clamp(lookProb, 0.15, 0.85) ? "STRIKE_LOOK" : "STRIKE_SWING";
}

// ── Ball-in-play ─────────────────────────────────────────────────────────────

const INPLAY_CODES = new Set<PitchResultCode>(["INPLAY_OUT", "FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]);

function resolveBallInPlay(resultCode: PitchResultCode, decision: PitchDecision, quality: number): BallInPlay | undefined {
  if (!INPLAY_CODES.has(resultCode)) return undefined;
  const hitType  = resolveHitType(resultCode, decision, quality);
  const zone     = resolveZone(hitType, decision.location);
  const hardness = resolveHardness(resultCode, decision, quality);
  return { hitType, zone, hardness };
}

function resolveHitType(resultCode: PitchResultCode, decision: PitchDecision, quality: number): BallHitType {
  if (decision.strategy === "safe" && decision.power === "low") return "bunt";
  if (resultCode === "HOME_RUN")   return "flyBall";
  if (resultCode === "HIT_TRIPLE") return Math.random() < 0.70 ? "flyBall" : "lineDrive";
  if (resultCode === "HIT_DOUBLE") return Math.random() < 0.55 ? "lineDrive" : "flyBall";
  if (resultCode === "INPLAY_OUT" && quality >= 60 && Math.random() < 0.30) return "popup";
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
  if (roll < 0.38) return "groundBall";
  if (roll < 0.68) return "lineDrive";
  return "flyBall";
}

function resolveZone(hitType: BallHitType, location: PitchLocation): FieldPosition {
  const isLeft  = (location === 1 || location === 4 || location === 7);
  const isRight = (location === 3 || location === 6 || location === 9);
  if (hitType === "bunt")       return (["P", "C", "1B", "3B"] as FieldPosition[])[Math.floor(Math.random() * 4)];
  if (hitType === "popup")      return (["C", "1B", "2B", "3B", "SS"] as FieldPosition[])[Math.floor(Math.random() * 5)];
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
  if (isLeft)  return Math.random() < 0.45 ? "1B" : "RF";
  if (isRight) return Math.random() < 0.45 ? "3B" : "LF";
  return Math.random() < 0.45 ? "2B" : "CF";
}

function resolveHardness(resultCode: PitchResultCode, decision: PitchDecision, quality: number): 1 | 2 | 3 | 4 | 5 {
  let base: number;
  switch (resultCode) {
    case "HOME_RUN":   base = 5.0; break;
    case "HIT_TRIPLE": base = 4.2; break;
    case "HIT_DOUBLE": base = 3.5; break;
    case "HIT_SINGLE": base = 2.8; break;
    default:           base = 2.0;
  }
  if (decision.power === "high") base += 0.5;
  if (decision.power === "low")  base -= 0.5;
  if (quality < 40) base += 0.5;
  if (quality < 32) base += 0.5;
  base += (Math.random() - 0.5) * 1.2;
  return clamp(Math.round(base), 1, 5) as 1 | 2 | 3 | 4 | 5;
}

// ── 수비 처리 ─────────────────────────────────────────────────────────────────

function calcErrorProb(ballInPlay: BallInPlay, fielder: FielderStats): number {
  const baseByHitType: Record<BallHitType, number> = {
    popup: 0.04, bunt: 0.08, flyBall: 0.06, groundBall: 0.11, lineDrive: 0.09,
  };
  let prob = baseByHitType[ballInPlay.hitType];
  prob += (ballInPlay.hardness - 3) * 0.025;
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
    const needsThrow = ballInPlay.hitType === "groundBall"
      || ballInPlay.hitType === "lineDrive"
      || ballInPlay.hitType === "bunt";
    if (needsThrow && ballInPlay.zone !== "1B") {
      threwTo = "1B";
      const armMod        = (fielder.arm - 50) * 0.004;
      const hardnessPenalty = (ballInPlay.hardness - 3) * 0.02;
      const successProb   = clamp(0.88 + armMod - hardnessPenalty, 0.45, 0.97);
      throwResult         = Math.random() < successProb ? "out" : "safe";
      if (throwResult === "safe") adjustedResultCode = "FIELDING_ERROR";
    }
  }

  return {
    fieldingResult: { fielder, isError, threwTo, throwResult, runnerExtraAdvance: isError ? 1 : 0 },
    adjustedResultCode,
  };
}

// ── 애니메이션 큐 ─────────────────────────────────────────────────────────────

const MOUND_POS = { x: 50, y: 62 } as const;
const HOME_POS  = { x: 50, y: 88 } as const;

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
    case "bunt": return 280; case "popup": return 520; case "groundBall": return 380;
    case "lineDrive": return 330; case "flyBall": return 680;
  }
}

function battedArc(hitType: BallHitType): number {
  switch (hitType) {
    case "popup": return 0.85; case "flyBall": return 0.60;
    case "lineDrive": return 0.15; case "groundBall": return 0.05; case "bunt": return 0.08;
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
    if (pre.first) push("first", "2B", 420);
    if (pre.first && pre.second) push("second", "3B", 460);
    if (pre.first && pre.second && pre.third) push("third", "home", 380);
  }
  return cues;
}

function buildAnimationCues(params: {
  decision: PitchDecision; resultCode: PitchResultCode;
  ballInPlay?: BallInPlay; fieldingResult?: FieldingResult; preRunners: MatchRunners;
}): AnimationCue[] {
  const { decision, resultCode, ballInPlay, fieldingResult, preRunners } = params;
  const cues: AnimationCue[] = [];
  const pitchDuration = decision.power === "high" ? 240 : decision.power === "low" ? 340 : 290;
  cues.push({ type: "ball_pitch", from: { ...MOUND_POS }, to: { ...HOME_POS }, duration: pitchDuration });

  if (!ballInPlay) {
    cues.push({ type: "show_result", text: getResultComment(resultCode), tone: getResultTone(resultCode), x: 50, y: 50 });
    return cues;
  }

  const zonePos = { ...FIELDER_DEFAULT_POSITIONS[ballInPlay.zone] };
  cues.push({ type: "ball_batted", from: { ...HOME_POS }, to: zonePos, arc: battedArc(ballInPlay.hitType), hitType: ballInPlay.hitType, duration: battedDuration(ballInPlay.hitType) });
  cues.push({ type: "fielder_move", position: ballInPlay.zone, to: zonePos, duration: Math.round(battedDuration(ballInPlay.hitType) * 0.85) });

  if (fieldingResult?.threwTo) {
    const throwTo  = { ...FIELDER_DEFAULT_POSITIONS[fieldingResult.threwTo] };
    const throwDur = Math.round(200 + (100 - (fieldingResult.fielder.arm ?? 50)) * 1.2);
    cues.push({ type: "ball_throw", from: zonePos, to: throwTo, duration: throwDur });
  }

  cues.push(...buildRunnerAdvanceCues(resultCode, preRunners));

  const resultText = resultCode === "FIELDING_ERROR"
    ? `실책! (${fieldingResult?.fielder.name ?? ""})` : getResultComment(resultCode);
  cues.push({ type: "show_result", text: resultText, tone: getResultTone(resultCode), x: 50, y: 40 });

  return cues;
}

// ── 주루 ─────────────────────────────────────────────────────────────────────

function advanceOnWalk(runners: MatchRunners, newRunner: RunnerStats): { runners: MatchRunners; runs: number } {
  let runs = 0;
  let { first, second, third } = runners;
  if (first) {
    if (second) { if (third) { runs = 1; } third = second; second = first; }
    else { second = first; }
  }
  first = newRunner;
  return { runners: { first, second, third }, runs };
}

function advanceOnHit(
  runners: MatchRunners,
  resultCode: PitchResultCode,
  newRunner: RunnerStats,
): { runners: MatchRunners; runs: number; extraOuts: number; logs: string[] } {
  const next: MatchRunners = { first: null, second: null, third: null };
  let runs = 0, extraOuts = 0;
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
      if (result === "advance") { runs += 1; logs.push(`적극 주루! 1루 주자 홈인 (스피드 ${r.speed})`); }
      else if (result === "out") { extraOuts += 1; logs.push(`주루 아웃! 1루 주자 홈 태그아웃 (스피드 ${r.speed})`); }
      else { next.third = r; }
    }
    next.second = newRunner;
    return { runners: next, runs, extraOuts, logs };
  }
  if (resultCode === "HIT_SINGLE") {
    if (runners.third) runs += 1;
    if (runners.second) {
      const r = runners.second;
      const result = tryExtraBase(r, "2nd_scores_single");
      if (result === "advance") { runs += 1; logs.push(`적극 주루! 2루 주자 홈인 (스피드 ${r.speed})`); }
      else if (result === "out") { extraOuts += 1; logs.push(`주루 아웃! 2루 주자 홈 태그아웃 (스피드 ${r.speed})`); }
      else { next.third = r; }
    }
    if (runners.first) {
      const r = runners.first;
      if (!next.third) {
        const result = tryExtraBase(r, "1st_to_3rd_single");
        if (result === "advance") { next.third = r; logs.push(`적극 주루! 1루 주자 3루까지 (스피드 ${r.speed})`); }
        else if (result === "out") { extraOuts += 1; logs.push(`주루 아웃! 1루 주자 3루 태그아웃 (스피드 ${r.speed})`); }
        else { next.second = r; }
      } else { next.second = r; }
    }
    next.first = newRunner;
    return { runners: next, runs, extraOuts, logs };
  }
  return { runners: { ...runners }, runs: 0, extraOuts: 0, logs: [] };
}

function tryExtraBase(runner: RunnerStats, context: "1st_to_3rd_single" | "2nd_scores_single" | "1st_scores_double"): "advance" | "stop" | "out" {
  const configs = {
    "1st_to_3rd_single": { attemptBase: 0.20, successBase: 0.72 },
    "2nd_scores_single": { attemptBase: 0.35, successBase: 0.63 },
    "1st_scores_double": { attemptBase: 0.30, successBase: 0.58 },
  } as const;
  const { attemptBase, successBase } = configs[context];
  const speedMod    = (runner.speed   - 50) * 0.005;
  const instinctMod = (runner.instinct - 50) * 0.003;
  if (Math.random() >= clamp(attemptBase + speedMod + instinctMod, 0.02, 0.75)) return "stop";
  return Math.random() < clamp(successBase + speedMod, 0.15, 0.95) ? "advance" : "out";
}

function attemptSteals(
  state: MatchState,
  pitcher: PitcherStats,
): { runners: MatchRunners; outs: number; stealLogs: string[] } {
  const tuning = getMatchEngineTuning();
  let { first, second, third } = state.runners;
  let outs = state.outs;
  const stealLogs: string[] = [];

  // 감독 offenseMind: 아군 타격 half일 때 도루 시도율 보정
  const isOurBatting = !isOurTeamFieldingNow(state);
  const managerStealBoost = isOurBatting ? (state.myManager.offenseMind - 50) * tuning.offenseStealModifier : 0;
  const holdFactor = clamp(1 - (pitcher.holdRunners - 50) * 0.008, 0.4, 1.6);

  if (first && !second) {
    const r = first;
    const attemptProb = clamp((r.speed - 40) * 0.008 * (r.instinct / 50) * holdFactor + managerStealBoost, 0, 0.30);
    if (Math.random() < attemptProb) {
      const successRate = clamp(0.28 + (r.speed - 50) * 0.007, 0.15, 0.90);
      if (Math.random() < successRate) {
        second = r; first = null;
        stealLogs.push(`도루 성공! 1루→2루 (스피드 ${r.speed})`);
      } else {
        first = null; outs += 1;
        stealLogs.push(`도루 실패! 1루 주자 아웃 (스피드 ${r.speed})`);
      }
    }
  }
  if (second && !third && second.speed > 68) {
    const r = second;
    const attemptProb = clamp((r.speed - 58) * 0.006 * (r.instinct / 55) * holdFactor + managerStealBoost, 0, 0.16);
    if (Math.random() < attemptProb) {
      const successRate = clamp(0.22 + (r.speed - 65) * 0.008, 0.10, 0.78);
      if (Math.random() < successRate) {
        third = r; second = null;
        stealLogs.push(`도루 성공! 2루→3루 (스피드 ${r.speed})`);
      } else {
        second = null; outs += 1;
        stealLogs.push(`도루 실패! 2루 주자 아웃 (스피드 ${r.speed})`);
      }
    }
  }
  return { runners: { first, second, third }, outs, stealLogs };
}

function tryDoublePlay(runners: MatchRunners, outsBeforePlay: number): { isDoublePlay: boolean; runners: MatchRunners } {
  if (outsBeforePlay >= 2) return { isDoublePlay: false, runners };
  if (!runners.first)     return { isDoublePlay: false, runners };
  const tuning = getMatchEngineTuning();
  const baseProb = tuning.doublePlayBaseProb + (runners.second ? 0.05 : 0) + (runners.third ? 0.03 : 0);
  if (Math.random() >= baseProb) return { isDoublePlay: false, runners };
  return { isDoublePlay: true, runners: { first: null, second: runners.second, third: runners.third } };
}

// ── 보정 함수 ─────────────────────────────────────────────────────────────────

function resolveMentalDelta(resultCode: PitchResultCode): number {
  switch (resultCode) {
    case "STRIKE_LOOK": case "STRIKE_SWING": return 0.5;
    case "INPLAY_OUT":  return 0.8;
    case "FIELDING_ERROR": return -1.2;
    case "BALL":        return -0.4;
    case "FOUL":        return -0.1;
    case "WALK":        return -0.9;
    case "HIT_SINGLE":  return -1.0;
    case "HIT_DOUBLE":  return -1.4;
    case "HIT_TRIPLE":  return -1.8;
    case "HOME_RUN":    return -2.4;
    default:            return 0;
  }
}

function countModifier(count: MatchCount): number {
  const { balls: b, strikes: s } = count;
  if (s === 2 && b === 0) return 5;
  if (s === 2 && b === 1) return 3;
  if (s === 2 && b === 2) return 2;
  if (b === 3 && s === 0) return -8;
  if (b === 3 && s === 1) return -5;
  return 0;
}

function applyHitUpgrade(code: PitchResultCode, power: number, weather: WeatherType): PitchResultCode {
  const tuning = getMatchEngineTuning();
  if (code !== "HIT_SINGLE" && code !== "HIT_DOUBLE") return code;
  const powerFactor = (power - 50) / 50;
  const windBonus   = weatherPowerModifier(weather);
  // single → double → HR 체인을 순차 평가 (early return 제거)
  let result: PitchResultCode = code;
  if (result === "HIT_SINGLE") {
    if (Math.random() < Math.max(0, tuning.hitUpgradeSingleToDoubleBase + powerFactor * 0.10 + windBonus)) {
      result = "HIT_DOUBLE";
    }
  }
  if (result === "HIT_DOUBLE") {
    if (Math.random() < Math.max(0, tuning.hitUpgradeDoubleToHomeRunBase + powerFactor * 0.08 + windBonus)) {
      result = "HOME_RUN";
    }
  }
  return result;
}

function weatherQualityModifier(weather: WeatherType, pitchType: PitchType): number {
  const tuning = getMatchEngineTuning();
  switch (weather) {
    case "rainy":     return pitchType === "fastball" ? tuning.weatherQualityModifier.rainyFastball : tuning.weatherQualityModifier.rainyBreaking;
    case "windy_out": return tuning.weatherQualityModifier.windyOut;
    case "windy_in":  return tuning.weatherQualityModifier.windyIn;
    case "cloudy":    return tuning.weatherQualityModifier.cloudy;
    default:          return 0;
  }
}

function weatherPowerModifier(weather: WeatherType): number {
  return getMatchEngineTuning().weatherPowerModifier[weather] ?? 0;
}

function parkQualityModifier(park: ParkType): number {
  return getMatchEngineTuning().parkQualityModifier[park] ?? 0;
}

function pitchPatternModifier(pitchType: PitchType, lastPitches: PitchType[]): number {
  if (lastPitches.length === 0) return 0;
  let consecutive = 0;
  for (let i = lastPitches.length - 1; i >= 0; i--) {
    if (lastPitches[i] === pitchType) consecutive++;
    else break;
  }
  if (consecutive >= 3) return -4;
  if (consecutive >= 2) return -2;
  if (consecutive >= 1) return -1;
  if (!lastPitches.slice(-3).includes(pitchType)) return 1;
  return 0;
}

function jamPressureModifier(state: MatchState, mental: number, batterClutch: number): number {
  const hasScoringPosition = !!(state.runners.second || state.runners.third);
  if (!hasScoringPosition) return 0;
  let pressure = -1;
  if (state.outs === 2) pressure -= 1;
  if (state.runners.first && state.runners.second && state.runners.third) pressure -= 1;
  if (mental < 30) pressure -= 1.5;
  else if (mental < 50) pressure -= 0.5;
  pressure -= (batterClutch - 50) * 0.02;
  return pressure;
}

function clutchModifier(state: MatchState, pitcherClutch: number): number {
  const inningRatio = state.inning / state.inningLimit;
  if (inningRatio < 0.67) return 0;
  const scoreDiff = Math.abs(state.score.home - state.score.away);
  if (scoreDiff > 3) return 0;
  const inningPressure = (inningRatio - 0.67) * 6;
  const scorePressure  = Math.max(0, (3 - scoreDiff) * 0.5);
  const rawPressure    = -(inningPressure + scorePressure) * 0.8;
  const clutchFactor   = 1 - clamp((pitcherClutch - 50) * 0.008, -0.3, 0.3);
  return rawPressure * clutchFactor;
}

// ── 게임 종료 판단 ────────────────────────────────────────────────────────────

function shouldAutoFinish(state: MatchState): boolean {
  if (state.half === "bottom" && state.inning >= state.inningLimit && state.score.home > state.score.away) return true;
  if (state.inning > state.inningLimit && state.score.home !== state.score.away) return true;
  return false;
}

function finishLog(state: MatchState): string {
  if (state.half === "bottom" && state.inning >= state.inningLimit && state.score.home > state.score.away) return "끝내기!";
  return "규정 이닝 종료";
}

// ── 로그/텍스트 ───────────────────────────────────────────────────────────────

function getResultComment(resultCode: PitchResultCode): string {
  switch (resultCode) {
    case "STRIKE_SWING": return "헛스윙 스트라이크";
    case "STRIKE_LOOK":  return "루킹 스트라이크";
    case "BALL":         return "볼";
    case "FOUL":         return "파울";
    case "INPLAY_OUT":   return "타구 아웃";
    case "FIELDING_ERROR": return "실책";
    case "WALK":         return "볼넷";
    case "HIT_SINGLE":   return "안타";
    case "HIT_DOUBLE":   return "2루타";
    case "HIT_TRIPLE":   return "3루타";
    case "HOME_RUN":     return "홈런";
    case "GAME_OVER":    return "경기 종료";
    default:             return "결과 없음";
  }
}

function buildPitchLog(state: MatchState, decision: PitchDecision, resultCode: PitchResultCode, quality: number): string {
  return `[${state.inning}회${state.half === "top" ? "초" : "말"}] ${decision.pitchType} Z${decision.location} ${decision.strategy}/${decision.power} -> ${resultCode} (Q:${quality.toFixed(1)})`;
}

function buildSummary(state: MatchState): string {
  return `${state.score.away}:${state.score.home} 종료 (투구수 ${state.pitchCount}, 체력 ${state.protagonistStamina.toFixed(1)}, 멘탈 ${state.protagonistMental.toFixed(1)})`;
}

// ── NPC 자동 투구 결정 ────────────────────────────────────────────────────────

const CORNERS: PitchLocation[] = [1, 3, 7, 9];
const EDGES:   PitchLocation[] = [2, 4, 6, 8];
const AUTO_TYPES: PitchType[]  = ["fastball", "fastball", "slider", "changeup"];

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

// ── 헤드리스 시뮬 (튜닝 랩 용) ───────────────────────────────────────────────

const _CORNERS: PitchLocation[] = [1, 3, 7, 9];
const _EDGES:   PitchLocation[] = [2, 4, 6, 8];
function randomDecisionForSim(): PitchDecision {
  const types: PitchType[] = ["fastball", "slider", "curve", "changeup"];
  const strats: PitchStrategy[] = ["aggressive", "balanced", "safe"];
  const powers: PitchPower[]    = ["low", "normal", "high"];
  const all = [..._CORNERS, ..._EDGES] as PitchLocation[];
  return {
    pitchType: types[Math.floor(Math.random() * types.length)],
    location:  all[Math.floor(Math.random() * all.length)],
    strategy:  strats[Math.floor(Math.random() * strats.length)],
    power:     powers[Math.floor(Math.random() * powers.length)],
  };
}

export function runSimpleGame(
  pitcher: Partial<PitcherStats>,
  opponentOvr: number,
  protagonistOvr = 62,
): GameSummary {
  let state = startMatch({ protagonistPitcher: pitcher, batterMean: opponentOvr, role: "SP" });
  let strikeouts = 0, hits = 0, walks = 0;
  let safety = 800;

  while (!state.isFinished && safety-- > 0) {
    const prevStrikes = state.count.strikes;
    const decision    = isProtagonistPitching(state) ? randomDecisionForSim() : autoPickDecision(state);
    const { nextState, outcome } = isProtagonistPitching(state)
      ? stepPitch(state, decision)
      : stepPitchCore(state, decision, false);

    const code = outcome.resultCode;
    if ((code === "STRIKE_LOOK" || code === "STRIKE_SWING") && prevStrikes === 2) strikeouts++;
    if (code === "HIT_SINGLE" || code === "HIT_DOUBLE" || code === "HIT_TRIPLE" || code === "HOME_RUN") hits++;
    if (code === "WALK") walks++;
    state = nextState;

    // 주인공 투구 아닌 half는 autoSim
    if (!state.isFinished && !isProtagonistPitching(state)) {
      const simResult = autoSimulateHalfInning(state);
      state = simResult.nextState;
    }
  }

  const runsAllowed = state.score.away + state.score.home;
  const offenseBase = 3.0 + (protagonistOvr - opponentOvr) * 0.05;
  const noise       = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  let homeScore = Math.max(0, Math.round(offenseBase + noise));
  let awayScore = runsAllowed;
  if (homeScore === awayScore) { homeScore > 0 ? homeScore-- : awayScore++; }

  return { homeScore, awayScore, strikeouts, hits, walks };
}
