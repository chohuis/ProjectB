import { ipLabel, rateLabel, eraLabel } from "../utils/baseballFormat";
import { MILITARY_RESULT_WEEK } from "../utils/seasonWeeks";
import { weekLabelOf } from "../utils/seasonCalendar";
import { gatePitchRewards } from "../utils/pitchRewards";
import { derived, get, writable } from "svelte/store";
import type { MessageItem } from "../types/main";
import type {
  AchievementMetrics,
  AchievementRuntime,
  CareerApplications,
  CareerChoiceMode,
  CareerDraftPickLogEntry,
  CareerFinalChoice,
  CareerResults,
  CareerAward,
  CareerSeasonRecord,
  InjuryState,
  NpcCareerEvent,
  NpcSaveState,
  PitchEntry,
  PlayerSeasonStats,
  ProtagonistSave,
  SaveGame,
  SchoolState,
  TrainingPlanState,
  TrainingPreset,
} from "../types/save";
import { makeSaveGame, migrateSaveGame } from "../types/save";
// 진급·나이 함수들은 **덩이 여섯과 함께 나갔다** — 여기 남는 건 새 게임 몫 둘이다
import { initHighSchoolNpcs, entityToProNpcState } from "../utils/gradeAdvance";
// 🔴 드래프트·오프시즌 함수들은 **덩이와 함께 나갔다**(Ⅱ-2) — 여기 남기면
//   쓰는 곳 없는 이름이 store 를 다시 무겁게 만든다
import type { DraftPick, SchoolScenario } from "../types/save";
import type { ProContract } from "../types/save";
// 계약 도장은 위임자의 인자 타입으로만 쓴다 — 찍는 곳은 덩이 셋이다
import { type ContractStamp } from "../utils/contractHistory";
import { transitionReason, universityGradeOf, universityWeekOnEnroll } from "../utils/careerTransition";
import { careerSummaryOf } from "../utils/careerSummary";
import { pitchingOvrOf, battingOvrOf } from "../utils/ovr";
import { masterStore } from "./master";
// store 밖으로 뺀 게임 로직 덩이 — `PLAN_103 §3` Ⅱ-2. 검사는 `gamePathSrc()` 가
// 이 파일과 `usecases/gameStore/*` 를 한 덩이로 읽는다
import { processNpcDraft as processNpcDraftChunk } from "../usecases/gameStore/npcDraft";
import { processAllLeaguesSeasonEnd as processAllLeaguesSeasonEndChunk } from "../usecases/gameStore/seasonEndLeagues";
import { pushMailbox } from "../usecases/gameStore/mailbox";
import * as contracts from "../usecases/gameStore/contracts";
import * as military from "../usecases/gameStore/military";
import { applyEffectToProtagonist } from "../usecases/gameStore/rewards";
import * as seasonBoundary from "../usecases/gameStore/seasonBoundary";
// 🔴 **이름으로 다시 내보낸다.** `applyEffectToProtagonist` 는 효과 계산의
//   정본이고 부르는 자리가 열 곳이다 — `from "../game"` 로 부르던 길을 그대로 둔다
export { applyEffectToProtagonist } from "../usecases/gameStore/rewards";

import { autoLog } from "./autoAdvance";
import { npcLiveStatsStore } from "./npcLiveStats";
import { slotRepo } from "../repo/slotRepo";
import { dehydrateToRepo } from "../repo/npcAdapter";
import { collectScheduleDelta, rollbackScheduleDelta } from "../repo/scheduleDelta";
import { isV3SlotActive } from "../repo/v3Mode";
import type { SeasonEndSummary } from "../utils/npcEngine";
export type { SeasonEndSummary } from "../utils/npcEngine";

// ── 시즌 데이터 getter 등록 (season.ts → game.ts 역방향 의존 없이 슬롯 저장 연동) ──
import type { SaveSeason } from "../types/season";
let _getSeasonData: (() => SaveSeason) | null = null;
export function _registerSeasonGetter(fn: () => SaveSeason) { _getSeasonData = fn; }

// ── gameStore 내부 상태 ────────────────────────────────────────
export interface GameStoreState {
  currentSlotId: string | null;
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  trainingPresets: TrainingPreset[];
  schoolState: SchoolState;
  achievements: AchievementRuntime[];
  achievementMetrics: AchievementMetrics;
  npcs: NpcSaveState[];
  pendingDraft: NpcSaveState[];       // 드래프트 대기 졸업생 (비저장, 시즌 종료 시 채워짐)
  /**
   * 마지막으로 NPC 드래프트를 돌린 시즌.
   *
   * W47 관전 보드와 시즌 종료가 **각각 드래프트를 돌리고 둘 다 거래기록을 쓰던**
   * 문제를 막는다. 어느 쪽이 먼저 돌든 그 해에 한 번만 실행된다.
   */
  lastDraftYear?: number;
  /**
   * `processSeasonEnd`를 한 해에 한 번만 돌게 하는 가드.
   *
   * 세계 오프시즌(`runWorldSeasonEnd`)이 NPC 진급·졸업을 먼저 돌려야
   * 졸업생이 드래프트 풀에 들어간다. 그런데 정상 롤오버는 이미
   * `processSeasonEnd`를 부르므로, 가드가 없으면 **학년이 두 번 오르고
   * 나이가 두 살 는다.**
   */
  lastSeasonEndYear?: number;
  pendingAchievements: string[];      // 미확인 신규 달성 (비저장)
  seasonEndSummary: SeasonEndSummary | null;  // 직전 시즌 종료 처리 요약 (비저장)
  lastTop10Pitcher: import("../types/save").Top10Snapshot | null;  // 직전 투수 TOP10 스냅샷
  lastTop10Batter:  import("../types/save").Top10Snapshot | null;  // 직전 타자 TOP10 스냅샷
  proTeamProfiles: Record<string, import("../stores/master").ProTeamProfile>;  // 구단 성향 (저장됨)
  /** 구단 예산 (4-C · 만원). 안 저장하면 정적값으로 돌아간다 */
  clubBudgets: Record<string, number>;
  /** 2군에 내려간 주차 — 선수 id → weekNum. 등록말소 10일(2주)이 이걸 본다 */
  demotionWeek: Record<string, number>;
  /** 명예의 전당 — 선수 id → 헌액 정보. **이미 넣은 사람을 다시 안 넣는 표**이기도 하다 */
  hallOfFame: Record<string, { year: number; score: number; teams: string[]; num: number }>;
  /** 영구결번 — 팀 id → 비운 번호들. `fix_jersey_numbers` 가 이 번호를 피해야 한다 */
  retiredNumbers: Record<string, number[]>;
  /** 구단 연속 기록 — 연속 포스트시즌 실패 · 연속 우승 (저장됨) */
  teamStreaks: Record<string, { missedPlayoffs: number; titles: number }>;
  /**
   * 구단 목표 순위 — 지출과 우승 이력에서 유도. 시즌 종료에 갱신한다.
   *
   * ⚠ **계산은 `seasonRollover` 한 곳에서만 한다.** 계측기나 화면이 같은 식을
   * 다시 구현하면 표가 둘이 된다 — 이 저장소에서 반복된 결함이다.
   */
  teamTargets: Record<string, number>;
  dayLabel: string;
  logs: string[];
  upcoming: string[];

  // 하위 호환: 기존 $gameStore.player.* 참조 유지
  player: {
    name: string;
    team: string;
    year: string;
    position: string;
    role: string;
    throws: string;
    bats: string;
    overall: number;
    potentialHidden: number;
    condition: number;
    fatigue: number;
    morale: number;
    tags: string[];
    /** 경기 엔진에 넘기는 투수 능력치 — **여덟 개를 다 담는다**(OVR의 33%가 빠졌던 자리) */
    pitcherStats: {
      command: number; velocity: number; staminaCap: number; mentalResil: number;
      control: number; movement: number; clutch: number; holdRunners: number;
    };
  };

  // 하위 호환: 기존 $gameStore.school.* 참조 유지
  school: {
    currentStage: ProtagonistSave["careerStage"];
    attendsUniversity: boolean;
    universityMajor: string;
    plannedUniversityMajors: string[];
  };
}

// ── 기본값 (새 게임) ───────────────────────────────────────────
/** 새 게임의 주인공. ⚠ **검사가 읽는다** — 마이그레이션의 대조군이다 */
export const DEFAULT_PROTAGONIST: ProtagonistSave = {
  id: "PLY_HERO",
  name: "주인공 투수",
  careerStage: "highschool",
  leagueId: "LEAGUE_HIGHSCHOOL",
  // ⚠ **소속을 비워 둔다.** 예전엔 특정 고교가 박혀 있었는데 Phase 5에서 팀 ID를
  // 갈아엎으면서 **없는 팀**이 됐다. 새 게임이 곧 진짜 팀으로 덮으므로 기본값이
  // 특정 팀을 가리킬 이유가 없다 — 가리키면 그게 언젠가 또 썩는다.
  teamId: "",
  schoolId: "",
  grade: 2,
  age: 17,
  playerType: "pitcher",
  position: "SP",
  handedness: "R",
  jerseyNumber: 18,
  condition: 80,
  fatigue: 20,
  morale: 65,
  pitching: { ovr: 55, stamina: 58, velocity: 52, command: 60, control: 55, movement: 50, mentality: 57, recovery: 55, clutch: 50, holdRunners: 50 },
  batting:  { ovr: 38, contact: 35, power: 28, eye: 32, discipline: 30, speed: 50, baseInstinct: 50, bunting: 45, platoon: 50, fielding: 45, arm: 55, battingClutch: 30 },
  primaryPosition: "SP",
  positionRatings: { SP: 54 },
  diligence: 60,
  popularity: 10,
  developmentRate: 62,
  potentialHidden: 88,
  growthPoints: 0,
  tags: ["급성장", "멘탈관리", "선발 로테이션"],
  pitchingXP: {},
  battingXP: {},
  pitches: [{ id: "PITCH_FASTBALL", grade: 3 }],
  money: 1200,
  fame: 5,
  scoutScore: 15,
  proServiceYears: 0,
  militaryUnit: null,
  militaryServiceWeeks: 0,
  militaryRecoveryWeeks: 0,
  militaryStatus: "미필" as const,
  militaryEnlistYear: null,
  militaryDischargeYear: null,
  militaryEnlistWeek: null,
  sportsUnitSelected: false,
  militaryHiatusStage: null,
  militaryDeferPenalty: 0,
  militaryLife: null,
  militaryRecord: null,
  sportsUnitApplied: false,
  tradeAdaptationWeeks: 0,
  faNegotiationRound: 0,
  faUnsignedWeeks: 0,
  pendingNextContract: undefined,
  consecutiveLowMoraleWeeks: 0,
  consecutiveHighFatigueWeeks: 0,
  careerTriggeredEvents: {},
};

const DEFAULT_TRAINING_PLAN: TrainingPlanState = {
  primaryProgramId:    "TRN_CTRL_CMD",
  secondaryProgramId:  "TRN_VEL",
  secondary2ProgramId: "TRN_RECOVERY",
  recoveryProgramId:   "TRN_RECOVERY",
};

const DEFAULT_TRAINING_PRESETS: TrainingPreset[] = [
  { id: "preset-default-1", name: "구속 집중",   primaryProgramId: "TRN_VEL",      secondary1ProgramId: "TRN_CTRL_CMD",  secondary2ProgramId: "TRN_STAMINA"  },
  { id: "preset-default-2", name: "컨트롤 집중", primaryProgramId: "TRN_CTRL_CMD", secondary1ProgramId: "TRN_MOVEMENT",  secondary2ProgramId: "TRN_MENTAL_P" },
  { id: "preset-default-3", name: "회복 루틴",   primaryProgramId: "TRN_RECOVERY", secondary1ProgramId: "TRN_MENTAL_P",  secondary2ProgramId: "TRN_STAMINA"  },
];

const DEFAULT_SCHOOL: SchoolState = {
  attendsUniversity: false,
  universityMajor: "체육교육",
  plannedUniversityMajors: ["스포츠과학", "체육교육", "스포츠경영", "생활체육", "스포츠재활"],
  weeklyStudyMode: "normal",
  examAccumScore: 0,
  lastGrade: null,
  lastGradeRisk: "ok",
  eligibilityBlocked: false,
  warningCount: 0,
  careerChoiceTriggered: false,
  draftTriggered: false,
  careerApplicationsSubmitted: false,
  careerApplications: null,
  careerResults: null,
  careerChoicePopupOpened: false,
  careerChoiceMode: "none",
  careerChoiceConfirmed: false,
  careerDraftPickLog: [],
  careerFinalChoice: "none",
  universityWeek: 0,
  majorSelected: false,
  subjectScores: {
    kor:  { percentile: 13, attendance: 96, assignment: 90 },
    eng:  { percentile: 18, attendance: 93, assignment: 84 },
    math: { percentile: 29, attendance: 89, assignment: 81 },
    soc:  { percentile: 34, attendance: 95, assignment: 92 },
    sci:  { percentile: 41, attendance: 87, assignment: 79 },
  },
};

const DEFAULT_ACHIEVEMENT_METRICS: AchievementMetrics = {
  strikeoutTotal: 0,
  saveTotal: 0,
  trainingWeeksTotal: 0,
  gamesWonTotal: 0,
  eventUniqueTotal: 0,
  eventHiddenTotal: 0,
  eventRareSeasonMax: 0,
};

const DEFAULT_ACHIEVEMENTS: AchievementRuntime[] = [
  { id: "ACH_BASEBALL_FIRST_STRIKEOUT", progress: 0, unlockedAt: null, claimedAt: null },
  { id: "ACH_BASEBALL_100_STRIKEOUTS", progress: 0, unlockedAt: null, claimedAt: null },
  { id: "ACH_BASEBALL_FIRST_SAVE", progress: 0, unlockedAt: null, claimedAt: null },
];

// ⚠ **새 게임 소식함은 비어서 시작한다** (사용자 결정 2026-09-03).
//   예전엔 자리표시자 넷(msg-000~003)이 박혀 있었다 — 보낸이 이름이 고정이라 실제
//   코치·감독과 안 맞고, 보직과 무관하게 "선발 확정", 안 한 훈련의 "커맨드 +1" 이
//   첫 소식함에 그대로 들어갔다(새 게임이 소식함을 안 비운다).
//   첫 소식함은 시즌 브리핑·훈련 결과·보직 선택 같은 실제 시스템 소식이 채운다.
const DEFAULT_MAILBOX: MessageItem[] = [];

// ── 헬퍼: ProtagonistSave → player 호환 객체 ──────────────────
/**
 * 구단 성향을 **예산 지수 + 성향에서 유도한다** — 새 게임의 시작값이다.
 *
 * 🔴 **정본이 하나다**(2026-09-22 · 2단계 ③ · 사용자 확정 ⓐ). 예전엔 ABL 32팀만
 *   `refs.json` 에 12항목이 손수 적혀 있었고 나머지는 파생이라, 같은 값이 두
 *   잣대로 만들어졌다 — 리그끼리 비교가 안 됐고 파생 규칙을 고쳐도 ABL 만
 *   안 따라왔다. 손수 값은 지웠다(성향 ①을 고를 때 근거로 이미 다 썼다).
 *
 * ⚠ 마스터가 아직 안 실렸으면 빈 객체다 — 그때는 `initProTeamProfiles`가
 *   뒤달아 채운다. 둘 다 `!map[id]` 규칙이라 순서가 바뀜도 안전하다.
 */
/** 기질 세 축 — 예산으로는 못 정하는 것들 */
interface Temperament {
  stability: number;
  discipline: number;
  clubhouseCulture: number;
}

