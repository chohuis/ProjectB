import type { MessageItem } from "./main";

// ── 능력치 블록 ────────────────────────────────────────────────
export interface PitchingAttributes {
  ovr: number;
  stamina: number;
  velocity: number;
  command: number;
  control: number;
  movement: number;
  mentality: number;
  recovery: number;
  clutch: number;  // 위기 집중력: 후반 접전/득점권 압박 시 quality 보정
  holdRunners: number;  // 견제력: 도루 시도율 억제 계수
}

export type PitchingStatKey = Exclude<keyof PitchingAttributes, "ovr">;

export interface BattingAttributes {
  ovr: number;
  contact: number;
  power: number;
  eye: number;
  discipline: number;
  speed: number;
  baseInstinct: number;  // 주루 판단: 여분 베이스 진루 시도 빈도
  bunting: number;  // 번트: 번트 타구 품질 보정
  platoon: number;  // 플래툰 내성: 반대 손 투수 대응 능력 (50=평균)
  fielding: number;
  arm: number;
  battingClutch: number;
}

export type BattingStatKey = Exclude<keyof BattingAttributes, "ovr">;

// ── 포지션 숙련도 ────────────────────────────────────────────────
export type PositionKey = "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "SP" | "RP";
export type PositionRatings = Partial<Record<PositionKey, number>>;

// ── 투수 역할 ──────────────────────────────────────────────────
export type PitcherRole =
  | "1선발" | "2선발" | "3선발" | "4선발" | "5선발"
  | "롱릴리프" | "중간계투" | "셋업맨" | "마무리" | "패전처리"
  | "스윙맨" | "오프너";

// ── 감독 능력치 ────────────────────────────────────────────────
export interface ManagerAttributes {
  motivation: number;      // 선수 모랄 주간 보정
  development: number;     // 팀 전체 devFactor 보정
  strategy: number;        // 경기 전술 의사결정
  handlePressure: number;  // 압박 상황 관리
  handlePersonnel: number; // 선수 기용/트레이드/방출 결정
  rotationMgmt?: number;   // 선발 로테이션 운용 능력 (50 기본)
  bullpenMgmt?: number;    // 불펜 운용 능력 (50 기본)
}

// ── 코치 능력치 ────────────────────────────────────────────────
export type CoachSpecialty = "pitching" | "batting" | "fielding" | "running";

export interface CoachAttributes {
  teaching: number;  // XP 획득량 보정 계수
  analytics: number;  // 상대 분석 능력
  experience: number;  // 레벨 1~5
  specialty: CoachSpecialty;
}

// ── 구종 시스템 ───────────────────────────────────────────────
export type PitchGrade = 1 | 2 | 3 | 4 | 5;  // 1=습득중 2=기초 3=보통 4=능숙 5=마스터
export interface PitchEntry {
  id: string;
  grade: PitchGrade;
}

// ── 주인공 저장 데이터 ─────────────────────────────────────────
export type CareerStage  = "highschool" | "university" | "pro" | "independent" | "military" | "pro_kbl" | "pro_abl";
export type PlayerType   = "pitcher" | "batter" | "twoWay";
export type Handedness   = "L" | "R" | "S";
export type PitchingForm = "overhand" | "threeQuarter" | "sidearm" | "underhand";

export interface ProContract {
  teamId: string;
  leagueId: string;
  salary: number;  // 연간 연봉 (만 원 단위)
  durationYears: number;  // 총 계약 기간
  remainingYears: number;  // 시즌 종료마다 감산
  signingBonus: number;
  teamOptionYears: number;  // 0이면 없음
  playerOptionYears: number;  // 0이면 없음
  noTrade: boolean;
  incentives?: { condition: string; bonus: number }[];
  status: "active" | "expired" | "voided";
}

