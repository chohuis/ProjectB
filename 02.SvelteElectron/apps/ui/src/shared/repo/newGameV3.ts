// ── R3a: 새 게임 생성 파이프라인 v3 (DESIGN.md §8.3) ─────────────────────
// 흐름: 생성 규칙(master 콘텐츠) → Rust 로스터 생성(worldSeed 결정적) → slot.db 생성
// 사전 생성 데이터(people_*.json, entities/players/*) 를 전혀 읽지 않는다.

import { slotRepo, type RepoNpc } from "./slotRepo";
import { buildPastStandings } from "./seedPastStandings";
import { buildPastPlayerStats } from "./seedPastPlayerStats";
import { generateDomesticStaff } from "./staffGen";
import { ALL_TEAMS_BY_LEAGUE, HS_ACTIVE_TEAMS_V3 } from "../utils/leagueScheduler";
import { SANGMU_TEAM_IDS } from "../utils/ids";
import { isForeignInQuotaLeague, isForeignPlayer } from "../utils/foreignSlots";
import { originRulesOf } from "../utils/foreignOrigin";
import { buildForeignSeed } from "../utils/foreignSeed";

/**
 * 리그별 이름 풀 (generation_rules.json rosterRules[리그].namePool).
 *
 * ⚠ **짝 배열의 인덱스가 1:1이어야 한다** — 어긋나면 김씨가 Lee로 나온다.
 * 일본은 한글이 원본이고 `surnamesEn`이 짝, 서양은 영문이 원본이고
 * `surnamesKo`가 짝이다.
 */
export interface NamePoolData {
  surnames: string[]; givenA: string[]; givenB: string[];
  western?: boolean;
  /** 성-이름 구분자. 일본식은 " "(사토 하루토), 한국식은 ""(김우찬) */
  sep?: string;
  surnamesEn?: string[]; givenAEn?: string[];
  surnamesKo?: string[]; givenAKo?: string[];
}

// Rust RosterRules와 1:1 (generation_rules.json rosterRules[leagueId])
export interface RosterRulesData {
  rosterSize: number;
  pitchingOvrMin: number; pitchingOvrMax: number;
  battingOvrMin: number; battingOvrMax: number;
  devRateMin: number; devRateMax: number;
  gradeMax?: number; ageBase?: number;
  ageMin?: number; ageMax?: number;
  pitcherRatio?: number;
  withContract?: boolean;
  nationality?: string;
  /**
   * 매 시즌 오프시즌에 강제되는 팀당 유지 인원. `rosterSize`(생성 인원)와 다르다.
   * 예전엔 상한이 Rust와 TS에 각각 하드코딩돼 있었고 둘 다 이 파일과 달랐다
   * (KBL 상한 65 vs 생성 30) — 그 65가 1군+2군 합산에 걸려 프로가 부풀었다
   */
  rosterMin?: number;
  rosterMax?: number;
  /**
   * 리그 이름 풀. **규칙 파일에 있는데 타입에 없어서 안 보였다** —
   * 그래서 호출부가 넘길 생각을 못 했고 해외가 한국 이름으로 찼다.
   */
  namePool?: NamePoolData;
}

export interface GenerationRulesFile {
  version: number;
  rosterRules: Record<string, RosterRulesData>;
  /** 연봉 모델 (Phase 6.5). Rust로 그대로 넘긴다 — TS는 해석하지 않는다 */
  salaryRules?: unknown;
  /** 전력★ → OVR 보정 (Phase 6.5) */
  powerRules?: unknown;
  /** 과거 경력 생성 (Phase 6.5) */
  careerHistoryRules?: unknown;
  /** 군경팀(상무) 로스터 · 연간 입대 규모 (Phase 6.5 · 7-3) */
  militaryRules?: unknown;
  /** 시즌 개인 수상 — 부문·최소 출전 조건. 읽는 곳: usecases/seasonAwards.ts */
  awardRules?: unknown;
  /** 은퇴 판정 — NPC(`weekPhases/injuries`)와 주인공(`advanceWeek`)이 같이 읽는다 */
  retirementRules?: unknown;
  /**
   * 외국인 선수 — 보유 한도·능력 범위·서양식 이름 풀. Rust로 그대로 넘긴다.
   * `leagues`에 든 리그의 **1군 로스터에만** 적용된다.
   */
  foreignRules?: { leagues?: string[]; [key: string]: unknown };
  /**
   * 육성선수 — 2군 보충 생성 조건과 **신분 조건**.
   *
   * `salary`는 미지명자·방출자가 2군으로 갈 때 붙는 연봉이고, 최저연봉(3000)
   * 보다 낮아야 한다. 등록 제한(입단 연도 5월)은 `utils/developmentPlayer.ts`
   */
  developmentPlayerRules?: {
    leagues?: string[];
    minPitchers?: number;
    minBatters?: number;
    maxPerYear?: number;
    salary?: number;
    /** 팀당 육성선수 보유 상한 — **정식 정원 위에 얹는다**(정원 밖 인원) */
    intakeMax?: number;
    [key: string]: unknown;
  };
  /**
   * 재능 분포 — 천장(`potentialMult*`)과 상위 꼬리. Rust로 그대로 넘긴다.
   *
   * ⚠ **세 생성 경로가 같은 값을 받아야 한다** (초기 세계·매년 신입생·용병).
   * 예전엔 신입생만 `ovrMax * 1.15` 고정이라 재능 편차가 아예 없었고,
   * 창단 세대가 은퇴하면 리그가 영구히 얇아졌다.
   */
  talentRules?: Record<string, unknown>;
  /** 11월 통합 드래프트 — 라운드 수·나이 게이트·얼리 신청 하한·신인 계약 (Phase 7-1) */
  draftRules?: {
    rounds?: number;
    firstTeamRounds?: number;
    contract?: import("../utils/draftSalaryTable").DraftContractRules;
    [key: string]: unknown;
  };
  /** 1군 ↔ 2군 승강 판정 (Phase 7-2). Rust로 그대로 넘긴다 */
  promotionRules?: unknown;
  /** 국가대표 · 국제대회 (Phase 7-3) */
  internationalRules?: unknown;
  /** FA 자격·등급·보상선수 · 방출 2단계 (Phase 7-4) */
  faRules?: unknown;
}

