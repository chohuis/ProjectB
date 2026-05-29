import { derived, get, writable } from "svelte/store";
import { gameStore, _registerSeasonGetter } from "./game";
import { masterStore } from "./master";
import type {
  LeagueSeasonState,
  MatchResult,
  PendingAction,
  PlayerCondition,
  PlayerGameLine,
  PostseasonSeries,
  SaveSeason,
  ScheduleEntry,
  Standing,
} from "../types/season";
import type { BatterSeasonStats, NpcInjuryEntry, PlayerSeasonStats, PitcherSeasonStats } from "../types/save";
import type { EntityRow } from "../stores/master";
import { calcAvg, calcEra, calcOps, calcWhip, makeEmptySeason, SAVE_SEASON_VERSION } from "../types/season";
import {
  ALL_TEAMS_BY_LEAGUE,
  DEFAULT_LEAGUE_CONFIGS,
  generateAllLeagueSchedules,
  makeStandings,
  shuffleHsGroups,
} from "../utils/leagueScheduler";
import { generateSchedule } from "../utils/scheduleGen";
import { simulateGame } from "../utils/gameSimulator";
import type { SimWorkerRequest, SimWorkerResponse, SimWorkerResultItem } from "../workers/simWorker";

// ── 피로 주간 회복량 ──────────────────────────────────────────
const WEEKLY_FATIGUE_RECOVERY = 28; // 주당 회복 (3~4일 휴식 기준)

// ── leagueState 마이그레이션 헬퍼 ────────────────────────────
function migrateLeagueState(ls: Partial<LeagueSeasonState>): LeagueSeasonState {
  return {
    standings:         ls.standings         ?? [],
    stats:             ls.stats             ?? {},
    playerConditions:  ls.playerConditions  ?? {},
    teamRotationIndex: ls.teamRotationIndex ?? {},
  };
}

// ── Web Worker 브리지 (싱글톤) ────────────────────────────────
let _simWorker: Worker | null = null;
let _reqId = 0;
type PendingEntry = {
  resolve: (r: SimWorkerResultItem[]) => void;
  games: SimWorkerRequest["games"];
  entities: EntityRow[];
};
const _pending = new Map<number, PendingEntry>();

async function flushPendingWithSync() {
  const entries = [..._pending.entries()];
  _pending.clear();
  for (const [, { resolve, games, entities }] of entries) {
    const results = await Promise.all(games.map(async (g) => {
      const sim = await simulateGame(g.homeTeamId, g.awayTeamId, entities, {
        conditions: g.conditions,
        homeRotIdx: g.homeRotIdx ?? 0,
        awayRotIdx: g.awayRotIdx ?? 0,
        week:       g.week ?? 0,
      });
      return {
        id:                g.id,
        result:            sim.result,
        nextHomeRotIdx:    sim.nextHomeRotIdx,
        nextAwayRotIdx:    sim.nextAwayRotIdx,
        pitcherConditions: sim.pitcherConditions,
      };
    }));
    resolve(results);
  }
}

function getSimWorker(): Worker | null {
  return null; // Workers can't use window.projectB IPC
}

