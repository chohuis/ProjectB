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
import { isLeagueInScope } from "../config/releaseScope";
import { HS_ACTIVE_TEAMS_V3 } from "../utils/leagueScheduler";
import { SANGMU_TEAM_IDS, leagueOfTeam } from "../utils/ids";
import { neededPositions } from "../utils/rosterEngine";

/**
 * 고교 팀 투수 하한. **실측에서 최소 4명까지 떨어졌다** — 선발 로테이션이
 * 안 돌아간다. 신입생 투수 비율이 `rand < 0.3` 고정 확률이라 포지션과 같은
 * 이유로 팀 단위 편차가 누적됐다.
 */
const HS_MIN_PITCHERS = 8;

/**
 * 재능 분포를 규칙 파일에서 꺼낸다. **세 생성 경로가 같은 값을 봐야 한다** —
 * 초기 세계 생성만 분산이 있고 신입생이 고정값이면 창단 세대만 에이스가 되고
 * 리그가 해마다 얇아진다(실측 6시즌 OVR 상위25% 89.3 → 82.1).
 */
const talentOf = (rf: { talentRules?: Record<string, unknown> }) => rf.talentRules;

/**
 * 육성선수 생성 계측 — **상한이 병목인지 유출이 병목인지 가른다.**
 *
 * ⚠ `maxPerYear`를 추측으로 올리면 안 된다. 실패한 2군 팀이 야수 17·투수 6이면
 * `short = 3`이라 상한 4에 **안 걸린다** — 올려도 안 고쳐진다. 이번 세션에서
 * 하한을 잘못 올려 1군을 굶긴 적이 있다(2군 하한 9→12가 1군 야수를 12→7로
 * 무너뜨렸다). **병목을 재고 나서 숫자를 만진다.**
 */
export interface FarmDevRecord {
  year: number; teamId: string; pit: number; bat: number;
  short: number; want: number; capped: boolean; noCatcher: boolean;
}
const farmDevLog: FarmDevRecord[] = [];
export function getFarmDevLog(): FarmDevRecord[] { return farmDevLog; }
import type { SaveGame, ProtagonistSave, NpcSaveState } from "../types/save";
import type { SaveSeason } from "../types/season";
import type { SaveSlotMeta } from "../types/projectb.d";

/**
 * v3 슬롯 목록 (SaveSlotScreen 기존 표시 형식으로 변환)
 *
 * ⚠ **한 숫자를 두 뜻으로 쓰고 있었다.** 이 함수의 "V3"는 세이브 **구조 세대**
 * (파일명 `slot3_*.db`)인데, `schema_version`은 마이그레이션이 하나 늘 때마다
 * 올라가는 **번호**다. `=== "3"`으로 못 박혀 있어서 스키마가 v4로 오른 뒤
 * **만들어진 모든 슬롯이 목록에서 사라졌다** — 세이브 파일은 멀쩡히 있는데
 * 게임은 "저장된 기록이 없습니다"라고 했다. 즉 **불러오기가 통째로 죽어 있었다.**
 *
 * 그래서 숫자 비교로 바꾼다. 다음 마이그레이션에서 또 사라지지 않는다.
 * (걸러낼 대상은 v3 **이전** 구조의 세이브뿐이고, 그건 파일명부터 다르다)
 */
export const MIN_SLOT_SCHEMA = 3;

