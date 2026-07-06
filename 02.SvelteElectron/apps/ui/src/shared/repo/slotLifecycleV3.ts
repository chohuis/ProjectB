// ── R3a-4: v3 슬롯 수명주기 오케스트레이터 ────────────────────────
// 새 게임 생성 / 로드 / 목록 / 삭제 / 이름변경 — App·NewGamePage·SaveSlotScreen 전용.
// 저장(save)은 gameStore.save()의 v3 분기가 담당 (순환 참조 방지).

import { get } from "svelte/store";
import { slotRepo } from "./slotRepo";
import { createNewGameV3, activateLeagueV3, loadRosterRules } from "./newGameV3";
import { hydrateFromRepo, saveStateToRepoNpc } from "./npcAdapter";
import { setV3SlotActive, isV3SlotActive } from "./v3Mode";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { npcLiveStatsStore } from "../stores/npcLiveStats";
import { masterStore } from "../stores/master";
import { HS_ACTIVE_TEAMS_V3 } from "../utils/leagueScheduler";
import type { SaveGame, ProtagonistSave, NpcSaveState } from "../types/save";
import type { SaveSeason } from "../types/season";
import type { SaveSlotMeta } from "../types/projectb.d";

/** v3 슬롯 목록 (SaveSlotScreen 기존 표시 형식으로 변환) */
export async function listSlotsV3(): Promise<SaveSlotMeta[]> {
  const metas = await slotRepo.listSlots();
  return metas
    .filter((m) => m.schema_version === "3")
    .map((m) => ({
      slotId: m.slotId,
      name: m.slot_name || m.slotId,
      updatedAt: m.updated_at ?? "",
      preview: {
        careerStage: m.career_stage ?? null,
        seasonYear: m.season_year ? Number(m.season_year) : null,
        currentWeek: m.current_week ? Number(m.current_week) : null,
        teamId: m.team_id ?? null,
      },
    }));
}

export async function deleteSlotV3(slotId: string): Promise<void> {
  await slotRepo.deleteSlot(slotId);
}

export async function renameSlotV3(slotId: string, name: string): Promise<void> {
  await slotRepo.setMeta(slotId, { slot_name: name });
}

/** 공통 hydrate: slot.db → 스토어 (로드·새 게임 공용) */
async function hydrateStoresFromSlot(slotId: string): Promise<void> {
  const rows = await slotRepo.getAllNpcs(slotId);
  const { npcs, liveStats } = hydrateFromRepo(rows);
  gameStore.setNpcs(npcs);  // 전체 교체 — updateNpcs(부분패치) 사용 금지
  npcLiveStatsStore.set(liveStats);
  // v3: 선수는 slot.db가 정본 — master.db에서는 스태프(코치/감독)만 로드
  await masterStore.reloadEntities();
  setV3SlotActive(true);
}

/** v3 슬롯 로드 — v3 슬롯이 아니면 false (레거시 폴백은 호출측) */
export async function loadGameV3(slotId: string): Promise<boolean> {
  const meta = await slotRepo.getMeta(slotId);
  if (meta.schema_version !== "3") return false;

  const game = await slotRepo.getProtagonist<SaveGame>(slotId);
  const season = await slotRepo.getSeason<SaveSeason>(slotId);
  if (!game || !season) throw new Error(`[loadGameV3] 슬롯 데이터 손상: ${slotId}`);

  gameStore.hydrateFromSlot(game, slotId);      // slim blob (npcs 없음)
  seasonStore.hydrateFromSlot(season);          // slim blob (npcLiveStats 없음)
  await hydrateStoresFromSlot(slotId);          // npcs·능력치는 npc 테이블에서
  return true;
}