export interface ProtagonistSave {
  id: string;  // 고정 ID (예: "PLY_HERO")
  name: string;
  nameEn?: string;
  careerStage: CareerStage;
  leagueId: string;  // 현재 소속 리그
  teamId: string;  // 현재 소속 팀
  schoolId?: string;  // 고교·대학 단계
  grade?: 1 | 2 | 3;  // 고교/대학 재학 중일 때만 존재
  age: number;
  playerType: PlayerType;
  position: string;  // "SP" | "RP" | "CP" | "" (미정)
  handedness: Handedness;
  pitchingForm?: PitchingForm;  // 투구 폼 (투수 전용)
  jerseyNumber: number;

  // 현재 상태 (주 단위로 변동)
  condition: number;                 // 0~100: 컨디션
  fatigue: number;                   // 0~100: 피로도
  morale: number;                    // 0~100: 사기

  // 능력치 (성장 반영된 현재값)
  pitching: PitchingAttributes;
  batting: BattingAttributes;

  // 포지션 데이터
  primaryPosition: PositionKey;
  positionRatings: PositionRatings;

  // 캐릭터 속성
  diligence: number;  // 성실함 1–99: growthEngine devFactor 보정
  popularity: number;  // 인기도 0–100: 스카우트 관심도·팬 반응

  // 성장 잠재력
  developmentRate: number;           // 45~75
  potentialHidden: number;  // 60–99 (숨겨진 잠재력)
  growthPoints: number;  // 미사용 성장 포인트
  tags: string[];  // ["급성장", "멘탈관리", …]

  // XP 누적 (주간 성장 엔진용)
  pitchingXP: Partial<Record<PitchingStatKey, number>>;
  battingXP: Partial<Record<BattingStatKey, number>>;

  // 구종 시스템
  pitches: PitchEntry[];                               // 보유 구종 목록 (id + 등급)
  trainingPitchState?: { id: string; progress: number };  // 현재 훈련 중인 구종
  money: number;
  fame: number;
  scoutScore: number;
  proServiceYears: number;
  militaryUnit: "sports" | "general" | null;
  militaryServiceWeeks: number;
  militaryRecoveryWeeks: number;
  tradeAdaptationWeeks: number;
  faNegotiationRound: number;
  faUnsignedWeeks: number;
  contract?: ProContract;
  consecutiveLowMoraleWeeks: number;
  consecutiveHighFatigueWeeks: number;
  injury?: {
    type: "light" | "moderate" | "severe";
    recoveryWeeksLeft: number;
  };
  currentRole?: PitcherRole;  // 현재 시즌 역할 (시즌 시작 시 배정)
}

// ── 시즌 스탯 (선수 1명분) ─────────────────────────────────────
export interface PitcherSeasonStats {
  type: "pitcher";
  g: number;      // 등판 경기 수
  gs: number;     // 선발 등판 수
  w: number;      // 승
  l: number;      // 패
  sv: number;     // 세이브
  hd: number;     // 홀드
  ip: number;     // 이닝 (소수점: 31.2 → 31이닝 2/3)
  er: number;     // 자책점
  h: number;      // 피안타
  k: number;      // 탈삼진
  bb: number;     // 볼넷
  era: number;  // 평균자책점 (계산값: er*9/ip)
  whip: number;  // 계산값: (bb+h)/ip
}

export interface BatterSeasonStats {
  type: "batter";
  g: number;      // 출전 경기 수
  pa: number;     // 타석
  ab: number;     // 타수
  h: number;      // 안타
  hr: number;  // 홈런
  rbi: number;    // 타점
  sb: number;     // 도루
  bb: number;  // 볼넷
  k: number;  // 삼진
  avg: number;  // 타율 (계산값: h/ab)
  obp: number;  // 출루율 (계산값)
  slg: number;  // 장타율 (계산값)
  ops: number;  // OPS (계산값: obp+slg)
}

export type PlayerSeasonStats = PitcherSeasonStats | BatterSeasonStats;

// ── 훈련 계획 ──────────────────────────────────────────────────
export interface TrainingPlanState {
  primaryProgramId: string | null;
  secondaryProgramId: string | null;
  recoveryProgramId: string | null;
}

// ── 학교 생활 상태 ─────────────────────────────────────────────
export type StudyMode = "focus" | "normal" | "rest" | "sleep";
export type GradeRisk  = "ok" | "warn" | "danger";

