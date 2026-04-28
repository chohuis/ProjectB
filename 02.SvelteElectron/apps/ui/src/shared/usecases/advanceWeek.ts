import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import type { MatchResult, WeekAdvanceResult } from "../types/season";

// NPC 경기 간이 시뮬: 무작위 점수 생성
function simulateNpcGame(homeTeamId: string, awayTeamId: string): MatchResult {
  // 야구 점수 분포: 포아송λ≈4 근사 (0~12)
  const score = () => Math.max(0, Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 4));
  const homeScore = score();
  const awayScore = score();

  // 동점이면 연장 처리 대신 재추첨
  const finalHome = homeScore === awayScore ? homeScore + 1 : homeScore;
  const finalAway = homeScore === awayScore ? awayScore     : awayScore;

  const winnerId = finalHome > finalAway ? homeTeamId : awayTeamId;
  const loserId  = finalHome > finalAway ? awayTeamId : homeTeamId;

  return {
    homeScore: finalHome,
    awayScore: finalAway,
    winnerId,
    loserId,
    playerLines: [],
    events: [],
  };
}

// 한 주 진행
// - NPC 경기는 자동 시뮬
// - 주인공 경기는 PendingAction("game") 등록 후 중단
export async function advanceWeek(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const nextWeek = s.currentWeek + 1;

  if (nextWeek > s.totalWeeks) {
    return {
      processedWeek: s.currentWeek,
      logs: ["시즌이 종료되었습니다."],
      newMessages: [],
      matchResults: [],
      stoppedBy: null,
    };
  }

  seasonStore.advanceWeek();

  const weekGames = s.schedule.filter((e) => e.week === nextWeek && !e.result);
  const logs: string[] = [];
  const matchResults: MatchResult[] = [];

  for (const game of weekGames) {
    if (game.isProtagonistGame) {
      const action = { type: "game" as const, scheduleId: game.id };
      seasonStore.pushPendingAction(action);
      return {
        processedWeek: nextWeek,
        logs,
        newMessages: [],
        matchResults,
        stoppedBy: action,
      };
    }

    const result = simulateNpcGame(game.homeTeamId, game.awayTeamId);
    seasonStore.applyMatchResult(game.id, result);
    matchResults.push(result);
    logs.push(
      `W${nextWeek} ${game.homeTeamId} ${result.homeScore}:${result.awayScore} ${game.awayTeamId}`,
    );
  }

  return {
    processedWeek: nextWeek,
    logs,
    newMessages: [],
    matchResults,
    stoppedBy: null,
  };
}
