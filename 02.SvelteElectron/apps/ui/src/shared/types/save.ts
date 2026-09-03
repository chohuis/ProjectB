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

/**
 * 인센티브 축 — **보직 셋과 1:1** (PLAN_CONTRACT_TERMS §5-3 · 스윙맨 없음).
 *
 * `era` 만 「이하」이고 나머지는 「이상」이다. `award` 는 보직과 무관하다.
 */
export type IncentiveKind = "games" | "innings" | "era" | "wins" | "saves" | "holds" | "award";

export interface ContractIncentive {
  kind: IncentiveKind;
  /** era 는 「이하」, 나머지는 「이상」. award 는 1(받으면 달성) */
  threshold: number;
  /** kind === "award" 일 때만. `awardRules` 의 id (mvp · golden · …) */
  awardId?: string;
  /** 만원 */
  bonus: number;
  /** 정산한 해 — 다년 계약에서 **두 번 주는 걸 막는다**. 정산은 C④·A 몫이다 */
  paidSeasons?: number[];
}

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
  /**
   * 인센티브 — **주인공 계약만** (PLAN_CONTRACT_TERMS §4-1 · 사용자 확정 §8 ①·⑤).
   *
   * 🔴 예전엔 `{ condition: string; bonus: number }` 였다. 문자열이라
   * **기계가 판정할 수 없었고**, 그래서 채우는 코드가 0건인 죽은 필드였다.
   * 정산(C④·A)이 성적과 대조하려면 축(`kind`)과 문턱(`threshold`)이 갈려 있어야 한다.
   *
   * ⚠ **NPC 계약에는 안 넣는다** (§4-2 사용자 확정). NPC 연봉은
   * `calc_npc_renewal_salary` 한 곳에서 나오고 정산할 자리가 없다 —
   * 붙이면 매 시즌 수천 명의 정산이 생긴다.
   */
  incentives?: ContractIncentive[];
  status: "active" | "expired" | "voided";
  /**
   * 서명한 해 — **계약 이력이 연도 행이라 이게 없으면 표가 안 선다**
   * (`PLAN_MESSAGE_DASHBOARDS.md` §7-4 계약 이력 카드).
   *
   * ⚠ **구 세이브엔 없다.** 그때는 화면이 연도 칸을 `—` 로 둔다 — 0 을
   *   채우면 「0년에 맺은 계약」이 된다.
   */
  signedYear?: number;
  /**
   * 어떻게 맺었나 — 신규 입단·재계약·FA. 문안은 `dashboard_labels.json`
   * `recordTab.contractHistory.kindLabel` 이 갖는다.
   *
   * ⚠ **여기서 한글을 안 적는다.** 「재계약」을 세이브에 굳히면 표시 언어를
   *   못 타고, 문안을 고쳐도 지난 계약만 옛 말로 남는다.
   */
  kind?: "new" | "resign" | "fa";
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
  /**
   * 현역 군 생활 상태 (2026-09-02 · PLAN_MILITARY_LIFE 4부 §24).
   * 입대 주에 `enlistProtagonist` 가 만들고 전역 때 `militaryRecord` 로 접은 뒤 null.
   * 탭 유무는 `careerStage` 가 정한다 — 이 필드는 그 근거가 아니다.
   */
  militaryLife?: import("./militaryLife").MilitaryLifeState | null;
  /** 전역 때 접은 군 경력 한 장 (§30) — 현역만 · 상무는 없다 */
  militaryRecord?: import("./militaryLife").MilitaryRecord | null;
  /**
   * **실제로 전역한 시점** (B-20 재회 축소판 · 2026-09-03). 상무·현역 둘 다 남긴다.
   *
   * 🔴 `militaryDischargeYear` 와 다르다 — 그건 입대 때 정하는 **전역 「예정」** 이고
   *   화면이 "전역 예정 {year}년 W48" 로 쓴다. 지난 시점이 아니라 앞으로의 약속이다.
   *
   * 이게 없어서 **전역 뒤 경과를 잴 수단이 아예 없었다.** `militaryRecoveryWeeks` 는
   * 전역 때 2(상무)·6(현역)으로 놓이고 매주 1씩 줄어 0에서 멈춘다 — 0이 된 뒤로는
   * 한 주가 지났는지 세 해가 지났는지 구분이 안 된다. 그래서 「전역 후 첫 시즌 W10」
   * 같은 재회 서사를 못 걸었다 (PLAN_MILITARY_LIFE §30).
   *
   * ⚠ 구 세이브엔 없다(`undefined`). 이벤트 경로 `weeksSinceDischarge` 는 그때
   *   `undefined` 를 내고 비교가 false 가 된다 — **군대를 안 다녀온 것과 같게 본다.**
   */
  dischargedSeason?: number;
  dischargedWeek?: number;
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
  /**
   * 지나간 계약들 — **오래된 것이 앞이다** (`PLAN_MESSAGE_DASHBOARDS.md` §7-3).
   *
   * 🔴 **현재 계약은 여기 없다.** `contract` 가 그것이고, 새 계약에 서명할 때
   *    자리를 내주는 옛 계약이 여기로 온다. 둘 다 담으면 「계약 정보」와
   *    「계약 이력」이 같은 줄을 두 번 그린다.
   *
   * ⚠ **구 세이브엔 없다**(`undefined`). 그때 이력 카드는 빈 카드 문구를
   *   그린다 — 빈 배열로 채우면 「이력이 없다」와 「이력을 안 남기던 세이브」가
   *   같아 보인다.
   */
  contractHistory?: ProContract[];
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
  /**
   * 보직 선택을 **이미 물은 자리** — `"{연도}:{팀id}:W{시즌내주차}"` (PLAN_ROLE_RECOMMEND §7).
   *
   * 🔴 **소식 id `msg-role-{year}-{teamId}-w{week}` 와 같은 세 조각이어야 한다.**
   * 한쪽만 주차를 빼면 갈래가 둘로 깨진다 — 가드에만 없으면 같은 주에 소식이
   * 계속 생기고, id 에만 없으면 소식 키가 겹쳐 **세이브가 안 열린다**
   * (CLAUDE.md 「소식 id 규칙」). `roleMessageId.test.ts` 가 둘을 같이 본다.
   *
   * ⚠ `ProtagonistSave` 안에 있어 세이브에 그대로 실린다 —
   * CLAUDE.md 「한 해에 한 번 가드는 반드시 저장한다」.
   */
  lastRoleChoiceKey?: string;
  /**
   * 고른 자리에서의 내 깊이 (PLAN_ROLE_RECOMMEND §5 · 1.1 A④).
   *
   * `over = max(0, rank − seats)` 한 값이 선발 등판 건너뛰기 · 불펜 등판 확률 · 경기 진입
   * 문턱 셋을 다 민다. **벌이 아니라 깊이다** — 추천을 따랐어도 세 자리에 다 못 들면 `over > 0`.
   *
   * ⚠ 세이브에 실린다. 없으면(구 세이브·야수) 깊이 0 = 예전 그대로다.
   */
  roleFit?: {
    chosen: "SP" | "RP" | "CP";
    recommended: "SP" | "RP" | "CP";
    /** 고른 자리 후보 안에서의 내 순위 (1 = 최고) */
    rank: number;
    /** 그 자리 수 */
    seats: number;
  };
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
  wp?: number;    // 폭투 — 투수 책임. ⚠ 구 세이브엔 없다
  bk?: number;    // 보크 — 투수 책임. ⚠ 구 세이브엔 없다
  /**
   * 승률 — **파생값이다**(`w / (w + l)`). 무승부는 분모에서 뺀다(야구 규칙).
   *
   * ⚠ 저장된 값을 믿지 않고 `sanitizeStatsRecord`가 매번 다시 만든다 —
   *   `era`·`whip`과 같은 취급이다. 구 세이브엔 없다.
   */
  winPct?: number;
  /**
   * 이닝 — **실수다**(`outs / 3`). 31과 2/3이닝이면 `31.6666`이다.
   *
   * 🔴 **야구 표기(`31.2`)를 넣지 않는다** (사용자 확정 2026-08-26).
   *   예전엔 `npc_sim`이 표기를, `match_engine`이 실수를 넣어 **한 필드에 두 형식**이었다.
   *   그 값이 나눗셈에 그대로 쓰여(ERA·WHIP·K/9) 기록이 부풀려졌다.
   * ⚠ 화면 표기는 `baseballFormat.ts`의 `ipLabel`이 만든다.
   */
  ip: number;
  er: number;     // 자책점
  h: number;      // 피안타
  /** 피홈런 (KBO 투수 표의 HR).
   *
   * ⚠ **구 세이브엔 없다.** `undefined`와 0을 가려야 한다 —
   *   0으로 채우면 "피홈런 0개인 투수"가 되어 기록이 거짓이 된다.
   *   화면은 없으면 `—`를 찍는다. */
  hr?: number;
  /** 사구 (KBO 투수 표의 HBP). ⚠ 구 세이브엔 없다 */
  hbp?: number;
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
  /** 2루타·3루타 (KBO 타자 표의 2B·3B).
   *
   * 🔴 이게 없어서 **SLG가 근사**였다 — `(h + hr*3)/ab`는 2루타·3루타를
   *   단타로 센다. 엔진은 처음부터 갈라 만들고 있었고 집계가 버렸다.
   * ⚠ **구 세이브엔 없다.** `undefined`면 옛 근사식으로 떨어진다. */
  b2?: number;
  b3?: number;
  hr: number;  // 홈런
  /** 득점 — **홈을 밟은 사람 것**이다. 타점과 다르다. ⚠ 구 세이브엔 없다 */
  r?: number;
  /**
   * 사구·희생번트·희생플라이 (KBO 타자 표의 HBP·SAC·SF).
   *
   * 🔴 **셋 다 타수가 아니다.** 그래서 타석·출루율 식이 이 값들을 봐야 한다:
   *       PA  = AB + BB + HBP + SAC + SF
   *       OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
   *   예전엔 이 사건들이 **엔진에 아예 없어서** `PA = AB + BB`였다.
   * ⚠ 구 세이브엔 없다 — 그때는 옛 식으로 떨어진다.
   */
  hbp?: number;
  sac?: number;
  sf?: number;
  /**
   * 수비 기록 — 실책·보살·자살과 수비율 (G-3 · 2026-08-29).
   *
   * 🔴 **선수별로 한 건도 안 쌓이고 있었다.** `DefenseStat`은 팀 단위
   *   하나뿐이라 골든글러브를 뽑을 근거가 없었다.
   * ⚠ `fpct`는 **파생값**이다 — `era`·`whip`처럼 매번 다시 만든다.
   *       fpct = (po + a) / (po + a + e)
   * ⚠ 구 세이브엔 없다. `undefined`와 0을 가른다 — 0으로 채우면
   *   "실책 0인 수비수"가 되어 기록이 거짓이 된다.
   */
  e?: number;
  a?: number;
  po?: number;
  fpct?: number;
  rbi: number;    // 타점
  sb: number;     // 도루
  cs?: number;    // 도루자 — 성공률의 분모다. ⚠ 구 세이브엔 없다
  pb?: number;    // 포일 — **포수 책임**. 타자 줄에 실리지만 그 이닝 포수 것이다
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
  /**
   * **플레이어가 직접 고른 계획인가.**
   *
   * ⚠ 자동 진행(`applyRecommendedTraining`)이 매주 계획을 하드코딩 추천으로
   * 덮어썼다. 그 추천 어디에도 구종 개발이 없어서 **자동 진행을 쓰면 구종을
   * 영영 못 배웠다** — 육성 시뮬인데 플레이어가 정한 육성 방향이 사라졌다.
   * 이 표식이 있으면 자동 진행이 계획을 안 건드린다.
   */
  userSet?: boolean;
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
/** ⚠ `overseas`는 해외 2군 직행이다(실플 ②) — 무대는 `pro_abl`/`pro_jbl`이 된다 */
export type CareerFinalChoice = "none" | "draft" | "university" | "independent" | "sports" | "general" | "overseas";

