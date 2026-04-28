import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { calcTrainingGrowth } from "../utils/growthEngine";
import type { MatchResult, WeekAdvanceResult } from "../types/season";
import type { MessageItem } from "../types/main";

function makeTrainingMessage(week: number, logs: string[]): MessageItem {
  return {
    id: `msg-train-w${week}-${Date.now()}`,
    category: "system",
    sender: "훈련 시스템",
    subject: `W${week} 훈련 성과`,
    preview: logs[0] ?? "",
    body: logs.join("\n"),
    createdAt: `W${week}`,
    readAt: null,
  };
}

function simulateNpcGame(homeTeamId: string, awayTeamId: string): MatchResult {
  const score = () => Math.max(0, Math.round((Math.random() + Math.random() + Math.random() - 1.5) * 4));
  let h = score();
  let a = score();
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

export function simulateProtagonistGame(homeTeamId: string, awayTeamId: string): MatchResult {
  return simulateNpcGame(homeTeamId, awayTeamId);
}

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

  // 훈련 성장 계산 (주 진행 시 항상 적용)
  const growth = calcTrainingGrowth(g.protagonist, g.trainingPlan);

  // 3. 이번 주 경기 처리
  const weekGames = s.schedule.filter((e) => e.week === nextWeek && !e.result);
  const logs: string[] = [...growth.logs];
  const matchResults: MatchResult[] = [];

  for (const game of weekGames) {
    if (game.isProtagonistGame) {
      const action = { type: "game" as const, scheduleId: game.id };
      seasonStore.pushPendingAction(action);
      gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek);
      if (growth.logs.length > 0) {
        gameStore.addMessage(makeTrainingMessage(nextWeek, growth.logs));
      }
      gameStore.save();
      seasonStore.save();
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

  gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek);
  if (growth.logs.length > 0) {
    gameStore.addMessage(makeTrainingMessage(nextWeek, growth.logs));
  }
  gameStore.save();
  seasonStore.save();
  return {
    processedWeek: nextWeek,
    logs,
    newMessages: [],
    matchResults,
    stoppedBy: null,
  };
}
