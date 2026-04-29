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
}

export type PitchingStatKey = Exclude<keyof PitchingAttributes, "ovr">;

export interface BattingAttributes {
  ovr: number;
  contact: number;
  power: number;
  eye: number;
  discipline: number;
  speed: number;
  fielding: number;
  arm: number;
  battingClutch: number;
}

// ── 주인공 저장 데이터 ─────────────────────────────────────────
export type CareerStage  = "highschool" | "university" | "pro" | "independent" | "military" | "pro_kbl" | "pro_abl";
export type PlayerType   = "pitcher" | "batter" | "twoWay";
export type Handedness   = "L" | "R" | "S";
export type PitchingForm = "overhand" | "threeQuarter" | "sidearm" | "underhand";

export interface ProtagonistSave {
  id: string;                        // 고정 ID (예: "PLY_HERO")
  name: string;
  nameEn?: string;
  careerStage: CareerStage;
  leagueId: string;                  // 현재 소속 리그
  teamId: string;                    // 현재 소속 팀
  schoolId?: string;                 // 고교·대학 단계
  grade?: 1 | 2 | 3;                // 고교 학년
  age: number;
  playerType: PlayerType;
  position: string;                  // "SP" | "RP" | "CP" | "" (미정)
  handedness: Handedness;
  pitchingForm?: PitchingForm;       // 투구 폼 (투수 전용)
  jerseyNumber: number;

  // 현재 상태 (주 단위로 변동)
  condition: number;                 // 0–100: 컨디션
  fatigue: number;                   // 0–100: 피로도
  morale: number;                    // 0–100: 사기

  // 능력치 (성장 반영된 현재값)
  pitching: PitchingAttributes;
  batting: BattingAttributes;

  // 잠재력·성장
  developmentRate: number;           // 45–75
  potentialHidden: number;           // 60–99 (숨겨진 잠재력)
  growthPoints: number;              // 미사용 성장 포인트

  tags: string[];                    // ["급성장", "멘탈관리", …]

  // XP 누적 (주간 성장 엔진용)
  pitchingXP: Partial<Record<PitchingStatKey, number>>;

  // 구종 시스템
  learnedPitchIds: string[];                           // 보유 구종 ID 목록
  trainingPitchState?: { id: string; progress: number }; // 현재 훈련 중인 구종
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
  era: number;    // 평균자책점 (계산값: er*9/ip)
  whip: number;   // 계산값: (bb+h)/ip
}

export interface BatterSeasonStats {
  type: "batter";
  g: number;      // 출전 경기 수
  pa: number;     // 타석
  ab: number;     // 타수
  h: number;      // 안타
  hr: number;     // 홈런
  rbi: number;    // 타점
  sb: number;     // 도루
  bb: number;     // 볼넷
  k: number;      // 삼진
  avg: number;    // 타율 (계산값: h/ab)
  obp: number;    // 출루율 (계산값)
  slg: number;    // 장타율 (계산값)
  ops: number;    // OPS (계산값: obp+slg)
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
  percentile: number;   // 석차백분율 (1~100, 낮을수록 좋음)
  attendance: number;   // 출석률 (0~100)
  assignment: number;   // 과제 이행률 (0~100)
}

export interface SchoolState {
  attendsUniversity: boolean;
  universityMajor: string;
  plannedUniversityMajors: string[];
  // 학업 관리
  weeklyStudyMode: StudyMode;
  examAccumScore: number;           // 시험까지 누적 학업 점수 (0~100)
  lastGrade: number | null;         // 최근 시험 등급 (1~9, null=미응시)
  lastGradeRisk: GradeRisk;
  eligibilityBlocked: boolean;      // 성적 불량 출전 정지 중
  subjectScores: Record<string, SubjectScore>;
  warningCount: number;             // 누적 수업 태만 경고
  careerChoiceTriggered: boolean;   // 진로 선택 이벤트 발동 여부
  universityWeek: number;           // 대학 입학 후 경과 주차 (0 = 고교)
  majorSelected: boolean;           // 전공 확정 여부
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
}

// ── save_game.json 전체 구조 ───────────────────────────────────
export interface SaveGame {
  version: number;          // 저장 포맷 버전 (마이그레이션용)
  savedAt: string;          // ISO 8601 timestamp
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  schoolState: SchoolState;
  achievements: AchievementRuntime[];
  achievementMetrics: AchievementMetrics;
  recentLogs: string[];     // 최근 30개 활동 로그
  recentUpcoming: string[]; // 다음 예정 이벤트 목록
}

export const SAVE_GAME_VERSION = 1;

export function makeSaveGame(
  protagonist: ProtagonistSave,
  mailbox: MessageItem[],
  trainingPlan: TrainingPlanState,
  schoolState: SchoolState,
  achievements: AchievementRuntime[],
  achievementMetrics: AchievementMetrics,
  recentLogs: string[],
  recentUpcoming: string[],
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
    recentLogs,
    recentUpcoming,
  };
}