export interface CareerDraftPickLogEntry {
  pickNo: number;
  round: number;
  teamId: string;
  playerId: string;
  playerName: string;
  isUser: boolean;
  /**
   * 어디서 왔나 — 고졸 · 대졸 · 대학 재학 · 독립 (`DRAFT_ROUTE_LABELS`).
   *
   * ⚠ **나이로는 못 가른다.** `runWorldSeasonEnd`에서 나이 증가
   * (`processSeasonEnd`)가 드래프트보다 **먼저** 돌아서, 드래프트 시점의
   * 고졸이 19세일 수도 20세일 수도 있다. 실제로 `age <= 19`로 갈랐더니
   * 연도별 고졸 지명자가 11 → 0 → 0 → 36으로 널뛰었다.
   *
   * 옛 세이브에는 없다(선택 필드).
   */
  route?: string;
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
  /**
   * 해외 2군 지원 (실플 ②, 사용자 확정 2026-08-27).
   *
   * 🔴 고교·대학·독립에서 아주 잘하면 KBL 드래프트를 건너뛰고 ABL·JBL
   *   **2군**으로 바로 간다. 문턱은 **OVR 78 + 대회 성적**이다.
   * ⚠ 1군은 여기가 아니다 — FA·포스팅 경로다.
   * ⚠ 옛 세이브엔 없다. 없으면 빈 배열로 읽는다.
   */
  overseasChoices?: string[];
  /**
   * ⚠ **`sportsMilitaryApplied` 를 지웠다** (2026-09-01 · 트랙 C 가 찾았다).
   *
   * 진로 허브(고2 W28 · 대학 W29)는 **아마추어 진로**이고, 체육부대는
   * **프로 선수** 대상이라 W46 후보공개 → W50 결과로 따로 돈다
   * (`advanceWeek` · `protagonist.sportsUnitApplied`). 시점도 대상도 다르다.
   *
   * 그런데 이 필드를 `true` 로 만드는 코드가 **0건**이었다(두 생산부 다
   * 리터럴 `false`). 진로 결과 화면의 체육부대 블록은 **뜨지도 않았다** —
   * 도달 불가한 죽은 갈래였다. 짝이던 `CareerResults.sportsMilitaryPassed`
   * 는 애초에 타입에 없었고, 넣어 달라는 요청을 거절하고 지우는 쪽을 택했다.
   */
}