/**
 * 철학 → 기질 세 축의 **더할 값** (제안값 · 2026-09-22 · A).
 *
 * 🔴 왜 이게 필요한가. 파생은 **예산 지수 한 축의 1차식**이라 `stability`·
 *   `discipline`·`clubhouseCulture` 를 늘 50 으로 뒀다. 그래서 Rust 의
 *   갈래 여섯이 죽어 있었다 — `team_engine.rs` 의 `stability > 70`·`< 35`·
 *   `discipline > 70` 과 `player_engine.rs` 의 `stability` 둘. **`discipline > 70`
 *   은 지금 0팀**이다(실측 2026-09-22). 예산으로는 이 셋을 못 정한다 —
 *   돈이 많다고 규율이 서지 않는다. 정할 수 있는 것은 **철학과 자원**이다.
 *
 * ⚠ **밸런스 값이다 — 제안이다.** 동결 규칙대로 `docs/BALANCE_BACKLOG.md`
 *   「구단 기질 세 축」 절에 근거와 함께 적었다. 넣을지는 사용자가 정한다.
 * ⚠ 범위는 손수 적힌 ABL 값의 분포 안에 둔다(`30 ~ 72`). 밖으로 나가면
 *   손수값과 파생값이 **다른 잣대**가 되어 리그끼리 못 비교한다.
 * ⚠ 철학 이름은 **있는 12값 그대로**다. 새 값을 만들지 않는다 —
 *   `QUALITY_BY_PHILOSOPHY`(`repo/newGameV3.ts`)가 같은 12값을 쓴다.
 */
const TEMPERAMENT_BY_PHILOSOPHY: Record<string, Temperament> = {
  // 오래 하던 방식을 지킨다 — 감독·프런트를 자주 안 바꾼다
  "전통/정통":         { stability: 18, discipline: 10, clubhouseCulture:   4 },
  // 고참을 오래 데리고 간다 · 선참 문화가 선다
  베테랑우대:          { stability: 16, discipline:  2, clubhouseCulture:   8 },
  // 몸을 아끼는 운영이라 선수가 오래 남는다
  "부상방지/재활특화": { stability: 10, discipline:  8, clubhouseCulture:  10 },
  // 실수를 안 하는 야구 — 반복 훈련과 약속 플레이가 많다
  "수비/짜임새":       { stability:  8, discipline: 14, clubhouseCulture:   2 },
  // 투수 운용 규칙(등판 간격·구수)이 엄하다
  투수왕국:            { stability:  6, discipline:  8, clubhouseCulture:  -2 },
  // 판단 기준이 숫자라 사람이 바뀌어도 안 흔들린다
  데이터중심:          { stability:  6, discipline: 12, clubhouseCulture:   0 },
  // 작전 야구 — 약속이 많고 개인 재량이 적다
  스몰볼:              { stability:  4, discipline: 10, clubhouseCulture:   2 },
  // 🔴 **규율이 곧 정체성이다.** `discipline > 70` 을 넘기는 유일한 철학이다
  "스파르타(혹독훈련)": { stability:  2, discipline: 22, clubhouseCulture: -14 },
  // 치는 것이 답이라 세부 규율이 느슨하다
  "공격야구(화력)":    { stability: -2, discipline: -10, clubhouseCulture:  4 },
  // 뭉치는 힘으로 버틴다 — 분위기가 자산이다
  "근성/언더독":       { stability: -4, discipline:  6, clubhouseCulture:  10 },
  // 어린 선수를 계속 갈아 끼운다 — 자리가 안 고정된다
  육성중심:            { stability: -6, discipline:  4, clubhouseCulture:  12 },
  // 판을 자주 엎는다 — 가장 안 안정적이다
  "젊은피(세대교체)":  { stability: -18, discipline: -4, clubhouseCulture:  8 },
};

/**
 * 자원 → 기질 세 축의 **더할 값** (제안값 · 2026-09-22 · A).
 *
 * 철학보다 폭이 좁다 — 자원은 이미 예산 지수로 아홉 항목에 들어가 있다.
 * 여기서 또 크게 밀면 **같은 축을 두 번 곱하는 셈**이 된다.
 */
const TEMPERAMENT_BY_RESOURCE: Record<string, Temperament> = {
  // 돈이 있으면 한 해 못했다고 급히 안 바꾼다
  부유: { stability:   8, discipline:  0, clubhouseCulture:   6 },
  // 이름 그대로 중간
  안정: { stability:   2, discipline:  2, clubhouseCulture:   2 },
  // 살림을 쪼개 쓰느라 사람을 자주 바꾼다 · 대신 관리가 빡빡하다
  알뜰: { stability:  -6, discipline:  4, clubhouseCulture:  -2 },
  // 매년 살림이 흔들린다 — 남는 사람이 없다
  궁핍: { stability: -16, discipline: -4, clubhouseCulture: -10 },
};

/** 기질의 아래·위 — 손수 적힌 ABL 값의 분포와 같은 칸에 둔다 */
const TEMPERAMENT_MIN = 30;
const TEMPERAMENT_MAX = 72;

/**
 * 연혁 → `prestige` **한 칸**의 가산 (제안값 · 2026-09-25 · A).
 *
 * 🔴 왜. 파생은 **지금 예산**만 본다. 그래서 「몰락한 명문」이 무명 팀 아래로
 *   내려갔다 — HARBORHAWKS 는 우승 9회인데 `prestige` 45 로, 우승 2회인
 *   LAKESPIRITS(48) 보다 낮았다. `prestige` 는 이름값이다. 살림이 나빠졌다고
 *   100년 쌓은 이름이 같이 사라지지는 않는다.
 *
 * **머리 공간의 몫으로 더한다** — 절대값을 더하지 않는다. 이유 둘:
 *   ① 천장(`PRESTIGE_CEIL`)을 **구조적으로** 못 넘는다. 자르기(clamp)로 막으면
 *      우승 27회와 3회가 천장에서 같아진다.
 *   ② 몰락한 명문(예산 낮음 = 머리 공간 큼)이 많이 오르고, 부자 명문(이미 위)은
 *      조금 오른다. 그게 「몰락한 명문」이라는 말의 뜻이다.
 *
 * ⚠ **밸런스 값이다 — 제안이다.** 근거·전후·재는 법은
 *   `docs/BALANCE_BACKLOG.md` 「연혁이 `prestige` 에 안 들어간다」 절.
 * ⚠ 범위는 **지금 파생 분포 안**이다. 천장 70 은 SEOUL_ROYALS 의 파생값이고,
 *   바닥은 안 건드린다(가산이 음수가 안 된다). 밖으로 나가면 관중·FA 산식이
 *   보는 잣대가 이 변경 전후로 달라진다.
 * ⚠ **우승이 0 이면 가산도 정확히 0 이다.** 그래야 "같은 예산의 무명 팀"이
 *   비교 기준으로 성립한다 — 전성기 문구만 있고 우승이 없는 팀
 *   (COASTALRAYS · SEAGULLS · SUNS)은 명문이 아니라 "제일 높이 간 해"다.
 */
const PRESTIGE_CEIL = 70;
/** 우승 √n 당 몫. 제곱근이라 22회가 3회의 일곱 배가 아니라 2.7배다 */
const HISTORY_TITLE_WEIGHT = 0.12;
/** 전성기 한 줄이 있으면 — **우승이 있을 때만** 더한다 */
const HISTORY_PEAK_WEIGHT = 0.03;
/** 머리 공간의 절반까지. 우승 18회쯤에서 닿는다 */
const HISTORY_SHARE_MAX = 0.5;

/**
 * 연혁이 가져가는 **머리 공간의 몫** (0 ~ `HISTORY_SHARE_MAX`). 순수 함수다.
 *
 * ⚠ 우승 횟수는 `titleYears.length` 와 `nationalTitles` 중 **큰 쪽**이다 —
 *   두 칸을 더하면 같은 우승을 두 번 센다(28팀 중 27팀은 두 값이 같다).
 *   EMPIRE 만 11 vs 27 로 갈리는데, 옛 우승에 해가 안 적혔을 뿐 횟수는 27 이다.
 */
export function historyPrestigeShare(h?: import("./master").TeamHistory | null): number {
  const titles = Math.max(h?.titleYears?.length ?? 0, h?.nationalTitles ?? 0);
  if (titles <= 0) return 0;
  return Math.min(
    HISTORY_SHARE_MAX,
    HISTORY_TITLE_WEIGHT * Math.sqrt(titles) + (h?.peakEra ? HISTORY_PEAK_WEIGHT : 0),
  );
}

/**
 * 예산 지수 + 성향 → 구단 성향. **순수 함수다** — 검사가 직접 부른다.
 *
 * 지수 1.0(리그 평균)이면 예산이 정하는 아홉 항목이 50으로 기본값과 같다.
 * 거기서 벌린다. 폭은 ±25 안퍼이다 — 더 벌리면 예산이 성향을 지배해서
 * 성적으로 갱신하는 `updateProTeamProfiles`가 덮이는 데 여러 시즌이 걸린다.
 *
 * ⚠ **`traits` 를 안 넘기면 기질 셋이 50이다** — 예전 그대로다. 성향이 없는
 *   팀(해외 28 · B 가 채우는 중)은 지금처럼 중간값을 받는다.
 */
export function deriveProfileFromBudgetIndex(
  idx: number,
  traits?: { philosophy?: string; resource?: string },
  history?: import("./master").TeamHistory | null,
): import("./master").ProTeamProfile {
  const at = (span: number) => Math.round(Math.max(5, Math.min(95, 50 + (idx - 1) * span)));
  // 🔴 **연혁은 `prestige` 한 칸에만 닿는다.** 이름값은 우승이 쌓아 주지만
  //   스카우트·의료·육성은 지금 돈이 정한다 — 연혁이 아홉 항목까지 밀면
  //   "예산이 정본"이라는 설계가 흐려진다
  const histShare = historyPrestigeShare(history);
  const prestigeOf = (base: number) =>
    histShare <= 0 ? base : Math.round(base + Math.max(0, PRESTIGE_CEIL - base) * histShare);
  const phi = traits?.philosophy ? TEMPERAMENT_BY_PHILOSOPHY[traits.philosophy] : undefined;
  const res = traits?.resource ? TEMPERAMENT_BY_RESOURCE[traits.resource] : undefined;
  // ⚠ 둘 다 없으면 **손대지 않는다.** 0 을 더해도 같지만, "없으면 50"을
  //   글로 남겨 둬야 성향이 안 들어온 리그를 표에서 가려 낼 수 있다
  const temp = (k: keyof Temperament) =>
    phi || res
      ? Math.round(Math.max(TEMPERAMENT_MIN, Math.min(TEMPERAMENT_MAX,
          50 + (phi?.[k] ?? 0) + (res?.[k] ?? 0))))
      : 50;
  return {
        // 돈 쓰는 성향은 예산을 따라간다
        ownerSpendingWillingness: at(50),
        // 🔴 **여기 한 칸만 연혁을 본다** (2026-09-25). 나머지는 예산 그대로다
        prestige:                 prestigeOf(at(40)),
        marketAppeal:             at(40),
        scoutingQuality:          at(30),
        medicalQuality:           at(30),
        // 가난한 팀이 **육성·2군에 기란다** — 반대로 밀린다
        developmentFocus:         at(-40),
        farmInvestment:           at(-30),
        // 부자 구단은 지금 이기라는 압박이 크고 인내가 짧다
        winNowPressure:           at(30),
        ownerPatience:            at(-30),
        // 🔴 기질 셋은 **예산이 아니라 철학·자원**이 정한다(위 두 표).
        //   예전엔 셋 다 50 고정이라 Rust 갈래 여섯이 죽어 있었다.
        stability:        temp("stability"),
        discipline:       temp("discipline"),
        clubhouseCulture: temp("clubhouseCulture"),
  };
}

/** 구단 성향을 두는 리그 — 1군·2군 둘 다 같은 구단이다 */
const PRO_LEAGUES = new Set([
  "LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_ABL", "LEAGUE_ABL_FARM",
  "LEAGUE_JBL", "LEAGUE_JBL_FARM",
]);

/**
 * 그 시즌이 **프로 연차로 세어지는가** — 순수 함수다. 검사가 직접 부른다.
 *
 * 🔴 단계만 보면 틀린다. 드래프트 결정이 **먼저** `careerStage`를 pro로
 * 바꾸므로, 고교 시즌을 끝내는 순간 이미 프로로 읽혀 **프로에서 한 경기도
 * 안 뛰었는데 연차가 1**이 됐다(A7 · 씨앗 31337 재현).
 *
 * ⚠ **2군도 프로 연차다.** 실제 KBO도 등록일수로 쌀고, 여기서 빼면
 *   2군 체류가 긴 선수가 FA 자격에 영영 안 닿는다.
 * ⚠ `playedLeagueId`를 안 넘기면 예전대로 단계만 본다 — 구 호출부 호환.
 * ⚠ 리그 목록을 `PRO_LEAGUES`와 공유한다 — 표를 두 번 두지 않는다.
 *   뜻이 갈라지면(예: 성향은 2군을 뺀다) 그때 나눈다.
 */
// ⚠ **`seasonStore.leagueId`는 `initSeason` 때만 정해진다.**
//
// 그걸 부르는 건 새 게임(고교) · 프로 진입(`openProSeason`) · 군 복무뿐이라,
// **고교→대학 진학은 그걸 안 타서 시즌 리그가 고교로 남는다**
// (실측 씨앗 424242: 2028·2029 시즌 리그가 LEAGUE_HIGHSCHOOL인데
//  소속은 university·pro_kbl이었다).
//
// 그래도 **이 판정은 안전하다** — 고교든 대학이든 프로가 아니므로 결과가 같고,
// 프로 진입은 `openProSeason`이 `initSeason`을 부르므로 정확하다.
// 리그 집계도 이미 `leagueState[lid]`를 보게 고쳐졌다
// (`season-helpers.ts` 주석 — 승강 시 2군 기록이 1군 버킷으로 읽히던 것).
//
// ⚠ 다만 **대학 시즌을 리그별로 다루는 기능을 더할 땐 이걸 먼저 본다.**
export function countsAsProSeason(
  careerStage: string,
  playedLeagueId?: string,
): boolean {
  const stageIsPro = ["pro", "pro_kbl", "pro_abl", "pro_jbl"].includes(careerStage);
  if (!stageIsPro) return false;
  if (playedLeagueId === undefined) return true;
  return PRO_LEAGUES.has(playedLeagueId);
}

function profilesFromMaster(): Record<string, import("./master").ProTeamProfile> {
  const teams = get(masterStore).teams ?? [];
  const out: Record<string, import("./master").ProTeamProfile> = {};

  // **예산 지수에서 유도한다** (사용자 확정 2026-08-23).
  //
  // 🔴 여기 위에 "데이터에 적힌 성향이 있으면 그걸 쓴다"는 갈래가 있었다 —
  //    ABL 32팀만 탔고 2026-09-22 에 그 데이터를 지웠다(정본 하나). 갈래도
  //    같이 지운다. 남겨 두면 "아무도 안 타는 우선 경로"가 되어, 다음 사람이
  //    파생을 고칠 때 "ABL 은 손수값이라 다를 수 있다"를 또 의심하게 된다.
  //
  // 🔴 KBL 20팀은 성향 데이터가 아예 없다. `teams/pro_korea/*.json`에
  //    손수 만든 값이 있지만 **구 데이터**다 — seeds로 국내 팀을 통째
  //    교체하면서 팀이 바뀌었다(부산 자이언트웨일스 → 부산 웨이브스).
  //    그래서 "복구"가 아니라 유도다.
  //
  // ⚠ **새 밸런스 수치를 만들지 않는다.** `history.budget`은 이미 있고,
  //   목표 순위도 같은 값에서 유도한다 — 표를 두 번 두지 않으려는 것이다.
  //   기본값 50을 중심으로 지수만큼 벌린다: 지수 1.0 → 50 그대로.
  //   폭은 ±25로 둘렀다 — 더 벌리면 예산이 성향을 지배해 성적으로 갱신되는
  //   `updateProTeamProfiles`가 덮이는 데 여러 시즌이 걸린다.
  const byLeague = new Map<string, typeof teams>();
  for (const t of teams) {
    // ⚠ **프로 리그만.** 구단 성향은 프로용이고 세이브에 저장된다 —
    //   예산이 있는 팀 전부에 붙이면 고교·대학까지 203개가 쌀인다.
    if (!PRO_LEAGUES.has(t.leagueId)) continue;
    const b = t.history?.budget ?? 0;
    if (b <= 0) continue;
    if (!byLeague.has(t.leagueId)) byLeague.set(t.leagueId, []);
    byLeague.get(t.leagueId)!.push(t);
  }
  for (const [, list] of byLeague) {
    const budgets = list.map((t) => t.history?.budget ?? 0);
    const avg = budgets.reduce((x, y) => x + y, 0) / budgets.length;
    if (avg <= 0) continue;
    for (const t of list) {
      // 🔴 **성향과 연혁을 같이 넘긴다.** 안 넘기면 기질 셋이 50 으로 굳고
      //   `prestige` 가 지금 예산만 본다 — 값도 표도 있는데 잇는 선이 없는 그 형태다
      out[t.id] = deriveProfileFromBudgetIndex(
        (t.history?.budget ?? 0) / avg, t.traits, t.history);
    }
  }
  // 2군은 1군 성향을 물려받는다 — **같은 구단이다.**
  // ⚠ 2군에는 `history.budget`이 없어 위 유도에서 빠졌다 — `buildSalaryIndex`도
  //   같은 보완을 한다. 안 하면 승강·육성 판정이 2군을 기본값으로 본다.
  for (const t of teams) {
    if (out[t.id] || !t.id.endsWith("_2")) continue;
    const first = out[t.id.slice(0, -2) + "_1"];
    if (first) out[t.id] = { ...first };
  }

  return out;
}

