import type { LeagueSeasonState, MatchResult, PlayerCondition, ScheduleEntry } from "../types/season";
import type { NpcInjuryEntry, CareerStage } from "../types/save";
import type { EntityRow, TeamRef } from "./master";
import type { SimWorkerRequest, SimWorkerResultItem } from "../workers/simWorker";
import type { SeasonStoreState } from "./season";
import { accumulateStats, migrateLeagueState, updateStandings } from "../utils/season-helpers";
import { makeStandings, ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForLeague } from "../utils/rosterEngine";
import { autoLog } from "./autoAdvance";
import { getLeagueRadius } from "../utils/radiusGate";

// 반경 게이트가 적용되는 리그만 — 팜리그 등 그 외 리그는 기존 풀시뮬 동작 그대로 둔다 (R5 대상)
const RADIUS_GATED_LEAGUES = new Set([
  "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL",
]);

// 팀 소속 감독의 handlePersonnel 능력치 조회
function getManagerHandlePersonnel(teamId: string, entities: EntityRow[]): number {
  const mgr = entities.find((e) => e.teamId === teamId && e.role === "manager");
  return (mgr?.details as any)?.manager?.stats?.handlePersonnel ?? 50;
}

const WEEKLY_FATIGUE_RECOVERY = 28;
const SIM_CHUNK_SIZE = 8;

export async function runSimBatch(
  games: SimWorkerRequest["games"],
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  npcLiveStats?: Record<string, import("../types/season").NpcLiveStat>,
): Promise<SimWorkerResultItem[]> {
  const results: SimWorkerResultItem[] = [];
  for (let i = 0; i < games.length; i += SIM_CHUNK_SIZE) {
    const chunk = games.slice(i, i + SIM_CHUNK_SIZE);
    const chunkResults = await Promise.all(chunk.map(async (g) => {
      const rotSize = g.leagueId ? rotationSizeForLeague(g.leagueId) : 5;
      const sim = await simulateGame(g.homeTeamId, g.awayTeamId, entities, {
        conditions:           g.conditions,
        homeRotIdx:           g.homeRotIdx ?? 0,
        awayRotIdx:           g.awayRotIdx ?? 0,
        week:                 g.week ?? 0,
        npcInjuries,
        npcLiveStats,
        rotationSize:         rotSize,
        leagueId:             g.leagueId ?? "",
        homeHandlePersonnel:  getManagerHandlePersonnel(g.homeTeamId, entities),
        awayHandlePersonnel:  getManagerHandlePersonnel(g.awayTeamId, entities),
      });

      // 엔티티 없어서 시뮬 실패(winner_id="") 시 폴백으로 랜덤 결과 생성
      let result = sim.result;
      if (!result.winnerId) {
        autoLog(`[폴백SIM] 배경리그 엔티티없음: ${g.homeTeamId} vs ${g.awayTeamId} (${g.leagueId})`);
        const api = (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;
        const fb = JSON.parse(
          await api.weekCalcNpcFallback(JSON.stringify({ homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }))
        ) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
        result = { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] };
      }

      return {
        id:                g.id,
        result,
        nextHomeRotIdx:    sim.nextHomeRotIdx,
        nextAwayRotIdx:    sim.nextAwayRotIdx,
        pitcherConditions: sim.pitcherConditions,
      };
    }));
    results.push(...chunkResults);
    if (i + SIM_CHUNK_SIZE < games.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return results;
}

export type SimBatchResult = {
  nextSchedules:   Record<string, ScheduleEntry[]>;
  nextLeagueState: Record<string, LeagueSeasonState>;
  gameLogs:        { npcId: string; role: string; statJson: string }[];
};

export async function simulateBackgroundLeagues(
  s: SeasonStoreState,
  week: number,
  protagonistLeagueId: string,
  entities: EntityRow[],
  npcLiveStats?: Record<string, import("../types/season").NpcLiveStat>,
  careerStage?: CareerStage,
): Promise<SimBatchResult | null> {
  const batch: SimWorkerRequest["games"] = [];
  if (Object.keys(s.leagueSchedules).length === 0) {
    autoLog("[배경리그] leagueSchedules 비어있음 — 배경 리그 시뮬 스킵");
  }
  for (const [lid, schedule] of Object.entries(s.leagueSchedules)) {
    if (lid === protagonistLeagueId) continue;
    if (!Array.isArray(schedule)) {
      autoLog(`[배경리그오류] leagueSchedules 오염 — 배열 아님: ${lid}`);
      continue;
    }
    // 반경 게이트: 비활성(3)은 시뮬 스킵, 드리프트(2)는 별도 driftBackgroundLeagues가 처리
    if (careerStage && RADIUS_GATED_LEAGUES.has(lid)) {
      const radius = getLeagueRadius(careerStage, lid);
      if (radius === 2 || radius === 3) continue;
    }
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
  if (batch.length === 0) return null;

  const simmed = await runSimBatch(batch, entities, s.npcInjuries, npcLiveStats);
  const simMap = new Map(simmed.map((r) => [r.id, r]));

  const gameLogs: { npcId: string; role: string; statJson: string }[] = [];
  for (const sim of simmed) {
    for (const line of sim.result.playerLines) {
      gameLogs.push({ npcId: line.playerId, role: line.role, statJson: JSON.stringify(line) });
    }
  }

  const nextSchedules   = { ...s.leagueSchedules };
  const nextLeagueState = { ...s.leagueState };

  for (const item of batch) {
    const sim = simMap.get(item.id);
    if (!sim) continue;
    const lid = item.leagueId;

    nextSchedules[lid] = (nextSchedules[lid] ?? []).map((e) =>
      e.id === item.id ? { ...e, result: sim.result } : e,
    );

    const cur = migrateLeagueState(nextLeagueState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []) });
    nextLeagueState[lid] = {
      standings: updateStandings(cur.standings, sim.result, item.homeTeamId, item.awayTeamId),
      stats:     accumulateStats(cur.stats, sim.result.playerLines),
      playerConditions:  { ...cur.playerConditions,  ...sim.pitcherConditions },
      teamRotationIndex: {
        ...cur.teamRotationIndex,
        [item.homeTeamId]: sim.nextHomeRotIdx,
        [item.awayTeamId]: sim.nextAwayRotIdx,
      },
    };
  }

  return { nextSchedules, nextLeagueState, gameLogs };
}

// 반경 2(드리프트) 리그 순위표 주간 갱신 — 개인 선수 데이터 없이 팀 전력치(prestige)만 사용
export async function driftBackgroundLeagues(
  s: SeasonStoreState,
  protagonistLeagueId: string,
  careerStage: CareerStage,
  teams: TeamRef[],
): Promise<Record<string, LeagueSeasonState> | null> {
  const driftLeagueIds = [...RADIUS_GATED_LEAGUES].filter(
    (lid) => lid !== protagonistLeagueId && getLeagueRadius(careerStage, lid) === 2,
  );
  if (driftLeagueIds.length === 0) return null;

  const teamPower = new Map(teams.map((t) => [t.id, t.proTeamProfile?.prestige ?? 50]));
  const nextLeagueState: Record<string, LeagueSeasonState> = {};

  for (const lid of driftLeagueIds) {
    const teamIds = ALL_TEAMS_BY_LEAGUE[lid] ?? [];
    if (teamIds.length === 0) continue;
    const cur = migrateLeagueState(s.leagueState[lid] ?? { standings: makeStandings(teamIds) });
    const standingsByTeam = new Map(cur.standings.map((st) => [st.teamId, st]));

    const driftInput = teamIds.map((teamId) => {
      const st = standingsByTeam.get(teamId);
      return {
        teamId,
        power:  teamPower.get(teamId) ?? 50,
        wins:   st?.wins ?? 0,
        losses: st?.losses ?? 0,
      };
    });

    const raw = await window.projectB!.engine(
      "standingsDriftNative",
      JSON.stringify({ teams: driftInput }),
    );
    const result = JSON.parse(raw) as { teams: { teamId: string; wins: number; losses: number }[] };
    const resultByTeam = new Map(result.teams.map((t) => [t.teamId, t]));

    nextLeagueState[lid] = {
      ...cur,
      standings: cur.standings.map((st) => {
        const upd = resultByTeam.get(st.teamId);
        if (!upd) return st;
        const total = upd.wins + upd.losses;
        return {
          ...st,
          wins: upd.wins,
          losses: upd.losses,
          winPct: total > 0 ? Math.round((upd.wins / total) * 1000) / 1000 : 0,
        };
      }),
    };
  }

  return Object.keys(nextLeagueState).length > 0 ? nextLeagueState : null;
}

export function applyBackgroundLeagueUpdate(
  s: SeasonStoreState,
  leagueId: string,
  scheduleId: string,
  homeTeamId: string,
  awayTeamId: string,
  result: MatchResult,
  nextHomeRotIdx: number,
  nextAwayRotIdx: number,
  pitcherConditions: Record<string, PlayerCondition>,
): SeasonStoreState {
  const nextSchedules = { ...s.leagueSchedules };
  const curSched = nextSchedules[leagueId] ?? [];
  nextSchedules[leagueId] = curSched.map((e) =>
    e.id === scheduleId ? { ...e, result } : e,
  );

  const cur = migrateLeagueState(s.leagueState[leagueId] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[leagueId] ?? []) });
  const nextLeagueState: LeagueSeasonState = {
    standings: updateStandings(cur.standings, result, homeTeamId, awayTeamId),
    stats:     accumulateStats(cur.stats, result.playerLines),
    playerConditions:  { ...cur.playerConditions, ...pitcherConditions },
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
}