function runInWorker(
  games: SimWorkerRequest["games"],
  entities: EntityRow[],
  npcInjuries?: Record<string, import("../types/save").NpcInjuryEntry>,
): Promise<SimWorkerResultItem[]> {
  const worker = getSimWorker();
  if (!worker) {
    return Promise.all(games.map(async (g) => {
      const sim = await simulateGame(g.homeTeamId, g.awayTeamId, entities, {
        conditions: g.conditions,
        homeRotIdx: g.homeRotIdx ?? 0,
        awayRotIdx: g.awayRotIdx ?? 0,
        week:       g.week ?? 0,
        npcInjuries,
      });
      return {
        id:                g.id,
        result:            sim.result,
        nextHomeRotIdx:    sim.nextHomeRotIdx,
        nextAwayRotIdx:    sim.nextAwayRotIdx,
        pitcherConditions: sim.pitcherConditions,
      };
    }));
  }
  return new Promise((resolve) => {
    const reqId = _reqId++;
    _pending.set(reqId, { resolve, games, entities });
    worker.postMessage({ reqId, games, entities } satisfies SimWorkerRequest);
  });
}

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
          const safeN = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
          const sanitizedStats: Record<string, PlayerSeasonStats> = {};
          for (const [pid, st] of Object.entries(saved.stats ?? {})) {
            if ((st as PitcherSeasonStats).type === "pitcher") {
              const s = st as PitcherSeasonStats;
              const ip = safeN(s.ip);
              sanitizedStats[pid] = {
                ...s,
                g: safeN(s.g), gs: safeN(s.gs), w: safeN(s.w), l: safeN(s.l),
                sv: safeN(s.sv), hd: safeN(s.hd), ip,
                er: safeN(s.er), h: safeN(s.h), k: safeN(s.k), bb: safeN(s.bb),
                era: calcEra(safeN(s.er), ip), whip: calcWhip(safeN(s.bb), safeN(s.h), ip),
              };
            } else {
              sanitizedStats[pid] = st as PlayerSeasonStats;
            }
          }
          // L1 필드 마이그레이션 (구버전 세이브 호환)
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
            // gameDate 없는 구버전 스케줄 엔트리 보정
            schedule: (saved.schedule ?? []).map((e) =>
              e.gameDate ? e : { ...e, gameDate: `${saved.seasonYear ?? 2026}-03-01` }
            ),
          });
        }
      } catch (e) {
        console.warn("[seasonStore] load failed, using defaults", e);
      }
    },

    // 현재 상태를 SaveSeason 객체로 반환 (부수효과 없음)
    toSaveSeason(): SaveSeason {
      const s = get({ subscribe });
      return { ...s, savedAt: new Date().toISOString() };
    },

    // 슬롯에서 복원
    hydrateFromSlot(season: SaveSeason) {
      const safeN = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
      const sanitizedStats: Record<string, import("../types/save").PlayerSeasonStats> = {};
      for (const [pid, st] of Object.entries(season.stats ?? {})) {
        if ((st as import("../types/save").PitcherSeasonStats).type === "pitcher") {
          const s = st as import("../types/save").PitcherSeasonStats;
          const ip = safeN(s.ip);
          sanitizedStats[pid] = { ...s, g: safeN(s.g), gs: safeN(s.gs), w: safeN(s.w), l: safeN(s.l), sv: safeN(s.sv), hd: safeN(s.hd), ip, er: safeN(s.er), h: safeN(s.h), k: safeN(s.k), bb: safeN(s.bb), era: calcEra(safeN(s.er), ip), whip: calcWhip(safeN(s.bb), safeN(s.h), ip) };
        } else { sanitizedStats[pid] = st as import("../types/save").PlayerSeasonStats; }
      }
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
        schedule: (season.schedule ?? []).map((e) => e.gameDate ? e : { ...e, gameDate: `${season.seasonYear ?? 2026}-03-01` }),
      });
    },

    // 저장: 슬롯 활성 시 game.ts의 save()가 처리 → no-op. 아니면 레거시 seasonSave
    async save() {
      if (get(gameStore).currentSlotId) return; // gameStore.save()가 통합 저장
      const s = get({ subscribe });
      const data: SaveSeason = { ...s, savedAt: new Date().toISOString() };
      try {
        await window.projectB?.seasonSave?.(data);
      } catch (e) {
        console.warn("[seasonStore] save failed", e);
      }
    },

    // 새 시즌 초기화
    initSeason(leagueId: string, seasonYear: number, totalWeeks: number, teamIds: string[]) {
      set(makeEmptySeason(leagueId, seasonYear, totalWeeks, teamIds));
    },

    // 시즌 종료 후 다음 시즌으로 전환 (같은 팀, 연도+1, 주차 리셋)
    startNewSeason() {
      update((s) => {
        const teamIds = s.standings.map((st) => st.teamId);
        return makeEmptySeason(s.leagueId, s.seasonYear + 1, s.totalWeeks, teamIds);
      });
    },

    // 시즌 일정 설정 (일정 생성기가 호출)
    setSchedule(schedule: ScheduleEntry[]) {
      update((s) => ({ ...s, schedule }));
    },

    // 현재 주차 증가
    advanceWeek() {
      update((s) => ({ ...s, currentWeek: s.currentWeek + 1 }));
    },

    // 현재 날짜 갱신 ("2026-04-15" 형식)
    setCurrentDate(date: string) {
      update((s) => ({ ...s, currentDate: date }));
    },

    // 경기 결과 반영: 순위 업데이트 + 스탯 누적
    applyMatchResult(scheduleId: string, result: MatchResult, leagueId?: string) {
      update((s) => {
        const entry = s.schedule.find((e) => e.id === scheduleId);
        const homeTeamId = entry?.homeTeamId ?? result.winnerId;
        const schedule = s.schedule.map((e) =>
          e.id === scheduleId ? { ...e, result } : e
        );
        const standings = updateStandings(s.standings, result, homeTeamId);
        const stats     = accumulateStats(s.stats, result.playerLines);

        if (!leagueId) return { ...s, schedule, standings, stats };

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            standings: updateStandings(cur.standings, result, homeTeamId),
            stats:     accumulateStats(cur.stats, result.playerLines),
          },
        };
        return { ...s, schedule, standings, stats, leagueState };
      });
    },

    // 주인공 조 NPC 경기 결과 반영 — applyMatchResult + 투구 로테이션/컨디션 갱신
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
        const standings = updateStandings(s.standings, result, htId);
        const stats     = accumulateStats(s.stats, result.playerLines);

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        const leagueState = {
          ...s.leagueState,
          [leagueId]: {
            ...cur,
            standings: updateStandings(cur.standings, result, htId),
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

    // 정지 조건 추가
    pushPendingAction(action: PendingAction) {
      update((s) => ({ ...s, pendingActions: [...s.pendingActions, action] }));
    },

    // 정지 조건 제거 (처리 완료)
    resolvePendingAction(type: PendingAction["type"], id?: string) {
      update((s) => ({
        ...s,
        pendingActions: s.pendingActions.filter((a) => {
          if (a.type !== type) return true;
          if (a.type === "game"         && type === "game")         return a.scheduleId !== id;
          if (a.type === "message"      && type === "message")      return a.messageId  !== id;
          if (a.type === "event"        && type === "event")        return a.eventId    !== id;
          if (a.type === "careerChoiceHub" && type === "careerChoiceHub") return false;
          if (a.type === "careerChoiceHub" && type === "careerChoice") return false;
          if (a.type === "careerChoice"    && type === "careerChoice")    return false;
          if (a.type === "careerChoice"    && type === "careerChoiceHub") return false;
          if (a.type === "messengerScript" && type === "messengerScript") return id !== undefined && a.arcId !== id;
          if (a.type === "draft"           && type === "draft")           return false;
          if (a.type === "salaryNegotiation" && type === "salaryNegotiation") return false;
          if (a.type === "faMarket"        && type === "faMarket")        return false;
          if (a.type === "militaryEnlist"  && type === "militaryEnlist")  return false;
          if (a.type === "optionClause"    && type === "optionClause")    return false;
          if (a.type === "trade"           && type === "trade")           return false;
          if (a.type === "hsGroupDraw"     && type === "hsGroupDraw")     return false;
          if (a.type === "injuryTreatment" && type === "injuryTreatment") return false;
          return true;
        }),
      }));
    },

    // 이번 주 발생한 이벤트 기록 (eventId → week)
    recordTriggeredEvents(triggers: Record<string, number>) {
      if (Object.keys(triggers).length === 0) return;
      update((s) => ({
        ...s,
        triggeredEvents: { ...s.triggeredEvents, ...triggers },
      }));
    },

    // 시즌 초기화 시 이벤트 기록 초기화
    clearTriggeredEvents() {
      update((s) => ({ ...s, triggeredEvents: {} }));
    },

    // ── L1: 멀티리그 초기화 ────────────────────────────────────
    // A/B 두 그룹 스케줄을 모두 s.schedule에 통합. LEAGUE_HIGHSCHOOL_NPC 없음.
    async initAllLeagues(seasonYear: number, protagonistTeamId: string, hsGroupA: string[], hsGroupB: string[]) {
      const protagonistGroup = hsGroupA.includes(protagonistTeamId) ? hsGroupA : hsGroupB;
      const npcGroup         = hsGroupA.includes(protagonistTeamId) ? hsGroupB : hsGroupA;

      const [rawProtagSchedule, rawNpcSchedule, otherSchedules] = await Promise.all([
        generateSchedule(protagonistGroup, protagonistTeamId, 52),
        generateSchedule(npcGroup, "", 52),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
      ]);
      const allHsSchedule = [
        ...rawProtagSchedule.map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL" })),
        ...rawNpcSchedule.map((e)   => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL", id: `OPP_${e.id}` })),
      ].sort((a, b) => a.gameDate.localeCompare(b.gameDate));

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

    // HS 연간 그룹 재편 (고교 2·3학년 시즌 시작 시 호출)
    // A/B 두 그룹 스케줄을 s.schedule에 직접 설정. 반환값 없음.
    async reinitHighschoolSeason(protagonistTeamId: string, allHsTeams: string[]): Promise<void> {
      const { groupA, groupB } = await shuffleHsGroups(allHsTeams);
      const protagonistGroup = groupA.includes(protagonistTeamId) ? groupA : groupB;
      const npcGroup         = groupA.includes(protagonistTeamId) ? groupB : groupA;

      const [rawProtagSchedule, rawNpcSchedule, otherSchedules] = await Promise.all([
        generateSchedule(protagonistGroup, protagonistTeamId, 52),
        generateSchedule(npcGroup, "", 52),
        generateAllLeagueSchedules(DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })), protagonistTeamId),
      ]);
      const allHsSchedule = [
        ...rawProtagSchedule.map((e) => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL" })),
        ...rawNpcSchedule.map((e)   => ({ ...e, leagueId: "LEAGUE_HIGHSCHOOL", id: `OPP_${e.id}` })),
      ].sort((a, b) => a.gameDate.localeCompare(b.gameDate));

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

    // L1: 해당 주차 모든 NPC 리그 경기 시뮬레이션 (protagonist 리그 제외) — 동기 버전
    simulateBackgroundLeagues(week: number, protagonistLeagueId: string, entities?: EntityRow[]) {
      update((s) => {
        const nextState = { ...s.leagueState };
        const nextSchedules = { ...s.leagueSchedules };

        for (const [lid, schedule] of Object.entries(nextSchedules)) {
          if (lid === protagonistLeagueId) continue;
          const weekGames = schedule.filter((e) => e.week === week && !e.result);
          if (weekGames.length === 0) continue;

          let lState = migrateLeagueState(nextState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []) });
          const updatedSchedule = [...schedule];

          for (const game of weekGames) {
            const homeRotIdx = lState.teamRotationIndex[game.homeTeamId] ?? 0;
            const awayRotIdx = lState.teamRotationIndex[game.awayTeamId] ?? 0;

            const simResult = { result: simpleNpcResult(game.homeTeamId, game.awayTeamId), nextHomeRotIdx: homeRotIdx + 1, nextAwayRotIdx: awayRotIdx + 1, pitcherConditions: {} };

            const idx = updatedSchedule.findIndex((e) => e.id === game.id);
            if (idx >= 0) updatedSchedule[idx] = { ...game, result: simResult.result };

            lState = {
              ...lState,
              standings: updateStandings(lState.standings, simResult.result, game.homeTeamId),
              stats:     accumulateStats(lState.stats, simResult.result.playerLines),
              playerConditions: { ...lState.playerConditions, ...simResult.pitcherConditions },
              teamRotationIndex: {
                ...lState.teamRotationIndex,
                [game.homeTeamId]: simResult.nextHomeRotIdx,
                [game.awayTeamId]: simResult.nextAwayRotIdx,
              },
            };
          }

          nextSchedules[lid] = updatedSchedule;
          nextState[lid] = lState;
        }

        return { ...s, leagueSchedules: nextSchedules, leagueState: nextState };
      });
    },

    // 주차 시작 시 투수 피로 회복 처리 (recovery 능력치 반영)
    applyWeeklyConditionRecovery(entities: EntityRow[]) {
      const entityMap = new Map(entities.map((e) => [e.id, e]));
      update((s) => {
        const nextState = { ...s.leagueState };
        for (const [lid, ls] of Object.entries(nextState)) {
          const nextConditions = { ...ls.playerConditions };
          for (const [pid, cond] of Object.entries(nextConditions)) {
            const rec = (entityMap.get(pid)?.details?.player as import("./master").EntityPlayerDetails | undefined)?.pitching?.recovery ?? 50;
            const recoveryMod = 0.6 + rec * 0.008; // recovery 50 → 1.0, 80 → 1.24, 20 → 0.76
            const gain = Math.round(WEEKLY_FATIGUE_RECOVERY * recoveryMod);
            nextConditions[pid] = {
              ...cond,
              fatigue: Math.min(100, cond.fatigue + gain),
            };
          }
          nextState[lid] = { ...ls, playerConditions: nextConditions };
        }
        return { ...s, leagueState: nextState };
      });
    },

    // L5: 배경 리그 시뮬레이션 — Web Worker 비동기 버전
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

      // 이번 주 시뮬레이션할 경기 수집 (리그별 컨디션·로테이션 인덱스 포함)
      const batch: SimWorkerRequest["games"] = [];
      for (const [lid, schedule] of Object.entries(s.leagueSchedules)) {
        if (lid === protagonistLeagueId) continue;
        const lState = migrateLeagueState(s.leagueState[lid] ?? {});
        for (const e of schedule) {
          if (e.week <= week && !e.result) {
            batch.push({
              leagueId:   lid,
              id:         e.id,
              homeTeamId: e.homeTeamId,
              awayTeamId: e.awayTeamId,
              homeRotIdx:  lState.teamRotationIndex[e.homeTeamId] ?? 0,
              awayRotIdx:  lState.teamRotationIndex[e.awayTeamId] ?? 0,
              conditions:  lState.playerConditions,
              week,
            });
          }
        }
      }
      if (batch.length === 0) return;

      const simmed = await runInWorker(batch, simEntities, s.npcInjuries);
      const simMap = new Map(simmed.map((r) => [r.id, r]));

      // 경기 기록 수집 (npc_game_log 적재용)
      const gameLogs: { npcId: string; role: string; statJson: string }[] = [];
      for (const sim of simmed) {
        for (const line of sim.result.playerLines) {
          gameLogs.push({ npcId: line.playerId, role: line.role, statJson: JSON.stringify(line) });
        }
      }

      update((st) => {
        const nextSchedules = { ...st.leagueSchedules };
        const nextState = { ...st.leagueState };

        for (const item of batch) {
          const sim = simMap.get(item.id);
          if (!sim) continue;
          const lid = item.leagueId;

          nextSchedules[lid] = (nextSchedules[lid] ?? []).map((e) =>
            e.id === item.id ? { ...e, result: sim.result } : e,
          );

          const cur = migrateLeagueState(nextState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []) });
          nextState[lid] = {
            standings: updateStandings(cur.standings, sim.result, item.homeTeamId),
            stats:     accumulateStats(cur.stats, sim.result.playerLines),
            playerConditions: { ...cur.playerConditions, ...sim.pitcherConditions },
            teamRotationIndex: {
              ...cur.teamRotationIndex,
              [item.homeTeamId]: sim.nextHomeRotIdx,
              [item.awayTeamId]: sim.nextAwayRotIdx,
            },
          };
        }

        return { ...st, leagueSchedules: nextSchedules, leagueState: nextState };
      });

      // 경기 기록 DB 적재
      if (gameLogs.length > 0 && window.projectB?.npcBulkInsertGameLogs) {
        const slotId = get(gameStore).currentSlotId ?? "default";
        await window.projectB.npcBulkInsertGameLogs(JSON.stringify({ slotId, season: s.seasonYear, week, logs: gameLogs }));
        await window.projectB.npcTrimGameLogs(JSON.stringify({ slotId, keep: 5 }));
      }
    },

    // L1: 주인공 리그 경기 결과를 leagueState에도 동기화
    syncProtagonistLeagueResult(leagueId: string, result: MatchResult, homeTeamId: string) {
      update((s) => {
        const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
        return {
          ...s,
          leagueState: {
            ...s.leagueState,
            [leagueId]: {
              ...cur,
              standings: updateStandings(cur.standings, result, homeTeamId),
              stats:     accumulateStats(cur.stats, result.playerLines),
            },
          },
        };
      });
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
      update((s) => {
        const nextSchedules = { ...s.leagueSchedules };
        const curSched = nextSchedules[leagueId] ?? [];
        nextSchedules[leagueId] = curSched.map((e) => (e.id === scheduleId ? { ...e, result } : e));

        const cur = migrateLeagueState(s.leagueState[leagueId] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[leagueId] ?? []) });
        const nextLeagueState: LeagueSeasonState = {
          standings: updateStandings(cur.standings, result, homeTeamId),
          stats: accumulateStats(cur.stats, result.playerLines),
          playerConditions: { ...cur.playerConditions, ...pitcherConditions },
          teamRotationIndex: {
            ...cur.teamRotationIndex,
            [homeTeamId]: nextHomeRotIdx,
            [awayTeamId]: nextAwayRotIdx,
          },
        };

        return {
          ...s,
          leagueSchedules: nextSchedules,
          leagueState: { ...s.leagueState, [leagueId]: nextLeagueState },
        };
      });
    },

    // 포스트시즌 경기 동적 주입
    injectPostseasonEntries(entries: ScheduleEntry[]) {
      if (entries.length === 0) return;
      update((s) => ({ ...s, schedule: [...s.schedule, ...entries] }));
    },

    // 포스트시즌 브라켓 초기화 (또는 전체 교체)
    initPostseasonBracket(leagueId: string, series: PostseasonSeries[]) {
      update((s) => ({
        ...s,
        postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: series },
      }));
    },

    // 포스트시즌 브라켓 부분 업데이트 (시리즈 결과 반영)
    updatePostseasonBracket(leagueId: string, updatedSeries: PostseasonSeries[]) {
      update((s) => ({
        ...s,
        postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: updatedSeries },
      }));
    },

    // ABL 컨퍼런스 배정 저장
    setAblConferences(east: string[], west: string[]) {
      update((s) => ({ ...s, ablEastTeams: east, ablWestTeams: west }));
    },

    // NPC 부상 설정 / 갱신
    setNpcInjury(playerId: string, entry: NpcInjuryEntry) {
      update((s) => ({
        ...s,
        npcInjuries: { ...s.npcInjuries, [playerId]: entry },
      }));
    },

    // NPC 부상 제거 (회복 완료)
    clearNpcInjury(playerId: string) {
      update((s) => {
        const next = { ...s.npcInjuries };
        delete next[playerId];
        return { ...s, npcInjuries: next };
      });
    },

    // 주간 틱: 모든 NPC 부상 weeksLeft 감소, 0 이하는 제거
    tickNpcInjuries() {
      update((s) => {
        const next: Record<string, NpcInjuryEntry> = {};
        for (const [pid, entry] of Object.entries(s.npcInjuries)) {
          const weeksLeft = entry.weeksLeft - 1;
          if (weeksLeft > 0) next[pid] = { ...entry, weeksLeft };
        }
        return { ...s, npcInjuries: next };
      });
    },

    // L1: 특정 리그 순위표 조회 헬퍼
    getLeagueStandings(leagueId: string): Standing[] {
      return get({ subscribe }).leagueState[leagueId]?.standings ?? [];
    },

    // 시즌 종료 시 전 리그 누적 스탯 → npc_season_stats DB flush
    async flushAllLeagueStatsToDb(seasonYear: number): Promise<void> {
      if (!window.projectB?.npcFlushSeasonStats) return;
      const s = get({ subscribe });
      const slotId = get(gameStore).currentSlotId ?? "default";
      for (const [leagueId, ls] of Object.entries(s.leagueState)) {
        if (!ls.stats || Object.keys(ls.stats).length === 0) continue;
        const statsByPlayer: Record<string, object> = {};
        for (const [npcId, stat] of Object.entries(ls.stats)) {
          if (stat.type === "pitcher") {
            statsByPlayer[npcId] = {
              role: "pitcher", games: stat.g, wins: stat.w, losses: stat.l,
              saves: stat.sv, holds: stat.hd, ip: stat.ip, er: stat.er,
              hitsAllowed: stat.h, strikeouts: stat.k, walks: stat.bb, pitchCount: 0,
              atBats: 0, hits: 0, homeRuns: 0, rbi: 0, walksBat: 0, strikeoutsBat: 0, stolenBases: 0,
            };
          } else {
            statsByPlayer[npcId] = {
              role: "batter", games: stat.g, wins: 0, losses: 0, saves: 0, holds: 0,
              ip: 0, er: 0, hitsAllowed: 0, strikeouts: 0, walks: 0, pitchCount: 0,
              atBats: stat.ab, hits: stat.h, homeRuns: stat.hr, rbi: stat.rbi,
              walksBat: stat.bb, strikeoutsBat: stat.k, stolenBases: stat.sb,
            };
          }
        }
        await window.projectB.npcFlushSeasonStats(
          JSON.stringify({ slotId, season: seasonYear, leagueId, statsByPlayer })
        );
      }
    },
  };
}

