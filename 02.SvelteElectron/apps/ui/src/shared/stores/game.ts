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
  CareerSeasonRecord,
  InjuryState,
  NpcCareerEntry,
  NpcSaveState,
  PitchEntry,
  NpcEmotionRole,
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
  advanceHighSchoolGrades,
  advanceProtagonistGrade,
  initHighSchoolNpcs,
} from "../utils/gradeAdvance";
import {
  applyDraftToNpcs,
  determineProtagonistDraft,
  runDraftSimulation,
} from "../utils/draftSystem";
import type {
  DraftSimResult,
  HighSchoolMaster,
  NamedNpcMeta,
  ProtagonistDraftOutcome,
  SchoolScenario,
} from "../types/save";
import type { CoreGameState } from "../types/projectb.d";
import type { ProContract } from "../types/save";
import {
  KBL_FARM_MAP,
  runOffseasonProcessing,
} from "../utils/npcEngine";
import { getFaThreshold } from "../utils/faEngine";
import { masterStore } from "./master";
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
  pendingAchievements: string[];      // 미확인 신규 달성 (비저장)
  seasonEndSummary: SeasonEndSummary | null;  // 직전 시즌 종료 처리 요약 (비저장)
  lastTop10Pitcher: import("../types/save").Top10Snapshot | null;  // 직전 투수 TOP10 스냅샷
  lastTop10Batter:  import("../types/save").Top10Snapshot | null;  // 직전 타자 TOP10 스냅샷
  proTeamProfiles: Record<string, import("../stores/master").ProTeamProfile>;  // 런타임 팀 프로파일 (비저장)
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
    pitcherStats: { command: number; velocity: number; staminaCap: number; mentalResil: number };
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
const DEFAULT_PROTAGONIST: ProtagonistSave = {
  id: "PLY_HERO",
  name: "주인공 투수",
  careerStage: "highschool",
  leagueId: "LEAGUE_HIGHSCHOOL",
  teamId: "TEAM_HS_SEOUL_INNOVATION",
  schoolId: "SCHOOL_HS_SEOUL_INNOVATION",
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
  { id: "ACH_SOCIAL_FIRST_KAKAO", progress: 0, unlockedAt: null, claimedAt: null },
];

const DEFAULT_MAILBOX: MessageItem[] = [
  {
    id: "msg-000", category: "coach", sender: "투수 코치 오지경",
    subject: "불펜 추가 세션 제안",
    preview: "오늘 저녁 불펜 30구 추가 세션 진행 여부를 선택해 주세요.",
    body: "오늘 저녁 추가 불펜 세션(30구)을 제안합니다.\n\n선택에 따라 오늘 컨디션과 내일 훈련 효율이 달라집니다.\n- 훈련한다: 컨디션 -4, 커맨드 경험치 +1\n- 훈련하지 않는다: 컨디션 +2, 변화 없음",
    createdAt: "오늘 08:40", readAt: null,
    decision: {
      prompt: "추가 불펜 30구 세션을 진행하시겠습니까?",
      options: [
        { id: "do_train",   label: "훈련한다",       effectHint: "컨디션 -4, 커맨드 경험치 +1",
          effects: { conditionDelta: -4, xp: { command: 1 } } },
        { id: "skip_train", label: "훈련하지 않는다", effectHint: "컨디션 +2, 변화 없음",
          effects: { conditionDelta: 2 } },
      ],
      selectedOptionId: null,
    },
  },
  {
    id: "msg-001", category: "coach", sender: "투수 코치 오지경",
    subject: "릴리스 라인 체크 요청",
    preview: "오늘 불펜 세션 후 하체 슬라이드-릴리스 타이밍을 다시 맞춰 봅시다.",
    body: "오늘 불펜 세션에서 릴리스 라인이 3구간에서 조금 흔들렸습니다.\n\n하체 슬라이드 이후 상체가 먼저 열리는 구간만 줄이면 커맨드가 더 안정됩니다.",
    createdAt: "오늘 09:20", readAt: null,
  },
  {
    id: "msg-002", category: "manager", sender: "감독 임우현",
    subject: "주말 리그 선발 확정",
    preview: "토요일 1차전 선발로 준비하고 금요일은 투구 수를 제한합니다.",
    body: "토요일 주말 리그 1차전 선발로 확정되었습니다.\n\n금요일 최종 점검은 투구 수 25구 제한으로 진행해 주세요.",
    createdAt: "어제 18:05", readAt: null,
  },
  {
    id: "msg-003", category: "system", sender: "시스템",
    subject: "훈련 루틴 결과 반영",
    preview: "불펜 루틴 숙련도 상승에 따라 커맨드 +1이 반영되었습니다.",
    body: "훈련 루틴 분석 결과:\n- 불펜 루틴 숙련도 상승\n- 커맨드 +1 반영\n- 피로도 +2 반영",
    createdAt: "어제 13:42", readAt: "어제 14:01",
  },
];

