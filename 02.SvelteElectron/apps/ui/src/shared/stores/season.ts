import { derived, get, writable } from "svelte/store";
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
import type { BatterSeasonStats, PlayerSeasonStats, PitcherSeasonStats } from "../types/save";
import type { EntityRow } from "../stores/master";
import { calcAvg, calcEra, calcOps, calcWhip, makeEmptySeason, SAVE_SEASON_VERSION } from "../types/season";
import {
  ALL_TEAMS_BY_LEAGUE,
  DEFAULT_LEAGUE_CONFIGS,
  generateAllLeagueSchedules,
  generateLeagueSchedule,
  makeStandings,
  shuffleHsGroups,
} from "../utils/leagueScheduler";
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

function flushPendingWithSync() {
  for (const [, { resolve, games, entities }] of _pending) {
    resolve(games.map((g) => {
      const sim = simulateGame(g.homeTeamId, g.awayTeamId, entities, {
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
  }
  _pending.clear();
}

function getSimWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (!_simWorker) {
    try {
      _simWorker = new Worker(
        new URL("../workers/simWorker.ts", import.meta.url),
        { type: "module" },
      );
      _simWorker.onmessage = (e: MessageEvent<SimWorkerResponse>) => {
        const { reqId, results } = e.data;
        _pending.get(reqId)?.resolve(results);
        _pending.delete(reqId);
      };
      _simWorker.onerror = (err) => {
        console.warn("[simWorker] error, fallback to sync", err);
        _simWorker = null;
        flushPendingWithSync();
      };
    } catch {
      return null;
    }
  }
  return _simWorker;
}

function runInWorker(
  games: SimWorkerRequest["games"],
  entities: EntityRow[],
): Promise<SimWorkerResultItem[]> {
  const worker = getSimWorker();
  if (!worker) {
    return Promise.resolve(
      games.map((g) => {
        const sim = simulateGame(g.homeTeamId, g.awayTeamId, entities, {
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
      }),
    );
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

    // 앱 시작 시 save_season.json에서 복원
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

    // 현재 상태를 save_season.json에 저장
    async save() {
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
    applyMatchResult(scheduleId: string, result: MatchResult) {
      update((s) => {
        const entry = s.schedule.find((e) => e.id === scheduleId);
        const schedule = s.schedule.map((e) =>
          e.id === scheduleId ? { ...e, result } : e
        );
        const standings = updateStandings(s.standings, result, entry?.homeTeamId ?? result.winnerId);
        const stats     = accumulateStats(s.stats, result.playerLines);
        return { ...s, schedule, standings, stats };
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
    // hsGroupA/hsGroupB: NewGamePage에서 미리 셔플한 조 배정 (매 시즌 전달)
    initAllLeagues(seasonYear: number, protagonistTeamId: string, hsGroupA: string[], hsGroupB: string[]) {
      // protagonist가 속한 조와 NPC 조 구분
      const protagonistGroup = hsGroupA.includes(protagonistTeamId) ? hsGroupA : hsGroupB;
      const npcGroup         = hsGroupA.includes(protagonistTeamId) ? hsGroupB : hsGroupA;

      // NPC 조 스케줄만 background sim 대상으로 등록 (protagonist 조는 seasonStore.schedule에서 관리)
      const npcHsSchedule = generateLeagueSchedule("LEAGUE_HIGHSCHOOL_NPC", npcGroup, 10, 42, 2, protagonistTeamId);

      // 나머지 리그 스케줄
      const otherSchedules = generateAllLeagueSchedules(
        DEFAULT_LEAGUE_CONFIGS.map((c) => ({ ...c })),
        protagonistTeamId,
      );

      const leagueSchedules: Record<string, ScheduleEntry[]> = {
        LEAGUE_HIGHSCHOOL_NPC: npcHsSchedule,
        ...otherSchedules,
      };

      // 리그별 초기 순위표 (HIGHSCHOOL 제외 — protagonist 조는 seasonStore.standings, NPC 조는 별도)
      const leagueState: Record<string, LeagueSeasonState> = {
        LEAGUE_HIGHSCHOOL_NPC: { standings: makeStandings(npcGroup), stats: {}, playerConditions: {}, teamRotationIndex: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
      }

      update((s) => ({
        ...s,
        seasonYear,
        leagueSchedules,
        leagueState,
        hsGroupA,
        hsGroupB,
        // protagonist 조 순위표를 standings에도 반영
        standings: makeStandings(protagonistGroup),
      }));
    },

    // HS 연간 그룹 재편 (고교 2·3학년 시즌 시작 시 호출)
    // protagonist 조 schedule[]을 반환 → 호출자가 setSchedule()에 넘겨야 함
    reinitHighschoolSeason(protagonistTeamId: string, allHsTeams: string[]): ScheduleEntry[] {
      const { groupA, groupB } = shuffleHsGroups(allHsTeams);
      const protagonistGroup = groupA.includes(protagonistTeamId) ? groupA : groupB;
      const npcGroup         = groupA.includes(protagonistTeamId) ? groupB : groupA;

      const npcHsSchedule = generateLeagueSchedule("LEAGUE_HIGHSCHOOL_NPC", npcGroup, 10, 42, 2, protagonistTeamId);
      const protagonistSchedule = generateLeagueSchedule("LEAGUE_HIGHSCHOOL", protagonistGroup, 10, 42, 2, protagonistTeamId);

      update((s) => {
        const leagueState: Record<string, LeagueSeasonState> = {
          LEAGUE_HIGHSCHOOL_NPC: { standings: makeStandings(npcGroup), stats: {}, playerConditions: {}, teamRotationIndex: {} },
        };
        for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
          if (lid === "LEAGUE_HIGHSCHOOL") continue;
          leagueState[lid] = { standings: makeStandings(teams), stats: {}, playerConditions: {}, teamRotationIndex: {} };
        }
        return {
          ...s,
          standings: makeStandings(protagonistGroup),
          leagueSchedules: {
            LEAGUE_HIGHSCHOOL_NPC: npcHsSchedule,
            ...DEFAULT_LEAGUE_CONFIGS.reduce<Record<string, ScheduleEntry[]>>((acc, cfg) => {
              acc[cfg.leagueId] = generateLeagueSchedule(cfg.leagueId, cfg.teams, cfg.startWeek, cfg.endWeek, cfg.cycles, protagonistTeamId);
              return acc;
            }, {}),
          },
          leagueState,
          hsGroupA: groupA,
          hsGroupB: groupB,
        };
      });

      return protagonistSchedule;
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

            const simResult = entities && entities.length > 0
              ? simulateGame(game.homeTeamId, game.awayTeamId, entities, { conditions: lState.playerConditions, homeRotIdx, awayRotIdx, week })
              : { result: simpleNpcResult(game.homeTeamId, game.awayTeamId), nextHomeRotIdx: homeRotIdx + 1, nextAwayRotIdx: awayRotIdx + 1, pitcherConditions: {} };

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

      const simmed = await runInWorker(batch, entities);
      const simMap = new Map(simmed.map((r) => [r.id, r]));

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

    // L1: 특정 리그 순위표 조회 헬퍼
    getLeagueStandings(leagueId: string): Standing[] {
      return get({ subscribe }).leagueState[leagueId]?.standings ?? [];
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
