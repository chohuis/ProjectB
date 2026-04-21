export type HalfInning = "top" | "bottom";
export type PitchType = "fastball" | "slider" | "curve" | "changeup";
export type PitchStrategy = "aggressive" | "balanced" | "safe";
export type PitchPower = "low" | "normal" | "high";
export type PitchLocation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type PitchResultCode =
  | "STRIKE_SWING"
  | "STRIKE_LOOK"
  | "BALL"
  | "FOUL"
  | "INPLAY_OUT"
  | "HIT_SINGLE"
  | "HIT_DOUBLE"
  | "HIT_TRIPLE"
  | "HOME_RUN"
  | "WALK"
  | "GAME_OVER";

export interface MatchScore {
  home: number;
  away: number;
}

export interface MatchRunners {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface MatchCount {
  balls: number;
  strikes: number;
}

export interface MatchState {
  matchId: string;
  inning: number;
  inningLimit: number;
  half: HalfInning;
  outs: number;
  count: MatchCount;
  runners: MatchRunners;
  score: MatchScore;
  pitchCount: number;
  stamina: number;
  mental: number;
  isFinished: boolean;
  logs: string[];
}

export interface MatchStartOptions {
  matchId?: string;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
}

export function createInitialMatchState(options: MatchStartOptions = {}): MatchState {
  return {
    matchId: options.matchId ?? `match-${Date.now()}`,
    inning: 1,
    inningLimit: options.inningLimit ?? 9,
    half: "top",
    outs: 0,
    count: { balls: 0, strikes: 0 },
    runners: { first: false, second: false, third: false },
    score: { home: 0, away: 0 },
    pitchCount: 0,
    stamina: clamp(options.initialStamina ?? 82, 0, 100),
    mental: clamp(options.initialMental ?? 74, 0, 100),
    isFinished: false,
    logs: ["경기 시작"]
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
