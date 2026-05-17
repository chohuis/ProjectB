export type HalfInning = "top" | "bottom";
export type PitcherRole = "SP" | "RP" | "CP";

export type PitchType =
  | "fastball" | "sinker" | "cutter" | "slider" | "curve"
  | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball";
export type PitchStrategy = "aggressive" | "balanced" | "safe";
export type PitchPower = "low" | "normal" | "high";
export type PitchLocation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type WeatherType = "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
export type ParkType = "neutral" | "pitcher_park" | "hitter_park" | "dome";
export type FieldPosition = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
export type BallHitType = "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt";

export interface FielderStats {
  position: FieldPosition;
  name: string;
  fielding: number;
  arm: number;
  speed: number;
  x: number;
  y: number;
}

export interface BallInPlay {
  hitType: BallHitType;
  zone: FieldPosition;
  hardness: number;
}

export interface FieldingResult {
  fielder: FielderStats;
  isError: boolean;
  threwTo?: FieldPosition;
  throwResult?: "out" | "safe";
  runnerExtraAdvance: number;
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
  "P":  { x: 50, y: 62 }, "C":  { x: 50, y: 90 },
  "1B": { x: 78, y: 70 }, "2B": { x: 63, y: 55 },
  "3B": { x: 22, y: 70 }, "SS": { x: 37, y: 55 },
  "LF": { x: 18, y: 28 }, "CF": { x: 50, y: 16 }, "RF": { x: 82, y: 28 },
};

export interface PitcherStats {
  command: number;
  velocity: number;
  staminaCap: number;
  mentalResil: number;
  control: number;
  movement: number;
  clutch: number;
  holdRunners: number;
}

export interface BatterStats {
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
}

export type PitchResultCode =
  | "STRIKE_SWING" | "STRIKE_LOOK" | "BALL" | "FOUL"
  | "INPLAY_OUT" | "FIELDING_ERROR"
  | "HIT_SINGLE" | "HIT_DOUBLE" | "HIT_TRIPLE" | "HOME_RUN"
  | "WALK" | "GAME_OVER";

export interface MatchScore { home: number; away: number; }

export interface RunnerStats { speed: number; instinct: number; }

export interface MatchRunners {
  first: RunnerStats | null;
  second: RunnerStats | null;
  third: RunnerStats | null;
}

export interface MatchCount { balls: number; strikes: number; }

// ── 감독 능력치 ────────────────────────────────────────────────────────────────
export interface ManagerStats {
  tacticalIQ: number;      // 투수 교체 타이밍 판단력 (50=평균)
  bullpenRead: number;     // 불펜 기용 판단 (구원 투수 품질 결정)
  offenseMind: number;     // 공격 전술 (번트/도루 빈도·정확도)
  motivator: number;       // 마운드 방문 멘탈 회복 배율
  clutchDecision: number;  // 위기 상황 교체 판단 민감도
}

// ── 등판 조건 ─────────────────────────────────────────────────────────────────
export type EntryTrigger =
  | { type: "inning_start"; inning: number }
  | { type: "mid_inning"; inning: number; maxOuts: number }
  | { type: "close_game"; inningThreshold: number; maxLeadDiff: number }
  | { type: "manual"; inning: number; half: HalfInning; outs: number; runners: MatchRunners };

// ── NPC 투수 추적 (my팀 / 상대팀) ─────────────────────────────────────────────
export interface NpcPitcherTracker {
  my: number;
  opponent: number;
}

// ── 전체 경기 상태 ─────────────────────────────────────────────────────────────
export interface MatchState {
  matchId: string;
  inning: number;
  inningLimit: number;
  half: HalfInning;
  outs: number;
  count: MatchCount;
  runners: MatchRunners;
  score: MatchScore;
  inningScores: { home: number[]; away: number[] };  // 이닝별 득점
  pitchCount: number;                                // 경기 전체 투구수

  // 팀 식별
  protagonistSide: "home" | "away";

  // 투수 3종 (역할별 구분)
  protagonistPitcher: PitcherStats;   // 주인공 투수 스탯
  myNpcPitcher: PitcherStats;         // 아군 NPC 투수 (등판 전/후)
  opponentNpcPitcher: PitcherStats;   // 상대 NPC 투수