export interface NewGameV3Options {
  slotId: string;
  slotName?: string;
  seasonYear: number;
  /** ProtagonistSave — 그대로 저장 (스키마는 gameStore 소관) */
  protagonist: unknown;
  /** 초기 시즌 상태 (슬림 — npcs/npcLiveStats 없음) */
  season: unknown;
  worldSeed?: number;
  /** 활성화할 시작 리그 팀 목록 (기본: 고교 10팀) */
  teams?: { teamId: string; schoolId?: string }[];
  /** 시나리오 Named NPC — 콘텐츠 정의에서 변환해 전달 (없으면 배경만) */
  namedNpcs?: Partial<RepoNpc>[];
  /**
   * refs.json 전체 팀 — 스태프 생성 입력 (Phase 6A).
   *
   * 선수는 시작 리그만 만들지만 **스태프는 국내 전 팀을 한 번에** 만든다.
   * power·traits.resource가 생성 보정에 쓰이므로 refs 원본이 필요하다.
   */
  allTeams?: import("../stores/master").TeamRef[];
}

export interface NewGameV3Result {
  slotId: string;
  worldSeed: number;
  npcCount: number;
  staffCount: number;
}

/** 리그 로스터 생성 파라미터 조립 (Rust generateLeagueRosterNative 입력) */
export function buildRosterParams(
  leagueId: string,
  seasonYear: number,
  worldSeed: number,
  teams: { teamId: string; schoolId?: string; salaryIndex?: number; power?: number;
           budget?: number; spendRatio?: number; qualityBias?: number }[],
  rules: RosterRulesData,
  /**
   * 이름 풀 **덮어쓰기**. 보통은 넘기지 않는다 — 안 넘기면 `rules.namePool`을 쓴다.
   *
   * 🔴 **부르는 쪽이 풀을 고르면 반드시 빠뜨린다.** 예전엔 이 인자가 유일한
   * 갈림길이었고, 새 게임 경로가 `undefined`를 하드코딩해서 ABL 448명·JBL
   * 336명이 **전원 한국 이름**으로 만들어졌다(강정재/Jung-jae Kang). 규칙
   * 파일에도, Rust에도 풀이 다 있는데 잇는 선만 없었다.
   *
   * 리그 활성화 경로는 같은 결함을 **자기 자리에서만** 막고 있었다 —
   * 한 경로를 고쳐도 다른 경로가 새는 형태라, 폴백을 여기로 올린다.
   */
  namePool?: NamePoolData,
  salaryRules?: unknown,
  powerRules?: unknown,
  entryRules?: unknown,
  foreign?: unknown,
  // ⚠ **재능 분포는 신입생 생성과 같은 정본을 써야 한다.** 여기만 분산이 있고
  // 신입생이 고정값이면 창단 세대만 에이스가 되고 리그가 해마다 얇아진다.
  talent?: unknown,
) {
  return {
    leagueId,
    seasonYear,
    worldSeed: worldSeed >>> 0,
    teams: teams.map((t) => ({
      teamId: t.teamId,
      schoolId: t.schoolId ?? "",
      ...(t.salaryIndex !== undefined ? { salaryIndex: t.salaryIndex } : {}),
      ...(t.power !== undefined ? { power: t.power } : {}),
      // 🔴 **예산이 팀 편성을 정한다** (사용자 확정 2026-08-31).
      //   예전엔 전 팀이 똑같이 `rosterSize` 명이었고 예산은 연봉에만 갔다.
      // ⚠ 안 넘기면 예전과 같다 — 생성이 기준 정원을 그대로 쓴다.
      ...(t.budget !== undefined ? { budget: t.budget } : {}),
      ...(t.spendRatio !== undefined ? { spendRatio: t.spendRatio } : {}),
      ...(t.qualityBias !== undefined ? { qualityBias: t.qualityBias } : {}),
    })),
    rules,
    // 정본은 `rosterRules[리그].namePool` 하나다. 인자는 덮어쓰기일 뿐이다
    ...((namePool ?? rules.namePool) ? { namePool: namePool ?? rules.namePool } : {}),
    ...(salaryRules ? { salaryRules } : {}),
    ...(powerRules ? { powerRules } : {}),
    ...(entryRules ? { entryRules } : {}),
    ...(foreign ? { foreign } : {}),
    ...(talent ? { talent } : {}),
  };
}

/**
 * 이 리그가 외국인 슬롯을 쓰는가 — `foreignRules.leagues`가 정본이다.
 *
 * ⚠ **1군만이다.** `LEAGUE_KBL_FARM`은 목록에 없고, 있어서도 안 된다 —
 * 2군에 외국인을 깔면 보유 한도(3명) 계산이 흐려진다.
 */
export function foreignSlotsFor(
  leagueId: string,
  rulesFile: GenerationRulesFile,
): unknown | undefined {
  const fr = rulesFile.foreignRules;
  return fr?.leagues?.includes(leagueId) ? fr : undefined;
}

/**
 * **구단 성향 → 편성 두 축** (사용자 확정 2026-08-31).
 *
 * "모든 팀이 골고루 잘할 수는 없어. 예산·상황·드래프트·육성 등 다양한
 * 변수를 통해서 다양한 팀 컬러가 있는 거야"
 *
 * ```
 *   spendRatio    예산의 몇 %를 선수 연봉에 쓰나 (나머지는 FA·트레이드·
 *                 드래프트에 남긴다) — `resource` 에서 온다
 *   qualityBias   같은 돈을 인원 많이(0) 쓰나 선수 좋게(1) 쓰나
 *                 — `philosophy` 에서 온다
 * ```
 *
 * ⚠ **ABL·JBL 은 `traits` 가 비어 있다**(실측 · 28팀 전부). 그쪽은
 *   `power`(전력★ 1~5)로 떨어진다 — 강팀일수록 질적으로 본다.
 * ⚠ 값이 하나도 없으면 `undefined` 를 낸다 — 엔진이 예전 동작으로 간다.
 * ⚠ 표를 여기 한 벌만 둔다. 성향 이름은 `refs.json` 이 정본이다.
 */
const SPEND_BY_RESOURCE: Record<string, number> = {
  // 궁핍한 팀은 남길 여유가 없다 — 있는 걸 다 쓴다
  궁핍: 1.00,
  // 알뜰한 팀은 아껴 두고 시장에서 기회를 본다
  알뜰: 0.75,
  안정: 0.85,
  // 부유한 팀은 많이 쓰되 여유도 크다
  부유: 0.90,
};

