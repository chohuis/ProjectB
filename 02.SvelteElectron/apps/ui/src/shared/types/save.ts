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

// ── 감독 능력치 (제거됨 — Phase 8 정리) ────────────────────────
//
// `ManagerAttributes` 8종이 여기 있었다. 7-5 F-0이 감독 능력치를 새 5종
// (`tacticalIQ`·`bullpenRead`·`offenseMind`·`motivator`·`clutchDecision`)으로
// 정본화했는데 이 타입만 남아, **아무도 쓰지 않으면서 옛 이름을 계속 정당화**하고
// 있었다. 실제로 `backgroundLeague.ts`가 여기 있던 `handlePersonnel`을 읽으며
// 세계 전 경기를 감독 능력치 50 고정으로 돌렸다.
//
// 정본은 `stores/master.ts`의 `EntityManagerStats`이고, 읽는 곳은
// `utils/staffEffects.ts` 하나다.

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
/**
 * 코치 전문 영역. **정본은 `seeds/onepitch/staff_rules.toml` [[coach.specialties]]** 이고
 * 거기 값은 한국어다. 이 타입이 예전엔 영문 4종("pitching"|"batting"|...)이었는데
 * 실제 데이터는 한국어 6종이라 **비교가 전부 실패하고 있었다** —
 * `coach?.specialty === "pitching"` 이 항상 false였고 그래서 투수코치 능력치가
 * 훈련 효율에 하나도 반영되지 않았다 (감독 능력치 미전달 P6-2와 같은 부류).
 */
export type CoachSpecialty = "투수" | "타격" | "주루" | "컨디셔닝" | "멘탈" | "전력분석";

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
  /**
   * 학년 — 고교 1~3, **대학 1~4**. 재학 중일 때만 존재한다.
   *
   * ⚠ 예전엔 `1 | 2 | 3`이라 **대학 4학년을 표현할 수조차 없었다.**
   * 대학 학년의 실계수기는 `schoolState.universityWeek`이고 이 필드는 그걸
   * 비추는 값이다 — 판정은 `careerTransition.universityGradeOf`를 쓴다.
   */
  grade?: 1 | 2 | 3 | 4;
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
  /** 개인 재정 상태 (Phase 7-5). 구 세이브엔 없으므로 optional */
  finance?: import("../usecases/finance").FinanceState;
  fame: number;
  scoutScore: number;
  proServiceYears: number;
  militaryUnit: "sports" | "general" | null;
  /**
   * 다녀온 부대 — **전역 뒤에도 남는다.**
   *
   * ⚠ 전역이 `militaryUnit`을 `null`로 지워서 상무 출신인지 현역 출신인지가
   * 사라졌다. 20시즌 장부에서 상무 입대가 복무 중인 인원만 잡혔다 —
   * 실제로는 매년 상무 13 + 현역 30이 정상 작동하는데 기록만 없었다.
   */
  militaryServedUnit?: "sports" | "general";
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
  /**
   * 은퇴 기록. **있으면 커리어가 끝난 것이다.**
   *
   * `careerStage`에 `"retired"`를 넣지 않는 이유: 마지막 소속이 어디였는지가
   * 기록의 일부고, 단계별 분기 수십 곳이 새 값을 모른다.
   * protagonist는 JSON 블롭이라 마이그레이션이 필요 없다.
   */
  retirement?: { year: number; week: number; reason: RetirementReason };
  /**
   * 체육부대 후보 공개(W50)를 **이 시즌에 이미 물어봤는가.**
   *
   * 없으면 무한 반복이 난다: 후보 공개는 주를 안 넘기고 pending만 밀어넣는데,
   * 사용자가 신청/거절 어느 쪽을 눌러도 같은 주에 머무르므로 다음 주 진행에서
   * 조건이 그대로 다시 참이 된다. 미필·비고교·27세 이하면 **매년 여기서 멈춘다.**
   */
  sportsUnitPromptedYear?: number;
  /**
   * 입대 여부 질문(`militaryEnlistAsk`)을 **이 시즌에 이미 물어봤는가.**
   *
   * 위와 같은 결함이 한 칸 옆에 그대로 있었다. W52 "입영 기간 만료"와 W48
   * "체육부대 탈락"도 주를 안 넘기고 pending만 밀어넣는데, 모달의 "연기"는
   * 상태를 아무것도 안 바꾸고 해소만 한다 — 다음 진행에서 조건이 또 참이 된다.
   * 실측: 2038 W51에서 자동 진행이 1000회 반복 상한에 걸렸다.
   */
  militaryAskedYear?: number;
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
  careerEvents?: NpcCareerEvent[];  // 드래프트·트레이드·군입대 이벤트
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
  /** 득점권 타수 — 위기 상황 성적을 보여주는 스플릿.
   *
   * ⚠ **시즌 ERA로는 성격이 안 보인다.** 득점권은 전체 타석의 22~23%뿐이라
   * 희석되고, 투수 기질 20↔90의 차이(ERA 0.18)가 시즌 노이즈(±0.14)에 묻힌다.
   * 실제 야구도 이걸 시즌 ERA가 아니라 상황별 성적으로 본다. */
  rispAb?: number;
  rispH?: number;
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
  /** 득점권 타수·안타 — 투수 쪽과 짝이다 */
  rispAb?: number;
  rispH?: number;
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

