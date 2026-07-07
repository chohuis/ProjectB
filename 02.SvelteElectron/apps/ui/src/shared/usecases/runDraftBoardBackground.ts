import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore, type EntityDetails, type EntityRow } from "../stores/master";
import { seasonStore } from "../stores/season";
import { slotRepo } from "../repo/slotRepo";
import type { NpcSaveState } from "../types/save";
import {
  DRAFT_ROUNDS,
  runDraftBoard,
  type DraftBoardBackgroundResult,
  type DraftBoardCandidate,
} from "../utils/draftSystem";

function entityOvr(e: EntityRow): number {
  const p = (e.details as EntityDetails | undefined)?.player ?? {};
  return Math.max(Number(p.pitching?.ovr ?? 0), Number(p.batting?.ovr ?? 0));
}

function npcOvr(npc: NpcSaveState): number {
  return Math.max(npc.pitching?.ovr ?? 0, npc.batting?.ovr ?? 0);
}

async function collectViewOnlyDraftCandidates(): Promise<DraftBoardCandidate[]> {
  const game = get(gameStore);

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
    // v3: npc 테이블 갱신 + 거래기록을 단일 트랜잭션으로 (구 master_overlay.db 경로는
    // master:loadEntities가 이미 overlay를 읽지 않아 실질적으로 유실되던 경로였음)
    await slotRepo.assignDraft({
      slotId,
      seasonYear,
      picks: result.picks.map((pick) => ({
        npcId: pick.candidateId,
        teamId: pick.teamId,
        leagueId: "LEAGUE_KBL",
        round: pick.round,
        pickNo: pick.pickNo,
        detail: `${pick.round}라운드 ${pick.pickNo}순위`,
      })),
    });

    // gameStore.npcs 반응형 반영 (부분 패치 — updateNpcs가 정확한 용도)
    const draftedIds = new Set(result.picks.map((p) => p.candidateId));
    const pickByNpcId = new Map(result.picks.map((p) => [p.candidateId, p]));
    const patched = game.npcs
      .filter((n) => draftedIds.has(n.npcId))
      .map((n) => {
        const pick = pickByNpcId.get(n.npcId)!;
        return {
          ...n,
          currentTeam: pick.teamId,
          currentLeague: "LEAGUE_KBL",
          grade: undefined,
          schoolId: "",
          proServiceYears: 0,
        };
      });
    if (patched.length > 0) gameStore.updateNpcs(patched);
  }

  await gameStore.save();
  return { picks: result.picks };
}