// ── 간단한 NPC 경기 결과 생성 (Phase L3에서 교체 예정) ──────────
function simpleNpcResult(homeTeamId: string, awayTeamId: string): MatchResult {
  const score = () => Math.max(0, Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 4));
  let h = score();
  let a = score();
  if (h === a) { h > 0 ? h-- : a++; }
  return {
    homeScore: h, awayScore: a,
    winnerId: h > a ? homeTeamId : awayTeamId,
    loserId:  h > a ? awayTeamId : homeTeamId,
    playerLines: [], events: [],
  };
}

// ── 순위표 업데이트 ────────────────────────────────────────────
function updateStandings(standings: Standing[], result: MatchResult, homeTeamId: string): Standing[] {
  return standings.map((s) => {
    if (s.teamId !== result.winnerId && s.teamId !== result.loserId) return s;

    const isWinner = s.teamId === result.winnerId;
    const isDraw   = result.loserId === null;

    const wins   = s.wins   + (isWinner && !isDraw ? 1 : 0);
    const losses = s.losses + (!isWinner && !isDraw ? 1 : 0);
    const draws  = s.draws  + (isDraw ? 1 : 0);
    const total  = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;

    const isHome = s.teamId === homeTeamId;
    const runsFor     = s.runsFor     + (isHome ? result.homeScore : result.awayScore);
    const runsAgainst = s.runsAgainst + (isHome ? result.awayScore : result.homeScore);

    const streakChar = isDraw ? "D" : isWinner ? "W" : "L";
    const streak     = updateStreak(s.streak, streakChar);
    const last10     = updateLast10(s.last10, streakChar);

    return { ...s, wins, losses, draws, winPct, runsFor, runsAgainst, streak, last10 };
  });
}