export interface CareerResults {
  draftDrafted: boolean;
  draftTeamId: string | null;
  draftRound: number | null;
  draftPick: number | null;
  draftSigningBonus: number;
  universityPassed: string[];
  independentPassed: string[];
  /** 해외 2군 합격 팀. ⚠ 옛 세이브엔 없다 */
  overseasPassed?: string[];
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

// ── 학교·NPC 마스터 타입 ──────────────────────────────────────
// ⚠ 예전엔 "메신저 시스템"이라고 적혀 있었다. 메신저(채팅)는 2026-06-01에
// 통째로 제거됐고(`5687f0de1`), 이 아래는 처음부터 학교·NPC 타입이다
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
  // 방출 — **사유가 다르면 다른 일이다.** `careerEventLabel` 은 셋을 갈라
  // 이름 붙여 뒀는데 그 유형이 `career_events` 에 한 번도 안 들어가서
  // 화면엔 영영 안 떴다 (B-29 D-1 · 사용자 확정 ①). `npc_sim.rs` 가 낸다
  | "release_roster"
  | "release_score"
  | "release_budget"
  // 웨이버 청구 — 방출된 사람을 다른 구단이 데려간다. `npc_sim.rs` 가
  // 예전부터 냈는데 **선언에만 없었다** (B-29 D-8)
  | "waiver_claim"
  // FA 미계약 뒤 독립리그 재도전 (`npc_sim.rs`). 트레이드가 아니다 —
  // `trade` 와 구분해야 「독립 재도전」 이름표가 붙는다
  | "transfer"
  // 육성선수 단년 계약 만료 (`npc_sim.rs`)
  | "development_expired"
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
  /**
   * 육성선수로 입단한 연도. `undefined`면 정식 등록 선수다.
   *
   * ⚠ **신분이지 소속이 아니다.** 2군에 있다고 육성선수가 아니다 — 강등된
   * 정식 등록 선수도 2군에 있다. 판정은 `utils/developmentPlayer.ts`
   */
  developmentSince?: number;
  /**
   * 마지막 재계약 판정 시점의 OVR. 육성선수에게만 있다.
   *
   * 육성선수는 단년 계약이라 해마다 "성장했는가"를 묻고, 이게 그 비교
   * 기준이다. 판정할 때마다 갱신된다 — **입단 시점 고정이 아니다.**
   * 열여덟·아홉이라 입단 대비로 재면 거의 다 성장해서 아무도 안 나가고,
   * 2군 육성 몫이 첫 해에 차서 미지명자 유입이 0이 된다(실측).
   */
  developmentOvr?: number;
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
  /**
   * 그 등판의 구종별 성적 — **무슨 공으로 잡고 무슨 공에 맞았나.**
   *
   * 🔴 `pitch_type` 이 매 투구에 있는데 아무도 안 셌다. 투수 상세에
   *   구종 목록은 뜨는데 실제로 뭘 던졌는지는 알 수 없었다.
   * ⚠ 구 세이브엔 없다.
   */
  pitchMix?: Record<string, { pc: number; k: number; h: number }>;
  /** 이닝별 — 몇 회에 무너졌는지는 합계로 못 본다. ⚠ 구 세이브엔 없다 */
  byInning?: Array<{ inning: number; pc: number; er: number; outs: number }>;
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

/**
 * 리그 거래 기록의 종류.
 *
 * 🔴 **저장 계층(slotRepo)이 아는 일곱과 맞춰야 한다.** 예전엔 다섯뿐이라
 *   `callup`(콜업)·`release`(방출)로 저장된 행이 **화면에서 아이콘만 남고
 *   사라졌다** (2026-08-28 실제 플레이: "아이콘만 있고 내용이 없는 게 잡힌다").
 *   타입이 좁으면 데이터가 조용히 없어진다.
 */
export type LeagueTransactionCategory =
  | "trade" | "fa" | "draft" | "military" | "retirement" | "callup" | "release";

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
  /** 구단 성향 — 안 넣으면 앱을 껐다 켤 때 압박이 50으로 돌아간다 */
  proTeamProfiles?: Record<string, unknown>;
  /**
   * **구단 예산** (4-C · 2026-08-29). 만원 단위.
   *
   * 🔴 예전엔 예산이 `refs.json`의 **정적값**이라 시즌이 지나도 안 변했다.
   *   수입을 만들었으므로 그 결과를 여기 쌓는다.
   *
   * ⚠ **저장해야 한다.** 안 하면 앱을 껐다 켤 때 정적값으로 돌아가고,
   *   그 값을 읽는 셋(신인 계약금·FA 입찰 상한·감독 기대치)이 통째로
   *   되돌아간다 — 이 저장소가 이미 겪은 형태다("한 해에 한 번 가드").
   * ⚠ **갈래 B**: 예산이 움직여도 구단 성향 12개는 안 흔들린다.
   */
  clubBudgets?: Record<string, number>;
  demotionWeek?: Record<string, number>;
  hallOfFame?: Record<string, { year: number; score: number; teams: string[]; num: number }>;
  retiredNumbers?: Record<string, number[]>;
  /** 구단 연속 기록 (연속 포스트시즌 실패 · 연속 우승) */
  teamStreaks?: Record<string, { missedPlayoffs: number; titles: number }>;

