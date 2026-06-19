import { derived, writable } from "svelte/store";
import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, DecisionTemplateOption } from "../types/event";
import type { CareerStage, ManagerAttributes, CoachAttributes, CoachSpecialty } from "../types/save";
import type { DecisionEffect } from "../types/main";

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
  style?: string;
  desc?: string;
  tags?: string[];
  strengths?: string[];
  funding?: "최상" | "상" | "중" | "하" | "최하";
  difficulty?: "최상" | "상" | "중" | "하" | "최하";
  prestige?: "S" | "A" | "B" | "C" | "D";
  fanBase?: "소규모" | "지역" | "광역" | "전국" | "메가";
  facilityLevel?: 1 | 2 | 3 | 4 | 5;
  atmosphere?: "엄격" | "체계적" | "균형" | "자유로운" | "가족적";
  mediaPressure?: "낮음" | "보통" | "높음" | "극심";
  promoChance?: "높음" | "보통" | "낮음";
}

export interface ProTeamProfile {
  ownerSpendingWillingness: number;
  stability: number;
  developmentFocus: number;
  discipline: number;
  ownerPatience: number;
  winNowPressure: number;
  scoutingQuality: number;
  prestige: number;
  marketAppeal: number;
  clubhouseCulture: number;
  medicalQuality: number;
  farmInvestment: number;
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
  titleYears?: number[];
  peakEra?: string;
}

export interface TeamRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
  clubId?: string;
  schoolId?: string;
  tier?: string;
  stadium?: string;
  city?: string;
  colors?: [string, string];
  capacity?: number;
  profile?: TeamProfile;
  proTeamProfile?: ProTeamProfile;
  history?: TeamHistory;
}

