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
  /** 세계 씨앗 — 같은 세이브가 같은 경기를 내게 한다(재현성) */
  worldSeed?: number;
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

// ⚠ **이 워커는 지금 아무도 안 띄운다** — `backgroundLeague.ts`가 타입만
// 가져다 쓰고 시뮬은 자기가 직접 돌린다(`runSimBatch`). 살아날 때를 대비해
// 씨앗은 배선해 둔다. **지울지는 따로 판단한다.**
self.onmessage = async (e: MessageEvent<SimWorkerRequest>) => {
  const { reqId, games, entities, worldSeed } = e.data;
  const results = await Promise.all(games.map(async (g) => {
    const sim: SimGameResult = await simulateGame(g.homeTeamId, g.awayTeamId, entities, {
      conditions:  g.conditions,
      homeRotIdx:  g.homeRotIdx ?? 0,
      awayRotIdx:  g.awayRotIdx ?? 0,
      week:        g.week ?? 0,
      worldSeed,
      scheduleId:  g.id,
    });
    return {
      id:                 g.id,
      result:             sim.result,
      nextHomeRotIdx:     sim.nextHomeRotIdx,
      nextAwayRotIdx:     sim.nextAwayRotIdx,
      pitcherConditions:  sim.pitcherConditions,
    };
  }));
  (self as unknown as { postMessage: (data: SimWorkerResponse) => void }).postMessage({ reqId, results });
};