  // 라인업
  homeLineup: BatterStats[];
  awayLineup: BatterStats[];
  homeLineupIndex: number;
  awayLineupIndex: number;
  batterMean: number;

  // 역할 / 등판 시스템
  role: PitcherRole;
  entryTrigger: EntryTrigger;
  protagonistHasEntered: boolean;
  protagonistExited: boolean;
  pitchCountSinceEntry: number;
  protagonistStamina: number;
  protagonistMental: number;

  // NPC 투수 상태 추적
  npcPitcherStamina: NpcPitcherTracker;
  npcPitcherMental: NpcPitcherTracker;
  npcPitcherPitchCount: NpcPitcherTracker;

  // 인계 주자 (주인공 등판 시점 주자)
  inheritedRunners: MatchRunners;

  // 감독
  myManager: ManagerStats;
  opponentManager: ManagerStats;
  moundVisitsLeft: number;
  lastMoundVisitPitch: number;

  // 등판 전 자동 시뮬 요약
  preEntryLogs: string[];

  // 투구 패턴 히스토리 (최근 5구)
  lastPitchTypes: PitchType[];

  // 환경
  weather: WeatherType;
  park: ParkType;

  // 게임 상태
  isFinished: boolean;
  logs: string[];
  fielders: FielderStats[];
  defenseStat: DefenseStat;
}

export interface MatchStartOptions {
  matchId?: string;
  inningLimit?: number;

  // 주인공 역할 설정
  protagonistSide?: "home" | "away";
  role?: PitcherRole;
  entryTrigger?: EntryTrigger;

  // 투수 스탯
  protagonistPitcher?: Partial<PitcherStats>;
  pitcher?: Partial<PitcherStats>;            // 레거시 호환 (protagonistPitcher 별칭)
  opponentPitcher?: Partial<PitcherStats>;
  npcStarterPitcher?: Partial<PitcherStats>;  // 아군 NPC 선발 (RP/CP용)

  // 라인업
  homeLineup?: BatterStats[];
  awayLineup?: BatterStats[];
  opponentLineup?: BatterStats[];             // 레거시 호환
  myTeamLineup?: BatterStats[];               // 아군 타선
  batterMean?: number;

  // 초기 컨디션
  initialStamina?: number;
  initialMental?: number;

  // 감독
  myManager?: Partial<ManagerStats>;
  opponentManager?: Partial<ManagerStats>;

  // 환경
  weather?: WeatherType;
  park?: ParkType;
  fielders?: FielderStats[];
}

// ── 생성 헬퍼 ─────────────────────────────────────────────────────────────────