  /**
   * **한 해에 한 번만 돌아야 하는 작업의 가드.** 반드시 저장한다.
   *
   * ⚠ 예전엔 `gameStore` 안에만 있었다. 가드가 막으려는 결과(NPC 전원 진급·
   * 나이 +1, 드래프트 거래기록)는 **slot.db에 즉시 쓰여 영구**인데 가드 자신은
   * 세션 한정이라, **앱을 껐다 켜면 없던 일이 됐다.**
   *
   * 실측(`npm run check:seasonendguard`): 재시작 한 번에 NPC 나이가 17 → 18 →
   * (재시작) → 19. 시즌 결산 모달은 주차가 리셋돼야 사라지는데 롤오버가
   * 길어서, 그 도중에 앱이 닫히면 다음 실행에 모달이 다시 뜨고 또 늙는다.
   *
   * 옛 세이브엔 없다 — `undefined`는 "아직 안 돌았다"와 같은 뜻이라 안전하다.
   */
  lastSeasonEndYear?: number;
  lastDraftYear?: number;
}

/** 저장에 넣는 "한 해 한 번" 가드 묶음 */
export interface SaveGuards {
  lastSeasonEndYear?: number;
  lastDraftYear?: number;
  /**
   * 구단 성향 (teamId → 12축).
   *
   * 🔴 **예전엔 저장 안 됐다.** `gameStore.proTeamProfiles`에 "비저장"이라고
   * 적혀 있었고, 시즌 종료마다 갱신하는데(`calc_win_now_pressure_update`)
   * **앱을 껐다 켜면 전부 50으로 돌아갔다** — 성적 압박 모델 전체가 세션
   * 한정이었다. 승강 임계값·방출 판정·FA 입찰이 그 값을 쓴다.
   *
   * `CLAUDE.md`의 "가드는 반드시 저장한다"와 같은 형태다 — 갱신 결과는
   * 영구인데 값 자신이 세션 한정이면 없던 일이 된다.
   */
  proTeamProfiles?: Record<string, unknown>;
  /**
   * **구단 예산** (4-C · 2026-08-29). 만원 단위.
   *
   * 🔴 예전엔 예산이 `refs.json`의 **정적값**이라 시즌이 지나도 안 변했다.
   *   수입을 만들었으므로 그 결과를 여기 쌓는다.
   *
   * ⚠ **저장해야 한다.** 안 하면 앱을 껐다 켤 때 정적값으로 돌아가고,
   *   그 값을 읽는 셋(신인 계약금·FA 입찰 상한·감독 기대치)이 통째로
   *   되돌아간다 — 이 저장소가 이미 겪은 형태다("한 해에 한 번 가드").
   * ⚠ **갈래 B**: 예산이 움직여도 구단 성향 12개는 안 흔들린다.
   */
  clubBudgets?: Record<string, number>;
  demotionWeek?: Record<string, number>;
  hallOfFame?: Record<string, { year: number; score: number; teams: string[]; num: number }>;
  retiredNumbers?: Record<string, number[]>;
  /**
   * 구단 이력 — 연속 기록. **성향(12축)과 섞지 않는다.**
   *
   * 🔴 압박 산식이 `consecutive_missed_playoffs × 5`를 쓰는데 호출부가
   * **0을 하드코딩**했다(주석: "아직 집계하지 않는다"). 그래서 연속 하위권
   * 팀이 추가 압박을 못 받았다 — 매년 +8로 같았다.
   *
   * 진출선은 산식이 이미 쓰는 `total_teams / 2`를 그대로 쓴다(새 수치 없음).
   */
  teamStreaks?: Record<string, { missedPlayoffs: number; titles: number }>;
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
  /**
   * ⚠ **위치 인자로 늘리지 않는다.** 이미 10개라 하나 더 붙이면 호출부에서
   * 순서가 어긋나도 타입이 안 잡는다(둘 다 optional이라 더 그렇다).
   * 묶어서 받으면 필드가 늘어도 이 시그니처를 다시 안 고친다.
   */
  guards: SaveGuards = {},
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
    ...guards,
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

