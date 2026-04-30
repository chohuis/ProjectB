import { derived, writable } from "svelte/store";
import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, DecisionTemplateOption } from "../types/event";
import type { CareerStage } from "../types/save";
import type { DecisionEffect } from "../types/main";

// ── 훈련·구종 타입 ─────────────────────────────────────────────
export interface TrainingProgram {
  id: string;
  name: string;
  focus: string;
  intensity: "low" | "medium" | "high";
  fatigueCost: number;
  risk: number;
}

export interface PitchEntry {
  id: string;
  name: string;
  group: string;
  unlockRuleId: string;
}

export interface PitchUnlockRule {
  id: string;
  type: "always" | "min_stat";
  params: { stat?: string; value?: number };
}

// ── refs 타입 (refs.json 구조) ─────────────────────────────────
export interface LeagueRef {
  id: string;
  name: string;
  nameEn?: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  nameEn?: string;
}

export interface ClubRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
}

export interface TeamProfile {
  style: string;
  desc: string;
  tags: string[];
  strengths: string[];
}

export interface TeamRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
  clubId?: string;
  schoolId?: string;
  tier?: string;
  profile?: TeamProfile;
}

// ── 인물 엔티티 타입 (people_*.json 구조) ─────────────────────
export interface EntityRow {
  id: string;
  name: string;
  nameEn?: string;
  role: "player" | "coach" | "manager" | "owner";
  age: number;
  status: "active" | "inactive" | "retired" | "injured";
  originLeagueId: string;
  leagueId: string;
  clubId: string;
  teamId: string;
  tier?: string;
  schoolId: string;
  grade?: 1 | 2 | 3;
  notes: string;
  details: Record<string, unknown>;
}

// ── 스토어 상태 ───────────────────────────────────────────────
export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
  pitchUnlockRules: PitchUnlockRule[];
  leagues: LeagueRef[];
  schools: SchoolRef[];
  clubs: ClubRef[];
  teams: TeamRef[];
  entities: EntityRow[];
  eventRules: EventRule[];
  messageTmpls: MessageTemplate[];
  decisionTmpls: DecisionTemplate[];
  eventPools: EventPool[];
  achievements: import("../utils/achievementEngine").MasterAchievement[];
}