export function syncProtagonistLeagueUpdate(
  s: SeasonStoreState,
  leagueId: string,
  result: MatchResult,
  homeTeamId: string,
  awayTeamId: string,
): SeasonStoreState {
  const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
  return {
    ...s,
    leagueState: {
      ...s.leagueState,
      [leagueId]: {
        ...cur,
        standings: updateStandings(cur.standings, result, homeTeamId, awayTeamId),
        stats:     accumulateStats(cur.stats, result.playerLines),
      },
    },
  };
}

export function applyWeeklyConditionRecovery(
  s: SeasonStoreState,
  entities: EntityRow[],
): SeasonStoreState {
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const nextState = { ...s.leagueState };
  for (const [lid, ls] of Object.entries(nextState)) {
    const nextConditions = { ...ls.playerConditions };
    for (const [pid, cond] of Object.entries(nextConditions)) {
      const rec = (entityMap.get(pid)?.details?.player as import("./master").EntityPlayerDetails | undefined)?.pitching?.recovery ?? 50;
      const recoveryMod = 0.6 + rec * 0.008;
      const gain = Math.round(WEEKLY_FATIGUE_RECOVERY * recoveryMod);
      nextConditions[pid] = { ...cond, fatigue: Math.min(100, cond.fatigue + gain) };
    }
    nextState[lid] = { ...ls, playerConditions: nextConditions };
  }
  return { ...s, leagueState: nextState };
}
