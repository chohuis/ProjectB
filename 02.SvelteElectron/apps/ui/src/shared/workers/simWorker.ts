import { simulateGame } from "../utils/gameSimulator";
import type { EntityRow } from "../stores/master";
import type { MatchResult, PlayerCondition } from "../types/season";
import type { SimGameResult } from "../utils/gameSimulator";

interface SimGame {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeRotIdx?: number;
  awayRotIdx?: number;
  conditions?: Record<string, PlayerCondition>;
  week?: number;
}

export interface SimWorkerRequest {
  reqId: number;
  games: SimGame[];
  entities: EntityRow[];
}

export interface SimWorkerResultItem {
  id: string;
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, PlayerCondition>;
}

export interface SimWorkerResponse {
  reqId: number;
  results: SimWorkerResultItem[];
}

self.onmessage = (e: MessageEvent<SimWorkerRequest>) => {
  const { reqId, games, entities } = e.data;
  const results: SimWorkerResultItem[] = games.map((g) => {
    const sim: SimGameResult = simulateGame(g.homeTeamId, g.awayTeamId, entities, {
      conditions:  g.conditions,
      homeRotIdx:  g.homeRotIdx ?? 0,
      awayRotIdx:  g.awayRotIdx ?? 0,
      week:        g.week ?? 0,
    });
    return {
      id:                 g.id,
      result:             sim.result,
      nextHomeRotIdx:     sim.nextHomeRotIdx,
      nextAwayRotIdx:     sim.nextAwayRotIdx,
      pitcherConditions:  sim.pitcherConditions,
    };
  });
  (self as unknown as { postMessage: (data: SimWorkerResponse) => void }).postMessage({ reqId, results });
};