// ── 헬퍼: ProtagonistSave → player 호환 객체 ──────────────────
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
const MONTH_STARTS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
const MONTH_NAMES = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "1월", "2월"];

export function computeWeekLabel(week: number, seasonYear: number = BASE_SEASON_YEAR): string {
  const w = (Math.max(1, week) - 1) % 52;
  let monthIdx = 0;
  for (let i = MONTH_STARTS.length - 1; i >= 0; i -= 1) {
    if (w >= MONTH_STARTS[i]) {
      monthIdx = i;
      break;
    }
  }
  const weekInMonth = w - MONTH_STARTS[monthIdx] + 1;
  return `${seasonYear}년 ${MONTH_NAMES[monthIdx]} ${weekInMonth}주차`;
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
    dayLabel:     computeWeekLabel(1, BASE_SEASON_YEAR),
    logs:         ["훈련 루틴 설정 완료", "코치 면담으로 제구 +1", "팀 분위기 안정"],
    upcoming:     ["화요일 불펜 세션", "금요일 체력장", "토요일 주말 리그 1차전"],
    player:       toPlayerCompat(p),
    school:       toSchoolCompat(p.careerStage, DEFAULT_SCHOOL),
  };
}

// ── 구버전 세이브 → 새 필드 기본값 채우기 ─────────────────────
function migrateProtagonist(p: ProtagonistSave & { learnedPitchIds?: string[] }): ProtagonistSave {
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
  const weighted =
    pitchingMerged.velocity    * 2.5 +
    pitchingMerged.command     * 2.5 +
    pitchingMerged.control     * 2.0 +
    pitchingMerged.movement    * 1.5 +
    pitchingMerged.stamina     * 1.5 +
    pitchingMerged.mentality   * 1.0 +
    pitchingMerged.recovery    * 0.5 +
    pitchingMerged.clutch      * 0.3 +
    pitchingMerged.holdRunners * 0.2;
  pitchingMerged.ovr = Math.round(weighted / 12.0);

  const battingMerged = {
    ...p.batting,
    baseInstinct: p.batting.baseInstinct ?? def.batting.baseInstinct,
    bunting:      p.batting.bunting      ?? def.batting.bunting,
    platoon:      p.batting.platoon      ?? def.batting.platoon,
  };
  const battingWeighted =
    battingMerged.contact       * 2.0 +
    battingMerged.power         * 1.8 +
    battingMerged.eye           * 1.5 +
    battingMerged.discipline    * 1.2 +
    battingMerged.speed         * 1.3 +
    battingMerged.baseInstinct  * 0.7 +
    battingMerged.bunting       * 0.3 +
    battingMerged.platoon       * 0.3 +
    battingMerged.fielding      * 1.3 +
    battingMerged.arm           * 0.8 +
    battingMerged.battingClutch * 0.6;
  battingMerged.ovr = Math.round(battingWeighted / 11.8);

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
  };
}

// ── SaveGame → 스토어 상태 변환 ───────────────────────────────
function fromSaveGame(saved: SaveGame): GameStoreState {
  const p = migrateProtagonist(saved.protagonist);
  const metrics = { ...DEFAULT_ACHIEVEMENT_METRICS, ...(saved.achievementMetrics ?? {}) };
  const achievements = saved.achievements ?? DEFAULT_ACHIEVEMENTS;
  return {
    currentSlotId: null,
    protagonist:  p,
    mailbox:      saved.mailbox,
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
    pendingAchievements: [],
    seasonEndSummary: null,
    lastTop10Pitcher: null,
    lastTop10Batter:  null,
    proTeamProfiles:  {},
    dayLabel:     computeWeekLabel(1, BASE_SEASON_YEAR),
    logs:         saved.recentLogs,
    upcoming:     saved.recentUpcoming,
    player:       toPlayerCompat(p),
    school:       toSchoolCompat(p.careerStage, saved.schoolState),
  };
}

// ── 메일함 정리: 최대 50건, 미결 선택지 메시지는 항상 보존 ────
const MAX_MAILBOX = 50;

function trimMailbox(mailbox: MessageItem[]): MessageItem[] {
  if (mailbox.length <= MAX_MAILBOX) return mailbox;

  const keepIds = new Set<string>();
  let slots = MAX_MAILBOX;

  // 미결 decision 메시지 우선 보존
  for (const m of mailbox) {
    if (m.decision && m.decision.selectedOptionId === null) {
      keepIds.add(m.id);
      slots--;
    }
  }

  // 남은 슬롯에 최신 메시지 채우기 (mailbox는 최신순)
  for (const m of mailbox) {
    if (slots <= 0) break;
    if (!keepIds.has(m.id)) {
      keepIds.add(m.id);
      slots--;
    }
  }

  return mailbox.filter((m) => keepIds.has(m.id));
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
    if (item.id === "ACH_SOCIAL_FIRST_KAKAO") {
      return item;
    }
    return item;
  });
}


