import type { MessageItem } from "./main";

// ── NPC 능력치 타입 (npcLiveStats에서 사용) ───────────────────
export interface NpcPitchingAttrs {
  ovr: number;
  velocity: number;
  command: number;
  control: number;
  movement: number;
  mentality: number;
  stamina: number;
  recovery: number;
  clutch: number;
  holdRunners: number;
}

export interface NpcBattingAttrs {
  ovr: number;
  contact: number;
  power: number;
  eye: number;
  discipline: number;
  speed: number;
  baseInstinct: number;
  bunting: number;
  platoon: number;
  fielding: number;
  arm: number;
  battingClutch: number;
}

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
  injuryMgmt?: number;     // 부상 관리 (높을수록 보수적 — 즉시 결장, 70+ 보수, 40미만 무리형)
}

// ── NPC 부상 상태 ──────────────────────────────────────────────
export interface NpcInjuryEntry {
  type: InjuryType;
  severity: InjurySeverity;
  weeksLeft: number;
  totalWeeks: number;
  isPlayingThrough: boolean;  // 감독 스타일에 따라 부상 무릅쓰고 출전 중
  permanentPenaltyApplied: boolean;
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

// ── 부상 시스템 ────────────────────────────────────────────────

// 경상
export type InjuryTypeLight =
  | "BLISTER"           // 손가락 물집
  | "ARM_FATIGUE"       // 팔 피로감
  | "MUSCLE_TIGHTNESS"  // 근육 긴장
  | "BACK_STIFFNESS"    // 허리 뻐근함
  | "ANKLE_SPRAIN_L";   // 발목 염좌 (경)

// 중상
export type InjuryTypeModerate =
  | "ELBOW_INFLAM"    // 팔꿈치 염증
  | "SHOULDER_INFLAM" // 어깨 염증
  | "OBLIQUE_STRAIN"  // 복사근 부상
  | "HAMSTRING"       // 햄스트링
  | "CONCUSSION"      // 뇌진탕
  | "ANKLE_SPRAIN_M"; // 발목 염좌 (중)

// 중증
export type InjuryTypeSevere =
  | "UCL_PARTIAL"      // UCL 부분 파열
  | "ROTATOR_STRAIN"   // 회전근개 파열 (부분)
  | "BACK_HERNIATION"  // 허리 디스크
  | "YIPS";            // 입스

// 수술
export type InjuryTypeSurgery =
  | "UCL_FULL"          // UCL 완전 파열 (토미존 수술)
  | "ROTATOR_FULL"      // 회전근개 완전 파열
  | "SHOULDER_SURGERY"; // 어깨 관절경 수술

export type InjuryType = InjuryTypeLight | InjuryTypeModerate | InjuryTypeSevere | InjuryTypeSurgery;

export type InjurySeverity = "light" | "moderate" | "severe" | "surgery";

export type InjuryTreatment =
  | "rest"          // 자연 휴식 (경상 자동)
  | "conservative"  // 보존 치료 (물리치료)
  | "steroid"       // 스테로이드 주사
  | "prp"           // PRP 주사 + 재활
  | "surgery"       // 수술 전환
  | "counseling"    // 심리 상담 (입스)
  | "self";         // 자가 극복 (입스)

export type InjurySource = "fatigue" | "training" | "game" | "age" | "psychological";

export interface InjuryState {
  type: InjuryType;
  severity: InjurySeverity;
  treatmentChoice?: InjuryTreatment;
  recoveryWeeksLeft: number;
  totalRecoveryWeeks: number;        // 전체 기간 (UI 진행률 표시용)
  rehabPhase?: 1 | 2 | 3 | 4;       // surgery 타입 전용 단계
  permanentPenaltyApplied: boolean;  // 복귀 시 영구 감소 적용 여부
  source: InjurySource;
  steroidUsed?: boolean;             // 스테로이드 사용 이력 (재부상 확률 +25%)
}

export interface InjuryHistoryEntry {
  type: InjuryType;
  severity: InjurySeverity;
  year: number;
  week: number;
  treatmentChoice: InjuryTreatment;
  permanentLoss?: Partial<Record<PitchingStatKey | BattingStatKey, number>>;
}

// 부상명 한국어 표시
export const INJURY_LABEL: Record<InjuryType, string> = {
  BLISTER:          "손가락 물집",
  ARM_FATIGUE:      "팔 피로감",
  MUSCLE_TIGHTNESS: "근육 긴장",
  BACK_STIFFNESS:   "허리 뻐근함",
  ANKLE_SPRAIN_L:   "발목 염좌 (경)",
  ELBOW_INFLAM:     "팔꿈치 염증",
  SHOULDER_INFLAM:  "어깨 염증",
  OBLIQUE_STRAIN:   "복사근 부상",
  HAMSTRING:        "햄스트링",
  CONCUSSION:       "뇌진탕",
  ANKLE_SPRAIN_M:   "발목 염좌 (중)",
  UCL_PARTIAL:      "UCL 부분 파열",
  ROTATOR_STRAIN:   "회전근개 파열",
  BACK_HERNIATION:  "허리 디스크",
  YIPS:             "입스",
  UCL_FULL:         "UCL 완전 파열",
  ROTATOR_FULL:     "회전근개 완전 파열",
  SHOULDER_SURGERY: "어깨 관절경 수술",
};

// 부상 severity 판정 헬퍼
export const INJURY_SEVERITY: Record<InjuryType, InjurySeverity> = {
  BLISTER: "light", ARM_FATIGUE: "light", MUSCLE_TIGHTNESS: "light",
  BACK_STIFFNESS: "light", ANKLE_SPRAIN_L: "light",
  ELBOW_INFLAM: "moderate", SHOULDER_INFLAM: "moderate", OBLIQUE_STRAIN: "moderate",
  HAMSTRING: "moderate", CONCUSSION: "moderate", ANKLE_SPRAIN_M: "moderate",
  UCL_PARTIAL: "severe", ROTATOR_STRAIN: "severe", BACK_HERNIATION: "severe", YIPS: "severe",
  UCL_FULL: "surgery", ROTATOR_FULL: "surgery", SHOULDER_SURGERY: "surgery",
};

// ── 주인공 저장 데이터 ─────────────────────────────────────────
export type CareerStage  = "highschool" | "university" | "pro" | "independent" | "military" | "pro_kbl" | "pro_abl" | "pro_jbl";
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
  militaryStatus: "미필" | "현역" | "군필" | "면제";
  militaryEnlistYear: number | null;
  militaryDischargeYear: number | null;
  militaryEnlistWeek: number | null;
  sportsUnitSelected: boolean;
  militaryHiatusStage: CareerStage | null;
  militaryHiatusUniversityWeek: number | null;
  militaryDeferPenalty: number;
  sportsUnitApplied: boolean;
  tradeAdaptationWeeks: number;
  faNegotiationRound: number;
  faUnsignedWeeks: number;
  contract?: ProContract;
  pendingNextContract?: ProContract;  // 오프시즌 서명 완료, W52 시즌 리셋 시 적용
  consecutiveLowMoraleWeeks: number;
  consecutiveHighFatigueWeeks: number;
  injury?: InjuryState;
  injuryHistory?: InjuryHistoryEntry[];
  seasonHealth?: {
    lowConditionWeeks: number;  // 시즌 중 condition < 60이었던 주 수
    highFatigueWeeks:  number;  // 시즌 중 fatigue > 70이었던 주 수
    injuryCount:       number;  // 시즌 중 부상 발생 횟수
    totalWeeks:        number;  // 시즌 총 경과 주 수
  };
  currentRole?: PitcherRole;  // 현재 시즌 역할 (시즌 시작 시 배정)
  careerRecords?: CareerSeasonRecord[];  // 시즌별 기록 히스토리
  // 시즌 시작 스냅샷 (능력치 트렌드 화살표용)
  seasonStartPitching?: PitchingAttributes;
  seasonStartBatting?: BattingAttributes;
  birthday?: string;  // "2010-MM-DD" 주인공 전용
  // once_per_career 이벤트 기록 — startNewSeason() 에서 초기화되는 triggeredEvents와 달리 커리어 전체 유지
  careerTriggeredEvents?: Record<string, number>;  // eventId → 발동 시점 주차
}

