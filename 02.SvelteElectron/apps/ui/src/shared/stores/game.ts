import { derived, get, writable } from "svelte/store";
import type { MessageItem } from "../types/main";
import type {
  PitchingStatKey,
  ProtagonistSave,
  SaveGame,
  SchoolState,
  TrainingPlanState,
} from "../types/save";
import { makeSaveGame } from "../types/save";
import type { CoreGameState } from "../types/projectb.d";

// ── gameStore 내부 상태 ────────────────────────────────────────
export interface GameStoreState {
  protagonist: ProtagonistSave;
  mailbox: MessageItem[];
  trainingPlan: TrainingPlanState;
  schoolState: SchoolState;
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
  pitching: { ovr: 62, stamina: 58, velocity: 52, command: 60, control: 55, movement: 50, mentality: 57, recovery: 55 },
  batting:  { ovr: 30, contact: 35, power: 28, eye: 32, discipline: 30, speed: 50, fielding: 45, arm: 55, battingClutch: 30 },
  developmentRate: 62,
  potentialHidden: 88,
  growthPoints: 0,
  tags: ["급성장", "멘탈관리", "선발 로테이션"],
  pitchingXP: {},
};

const DEFAULT_TRAINING_PLAN: TrainingPlanState = {
  primaryProgramId:   "TRN_CMD_BASE",
  secondaryProgramId: "TRN_CTRL_MECH",
  recoveryProgramId:  "TRN_RECOVERY",
};

const DEFAULT_SCHOOL: SchoolState = {
  attendsUniversity: false,
  universityMajor: "체육교육",
  plannedUniversityMajors: ["스포츠과학", "체육교육", "스포츠경영", "생활체육", "스포츠재활"],
};

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
        { id: "do_train",   label: "훈련한다",       effect: "컨디션 -4, 커맨드 경험치 +1",
          effects: { conditionDelta: -4, xp: { command: 1 } } },
        { id: "skip_train", label: "훈련하지 않는다", effect: "컨디션 +2, 변화 없음",
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

// ── dayLabel 계산 (주차 기반, 52주 = 3월~2월 한국 학사년도) ──
// 각 월의 시작 주차 인덱스 (0-based): 3월=0,4월=5,5월=9,...,2월=48
const MONTH_STARTS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
const MONTH_NAMES  = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월","1월","2월"];

export function computeWeekLabel(week: number, grade: number = 1): string {
  const w = (week - 1) % 52;
  let monthIdx = 0;
  for (let i = MONTH_STARTS.length - 1; i >= 0; i--) {
    if (w >= MONTH_STARTS[i]) { monthIdx = i; break; }
  }
  const weekInMonth = w - MONTH_STARTS[monthIdx] + 1;
  return `${grade}학년 ${MONTH_NAMES[monthIdx]} ${weekInMonth}주차`;
}

// ── 초기 상태 ─────────────────────────────────────────────────
function buildInitialState(): GameStoreState {
  const p = DEFAULT_PROTAGONIST;
  return {
    protagonist:  p,
    mailbox:      DEFAULT_MAILBOX,
    trainingPlan: DEFAULT_TRAINING_PLAN,
    schoolState:  DEFAULT_SCHOOL,
    dayLabel:     computeWeekLabel(1, p.grade ?? 1),
    logs:         ["훈련 루틴 설정 완료", "코치 면담으로 제구 +1", "팀 분위기 안정"],
    upcoming:     ["화요일 불펜 세션", "금요일 체력장", "토요일 주말 리그 1차전"],
    player:       toPlayerCompat(p),
    school:       toSchoolCompat(p.careerStage, DEFAULT_SCHOOL),
  };
}

// ── SaveGame → 스토어 상태 변환 ───────────────────────────────
function fromSaveGame(saved: SaveGame): GameStoreState {
  const p = saved.protagonist;
  return {
    protagonist:  p,
    mailbox:      saved.mailbox,
    trainingPlan: saved.trainingPlan,
    schoolState:  saved.schoolState,
    dayLabel:     computeWeekLabel(1, p.grade ?? 1),
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

// ── 스토어 생성 ───────────────────────────────────────────────
function createGameStore() {
  const { subscribe, update, set } = writable<GameStoreState>(buildInitialState());

  return {
    subscribe,

    // 앱 시작 시 save_game.json에서 복원
    async load() {
      try {
        const saved = await window.projectB?.gameLoad?.();
        if (saved) set(fromSaveGame(saved));
      } catch (e) {
        console.warn("[gameStore] load failed, using defaults", e);
      }
    },

    // 현재 상태를 save_game.json에 저장
    async save() {
      const s = get({ subscribe });
      const data = makeSaveGame(
        s.protagonist, s.mailbox, s.trainingPlan,
        s.schoolState, s.logs, s.upcoming,
      );
      try {
        await window.projectB?.gameSave?.(data);
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
    ) {
      update((s) => {
        const p = { ...s.protagonist, ...protagonistPatch };
        return {
          ...s,
          protagonist: p,
          dayLabel:    computeWeekLabel(week, p.grade ?? 1),
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
          dayLabel:    computeWeekLabel(week, p.grade ?? 1),
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

        const pitchingXP = { ...p.pitchingXP };
        if (fx.xp) {
          for (const [stat, amt] of Object.entries(fx.xp)) {
            pitchingXP[stat as PitchingStatKey] = (pitchingXP[stat as PitchingStatKey] ?? 0) + amt;
          }
        }

        const updated: ProtagonistSave = { ...p, condition, fatigue, morale, pitchingXP };
        return { ...s, mailbox, protagonist: updated, player: toPlayerCompat(updated) };
      });
    },

    addMessage(msg: MessageItem) {
      update((s) => ({ ...s, mailbox: trimMailbox([msg, ...s.mailbox]) }));
    },

    setTrainingPlan(plan: Partial<TrainingPlanState>) {
      update((s) => ({ ...s, trainingPlan: { ...s.trainingPlan, ...plan } }));
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
    initNew(protagonist: ProtagonistSave) {
      set({
        protagonist,
        mailbox: [],
        trainingPlan: DEFAULT_TRAINING_PLAN,
        schoolState: DEFAULT_SCHOOL,
        dayLabel: computeWeekLabel(1, protagonist.grade ?? 1),
        logs: [],
        upcoming: [],
        player: toPlayerCompat(protagonist),
        school: toSchoolCompat(protagonist.careerStage, DEFAULT_SCHOOL),
      });
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
  ($s) => $s.school.currentStage === "highschool" || $s.school.currentStage === "university",
);
