export type HalfInning = "top" | "bottom";
export type PitchType = "fastball" | "slider" | "curve" | "changeup";
export type PitchStrategy = "aggressive" | "balanced" | "safe";
export type PitchPower = "low" | "normal" | "high";
export type PitchLocation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PitcherStats {
  command: number;    // 제구력: 로케이션 정확도 및 루킹 스트라이크 빈도
  velocity: number;  // 구속: 패스트볼 Quality 보정 중심
  staminaCap: number; // 체력 내구: 투구당 스태미나 소모율 감소
  mentalResil: number; // 멘탈 회복력: 결과에 따른 멘탈 진폭 완화
}

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
  pitcher: PitcherStats;
  isFinished: boolean;
  logs: string[];
}

export interface MatchStartOptions {
  matchId?: string;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
  pitcher?: Partial<PitcherStats>;
}

export function createInitialMatchState(options: MatchStartOptions = {}): MatchState {
  const pitcher: PitcherStats = {
    command: options.pitcher?.command ?? 50,
    velocity: options.pitcher?.velocity ?? 52,
    staminaCap: options.pitcher?.staminaCap ?? 55,
    mentalResil: options.pitcher?.mentalResil ?? 48,
  };
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
    pitcher,
    isFinished: false,
    logs: ["경기 시작"]
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