// ── 고교 월간 유망주 TOP 10 ───────────────────────────────────
export interface Top10Entry {
  id:       string;   // NPC: "PLY_XXXXX" / 주인공: "PLY_HERO"
  name:     string;   // 선수 한국어 이름
  teamName: string;   // 팀 한국어 이름
  score:    number;   // prospect score (내부 계산값)
  rank:     number;   // 1~10
}

export interface Top10Snapshot {
  type:    "pitcher" | "batter";
  grade:   number;   // 학년 1~3
  week:    number;   // 절대 주차 (seasonWeek)
  entries: Top10Entry[];
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
  secondary2ProgramId: string | null;
  recoveryProgramId: string | null;  // deprecated, kept for migration
}

export interface TrainingPreset {
  id: string;
  name: string;
  primaryProgramId: string;
  secondary1ProgramId: string;
  secondary2ProgramId: string;
}

// ── 학교 생활 상태 ─────────────────────────────────────────────
export type StudyMode = "focus" | "normal" | "rest" | "sleep";
export type GradeRisk  = "ok" | "warn" | "danger";

export interface SubjectScore {
  percentile: number;  // 석차백분율 (1~100, 낮을수록 좋음)
  attendance: number;  // 출석률 (0~100)
  assignment: number;  // 과제 이행률 (0~100)
}

