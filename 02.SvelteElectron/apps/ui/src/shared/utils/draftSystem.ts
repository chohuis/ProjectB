import type {
  DraftPick,
  DraftSimResult,
  NamedNpcMeta,
  NpcSaveState,
  ProtagonistDraftOutcome,
} from "../types/save";
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore, type EntityDetails, type EntityRow } from "../stores/master";
import { seasonStore } from "../stores/season";

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
  universityTeamIds: string[] = [],
  independentTeamIds: string[] = [],
): Promise<NpcSaveState[]> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcApplyDraft(JSON.stringify({ npcs, result, universityTeamIds, independentTeamIds }));
  return parseResult<NpcSaveState[]>(json).map(n => ({
    ...n,
    emotionRole:     n.emotionRole     ?? emotionRoles.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
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

function entityOvr(e: EntityRow): number {
  const p = (e.details as EntityDetails | undefined)?.player ?? {};
  return Math.max(Number(p.pitching?.ovr ?? 0), Number(p.batting?.ovr ?? 0));
}

function npcOvr(npc: NpcSaveState): number {
  return Math.max(npc.pitching?.ovr ?? 0, npc.batting?.ovr ?? 0);
}

async function collectViewOnlyDraftCandidates(): Promise<DraftBoardCandidate[]> {
  const game = get(gameStore);

  await masterStore.loadEntities("LEAGUE_UNIVERSITY");
  await masterStore.loadEntities("LEAGUE_INDEPENDENT");

  const seen = new Set<string>();
  const rows: DraftBoardCandidate[] = [];
  const hsNpcs = game.npcs.filter(
    (n) =>
      n.currentLeague === "LEAGUE_HIGHSCHOOL" &&
      n.grade === 3 &&
      n.careerStatus === "active" &&
      n.npcId !== game.protagonist.id,
  );

  if (hsNpcs.length > 0) {
    const sorted = [...hsNpcs].sort((a, b) => npcOvr(b) - npcOvr(a));
    const cutoff = Math.ceil(sorted.length * 0.8);
    for (const npc of sorted.slice(0, cutoff)) {
      if (seen.has(npc.npcId)) continue;
      seen.add(npc.npcId);
      rows.push({
        id: npc.npcId,
        ovr: npcOvr(npc),
        age: npc.age,
        potential: npc.developmentRate,
        isUser: false,
      });
    }
  } else {
    await masterStore.loadEntities("LEAGUE_HIGHSCHOOL");
    const entities = get(masterStore).entities
      .filter((e) => e.leagueId === "LEAGUE_HIGHSCHOOL" && e.role === "player" && e.grade === 3 && e.id !== game.protagonist.id)
      .sort((a, b) => entityOvr(b) - entityOvr(a));
    const cutoff = Math.ceil(entities.length * 0.8);
    for (const entity of entities.slice(0, cutoff)) {
      if (seen.has(entity.id)) continue;
      seen.add(entity.id);
      rows.push({
        id: entity.id,
        ovr: entityOvr(entity),
        age: entity.age,
        potential: Number(entity.potentialHidden ?? 70),
        isUser: false,
      });
    }
  }

  const allPlayers = get(masterStore).entities.filter((e) => e.role === "player");
  const univTop = allPlayers
    .filter((e) => e.leagueId === "LEAGUE_UNIVERSITY")
    .sort((a, b) => entityOvr(b) - entityOvr(a))
    .slice(0, 30);
  const indTop = allPlayers
    .filter((e) => e.leagueId === "LEAGUE_INDEPENDENT")
    .sort((a, b) => entityOvr(b) - entityOvr(a))
    .slice(0, 15);

  for (const entity of [...univTop, ...indTop]) {
    if (seen.has(entity.id)) continue;
    seen.add(entity.id);
    rows.push({
      id: entity.id,
      ovr: entityOvr(entity),
      age: entity.age,
      potential: Number(entity.potentialHidden ?? 70),
      isUser: false,
    });
  }

  return rows;
}

export async function runDraftBoardBackground(slotId: string, seasonYear: number): Promise<DraftBoardBackgroundResult> {
  const game = get(gameStore);
  const master = get(masterStore);
  const prevStandings = get(seasonStore).prevSeasonKblStandings ?? [];
  const teamIds = prevStandings.length > 0
    ? [...prevStandings].sort((a, b) => a.winPct - b.winPct || a.wins - b.wins).map((s) => s.teamId)
    : master.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.tier === "1군").map((t) => t.id);
  const candidates = await collectViewOnlyDraftCandidates();
  const result = await runDraftBoard(
    candidates,
    game.protagonist.scoutScore,
    game.protagonist.pitching.ovr,
    teamIds,
    seasonYear,
    DRAFT_ROUNDS,
  );

  gameStore.clearCareerDraftPickLog();
  const playerNameById = new Map<string, string>();
  for (const npc of game.npcs) {
    playerNameById.set(npc.npcId, npc.name);
  }
  for (const entity of get(masterStore).entities) {
    if (!playerNameById.has(entity.id)) playerNameById.set(entity.id, entity.name);
  }

  for (const pick of result.picks) {
    gameStore.appendCareerDraftPickLog({
      pickNo: pick.pickNo,
      round: pick.round,
      teamId: pick.teamId,
      playerId: pick.candidateId,
      playerName: playerNameById.get(pick.candidateId) ?? pick.candidateId,
      isUser: false,
    });
  }

  if (result.picks.length > 0) {
    const rows = result.picks.map((pick) => ({
      seasonYear,
      category: "draft",
      playerId: pick.candidateId,
      playerName: playerNameById.get(pick.candidateId) ?? pick.candidateId,
      fromTeamId: null,
      fromLeagueId: null,
      toTeamId: pick.teamId,
      toLeagueId: "LEAGUE_KBL",
      detail: `${pick.round}라운드 ${pick.pickNo}순위`,
      groupId: null,
    }));
    await api().leagueAddTransactions(JSON.stringify({ slotId, rows }));
  }

  await gameStore.save();
  return { picks: result.picks };
}

// 타입 re-export
export type { DraftPick, DraftSimResult, ProtagonistDraftOutcome };
