import { derived, get, writable } from "svelte/store";
import { gameStore, _registerSeasonGetter } from "./game";
import { masterStore } from "./master";
import type {
  LeagueSeasonState,
  MatchResult,
  NpcLiveStat,
  PendingAction,
  PlayerCondition,
  PostseasonSeries,
  SaveSeason,
  ScheduleEntry,
  Standing,
} from "../types/season";
import type { NpcInjuryEntry } from "../types/save";
import type { EntityRow } from "../stores/master";
import { makeEmptySeason, PENDING_ACTION_TYPES, SAVE_SEASON_VERSION } from "../types/season";

// 로드 때 거를 기준 — 정본은 `types/season.ts`의 `PENDING_ACTION_TYPES`다.
// 화면이 없는 정지 조건이 큐에 남으면 세이브가 잠긴다(`hydrateFromSlot` 주석)
const KNOWN_PENDING_TYPES = new Set<string>(PENDING_ACTION_TYPES);
import { accumulateStats, migrateLeagueState, sanitizeStatsRecord, updateStandings } from "../utils/season-helpers";
import {
  ALL_TEAMS_BY_LEAGUE,
  DEFAULT_LEAGUE_CONFIGS,
  generateAllLeagueSchedules,
  HS_ACTIVE_TEAMS_V3,
  HS_REGIONS,
  HS_TARGET_GAMES,
  HS_START_WEEK,
  HS_END_WEEK,
  generatePreseasonSchedules,
  UNIV_GROUPS,
  UNIV_TARGET_GAMES,
  UNIV_REGULAR_START_WEEK,
  UNIV_REGULAR_END_WEEK,
  generateRegionalSchedule,
  makeStandings,
} from "../utils/leagueScheduler";
import * as BackgroundLeague from "./backgroundLeague";
import { switchProtagonistLeague as switchProtagonistLeagueState } from "../utils/protagonistLeagueSwitch";
import * as NpcInjury from "./npcInjury";
import * as Postseason from "./postseason";

/**
 * 시범경기를 리그 일정 앞에 붙인다.
 *
 * ⚠ **같은 배열에 넣는다.** 따로 두면 화면·순위 계산이 두 곳을 봐야 하고,
 * 그러면 한쪽을 빠뜨리는 자리가 생긴다. 구분은 `phase`와 `isFriendly`가 한다.
 */
function mergePreseason(
  regular: Record<string, ScheduleEntry[]>,
  preseason: Record<string, ScheduleEntry[]>,
): Record<string, ScheduleEntry[]> {
  const out = { ...regular };
  for (const [lid, pre] of Object.entries(preseason)) {
    out[lid] = [...pre, ...(out[lid] ?? [])];
  }
  return out;
}

// ── seasonStore 내부 상태 ─────────────────────────────────────
export type SeasonStoreState = SaveSeason;

function buildInitialState(): SeasonStoreState {
  return makeEmptySeason("LEAGUE_HIGHSCHOOL", 2026, 52, []);
}

// npcLiveStats 전용 스토어 — seasonStore 업데이트와 분리하여 subscriber 범람 방지
import { npcLiveStatsStore } from "./npcLiveStats";
export { npcLiveStatsStore } from "./npcLiveStats";

