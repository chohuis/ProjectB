import { ipLabel, rateLabel, eraLabel } from "../utils/baseballFormat";
import { MILITARY_RESULT_WEEK } from "../utils/seasonWeeks";
import { weekLabelOf } from "../utils/seasonCalendar";
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
  NpcCareerEntry,
  NpcCareerEvent,
  NpcSaveState,
  PitchEntry,
  PitchingStatKey,
  PlayerSeasonStats,
  ProtagonistSave,
  SaveGame,
  SchoolState,
  TrainingPlanState,
  TrainingPreset,
} from "../types/save";
import { makeSaveGame, migrateSaveGame } from "../types/save";
import {
  advanceAllGrades,
  advanceAllAges,
  advanceProtagonistGrade,
  initHighSchoolNpcs,
  entityToProNpcState,
} from "../utils/gradeAdvance";
import {
  applyDraftToNpcs,
  runDraftSimulation,
  selectDraftCandidates,
  DRAFT_ROUNDS,
  DRAFT_ROUTE_LABELS,
  KBL_TEAM_IDS,
  draftDestinationTeams,
  draftOrderOf,
  placementRulesFrom,
  teamNeedsOf,
} from "../utils/draftSystem";
import { loadRosterRules, buildSalaryIndex } from "../repo/newGameV3";
import type {
  DraftPick,
  DraftSimResult,
  HighSchoolMaster,
  NamedNpcMeta,
  SchoolScenario,
} from "../types/save";
import type { ProContract } from "../types/save";
import { shiftContract, type ContractStamp } from "../utils/contractHistory";
import { transitionReason, universityGradeOf, universityWeekOnEnroll } from "../utils/careerTransition";
import { careerSummaryOf } from "../utils/careerSummary";
import { pitchingOvrOf, battingOvrOf } from "../utils/ovr";
import { runOffseasonProcessing, rosterLimitsFrom, foreignParamsFrom } from "../utils/npcEngine";
import { getFaThreshold } from "../utils/faEngine";
// 인센티브를 구분하는 열쇠 — **식이 둘이 되면 자물쇠가 안 맞는다**
import { incentiveKey } from "../utils/contractTerms";
import { masterStore } from "./master";

import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "./autoAdvance";
import { npcLiveStatsStore, liveOvrOf } from "./npcLiveStats";
import { slotRepo } from "../repo/slotRepo";
import { dehydrateToRepo } from "../repo/npcAdapter";
import { collectScheduleDelta, rollbackScheduleDelta } from "../repo/scheduleDelta";
import { SANGMU_LEAGUE_ID, SANGMU_TEAM_ID } from "../utils/ids";
import { sportsUnitLimits, protagonistTookSportsSlot, sportsVacatingPositions } from "../utils/militaryRules";
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
  militaryHiatusUniversityWeek: null,
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
 * 마스터에 적힌 구단 성향을 꺼낸다 — 새 게임의 시작값이다.
 *
 * ⚠ 마스터가 아직 안 실렸으면 빈 객체다 — 그때는 `initProTeamProfiles`가
 *   뒤달아 채운다. 둘 다 `!map[id]` 규칙이라 순서가 바뀜도 안전하다.
 */
/**
 * 예산 지수 → 구단 성향. **순수 함수다** — 검사가 직접 부른다.
 *
 * 지수 1.0(리그 평균)이면 전 항목 50으로 기본값과 같다. 거기서 벌린다.
 * 폭은 ±25 안퍼이다 — 더 벌리면 예산이 성향을 지배해서 성적으로
 * 갱신하는 `updateProTeamProfiles`가 덮이는 데 여러 시즌이 걸린다.
 */