const QUALITY_BY_PHILOSOPHY: Record<string, number> = {
  // 인원을 많이 데리고 키운다
  육성중심: 0.20,
  "젊은피(세대교체)": 0.25,
  "스파르타(혹독훈련)": 0.30,
  "부상방지/재활특화": 0.35,
  // 중간
  "근성/언더독": 0.45,
  스몰볼: 0.45,
  "수비/짜임새": 0.50,
  데이터중심: 0.50,
  "전통/정통": 0.55,
  // 좋은 선수를 적게
  투수왕국: 0.65,
  "공격야구(화력)": 0.70,
  베테랑우대: 0.75,
};

/**
 * 팀 연간 예산(만원). `refs.json` 은 원 단위라 10,000으로 나눈다.
 *
 * ⚠ **연봉이 없는 리그는 넘기면 안 된다** — 고교·대학은 예산이
 *   있어도 그건 운영비지 인건비가 아니다. 그쪽은 엔진이 `league_mult` 가
 *   없어 1인 연봉을 못 구하므로 안전하게 예전 동작으로 떨어진다.
 */
export function budgetOf(t: { history?: { budget?: number | null } | null }): number | undefined {
  const b = t.history?.budget;
  return typeof b === "number" && b > 0 ? Math.round(b / 10000) : undefined;
}

export function squadPlanOf(t: {
  traits?: { philosophy?: string; resource?: string } | null;
  power?: number | null;
}): { spendRatio?: number; qualityBias?: number } {
  const res = t.traits?.resource;
  const phi = t.traits?.philosophy;
  const spendRatio = res ? SPEND_BY_RESOURCE[res] : undefined;
  // ⚠ 성향이 없으면 전력★로 떨어진다 — ABL·JBL 28팀이 그렇다.
  //   1~5 를 0.3~0.7 로 편다. 강팀일수록 질적이다.
  const qualityBias = phi !== undefined ? QUALITY_BY_PHILOSOPHY[phi]
    : (typeof t.power === "number" ? 0.3 + (t.power - 1) * 0.1 : undefined);
  return {
    ...(spendRatio !== undefined ? { spendRatio } : {}),
    ...(qualityBias !== undefined ? { qualityBias } : {}),
  };
}

/**
 * 팀 예산 지수 = 그 팀 예산 / 리그 평균 예산.
 *
 * 연봉이 팀 사정을 반영하는 **유일한 입력**이다. 예산이 없는 팀(고교·대학 등
 * 계약 자체가 없는 리그, 또는 데이터 누락)은 1.0(평균팀)으로 둔다 —
 * 0으로 두면 그 팀 선수 연봉이 전부 최저연봉으로 깔린다.
 *
 * 2군은 **같은 구단 1군의 지수를 물려받는다.** 별도 예산이 없고,
 * 실제로도 모기업 사정이 2군 연봉을 정한다.
 */
export function buildSalaryIndex(
  teams: import("../stores/master").TeamRef[],
): Map<string, number> {
  const out = new Map<string, number>();
  const byLeague = new Map<string, import("../stores/master").TeamRef[]>();
  for (const t of teams) {
    if (!byLeague.has(t.leagueId)) byLeague.set(t.leagueId, []);
    byLeague.get(t.leagueId)!.push(t);
  }
  for (const [, list] of byLeague) {
    const budgets = list.map((t) => t.history?.budget ?? 0).filter((b) => b > 0);
    if (budgets.length === 0) continue;
    const avg = budgets.reduce((a, b) => a + b, 0) / budgets.length;
    if (avg <= 0) continue;
    for (const t of list) {
      const b = t.history?.budget ?? 0;
      out.set(t.id, b > 0 ? b / avg : 1.0);
    }
  }
  // 2군(_2)은 1군(_1) 지수를 물려받는다
  for (const t of teams) {
    if (!t.id.endsWith("_2")) continue;
    const first = t.id.replace(/_2$/, "_1");
    if (out.has(first)) out.set(t.id, out.get(first)!);
  }
  return out;
}

export async function loadRosterRules(): Promise<GenerationRulesFile> {
  const raw = (await window.projectB!.masterFetch("players/generation_rules.json")) as GenerationRulesFile | null;
  if (!raw?.rosterRules) throw new Error("[newGameV3] generation_rules.json rosterRules 없음 — v2 데이터 필요");
  return raw;
}

/**
 * 국내 리그 — 새 게임에서 **전부** 로스터를 만든다.
 *
 * v1은 시작 리그(고교)만 만들고 나머지는 Lazy였다. v2에서 반경 게이트가
 * "국내 전 리그 상시 풀 시뮬"로 개정되면서(DESIGN §2) 그 전제가 깨졌다 —
 * 로스터 없는 리그의 경기가 시뮬되면 **빈 로스터로 항상 0-0, 홈팀 승**이 된다.
 * 시즌1에 대학 225 + 프로 720 + 2군 495경기가 그렇게 처리되고 있었다.
 *
 * Lazy를 유지할 이유도 없다 — 국내 전 리그 로스터 생성이 합쳐서 1,580명·35ms다.
 * **Lazy 활성화는 이제 해외(ABL·JBL) 전용이다.**
 */
/**
 * ⚠ **이름이 `DOMESTIC_`인데 2026-08-20부터 해외도 들어 있다** (사용자 확정).
 * 해외를 국내와 같이 풀 시뮬하기로 하면서 로스터도 처음부터 만든다 —
 * `radiusGate`가 해외를 반경 1로 올렸는데 로스터가 없으면 **빈 로스터로 항상
 * 0-0 홈팀 승**이 된다. 위에 적힌 그 결함이 해외에서 그대로 재현된다.
 *
 */
const ROSTER_LEAGUES = [
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
  "LEAGUE_KBL_FARM",
  "LEAGUE_ABL",
  "LEAGUE_ABL_FARM",
  "LEAGUE_JBL",
  "LEAGUE_JBL_FARM",
] as const;

