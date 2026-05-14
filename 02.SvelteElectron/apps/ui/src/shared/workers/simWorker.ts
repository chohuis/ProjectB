import { simulateGame } from "../utils/gameSimulator";
import type { EntityRow } from "../stores/master";
import type { MatchResult } from "../types/season";

interface SimGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface SimWorkerRequest {
  reqId: number;
  games: SimGame[];
  entities: EntityRow[];
}

export interface SimWorkerResponse {
  reqId: number;
  results: { id: string; result: MatchResult }[];
}

self.onmessage = (e: MessageEvent<SimWorkerRequest>) => {
  const { reqId, games, entities } = e.data;
  const results = games.map((g) => ({
    id: g.id,
    result: simulateGame(g.homeTeamId, g.awayTeamId, entities),
  }));
  (self as unknown as { postMessage: (data: SimWorkerResponse) => void }).postMessage({
    reqId,
    results,
  });
};
