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

// ── 상수 ─────────────────────────────────────────────────────
export const KBL_TEAM_IDS = [
  "TEAM_KBL_TWINWOLVES_1",
  "TEAM_KBL_BEARGUARDIANS_1",
  "TEAM_KBL_SKYGULLS_1",
  "TEAM_KBL_SOARINGEAGLES_1",
  "TEAM_KBL_ROYALLIONS_1",
  "TEAM_KBL_EMBERTIGERS_1",
  "TEAM_KBL_STEELDINOS_1",
  "TEAM_KBL_GIANTWHALES_1",
] as const;

export const DRAFT_ROUNDS = 10;

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
export async function applyDraftToNpcs(
  npcs: NpcSaveState[],
  result: DraftSimResult,
): Promise<NpcSaveState[]> {
  const namedIds    = new Set(npcs.map(n => n.npcId));
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcApplyDraft(JSON.stringify({ npcs, result }));
  return parseResult<NpcSaveState[]>(json).map(n => ({
    ...n,
    isNamed:     n.isNamed ?? namedIds.has(n.npcId),
    emotionRole: n.emotionRole ?? emotionRoles.get(n.npcId),
  }));
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
