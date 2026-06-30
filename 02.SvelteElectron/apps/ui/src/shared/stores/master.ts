import { derived, writable } from "svelte/store";
import type { EventRule, EventPool, MessageTemplate, DecisionTemplate, DecisionTemplateOption } from "../types/event";
import type { CareerStage, ManagerAttributes, CoachAttributes, CoachSpecialty } from "../types/save";
import type { DecisionEffect } from "../types/main";

export type { ManagerAttributes, CoachAttributes, CoachSpecialty };

// ?? ?덈젴쨌援ъ쥌 ????????????????????????????????????????????????
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

// ?? refs ???(refs.json 援ъ“) ?????????????????????????????????
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
  funding?: "최하" | "하" | "중" | "상" | "최상";
  difficulty?: "최하" | "하" | "중" | "상" | "최상";
  prestige?: "S" | "A" | "B" | "C" | "D";
  fanBase?: "메가" | "전국" | "광역" | "지역" | "소규모";
  facilityLevel?: 1 | 2 | 3 | 4 | 5;
  atmosphere?: "체계적" | "엄격" | "균형" | "자유로운" | "가족적";
  mediaPressure?: "낮음" | "보통" | "높음" | "매우높음";
  promoChance?: "낮음" | "보통" | "높음";
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

// ?? ?몃Ъ ?뷀떚???곸꽭 ?????????????????????????????????????????
export interface EntityManagerStats {
  motivation: number;
  development: number;
  strategy: number;
  handlePressure: number;
  handlePersonnel: number;
  injuryMgmt?: number;  // 遺??愿由?(70+ 蹂댁닔?? 40誘몃쭔 臾대━??
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
  experience: number; // ?덈꺼 1~5
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
  militaryStatus?: "미필" | "현역" | "군필" | "면제";
  militaryUnit?: "sports" | "general";
  originalLeagueId?: string;
  originalTeamId?: string;
  contract?: NpcContract;
  pitches?: import("../types/save").PitchEntry[];
}

export interface EntityDetails {
  player: EntityPlayerDetails;
  coach:   EntityCoachDetails   | null;
  manager: EntityManagerDetails | null;
  owner:   Record<string, unknown> | null;
}

// ?? ?몃Ъ ?뷀떚?????(people_*.json 援ъ“) ?????????????????????
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
  grade?: number;
  notes: string;
  militaryStatus?: "미필" | "현역" | "군필" | "면제";
  personality?: import("../types/save").NpcPersonality;
  entryYear?:   number;
  entryLeague?: string;
  entryTeam?:   string;
  entryAge?:    number;
  details: EntityDetails;
}

// ?? NPC ?쇱씠釉??ㅽ꺈 ??????????????????????????????????????????
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

// ?? 援??대깽?????????????????????????????????????????????????
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

// ?? ?ㅽ넗???곹깭 ???????????????????????????????????????????????
export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
  pitchUnlockRules: PitchUnlockRule[];
  leagues: LeagueRef[];
  schools: SchoolRef[];
  clubs: ClubRef[];
  teams: TeamRef[];
  staffEntities: EntityRow[];  // 코치·감독·구단주 (master.db에서만 로드)
  entities: EntityRow[];       // 전체 (staffEntities + gameStore.npcs 변환 결과)
  eventRules: EventRule[];
  messageTmpls: MessageTemplate[];
  decisionTmpls: DecisionTemplate[];
  eventPools: EventPool[];
  achievements: import("../utils/achievementEngine").MasterAchievement[];
  militaryCommonEvents: MilitaryEvent[];
  militarySportsEvents: MilitaryEvent[];
  militaryGeneralEvents: MilitaryEvent[];
}

// ?? masterFetch ?섑띁 (IPC ?곗꽑, fetch ?대갚) ???????????????????
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

// ?? ?대깽??JSON ?뚯꽌 ?????????????????????????????????????????
// ?쒓뎅 ?숈궗 ?곕룄 湲곗? ????二쇱감 ?쒖옉媛?(3??二? 湲곗?)
const MONTH_STARTS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];

