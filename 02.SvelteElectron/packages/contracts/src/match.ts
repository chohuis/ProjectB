export type MatchMode = "interactive" | "simulation" | "text_highlight";
export type HalfInning = "top" | "bottom";

export type PitchType =
  | "fastball"
  | "sinker"
  | "cutter"
  | "slider"
  | "curve"
  | "changeup"
  | "splitter"
  | "forkball"
  | "screwball"
  | "knuckleball";
export type PitchStrategy = "aggressive" | "balanced" | "safe";
export type PitchPower = "low" | "normal" | "high";
export type PitchLocation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type PitchResultCode =
  | "STRIKE_SWING"
  | "STRIKE_LOOK"
  | "BALL"
  | "FOUL"
  | "INPLAY_OUT"
  | "FIELDING_ERROR"
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
  batter?: {
    contact: number;
    power: number;
    eye: number;
    discipline: number;
    battingClutch: number;
    platoon: number;
    speed: number;
    baseInstinct: number;
    fielding: number;
    arm: number;
  };
  lineupIndex?: number;
  weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
  isFinished: boolean;
  recentLogs: string[];
  fielders?: Array<{
    position: "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
    name: string;
    fielding: number;
    arm: number;
    speed: number;
    x: number;
    y: number;
  }>;
  defenseStat?: {
    errors: number;
    assists: number;
    throwOuts: number;
    throwSafes: number;
  };
}

export interface MatchStartRequestDto {
  matchId?: string;
  mode?: MatchMode;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
  pitcher?: {
    command?: number;
    velocity?: number;
    staminaCap?: number;
    mentalResil?: number;
    control?: number;
    movement?: number;
    clutch?: number;
    holdRunners?: number;
  };
  batterMean?: number;
  opponentLineup?: Array<{
    contact: number;
    power: number;
    eye: number;
    discipline: number;
    battingClutch: number;
    platoon: number;
    speed: number;
    baseInstinct: number;
    fielding: number;
    arm: number;
  }>;
  weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
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
  animationCues?: Array<
    | { type: "ball_pitch"; from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
    | { type: "ball_batted"; from: { x: number; y: number }; to: { x: number; y: number }; arc: number; hitType: "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt"; duration: number }
    | { type: "fielder_move"; position: "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF"; to: { x: number; y: number }; duration: number }
    | { type: "ball_throw"; from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
    | { type: "runner_advance"; runnerId: "first" | "second" | "third" | "batter"; toBase: "1B" | "2B" | "3B" | "home"; duration: number }
    | { type: "show_result"; text: string; tone: "good" | "bad" | "neutral"; x: number; y: number }
  >;
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
