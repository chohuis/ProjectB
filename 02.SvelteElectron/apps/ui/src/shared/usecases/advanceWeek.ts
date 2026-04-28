import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import type { MatchResult, WeekAdvanceResult } from "../types/season";

// NPC 경기 간이 시뮬
function simulateNpcGame(homeTeamId: string, awayTeamId: string): MatchResult {
  const score = () => Math.max(0, Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 4));
  let h = score();
  let a = score();
  // 동점 방지
  if (h === a) { h > 0 ? h-- : a++; }

  return {
    homeScore: h,
    awayScore: a,
    winnerId: h > a ? homeTeamId : awayTeamId,
    loserId:  h > a ? awayTeamId : homeTeamId,
    playerLines: [],
    events: [],
  };
}

// 주인공 경기 간이 시뮬 (자동 처리 시 사용)
export function simulateProtagonistGame(homeTeamId: string, awayTeamId: string): MatchResult {
  return simulateNpcGame(homeTeamId, awayTeamId);
}

// 한 주 진행
// 순서: 1) 미결 결정 메시지 체크 → 2) NPC 경기 시뮬 → 3) 주인공 경기 정지
export async function advanceWeek(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const g = get(gameStore);

  // 1. 미결 결정 메시지 → 먼저 처리 요청
  const unresolvedMsg = g.mailbox.find(
    (m) => m.decision && m.decision.selectedOptionId === null,
  );
  if (unresolvedMsg) {
    const action = { type: "message" as const, messageId: unresolvedMsg.id };
    seasonStore.pushPendingAction(action);
    return {
      processedWeek: s.currentWeek,
      logs: [],
      newMessages: [],
      matchResults: [],
      stoppedBy: action,
    };
  }

  // 2. 시즌 종료 체크
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

  // 3. 이번 주 경기 처리
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
    logs.push(`W${nextWeek} ${game.homeTeamId} ${result.homeScore}:${result.awayScore} ${game.awayTeamId}`);
  }

  return {
    processedWeek: nextWeek,
    logs,
    newMessages: [],
    matchResults,
    stoppedBy: null,
  };
}