function updateStreak(current: string, result: "W" | "L" | "D"): string {
  if (!current) return `${result}1`;
  const char = current[0];
  const n    = parseInt(current.slice(1), 10);
  return char === result ? `${result}${n + 1}` : `${result}1`;
}

function updateLast10(current: string, result: "W" | "L" | "D"): string {
  // 구 압축 포맷 "W3L2" → 확장 "WWWLL" 변환
  const expanded = current.replace(/([WLD])(\d+)/g, (_, c: string, n: string) => c.repeat(parseInt(n)));
  const chars = [...expanded.replace(/[^WLD]/g, ""), result];
  return chars.slice(-10).join("");
}

// ── 스탯 누적 ─────────────────────────────────────────────────
function accumulateStats(
  stats: Record<string, PlayerSeasonStats>,
  lines: PlayerGameLine[],
): Record<string, PlayerSeasonStats> {
  const next = { ...stats };
  for (const line of lines) {
    if (line.role === "pitcher") {
      const prev = (next[line.playerId] as PitcherSeasonStats | undefined) ?? {
        type: "pitcher", g:0, gs:0, w:0, l:0, sv:0, hd:0, ip:0, er:0, h:0, k:0, bb:0, era:0, whip:0,
      };
      const safeNum = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
      const ip  = safeNum(prev.ip)  + safeNum(line.ip);
      const er  = safeNum(prev.er)  + safeNum(line.er);
      const h   = safeNum(prev.h)   + safeNum(line.h);
      const k   = safeNum(prev.k)   + safeNum(line.k);
      const bb  = safeNum(prev.bb)  + safeNum(line.bb);
      const w   = prev.w   + (line.decision === "W"  ? 1 : 0);
      const l   = prev.l   + (line.decision === "L"  ? 1 : 0);
      const sv  = prev.sv  + (line.decision === "SV" ? 1 : 0);
      const hd  = prev.hd  + (line.decision === "HD" ? 1 : 0);
      next[line.playerId] = {
        type:"pitcher", g: prev.g+1, gs: prev.gs, w, l, sv, hd, ip, er, h, k, bb,
        era: calcEra(er, ip), whip: calcWhip(bb, h, ip),
      };
    } else {
      const prev = (next[line.playerId] as BatterSeasonStats | undefined) ?? {
        type:"batter", g:0, pa:0, ab:0, h:0, hr:0, rbi:0, sb:0, bb:0, k:0, avg:0, obp:0, slg:0, ops:0,
      };
      const ab  = prev.ab  + (line.ab  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const hr  = prev.hr  + (line.hr  ?? 0);
      const rbi = prev.rbi + (line.rbi ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const sb  = prev.sb  + (line.sb  ?? 0);
      const pa  = prev.pa  + ab + bb;
      const avg = calcAvg(h, ab);
      const obp = pa > 0 ? Math.round(((h + bb) / pa) * 1000) / 1000 : 0;
      const slg = ab > 0 ? Math.round(((h + hr * 3) / ab) * 1000) / 1000 : 0;
      next[line.playerId] = {
        type:"batter", g: prev.g+1, pa, ab, h, hr, rbi, sb, bb, k,
        avg, obp, slg, ops: calcOps(obp, slg),
      };
    }
  }
  return next;
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
