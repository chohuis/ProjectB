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

// ── 수비 시스템 ────────────────────────────────────────────────────────────────
export type FieldPosition = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
export type BallHitType = "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt";

export interface FielderStats {
  position: FieldPosition;
  name: string;
  fielding: number;  // 수비 능력 (1-99)
  arm: number;       // 어깨 — 송구 속도/정확도 (1-99)
  speed: number;     // 이동 속도 (1-99)
  x: number;        // 필드 좌표 (0-100, 좌→우)
  y: number;        // 필드 좌표 (0-100, 홈→외야)
}

export interface BallInPlay {
  hitType: BallHitType;
  zone: FieldPosition;   // 주 담당 수비 구역
  hardness: number;      // 타구 강도 1(약)~5(강)
}

export interface FieldingResult {
  fielder: FielderStats;
  isError: boolean;
  threwTo?: FieldPosition;
  throwResult?: "out" | "safe";
  runnerExtraAdvance: number; // 실책/느린 처리로 추가 진루한 베이스 수 (0~2)
}

export type AnimationCue =
  | { type: "ball_pitch"; from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
  | { type: "ball_batted"; from: { x: number; y: number }; to: { x: number; y: number }; arc: number; hitType: BallHitType; duration: number }
  | { type: "fielder_move"; position: FieldPosition; to: { x: number; y: number }; duration: number }
  | { type: "ball_throw"; from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
  | { type: "runner_advance"; runnerId: "first" | "second" | "third" | "batter"; toBase: "1B" | "2B" | "3B" | "home"; duration: number }
  | { type: "show_result"; text: string; tone: "good" | "bad" | "neutral"; x: number; y: number };

export interface DefenseStat {
  errors: number;
  assists: number;
  throwOuts: number;
  throwSafes: number;
}

export const FIELDER_DEFAULT_POSITIONS: Record<FieldPosition, { x: number; y: number }> = {
  "P":  { x: 50, y: 62 },
  "C":  { x: 50, y: 90 },
  "1B": { x: 78, y: 70 },
  "2B": { x: 63, y: 55 },
  "3B": { x: 22, y: 70 },
  "SS": { x: 37, y: 55 },
  "LF": { x: 18, y: 28 },
  "CF": { x: 50, y: 16 },
  "RF": { x: 82, y: 28 },
};

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
  speed: number;         // 주루 속도 — createRunner로 복사
  baseInstinct: number;  // 주루 판단 — createRunner로 복사
  fielding: number;      // 수비 능력
  arm: number;           // 어깨 (송구)
}

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
  opponentLineup: BatterStats[]; // 상대팀 타자 라인업 풀 (순환)
  lineupIndex: number;           // 현재 타자 순서 인덱스
  weather: WeatherType;
  park: ParkType;
  lastPitchTypes: PitchType[]; // 직전 최대 5구 히스토리 (패턴 보정용)
  isFinished: boolean;
  logs: string[];
  fielders: FielderStats[];
  defenseStat: DefenseStat;
}

export interface MatchStartOptions {
  matchId?: string;
  inningLimit?: number;
  initialStamina?: number;
  initialMental?: number;
  pitcher?: Partial<PitcherStats>;
  batterMean?: number;
  opponentLineup?: BatterStats[]; // 실제 상대팀 타자 데이터 (없으면 random 생성)
  weather?: WeatherType;
  park?: ParkType;
  fielders?: FielderStats[];
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
  // 라인업 풀: 전달되면 사용, 없으면 9명 random 생성
  const opponentLineup: BatterStats[] = options.opponentLineup && options.opponentLineup.length > 0
    ? options.opponentLineup
    : Array.from({ length: 9 }, () => createBatter(batterMean));
  const batter: BatterStats = { ...opponentLineup[0] };
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
    opponentLineup,
    lineupIndex: 0,
    weather: options.weather ?? "sunny",
    park: options.park ?? "neutral",
    lastPitchTypes: [],
    isFinished: false,
    logs: ["경기 시작"],
    fielders: options.fielders ?? createDefaultFielders(50),
    defenseStat: { errors: 0, assists: 0, throwOuts: 0, throwSafes: 0 },
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
    platoon:      50,
    speed:        rand(),
    baseInstinct: rand(),
    fielding:     rand(),
    arm:          rand(),
  };
}

export function createRunner(batter: BatterStats): RunnerStats {
  return { speed: batter.speed, instinct: batter.baseInstinct };
}

export function createDefaultFielders(mean: number): FielderStats[] {
  const spread = 15;
  const rand = () => clamp(mean + Math.round((Math.random() * 2 - 1) * spread), 10, 90);
  const positions: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  const names: Record<FieldPosition, string> = {
    "P": "투수", "C": "포수", "1B": "1루수", "2B": "2루수",
    "3B": "3루수", "SS": "유격수", "LF": "좌익수", "CF": "중견수", "RF": "우익수",
  };
  return positions.map((pos) => ({
    position: pos,
    name: names[pos],
    fielding: rand(),
    arm: rand(),
    speed: rand(),
    x: FIELDER_DEFAULT_POSITIONS[pos].x,
    y: FIELDER_DEFAULT_POSITIONS[pos].y,
  }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