// ── 스토어 생성 ───────────────────────────────────────────────
function createSeasonStore() {
  const { subscribe, update, set } = writable<SeasonStoreState>(buildInitialState());

  return {
    subscribe,

    toSaveSeason(): SaveSeason {
      const s = get({ subscribe });
      return { ...s, npcLiveStats: get(npcLiveStatsStore), savedAt: new Date().toISOString() };
    },

    hydrateFromSlot(season: SaveSeason) {
      const sanitizedStats = sanitizeStatsRecord(season.stats ?? {});
      npcLiveStatsStore.set(season.npcLiveStats ?? {});
      set({
        ...season,
        // ⚠ **화면이 없는 정지 조건은 세이브를 잠근다.**
        //
        // `pendingActions`는 "이걸 처리해야 주가 넘어간다"는 큐다. 화면이
        // 그 타입을 안 그리면 아무것도 안 뜨는데 `hasPendingAction`은 계속
        // true라 **"다음 주 진행"이 영영 안 먹는다.**
        //
        // 실제로 그렇게 됐다: `preGameBriefing`을 정지 조건에서 뺐더니
        // (2026-08-07) 그게 큐에 든 채 저장돼 있던 세이브가 W6에서 잠겼다.
        // 화면엔 아무 변화가 없어서 "주 진행이 고장났다"로 보인다.
        //
        // 타입이 바뀔 때마다 세이브가 죽으면 안 되므로, **아는 타입만 남긴다.**
        pendingActions: (season.pendingActions ?? []).filter(
          (a) => KNOWN_PENDING_TYPES.has((a as { type?: string })?.type ?? ""),
        ),
        stats: sanitizedStats,
        currentDate:     season.currentDate     ?? `${season.seasonYear ?? 2026}-03-01`,
        leagueSchedules: season.leagueSchedules ?? {},
        leagueState: Object.fromEntries(
          // 🔴 **리그 버킷을 정리 안 하고 있었다** (2026-08-28). 위
          //   `sanitizeStatsRecord`는 `season.stats`(주인공 개인 버킷)만
          //   거쳤는데, **리더보드·순위 화면이 읽는 건 여기다**
          //   (`leagueStatsOf`). NPC 전원의 `pa`·`obp`·`slg`·`ops`와 NaN이
          //   로드에서 안 고쳐졌다 — "구 세이브도 로드 시점에 정상으로
          //   돌아온다"던 주석이 **주인공에게만 참**이었다.
          // ⚠ `migrateLeagueState` 안에서 하지 않는다 — 그건 경기마다 돈다
          Object.entries(season.leagueState ?? {}).map(([lid, ls]) => {
            const m = migrateLeagueState(ls as Partial<LeagueSeasonState>);
            return [lid, { ...m, stats: sanitizeStatsRecord(m.stats) }];
          })
        ),
        postseasonBrackets: season.postseasonBrackets ?? {},
        ablEastTeams: season.ablEastTeams ?? [], ablWestTeams: season.ablWestTeams ?? [],
        npcLiveStats: {},
        // 없으면 빈 배열 — 이게 없으면 `pushInjuryNews`가 undefined에 스프레드한다
        injuryNewsBuffer: season.injuryNewsBuffer ?? [],
        // 없으면 빈 배열 — 이게 없으면 pushMyBodyEvent 가 undefined 에 스프레드한다
        myBodyBuffer: season.myBodyBuffer ?? [],
        npcRetired: season.npcRetired ?? [],
        schedule: (season.schedule ?? []).map((e) => e.gameDate ? e : { ...e, gameDate: `${season.seasonYear ?? 2026}-03-01` }),
      });
    },

    // entity 목록 기준으로 npcLiveStats 초기화 (W1 또는 신규 엔티티 대응)
    initNpcLiveStats(entities: import("../stores/master").EntityRow[], seasonYear?: number) {
      npcLiveStatsStore.update((stats) => {
        const next = { ...stats };
        for (const e of entities) {
          if (e.role !== "player") continue;
          if (seasonYear && (e as any).entryYear && (e as any).entryYear > seasonYear) continue;
          if (next[e.id]) continue;
          const p = (e.details as import("../stores/master").EntityDetails)?.player;
          if (!p) continue;
          next[e.id] = {
            pitching: p.pitching ? { ...p.pitching } : undefined,
            batting:  p.batting  ? { ...p.batting  } : undefined,
            pitchingXp: {},
            battingXp:  {},
            seasonStartPitching: p.pitching ? { ...p.pitching } : undefined,
            seasonStartBatting:  p.batting  ? { ...p.batting  } : undefined,
            peakOvr: p.pitching?.ovr ?? p.batting?.ovr,
            pitches: p.pitches ? [...p.pitches] : [],
          };
        }
        return next;
      });
    },

    // 월간 성장 결과를 npcLiveStats에 반영
    applyNpcLiveGrowth(
      updated: Array<{
        npcId: string;
        pitching?: import("../types/save").NpcPitchingAttrs;
        batting?: import("../types/save").NpcBattingAttrs;
        pitchingXp: Record<string, number>;
        battingXp: Record<string, number>;
        peakOvr: number;
        pitches: import("../types/save").PitchEntry[];
        pitchInTraining?: { id: string; progress: number; isNew: boolean };
        agingDebt?: Record<string, number>;
      }>
    ) {
      npcLiveStatsStore.update((stats) => {
        const next = { ...stats };
        for (const u of updated) {
          // 🔴 **없던 블록을 만들지 않는다** (2026-08-31).
          //   Rust `GrowthPatch.pitching` 은 필수 필드라, 투구 블록이 없는
          //   야수를 보내면 serde 가 **0 으로 채워** 되돌려준다. 그대로 쓰면
          //   `live?.pitching?.ovr ?? live?.batting?.ovr` 이 야수를 전부
          //   **OVR 0** 으로 본다 — `??` 는 0 을 안 건너뛴다.
          //
          //   실측: 2주만 돌려도 야수 3,990명 전원에게 투구 OVR 0 이 붙었고,
          //   상무 선발 후보 343명이 그 때문에 상위 70 에 한 명도 못 들어
          //   **3년 39명이 전원 투수**였다.
          //
          // ⚠ 소비하는 자리가 45곳이다. 거기를 다 고치는 게 아니라 **여기**를
          //   막는다 — 성장은 있는 능력을 키우는 일이지 없는 능력을 만드는
          //   일이 아니다.
          const prev = next[u.npcId];
          next[u.npcId] = {
            ...(prev ?? { pitchingXp: {}, battingXp: {} }),
            pitching:        prev && prev.pitching === undefined ? undefined : u.pitching,
            batting:         prev && prev.batting  === undefined ? undefined : u.batting,
            pitchingXp:      u.pitchingXp,
            battingXp:       u.battingXp,
            peakOvr:         u.peakOvr,
            pitches:         u.pitches,
            pitchInTraining: u.pitchInTraining,
            // 노화 누적분을 다음 주로 넘긴다 — 여기서 흘리면 노화가 사라진다
            agingDebt:       u.agingDebt ?? {},
          };
        }
        return next;
      });
    },

    // 시즌 시작 스냅샷 갱신 (W1 호출)
    snapNpcSeasonStart() {
      npcLiveStatsStore.update((stats) => {
        const next = { ...stats };
        for (const id of Object.keys(next)) {
          const live = next[id];
          next[id] = {
            ...live,
            seasonStartPitching: live.pitching ? { ...live.pitching } : undefined,
            seasonStartBatting:  live.batting  ? { ...live.batting  } : undefined,
          };
        }
        return next;
      });
    },

    // v3(클린 브레이크)에서는 항상 currentSlotId가 있어 no-op —
    // 시즌 저장은 gameStore.save()의 slotRepo.setSeason이 전담한다.
    // 이 메서드는 40+ 콜사이트 호환을 위해 시그니처만 유지.
    async save() {
      return;
    },

    /**
     * 새 리그 시즌을 연다 — **season 상태를 통째로 갈아치운다.**
     *
     * 🔴 **`leagueState[주인공리그]`를 같이 세운다** (2026-09-01).
     *
     * `makeEmptySeason`이 `leagueState: {}`로 두는데, 다시 채우는 건
     * **배경 리그 시뮬뿐**이다(`simulateBackgroundWeek`). 주인공 리그는
     * 배경 시뮬을 안 돌고 `syncProtagonistLeagueUpdate`가 처리하는데,
     * 그건 `s.leagueState[lid] ?? {}`에서 시작해 **경기에 나온 두 팀만**
     * 순위표에 넣는다 — 리그 전체 팀이 영영 안 들어온다.
     *
     * 실측(트랙 B · `rankCtxProbe`): 프로 주인공의 `leagueState[LEAGUE_KBL]`
     * 팀 수가 **0**이었다. 최상위 `standings`는 10팀으로 멀쩡한데 리그별
     * 사본만 비어 있었다.
     *
     * ⚠ **조용히 틀린다.** 순위표 화면은 최상위 `standings`를 보므로
     * 멀쩡해 보이고, `leagueState`를 읽는 쪽(다이제스트·트레이드 판단)만
     * 빈 배열을 받는다.
     */
    initSeason(leagueId: string, seasonYear: number, totalWeeks: number, teamIds: string[]) {
      const next = makeEmptySeason(leagueId, seasonYear, totalWeeks, teamIds);
      // 🔴 **씨앗을 잃지 않는다** (2026-09-03). `makeEmptySeason` 에는 worldSeed 가 없어서 무대를 여는
      //   자리(입대 `openMilitarySeason` · 프로 `openProSeason` …)를 지나면 worldSeed 가 undefined → 0 이 됐다.
      //   그 뒤의 seedOf(worldSeed, …) 굴림(부상·시험·진학·병영·성과)이 전부 같은 값으로 돌아가,
      //   병영 밸런스 아홉 판(씨앗 3)이 보직까지 **완전히 같은 결과**였다(씨앗 02 는 박격포병이어야 했다).
      //   시즌 롤오버(`startNewSeason`)는 보존하고 있었다 — 여기만 빠져 있었다.
      next.worldSeed = get({ subscribe }).worldSeed;
      // 🔴 **문장 기억도 잃지 않는다** (2026-09-07 · `check:reportbank` 실측).
      //   `sentenceMemory` 는 「직전에 쓴 문장」이라 **시즌 상태가 아니다** —
      //   비우면 무대를 열 때마다 직전 제외가 초기화돼 같은 제목이 연달아
      //   난다. 15년 헤드리스에서 훈련 3건·내 몸 4건이 그렇게 났다.
      //   ⚠ `triggeredEvents` 와 다르다 — 그쪽은 `once_per_season` 정책의
      //   입력이라 **비우는 게 맞다.**
      next.sentenceMemory = { ...(get({ subscribe }).sentenceMemory ?? {}) };
      // ⚠ 고교·군은 `teamIds`가 빈 배열로 온다 — 그쪽은 뒤에 오는
      //   `initAllLeaguesV3`·`reinitHighschoolSeason`이 채운다
      if (teamIds.length > 0) {
        next.leagueState = {
          [leagueId]: {
            standings: makeStandings(teamIds),
            stats: {}, playerConditions: {}, teamRotationIndex: {},
          },
        };
      }
      set(next);
    },

    /**
     * 국가대표 차출 시작 — 대회 기간 동안 소속팀에서 빠진다.
     * **부상과 같은 취급**이라 승강의 상시 콜업이 그 자리를 메운다
     */
    startNationalDuty(
      npcIds: string[],
      def: import("../usecases/nationalTeam").TournamentDef,
      squadStrength: number,
      endWeek: number,
    ) {
      update((s) => ({
        ...s,
        nationalDuty: Object.fromEntries(npcIds.map((id) => [id, endWeek])),
        activeTournament: { def, squadStrength, endWeek },
      }));
    },

    /** 대회 종료 — 전원 소속팀 복귀 */
    endNationalDuty() {
      update((s) => ({ ...s, nationalDuty: {}, activeTournament: null }));
    },

    /**
     * 다음 시즌을 연다.
     *
     * ⚠ **`s.standings` 가 다음 시즌 팀 목록이다.** 그래서 최상위 순위표를
     * 부분 집합으로 갈아끼우면 리그가 **그만큼 쪼그라든다.**
     *
     * 실측(2026-09-01 회귀): 생존리그 `stageStandings`(현재 단계의
     * `activeTeams` 만 담는다)를 여기 얹었더니 **KBL 1군 발동 444 → 0**,
     * 9시즌 448주를 전부 독립에서 보냈다.
     *
     * 🔴 순위표를 갈아끼우는 코드를 쓰기 전에 **읽는 자리를 전수로 본다.**
     *   `standings` 는 순위만이 아니라 **멤버십**도 겸한다.
     */
    startNewSeason() {
      update((s) => {
        const teamIds = s.standings.map((st) => st.teamId);
        const next = makeEmptySeason(s.leagueId, s.seasonYear + 1, s.totalWeeks, teamIds);
        // 전년도 KBL 최종 순위 보존 — 드래프트 지명 순서에 사용
        const kblStandings = s.leagueState["LEAGUE_KBL"]?.standings ?? [];
        next.prevSeasonKblStandings = kblStandings.length > 0 ? [...kblStandings] : (s.prevSeasonKblStandings ?? []);
        // 전 리그 최종 순위 → 다음 시즌 prev_season 스냅샷 (개나리기 시드가 이걸 쓴다)
        const carried: import("../utils/standingsSnapshot").StandingsSnapshots = {};
        for (const [lid, st] of Object.entries(s.leagueState)) {
          if (!st?.standings || st.standings.length === 0) continue;
          carried[lid] = { prev_season: st.standings.map((x) => ({ ...x })) };
        }
        next.standingsSnapshots = carried;
        next.worldSeed = s.worldSeed;
        // 🔴 **문장 기억은 시즌 상태가 아니다** (2026-09-07 · `check:reportbank`).
        //   비우면 해가 바뀔 때마다 직전 제외가 초기화돼 같은 제목이 연달아
        //   난다 — 소식함에서 「W52 주간 훈련 결과 / W1 주간 훈련 결과」로
        //   같은 말이 두 줄 붙는다. `initSeason` 도 같이 고쳤다.
        next.sentenceMemory = { ...(s.sentenceMemory ?? {}) };
        // 부진 누적은 시즌을 넘겨야 의미가 있다 (경질 판정의 입력)
        next.staffSlumpSeasons = { ...(s.staffSlumpSeasons ?? {}) };
        return next;
      });
    },

    setSchedule(schedule: ScheduleEntry[]) {
      update((s) => ({ ...s, schedule }));
    },

    advanceWeek() {
      update((s) => ({ ...s, currentWeek: s.currentWeek + 1 }));
    },

    setCurrentDate(date: string) {
      update((s) => ({ ...s, currentDate: date }));
    },

    /**
     * ⚠ `rot`을 안 넘기면 **로테이션이 안 돌고 피로도 안 쌓인다.**
     * 넘기는 게 기본이고, 생략은 로테이션 개념이 없는 경기(폴백 시뮬)뿐이다.
     */
    applyMatchResult(
      scheduleId: string,
      result: MatchResult,
      leagueId?: string,
      rot?: {
        nextHomeRotIdx: number;
        nextAwayRotIdx: number;
        pitcherConditions?: Record<string, PlayerCondition>;
      },
    ) {
      update((s) => {
        const entry = s.schedule.find((e) => e.id === scheduleId);
        const homeTeamId = entry?.homeTeamId ?? result.winnerId;
        const awayTeamId = entry?.awayTeamId ?? result.loserId ?? "";
        const schedule = s.schedule.map((e) =>
          e.id === scheduleId ? { ...e, result } : e
        );
        const standings = updateStandings(s.standings, result, homeTeamId, awayTeamId);
        const stats     = accumulateStats(s.stats, result.playerLines);

        if (!leagueId) return { ...s, schedule, standings, stats };

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            standings: updateStandings(cur.standings, result, homeTeamId, awayTeamId),
            stats:     accumulateStats(cur.stats, result.playerLines),
            // ⚠ **로테이션·피로를 여기서도 얹는다.** 예전엔 이 갈래만 빠져 있어서
            // 주인공 팀 공식경기는 로테이션이 안 돌고 피로도 안 쌓였다.
            // `applyFriendlyResult`·`applyProtagonistGroupNpcResult`는 둘 다 한다 —
            // 세 경로가 같은 상태를 다르게 다루면 반드시 어긋난다
            ...(rot ? {
              teamRotationIndex: {
                ...cur.teamRotationIndex,
                [homeTeamId]: rot.nextHomeRotIdx,
                [awayTeamId]: rot.nextAwayRotIdx,
              },
              playerConditions: { ...cur.playerConditions, ...(rot.pitcherConditions ?? {}) },
            } : {}),
          },
        };
        return { ...s, schedule, standings, stats, leagueState };
      });
    },

    applyProtagonistGroupNpcResult(
      scheduleId: string,
      result: MatchResult,
      leagueId: string,
      homeTeamId: string,
      awayTeamId: string,
      nextHomeRotIdx: number,
      nextAwayRotIdx: number,
      pitcherConditions: Record<string, PlayerCondition>,
    ) {
      update((s) => {
        const htId    = s.schedule.find((e) => e.id === scheduleId)?.homeTeamId ?? homeTeamId;
        const schedule = s.schedule.map((e) => (e.id === scheduleId ? { ...e, result } : e));
        const standings = updateStandings(s.standings, result, htId, awayTeamId);
        const stats     = accumulateStats(s.stats, result.playerLines);

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            standings: updateStandings(cur.standings, result, htId, awayTeamId),
            stats:     accumulateStats(cur.stats, result.playerLines),
            playerConditions:  { ...cur.playerConditions, ...pitcherConditions },
            teamRotationIndex: {
              ...cur.teamRotationIndex,
              [homeTeamId]: nextHomeRotIdx,
              [awayTeamId]: nextAwayRotIdx,
            },
          },
        };
        return { ...s, schedule, standings, stats, leagueState };
      });
    },

    /**
     * 전국대회 결과. 개인 기록·로테이션·피로도는 리그 경기와 똑같이 쌓되
     * **순위표만 건드리지 않는다** — 대회 성적이 주말리그 순위에 섞이면
     * 다음 대회 시드가 오염된다.
     */
    applyTournamentResult(
      scheduleId: string,
      result: MatchResult,
      leagueId: string,
      homeTeamId: string,
      awayTeamId: string,
      nextHomeRotIdx: number,
      nextAwayRotIdx: number,
      pitcherConditions: Record<string, PlayerCondition> = {},
    ) {
      update((s) => {
        const schedule = s.schedule.map((e) => (e.id === scheduleId ? { ...e, result } : e));
        const stats    = accumulateStats(s.stats, result.playerLines);

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            stats: accumulateStats(cur.stats, result.playerLines),
            playerConditions:  { ...cur.playerConditions, ...pitcherConditions },
            teamRotationIndex: {
              ...cur.teamRotationIndex,
              [homeTeamId]: nextHomeRotIdx,
              [awayTeamId]: nextAwayRotIdx,
            },
          },
        };
        return { ...s, schedule, stats, leagueState };
      });
    },

    /**
     * **넉아웃 무승부를 재경기로 덮는다** — 점수와 승패만 갈아 끼운다.
     *
     * 🔴 2026-09-06 이전 세이브에는 **무승부로 끝난 대회 본선 경기**가 들어
     *   있다(`knockoutMatchIds` 머리말 — 장미기 2028 R1 M02 동래 4:4 거제).
     *   그 라운드는 승자가 안 찍혀 **매 주 다시 확정되고 같은 소식 id 가 다시
     *   나며**, 대회는 거기서 죽는다. 만드는 쪽은 고쳤으니 여기는 **이미
     *   저장된 것**을 푸는 자리다.
     *
     * ⚠ **`playerLines` 는 안 건드린다.** 그 기록은 이미 `stats` 에 쌓여
     *   있어서, 재경기 기록으로 갈아 끼우면 **이중 계상**이 된다(빼는 길이
     *   없다). 재경기에서 가져오는 것은 **승패뿐**이다 — 대진을 넘기는 데
     *   필요한 것이 그것뿐이기 때문이다.
     *
     * ⚠ **두 일정을 다 본다.** 대회 경기는 주인공 리그면 `schedule`,
     *   아니면 `leagueSchedules[리그]` 에 있다(`scheduleView` 머리말).
     */
    settleDrawnKnockout(
      scheduleId: string,
      homeScore: number,
      awayScore: number,
      winnerId: string,
      loserId: string | null,
    ) {
      update((s) => {
        const patch = (e: ScheduleEntry): ScheduleEntry =>
          e.id === scheduleId && e.result
            ? { ...e, result: { ...e.result, homeScore, awayScore, winnerId, loserId } }
            : e;
        const leagueSchedules: Record<string, ScheduleEntry[]> = {};
        for (const [lid, list] of Object.entries(s.leagueSchedules ?? {})) {
          leagueSchedules[lid] = Array.isArray(list) ? list.map(patch) : list;
        }
        return { ...s, schedule: s.schedule.map(patch), leagueSchedules };
      });
    },

    applyFriendlyResult(
      scheduleId: string,
      result: MatchResult,
      leagueId: string,
      homeTeamId: string,
      awayTeamId: string,
      nextHomeRotIdx: number,
      nextAwayRotIdx: number,
      log: import("../types/season").FriendlyPerformanceLog | null,
      pitcherConditions: Record<string, PlayerCondition> = {},
    ) {
      update((s) => {
        const schedule = s.schedule.map((e) =>
          e.id === scheduleId
            ? { ...e, result, ...(log ? { friendlyStats: { ip: log.ip, er: log.er, k: log.k, bb: log.bb, rating: log.rating } } : {}) }
            : e,
        );
        const cur = s.leagueState[leagueId] ?? { standings: [], stats: {}, playerConditions: {}, teamRotationIndex: {} };
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            teamRotationIndex: {
              ...cur.teamRotationIndex,
              [homeTeamId]: nextHomeRotIdx,
              [awayTeamId]: nextAwayRotIdx,
            },
            playerConditions: { ...cur.playerConditions, ...pitcherConditions },
          },
        };
        return { ...s, schedule, leagueState };
      });
    },

    patchLeagueConditions(leagueId: string, conditions: Record<string, import("../types/season").PlayerCondition>) {
      update((s) => {
        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        return {
          ...s,
          leagueState: {
            ...s.leagueState,
            [leagueId]: {
              ...cur,
              playerConditions: { ...cur.playerConditions, ...conditions },
            },
          },
        };
      });
    },

    injectFriendlySchedule(entries: import("../types/season").ScheduleEntry[]) {
      update((s) => ({
        ...s,
        schedule: [...s.schedule, ...entries].sort((a, b) =>
          a.gameDate.localeCompare(b.gameDate),
        ),
      }));
    },

    pushPendingAction(action: PendingAction) {
      update((s) => ({ ...s, pendingActions: [...s.pendingActions, action] }));
    },

    pushPendingActions(actions: PendingAction[]) {
      if (!actions.length) return;
      update((s) => ({ ...s, pendingActions: [...s.pendingActions, ...actions] }));
    },

    resolvePendingAction(type: PendingAction["type"], id?: string) {
      update((s) => ({
        ...s,
        pendingActions: s.pendingActions.filter((a) => {
          if (a.type !== type) return true;
          if (a.type === "game")              return a.scheduleId !== id;
          if (a.type === "message")           return a.messageId  !== id;
          if (a.type === "event")             return a.eventId    !== id;
          if (a.type === "conditionWarning")  return a.scheduleId !== id;
          return false;
        }),
      }));
    },

    recordTriggeredEvents(triggers: Record<string, number>) {
      if (Object.keys(triggers).length === 0) return;
      update((s) => ({
        ...s,
        triggeredEvents: { ...s.triggeredEvents, ...triggers },
      }));
    },

    /**
     * 등급 줄기의 시즌 상태 (2026-09-08 · §3). 셋을 **한 번에** 쓴다 —
     * 따로 쓰면 store 갱신이 셋이 되고, 상한만 오르고 마지막 주가 안 오르는
     * 식으로 어긋날 자리가 생긴다.
     *
     * ⚠ `starve` 는 **통째로 갈아 끼우지 않고 덮어쓴다** — 엔진은 이번 주
     *   후보만 돌려주므로, 갈아 끼우면 이번 주 조건을 못 넘긴 규칙의 밀린 주가
     *   0 으로 지워진다(무대가 바뀌는 주에 특히 그렇다).
     */
    recordTierState(p: {
      gradeFired: string | null;
      week: number;
      starveUpdates: Record<string, number>;
    }) {
      update((s) => {
        const counts = { ...(s.tierCounts ?? {}) };
        const lastWeek = { ...(s.tierLastWeek ?? {}) };
        if (p.gradeFired) {
          counts[p.gradeFired] = (counts[p.gradeFired] ?? 0) + 1;
          lastWeek[p.gradeFired] = p.week;
        }
        return {
          ...s,
          tierCounts: counts,
          tierLastWeek: lastWeek,
          eventStarve: { ...(s.eventStarve ?? {}), ...p.starveUpdates },
        };
      });
    },

    /**
     * 문장 뱅크의 직전 선택 기록 (Phase 7-6). 저장 안 하면 로드할 때마다
     * 같은 문장이 나온다 — "직전 제외"의 입력이 사라지기 때문이다
     */
    recordSentencePicks(picks: Record<string, number>) {
      if (Object.keys(picks).length === 0) return;
      update((s) => ({
        ...s,
        sentenceMemory: { ...(s.sentenceMemory ?? {}), ...picks },
      }));
    },

    // 고교 102팀 8권역 주말리그 초기화 (DESIGN.md §7 v2)
    //
    // 🔴 **일정 만드는 블록은 `reinitSeasonSchedules` 하나다** (2026-09-02).
    //   예전엔 이 블록이 **세 벌**이었다(여기 · `reinitHighschoolSeason` ·
    //   그리고 고교 밖에는 아예 없었다). 세 벌이면 한쪽만 고쳐진 채 남고,
    //   이 저장소는 그 형태로 세 번 당했다 — 프로 20팀 · 시범경기 누락 ·
    //   졸업 뒤 배경 리그 정지.
    async initAllLeaguesV3(seasonYear: number, protagonistTeamId: string) {
      update((s) => ({ ...s, seasonYear }));
      await this.reinitSeasonSchedules("LEAGUE_HIGHSCHOOL", protagonistTeamId);
    },

    // 학년 진급 시 다음 고교 시즌 재초기화 — 8권역 주말리그 재생성
    // 팀 목록을 인자로 받지 않는다: 일정은 HS_REGIONS(102팀 전체)로 짜이므로
    // 부분 목록을 넘기면 순위표와 일정이 어긋난다.
    //
    // 🔴 **하던 일을 `reinitSeasonSchedules` 로 합쳤다** (2026-09-02).
    //   같은 블록이 두 벌이면 한쪽만 고쳐진 채 남는다 — 이 저장소가
    //   프로 20팀 결함에서 겪은 형태다("같은 함정을 두 자리에서 만났고
    //   한쪽만 닫혔다").
    async reinitHighschoolSeason(protagonistTeamId: string): Promise<void> {
      await this.reinitSeasonSchedules("LEAGUE_HIGHSCHOOL", protagonistTeamId);
    },

    /**
     * 배경 리그 일정을 **다시 채운다** — 주인공 리그는 안 건드린다.
     *
     * 🔴 **고교를 떠나면 배경 리그가 통째로 멈춰 있었다** (2026-09-02).
     *
     * `startNewSeason` 은 `leagueSchedules` 를 **비운다**(`makeEmptySeason`).
     * 그러니 매 시즌 누군가 다시 채워야 하는데, 채우는 자리가 둘뿐이었고
     * **둘 다 고교 전용**이었다:
     *
     * ```
     *   initAllLeaguesV3        새 게임에서 한 번
     *   reinitHighschoolSeason  고교 1→2 · 2→3 진급에서만
     * ```
     *
     * 실측(`probe-traits --path univ` · 씨앗 20260731 · 8시즌):
     *
     * ```
     *   [일정끝:highschool]  9개 리그 전부 — KBL 780/780 · ABL 1296/1296 …
     *   [일정끝:university]  HIGHSCHOOL 233/233 · INDEPENDENT 102/102 ·
     *                        UNIVERSITY **68/0**      ← 프로 6개 리그가 없다
     * ```
     *
     * ⚠ **`일정끝` 한 장으로는 이걸 못 가린다.** 무대의 마지막 주는 대개
     * 롤오버 뒤라 전부 0 으로 보이고, 고교만 꽉 차 보이는 건 방금 **다시
     * 만들었기 때문**이다. `probe:bgsched` 가 시즌 중에 찍는다.
     *
     * ⚠ **주인공 리그를 빼고 넣는다.** 안 빼면 `s.schedule` 과 두 벌이 되고,
     * 배경 시뮬은 `lid === 주인공리그` 를 건너뛰므로 그 벌은 영영 안 치러진
     * 채 세이브에 쌓인다.
     *
     * ⚠ **`leagueState` 는 없는 리그만 만든다.** 주인공 리그 순위표는
     * `initSeason` 이 이미 세웠다 — 덮으면 그걸 지운다.
     */
    async reinitSeasonSchedules(
      myLeagueId: string,
      protagonistTeamId: string,
      opts: { keepOwnSchedule?: boolean } = {},
    ): Promise<void> {
      const seasonYear = get({ subscribe }).seasonYear;

      const [hsEntries, univEntries, otherSchedules, preseason] = await Promise.all([
        generateRegionalSchedule("LEAGUE_HIGHSCHOOL", HS_REGIONS, HS_TARGET_GAMES,
          HS_START_WEEK, HS_END_WEEK, protagonistTeamId, seasonYear),
        // 대학 5조 — 조당 9경기, 조마다 다른 평일 요일 (Phase 5-5b)
        generateRegionalSchedule(
          "LEAGUE_UNIVERSITY", UNIV_GROUPS, UNIV_TARGET_GAMES,
          UNIV_REGULAR_START_WEEK, UNIV_REGULAR_END_WEEK, protagonistTeamId, seasonYear,
          { idPrefix: "UNIVR" },
        ),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
        // ⚠ 빠뜨리면 그 시즌부터 시범경기가 없어진다
        generatePreseasonSchedules(protagonistTeamId, seasonYear),
      ]);

      const all: Record<string, ScheduleEntry[]> = mergePreseason(
        {
          ...otherSchedules,
          LEAGUE_HIGHSCHOOL: hsEntries
            .map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL", isFriendly: e.isFriendly ?? false }))
            .sort((a, b) => a.gameDate.localeCompare(b.gameDate)),
          LEAGUE_UNIVERSITY: univEntries,
        },
        preseason,
      );

      // 주인공 리그 몫을 꺼낸다 — 남은 것만 배경으로 간다
      const own = all[myLeagueId];
      delete all[myLeagueId];

      // 🔴 **시범경기는 주인공에게도 간다** (2026-09-02 · 사용자 확정).
      //
      // 정규 일정을 이미 세워 둔 경로(`keepOwnSchedule`)에서는 위에서 주인공
      // 리그 몫을 통째로 버리는데, 거기 **시범경기가 같이 들려 있었다.**
      // 그래서 배경 프로 리그엔 팀당 12경기가 있고 주인공만 0이었다.
      //
      // ⚠ **정규는 안 붙인다.** 그건 `proSchedule` 이 이미 세웠고, 두 벌이
      //   되면 같은 주에 경기가 겹친다. `isFriendly` 인 것만 고른다.
      // ⚠ 공식 기록엔 안 들어간다(`isFriendly`) — 성적 밸런스를 안 건드리고
      //   컨디션·로테이션 준비만 생긴다.
      const ownPreseason = opts.keepOwnSchedule
        ? (own ?? []).filter((e) => e.isFriendly)
        : [];

      const ownTeams = myLeagueId === "LEAGUE_HIGHSCHOOL"
        ? HS_ACTIVE_TEAMS_V3
        : ALL_TEAMS_BY_LEAGUE[myLeagueId];

      update((s) => {
        const takeOwn = own != null && !opts.keepOwnSchedule;
        // ⚠ **`leagueState` 사본은 전 리그가 있어야 한다.** 이벤트·다이제스트·
        //   트레이드 판단이 최상위 `standings` 가 아니라 여기를 읽는다
        //   (`initSeason` 주석 — "사본만 비어 있었다").
        //   단 **주인공 리그를 직접 세우는 경우가 아니면 안 건드린다** —
        //   프로 경로는 `initSeason` 이 이미 세워 뒀다.
        const leagueState: Record<string, LeagueSeasonState> = { ...s.leagueState };
        for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
          if (lid === myLeagueId && !takeOwn) continue;
          leagueState[lid] = {
            standings: makeStandings(lid === "LEAGUE_HIGHSCHOOL" ? HS_ACTIVE_TEAMS_V3 : teams),
            stats: {}, playerConditions: {}, teamRotationIndex: {},
          };
        }
        // 시범경기는 정규 **앞**에 붙인다 — 화면이 한 흐름으로 읽는다
        const haveIds = new Set(s.schedule.map((e) => e.id));
        const freshPre = ownPreseason.filter((e) => !haveIds.has(e.id));
        return {
          ...s,
          leagueId: takeOwn ? myLeagueId : s.leagueId,
          schedule: takeOwn ? own
            : freshPre.length > 0 ? [...freshPre, ...s.schedule]
            : s.schedule,
          standings: takeOwn && ownTeams ? makeStandings(ownTeams) : s.standings,
          leagueSchedules: { ...s.leagueSchedules, ...all },
          leagueState,
        };
      });
    },

    /**
     * 시즌 중 주인공 리그 교체(승강) — `s.schedule` ↔ `leagueSchedules` (utils/protagonistLeagueSwitch.ts).
     * `gameStore.setProtagonistTeam` 바로 뒤에 부른다 — 소속만 옮기면 일정이 옛 리그에 남는다.
     */
    switchProtagonistLeague(toLeagueId: string, teamId: string) {
      update((s) => switchProtagonistLeagueState(s, toLeagueId, teamId));
    },
    applyWeeklyConditionRecovery(entities: EntityRow[], campBonus?: Record<string, number>) {
      update((s) => BackgroundLeague.applyWeeklyConditionRecovery(s, entities, campBonus));
    },

    async simulateBackgroundLeaguesAsync(
      week: number,
      protagonistLeagueId: string,
      entities: EntityRow[],
      careerStage?: import("../types/save").CareerStage,
    ): Promise<void> {
      const s = get({ subscribe });
      // 🔴 **팀·구장을 넘긴다** — 담장을 고르는 데 쓴다.
      //   안 넘기면 리그 전체가 중립 구장이 된다.
      const mst = get(masterStore);
      const result = await BackgroundLeague.simulateBackgroundLeagues(s, week, protagonistLeagueId, entities, get(npcLiveStatsStore), careerStage,
        { teams: mst.teams, stadiums: mst.stadiums });
      if (!result) return;

      update((st) => ({
        ...st,
        leagueSchedules: result.nextSchedules,
        leagueState:     result.nextLeagueState,
      }));

      if (result.gameLogs.length > 0 && window.projectB?.npcBulkInsertGameLogs) {
        const slotId = get(gameStore).currentSlotId ?? "default";
        await window.projectB.npcBulkInsertGameLogs(JSON.stringify({ slotId, season: s.seasonYear, week, logs: result.gameLogs }));
        void window.projectB.npcTrimGameLogs(JSON.stringify({ slotId, keep: 40 }));
      }
    },

    syncProtagonistLeagueResult(leagueId: string, result: MatchResult, homeTeamId: string, awayTeamId: string) {
      update((s) => BackgroundLeague.syncProtagonistLeagueUpdate(s, leagueId, result, homeTeamId, awayTeamId));
    },

    injectPostseasonEntries(entries: ScheduleEntry[]) {
      update((s) => Postseason.injectPostseasonEntries(s, entries));
    },

    initPostseasonBracket(leagueId: string, series: PostseasonSeries[]) {
      update((s) => Postseason.initPostseasonBracket(s, leagueId, series));
    },

    updatePostseasonBracket(leagueId: string, updatedSeries: PostseasonSeries[]) {
      update((s) => Postseason.updatePostseasonBracket(s, leagueId, updatedSeries));
    },

    /** `ownLeagueId` 를 주면 내 리그(`s.standings`)도 같이 뜬다 — `postseason.ts` 머리말 */
    captureStandingsSnapshot(
      key: import("../utils/standingsSnapshot").SnapshotKey, ownLeagueId?: string,
    ) {
      update((s) => Postseason.captureStandingsSnapshot(s, key, ownLeagueId));
    },

    setStaffSlumpSeasons(map: Record<string, number>) {
      update((s) => ({ ...s, staffSlumpSeasons: map }));
    },

    setWorldSeed(worldSeed: number) {
      update((s) => ({ ...s, worldSeed: worldSeed >>> 0 }));
    },

    setSurvivalState(survival: import("../utils/survivalLeague").SurvivalState) {
      update((s) => Postseason.setSurvivalState(s, survival));
    },

    injectLeagueEntries(leagueId: string, entries: ScheduleEntry[]) {
      update((s) => Postseason.injectLeagueEntries(s, leagueId, entries));
    },

    setGroupStage(stage: import("../utils/tournament").GroupStage) {
      update((s) => Postseason.setGroupStage(s, stage));
    },

    setTournamentBracket(bracket: import("../utils/tournament").TournamentBracket) {
      update((s) => Postseason.setTournamentBracket(s, bracket));
    },

    /**
     * 대회 경기를 일정에 넣는다.
     *
     * ⚠ **주인공 리그 대회만 `schedule`에 들어간다.** 다른 리그 대회는
     * `leagueSchedules`로 간다 — 예전엔 전부 `schedule`에 밀어넣어서
     * 프로 선수의 주간 일정에 고교·대학 대회 경기가 섞였다
     * (실측: pro_kbl 2029 W40에 HS 230·UNIV 85경기).
     * 그러면 주간 루프가 그걸 주인공 경기로 처리한다.
     */
    injectTournamentEntries(entries: ScheduleEntry[], myLeagueId?: string) {
      update((s) => {
        const mine = myLeagueId ?? s.leagueId;
        const own = entries.filter((e) => (e.leagueId ?? mine) === mine);
        const others = entries.filter((e) => (e.leagueId ?? mine) !== mine);
        let next = own.length > 0 ? Postseason.injectTournamentEntries(s, own) : s;
        for (const [lid, list] of Object.entries(
          others.reduce<Record<string, ScheduleEntry[]>>((acc, e) => {
            (acc[e.leagueId!] ??= []).push(e); return acc;
          }, {}),
        )) {
          next = Postseason.injectLeagueEntries(next, lid, list);
        }
        return next;
      });
    },

    /** 주차가 지난 미처리 대회 경기를 이번 주로 당긴다 (대회 교착 방지) */
    pullOverdueTournamentGames(week: number, gameDate: string) {
      update((s) => Postseason.pullOverdueTournamentGames(s, week, gameDate));
    },

    setAblConferences(east: string[], west: string[]) {
      update((s) => Postseason.setAblConferences(s, east, west));
    },

    setNpcInjury(playerId: string, entry: NpcInjuryEntry) {
      update((s) => NpcInjury.setNpcInjury(s, playerId, entry));
    },

    /**
     * 부상 소식 버퍼에 쌓는다 — **월 1회 한 소식으로 나간다.**
     *
     * ⚠ 예전엔 여기서 바로 메시지를 만들어 보냈다. 한 사람당 하나라
     * 소식함이 `부상 소식 — 임도훈 (중증)` 여섯 줄로 채워졌다.
     */
    pushInjuryNews(e: import("../utils/injuryReport").InjuryEvent) {
      update((s) => ({ ...s, injuryNewsBuffer: [...(s.injuryNewsBuffer ?? []), e] }));
    },

    /** 버퍼를 비우고 내용을 돌려준다 — 소식을 만든 쪽이 쓴다 */
    drainInjuryNews(): import("../utils/injuryReport").InjuryEvent[] {
      let out: import("../utils/injuryReport").InjuryEvent[] = [];
      update((s) => {
        out = s.injuryNewsBuffer ?? [];
        return { ...s, injuryNewsBuffer: [] };
      });
      return out;
    },

    /**
     * **주인공** 몸 상태 사건을 쌓는다 — 월 1회 한 소식으로 나간다.
     *
     * ⚠ NPC 부상은 이미 월간 리포트인데 **내 몸만 낱개로 왔다** —
     * 경고 한 통, 부상 결장 한 통, 컨디션 결장 한 통이 따로 떴다.
     * 그 비대칭을 없앤다.
     *
     * ⚠ **부상 발생 자체는 여기 안 쌓는다.** 다치는 순간은 사건이라 즉시
     * 보내야 한다. 여기 모으는 건 경고·결장이다.
     */
    pushMyBodyEvent(e: import("../types/main").MyBodyEvent) {
      update((s) => ({ ...s, myBodyBuffer: [...(s.myBodyBuffer ?? []), e] }));
    },

    drainMyBodyEvents(): import("../types/main").MyBodyEvent[] {
      let out: import("../types/main").MyBodyEvent[] = [];
      update((s) => {
        out = s.myBodyBuffer ?? [];
        return { ...s, myBodyBuffer: [] };
      });
      return out;
    },

    clearNpcInjury(playerId: string) {
      update((s) => NpcInjury.clearNpcInjury(s, playerId));
    },

    tickNpcInjuries(): NpcInjury.HealedNpc[] {
      let healed: NpcInjury.HealedNpc[] = [];
      update((s) => {
        const result = NpcInjury.tickNpcInjuries(s);
        healed = result.healed;
        return result.state;
      });
      return healed;
    },

    retireNpc(playerId: string) {
      update((s) => NpcInjury.retireNpc(s, playerId));
    },

    patchNpcLiveOvr(playerId: string, ovrDelta: number) {
      npcLiveStatsStore.update((stats) => {
        const live = stats[playerId];
        if (!live) return stats;
        return {
          ...stats,
          [playerId]: {
            ...live,
            pitching: live.pitching ? { ...live.pitching, ovr: Math.max(1, (live.pitching.ovr ?? 50) + ovrDelta) } : live.pitching,
            batting:  live.batting  ? { ...live.batting,  ovr: Math.max(1, (live.batting.ovr  ?? 50) + ovrDelta) } : live.batting,
          },
        };
      });
    },

    getLeagueStandings(leagueId: string): Standing[] {
      return get({ subscribe }).leagueState[leagueId]?.standings ?? [];
    },

    async flushAllLeagueStatsToDb(seasonYear: number): Promise<void> {
      const s = get({ subscribe });
      await Postseason.flushAllLeagueStatsToDb(s, seasonYear);
    },
  };
}

export const seasonStore = createSeasonStore();

// gameStore.save()가 슬롯 저장 시 season 데이터를 읽을 수 있도록 getter 등록
_registerSeasonGetter(() => seasonStore.toSaveSeason());

// ── 파생 스토어 ───────────────────────────────────────────────
export const currentStandings = derived(
  seasonStore,
  ($s) => [...$s.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins),
);

export const seasonEnded = derived(
  seasonStore,
  ($s) => $s.totalWeeks > 0 && $s.currentWeek >= $s.totalWeeks,
);

export const hasPendingAction = derived(
  seasonStore,
  ($s) => $s.pendingActions.length > 0,
);

export const nextPendingAction = derived(
  seasonStore,
  ($s) => $s.pendingActions[0] ?? null,
);

export const currentWeekSchedule = derived(seasonStore, ($s) =>
  $s.schedule.filter((e) => e.week === $s.currentWeek),
);