// ── 인물 엔티티 상세 타입 ──────────────────────────────────────
export interface EntityManagerStats {
  motivation: number;
  development: number;
  strategy: number;
  handlePressure: number;
  handlePersonnel: number;
  injuryMgmt?: number;  // 부상 관리 (70+ 보수적, 40미만 무리형)
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

export interface NpcContract {
  salary: number;
  durationYears: number;
  remainingYears: number;
  signingBonus: number;
  teamOptionYears: number;
  playerOptionYears: number;
  noTrade: boolean;
  status: "active" | "expired";
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
  proServiceYears?: number;
  militaryEnlistYear?: number;
  contract?: NpcContract;
  pitches?: import("../types/save").PitchEntry[];
}

export interface EntityDetails {
  player: EntityPlayerDetails;
  coach:   EntityCoachDetails   | null;
  manager: EntityManagerDetails | null;
  owner:   Record<string, unknown> | null;
}

// ── 인물 엔티티 타입 (people_*.json 구조) ─────────────────────
export interface EntityRow {
  id: string;
  name: string;
  nameEn?: string;
  role: "player" | "coach" | "manager" | "owner";
  age: number;
  status: "active" | "inactive" | "retired" | "injured" | "military";
  originLeagueId: string;
  leagueId: string;
  clubId: string;
  teamId: string;
  tier?: string;
  schoolId: string;
  grade?: 1 | 2 | 3;
  notes: string;
  militaryStatus?: "미필" | "군필" | "현역" | "면제";
  personality?: import("../types/save").NpcPersonality;
  entryYear?:   number;
  entryLeague?: string;
  entryTeam?:   string;
  entryAge?:    number;
  details: EntityDetails;
}

// ── NPC 라이브 스탯 타입 ───────────────────────────────────────
export interface NpcLiveStat {
  pitching?: import("../types/save").PitchingAttributes;
  batting?:  import("../types/save").BattingAttributes;
  pitchingXp?:         Record<string, number>;
  battingXp?:          Record<string, number>;
  seasonStartPitching?: import("../types/save").PitchingAttributes;
  seasonStartBatting?:  import("../types/save").BattingAttributes;
  peakOvr?: number;
}
export type NpcLiveStats = Record<string, NpcLiveStat>;

// ── 군 이벤트 타입 ────────────────────────────────────────────
export interface MilitaryEvent {
  id: string;
  title: string;
  description: string;
  minRank?: number;
  choices?: Array<{
    id: string;
    label: string;
    effectHint?: string;
    moraleDelta?: number;
    fatigueDelta?: number;
    xp?: Record<string, number>;
    statDelta?: Record<string, number>;
  }>;
  moraleDelta?: number;
  fatigueDelta?: number;
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
  militaryCommonEvents: MilitaryEvent[];
  militarySportsEvents: MilitaryEvent[];
  militaryGeneralEvents: MilitaryEvent[];
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
// 형식 예: ["condition:-4", "xp.command:+1", "fatigue:+5", "fame:+3", "addTag.급성장"]
function parseEffectsArray(effects: string[]): DecisionEffect {
  const result: DecisionEffect = {};
  for (const e of effects) {
    const colonIdx = e.indexOf(":");
    if (colonIdx === -1) continue;
    const key = e.slice(0, colonIdx).trim();
    const rawVal = e.slice(colonIdx + 1).trim();
    const val = parseInt(rawVal, 10);
    if (key === "condition")        result.conditionDelta  = val;
    else if (key === "fatigue")     result.fatigueDelta    = val;
    else if (key === "morale")      result.moraleDelta     = val;
    else if (key === "fame")        { if (!isNaN(val)) result.fameDelta       = val; }
    else if (key === "popularity")  { if (!isNaN(val)) result.popularityDelta = val; }
    else if (key === "diligence")   { if (!isNaN(val)) result.diligenceDelta  = val; }
    else if (key === "addTag")      result.addTag = [...(result.addTag ?? []), rawVal];
    else if (key.startsWith("xp.")) {
      if (!isNaN(val)) result.xp = { ...(result.xp ?? {}), [key.slice(3)]: val };
    }
    else if (key.startsWith("stat.")) {
      if (!isNaN(val)) result.statDelta = { ...(result.statDelta ?? {}), [key.slice(5)]: val };
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
      let effects: DecisionEffect | undefined;
      if (Array.isArray(o.effects)) {
        // 구 포맷: ["fatigue:+10", "xp.velocity:+3"]
        const parsed = parseEffectsArray(o.effects as string[]);
        effects = Object.keys(parsed).length > 0 ? parsed : undefined;
      } else if (o.effects && typeof o.effects === "object") {
        // 신 포맷: { fatigueDelta: 10, xp: { velocity: 3 } }
        effects = o.effects as DecisionEffect;
      }
      return {
        id: String(o.id ?? ""),
        label: String(o.label ?? ""),
        effectHint: typeof o.effectHint === "string" ? o.effectHint : undefined,
        effects,
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
}

interface LeagueTeamIndex {
  leagueId: string;
  activeTeamIds: string[];
}

const TEAM_NAME_MAP: Record<string, string> = {
  TEAM_UNIV_HANBBIT: "한빛체육대학교",
  TEAM_UNIV_DONGMYUNG: "동명과학대학교",
  TEAM_UNIV_SEOHAE: "서해국제대학교",
  TEAM_UNIV_NAMGANG: "남강대학교",
  TEAM_UNIV_CHEONGUN: "청운공과대학교",
  TEAM_UNIV_MIRAE: "미래창성대학교",
  TEAM_UNIV_GAON: "가온문화대학교",
  TEAM_IND_SEOUL_PIONEERS: "서울 파이오니어스",
  TEAM_IND_BUSAN_TEMPEST: "부산 템페스트",
  TEAM_IND_DAEGU_FALCONS: "대구 팔콘스",
  TEAM_IND_GWANGJU_STORM: "광주 스톰",
  TEAM_IND_DAEJEON_HUNTERS: "대전 헌터스",
  TEAM_IND_INCHEON_ORCAS: "인천 오르카스",
  TEAM_IND_SUWON_BLAZE: "수원 블레이즈",
  TEAM_IND_ULSAN_PHOENIX: "울산 피닉스",
  TEAM_HS_YEOSU_SHORE: "여수 쇼어",
  TEAM_HS_CHUNCHEON_HIGHLAND: "춘천 하이랜드",
  TEAM_HS_JEJU_WIND: "제주 윈드",
  TEAM_HS_GANGWON_PEAK: "강원 피크",
  TEAM_HS_MASAN_HARBOR: "마산 하버",
  TEAM_HS_JECHEON_RIDGE: "제천 릿지",
  TEAM_HS_GOYANG_ARROW: "고양 애로우",
  TEAM_HS_SUNCHEON_BAY: "순천 베이",
};

const TEAM_PROFILE_MAP: Record<string, { style: string; desc: string; strengths: string[]; funding: "최상" | "상" | "중" | "하" | "최하"; difficulty: "최상" | "상" | "중" | "하" | "최하" }> = {
  TEAM_UNIV_HANBBIT:   { style: "투수 중심", desc: "기초 체력과 투수 운용이 강한 전통의 대학팀.", strengths: ["투수력", "체력"], funding: "중", difficulty: "중" },
  TEAM_UNIV_DONGMYUNG: { style: "수비 안정", desc: "실책 억제와 수비 전술을 중시하는 운영형 팀.", strengths: ["수비", "작전"], funding: "중", difficulty: "중" },
  TEAM_UNIV_SEOHAE:    { style: "공격 지향", desc: "타선 집중력이 높고 공격 템포가 빠른 팀.", strengths: ["타격", "주루"], funding: "상", difficulty: "상" },
  TEAM_UNIV_NAMGANG:   { style: "균형형", desc: "공수 밸런스가 안정적인 전천후 팀 컬러.", strengths: ["밸런스", "집중력"], funding: "상", difficulty: "상" },
  TEAM_UNIV_CHEONGUN:  { style: "피지컬", desc: "강한 피지컬과 장타를 앞세운 파워형 팀.", strengths: ["장타력", "피지컬"], funding: "중", difficulty: "중" },
  TEAM_UNIV_MIRAE:     { style: "육성형", desc: "유망주 성장과 장기 육성에 강점을 가진 팀.", strengths: ["육성", "멘탈"], funding: "중", difficulty: "하" },
  TEAM_UNIV_GAON:      { style: "기동형", desc: "기동력과 번트/작전 수행이 뛰어난 팀.", strengths: ["주루", "작전"], funding: "중", difficulty: "중" },
  TEAM_IND_SEOUL_PIONEERS: { style: "베테랑 중심", desc: "경험 많은 투수 운용이 강점인 독립팀.", strengths: ["경험", "불펜"], funding: "중", difficulty: "상" },
  TEAM_IND_BUSAN_TEMPEST: { style: "공격 지향", desc: "강한 중심타선으로 승부를 거는 공격형 팀.", strengths: ["타격", "클러치"], funding: "중", difficulty: "중" },
  TEAM_IND_DAEGU_FALCONS: { style: "수비 중심", desc: "탄탄한 내야 수비와 안정적인 경기 운영.", strengths: ["수비", "집중력"], funding: "하", difficulty: "중" },
  TEAM_IND_GWANGJU_STORM: { style: "기동형", desc: "빠른 주루와 번트 플레이를 적극 활용.", strengths: ["주루", "작전"], funding: "하", difficulty: "하" },
  TEAM_IND_DAEJEON_HUNTERS: { style: "투수 중심", desc: "선발진 완성도가 높은 로테이션형 팀.", strengths: ["선발", "제구"], funding: "중", difficulty: "중" },
  TEAM_IND_INCHEON_ORCAS: { style: "균형형", desc: "특정 약점이 적고 기복이 작은 밸런스 팀.", strengths: ["밸런스", "수비"], funding: "중", difficulty: "중" },
  TEAM_IND_SUWON_BLAZE: { style: "파워형", desc: "장타 생산력과 공격 폭발력이 뛰어난 팀.", strengths: ["장타력", "타격"], funding: "상", difficulty: "상" },
  TEAM_IND_ULSAN_PHOENIX: { style: "육성형", desc: "신인·저평가 자원의 성장 폭이 큰 팀.", strengths: ["육성", "적응력"], funding: "하", difficulty: "하" },
};

function teamNameFromId(teamId: string): string {
  if (TEAM_NAME_MAP[teamId]) return TEAM_NAME_MAP[teamId];
  const base = teamId.replace(/^TEAM_(UNIV|IND|HS)_/, "").toLowerCase();
  return base
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function mergeSupplementTeams(
  baseTeams: TeamRef[],
  universityIndex: LeagueTeamIndex | null,
  independentIndex: LeagueTeamIndex | null,
  highschoolIndex: LeagueTeamIndex | null
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
  for (const teamId of highschoolIndex?.activeTeamIds ?? []) append(teamId, "LEAGUE_HIGHSCHOOL");

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
    militaryCommonEvents: [],
    militarySportsEvents: [],
    militaryGeneralEvents: [],
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

  async function load() {
    try {
      // ── 공통 데이터 (변경 없음) ────────────────────────────
      const [
        trainingData, pitchData, unlockData, refsData,
        univTeamsIndex, indepTeamsIndex, hsTeamsIndex,
        msgTmplData, decisionTmplData,
        poolMedia, poolSocial, poolTeamLife,
        militaryCommonData, militarySportsData, militaryGeneralData,
        manifest,
      ] = await Promise.all([
        fetchMaster<{ programs: TrainingProgram[] }>("training/programs_pitcher.json"),
        fetchMaster<{ pitches: PitchEntry[] }>("training/pitch_catalog.json"),
        fetchMaster<{ rules: PitchUnlockRule[] }>("training/pitch_unlock_rules.json"),
        fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
          "entities/refs.json"
        ),
        fetchMaster<LeagueTeamIndex>("teams/university/index.json"),
        fetchMaster<LeagueTeamIndex>("teams/independent/index.json"),
        fetchMaster<LeagueTeamIndex>("teams/highschool/index.json"),
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
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_common.json"),
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_sports.json"),
        fetchMaster<{ events: MilitaryEvent[] }>("events/pools/military_general.json"),
        fetchMaster<Manifest>("_manifest.json"),
      ]);

      const messageTmpls  = (msgTmplData?.templates  ?? []).map(parseMessageTemplate);
      const decisionTmpls = (decisionTmplData?.decisions ?? []).map(parseDecisionTemplate);
      const rawPools      = [poolMedia, poolSocial, poolTeamLife].filter(
        (p): p is Record<string, unknown> => p !== null && typeof p === "object"
      );
      const eventPools = rawPools.map(parseEventPool);
      const mergedTeams = mergeSupplementTeams(refsData?.teams ?? [], univTeamsIndex, indepTeamsIndex, hsTeamsIndex);

      // ── manifest 기반 로드 (이벤트·업적·캐릭터) ──────────
      let eventRules:  EventRule[] = [];
      let achievements: import("../utils/achievementEngine").MasterAchievement[] = [];

      if (manifest) {
        [eventRules, achievements] = await Promise.all([
          loadEventsFromManifest(manifest),
          loadAchievementsFromManifest(manifest),
        ]);
      } else {
        // ── 레거시 폴백 (manifest 없을 때) ───────────────────
        console.warn("[masterStore] _manifest.json 없음 — 레거시 로딩");
        const [mandatoryData, conditionalData, randomData, achData] =
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
          ]);
        const rawRules = [
          ...(mandatoryData?.events ?? []),
          ...(conditionalData?.events ?? []),
          ...(randomData?.events ?? []),
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventRules  = rawRules.map((r) => parseEventRule(r as Record<string, any>));
        achievements = achData?.achievements ?? [];
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
        militaryCommonEvents:  militaryCommonData?.events  ?? [],
        militarySportsEvents:  militarySportsData?.events  ?? [],
        militaryGeneralEvents: militaryGeneralData?.events ?? [],
      }));

      // 전체 엔티티 사전 로드 — 배경 리그 시뮬에 모든 팀 선수 데이터 필요
      // loaded: true 이후에 실행하므로 게임 진입을 블로킹하지 않음
      await reloadEntities();
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

  async function reloadEntities(seasonYear?: number, slotId?: string) {
    try {
      let rows: EntityRow[];
      if (window.projectB?.masterLoadEntities) {
        rows = (await window.projectB.masterLoadEntities("", seasonYear, slotId)) as EntityRow[];
      } else {
        const index = await fetchMaster<EntityIndex>("entities/players/_index.json");
        if (!index?.byLeague) return;
        const allIds = Object.values(index.byLeague).flat();
        rows = await batchFetch<EntityRow>(allIds, (id) => `entities/players/${id}.json`);
      }
      if (rows.length > 0) update((s) => ({ ...s, entities: rows }));
    } catch (e) {
      console.warn("[masterStore] reloadEntities failed", e);
    }
  }

  async function loadEntities(leagueId: string, seasonYear?: number, slotId?: string) {
    let rows: EntityRow[];
    if (window.projectB?.masterLoadEntities) {
      rows = (await window.projectB.masterLoadEntities(leagueId, seasonYear, slotId)) as EntityRow[];
    } else {
      const index = await fetchMaster<EntityIndex>("entities/players/_index.json");
      if (!index?.byLeague) return;
      const ids = index.byLeague[leagueId] ?? [];
      rows = await batchFetch<EntityRow>(ids, (id) => `entities/players/${id}.json`);
    }
    update((s) => {
      // seasonYear가 주어지면, 이미 스토어에 있는 미래 선수(entryYear > seasonYear) 제거
      const base = seasonYear !== undefined
        ? s.entities.filter((e) => !e.entryYear || e.entryYear <= seasonYear)
        : s.entities;
      const existingIds = new Set(base.map((e) => e.id));
      const fresh = rows.filter((r) => !existingIds.has(r.id));
      return { ...s, entities: [...base, ...fresh] };
    });
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
      } else if (filename.includes("entities/players/")) {
        reloadEntities().catch(console.warn);
      }
    });
  }