// ── masterFetch 래퍼 (IPC 우선, fetch 폴백) ───────────────────
async function fetchMaster<T>(relPath: string): Promise<T | null> {
  try {
    if (window.projectB?.masterFetch) {
      return (await window.projectB.masterFetch(relPath)) as T;
    }
    const res = await fetch(`/data/master/${relPath}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── 이벤트 JSON 파서 ─────────────────────────────────────────
// 한국 학사 연도 기준 월 → 주차 시작값 (3월=주1 기준)
const MONTH_STARTS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];

function scheduleToWeek(month: number, weekOfMonth: number): number {
  // 3월=index0, 4월=index1, ..., 12월=index9, 1월=index10, 2월=index11
  const idx = month >= 3 ? month - 3 : month + 9;
  const base = MONTH_STARTS[idx] ?? 0;
  return base + weekOfMonth;
}

function stageToCareerStage(stage: string): CareerStage | null {
  const map: Record<string, CareerStage> = {
    highschool: "highschool",
    university: "university",
    pro: "pro_kbl",
    kbl: "pro_kbl",
    abl: "pro_abl",
  };
  return map[stage] ?? null;
}

// effects 문자열 배열 → DecisionEffect 변환
// 형식 예: ["condition:-4", "xp.command:+1", "fatigue:+5"]
function parseEffectsArray(effects: string[]): DecisionEffect {
  const result: DecisionEffect = {};
  for (const e of effects) {
    const colonIdx = e.indexOf(":");
    if (colonIdx === -1) continue;
    const key = e.slice(0, colonIdx).trim();
    const val = parseInt(e.slice(colonIdx + 1).trim(), 10);
    if (isNaN(val)) continue;
    if (key === "condition")      result.conditionDelta = val;
    else if (key === "fatigue")   result.fatigueDelta = val;
    else if (key === "morale")    result.moraleDelta = val;
    else if (key.startsWith("xp.")) {
      const stat = key.slice(3);
      result.xp = { ...(result.xp ?? {}), [stat]: val };
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventRule(raw: Record<string, any>): EventRule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conditions: import("../types/event").Condition[] = [];

  if (Array.isArray(raw.conditions)) {
    // 새 포맷: conditions 배열 직접 사용
    conditions = raw.conditions as import("../types/event").Condition[];
  } else if (raw.schedule && typeof raw.schedule === "object") {
    // 구 포맷 하위 호환: schedule 필드 → week_eq + career_stage 변환
    const { month, weekOfMonth, stage } = raw.schedule as Record<string, unknown>;
    if (typeof month === "number" && typeof weekOfMonth === "number") {
      conditions.push({ type: "week_eq", value: scheduleToWeek(month, weekOfMonth) });
    }
    if (typeof stage === "string") {
      const cs = stageToCareerStage(stage);
      if (cs) conditions.push({ type: "career_stage", stage: cs });
    }
  }

  const cooldownWeeks =
    typeof raw.cooldownWeeks === "number" ? raw.cooldownWeeks :
    typeof raw.cooldownDays  === "number" ? Math.ceil(raw.cooldownDays / 7) :
    undefined;

  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? raw.id ?? ""),
    type: (raw.type as EventRule["type"]) ?? "random",
    category: String(raw.category ?? ""),
    priority: Number(raw.priority ?? 0),
    oncePolicy: (raw.oncePolicy as EventRule["oncePolicy"]) ?? "repeatable",
    cooldownWeeks,
    conditions,
    weight: typeof raw.weight === "number" ? raw.weight : undefined,
    poolId: typeof raw.poolId === "string" ? raw.poolId : undefined,
    messageTemplateId: raw.messageTemplateId ?? null,
    decisionTemplateId: raw.decisionTemplateId ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMessageTemplate(raw: Record<string, any>): MessageTemplate {
  return {
    id: String(raw.id ?? ""),
    category: (raw.category as MessageTemplate["category"]) ?? "system",
    subject: String(raw.subject ?? ""),
    body: String(raw.body ?? ""),
    decisionTemplateId: raw.decisionTemplateId ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDecisionTemplate(raw: Record<string, any>): DecisionTemplate {
  const options: DecisionTemplateOption[] = (raw.options ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: Record<string, any>): DecisionTemplateOption => {
      const effectsRaw = Array.isArray(o.effects) ? (o.effects as string[]) : [];
      const parsed = parseEffectsArray(effectsRaw);
      return {
        id: String(o.id ?? ""),
        label: String(o.label ?? ""),
        effectHint: typeof o.effectHint === "string" ? o.effectHint : undefined,
        effects: Object.keys(parsed).length > 0 ? parsed : undefined,
      };
    }
  );
  return {
    id: String(raw.id ?? ""),
    prompt: String(raw.prompt ?? ""),
    options,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventPool(raw: Record<string, any>): EventPool {
  return {
    id: String(raw.id ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    baseRoll: {
      mode: "percent",
      value: Number(raw.baseRoll?.value ?? raw.baseRollValue ?? 0),
    },
    maxPicksPerWeek: Number(raw.maxPicksPerDay ?? raw.maxPicksPerWeek ?? 1),
    eventIds: Array.isArray(raw.eventIds) ? (raw.eventIds as string[]) : [],
  };
}

// ── 스토어 생성 ───────────────────────────────────────────────
function createMasterStore() {
  const { subscribe, update } = writable<MasterState>({
    loaded: false,
    trainingPrograms: [],
    pitchCatalog: [],
    pitchUnlockRules: [],
    leagues: [],
    schools: [],
    clubs: [],
    teams: [],
    entities: [],
    eventRules: [],
    messageTmpls: [],
    decisionTmpls: [],
    eventPools: [],
    achievements: [],
  });

  async function load() {
    try {
      const [
        trainingData, pitchData, unlockData, refsData,
        mandatoryData, conditionalData, randomData,
        msgTmplData, decisionTmplData,
        poolMedia, poolSocial, poolTeamLife,
        achievementsData,
      ] = await Promise.all([
        fetchMaster<{ programs: TrainingProgram[] }>("training/programs_pitcher.json"),
        fetchMaster<{ pitches: PitchEntry[] }>("training/pitch_catalog.json"),
        fetchMaster<{ rules: PitchUnlockRule[] }>("training/pitch_unlock_rules.json"),
        fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
          "entities/refs.json"
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ events: Record<string, any>[] }>("events/rules/mandatory.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ events: Record<string, any>[] }>("events/rules/conditional.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ events: Record<string, any>[] }>("events/rules/random.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ templates: Record<string, any>[] }>("messages/templates.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<{ decisions: Record<string, any>[] }>("messages/decision_templates.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<Record<string, any>>("events/pools/media.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<Record<string, any>>("events/pools/social.json"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchMaster<Record<string, any>>("events/pools/team_life.json"),
        fetchMaster<{ achievements: import("../utils/achievementEngine").MasterAchievement[] }>(
          "achievements/achievements.json"
        ),
      ]);

      // 이벤트 규칙 병합 + 파싱
      const rawRules = [
        ...(mandatoryData?.events ?? []),
        ...(conditionalData?.events ?? []),
        ...(randomData?.events ?? []),
      ];
      const eventRules = rawRules.map(parseEventRule);

      // 템플릿 파싱
      const messageTmpls = (msgTmplData?.templates ?? []).map(parseMessageTemplate);
      const decisionTmpls = (decisionTmplData?.decisions ?? []).map(parseDecisionTemplate);

      // 풀 병합 (null 제거)
      const rawPools = [poolMedia, poolSocial, poolTeamLife].filter(
        (p): p is Record<string, unknown> => p !== null && typeof p === "object"
      );
      const eventPools = rawPools.map(parseEventPool);

      update((s) => ({
        ...s,
        loaded: true,
        trainingPrograms: trainingData?.programs  ?? [],
        pitchCatalog:     pitchData?.pitches      ?? [],
        pitchUnlockRules: unlockData?.rules       ?? [],
        leagues:          refsData?.leagues ?? [],
        schools:          refsData?.schools ?? [],
        clubs:            refsData?.clubs   ?? [],
        teams:            refsData?.teams   ?? [],
        eventRules,
        messageTmpls,
        decisionTmpls,
        eventPools,
        achievements: achievementsData?.achievements ?? [],
      }));
    } catch (e) {
      console.warn("[masterStore] load failed", e);
      update((s) => ({ ...s, loaded: true }));
    }
  }

  // 특정 리그의 인물 엔티티 로드
  async function loadEntities(leagueId: string) {
    const fileMap: Record<string, string> = {
      LEAGUE_HIGHSCHOOL:  "entities/people_hs.json",
      LEAGUE_UNIVERSITY:  "entities/people_univ.json",
      LEAGUE_INDEPENDENT: "entities/people_ind.json",
      LEAGUE_KBL:         "entities/people_kbl.json",
      LEAGUE_ABL:         "entities/people_abl.json",
    };
    const relPath = fileMap[leagueId];
    if (!relPath) return;

    const data = await fetchMaster<{ entities: EntityRow[] }>(relPath);
    update((s) => ({ ...s, entities: data?.entities ?? [] }));
  }

  return { subscribe, load, loadEntities };
}

export const masterStore = createMasterStore();

// ── 파생 스토어 ───────────────────────────────────────────────
export const trainingProgramMap = derived(masterStore, ($m) =>
  new Map($m.trainingPrograms.map((p) => [p.id, p]))
);

export const teamMap = derived(masterStore, ($m) =>
  new Map($m.teams.map((t) => [t.id, t]))
);

export const leagueMap = derived(masterStore, ($m) =>
  new Map($m.leagues.map((l) => [l.id, l]))
);

export const pitchUnlockRuleMap = derived(masterStore, ($m) =>
  new Map($m.pitchUnlockRules.map((r) => [r.id, r]))
);

export const eventRuleMap = derived(masterStore, ($m) =>
  new Map($m.eventRules.map((r) => [r.id, r]))
);

export const messageTmplMap = derived(masterStore, ($m) =>
  new Map($m.messageTmpls.map((t) => [t.id, t]))
);

export const decisionTmplMap = derived(masterStore, ($m) =>
  new Map($m.decisionTmpls.map((d) => [d.id, d]))
);
