import { KBL_TEAMS } from "./leagueScheduler";
import { SANGMU_TEAM_IDS } from "./ids";
import type {
  DraftPick,
  DraftSimResult,
  NamedNpcMeta,
  NpcSaveState,
  ProtagonistDraftOutcome,
} from "../types/save";

// ── 드래프트 보드 타입 ────────────────────────────────────────────
export interface DraftBoardCandidate {
  id: string;
  ovr: number;
  age: number;
  potential: number;
  isUser: boolean;
}

export interface DraftBoardPick {
  pickNo: number;
  round: number;
  teamId: string;
  candidateId: string;
  isUser: boolean;
}

export interface DraftBoardResult {
  picks: DraftBoardPick[];
  userDrafted: boolean;
  userRound?: number;
  userPickNo?: number;
  userTeamId?: string;
}

export interface DraftBoardBackgroundResult {
  picks: DraftBoardPick[];
}

// ── 상수 ─────────────────────────────────────────────────────
/**
 * 지명권을 가진 프로 1군 10팀.
 *
 * 예전엔 이 파일에 팀 ID 8개가 직접 박혀 있었다. Phase 5가 refs.json을 갈아엎자
 * **8개 전부 존재하지 않는 팀**이 됐고, 실측(D-0)에서 5시즌에 지명자 400명이
 * 유령 팀 소속으로 쌓이는 게 확인됐다. 팀 화면 어디에도 안 나오는 선수들이다.
 *
 * 정본은 `leagueTeams.generated.ts` — 시드에서 생성되고 부팅 시
 * `validateTeamRefs`가 refs.json과 대조한다. 여기서 다시 만들지 않는다.
 */
export const KBL_TEAM_IDS: readonly string[] = KBL_TEAMS;

/** KBO 실제 규모와 같다 (10팀 × 11라운드 = 110명) */
export const DRAFT_ROUNDS = 11;

/**
 * 미지명자가 갈 수 있는 팀 — **군경팀(상무)은 제외한다.**
 *
 * 상무가 독립리그 소속이라 리그로만 거르면 그대로 들어간다. 실측(D-0)에서
 * 5시즌 뒤 상무 45명이 **전원 복무자가 아닌 미지명자**로 채워져 있었다.
 * 병역은 Phase 7-3의 선발 경로로만 들어가야 한다.
 *
 * 예전 필터는 `t.id !== "TEAM_SPORTS_UNIT"`이었는데 그건 refs에 없는 v1 ID라
 * 아무것도 걸러내지 못했다 (ids.ts 주석 참고).
 */
export function draftDestinationTeams(
  teams: readonly { id: string; leagueId: string }[],
): { univIds: string[]; indIds: string[] } {
  const pick = (leagueId: string) =>
    teams.filter((t) => t.leagueId === leagueId && !SANGMU_TEAM_IDS.has(t.id)).map((t) => t.id);
  return { univIds: pick("LEAGUE_UNIVERSITY"), indIds: pick("LEAGUE_INDEPENDENT") };
}

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── 드래프트 점수 계산 (TS 유지 — UI에서 직접 표시 용도) ───
const POTENTIAL_BONUS: Record<string, number> = { S: 30, A: 20, B: 10, C: 0 };

export function calcDraftScore(npc: NpcSaveState, meta?: NamedNpcMeta): number {
  const ovr = npc.playerType === "pitcher"
    ? (npc.pitching?.ovr ?? 40)
    : (npc.batting?.ovr  ?? 40);
  const potBonus = meta ? (POTENTIAL_BONUS[meta.proPotentialTier] ?? 0) : 0;
  return ovr * 0.6 + (npc.developmentRate ?? 50) * 0.3 + potBonus * 0.1;
}

// ── 후보 선정 (Rust DLL 위임 — Phase 7-1 D-2) ────────────────
/** 후보가 어디서 왔나. `universityEarly`·`independent`는 **소속을 유지한 신청자**다 */
export type DraftRoute =
  | "highschoolGraduate" | "universityGraduate" | "universityEarly" | "independent";

export interface DraftCandidateRow {
  npcId: string;
  route: DraftRoute;
  ovr: number;
  age: number;
}

export interface DraftCandidatesResult {
  candidates: DraftCandidateRow[];
  /** 고졸 · 대졸 · 대학 재학 · 독립 순 */
  counts: [number, number, number, number];
}

/**
 * 드래프트 후보를 고른다.
 *
 * 예전엔 후보가 졸업생(`pendingDraft`)뿐이었다. 이제 **전체 NPC를 넘긴다** —
 * 대학 재학생과 독립리그 선수가 소속을 유지한 채 신청할 수 있어야 하는데,
 * 졸업생만 담긴 배열에는 그 사람들이 애초에 없다.
 *
 * 드래프트는 **졸업 전(11월)** 이라 고3·대4는 재학 상태로 후보에 든다.
 * 저학년은 나이가 아니라 학년 게이트가 막는다 — 고2도 19세일 수 있다.
 */
export async function selectDraftCandidates(
  npcs: NpcSaveState[],
  draftRules: unknown,
  universityGradeMax = 4,
  highschoolGradeMax = 3,
): Promise<DraftCandidatesResult> {
  const json = await window.projectB!.engine("selectDraftCandidatesNative", JSON.stringify({
    npcs, rules: draftRules, universityGradeMax, highschoolGradeMax,
  }));
  return parseResult<DraftCandidatesResult>(json);
}