/**
 * 드래프트 **후보 명단** (Phase 9-E).
 *
 * ⚠ 예전엔 관전 보드가 후보를 **지명 결과에서만** 만들었다. 그래서 화면에
 * 뜨는 후보가 정확히 지명 수(110명)와 같았고 **미지명이 항상 0명**이라
 * 긴장감이 없었다 — 실제 후보 풀은 1,600명이 넘는데 화면에 안 나왔다.
 *
 * 전원을 싣는 건 무겁고 읽히지도 않으므로 **상위 N명만** 남긴다
 * (`draftRules.boardCandidateMultiplier` × 지명 수).
 */
export interface DraftBoardCandidate {
  playerId: string;
  playerName: string;
  ovr: number;
  age: number;
  potential: number;
  position: string;
  /** 출신 팀 id — 화면이 이름으로 바꾼다 */
  originTeamId: string;
  /** 고졸 / 대졸 / 대학재학 / 독립 */
  route: string;
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
  /** 그해 드래프트 후보 명단 (지명 수의 배수). 관전 보드가 읽는다 */
  careerDraftCandidates?: DraftBoardCandidate[];
  careerFinalChoice: CareerFinalChoice;
  universityWeek: number;
  majorSelected: boolean;

  // ── 대학 학업 (Phase 9-C) ────────────────────────────────────
  //
  // ⚠ **고교와 축이 다르다.** 고교는 석차 9등급으로 대학 입학 티어를 정하고
  // (`universityUtils.minAcademicGrade`), 그건 지금도 정상 동작한다.
  // 대학은 **학점 → 졸업 자격 → 진로 안전망**이 축이다. 대학에 내신 9등급을
  // 그대로 쓰면 성립하지 않는다.
  //
  // 주인공은 slot.db에 JSON 블롭으로 들어가므로 **마이그레이션이 필요 없다.**
  // 구 세이브는 전부 undefined로 읽히고 아래 기본값이 적용된다.

  /** 누적 학점 (0.0~4.5). 졸업 판정의 기준이다 */
  universityGpa?: number;
  /**
   * 이번 학기 학업 품질 누계와 주차 수.
   *
   * ⚠ **`examAccumScore`를 재사용하면 안 된다.** 그건 고교 시험 누적(0~100)이고
   * 대학에서도 `applyWeeklyStudy`가 주당 4씩 더한다 — 실측에서 학점이 상한
   * 4.50으로 튀었다(주 0.03씩 쌓아야 할 값에 주 4가 섞였다).
   *
   * 품질은 주당 0~1이고, 학기 학점 = 평균 품질 × 4.5다. **주차 수로 나누므로
   * 학기 길이가 달라도 공정하다** — 중간고사 구간(W1~11, 11주)과 기말 구간
   * (W12~38, 27주)의 길이가 두 배 넘게 차이 난다.
   */
  semesterQualityAccum?: number;
  semesterWeeks?: number;
  /** 학기별 학점 이력 — 연속 미달을 세려면 이력이 있어야 한다 */
  semesterGpaHistory?: { year: number; term: "midterm" | "final"; gpa: number }[];
  /**
   * 학사 경고 단계 (0~3). **한 번에 출전 정지로 가지 않는다** —
   * 1차 훈련효율 하락 → 2차 출전 정지 → 3차 유급. 회복할 틈을 준다.
   */
  academicWarningLevel?: 0 | 1 | 2 | 3;
  /** 유급 횟수 — `universityWeek`을 안 올려 졸업이 밀린 해의 수 */
  repeatedYears?: number;
  /** 졸업했는가. 미지명이어도 여기서 취업 경로가 갈린다 (Phase 11 엔딩) */
  graduated?: boolean;
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

/** 은퇴 사유 — 설계 정본의 트리거 3종 (05_히스토리_엔딩 §3) */
export type RetirementReason = "voluntary" | "decline" | "injury";
export type NpcCareerStatus = "active" | "military" | "injured" | "retired" | "free_agent";
export type Nationality = "KOR" | "JPN" | "USA" | "OTHER";

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

/**
 * ⚠ **Rust가 쓰는 문자열과 같아야 한다.** Rust `NpcCareerEvent.event_type`은
 * `String`이라 컴파일러가 안 잡아준다 — 여기 없는 값을 Rust가 쓰면 경력 화면이
 * 조용히 렌더를 건너뛴다. 실제로 `release`·`quit_baseball`(Phase 7-1 D-4a)이
 * 그렇게 빠져 있었다.
 *
 * 방출·야구 포기: `draft.rs`의 `Placer::place` · `QUIT_EVENT`
 * 지명·미지명: `npc_sim.rs`의 `apply_draft`
 */
export type NpcCareerEventType =
  | "draft_picked"
  | "draft_undrafted"
  | "trade"
  | "fa_signed"
  | "release"
  | "quit_baseball"
  | "military_enlist"
  | "military_discharge"
  | "military_exempt"
  | "retirement"
  // 보직 변경 (`npc_sim.rs`의 `fix_position_gaps`). **소식에는 안 올린다** —
  // 라인업 9명을 세우기 위한 정합성 보정이라 사건이 아니다. 한 시즌 213줄 중
  // 99줄이 이것이었고 그중 93줄이 대학팀이었다. 대신 여기 남겨서, 작년엔
  // 3루수였던 선수가 왜 좌익수인지 **찾아보면 나오게** 한다
  | "position_change"
  // 외국인 용병 영입 (`foreignPlayers.ts`). **일반 FA와 구분한다** —
  // 어디서 왔는지가 이 사건의 요점이라 `detail`에 "마이너 출신"이 들어간다
  | "foreign_signing"
  // 대학 졸업 (Phase 9-C). 미지명이어도 학점에 따라 진로가 갈린다 —
  // 취업 경로 화면은 Phase 11 엔딩과 함께 붙이고, 여기서는 기록만 남긴다
  | "graduation";

export interface NpcCareerEvent {
  year: number;
  eventType: NpcCareerEventType;
  fromTeamId?: string;
  toTeamId?: string;
  fromLeagueId?: string;
  toLeagueId?: string;
  detail?: string;
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
  handedness?: Handedness;
  jerseyNumber?: number;
  positionRatings?: PositionRatings;