export function createInitialMatchState(options: MatchStartOptions = {}): MatchState {
  const protagonistSide = options.protagonistSide ?? "home";
  const role = options.role ?? "SP";
  const entryTrigger: EntryTrigger = options.entryTrigger
    ?? { type: "inning_start", inning: 1 };

  const protagonistPitcherOpts = options.protagonistPitcher ?? options.pitcher ?? {};
  const opponentPitcherOpts    = options.opponentPitcher ?? {};
  const npcStarterOpts         = options.npcStarterPitcher ?? {};

  const buildPitcher = (opts: Partial<PitcherStats>): PitcherStats => ({
    command:     opts.command     ?? 50,
    velocity:    opts.velocity    ?? 52,
    staminaCap:  opts.staminaCap  ?? 55,
    mentalResil: opts.mentalResil ?? 48,
    control:     opts.control     ?? 50,
    movement:    opts.movement    ?? 50,
    clutch:      opts.clutch      ?? 50,
    holdRunners: opts.holdRunners ?? 50,
  });

  const protagonistPitcher  = buildPitcher(protagonistPitcherOpts);
  const opponentNpcPitcher  = buildPitcher(opponentPitcherOpts);
  // 아군 NPC 선발은 주인공 스탯보다 살짝 낮게 기본값 설정
  const myNpcPitcher = buildPitcher({
    command:    npcStarterOpts.command     ?? 48,
    velocity:   npcStarterOpts.velocity    ?? 50,
    staminaCap: npcStarterOpts.staminaCap  ?? 52,
    mentalResil:npcStarterOpts.mentalResil ?? 48,
    control:    npcStarterOpts.control     ?? 48,
    movement:   npcStarterOpts.movement    ?? 48,
    clutch:     npcStarterOpts.clutch      ?? 48,
    holdRunners:npcStarterOpts.holdRunners ?? 48,
  });

  const batterMean = options.batterMean ?? 50;
  const inningLimit = options.inningLimit ?? 9;

  // 라인업 빌드 (레거시 opponentLineup 지원)
  const fallbackOpponentLineup = options.opponentLineup
    ?? Array.from({ length: 9 }, () => createBatter(batterMean));
  const fallbackMyLineup = options.myTeamLineup
    ?? Array.from({ length: 9 }, () => createBatter(batterMean));

  let homeLineup: BatterStats[];
  let awayLineup: BatterStats[];
  if (protagonistSide === "home") {
    homeLineup = options.homeLineup ?? fallbackMyLineup;
    awayLineup = options.awayLineup ?? fallbackOpponentLineup;
  } else {
    homeLineup = options.homeLineup ?? fallbackOpponentLineup;
    awayLineup = options.awayLineup ?? fallbackMyLineup;
  }

  // SP는 즉시 등판, RP/CP는 조건 충족 시 등판
  const isImmediateEntry =
    entryTrigger.type === "inning_start" && entryTrigger.inning <= 1;

  const initialStamina = clamp(options.initialStamina ?? 82, 0, 100);
  const initialMental  = clamp(options.initialMental  ?? 74, 0, 100);

  return {
    matchId: options.matchId ?? `match-${Date.now()}`,
    inning: 1,
    inningLimit,
    half: "top",
    outs: 0,
    count: { balls: 0, strikes: 0 },
    runners: { first: null, second: null, third: null },
    score: { home: 0, away: 0 },
    inningScores: {
      home: Array(inningLimit).fill(0),
      away: Array(inningLimit).fill(0),
    },
    pitchCount: 0,

    protagonistSide,
    protagonistPitcher,
    myNpcPitcher,
    opponentNpcPitcher,

    homeLineup,
    awayLineup,
    homeLineupIndex: 0,
    awayLineupIndex: 0,
    batterMean,

    role,
    entryTrigger,
    protagonistHasEntered: isImmediateEntry,
    protagonistExited: false,
    pitchCountSinceEntry: 0,
    protagonistStamina: initialStamina,
    protagonistMental: initialMental,

    npcPitcherStamina:   { my: 80, opponent: 80 },
    npcPitcherMental:    { my: 72, opponent: 72 },
    npcPitcherPitchCount:{ my: 0,  opponent: 0  },

    inheritedRunners: { first: null, second: null, third: null },

    myManager:       createManager(options.myManager ?? {}),
    opponentManager: createManager(options.opponentManager ?? {}),
    moundVisitsLeft: 3,
    lastMoundVisitPitch: -10,

    preEntryLogs: [],
    lastPitchTypes: [],

    weather: options.weather ?? "sunny",
    park:    options.park    ?? "neutral",

    isFinished: false,
    logs: ["경기 시작"],
    fielders: options.fielders ?? createDefaultFielders(50),
    defenseStat: { errors: 0, assists: 0, throwOuts: 0, throwSafes: 0 },
  };
}

export function createManager(opts: Partial<ManagerStats> = {}): ManagerStats {
  return {
    tacticalIQ:     opts.tacticalIQ     ?? 50,
    bullpenRead:    opts.bullpenRead    ?? 50,
    offenseMind:    opts.offenseMind    ?? 50,
    motivator:      opts.motivator      ?? 50,
    clutchDecision: opts.clutchDecision ?? 50,
  };
}

export function createBatter(mean: number): BatterStats {
  const spread = 18;
  const rand = () => clamp(mean + Math.round((Math.random() * 2 - 1) * spread), 10, 95);
  return {
    contact: rand(), power: rand(), eye: rand(), discipline: rand(),
    battingClutch: rand(), platoon: 50,
    speed: rand(), baseInstinct: rand(), fielding: rand(), arm: rand(),
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
    position: pos, name: names[pos],
    fielding: rand(), arm: rand(), speed: rand(),
    x: FIELDER_DEFAULT_POSITIONS[pos].x, y: FIELDER_DEFAULT_POSITIONS[pos].y,
  }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