export async function listSlotsV3(): Promise<SaveSlotMeta[]> {
  const metas = await slotRepo.listSlots();
  return metas
    .filter((m) => Number(m.schema_version) >= MIN_SLOT_SCHEMA)
    .map((m) => ({
      slotId: m.slotId,
      name: m.slot_name || m.slotId,
      updatedAt: m.updated_at ?? "",
      preview: {
        careerStage: m.career_stage ?? null,
        seasonYear: m.season_year ? Number(m.season_year) : null,
        currentWeek: m.current_week ? Number(m.current_week) : null,
        teamId: m.team_id ?? null,
        careerW: m.career_w != null ? Number(m.career_w) : null,
        careerL: m.career_l != null ? Number(m.career_l) : null,
        careerEra: m.career_era || null,
        careerSeasons: m.career_seasons != null ? Number(m.career_seasons) : null,
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
  // ⚠ 목록과 **같은 하한을 쓴다.** 예전엔 여기도 `!== "3"`이라, 목록만 고치면
  // 슬롯이 보이는데 누르면 "저장 파일을 불러오지 못했습니다"가 떴다
  if (!(Number(meta.schema_version) >= MIN_SLOT_SCHEMA)) return false;

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

  const rulesFile = await loadRosterRules();
  const rules = rulesFile.rosterRules["LEAGUE_HIGHSCHOOL"];
  if (!rules) return 0;
  const perYear = Math.max(1, Math.round(rules.rosterSize / (rules.gradeMax ?? 3)));

  // 팀별 현재 인원 — 한 번만 센다 (102팀 × 5,600명을 매번 훑으면 느리다)
  //
  // ⚠ **`active`만 세면 안 된다.** 부상자도 로스터를 차지한다. `active`만
  // 세던 시절엔 부상자 수만큼 빈 자리로 착각해 정원을 넘겨 생성했다
  // (부상 상태가 안 풀리는 결함과 겹쳐 최대 47%까지 과잉 생성됐다).
  // 자리를 비우는 건 **은퇴뿐**이다.
  const sizeByTeam = new Map<string, number>();
  // 포지션 구성도 같이 모은다 — 신입생을 **부족한 자리부터** 배정하기 위해서다
  const rosterByTeam = new Map<string, Array<{ playerType?: string; position?: string }>>();
  for (const n of g.npcs) {
    if (n.careerStatus === "retired" || !n.currentTeam) continue;
    if (n.currentLeague !== "LEAGUE_HIGHSCHOOL") continue;
    sizeByTeam.set(n.currentTeam, (sizeByTeam.get(n.currentTeam) ?? 0) + 1);
    const arr = rosterByTeam.get(n.currentTeam) ?? [];
    arr.push({ playerType: n.playerType, position: n.position });
    rosterByTeam.set(n.currentTeam, arr);
  }

  const newOnes: NpcSaveState[] = [];
  for (const teamId of HS_ACTIVE_TEAMS_V3) {
    // 빈 자리만큼만 만든다. 정원을 넘기지 않고, 모자라면 반드시 채운다
    let want = Math.min(perYear, rules.rosterSize - (sizeByTeam.get(teamId) ?? 0));
    // ⚠ **정원이 찼어도 포수가 0명이면 한 명은 만든다.** 졸업으로 그 학교의
    // 유일한 포수가 빠졌는데 정원이 차 있으면 `want <= 0`으로 건너뛰어,
    // 아마추어엔 승강도 육성선수도 없으니 **포수 없이 한 해를 났다**
    // (실측 102팀 중 1팀). 30명 팀에 31번째를 만드는 쪽이 낫다 —
    // 정원 초과분은 다음 해 졸업으로 저절로 풀린다.
    const cur = rosterByTeam.get(teamId) ?? [];
    if (!cur.some((p) => p.position === "C")) want = Math.max(want, 1);
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
        // ⚠ **안 넘기면 무작위 폴백이 투수 30%가 된다**(생성은 45%).
        // 세대 교체마다 리그가 30%로 수렴해 파이프라인 전체가 마른다
        pitcherRatio: rules.pitcherRatio ?? 0.45,
        talent: talentOf(rulesFile),
        // ⚠ 이걸 안 넘기면 생성기가 포지션을 무작위로 뽑는다 — 평균으로는
        // 균등해도 팀 단위 편차가 해마다 누적돼 포수 0명인 팀이 생긴다
        neededPositions: neededPositions(
          cur, want, HS_MIN_PITCHERS),
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

/**
 * 해외 리그(ABL·JBL) 신인 배정 — **매년 부족분만 채운다.**
 *
 * 국내는 고교 → 대학/독립 → 드래프트 → 프로라는 **다단계 파이프라인**이
 * 인구를 공급한다. 해외엔 그런 하부 구조가 없으므로 리그에 직접 배정한다
 * (사용자 확정 2026-08-02).
 *
 * ⚠ **이게 없으면 팜이 마른다.** `fill_first_teams`가 1군을 `rosterMin`까지
 * 채우려고 팜에서 최고 선수를 빼오는데, 팜을 채우는 경로가 없었다 —
 * 실측 ABL_FARM 544 → 356 → 265 → 184(팀당 최소 5명).
 *
 * 계산은 `generateFreshmenV3`(고교 신입생)와 같다: 은퇴자만 자리를 비우고,
 * `rosterSize`까지 모자란 만큼만 만든다. KBL이 외국인을 데려가 생긴 빈자리도
 * 다음 해에 여기서 메워지므로 **수지가 저절로 맞는다.**
 */
export async function generateOverseasIntakeV3(seasonYear: number): Promise<number> {
  if (!isV3SlotActive()) return 0;
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return 0;

  // ⚠ 여기서 `rulesFile`은 **`rosterRules` 하위 객체**다(아래에서 `rulesFile[leagueId]`로
  // 쓴다). 다른 두 생성 경로의 `rulesFile`은 파일 전체라 이름이 같고 모양이 다르다 —
  // `talentRules`처럼 최상위에 있는 값을 여기서 읽으면 조용히 `undefined`가 되고
  // 폴백으로 돈다. 전체 파일을 따로 들고 있는다.
  const rulesAll = await loadRosterRules();
  const rulesFile = rulesAll.rosterRules;
  const teamsAll = get(masterStore).teams;

  // 리그별 현재 인원 — 전체를 한 번만 훑는다
  const sizeByTeam = new Map<string, number>();
  for (const n of g.npcs) {
    if (n.careerStatus === "retired" || !n.currentTeam) continue;
    sizeByTeam.set(n.currentTeam, (sizeByTeam.get(n.currentTeam) ?? 0) + 1);
  }

  const newOnes: NpcSaveState[] = [];
  for (const leagueId of ["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
    if (!isLeagueInScope(leagueId)) continue;
    const rules = rulesFile[leagueId];
    if (!rules) continue;

    // refs엔 팜 leagueId가 없다 — 상위 리그의 `_2` 팀이 팜이다
    const isFarm = leagueId.endsWith("_FARM");
    const base = isFarm ? leagueId.slice(0, -"_FARM".length) : leagueId;
    const teams = teamsAll
      .filter((t) => t.leagueId === base && t.id.endsWith(isFarm ? "_2" : "_1"))
      .map((t) => t.id);

    for (const teamId of teams) {
      const want = rules.rosterSize - (sizeByTeam.get(teamId) ?? 0);
      if (want <= 0) continue;
      const raw = JSON.parse(
        await window.projectB!.engine("generateFreshmenNative", JSON.stringify({
          schoolId: teamId, teamId,
          annualRosterSize: want,
          pitchingOvrMin: rules.pitchingOvrMin, pitchingOvrMax: rules.pitchingOvrMax,
          battingOvrMin: rules.battingOvrMin, battingOvrMax: rules.battingOvrMax,
          devRateMin: rules.devRateMin, devRateMax: rules.devRateMax,
          namedNpcs: [], seasonYear, idOffset: 0,
          pitcherRatio: rules.pitcherRatio ?? 0.45,
          talent: talentOf(rulesAll),
        // ⚠ **안 넘기면 무작위 폴백이 투수 30%가 된다**(생성은 45%).
        // 세대 교체마다 리그가 30%로 수렴해 파이프라인 전체가 마른다
        })),
      ) as NpcSaveState[];
      if (!Array.isArray(raw)) continue;
      // 생성기는 리그를 모른다 — 팀에서 파생한 값으로 맞춘다
      for (const n of raw) {
        n.currentLeague = leagueOfTeam(teamId) ?? leagueId;
        n.nationality = (rules as { nationality?: NpcSaveState["nationality"] }).nationality;
      }
      newOnes.push(...raw);
    }
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

/**
 * 육성선수 — **2군이 보직 하한 아래로 내려가면 그만큼만 만든다.**
 *
 * ⚠ **유출을 다 막아도 사람이 모자라면 소용없다.** 콜다운·트레이드·공백 충원에
 * 전부 하한을 걸었더니 이번엔 반대편이 막혔다 — 2군 투수가 하한이면 1군
 * 포수 공백을 메울 수가 없다. 하한을 더 걸어봐야 교착일 뿐이고,
 * **없는 사람을 만들어야 한다.**
 *
 * 실측(4시즌): KBL 2군 투수 5~7명(하한 9, 2/10팀 미달) · 포수 0명 2팀.
 *
 * ⚠ **정원까지 채우지 않는다.** 국내 2군은 드래프트가 공급하므로 정원을
 * 채우면 드래프트가 무의미해진다. 해외 팜(`generateOverseasIntakeV3`)이
 * `rosterSize`까지 채우는 건 그쪽엔 하부 구조가 아예 없기 때문이다.
 *
 * 실제 KBO 육성선수 제도와도 맞는다 — 정식 등록 외 인원을 구단이 따로 뽑는다.
 * 수치 정본은 `generation_rules.json`의 `developmentPlayerRules`다.
 */
export async function generateFarmDevelopmentV3(seasonYear: number): Promise<number> {
  if (!isV3SlotActive()) return 0;
  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return 0;

  const rulesFile = await loadRosterRules();
  const dev = (rulesFile as { developmentPlayerRules?: {
    leagues?: string[]; minPitchers?: number; minBatters?: number; maxPerYear?: number;
  } }).developmentPlayerRules;
  if (!dev?.leagues?.length) return 0;

  const teamsAll = get(masterStore).teams;
  const newOnes: NpcSaveState[] = [];

  for (const leagueId of dev.leagues) {
    const rules = rulesFile.rosterRules[leagueId];
    if (!rules) continue;
    const base = leagueId.endsWith("_FARM") ? leagueId.slice(0, -"_FARM".length) : leagueId;
    const teams = teamsAll.filter((t) => t.leagueId === base && t.id.endsWith("_2")).map((t) => t.id);

    // 팀별 현재 구성 — 한 번만 훑는다
    const roster = new Map<string, Array<{ playerType?: string; position?: string }>>();
    for (const n of g.npcs) {
      if (n.careerStatus === "retired" || !n.currentTeam) continue;
      if (n.currentLeague !== leagueId) continue;
      const arr = roster.get(n.currentTeam) ?? [];
      arr.push({ playerType: n.playerType, position: n.position });
      roster.set(n.currentTeam, arr);
    }

    for (const teamId of teams) {
      const cur = roster.get(teamId) ?? [];
      const pit = cur.filter((p) => p.playerType === "pitcher").length;
      const bat = cur.length - pit;
      // ⚠ 총원이 아니라 **부류별로** 본다. 야수 25명·투수 4명인 팀은 총원으로는
      // 멀쩡해 보이지만 등판이 안 돈다 — 이 프로젝트에서 반복된 형태다.
      let short = Math.max(0, (dev.minPitchers ?? 0) - pit)
                + Math.max(0, (dev.minBatters ?? 0) - bat);
      // ⚠ **부류별로 봐도 자리는 못 본다.** 야수 21·투수 21인데 포수가 0명인
      // 팀은 `short === 0`이라 한 명도 안 만들어진다 — 이 프로젝트에서 반복된
      // "몇 명은 맞고 어느 자리가 틀렸다"의 그 형태다. 콜업 쪽은 2군의
      // 마지막 포수를 지키게 고쳤지만, 포수는 은퇴·입대·방출로도 빠진다.
      // 실측 KBL 2군 1~2팀이 포수 0명으로 시즌을 났다.
      if (!cur.some((p) => p.position === "C")) short = Math.max(short, 1);
      // ⚠ **정원으로 막으면 안 된다.** 처음엔 `rosterMax − 총원`을 여유로 뒀는데
      // W1의 2군은 총원이 꽉 차 있다(투수 6 / 야수 28처럼 **총원은 맞고 보직이
      // 틀린** 상태다). 그래서 한 명도 안 만들어졌고 실측이 그대로였다 —
      // 이 작업 내내 잡아온 "몇 명은 맞는데 어느 자리가 틀렸다"를 그대로 재현했다.
      //
      // 육성선수는 **정원 밖 인원**이다(실제 KBO도 정식 등록 외로 뽑는다).
      // 정원 초과분은 오프시즌 캡이 남아도는 부류부터 정리하면서 저절로 맞는다.
      // 폭주는 `maxPerYear`가 막는다.
      const want = Math.min(short, dev.maxPerYear ?? 4);
      // 계측 — 판단의 입력과 결과를 그대로 남긴다
      if (farmDevLog.length < 4000) {
        farmDevLog.push({
          year: seasonYear, teamId, pit, bat, short, want,
          capped: short > (dev.maxPerYear ?? 4),
          noCatcher: !cur.some((p) => p.position === "C"),
        });
      }
      if (want <= 0) continue;

      const raw = JSON.parse(
        await window.projectB!.engine("generateFreshmenNative", JSON.stringify({
          schoolId: teamId, teamId,
          annualRosterSize: want,
          pitchingOvrMin: rules.pitchingOvrMin, pitchingOvrMax: rules.pitchingOvrMax,
          battingOvrMin: rules.battingOvrMin, battingOvrMax: rules.battingOvrMax,
          devRateMin: rules.devRateMin, devRateMax: rules.devRateMax,
          namedNpcs: [], seasonYear, idOffset: 0,
          pitcherRatio: rules.pitcherRatio ?? 0.45,
          talent: talentOf(rulesFile),
        // ⚠ **안 넘기면 무작위 폴백이 투수 30%가 된다**(생성은 45%).
        // 세대 교체마다 리그가 30%로 수렴해 파이프라인 전체가 마른다
          // 포수 0명인 팀이 여기서 메워진다 — 빈 야수 자리가 맨 앞이다
          neededPositions: neededPositions(cur, want, dev.minPitchers ?? 0),
        })),
      ) as NpcSaveState[];
      if (!Array.isArray(raw)) continue;
      // 생성기는 리그를 모른다 — 팀에서 파생한 값으로 맞춘다
      for (const n of raw) n.currentLeague = leagueOfTeam(teamId) ?? leagueId;
      newOnes.push(...raw);
    }
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

  // ⚠ **refs엔 `LEAGUE_*_FARM` leagueId가 없다.** 팜은 상위 리그 팀 중 `_2`
  // 접미사로 파생한다(`roster_gen.rs`의 plan과 같은 규칙). `leagueId` 일치로만
  // 찾으면 해외 팜이 **0팀**이 되어 일정만 깔리고 선수가 안 생겼다.
  const isFarm = leagueId.endsWith("_FARM");
  const baseLeague = isFarm ? leagueId.slice(0, -"_FARM".length) : leagueId;
  const isPro = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"].includes(baseLeague);
  const teams = get(masterStore).teams
    .filter((t) => t.leagueId === baseLeague)
    // 상무는 Lazy 활성화 대상이 아니다 — 로스터는 military_roster.rs가 따로 만든다
    .filter((t) => (isPro
      ? t.id.endsWith(isFarm ? "_2" : "_1")
      : !SANGMU_TEAM_IDS.has(t.id)))
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
  /**
   * 세계 시드. **새 게임 화면이 정해 넘긴다.**
   *
   * 예전엔 `createNewGameV3`가 `Date.now()`로 만들었는데, 그러면 팀 고를 때
   * 보여준 로스터와 실제로 만들어지는 로스터가 **다른 시드에서 나온다** —
   * 미리보기가 거짓말이 된다. 안 넘기면 예전처럼 여기서 정해진다.
   */
  worldSeed?: number;
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
    // 미리보기와 같은 시드여야 "이 선수들과 뛴다"가 사실이 된다
    worldSeed: opts.worldSeed,
  });
  await slotRepo.setMeta(opts.slotId, { team_id: opts.protagonist.teamId });

  // worldSeed를 시즌 상태에도 복사한다 — 조 추첨처럼 주중에 필요한 결정적 뽑기가
  // slot.db를 비동기로 읽지 않아도 되게 (SaveSeason.worldSeed 주석 참고)
  seasonStore.setWorldSeed(r.worldSeed);
  await seasonStore.save();

  await hydrateStoresFromSlot(opts.slotId);
  return { npcCount: r.npcCount, worldSeed: r.worldSeed };
}