// `export` 는 Ⅱ-2 덩이 셋(계약·군·진로)이 같은 호환 객체를 만들기 때문이다 — 정본은 여기 하나다
export function toPlayerCompat(p: ProtagonistSave): GameStoreState["player"] {
  const gradeLabel = p.grade ? `${p.grade}학년` : "-";
  const throws = p.handedness === "L" ? "좌투" : p.handedness === "S" ? "양투" : "우투";
  const bats   = p.handedness === "L" ? "좌타" : p.handedness === "S" ? "양타" : "우타";
  const roleLabel =
    p.position === "SP" ? "에이스 선발" :
    p.position === "RP" ? "중간 계투"  :
    p.position === "CP" ? "마무리"     :
    p.position || "미정";
  return {
    name: p.name, team: p.teamId, year: gradeLabel,
    position: p.position, role: roleLabel, throws, bats,
    overall: p.pitching.ovr, potentialHidden: p.potentialHidden,
    condition: p.condition, fatigue: p.fatigue, morale: p.morale,
    tags: p.tags,
    pitcherStats: {
      command:    p.pitching.command,
      velocity:   p.pitching.velocity,
      staminaCap: p.pitching.stamina,
      mentalResil: p.pitching.mentality,
      control:     p.pitching.control,
      movement:    p.pitching.movement,
      clutch:      p.pitching.clutch,
      holdRunners: p.pitching.holdRunners,
    },
  };
}

// ── 헬퍼: school 호환 객체 ────────────────────────────────────
export function toSchoolCompat(
  careerStage: ProtagonistSave["careerStage"],
  s: SchoolState,
): GameStoreState["school"] {
  return {
    currentStage: careerStage,
    attendsUniversity: s.attendsUniversity,
    universityMajor: s.universityMajor,
    plannedUniversityMajors: s.plannedUniversityMajors,
  };
}

const BASE_SEASON_YEAR = 2026;
export function computeWeekLabel(week: number, seasonYear: number = BASE_SEASON_YEAR): string {
  return weekLabelOf(week, seasonYear);
}

// ── 초기 상태 ─────────────────────────────────────────────────
function buildInitialState(): GameStoreState {
  const p = DEFAULT_PROTAGONIST;
  return {
    currentSlotId: null,
    protagonist:  p,
    mailbox:      DEFAULT_MAILBOX,
    trainingPlan: DEFAULT_TRAINING_PLAN,
    trainingPresets: DEFAULT_TRAINING_PRESETS,
    schoolState:  DEFAULT_SCHOOL,
    achievements: DEFAULT_ACHIEVEMENTS,
    achievementMetrics: DEFAULT_ACHIEVEMENT_METRICS,
    npcs:         [],
    pendingDraft: [],
    pendingAchievements: [],
    seasonEndSummary: null,
    lastTop10Pitcher: null,
    lastTop10Batter:  null,
    proTeamProfiles: {},
    clubBudgets: {},
    demotionWeek: {},
    hallOfFame: {},
    retiredNumbers: {},
    teamStreaks: {},
    teamTargets: {},
    dayLabel:     computeWeekLabel(1, BASE_SEASON_YEAR),
    logs:         ["훈련 루틴 설정 완료", "코치 면담으로 제구 +1", "팀 분위기 안정"],
    upcoming:     ["화요일 불펜 세션", "금요일 체력장", "토요일 주말 리그 1차전"],
    player:       toPlayerCompat(p),
    school:       toSchoolCompat(p.careerStage, DEFAULT_SCHOOL),
  };
}

// ── 구버전 세이브 → 새 필드 기본값 채우기 ─────────────────────
/**
 * 옛 세이브의 주인공을 지금 모양으로 맞춘다.
 *
 * ⚠ **검사가 부른다** (`protagonistMigration.test.ts`). 필드를 하나씩 지워
 * 보고 이게 되살리는지 전수로 확인한다 — 안 되살리는 필드는 옛 세이브에서
 * `undefined` 로 남아 화면·계산이 조용히 어긋난다.
 */
/**
 * 옛 계약의 죽은 인센티브를 **비운다** (PLAN_CONTRACT_TERMS §4-1).
 *
 * 예전 타입은 `{ condition: string; bonus: number }` 였다. 문자열이라 기계가
 * 판정할 수 없었고 **채우는 코드가 0건**이었다 — 그래서 실제로 값이 든 세이브는
 * 없어야 하지만, 손으로 만든 세이브·개발 중 세이브에 남아 있을 수 있다.
 *
 * 🔴 **세이브를 지우거나 되돌리지 않는다.** 계약은 그대로 두고 `incentives`
 * 배열에서 **새 모양이 아닌 항목만** 뺀다. 남는 게 없으면 필드 자체를 지운다 —
 * 빈 배열을 두면 선수 상세가 「인센티브」 칸을 열고 아무것도 안 그린다.
 */
export function migrateContract(c: ProContract | undefined): ProContract | undefined {
  if (!c) return c;
  const raw = c.incentives as unknown;
  if (!Array.isArray(raw)) {
    // 배열이 아니면(옛 세이브의 잘못된 값) 필드를 지운다
    if (raw === undefined) return c;
    const { incentives: _drop, ...rest } = c;
    return rest as ProContract;
  }
  // 새 모양은 `kind` 와 숫자 `threshold` 를 갖는다. 옛 `{condition}` 은 여기서 걸린다
  const kept = raw.filter((i) => {
    const o = i as { kind?: unknown; threshold?: unknown; bonus?: unknown };
    return typeof o?.kind === "string" && typeof o?.threshold === "number" && typeof o?.bonus === "number";
  }) as ProContract["incentives"];
  if (kept && kept.length === raw.length) return c;
  if (!kept || kept.length === 0) {
    const { incentives: _drop, ...rest } = c;
    return rest as ProContract;
  }
  return { ...c, incentives: kept };
}
export function migrateProtagonist(p: ProtagonistSave & { learnedPitchIds?: string[] }): ProtagonistSave {
  const def = DEFAULT_PROTAGONIST;

  // learnedPitchIds (구버전) → pitches 배열로 변환
  let pitches: PitchEntry[] = p.pitches ?? [];
  if (pitches.length === 0 && p.learnedPitchIds && p.learnedPitchIds.length > 0) {
    pitches = p.learnedPitchIds.map((id) => ({ id, grade: 3 as const }));
  }
  if (pitches.length === 0) {
    pitches = def.pitches;
  }

  const pitchingMerged = {
    ...p.pitching,
    clutch:      p.pitching.clutch      ?? def.pitching.clutch,
    holdRunners: p.pitching.holdRunners ?? def.pitching.holdRunners,
  };
  // 식은 `utils/ovr.ts` 하나다 — 여기 다시 적으면 이벤트 갈래와 갈린다
  pitchingMerged.ovr = pitchingOvrOf(pitchingMerged);

  const battingMerged = {
    ...p.batting,
    baseInstinct: p.batting.baseInstinct ?? def.batting.baseInstinct,
    bunting:      p.batting.bunting      ?? def.batting.bunting,
    platoon:      p.batting.platoon      ?? def.batting.platoon,
  };
  battingMerged.ovr = battingOvrOf(battingMerged);

  // 구버전 injury 형식 ({ type: "light"|"moderate"|"severe" }) → InjuryState 변환
  const rawInjury = p.injury as unknown as { type?: string; severity?: string; recoveryWeeksLeft?: number } | undefined;
  let migratedInjury: InjuryState | undefined = p.injury as InjuryState | undefined;
  if (rawInjury && rawInjury.type && !rawInjury.severity) {
    const oldType = rawInjury.type as "light" | "moderate" | "severe";
    const injType =
      oldType === "severe" ? "UCL_PARTIAL" :
      oldType === "moderate" ? "ELBOW_INFLAM" : "ARM_FATIGUE";
    migratedInjury = {
      type: injType,
      severity: oldType === "severe" ? "severe" : oldType,
      recoveryWeeksLeft: rawInjury.recoveryWeeksLeft ?? 1,
      totalRecoveryWeeks: rawInjury.recoveryWeeksLeft ?? 1,
      permanentPenaltyApplied: false,
      source: "fatigue",
    };
  }

  return {
    ...p,
    pitching: pitchingMerged,
    batting: battingMerged,
    primaryPosition: p.primaryPosition ?? def.primaryPosition,
    positionRatings: p.positionRatings  ?? def.positionRatings,
    diligence:  p.diligence  ?? def.diligence,
    popularity: p.popularity ?? def.popularity,
    battingXP:  p.battingXP  ?? {},
    pitches,
    injury: migratedInjury,
    consecutiveLowMoraleWeeks:  p.consecutiveLowMoraleWeeks  ?? 0,
    consecutiveHighFatigueWeeks: p.consecutiveHighFatigueWeeks ?? 0,
    careerRecords: p.careerRecords ?? [],
    // 🔴 **병역·프로 계약 묶음** (2026-09-02).
    //
    // 검사(`protagonistMigration.test.ts`)가 이 묶음을 "미필이면 기본값이
    // 의미가 없다"며 KNOWN_MISSING 에 두고 있었다. **그 전제가 틀렸다** —
    // C 가 실제 세이브를 열어 `militaryStatus` 가 없는 걸 확인했고, 그러면
    // `=== "미필"` 이 어디서도 참이 안 된다:
    //
    // ```
    //   game.ts 국제대회 입상 병역 면제      안 걸린다
    //   CareerResultModal 체육부대 갈래      안 뜬다
    //   StatusPage 병역 표시                 어긋난다
    //   RightPanel `104 - militaryServiceWeeks`   NaN
    // ```
    //
    // 새 게임은 C 가 고쳤다(열한 필드). **옛 세이브는 여기서 채운다** —
    // 계수·플래그는 0/false/"미필", 날짜·소속은 null(기본값과 같은 모양).
    // `pendingNextContract` 는 기본값이 undefined 라 그대로 둔다.
    militaryStatus:               p.militaryStatus               ?? def.militaryStatus,
    militaryUnit:                 p.militaryUnit                 ?? def.militaryUnit,
    militaryServiceWeeks:         p.militaryServiceWeeks         ?? def.militaryServiceWeeks,
    militaryRecoveryWeeks:        p.militaryRecoveryWeeks        ?? def.militaryRecoveryWeeks,
    militaryDeferPenalty:         p.militaryDeferPenalty         ?? def.militaryDeferPenalty,
    militaryLife:                 p.militaryLife                 ?? def.militaryLife,
    militaryRecord:               p.militaryRecord               ?? def.militaryRecord,
    // ⚠ **기본값을 두지 않는다.** 구 세이브는 `undefined` 인 채로 남아야
    //   `weeksSinceDischarge` 가 "잴 수 없다"(false)로 떨어진다. 0 을 채우면
    //   군대를 안 다녀온 주인공이 「전역 0주차」가 된다
    dischargedSeason:             p.dischargedSeason,
    dischargedWeek:               p.dischargedWeek,
    militaryEnlistWeek:           p.militaryEnlistWeek           ?? def.militaryEnlistWeek,
    militaryEnlistYear:           p.militaryEnlistYear           ?? def.militaryEnlistYear,
    militaryDischargeYear:        p.militaryDischargeYear        ?? def.militaryDischargeYear,
    militaryHiatusStage:          p.militaryHiatusStage          ?? def.militaryHiatusStage,
    sportsUnitApplied:            p.sportsUnitApplied            ?? def.sportsUnitApplied,
    sportsUnitSelected:           p.sportsUnitSelected           ?? def.sportsUnitSelected,
    proServiceYears:              p.proServiceYears              ?? def.proServiceYears,
    faNegotiationRound:           p.faNegotiationRound           ?? def.faNegotiationRound,
    faUnsignedWeeks:              p.faUnsignedWeeks              ?? def.faUnsignedWeeks,
    tradeAdaptationWeeks:         p.tradeAdaptationWeeks         ?? def.tradeAdaptationWeeks,
    // 죽은 인센티브(`{condition}`)를 비운다 — 계약 자체는 그대로 둔다
    contract:            migrateContract(p.contract),
    pendingNextContract: migrateContract(p.pendingNextContract),
  };
}

// ── 저장된 mailbox 카테고리 정규화 (구버전 save 호환) ──────────────
const MAILBOX_CATEGORY_MAP: Record<string, import("../types/main").MessageCategory> = {
  media:       "news",
  social:      "news",
  training:    "coach",
  hs_training: "coach",
  health:      "coach",
  mental:      "coach",
};
const VALID_MSG_CATEGORIES = new Set(["system", "news", "coach", "manager"]);

/**
 * 세이브에서 실은 메일함을 화면이 쓸 수 있는 모양으로 만든다.
 *
 * ⚠ **중복 `id`를 반드시 걷어낸다.** 소식 목록이 `{#each sorted as msg (msg.id)}`로
 * id를 키로 잡기 때문에, 중복이 하나만 있어도 Svelte가 `each_key_duplicate`로
 * 죽고 **세이브가 아예 안 열린다** — 로드 화면에서 멈춘 채 원인이 안 보인다
 * (2026-08-08 실제로 발생. `msg-digest-w13`이 시즌마다 재생성돼 3시즌째에
 * 두 개가 됐다).
 *
 * 생성 쪽은 고쳤지만 **이미 그 상태로 저장된 세이브가 있다.** 여기서 걸러야
 * 그것들이 다시 열린다. 소식 id는 생성 지점마다 규칙이 달라(타임스탬프·연도·
 * 이벤트 ID 그대로) 유일성을 전제할 수 없으므로, 이 문은 계속 지킨다.
 */
function normalizeMailbox(mailbox: import("../types/main").MessageItem[]): import("../types/main").MessageItem[] {
  const seen = new Set<string>();
  const out: import("../types/main").MessageItem[] = [];
  for (const m of mailbox) {
    if (seen.has(m.id)) continue;   // 먼저 온 것(최신)을 남긴다
    seen.add(m.id);
    if (VALID_MSG_CATEGORIES.has(m.category)) { out.push(m); continue; }
    const mapped = MAILBOX_CATEGORY_MAP[m.category];
    out.push({ ...m, category: mapped ?? "system" });
  }
  return out;
}

// ── SaveGame → 스토어 상태 변환 ───────────────────────────────
/**
 * 학습 품질을 이번 학기에 더한다.
 *
 * ⚠ **`semesterWeeks`는 안 늘린다.** 학점은 `qualityAccum / weeks`라,
 *   주차를 같이 늘리면 평균이 희석돼 **반대 방향으로 간다.**
 * ⚠ 대학 학기가 아니면(주차 0) 그대로 둔다 — 고교는 9등급 경로다.
 */
function applyStudyQuality<T extends { semesterQualityAccum?: number; semesterWeeks?: number }>(
  school: T, delta?: number,
): T {
  if (!delta || (school.semesterWeeks ?? 0) <= 0) return school;
  return { ...school, semesterQualityAccum: (school.semesterQualityAccum ?? 0) + delta };
}

