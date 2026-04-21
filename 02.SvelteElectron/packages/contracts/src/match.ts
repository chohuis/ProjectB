export type MatchMode = "interactive" | "simulation" | "text_highlight";
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

export interface MatchScoreDto {
  home: number;
  away: number;
}

export interface MatchRunnersDto {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface MatchCountDto {
  balls: number;
  strikes: number;
}

export interface MatchSnapshotDto {
  matchId: string;
  inning: number;
  inningLimit: number;
  half: HalfInning;
  outs: number;
  count: MatchCountDto;
  score: MatchScoreDto;
  runners: MatchRunnersDto;
  pitchCount: number;
  stamina: number;
  mental: number;
  isFinished: boolean;
  recentLogs: string[];
}

export interface MatchStartRequestDto {
  matchId?: string;
  mode?: MatchMode;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
}

export interface PitchDecisionDto {
  pitchType: PitchType;
  location: PitchLocation;
  strategy: PitchStrategy;
  power: PitchPower;
}

export interface PitchOutcomeDto {
  resultCode: PitchResultCode;
  quality: number;
  comment: string;
}

export interface MatchStartResponseDto {
  snapshot: MatchSnapshotDto;
}

export interface MatchStepResponseDto {
  snapshot: MatchSnapshotDto;
  outcome: PitchOutcomeDto;
}

export interface MatchFinishResponseDto {
  snapshot: MatchSnapshotDto;
  summary: string;
}
