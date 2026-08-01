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
import { SANGMU_TEAM_IDS } from "../utils/ids";
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

  // ── 스태프를 slot.db에서 읽어온다 ─────────────────────────────
  //
  // **이게 없으면 세계 전체가 스태프 없이 돈다.** `App.svelte`의
  // `masterStore.load()`는 슬롯이 정해지기 **전에** 돌아서 `reloadEntities()`를
  // slotId 없이 부른다 — 스태프는 slot.db에 있으므로 그때는 못 읽는다.
  // 그리고 slotId를 넘겨 다시 부르는 곳이 여기 말고 없었다.
  //
  // 결과: `masterStore.entities`에 감독·코치·구단주가 0명이었고,
  // `staffStatsOf(teamId, entities)`가 전부 기본값 50을 돌려줬다 —
  // 7-5가 배선한 스태프 15종이 실제 게임에선 통째로 죽어 있었다.
  //
  // ⚠ 순서가 중요하다. `reloadEntities`는 `entities`를
  // `[...staffEntities, ...basePlayerEntities]`로 **덮어쓴다.** 그래서
  // `setNpcs`보다 **먼저** 불러야 한다 — 뒤에 부르면 병합해둔 NPC가 지워진다
  // (그게 예전에 "로스터에 주인공+코치+감독만 보이던" 버그였다).
  // seasonYear를 넘기지 않는 건 의도다: v3에서 선수 정본은 slot.db고
  // master.db의 `npc_master`는 Phase 6A에서 비웠다.
  await masterStore.reloadEntities(undefined, slotId);

  gameStore.setNpcs(npcs);  // 전체 교체 — updateNpcs(부분패치) 사용 금지. 이 호출이
  // connectToGameStore 구독을 통해 masterStore.entities를 스태프+NPC로 반응형 재구성한다.
  npcLiveStatsStore.set(liveStats);
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

/**
 * v3 신입생 생성 — 진급으로 빈 자리를 **부족한 만큼 채운다.**
 *
 * ⚠ 예전엔 `if (hasGrade1) continue`였다. "1학년이 하나라도 있으면 그 팀은
 * 건너뛴다"는 뜻인데, 두 가지가 겹쳐 **고교 리그가 매년 말라붙었다**:
 *
 *   · 생성이 요청량을 못 채워 1학년이 절반만 들어온다(실측 507/1,020)
 *   · 그 절반이 남아 있으니 **다음 해엔 102팀 전부가 가드에 걸려 0명**이 된다
 *
 * 실측 붕괴 곡선: 3,060 → 2,533 → 1,749 → 945 (4시즌).
 * 하네스는 이걸 못 봤다 — `advanceWeek`을 안 타고, INV8 임계값도
 * 정상 로스터의 3분의 1이었다.
 *
 * 지금은 팀 정원(`rosterSize`)까지 **모자란 수만큼** 만든다. 한 번에 다 못
 * 채워도 다음 시즌에 이어서 채워지므로 구멍이 누적되지 않는다.
 */
export async function generateFreshmenV3(seasonYear: number): Promise<number> {
  if (!isV3SlotActive()) return 0;
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return 0;

  const rules = (await loadRosterRules()).rosterRules["LEAGUE_HIGHSCHOOL"];
  if (!rules) return 0;
  const perYear = Math.max(1, Math.round(rules.rosterSize / (rules.gradeMax ?? 3)));

  // 팀별 현재 인원 — 한 번만 센다 (102팀 × 5,600명을 매번 훑으면 느리다)
  //
  // ⚠ **`active`만 세면 안 된다.** 부상자도 로스터를 차지한다. `active`만
  // 세던 시절엔 부상자 수만큼 빈 자리로 착각해 정원을 넘겨 생성했다
  // (부상 상태가 안 풀리는 결함과 겹쳐 최대 47%까지 과잉 생성됐다).
  // 자리를 비우는 건 **은퇴뿐**이다.
  const sizeByTeam = new Map<string, number>();
  for (const n of g.npcs) {
    if (n.careerStatus === "retired" || !n.currentTeam) continue;
    if (n.currentLeague !== "LEAGUE_HIGHSCHOOL") continue;
    sizeByTeam.set(n.currentTeam, (sizeByTeam.get(n.currentTeam) ?? 0) + 1);
  }

  const newOnes: NpcSaveState[] = [];
  for (const teamId of HS_ACTIVE_TEAMS_V3) {
    // 빈 자리만큼만 만든다. 정원을 넘기지 않고, 모자라면 반드시 채운다
    const want = Math.min(perYear, rules.rosterSize - (sizeByTeam.get(teamId) ?? 0));
    if (want <= 0) continue;
    const raw = JSON.parse(
      await window.projectB!.engine("generateFreshmenNative", JSON.stringify({
        schoolId: teamId.replace("TEAM_HS_", "SCHOOL_HS_"),
        teamId,
        annualRosterSize: want,
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
    // 상무는 Lazy 활성화 대상이 아니다 — 로스터는 military_roster.rs가 따로 만든다
    .filter((t) => (isPro ? t.id.endsWith("_1") : !SANGMU_TEAM_IDS.has(t.id)))
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
    // 스태프는 국내 전 팀을 한 번에 만든다 (Phase 6A) — power·resource가 생성 보정에 쓰인다
    allTeams: get(masterStore).teams,
  });
  await slotRepo.setMeta(opts.slotId, { team_id: opts.protagonist.teamId });

  // worldSeed를 시즌 상태에도 복사한다 — 조 추첨처럼 주중에 필요한 결정적 뽑기가
  // slot.db를 비동기로 읽지 않아도 되게 (SaveSeason.worldSeed 주석 참고)
  seasonStore.setWorldSeed(r.worldSeed);
  await seasonStore.save();

  await hydrateStoresFromSlot(opts.slotId);
  return { npcCount: r.npcCount, worldSeed: r.worldSeed };
}