export type UniversityTier = "S" | "A" | "B" | "C" | "D";

export interface UniversityMaster {
  teamId: string;
  name: string;
  tier: UniversityTier;
  minAcademicGrade: number;  // 1~9 (낮을수록 좋음)
  minBaseballScore: number;
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

export interface CareerApplications {
  draftApplied: boolean;
  universityChoices: string[];
  independentChoices: string[];
  sportsMilitaryApplied: boolean;
}

export interface CareerResults {
  draftDrafted: boolean;
  draftTeamId: string | null;
  draftRound: number | null;
  draftPick: number | null;
  draftSigningBonus: number;
  universityPassed: string[];
  independentPassed: string[];
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
  careerApplicationsSubmitted: boolean;
  careerApplications: CareerApplications | null;
  careerResults: CareerResults | null;
  careerChoicePopupOpened: boolean;
  careerChoiceMode: CareerChoiceMode;
  careerChoiceConfirmed: boolean;
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
  trainingWeeksTotal: number;
  gamesWonTotal: number;
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
export type NpcEmotionRole = "manager" | "coach" | "rival" | "teammate";

export interface AnonDraftEntry {
  npcId:      string;
  name:       string;
  ovr:        number;
  schoolId:   string;
  position:   string;
  playerType: PlayerType;
}

export interface NpcCareerEntry {
  year: number;
  leagueId: string;
  teamId: string;
  statLine: string;  // "15승 3패 ERA 2.41" | "타율 .312 12홈런"
  highlights: string[];  // ["신인상", "올스타"]
  stats?: PlayerSeasonStats;  // 연도별 상세 성적 (최근 5년 표시용)
}

export interface NpcPersonality {
  loyalty: number;
  ambition: number;
  greed: number;
  competitiveDrive: number;
  stabilityPreference: number;
  professionalism: number;
  overseasAmbition: number;
  marketPreference: number;
  homeTeamId?: string | null;
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

  emotionRole?: NpcEmotionRole;
  potentialHidden?: number;  // 성장 cap 계산용 — 없으면 75 폴백 (구버전 세이브 호환)

  // 기본 정보
  careerStatus: NpcCareerStatus;
  currentLeague: string;
  currentTeam: string;

