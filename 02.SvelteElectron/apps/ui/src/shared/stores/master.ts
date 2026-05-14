import { derived, writable } from "svelte/store";
import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, DecisionTemplateOption } from "../types/event";
import type { CareerStage, ManagerAttributes, CoachAttributes, CoachSpecialty } from "../types/save";
import type { DecisionEffect } from "../types/main";
import type { ContactDef, ContactFields } from "../types/messenger";

export type { ManagerAttributes, CoachAttributes, CoachSpecialty };

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
  nameKo?: string;
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
  funding?: "풍부" | "보통" | "부족";
  difficulty?: "최상" | "상" | "중" | "하" | "최하";
}

export interface TeamRecord {
  year: number;
  national: string;
  regional: string;
  note?: string;
}

export interface TeamHistory {
  founded: number;
  summary: string;
  proPlayers: number;
  nationalTitles: number;
  recentRecords: TeamRecord[];
  rival?: string;
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
  history?: TeamHistory;
}

// ── 인물 엔티티 상세 타입 ──────────────────────────────────────
export interface EntityManagerStats {
  motivation: number;
  development: number;
  strategy: number;
  handlePressure: number;
  handlePersonnel: number;
}

export interface EntityManagerDetails {
  style: string;
  experienceYears: number;
  stats: EntityManagerStats;
  gamePlanBias: string;
  riskTolerance: number;
}

export interface EntityCoachStats {
  teaching: number;
  analytics: number;
  experience: number; // 레벨 1~5
}

export interface EntityCoachDetails {
  specialty: CoachSpecialty | "-";
  experienceYears: number;
  stats: EntityCoachStats;
  trainingBuffs: string;
}

export interface EntityPlayerDetails {
  playerType: "pitcher" | "batter" | "twoWay";
  handedness: "L" | "R";
  position: string;
  jerseyNumber: number;
  pitching: import("../types/save").PitchingAttributes;
  batting: import("../types/save").BattingAttributes;
  positionRatings?: import("../types/save").PositionRatings;
  primaryPosition?: import("../types/save").PositionKey;
  diligence?: number;
  popularity?: number;
  developmentRate: number;
  potentialHidden: number;
}

export interface EntityDetails {
  player: EntityPlayerDetails;
  coach: EntityCoachDetails;
  manager: EntityManagerDetails;
  owner: Record<string, unknown>;
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
  details: EntityDetails;
  contact?: ContactFields;
}

// actionKey → category → 답장 문자열 배열
export type ContactReplies = Record<string, Record<string, string[]>>;

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
  contactReplies: ContactReplies;
  contactDefs: ContactDef[];
  militaryEvents: Array<{
    id: string;
    title: string;
    description: string;
    moraleDelta?: number;
    fatigueDelta?: number;
  }>;
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

// ── Manifest 타입 ─────────────────────────────────────────────
interface Manifest {
  generatedAt: string;
  events: {
    mandatory:   string[];
    conditional: string[];
    random: { media: string[]; social: string[]; team_life: string[] };
  };
  achievements: { baseball: string[]; growth: string[]; social: string[]; hidden: string[] };
}

// entities/players/_index.json 구조
interface EntityIndex {
  generated: string;
  byLeague: Record<string, string[]>;
  contacts?: string[];
}

interface LeagueTeamIndex {
  leagueId: string;
  activeTeamIds: string[];
}

const TEAM_NAME_MAP: Record<string, string> = {
  TEAM_UNIV_KNSU: "한빛체육대학교",
  TEAM_UNIV_KNU: "동명과학대학교",
  TEAM_UNIV_YONSEI: "서해국제대학교",
  TEAM_UNIV_KOREA: "남강대학교",
  TEAM_UNIV_HANYANG: "청운공과대학교",
  TEAM_UNIV_CHUNGBUK: "미래창성대학교",
  TEAM_UNIV_DONGGUK: "가온문화대학교",
  TEAM_IND_SEOUL_PIONEERS: "서울 파이오니어스",
  TEAM_IND_BUSAN_TEMPEST: "부산 템페스트",
  TEAM_IND_DAEGU_FALCONS: "대구 팔콘스",
  TEAM_IND_GWANGJU_STORM: "광주 스톰",
  TEAM_IND_DAEJEON_HUNTERS: "대전 헌터스",
  TEAM_IND_INCHEON_ORCAS: "인천 오르카스",
  TEAM_IND_SUWON_BLAZE: "수원 블레이즈",
  TEAM_IND_ULSAN_PHOENIX: "울산 피닉스",
};