async function generateLeagueNpcs(
  leagueId: string,
  seasonYear: number,
  worldSeed: number,
  teams: { teamId: string; schoolId?: string; salaryIndex?: number; power?: number;
           budget?: number; spendRatio?: number; qualityBias?: number }[],
  rules: RosterRulesData,
  salaryRules?: unknown,
  powerRules?: unknown,
  entryRules?: unknown,
  foreign?: unknown,
  talent?: unknown,
): Promise<Partial<RepoNpc>[]> {
  const params = buildRosterParams(
    leagueId, seasonYear, worldSeed, teams, rules, undefined,
    salaryRules, powerRules, entryRules, foreign, talent);
  const gen = JSON.parse(
    await window.projectB!.engine("generateLeagueRosterNative", JSON.stringify(params))
  ) as { npcs?: Partial<RepoNpc>[]; error?: string };
  if (!Array.isArray(gen.npcs)) {
    throw new Error(`[newGameV3] ${leagueId} 로스터 생성 실패: ${gen.error ?? "unknown"}`);
  }
  return gen.npcs;
}

// ── 팀 미리보기 (새 게임 화면) ────────────────────────────────────
//
// 팀을 고를 때 "이 사람들과 뛴다"를 보여준다. 실측:
//   선수  한 팀 30명 0.6ms (102팀 전체는 116ms)
//   스태프 한 팀  4명 0ms  (182팀 전체는 12ms)
// 그리고 **한 팀만 뽑은 결과가 전체를 뽑았을 때의 그 팀과 완전히 같다** —
// 이름도 능력치도. 그래서 예고가 아니라 사실이다.
//
// ⚠ **파라미터를 하나라도 빠뜨리면 조용히 어긋난다.** 최소 파라미터로 뽑으면
// 이름은 같은데 OVR이 65 → 69로 달라졌다. 그래서 화면이 조립하지 않고
// 여기서 `createNewGameV3`와 **같은 조립을 쓴다.**

export interface TeamPreview {
  npcs: Partial<RepoNpc>[];
  staff: import("./staffGen").StaffRow[];
}

/**
 * 한 팀의 로스터·스태프를 실제 생성과 **같은 값으로** 미리 뽑는다.
 *
 * ⚠ `worldSeed`는 나중에 `createNewGameV3`에 넘길 것과 **같아야 한다.**
 * 다르면 미리보기가 거짓말이 된다 — 화면이 시드를 먼저 정해 둘 다에 넘긴다.
 */
export async function previewTeamRoster(
  teamId: string,
  seasonYear: number,
  worldSeed: number,
  allTeams: import("../stores/master").TeamRef[],
): Promise<TeamPreview> {
  const rulesFile = await loadRosterRules();
  const team = allTeams.find((t) => t.id === teamId);
  if (!team) return { npcs: [], staff: [] };

  const rules = rulesFile.rosterRules[team.leagueId];
  if (!rules) return { npcs: [], staff: [] };

  // createNewGameV3와 같은 입력을 만든다
  const salaryIndex = buildSalaryIndex(allTeams);
  const entryRules = (rulesFile.careerHistoryRules as { entry?: unknown } | undefined)?.entry;

  const npcs = await generateLeagueNpcs(
    team.leagueId, seasonYear, worldSeed,
    [{
      teamId,
      schoolId: team.schoolId ?? "",
      salaryIndex: salaryIndex.get(teamId),
      power: team.power,
      // 🔴 예산과 편성 성향 — 안 넘기면 예전처럼 전 팀이 같은 인원이 된다
      budget: budgetOf(team),
      ...squadPlanOf(team),
    }],
    rules,
    rulesFile.salaryRules, rulesFile.powerRules, entryRules,
    foreignSlotsFor(team.leagueId, rulesFile), rulesFile.talentRules,
  );

  const { generateStaffForTeams } = await import("./staffGen");
  const staff = await generateStaffForTeams([team], worldSeed, seasonYear);

  return { npcs, staff };
}

/**
 * 새 게임 슬롯 생성 (클린 브레이크 — v3 전용).
 * **국내 전 리그**를 활성화한다. 해외(ABL·JBL)만 진출 시점에 Lazy 생성.
 */
