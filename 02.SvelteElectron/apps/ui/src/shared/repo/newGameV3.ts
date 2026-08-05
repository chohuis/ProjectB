// ── R3a: 새 게임 생성 파이프라인 v3 (DESIGN.md §8.3) ─────────────────────
// 흐름: 생성 규칙(master 콘텐츠) → Rust 로스터 생성(worldSeed 결정적) → slot.db 생성
// 사전 생성 데이터(people_*.json, entities/players/*) 를 전혀 읽지 않는다.

import { slotRepo, type RepoNpc } from "./slotRepo";
import { generateDomesticStaff } from "./staffGen";
import { ALL_TEAMS_BY_LEAGUE, HS_ACTIVE_TEAMS_V3 } from "../utils/leagueScheduler";
import { SANGMU_TEAM_IDS } from "../utils/ids";

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
  teams: { teamId: string; schoolId?: string; salaryIndex?: number; power?: number }[],
  rules: RosterRulesData,
  namePool?: { surnames: string[]; givenA: string[]; givenB: string[]; western?: boolean },
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
    })),
    rules,
    ...(namePool ? { namePool } : {}),
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
const DOMESTIC_ROSTER_LEAGUES = [
  "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL",
  "LEAGUE_KBL_FARM",
] as const;

async function generateLeagueNpcs(
  leagueId: string,
  seasonYear: number,
  worldSeed: number,
  teams: { teamId: string; schoolId?: string; salaryIndex?: number; power?: number }[],
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
  const withIndex = (ids: string[]) =>
    ids.map((teamId) => ({
      teamId,
      salaryIndex: salaryIndex.get(teamId),
      power: powerOf.get(teamId),
    }));

  const teams = opts.teams ?? HS_ACTIVE_TEAMS_V3.map((teamId) => ({ teamId }));
  const hsNpcs = await generateLeagueNpcs(
    "LEAGUE_HIGHSCHOOL", opts.seasonYear, worldSeed,
    teams.map((t) => ({ ...t, salaryIndex: salaryIndex.get(t.teamId), power: powerOf.get(t.teamId) })),
    hsRules, salaryRules, powerRules, entryRules);

  // 나머지 국내 리그 — 팀 목록은 leagueScheduler가 정본이다 (refs에서 파생)
  const otherNpcs: Partial<RepoNpc>[] = [];
  for (const lid of DOMESTIC_ROSTER_LEAGUES) {
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

  // ── 과거 경력 (Phase 6.5) ────────────────────────────────────
  // createSlot **뒤에** 넣는다 — createSlot이 transactions를 비우기 때문이다.
  // 실패해도 새 게임 자체는 성립해야 하므로 여기서 던지지 않는다.
  try {
    await seedCareerHistory(
      opts.slotId, worldSeed, opts.seasonYear, npcs, rulesFile.careerHistoryRules);
  } catch (e) {
    console.warn("[newGameV3] 과거 경력 생성 실패 — 이력 없이 시작", e);
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
async function seedCareerHistory(
  slotId: string,
  worldSeed: number,
  seasonYear: number,
  npcs: Partial<RepoNpc>[],
  rules: unknown,
): Promise<void> {
  if (!rules) return;

  const byLeague = new Map<string, Partial<RepoNpc>[]>();
  for (const n of npcs) {
    const lid = n.currentLeague ?? "";
    if (!CONTRACT_LEAGUES.has(lid)) continue;
    if (!byLeague.has(lid)) byLeague.set(lid, []);
    byLeague.get(lid)!.push(n);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const [leagueId, list] of byLeague) {
    const leagueTeams = [...new Set(list.map((n) => n.currentTeam ?? "").filter(Boolean))];
    if (leagueTeams.length < 2) continue;   // 팀이 하나면 이적할 데가 없다

    const raw = await window.projectB!.engine("generateCareerHistoryNative", JSON.stringify({
      worldSeed: worldSeed >>> 0,
      seasonYear,
      rules,
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
    }
  }
  if (rows.length > 0) await slotRepo.addTransactions(slotId, rows);
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
  namePool?: { surnames: string[]; givenA: string[]; givenB: string[]; western?: boolean },
): Promise<{ inserted: number }> {
  const meta = await slotRepo.getMeta(slotId);
  const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
  const rulesFile = await loadRosterRules();
  const rules = rulesFile.rosterRules[leagueId];
  if (!rules) throw new Error(`[activateLeagueV3] rosterRules 없음: ${leagueId}`);

  // 이미 활성화된 리그면 스킵 (재호출 안전)
  const existing = await slotRepo.getByLeague(slotId, leagueId);
  if (existing.length > 0) return { inserted: 0 };

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