/** v3 신입생 생성 — 진급 후 grade 1이 빈 고교 팀에 Rust 생성으로 채움 (첫 시즌은 로스터에 이미 포함) */
export async function generateFreshmenV3(seasonYear: number): Promise<number> {
  if (!isV3SlotActive()) return 0;
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return 0;

  const rules = (await loadRosterRules()).rosterRules["LEAGUE_HIGHSCHOOL"];
  if (!rules) return 0;
  const perYear = Math.max(1, Math.round(rules.rosterSize / (rules.gradeMax ?? 3)));

  const newOnes: NpcSaveState[] = [];
  for (const teamId of HS_ACTIVE_TEAMS_V3) {
    const hasGrade1 = g.npcs.some(
      (n) => n.currentTeam === teamId && n.grade === 1 && n.careerStatus === "active",
    );
    if (hasGrade1) continue;
    const raw = JSON.parse(
      await window.projectB!.engine("generateFreshmenNative", JSON.stringify({
        schoolId: teamId.replace("TEAM_HS_", "SCHOOL_HS_"),
        teamId,
        annualRosterSize: perYear,
        pitchingOvrMin: rules.pitchingOvrMin, pitchingOvrMax: rules.pitchingOvrMax,
        battingOvrMin: rules.battingOvrMin, battingOvrMax: rules.battingOvrMax,
        devRateMin: rules.devRateMin, devRateMax: rules.devRateMax,
        namedNpcs: [], seasonYear, idOffset: 0,
      })),
    ) as NpcSaveState[];
    if (Array.isArray(raw)) newOnes.push(...raw);
  }
  if (newOnes.length === 0) return 0;

  await slotRepo.insertNpcs(slotId, newOnes.map((n) => saveStateToRepoNpc(n)));
  gameStore.addNpcs(newOnes);
  npcLiveStatsStore.update((st) => {
    const next = { ...st };
    for (const n of newOnes) {
      next[n.npcId] = {
        pitching: n.pitching, batting: n.batting,
        pitchingXp: {}, battingXp: {},
        seasonStartPitching: n.pitching, seasonStartBatting: n.batting,
        peakOvr: n.pitching?.ovr ?? n.batting?.ovr,
        pitches: [],
      };
    }
    return next;
  });
  return newOnes.length;
}

/** 주인공 소속 리그 로스터 보장 — 진학/프로 진입 후 첫 주 진행 시 Lazy 활성화 (DESIGN.md §2.2) */
export async function ensureLeagueActivatedV3(leagueId: string, seasonYear: number): Promise<number> {
  if (!isV3SlotActive()) return 0;
  if (leagueId === "LEAGUE_HIGHSCHOOL") return 0;  // 시작 리그 — 새 게임에서 생성됨
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return 0;
  if (g.npcs.some((n) => n.currentLeague === leagueId)) return 0;

  const isPro = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"].includes(leagueId);
  const teams = get(masterStore).teams
    .filter((t) => t.leagueId === leagueId)
    .filter((t) => (isPro ? t.id.endsWith("_1") : t.id !== "TEAM_SPORTS_UNIT"))
    .map((t) => ({ teamId: t.id }));
  if (teams.length === 0) return 0;

  const r = await activateLeagueV3(slotId, leagueId, seasonYear, teams);
  if (r.inserted === 0) return 0;

  // DB에 삽입된 신규 리그 NPC를 메모리로 hydrate
  const rows = await slotRepo.getByLeague(slotId, leagueId);
  const { npcs, liveStats } = hydrateFromRepo(rows);
  gameStore.addNpcs(npcs);
  npcLiveStatsStore.update((st) => ({ ...st, ...liveStats }));
  return r.inserted;
}

export interface StartNewGameV3Options {
  slotId: string;
  slotName?: string;
  seasonYear: number;
  protagonist: ProtagonistSave;
}

/** v3 새 게임: 스토어 초기화 → 시즌 생성 → 로스터 생성·슬롯 생성 → hydrate */
export async function startNewGameV3(opts: StartNewGameV3Options): Promise<{ npcCount: number; worldSeed: number }> {
  gameStore.setCurrentSlotId(opts.slotId);
  gameStore.initNew(opts.protagonist);
  seasonStore.initSeason("LEAGUE_HIGHSCHOOL", opts.seasonYear, 52, []);
  await seasonStore.initAllLeaguesV3(opts.seasonYear, opts.protagonist.teamId);

  // slim 블롭 구성 (npcs/npcLiveStats는 npc 테이블이 정본)
  const slimGame: SaveGame = { ...gameStore.toSaveGame(), npcs: [] };
  const season = seasonStore.toSaveSeason();
  const slimSeason: SaveSeason = { ...season, npcLiveStats: {} };

  const r = await createNewGameV3({
    slotId: opts.slotId,
    slotName: opts.slotName,
    seasonYear: opts.seasonYear,
    protagonist: slimGame,
    season: slimSeason,
  });
  await slotRepo.setMeta(opts.slotId, { team_id: opts.protagonist.teamId });

  await hydrateStoresFromSlot(opts.slotId);
  return { npcCount: r.npcCount, worldSeed: r.worldSeed };
}
