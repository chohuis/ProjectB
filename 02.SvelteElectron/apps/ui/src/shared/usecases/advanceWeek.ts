import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { calcTrainingGrowth } from "../utils/growthEngine";
import { runEventEngine } from "../utils/eventEngine";
import { applyWeeklyStudy, calcExamResult, getUniversityEffBonus, getUniversityExamGainMult } from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import type { MatchResult, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";

const EXAM_EVENT_IDS = new Set(["EVT_HS_MIDTERM", "EVT_HS_FINAL"]);

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

function makeExamMessage(week: number, subject: string, body: string): MessageItem {
  return {
    id: `msg-exam-w${week}-${Date.now()}`,
    category: "system",
    sender: "학교",
    subject,
    preview: body.split("\n")[0] ?? "",
    body,
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

  // ── 3. 주간 학업 효과 + 훈련 효율 계산 ────────────────────────
  const isUniversity = g.protagonist.careerStage === "university";

  // 대학 진행 주차 증가
  if (isUniversity) {
    gameStore.incrementUniversityWeek();
  }

  // 일반전공 시험 점수 배율 적용
  const examGainMult = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult = applyWeeklyStudy(g.schoolState, examGainMult);
  gameStore.applyWeeklyStudyResult(studyResult);

  // 대학 전공 훈련 효율 보너스
  const majorEffBonus = isUniversity ? getUniversityEffBonus(g.schoolState.universityMajor) : 0;
  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus);

  const growth = calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  // 훈련 효율 감소 로그
  if (studyResult.efficiencyMod < 1.0) {
    const pct = Math.round(studyResult.efficiencyMod * 100);
    growth.logs.push(`[학업] 훈련 효율 ${pct}% (${g.schoolState.weeklyStudyMode === "focus" ? "집중 수업" : "일반 수업"})`);
  }

  // ── 4. 이번 주 경기 처리 ──────────────────────────────────────
  const weekGames = s.schedule.filter((e) => e.week === nextWeek && !e.result);
  const logs: string[] = [...growth.logs];
  const matchResults: MatchResult[] = [];

  // 전주 시험 9등급 출전 정지 체크 — 이번 주 경기에 적용 후 해제
  const eligibilityBlocked = g.schoolState.eligibilityBlocked;
  if (eligibilityBlocked) {
    gameStore.clearEligibilityBlock();
  }

  for (const game of weekGames) {
    if (game.isProtagonistGame) {
      if (eligibilityBlocked) {
        logs.push("학사 경고 — 이번 경기 출전 제한");
        seasonStore.applyMatchResult(game.id, simulateNpcGame(game.homeTeamId, game.awayTeamId));
      } else {
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
    } else {
      const result = simulateNpcGame(game.homeTeamId, game.awayTeamId);
      seasonStore.applyMatchResult(game.id, result);
      matchResults.push(result);
      logs.push(`W${nextWeek} ${game.homeTeamId} ${result.homeScore}:${result.awayScore} ${game.awayTeamId}`);
    }
  }

  // ── 5. 이벤트 엔진 실행 ────────────────────────────────────────
  const m = get(masterStore);
  const sNow = get(seasonStore);
  const eventCtx: EventContext = {
    protagonist:     g.protagonist,
    currentWeek:     nextWeek,
    seasonPhase:     sNow.schedule.find((e) => e.week === nextWeek)?.phase ?? "season",
    standings:       sNow.standings,
    stats:           sNow.stats,
    triggeredEvents: sNow.triggeredEvents,
  };

  const careerStageYear = Math.floor((nextWeek - 1) / 52);
  const evResult = runEventEngine(
    m.eventRules,
    m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx,
    sNow.seasonYear,
    careerStageYear,
  );

  for (const action of evResult.pendingActions) {
    seasonStore.pushPendingAction(action);
  }
  for (const msg of evResult.newMessages) {
    gameStore.addMessage(msg);
  }
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);

  // ── 6. 시험 이벤트 처리 ────────────────────────────────────────
  const gAfterStudy = get(gameStore);
  const triggeredExamId = Object.keys(evResult.updatedTriggers)
    .find((id) => EXAM_EVENT_IDS.has(id));

  if (triggeredExamId && (g.protagonist.careerStage === "highschool" || g.protagonist.careerStage === "university")) {
    const examType = triggeredExamId === "EVT_HS_MIDTERM" ? "midterm" : "final";
    const examRes  = calcExamResult(
      gAfterStudy.schoolState.examAccumScore,
      gAfterStudy.schoolState.warningCount,
      examType,
    );
    gameStore.applyExamResult(examRes);
    gameStore.addMessage(makeExamMessage(nextWeek, examRes.messageSubject, examRes.messageBody));
    logs.push(`[시험] ${examRes.messageSubject}`);
  }

  // ── 7. 진로 선택 이벤트 (고3 말, W50) ─────────────────────────
  const gLatest = get(gameStore);
  const weekInYear = ((nextWeek - 1) % 52) + 1;
  if (
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 &&
    weekInYear === 50 &&
    !gLatest.schoolState.careerChoiceTriggered
  ) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoice" });
  }

  const newMessages = evResult.newMessages.map((msg) => msg.id);

  gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek);
  if (growth.logs.length > 0) {
    gameStore.addMessage(makeTrainingMessage(nextWeek, growth.logs));
  }

  // ── 8. 업적 체크 ───────────────────────────────────────────────
  const gFinal   = get(gameStore);
  const sFinal   = get(seasonStore);
  const mFinal   = get(masterStore);
  const metrics  = computeMetrics(
    gFinal.achievementMetrics,
    gFinal.mailbox,
    sFinal.standings,
    sFinal.schedule,
    gFinal.protagonist.teamId,
  );
  const achResult = checkAchievements(mFinal.achievements, gFinal.achievements, metrics, `W${nextWeek}`);
  if (achResult.newlyUnlocked.length > 0 || achResult.updatedRuntime.some((r, i) => r.progress !== gFinal.achievements[i]?.progress)) {
    gameStore.applyAchievementCheck(achResult);
  }

  gameStore.save();
  seasonStore.save();

  const pendingAfter = get(seasonStore).pendingActions;
  const stoppedBy = pendingAfter.length > 0 ? pendingAfter[0] : null;
  return {
    processedWeek: nextWeek,
    logs,
    newMessages,
    matchResults,
    stoppedBy,
  };
}