export async function createNewGameV3(opts: NewGameV3Options): Promise<NewGameV3Result> {
  const worldSeed = (opts.worldSeed ?? Date.now()) >>> 0;
  const rulesFile = await loadRosterRules();
  const hsRules = rulesFile.rosterRules["LEAGUE_HIGHSCHOOL"];
  if (!hsRules) throw new Error("[newGameV3] LEAGUE_HIGHSCHOOL rosterRules 없음");

  // 팀 예산 지수 — 연봉이 팀 사정을 반영하는 유일한 입력 (Phase 6.5)
  const salaryIndex = buildSalaryIndex(opts.allTeams ?? []);
  const salaryRules = rulesFile.salaryRules;
  const powerRules = rulesFile.powerRules;
  // 입단 경로 규칙 — 로스터 생성이 이걸로 연차를 역산하고, 경력 이력이 같은
  // 규칙으로 출신을 읽는다. **한 곳에서 나와야 둘이 어긋나지 않는다**
  const entryRules = (rulesFile.careerHistoryRules as { entry?: unknown } | undefined)?.entry;
  // 전력★ — 명문팀 로스터가 실제로 강해지는 유일한 입력 (Phase 6.5)
  const powerOf = new Map((opts.allTeams ?? []).map((t) => [t.id, t.power]));
  // 예산과 편성 성향을 같이 찾는다 — 한 자리에서 만들어야 갈리지 않는다
  const teamOf = new Map((opts.allTeams ?? []).map((t) => [t.id, t]));
  const withIndex = (ids: string[]) =>
    ids.map((teamId) => {
      const t = teamOf.get(teamId);
      return {
        teamId,
        salaryIndex: salaryIndex.get(teamId),
        power: powerOf.get(teamId),
        ...(t ? { budget: budgetOf(t), ...squadPlanOf(t) } : {}),
      };
    });

  const teams = opts.teams ?? HS_ACTIVE_TEAMS_V3.map((teamId) => ({ teamId }));
  const hsNpcs = await generateLeagueNpcs(
    "LEAGUE_HIGHSCHOOL", opts.seasonYear, worldSeed,
    teams.map((t) => {
      const ref = teamOf.get(t.teamId);
      return { ...t, salaryIndex: salaryIndex.get(t.teamId), power: powerOf.get(t.teamId),
        ...(ref ? { budget: budgetOf(ref), ...squadPlanOf(ref) } : {}) };
    }),
    hsRules, salaryRules, powerRules, entryRules);

  // 나머지 국내 리그 — 팀 목록은 leagueScheduler가 정본이다 (refs에서 파생)
  const otherNpcs: Partial<RepoNpc>[] = [];
  for (const lid of ROSTER_LEAGUES) {
    const rules = rulesFile.rosterRules[lid];
    if (!rules) {
      console.warn(`[newGameV3] ${lid} rosterRules 없음 — 이 리그는 빈 로스터로 남는다`);
      continue;
    }
    const ids = ALL_TEAMS_BY_LEAGUE[lid] ?? [];
    const leagueTeams = withIndex(ids.filter((id) => !SANGMU_TEAM_IDS.has(id)));
    if (leagueTeams.length === 0) continue;
    otherNpcs.push(
      ...(await generateLeagueNpcs(
        lid, opts.seasonYear, worldSeed, leagueTeams, rules,
        salaryRules, powerRules, entryRules, foreignSlotsFor(lid, rulesFile))));
  }

  // ── 군경팀(상무) — 복무 중인 선수로 채운다 (Phase 6.5) ─────
  // 별도 생성이고 원소속만 실재 프로/2군 팀으로 지정한다 (사용자 확정).
  // 원팀에서 빼내면 8포지션 백업 보장이 깨진다.
  const militaryNpcs = await generateMilitaryRoster(
    opts.seasonYear, worldSeed, rulesFile.militaryRules);

  const npcs = [...hsNpcs, ...otherNpcs, ...militaryNpcs, ...(opts.namedNpcs ?? [])];

  // 스태프 국내 전원 일괄 생성 (Phase 6A). 선수와 달리 Lazy가 아니다 —
  // "이 팀 감독이 아직 없을 수 있다"를 모든 조회 경로가 고려하면 버그가 난다
  // (v1 드래프트 풀 부족 버그가 정확히 이 원인이었다 — people.md §2-1).
  const staff = await generateDomesticStaff(opts.allTeams ?? [], worldSeed, opts.seasonYear);

  // ── 과거 5년 개인 성적 (실플 ⑪) ───────────────────────────────
  //
  // A5는 **팀 순위만** 만들었다. 실제로 플레이해 보니 선수 상세의 연도별
  // 성적이 늘 비어 있어 **세계가 어제 시작한 것처럼** 보였다.
  //
  // **프로 1·2군만** 만든다(사용자 확정 2026-08-26) — 화면에 뜨는 선수가
  // 거의 다 이 층이고, 고교 1학년은 5년 전에 야구를 안 했을 수 있다.
  //
  // 🔴 **`careerHistory` 필드에 붙인다.** `career_history` 테이블에 따로
  //   넣어 봤더니 화면이 0건을 봤다 — 선수 상세는 `npc.careerHistory`를 읽는다.
  //   **재는 자리와 쓰는 자리가 달랐다.**
  // ⚠ `createSlot` **앞**이어야 한다 — 거기서 NPC가 DB로 들어간다.
  // ⚠ 실패해도 새 게임은 성립해야 한다.
  // ── 과거 경력 (Phase 6.5) — **만들기는 여기, 쓰기는 `createSlot` 뒤** ──
  //
  // 🔴 순서가 바뀌면 D-2 가 돌아온다 (B-29 · 사용자 확정 ②). 아래 과거 성적이
  //   **연도별 소속팀을 이 결과에서 읽는다** — 예전엔 현재 팀을 5년 내내
  //   박아서 같은 모달의 「팀 이력」과 정면으로 어긋났다.
  // ⚠ 쓰기는 여전히 `createSlot` 뒤여야 한다 — 거기서 `transactions` 를 비운다.
  let careerSeed: CareerHistorySeed = { rows: [], teamByYear: new Map() };
  try {
    careerSeed = await buildCareerHistorySeed(
      worldSeed, opts.seasonYear, npcs, rulesFile.careerHistoryRules,
      (rulesFile.faRules as { eligibleYears?: Record<string, number> } | undefined)?.eligibleYears);
  } catch (e) {
    console.warn("[newGameV3] 과거 경력 생성 실패 — 이력 없이 시작", e);
  }

  try {
    const past = buildPastPlayerStats(
      npcs.map((n) => ({
        npcId: n.npcId ?? "",
        leagueId: n.currentLeague ?? "",
        teamId: n.currentTeam ?? "",
        age: n.age ?? 0,
        // ⚠ 투수는 투구 OVR, 타자는 타격 OVR — 섞으면 엉뚱한 과거가 나온다
        ovr: (n.playerType === "pitcher"
          ? n.abilities?.pitching?.ovr
          : n.abilities?.batting?.ovr) ?? 60,
        playerType: n.playerType === "pitcher" ? "pitcher" as const : "batter" as const,
        // 그 해 소속팀 — 이력이 없는 사람은 `undefined` 라 현재 팀으로 떨어진다
        teamByYear: careerSeed.teamByYear.get(n.npcId ?? ""),
      })),
      worldSeed, opts.seasonYear);
    const byNpc = new Map<string, typeof past>();
    for (const r of past) byNpc.set(r.npcId, [...(byNpc.get(r.npcId) ?? []), r]);
    for (const n of npcs) {
      const rows = byNpc.get(n.npcId ?? "");
      if (!rows?.length) continue;
      // 🔴 **`extra`로 간다** — `RepoNpc`엔 `careerHistory`가 없고,
      //   `npcAdapter`가 `extra.careerHistory`를 세이브 필드로 되돌린다.
      // ⚠ 오래된 해부터 — 화면이 그 순서를 뒤집어 최근부터 보여준다
      const ex = (n.extra ??= {});
      const prev = (ex.careerHistory as unknown[] | undefined) ?? [];
      ex.careerHistory = [...prev, ...rows
        .slice().sort((x, y) => x.year - y.year)
        .map((r) => ({ year: r.year, leagueId: r.leagueId, teamId: r.teamId,
          statLine: r.statLine, highlights: [], stats: r.stats }))];
    }
  } catch (e) {
    console.warn("[newGameV3] 과거 성적 생성 실패 — 연도별 성적 없이 시작", e);
  }

  await slotRepo.createSlot({
    slotId: opts.slotId,
    worldSeed,
    name: opts.slotName,
    protagonist: opts.protagonist,
    season: opts.season,
    npcs,
    staff,
  });
  await slotRepo.setMeta(opts.slotId, {
    career_stage: "highschool",
    season_year: opts.seasonYear,
    current_week: 0,
  });

  // ── 과거 경력 쓰기 (Phase 6.5) ───────────────────────────────
  // createSlot **뒤에** 넣는다 — createSlot이 transactions를 비우기 때문이다.
  // **만들기는 위에서 이미 끝났다** — 과거 성적이 그 결과를 봐야 해서다(D-2).
  // 실패해도 새 게임 자체는 성립해야 하므로 여기서 던지지 않는다.
  try {
    if (careerSeed.rows.length > 0) {
      await slotRepo.addTransactions(opts.slotId, careerSeed.rows);
    }
  } catch (e) {
    console.warn("[newGameV3] 과거 경력 저장 실패 — 이력 없이 시작", e);
  }

  // ── 과거 5년 순위 (A5) ────────────────────────────────────────
  //
  // 첫 시즌에 **역대 기록이 0건**이었다 — 리그 화면의 연도 선택이 비어 있고
  // 역대 수상(A2)도 보여줄 과거가 없었다.
  //
  // **팀 순위만 만든다.** 선수 개인은 NPC 7,300명 × 5년 = 36,500행이라 비싸다.
  //
  // ⚠ **행 수를 잘못 적고 있었다** (2026-09-01 · 트랙 C 가 실측으로 잡았다).
  //   "238팀 × 5년 ≈ 1,190행"이라 적혀 있었는데 실제로는 **190행**이다 —
  //   `buildPastStandings` 가 `PAST_LEAGUES`(KBL·ABL·JBL)의 **1군만** 담는다
  //   (`_1` 접미사 · "2군은 순위표를 안 쓴다"). 프로 38팀 × 5년 = 190.
  //
  //   **코드가 아니라 주석이 틀렸다.** 필터는 의도대로다 — 아마추어(고교·
  //   대학·독립)에 가짜 과거 순위를 넣을지는 **기획 판단**이고 아직 안 정했다.
  //
  // ⚠ 실패해도 새 게임은 성립해야 한다 — 위 `seedCareerHistory`와 같은 규칙이다.
  try {
    const past = buildPastStandings(opts.allTeams ?? [], worldSeed, opts.seasonYear);
    for (const [year, rows] of past) {
      await window.projectB!.seasonSaveHistoryStandings(
        JSON.stringify({ slotId: opts.slotId, seasonYear: year, rows }));
    }
  } catch (e) {
    console.warn("[newGameV3] 과거 순위 생성 실패 — 연감 없이 시작", e);
  }

  return { slotId: opts.slotId, worldSeed, npcCount: npcs.length, staffCount: staff.length };
}