export interface SubjectScore {
  percentile: number;  // 석차백분율 (1~100, 낮을수록 좋음)
  attendance: number;  // 출석률 (0~100)
  assignment: number;  // 과제 이행률 (0~100)
}

export type CareerChoiceMode = "none" | "draft" | "university" | "independent";
export type CareerFinalChoice = "none" | "draft" | "university" | "independent" | "sports" | "general";

export interface CareerDraftPickLogEntry {
  pickNo: number;
  round: number;
  teamId: string;
  playerId: string;
  playerName: string;
  isUser: boolean;
}

export interface SchoolState {
  attendsUniversity: boolean;
  universityMajor: string;
  plannedUniversityMajors: string[];
  weeklyStudyMode: StudyMode;
  examAccumScore: number;
  lastGrade: number | null;
  lastGradeRisk: GradeRisk;
  eligibilityBlocked: boolean;
  subjectScores: Record<string, SubjectScore>;
  warningCount: number;
  careerChoiceTriggered: boolean;
  draftTriggered: boolean;
  draftIntent: boolean;
  careerApplicationsSubmitted: boolean;
  fallbackSelectionPending: boolean;
  fallbackUniversityChoices: string[];
  fallbackIndependentChoices: string[];
  fallbackUniversityPassed: string[];
  fallbackIndependentPassed: string[];
  fallbackSportsMilitaryPassed: boolean;
  fallbackDraftPassed: boolean;
  fallbackDraftTeamId: string | null;
  fallbackDraftRound: number | null;
  fallbackDraftPick: number | null;
  fallbackDraftSigningBonus: number;
  careerChoicePopupOpened: boolean;
  careerChoiceMode: CareerChoiceMode;
  careerChoiceConfirmed: boolean;
  careerChoiceUniversityApplications: string[];
  careerChoiceIndependentApplications: string[];
  careerDraftPickLog: CareerDraftPickLogEntry[];
  careerFinalChoice: CareerFinalChoice;
  universityWeek: number;
  majorSelected: boolean;
}

export type AchievementCategory = "baseball" | "growth" | "social" | "hidden";

export interface AchievementRuntime {
  id: string;
  progress: number;
  unlockedAt: string | null;
  claimedAt: string | null;
  tracked?: boolean;
}

export interface AchievementMetrics {
  strikeoutTotal: number;
  saveTotal: number;
  kakaoFirstContact: boolean;
  trainingWeeksTotal: number;
  gamesWonTotal: number;
}

// 학업 관리
export type ContactCategory = "team" | "school" | "personal" | "rival";

export interface ChatMessage {
  from: "me" | "contact";
  text: string;
  week: number;
  affinityDelta?: number;
}

export interface ChatContact {
  id: string;
  name: string;
  category: ContactCategory;
  relation: string;
  unlocked: boolean;
  affinity: number;  // 0–100
  lastActionWeek: number;  // 쿨다운 계산용 (0 = 미사용)
  chatHistory: ChatMessage[]; // max 60개
  flags: string[];  // 완료한 아크·특별 대화 ID 목록
}

// ── 메신저 시스템 ──────────────────────────────────────────────
export type SchoolTier = "S" | "A" | "B" | "C";
export type ProPotentialTier = "S" | "A" | "B" | "C";

export interface HighSchoolMaster {
  id: string;
  name: string;
  shortName: string;
  region: string;
  tier: SchoolTier;
  teamId: string;
  gradeLevels: number;
  annualRosterSize: number;
  namedNpcPerYear: number;
  template: {
    pitching: { ovrMin: number; ovrMax: number };
    batting: { ovrMin: number; ovrMax: number };
    developmentRate: { min: number; max: number };
    potentialHidden: { min: number; max: number };
  };
  color: string;
  notes: string;
}

export interface NamedNpcMeta {
  npcId: string;
  schoolId: string;
  trait: string;
  proPotentialTier: ProPotentialTier;
  storyHooks: string[];
  notes: string;
}

