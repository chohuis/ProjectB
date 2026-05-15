import { derived, get, writable } from "svelte/store";
import type {
  LeagueSeasonState,
  MatchResult,
  PendingAction,
  PlayerGameLine,
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
import type { SimWorkerRequest, SimWorkerResponse } from "../workers/simWorker";

// ── Web Worker 브리지 (싱글톤) ────────────────────────────────
let _simWorker: Worker | null = null;
let _reqId = 0;
const _pending = new Map<number, (r: { id: string; result: MatchResult }[]) => void>();

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
        _pending.get(reqId)?.(results);
        _pending.delete(reqId);
      };
      _simWorker.onerror = (err) => {
        console.warn("[simWorker] error, will fallback to sync", err);
        _simWorker = null;
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
): Promise<{ id: string; result: MatchResult }[]> {
  const worker = getSimWorker();
  if (!worker) {
    // 동기 폴백
    return Promise.resolve(
      games.map((g) => ({ id: g.id, result: simulateGame(g.homeTeamId, g.awayTeamId, entities) })),
    );
  }
  return new Promise((resolve) => {
    const reqId = _reqId++;
    _pending.set(reqId, resolve);
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
          // L1 필드 마이그레이션 (구버전 세이브 호환)
          set({
            ...saved,
            leagueSchedules: saved.leagueSchedules ?? {},
            leagueState:     saved.leagueState     ?? {},
            hsGroupA:        saved.hsGroupA        ?? [],
            hsGroupB:        saved.hsGroupB        ?? [],
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

    // 경기 결과 반영: 순위 업데이트 + 스탯 누적
    applyMatchResult(scheduleId: string, result: MatchResult) {
      update((s) => {
        const schedule = s.schedule.map((entry) =>
          entry.id === scheduleId ? { ...entry, result } : entry
        );
        const standings = updateStandings(s.standings, result);
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
        LEAGUE_HIGHSCHOOL_NPC: { standings: makeStandings(npcGroup), stats: {} },
      };
      for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
        if (lid === "LEAGUE_HIGHSCHOOL") continue;
        leagueState[lid] = { standings: makeStandings(teams), stats: {} };
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
          LEAGUE_HIGHSCHOOL_NPC: { standings: makeStandings(npcGroup), stats: {} },
        };
        for (const [lid, teams] of Object.entries(ALL_TEAMS_BY_LEAGUE)) {
          if (lid === "LEAGUE_HIGHSCHOOL") continue;
          leagueState[lid] = { standings: makeStandings(teams), stats: {} };
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

    // L1: 해당 주차 모든 NPC 리그 경기 시뮬레이션 (protagonist 리그 제외)
    simulateBackgroundLeagues(week: number, protagonistLeagueId: string, entities?: EntityRow[]) {
      update((s) => {
        const nextState = { ...s.leagueState };
        const nextSchedules = { ...s.leagueSchedules };

        for (const [lid, schedule] of Object.entries(nextSchedules)) {
          if (lid === protagonistLeagueId) continue;
          const weekGames = schedule.filter((e) => e.week === week && !e.result);
          if (weekGames.length === 0) continue;

          let lState = nextState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []), stats: {} };
          const updatedSchedule = [...schedule];

          for (const game of weekGames) {
            const result = entities && entities.length > 0
              ? simulateGame(game.homeTeamId, game.awayTeamId, entities)
              : simpleNpcResult(game.homeTeamId, game.awayTeamId);
            const idx = updatedSchedule.findIndex((e) => e.id === game.id);
            if (idx >= 0) updatedSchedule[idx] = { ...game, result };
            lState = {
              ...lState,
              standings: updateStandings(lState.standings, result),
              stats:     accumulateStats(lState.stats, result.playerLines),
            };
          }

          nextSchedules[lid] = updatedSchedule;
          nextState[lid] = lState;
        }

        return { ...s, leagueSchedules: nextSchedules, leagueState: nextState };
      });
    },

    // L5: 배경 리그 시뮬레이션 — Web Worker 비동기 버전
    async simulateBackgroundLeaguesAsync(
      week: number,
      protagonistLeagueId: string,
      entities: EntityRow[],
    ): Promise<void> {
      const s = get({ subscribe });

      // 이번 주 시뮬레이션할 경기 수집
      const batch: { leagueId: string; id: string; homeTeamId: string; awayTeamId: string }[] = [];
      for (const [lid, schedule] of Object.entries(s.leagueSchedules)) {
        if (lid === protagonistLeagueId) continue;
        for (const e of schedule) {
          if (e.week === week && !e.result) {
            batch.push({ leagueId: lid, id: e.id, homeTeamId: e.homeTeamId, awayTeamId: e.awayTeamId });
          }
        }
      }
      if (batch.length === 0) return;

      // Worker(또는 동기 폴백)로 전체 경기 병렬 처리
      const simmed = await runInWorker(batch, entities);
      const resultMap = new Map(simmed.map((r) => [r.id, r.result]));

      // 결과를 스토어에 동기 반영
      update((st) => {
        const nextSchedules = { ...st.leagueSchedules };
        const nextState = { ...st.leagueState };

        for (const item of batch) {
          const res = resultMap.get(item.id);
          if (!res) continue;
          const lid = item.leagueId;

          // 스케줄에 결과 기록
          nextSchedules[lid] = (nextSchedules[lid] ?? []).map((e) =>
            e.id === item.id ? { ...e, result: res } : e,
          );

          // 순위 + 스탯 업데이트
          const cur = nextState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []), stats: {} };
          nextState[lid] = {
            standings: updateStandings(cur.standings, res),
            stats: accumulateStats(cur.stats, res.playerLines),
          };
        }

        return { ...st, leagueSchedules: nextSchedules, leagueState: nextState };
      });
    },

    // L1: 주인공 리그 경기 결과를 leagueState에도 동기화
    syncProtagonistLeagueResult(leagueId: string, result: MatchResult) {
      update((s) => {
        const cur = s.leagueState[leagueId] ?? { standings: [], stats: {} };
        return {
          ...s,
          leagueState: {
            ...s.leagueState,
            [leagueId]: {
              standings: updateStandings(cur.standings, result),
              stats:     accumulateStats(cur.stats, result.playerLines),
            },
          },
        };
      });
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
function updateStandings(standings: Standing[], result: MatchResult): Standing[] {
  return standings.map((s) => {
    if (s.teamId !== result.winnerId && s.teamId !== result.loserId) return s;

    const isWinner = s.teamId === result.winnerId;
    const isDraw   = result.loserId === null;

    const wins   = s.wins   + (isWinner && !isDraw ? 1 : 0);
    const losses = s.losses + (!isWinner && !isDraw ? 1 : 0);
    const draws  = s.draws  + (isDraw ? 1 : 0);
    const total  = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;

    const isHome = s.teamId === result.winnerId;
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
  const entries: Array<{ char: string; n: number }> = [];
  const re = /([WLD])(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(current)) !== null) entries.push({ char: m[1], n: parseInt(m[2]) });
  const last = entries[entries.length - 1];
  if (last && last.char === result) { last.n++; } else { entries.push({ char: result, n: 1 }); }
  const total = entries.reduce((a, e) => a + e.n, 0);
  if (total > 10) {
    let excess = total - 10;
    while (excess > 0 && entries.length > 0) {
      const first = entries[0];
      if (first.n <= excess) { excess -= first.n; entries.shift(); }
      else { first.n -= excess; excess = 0; }
    }
  }
  return entries.map((e) => `${e.char}${e.n}`).join("");
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
      const ip  = prev.ip  + (line.ip  ?? 0);
      const er  = prev.er  + (line.er  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
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