/** 태그를 더하고 뺀다. 없는 태그 제거는 조용히 넘어간다 */
/**
 * 세이브의 구단 성향 + 파생 — **정책 하나**(2026-09-22 · 2단계 ③).
 *
 *   세이브에 있는 팀은 **세이브가 이긴다.** 시즌마다
 *   `updateProTeamProfiles`가 성적으로 갱신한 값이라 파생은 시작점일 뿐이다.
 *   파생으로 덮으면 여러 시즌을 거친 구단 개성이 로드할 때마다 사라진다.
 *   옛 세이브에 남은 ABL 손수 값도 같은 규칙으로 **안 덮는다.**
 *
 *   세이브에 **없는 팀만** 파생으로 채운다.
 *
 * 🔴 예전엔 `saved.proTeamProfiles ?? {}` 뿐이었다. `proTeamProfiles`를
 *   저장하기 전에 만든 세이브(실측 2026-09-22: 테스터 `slot3_slot_1.db` ·
 *   09-05 · 블롭에 칸 자체가 없다)를 열면 **전 팀이 `DEFAULT_TEAM_PROFILE`
 *   (전 항목 50)** 로 떨어졌다 — `App.svelte`가 부트에 부른
 *   `initProTeamProfiles`를 이 자리가 덮었기 때문이다. 압박·승강 임계값·
 *   방출·FA 입찰이 통째로 중립이 된다.
 *
 * ⚠ 마스터가 아직 안 실렸으면 파생이 빈 객체다 — 세이브 값만 남는다(예전 동작).
 */
function mergeSavedProfiles(saved?: Record<string, unknown>): GameStoreState["proTeamProfiles"] {
  const out = { ...(saved ?? {}) } as GameStoreState["proTeamProfiles"];
  for (const [id, p] of Object.entries(profilesFromMaster())) if (!out[id]) out[id] = p;
  return out;
}

function fromSaveGame(saved: SaveGame): GameStoreState {
  const p = migrateProtagonist(saved.protagonist);
  const metrics = { ...DEFAULT_ACHIEVEMENT_METRICS, ...(saved.achievementMetrics ?? {}) };
  const achievements = saved.achievements ?? DEFAULT_ACHIEVEMENTS;
  return {
    currentSlotId: null,
    protagonist:  p,
    mailbox:      normalizeMailbox(saved.mailbox ?? []),
    trainingPlan: saved.trainingPlan,
    trainingPresets: saved.trainingPresets ?? DEFAULT_TRAINING_PRESETS,
    schoolState:  { ...DEFAULT_SCHOOL, ...saved.schoolState },
    achievements,
    achievementMetrics: metrics,
    npcs:         (saved.npcs ?? []).map(n => ({
      ...n,
      potentialHidden: n.potentialHidden ?? 75,
    })),
    pendingDraft: [],
    // ⚠ **가드를 반드시 되살린다.** 안 되살리면 `undefined`가 되어
    // "아직 안 돌았다"로 읽히고, 시즌 종료·드래프트가 재시작마다 다시 돈다 —
    // NPC 전원이 한 살씩 더 먹는다(`npm run check:seasonendguard`).
    // 옛 세이브엔 필드가 없어 `undefined`인데, 그건 실제로 안 돈 것이라 맞다.
    lastSeasonEndYear: saved.lastSeasonEndYear,
    lastDraftYear:     saved.lastDraftYear,
    pendingAchievements: [],
    seasonEndSummary: null,
    lastTop10Pitcher: null,
    lastTop10Batter:  null,
    // ⚠ **되살린다.** 저장만 하고 안 읽으면 아무 일도 안 일어난다 —
    // 이 프로젝트에서 반복된 형태다(가드를 저장했는데 fromSaveGame이 안 읽음)
    proTeamProfiles:  mergeSavedProfiles(saved.proTeamProfiles),
    // ⚠ 안 되살리면 앱을 껐다 켤 때 예산이 정적값으로 돌아간다
    clubBudgets:      (saved.clubBudgets ?? {}) as GameStoreState["clubBudgets"],
    demotionWeek:     (saved.demotionWeek ?? {}) as GameStoreState["demotionWeek"],
    hallOfFame:       (saved.hallOfFame ?? {}) as GameStoreState["hallOfFame"],
    retiredNumbers:   (saved.retiredNumbers ?? {}) as GameStoreState["retiredNumbers"],
    teamStreaks:      (saved.teamStreaks ?? {}) as GameStoreState["teamStreaks"],
    teamTargets:      {},   // 파생값 — 시즌 종료에 다시 계산된다
    dayLabel:     computeWeekLabel(1, BASE_SEASON_YEAR),
    logs:         saved.recentLogs,
    upcoming:     saved.recentUpcoming,
    player:       toPlayerCompat(p),
    school:       toSchoolCompat(p.careerStage, saved.schoolState),
  };
}

// ── 소식함 — `usecases/gameStore/mailbox.ts` (2026-09-30 · Ⅱ-2) ────
//
// ⚠ **정본은 그 파일 하나다.** 상한·중복·집계는 store 상태를 만지는 코드가
//   아니라 소식함 **정책**이라 store 밖이 제자리다. 여기서는 **그대로 다시
//   내보내기만** 한다 — `from "../stores/game"` 로 부르던 길(화면·계측·검사)이
//   한 줄도 안 바뀐다.
export {
  MAX_MAILBOX,
  mailboxTrimStats,
  resetMailboxTrimStats,
  messageKindOf,
  mailboxProduceStats,
  resetMailboxProduceStats,
  mailboxDupStats,
  resetMailboxDupStats,
  pushMailbox,
  trimMailbox,
} from "../usecases/gameStore/mailbox";
/**
 * **일어난 일**을 몇 건까지 들고 있나 (2026-09-08 · L1).
 *
 * 커리어 이력이 아니라 「최근에 무슨 일이 있었나」를 묻는 창이다. 조건이 보는
 * 폭이 길어야 몇 주(`outcome_within`)라 넉넉하다 — 그리고 **세이브에 매주
 * 실리는 값**이라 무한히 쌓게 두지 않는다.
 */
const OUTCOME_KEEP = 24;


function updateAchievementProgress(
  current: AchievementRuntime[],
  metrics: AchievementMetrics,
): AchievementRuntime[] {
  const now = new Date().toISOString();
  return current.map((item) => {
    if (item.id === "ACH_BASEBALL_FIRST_STRIKEOUT") {
      const progress = Math.max(item.progress, metrics.strikeoutTotal);
      const unlockedAt = item.unlockedAt ?? (progress >= 1 ? now : null);
      return { ...item, progress, unlockedAt };
    }
    if (item.id === "ACH_BASEBALL_100_STRIKEOUTS") {
      const progress = Math.max(item.progress, metrics.strikeoutTotal);
      const unlockedAt = item.unlockedAt ?? (progress >= 100 ? now : null);
      return { ...item, progress, unlockedAt };
    }
    if (item.id === "ACH_BASEBALL_FIRST_SAVE") {
      const progress = Math.max(item.progress, metrics.saveTotal);
      const unlockedAt = item.unlockedAt ?? (progress >= 1 ? now : null);
      return { ...item, progress, unlockedAt };
    }
    return item;
  });
}


// ── NPC 스탯라인 생성 헬퍼 ──────────────────────────────────────
// `export` 는 Ⅱ-2 덩이 여섯(시즌 경계)이 같은 줄을 만들기 때문이다 — 정본은 여기 하나다
export function buildNpcStatLine(stat: PlayerSeasonStats): string {
  if (stat.type === "pitcher") {
    return `${stat.w}승 ${stat.l}패 ERA ${eraLabel(stat.era)} ${ipLabel(stat.ip)}이닝 ${stat.k}K`;
  }
  return `타율 ${rateLabel(stat.avg)} ${stat.hr}홈런 ${stat.rbi}타점 ${stat.ab}타수`;
}

// ── 저장 배치 (P8-2a) ────────────────────────────────────────
//
// `save()` 한 번이 NPC 5,596명 전원을 slot.db에 다시 쓴다. 자동 진행이 이걸
// 주당 3회 불러 **주간 시간의 55%**를 태우고 있었다 (PHASE8_PLAN §6-3).
//
// 배치를 연 구간에서는 쓰지 않고 표시만 하고, 주 경계에서 한 번 쓴다.
// ⚠ **여는 쪽은 `runAutoAdvance` 하나뿐이다.** 배치를 넓게 열수록 크래시 때
// 잃는 진행이 길어진다 — 자동 진행 밖(모달·페이지)은 지금까지처럼 즉시 쓴다.
let _saveBatchDepth = 0;
let _saveBatchDirty = false;