function scheduleToWeek(month: number, weekOfMonth: number): number {
  // 3??index0, 4??index1, ..., 12??index9, 1??index10, 2??index11
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

// effects 臾몄옄??諛곗뿴 ??DecisionEffect 蹂??// ?뺤떇 ?? ["condition:-4", "xp.command:+1", "fatigue:+5", "fame:+3", "addTag.湲됱꽦??]
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
    // ???щ㎎: conditions 諛곗뿴 吏곸젒 ?ъ슜
    conditions = raw.conditions as import("../types/event").Condition[];
  } else if (raw.schedule && typeof raw.schedule === "object") {
    // 구형 포맷 처리: schedule 필드에서 week_eq + career_stage 조건 변환
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
        // 援??щ㎎: ["fatigue:+10", "xp.velocity:+3"]
        const parsed = parseEffectsArray(o.effects as string[]);
        effects = Object.keys(parsed).length > 0 ? parsed : undefined;
      } else if (o.effects && typeof o.effects === "object") {
        // ???щ㎎: { fatigueDelta: 10, xp: { velocity: 3 } }
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

// ?? Manifest ????????????????????????????????????????????????
interface Manifest {
  generatedAt: string;
  events: {
    mandatory:   string[];
    conditional: string[];
    random: { media: string[]; social: string[]; team_life: string[] };
  };
  achievements: { baseball: string[]; growth: string[]; social: string[]; hidden: string[] };
}

// entities/players/_index.json 援ъ“
interface EntityIndex {
  generated: string;
  byLeague: Record<string, string[]>;
}

interface LeagueTeamIndex {
  leagueId: string;
  activeTeamIds: string[];
}

const TEAM_NAME_MAP: Record<string, string> = {
  TEAM_UNIV_HANBBIT:              "한빛체육대학교",
  TEAM_UNIV_DONGMYUNG:            "동명과학대학교",
  TEAM_UNIV_SEOHAE:               "서해국제대학교",
  TEAM_UNIV_NAMGANG:              "남강대학교",
  TEAM_UNIV_CHEONGUN:             "청운공과대학교",
  TEAM_UNIV_MIRAE:                "미래창성대학교",
  TEAM_UNIV_GAON:                 "가온문화대학교",
  TEAM_IND_SEOUL_PIONEERS:        "서울 파이오니어스",
  TEAM_IND_BUSAN_TEMPEST:         "부산 템페스트",
  TEAM_IND_DAEGU_FALCONS:         "대구 팰컨스",
  TEAM_IND_GWANGJU_STORM:         "광주 스톰",
  TEAM_IND_DAEJEON_HUNTERS:       "대전 헌터스",
  TEAM_IND_INCHEON_ORCAS:         "인천 오르카스",
  TEAM_IND_SUWON_BLAZE:           "수원 블레이즈",
  TEAM_IND_ULSAN_PHOENIX:         "울산 피닉스",
  TEAM_HS_YEOSU_SHORE:            "여수 쇼어",
  TEAM_HS_CHUNCHEON_HIGHLAND:     "춘천 하이랜드",
  TEAM_HS_JEJU_WIND:              "제주 윈드",
  TEAM_HS_GANGWON_PEAK:           "강원 피크",
  TEAM_HS_MASAN_HARBOR:           "마산 하버",
  TEAM_HS_JECHEON_RIDGE:          "제천 릿지",
  TEAM_HS_GOYANG_ARROW:           "고양 애로우",
  TEAM_HS_SUNCHEON_BAY:           "순천 베이",
};

const TEAM_PROFILE_MAP: Record<string, TeamProfile> = {
  TEAM_UNIV_HANBBIT:         { style: "스피드형",  desc: "체육 특화 대학의 압도적인 신체 능력. 최상급 훈련 시설과 스포츠 과학 접목으로 선수 육성률이 전국 최고 수준이다. 체력과 스피드를 앞세운 야구가 특기.",  strengths: ["체력", "주루", "수비"],           funding: "상",  difficulty: "상"  },
  TEAM_UNIV_DONGMYUNG:       { style: "투지형",    desc: "영남권 대학야구를 대표하는 팀. 지역 고교 유망주를 흡수하며 탄탄한 팀을 구성하고, 수도권 명문들에 도전장을 내미는 지방의 자존심이다.",               strengths: ["투지", "수비"],                  funding: "중",  difficulty: "중"  },
  TEAM_UNIV_SEOHAE:          { style: "공격형",    desc: "고려대의 영원한 라이벌. 매 시즌 강력한 타선을 구축하며 연고전에서 리그 판도를 뒤흔든다. 공격적인 스카우팅과 적극적인 선수 육성이 장점이다.",              strengths: ["타격", "주루", "공격"],          funding: "상",  difficulty: "최상" },
  TEAM_UNIV_NAMGANG:         { style: "균형형",    desc: "한국 대학야구의 절대 명가. 풍부한 역사와 최고 수준의 코칭 스태프가 매 시즌 KBL 드래프트 다수 배출을 가능케 한다. 스카우터들이 가장 먼저 찾는 학교다.", strengths: ["투수력", "수비", "코칭"],        funding: "상",  difficulty: "최상" },
  TEAM_UNIV_CHEONGUN:        { style: "투수형",    desc: "에이스 한 명이 팀을 이끄는 투수 중심 야구의 명가. 공학 마인드의 철저한 분석 야구로 매 시즌 상위권을 유지하며, 완성형 투수 배출로 유명하다.",             strengths: ["투수력", "제구", "분석"],        funding: "상",  difficulty: "상"  },
  TEAM_UNIV_MIRAE:           { style: "균형형",    desc: "중부권의 조용한 야구부. 풍부한 지원은 없지만 선수들의 자발적인 열정으로 매 시즌 출전권을 유지한다. 저비용 고효율의 팀 운영이 특기.",                    strengths: ["투지", "작전"],                  funding: "하",  difficulty: "하"  },
  TEAM_UNIV_GAON:            { style: "균형형",    desc: "화려함보다 균형을 추구하는 팀. 매 시즌 꾸준히 중상위권을 유지하며 조용히 프로 선수를 배출해왔다. 팀 케미스트리가 강점이다.",                            strengths: ["수비", "팀워크"],                funding: "중",  difficulty: "중"  },
  TEAM_IND_SEOUL_PIONEERS:   { style: "균형형",    desc: "독립리그 최고 명문. 체계적인 운영과 풍부한 네트워크로 KBL 복귀를 꿈꾸는 선수들이 가장 선호하는 팀이다. 매 시즌 가장 많은 KBL 입단 성사를 이뤄낸다.",    strengths: ["코칭", "데이터 분석", "기회 창출"], funding: "중", difficulty: "상" },
  TEAM_IND_BUSAN_TEMPEST:    { style: "공격형",    desc: "부산 특유의 거친 기질과 뜨거운 열정이 그대로 담긴 팀. 독립리그 최고의 공격력을 자랑하며 서울 파이오니어스의 최대 라이벌로 자리매김했다.",              strengths: ["타격", "파워", "투지"],          funding: "중",  difficulty: "상"  },
  TEAM_IND_DAEGU_FALCONS:    { style: "투수형",    desc: "영남권 독립리그 대표팀. 우수한 투수 자원을 발굴하는 데 특화되어 있으며, 대구·경북 지역 고교 출신 선수들이 KBL 문을 두드리는 등용문 역할을 한다.",        strengths: ["투수력", "제구"],               funding: "하",  difficulty: "중"  },
  TEAM_IND_GWANGJU_STORM:    { style: "투지형",    desc: "호남의 투지를 담은 팀. 재정 여건은 빠듯하지만 선수들의 열정만큼은 독립리그 최고다. 약자가 강자를 꺾는 이변이 잦은, 상대 팀이 가장 경계하는 복병이다.",   strengths: ["투지", "집중력"],               funding: "하",  difficulty: "하"  },
  TEAM_IND_DAEJEON_HUNTERS:  { style: "균형형",    desc: "충청권 독립리그 유일 팀. 중부권 선수들의 활동 무대이며 꾸준히 리그 중위권을 유지한다. 재정적으로 빠듯하지만 지역 팬들의 응원이 원동력이다.",             strengths: ["수비", "작전"],                  funding: "하",  difficulty: "하"  },
  TEAM_IND_INCHEON_ORCAS:    { style: "수비형",    desc: "끈질긴 수비와 침착한 경기 운영이 특기. 항만 도시 인천의 끈기를 닮은 팀으로, 독립리그에서 가장 실점이 적은 팀으로 꾸준히 상위권을 유지한다.",             strengths: ["수비", "투수력", "집중력"],      funding: "중",  difficulty: "중"  },
  TEAM_IND_SUWON_BLAZE:      { style: "공격형",    desc: "수도권 외곽 수원의 공격적인 야구팀. 드래프트 미지명 강타자들이 모여 파워야구를 구현하며, 홈런과 장거리 타격으로 관중을 열광시키는 스타일이다.",          strengths: ["타격", "파워"],                  funding: "중",  difficulty: "중"  },
  TEAM_IND_ULSAN_PHOENIX:    { style: "균형형",    desc: "부상에서 돌아온 선수들의 재기 무대로 알려진 팀. 피닉스라는 이름처럼 다시 날아오르길 꿈꾸는 선수들로 구성되며, 강한 정신력이 팀의 상징이다.",            strengths: ["투지", "정신력", "집중력"],      funding: "하",  difficulty: "하"  },
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

// ?? batchFetch ?ы띁 ???????????????????????????????????????????
async function batchFetch<T>(ids: string[], pathFn: (id: string) => string): Promise<T[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => fetchMaster<T>(pathFn(id))));
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[];
}

