import { derived, get, writable } from "svelte/store";
import { gameStore, _registerSeasonGetter } from "./game";
import { masterStore } from "./master";
import type {
  LeagueSeasonState,
  MatchResult,
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
  makeStandings,
  shuffleHsGroups,
} from "../utils/leagueScheduler";
import { generateHsSchedule } from "../utils/scheduleGen";
import * as BackgroundLeague from "./backgroundLeague";
import * as NpcInjury from "./npcInjury";
import * as Postseason from "./postseason";

// ── seasonStore 내부 상태 ─────────────────────────────────────
export type SeasonStoreState = SaveSeason;

function buildInitialState(): SeasonStoreState {
  return makeEmptySeason("LEAGUE_HIGHSCHOOL", 2026, 52, []);
}

// ── 스토어 생성 ───────────────────────────────────────────────
function createSeasonStore() {
  const { subscribe, update, set } = writable<SeasonStoreState>(buildInitialState());

  return {
    subscribe,

    // 앱 시작 시 save_season.json에서 복원 (레거시 — 슬롯 미사용 시 폴백)
    async load() {
      try {
        const raw = await window.projectB?.seasonLoad?.();
        if (raw) {
          const saved = raw as SaveSeason;
          const sanitizedStats = sanitizeStatsRecord(saved.stats ?? {});
          set({
            ...saved,
            stats: sanitizedStats,
            currentDate:     saved.currentDate     ?? `${saved.seasonYear ?? 2026}-03-01`,
            leagueSchedules: saved.leagueSchedules ?? {},
            leagueState: Object.fromEntries(
              Object.entries(saved.leagueState ?? {}).map(([lid, ls]) => [lid, migrateLeagueState(ls as Partial<LeagueSeasonState>)])
            ),
            hsGroupA:           saved.hsGroupA           ?? [],
            hsGroupB:           saved.hsGroupB           ?? [],
            postseasonBrackets: saved.postseasonBrackets  ?? {},
            ablEastTeams:       saved.ablEastTeams        ?? [],
            ablWestTeams:       saved.ablWestTeams        ?? [],
            friendlyLog:        saved.friendlyLog         ?? [],
            schedule: (saved.schedule ?? []).map((e) =>
              e.gameDate ? e : { ...e, gameDate: `${saved.seasonYear ?? 2026}-03-01` }
            ),
          });
        }
      } catch (e) {
        console.warn("[seasonStore] load failed, using defaults", e);
      }
    },

    toSaveSeason(): SaveSeason {
      const s = get({ subscribe });
      return { ...s, savedAt: new Date().toISOString() };
    },

    hydrateFromSlot(season: SaveSeason) {
      const sanitizedStats = sanitizeStatsRecord(season.stats ?? {});
      set({
        ...season,
        stats: sanitizedStats,
        currentDate:     season.currentDate     ?? `${season.seasonYear ?? 2026}-03-01`,
        leagueSchedules: season.leagueSchedules ?? {},
        leagueState: Object.fromEntries(
          Object.entries(season.leagueState ?? {}).map(([lid, ls]) => [lid, migrateLeagueState(ls as Partial<LeagueSeasonState>)])
        ),
        hsGroupA: season.hsGroupA ?? [], hsGroupB: season.hsGroupB ?? [],
        postseasonBrackets: season.postseasonBrackets ?? {},
        ablEastTeams: season.ablEastTeams ?? [], ablWestTeams: season.ablWestTeams ?? [],
        friendlyLog: season.friendlyLog ?? [],
        npcLiveStats: season.npcLiveStats ?? {},
        schedule: (season.schedule ?? []).map((e) => e.gameDate ? e : { ...e, gameDate: `${season.seasonYear ?? 2026}-03-01` }),
      });
    },

    // entity 목록 기준으로 npcLiveStats 초기화 (W1 또는 신규 엔티티 대응)
    initNpcLiveStats(entities: import("../stores/master").EntityRow[]) {
      update((s) => {
        const stats = { ...s.npcLiveStats };
        for (const e of entities) {
          if (e.role !== "player") continue;
          if (stats[e.id]) continue;
          const p = (e.details as import("../stores/master").EntityDetails)?.player;
          if (!p) continue;
          stats[e.id] = {
            pitching: p.pitching ? { ...p.pitching } : undefined,
            batting:  p.batting  ? { ...p.batting  } : undefined,
            pitchingXp: {},
            battingXp:  {},
            seasonStartPitching: p.pitching ? { ...p.pitching } : undefined,
            seasonStartBatting:  p.batting  ? { ...p.batting  } : undefined,
            peakOvr: p.pitching?.ovr ?? p.batting?.ovr,
          };
        }
        return { ...s, npcLiveStats: stats };
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
      }>
    ) {
      update((s) => {
        const stats = { ...s.npcLiveStats };
        for (const u of updated) {
          stats[u.npcId] = {
            ...(stats[u.npcId] ?? { pitchingXp: {}, battingXp: {} }),
            pitching:   u.pitching,
            batting:    u.batting,
            pitchingXp: u.pitchingXp,
            battingXp:  u.battingXp,
            peakOvr:    u.peakOvr,
          };
        }
        return { ...s, npcLiveStats: stats };
      });
    },

    // 시즌 시작 스냅샷 갱신 (W1 호출)
    snapNpcSeasonStart() {
      update((s) => {
        const stats = { ...s.npcLiveStats };
        for (const id of Object.keys(stats)) {
          const live = stats[id];
          stats[id] = {
            ...live,
            seasonStartPitching: live.pitching ? { ...live.pitching } : undefined,
            seasonStartBatting:  live.batting  ? { ...live.batting  } : undefined,
          };
        }
        return { ...s, npcLiveStats: stats };
      });
    },

    async save() {
      if (get(gameStore).currentSlotId) return;
      const s = get({ subscribe });
      const data: SaveSeason = { ...s, savedAt: new Date().toISOString() };
      try {
        await window.projectB?.seasonSave?.(data);
      } catch (e) {
        console.warn("[seasonStore] save failed", e);
      }
    },

    initSeason(leagueId: string, seasonYear: number, totalWeeks: number, teamIds: string[]) {
      set(makeEmptySeason(leagueId, seasonYear, totalWeeks, teamIds));
    },

    startNewSeason() {
      update((s) => {
        const teamIds = s.standings.map((st) => st.teamId);
        return makeEmptySeason(s.leagueId, s.seasonYear + 1, s.totalWeeks, teamIds);
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
          e.id === scheduleId ? { ...e, result } : e,
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
        return {
          ...s,
          schedule,
          leagueState,
          friendlyLog: log ? [...(s.friendlyLog ?? []), log] : (s.friendlyLog ?? []),
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

    async initAllLeagues(seasonYear: number, protagonistTeamId: string, hsGroupA: string[], hsGroupB: string[]) {
      const protagonistGroup = new Set(hsGroupA.includes(protagonistTeamId) ? hsGroupA : hsGroupB);
      const npcGroup         = new Set(hsGroupA.includes(protagonistTeamId) ? hsGroupB : hsGroupA);

      const [allHsEntries, otherSchedules] = await Promise.all([
        generateHsSchedule(hsGroupA, hsGroupB, protagonistTeamId, seasonYear),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
      ]);

      // A조·B조 분리 후 leagueId 부여 (ID 충돌 없음 — Rust가 HS_A_*/HS_B_* 접두사 사용)
      const allHsSchedule = allHsEntries
        .map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL" }))
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

      const leagueState: Record<string, LeagueSeasonState> = {
        LEAGUE_HIGHSCHOOL: { standings: makeStandings([...hsGroupA, ...hsGroupB]), stats: {}, playerConditions: {}, teamRotationIndex: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
      }

      update((s) => ({
        ...s,
        seasonYear,
        schedule: allHsSchedule,
        leagueSchedules: otherSchedules,
        leagueState,
        hsGroupA,
        hsGroupB,
        standings: makeStandings([...hsGroupA, ...hsGroupB]),
      }));
    },

    async reinitHighschoolSeason(protagonistTeamId: string, allHsTeams: string[]): Promise<void> {
      const { groupA, groupB } = await shuffleHsGroups(allHsTeams);
      const seasonYear = get({ subscribe }).seasonYear;

      const [allHsEntries, otherSchedules] = await Promise.all([
        generateHsSchedule(groupA, groupB, protagonistTeamId, seasonYear),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
      ]);

      const allHsSchedule = allHsEntries
        .map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL" }))
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

      const leagueState: Record<string, LeagueSeasonState> = {
        LEAGUE_HIGHSCHOOL: { standings: makeStandings([...groupA, ...groupB]), stats: {}, playerConditions: {}, teamRotationIndex: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
      }

      update((s) => ({
        ...s,
        schedule: allHsSchedule,
        standings: makeStandings([...groupA, ...groupB]),
        leagueSchedules: otherSchedules,
        leagueState,
        hsGroupA: groupA,
        hsGroupB: groupB,
      }));
    },

    applyWeeklyConditionRecovery(entities: EntityRow[]) {
      update((s) => BackgroundLeague.applyWeeklyConditionRecovery(s, entities));
    },

    async simulateBackgroundLeaguesAsync(
      week: number,
      protagonistLeagueId: string,
      entities: EntityRow[],
    ): Promise<void> {
      const s = get({ subscribe });
      let simEntities = entities;
      if (simEntities.length === 0) {
        await masterStore.loadEntities("");
        simEntities = get(masterStore).entities;
      }

      const result = await BackgroundLeague.simulateBackgroundLeagues(s, week, protagonistLeagueId, simEntities);
      if (!result) return;

      update((st) => ({
        ...st,
        leagueSchedules: result.nextSchedules,
        leagueState:     result.nextLeagueState,
      }));

      if (result.gameLogs.length > 0 && window.projectB?.npcBulkInsertGameLogs) {
        const slotId = get(gameStore).currentSlotId ?? "default";
        await window.projectB.npcBulkInsertGameLogs(JSON.stringify({ slotId, season: s.seasonYear, week, logs: result.gameLogs }));
        await window.projectB.npcTrimGameLogs(JSON.stringify({ slotId, keep: 40 }));
      }
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

    setAblConferences(east: string[], west: string[]) {
      update((s) => Postseason.setAblConferences(s, east, west));
    },

    setNpcInjury(playerId: string, entry: NpcInjuryEntry) {
      update((s) => NpcInjury.setNpcInjury(s, playerId, entry));
    },

    clearNpcInjury(playerId: string) {
      update((s) => NpcInjury.clearNpcInjury(s, playerId));
    },

    tickNpcInjuries() {
      update(NpcInjury.tickNpcInjuries);
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