// ── NPC 스탯라인 생성 헬퍼 ──────────────────────────────────────
function buildNpcStatLine(stat: PlayerSeasonStats): string {
  if (stat.type === "pitcher") {
    const ip  = stat.ip.toFixed(1);
    const era = stat.era.toFixed(2);
    return `${stat.w}승 ${stat.l}패 ERA ${era} ${ip}이닝 ${stat.k}K`;
  }
  const avg = stat.avg.toFixed(2).replace(/^0\./, ".");
  return `타율 ${avg} ${stat.hr}홈런 ${stat.rbi}타점 ${stat.ab}타수`;
}

// ── 스토어 생성 ───────────────────────────────────────────────
function createGameStore() {
  const { subscribe, update, set } = writable<GameStoreState>(buildInitialState());

  return {
    subscribe,

    // 앱 시작 시 save_game.json에서 복원 (레거시 — 슬롯 미사용 시 폴백)
    async load() {
      try {
        const raw = await window.projectB?.gameLoad?.();
        if (raw) set(fromSaveGame(migrateSaveGame(raw as unknown as Record<string, unknown>)));
      } catch (e) {
        console.warn("[gameStore] load failed, using defaults", e);
      }
    },

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
      );
    },

    // 활성 슬롯 ID 설정 (새 게임 시작 시 슬롯 선택 후 호출)
    setCurrentSlotId(slotId: string | null) {
      update((s) => ({ ...s, currentSlotId: slotId }));
    },

    // 저장: 슬롯 활성 시 saveSlot, 아니면 레거시 gameSave
    async save() {
      const s = get({ subscribe });
      const gameData = makeSaveGame(
        s.protagonist, s.mailbox, s.trainingPlan,
        s.schoolState, s.achievements, s.achievementMetrics, s.logs, s.upcoming,
        s.npcs, s.trainingPresets,
      );
      try {
        if (s.currentSlotId && _getSeasonData) {
          const res = await window.projectB?.saveSlot?.({ slotId: s.currentSlotId, game: gameData, season: _getSeasonData() });
          if (res && !res.ok) console.error("[gameStore] saveSlot 실패:", res.error);
        } else {
          await window.projectB?.gameSave?.(gameData);
        }
      } catch (e) {
        console.error("[gameStore] save 예외:", e);
      }
    },

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

    // 하위 호환: dayAdvance IPC 결과 적용 (TopHeader)
    applyDayResult(snapshot: CoreGameState, newLogs: string[]) {
      update((s) => {
        const week = snapshot.day ? Math.ceil(snapshot.day / 7) : 1;
        const p    = { ...s.protagonist, morale: snapshot.morale };
        return {
          ...s,
          protagonist: p,
          dayLabel:    computeWeekLabel(week, snapshot.seasonYear ?? BASE_SEASON_YEAR),
          player:      { ...s.player, morale: snapshot.morale },
          logs:        [...newLogs, ...s.logs].slice(0, 30),
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

        const p = s.protagonist;
        const clamp = (v: number) => Math.max(0, Math.min(100, v));
        const condition    = clamp(p.condition + (fx.conditionDelta ?? 0));
        const fatigue      = clamp(p.fatigue   + (fx.fatigueDelta   ?? 0));
        const morale       = clamp(p.morale    + (fx.moraleDelta    ?? 0));
        const money        = Math.max(0, p.money + (fx.moneyDelta ?? 0));
        const fame         = Math.max(0, Math.min(200, p.fame       + (fx.fameDelta       ?? 0)));
        const popularity   = Math.max(0, Math.min(100, p.popularity + (fx.popularityDelta ?? 0)));
        const diligence    = Math.max(1, Math.min(99,  p.diligence  + (fx.diligenceDelta  ?? 0)));
        const tags         = fx.addTag ? [...new Set([...p.tags, ...fx.addTag])] : p.tags;

        const pitchingXP = { ...p.pitchingXP };
        if (fx.xp) {
          for (const [stat, amt] of Object.entries(fx.xp)) {
            pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
          }
        }

        const clampStat = (v: number) => Math.max(1, Math.min(99, v));
        const pitching = { ...p.pitching };
        if (fx.statDelta) {
          for (const [stat, amt] of Object.entries(fx.statDelta)) {
            if (stat !== "ovr" && stat in pitching) {
              (pitching as Record<string, number>)[stat] = clampStat((pitching as Record<string, number>)[stat] + amt);
            }
          }
        }

        const updated: ProtagonistSave = { ...p, condition, fatigue, morale, money, fame, popularity, diligence, tags, pitchingXP, pitching };
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
        };
        const nextAchievements = updateAchievementProgress(s.achievements, nextMetrics);
        return {
          ...s,
          mailbox,
          protagonist: updated,
          player: toPlayerCompat(updated),
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

    // NPC 배열 업데이트
    updateNpcs(updatedNpcs: NpcSaveState[]) {
      const updatedMap = new Map(updatedNpcs.map(n => [n.npcId, n]));
      update((s) => ({
        ...s,
        npcs: s.npcs.map(n => updatedMap.get(n.npcId) ?? n),
      }));
    },

    // 신규 NPC 추가 (entry_year 활성화 시 호출)
    addNpcs(newNpcs: NpcSaveState[]) {
      update((s) => {
        const existingIds = new Set(s.npcs.map(n => n.npcId));
        const fresh = newNpcs.filter(n => !existingIds.has(n.npcId));
        return { ...s, npcs: [...s.npcs, ...fresh] };
      });
    },

    patchProTeamProfile(teamId: string, profile: import("../stores/master").ProTeamProfile) {
      update((s) => ({
        ...s,
        proTeamProfiles: { ...s.proTeamProfiles, [teamId]: profile },
      }));
    },

    initProTeamProfiles(teams: import("../stores/master").TeamRef[]) {
      update((s) => {
        const map: Record<string, import("../stores/master").ProTeamProfile> = { ...s.proTeamProfiles };
        for (const t of teams) {
          if (t.proTeamProfile && !map[t.id]) map[t.id] = { ...t.proTeamProfile };
        }
        return { ...s, proTeamProfiles: map };
      });
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

    updateMorale(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          morale: Math.max(0, Math.min(100, s.protagonist.morale + delta)),
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

    updateFame(delta: number) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          fame: Math.max(0, Math.min(100, s.protagonist.fame + delta)),
        },
      }));
    },

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
      update((s) => ({ ...s, mailbox: trimMailbox([msg, ...s.mailbox]) }));
    },

    setCurrentRole(role: import("../types/save").PitcherRole) {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, currentRole: role } }));
    },

    setPosition(pos: "SP" | "RP" | "CP") {
      update((s) => ({ ...s, protagonist: { ...s.protagonist, position: pos } }));
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

    setTrainingPlan(plan: Partial<TrainingPlanState>) {
      update((s) => ({ ...s, trainingPlan: { ...s.trainingPlan, ...plan } }));
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

    // 출전 정지 해제 (1주 후 자동)
    clearEligibilityBlock() {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, eligibilityBlocked: false },
      }));
    },

    // 진로 선택 완료 → careerStage 변경
    setCareerStage(stage: import("../types/save").CareerStage) {
      update((s) => {
        const p = { ...s.protagonist, careerStage: stage };
        const schoolPatch: Partial<import("../types/save").SchoolState> = {
          careerChoiceTriggered: true,
        };
        if (stage === "university") {
          schoolPatch.attendsUniversity = true;
          schoolPatch.universityWeek    = 0;
          schoolPatch.majorSelected     = false;
          // 대학 과목 초기화 (고교보다 낮은 성적에서 시작)
          schoolPatch.subjectScores = {
            kor:  { percentile: 28, attendance: 93, assignment: 85 },
            eng:  { percentile: 32, attendance: 90, assignment: 82 },
            math: { percentile: 45, attendance: 87, assignment: 78 },
            soc:  { percentile: 38, attendance: 91, assignment: 80 },
            sci:  { percentile: 50, attendance: 85, assignment: 76 },
          };
          schoolPatch.examAccumScore = 0;
          schoolPatch.lastGrade      = null;
          schoolPatch.lastGradeRisk  = "ok";
          schoolPatch.warningCount   = 0;
        }
        return {
          ...s,
          protagonist: p,
          player:      toPlayerCompat(p),
          schoolState: { ...s.schoolState, ...schoolPatch },
        };
      });
    },

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

    // 이벤트 선택지 효과 적용
    applyEventEffect(effect: import("../types/main").DecisionEffect) {
      update((s) => {
        const p = s.protagonist;
        const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
        const clampStat = (v: number) => Math.max(1, Math.min(99, v));
        const condition = clamp100(p.condition + (effect.conditionDelta ?? 0));
        const fatigue   = clamp100(p.fatigue   + (effect.fatigueDelta   ?? 0));
        const morale    = clamp100(p.morale    + (effect.moraleDelta    ?? 0));
        const money     = Math.max(0, p.money + (effect.moneyDelta ?? 0));
        const pitchingXP = { ...p.pitchingXP };
        if (effect.xp) {
          for (const [stat, amt] of Object.entries(effect.xp)) {
            pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
          }
        }
        const pitching = { ...p.pitching };
        if (effect.statDelta) {
          for (const [stat, amt] of Object.entries(effect.statDelta)) {
            if (stat !== "ovr" && stat in pitching) {
              (pitching as Record<string, number>)[stat] = clampStat((pitching as Record<string, number>)[stat] + amt);
            }
          }
        }
        const updated: ProtagonistSave = { ...p, condition, fatigue, morale, money, pitchingXP, pitching };
        return { ...s, protagonist: updated, player: toPlayerCompat(updated) };
      });
    },

    applyDraftDecision(payload: {
      stage: import("../types/save").CareerStage;
      leagueId?: string;
      teamId?: string;
      teamName?: string;
      signingBonus?: number;
      resetDraftTrigger?: boolean;
    }) {
      update((s) => {
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          careerStage: payload.stage,
          leagueId: payload.leagueId ?? s.protagonist.leagueId,
          teamId: payload.teamId ?? s.protagonist.teamId,
          money: Math.max(0, s.protagonist.money + (payload.signingBonus ?? 0)),
          grade: payload.stage === "highschool" ? s.protagonist.grade : undefined,
        };
        const schoolState: SchoolState = {
          ...s.schoolState,
          attendsUniversity: payload.stage === "university",
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

    signContract(contract: ProContract) {
      update((s) => {
        const leagueStage =
          contract.leagueId === "LEAGUE_ABL"         ? "pro_abl" :
          contract.leagueId === "LEAGUE_JBL"         ? "pro_jbl" :
          contract.leagueId === "LEAGUE_INDEPENDENT" ? "independent" :
          "pro_kbl";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          contract: { ...contract, status: "active" },
          money: Math.max(0, s.protagonist.money + contract.signingBonus),
          careerStage: leagueStage,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          faNegotiationRound: 0,
          faUnsignedWeeks: 0,
          tradeAdaptationWeeks: 0,
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
    setPendingNextContract(contract: ProContract) {
      update((s) => {
        const leagueStage =
          contract.leagueId === "LEAGUE_ABL"         ? "pro_abl" :
          contract.leagueId === "LEAGUE_JBL"         ? "pro_jbl" :
          contract.leagueId === "LEAGUE_INDEPENDENT" ? "independent" :
          "pro_kbl";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          pendingNextContract: { ...contract, status: "active" },
          careerStage: leagueStage,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          money: Math.max(0, s.protagonist.money + contract.signingBonus),
          faNegotiationRound: 0,
          faUnsignedWeeks: 0,
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
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          contract: pending,
          pendingNextContract: undefined,
        };
        return { ...s, protagonist, player: toPlayerCompat(protagonist) };
      });
    },

    applyTradeTransfer(toTeamId: string) {
      update((s) => {
        const current = s.protagonist.contract;
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          teamId: toTeamId,
          tradeAdaptationWeeks: 3,
          contract: current
            ? {
                ...current,
                teamId: toTeamId,
              }
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

    enlistMilitary(unit: "sports" | "general", enlistWeek = 52, sportsUnitSelected = false, enlistYear?: number) {
      update((s) => {
        const now = s.protagonist;
        const isPro = now.careerStage === "pro_kbl" || now.careerStage === "pro_abl" || now.careerStage === "pro_jbl" || now.careerStage === "independent";
        const extendedContract = isPro && now.contract
          ? { ...now.contract, remainingYears: now.contract.remainingYears + 2 }
          : now.contract;
        const protagonist: ProtagonistSave = {
          ...now,
          careerStage: "military",
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

    advanceMilitaryWeek() {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          militaryServiceWeeks: s.protagonist.militaryServiceWeeks + 1,
        },
      }));
    },

    completeMilitaryService() {
      update((s) => {
        const p = s.protagonist;
        // 휴학 단계 복구: militaryHiatusStage 우선, 없으면 leagueId 기반
        const stage: import("../types/save").CareerStage =
          (p.militaryHiatusStage as import("../types/save").CareerStage | null) ??
          (p.leagueId === "LEAGUE_ABL" ? "pro_abl" :
           p.leagueId === "LEAGUE_JBL" ? "pro_jbl" :
           p.leagueId === "LEAGUE_KBL" ? "pro_kbl" : "independent");
        const protagonist: ProtagonistSave = {
          ...p,
          careerStage: stage,
          militaryUnit: null,
          militaryServiceWeeks: 0,
          militaryRecoveryWeeks: p.militaryUnit === "sports" ? 2 : 6,
          militaryStatus: "군필",
          militaryHiatusStage: null,
          militaryHiatusUniversityWeek: null,
        };
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
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

    // 시즌 종료 후 주인공 상태 갱신 (나이+1, 학년+1, 프로연차+1, 오프시즌 회복)
    advanceSeasonYear(_seasonYear?: number) {
      update((s) => {
        const p = s.protagonist;
        const isPro = ["pro", "pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage);
        const isStudent = ["highschool", "university"].includes(p.careerStage);
        const newGrade =
          isStudent && p.grade && p.grade < 3
            ? ((p.grade + 1) as 1 | 2 | 3)
            : p.grade;
        const draftTriggeredReset =
          p.careerStage === "highschool" && newGrade === 3;
        const protagonist: ProtagonistSave = {
          ...p,
          age: p.age + 1,
          grade: newGrade,
          proServiceYears: isPro ? p.proServiceYears + 1 : p.proServiceYears,
          condition: Math.min(100, p.condition + 20),
          fatigue: Math.max(0, p.fatigue - 30),
          seasonHealth: { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 },
          sportsUnitApplied: false,
        };
        const schoolState = draftTriggeredReset
          ? { ...s.schoolState, draftTriggered: false }
          : s.schoolState;

        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, schoolState),
          schoolState,
        };
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
        s.npcs.map(n => [n.npcId, { name: n.name, status: n.militaryStatus, unit: n.militaryUnit }])
      );

      const result = await runOffseasonProcessing(s.npcs, s.pendingDraft, seasonYear);
      const { decayDormantEmotion, archiveNpc } = await import("../utils/emotionEngine");
      const decayedNpcs = result.npcs.map(n => {
        if (n.emotionStatus === "dormant" && n.emotion) {
          return { ...n, emotion: decayDormantEmotion(n.emotion) };
        }
        if (n.careerStatus === "retired" && n.emotionStatus !== "archived") {
          return archiveNpc(n);
        }
        return n;
      });

      const slotId = s.currentSlotId;
      if (slotId) {
        // FA 재배치 기록: 오프시즌 처리 후 팀이 바뀐 FA 자격 선수
        const faRows: import("../types/save").LeagueTransactionRow[] = [];
        for (const n of result.npcs) {
          const prev = beforeTeam.get(n.npcId);
          if (prev && prev !== n.currentTeam && proLeagues.has(n.currentLeague) && n.careerStatus === "active") {
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
        if (faRows.length > 0) {
          const faRes = JSON.parse(
            await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: faRows }))
          );
          if (faRes.error) console.error("[processAllLeaguesSeasonEnd] FA 기록 오류:", faRes.error);
          else console.log(`[processAllLeaguesSeasonEnd] FA 기록 ${faRows.length}건 저장`);
        }
      }

      // before/after 비교로 실제 입대·전역 추출 + 리그 기록 작성
      const militaryEnlistedSports: string[] = [];
      const militaryEnlistedGeneral: string[] = [];
      const militaryDischargedNames: string[] = [];
      const militaryRows: import("../types/save").LeagueTransactionRow[] = [];
      for (const n of result.npcs) {
        const before = beforeMilitary.get(n.npcId);
        if (!before) continue;
        if (before.status !== "현역" && n.militaryStatus === "현역") {
          const detail = n.militaryUnit === "sports" ? "체육부대 입대" : "현역 입대";
          if (n.militaryUnit === "sports") {
            militaryEnlistedSports.push(n.name);
          } else {
            militaryEnlistedGeneral.push(n.name);
          }
          militaryRows.push({
            seasonYear,
            category: "military",
            playerId: n.npcId,
            playerName: n.name,
            fromTeamId: n.currentTeam,
            fromLeagueId: n.currentLeague,
            detail,
          });
        } else if (before.status === "현역" && n.militaryStatus !== "현역") {
          militaryDischargedNames.push(before.name);
          militaryRows.push({
            seasonYear,
            category: "military",
            playerId: n.npcId,
            playerName: n.name,
            fromLeagueId: n.currentLeague,
            detail: "전역",
          });
        }
      }
      if (slotId && militaryRows.length > 0) {
        const milRes = JSON.parse(
          await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: militaryRows }))
        );
        if (milRes.error) console.error("[processAllLeaguesSeasonEnd] 병역 기록 오류:", milRes.error);
        else console.log(`[processAllLeaguesSeasonEnd] 병역 기록 ${militaryRows.length}건 저장`);
      }
      (window as any).__lastOffseasonSummary = {
        militaryEnlistedSports,
        militaryEnlistedGeneral,
        militaryDischargedNames,
      };

      // ── Phase 4: 배경 엔티티 병역 처리 ────────────────────────────────────
      if (slotId) {
        const m = get(masterStore);
        const namedIdSet = new Set(s.npcs.map(n => n.npcId));
        const npcLiveStats = _getSeasonData?.()?.npcLiveStats ?? {};

        // 1. 전역: militaryEnlistYear에서 2년 이상 경과
        const bgDischarging = m.entities.filter(e =>
          e.role === "player" &&
          e.leagueId && proLeagues.has(e.leagueId) &&
          !namedIdSet.has(e.id) &&
          e.details?.player?.militaryEnlistYear !== undefined &&
          (seasonYear - (e.details.player.militaryEnlistYear ?? 0)) >= 2
        );
        const dischargedIds = new Set<string>();
        if (bgDischarging.length > 0) {
          const dischEntities = bgDischarging.map(e => ({
            ...e,
            details: { ...e.details, player: { ...e.details?.player, militaryEnlistYear: undefined } },
            slotId,
          }));
          const disRes = JSON.parse(
            await window.projectB!.masterBulkUpsertEntities(JSON.stringify({ slotId, entities: dischEntities }))
          ) as { ok: boolean; error?: string };
          if (!disRes.error) {
            bgDischarging.forEach(e => dischargedIds.add(e.id));
            const dischRows = bgDischarging.map(e => ({
              seasonYear, category: "military",
              playerId: e.id, playerName: e.name,
              fromLeagueId: e.leagueId, detail: "전역",
            }));
            await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: dischRows }));
            console.log(`[배경병역] 전역 ${bgDischarging.length}명`);
          }
        }

        // 2. 입대: 미필 배경 선수 중 일부 선발 (age 20–27)
        const mNow = get(masterStore);
        const bgMilitaryCandidates = mNow.entities
          .filter(e =>
            e.role === "player" &&
            e.leagueId && proLeagues.has(e.leagueId) &&
            e.teamId && e.teamId !== "" &&
            e.status !== "retired" &&
            !namedIdSet.has(e.id) &&
            !dischargedIds.has(e.id) &&
            e.age >= 20 && e.age <= 27 &&
            !e.details?.player?.militaryEnlistYear
          )
          .map(e => ({
            id: e.id,
            name: e.name ?? e.id,
            ovr: npcLiveStats[e.id]?.pitching?.ovr ?? (e.details as any)?.player?.pitching?.ovr ?? 50,
            teamId: e.teamId!,
            isProtagonist: false,
          }));

        if (bgMilitaryCandidates.length > 0) {
          const topRaw = JSON.parse(
            await window.projectB!.militaryCalcCandidates(JSON.stringify({ candidates: bgMilitaryCandidates, topN: 50 }))
          ) as { topCandidates: { id: string; name: string; ovr: number; teamId: string }[] };

          if (topRaw.topCandidates.length > 0) {
            const selRes = JSON.parse(
              await window.projectB!.militaryCalcSelection(JSON.stringify({
                applicants: topRaw.topCandidates.map(c => ({ ...c, isProtagonist: false })),
                maxTotal: Math.min(20, topRaw.topCandidates.length),
                maxPerTeam: 3,
              }))
            ) as { protagonistSelected: boolean; selectedIds: string[] };

            if (selRes.selectedIds.length > 0) {
              const selectedEntities = mNow.entities.filter(e => selRes.selectedIds.includes(e.id));
              const enlisted = selectedEntities.map(e => ({
                ...e,
                details: { ...e.details, player: { ...e.details?.player, militaryEnlistYear: seasonYear } },
                slotId,
              }));
              const enlRes = JSON.parse(
                await window.projectB!.masterBulkUpsertEntities(JSON.stringify({ slotId, entities: enlisted }))
              ) as { ok: boolean; error?: string };
              if (!enlRes.error) {
                const enlRows = selectedEntities.map(e => ({
                  seasonYear, category: "military",
                  playerId: e.id, playerName: e.name,
                  fromTeamId: e.teamId, fromLeagueId: e.leagueId,
                  detail: "현역 입대",
                }));
                await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: enlRows }));
                console.log(`[배경병역] 입대 ${selRes.selectedIds.length}명`);
              }
            }
          }
        }
      }

      update((st) => ({
        ...st,
        npcs: decayedNpcs,
        pendingDraft: result.pendingDraft,
        seasonEndSummary: result.summary,
        logs: [...result.logs, ...st.logs].slice(0, 30),
        mailbox: result.mailboxEntry
          ? trimMailbox([result.mailboxEntry, ...st.mailbox])
          : st.mailbox,
      }));
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
        console.warn("[gameStore] applyAgingDecay failed", raw.error);
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

    toCoreState(): CoreGameState {
      const s = get({ subscribe });
      return {
        day: 1, seasonYear: 2026,
        stage: s.protagonist.careerStage,
        playerName: s.protagonist.name,
        teamName: s.protagonist.teamId,
        morale: s.protagonist.morale,
      };
    },

    // 새 게임 시작: 캐릭터 생성 완료 시 호출
    initNew(protagonist: ProtagonistSave, slotId?: string) {
      const cur = get({ subscribe });
      set({
        currentSlotId: slotId ?? cur.currentSlotId,
        protagonist,
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
        proTeamProfiles:  {},
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
      const emotionRoleMap = new Map<string, NpcEmotionRole>([
        ...r.seniorMentors.map((id): [string, NpcEmotionRole] => [id, "teammate"]),
        [r.seniorCaptain, "teammate"],
        ...r.classmateRivals.map((id): [string, NpcEmotionRole] => [id, "rival"]),
        [r.batteryPartner, "teammate"],
        [r.promisingJunior, "teammate"],
        ...scenario.rivalAces.map((id): [string, NpcEmotionRole] => [id, "rival"]),
        ...scenario.initialZone0Npcs.map((id): [string, NpcEmotionRole] => [id, "teammate"]),
      ].filter(([id]) => Boolean(id)) as [string, NpcEmotionRole][]);

      update((s) => ({
        ...s,
        npcs: initHighSchoolNpcs(entities, seasonYear, emotionRoleMap),
      }));
    },

    // 시즌 종료 처리: 학년 진급 + 졸업
    // 신입생은 다음 시즌 W1에 master.db entry_year 기반으로 자동 활성화됨
    async processSeasonEnd(seasonYear: number) {
      const s = get({ subscribe });

      // 1. 학년 진급 + 졸업
      const { updated, graduated } = await advanceHighSchoolGrades(s.npcs, seasonYear);

      // 2. 주인공 학년 진급
      const proto = s.protagonist;
      const gradeResult = proto.grade != null && proto.careerStage === "highschool"
        ? advanceProtagonistGrade(proto.grade, proto.age)
        : null;

      const updatedProto = gradeResult
        ? { ...proto, ...gradeResult.patch }
        : proto;

      update((st) => ({
        ...st,
        npcs: updated,
        protagonist: updatedProto,
        pendingDraft: graduated,
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
    async processDraft(
      namedMetas: NamedNpcMeta[],
      year: number,
    ): Promise<{ simResult: DraftSimResult; protagonistOutcome: ProtagonistDraftOutcome }> {
      const s = get({ subscribe });

      // 1. NPC 드래프트 시뮬레이션
      const simResult = await runDraftSimulation(s.pendingDraft, namedMetas, year);

      // 2. 주인공 드래프트 결과 (고교 졸업 시즌에만)
      const isGraduating = s.protagonist.careerStage === "highschool"
        && s.pendingDraft.length > 0;
      const protagonistOutcome: ProtagonistDraftOutcome = isGraduating
        ? await determineProtagonistDraft(
            s.protagonist.scoutScore,
            s.protagonist.pitching.ovr,
            year,
          )
        : { drafted: false };

      // 3. NpcSaveState에 드래프트 결과 반영
      const updatedNpcs = await applyDraftToNpcs(s.npcs, simResult);

      update(st => ({
        ...st,
        npcs:         updatedNpcs,
        pendingDraft: [],
      }));

      return { simResult, protagonistOutcome };
    },

    async processNpcDraft(
      year: number,
      universityTeamIds: string[],
      independentTeamIds: string[],
    ): Promise<void> {
      const s = get({ subscribe });
      if (s.pendingDraft.length === 0) return;
      const simResult = await runDraftSimulation(s.pendingDraft, [], year);
      const updatedNpcs = await applyDraftToNpcs(
        s.npcs, simResult, universityTeamIds, independentTeamIds,
      );
      update(st => ({ ...st, npcs: updatedNpcs, pendingDraft: [] }));

      // NPC 드래프트 픽 거래 기록
      const slotId = s.currentSlotId;
      if (slotId && simResult.picks.length > 0) {
        const nameMap = new Map(s.pendingDraft.map((n) => [n.npcId, n.name]));
        const rows = simResult.picks.map((pick) => ({
          seasonYear: year,
          category: "draft" as const,
          playerId: pick.npcId,
          playerName: nameMap.get(pick.npcId) ?? pick.npcId,
          fromTeamId: null,
          fromLeagueId: null,
          toTeamId: pick.teamId,
          toLeagueId: "LEAGUE_KBL",
          detail: `${pick.round}라운드 ${pick.pick}순위`,
          groupId: null,
        }));
        const draftRes = JSON.parse(
          await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows }))
        );
        if (draftRes.error) console.error("[processNpcDraft] 드래프트 기록 오류:", draftRes.error);
        else console.log(`[processNpcDraft] 드래프트 기록 ${rows.length}건 저장`);
      }
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

export const showAcademicsTab = derived(
  gameStore,
  ($s) => {
    const stage = $s.protagonist.careerStage;
    return stage === "highschool" || stage === "university";
  },
);
