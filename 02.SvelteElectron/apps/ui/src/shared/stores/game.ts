import { derived, get, writable } from "svelte/store";
import type { MessageItem } from "../types/main";
import type {
  AchievementMetrics,
  AchievementRuntime,
  CareerChoiceMode,
  CareerDraftPickLogEntry,
  CareerFinalChoice,
  CareerSeasonRecord,
  ChatContact,
  ChatMessage,
  NpcCareerEntry,
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
  advanceHighSchoolGrades,
  advanceProtagonistGrade,
  generateFreshmenNpcs,
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
import type { ContactDef, ContactEffect } from "../types/messenger";
import type { CoreGameState } from "../types/projectb.d";
import type { ProContract } from "../types/save";
import {
  KBL_FARM_MAP,
  runOffseasonProcessing,
} from "../utils/npcEngine";
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
  contacts: ChatContact[];
  npcs: NpcSaveState[];
  pendingDraft: NpcSaveState[];       // 드래프트 대기 졸업생 (비저장, 시즌 종료 시 채워짐)
  pendingAchievements: string[];      // 미확인 신규 달성 (비저장)
  seasonEndSummary: SeasonEndSummary | null;  // 직전 시즌 종료 처리 요약 (비저장)
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
  tradeAdaptationWeeks: 0,
  faNegotiationRound: 0,
  faUnsignedWeeks: 0,
  consecutiveLowMoraleWeeks: 0,
  consecutiveHighFatigueWeeks: 0,
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
  draftIntent: false,
  careerApplicationsSubmitted: false,
  fallbackSelectionPending: false,
  fallbackUniversityChoices: [],
  fallbackIndependentChoices: [],
  fallbackUniversityPassed: [],
  fallbackIndependentPassed: [],
  fallbackSportsMilitaryPassed: false,
  fallbackDraftPassed: false,
  fallbackDraftTeamId: null,
  fallbackDraftRound: null,
  fallbackDraftPick: null,
  fallbackDraftSigningBonus: 0,
  careerChoicePopupOpened: false,
  careerChoiceMode: "none",
  careerChoiceConfirmed: false,
  careerChoiceUniversityApplications: [],
  careerChoiceIndependentApplications: [],
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
  kakaoFirstContact: false,
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
    contacts:     [],
    npcs:         [],
    pendingDraft: [],
    pendingAchievements: [],
    seasonEndSummary: null,
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

  return {
    ...p,
    pitching: pitchingMerged,
    batting: {
      ...p.batting,
      baseInstinct: p.batting.baseInstinct ?? def.batting.baseInstinct,
      bunting:      p.batting.bunting      ?? def.batting.bunting,
      platoon:      p.batting.platoon      ?? def.batting.platoon,
    },
    primaryPosition: p.primaryPosition ?? def.primaryPosition,
    positionRatings: p.positionRatings  ?? def.positionRatings,
    diligence:  p.diligence  ?? def.diligence,
    popularity: p.popularity ?? def.popularity,
    battingXP:  p.battingXP  ?? {},
    pitches,
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
    contacts:     (saved.contacts ?? []).map((c) => ({ ...c, flags: c.flags ?? [] })),
    npcs:         saved.npcs ?? [],
    pendingDraft: [],
    pendingAchievements: [],
    seasonEndSummary: null,
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
      const progress = Math.max(item.progress, metrics.kakaoFirstContact ? 1 : 0);
      const unlockedAt = item.unlockedAt ?? (progress >= 1 ? now : null);
      return { ...item, progress, unlockedAt };
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
        s.contacts, s.npcs, s.trainingPresets,
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
        s.contacts, s.npcs, s.trainingPresets,
      );
      try {
        if (s.currentSlotId && _getSeasonData) {
          await window.projectB?.saveSlot?.({ slotId: s.currentSlotId, game: gameData, season: _getSeasonData() });
        } else {
          await window.projectB?.gameSave?.(gameData);
        }
      } catch (e) {
        console.warn("[gameStore] save failed", e);
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
        const condition = clamp(p.condition + (fx.conditionDelta ?? 0));
        const fatigue   = clamp(p.fatigue   + (fx.fatigueDelta   ?? 0));
        const morale    = clamp(p.morale    + (fx.moraleDelta    ?? 0));
        const money     = Math.max(0, p.money + (fx.moneyDelta ?? 0));

        const pitchingXP = { ...p.pitchingXP };
        if (fx.xp) {
          for (const [stat, amt] of Object.entries(fx.xp)) {
            pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
          }
        }

        const updated: ProtagonistSave = { ...p, condition, fatigue, morale, money, pitchingXP };
        const nextMetrics: AchievementMetrics = {
          ...s.achievementMetrics,
          kakaoFirstContact: s.achievementMetrics.kakaoFirstContact || messageId.startsWith("chat-"),
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

    recordSocialFirstKakao() {
      update((s) => {
        if (s.achievementMetrics.kakaoFirstContact) return s;
        const nextMetrics: AchievementMetrics = { ...s.achievementMetrics, kakaoFirstContact: true };
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

    // ── 메신저 액션 ──────────────────────────────────────────────

    unlockContact(id: string) {
      update((s) => ({
        ...s,
        contacts: s.contacts.map((c) => c.id === id ? { ...c, unlocked: true } : c),
      }));
    },

    unlockOrRegisterContact(def: ContactDef) {
      update((s) => {
        const exists = s.contacts.some((c) => c.id === def.id);
        if (exists) {
          return { ...s, contacts: s.contacts.map((c) => c.id === def.id ? { ...c, unlocked: true } : c) };
        }
        const newContact: ChatContact = {
          id: def.id, name: def.name, category: def.category, relation: def.relation,
          unlocked: true, affinity: def.initialAffinity,
          lastActionWeek: 0, chatHistory: [], flags: [],
        };
        return { ...s, contacts: [...s.contacts, newContact] };
      });
    },

    setContactFlag(contactId: string, flag: string) {
      update((s) => ({
        ...s,
        contacts: s.contacts.map((c) =>
          c.id !== contactId || c.flags.includes(flag) ? c : { ...c, flags: [...c.flags, flag] }
        ),
      }));
    },

    applyContactEffect(effect: ContactEffect) {
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
        let pitches = p.pitches;
        if (effect.unlockPitchId && !pitches.some((e) => e.id === effect.unlockPitchId)) {
          pitches = [...pitches, { id: effect.unlockPitchId, grade: 1 }];
        }
        const updated: ProtagonistSave = { ...p, condition, fatigue, morale, money, pitchingXP, pitching, pitches };
        return { ...s, protagonist: updated, player: toPlayerCompat(updated) };
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

    addChatMessage(contactId: string, msg: ChatMessage) {
      update((s) => ({
        ...s,
        contacts: s.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const history = [...c.chatHistory, msg];
          return { ...c, chatHistory: history.slice(-60) };
        }),
      }));
    },

    updateAffinity(contactId: string, delta: number) {
      update((s) => ({
        ...s,
        contacts: s.contacts.map((c) =>
          c.id !== contactId ? c : { ...c, affinity: Math.max(0, Math.min(100, c.affinity + delta)) }
        ),
      }));
    },

    setLastActionWeek(contactId: string, week: number) {
      update((s) => ({
        ...s,
        contacts: s.contacts.map((c) => c.id !== contactId ? c : { ...c, lastActionWeek: week }),
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

    setDraftIntent(flag: boolean) {
      update((s) => ({
        ...s,
        schoolState: { ...s.schoolState, draftIntent: flag },
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

    setCareerApplications(payload: { university: string[]; independent: string[] }) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          careerChoiceUniversityApplications: payload.university.slice(0, 3),
          careerChoiceIndependentApplications: payload.independent.slice(0, 3),
        },
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

    setFallbackAdmissions(payload: {
      universityChoices: string[];
      independentChoices: string[];
      universityPassed: string[];
      independentPassed: string[];
      sportsMilitaryPassed: boolean;
      draftPassed?: boolean;
      draftTeamId?: string | null;
      draftRound?: number | null;
      draftPick?: number | null;
      draftSigningBonus?: number;
      pendingSelection?: boolean;
    }) {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          fallbackSelectionPending: payload.pendingSelection ?? true,
          fallbackUniversityChoices: payload.universityChoices,
          fallbackIndependentChoices: payload.independentChoices,
          fallbackUniversityPassed: payload.universityPassed,
          fallbackIndependentPassed: payload.independentPassed,
          fallbackSportsMilitaryPassed: payload.sportsMilitaryPassed,
          fallbackDraftPassed: payload.draftPassed === true,
          fallbackDraftTeamId: payload.draftTeamId ?? null,
          fallbackDraftRound: payload.draftRound ?? null,
          fallbackDraftPick: payload.draftPick ?? null,
          fallbackDraftSigningBonus: payload.draftSigningBonus ?? 0,
        },
      }));
    },

    clearFallbackAdmissions() {
      update((s) => ({
        ...s,
        schoolState: {
          ...s.schoolState,
          fallbackSelectionPending: false,
          fallbackUniversityChoices: [],
          fallbackIndependentChoices: [],
          fallbackUniversityPassed: [],
          fallbackIndependentPassed: [],
          fallbackSportsMilitaryPassed: false,
          fallbackDraftPassed: false,
          fallbackDraftTeamId: null,
          fallbackDraftRound: null,
          fallbackDraftPick: null,
          fallbackDraftSigningBonus: 0,
          careerChoicePopupOpened: false,
          careerChoiceMode: "none",
          careerChoiceConfirmed: false,
          careerChoiceUniversityApplications: [],
          careerChoiceIndependentApplications: [],
          careerDraftPickLog: [],
          careerFinalChoice: "none",
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
          draftIntent: false,
          careerApplicationsSubmitted: false,
          fallbackSelectionPending: false,
          fallbackUniversityChoices: [],
          fallbackIndependentChoices: [],
          fallbackUniversityPassed: [],
          fallbackIndependentPassed: [],
          fallbackSportsMilitaryPassed: false,
          fallbackDraftPassed: false,
          fallbackDraftTeamId: null,
          fallbackDraftRound: null,
          fallbackDraftPick: null,
          fallbackDraftSigningBonus: 0,
          careerChoicePopupOpened: false,
          careerChoiceMode: "none",
          careerChoiceConfirmed: false,
          careerChoiceUniversityApplications: [],
          careerChoiceIndependentApplications: [],
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

    signContract(contract: ProContract, contactDefs: ContactDef[]) {
      update((s) => {
        const leagueStage =
          contract.leagueId === "LEAGUE_ABL" ? "pro_abl" : "pro_kbl";
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
        const unlockedIds = new Set(
          contactDefs.filter((c) => c.category === "team").map((c) => c.id),
        );
        const contacts = s.contacts.map((c) =>
          unlockedIds.has(c.id) ? { ...c, unlocked: true } : c,
        );
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          school: toSchoolCompat(protagonist.careerStage, s.schoolState),
          contacts,
        };
      });
    },

    applyTradeTransfer(toTeamId: string, contactDefs: ContactDef[]) {
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
        const unlockedIds = new Set(
          contactDefs.filter((c) => c.category === "team").map((c) => c.id),
        );
        const contacts = s.contacts.map((c) =>
          unlockedIds.has(c.id) ? { ...c, unlocked: true } : c,
        );
        return {
          ...s,
          protagonist,
          player: toPlayerCompat(protagonist),
          contacts,
          logs: [`트레이드 이적: ${toTeamId}`, ...s.logs].slice(0, 30),
        };
      });
    },

    enlistMilitary(unit: "sports" | "general") {
      update((s) => {
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          careerStage: "military",
          militaryUnit: unit,
          militaryServiceWeeks: 0,
          militaryRecoveryWeeks: 0,
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
        const stage =
          s.protagonist.leagueId === "LEAGUE_ABL"
            ? "pro_abl"
            : s.protagonist.leagueId === "LEAGUE_KBL"
            ? "pro_kbl"
            : "independent";
        const protagonist: ProtagonistSave = {
          ...s.protagonist,
          careerStage: stage,
          militaryUnit: null,
          militaryServiceWeeks: 0,
          militaryRecoveryWeeks: s.protagonist.militaryUnit === "sports" ? 2 : 6,
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
      update((s) => ({
        ...s,
        protagonist: { ...s.protagonist, trainingPitchState: { id: pitchId, progress: 5 } },
      }));
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
        const isPro = ["pro", "pro_kbl", "pro_abl"].includes(p.careerStage);
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
      const result = await runOffseasonProcessing(s.npcs, s.pendingDraft, seasonYear);
      update((st) => ({
        ...st,
        npcs: result.npcs,
        pendingDraft: result.pendingDraft,
        seasonEndSummary: result.summary,
        logs: [...result.logs, ...st.logs].slice(0, 30),
        mailbox: result.mailboxEntry
          ? trimMailbox([result.mailboxEntry, ...st.mailbox])
          : st.mailbox,
      }));
    },

    // 시즌 종료 후 주인공 에이징 감퇴 적용 (advanceSeasonYear 이후 호출)
    async applyAgingDecay() {
      const s = get({ subscribe });
      const p = s.protagonist;
      const raw = JSON.parse(
        await window.projectB!.growthCalcProtagonistAging(JSON.stringify({
          age:        p.age,
          condition:  p.condition,
          fatigue:    p.fatigue,
          pitching:   p.pitching,
          batting:    p.batting,
          playerType: p.playerType,
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
        contacts: [],
        npcs: [],
        pendingDraft: [],
        pendingAchievements: [],
        seasonEndSummary: null,
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
      update((s) => ({
        ...s,
        npcs: initHighSchoolNpcs(entities, seasonYear),
      }));
    },

    // 시즌 종료 처리: 학년 진급 + 졸업 + 신입생 생성
    async processSeasonEnd(
      seasonYear: number,
      school: HighSchoolMaster,
      namedRegistry: NamedNpcMeta[],
      namedEntities: import("../stores/master").EntityRow[],
      genIdOffset: number,
    ) {
      const s = get({ subscribe });

      // 1. 학년 진급 + 졸업
      const { updated, graduated } = await advanceHighSchoolGrades(s.npcs, seasonYear);

      // 2. 주인공 학년 진급
      const proto = s.protagonist;
      const gradeResult = proto.grade != null && proto.careerStage === "highschool"
        ? advanceProtagonistGrade(proto.grade, proto.age)
        : null;

      // 3. 신입생 생성 (이번 학교의 Grade 1 명명 NPC 필터링)
      const namedGrade1 = namedRegistry.filter(
        m => m.schoolId === school.id &&
             namedEntities.some(e => e.id === m.npcId && e.grade === 1)
      );
      const freshmen = await generateFreshmenNpcs(
        school, namedGrade1, namedEntities, seasonYear + 1, genIdOffset
      );

      const updatedProto = gradeResult
        ? { ...proto, ...gradeResult.patch }
        : proto;

      update((st) => ({
        ...st,
        npcs: [...updated, ...freshmen],
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
          };
          return { ...npc, careerHistory: [...npc.careerHistory, entry] };
        });
        return { ...s, npcs };
      });
    },

    appendCareerRecord(record: CareerSeasonRecord) {
      update((s) => ({
        ...s,
        protagonist: {
          ...s.protagonist,
          careerRecords: [...(s.protagonist.careerRecords ?? []), record],
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
