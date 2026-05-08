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
export type WeatherType = "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
export type ParkType = "neutral" | "pitcher_park" | "hitter_park" | "dome";

export interface PitcherStats {
  command: number;      // 제구력: 로케이션 정확도 및 루킹 스트라이크 빈도
  velocity: number;     // 구속: 패스트볼 Quality 보정 중심
  staminaCap: number;   // 체력 내구: 투구당 스태미나 소모율 감소
  mentalResil: number;  // 멘탈 회복력: 결과에 따른 멘탈 진폭 완화
  control: number;      // 제구: 볼카운트 조절, 볼넷 억제
  movement: number;     // 무브먼트: 변화구(slider/curve/changeup) Quality 보정
  clutch: number;       // 위기 집중력: clutchModifier에서 mental과 병용
  holdRunners: number;  // 견제력: 도루 시도율 억제 계수
}

export interface BatterStats {
  contact: number;       // 컨택: 공을 맞추는 능력 → Quality 페널티
  power: number;         // 장타력: 안타의 종류 업그레이드 확률
  eye: number;           // 선구안: 볼/스트라이크 판단 → Quality 추가 페널티
  discipline: number;    // 극기: STRIKE_SWING 확률 감소
  battingClutch: number; // 클러치: jamPressureModifier 타자 저항력
  platoon: number;       // 플래툰 내성: 반대 손 투수 대응 (50=평균)
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

export interface RunnerStats {
  speed: number;    // 주루 속도 (1-99): 도루 성공률, 여분 베이스 진루 여부
  instinct: number; // 주루 판단력 (1-99): 시도 빈도 및 적극성
}

export interface MatchRunners {
  first: RunnerStats | null;
  second: RunnerStats | null;
  third: RunnerStats | null;
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
  batter: BatterStats;
  batterMean: number; // 상대팀 타자 평균 능력치 (타자 생성 기준)
  weather: WeatherType;
  park: ParkType;
  lastPitchTypes: PitchType[]; // 직전 최대 5구 히스토리 (패턴 보정용)
  isFinished: boolean;
  logs: string[];
}

export interface MatchStartOptions {
  matchId?: string;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
  pitcher?: Partial<PitcherStats>;
  batterMean?: number;
  weather?: WeatherType;
  park?: ParkType;
}

export function createInitialMatchState(options: MatchStartOptions = {}): MatchState {
  const pitcher: PitcherStats = {
    command:      options.pitcher?.command      ?? 50,
    velocity:     options.pitcher?.velocity     ?? 52,
    staminaCap:   options.pitcher?.staminaCap   ?? 55,
    mentalResil:  options.pitcher?.mentalResil  ?? 48,
    control:      options.pitcher?.control      ?? 50,
    movement:     options.pitcher?.movement     ?? 50,
    clutch:       options.pitcher?.clutch       ?? 50,
    holdRunners:  options.pitcher?.holdRunners  ?? 50,
  };
  const batterMean = options.batterMean ?? 50;
  const batter: BatterStats = createBatter(batterMean);
  return {
    matchId: options.matchId ?? `match-${Date.now()}`,
    inning: 1,
    inningLimit: options.inningLimit ?? 9,
    half: "top",
    outs: 0,
    count: { balls: 0, strikes: 0 },
    runners: { first: null, second: null, third: null },
    score: { home: 0, away: 0 },
    pitchCount: 0,
    stamina: clamp(options.initialStamina ?? 82, 0, 100),
    mental: clamp(options.initialMental ?? 74, 0, 100),
    pitcher,
    batter,
    batterMean,
    weather: options.weather ?? "sunny",
    park: options.park ?? "neutral",
    lastPitchTypes: [],
    isFinished: false,
    logs: ["경기 시작"]
  };
}

export function createBatter(mean: number): BatterStats {
  const spread = 18;
  const rand = () => clamp(mean + Math.round((Math.random() * 2 - 1) * spread), 10, 95);
  return {
    contact:      rand(),
    power:        rand(),
    eye:          rand(),
    discipline:   rand(),
    battingClutch: rand(),
    platoon:      50, // 기본값 평균 — 플래툰 편향 없음
  };
}

export function createRunner(mean: number): RunnerStats {
  const spread = 18;
  const rand = () => clamp(mean + Math.round((Math.random() * 2 - 1) * spread), 10, 95);
  return { speed: rand(), instinct: rand() };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