export function deriveProfileFromBudgetIndex(
  idx: number,
): import("./master").ProTeamProfile {
  const at = (span: number) => Math.round(Math.max(5, Math.min(95, 50 + (idx - 1) * span)));
  return {
        // 돈 쓰는 성향은 예산을 따라간다
        ownerSpendingWillingness: at(50),
        prestige:                 at(40),
        marketAppeal:             at(40),
        scoutingQuality:          at(30),
        medicalQuality:           at(30),
        // 가난한 팀이 **육성·2군에 기란다** — 반대로 밀린다
        developmentFocus:         at(-40),
        farmInvestment:           at(-30),
        // 부자 구단은 지금 이기라는 압박이 크고 인내가 짧다
        winNowPressure:           at(30),
        ownerPatience:            at(-30),
        // 나머지는 예산과 상관이 없다 — 기본값을 둔다
        stability: 50, discipline: 50, clubhouseCulture: 50,
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

  // ① 데이터에 적힌 성향이 있으면 그걸 쓴다 (현재 ABL 32팀)
  for (const t of teams) if (t.proTeamProfile) out[t.id] = { ...t.proTeamProfile };

  // ② 없는 팀은 **예산 지수에서 유도한다** (사용자 확정 2026-08-23).
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
    if (out[t.id]) continue;
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
      out[t.id] = deriveProfileFromBudgetIndex((t.history?.budget ?? 0) / avg);
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

function toPlayerCompat(p: ProtagonistSave): GameStoreState["player"] {
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
function toSchoolCompat(
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
    militaryHiatusUniversityWeek: p.militaryHiatusUniversityWeek ?? def.militaryHiatusUniversityWeek,
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
function applyTags(cur: string[], add?: string[], remove?: string[]): string[] {
  if (!add && !remove) return cur;
  const out = new Set(add ? [...cur, ...add] : cur);
  for (const r of remove ?? []) out.delete(r);
  return [...out];
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
    proTeamProfiles:  (saved.proTeamProfiles ?? {}) as GameStoreState["proTeamProfiles"],
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

// ── 메일함 정리: 미결 선택지 메시지는 항상 보존 ────
// 회귀·시나리오가 "메시지가 안 온 건가, 밀려난 건가"를 구분하려면 이 값을 알아야 한다
//
// **50 → 200 (2026-08-07, 사용자 확정).** 근거는 실측이다 —
// `npm run measure:mailbox` 2시즌에서 **638건이 생산되고 588건이 밀려났으며
// 그중 447건이 한 번도 안 읽힌 것**이었다. 상한 50은 주당 약 6.1건 생산 대비
// **8주치**밖에 안 남아, 소식이 W1부터 상한에 붙은 채로 계속 사라졌다.
// 200이면 약 33주 — 한 시즌(52주)의 대부분을 담는다.
//
// ⚠ **순서 수정만으로는 안 풀렸다.** `trimMailbox`가 `readAt`을 보게 고친 뒤에도
// 유실이 453 → 447로 사실상 그대로였다(두 실행이 다른 세계라 이 차이는 잡음이다).
// 순서는 거꾸로였던 게 맞지만 병목은 생산량 대비 상한이었다.
// 🔴 **200 → 500** (트랙 B 요청 · 2026-08-24). 200은 약 33주라 한 시즌을 못 담았다.
//    500이면 약 83주 — 한 시즌 반이다.
//
//    비용은 B가 IPC 바이트로 쟀다(이 프로젝트 잣대):
//      setProtagonist 주당  266 KB → 304 KB (+38 KB)
//      전체 IPC 비중         0.7% → 0.8%   (전체 +0.35%)
//    ⚠ `measure:perf` 기준이라 **벽시계가 아니다.**
//
//    화면은 B가 미리 준비했다 — 소식함이 60건씩 점진 렌더링이라
//    500통이어도 DOM에는 60건만 올라간다.
//    🔴 **500 → 1500** (사용자 확정 · 2026-08-30). 500도 모자랐다.
//
//    실측(씨앗 111 · 3시즌 · `probe-mailbox.cjs`):
//        2026 종료  340통          여유
//        2027 종료  500통 · 잘림   `msg-tour` 420 (**84%**)
//        2028 종료  500통 · 잘림   `msg-tour` 273
//
//    **대회 소식이 혼자 소식함을 먹는다.** 그건 사용자 확정 동작이고
//    (2026-08-08 "내 팀이 없는 라운드도 32강부터 알린다"), 줄이는 대신
//    자리를 늘리기로 했다 — 대회 흐름을 보는 게 그만한 값이 있다.
//
//    ⚠ 비용은 500 때 잰 값에서 비례로 본다: IPC 주당 +38KB → 약 +114KB,
//      전체 비중 0.8% → 약 1.1%. **다음 `measure:perf` 에서 실측한다.**
//    ⚠ 화면은 60건씩 점진 렌더링이라 통수가 늘어도 DOM 은 그대로다.
export const MAX_MAILBOX = 1500;

/**
 * 밀려나 사라진 소식의 **누계** — 계측 전용이고 화면 로직은 읽지 않는다.
 *
 * ⚠ **이게 없으면 상한 정책을 평가할 수 없다.** 메일함을 들여다봐야 보이는 건
 * *살아남은* 50건뿐이라, "소식이 애초에 안 왔다"와 "왔는데 밀려서 사라졌다"가
 * 똑같이 보인다. 이 프로젝트는 육성선수에서 정확히 그 함정에 빠졌다 — 효과부터
 * 재고 "실제로 몇 개 만들었나"를 안 찍어서 안 도는 건지 모자란 건지 못 갈랐다.
 */
export const mailboxTrimStats = {
  /** 상한에 밀려 사라진 총 건수 */
  dropped: 0,
  /** 그중 **한 번도 안 읽힌** 것. 사용자가 존재 자체를 모르고 잃은 소식이다 */
  droppedUnread: 0,
  /** 분류별 유실 — 한 종류가 다른 종류를 밀어내는지 본다 */
  droppedByCategory: {} as Record<string, number>,
};

export function resetMailboxTrimStats(): void {
  mailboxTrimStats.dropped = 0;
  mailboxTrimStats.droppedUnread = 0;
  mailboxTrimStats.droppedByCategory = {};
}

/**
 * 소식의 **종류 키** — `id`에서 주차·연도·타임스탬프·대문자 ID를 떼면
 * 생성 지점이 남는다 (`msg-standings-LEAGUE_KBL-w12-171…` → `msg-standings`).
 *
 * ⚠ **`subject`로 묶으면 안 된다.** 문장 뱅크가 같은 종류의 제목을 여러 갈래로
 * 만들어서 한 종류가 흩어진다. `category`는 4종뿐이라 43종을 구분 못 한다.
 */
export function messageKindOf(id: string): string {
  return id
    .replace(/-r\d+$/, "")               // 대회 라운드
    .replace(/-[A-Z][A-Z0-9_]*/g, "")    // TOUR_/LEAGUE_/EVT_ 같은 대문자 ID
    .replace(/-?w\d+.*$/, "")            // 주차 이후 전부
    .replace(/-\d{4}.*$/, "")            // 연도 이후 전부
    .replace(/-\d+$/, "")                // 남은 숫자 꼬리
    .replace(/-+$/, "");
}

/**
 * **생산** 시점 집계 — 종류별로 몇 통이 만들어졌나.
 *
 * ⚠ **살아남은 메일함을 세면 단계별 비교를 못 한다.** 상한에 밀려 사라진 뒤에
 * 세는 것이라 ①이미 없어진 종류가 0으로 보이고 ②여러 시즌을 밀면 고교와 프로
 * 소식이 한 메일함에 섞인다. 그래서 들어오는 자리에서 센다.
 *
 * 집계 지점을 `pushMailbox` 하나로 모은 이유도 같다 — `addMessage`·
 * `addMessages`·`applyWeekEndBatch` 세 곳에 각각 넣으면 네 번째 경로가
 * 생길 때 조용히 빠진다.
 */
export const mailboxProduceStats = {
  total: 0,
  byKind: {} as Record<string, number>,
  /**
   * 종류별 **제목 인구조사** (C2 문안 은행). `{ 종류: { 제목: 건수 } }`.
   *
   * 🔴 은행을 배선하고도 **한 문장만 나오는** 결함이 조용하다 — 소식은
   *   오고 개수도 맞고 제목만 늘 같다. 세지 않으면 15년을 돌려도 안 보인다.
   */
  subjectsByKind: {} as Record<string, Record<string, number>>,
  /** 종류별 직전 제목 — 연속 반복을 세는 입력 */
  lastSubject: {} as Record<string, string>,
  /**
   * 종류별 **연속 반복 횟수** — 같은 제목이 바로 다음 통에 또 나온 수.
   *
   * ⚠ 0 이어야 한다. `pickSentence` 가 직전 인덱스를 빼는데도 0 이 아니면
   *   기억(`sentenceMemory`)이 안 돌아온 것이다 — 세이브에 안 남기면
   *   매주 −1 에서 시작해 같은 것이 이어 나온다.
   */
  repeatByKind: {} as Record<string, number>,
};

export function resetMailboxProduceStats(): void {
  mailboxProduceStats.total = 0;
  mailboxProduceStats.byKind = {};
  mailboxProduceStats.subjectsByKind = {};
  mailboxProduceStats.lastSubject = {};
  mailboxProduceStats.repeatByKind = {};
}

/**
 * **id 가 겹쳐 버려진 소식** — `dedupeMailbox` 가 걷어낼 때마다 센다.
 *
 * 🔴 `dedupeMailbox` 는 **막는 자리**다. 걸리는 게 있다면 그건 만드는 쪽의
 *   결함이고, 세지 않으면 **소식 한 통이 조용히 사라진 채로 지나간다.**
 *   이 값이 0 이 아니면 걸리게 하는 것이 `check:msgdupid` 다.
 *
 * ⚠ `check:msgdup` 과 다른 것이다 — 그쪽은 「같은 id 로 **다른 소식**」을,
 *   여기는 「같은 id 가 **두 번**」을 본다.
 */
export const mailboxDupStats = {
  dropped: 0,
  byId: {} as Record<string, number>,
};

export function resetMailboxDupStats(): void {
  mailboxDupStats.dropped = 0;
  mailboxDupStats.byId = {};
}

/**
 * 선택지 효과를 주인공에게 적용한다 — **효과 계산의 정본이다.**
 *
 * ⚠ 예전엔 `resolveDecision`(화면 선택)과 `applyEventEffect`(자동 진행)가
 * 같은 `DecisionEffect`를 받으면서 **각자 계산을 갖고 있었고, 적용하는 필드가
 * 달랐다**:
 *
 *   resolveDecision   컨디션·피로·사기·돈·명성·인기·성실·태그·XP·스탯
 *   applyEventEffect  컨디션·피로·사기·돈·XP·스탯          ← 넷이 빠졌다
 *
 * 당시 데이터가 우연히 그 넷을 안 써서 안 터졌을 뿐이다. 병역 이벤트에
 * "성실도 +5"를 하나 넣는 순간 **에러 없이 조용히 무시된다** — 이 프로젝트가
 * 반복해 겪은 "아무 일도 안 일어남" 형태다. 계산을 한 곳에 둬서 한쪽만
 * 고치는 일이 생기지 않게 한다.
 *
 * 관계도·사치품은 여기서 못 한다(slot.db·Rust 왕복이라 비동기다) —
 * `usecases/decisions.ts`의 `applySideEffects`가 맡는다.
 */
export function applyEffectToProtagonist(
  p: ProtagonistSave,
  fx: import("../types/main").DecisionEffect,
): ProtagonistSave {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const clampStat = (v: number) => Math.max(1, Math.min(99, v));

  // ── 보상 대상: 투구 / 타격 (2026-08-24) ──────────────────────
  //
  // 🔴 **예전엔 투구만 건드렸다.** `xp`·`statDelta`가 `pitchingXP`·`pitching`
  // 고정이라 **타자 주인공이 이벤트로 성장할 길이 아예 없었다.**
  //
  // 키 이름으로 가른다:
  //   "command"          → 투구 (예전 그대로. 데이터 296곳이 이 형태다)
  //   "pitching.command" → 투구 (명시)
  //   "batting.contact"  → 타격
  //
  // ⚠ **접두사 없는 키를 타격으로 보내면 안 된다.** `ovr`처럼 양쪽에 다 있는
  //   이름이 있어서, 기존 데이터가 조용히 타격으로 새면 아무도 모른다.
  const pitchingXP = { ...p.pitchingXP };
  const battingXP  = { ...p.battingXP };
  if (fx.xp) {
    for (const [key, amt] of Object.entries(fx.xp)) {
      const [bucket, stat] = key.includes(".") ? key.split(".") : ["pitching", key];
      if (bucket === "batting") {
        (battingXP as Record<string, number>)[stat] = ((battingXP as Record<string, number>)[stat] ?? 0) + amt;
      } else {
        pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
      }
    }
  }

  const pitching = { ...p.pitching };
  // ⚠ **`batting`이 없는 세이브가 있다.** 옛 저장·검사 픽스처가 그렇다 —
  // 스프레드가 undefined를 만나면 빈 객체가 되고, 그 상태로 `stat in target`을
  // 물으면 조용히 아무것도 안 하는 대신 **위쪽에서 터진다.** 빈 객체로 받는다
  const batting  = { ...(p.batting ?? {}) } as typeof p.batting;
  // 🔴 **파생값을 다시 계산한다** (2026-09-06). 예전엔 능력치만 올리고
  //   `ovr`은 그대로 뒀다 — 아래 주석이 "능력치에서 계산된다"고 적어 놓고
  //   **계산하는 코드가 없었다.** 그래서 이벤트로 오른 만큼 OVR 이 뒤처졌고
  //   **불러오기 전까지 안 맞았다**(`normalizeProtagonist` 가 그때 고쳐 준다).
  //   왕복 검사가 `batting.ovr 30 → 35` 로 잡았다.
  //   ⚠ 화면만의 문제가 아니다 — `pitching.ovr` 은 주인공의 `overall` 로
  //     나가 스카우트·드래프트 순위가 읽는다.
  let pTouched = false, bTouched = false;
  if (fx.statDelta) {
    for (const [key, amt] of Object.entries(fx.statDelta)) {
      const [bucket, stat] = key.includes(".") ? key.split(".") : ["pitching", key];
      // `ovr`은 파생값이라 못 바꾼다 — 능력치에서 계산된다
      if (stat === "ovr") continue;
      const target = bucket === "batting" ? batting : pitching;
      if (stat in target) {
        (target as unknown as Record<string, number>)[stat] =
          clampStat((target as unknown as Record<string, number>)[stat] + amt);
        if (bucket === "batting") bTouched = true; else pTouched = true;
      }
    }
  }
  if (pTouched) pitching.ovr = pitchingOvrOf(pitching);
  // ⚠ 옛 세이브엔 `batting`이 통째로 없다(바로 위 주석) — 빈 객체에 식을
  //   돌리면 NaN 이 된다. 실제로 값이 바뀐 때만 다시 계산한다
  if (bTouched) batting.ovr = battingOvrOf(batting);

  // ── 새 보상 열쇠 (2026-09-08 · PLAN_EVENT_TIERS §5 · A 4-3) ────
  //
  // 🔴 **상한은 커리어 누계로 잰다.** 「한 번에 +3 까지」로 재면 +1 짜리를
  //   세 번 받아 넘는다 — 이 저장소가 「한 해에 한 번」 가드에서 두 번 밟은
  //   형태다. 준 만큼(`potentialGranted`·`devRateGranted`)을 적어 둔다.
  const POTENTIAL_CAREER_CAP = 3;
  const DEVRATE_CAREER_CAP   = 10;

  let potentialHidden  = p.potentialHidden;
  let potentialGranted = p.potentialGranted ?? 0;
  if (fx.potentialDelta) {
    const room = Math.max(0, POTENTIAL_CAREER_CAP - potentialGranted);
    const give = Math.min(fx.potentialDelta, room);
    if (give > 0) {
      // 잠재력은 99 가 상한이다(생성 규칙과 같은 눈금)
      potentialHidden  = Math.min(99, potentialHidden + give);
      potentialGranted += give;
    }
    if (give < fx.potentialDelta) {
      // ⚠ **조용히 버리지 않는다.** 「아무 일도 안 일어남」이 이 저장소의 단골이다
      console.warn(`[보상] 잠재력 커리어 상한(+${POTENTIAL_CAREER_CAP}) — `
        + `${fx.potentialDelta} 중 ${give}만 반영 (누계 ${potentialGranted})`);
    }
  }

  let developmentRate = p.developmentRate;
  let devRateGranted  = p.devRateGranted ?? 0;
  if (fx.devRateDelta) {
    const room = Math.max(0, DEVRATE_CAREER_CAP - devRateGranted);
    const give = Math.min(fx.devRateDelta, room);
    if (give > 0) { developmentRate += give; devRateGranted += give; }
    if (give < fx.devRateDelta) {
      console.warn(`[보상] 성장률 커리어 상한(+${DEVRATE_CAREER_CAP}) — `
        + `${fx.devRateDelta} 중 ${give}만 반영 (누계 ${devRateGranted})`);
    }
  }

  // 훈련 효율·부상 위험 — **겹치면 긴 쪽이 남는다**(§5). 짧은 쪽으로 덮으면
  // 준 보상을 뺏는 꼴이고, 더하면 같은 이벤트 두 번에 무한이 된다
  const longerOf = (
    cur: { pct: number; weeksLeft: number } | undefined,
    add: { pct: number; weeks: number } | undefined,
  ) => {
    if (!add) return cur;
    if (!cur || add.weeks >= cur.weeksLeft) return { pct: add.pct, weeksLeft: add.weeks };
    return cur;
  };

  // 구종 — 습득·등급·진행도. 규칙은 `startPitchTraining`/`completePitchLearning`
  // 과 같은 눈금이다(상한 5 · 보유 5종)
  let pitches = p.pitches ?? [];
  if (fx.pitchGrant) {
    const has = pitches.find((e) => e.id === fx.pitchGrant!.id);
    if (has) {
      // 🔴 이미 있으면 **등급 +1** 이다(§5) — 「배웠다」가 아무 일도 안 하면 안 된다
      pitches = pitches.map((e) => e.id === fx.pitchGrant!.id
        ? { ...e, grade: Math.min(5, e.grade + 1) as PitchEntry["grade"] } : e);
    } else if (pitches.length < 5) {
      pitches = [...pitches, { id: fx.pitchGrant.id, grade: 1 }];
    } else {
      console.warn(`[보상] 구종 5종이 차서 ${fx.pitchGrant.id} 습득을 못 했다`);
    }
  }
  if (fx.pitchGradeUp) {
    const has = pitches.find((e) => e.id === fx.pitchGradeUp!.id);
    if (has) {
      pitches = pitches.map((e) => e.id === fx.pitchGradeUp!.id
        ? { ...e, grade: Math.min(5, e.grade + 1) as PitchEntry["grade"] } : e);
    } else {
      console.warn(`[보상] 없는 구종의 등급을 올리려 했다: ${fx.pitchGradeUp.id}`);
    }
  }
  // ⚠ 훈련 중이 아니면 아무 일도 안 한다 — 없는 훈련을 만들어 주지 않는다
  const trainingPitchState = fx.pitchProgressJump && p.trainingPitchState
    ? { ...p.trainingPitchState, progress: Math.min(100, p.trainingPitchState.progress + fx.pitchProgressJump.pct) }
    : p.trainingPitchState;

  // 특성 — **중복은 무시한다.** 같은 특성을 두 번 받아도 계수가 두 번 곱하면 안 된다
  const traits = fx.trait && !(p.traits ?? []).includes(fx.trait.id)
    ? [...(p.traits ?? []), fx.trait.id] : p.traits;

  // 누적 카운터 — `count` 조건의 입력(§12). 이름 표는 `eventCounters.COUNTERS`
  let counters = p.counters;
  if (fx.counterDelta) {
    counters = { ...(counters ?? {}) };
    for (const [k, v] of Object.entries(fx.counterDelta)) {
      if (typeof v === "number" && Number.isFinite(v)) counters[k] = (counters[k] ?? 0) + v;
    }
  }

  return {
    ...p,
    potentialHidden, potentialGranted,
    developmentRate, devRateGranted,
    trainEffBoost: longerOf(p.trainEffBoost, fx.trainEffBoost),
    injuryRiskMod: longerOf(p.injuryRiskMod, fx.injuryRiskMod),
    // 멘토는 **한 명**이다 — 둘째가 오면 덮는다(§5). 쌓으면 보너스가 무한이 된다
    mentor: fx.mentor
      ? { id: fx.mentor.npcId ?? fx.mentor.role ?? "mentor", role: fx.mentor.role, pct: fx.mentor.pct }
      : p.mentor,
    // 선발 보장은 **더한다** — 「N경기 더 보장」이 두 번 오면 그만큼 더 보장이다
    startGuaranteeGames: fx.startGuarantee
      ? (p.startGuaranteeGames ?? 0) + Math.max(0, fx.startGuarantee.games)
      : p.startGuaranteeGames,
    pitches, trainingPitchState, traits, counters,
    condition:  clamp(p.condition + (fx.conditionDelta ?? 0)),
    fatigue:    clamp(p.fatigue   + (fx.fatigueDelta   ?? 0)),
    morale:     clamp(p.morale    + (fx.moraleDelta    ?? 0)),
    money:      Math.max(0, p.money + (fx.moneyDelta ?? 0)),
    fame:       Math.max(0, Math.min(200, p.fame       + (fx.fameDelta       ?? 0))),
    popularity: Math.max(0, Math.min(100, p.popularity + (fx.popularityDelta ?? 0))),
    diligence:  Math.max(1, Math.min(99,  p.diligence  + (fx.diligenceDelta  ?? 0))),
    // ⚠ **더한 뒤 뺀다.** 한 선택지가 같은 태그를 넣고 빼면 결과는 "없음"이다 —
    //   반대로 하면 넣은 것이 남아 연계가 안 닫힌다
    tags:       applyTags(p.tags, fx.addTag, fx.removeTag),
    pitchingXP,
    battingXP,
    pitching,
    batting,
  };
}

/**
 * 소식함에서 **id가 겹치는 사본을 걷어낸다** — 앞(최신)에 있는 것을 남긴다.
 *
 * 🔴 **id가 겹치면 화면이 통째로 죽는다** (2026-09-05 · 실사용자 세이브).
 *   `NewsPage`가 `{#each visible as msg (msg.id)}`로 그리는데 Svelte 5는
 *   키가 겹치면 `each_key_duplicate`를 **던진다** — 렌더 도중 던지므로
 *   반응성 자체가 멎어, 화면이 굳고 **탭 전환조차 안 된다.** 껐다 켜도
 *   같은 소식함을 다시 읽으니 안 풀린다. 테스터가 신고한 형태가 이것이다:
 *
 *     [pageerror] each_key_duplicate
 *     Keyed each block has duplicate key `msg-tour-my-TOUR_HS_JANGMI-r1-2028`
 *     at indexes 2 and 10   in NewsPage.svelte
 *
 * ⚠ **id는 원래 유일해야 한다.** 소식을 읽음 처리(`markMessageRead`)·선택
 *   확정(`resolveDecision`)·대기 해제(`resolvePendingAction("message", id)`)가
 *   전부 id로 찾는다 — 사본이 있으면 그것들도 엉킨다. 그러니 여기서 지우는
 *   것이 손실이 아니다.
 *
 * ⚠ 이건 **막는 자리**지 고치는 자리가 아니다. 사본을 만드는 쪽이 따로
 *   있다(`advanceWeek`의 대회 라운드 루프가 같은 라운드를 다시 확정하면
 *   `buildMyRoundMessage`가 같은 id를 또 만든다 — 그 id에는 주차가 없다).
 *   그쪽은 엔진 진행 로직이라 여기서 손대지 않는다.
 */
function dedupeMailbox(list: MessageItem[]): MessageItem[] {
  const seen = new Set<string>();
  const out: MessageItem[] = [];
  for (const m of list) {
    if (seen.has(m.id)) {
      // 🔴 **세고 찍는다.** 안 세면 소식 한 통이 조용히 사라진다 —
      //   `mailboxDupStats` 머리말. 만드는 쪽이 고쳐지면 0 이 된다.
      mailboxDupStats.dropped++;
      mailboxDupStats.byId[m.id] = (mailboxDupStats.byId[m.id] ?? 0) + 1;
      continue;
    }
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** 들어오는 소식을 집계하고 상한을 적용한다. 메일함에 넣는 유일한 문이다 */
function pushMailbox(incoming: MessageItem[], current: MessageItem[]): MessageItem[] {
  for (const m of incoming) {
    mailboxProduceStats.total++;
    const k = messageKindOf(m.id);
    mailboxProduceStats.byKind[k] = (mailboxProduceStats.byKind[k] ?? 0) + 1;
    // 제목 인구조사 — 은행이 실제로 여러 문장을 내고 있나 (C2)
    const subj = m.subject ?? "";
    const bucket = mailboxProduceStats.subjectsByKind[k]
      ?? (mailboxProduceStats.subjectsByKind[k] = {});
    bucket[subj] = (bucket[subj] ?? 0) + 1;
    if (mailboxProduceStats.lastSubject[k] === subj) {
      mailboxProduceStats.repeatByKind[k] = (mailboxProduceStats.repeatByKind[k] ?? 0) + 1;
    }
    mailboxProduceStats.lastSubject[k] = subj;
  }
  return trimMailbox(dedupeMailbox([...incoming, ...current]));
}

/**
 * 상한을 넘긴 메일함을 자른다. 보존 우선순위는 **두 단계**다.
 *
 *   ① 미결 선택지 — 버리면 진행이 막힌다
 *   ② 나머지는 들어온 순 — 최신 `MAX_MAILBOX`칸을 남기고 오래된 것부터 버린다
 *
 * 🔴 **「안 읽음 우선」 단계를 지웠다** (사용자 확정 2026-09-03 ·
 * `docs/PLAN_MESSAGE_DASHBOARDS.md` §8). 그 단계가 **나이를 안 봤다** —
 * 안 읽었다는 이유만으로 지난 시즌 연습경기 예정이 이번 주 계약서보다 오래
 * 버텼다. 소식함은 시간 순 목록인데 버리는 순서만 시간을 안 보고 있었다.
 *
 * ⚠ **잃는 게 거의 없다.** 아래 실측이 그렇게 적고 있다 — 2시즌에서 50칸 중
 * 41칸이 이미 안 읽은 상태였고, **읽은 9칸을 늦게 버리는 것이 그 단계의 효과
 * 전부**였다. 안 읽은 것이 이미 대부분이라 우선순위가 실제로 가르는 게 없다.
 *
 * ⚠ 오래 남아야 하는 소식은 소식함이 아니라 **기록 탭 사본**이 맡는다
 * (`PLAN_MESSAGE_DASHBOARDS.md` §7). 여기서 종류별로 나누지 않는다.
 *
 * `take`는 배열을 앞에서부터 훑고 소식함은 **최신순**이라, ② 한 줄이면
 * 최신 `MAX_MAILBOX`칸이 남고 꼬리(가장 오래된 쪽)부터 밀린다.
 *
 * ⚠ `mailboxTrimStats.droppedUnread`는 **그대로 둔다.** 우선순위가 사라졌으니
 * 안 읽은 채 밀리는 수가 늘 것이고, 그게 이 변경의 값이다 — 재야 보인다.
 */
export function trimMailbox(mailbox: MessageItem[]): MessageItem[] {
  if (mailbox.length <= MAX_MAILBOX) return mailbox;

  // ⚠ **id가 아니라 위치로 고른다.** 예전엔 `Set<id>`에 담고
  // `filter(m => keepIds.has(m.id))`로 걸렀는데, **id가 겹치는 소식이 있으면
  // 슬롯은 하나만 쓰면서 사본이 전부 통과했다** — 실측에서 보유가 상한 200을
  // 넘어 237이 됐고(미결은 1건뿐이라 그걸로는 설명이 안 된다), "상한이 안
  // 지켜진다"로 읽힐 뻔했다. 위치는 언제나 유일하다.
  const keep = new Set<number>();
  let slots = MAX_MAILBOX;

  const take = (pick: (m: MessageItem) => boolean) => {
    for (let i = 0; i < mailbox.length; i++) {
      if (slots <= 0) break;
      if (keep.has(i) || !pick(mailbox[i])) continue;
      keep.add(i);
      slots--;
    }
  };

  // ① 미결 decision — 상한을 넘겨서라도 남긴다(진행이 막히므로)
  mailbox.forEach((m, i) => {
    if (m.decision && m.decision.selectedOptionId === null) {
      keep.add(i);
      slots--;
    }
  });
  // ② 나머지 — 앞(최신)부터 채운다. 자리가 떨어지면 꼬리(오래된 것)가 밀린다
  take(() => true);

  mailbox.forEach((m, i) => {
    if (keep.has(i)) return;
    mailboxTrimStats.dropped++;
    if (m.readAt === null) mailboxTrimStats.droppedUnread++;
    mailboxTrimStats.droppedByCategory[m.category] =
      (mailboxTrimStats.droppedByCategory[m.category] ?? 0) + 1;
  });

  return mailbox.filter((_, i) => keep.has(i));
}

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
function buildNpcStatLine(stat: PlayerSeasonStats): string {
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
        const fx     = option?.effects;

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
     * 마스터의 구단 성향을 스토어로 옮긴다.
     *
     * 🔴 **예전엔 불러도 날아갔다.** `App.svelte`가 마스터 로드 직후에
     * 불렀는데, 그 뒤 새 게임이 `proTeamProfiles: {}`로 초기화해 덮었다 —
     * 실측: 마스터엔 성향이 32팀 있는데 게임 스토어는 **0개**였다.
     * 그래서 오프시즌이 전 팀을 `DEFAULT_TEAM_PROFILE`로 봤고, 압박이
     * 전 팀 정확히 50이었다.
     *
     * ⚠ **기존 값을 안 덮는다**(`!map[t.id]`) — 세이브에 쌓인 성향이
     *   마스터 초기값으로 되돌아가면 시즌을 거친 개성이 사라진다.
     */
    initProTeamProfiles(teams: import("../stores/master").TeamRef[]) {
      update((s) => {
        const map: Record<string, import("../stores/master").ProTeamProfile> = { ...s.proTeamProfiles };
        for (const t of teams) {
          if (t.proTeamProfile && !map[t.id]) map[t.id] = { ...t.proTeamProfile };
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

    saveTop10Snapshot(snapshot: import("../types/save").Top10Snapshot) {
      update((s) => ({
        ...s,
        lastTop10Pitcher: snapshot.type === "pitcher" ? snapshot : s.lastTop10Pitcher,
        lastTop10Batter:  snapshot.type === "batter"  ? snapshot : s.lastTop10Batter,
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
    saveSeasonStartSnapshot() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          seasonStartPitching: { ...s.protagonist.pitching },
          seasonStartBatting:  { ...s.protagonist.batting  },
        },
      }));
    },

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
    incrementUniversityWeek() {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, universityWeek: s.schoolState.universityWeek + 1 },
      }));
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
    applyEventEffect(effect: import("../types/main").DecisionEffect) {
      update((s) => {
        const updated = applyEffectToProtagonist(s.protagonist, effect);
        return {
          ...s, protagonist: updated, player: toPlayerCompat(updated),
          schoolState: applyStudyQuality(s.schoolState, effect.studyQualityDelta),
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
    /**
     * 국제대회 성적으로 병역 면제 (Phase 7-3).
     *
     * **면제는 되돌리지 않는다** — 이미 군필·현역인 사람은 건드리지 않고,
     * 미필만 면제로 바꾼다. 주인공도 같은 경로를 탄다.
     */
    grantMilitaryExemption(npcIds: string[], seasonYear: number, tournamentName: string) {
      const target = new Set(npcIds);
      update((s) => {
        const npcs = s.npcs.map((n) => {
          if (!target.has(n.npcId) || n.militaryStatus !== "미필") return n;
          return {
            ...n,
            militaryStatus: "면제" as const,
            careerEvents: [
              ...(n.careerEvents ?? []),
              { year: seasonYear, eventType: "military_exempt" as const,
                detail: `${tournamentName} 입상` },
            ],
          };
        });
        // ⚠ **주인공만 커리어 이벤트가 없었다.** NPC는 `military_exempt`를
        // 남기는데 주인공은 `militaryStatus`만 바뀌어서, 연도별 인생 기록에
        // "아시안게임 우승 → 병역 면제"가 **한 줄도 안 떴다.**
        // 국제대회 입상은 병역을 벗어나는 두 길 중 하나다 — 커리어의 분기점인데
        // 기록에 없으면 플레이어가 무슨 일이 있었는지 되짚을 수 없다.
        const protoExempt = target.has(s.protagonist.id) && s.protagonist.militaryStatus === "미필";
        const proto = protoExempt
          ? {
              ...s.protagonist,
              militaryStatus: "면제" as const,
              careerEvents: [
                ...(s.protagonist.careerEvents ?? []),
                { year: seasonYear, eventType: "military_exempt" as const,
                  detail: `${tournamentName} 입상` },
              ],
            }
          : s.protagonist;
        return { ...s, npcs, protagonist: proto };
      });
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

    signContract(contract: ProContract, stamp: ContractStamp = {}) {
      update((s) => {
        const shift = shiftContract(s.protagonist.contract, contract, stamp,
                                    s.protagonist.contractHistory);
        const leagueStage =
          contract.leagueId === "LEAGUE_ABL"         ? "pro_abl" :
          contract.leagueId === "LEAGUE_JBL"         ? "pro_jbl" :
          contract.leagueId === "LEAGUE_INDEPENDENT" ? "independent" :
          "pro_kbl";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          contract: { ...shift.contract, status: "active" },
          // 지나간 계약은 기록 탭 「계약 이력」이 읽는다 (§7-4). 소식은 밀려나도
          // 여기는 남는다 — 그게 이 필드가 있는 이유다
          contractHistory: shift.history,
          money: Math.max(0, s.protagonist.money + contract.signingBonus),
          careerStage: leagueStage,
          // 학년은 고교에서만 의미가 있다. `applyDraftDecision`은 이미 이렇게
          // 지우는데 여기만 빠져 있어서, 드래프트로 프로에 간 선수가
          // `grade: 3`을 달고 다녔다 — 시즌 종료 화면 헤더가 `p.grade`를 먼저
          // 보므로 프로 선수에게 "3학년"이 찍혔다
          grade: undefined,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          faNegotiationRound: 0,
          faUnsignedWeeks: 0,
          tradeAdaptationWeeks: 0,
          // 🔴 **팀을 옮겼다고 연차를 0으로 되돌리지 않는다.**
          //
          // 예전엔 `isNewTeam ? 0 : ...`이었다. 그런데 `isNewTeam`은 "프로에 처음
          // 들어왔다"가 아니라 **"팀이 바뀜다"**다 — FA 이적·트레이드·
          // 2군 이동으로 `teamId`가 바뀔 때마다 연차가 사라졌다.
          // 실측(씨앗 424242 · 12시즌): 연차 **4 → 0**으로 리셋됐다.
          // 그러면 FA 자격(5년)에 영영 못 닿고 은퇴 판정도 어긋난다.
          //
          // ⚠ 프로 등록일수는 리그 전체 기준이다. 신인은 어차피 이 값이 0이라
          //   따로 리셋할 이유가 없다.
          proServiceYears: s.protagonist.proServiceYears,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
        };
      });
    },

    // 오프시즌 계약 서명 — 즉시 시즌 초기화 없이 pendingNextContract에 보관
    // W52 SeasonEndModal에서 applyPendingNextContract 호출 시 실제 적용
    setPendingNextContract(contract: ProContract, stamp: ContractStamp = {}) {
      update((s) => {
        // 🔴 **여기서 옛 계약을 밀지 않는다.** 서명은 오프시즌이고 옛 계약은
        //    W52 까지 살아 있다 — 지금 밀면 「계약 정보」가 빈 채로 한 달이
        //    지나간다. 이력은 `applyPendingNextContract` 가 넘길 때 쌓는다.
        //    찍는 것(연도·종류)은 지금 해야 한다 — 그때는 몇 년에 서명했는지
        //    모른다.
        const shift = shiftContract(undefined, contract, stamp);
        const leagueStage =
          contract.leagueId === "LEAGUE_ABL"         ? "pro_abl" :
          contract.leagueId === "LEAGUE_JBL"         ? "pro_jbl" :
          contract.leagueId === "LEAGUE_INDEPENDENT" ? "independent" :
          "pro_kbl";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          pendingNextContract: { ...shift.contract, status: "active" },
          careerStage: leagueStage,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          money: Math.max(0, s.protagonist.money + contract.signingBonus),
          faNegotiationRound: 0,
          faUnsignedWeeks: 0,
          // 🔴 **팀을 옮겼다고 연차를 0으로 되돌리지 않는다.**
          //
          // 예전엔 `isNewTeam ? 0 : ...`이었다. 그런데 `isNewTeam`은 "프로에 처음
          // 들어왔다"가 아니라 **"팀이 바뀜다"**다 — FA 이적·트레이드·
          // 2군 이동으로 `teamId`가 바뀔 때마다 연차가 사라졌다.
          // 실측(씨앗 424242 · 12시즌): 연차 **4 → 0**으로 리셋됐다.
          // 그러면 FA 자격(5년)에 영영 못 닿고 은퇴 판정도 어긋난다.
          //
          // ⚠ 프로 등록일수는 리그 전체 기준이다. 신인은 어차피 이 값이 0이라
          //   따로 리셋할 이유가 없다.
          proServiceYears: s.protagonist.proServiceYears,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
        };
      });
    },

    // W52 SeasonEndModal에서 호출 — pendingNextContract를 contract로 확정
    applyPendingNextContract() {
      update((s) => {
        const pending = s.protagonist.pendingNextContract;
        if (!pending) return s;
        // 옛 계약이 자리를 내주는 순간이 여기다 — 재계약·FA 가 이 길로 온다
        const shift = shiftContract(s.protagonist.contract, pending, {},
                                    s.protagonist.contractHistory);
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          contract: shift.contract,
          contractHistory: shift.history,
          pendingNextContract: undefined,
        };
        return { ...s, protagonist, player: toPlayerCompat(protagonist) };
      });
    },

    applyTradeTransfer(toTeamId: string, toLeagueId?: string) {
      update((s) => {
        const current = s.protagonist.contract;
        const newLeagueId = toLeagueId ?? s.protagonist.leagueId;
        const leagueStage: import("../types/save").CareerStage =
          newLeagueId === "LEAGUE_ABL"         ? "pro_abl" :
          newLeagueId === "LEAGUE_JBL"         ? "pro_jbl" :
          newLeagueId === "LEAGUE_INDEPENDENT" ? "independent" :
          "pro_kbl";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          teamId:    toTeamId,
          leagueId:  newLeagueId,
          careerStage: leagueStage,
          tradeAdaptationWeeks: 3,
          contract: current
            ? { ...current, teamId: toTeamId, leagueId: newLeagueId }
            : current,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          logs: [`트레이드 이적: ${toTeamId}`, ...s.logs].slice(0, 30),
        };
      });
    },

    addMilitaryDeferPenalty(points: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          militaryDeferPenalty: (s.protagonist.militaryDeferPenalty ?? 0) + points,
        },
      }));
    },

    setSportsUnitApplied(flag: boolean) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, sportsUnitApplied: flag },
      }));
    },

    /** 은퇴 확정 — 커리어가 여기서 끝난다 */
    retire(rec: { year: number; week: number; reason: import("../types/save").RetirementReason }) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, retirement: rec },
      }));
    },

    /** 체육부대 후보 공개를 이 시즌에 물어봤다고 표시 — 같은 주 무한 반복 방지 */
    markSportsUnitPrompted(seasonYear: number) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, sportsUnitPromptedYear: seasonYear },
      }));
    },

    /** 입대 여부를 이 시즌에 물어봤다고 표시 — 같은 주 무한 반복 방지 */
    markMilitaryAsked(seasonYear: number) {
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, militaryAskedYear: seasonYear },
      }));
    },

    enlistMilitary(unit: "sports" | "general", enlistWeek = MILITARY_RESULT_WEEK, sportsUnitSelected = false, enlistYear?: number) {
      update((s) => {
        const now = s.protagonist;
        const isPro = now.careerStage === "pro_kbl" || now.careerStage === "pro_abl" || now.careerStage === "pro_jbl" || now.careerStage === "independent";
        // 유효한 계약(잔여 > 0)만 군 복무 기간만큼 연장; 만료된 계약은 연장 없이 전역 후 FA/재계약
        const extendedContract = isPro && now.contract && now.contract.remainingYears > 0
          ? { ...now.contract, remainingYears: now.contract.remainingYears + 2 }
          : now.contract;
        // ⚠ **미필만 입대한다.** 화면 가드만 두면 다른 호출부(헤드리스·
        // 이벤트)가 그대로 통과한다 — 실제로 조사에서 군 복무를 세 번 하는
        // 커리어가 나왔다. 되돌릴 수 없는 상태 전이라 여기서도 막는다.
        if (now.militaryStatus !== "미필") return s;

        const protagonist: ProtagonistSave = {
          ...now,
          careerStage: "military",
          // 🔴 **소속 리그도 군으로 옮긴다** (2026-09-02).
          //
          // 예전엔 단계만 바꾸고 `leagueId` 는 입대 전 것을 그대로 뒀다.
          // 배경 시뮬은 `lid === 주인공.leagueId` 를 건너뛰므로, 학생 입대자는
          // 복무 2년 내내 **고교 리그가 통째로 멈췄고**(실측 `HIGHSCHOOL 1020/0`),
          // 프로 입대자면 **그 프로 리그가 멈춘다.** 소속은 NPC 처럼
          // `LEAGUE_MILITARY` 다(AUDIT_STAGES §8). 원래 리그는 전역 때
          // 복구 단계(`militaryHiatusStage`)에서 되돌린다.
          leagueId: "LEAGUE_MILITARY",
          militaryUnit: unit,
          militaryServiceWeeks: 0,
          militaryRecoveryWeeks: 0,
          militaryStatus: "현역",
          militaryEnlistWeek: enlistWeek,
          militaryEnlistYear: enlistYear ?? null,
          militaryDischargeYear: enlistYear != null ? enlistYear + 2 : null,
          militaryHiatusStage: now.careerStage,
          militaryHiatusUniversityWeek:
            now.careerStage === "university" ? s.schoolState.universityWeek ?? 0 : null,
          sportsUnitSelected,
          contract: extendedContract,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
        };
      });
    },

    /**
     * 전역 환산 (PLAN_MILITARY_LIFE §30) — 복무 중 안 건드린 능력치를 야구 감각으로 한 번에 환산하고
     * 군 경력 한 장을 남긴다. 값은 usecases/militaryDecision 이 rules.json 에서 계산해 넘긴다 — 여기선 적기만.
     * ⚠ `completeMilitaryService` 뒤에 불러야 회복 주(고정 6)를 덮는다.
     */
    applyMilitaryDischarge(args: {
      statDelta: number; velocityDelta: number; recoveryWeeks: number;
      record: import("../types/militaryLife").MilitaryRecord;
    }) {
      update((s) => {
        const p = s.protagonist;
        const c99 = (v: number) => Math.max(1, Math.min(99, v));
        const pitching = {
          ...p.pitching,
          command:  c99(p.pitching.command  + args.statDelta),
          control:  c99(p.pitching.control  + args.statDelta),
          recovery: c99(p.pitching.recovery + args.statDelta),
          velocity: c99(p.pitching.velocity + args.velocityDelta),
        };
        const protagonist: ProtagonistSave = {
          ...p, pitching,
          militaryRecoveryWeeks: args.recoveryWeeks,
          militaryLife: null,
          militaryRecord: args.record,
        };
        return { ...s, protagonist, player: toPlayerCompat(protagonist) };
      });
    },
    /** 병영생활 상태 얇은 패처 — 계산은 usecases/militaryLife.ts · utils/militaryLifeRules.ts */
    setMilitaryLife(next: import("../types/militaryLife").MilitaryLifeState | null) {
      update((s) => {
        const protagonist = { ...s.protagonist, militaryLife: next };
        return { ...s, protagonist, player: toPlayerCompat(protagonist) };
      });
    },
    advanceMilitaryWeek() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          militaryServiceWeeks: s.protagonist.militaryServiceWeeks + 1,
        },
      }));
    },

    /**
     * @param at 실제로 전역한 시점. **상무·현역 둘 다 여기를 지난다** —
     *   전역 환산(`applyMilitaryDischarge`)은 현역만 타므로 거기 두면 상무가 빠진다.
     *   안 넘기면 안 적는다(옛 호출부·검사 호환).
     */
    completeMilitaryService(at?: { season: number; week: number }) {
      update((s) => {
        const p = s.protagonist;
        // 휴학 단계 복구: militaryHiatusStage 우선, 없으면 leagueId 기반.
        //
        // ⚠ **학교로는 돌아가지 않는다.** 고교·대학에서 입대하면 hiatusStage가
        // 그 학적이라 그대로 복구했는데, 그러면 2년 복무한 21세가 고등학교로
        // 돌아간다(실측). `careerTransition`이 "고교 재입학 불가"를 이미
        // 명시하고 있고, 전이표에서도 학교로 가는 화살표는 없다.
        // 학생 신분에서 입대했으면 갈 곳은 독립리그다.
        const hiatus = p.militaryHiatusStage as import("../types/save").CareerStage | null;
        const restored = (hiatus === "highschool" || hiatus === "university") ? null : hiatus;
        const stage: import("../types/save").CareerStage =
          restored ??
          (p.leagueId === "LEAGUE_ABL" ? "pro_abl" :
           p.leagueId === "LEAGUE_JBL" ? "pro_jbl" :
           p.leagueId === "LEAGUE_KBL" ? "pro_kbl" : "independent");
        const protagonist: ProtagonistSave = {
          ...p,
          careerStage: stage,
          // 입대 때 `LEAGUE_MILITARY` 로 옮겼으니 여기서 되돌린다 — 단계가
          // 정본이고 리그는 그 파생이다. 학생 출신은 독립으로 간다(위 주석).
          // ⚠ 독립의 **팀**은 `dischargeProtagonist` 가 정한다 — 여기는 리그만.
          leagueId:
            stage === "pro_abl" ? "LEAGUE_ABL" :
            stage === "pro_jbl" ? "LEAGUE_JBL" :
            stage === "pro_kbl" ? "LEAGUE_KBL" : "LEAGUE_INDEPENDENT",
          // ⚠ **다녀온 부대는 남긴다.** 지우면 전역 후 상무/현역 구분이 사라져
          // 선수 상세·인생 기록에 표시할 수 없다 (NPC 쪽도 같이 고쳤다)
          militaryServedUnit: p.militaryUnit ?? p.militaryServedUnit,
          militaryUnit: null,
          militaryServiceWeeks: 0,
          militaryRecoveryWeeks: p.militaryUnit === "sports" ? 2 : 6,
          militaryStatus: "군필",
          // 전역 뒤 경과를 재는 유일한 기준점 (B-20 §30). `militaryRecoveryWeeks` 는
          // 0에서 멈춰 그 뒤를 못 센다
          dischargedSeason: at?.season ?? p.dischargedSeason,
          dischargedWeek:   at?.week   ?? p.dischargedWeek,
          militaryHiatusStage: null,
          militaryHiatusUniversityWeek: null,
          // 학년은 학생일 때만 의미가 있다. 전역자는 학교로 안 돌아가므로
          // 지운다 — 안 그러면 독립리그 선수가 `grade: 3`을 달고 다니고
          // 시즌 종료 화면 헤더가 그걸 먼저 읽어 "3학년"이 찍힌다
          // (`signContract`·`applyDraftDecision`이 이미 같은 이유로 지운다)
          grade: undefined,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
        };
      });
    },

    /**
     * 인센티브 정산 자물쇠 (PLAN_CONTRACT_TERMS §7 ⑤).
     *
     * 정산한 해를 `paidSeasons` 에 찍는다 — **다년 계약에서 두 번 주는 걸
     * 막는 게 이 필드의 목적**이다(`save.ts`). 미달한 줄도 찍는다:
     * 안 찍으면 같은 해에 다시 불릴 때 미달 소식이 한 통 더 생긴다.
     *
     * ⚠ 계산은 `usecases/incentiveSettlement.ts` 가 한다 — 여기는 패치만이다.
     */
    markIncentivesSettled(seasonYear: number, keys: readonly string[]) {
      if (keys.length === 0) return;
      const set = new Set(keys);
      update((s) => {
        const c = s.protagonist.contract;
        if (!c?.incentives?.length) return s;
        return {
          ...s,
          protagonist: {
            ...s.protagonist,
            contract: {
              ...c,
              incentives: c.incentives.map((i) => {
                if (!set.has(incentiveKey(i))) return i;
                const paid = i.paidSeasons ?? [];
                if (paid.includes(seasonYear)) return i;
                return { ...i, paidSeasons: [...paid, seasonYear] };
              }),
            },
          },
        };
      });
    },

    applySeasonContractProgress() {
      update((s) => {
        const current = s.protagonist.contract;
        if (!current) return s;
        const remainingYears = Math.max(0, current.remainingYears - 1);
        const status = remainingYears > 0 ? "active" : "expired";
        return {
          ...s,
          protagonist: {
            ...s.protagonist,
            contract: {
              ...current,
              remainingYears,
              status,
            },
          },
        };
      });
    },

    incrementFaNegotiationRound() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          faNegotiationRound: Math.min(2, (s.protagonist.faNegotiationRound ?? 0) + 1),
        },
      }));
    },

    incrementFaUnsignedWeek() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          faUnsignedWeeks: (s.protagonist.faUnsignedWeeks ?? 0) + 1,
        },
      }));
    },

    resetFaProgress() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          faNegotiationRound: 0,
          faUnsignedWeeks: 0,
        },
      }));
    },

    advanceMilitaryRecoveryWeek() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          militaryRecoveryWeeks: Math.max(0, (s.protagonist.militaryRecoveryWeeks ?? 0) - 1),
        },
      }));
    },

    advanceTradeAdaptationWeek() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          tradeAdaptationWeeks: Math.max(0, (s.protagonist.tradeAdaptationWeeks ?? 0) - 1),
        },
      }));
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

    applyOptionResult(payload: {
      exercised: boolean;
      nextSalary: number;
      optionType: "team" | "player";
    }) {
      update((s) => {
        const current = s.protagonist.contract;
        if (!current) return s;
        if (!payload.exercised) {
          return {
            ...s,
            protagonist: {
              ...s.protagonist,
              contract: {
                ...current,
                status: "expired",
              },
            },
          };
        }
        return {
          ...s,
          protagonist: {
            ...s.protagonist,
            contract: {
              ...current,
              salary: payload.nextSalary,
              remainingYears: 1,
              status: "active",
              teamOptionYears:
                payload.optionType === "team"
                  ? Math.max(0, current.teamOptionYears - 1)
                  : current.teamOptionYears,
              playerOptionYears:
                payload.optionType === "player"
                  ? Math.max(0, current.playerOptionYears - 1)
                  : current.playerOptionYears,
            },
          },
        };
      });
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
    advanceSeasonYear(_seasonYear?: number, playedLeagueId?: string) {
      update((s) => {
        const p = s.protagonist;
        const isPro = countsAsProSeason(p.careerStage, playedLeagueId);
        const protagonist: ProtagonistSave = {
          ...p,
          age: p.age + 1,
          proServiceYears: isPro ? p.proServiceYears + 1 : p.proServiceYears,
          condition: Math.min(100, p.condition + 20),
          fatigue: Math.max(0, p.fatigue - 30),
          seasonHealth: { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 },
          sportsUnitApplied: false,
          // ── 같은 팀에서 보낸 해 (2026-09-08 · §12 `count`) ──────
          //
          // 🔴 **팀이 바뀌면 1 로 되돌린다** — 「3년 내내 같은 팀」이 물으려는
          //   것은 누적 연차가 아니라 **끊기지 않은 기간**이다. 트레이드·이적·
          //   진학이 그걸 끊는다.
          // ⚠ 첫 시즌은 `lastSeasonTeamId` 가 없어 1 이다(그게 맞다 — 한 해를
          //   보냈으니 1년이다). 구 세이브도 여기서 1부터 다시 센다.
          counters: {
            ...(p.counters ?? {}),
            sameTeamYears: p.lastSeasonTeamId === p.teamId
              ? (p.counters?.sameTeamYears ?? 0) + 1 : 1,
          },
          lastSeasonTeamId: p.teamId,
        };

        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
        };
      });
    },

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
    async processAllLeaguesSeasonEnd(seasonYear: number) {
      const s = get({ subscribe });

      // before 스냅샷: FA 추적 (프로 FA 자격 NPC) + 병역 상태 추적 (전체)
      const proLeagues = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
      const beforeTeam = new Map<string, string>(
        s.npcs
          .filter(n => proLeagues.has(n.currentLeague) && (n.proServiceYears ?? 0) >= getFaThreshold(n.currentLeague))
          .map(n => [n.npcId, n.currentTeam])
      );
      const beforeMilitary = new Map(
        s.npcs.map(n => [n.npcId, { name: n.name, status: n.militaryStatus, unit: n.militaryUnit, league: n.currentLeague, team: n.currentTeam }])
      );

      // TS에서 이미 FA/재계약 결정된 named NPC ID → Rust FA 랜덤 재결정 방지
      const namedNpcIds = s.npcs.map(n => n.npcId);
      // 로스터 상한·연봉 규칙을 규칙 파일에서 넘긴다. 예전엔 Rust에 하드코딩된
      // 표(KBL 상한 65)를 썼고 그게 1군+2군 합산에 걸려 프로가 700명까지 부풀었다
      const offRules = await loadRosterRules();
      // 방출·FA 미계약자의 진로 — 미지명 졸업생과 **같은 로직**을 태운다.
      // 안 넘기면 Rust가 그 사람들을 전부 은퇴시킨다
      const offDest = draftDestinationTeams(get(masterStore).teams);
      // FA 입찰 — **상한은 팀 예산 지수에서 유도한다**(새 표를 만들지 않는다).
      // 지금 총연봉에 지수와 여유를 곱한다: 부자 구단은 더 부를 수 있고
      // 가난한 구단은 못 부른다. `buildSalaryIndex`는 외국인 영입도 쓰는 함수다.
      const faParams = await (async () => {
        const min = (offRules.faRules as { bidInterestMin?: number } | undefined)?.bidInterestMin ?? 0;
        // 성적 배수 폭 — 0이면 성적을 안 본다(예전 동작)
        const span = (offRules.faRules as { perfSpan?: number } | undefined)?.perfSpan ?? 0;
        // 재계약 성적 배수 — FA보다 좁다
        const rSpan = (offRules.faRules as { renewPerfSpan?: number } | undefined)?.renewPerfSpan ?? 0;
        // 입찰 상한의 하한 — 팀 총연봉 대비. 0이면 하한이 없다(예전 동작).
        // 🔴 예산 지수가 0.8 미만인 구단은 상한이 **음수**였다(cap < 총연봉).
        //    자세한 건 Rust `fa_bid_floor_ratio` 주석에 있다.
        const floor = (offRules.faRules as { bidFloorRatio?: number } | undefined)?.bidFloorRatio ?? 0;
        if (!min) return undefined;
        const { buildSalaryIndex } = await import("../repo/newGameV3");
        const idx = buildSalaryIndex(get(masterStore).teams);
        const payroll = new Map<string, number>();
        for (const n of s.npcs) {
          if (n.careerStatus !== "active" || !n.currentTeam) continue;
          payroll.set(n.currentTeam, (payroll.get(n.currentTeam) ?? 0) + (n.currentSalary ?? 0));
        }
        const cap: Record<string, number> = {};
        // 🔴 **FA 상한을 예산에서 낸다** (사용자 확정 2026-08-31).
        //
        //   예전엔 "지금 총연봉 × 팀지수 × 1.25" 였다 — 즉 **많이 쓰는 팀일수록
        //   상한이 높았다.** `refs.json` 의 팀별 예산(KBL 120~350억)은 어느
        //   판정에도 안 들어갔다.
        //
        //   지금은 **남은 예산**이 상한이다. 생성 때 예산을 적게 쓴 팀이
        //   그만큼 시장에서 큰손이 된다 — 실측에서 사용률이 19~66% 로
        //   갈렸다(창원 19% · 대전 66%).
        //
        // ⚠ 예산이 없는 팀(2군·상무·아마추어)은 **예전 식으로 떨어진다** —
        //   상한이 0이 되면 그 팀은 FA 입찰을 통째로 못 한다.
        const budgetOfTeam = new Map(get(masterStore).teams.map((t) =>
          [t.id, ((t as unknown as { history?: { budget?: number } }).history?.budget ?? 0) / 10000]));
        for (const [tid, cur] of payroll) {
          const saved = s.clubBudgets?.[tid];
          const budget = saved != null ? saved : (budgetOfTeam.get(tid) ?? 0);
          cap[tid] = budget > 0
            ? Math.max(0, Math.round(budget - cur))
            : Math.round(cur * (idx.get(tid) ?? 1) * 1.25);
        }
        return { teamPayrollCap: cap, bidInterestMin: min, perfSpan: span, renewPerfSpan: rSpan,
                 bidFloorRatio: floor };
      })();
      // 🔴 **그해 성적 → 방출 판정.** Rust는 `recent_performance_rating`에
      // 능력치를 넣고 있었고 그 능력치마저 생성 시점 값이라, 사실상 "태어날
      // 때 실력"으로 방출을 정했다. 성적은 **바로 이 시점까지 살아 있다** —
      // `seasonRollover`가 두 줄 위에서 같은 값을 연감에 넘긴다.
      //
      // ⚠ 리그를 골라 담지 않는다. 배경 리그 전부가 `playerLines`를 쌓으므로
      // (`backgroundLeague.accumulateStats`) 독립리그도 여기 들어온다 —
      // 프로만 담으면 독립이 통째로 방출 대상에서 빠진다.
      const offPerfScores: Record<string, number> = {};
      let offWorldSeed = 0;
      {
        const { seasonStore: _ss } = await import("./season");
        const _s = get(_ss);
        const { calcNpcPerfScore } = await import("../usecases/weekPhases/market");
        const put = (rows: Record<string, import("../types/save").PlayerSeasonStats>) => {
          for (const [pid, st] of Object.entries(rows ?? {})) {
            if (!st) continue;
            offPerfScores[pid] = calcNpcPerfScore(st);
          }
        };
        offWorldSeed = (_s.worldSeed ?? 0) >>> 0;
        put(_s.stats);
        for (const ls of Object.values(_s.leagueState ?? {})) put(ls?.stats ?? {});
      }
      const result = await runOffseasonProcessing(
        s.npcs, s.pendingDraft, seasonYear, namedNpcIds,
        rosterLimitsFrom(offRules.rosterRules), offRules.salaryRules,
        {
          universityTeamIds: offDest.univIds,
          independentTeamIds: offDest.indIds,
          farmTeamIds: offDest.farmIds,
          rules: placementRulesFrom(
            offRules.rosterRules,
            offRules.developmentPlayerRules?.salary,
            offRules.developmentPlayerRules?.intakeMax),
        },
        (offRules.faRules as { release?: unknown } | undefined)?.release,
        // 🔴 **안 넘기면 웨이버가 통째로 꺼진다.** `serde(default)` 라
        //   Rust 는 조용히 통과하고 방출자가 곧장 시장으로 간다.
        (offRules as { waiverRules?: unknown }).waiverRules,
        // ⚠ 안 넘기면 FA 미계약자가 **바로 은퇴한다** — 독립 재도전 갈래가 꺼진다
        (offRules.faRules as { independentAgeMax?: number } | undefined)?.independentAgeMax,
        foreignParamsFrom(offRules),
        // 🔴 **지금 능력치.** 안 넘기면 오프시즌이 생성 시점 값으로 돈다 —
        // 은퇴·정원 정리·방출·FA·콜업 정렬 22곳이 전부 그랬다
        get(npcLiveStatsStore),
        offPerfScores,
        s.proTeamProfiles,
        // 세계 씨앗 — 안 넘기면 모든 세계가 같은 오프시즌을 낸다
        offWorldSeed,
        faParams,
        // 🔴 **팀별 예산** — 총연봉이 넘으면 방출한다 (사용자 확정 2026-08-31).
        //   저장된 예산(전년 정산 · `clubFinance`)이 있으면 그게 우선이고,
        //   없으면 `refs.json` 의 팀별 예산을 만원으로 바꿔 쓴다.
        // ⚠ 안 넘기면 예산 방출이 통째로 꺼진다 — `serde(default)` 라 오류가 안 난다.
        (() => {
          const out: Record<string, number> = {};
          for (const t of get(masterStore).teams) {
            const saved = s.clubBudgets?.[t.id];
            const base = saved != null ? saved
              : ((t as unknown as { history?: { budget?: number } }).history?.budget ?? 0) / 10000;
            if (base > 0) out[t.id] = Math.round(base);
          }
          return out;
        })(),
      );
      // 이 배열은 아래 시즌종료 처리들이 인덱스로 직접 덮어쓴다 (careerHistory·병역·드래프트).
      // 예전엔 여기서 감정 9축의 dormant 감쇠·은퇴 archive도 했는데, 6C에서
      // 관계도로 대체했다 — 감쇠는 slot.db relationship에서 시즌 단위로 돈다.
      const nextNpcs = [...result.npcs];

      // 프로·독립리그 NPC 시즌 careerHistory 엔트리 추가 (_getSeasonData 통해 순환 의존 없이 접근)
      {
        const seasonData = _getSeasonData?.();
        if (seasonData) {
          // ⚠ **2군(LEAGUE_KBL_FARM)이 빠져 있었다.** 고교·대학은 Rust 학년
          // 진급이 연도 기록을 남기고 프로·독립은 여기서 남기는데, 2군만
          // 아무도 안 써서 **그 해가 통째로 비었다** — 궤적을 따라가면
          // 프로 선수의 특정 연도가 없어진 채로 보인다.
          const proIndLeagues = new Set([
            "LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_INDEPENDENT",
          ]);
          const npcPreState = new Map(
            s.npcs
              .filter(n => proIndLeagues.has(n.currentLeague ?? ""))
              .map(n => [n.npcId, { league: n.currentLeague, team: n.currentTeam }]),
          );
          const buildStatLine = (stat: PlayerSeasonStats): string => {
            if (stat.type === "pitcher") return `${stat.w}승 ${stat.l}패 ERA ${stat.era.toFixed(2)}`;
            return `타율 .${Math.round(stat.avg * 1000).toString().padStart(3, "0")} ${stat.hr}홈런 ${stat.rbi}타점`;
          };
          for (let i = 0; i < nextNpcs.length; i++) {
            const npc = nextNpcs[i];
            const pre = npcPreState.get(npc.npcId);
            if (!pre) continue;
            if (npc.careerHistory.some(h => h.year === seasonYear)) continue;
            const npcStat = seasonData.leagueState[pre.league]?.stats?.[npc.npcId];
            const entry: NpcCareerEntry = {
              year:       seasonYear,
              leagueId:   pre.league,
              teamId:     pre.team,
              statLine:   npcStat ? buildStatLine(npcStat) : "-",
              highlights: [],
            };
            nextNpcs[i] = { ...npc, careerHistory: [...npc.careerHistory, entry] };
          }
        }
      }

      const slotId = s.currentSlotId;
      const _t0SeasonEnd = Date.now();
      const _faEntries: PlayerEventEntry[] = [];
      const _liveStats = get(npcLiveStatsStore);

      if (slotId) {
        // FA 재배치 기록: 오프시즌 처리 후 팀이 바뀐 FA 자격 선수
        const faRows: import("../types/save").LeagueTransactionRow[] = [];
        for (const n of result.npcs) {
          const prev = beforeTeam.get(n.npcId);
          if (prev && prev !== n.currentTeam && proLeagues.has(n.currentLeague) && n.careerStatus === "active") {
            const _live = _liveStats[n.npcId];
            const ovr = _live?.pitching?.ovr ?? _live?.batting?.ovr ?? 0;
            const prevShort = prev.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
            const nextShort = n.currentTeam.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
            autoLog(`  [FA이동] ${n.name} | ${prevShort}→${nextShort} | OVR:${ovr} | ${n.currentLeague.replace("LEAGUE_", "")}`);
            _faEntries.push({
              npcId: n.npcId, name: n.name,
              fromTeamId: prev, toTeamId: n.currentTeam,
              fromLeagueId: n.currentLeague, toLeagueId: n.currentLeague,
              detail: `OVR:${ovr} | 서비스:${n.proServiceYears ?? 0}년`,
            });
            faRows.push({
              seasonYear,
              category: "fa",
              playerId: n.npcId,
              playerName: n.name,
              fromTeamId: prev,
              fromLeagueId: n.currentLeague,
              toTeamId: n.currentTeam,
              toLeagueId: n.currentLeague,
              detail: "FA 계약",
            });
          }
        }
        let _faDbOk = true;
        if (faRows.length > 0) {
          const faRes = JSON.parse(
            await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: faRows }))
          );
          if (faRes.error) { autoLog(`[NPC FA오류] ${faRes.error}`); _faDbOk = false; }
          else autoLog(`[NPC FA] FA 이동 ${faRows.length}명 DB ✓`);
        }
        if (_faEntries.length > 0) {
          logEvent({
            id: `fa-result-Y${seasonYear}`,
            type: "fa_result",
            seasonYear,
            players: _faEntries,
            counts: { input: beforeTeam.size, processed: _faEntries.length, saved: faRows.length },
            dbOk: _faDbOk,
            durationMs: Date.now() - _t0SeasonEnd,
          });
        }
      }

      // before/after 비교로 전역·입대 추출 및 careerEvents 기록
      const militaryEnlistedSports: string[] = [];
      const militaryEnlistedGeneral: string[] = [];
      const militaryDischargedNames: string[] = [];
      // 🔴 **전역의 정본은 Rust다** (사용자 확정 2026-08-24).
      //    엔진이 `military_discharge_year <= season_year`로 상태를 바꾸고,
      //    여기서는 그 **변화를 감지해 기록만** 남긴다.
      //    예전엔 아래에서 TS가 `enlistYear + 2`로 **따로 계산**해서,
      //    두 조건이 갈려 전역자가 43명이 됐다(상무 정원은 26).
      const rustDischargedIds = new Set<string>();
      const dischargeRows: import("../types/save").LeagueTransactionRow[] = [];
      const _dischargeEntries: PlayerEventEntry[] = [];
      for (const n of result.npcs) {
        const before = beforeMilitary.get(n.npcId);
        if (!before) continue;
        const decIdx = nextNpcs.findIndex(d => d.npcId === n.npcId);
        if (before.status === "현역" && n.militaryStatus !== "현역") {
          militaryDischargedNames.push(before.name);
          rustDischargedIds.add(n.npcId);
          const returnLeague = proLeagues.has(n.currentLeague) ? n.currentLeague : undefined;
          const _liveDis = _liveStats[n.npcId];
          const ovr = _liveDis?.pitching?.ovr ?? _liveDis?.batting?.ovr ?? 0;
          autoLog(`  [전역] ${before.name} | 군→${returnLeague?.replace("LEAGUE_", "") ?? "미확정"} | OVR:${ovr}`);
          _dischargeEntries.push({
            npcId: n.npcId, name: n.name,
            fromLeagueId: before.league,
            toLeagueId: returnLeague,
            toTeamId: n.currentTeam,
            detail: `군→${returnLeague?.replace("LEAGUE_", "") ?? "미확정"} | OVR:${ovr}`,
          });
          dischargeRows.push({
            seasonYear,
            category: "military",
            playerId: n.npcId,
            playerName: n.name,
            fromLeagueId: before.league,
            toLeagueId: returnLeague,
            detail: "전역",
          });
          if (decIdx >= 0) {
            nextNpcs[decIdx] = {
              ...nextNpcs[decIdx],
              careerEvents: [
                ...(nextNpcs[decIdx].careerEvents ?? []),
                { year: seasonYear, eventType: "military_discharge" as const,
                  toLeagueId: returnLeague },
              ],
            };
          }
        } else if (before.status !== "현역" && n.militaryStatus === "현역") {
          if (decIdx >= 0) {
            nextNpcs[decIdx] = {
              ...nextNpcs[decIdx],
              careerEvents: [
                ...(nextNpcs[decIdx].careerEvents ?? []),
                { year: seasonYear, eventType: "military_enlist" as const,
                  fromTeamId: before.team, fromLeagueId: before.league },
              ],
            };
          }
        }
      }
      let _dischargeDbOk = true;
      if (slotId && dischargeRows.length > 0) {
        const milRes = JSON.parse(
          await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: dischargeRows }))
        );
        if (milRes.error) { autoLog(`[NPC전역오류] ${milRes.error}`); _dischargeDbOk = false; }
        else autoLog(`[NPC전역] ${dischargeRows.length}명 DB ✓`);
      }
      if (_dischargeEntries.length > 0) {
        logEvent({
          id: `discharge-Y${seasonYear}`,
          type: "discharge",
          seasonYear,
          players: _dischargeEntries,
          counts: { input: beforeMilitary.size, processed: _dischargeEntries.length, saved: dischargeRows.length },
          dbOk: _dischargeDbOk,
          durationMs: Date.now() - _t0SeasonEnd,
        });
      }

      // ── Phase 4: 병역 통합 처리 (단일 소스: masterStore.entities) ─────────────
      if (slotId) {
        const mNow = get(masterStore);
        const npcMap = new Map(nextNpcs.map(n => [n.npcId, n]));
        const npcLiveStats = get(npcLiveStatsStore);

        // Phase 4-0: 외국인 선수 면제 일괄 패치
        // 국적 기반 판별: originLeagueId ABL/JBL이면 외국인, notes에 "국적:한국"이면 한국인
        const isKoreanEntity = (e: import("./master").EntityRow): boolean => {
          if (e.notes?.includes("국적:한국")) return true;
          const orig = e.originLeagueId;
          if (orig === "LEAGUE_ABL" || orig === "LEAGUE_JBL") return false;
          return true;
        };
        const foreignExempt = mNow.entities.filter(e =>
          e.role === "player" &&
          !isKoreanEntity(e) &&
          e.militaryStatus !== "면제" &&
          e.militaryStatus !== "군필" &&
          e.militaryStatus !== "현역"
        );
        if (foreignExempt.length > 0) {
          const exemptedIdSet = new Set(foreignExempt.map(e => e.id));
          for (let i = 0; i < nextNpcs.length; i++) {
            if (exemptedIdSet.has(nextNpcs[i].npcId) && nextNpcs[i].militaryStatus === "미필") {
              nextNpcs[i] = { ...nextNpcs[i], militaryStatus: "면제" };
            }
          }
          autoLog(`[외국인면제] ${foreignExempt.length}명 면제 처리`);
        }

        // 1. 전역: 2년 경과 모든 현역 선수 (top-level || 하위 호환 nested 체크)
        // ⚠ **위에서 Rust가 이미 전역시킨 사람만 본다.**
        //   예전엔 `enlistYear + 2`로 여기서 다시 계산했고, 그 조건이 Rust와
        //   갈려 **같은 사람이 해마다 다시 전역자로 잡혔다**(43명 · 정원 26).
        //   그 수가 상무 선발 Phase 1의 공백 목록으로 가서, 정원을 다 먹고
        //   **Phase 2(OVR 순)가 안 돌게** 만들었다.
        const discharging = mNow.entities.filter(e => rustDischargedIds.has(e.id));
        const dischargedIds = new Set<string>();

        // ⚠ 거래 기록은 **위에서 `dischargeRows`로 이미 남겼다** — 여기서 또 남기면
        //   같은 전역이 두 번 쌓인다. 이 집합은 입대 후보 제외·공백 포지션에만 쓴다.
        discharging.forEach(e => dischargedIds.add(e.id));
        if (discharging.length > 0) autoLog(`[전역] 엔티티 ${discharging.length}명`);

        // 2. 체육부대 입대: 프로 소속 한국인 선수 후보.
        //
        // **2군(FARM)도 후보다.** 예전엔 1군 리그만 봤는데, 실제로 상무는
        // 2군 유망주가 많이 간다. Phase 7-1에서 신인 대부분이 2군에서 시작하게
        // 되면서 그 누락이 더 커졌다 — 갓 지명된 선수는 후보조차 못 됐다
        const proLeagues = new Set([
          "LEAGUE_KBL", "LEAGUE_KBL_FARM",
          "LEAGUE_ABL", "LEAGUE_ABL_FARM",
          "LEAGUE_JBL", "LEAGUE_JBL_FARM",
        ]);
        const milCandidates = mNow.entities.filter(e =>
          e.role === "player" &&
          e.status !== "retired" &&
          e.militaryStatus !== "현역" && e.militaryStatus !== "군필" && e.militaryStatus !== "면제" &&
          e.details?.player?.militaryStatus !== "현역" &&
          !e.details?.player?.militaryEnlistYear &&
          proLeagues.has(e.leagueId ?? "") &&
          isKoreanEntity(e) &&
          e.teamId && e.teamId !== "" &&
          !dischargedIds.has(e.id) &&
          // 한국 나이 기준 고졸 20세부터 (generation_rules.json ageBase 16 → 고3 = 19세).
          // 예전엔 18이었는데 그건 고3 나이라 재학생이 후보에 섞였다.
          e.age >= 20 && e.age <= 29
        ).map(e => {
          const live = npcLiveStats[e.id];
          const dp = e.details?.player;
          const rawOvr = live?.pitching?.ovr ?? live?.batting?.ovr ?? (dp as any)?.pitching?.ovr ?? (dp as any)?.batting?.ovr;
          const ovr = Math.round((typeof rawOvr === "number" && isFinite(rawOvr)) ? rawOvr : 50);
          return { id: e.id, name: e.name || e.id, ovr, teamId: e.teamId!, position: (dp?.position ?? "") as string, isProtagonist: false };
        });
        autoLog(`[병역통합] 체육부대 후보 ${milCandidates.length}명`);

        const selectedSportsIds = new Set<string>();

        if (milCandidates.length > 0) {
          const topRaw = JSON.parse(
            await window.projectB!.militaryCalcCandidates(JSON.stringify({
              candidates: milCandidates,
              topN: 70,
            }))
          ) as { topCandidates?: { id: string; name: string; ovr: number; teamId: string }[]; error?: string };

          if (topRaw.error) {
            autoLog(`[병역통합오류] militaryCalcCandidates: ${topRaw.error}`);
          } else if ((topRaw.topCandidates?.length ?? 0) > 0) {
            // 연간 입대 인원 = 정원 / 복무연수. 예전엔 여기 20이 박혀 있어
            // 정상상태가 40명(정원 26의 1.5배)이었다 — 상무는 복무자라
            // `career_status: "military"`고, 로스터 캡이 active만 세므로
            // **아무도 막지 않았다.** 규칙 파일이 정본이다.
            //
            // ⚠ 계산을 여기서 다시 적지 않는다 — 주인공 경로(`advanceWeek`)와
            // **같은 함수**를 쓴다. 따로 적었더니 그쪽만 10으로 박혀 있었다.
            const milLimits = await sportsUnitLimits();
            const milSalary = milLimits.salary;
            // ⚠ **주인공이 뽑힌 해엔 한 자리를 뺀다.** 두 선발이 별개 추첨이라
            // 둘 다 뽑히면 그 해 입대가 정원 + 1이 된다 — 상무는 로스터 캡이
            // 안 걸리니 이런 누수가 해마다 쌓인다.
            const protoTook = protagonistTookSportsSlot(get({ subscribe }).protagonist, seasonYear);
            const npcIntake = Math.max(0, milLimits.annualIntake - (protoTook ? 1 : 0));

            const selRes = npcIntake === 0 ? { selectedIds: [] } : JSON.parse(
              await window.projectB!.militaryCalcSelection(JSON.stringify({
                applicants: topRaw.topCandidates!.map(c => ({ ...c, isProtagonist: false })),
                maxTotal: Math.min(npcIntake, topRaw.topCandidates!.length),
                maxPerTeam: milLimits.maxPerTeam,
                // 🔴 **상무 전역자 포지션만.** 안 넘기면 Phase 1(공백 메우기)이
                //    통째로 안 돌고 OVR 순으로만 뽑는다 — 상무가 포지션 균형을 잃는다.
                //
                // ⚠ **거르는 규칙은 `sportsVacatingPositions`가 정본이다.**
                //   여기 인라인으로 적었더니 주인공 경로(`advanceWeek`)에는
                //   아예 안 넘어가서 **주인공만 다른 잣대**로 뽑혔다.
                vacatingPositions: sportsVacatingPositions(discharging),
                // 🔴 **Phase 1 몫을 자른다.** 없으면 Phase 1이 정원을 다 먹고
                //    Phase 2(OVR 순 + 팀당 상한)가 한 번도 안 돈다.
                phase1Max: milLimits.phase1Max,
              }))
            ) as { protagonistSelected?: boolean; selectedIds?: string[]; error?: string };

            if (selRes.error) {
              autoLog(`[병역통합오류] militaryCalcSelection: ${selRes.error}`);
            } else if ((selRes.selectedIds?.length ?? 0) > 0) {
              const selectedSet = new Set(selRes.selectedIds!);
              const enlTxRows: import("../types/save").LeagueTransactionRow[] = [];

              const sportsEnlistEntities = mNow.entities
                .filter(e => selectedSet.has(e.id))
                .map(e => ({
                  ...e,
                  militaryStatus: "현역" as const,
                  // 상무는 **독립리그 소속**이고 ID는 refs의 실제 팀이다.
                  // 예전엔 LEAGUE_UNIVERSITY / TEAM_SPORTS_UNIT 이었는데
                  // 그 팀은 refs에 없어서 입대자가 존재하지 않는 팀으로 갔다
                  leagueId: SANGMU_LEAGUE_ID,
                  teamId:   SANGMU_TEAM_ID,
                  details: { ...e.details, player: {
                    ...e.details?.player,
                    militaryStatus:     "현역",
                    militaryUnit:       "sports",
                    militaryEnlistYear: seasonYear,
                    originalLeagueId:   e.leagueId,
                    originalTeamId:     e.teamId,
                  }},
                  slotId,
                }));

              const _sportsEntries: PlayerEventEntry[] = [];

              if (sportsEnlistEntities.length > 0) {
                sportsEnlistEntities.forEach(e => {
                  selectedSportsIds.add(e.id);
                  militaryEnlistedSports.push(e.name);
                  const orig = mNow.entities.find(o => o.id === e.id)!;
                  const live = npcLiveStats[e.id];
                  const dp = e.details?.player;
                  const rawOvr = live?.pitching?.ovr ?? live?.batting?.ovr ?? (dp as any)?.pitching?.ovr ?? (dp as any)?.batting?.ovr;
                  const ovr = Math.round((typeof rawOvr === "number" && isFinite(rawOvr)) ? rawOvr : 50);
                  const fromShort = (orig.teamId ?? "").replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
                  autoLog(`  [체육부대] ${e.name} | ${fromShort} | OVR:${ovr} | ${e.age ?? "?"}세`);
                  _sportsEntries.push({
                    npcId: e.id, name: e.name,
                    fromTeamId: orig.teamId, fromLeagueId: orig.leagueId,
                    toLeagueId: "LEAGUE_UNIVERSITY",
                    detail: `OVR:${ovr} | ${e.age ?? "?"}세 | 제대예정 Y${seasonYear + 2}`,
                  });
                  enlTxRows.push({
                    seasonYear, category: "military" as const,
                    playerId: e.id, playerName: e.name,
                    fromTeamId: orig.teamId, fromLeagueId: orig.leagueId,
                    detail: "체육부대 입대",
                  });
                });
              }

              // gameStore.npcs 동기화
              for (let i = 0; i < nextNpcs.length; i++) {
                if (!selectedSet.has(nextNpcs[i].npcId)) continue;
                  // 🔴 **세이브가 이미 은퇴면 입대시키지 않는다.**
                  //    후보는 마스터 `e.status`로 거르는데 `originalLeagueId`는
                  //    세이브 `n.currentLeague`에서 온다 — 둘이 어긋나면
                  //    **`LEAGUE_RETIRED`가 원소속으로 박히고**, 2년 뒤 전역할 때
                  //    FA로 나와 갈 팀이 없어 **100% 미계약**이 된다.
                  //    실측(2026-08-26): 전역 시즌마다 3~8명 · 전원이 전역자였다.
                if (nextNpcs[i].careerStatus !== "active"
                    || nextNpcs[i].currentLeague === "LEAGUE_RETIRED") continue;
                const n = nextNpcs[i];
                nextNpcs[i] = {
                  ...n,
                  originalLeagueId:      n.currentLeague,
                  originalTeamId:        n.currentTeam,
                  careerStatus:          "military",
                  militaryStatus:        "현역",
                  militaryUnit:          "sports",
                  militaryEnlistYear:    seasonYear,
                  militaryDischargeYear: seasonYear + 2,
                  // ⚠ 바로 위 entity 갱신은 `SANGMU_LEAGUE_ID`를 쓰는데 여기만
                  // `"LEAGUE_UNIVERSITY"` 하드코딩이 남아 있었다 — 같은 선수의
                  // 리그가 두 곳에서 달라져 팀(독립)과 어긋났다.
                  // 2362줄 주석이 고쳤다고 적은 그 결함이 여기 그대로 있었다.
                  currentLeague:         SANGMU_LEAGUE_ID,
                  currentTeam:           SANGMU_TEAM_ID,
                  // 🔴 **군인 봉급이다** (2026-08-31). 예전엔 원 소속 연봉을
                  //   그대로 들고 왔다 — 실측에서 상무 최고연봉이 **9.97억**
                  //   이었고 상위 6명이 전부 상무였다. 연봉 10억짜리 군인이다.
                  //   `militaryRules.salary`(300만원)는 **생성된 26명에게만**
                  //   걸리고 선발로 들어온 사람은 안 걸렸다.
                  // ⚠ 전역할 때는 **새 계약**이다 — 원 소속 리그 기준으로
                  //   엔진이 다시 잡는다(`npc_sim` 전역 처리). 새 세이브 칸을 안 만든다.
                  currentSalary:         milSalary,
                };
              }

              let _sportsDbOk = true;
              if (enlTxRows.length > 0) {
                const enlTxRes = JSON.parse(
                  await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: enlTxRows }))
                ) as { ok?: boolean; error?: string };
                if (enlTxRes.error) { autoLog(`[병역입대오류] TX 저장 실패: ${enlTxRes.error}`); _sportsDbOk = false; }
                else autoLog(`[체육부대입대] ${sportsEnlistEntities.length}명 DB ✓`);
              }
              if (_sportsEntries.length > 0) {
                logEvent({
                  id: `enlist-sports-Y${seasonYear}`,
                  type: "enlist_sports",
                  seasonYear,
                  players: _sportsEntries,
                  counts: { input: milCandidates.length, processed: _sportsEntries.length, saved: enlTxRows.length },
                  dbOk: _sportsDbOk,
                  durationMs: Date.now() - _t0SeasonEnd,
                  extra: `후보풀 ${milCandidates.length}명 중 TOP70 → ${_sportsEntries.length}명 선발`,
                });
              }
            }
          }
        }

        // 3. 일반병 강제 입대
        const candidateIdSet = new Set(milCandidates.map(c => c.id));
        const mGeneral = get(masterStore);

        // 공통 입대 자격 조건
        const isEnlistEligible = (e: import("./master").EntityRow) =>
          e.role === "player" &&
          e.status !== "retired" &&
          isKoreanEntity(e) &&
          e.militaryStatus !== "현역" && e.militaryStatus !== "군필" && e.militaryStatus !== "면제" &&
          e.details?.player?.militaryStatus !== "현역" &&
          !e.details?.player?.militaryEnlistYear &&
          !dischargedIds.has(e.id) &&
          !selectedSportsIds.has(e.id);

        // 프로리그(KBL/ABL/JBL): 28세+ 또는 체육부대 탈락 27세
        const generalPoolPro = mGeneral.entities.filter(e =>
          isEnlistEligible(e) &&
          proLeagues.has(e.leagueId ?? "") &&
          (e.age >= 28 || (e.age === 27 && candidateIdSet.has(e.id)))
        );

        // 독립/대학리그: 26세+ (프로 입단 가능성 낮아지기 전에 처리)
        const nonProMilLeagues = new Set(["LEAGUE_INDEPENDENT", "LEAGUE_UNIVERSITY"]);
        const generalPoolNonPro = mGeneral.entities.filter(e =>
          isEnlistEligible(e) &&
          nonProMilLeagues.has(e.leagueId ?? "") &&
          e.age >= 26
        );

        // KBL 조기 입대 자발적 선택 (25~27세, 주전 경쟁 탈락 선수)
        const earlyEnlistPool = mGeneral.entities.filter(e =>
          isEnlistEligible(e) &&
          e.leagueId === "LEAGUE_KBL" &&
          (e.age ?? 0) >= 25 && (e.age ?? 0) <= 27
        );
        const earlyEnlistEntities = await (async () => {
          if (earlyEnlistPool.length === 0) return [];
          // KBL 전체 OVR 정렬 → 상대 순위 계산
          const kblOvrs = mGeneral.entities
            .filter(e2 => e2.leagueId === "LEAGUE_KBL" && e2.role === "player")
            .map(e2 => {
              const ls = npcLiveStats[e2.id];
              return ls?.pitching?.ovr ?? ls?.batting?.ovr
                ?? (e2.details?.player as any)?.pitching?.ovr
                ?? (e2.details?.player as any)?.batting?.ovr ?? 50;
            })
            .sort((a, b) => a - b);
          const res = JSON.parse(
            await window.projectB!.militaryEarlyEnlistDecisions(JSON.stringify({
              candidates: earlyEnlistPool.map(e => {
                const ls = npcLiveStats[e.id];
                const ovr = ls?.pitching?.ovr ?? ls?.batting?.ovr
                  ?? (e.details?.player as any)?.pitching?.ovr
                  ?? (e.details?.player as any)?.batting?.ovr ?? 50;
                const idx = kblOvrs.findIndex(v => v >= ovr);
                const ovrRankPct = kblOvrs.length > 0 ? (idx < 0 ? 1 : idx / kblOvrs.length) : 0.5;
                const dp = e.details?.player as any;
                return {
                  id: e.id,
                  age: e.age ?? 26,
                  ovrRankPct,
                  playingTimePct: 0.5,
                  contractYearsLeft: dp?.contract?.remainingYears ?? 2,
                };
              }),
              seed: seasonYear + 100,
            }))
          ) as { earlyEnlistIds?: string[]; error?: string };
          if (res.error || !res.earlyEnlistIds) return [];
          const earlySet = new Set(res.earlyEnlistIds);
          return earlyEnlistPool.filter(e => earlySet.has(e.id));
        })();
        if (earlyEnlistEntities.length > 0)
          autoLog(`[조기입대] KBL 25~27세 후보 ${earlyEnlistPool.length}명 → 자발적 선택 ${earlyEnlistEntities.length}명`);

        const generalPool = [...generalPoolPro, ...generalPoolNonPro, ...earlyEnlistEntities];
        autoLog(`[일반병후보] 강제28세+ ${generalPoolPro.length}명 + 독립/대학26세+ ${generalPoolNonPro.length}명 + 조기입대 ${earlyEnlistEntities.length}명 = ${generalPool.length}명`);

        // Rust LCG로 최대 30명 랜덤 선택
        const generalEnlistEntities = await (async () => {
          if (generalPool.length === 0) return [];
          if (generalPool.length <= 30) return generalPool;
          const pickRes = JSON.parse(
            await window.projectB!.militaryPickGeneral(JSON.stringify({
              ids: generalPool.map(e => e.id),
              maxCount: 30,
              seed: seasonYear,
            }))
          ) as { selectedIds?: string[]; error?: string };
          if (pickRes.error || !pickRes.selectedIds) return generalPool.slice(0, 30);
          const pickedSet = new Set(pickRes.selectedIds);
          return generalPool.filter(e => pickedSet.has(e.id));
        })();

        if (generalEnlistEntities.length > 0) {
          const _generalEntries: PlayerEventEntry[] = [];
          const genTxRows = generalEnlistEntities.map(e => ({
            seasonYear, category: "military" as const,
            playerId: e.id, playerName: e.name,
            fromTeamId: e.teamId, fromLeagueId: e.leagueId,
            detail: "일반병 입대",
          }));
          let _generalDbOk = true;
          const genTxRes = JSON.parse(
            await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: genTxRows }))
          ) as { ok?: boolean; error?: string };
          if (genTxRes.error) { autoLog(`[일반병입대오류] TX: ${genTxRes.error}`); _generalDbOk = false; }

          const genIdSet = new Set(generalEnlistEntities.map(e => e.id));
          generalEnlistEntities.forEach(e => {
            militaryEnlistedGeneral.push(e.name);
            const fromShort = (e.teamId ?? "").replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
            const live = npcLiveStats[e.id];
            const dp = e.details?.player;
            const rawOvr = live?.pitching?.ovr ?? live?.batting?.ovr ?? (dp as any)?.pitching?.ovr ?? (dp as any)?.batting?.ovr;
            const ovr = Math.round((typeof rawOvr === "number" && isFinite(rawOvr)) ? rawOvr : 50);
            autoLog(`  [일반병] ${e.name} | ${fromShort} | OVR:${ovr} | ${e.age ?? "?"}세`);
            _generalEntries.push({
              npcId: e.id, name: e.name,
              fromTeamId: e.teamId, fromLeagueId: e.leagueId,
              toLeagueId: "LEAGUE_MILITARY",
              detail: `OVR:${ovr} | ${e.age ?? "?"}세 | 제대예정 Y${seasonYear + 2}`,
            });
          });
          for (let i = 0; i < nextNpcs.length; i++) {
            if (!genIdSet.has(nextNpcs[i].npcId)) continue;
            // 🔴 **세이브가 이미 은퇴면 입대시키지 않는다.**
            //    후보는 마스터 `e.status`로 거르는데 `originalLeagueId`는
            //    세이브 `n.currentLeague`에서 온다 — 둘이 어긋나면
            //    **`LEAGUE_RETIRED`가 원소속으로 박히고**, 2년 뒤 전역할 때
            //    FA로 나와 갈 팀이 없어 **100% 미계약**이 된다.
            //    실측(2026-08-26): 전역 시즌마다 3~8명 · 전원이 전역자였다.
            if (nextNpcs[i].careerStatus !== "active"
                || nextNpcs[i].currentLeague === "LEAGUE_RETIRED") continue;
            const n = nextNpcs[i];
            nextNpcs[i] = {
              ...n,
              originalLeagueId:      n.currentLeague,
              originalTeamId:        n.currentTeam,
              careerStatus:          "military",
              militaryStatus:        "현역",
              militaryUnit:          "general",
              militaryEnlistYear:    seasonYear,
              militaryDischargeYear: seasonYear + 2,
              currentLeague:         "LEAGUE_MILITARY",
              currentTeam:           "",
            };
          }
          autoLog(`[일반병입대] ${generalEnlistEntities.length}명 (후보 ${generalPool.length}명 중) ${_generalDbOk ? "DB ✓" : "DB ✗"}`);
          if (_generalEntries.length > 0) {
            logEvent({
              id: `enlist-general-Y${seasonYear}`,
              type: "enlist_general",
              seasonYear,
              players: _generalEntries,
              counts: { input: generalPool.length, processed: _generalEntries.length, saved: _generalEntries.length },
              dbOk: _generalDbOk,
              durationMs: Date.now() - _t0SeasonEnd,
              extra: `후보 ${generalPool.length}명 중 ${_generalEntries.length}명 입대`,
            });
          }
        }
      }

      (window as any).__lastOffseasonSummary = {
        militaryEnlistedSports,
        militaryEnlistedGeneral,
        militaryDischargedNames,
      };

      logVerify(`Y${seasonYear} 시즌종료 오프시즌 완료 (${Date.now() - _t0SeasonEnd}ms)`, [
        { name: `FA이동 ${_faEntries.length}명`, ok: true },
        { name: `전역 ${_dischargeEntries.length}명`, ok: _dischargeDbOk },
        { name: `체육부대 ${militaryEnlistedSports.length}명`, ok: true },
        { name: `일반병 ${militaryEnlistedGeneral.length}명`, ok: true },
      ]);

      update((st) => ({
        ...st,
        npcs: nextNpcs,
        pendingDraft: result.pendingDraft,
        seasonEndSummary: result.summary,
        logs: [...result.logs, ...st.logs].slice(0, 30),
        mailbox: result.mailboxEntry
          ? pushMailbox([result.mailboxEntry], st.mailbox)
          : st.mailbox,
      }));

      // ── 스태프 생애주기 (Phase 6B) ─────────────────────────
      // 이 566줄과 얽히지 않는다 — 스태프는 병역·FA·드래프트에 의존하지 않으므로
      // usecases/seasonEnd/staffLifecycle.ts에서 독립적으로 처리하고 여기서 호출만 한다.
      try {
        const slotId = get({ subscribe }).currentSlotId;
        if (slotId) {
          const { processStaffSeasonEnd, describeStaffEvent } =
            await import("../usecases/seasonEnd/staffLifecycle");
          const { seasonStore } = await import("./season");
          const seasonNow = get(seasonStore);
          const r = await processStaffSeasonEnd(
            slotId, seasonYear, seasonNow.worldSeed ?? 0, seasonNow.staffSlumpSeasons ?? {},
          );
          seasonStore.setStaffSlumpSeasons(r.slumpSeasons);

          if (r.events.length > 0) {
            const teamName = (id: string) =>
              get(masterStore).teams.find((t) => t.id === id)?.name ?? id;
            const lines = r.events.map((e) => describeStaffEvent(e, teamName)).filter(Boolean);
            update((st) => ({
              ...st,
              logs: [...lines.slice(0, 8), ...st.logs].slice(0, 30),
            }));
          }
        }
      } catch (e) {
        // 스태프 처리가 실패해도 시즌 종료 자체는 끝나야 한다 — 여기서 던지면
        // 병역·FA까지 다 처리한 시즌이 통째로 롤백된다
        console.error("[processAllLeaguesSeasonEnd] 스태프 생애주기 실패", e);
      }

      // ── 관계도 시즌 총평 + 비접촉 감쇠 (Phase 6C) ──────────
      // 스태프 생애주기 **다음에** 돈다. 은퇴·경질로 사라진 사람을 ended로
      // 접은 뒤에 총평을 얹어야 이미 떠난 감독에게 시즌 평가가 붙지 않는다.
      try {
        const st = get({ subscribe });
        const slotId = st.currentSlotId;
        if (slotId) {
          const { applySeasonRelations, endRelationships } =
            await import("../usecases/relationships");
          const { seasonStore } = await import("./season");
          const seasonNow = get(seasonStore);

          // 사라진 상대를 먼저 동결한다 (값은 기록으로 남는다)
          const { slotRepo } = await import("../repo/slotRepo");
          const activeStaff = new Set(
            (await slotRepo.getStaff(slotId, { status: "active" })).map((x) => x.staffId),
          );
          const rows = await slotRepo.getRelationships(slotId);
          const gone = rows
            .filter((r) => r.contact !== "ended"
              && (r.kind === "manager" || r.kind === "coach" || r.kind === "owner")
              && !activeStaff.has(r.personId))
            .map((r) => r.personId);
          if (gone.length > 0) await endRelationships(slotId, gone);

          const myStats = seasonNow.stats[st.protagonist.id] as
            import("../types/save").PitcherSeasonStats | null ?? null;
          const standings = seasonNow.standings ?? [];
          const myIdx = standings.findIndex((x) => x.teamId === st.protagonist.teamId);
          // 순위를 못 찾으면 중간(0.5)으로 둔다 — 구단주 관계가 임의로 요동치는 것보다 낫다
          const rankPct = myIdx >= 0 && standings.length > 1
            ? myIdx / (standings.length - 1)
            : 0.5;

          await applySeasonRelations({
            slotId,
            week: 52,
            era: myStats?.era ?? 0,
            teamRankPct: rankPct,
            pitchedAny: (myStats?.ip ?? 0) > 0,
          });
        }
      } catch (e) {
        console.error("[processAllLeaguesSeasonEnd] 관계도 시즌 처리 실패", e);
      }
    },

    // 시즌 종료 후 주인공 에이징 감퇴 적용 (advanceSeasonYear 이전에 호출 — seasonHealth 기반)
    async applyAgingDecay() {
      const s = get({ subscribe });
      const p = s.protagonist;
      const sh = p.seasonHealth ?? { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 };
      const raw = JSON.parse(
        await window.projectB!.growthCalcProtagonistAging(JSON.stringify({
          age:               p.age,
          lowConditionWeeks: sh.lowConditionWeeks,
          highFatigueWeeks:  sh.highFatigueWeeks,
          injuryCount:       sh.injuryCount,
          totalWeeks:        sh.totalWeeks,
          pitching:          p.pitching,
          batting:           p.batting,
          playerType:        p.playerType,
        }))
      );
      if (raw.error) {
        autoLog(`[에이징오류] applyAgingDecay 실패: ${raw.error}`);
        return;
      }
      update((st) => {
        const updated: ProtagonistSave = { ...st.protagonist, pitching: raw.pitching, batting: raw.batting };
        return {
          ...st,
          protagonist: updated,
          player: toPlayerCompat(updated),
          logs: [...raw.logs, ...st.logs].slice(0, 30),
        };
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
    async processSeasonEnd(seasonYear: number) {
      const s = get({ subscribe });

      // ⚠ **한 해에 한 번만.** 세계 오프시즌(`runWorldSeasonEnd`)이 이걸 먼저
      // 돌려야 졸업생이 드래프트 풀에 들어가는데, 정상 롤오버도 따로 부른다.
      // 가드가 없으면 학년이 두 번 오르고 나이가 두 살 늘어난다.
      if (s.lastSeasonEndYear === seasonYear) {
        autoLog(`[시즌종료] Y${seasonYear}는 이미 진행됨 — 건너뛴다`);
        return;
      }

      // ① HS + 대학 전체 NPC 학년 진급 (나이 증가 없음)
      const { updated, hsGraduated, univGraduated } = await advanceAllGrades(s.npcs, seasonYear);
      autoLog(`[시즌종료] NPC 진급: 재학 ${updated.length}명, HS졸업 ${hsGraduated.length}명, 대학졸업 ${univGraduated.length}명`);

      // ② 전체 NPC 나이 +1 (단일 호출 — 졸업생 포함)
      const allNpcs = [...updated, ...hsGraduated, ...univGraduated];
      const agedNpcs = await advanceAllAges(allNpcs);
      const hsGradIds   = new Set(hsGraduated.map(n => n.npcId));
      const univGradIds = new Set(univGraduated.map(n => n.npcId));
      const agedUpdated      = agedNpcs.filter(n => !hsGradIds.has(n.npcId) && !univGradIds.has(n.npcId));
      const agedHsGraduated  = agedNpcs.filter(n => hsGradIds.has(n.npcId));
      const agedUnivGraduated = agedNpcs.filter(n => univGradIds.has(n.npcId));

      // ③ 주인공 학년 진급 (나이는 advanceSeasonYear에서)
      //
      // ⚠ **대학은 여기서 +1 하면 안 된다.** 대학 학년의 실제 계수기는
      // `schoolState.universityWeek`이고 매주 오른다. 진학은 시즌 도중(W47)에
      // 확정되므로, 그때 넣은 `grade: 1`을 시즌 종료에서 또 +1 하면
      // **첫 대학 시즌을 2학년으로 뛴다** (실측 — 1학년이 통째로 사라진다).
      // 고교는 계수기가 따로 없어 +1이 맞다.
      const proto = s.protagonist;
      let updatedProto: ProtagonistSave = proto;
      if (proto.careerStage === "university") {
        updatedProto = {
          ...proto,
          grade: universityGradeOf(undefined, s.schoolState.universityWeek) as 1 | 2 | 3 | 4,
        };
      } else if (proto.grade != null && proto.careerStage === "highschool") {
        updatedProto = { ...proto, ...advanceProtagonistGrade(proto.grade, proto.careerStage).patch };
      }

      update((st) => ({
        ...st,
        npcs: agedUpdated,
        protagonist: updatedProto,
        pendingDraft: [...st.pendingDraft, ...agedHsGraduated, ...agedUnivGraduated],
        lastSeasonEndYear: seasonYear,
      }));
    },

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
    addProtagonistAwards(seasonYear: number, awards: CareerAward[]) {
      if (awards.length === 0) return;
      update((s) => {
        const recs = s.protagonist.careerRecords ?? [];
        const i = recs.findIndex((r) => r.year === seasonYear);
        if (i < 0) return s;
        const next = [...recs];
        next[i] = { ...next[i], awards: [...(next[i].awards ?? []), ...awards] };
        return { ...s, protagonist: { ...s.protagonist, careerRecords: next } };
      });
    },

    addSeasonHighlights(seasonYear: number, byPlayer: Map<string, string[]>) {
      update((s) => ({
        ...s,
        npcs: s.npcs.map((n) => {
          const titles = byPlayer.get(n.npcId);
          if (!titles?.length) return n;
          const hist = n.careerHistory ?? [];
          const i = hist.findIndex((h) => h.year === seasonYear);
          if (i < 0) {
            return { ...n, careerHistory: [...hist, {
              year: seasonYear, leagueId: n.currentLeague, teamId: n.currentTeam,
              statLine: "-", highlights: [...titles],
            }] };
          }
          const next = [...hist];
          next[i] = { ...next[i], highlights: [...(next[i].highlights ?? []), ...titles] };
          return { ...n, careerHistory: next };
        }),
      }));
    },

    // L4: 시즌 종료 시 NPC careerHistory 기록
    applySeasonHistory(
      seasonStats: Record<string, PlayerSeasonStats>,
      leagueStats: Record<string, Record<string, PlayerSeasonStats>>,
      seasonYear: number,
    ) {
      update((s) => {
        const merged: Record<string, PlayerSeasonStats> = { ...seasonStats };
        for (const stats of Object.values(leagueStats)) {
          for (const [id, st] of Object.entries(stats)) {
            if (!merged[id]) merged[id] = st;
          }
        }
        const npcs = s.npcs.map((npc) => {
          if (npc.careerStatus !== "active") return npc;
          const stat = merged[npc.npcId];
          if (!stat) return npc;
          // 연도 기록은 Rust 학년 진급도 남긴다 — 방어가 없으면 고교생이
          // 같은 해에 두 줄이 된다 (실측으로 확인)
          if (npc.careerHistory.some(h => h.year === seasonYear)) return npc;
          const statLine = buildNpcStatLine(stat);
          const entry: NpcCareerEntry = {
            year:      seasonYear,
            leagueId:  npc.currentLeague,
            teamId:    npc.currentTeam,
            statLine,
            highlights: [],
            stats:     stat,
          };
          return { ...npc, careerHistory: [...npc.careerHistory, entry] };
        });
        return { ...s, npcs };
      });
    },

    appendCareerRecord(record: CareerSeasonRecord, seasonStats?: PlayerSeasonStats) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          careerRecords: [
            ...(s.protagonist.careerRecords ?? []),
            seasonStats ? { ...record, stats: seasonStats } : record,
          ],
        },
      }));
    },

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
    async processNpcDraft(
      year: number,
      universityTeamIds: string[],
      independentTeamIds: string[],
    ): Promise<{ picks: DraftPick[] } | null> {
      const _t0Draft = Date.now();
      const s = get({ subscribe });

      if (s.lastDraftYear === year) {
        autoLog(`[드래프트] Y${year}는 이미 진행됨 — 건너뛴다`);
        return null;
      }

      // 후보 풀은 졸업 예정자 + **소속을 유지한 신청자**(대학 재학·독립)다.
      // 예전엔 pendingDraft(졸업생)만 봐서 대학 저학년과 독립리그 선수는
      // 영원히 드래프트에 나올 수 없었다.
      const npcIdSet = new Set(s.npcs.map(n => n.npcId));
      const combined = [
        ...s.npcs,
        ...s.pendingDraft.filter(n => !npcIdSet.has(n.npcId)),
      ];

      const rulesFile = await loadRosterRules();
      const draftRules = rulesFile.draftRules;
      if (!draftRules) {
        autoLog(`[드래프트오류] generation_rules.json에 draftRules가 없다 — 드래프트를 건너뛴다`);
        return null;
      }

      // 지명 순서는 **전 시즌 성적 역순**이다. 예전엔 팀 목록을 아예 안 넘겨
      // 기본값(알파벳 순)으로 돌았다 — 매년 같은 팀이 1순위를 가져갔다
      // 정본은 `draftOrderOf` 하나다 — 주인공 지명도 같은 순서를 받아야
      // 순번과 팀이 맞는다(`determine_protagonist_draft` 주석 참고)
      const draftOrder = draftOrderOf(_getSeasonData?.()?.prevSeasonKblStandings ?? []);
      const teamIndex = Object.fromEntries(buildSalaryIndex(get(masterStore).teams));
      const univGradeMax = rulesFile.rosterRules["LEAGUE_UNIVERSITY"]?.gradeMax ?? 4;
      const hsGradeMax = rulesFile.rosterRules["LEAGUE_HIGHSCHOOL"]?.gradeMax ?? 3;
      const { candidates, counts } =
        await selectDraftCandidates(combined, draftRules, univGradeMax, hsGradeMax);
      if (candidates.length === 0) return null;

      const byId = new Map(combined.map(n => [n.npcId, n]));
      const candidateNpcs = candidates
        .map(c => byId.get(c.npcId))
        .filter((n): n is NpcSaveState => n !== undefined);
      const routeOf = new Map(candidates.map(c => [c.npcId, c.route]));

      autoLog(
        `[드래프트] Y${year} 후보 ${candidates.length}명 ` +
        `(고졸 ${counts[0]} · 대졸 ${counts[1]} · 대학재학 ${counts[2]} · 독립 ${counts[3]})`
      );
      // 지명 대상 풀 배수 — 보드에 싣는 수와 **같은 값**을 쓴다.
      // 다르면 "화면엔 220명인데 실제로는 1,682명에서 뽑는" 상태가 된다
      const poolMult = (draftRules as { boardCandidateMultiplier?: number }).boardCandidateMultiplier ?? 2;
      // 팀 사정 — **안 넘기면 구단이 뭐가 모자란지 모른 채 최고점만 뽑는다.**
      // 야수 10명인 팀도 최고점 투수가 남아 있으면 그 투수를 뽑았다.
      // 하한은 규칙 파일에서 유도한다(표를 새로 두지 않는다)
      const needBonus = (draftRules as { needBonus?: number }).needBonus ?? 0;
      const teamNeeds = needBonus > 0
        ? teamNeedsOf(get({ subscribe }).npcs, draftOrder, rulesFile.rosterRules)
        : {};
      const simResult = await runDraftSimulation(
        candidateNpcs, [], year, draftRules.rounds ?? DRAFT_ROUNDS, draftOrder, poolMult,
        // 🔴 **팀마다 다른 눈으로 보게 한다.** 안 넘기면 전 구단이 진짜
        //   능력을 정확히 알던 예전 동작이다 — `serde(default)` 라 조용하다.
        (() => {
          const sp = (rulesFile as unknown as { draftScoutingRules?: { span?: number } })
            .draftScoutingRules?.span ?? 0;
          if (sp <= 0) return undefined;
          const quality: Record<string, number> = {};
          for (const tid of KBL_TEAM_IDS) {
            // 성향은 스토어가 정본이다 — 없으면 50(기준)
            quality[tid] = get({ subscribe }).proTeamProfiles?.[tid]?.scoutingQuality ?? 50;
          }
          return { quality, span: sp };
        })(),
        needBonus > 0 ? { teamNeeds, needBonus, needSaturation: (draftRules as { needSaturation?: number }).needSaturation ?? 0 } : undefined,
      );

      // ── 주인공을 보드에 끼워 넣는다 ──────────────────────────
      //
      // ⚠ **주인공이 NPC 드래프트와 같은 판 위에 있지 않았다.** 지명 여부는
      // `determine_protagonist_draft`가 따로 정하고, 보드는 NPC 110명으로
      // 꽉 차 있었다. 화면은 주인공을 그 자리에 **끼워 넣기만** 했고
      // (`DraftBoardModal`) 누구도 밀려나지 않아서:
      //
      //   · 행이 111개가 되고 주인공이 뽑은 번호만 **두 줄**로 뜬다
      //   · 마지막 번호 자리는 빈다 (실측: 56 두 줄 · 111 없음)
      //   · 그 자리를 이미 가진 NPC도 그대로 지명 처리된다
      //
      // 실제 드래프트는 한 순번에 한 명이다. 주인공이 들어가면 **그 뒤가
      // 한 칸씩 밀리고 마지막 지명자 하나가 미지명이 된다.**
      const heroPick = s.schoolState.careerResults;
      let displacedNpcId: string | null = null;
      if (heroPick?.draftDrafted && heroPick.draftPick != null) {
        const at = Math.max(0, Math.min(simResult.picks.length, heroPick.draftPick - 1));
        // 밀려나는 사람 = 마지막 지명자. 이 사람은 미지명 경로를 타야 한다
        if (simResult.picks.length >= (draftRules.rounds ?? DRAFT_ROUNDS) * draftOrder.length) {
          displacedNpcId = simResult.picks[simResult.picks.length - 1]?.npcId ?? null;
          simResult.picks.pop();
        }
        simResult.picks.splice(at, 0, {
          round: heroPick.draftRound ?? 1,
          pick: heroPick.draftPick,
          teamId: heroPick.draftTeamId ?? draftOrder[0],
          npcId: s.protagonist.id,
        });
        // 번호를 다시 매긴다 — 끼워 넣은 뒤 자리가 한 칸씩 밀렸다
        const perRound = draftOrder.length;
        simResult.picks = simResult.picks.map((p, i) => ({
          ...p,
          pick: i + 1,
          round: Math.floor(i / perRound) + 1,
          teamId: draftOrder[i % perRound],
        }));
        // 주인공의 최종 순번·팀은 **보드가 정한 값**이다 — 산식이 낸 값과
        // 다를 수 있고(앞사람이 밀렸다), 화면·계약이 이걸 읽어야 맞는다
        const mine = simResult.picks.find((p) => p.npcId === s.protagonist.id);
        if (mine) {
          this.setCareerResults({
            ...heroPick,
            draftRound: mine.round, draftPick: mine.pick, draftTeamId: mine.teamId,
          });
          // 🔴 **지명을 주인공 경력에 남긴다** (2026-09-01 · 트랙 C 요청).
          //
          //   `addCareerEvent` 호출부 여섯 곳 어디에도 드래프트가 없었다.
          //   NPC 는 Rust `apply_draft` 가 `draft_picked` 를 남기는데
          //   **주인공만 안 남았다.** 그래서 엔딩 화면 "주요 사건" 절이
          //   졸업·트레이드·입대·전역·면제·은퇴는 다 보여주는데 **지명만
          //   비었다** — 커리어에서 제일 큰 사건이다.
          //
          // ⚠ **여기여야 한다.** 위에서 번호를 다시 매겼으므로 산식이 낸
          //   값과 최종 순번이 다를 수 있다(앞사람이 밀렸다). 화면·계약이
          //   읽는 값과 **같은 값**을 남긴다.
          // ⚠ `toLeagueId` 는 팀에서 끌어온다 — 드래프트 목적지가 KBL 1군만
          //   은 아니다(2군 지명이 있다). 못 찾으면 비운다.
          const draftTeam = get(masterStore).teams.find((t) => t.id === mine.teamId);
          this.addCareerEvent({
            year,
            eventType: "draft_picked",
            toTeamId: mine.teamId,
            toLeagueId: draftTeam?.leagueId ?? "",
            detail: `${mine.round}라운드 ${mine.pick}순위`,
          });
        }
        // ⚠ **밀려난 사람을 미지명 목록에 넣는다.** `apply_draft`는 `picks`에
        // 없으면 KBL로 안 옮기고, `undraftedIds`에도 없으면 진로 배정
        // (`Placer`)도 안 탄다 — 어디에도 안 속한 채 원 소속에 남는다.
        // 오류도 로그도 안 나는 종류라 검사로 잡는다
        if (displacedNpcId) {
          simResult.undraftedIds = [...simResult.undraftedIds, displacedNpcId];
          autoLog(`[드래프트] 주인공 편입으로 마지막 지명 1건이 미지명이 됐다`);
        }
      }

      // 픽별 상세 로그
      const npcInfoMap = new Map(candidateNpcs.map(n => [n.npcId, n]));
      const _draftEntries: PlayerEventEntry[] = [];
      const _liveForLog = get(npcLiveStatsStore);
      for (const pick of simResult.picks) {
        // ⚠ 주인공은 `npcs`에 없다 — 조회가 빗나가면 이름 자리에 `PLY_HERO`가
        // 찍히고 OVR이 0으로 남는다. 보드에 편입한 이상 같은 줄에 제대로 뜬다
        const isHero = pick.npcId === s.protagonist.id;
        const npc = npcInfoMap.get(pick.npcId);
        const ovr = isHero ? s.protagonist.pitching.ovr : (npc ? liveOvrOf(npc, _liveForLog) : 0);
        const pos = isHero ? "P" : (npc?.playerType === "pitcher" ? "P" : (npc?.position ?? "?"));
        const age = isHero ? (s.protagonist.age ?? 0) : (npc?.age ?? 0);
        const potential = isHero ? s.protagonist.developmentRate : (npc?.developmentRate ?? 0);
        const teamShort = pick.teamId.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
        const route = isHero ? DRAFT_ROUTE_LABELS.highschoolGraduate
          : DRAFT_ROUTE_LABELS[routeOf.get(pick.npcId) ?? "highschoolGraduate"];
        autoLog(`  ${pick.round}R-${pick.pick}: ${isHero ? s.protagonist.name : (npc?.name ?? pick.npcId)} (${route} OVR:${ovr} ${pos} ${age}세 잠재${potential}) → ${teamShort}`);
        _draftEntries.push({
          npcId: pick.npcId,
          name: isHero ? s.protagonist.name : (npc?.name ?? pick.npcId),
          toTeamId: pick.teamId,
          toLeagueId: "LEAGUE_KBL",
          detail: `${pick.round}라운드 ${pick.pick}순위 | ${route} OVR:${ovr} ${pos} ${age}세 잠재:${potential}`,
        });
      }
      autoLog(`[드래프트] 지명 ${simResult.picks.length}건 (미지명 ${candidates.length - simResult.picks.length}명)`);

      // ── 관전 보드용 후보 명단 ────────────────────────────────
      //
      // ⚠ 보드는 예전에 후보를 **지명 결과에서만** 만들어서 미지명이 항상
      // 0명이었다. 지명 수의 배수만큼 상위 후보를 남겨 "뽑히지 못한 사람"이
      // 화면에 보이게 한다. 정렬은 실제 지명 순서를 먼저 두고, 나머지는
      // OVR 내림차순이다 — 지명자가 상위에 몰리는 게 자연스럽다.
      {
        const mult = (draftRules as { boardCandidateMultiplier?: number }).boardCandidateMultiplier ?? 2;
        const want = Math.max(simResult.picks.length, Math.round(simResult.picks.length * mult));
        const pickedIds = new Set(simResult.picks.map((p) => p.npcId));
        // ⚠ **`??`가 아니라 `Math.max`다.** NPC는 투수·타자 블록을 둘 다 갖는다 —
        // `??`로 읽으면 타자의 낮은 `pitching.ovr`이 먼저 잡혀 실제 실력보다
        // 훨씬 낮게 나온다. 실측에서 지명 1순위가 OVR 53으로, 미지명 최하위(74)
        // 보다 낮게 찍혔다. 보드(`DraftBoardModal`)는 처음부터 max를 쓴다
        // ⚠ **live를 읽는다.** `npcs[].pitching`은 생성값이라 3년을 지나도 안 자란다 —
        // 그걸로 정렬하면 지명 순서가 **1학년 때 실력** 기준이 된다
        const _live = get(npcLiveStatsStore);
        const ovrOf = (n: NpcSaveState) => liveOvrOf(n, _live);
        const rest = candidateNpcs
          .filter((n) => !pickedIds.has(n.npcId))
          .sort((a, b) => ovrOf(b) - ovrOf(a));
        // ⚠ **주인공 자리를 비우지 않는다.** `npcInfoMap`엔 주인공이 없어서
        // `filter(!!n)`이 그 줄을 통째로 떨어뜨린다 — 보드 후보 명단에
        // 지명자가 한 명 모자라고, 그 자리를 화면이 따로 메우려다 픽번호가
        // 어긋난다. 주인공은 NPC 형태로 얹어 같은 표에 놓는다
        const heroRow = {
          npcId: s.protagonist.id,
          name: s.protagonist.name,
          playerType: "pitcher",
          position: s.protagonist.position ?? "SP",
          age: s.protagonist.age ?? 0,
          developmentRate: s.protagonist.developmentRate,
          currentTeam: s.protagonist.teamId ?? "",
          pitching: s.protagonist.pitching,
        } as unknown as NpcSaveState;
        const ordered = [
          ...simResult.picks.map((p) =>
            p.npcId === s.protagonist.id ? heroRow : npcInfoMap.get(p.npcId),
          ).filter((n): n is NpcSaveState => !!n),
          ...rest,
        ].slice(0, want);
        this.setCareerDraftCandidates(ordered.map((n) => ({
          playerId: n.npcId,
          playerName: n.name,
          // 주인공은 live 맵에 없다 — 생성값이 곧 현재값이라 그대로 쓴다
          ovr: Math.round(n.npcId === s.protagonist.id
            ? s.protagonist.pitching.ovr : ovrOf(n)),
          age: n.age ?? 0,
          potential: n.developmentRate ?? 0,
          position: n.playerType === "pitcher" ? "P" : (n.position ?? "?"),
          originTeamId: n.currentTeam ?? "",
          route: DRAFT_ROUTE_LABELS[routeOf.get(n.npcId) ?? "highschoolGraduate"],
        })));
        autoLog(`[드래프트] 보드 후보 ${ordered.length}명 (지명 ${simResult.picks.length} · 미지명 ${ordered.length - simResult.picks.length})`);
      }

      // ⚠ **2군 목록을 안 넘기면 미지명자가 갈 곳이 없다.** 오프시즌 경로는
      // 넘기는데 드래프트 경로만 빠져 있어서, `farmMax: 34`가 계산은 되고
      // 쓰이진 않았다 — 그만큼이 그대로 "야구를 그만둔다"로 갔다
      const draftDest = draftDestinationTeams(get(masterStore).teams);
      const updatedNpcs = await applyDraftToNpcs(
        combined, simResult, universityTeamIds, independentTeamIds,
        {
          contract: draftRules.contract,
          firstTeamRounds: draftRules.firstTeamRounds ?? 0,
          teamIndex,
          placement: placementRulesFrom(
            rulesFile.rosterRules,
            rulesFile.developmentPlayerRules?.salary,
            rulesFile.developmentPlayerRules?.intakeMax),
          farmTeamIds: draftDest.farmIds,
          // 독립리그로 가는 사람도 연봉을 받고 뛴다 — 안 넘기면 0으로 들어간다
          salaryRules: rulesFile.salaryRules,
        },
      );
      update(st => ({ ...st, npcs: updatedNpcs, pendingDraft: [], lastDraftYear: year }));

      // 지명 로그 — **관전 보드가 이걸 재생한다.** 예전엔 보드가 자기 후보 풀로
      // 따로 시뮬을 돌려서, 화면에서 본 지명과 실제 소속이 달랐다
      const pickLog: CareerDraftPickLogEntry[] = simResult.picks.map(pick => ({
        pickNo: pick.pick,
        round: pick.round,
        teamId: pick.teamId,
        playerId: pick.npcId,
        playerName: pick.npcId === s.protagonist.id
          ? s.protagonist.name : (npcInfoMap.get(pick.npcId)?.name ?? pick.npcId),
        // 화면이 이걸로 내 줄을 강조한다 — 예전엔 항상 false라 보드가
        // 주인공을 따로 끼워 넣어야 했고 그게 픽번호 중복의 시작이었다
        isUser: pick.npcId === s.protagonist.id,
        // 나이로는 경로를 못 가른다 — 드래프트 전에 나이가 이미 올라간다
        // (`CareerDraftPickLogEntry.route` 주석)
        route: DRAFT_ROUTE_LABELS[routeOf.get(pick.npcId) ?? "highschoolGraduate"],
      }));
      update(st => ({
        ...st,
        schoolState: { ...st.schoolState, careerDraftPickLog: pickLog },
      }));

      // NPC 드래프트 픽 거래 기록
      const slotId = s.currentSlotId;
      let _draftDbOk = true;
      if (slotId && simResult.picks.length > 0) {
        const rows = simResult.picks.map((pick) => {
          const before = npcInfoMap.get(pick.npcId);
          // 소속을 유지한 채 신청한 선수는 **떠나온 팀이 있다.** 그 팀을 안 적으면
          // 리그 기록에 "어디서 왔는지 없는 이적"으로 남는다
          const from = before && before.currentLeague !== "LEAGUE_DRAFT_POOL" ? before : null;
          return {
            seasonYear: year,
            category: "draft" as const,
            playerId: pick.npcId,
            playerName: before?.name ?? pick.npcId,
            fromTeamId: from?.currentTeam ?? null,
            fromLeagueId: from?.currentLeague ?? null,
            toTeamId: pick.teamId,
            toLeagueId: "LEAGUE_KBL",
            detail: `${pick.round}라운드 ${pick.pick}순위`,
            groupId: null,
          };
        });
        const draftRes = JSON.parse(
          await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows }))
        );
        if (draftRes.error) { autoLog(`[NPC드래프트오류] ${draftRes.error}`); _draftDbOk = false; }
        else autoLog(`[NPC드래프트] DB 저장 ${rows.length}건 ✓`);

      }

      logEvent({
        id: `draft-Y${year}`,
        type: "draft",
        seasonYear: year,
        players: _draftEntries,
        counts: { input: candidates.length, processed: simResult.picks.length, saved: simResult.picks.length },
        dbOk: _draftDbOk,
        durationMs: Date.now() - _t0Draft,
        extra: `미지명 ${candidates.length - simResult.picks.length}명 · 얼리신청 ${counts[2] + counts[3]}명`,
      });

      logVerify(`Y${year} 드래프트 완료`, [
        { name: `후보 ${candidates.length}명 → 지명 ${simResult.picks.length}건`, ok: simResult.picks.length > 0 },
        { name: `DB 저장`, ok: _draftDbOk },
        { name: `gameStore.npcs 반영`, ok: updatedNpcs.length >= s.npcs.length },
      ]);

      return { picks: simResult.picks };
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