  age: number;
  /**
   * 학년 — 고교 1~3, **대학 1~4**. 재학 중일 때만 존재한다.
   *
   * ⚠ 예전엔 `1 | 2 | 3`이라 **대학 4학년을 표현할 수조차 없었다.**
   * 대학 학년의 실계수기는 `schoolState.universityWeek`이고 이 필드는 그걸
   * 비추는 값이다 — 판정은 `careerTransition.universityGradeOf`를 쓴다.
   */
  grade?: 1 | 2 | 3 | 4;
  schoolId: string;
  graduationYear: number;

  /**
   * Named NPC — 주간 개별 시뮬 대상이고, 반경 2/3 리그에서는 합성 궤적을 받는다.
   * 구 필드명은 `emotionRole`("manager"|"coach"|"rival"|"teammate")이었는데
   * 실제로 쓰인 건 **truthy 여부**뿐이었다(감정 시스템 6C에서 폐기).
   * slot.db `npc.is_named`가 정본이다.
   */
  isNamed?: boolean;
  potentialHidden?: number;  // 성장 cap 계산용 — 없으면 75 폴백 (구버전 세이브 호환)

  nationality?: Nationality;  // 없으면 "KOR" 폴백

  // 기본 정보
  careerStatus: NpcCareerStatus;
  currentLeague: string;
  currentTeam: string;

  // 현재 소속
  militaryStatus: MilitaryStatus;
  militaryEnlistYear?: number;
  militaryDischargeYear?: number;
  militaryUnit?: "sports" | "general";
  /** 다녀온 부대 — 전역 뒤에도 남는다 (`ProtagonistSave.militaryServedUnit` 참고) */
  militaryServedUnit?: "sports" | "general";
  /**
   * 군 계급 (이병·일병·상병·병장). 생성 시 복무 **개월**로 정해져 저장된다.
   *
   * 화면이 입대 연도로 다시 계산하면 안 된다 — 연 단위로는 일병이 안 나오고
   * 저장값과 어긋난다. 여기 있으면 이걸 쓰고, 없을 때만(구 세이브) 역산한다.
   */
  militaryRank?: string;
  originalLeagueId?: string;
  originalTeamId?: string;

  // 군적
  /** 읽기용 사본 — 정본은 npcLiveStats(주간 갱신). v3 어댑터가 로드/저장 시 abilities와 동기화. 쓰기 금지. */
  pitching?: PitchingAttributes;
  /** 읽기용 사본 — 정본은 npcLiveStats(주간 갱신). v3 어댑터가 로드/저장 시 abilities와 동기화. 쓰기 금지. */
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
  careerEvents?: NpcCareerEvent[];  // 드래프트·트레이드·군입대 등 이벤트 기록 (optional, 구버전 세이브 호환)
  achievements: string[];  // ["2025 신인상", "2027 MVP"]

  fame: number;
  personality?: NpcPersonality;
}

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

export type LeagueTransactionCategory = "trade" | "fa" | "draft" | "military" | "retirement";

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