const TEAM_PROFILE_MAP: Record<string, { style: string; desc: string; strengths: string[]; funding: "풍부" | "보통" | "부족"; difficulty: "상" | "중" | "하" }> = {
  TEAM_UNIV_KNSU: { style: "투수 중심", desc: "기초 체력과 투수 운용이 강한 전통의 대학팀.", strengths: ["투수력", "체력"], funding: "보통", difficulty: "중" },
  TEAM_UNIV_KNU: { style: "수비 안정", desc: "실책 억제와 수비 전술을 중시하는 운영형 팀.", strengths: ["수비", "작전"], funding: "보통", difficulty: "중" },
  TEAM_UNIV_YONSEI: { style: "공격 지향", desc: "타선 집중력이 높고 공격 템포가 빠른 팀.", strengths: ["타격", "주루"], funding: "풍부", difficulty: "상" },
  TEAM_UNIV_KOREA: { style: "균형형", desc: "공수 밸런스가 안정적인 전천후 팀 컬러.", strengths: ["밸런스", "집중력"], funding: "풍부", difficulty: "상" },
  TEAM_UNIV_HANYANG: { style: "피지컬", desc: "강한 피지컬과 장타를 앞세운 파워형 팀.", strengths: ["장타력", "피지컬"], funding: "보통", difficulty: "중" },
  TEAM_UNIV_CHUNGBUK: { style: "육성형", desc: "유망주 성장과 장기 육성에 강점을 가진 팀.", strengths: ["육성", "멘탈"], funding: "보통", difficulty: "하" },
  TEAM_UNIV_DONGGUK: { style: "기동형", desc: "기동력과 번트/작전 수행이 뛰어난 팀.", strengths: ["주루", "작전"], funding: "보통", difficulty: "중" },
  TEAM_IND_SEOUL_PIONEERS: { style: "베테랑 중심", desc: "경험 많은 투수 운용이 강점인 독립팀.", strengths: ["경험", "불펜"], funding: "보통", difficulty: "상" },
  TEAM_IND_BUSAN_TEMPEST: { style: "공격 지향", desc: "강한 중심타선으로 승부를 거는 공격형 팀.", strengths: ["타격", "클러치"], funding: "보통", difficulty: "중" },
  TEAM_IND_DAEGU_FALCONS: { style: "수비 중심", desc: "탄탄한 내야 수비와 안정적인 경기 운영.", strengths: ["수비", "집중력"], funding: "부족", difficulty: "중" },
  TEAM_IND_GWANGJU_STORM: { style: "기동형", desc: "빠른 주루와 번트 플레이를 적극 활용.", strengths: ["주루", "작전"], funding: "부족", difficulty: "하" },
  TEAM_IND_DAEJEON_HUNTERS: { style: "투수 중심", desc: "선발진 완성도가 높은 로테이션형 팀.", strengths: ["선발", "제구"], funding: "보통", difficulty: "중" },
  TEAM_IND_INCHEON_ORCAS: { style: "균형형", desc: "특정 약점이 적고 기복이 작은 밸런스 팀.", strengths: ["밸런스", "수비"], funding: "보통", difficulty: "중" },
  TEAM_IND_SUWON_BLAZE: { style: "파워형", desc: "장타 생산력과 공격 폭발력이 뛰어난 팀.", strengths: ["장타력", "타격"], funding: "풍부", difficulty: "상" },
  TEAM_IND_ULSAN_PHOENIX: { style: "육성형", desc: "신인·저평가 자원의 성장 폭이 큰 팀.", strengths: ["육성", "적응력"], funding: "부족", difficulty: "하" },
};

