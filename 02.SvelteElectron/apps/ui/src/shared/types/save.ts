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
export type CareerStage = "highschool" | "university" | "pro_kbl" | "pro_abl";
export type PlayerType   = "pitcher" | "batter" | "twoWay";
export type Handedness   = "L" | "R" | "S";

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
  position: string;                  // "SP" | "RP" | "C" | "1B" | …
  handedness: Handedness;
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
export interface SchoolState {
  attendsUniversity: boolean;
  universityMajor: string;
  plannedUniversityMajors: string[];
}

// ── save_game.json 전체 구조 ───────────────────────────────────
export interface SaveGame {
  version: number;          // 저장 포맷 버전 (마이그레이션용)
  savedAt: string;          // ISO 8601 timestamp
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  schoolState: SchoolState;
  recentLogs: string[];     // 최근 30개 활동 로그
  recentUpcoming: string[]; // 다음 예정 이벤트 목록
}

export const SAVE_GAME_VERSION = 1;

export function makeSaveGame(
  protagonist: ProtagonistSave,
  mailbox: MessageItem[],
  trainingPlan: TrainingPlanState,
  schoolState: SchoolState,
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
    recentLogs,
    recentUpcoming,
  };
}