  // npcLiveStats의 pitching/batting 값을 entities에 인메모리 덮어쓰기
  function applyNpcLiveStats(npcLiveStats: Record<string, import("../types/season").NpcLiveStat>) {
    update((s) => {
      const entities = s.entities.map((e) => {
        if (e.role !== "player") return e;
        const live = npcLiveStats[e.id];
        if (!live) return e;
        const player = (e.details as EntityDetails)?.player;
        if (!player) return e;
        return {
          ...e,
          details: {
            ...e.details,
            player: {
              ...player,
              ...(live.pitching ? { pitching: { ...live.pitching } as unknown as import("../types/save").PitchingAttributes } : {}),
              ...(live.batting  ? { batting:  { ...live.batting  } as unknown as import("../types/save").BattingAttributes  } : {}),
            },
          },
        };
      });
      return { ...s, entities };
    });
  }

  function patchEntityTeams(moves: Array<{ id: string; teamId: string }>) {
    if (moves.length === 0) return;
    const moveMap = new Map(moves.map((m) => [m.id, m.teamId]));
    update((s) => ({
      ...s,
      entities: s.entities.map((e) => {
        const newTeam = moveMap.get(e.id);
        return newTeam ? { ...e, teamId: newTeam } : e;
      }),
    }));
  }

  return {
    subscribe, load, loadEntities, reloadEntities,
    reloadEvents, reloadAchievements,
    setupContentWatcher,
    applyNpcLiveStats,
    patchEntityTeams,
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