// ── 스토어 생성 ───────────────────────────────────────────────
function createGameStore() {
  const { subscribe, update, set } = writable<GameStoreState>(buildInitialState());

  /** 실제 slot.db 쓰기 — `save`/`flushSave`가 공유하는 유일한 경로 */
  async function writeSlot(): Promise<void> {
    const s = get({ subscribe });
    if (!isV3SlotActive() || !s.currentSlotId || !_getSeasonData) return;
    try {
      const slotId = s.currentSlotId;
      const slimGame = {
        ...makeSaveGame(
          s.protagonist, s.mailbox, s.trainingPlan,
          s.schoolState, s.achievements, s.achievementMetrics, s.logs, s.upcoming,
          [], s.trainingPresets,
        ),
      };
      const season = _getSeasonData();
      const slimSeason = { ...season, npcLiveStats: {} };
      await slotRepo.setProtagonist(slotId, slimGame);
      // 🔴 **일정은 바뀐 것만 보낸다.** 시즌 전체를 매주 다시 보내고 있었다 —
      // `setSeason`이 IPC의 32.5%인데 주마다 3.3%만 달라진다(실측).
      // `null`이면 전량 모드다(첫 저장·항목이 줄어든 경우 — 롤오버 등).
      const schedDelta = collectScheduleDelta(slimSeason);
      // ⚠ **델타를 얹기만 하면 소용없다.** 원본에 일정이 그대로 있으면
      // 오히려 더 보낸다(실측: 975MB → 996MB로 늘었다). 델타를 쓸 땐
      // 본문에서 일정을 **비운다** — 저장 쪽이 어차피 안 읽는다.
      //
      // ⚠ **리그 키는 남긴다.** `writeSeason`이 `Object.keys(leagueSchedules)`로
      // `__leagueScheduleIds`를 만들고 `readSeason`이 그걸로 복원한다 —
      // 키까지 지우면 리그 일정이 통째로 안 읽힌다.
      const payload = schedDelta
        ? {
            ...slimSeason,
            schedule: [],
            leagueSchedules: Object.fromEntries(
              Object.keys(slimSeason.leagueSchedules ?? {}).map((k) => [k, []]),
            ),
          }
        : slimSeason;
      try {
        await slotRepo.setSeason(slotId, payload, schedDelta ?? undefined);
      } catch (e) {
        // ⚠ 저장이 실패했는데 스냅샷만 앞서 가면 **그 경기가 영영 안 보내진다**
        rollbackScheduleDelta();
        throw e;
      }
      // 전환기: 주간 변이가 repo 커맨드로 전면 이관(R3a-4c)되기 전까지 벌크 동기화
      await slotRepo.syncNpcs(slotId, dehydrateToRepo(s.npcs, get(npcLiveStatsStore)));
      // ⚠ **통산 요약을 메타에 같이 남긴다.** 슬롯 선택 화면이 성적을 보여주려면
      // 그 값이 메타에 있어야 한다 — 없으면 슬롯 3개의 전체 세이브를 열어야 하고,
      // 그건 목록 한 번 뜨는 데 slot.db 세 개를 여는 일이다(각 19MB).
      //
      // `meta`는 키-값 테이블이라 키를 늘려도 스키마 변경이 아니다.
      const career = careerSummaryOf(s.protagonist.careerRecords ?? []);
      await slotRepo.setMeta(slotId, {
        career_stage: s.protagonist.careerStage,
        season_year: season.seasonYear,
        current_week: season.currentWeek,
        team_id: s.protagonist.teamId,
        career_w: career.w,
        career_l: career.l,
        career_era: career.era,
        career_seasons: career.seasons,
      });
    } catch (e) {
      console.error("[gameStore] save 예외:", e);
    }
  }

  /** 밀린 쓰기 반영. 더티가 아니면 아무것도 안 한다 */
  async function flushSaveImpl(): Promise<void> {
    if (!_saveBatchDirty) return;
    _saveBatchDirty = false;
    await writeSlot();
  }

  return {
    subscribe,

    // 슬롯에서 복원 (game + slotId 설정)
    hydrateFromSlot(game: SaveGame, slotId: string) {
      const state = fromSaveGame(migrateSaveGame(game as unknown as Record<string, unknown>));
      set({ ...state, currentSlotId: slotId });
    },

    // 현재 상태를 SaveGame 객체로 반환 (부수효과 없음)
    toSaveGame(): SaveGame {
      const s = get({ subscribe });
      return makeSaveGame(
        s.protagonist, s.mailbox, s.trainingPlan,
        s.schoolState, s.achievements, s.achievementMetrics, s.logs, s.upcoming,
        s.npcs, s.trainingPresets,
        // ⚠ **반드시 같이 저장한다.** 이걸 빼면 앱을 껐다 켤 때마다
        // 시즌 종료·드래프트가 다시 돌아 NPC 전원이 한 살씩 더 먹는다
        // (`npm run check:seasonendguard`).
        {
          lastSeasonEndYear: s.lastSeasonEndYear, lastDraftYear: s.lastDraftYear,
          // ⚠ **구단 성향도 같이 저장한다.** 예전엔 "비저장"이라 앱을 껐다
          // 켜면 압박이 전부 50으로 돌아갔다 — 시즌마다 갱신해도 남지 않았다
          proTeamProfiles: s.proTeamProfiles,
          // 🔴 **예산도 같이 저장한다.** 안 하면 앱을 껐다 켤 때 refs 정적값으로
          // 돌아가고, 그 값을 읽는 셋(신인 계약금·FA 입찰 상한·감독 기대치)이
          // 통째로 되돌아간다 — 성향에서 이미 겪은 형태다 (4-C · 2026-08-29)
          clubBudgets: s.clubBudgets,
          demotionWeek: s.demotionWeek,
          hallOfFame: s.hallOfFame,
          retiredNumbers: s.retiredNumbers,
          teamStreaks: s.teamStreaks,
        },
      );
    },

    // 활성 슬롯 ID 설정 (새 게임 시작 시 슬롯 선택 후 호출)
    /** 연속 기록 갱신 — 시즌 종료에 한 번. 진출선은 압박 산식과 같은 기준이다 */
    /** 목표 순위 묶음 갱신 — 시즌 종료에 한 번 */
    setTeamTargets(map: Record<string, number>) {
      update((s) => ({ ...s, teamTargets: { ...s.teamTargets, ...map } }));
    },

    patchTeamStreak(teamId: string, v: { missedPlayoffs: number; titles: number }) {
      update((s) => ({ ...s, teamStreaks: { ...s.teamStreaks, [teamId]: v } }));
    },

    setCurrentSlotId(slotId: string | null) {
      update((s) => ({ ...s, currentSlotId: slotId }));
    },

    /**
     * 저장: v3 슬롯 → slot.db (slim 블롭 + npc 테이블 동기화).
     *
     * **배치 모드 안에서는 쓰지 않고 표시만 한다** (P8-2a). 이 함수 한 번이
     * NPC 5,596명 전원을 `INSERT OR REPLACE`하는데, 자동 진행이 주당 3번 불렀다 —
     * 주간 시간의 55%였다 (PHASE8_PLAN §6-3).
     *
     * 배치는 `runAutoAdvance`만 연다. **모달·페이지의 호출부 55곳은 의미가 그대로**라
     * 사용자 조작 뒤에는 지금까지처럼 즉시 영속된다.
     */
    async save() {
      if (_saveBatchDepth > 0) { _saveBatchDirty = true; return; }
      await writeSlot();
    },

    /** 배치 시작 — 중첩 가능. 반드시 `endSaveBatch`와 짝지어 `finally`에서 닫는다 */
    beginSaveBatch() { _saveBatchDepth++; },

    /** 배치 종료 — 밀린 쓰기가 있으면 여기서 한 번 쓴다 */
    async endSaveBatch() {
      _saveBatchDepth = Math.max(0, _saveBatchDepth - 1);
      if (_saveBatchDepth === 0) await flushSaveImpl();
    },

    /** 배치 중에도 지금 쓴다 — 주 경계처럼 "여기까지는 남아야 하는" 지점용 */
    flushSave: flushSaveImpl,

    /**
     * 아직 slot.db에 안 쓴 변경이 있는가.
     *
     * **회귀 검사용이다.** 이 상태에서 slot.db를 읽으면 낡은 값이 온다 —
     * `processTradeWindow`가 실제로 그랬다 (PHASE8_PLAN §7-6).
     */
    hasUnsavedChanges(): boolean { return _saveBatchDirty; },

    // 주 진행 후 주인공 상태 패치
    applyWeekResult(
      protagonistPatch: Partial<ProtagonistSave>,
      newLogs: string[],
      newUpcoming: string[],
      week: number,
      seasonYear: number = BASE_SEASON_YEAR,
    ) {
      update((s) => {
        const p = { ...s.protagonist, ...protagonistPatch };
        return {
          ...s,
          protagonist: p,
          dayLabel:    computeWeekLabel(week, seasonYear),
          logs:        [...newLogs, ...s.logs].slice(0, 30),
          upcoming:    newUpcoming,
          player:      toPlayerCompat(p),
          school:      toSchoolCompat(p.careerStage, s.schoolState),
        };
      });
    },

    applyInjuryTreatment(choice: import("../types/save").InjuryTreatment) {
      update((s) => {
        const inj = s.protagonist.injury;
        if (!inj) return s;

        let updatedInj = { ...inj, treatmentChoice: choice };

        let moneyDelta = 0;
        if (choice === "steroid") {
          const reduced = Math.max(1, updatedInj.recoveryWeeksLeft - 3);
          updatedInj = { ...updatedInj, recoveryWeeksLeft: reduced, totalRecoveryWeeks: reduced, steroidUsed: true };
          moneyDelta = -2_000_000;
        } else if (choice === "prp") {
          const reduced = Math.max(1, updatedInj.recoveryWeeksLeft - 5);
          updatedInj = { ...updatedInj, recoveryWeeksLeft: reduced, totalRecoveryWeeks: reduced };
          moneyDelta = -5_000_000;
        } else if (choice === "counseling") {
          // YIPS 심리 상담: 8~12주로 단축 (기존이 그보다 길면)
          const reduced = Math.min(updatedInj.recoveryWeeksLeft, 10);
          updatedInj = { ...updatedInj, recoveryWeeksLeft: reduced, totalRecoveryWeeks: reduced };
          // 주당 비용은 advanceWeek에서 매주 차감
        } else if (choice === "surgery") {
          // 중증 → 수술 전환: UCL_PARTIAL→UCL_FULL, ROTATOR_STRAIN→ROTATOR_FULL
          const surgeryType = inj.type === "UCL_PARTIAL" ? "UCL_FULL"
            : inj.type === "ROTATOR_STRAIN" ? "ROTATOR_FULL"
            : "UCL_FULL";
          // 수술 회복 주수: UCL_FULL 기준 65주, ROTATOR_FULL 58주
          const surgeryWeeks = surgeryType === "UCL_FULL" ? 65 : 58;
          updatedInj = {
            ...updatedInj,
            type:               surgeryType as import("../types/save").InjuryType,
            severity:           "surgery",
            recoveryWeeksLeft:  surgeryWeeks,
            totalRecoveryWeeks: surgeryWeeks,
            rehabPhase:         1,
          };
        }

        const newMoney = Math.max(0, (s.protagonist.money ?? 0) + moneyDelta);
        return {
          ...s,
          protagonist: { ...s.protagonist, injury: updatedInj, money: newMoney },
        };
      });
    },

    markMessageRead(id: string) {
      update((s) => ({
        ...s,
        mailbox: s.mailbox.map((m) =>
          m.id === id && m.readAt === null ? { ...m, readAt: "방금" } : m
        ),
      }));
    },

    markAllMessagesRead() {
      update((s) => ({
        ...s,
        mailbox: s.mailbox.map((m) => {
          if (m.readAt !== null) return m;
          if (m.decision?.selectedOptionId === null) return m;
          return { ...m, readAt: "방금" };
        }),
      }));
    },

    resolveDecision(messageId: string, optionId: string) {
      update((s) => {
        const msg    = s.mailbox.find((m) => m.id === messageId);
        const option = msg?.decision?.options.find((o) => o.id === optionId);
        // 🔴 **구종 보상은 유니크·히든에서만 먹는다** (2026-09-09 · R1).
        //   등급은 소식에 **스냅샷으로** 실려 있다(`eventGrade`) — 규칙 id 로
        //   되짚으면 소식함에 남은 옛 소식이 지금 데이터의 등급으로 보인다
        const fx     = option?.effects && gatePitchRewards(option.effects, msg?.eventGrade);

        const mailbox = s.mailbox.map((m) => {
          if (m.id !== messageId || !m.decision) return m;
          return { ...m, readAt: m.readAt ?? "방금", decision: { ...m.decision, selectedOptionId: optionId } };
        });

        if (!fx) return { ...s, mailbox };

        const updated = applyEffectToProtagonist(s.protagonist, fx);
        const nextSchool = applyStudyQuality(s.schoolState, fx.studyQualityDelta);
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
        };
        const nextAchievements = updateAchievementProgress(s.achievements, nextMetrics);
        return {
          ...s,
          mailbox,
          protagonist: updated,
          player: toPlayerCompat(updated),
          schoolState: nextSchool,
          achievementMetrics: nextMetrics,
          achievements: nextAchievements,
        };
      });
    },

    recordBaseballAchievementMetric(payload: { strikeouts?: number; save?: number; won?: boolean }) {
      update((s) => {
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
          strikeoutTotal: s.achievementMetrics.strikeoutTotal + (payload.strikeouts ?? 0),
          saveTotal: s.achievementMetrics.saveTotal + (payload.save ?? 0),
          gamesWonTotal: s.achievementMetrics.gamesWonTotal + (payload.won ? 1 : 0),
        };
        return {
          ...s,
          achievementMetrics: nextMetrics,
          achievements: updateAchievementProgress(s.achievements, nextMetrics),
        };
      });
    },

    recordTrainingWeek() {
      update((s) => {
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
          trainingWeeksTotal: s.achievementMetrics.trainingWeeksTotal + 1,
        };
        return {
          ...s,
          achievementMetrics: nextMetrics,
          achievements: updateAchievementProgress(s.achievements, nextMetrics),
        };
      });
    },

    claimAchievement(id: string) {
      update((s) => ({
        ...s,
        achievements: s.achievements.map((a) =>
          a.id === id && a.unlockedAt && !a.claimedAt ? { ...a, claimedAt: new Date().toISOString() } : a,
        ),
      }));
    },

    // 업적 체크 결과 적용 (advanceWeek / 경기 후 호출)
    applyAchievementCheck(result: import("../utils/achievementEngine").AchievementCheckResult) {
      if (result.newlyUnlocked.length === 0 && result.updatedRuntime.length === 0) return;
      update((s) => ({
        ...s,
        achievements:        result.updatedRuntime,
        pendingAchievements: [...s.pendingAchievements, ...result.newlyUnlocked],
      }));
    },

    // 업적 알림 뱃지 클리어 (탭 진입 시 호출)
    clearAchievementNotifications() {
      update((s) => ({ ...s, pendingAchievements: [] }));
    },

    updateNpcCareerStatus(npcId: string, status: import("../types/save").NpcCareerStatus) {
      update((s) => ({
        ...s,
        npcs: s.npcs.map(n => n.npcId === npcId ? { ...n, careerStatus: status } : n),
      }));
    },

    // NPC 배열 부분 패치 — 기존 s.npcs 중 id 일치 항목만 교체 (트레이드·성장 등)
    // ⚠ 저장소에서 전체를 불러올 때는 setNpcs를 사용할 것 — 여기 쓰면 s.npcs가
    //   비어있는 시점(새 게임/로드 직후)에 조용히 빈 배열이 되는 사고가 난다.
    updateNpcs(updatedNpcs: NpcSaveState[]) {
      const updatedMap = new Map(updatedNpcs.map(n => [n.npcId, n]));
      update((s) => ({
        ...s,
        npcs: s.npcs.map(n => updatedMap.get(n.npcId) ?? n),
      }));
    },

    // NPC 배열 전체 교체 — repo(slot.db) 로부터 전체 로드(hydrate) 전용
    setNpcs(npcs: NpcSaveState[]) {
      update((s) => ({ ...s, npcs }));
    },

    // 신규 NPC 추가 (entry_year 활성화 시 호출)
    addNpcs(newNpcs: NpcSaveState[]) {
      update((s) => {
        const existingIds = new Set(s.npcs.map(n => n.npcId));
        const fresh = newNpcs.filter(n => !existingIds.has(n.npcId));
        return { ...s, npcs: [...s.npcs, ...fresh] };
      });
    },

    // 프로 NPC 초기화: KBL/ABL/JBL 선수가 gameStore.npcs에 없으면 entities에서 변환·추가
    // 세이브 로드 직후 또는 W1 season start 시 호출
    initProNpcsIfMissing(
      entities: import("../stores/master").EntityRow[],
      seasonYear: number,
    ) {
      const s = get({ subscribe });
      const proLeagueSet = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
      const existingIds = new Set(s.npcs.map(n => n.npcId));
      const newProNpcs = entities.filter(e =>
        e.role === "player" &&
        e.status !== "retired" &&
        !existingIds.has(e.id) &&
        (proLeagueSet.has(e.leagueId ?? "") ||
         (e.militaryStatus === "현역" && proLeagueSet.has(e.originLeagueId ?? "")))
      ).map(e => entityToProNpcState(e, seasonYear));

      // proServiceYears=0인 기존 NPC에 master entity 값 동기화 (Phase5 이전 세이브 대응)
      const entityMap = new Map(entities.map(e => [e.id, e]));
      const patchedNpcs = s.npcs.map(n => {
        if ((n.proServiceYears ?? 0) > 0) return n;
        const e = entityMap.get(n.npcId);
        const psy = e?.details?.player?.proServiceYears;
        if (!psy || psy <= 0) return n;
        return { ...n, proServiceYears: psy };
      });

      const patched = patchedNpcs.filter((n, i) => n !== s.npcs[i]).length;
      if (patched > 0) autoLog(`[proServiceYears동기화] ${patched}명 0→master값 갱신`);

      if (newProNpcs.length > 0)
        autoLog(`[프로NPC초기화] KBL/ABL/JBL+상무 ${newProNpcs.length}명 → gameStore.npcs 추가 (Y${seasonYear})`);

      if (newProNpcs.length === 0 && patched === 0) return;
      update((st) => ({ ...st, npcs: [...patchedNpcs, ...newProNpcs] }));
    },

    /**
     * 구단 예산을 갱신한다 (4-C).
     *
     * ⚠ **덮어쓰지 않고 합친다** — 리그마다 따로 정산하므로 한 리그를
     *   저장하면서 다른 리그를 지우면 안 된다.
     */
    patchClubBudgets(next: Record<string, number>) {
      update((s) => ({ ...s, clubBudgets: { ...s.clubBudgets, ...next } }));
    },

    /**
     * 시즌이 바뀌면 등록말소 기록을 비운다.
     *
     * 🔴 **`weekNum` 은 시즌마다 리셋된다.** 작년 W48 에 내려간 사람을
     *   올해 W32 와 비교하면 `32 - 48 = -16` 이라 **영원히 락**이다.
     *   실측: 2027W32 에 위반 92명 — 전부 작년 기록이었다.
     *   CLAUDE.md 가 경고한 그 함정이다("weekNum 은 누적이 아니다").
     *   시즌이 넘어가면 등록말소 기간은 어차피 끝난 것이다.
     */
    clearDemotions() {
      update((s) => ({ ...s, demotionWeek: {} }));
    },

    /** 2군에 내려간 주차를 적는다 — 등록말소 기간을 재는 자리다 */
    markDemotions(ids: string[], weekNum: number) {
      if (ids.length === 0) return;
      update((s) => {
        const next = { ...s.demotionWeek };
        for (const id of ids) next[id] = weekNum;
        return { ...s, demotionWeek: next };
      });
    },

    /**
     * 헌액자와 영구결번을 얹는다.
     *
     * ⚠ **덮지 않고 더한다** — 결번은 쌓이는 것이고, 헌액 표는 "이미 넣은
     *   사람"을 가리는 데도 쓴다. 덮으면 매년 같은 사람이 다시 헌액된다.
     */
    addHallOfFame(
      inducted: GameStoreState["hallOfFame"],
      retired: Record<string, number[]>,
    ) {
      update((s) => {
        const nums = { ...s.retiredNumbers };
        for (const [tid, list] of Object.entries(retired)) {
          const set = new Set([...(nums[tid] ?? []), ...list]);
          nums[tid] = [...set].sort((a, b) => a - b);
        }
        return { ...s, hallOfFame: { ...s.hallOfFame, ...inducted }, retiredNumbers: nums };
      });
    },

    patchProTeamProfile(teamId: string, profile: import("../stores/master").ProTeamProfile) {
      update((s) => ({
        ...s,
        proTeamProfiles: { ...s.proTeamProfiles, [teamId]: profile },
      }));
    },

    /**
     * 마스터에서 유도한 구단 성향을 스토어에 **빈 자리만** 채운다.
     *
     * 🔴 **예전엔 불러도 날아갔다.** `App.svelte`가 마스터 로드 직후에
     * 불렀는데, 그 뒤 새 게임이 `proTeamProfiles: {}`로 초기화해 덮었다 —
     * 실측: 마스터엔 성향이 32팀 있는데 게임 스토어는 **0개**였다.
     * 그래서 오프시즌이 전 팀을 `DEFAULT_TEAM_PROFILE`로 봤고, 압박이
     * 전 팀 정확히 50이었다.
     *
     * 🔴 **예전엔 `t.proTeamProfile`(손수 값)만 옮겼다.** 그 데이터를 지운
     *   2026-09-22 부터는 그게 **아무 일도 안 하는 함수**가 된다 — 호출부는
     *   둘인데 조용히 빈다. 그래서 `profilesFromMaster()` 로 바꿨다: 같은
     *   파생을 쓰니 새 게임 경로와 잣대가 하나고, KBL·JBL 도 이제 여기서
     *   채워진다(예전엔 ABL 만 탔다).
     *
     * ⚠ **기존 값을 안 덮는다**(`!map[id]`) — 세이브에 쌓인 성향이
     *   초기값으로 되돌아가면 시즌을 거친 개성이 사라진다. **옛 세이브에
     *   남은 손수 값도 그대로 둔다**(정책 · `proTeamProfilePersist.test`).
     */
    initProTeamProfiles() {
      update((s) => {
        const map: Record<string, import("../stores/master").ProTeamProfile> = {
          ...s.proTeamProfiles,
        };
        for (const [id, p] of Object.entries(profilesFromMaster())) {
          if (!map[id]) map[id] = p;
        }
        return { ...s, proTeamProfiles: map };
      });
    },

    /**
     * 재정 상태 패처 (Phase 7-5). **계산은 `usecases/finance.ts`가 한다** —
     * 여기는 store 규칙대로 얇은 패처만이다 (CLAUDE.md).
     */
    patchFinance(fn: (f: import("../usecases/finance").FinanceState) => import("../usecases/finance").FinanceState) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          finance: fn({
            sponsors: [], subscriptions: [], investments: [], taxPaid: 0, lastOfferSeason: 0,
            ...(s.protagonist.finance ?? {}),
          }),
        },
      }));
    },

    /** 투자 정산 — 손익을 자산에 반영하고 이력을 남긴다 */
    applyInvestmentResult(entry: {
      season: number; optionId: string; name: string;
      principal: number; rate: number; profit: number;
    }) {
      update((s) => {
        const f = {
          sponsors: [], subscriptions: [], investments: [], taxPaid: 0, lastOfferSeason: 0,
          ...(s.protagonist.finance ?? {}),
        };
        return {
          ...s,
          protagonist: {
            ...s.protagonist,
            money: Math.max(0, s.protagonist.money + entry.profit),
            finance: { ...f, investments: [...f.investments, entry] },
          },
        };
      });
    },

    /** 주목도 패처 (Phase 7-7). 쇼케이스·스카우트 데이가 쓴다 */
    applyScoutScoreChange(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          scoutScore: Math.max(0, Math.min(100, s.protagonist.scoutScore + delta)),
        },
      }));
    },

    /** 인기도 패처 (Phase 7-7). 올스타 선발이 쓴다 */
    applyPopularityChange(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          popularity: Math.max(0, Math.min(100, s.protagonist.popularity + delta)),
        },
      }));
    },

    /** 명성 패처 (Phase 7-6c). 사치품·이벤트가 쓴다 */
    applyFameChange(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          fame: Math.max(0, Math.min(200, s.protagonist.fame + delta)),
        },
      }));
    },

    applyMoneyChange(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          money: Math.max(0, s.protagonist.money + delta),
        },
      }));
    },

    updatePopularity(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          popularity: Math.max(0, Math.min(100, s.protagonist.popularity + delta)),
        },
      }));
    },


    // ⚠ **`updateFame`을 지웠다** (2026-09-01). `applyFameChange`와 같은 일을
    //   하면서 상한만 100으로 달랐다 — `applyFameChange`·`applyEventEffects`
    //   (`:891`)·`types/main.ts`가 전부 200인데 여기만 100이었다.
    //
    //   그래서 이벤트·사치품으로 100을 넘긴 명성이 **경기를 한 번 치르면
    //   100으로 잘렸다**(경기 결과 경로가 이걸 썼다). 오류도 로그도 없이
    //   값이 사라진다.
    //
    //   호출부(`applyGameOutcome.ts`)는 `applyFameChange`를 쓴다.

    updateScoutScore(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          scoutScore: Math.max(0, Math.min(100, s.protagonist.scoutScore + delta)),
        },
      }));
    },

    addMessage(msg: MessageItem) {
      update((s) => ({ ...s, mailbox: pushMailbox([msg], s.mailbox) }));
    },

    addMessages(msgs: MessageItem[]) {
      if (!msgs.length) return;
      update((s) => ({ ...s, mailbox: pushMailbox(msgs, s.mailbox) }));
    },

    applyWeekEndBatch(batch: {
      protagonistPatch: Partial<ProtagonistSave>;
      logs: string[];
      weekNum: number;
      seasonYear: number;
      scoutScoreDelta?: number;
      top10Snapshot?: import("../types/save").Top10Snapshot;
      popularityDelta?: number;
      scoutScoreDelta2?: number;
      moraleDelta?: number;
      messages?: MessageItem[];
    }) {
      update((s) => {
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
          trainingWeeksTotal: s.achievementMetrics.trainingWeeksTotal + 1,
        };
        let p = { ...s.protagonist, ...batch.protagonistPatch };
        if (batch.scoutScoreDelta && batch.scoutScoreDelta > 0)
          p = { ...p, scoutScore: Math.max(0, Math.min(100, p.scoutScore + batch.scoutScoreDelta)) };
        if (batch.popularityDelta && batch.popularityDelta > 0)
          p = { ...p, popularity: Math.max(0, Math.min(100, p.popularity + batch.popularityDelta)) };
        if (batch.scoutScoreDelta2 && batch.scoutScoreDelta2 > 0)
          p = { ...p, scoutScore: Math.max(0, Math.min(100, p.scoutScore + batch.scoutScoreDelta2)) };
        if (batch.moraleDelta && batch.moraleDelta > 0)
          p = { ...p, morale: Math.max(0, Math.min(100, p.morale + batch.moraleDelta)) };
        let mailbox = s.mailbox;
        if (batch.messages?.length) mailbox = pushMailbox(batch.messages, s.mailbox);
        let lastTop10Pitcher = s.lastTop10Pitcher;
        let lastTop10Batter  = s.lastTop10Batter;
        if (batch.top10Snapshot) {
          if (batch.top10Snapshot.type === "pitcher") lastTop10Pitcher = batch.top10Snapshot;
          else lastTop10Batter = batch.top10Snapshot;
        }
        return {
          ...s,
          protagonist:        p,
          dayLabel:           computeWeekLabel(batch.weekNum, batch.seasonYear),
          logs:               [...batch.logs, ...s.logs].slice(0, 30),
          upcoming:           [],
          player:             toPlayerCompat(p),
          school:             toSchoolCompat(p.careerStage, s.schoolState),
          achievementMetrics: nextMetrics,
          achievements:       updateAchievementProgress(s.achievements, nextMetrics),
          mailbox,
          lastTop10Pitcher,
          lastTop10Batter,
        };
      });
    },

    setCurrentRole(role: import("../types/save").PitcherRole) {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, currentRole: role } }));
    },

    setPosition(pos: "SP" | "RP" | "CP") {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, position: pos } }));
    },

    /**
     * 이야기 인물 등록부 (죽은 칸 5 · 2026-09-21). 정하는 규칙은
     * `utils/storyNpcRegistry.nextStoryNpcs` 하나 — 여기는 얇은 패처다.
     */
    setStoryNpcs(reg: Record<string, string>) {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, storyNpcs: reg } }));
    },

    /** 고른 자리에서의 내 깊이 (PLAN_ROLE_RECOMMEND §5 · 1.1 A④) */
    setRoleFit(fit: import("../types/save").ProtagonistSave["roleFit"]) {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, roleFit: fit } }));
    },

    /**
     * 보직을 **이미 물은 자리** 를 적어 둔다 (PLAN_ROLE_RECOMMEND §7).
     *
     * 🔴 가드는 `ProtagonistSave` 에 있어 세이브에 그대로 실린다 — 세션에만
     * 두면 앱을 껐다 켤 때 같은 주에 또 묻는다(CLAUDE.md 「한 해에 한 번
     * 가드는 반드시 저장한다」).
     */
    setLastRoleChoiceKey(key: string) {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, lastRoleChoiceKey: key } }));
    },

    // 시즌 시작 시 주인공 스탯 스냅샷 저장 (능력치 트렌드 화살표용)

    /**
     * 훈련 계획을 바꾼다.
     *
     * ⚠ **누가 썼는지 구분한다.** `opts.auto`면 자동 추천이고, 아니면
     * 플레이어가 화면에서 고른 것이다. 자동 진행은 플레이어가 고른 계획을
     * 안 건드린다 — 안 그러면 육성 방향이 매주 지워진다.
     */
    setTrainingPlan(plan: Partial<TrainingPlanState>, opts?: { auto?: boolean }) {
      update((s) => ({
        ...s,
        trainingPlan: {
          ...s.trainingPlan, ...plan,
          userSet: opts?.auto ? (s.trainingPlan.userSet ?? false) : true,
        },
      }));
    },

    addTrainingPreset(preset: TrainingPreset) {
      update((s) => ({ ...s, trainingPresets: [...s.trainingPresets, preset] }));
    },

    removeTrainingPreset(id: string) {
      update((s) => ({ ...s, trainingPresets: s.trainingPresets.filter((p) => p.id !== id) }));
    },

    renameTrainingPreset(id: string, name: string) {
      update((s) => ({
        ...s,
        trainingPresets: s.trainingPresets.map((p) => p.id === id ? { ...p, name } : p),
      }));
    },

    // 주간 학업 선택 모드 저장
    setStudyMode(mode: import("../types/save").StudyMode) {
      update((s) => ({ ...s, schoolState: { ...s.schoolState, weeklyStudyMode: mode } }));
    },

    // advanceWeek에서 주간 학업 효과 반영
    applyWeeklyStudyResult(result: import("../utils/academicsEngine").WeeklyStudyResult) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          examAccumScore:  Math.min(100, s.schoolState.examAccumScore + result.examAccumDelta),
          warningCount:    s.schoolState.warningCount + result.warningCountDelta,
          subjectScores:   result.updatedSubjectScores,
        },
      }));
    },

    // 시험 결과 반영
    applyExamResult(result: import("../utils/academicsEngine").ExamResult) {
      update((s) => {
        const clamp = (v: number) => Math.max(0, Math.min(100, v));
        const p = s.protagonist;
        return {
          ...s,
          protagonist: {
            ...p,
            morale: clamp(p.morale + result.moraleDelta),
          },
          player: toPlayerCompat({ ...p, morale: clamp(p.morale + result.moraleDelta) }),
          schoolState: {
            ...s.schoolState,
            lastGrade:          result.grade,
            lastGradeRisk:      result.riskLevel,
            eligibilityBlocked: result.eligibilityBlocked,
            examAccumScore:     0,   // 시험 후 리셋
            warningCount:       result.eligibilityBlocked
              ? s.schoolState.warningCount
              : Math.max(0, s.schoolState.warningCount - 1), // 경고 1감소(자연 회복)
          },
        };
      });
    },

    /**
     * 대학 학기 성적 확정 (Phase 9-C).
     *
     * ⚠ 고교의 `applyExamResult`와 **다른 경로다.** 고교는 석차 9등급으로
     * 대학 입학 티어를 정하고, 대학은 학점으로 졸업 자격을 정한다.
     * 유급은 `universityWeek`을 **안 올리는 방식**으로 낸다 — 학년 계수기가
     * 거기 하나뿐이라 그래야 정본이 갈라지지 않는다.
     */
    applySemesterResult(
      r: import("../utils/academicsEngine").SemesterResult,
      term: "midterm" | "final",
      seasonYear: number,
    ) {
      update((s) => {
        const sc = s.schoolState;
        return {
          ...s,
          schoolState: {
            ...sc,
            universityGpa: r.cumulativeGpa,
            semesterGpaHistory: [...(sc.semesterGpaHistory ?? []), { year: seasonYear, term, gpa: r.gpa }],
            academicWarningLevel: r.newWarningLevel,
            repeatedYears: (sc.repeatedYears ?? 0) + (r.repeats ? 1 : 0),
            // 2단계 이상이면 다음 학기 출전 정지
            eligibilityBlocked: r.newWarningLevel >= 2,
            // 유급하면 학년 계수기를 한 해(52주) 되돌린다.
            //
            // ⚠ **하한을 뺐다** (2026-09-01). 예전엔 `Math.max(0, …)`였는데,
            // 축 원점을 시즌 경계로 옮기면서 **0 이하가 정상 값**이 됐다
            // (입학 전 위상). 1학년이 유급하면 uw가 음수로 가는 게 맞다 —
            // 다음 시즌 W1에 정확히 1이 되어 1학년을 다시 시작한다.
            // 0에 붙잡아 두면 그 시즌이 한 주씩 밀려 축이 또 어긋난다.
            universityWeek: r.repeats ? sc.universityWeek - 52 : sc.universityWeek,
            // 다음 학기를 위해 누적기를 비운다
            semesterQualityAccum: 0,
            semesterWeeks: 0,
          },
        };
      });
    },

    /** 졸업 확정 — 미지명이어도 여기서 취업 경로가 갈린다 (Phase 11 엔딩) */
    markGraduated() {
      update((s) => ({ ...s, schoolState: { ...s.schoolState, graduated: true } }));
    },

    /**
     * 주간 학업 품질 누적 (대학 전용).
     *
     * ⚠ **고교의 `examAccumScore`를 쓰지 않는다.** 거기엔 `applyWeeklyStudy`가
     * 주당 4씩 더하고 있어서 섞이면 학점이 상한으로 튄다(실측 4.50).
     */
    addWeeklyGpa(quality: number) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          semesterQualityAccum: (s.schoolState.semesterQualityAccum ?? 0) + quality,
          semesterWeeks: (s.schoolState.semesterWeeks ?? 0) + 1,
        },
      }));
    },

    // 출전 정지 해제 (1주 후 자동)
    clearEligibilityBlock() {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, eligibilityBlocked: false },
      }));
    },

    // ⚠ **`setCareerStage`를 지웠다** (2026-09-01). 호출부가 **0건**이었다 —
    //   진로 전이의 실제 정본은 `applyDraftDecision`이다.
    //
    // 🔴 **다만 지운 코드에 실제 경로엔 없는 의도가 들어 있었다.** 대학
    //   진학 시 학업 상태를 리셋하는 것이다:
    //
    // ```
    //   subjectScores    대학용 낮은 값으로 갈아끼운다  (kor 28 · math 45 …)
    //   examAccumScore   0
    //   lastGrade        null
    //   warningCount     0
    //   majorSelected    false
    // ```
    //
    //   `applyDraftDecision`은 **이 중 아무것도 안 한다.** 그래서 지금은
    //   고교 성적·경고가 대학으로 그대로 이어진다.
    //
    // ⚠ **그게 결함인지 아닌지는 잰 적이 없다.** 대학 학점은 `studyModeGpa`
    //   에서만 오므로(`advanceWeek.ts`의 대학 갈래 참고) `subjectScores`는
    //   학점에 안 들어간다 — 훈련 효율(`efficiencyMod`)에만 남는다.
    //   반면 `warningCount`는 이벤트가 읽는다(`school.warningCount`).
    //
    // 🛑 **리셋할지는 밸런스다 — 사용자에게 묻는다.** 지우면서 값을 바꾸면
    //   두 변수가 같이 움직인다. 지금은 동작을 그대로 뒀다.

    // 진로 선택 이벤트 발동 마킹 (중복 방지)
    markCareerChoiceTriggered() {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerChoiceTriggered: true },
      }));
    },

    markDraftTriggered(flag: boolean) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, draftTriggered: flag },
      }));
    },

    setCareerApplicationsSubmitted(flag: boolean) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerApplicationsSubmitted: flag },
      }));
    },

    setCareerChoiceUiState(payload: {
      popupOpened?: boolean;
      mode?: CareerChoiceMode;
      confirmed?: boolean;
    }) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          careerChoicePopupOpened: payload.popupOpened ?? s.schoolState.careerChoicePopupOpened,
          careerChoiceMode: payload.mode ?? s.schoolState.careerChoiceMode,
          careerChoiceConfirmed: payload.confirmed ?? s.schoolState.careerChoiceConfirmed,
        },
      }));
    },

    setCareerApplications(payload: CareerApplications) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerApplications: payload },
      }));
    },

    setCareerResults(results: CareerResults) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerResults: results },
      }));
    },

    clearCareerResults() {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerResults: null, careerApplications: null },
      }));
    },

    appendCareerDraftPickLog(entry: CareerDraftPickLogEntry) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          careerDraftPickLog: [...s.schoolState.careerDraftPickLog, entry].slice(-200),
        },
      }));
    },

    /**
     * 그해 드래프트 **후보 명단**을 남긴다 (Phase 9-E).
     *
     * 관전 보드가 후보를 지명 결과에서만 만들어 **미지명이 항상 0명**이었다.
     * 실제 풀은 1,600명이 넘지만 전원을 싣는 건 무겁고 읽히지도 않으므로
     * 상위 N명만 남긴다 (`draftRules.boardCandidateMultiplier` × 지명 수).
     */
    setCareerDraftCandidates(rows: import("../types/save").DraftBoardCandidate[]) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, careerDraftCandidates: rows },
      }));
    },

    clearCareerDraftPickLog() {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          careerDraftPickLog: [],
        },
      }));
    },

    setCareerFinalChoice(choice: CareerFinalChoice) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          careerFinalChoice: choice,
        },
      }));
    },


    // 대학 전공 선택 확정
    selectMajor(major: string) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, universityMajor: major, majorSelected: true },
      }));
    },

    // 대학 진행 주차 증가 (advanceWeek에서 호출)
    //
    // 🔴 **`grade` 를 여기서 같이 맞춘다** (2026-09-27 · `BALANCE_BACKLOG`
    //   「`protagonist.grade` 가 대학에서 한 해 뒤처진다」 · 제안 ㉯).
    //
    //   예전엔 `processSeasonEnd` 가 적었다. 그 블록은 시즌 **끝**에 도는데
    //   그때 `universityWeek` 은 정확히 52 이고 `universityGradeOf(52)` 는 1 이라
    //   **직전 시즌의 학년**이 남았다(판 #6·#12 의 `[진로점수]` 줄이 2029·2030
    //   둘 다 `grade=1` · 2030 의 진짜 학년은 2).
    //
    // ⚠ **축을 하나로 둔다.** 「+1 을 더해서 다음 주 학년을 적는」 쪽(제안 ㉮)은
    //   왜 +1 인지가 또 하나의 축이 된다. 계수기가 **움직이는 자리**에서 같이
    //   비추면 어긋날 틈이 없다 — `universityWeek` 이 정본이고 `grade` 는 거울이다
    //   (`careerTransition.universityGradeOf` 머리말).
    incrementUniversityWeek() {
      update((s) => {
        const universityWeek = s.schoolState.universityWeek + 1;
        const grade = universityGradeOf(undefined, universityWeek) as 1 | 2 | 3 | 4;
        return {
          ...s,
          schoolState: { ...s.schoolState, universityWeek },
          protagonist: { ...s.protagonist, grade },
        };
      });
    },

    /**
     * 이벤트 선택지 효과 적용 (메시지가 없는 경로 — 병역 이벤트 등).
     *
     * ⚠ **계산을 여기 다시 적지 않는다.** 정본은 `applyEffectToProtagonist`다.
     * 예전엔 이 함수가 자기 계산을 갖고 있었고 명성·인기·성실·태그 넷을
     * 빠뜨렸다 — 데이터가 우연히 그 넷을 안 써서 안 터졌을 뿐이다.
     *
     * ⚠ 관계도·사치품은 여기서 못 한다(비동기). 그게 필요한 경로는
     * `usecases/decisions.ts`의 `applySideEffects`를 이어서 불러야 한다.
     */
    /**
     * @param grade 이 효과가 실려 온 이벤트 등급. **구종 보상의 문지기다**
     *   (2026-09-09 · R1) — 없으면 구종 보상은 안 먹는다.
     */
    applyEventEffect(
      effect: import("../types/main").DecisionEffect,
      grade?: import("../utils/tierRules").EventGrade,
    ) {
      update((s) => {
        const gated = gatePitchRewards(effect, grade);
        const updated = applyEffectToProtagonist(s.protagonist, gated);
        return {
          ...s, protagonist: updated, player: toPlayerCompat(updated),
          schoolState: applyStudyQuality(s.schoolState, gated.studyQualityDelta),
        };
      });
    },

    /**
     * 1군 ↔ 2군 승강으로 주인공의 소속만 옮긴다.
     *
     * `applyDraftDecision`과 달리 **커리어 단계는 안 건드린다** — 2군 강등은
     * 진학·입단 같은 학적 전이가 아니라 같은 구단 안의 이동이다.
     * 2군 일정·순위표는 이미 있으므로 `leagueId`만 맞으면 그대로 뛴다.
     */
    // ── 병역 ───────────────────────────────────────────────────
    //
    // 실제 처리는 `usecases/gameStore/military.ts` 다 — store 는 넘기기만 한다.
    // 이름·인자·돌려주는 값은 그대로다(호출부 불변).
    /**
     * 국제대회 성적으로 병역 면제 (Phase 7-3).
     *
     * **면제는 되돌리지 않는다** — 이미 군필·현역인 사람은 건드리지 않고,
     * 미필만 면제로 바꾼다. 주인공도 같은 경로를 탄다.
     */
    grantMilitaryExemption(npcIds: string[], seasonYear: number, tournamentName: string) {
      military.grantMilitaryExemption({ update }, npcIds, seasonYear, tournamentName);
    },
    addMilitaryDeferPenalty(points: number) {
      military.addMilitaryDeferPenalty({ update }, points);
    },
    setSportsUnitApplied(flag: boolean) {
      military.setSportsUnitApplied({ update }, flag);
    },
    markSportsUnitPrompted(seasonYear: number) {
      military.markSportsUnitPrompted({ update }, seasonYear);
    },
    markMilitaryAsked(seasonYear: number) {
      military.markMilitaryAsked({ update }, seasonYear);
    },
    enlistMilitary(
      unit: "sports" | "general",
      enlistWeek = MILITARY_RESULT_WEEK,
      sportsUnitSelected = false,
      enlistYear?: number,
    ) {
      military.enlistMilitary({ update }, unit, enlistWeek, sportsUnitSelected, enlistYear);
    },
    applyMilitaryDischarge(args: {
      statDelta: number;
      velocityDelta: number;
      recoveryWeeks: number;
      record: import("../types/militaryLife").MilitaryRecord;
    }) {
      military.applyMilitaryDischarge({ update }, args);
    },
    setMilitaryLife(next: import("../types/militaryLife").MilitaryLifeState | null) {
      military.setMilitaryLife({ update }, next);
    },
    advanceMilitaryWeek() {
      military.advanceMilitaryWeek({ update });
    },
    completeMilitaryService(at?: { season: number; week: number }) {
      military.completeMilitaryService({ update }, at);
    },
    advanceMilitaryRecoveryWeek() {
      military.advanceMilitaryRecoveryWeek({ update });
    },

    setProtagonistTeam(teamId: string, leagueId: string) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, teamId, leagueId },
      }));
    },

    applyDraftDecision(payload: {
      stage: import("../types/save").CareerStage;
      leagueId?: string;
      teamId?: string;
      teamName?: string;
      signingBonus?: number;
      resetDraftTrigger?: boolean;
      /**
       * 🔴 **대학 진학 주차** — `stage === "university"`면 필수다.
       *
       * `universityWeek` 축을 시즌 경계에 맞추는 데 쓴다. 아래 주석 참고.
       * 안 넘기면 **던진다** — 조용히 0이 되면 학년이 20주 어긋난 채로 돌고,
       * 그건 오류도 로그도 없이 이벤트 넷을 죽인다.
       */
      enrollWeekInYear?: number;
    }) {
      update((s) => {
        // 학적은 되돌릴 수 없다 — 고교 재입학·대학 두 번 입학·프로에서 학교 복귀 거부.
        // 여기가 없어서 `isUnivResultWeek`가 대학 재학생에도 발동하며 대학 재입학이
        // 실제로 성립했다 (careerTransition.ts 주석 참고).
        const reason = transitionReason(s.protagonist.careerStage, payload.stage);
        if (reason) {
          console.error(`[applyDraftDecision] 전이 거부: ${reason}`);
          return s;   // 상태를 건드리지 않는다
        }
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          careerStage: payload.stage,
          leagueId: payload.leagueId ?? s.protagonist.leagueId,
          teamId: payload.teamId ?? s.protagonist.teamId,
          money: Math.max(0, s.protagonist.money + (payload.signingBonus ?? 0)),
          // ⚠ **대학도 학년이 있다** (1~4). 예전엔 고교만 남기고 나머지를 전부
          // 지워서, 대학에 진학하면 `grade`가 undefined가 됐다. 그러면
          // `processSeasonEnd`의 `isStudentProto`(grade != null 검사)가 거짓이라
          // `advanceProtagonistGrade`가 **한 번도 안 불린다** — 학년이 안 오르고
          // 졸업이 영영 안 온다. 실측: 2032 진학 → 2038까지 7년째 대학생(29세),
          // 매년 W42 진로 허브만 반복.
          // 프로·독립·군은 학년이 없는 게 맞다.
          grade:
            payload.stage === "highschool" ? s.protagonist.grade :
            payload.stage === "university" ? 1 :
            undefined,
        };
        // 🔴 **대학 학년 계수기의 원점을 시즌 경계로 맞춘다** (2026-09-01).
        //
        // 진학은 `CAREER_RESULT_WEEK`(W32)에 확정되는데 예전엔 `universityWeek`
        // 을 안 세워서 초기값 0에서 시작했다. 그러면 계수기가 **진학한 주부터**
        // 세므로 학년이 매 시즌 W33에 오른다 — 시즌과 20주 어긋난다.
        //
        // 그래서 진학 시 `weekInYear - 52`로 세운다. 진학 첫 해의 남은 주는
        // 음수(입학 전)이고, **다음 시즌 W1에 정확히 1**이 된다:
        //
        // ```
        //          예전                     지금
        //   시즌A W33   uw   1            uw -19       합격했으나 학기 전
        //   시즌B W1    uw  21   1학년    uw   1       1학년
        //   시즌B W50   uw  70   2학년★  uw  50       1학년
        //   시즌C W1    uw  73   2학년    uw  53       2학년
        // ```
        //
        // ★ 여기가 결함이었다. `universityGradeOf`가 `(uw-1)/52+1`이라
        // uw 53부터 2학년인데, 시즌B는 아직 1학년 시즌이다.
        //
        // 이벤트가 `week_eq` + `school.universityWeek` 창을 **같이** 걸어서
        // 어긋나면 창 밖으로 밀린다. 실측으로 넷이 죽어 있었다 —
        // `UNIV_Y1_W50_YEAR_WRAP`(uw 70, 창 ≤52) · `UNIV_Y2_W50_YEAR_WRAP` ·
        // `UNIV_Y3_W34_DRAFT_TRACK`(uw 158, 창 ≤156) · `UNIV_Y3_W50_YEAR_WRAP`.
        //
        // ⚠ **던진다.** `serde(default)`류의 조용한 0은 여기서 제일 나쁘다 —
        // 학년이 어긋나도 게임은 돌고 이벤트만 사라진다(CLAUDE.md가 적은
        // "데이터가 코드와 어긋나도 아무도 안 죽는다"가 이 형태다).
        if (payload.stage === "university" && payload.enrollWeekInYear == null) {
          throw new Error(
            "[applyDraftDecision] 대학 진학인데 enrollWeekInYear가 없다 — "
            + "학년 계수기의 원점을 못 잡는다",
          );
        }
        const schoolState: SchoolState = {
          ...s.schoolState,
          attendsUniversity: payload.stage === "university",
          ...(payload.stage === "university"
            ? { universityWeek: universityWeekOnEnroll(payload.enrollWeekInYear as number) }
            : {}),
          careerApplicationsSubmitted: false,
          careerApplications: null,
          careerResults: null,
          careerChoicePopupOpened: false,
          careerChoiceMode: "none",
          careerChoiceConfirmed: false,
          careerDraftPickLog: [],
          careerFinalChoice: "none",
          draftTriggered: payload.resetDraftTrigger ? false : s.schoolState.draftTriggered,
        };
        const logs = payload.teamName
          ? [`드래프트: ${payload.teamName} 지명`, ...s.logs].slice(0, 30)
          : s.logs;
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          schoolState,
          logs,
        };
      });
    },


    // ── 계약·FA·트레이드 ───────────────────────────────────────
    //
    // 실제 처리는 `usecases/gameStore/contracts.ts` 다 — store 는 넘기기만 한다.
    // 이름·인자·돌려주는 값은 그대로다(호출부 불변).
    //
    // 오프시즌 계약 서명 — 즉시 시즌 초기화 없이 pendingNextContract에 보관.
    // W52 SeasonEndModal에서 applyPendingNextContract 호출 시 실제 적용
    signContract(contract: ProContract, stamp: ContractStamp = {}) {
      contracts.signContract({ update }, contract, stamp);
    },
    setPendingNextContract(contract: ProContract, stamp: ContractStamp = {}) {
      contracts.setPendingNextContract({ update }, contract, stamp);
    },
    // W52 SeasonEndModal에서 호출 — pendingNextContract를 contract로 확정
    applyPendingNextContract() {
      contracts.applyPendingNextContract({ update });
    },
    applyTradeTransfer(toTeamId: string, toLeagueId?: string) {
      contracts.applyTradeTransfer({ update }, toTeamId, toLeagueId);
    },
    markIncentivesSettled(seasonYear: number, keys: readonly string[]) {
      contracts.markIncentivesSettled({ update }, seasonYear, keys);
    },
    applySeasonContractProgress() {
      contracts.applySeasonContractProgress({ update });
    },
    incrementFaNegotiationRound() {
      contracts.incrementFaNegotiationRound({ update });
    },
    incrementFaUnsignedWeek() {
      contracts.incrementFaUnsignedWeek({ update });
    },
    resetFaProgress() {
      contracts.resetFaProgress({ update });
    },
    advanceTradeAdaptationWeek() {
      contracts.advanceTradeAdaptationWeek({ update });
    },
    applyOptionResult(payload: {
      exercised: boolean;
      nextSalary: number;
      optionType: "team" | "player";
    }) {
      contracts.applyOptionResult({ update }, payload);
    },



    /** 은퇴 확정 — 커리어가 여기서 끝난다 */
    retire(rec: { year: number; week: number; reason: import("../types/save").RetirementReason }) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, retirement: rec },
      }));
    },

    /** 체육부대 후보 공개를 이 시즌에 물어봤다고 표시 — 같은 주 무한 반복 방지 */

    /** 입대 여부를 이 시즌에 물어봤다고 표시 — 같은 주 무한 반복 방지 */


    /**
     * 전역 환산 (PLAN_MILITARY_LIFE §30) — 복무 중 안 건드린 능력치를 야구 감각으로 한 번에 환산하고
     * 군 경력 한 장을 남긴다. 값은 usecases/militaryDecision 이 rules.json 에서 계산해 넘긴다 — 여기선 적기만.
     * ⚠ `completeMilitaryService` 뒤에 불러야 회복 주(고정 6)를 덮는다.
     */
    /** 병영생활 상태 얇은 패처 — 계산은 usecases/militaryLife.ts · utils/militaryLifeRules.ts */

    /**
     * @param at 실제로 전역한 시점. **상무·현역 둘 다 여기를 지난다** —
     *   전역 환산(`applyMilitaryDischarge`)은 현역만 타므로 거기 두면 상무가 빠진다.
     *   안 넘기면 안 적는다(옛 호출부·검사 호환).
     */

    /**
     * 인센티브 정산 자물쇠 (PLAN_CONTRACT_TERMS §7 ⑤).
     *
     * 정산한 해를 `paidSeasons` 에 찍는다 — **다년 계약에서 두 번 주는 걸
     * 막는 게 이 필드의 목적**이다(`save.ts`). 미달한 줄도 찍는다:
     * 안 찍으면 같은 해에 다시 불릴 때 미달 소식이 한 통 더 생긴다.
     *
     * ⚠ 계산은 `usecases/incentiveSettlement.ts` 가 한다 — 여기는 패치만이다.
     */







    /**
     * **일어난 일**을 적는다 (2026-09-08 · L1 · `PLAN_MESSAGE_LANES`).
     *
     * 🔴 부르는 자리는 **세계가 그 일을 확정한 자리**여야 한다 — 소식을 내는
     *   자리가 아니다. 소식은 이 기록을 **읽고** 뜬다(`outcome_within`).
     *   순서가 뒤집히면 「소식이 떠서 일어난 일이 된다」가 되고, 그게 바로
     *   고치려던 것이다.
     *
     * ⚠ **같은 주 같은 종류는 한 번만 적는다.** 대회 라운드 루프처럼 한 주에
     *   여러 번 지나는 자리가 있어서, 안 막으면 「탈락」이 그 주에 다섯 번
     *   쌓인다. 창을 세는 조건에는 지장이 없지만 기록이 거짓이 된다.
     */
    recordOutcome(o: import("../types/save").ProtagonistOutcome) {
      update((s) => {
        const prev = s.protagonist.recentOutcomes ?? [];
        if (prev.some((x) => x.kind === o.kind && x.year === o.year && x.week === o.week)) return s;
        return {
          ...s,
          protagonist: {
            ...s.protagonist,
            recentOutcomes: [...prev, o].slice(-OUTCOME_KEEP),
          },
        };
      });
    },

    addCareerEvent(event: NpcCareerEvent) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          careerEvents: [...(s.protagonist.careerEvents ?? []), event],
        },
      }));
    },


    // 구종 습득 시작
    startPitchTraining(pitchId: string) {
      update((s) => {
        const currentPitches = s.protagonist.pitches ?? [];
        const isNew = !currentPitches.find((p) => p.id === pitchId);
        if (isNew && currentPitches.length >= 5) return s;
        return {
          ...s,
          protagonist: { ...s.protagonist, trainingPitchState: { id: pitchId, progress: 5 } },
        };
      });
    },

    // 구종 습득 완료 (progress >= 100)
    completePitchLearning(pitchId: string) {
      update((s) => {
        const pitches = s.protagonist.pitches ?? [{ id: "PITCH_FASTBALL", grade: 3 as const }];
        const existing = pitches.find((e) => e.id === pitchId);
        if (existing) {
          // 이미 보유 중이면 grade +1 (최대 5)
          const updated = pitches.map((e) =>
            e.id === pitchId ? { ...e, grade: Math.min(5, e.grade + 1) as PitchEntry["grade"] } : e
          );
          const p: ProtagonistSave = { ...s.protagonist, pitches: updated, trainingPitchState: undefined };
          return { ...s, protagonist: p };
        }
        const p: ProtagonistSave = {
          ...s.protagonist,
          pitches: [...pitches, { id: pitchId, grade: 1 }],
          trainingPitchState: undefined,
        };
        return { ...s, protagonist: p };
      });
    },

    // 구종 훈련 진행률 갱신
    advancePitchProgress(delta: number) {
      update((s) => {
        const ts = s.protagonist.trainingPitchState;
        if (!ts) return s;
        const progress = Math.min(100, ts.progress + delta);
        const p: ProtagonistSave = {
          ...s.protagonist,
          trainingPitchState: { ...ts, progress },
        };
        return { ...s, protagonist: p };
      });
    },

    // 시즌 종료 후 주인공 상태 갱신 (나이+1, 프로연차+1, 오프시즌 회복)
    // 학년 진급은 processSeasonEnd에서 먼저 처리되므로 여기서는 age만 증가
    /**
     * ⚠ `playedLeagueId`는 **끝나는 그 시즌을 어디서 보냈는가**다.
     *
     * 🔴 예전엔 `careerStage`만 봤다. 그런데 드래프트 결정이 **먼저**
     *    단계를 pro로 바꾸므로, 고교 시즌을 끝내는 순간 이미 프로로 읽혀
     *    **프로에서 한 경기도 안 뛰었는데 연차가 1**이 됐다 — 화면에
     *    "프로 2년차"로 뜼는 A7이 이것이다(씨앗 31337 재현).
     *    라벨 함수는 멀지았다 — `myStatus.test.ts`가 그걸 보고 있어
     *    검사는 통과했고 **데이터가 틀렸다.**
     *
     * ⚠ 안 넘기면 예전대로 `careerStage`만 본다 — 구 호출부 호환.
     */

    /**
     * 등판 하나가 남기는 누적 카운터 (2026-09-08 · §12 `count`).
     *
     * 🔴 **공식 등판에서만 부른다.** 연습경기 완봉이 「무명의 완봉」을 열면
     *   이야기가 안 산다 — `lastGameOf` 도 같은 선으로 연습경기를 뺀다.
     *
     * ⚠ 포수는 **팀의 주전 포수**로 본다. 경기 줄(`BatterGameLine`)에 포지션이
     *   없어서 라인업에서 누가 앉았는지는 못 읽는다 — 「같은 포수와 N경기」가
     *   묻는 것은 배터리의 지속이고, 주전이 바뀌면 그게 끊긴 것이다.
     */
    recordGameCounters(p: {
      completeGame: boolean; shutout: boolean; catcherId: string | null;
      /** 선발 등판이었나 — 선발 보장(§5)을 여기서 한 경기 쓴다 */
      started?: boolean;
    }) {
      update((s) => {
        const pr = s.protagonist;
        const c = { ...(pr.counters ?? {}) };
        if (p.completeGame) c.completeGames = (c.completeGames ?? 0) + 1;
        if (p.shutout)      c.shutouts      = (c.shutouts ?? 0) + 1;
        if (p.catcherId) {
          c.sameCatcherGames = pr.lastCatcherId === p.catcherId
            ? (c.sameCatcherGames ?? 0) + 1 : 1;
        }
        // 🔴 **쓰는 자리가 없으면 보장이 영구가 된다.** 선발로 나간 경기마다
        //   한 칸씩 쓴다 — 「N경기 보장」의 N 은 등판 수지 주 수가 아니다
        const guard = pr.startGuaranteeGames ?? 0;
        const nextGuard = p.started && guard > 0 ? guard - 1 : guard;
        const protagonist: ProtagonistSave = {
          ...pr, counters: c,
          ...(nextGuard !== guard ? { startGuaranteeGames: nextGuard } : {}),
          ...(p.catcherId ? { lastCatcherId: p.catcherId } : {}),
        };
        return { ...s, protagonist, player: toPlayerCompat(protagonist) };
      });
    },

    // L6: 전체 리그 NPC 오프시즌 처리 (에이징·감퇴·UNIV졸업·군입대·전역·FA·은퇴·로스터 정리)
    // 실제 처리는 `usecases/gameStore/seasonEndLeagues.ts` 다 — store 는 상태를 적는 자리다.
    //   이름·인자·돌려주는 값은 그대로다(호출부 둘 불변).
    async processAllLeaguesSeasonEnd(seasonYear: number) {
      return processAllLeaguesSeasonEndChunk(
        { subscribe, update, seasonData: _getSeasonData },
        seasonYear,
      );
    },

    // 시즌 종료 후 주인공 에이징 감퇴 적용 (advanceSeasonYear 이전에 호출 — seasonHealth 기반)

    /**
     * 이벤트 등급의 **커리어 누계** (2026-09-08 · §9 · 업적 셋의 입력).
     *
     * ⚠ `seasonStore.recordTierState` 와 **같은 자리에서 한 번만** 부른다.
     *   둘로 나뉘면 시즌 통(상한)과 커리어 통(업적)이 어긋난다.
     * ⚠ 레어는 **이번 시즌 수를 받아 최고 기록만 갱신**한다 — 여기서 다시 세면
     *   시즌 경계를 두 곳이 판정하게 된다(정본은 `seasonStore.tierCounts`).
     */
    recordEventGrade(p: { grade: string | null; rareThisSeason: number }) {
      if (!p.grade && p.rareThisSeason === 0) return;
      update((st) => {
        const m = st.achievementMetrics;
        const next: AchievementMetrics = {
          ...m,
          eventUniqueTotal: (m.eventUniqueTotal ?? 0) + (p.grade === "unique" ? 1 : 0),
          eventHiddenTotal: (m.eventHiddenTotal ?? 0) + (p.grade === "hidden" ? 1 : 0),
          eventRareSeasonMax: Math.max(m.eventRareSeasonMax ?? 0, p.rareThisSeason),
        };
        return { ...st, achievementMetrics: next };
      });
    },

    recordCareerTriggeredEvents(events: Record<string, number>) {
      if (Object.keys(events).length === 0) return;
      update((st) => {
        const updated: ProtagonistSave = {
          ...st.protagonist,
          careerTriggeredEvents: { ...(st.protagonist.careerTriggeredEvents ?? {}), ...events },
        };
        return { ...st, protagonist: updated, player: toPlayerCompat(updated) };
      });
    },

    // 새 게임 시작: 캐릭터 생성 완료 시 호출
    initNew(protagonist: ProtagonistSave, slotId?: string) {
      const cur = get({ subscribe });
      set({
        currentSlotId: slotId ?? cur.currentSlotId,
        // 🔴 **새 게임도 불러오기와 같은 정규화를 지난다** (2026-09-06).
        //
        //   `fromSaveGame`만 `migrateProtagonist`를 태우고 여기는 화면이 만든
        //   객체를 그대로 넣었다. 그래서 새 게임의 첫 저장과 그걸 불러온 뒤의
        //   저장이 **모양이 달랐다** — `militaryLife`·`militaryRecord`가
        //   새 게임엔 키 자체가 없고(undefined → JSON 에서 사라진다) 불러오면
        //   `null`로 들어왔다(`check:roundtrip` 실측 2칸).
        //
        //   "저장이 고정점이다"가 깨지면 왕복 검사가 그 두 칸을 영영 「정규화」로
        //   눈감아야 하고, 그 눈가리개 뒤로 진짜 유실이 숨는다.
        protagonist: migrateProtagonist(protagonist),
        mailbox: [],
        trainingPlan: DEFAULT_TRAINING_PLAN,
        trainingPresets: DEFAULT_TRAINING_PRESETS,
        schoolState: DEFAULT_SCHOOL,
        achievements: DEFAULT_ACHIEVEMENTS,
        achievementMetrics: DEFAULT_ACHIEVEMENT_METRICS,
        npcs: [],
        pendingDraft: [],
        pendingAchievements: [],
        seasonEndSummary: null,
        lastTop10Pitcher: null,
        lastTop10Batter:  null,
        // 🔴 **빈 객체로 시작하면 구단 개성이 없는 세계가 된다.**
        //   `App.svelte`가 부른 `initProTeamProfiles`를 여기서 덮고 있었다.
        proTeamProfiles:  profilesFromMaster(),
        clubBudgets: {},
    demotionWeek: {},
    hallOfFame: {},
    retiredNumbers: {},
        teamStreaks:      {},
        teamTargets:      {},
        dayLabel: computeWeekLabel(1, BASE_SEASON_YEAR),
        logs: [],
        upcoming: [],
        player: toPlayerCompat(protagonist),
        school: toSchoolCompat(protagonist.careerStage, DEFAULT_SCHOOL),
      });
    },

    // 새 게임 시작 시 고교 NPC 초기화 (마스터 entities + 시나리오 파일 기반)
    initNpcsForNewGame(
      entities: import("../stores/master").EntityRow[],
      scenario: SchoolScenario,
      seasonYear: number,
    ) {
      const r = scenario.protagonistRoles;
      // 시나리오가 지목한 인물은 Named — 주간 개별 시뮬 대상이 된다.
      // 구 코드는 여기서 "teammate"/"rival" 역할까지 붙였는데, 그 값을 읽는 곳은
      // 감정 시스템뿐이었고 6C에서 폐기했다. 지금은 동료/라이벌을 실측으로 가른다
      // (동료 = 같은 팀 · 라이벌 = 실제로 맞붙어 던진 투수).
      const namedIds = new Set<string>([
        ...r.seniorMentors,
        r.seniorCaptain,
        ...r.classmateRivals,
        r.batteryPartner,
        r.promisingJunior,
        ...scenario.rivalAces,
        ...scenario.initialZone0Npcs,
      ].filter(Boolean));

      update((s) => ({
        ...s,
        npcs: initHighSchoolNpcs(entities, seasonYear, namedIds),
      }));
    },

    // 시즌 종료 처리: ① 학년 진급 → ② 나이 일괄 +1
    // 신입생은 다음 시즌 W1에 `generateFreshmenV3`(Rust)가 만든다
    // (예전엔 master.db `entry_year` 기반이었다 — 09-04에 접었다)

    /**
     * 그 해 `careerHistory` 항목에 수상 내역을 얹는다.
     *
     * ⚠ **연도 항목이 이미 있어야 한다.** `applySeasonHistory` ·
     * `processAllLeaguesSeasonEnd`가 만든 뒤에 불러야 붙일 자리가 있다.
     * 항목이 없으면 조용히 버리지 않고 새로 만든다 — 수상은 남아야 한다.
     *
     * ⚠ 주인공은 여기서 처리하지 않는다 — `achievements`는 NPC 필드이고
     * 주인공 기록은 `careerRecord` 계열이다. 섞으면 둘 다 어긋난다.
     */
    /**
     * 주인공의 그 해 수상을 `careerRecords[].awards`에 얹는다.
     *
     * ⚠ **`addSeasonHighlights`는 `s.npcs`만 훑는다.** 주인공은 npc 목록에 없어서
     * 부문 1위를 해도 기록이 그대로 버려졌다 — 수상 후보에서 빠져 있던 것과
     * 짝을 이루는 뒷단 결함이고, 둘 중 하나만 고치면 여전히 0건이다.
     *
     * 읽는 쪽이 이미 있다: `universityUtils`의 진학 점수 `awards.length * 15`,
     * 경력 화면, 드래프트 산식. 전부 항상 0이었다.
     *
     * ⚠ 그 해 항목이 **먼저 있어야 한다** — `appendCareerRecord`가 끝난 뒤에
     * 부른다(`seasonRollover` 참고). 없으면 붙일 곳이 없어 조용히 넘어간다.
     */


    // L4: 시즌 종료 시 NPC careerHistory 기록


    // 드래프트 시뮬레이션 실행 → NPC 반영 + 주인공 결과 반환
    // ── `processDraft` 제거됨 (2026-07-31) ────────────────────────
    //
    // NPC 드래프트를 돌리고 `determineProtagonistDraft`로 주인공 지명까지
    // 정하던 함수였는데, `processNpcDraft`로 대체되면서 **호출부가 사라졌다.**
    // 그런데 코드는 남아 있어서 "주인공 지명은 여기서 정해진다"처럼 보였고,
    // 실제로는 아무도 안 불러서 **주인공이 영영 지명될 수 없었다.**
    // (`careerResults.draftDrafted`를 true로 만드는 곳이 어디에도 없었다)
    //
    // 지금 주인공 지명은 `advanceWeek`의 W47 진로 결과 계산이 정한다 —
    // 거기서 `determineProtagonistDraft`를 부른다. 정본은 한 곳이다.

    /**
     * NPC 드래프트 — **한 시즌에 한 번만 돈다.**
     *
     * 예전엔 W47 관전 보드(`runDraftBoardBackground`)와 시즌 종료가 각각
     * 드래프트를 돌리고 **둘 다 거래기록을 썼다.** 후보 풀도 서로 달라서
     * 화면에서 본 지명과 실제 소속이 어긋났다.
     *
     * @returns 이번 호출에서 실제로 드래프트를 돌렸으면 결과, 이미 했으면 null
     */
    // 실제 처리는 `usecases/gameStore/npcDraft.ts` 다 — store 는 상태를 적는 자리다.
    //   이름·인자·돌려주는 값은 그대로다(호출부 셋 불변).
    async processNpcDraft(
      year: number,
      universityTeamIds: string[],
      independentTeamIds: string[],
    ): Promise<{ picks: DraftPick[] } | null> {
      return processNpcDraftChunk(
        { subscribe, update, store: this, seasonData: _getSeasonData },
        year,
        universityTeamIds,
        independentTeamIds,
      );
    },

    // ── 시즌 경계 ──────────────────────────────────────────────
    //
    // 실제 처리는 `usecases/gameStore/seasonBoundary.ts` 다 — store 는 넘기기만
    // 한다. 이름·인자·돌려주는 값은 그대로다(호출부 불변).
    saveTop10Snapshot(snapshot: import("../types/save").Top10Snapshot) {
      seasonBoundary.saveTop10Snapshot({ update }, snapshot);
    },
    saveSeasonStartSnapshot() {
      seasonBoundary.saveSeasonStartSnapshot({ update });
    },
    advanceSeasonYear(_seasonYear?: number, playedLeagueId?: string) {
      seasonBoundary.advanceSeasonYear({ update }, _seasonYear, playedLeagueId);
    },
    async applyAgingDecay() {
      await seasonBoundary.applyAgingDecay({ subscribe, update });
    },
    async processSeasonEnd(seasonYear: number) {
      await seasonBoundary.processSeasonEnd({ subscribe, update }, seasonYear);
    },
    addProtagonistAwards(seasonYear: number, awards: CareerAward[]) {
      seasonBoundary.addProtagonistAwards({ update }, seasonYear, awards);
    },
    addSeasonHighlights(seasonYear: number, byPlayer: Map<string, string[]>) {
      seasonBoundary.addSeasonHighlights({ update }, seasonYear, byPlayer);
    },
    applySeasonHistory(
      seasonStats: Record<string, PlayerSeasonStats>,
      leagueStats: Record<string, Record<string, PlayerSeasonStats>>,
      seasonYear: number,
    ) {
      seasonBoundary.applySeasonHistory({ update }, seasonStats, leagueStats, seasonYear);
    },
    appendCareerRecord(record: CareerSeasonRecord, seasonStats?: PlayerSeasonStats) {
      seasonBoundary.appendCareerRecord({ update }, record, seasonStats);
    },

    // 하위 호환: App.svelte의 hydrate 호출 유지
    hydrate(saved: Partial<GameStoreState>) {
      update((s) => ({ ...s, ...saved }));
    },
  };
}

export const gameStore = createGameStore();

export const unreadCount = derived(
  gameStore,
  ($s) => $s.mailbox.filter((m) => m.readAt === null).length,
);

// ⚠ `showAcademicsTab`은 U4에서 지웠다. 같은 판정이 `utils/navVisibility`의
// 노출 표에 있고, 두 곳에 두면 탭이 늘 때 한쪽만 고치게 된다.