  // 현재 소속
  militaryStatus: MilitaryStatus;
  militaryEnlistYear?: number;
  militaryDischargeYear?: number;
  militaryUnit?: "sports" | "general";
  originalLeagueId?: string;
  originalTeamId?: string;

  // 군적
  /** @deprecated 능력치는 SaveSeason.npcLiveStats에서 관리됨. 로드 시 이관 후 무시. */
  pitching?: PitchingAttributes;
  /** @deprecated 능력치는 SaveSeason.npcLiveStats에서 관리됨. 로드 시 이관 후 무시. */
  batting?: BattingAttributes;
  developmentRate: number;
  proServiceYears?: number;  // 프로 입단 후 연수 (KBL/ABL FA 자격 기준: 9년)
  currentSalary?: number;   // 오프시즌 OVR 기반 계산 연봉 (Rust estimate_salary_and_contract)
  contractYears?: number;   // 오프시즌 OVR 기반 계산 계약 기간 (Rust estimate_salary_and_contract)
  injuryStatus?: {
    severity: InjurySeverity;
    recoveryWeeksLeft: number;
  };
  careerHistory: NpcCareerEntry[];
  achievements: string[];  // ["2025 신인상", "2027 MVP"]

  fame: number;
  personality?: NpcPersonality;

  // 감정 시스템 (emotionRole 있는 NPC에만 적용, optional)
  emotion?:        NpcEmotion;
  memories?:       NpcMemory[];
  emotionStatus?:  EmotionStatus;
  lastActiveStage?: CareerStage;
}

// ── NPC 감정 시스템 ────────────────────────────────────────────

export interface NpcEmotion {
  // 인식 축 — 낮으면 나머지 수치가 의미 없음
  recognition:  number;  // 0~100: 플레이어를 의식하는 정도

  // 평가 축 — 셋이 독립적으로 공존 가능
  admiration:   number;  // 실력 인정
  jealousy:     number;  // 위협감 (자신이 밀린다는 감각)
  contempt:     number;  // 경멸 (아직 상대 아니라는 감각)

  // 관계 축
  trust:        number;  // 인간적 신뢰
  dependence:   number;  // NPC→플레이어 기대/의존 (코치·감독용)
  resentment:   number;  // 누적 원한 — 한번 쌓이면 줄기 어려움

