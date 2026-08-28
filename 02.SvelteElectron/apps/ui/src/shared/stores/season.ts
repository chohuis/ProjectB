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
          next[u.npcId] = {
            ...(next[u.npcId] ?? { pitchingXp: {}, battingXp: {} }),
            pitching:        u.pitching,
            batting:         u.batting,
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

    initSeason(leagueId: string, seasonYear: number, totalWeeks: number, teamIds: string[]) {
      set(makeEmptySeason(leagueId, seasonYear, totalWeeks, teamIds));
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
    async initAllLeaguesV3(seasonYear: number, protagonistTeamId: string) {
      const [hsEntries, univEntries, otherSchedules, preseason] = await Promise.all([
        generateRegionalSchedule("LEAGUE_HIGHSCHOOL", HS_REGIONS, HS_TARGET_GAMES,
          // 🔴 예전엔 `2, 45`가 여기 박혀 있었다 — W45는 **12월 말**이다.
          // 기간은 `leagueScheduler`가 정본이다(CALENDAR_V2.md)
          HS_START_WEEK, HS_END_WEEK, protagonistTeamId, seasonYear),
        // 대학 5조 — 조당 9경기, 조마다 다른 평일 요일 (Phase 5-5b)
        generateRegionalSchedule(
          "LEAGUE_UNIVERSITY", UNIV_GROUPS, UNIV_TARGET_GAMES,
          UNIV_REGULAR_START_WEEK, UNIV_REGULAR_END_WEEK, protagonistTeamId, seasonYear,
          { idPrefix: "UNIVR" },
        ),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
        // 시범경기 — 정규 개막(W5) 앞 4주. 1군 셋만이고 `isFriendly`라
        // 공식 기록엔 안 들어간다(CALENDAR_V2.md)
        generatePreseasonSchedules(protagonistTeamId, seasonYear),
      ]);

      const hsSchedule = hsEntries
        .map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL", isFriendly: e.isFriendly ?? false }))
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

      const leagueState: Record<string, LeagueSeasonState> = {
        LEAGUE_HIGHSCHOOL: { standings: makeStandings(HS_ACTIVE_TEAMS_V3), stats: {}, playerConditions: {}, teamRotationIndex: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
      }

      update((s) => ({
        ...s,
        seasonYear,
        schedule: hsSchedule,
        // ⚠ **시범경기를 정규 앞에 붙인다.** 같은 리그 배열에 넣어야 화면이
        // 한 흐름으로 읽는다 — `phase`로 갈린다
        leagueSchedules: mergePreseason(
          { ...otherSchedules, LEAGUE_UNIVERSITY: univEntries }, preseason),
        leagueState,
        standings: makeStandings(HS_ACTIVE_TEAMS_V3),
      }));
    },

    // 학년 진급 시 다음 고교 시즌 재초기화 — 8권역 주말리그 재생성
    // 팀 목록을 인자로 받지 않는다: 일정은 HS_REGIONS(102팀 전체)로 짜이므로
    // 부분 목록을 넘기면 순위표와 일정이 어긋난다.
    async reinitHighschoolSeason(protagonistTeamId: string): Promise<void> {
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
        // ⚠ **여기도 시범경기를 만든다.** 학년이 바뀔 때마다 리그 일정을
        // 다시 짜는 자리라, 빠뜨리면 2년차부터 시범경기가 없어진다
        generatePreseasonSchedules(protagonistTeamId, seasonYear),
      ]);

      const hsSchedule = hsEntries
        .map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL", isFriendly: e.isFriendly ?? false }))
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

      const leagueState: Record<string, LeagueSeasonState> = {
        LEAGUE_HIGHSCHOOL: { standings: makeStandings(HS_ACTIVE_TEAMS_V3), stats: {}, playerConditions: {}, teamRotationIndex: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
      }

      update((s) => ({
        ...s,
        schedule: hsSchedule,
        standings: makeStandings(HS_ACTIVE_TEAMS_V3),
        leagueSchedules: mergePreseason(
          { ...otherSchedules, LEAGUE_UNIVERSITY: univEntries }, preseason),
        leagueState,
      }));
    },

    applyWeeklyConditionRecovery(entities: EntityRow[]) {
      update((s) => BackgroundLeague.applyWeeklyConditionRecovery(s, entities));
    },

    async simulateBackgroundLeaguesAsync(
      week: number,
      protagonistLeagueId: string,
      entities: EntityRow[],
      careerStage?: import("../types/save").CareerStage,
    ): Promise<void> {
      const s = get({ subscribe });
      const result = await BackgroundLeague.simulateBackgroundLeagues(s, week, protagonistLeagueId, entities, get(npcLiveStatsStore), careerStage);
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

    captureStandingsSnapshot(key: import("../utils/standingsSnapshot").SnapshotKey) {
      update((s) => Postseason.captureStandingsSnapshot(s, key));
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