export interface SchoolScenario {
  schoolId: string;
  narrativeAngle: string;
  protagonistRoles: {
    seniorMentors: string[];  // 3학년 선배 멘토 NPC ID 목록
    seniorCaptain: string;  // 3학년 주장 NPC ID
    classmateRivals: string[];  // 2학년 동기 라이벌 NPC ID 목록
    batteryPartner: string;  // 2학년 배터리 파트너 C NPC ID
    promisingJunior: string;  // 1학년 기대주 NPC ID
  };
  mainRivalSchool: string;  // 주 라이벌 학교 ID
  rivalAces: string[];  // 타 학교 에이스 NPC ID (최대 2명)
  initialZone0Npcs: string[];  // 신규 게임 시작 시 Zone 0으로 자동 배정될 NPC ID 목록
}

// ── 학교 마스터 타입 ──────────────────────────────────────────
export interface DraftPick {
  round: number;
  pick: number;  // 전체 픽 순번
  teamId: string;
  npcId: string;
}

export interface DraftSimResult {
  year: number;
  picks: DraftPick[];
  undraftedIds: string[];
}

export interface ProtagonistDraftOutcome {
  drafted: boolean;
  round?: number;
  pick?: number;
  teamId?: string;
}

// ── 드래프트 타입 ────────────────────────────────────────────
export type MilitaryStatus = "미필" | "현역" | "군필" | "면제";
export type NpcCareerStatus = "active" | "military" | "injured" | "retired";

export interface NpcCareerEntry {
  year: number;
  leagueId: string;
  teamId: string;
  statLine: string;  // "15승 3패 ERA 2.41" | "타율 .312 12홈런"
  highlights: string[];  // ["신인상", "올스타"]
}

export interface NpcSaveState {
  npcId: string;
  name: string;
  nameEn?: string;
  playerType: PlayerType;
  position: string;

  age: number;
  grade?: 1 | 2 | 3;  // 고교/대학 재학 중일 때만 존재
  schoolId: string;
  graduationYear: number;

  // 기본 정보
  careerStatus: NpcCareerStatus;
  currentLeague: string;
  currentTeam: string;

  // 현재 소속
  militaryStatus: MilitaryStatus;
  militaryEnlistYear?: number;
  militaryDischargeYear?: number;

  // 군적
  pitching?: PitchingAttributes;
  batting?: BattingAttributes;
  developmentRate: number;
  proServiceYears?: number;  // 프로 입단 후 연수 (KBL/ABL FA 자격 기준: 9년)
  careerHistory: NpcCareerEntry[];
  achievements: string[];  // ["2025 신인상", "2027 MVP"]
}

// 커리어 기록
export interface SaveGame {
  version: number;  // 저장 포맷 버전 (마이그레이션용)
  savedAt: string;          // ISO 8601 timestamp
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  schoolState: SchoolState;
  achievements: AchievementRuntime[];
  achievementMetrics: AchievementMetrics;
  contacts: ChatContact[];
  recentLogs: string[];  // 최근 30개 활동 로그
  recentUpcoming: string[];  // 다음 예정 이벤트 목록
  npcs: NpcSaveState[];  // NPC 런타임 상태 (Zone 0~3)
}

export const SAVE_GAME_VERSION = 2;

export function makeSaveGame(
  protagonist: ProtagonistSave,
  mailbox: MessageItem[],
  trainingPlan: TrainingPlanState,
  schoolState: SchoolState,
  achievements: AchievementRuntime[],
  achievementMetrics: AchievementMetrics,
  recentLogs: string[],
  recentUpcoming: string[],
  contacts: ChatContact[],
  npcs: NpcSaveState[] = [],
): SaveGame {
  return {
    version: SAVE_GAME_VERSION,
    savedAt: new Date().toISOString(),
    protagonist,
    mailbox,
    trainingPlan,
    schoolState,
    achievements,
    achievementMetrics,
    contacts,
    recentLogs,
    recentUpcoming,
    npcs,
  };
}

export function migrateSaveGame(raw: Record<string, unknown>): SaveGame {
  const v = (raw.version as number) ?? 0;
  if (v < 2) {
    raw.npcs = [];
    raw.version = 2;
  }
  return raw as unknown as SaveGame;
}

