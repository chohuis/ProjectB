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
import { makeEmptySeason, SAVE_SEASON_VERSION } from "../types/season";
import { accumulateStats, migrateLeagueState, sanitizeStatsRecord, updateStandings } from "../utils/season-helpers";
import {
  ALL_TEAMS_BY_LEAGUE,
  DEFAULT_LEAGUE_CONFIGS,
  generateAllLeagueSchedules,
  HS_ACTIVE_TEAMS_V3,
  HS_REGIONS,
  HS_TARGET_GAMES,
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
        stats: sanitizedStats,
        currentDate:     season.currentDate     ?? `${season.seasonYear ?? 2026}-03-01`,
        leagueSchedules: season.leagueSchedules ?? {},
        leagueState: Object.fromEntries(
          Object.entries(season.leagueState ?? {}).map(([lid, ls]) => [lid, migrateLeagueState(ls as Partial<LeagueSeasonState>)])
        ),
        postseasonBrackets: season.postseasonBrackets ?? {},
        ablEastTeams: season.ablEastTeams ?? [], ablWestTeams: season.ablWestTeams ?? [],
        npcLiveStats: {},
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

    applyMatchResult(scheduleId: string, result: MatchResult, leagueId?: string) {
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
          if (a.type === "preGameBriefing")   return a.scheduleId !== id;
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

    clearTriggeredEvents() {
      update((s) => ({ ...s, triggeredEvents: {} }));
    },

    // 고교 102팀 8권역 주말리그 초기화 (DESIGN.md §7 v2)
    async initAllLeaguesV3(seasonYear: number, protagonistTeamId: string) {
      const [hsEntries, univEntries, otherSchedules] = await Promise.all([
        generateRegionalSchedule("LEAGUE_HIGHSCHOOL", HS_REGIONS, HS_TARGET_GAMES, 2, 45, protagonistTeamId, seasonYear),
        // 대학 5조 — 조당 9경기, 조마다 다른 평일 요일 (Phase 5-5b)
        generateRegionalSchedule(
          "LEAGUE_UNIVERSITY", UNIV_GROUPS, UNIV_TARGET_GAMES,
          UNIV_REGULAR_START_WEEK, UNIV_REGULAR_END_WEEK, protagonistTeamId, seasonYear,
          { idPrefix: "UNIVR" },
        ),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
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
        leagueSchedules: { ...otherSchedules, LEAGUE_UNIVERSITY: univEntries },
        leagueState,
        standings: makeStandings(HS_ACTIVE_TEAMS_V3),
      }));
    },

    // 학년 진급 시 다음 고교 시즌 재초기화 — 8권역 주말리그 재생성
    // 팀 목록을 인자로 받지 않는다: 일정은 HS_REGIONS(102팀 전체)로 짜이므로
    // 부분 목록을 넘기면 순위표와 일정이 어긋난다.
    async reinitHighschoolSeason(protagonistTeamId: string): Promise<void> {
      const seasonYear = get({ subscribe }).seasonYear;

      const [hsEntries, univEntries, otherSchedules] = await Promise.all([
        generateRegionalSchedule("LEAGUE_HIGHSCHOOL", HS_REGIONS, HS_TARGET_GAMES, 2, 45, protagonistTeamId, seasonYear),
        // 대학 5조 — 조당 9경기, 조마다 다른 평일 요일 (Phase 5-5b)
        generateRegionalSchedule(
          "LEAGUE_UNIVERSITY", UNIV_GROUPS, UNIV_TARGET_GAMES,
          UNIV_REGULAR_START_WEEK, UNIV_REGULAR_END_WEEK, protagonistTeamId, seasonYear,
          { idPrefix: "UNIVR" },
        ),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
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
        leagueSchedules: { ...otherSchedules, LEAGUE_UNIVERSITY: univEntries },
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

    // 반경 2(드리프트) 리그 순위표 주간 갱신 — R4 반경 게이트
    async driftBackgroundLeaguesAsync(
      protagonistLeagueId: string,
      careerStage: import("../types/save").CareerStage,
      teams: import("./master").TeamRef[],
    ): Promise<void> {
      const s = get({ subscribe });
      const nextLeagueState = await BackgroundLeague.driftBackgroundLeagues(s, protagonistLeagueId, careerStage, teams);
      if (!nextLeagueState) return;
      update((st) => ({
        ...st,
        leagueState: { ...st.leagueState, ...nextLeagueState },
      }));
    },

    syncProtagonistLeagueResult(leagueId: string, result: MatchResult, homeTeamId: string, awayTeamId: string) {
      update((s) => BackgroundLeague.syncProtagonistLeagueUpdate(s, leagueId, result, homeTeamId, awayTeamId));
    },

    applyBackgroundLeagueResult(
      leagueId: string,
      scheduleId: string,
      homeTeamId: string,
      awayTeamId: string,
      result: MatchResult,
      nextHomeRotIdx: number,
      nextAwayRotIdx: number,
      pitcherConditions: Record<string, PlayerCondition>,
    ) {
      update((s) => BackgroundLeague.applyBackgroundLeagueUpdate(s, leagueId, scheduleId, homeTeamId, awayTeamId, result, nextHomeRotIdx, nextAwayRotIdx, pitcherConditions));
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

    injectTournamentEntries(entries: ScheduleEntry[]) {
      update((s) => Postseason.injectTournamentEntries(s, entries));
    },

    setAblConferences(east: string[], west: string[]) {
      update((s) => Postseason.setAblConferences(s, east, west));
    },

    setNpcInjury(playerId: string, entry: NpcInjuryEntry) {
      update((s) => NpcInjury.setNpcInjury(s, playerId, entry));
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
