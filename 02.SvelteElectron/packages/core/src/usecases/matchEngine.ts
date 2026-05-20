import type {
  MatchState,
  MatchStartOptions,
} from "../domain/matchState";
import type {
  BallInPlay,
  FieldingResult,
  AnimationCue,
  PitchLocation,
  PitchTarget,
  PitchResultCode,
  PitcherStats,
} from "../domain/matchState";

// ── 공개 타입 (UI와 계약) ─────────────────────────────────────────────────────

export interface PitchDecision {
  pitchType: import("../domain/matchState").PitchType;
  location: PitchLocation;
  target?: PitchTarget;
  strategy: import("../domain/matchState").PitchStrategy;
  power: import("../domain/matchState").PitchPower;
}

export interface PitchOutcome {
  resultCode: PitchResultCode;
  quality: number;
  comment: string;
  ballInPlay?: BallInPlay;
  fieldingResult?: FieldingResult;
  animationCues: AnimationCue[];
  landingTarget: PitchTarget;
}

export interface MatchStepResult {
  nextState: MatchState;
  outcome: PitchOutcome;
}

export interface AtBatLog {
  pitcherName: string;
  batterName:  string;
  resultCode:  PitchResultCode;
  pitchCount:  number;
  runsScored:  number;
}

export interface HalfInningSimResult {
  nextState: MatchState;
  runs: number;
  hits: number;
  walks: number;
  strikeouts: number;
  logs: string[];
  atBats: AtBatLog[];
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

// ── 네이티브 엔진 주입 ────────────────────────────────────────────────────────

type NativeEngine = {
  startMatchNative(optionsJson: string): string;
  stepPitchNative(stateJson: string, decisionJson: string): string;
  finishMatchNative(stateJson: string): string;
  isProtagonistPitchingNative(stateJson: string): boolean;
  advanceGamePhaseNative(stateJson: string): string;
  simUntilEntry(stateJson: string): string;
  simToGameEnd(stateJson: string): string;
  simHalfInning(stateJson: string): string;
  autoMoundVisitNative(stateJson: string): string;
  requestMoundVisitNative(stateJson: string): string;
  shouldProtagonistExitNative(stateJson: string): string;
  runSimpleGame(paramsJson: string): string;
};

let _native: NativeEngine | null = null;

/** main.cjs에서 엔진 초기화 시 호출 */
export function setNativeEngine(native: NativeEngine): void {
  _native = native;
}

function n(): NativeEngine {
  if (!_native) {
    throw new Error("[core/matchEngine] 네이티브 엔진이 초기화되지 않았습니다. setNativeEngine()을 먼저 호출하세요.");
  }
  return _native;
}

function parse<T>(json: string): T {
  const parsed = JSON.parse(json) as { error?: string } & T;
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    throw new Error(String(parsed.error));
  }
  return parsed as T;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

export function startMatch(options: MatchStartOptions = {}): MatchState {
  return parse<MatchState>(n().startMatchNative(JSON.stringify(options)));
}

export function finishMatch(state: MatchState): { nextState: MatchState; summary: string } {
  return parse(n().finishMatchNative(JSON.stringify(state)));
}

export function isProtagonistPitching(state: MatchState): boolean {
  return n().isProtagonistPitchingNative(JSON.stringify(state));
}

export function stepPitch(state: MatchState, decision: PitchDecision): MatchStepResult {
  return parse<MatchStepResult>(n().stepPitchNative(JSON.stringify(state), JSON.stringify(decision)));
}

export function advanceGamePhase(state: MatchState): GamePhaseResult {
  return parse<GamePhaseResult>(n().advanceGamePhaseNative(JSON.stringify(state)));
}

export function autoSimulateUntilEntry(state: MatchState): MatchState {
  return parse<MatchState>(n().simUntilEntry(JSON.stringify(state)));
}

export function autoSimulateToGameEnd(state: MatchState): MatchState {
  return parse<MatchState>(n().simToGameEnd(JSON.stringify(state)));
}

export function autoSimulateHalfInning(state: MatchState): HalfInningSimResult {
  return parse<HalfInningSimResult>(n().simHalfInning(JSON.stringify(state)));
}

export function autoMoundVisitIfNeeded(state: MatchState): MatchState {
  return parse<MatchState>(n().autoMoundVisitNative(JSON.stringify(state)));
}

export function requestMoundVisit(state: MatchState): MatchState {
  return parse<MatchState>(n().requestMoundVisitNative(JSON.stringify(state)));
}

export function shouldProtagonistExit(
  state: MatchState
): { shouldExit: boolean; reason: ExitReason | null } {
  return parse(n().shouldProtagonistExitNative(JSON.stringify(state)));
}

export function runSimpleGame(
  pitcher: Partial<PitcherStats>,
  opponentOvr: number,
  protagonistOvr = 62,
): GameSummary {
  return parse<GameSummary>(n().runSimpleGame(JSON.stringify({ pitcher, opponentOvr, protagonistOvr })));
}
