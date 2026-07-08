import { get } from "svelte/store";
import { masterStore } from "../../stores/master";
import { autoLog } from "../../stores/autoAdvance";
import { simulateGame } from "../../utils/gameSimulator";
import type { MatchResult } from "../../types/season";

export async function simulateNpcGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  const entities = get(masterStore).entities;
  if (entities.length > 0) {
    return (await simulateGame(homeTeamId, awayTeamId, entities)).result;
  }
  autoLog(`[폴백SIM] 주인공리그 엔티티없음: ${homeTeamId} vs ${awayTeamId}`);
  const fb = JSON.parse(await window.projectB!.weekCalcNpcFallback(
    JSON.stringify({ homeTeamId, awayTeamId })
  )) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
  return { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] };
}

export async function simulateProtagonistGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  return simulateNpcGame(homeTeamId, awayTeamId);
}