/** 소속을 유지한 신청자는 미지명이어도 제자리다 — 진로 배정 대상이 아니다 */
export function routeNeedsPlacement(route: DraftRoute): boolean {
  return route === "highschoolGraduate" || route === "universityGraduate";
}

export const DRAFT_ROUTE_LABELS: Record<DraftRoute, string> = {
  highschoolGraduate: "고졸",
  universityGraduate: "대졸",
  universityEarly:    "대학 재학",
  independent:        "독립",
};

// ── NPC 드래프트 시뮬 (Rust DLL 위임) ────────────────────────
export async function runDraftSimulation(
  candidates: NpcSaveState[],
  namedMetas: NamedNpcMeta[],
  year: number,
  rounds: number = DRAFT_ROUNDS,
  teamIds: readonly string[] = KBL_TEAM_IDS,
): Promise<DraftSimResult> {
  const params = {
    candidates,
    namedMetas: namedMetas.map(m => ({ npcId: m.npcId, proPotentialTier: m.proPotentialTier })),
    year,
    rounds,
    teamIds: [...teamIds],
  };
  const json = await api().npcRunDraft(JSON.stringify(params));
  return parseResult<DraftSimResult>(json);
}

// ── 드래프트 결과 NPC 반영 (Rust DLL 위임) ───────────────────
/**
 * 소속을 잃은 사람의 진로 배정 상한.
 *
 * 미지명 졸업생 · 방출된 프로 · FA 미계약자가 **같은 규칙**을 탄다.
 * 따로 두면 셋 중 하나가 반드시 어긋난다.
 */
export interface PlacementRules {
  universityMax: number;
  independentMax: number;
  /** 이 나이를 넘으면 독립리그도 안 받는다 */
  independentAgeMax: number;
}

export function placementRulesFrom(
  rosterRules: Record<string, { rosterMax?: number; ageMax?: number }>,
): PlacementRules {
  return {
    universityMax: rosterRules["LEAGUE_UNIVERSITY"]?.rosterMax ?? 40,
    independentMax: rosterRules["LEAGUE_INDEPENDENT"]?.rosterMax ?? 45,
    independentAgeMax: rosterRules["LEAGUE_INDEPENDENT"]?.ageMax ?? 31,
  };
}

export interface ApplyDraftOptions {
  /** 신인 계약 표 (draftRules.contract). 없으면 신인이 연봉 0으로 시작한다 */
  contract?: import("./draftSalaryTable").DraftContractRules;
  /** 이 라운드 이하 지명자는 1군에서 시작한다 (draftRules.firstTeamRounds) */
  firstTeamRounds?: number;
  /** 팀 예산 지수 — 계약금에 곱한다 (`buildSalaryIndex`) */
  teamIndex?: Record<string, number>;
  /** 미지명자 진로 배정 상한 */
  placement?: PlacementRules;
}

export async function applyDraftToNpcs(
  npcs: NpcSaveState[],
  result: DraftSimResult,
  universityTeamIds: string[] = [],
  independentTeamIds: string[] = [],
  opts: ApplyDraftOptions = {},
): Promise<NpcSaveState[]> {
  const namedFlags = new Map(npcs.map(n => [n.npcId, n.isNamed] as const));
  const json = await api().npcApplyDraft(JSON.stringify({
    npcs, result, universityTeamIds, independentTeamIds,
    ...(opts.contract ? { contract: opts.contract } : {}),
    ...(opts.placement ? { placement: opts.placement } : {}),
    firstTeamRounds: opts.firstTeamRounds ?? 0,
    teamIndex: opts.teamIndex ?? {},
  }));
  const updated = parseResult<NpcSaveState[]>(json).map(n => ({
    ...n,
    isNamed:         n.isNamed         ?? namedFlags.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
  }));

  // 지명 이벤트는 **Rust가 이미 남긴다** (라운드·순번·계약금·떠나온 팀까지).
  // 여기서 또 push하면 선수마다 draft_picked가 두 번 쌓인다 — 경력 화면에
  // 같은 지명이 두 줄로 뜬다
  return updated;
}

// ── 주인공 드래프트 결과 결정 (Rust DLL 위임) ────────────────
export async function determineProtagonistDraft(
  scoutScore:  number,
  pitchingOvr: number,
  year:        number,
  teamIds:     readonly string[] = KBL_TEAM_IDS,
): Promise<ProtagonistDraftOutcome> {
  const params = { scoutScore, pitchingOvr, year, teamIds: [...teamIds] };
  const json = await api().npcDetermineProtagonistDraft(JSON.stringify(params));
  return parseResult<ProtagonistDraftOutcome>(json);
}

// ── 미지명 주인공 재도전 (경량 — TS 유지) ────────────────────
export function canRetryDraft(faUnsignedWeeks: number): boolean {
  return faUnsignedWeeks === 0;
}

// ── 드래프트 보드 전체 픽 시퀀스 (Rust DLL 위임) ─────────────────
export async function runDraftBoard(
  candidates: DraftBoardCandidate[],
  protagonistScoutScore: number,
  protagonistOvr: number,
  teamIds: string[],
  year: number,
  rounds: number = DRAFT_ROUNDS,
): Promise<DraftBoardResult> {
  const params = { candidates, protagonistScoutScore, protagonistOvr, teamIds, year, rounds };
  const json = await api().draftRunBoard(JSON.stringify(params));
  return parseResult<DraftBoardResult>(json);
}

// 타입 re-export
export type { DraftPick, DraftSimResult, ProtagonistDraftOutcome };
