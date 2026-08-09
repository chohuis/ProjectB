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
 * 전체 순번 → **그 라운드 안에서 몇 번째인가.**
 *
 * ⚠ **팀 수를 적지 않는다.** 이 계산이 화면마다 따로 있었고, 지명 통보 창은
 * `pickNo % 8 || 8`이었다 — 팀이 10개인데 8로 나눴다. 전체 56번(6라운드
 * 6순위)이 **"6라운드 8순위"**로 떴다. 보드 화면은 같은 결함을 먼저 고쳤는데
 * 통보 창에만 옛 식이 남아 정본이 둘이 됐다.
 *
 * 엔진은 **10팀 정순**이다(스네이크 아님). 팀 수는 `KBL_TEAM_IDS.length`에서
 * 온다 — 팀이 늘거나 줄면 여기는 손댈 데가 없다.
 */
export function pickInRound(
  pickNo: number,
  round: number,
  teamCount: number = KBL_TEAM_IDS.length,
): number {
  return pickNo - (round - 1) * Math.max(1, teamCount);
}

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
): { univIds: string[]; indIds: string[]; farmIds: string[] } {
  const pick = (leagueId: string) =>
    teams.filter((t) => t.leagueId === leagueId && !SANGMU_TEAM_IDS.has(t.id)).map((t) => t.id);
  return {
    univIds: pick("LEAGUE_UNIVERSITY"),
    indIds: pick("LEAGUE_INDEPENDENT"),
    // ⚠ refs는 1군·팜을 **같은 leagueId**로 담는다 — `_2` 접미사로 가른다
    // (`roster_gen.rs`의 plan과 같은 규칙)
    farmIds: teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_2")).map((t) => t.id),
  };
}

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// calcDraftScore·POTENTIAL_BONUS는 제거됐다 — `npc.pitching.ovr`(생성값)을 읽어
// 성장을 못 봤고, 호출하는 데가 한 곳도 없었다. 지명 점수의 정본은 Rust
// `determine_protagonist_draft`다 — TS에 두 번째 표를 만들지 않는다

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
  /** 지명 대상 풀 = 지명 수 × 이 배수 (규칙 파일 `boardCandidateMultiplier`) */
  poolMultiplier = 2,
): Promise<DraftSimResult> {
  const params = {
    candidates,
    namedMetas: namedMetas.map(m => ({ npcId: m.npcId, proPotentialTier: m.proPotentialTier })),
    year,
    rounds,
    teamIds: [...teamIds],
    poolMultiplier,
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
  /** 프로 2군 팀당 정원. 0이면 2군을 목적지로 안 쓴다 */
  farmMax?: number;
  universityMax: number;
  independentMax: number;
  /** 이 나이를 넘으면 독립리그도 안 받는다 */
  independentAgeMax: number;
  /**
   * 대학이 **한 해에** 팀당 받는 인원 (정원 ÷ 학년 수).
   *
   * ⚠ 이게 없으면 팀 정원만 보고 채워 **학년 균형이 깨진다.** 한 해에 많이
   * 받으면 4년 뒤 그 코호트가 한꺼번에 나가고 다시 크게 받는 4년 주기가
   * 생긴다 — 실측 대학 유입 194~558, 저점 해엔 고교 졸업생이 갈 곳이 없어
   * 야구 포기가 1,163명까지 올랐다.
   */
  universityAnnualMax: number;
  /**
   * 육성선수 연봉(만원). 2군으로 배정된 사람에게 붙는다.
   *
   * ⚠ **최저연봉(신인 계약 3000)보다 낮아야 한다.** 같거나 높으면 하위 라운드
   * 지명이 무의미해진다 — 지명은 계약금이 붙고 육성은 안 붙는데 연봉까지
   * 같으면 "지명 안 되는 게 낫다"가 된다. `check:devplayer`가 이걸 본다
   */
  developmentSalary?: number;
  /**
   * 팀당 육성선수 보유 상한. **정식 정원(`farmMax`) 위에 얹는다.**
   *
   * ⚠ **0이면 육성선수가 한 명도 안 들어간다.** 육성선수는 정원 밖 인원인데
   * `farmMax`를 그대로 쓰면 정식 로스터가 정원을 채우는 순간 자리가 없어진다 —
   * 실측에서 KBL 2군 10팀이 `[32,33,33,33,34,34,34,34,34,34]`로 여유가
   * 5자리였고, 그해 미지명자 1,373명 중 2군에 간 사람이 **0명**이었다.
   *
   * ⚠ 반대로 무제한이면 2군이 육성선수로 채워져 드래프트 지명의 가치가 없어진다.
   */
  developmentMax?: number;
}

export function placementRulesFrom(
  rosterRules: Record<string, { rosterMax?: number; ageMax?: number; rosterSize?: number; gradeMax?: number }>,
  devSalary?: number,
  devMax?: number,
): PlacementRules {
  const uni = rosterRules["LEAGUE_UNIVERSITY"];
  // 정원 ÷ 학년 수 — 고교 신입생 생성(`generateFreshmenV3`)의 `perYear`와 같은 계산이다
  const annual = Math.max(1, Math.round((uni?.rosterSize ?? 32) / (uni?.gradeMax ?? 4)));
  return {
    universityMax: uni?.rosterMax ?? 40,
    independentMax: rosterRules["LEAGUE_INDEPENDENT"]?.rosterMax ?? 45,
    independentAgeMax: rosterRules["LEAGUE_INDEPENDENT"]?.ageMax ?? 31,
    universityAnnualMax: annual,
    // ⚠ **2군을 목적지로 안 주면 투수가 마른다.** 유입이 드래프트 하위 라운드
    // 지명 하나뿐인데 1군이 콜업으로 계속 빼간다 — 실측 야수 29 / 투수 6,
    // 오프시즌에도 회복이 없었다. 1군의 `fill_first_teams`에 해당하는 보충
    // 경로가 2군엔 없다. 방출자·미계약 FA가 여기로 흘러가면 그 구멍이 메워진다.
    //
    // ⚠ **이 값만으로는 아무 일도 안 일어난다.** Rust `Placer`는 팀 목록을
    // 따로 받는데, 드래프트 경로가 `farmTeamIds`를 안 넘겨서 빈 배열이었다 —
    // 상한 34가 한 번도 쓰인 적이 없다. 목록은 `ApplyDraftOptions.farmTeamIds`다
    farmMax: rosterRules["LEAGUE_KBL_FARM"]?.rosterMax ?? 34,
    developmentSalary: devSalary,
    developmentMax: devMax ?? 0,
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
  /**
   * 프로 2군 팀 목록. **이게 없으면 `placement.farmMax`가 죽은 값이다.**
   *
   * ⚠ Rust `Placer`는 상한과 팀 목록을 따로 받는다. 상한만 넘기면 빈 배열을
   * 훑으므로 2군 경로가 통째로 안 돈다 — 실제로 그 상태였고, 갈 곳 없는
   * 사람이 시즌당 1,135명씩 야구를 그만뒀다
   */
  farmTeamIds?: string[];
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
    farmTeamIds: opts.farmTeamIds ?? [],
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
/**
 * 주인공 지명 결과 — **상대평가다** (사용자 확정 2026-08-09).
 *
 *   상위픽   팀 에이스급 + 리그 최상위
 *   중간픽   리그에서 무난한 수준
 *   미지명   애매하거나 · 큰 부상이 있거나 · 대회에서 못했거나
 *
 * ⚠ **또래 분포를 꼭 넘긴다.** 안 넘기면 Rust가 폴백으로 OVR을 백분위처럼
 * 쓰는데, 그건 세계 전력이 바뀌면 어긋나는 옛 동작이다 — 조용히 그리로
 * 돌아가지 않게 호출부에서 반드시 채운다.
 */
export interface DraftContext {
  /** 같은 해 지명 대상 투수들의 OVR */
  peerOvrs: number[];
  /** 팀 투수 중 내 순위 (1 = 에이스) */
  teamAceRank?: number;
  /** 대회 활약 0~100. 50이 평범 */
  tournamentScore?: number;
  /** 중등도 이상 부상 횟수 */
  majorInjuries?: number;
}

export async function determineProtagonistDraft(
  scoutScore:  number,
  pitchingOvr: number,
  year:        number,
  ctx:         DraftContext,
  teamIds:     readonly string[] = KBL_TEAM_IDS,
): Promise<ProtagonistDraftOutcome> {
  const params = { scoutScore, pitchingOvr, year, teamIds: [...teamIds], ...ctx };
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