/**
 * 군경팀 로스터 — 복무 중인 선수 + 계급 + 전역 연도.
 *
 * 원소속은 **프로 1군·2군에서만** 고른다. 전역하면 거기로 돌아가는데,
 * 없는 팀을 넣으면 돌아갈 곳이 사라진다.
 */
async function generateMilitaryRoster(
  seasonYear: number,
  worldSeed: number,
  rules: unknown,
): Promise<Partial<RepoNpc>[]> {
  if (!rules) return [];
  const originTeams = [
    ...(ALL_TEAMS_BY_LEAGUE.LEAGUE_KBL ?? []).map((teamId) => ({ teamId, leagueId: "LEAGUE_KBL" })),
    ...(ALL_TEAMS_BY_LEAGUE.LEAGUE_KBL_FARM ?? []).map((teamId) => ({ teamId, leagueId: "LEAGUE_KBL_FARM" })),
  ];
  if (originTeams.length === 0) return [];

  const raw = await window.projectB!.engine("generateMilitaryRosterNative", JSON.stringify({
    worldSeed: worldSeed >>> 0, seasonYear, rules, originTeams,
  }));
  const parsed = JSON.parse(raw) as { npcs?: Partial<RepoNpc>[]; error?: string };
  if (!Array.isArray(parsed.npcs)) {
    console.warn("[newGameV3] 상무 로스터 생성 실패 — 빈 팀으로 진행", parsed.error);
    return [];
  }
  return parsed.npcs;
}

/** 계약·이적이 있는 리그. 학교 리그(고교·대학)엔 그런 개념이 없다 */
const CONTRACT_LEAGUES: ReadonlySet<string> = new Set([
  "LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_INDEPENDENT",
  // 해외를 열면서 빠져 있었다 — ABL·JBL 선수는 과거 이적이 **0건**이었다
  // (국내는 1,254건). 12년차 베테랑도 한 팀에서만 뛴 세계였다
  "LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM",
]);

/**
 * **입단 경로를 안 적는 리그.**
 *
 * 🔴 `careerHistoryRules.entry`는 KBO 기준이다 — 고졸 20세 · 대졸 24세 ·
 * 라운드 지명. 해외에 그대로 쓰면 **"미국 선수가 한국 고졸 입단"**이 된다.
 * 예전에 KBL 용병 30명이 전원 `육성선수 입단 (독립)`으로 기록된 실측이 있다:
 *
 *     2024  Martinez  육성선수 입단 (독립)
 *
 * **틀린 기록은 없는 것보다 나쁘다**(사용자 확정) — 이적만 남긴다.
 * 리그별 입단 규칙을 정하면 그때 이 목록에서 뺀다.
 */
const NO_ENTRY_ROUTE_LEAGUES: ReadonlySet<string> = new Set([
  "LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM",
]);

/**
 * 새 게임 시점의 과거 경력을 만들어 `transactions`에 넣는다 (Phase 6.5).
 *
 * 예전엔 전원이 현 소속팀에서만 뛴 것처럼 보였다 — 12년차 베테랑도 이적 한 번
 * 없는 세계였다. 여기서 만든 기록은 리그 화면 "리그 기록" 탭에 바로 뜨고,
 * Phase 7-1 드래프트·7-4 FA가 같은 테이블에 쓰므로 과거와 미래가 이어진다.
 *
 * 리그별로 나눠 돌린다 — **과거 소속팀은 같은 리그에서만 골라야 한다.**
 */