// ?? ?ㅽ넗???앹꽦 ???????????????????????????????????????????????
// ── NpcSaveState → EntityRow 변환 브릿지 ─────────────────────
const _EMPTY_PITCHING = {
  ovr: 0, stamina: 0, velocity: 0, command: 0,
  control: 0, movement: 0, mentality: 0, recovery: 0,
  clutch: 0, holdRunners: 0,
} as import("../types/save").PitchingAttributes;

const _EMPTY_BATTING = {
  ovr: 0, contact: 0, power: 0, eye: 0,
  discipline: 0, speed: 0, baseInstinct: 0,
  bunting: 0, platoon: 0, fielding: 0, arm: 0, battingClutch: 0,
} as import("../types/save").BattingAttributes;

export function npcSaveStateToEntityRow(
  npc: import("../types/save").NpcSaveState,
  liveStats?: Record<string, NpcLiveStat>,
): EntityRow {
  const live = liveStats?.[npc.npcId];
  const statusMap: Record<string, EntityRow["status"]> = {
    retired: "retired", military: "military",
    injured: "injured", free_agent: "inactive",
  };
  return {
    id:             npc.npcId,
    name:           npc.name,
    nameEn:         npc.nameEn,
    role:           "player",
    age:            npc.age,
    status:         statusMap[npc.careerStatus] ?? "active",
    originLeagueId: npc.originalLeagueId ?? npc.currentLeague,
    leagueId:       npc.currentLeague,
    clubId:         npc.currentTeam,
    teamId:         npc.currentTeam,
    schoolId:       npc.schoolId ?? "",
    grade:          npc.grade,
    notes:          "",
    militaryStatus: npc.militaryStatus,
    personality:    npc.personality,
    details: {
      player: {
        playerType:        npc.playerType,
        handedness:        npc.handedness ?? "R",
        position:          npc.position,
        jerseyNumber:      npc.jerseyNumber ?? 0,
        pitching:          (live?.pitching ?? npc.pitching ?? _EMPTY_PITCHING) as import("../types/save").PitchingAttributes,
        batting:           (live?.batting  ?? npc.batting  ?? _EMPTY_BATTING)  as import("../types/save").BattingAttributes,
        positionRatings:   npc.positionRatings,
        developmentRate:   npc.developmentRate,
        potentialHidden:   npc.potentialHidden ?? 75,
        proServiceYears:   npc.proServiceYears,
        militaryStatus:    npc.militaryStatus,
        militaryEnlistYear: npc.militaryEnlistYear,
        militaryUnit:      npc.militaryUnit,
        originalLeagueId:  npc.originalLeagueId,
        originalTeamId:    npc.originalTeamId,
      },
      coach:   null,
      manager: null,
      owner:   null,
    },
  };
}

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
    staffEntities: [],
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

  // ?? manifest 湲곕컲 ?대깽??濡쒕뱶 ??????????????????????????????
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

  // ?? manifest 湲곕컲 ?낆쟻 濡쒕뱶 ???????????????????????????????
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
      // ?? 怨듯넻 ?곗씠??(蹂寃??놁쓬) ????????????????????????????
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

      // ?? manifest 湲곕컲 濡쒕뱶 (?대깽?맞룹뾽?겶룹틦由?꽣) ??????????
      let eventRules:  EventRule[] = [];
      let achievements: import("../utils/achievementEngine").MasterAchievement[] = [];

      if (manifest) {
        [eventRules, achievements] = await Promise.all([
          loadEventsFromManifest(manifest),
          loadAchievementsFromManifest(manifest),
        ]);
      } else {
        // ?? ?덇굅???대갚 (manifest ?놁쓣 ?? ???????????????????
        console.warn("[masterStore] _manifest.json ?놁쓬 ???덇굅??濡쒕뵫");
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

      // ?꾩껜 ?뷀떚???ъ쟾 濡쒕뱶 ??諛곌꼍 由ш렇 ?쒕???紐⑤뱺 ? ?좎닔 ?곗씠???꾩슂
      // loaded: true ?댄썑???ㅽ뻾?섎?濡?寃뚯엫 吏꾩엯??釉붾줈?뱁븯吏 ?딆쓬
      await reloadEntities();
    } catch (e) {
      console.warn("[masterStore] load failed", e);
      update((s) => ({ ...s, loaded: true }));
    }
  }

  // ?? 遺遺??щ줈??(?뚯씪 ?쒕∼ ?ル━濡쒕뱶?? ???????????????????
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
        console.error("[masterStore] window.projectB 없음 — npm run dev (Electron 포함) 으로 실행하세요");
        return;
      }
      // 코치·감독·구단주만 staffEntities에 저장; 선수는 connectToGameStore 구독이 담당
      const staffEntities = rows.filter(r => r.role !== "player");
      update((s) => ({
        ...s,
        staffEntities,
        entities: [...staffEntities, ...s.entities.filter(e => e.role === "player")],
      }));
    } catch (e) {
      console.warn("[masterStore] reloadEntities failed", e);
    }
  }

  // Phase 2 이후 no-op: entities는 connectToGameStore 구독에서 자동 갱신됨
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function loadEntities(_leagueId: string, _seasonYear?: number, _slotId?: string) {
    // 호출 사이트 정리는 Phase 7에서 일괄 처리
  }

  // W1 신입생 활성화용: master.db에서 entryYear == seasonYear인 플레이어 직접 조회 (store 미갱신)
  async function fetchEntryEntities(seasonYear: number): Promise<EntityRow[]> {
    if (!window.projectB?.masterLoadEntities) return [];
    try {
      const all = (await window.projectB.masterLoadEntities("", seasonYear)) as EntityRow[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return all.filter(e => e.role === "player" && (e as any).entryYear === seasonYear);
    } catch {
      return [];
    }
  }

  function connectToGameStore(
    gameStoreSubscribe: (fn: (state: { npcs: import("../types/save").NpcSaveState[] }) => void) => () => void,
    npcLiveStatsSubscribe: (fn: (stats: Record<string, NpcLiveStat>) => void) => () => void,
  ): () => void {
    let currentNpcs: import("../types/save").NpcSaveState[] = [];
    let currentLiveStats: Record<string, NpcLiveStat> = {};
    let prevNpcs: import("../types/save").NpcSaveState[] | null = null;

    function rebuild() {
      const playerEntities = currentNpcs.map(n => npcSaveStateToEntityRow(n, currentLiveStats));
      update((s) => ({ ...s, entities: [...s.staffEntities, ...playerEntities] }));
    }

    const unsub1 = gameStoreSubscribe((state) => {
      if (state.npcs !== prevNpcs) {
        prevNpcs = state.npcs;
        currentNpcs = state.npcs;
        rebuild();
      }
    });

    const unsub2 = npcLiveStatsSubscribe((stats) => {
      currentLiveStats = stats;
      rebuild();
    });

    return () => { unsub1(); unsub2(); };
  }

  // ?? ?ル━濡쒕뱶 由ъ뒪??(媛쒕컻 ?섍꼍: ?뚯씪 ?쒕∼ ???먮룞 諛섏쁺) ??
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

  // npcLiveStats??pitching/batting 媛믪쓣 entities???몃찓紐⑤━ ??뼱?곌린
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

  function syncNpcsToEntities(npcs: import("../types/save").NpcSaveState[]) {
    if (npcs.length === 0) return;
    const npcMap = new Map(npcs.map((n) => [n.npcId, n]));
    update((s) => ({
      ...s,
      entities: s.entities.map((e) => {
        const npc = npcMap.get(e.id);
        if (!npc) return e;
        const statusMap: Record<string, EntityRow["status"]> = {
          retired:    "retired",
          military:   "military",
          injured:    "injured",
          free_agent: "inactive",
        };
        return {
          ...e,
          teamId:        npc.currentTeam,
          leagueId:      npc.currentLeague,
          age:           npc.age,
          militaryStatus: npc.militaryStatus,
          status:        statusMap[npc.careerStatus] ?? "active",
        };
      }),
    }));
  }

  return {
    subscribe, load, loadEntities, reloadEntities,
    reloadEvents, reloadAchievements,
    setupContentWatcher,
    connectToGameStore,
    fetchEntryEntities,
    applyNpcLiveStats,
    patchEntityTeams,
    syncNpcsToEntities,
  };
}

export const masterStore = createMasterStore();

// ?? ?뚯깮 ?ㅽ넗?????????????????????????????????????????????????
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