function teamNameFromId(teamId: string): string {
  if (TEAM_NAME_MAP[teamId]) return TEAM_NAME_MAP[teamId];
  const base = teamId.replace(/^TEAM_(UNIV|IND)_/, "").toLowerCase();
  return base
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function mergeSupplementTeams(
  baseTeams: TeamRef[],
  universityIndex: LeagueTeamIndex | null,
  independentIndex: LeagueTeamIndex | null
): TeamRef[] {
  const merged = [...baseTeams];
  const existing = new Set(merged.map((team) => team.id));

  const append = (teamId: string, leagueId: string) => {
    if (existing.has(teamId)) return;
    const name = teamNameFromId(teamId);
    const profileMeta = TEAM_PROFILE_MAP[teamId];
    merged.push({
      id: teamId,
      name,
      nameEn: name,
      leagueId,
      clubId: teamId,
      profile: profileMeta
        ? {
            style: profileMeta.style,
            desc: profileMeta.desc,
            tags: [],
            strengths: profileMeta.strengths,
            funding: profileMeta.funding,
            difficulty: profileMeta.difficulty,
          }
        : undefined,
    });
    existing.add(teamId);
  };

  for (const teamId of universityIndex?.activeTeamIds ?? []) append(teamId, "LEAGUE_UNIVERSITY");
  for (const teamId of independentIndex?.activeTeamIds ?? []) append(teamId, "LEAGUE_INDEPENDENT");

  return merged;
}

// ── batchFetch 헬퍼 ───────────────────────────────────────────
async function batchFetch<T>(ids: string[], pathFn: (id: string) => string): Promise<T[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => fetchMaster<T>(pathFn(id))));
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[];
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
    contactReplies: {},
    contactDefs: [],
    militaryEvents: [],
  });

  // ── manifest 기반 이벤트 로드 ──────────────────────────────
  async function loadEventsFromManifest(m: Manifest): Promise<EventRule[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mandatory, conditional, media, social, teamLife] = await Promise.all([
      batchFetch<Record<string, unknown>>(m.events.mandatory,   (id) => `events/mandatory/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.conditional, (id) => `events/conditional/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.media,     (id) => `events/random/media/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.social,    (id) => `events/random/social/${id}.json`),
      batchFetch<Record<string, unknown>>(m.events.random.team_life, (id) => `events/random/team_life/${id}.json`),
    ]);
    return [...mandatory, ...conditional, ...media, ...social, ...teamLife]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => parseEventRule(r as Record<string, any>));
  }

  // ── manifest 기반 업적 로드 ───────────────────────────────
  async function loadAchievementsFromManifest(
    m: Manifest,
  ): Promise<import("../utils/achievementEngine").MasterAchievement[]> {
    const all = await Promise.all([
      batchFetch(m.achievements.baseball, (id) => `achievements/baseball/${id}.json`),
      batchFetch(m.achievements.growth,   (id) => `achievements/growth/${id}.json`),
      batchFetch(m.achievements.social,   (id) => `achievements/social/${id}.json`),
      batchFetch(m.achievements.hidden,   (id) => `achievements/hidden/${id}.json`),
    ]);
    return all.flat() as import("../utils/achievementEngine").MasterAchievement[];
  }

  // ── _index.contacts 기반 contactDefs 로드 (PLY 파일에서 contact 필드 추출) ──
  async function loadContactDefs(): Promise<ContactDef[]> {
    const index = await fetchMaster<EntityIndex>("entities/players/_index.json");
    const ids = index?.contacts ?? [];
    if (ids.length === 0) return [];
    const plys = await batchFetch<EntityRow>(ids, (id) => `entities/players/${id}.json`);
    return plys
      .filter((p) => p.contact != null)
      .map((p) => ({ id: p.id, name: p.name, nameEn: p.nameEn, ...p.contact! }));
  }

  async function load() {
    try {
      // ── 공통 데이터 (변경 없음) ────────────────────────────
      const [
        trainingData, pitchData, unlockData, refsData,
        univTeamsIndex, indepTeamsIndex,
        msgTmplData, decisionTmplData,
        poolMedia, poolSocial, poolTeamLife, militaryPoolData,
        contactRepliesData, manifest,
      ] = await Promise.all([
        fetchMaster<{ programs: TrainingProgram[] }>("training/programs_pitcher.json"),
        fetchMaster<{ pitches: PitchEntry[] }>("training/pitch_catalog.json"),
        fetchMaster<{ rules: PitchUnlockRule[] }>("training/pitch_unlock_rules.json"),
        fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
          "entities/refs.json"
        ),
        fetchMaster<LeagueTeamIndex>("teams/university/index.json"),
        fetchMaster<LeagueTeamIndex>("teams/independent/index.json"),
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
        fetchMaster<{ events: Array<{ id: string; title: string; description: string; moraleDelta?: number; fatigueDelta?: number }> }>(
          "events/pools/military.json"
        ),
        fetchMaster<{ replies: ContactReplies }>("messenger/contact_replies.json"),
        fetchMaster<Manifest>("_manifest.json"),
      ]);

      const messageTmpls  = (msgTmplData?.templates  ?? []).map(parseMessageTemplate);
      const decisionTmpls = (decisionTmplData?.decisions ?? []).map(parseDecisionTemplate);
      const rawPools      = [poolMedia, poolSocial, poolTeamLife].filter(
        (p): p is Record<string, unknown> => p !== null && typeof p === "object"
      );
      const eventPools = rawPools.map(parseEventPool);
      const mergedTeams = mergeSupplementTeams(refsData?.teams ?? [], univTeamsIndex, indepTeamsIndex);

      // ── manifest 기반 로드 (이벤트·업적·캐릭터) ──────────
      let eventRules:  EventRule[] = [];
      let achievements: import("../utils/achievementEngine").MasterAchievement[] = [];
      let contactDefs: ContactDef[] = [];

      if (manifest) {
        [eventRules, achievements, contactDefs] = await Promise.all([
          loadEventsFromManifest(manifest),
          loadAchievementsFromManifest(manifest),
          loadContactDefs(),
        ]);
      } else {
        // ── 레거시 폴백 (manifest 없을 때) ───────────────────
        console.warn("[masterStore] _manifest.json 없음 — 레거시 로딩");
        const [mandatoryData, conditionalData, randomData, achData, contactIndexData] =
          await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fetchMaster<{ events: Record<string, any>[] }>("events/rules/mandatory.json"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fetchMaster<{ events: Record<string, any>[] }>("events/rules/conditional.json"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fetchMaster<{ events: Record<string, any>[] }>("events/rules/random.json"),
            fetchMaster<{ achievements: import("../utils/achievementEngine").MasterAchievement[] }>(
              "achievements/achievements.json"
            ),
            fetchMaster<{ contacts: string[] }>("contacts/index.json"),
          ]);
        const rawRules = [
          ...(mandatoryData?.events ?? []),
          ...(conditionalData?.events ?? []),
          ...(randomData?.events ?? []),
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventRules  = rawRules.map((r) => parseEventRule(r as Record<string, any>));
        achievements = achData?.achievements ?? [];
        const contactIds = contactIndexData?.contacts ?? [];
        const cFiles = await Promise.all(
          contactIds.map((id) => fetchMaster<ContactDef>(`contacts/${id}.json`))
        );
        contactDefs = cFiles.filter((d): d is ContactDef => d !== null);
      }

      update((s) => ({
        ...s,
        loaded:          true,
        trainingPrograms: trainingData?.programs  ?? [],
        pitchCatalog:     pitchData?.pitches      ?? [],
        pitchUnlockRules: unlockData?.rules       ?? [],
        leagues:          refsData?.leagues ?? [],
        schools:          refsData?.schools ?? [],
        clubs:            refsData?.clubs   ?? [],
        teams:            mergedTeams,
        eventRules,
        messageTmpls,
        decisionTmpls,
        eventPools,
        achievements,
        contactReplies: contactRepliesData?.replies ?? {},
        contactDefs,
        militaryEvents: militaryPoolData?.events ?? [],
      }));
    } catch (e) {
      console.warn("[masterStore] load failed", e);
      update((s) => ({ ...s, loaded: true }));
    }
  }

  // ── 부분 재로드 (파일 드롭 핫리로드용) ───────────────────
  async function reloadEvents() {
    const manifest = await fetchMaster<Manifest>("_manifest.json");
    if (!manifest) return;
    const eventRules = await loadEventsFromManifest(manifest);
    update((s) => ({ ...s, eventRules }));
  }

  async function reloadAchievements() {
    const manifest = await fetchMaster<Manifest>("_manifest.json");
    if (!manifest) return;
    const achievements = await loadAchievementsFromManifest(manifest);
    update((s) => ({ ...s, achievements }));
  }

  async function reloadArcs(plyId?: string) {
    if (plyId) {
      const ply = await fetchMaster<EntityRow>(`entities/players/${plyId}.json`);
      if (!ply?.contact) return;
      const updated: ContactDef = { id: ply.id, name: ply.name, nameEn: ply.nameEn, ...ply.contact };
      update((s) => ({
        ...s,
        contactDefs: s.contactDefs.map((c) => c.id === plyId ? updated : c),
      }));
    } else {
      const contactDefs = await loadContactDefs();
      update((s) => ({ ...s, contactDefs }));
    }
  }

  async function loadEntities(leagueId: string) {
    let rows: EntityRow[];
    if (window.projectB?.masterLoadEntities) {
      rows = (await window.projectB.masterLoadEntities(leagueId)) as EntityRow[];
    } else {
      const index = await fetchMaster<EntityIndex>("entities/players/_index.json");
      if (!index?.byLeague) return;
      const ids = index.byLeague[leagueId] ?? [];
      rows = await batchFetch<EntityRow>(ids, (id) => `entities/players/${id}.json`);
    }
    update((s) => {
      const existingIds = new Set(s.entities.map((e) => e.id));
      const fresh = rows.filter((r) => !existingIds.has(r.id));
      return { ...s, entities: [...s.entities, ...fresh] };
    });
  }

  async function reloadContacts() {
    await reloadArcs();
  }

  // ── 핫리로드 리스너 (개발 환경: 파일 드롭 → 자동 반영) ──
  function setupContentWatcher() {
    const api = (window as Window & typeof globalThis & { projectB?: { onContentChanged?: (cb: (data: { filename: string }) => void) => void } }).projectB;
    if (!api?.onContentChanged) return;
    api.onContentChanged(({ filename }) => {
      if (filename.includes("events/")) {
        reloadEvents().catch(console.warn);
      } else if (filename.includes("achievements/")) {
        reloadAchievements().catch(console.warn);
      } else if (filename.includes("characters/")) {
        const contactId = filename.split("/").pop()?.replace(".json", "");
        reloadArcs(contactId || undefined).catch(console.warn);
      }
    });
  }

  return {
    subscribe, load, loadEntities, reloadContacts,
    reloadEvents, reloadAchievements, reloadArcs,
    setupContentWatcher,
  };
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