  // 단기 상황 축 — 매주 자동 감쇠
  pressure:     number;  // 지금 느끼는 압박감
  excitement:   number;  // 지금 느끼는 기대감
}

export type NpcMemoryType =
  | "humiliation"   // 공개적으로 당함 (맞대결 완봉패 등)
  | "gratitude"     // 결정적 도움을 받음
  | "betrayal"      // 뒤통수 (FA로 라이벌 팀 이적 등)
  | "witness"       // 대단한 장면을 직접 목격
  | "shared_ordeal"; // 함께 고생함 (강훈련, 강등 위기 등)

export interface NpcMemory {
  type:      NpcMemoryType;
  week:      number;
  intensity: 1 | 2 | 3;  // 메시지 무게와 감정 변화폭 결정
  detail:    string;      // "2028 고교리그 결승전" 등 맥락 문자열
}

export type EmotionStatus =
  | "active"    // 현재 같은 리그/팀 — 매주 업데이트
  | "dormant"   // 다른 리그로 헤어짐 — 오프시즌에만 감쇠
  | "archived"; // 은퇴/완전 종료 — 수치 제거, 기억만 보존

// ── 커리어 기록 ───────────────────────────────────────────────
export interface CareerAward {
  id: string;
  label: string;
  value?: string;
}

export interface CareerGameLogEntry {
  week: number;
  opponentId: string;
  myScore: number;
  oppScore: number;
  ip: number;
  er: number;
  h: number;
  k: number;
  bb: number;
  decision: "W" | "L" | "SV" | "HD" | "ND";
  pitchCount?: number;
}

export interface CareerSeasonRecord {
  year: number;
  leagueId: string;
  teamId: string;
  rank?: number;
  totalTeams?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  statLine: string;
  ovr: number;
  awards: CareerAward[];
  psResult?: "champion" | "runnerUp" | "semiFinal" | "notQualified";
  stats?: PlayerSeasonStats;  // 연도별 상세 성적 (최근 5년 표시용)
  gameLog?: CareerGameLogEntry[];  // 시즌 전체 등판 기록 (경기별)
}

// ── 리그 거래 기록 ──────────────────────────────────────────────

export type LeagueTransactionCategory = "trade" | "fa" | "draft" | "military";

export interface LeagueTransactionRow {
  id?: number;
  seasonYear: number;
  week?: number;
  category: LeagueTransactionCategory;
  playerId: string;
  playerName: string;
  fromTeamId?: string | null;
  fromLeagueId?: string | null;
  toTeamId?: string | null;
  toLeagueId?: string | null;
  detail?: string | null;
  groupId?: string | null;  // 트레이드 양쪽 레코드 묶음용
}

export interface SaveGame {
  version: number;  // 저장 포맷 버전 (마이그레이션용)
  savedAt: string;          // ISO 8601 timestamp
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  trainingPresets?: TrainingPreset[];
  schoolState: SchoolState;
  achievements: AchievementRuntime[];
  achievementMetrics: AchievementMetrics;
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
  npcs: NpcSaveState[] = [],
  trainingPresets: TrainingPreset[] = [],
): SaveGame {
  return {
    version: SAVE_GAME_VERSION,
    savedAt: new Date().toISOString(),
    protagonist,
    mailbox,
    trainingPlan,
    trainingPresets,
    schoolState,
    achievements,
    achievementMetrics,
    recentLogs,
    recentUpcoming,
    npcs,
  };
}

const TRAINING_ID_MIGRATION: Record<string, string> = {
  "TRN_CMD_BASE":  "TRN_CTRL_CMD",
  "TRN_CTRL_MECH": "TRN_CTRL_CMD",
  "TRN_MVT_PITCH": "TRN_MOVEMENT",
  "TRN_MNT_FOCUS": "TRN_MENTAL_P",
  "TRN_STA_COND":  "TRN_STAMINA",
  "TRN_CLUTCH":    "TRN_MENTAL_P",
  "TRN_HOLD":      "TRN_MENTAL_P",
  "TRN_VEL_POWER": "TRN_VEL",
  "TRN_CONTACT":   "TRN_BATTING",
  "TRN_POWER":     "TRN_BATTING",
  "TRN_EYE":       "TRN_PLATE_EYE",
  "TRN_SPEED":     "TRN_BASERUN",
  "TRN_FIELDING":  "TRN_DEFENSE",
  "TRN_BUNTING":   "TRN_PLATE_EYE",
  "TRN_BCLUTCH":   "TRN_MENTAL_B",
};

export function migrateSaveGame(raw: Record<string, unknown>): SaveGame {
  const v = (raw.version as number) ?? 0;
  if (v < 2) {
    raw.npcs = [];
    raw.version = 2;
  }
  if (raw.trainingPlan && typeof raw.trainingPlan === "object") {
    const plan = raw.trainingPlan as Record<string, unknown>;
    if (typeof plan.primaryProgramId === "string")
      plan.primaryProgramId = TRAINING_ID_MIGRATION[plan.primaryProgramId] ?? plan.primaryProgramId;
    if (typeof plan.secondaryProgramId === "string")
      plan.secondaryProgramId = TRAINING_ID_MIGRATION[plan.secondaryProgramId] ?? plan.secondaryProgramId;
    // migrate old recoveryProgramId → secondary2ProgramId
    if (!plan.secondary2ProgramId) {
      plan.secondary2ProgramId = plan.recoveryProgramId ?? "TRN_RECOVERY";
    }
  }
  return raw as unknown as SaveGame;
}