/**
 * 과거 경력 한 벌 — **행과 「그 해 어느 팀이었나」를 같이 낸다** (B-29 D-2).
 *
 * 🔴 **쓰기와 갈랐다.** 예전엔 이 함수가 `createSlot` 뒤에 한 번에 돌았는데
 *   (거기서 `transactions` 를 비우므로 뒤여야 한다), 그러면 **과거 성적
 *   생성(`buildPastPlayerStats`)이 이력을 못 본다** — 그쪽은 `createSlot`
 *   앞에서 `npc.extra` 에 붙기 때문이다. 그래서 같은 모달 안에서
 *   「팀 이력」은 `2022 트레이드 A → B` 라 적는데 「연도별 성적」은 2022 년도
 *   **B 팀**으로 적고 있었다(KBL 1군 이적자 39% 전부).
 *
 *   이제 **만들기는 앞, 쓰기는 뒤**다. 순서가 바뀌면 그 어긋남이 돌아온다.
 */
interface CareerHistorySeed {
  rows: Array<Record<string, unknown>>;
  /** npcId → (연도 → 그 해 소속팀). 이력이 없는 사람은 아예 없다 */
  teamByYear: Map<string, Map<number, string>>;
}

/**
 * 이력 사건에서 **연도별 소속팀**을 편다.
 *
 * ⚠ 첫 이적보다 **앞선 해**는 그 이적의 `fromTeamId` 가 답이다. 입단 기록이
 *   없는 리그(해외 · `skipEntry`)엔 출발점이 그것뿐이다.
 */
export function teamByYearOf(
  events: readonly { npcId: string; seasonYear: number; fromTeamId: string | null; toTeamId: string }[],
  seasonYear: number,
  years: number,
): Map<string, Map<number, string>> {
  const byNpc = new Map<string, typeof events[number][]>();
  for (const e of events) {
    const list = byNpc.get(e.npcId);
    if (list) list.push(e); else byNpc.set(e.npcId, [e]);
  }
  const out = new Map<string, Map<number, string>>();
  for (const [npcId, list] of byNpc) {
    const sorted = [...list].sort((a, b) => a.seasonYear - b.seasonYear);
    const m = new Map<number, string>();
    for (let back = 1; back <= years; back++) {
      const y = seasonYear - back;
      // 그 해까지 일어난 마지막 사건의 **간 팀**이 그 해 소속이다
      let team = "";
      for (const e of sorted) {
        if (e.seasonYear > y) break;
        team = e.toTeamId;
      }
      // 첫 사건보다 앞이면 그 사건의 **떠난 팀**이 답이다
      if (!team) team = sorted[0]?.fromTeamId ?? "";
      if (team) m.set(y, team);
    }
    if (m.size > 0) out.set(npcId, m);
  }
  return out;
}

async function buildCareerHistorySeed(
  worldSeed: number,
  seasonYear: number,
  npcs: Partial<RepoNpc>[],
  rules: unknown,
  /** FA 자격 연차의 **정본** (`faRules.eligibleYears`) — 아래 §③ 참고 */
  faEligibleYears?: Record<string, number>,
  pastYears = 5,
): Promise<CareerHistorySeed> {
  const empty: CareerHistorySeed = { rows: [], teamByYear: new Map() };
  if (!rules) return empty;

  // ⚠ **외국인을 국내 경력 생성에 넣으면 안 된다.** Rust `entry_route`는 입단
  // 나이로 고졸/대졸/독립을 매기는데, 용병은 이 리그 연차가 0~2년이라 입단
  // 나이가 23~34로 잡혀 **전원 "독립" 출신**으로 기록됐다. 세계 시작 시점의
  // KBL 용병 30명이 한국 독립리그 출신이었다:
  //
  //     2024  Martinez  육성선수 입단 (독립)
  //
  // 출신이 없는 것보다 나쁘다 — 틀린 값이 적혀 있는 것이다.
  // 용병은 `buildForeignSeed`가 따로 심는다.
  const foreigners: Partial<RepoNpc>[] = [];
  const byLeague = new Map<string, Partial<RepoNpc>[]>();
  for (const n of npcs) {
    const lid = n.currentLeague ?? "";
    if (!CONTRACT_LEAGUES.has(lid)) continue;
    // 🔴 **`isForeignInQuotaLeague(국적)`은 너무 넓다.** "한도가 있는
    // 리그(KBL)에서 외국인인가"라 **USA·JPN이면 무조건 true**다. 해외를
    // 열자 ABL 448명·JBL 336명이 전원 여기로 새서 `foreign_signing`이 되고
    // 정작 그 리그 이적 이력은 0건이었다(실측: ABL 4건 · JBL 1건).
    //
    // 물어야 할 건 **"지금 처리 중인 리그에서 외국인인가"**다.
    // ABL 선수는 ABL에서 내국인이니 그 리그 이력을 가져야 한다.
    // KBL 용병(USA)은 여전히 여기로 빠진다 — 그쪽은 `buildForeignSeed`가 맡는다.
    //
    // ⚠ 같은 함정에 트레이드 윈도우도 걸렸었다(f6fb04fe7). **다섯 번째다.**
    if (isForeignPlayer(lid, n.nationality)) { foreigners.push(n); continue; }
    if (!byLeague.has(lid)) byLeague.set(lid, []);
    byLeague.get(lid)!.push(n);
  }

  const rows: Array<Record<string, unknown>> = [];
  const allEvents: Array<{ npcId: string; seasonYear: number; fromTeamId: string | null; toTeamId: string }> = [];
  for (const [leagueId, list] of byLeague) {
    const leagueTeams = [...new Set(list.map((n) => n.currentTeam ?? "").filter(Boolean))];
    if (leagueTeams.length < 2) continue;   // 팀이 하나면 이적할 데가 없다

    // 🔴 **FA 자격 연차의 정본은 `faRules.eligibleYears` 하나다** (B-29 D-3 ·
    //   사용자 확정 ③). `careerHistoryRules.faEligibleYears` 는 8 이었고 게임은
    //   KBL 5 · ABL 6 · JBL 4 였다 — 그래서 **KBL 자격자의 44% 가 과거에 FA
    //   이적이 한 번도 없는 사람**이 됐다(5~7년차 구간이 통째로).
    //   `faRules._note` 가 바로 이 형태를 경고해 뒀는데 사본이 셋이 됐던 것이다.
    //   ⚠ 이력 생성은 리그를 이미 알고 있다 — 리그마다 값을 갈아 넘긴다.
    const eligible = faEligibleYears?.[leagueId] ?? faEligibleYears?.default;
    const leagueRules = eligible != null
      ? { ...(rules as Record<string, unknown>), faEligibleYears: eligible }
      : rules;

    const raw = await window.projectB!.engine("generateCareerHistoryNative", JSON.stringify({
      worldSeed: worldSeed >>> 0,
      seasonYear,
      rules: leagueRules,
      skipEntry: NO_ENTRY_ROUTE_LEAGUES.has(leagueId),
      players: list.map((n) => ({
        npcId: n.npcId, name: n.name, age: n.age,
        proServiceYears: n.proServiceYears ?? 0,
        currentTeam: n.currentTeam, currentLeague: leagueId,
      })),
      leagueTeams,
    }));
    const parsed = JSON.parse(raw) as {
      events?: Array<{
        npcId: string; npcName: string; seasonYear: number; category: string;
        fromTeamId: string | null; toTeamId: string; leagueId: string; detail: string;
      }>;
      error?: string;
    };
    if (!parsed.events) {
      console.warn(`[newGameV3] ${leagueId} 경력 생성 실패:`, parsed.error);
      continue;
    }
    for (const e of parsed.events) {
      rows.push({
        seasonYear: e.seasonYear, week: null, category: e.category,
        playerId: e.npcId, playerName: e.npcName,
        fromTeamId: e.fromTeamId, fromLeagueId: e.fromTeamId ? e.leagueId : null,
        toTeamId: e.toTeamId, toLeagueId: e.leagueId,
        detail: e.detail, groupId: null,
      });
      allEvents.push({
        npcId: e.npcId, seasonYear: e.seasonYear,
        fromTeamId: e.fromTeamId, toTeamId: e.toTeamId,
      });
    }
  }
  // ── 용병 출신 시드 ──────────────────────────────────────────
  //
  // 세계는 진행 중이다 — 재작년·작년·올해 영입이 섞여 있고, 작년에 성적이
  // 안 돼 돌아간 사람의 기록도 남아 있어야 한다(사용자 확정).
  if (foreigners.length > 0) {
    const rulesFile = await loadRosterRules();
    const origin = originRulesOf(rulesFile.foreignRules);
    // 시드 난수 — 같은 세계를 다시 열면 같은 기록이어야 한다
    let x = (worldSeed ^ 0x5EEDF09D) >>> 0;
    const rand = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

    // 떠난 용병은 **작년에 나간 사람들**이라 이름이 세계에 없다. 남아 있는
    // 용병 이름 풀에서 빌려 오면 같은 이름이 둘이 되므로, 팀당 한 명씩
    // 실제 로스터에서 **빠진 자리**만큼만 만든다 — 여기선 팀 수의 3분의 1
    const teamsWithForeign = [...new Set(foreigners.map((n) => n.currentTeam ?? ""))]
      .filter(Boolean);
    const departedNames = teamsWithForeign
      .slice(0, Math.max(1, Math.round(teamsWithForeign.length / 3)))
      .map((teamId, i) => ({ name: `Foreign Departed ${i + 1}`, teamId }));

    const seedRows = buildForeignSeed({
      players: foreigners.map((n) => ({
        npcId: n.npcId ?? "", name: n.name ?? "",
        teamId: n.currentTeam ?? "", proServiceYears: n.proServiceYears ?? 0,
      })),
      rules: origin, seasonYear, rand,
      departed: departedNames.length, departedNames,
    });
    rows.push(...(seedRows as unknown as Record<string, unknown>[]));
  }

  // ⚠ 용병 시드는 **연도별 팀에 안 넣는다** — `buildForeignSeed` 는 온 해와
  //   떠난 해를 적을 뿐 과거 소속 사슬이 아니고, 과거 5년 성적은 어차피
  //   국내 프로 1·2군만 만든다.
  return { rows, teamByYear: teamByYearOf(allEvents, seasonYear, pastYears) };
}

/**
 * 리그 Lazy 활성화 — **해외(ABL·JBL) 진출 시점 전용** (DESIGN.md §2.2).
 *
 * 국내 리그는 새 게임에서 이미 만들어지므로 여기 오면 기존 행이 있어 no-op다.
 * 구 세이브(국내 로스터가 없는 슬롯)를 열었을 때의 복구 경로로도 남겨둔다.
 * 같은 worldSeed면 언제 호출해도 동일 로스터.
 */
export async function activateLeagueV3(
  slotId: string,
  leagueId: string,
  seasonYear: number,
  teams: { teamId: string; schoolId?: string }[],
  /** 덮어쓰기용. 보통 안 넘긴다 — `rules.namePool`이 정본이다 */
  namePool?: NamePoolData,
): Promise<{ inserted: number }> {
  const meta = await slotRepo.getMeta(slotId);
  const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
  const rulesFile = await loadRosterRules();
  const rules = rulesFile.rosterRules[leagueId];
  if (!rules) throw new Error(`[activateLeagueV3] rosterRules 없음: ${leagueId}`);

  // 이미 활성화된 리그면 스킵 (재호출 안전)
  const existing = await slotRepo.getByLeague(slotId, leagueId);
  if (existing.length > 0) return { inserted: 0 };

  // 폴백은 `buildRosterParams`가 한다 — 예전엔 이 자리에서만 막아서
  // 새 게임 경로가 그대로 샜다(ABL·JBL 784명이 한국 이름)
  const params = buildRosterParams(
    leagueId, seasonYear, worldSeed, teams, rules, namePool,
    rulesFile.salaryRules, rulesFile.powerRules,
    (rulesFile.careerHistoryRules as { entry?: unknown } | undefined)?.entry,
    foreignSlotsFor(leagueId, rulesFile), rulesFile.talentRules);
  const gen = JSON.parse(
    await window.projectB!.engine("generateLeagueRosterNative", JSON.stringify(params))
  ) as { npcs?: Partial<RepoNpc>[]; error?: string };
  if (!Array.isArray(gen.npcs)) throw new Error(`[activateLeagueV3] 생성 실패: ${gen.error ?? "unknown"}`);

  const r = await slotRepo.insertNpcs(slotId, gen.npcs);
  return { inserted: r.inserted };
}
