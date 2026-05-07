import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { calcTrainingGrowth } from "../utils/growthEngine";
import { runEventEngine } from "../utils/eventEngine";
import { applyWeeklyStudy, calcExamResult, getUniversityEffBonus, getUniversityExamGainMult } from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../utils/salaryEngine";
import { isFaEligible } from "../utils/faEngine";
import type { MatchResult, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { ProtagonistSave } from "../types/save";

// ?? 二쇨컙 ???꾧툑?먮쫫 (?섏엯 - 吏異? 留??? ??????????????????????
function calcWeeklyNet(p: ProtagonistSave): number {
  switch (p.careerStage) {
    case "highschool":
      return Math.round((42 - 18) / 4);
    case "university":
      return Math.round((62 - 21) / 4);
    case "military":
      return Math.round((196 - 13) / 4);
    case "pro":
    case "pro_kbl":
    case "pro_abl": {
      const salary = p.contract?.salary ?? 3000;
      return Math.round(salary / 52 - 54);
    }
    case "independent":
      return Math.round((80 - 30) / 4);
    default:
      return 0;
  }
}

const EXAM_EVENT_IDS = new Set(["EVT_HS_MIDTERM", "EVT_HS_FINAL"]);

function makeTrainingMessage(week: number, logs: string[]): MessageItem {
  return {
    id: `msg-train-w${week}-${Date.now()}`,
    category: "system",
    sender: "훈련 시스템",
    subject: `W${week} ?덈젴 ?깃낵`,
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
    sender: "?숆탳",
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

  // 1. 誘멸껐 寃곗젙 硫붿떆吏 ??癒쇱? 泥섎━ ?붿껌
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

  const hasMilitaryPending = s.pendingActions.some((a) => a.type === "militaryEnlist");
  if (
    !hasMilitaryPending &&
    g.protagonist.careerStage !== "military" &&
    g.protagonist.age >= 28 &&
    (g.protagonist.careerStage === "pro_kbl" ||
      g.protagonist.careerStage === "pro_abl" ||
      g.protagonist.careerStage === "independent")
  ) {
    const action = { type: "militaryEnlist" as const };
    seasonStore.pushPendingAction(action);
    return {
      processedWeek: s.currentWeek,
      logs: ["입영 대상: 군 복무 진행이 필요합니다."],
      newMessages: [],
      matchResults: [],
      stoppedBy: action,
    };
  }

  // 2. ?쒖쫵 醫낅즺 泥댄겕
  const nextWeek = s.currentWeek + 1;
  if (nextWeek > s.totalWeeks) {
    if (g.protagonist.careerStage === "military") {
      gameStore.completeMilitaryService();
      const contract = g.protagonist.contract;
      if (contract) {
        const action = {
          type: "salaryNegotiation" as const,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          offeredSalary: contract.salary,
          durationYears: Math.max(1, contract.remainingYears),
          signingBonus: 0,
        };
        seasonStore.pushPendingAction(action);
        return {
          processedWeek: s.currentWeek,
          logs: ["전역: 복귀 계약 협상을 진행하세요."],
          newMessages: [],
          matchResults: [],
          stoppedBy: action,
        };
      }
      return {
        processedWeek: s.currentWeek,
        logs: ["전역 완료"],
        newMessages: [],
        matchResults: [],
        stoppedBy: null,
      };
    }
    const isProStage =
      g.protagonist.careerStage === "pro_kbl" || g.protagonist.careerStage === "pro_abl";
    const hasOptionPending = s.pendingActions.some((a) => a.type === "optionClause");
    const hasSalaryPending = s.pendingActions.some((a) => a.type === "salaryNegotiation");
    if (isProStage && g.protagonist.contract && !hasOptionPending && !hasSalaryPending) {
      gameStore.applySeasonContractProgress();
      const gAfter = get(gameStore);
      const contract = gAfter.protagonist.contract;
      if (!contract) {
        return {
          processedWeek: s.currentWeek,
          logs: ["시즌이 종료되었습니다."],
          newMessages: [],
          matchResults: [],
          stoppedBy: null,
        };
      }
      const myStats = (s.stats[g.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
      const seasonRating = calcSeasonRating(myStats);
      const offeredSalary = calcOfferedSalaryForProtagonist(g.protagonist, myStats);
      if (contract.remainingYears === 0) {
        if (contract.teamOptionYears > 0) {
          const exercised = seasonRating >= 60;
          const action = {
            type: "optionClause" as const,
            optionType: "team" as const,
            exercised,
            nextSalary: offeredSalary,
          };
          seasonStore.pushPendingAction(action);
          return {
            processedWeek: s.currentWeek,
            logs: ["시즌 종료: 팀 옵션 조항이 처리됩니다."],
            newMessages: [],
            matchResults: [],
            stoppedBy: action,
          };
        }
        if (contract.playerOptionYears > 0) {
          const action = {
            type: "optionClause" as const,
            optionType: "player" as const,
            exercised: false,
            nextSalary: offeredSalary,
          };
          seasonStore.pushPendingAction(action);
          return {
            processedWeek: s.currentWeek,
            logs: ["시즌 종료: 선수 옵션 선택이 필요합니다."],
            newMessages: [],
            matchResults: [],
            stoppedBy: action,
          };
        }
        if (isFaEligible(g.protagonist, g.schoolState.attendsUniversity)) {
          const action = { type: "faMarket" as const };
          seasonStore.pushPendingAction(action);
          return {
            processedWeek: s.currentWeek,
            logs: ["시즌 종료: 계약 만료로 FA 시장에 진입합니다."],
            newMessages: [],
            matchResults: [],
            stoppedBy: action,
          };
        }
        const action = {
          type: "salaryNegotiation" as const,
          teamId: contract.teamId,
          leagueId: contract.leagueId,
          offeredSalary,
          durationYears: 1,
          signingBonus: 0,
        };
        seasonStore.pushPendingAction(action);
        return {
          processedWeek: s.currentWeek,
          logs: ["시즌 종료: FA 자격 미충족으로 연봉 협상을 진행합니다."],
          newMessages: [],
          matchResults: [],
          stoppedBy: action,
        };
      }
      const action = {
        type: "salaryNegotiation" as const,
        teamId: contract.teamId,
        leagueId: contract.leagueId,
        offeredSalary,
        durationYears: Math.max(1, contract.remainingYears),
        signingBonus: 0,
      };
      seasonStore.pushPendingAction(action);
      return {
        processedWeek: s.currentWeek,
        logs: ["시즌 종료: 연봉 협상을 진행하세요."],
        newMessages: [],
        matchResults: [],
        stoppedBy: action,
      };
    }
    return {
      processedWeek: s.currentWeek,
      logs: ["시즌이 종료되었습니다."],
      newMessages: [],
      matchResults: [],
      stoppedBy: null,
    };
  }

  seasonStore.advanceWeek();

  if (g.protagonist.careerStage === "military") {
    gameStore.advanceMilitaryWeek();
    const isSportsUnit = g.protagonist.militaryUnit === "sports";
    const militaryEvents = get(masterStore).militaryEvents;
    if (militaryEvents.length > 0 && Math.random() < 0.35) {
      const evt = militaryEvents[Math.floor(Math.random() * militaryEvents.length)];
      seasonStore.pushPendingAction({
        type: "event",
        eventId: evt.id,
        title: evt.title,
        description: evt.description,
        choices: [
          {
            id: "ok",
            label: "확인",
            effects: {
              moraleDelta: evt.moraleDelta ?? 0,
              fatigueDelta: evt.fatigueDelta ?? 0,
            },
          },
        ],
      });
    }
    const pitching = { ...g.protagonist.pitching };
    if (isSportsUnit) {
      pitching.stamina = Math.min(99, pitching.stamina + 1);
      pitching.recovery = Math.min(99, pitching.recovery + 1);
      pitching.command = Math.min(99, pitching.command + (Math.random() < 0.4 ? 1 : 0));
    } else {
      pitching.command = Math.max(1, pitching.command - (Math.random() < 0.5 ? 1 : 0));
      pitching.control = Math.max(1, pitching.control - (Math.random() < 0.45 ? 1 : 0));
      pitching.recovery = Math.max(1, pitching.recovery - (Math.random() < 0.35 ? 1 : 0));
    }
    gameStore.applyWeekResult(
      {
        morale: Math.max(0, Math.min(100, g.protagonist.morale + (isSportsUnit ? 1 : -1))),
        fatigue: Math.max(0, Math.min(100, g.protagonist.fatigue + (isSportsUnit ? -2 : 2))),
        pitching,
      },
      [isSportsUnit ? "군 복무(체육부대): 훈련 루틴 유지" : "군 복무(일반부대): 기본 근무 수행"],
      [],
      nextWeek,
    );
    gameStore.save();
    seasonStore.save();
    return {
      processedWeek: nextWeek,
      logs: [isSportsUnit ? "군 복무(체육부대)" : "군 복무(일반부대)"],
      newMessages: [],
      matchResults: [],
      stoppedBy: null,
    };
  }

  if ((g.protagonist.militaryRecoveryWeeks ?? 0) > 0) {
    gameStore.advanceMilitaryRecoveryWeek();
    gameStore.applyWeekResult(
      {
        condition: Math.min(100, g.protagonist.condition + 2),
        fatigue: Math.max(0, g.protagonist.fatigue - 3),
      },
      ["전역 후 재활 진행"],
      [],
      nextWeek,
    );
  }
  if ((g.protagonist.tradeAdaptationWeeks ?? 0) > 0) {
    gameStore.advanceTradeAdaptationWeek();
    gameStore.applyWeekResult(
      {
        condition: Math.max(0, g.protagonist.condition - 2),
        morale: Math.max(0, g.protagonist.morale - 2),
      },
      ["이적 적응 기간: 컨디션/사기 패널티 적용"],
      [],
      nextWeek,
    );
  }

  // ?? 3. 二쇨컙 ?숈뾽 ?④낵 + ?덈젴 ?⑥쑉 怨꾩궛 ????????????????????????
  const isUniversity = g.protagonist.careerStage === "university";

  // ???吏꾪뻾 二쇱감 利앷?
  if (isUniversity) {
    gameStore.incrementUniversityWeek();
  }

  // ?쇰컲?꾧났 ?쒗뿕 ?먯닔 諛곗쑉 ?곸슜
  const examGainMult = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult = applyWeeklyStudy(g.schoolState, examGainMult);
  gameStore.applyWeeklyStudyResult(studyResult);

  // 대학 전공 훈련 효율 보너스
  const majorEffBonus = isUniversity ? getUniversityEffBonus(g.schoolState.universityMajor) : 0;
  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus);

  const growth = calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  gameStore.applyMoneyChange(calcWeeklyNet(g.protagonist));
  gameStore.recordTrainingWeek();

  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  if (ovrAfter > ovrBefore) {
    gameStore.updateScoutScore(Math.min(3, Math.max(1, ovrAfter - ovrBefore)));
  }

  // ?덈젴 ?⑥쑉 媛먯냼 濡쒓렇
  if (studyResult.efficiencyMod < 1.0) {
    const pct = Math.round(studyResult.efficiencyMod * 100);
    growth.logs.push(`[?숈뾽] ?덈젴 ?⑥쑉 ${pct}% (${g.schoolState.weeklyStudyMode === "focus" ? "吏묒쨷 ?섏뾽" : "?쇰컲 ?섏뾽"})`);
  }

  // ?? 4. ?대쾲 二?寃쎄린 泥섎━ ??????????????????????????????????????
  const weekGames = s.schedule.filter((e) => e.week === nextWeek && !e.result);
  const logs: string[] = [...growth.logs];
  const matchResults: MatchResult[] = [];

  // ?꾩＜ ?쒗뿕 9?깃툒 異쒖쟾 ?뺤? 泥댄겕 ???대쾲 二?寃쎄린???곸슜 ???댁젣
  const eligibilityBlocked = g.schoolState.eligibilityBlocked;
  if (eligibilityBlocked) {
    gameStore.clearEligibilityBlock();
  }

  for (const game of weekGames) {
    if (game.isProtagonistGame) {
      if (eligibilityBlocked) {
        logs.push("?숈궗 寃쎄퀬 ???대쾲 寃쎄린 異쒖쟾 ?쒗븳");
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

  // ?? 5. ?대깽???붿쭊 ?ㅽ뻾 ????????????????????????????????????????
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

  // ?? 6. ?쒗뿕 ?대깽??泥섎━ ????????????????????????????????????????
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
    logs.push(`[?쒗뿕] ${examRes.messageSubject}`);
  }

  // ?? 7. 硫붿떊? ?꾪겕 ?몃━嫄?(contactDefs ?쒗쉶, ?곗씠???쒕━釉? ??
  const weekInYear = ((nextWeek - 1) % 52) + 1;
  {
    const mCur = get(masterStore);
    const gCur = get(gameStore);
    const contactMap = new Map(gCur.contacts.map((c) => [c.id, c]));

    for (const def of mCur.contactDefs) {
      for (const arc of def.arcs) {
        const contact = contactMap.get(def.id);
        const flags = contact?.flags ?? [];
        if (flags.includes(arc.flag)) continue;

        const t = arc.trigger;
        if (t.weekInSeason    !== undefined && weekInYear !== t.weekInSeason)       continue;
        if (t.weekInSeasonGte !== undefined && weekInYear < t.weekInSeasonGte)      continue;
        if (t.careerStage     !== undefined && g.protagonist.careerStage !== t.careerStage) continue;
        if (t.careerYear      !== undefined && careerStageYear !== t.careerYear)    continue;
        if (t.affinityGte     !== undefined && (contact?.affinity ?? 0) < t.affinityGte) continue;
        if (t.flagSet         !== undefined && !flags.includes(t.flagSet))           continue;
        if (t.flagNotSet      !== undefined &&  flags.includes(t.flagNotSet))        continue;

        seasonStore.pushPendingAction({ type: "messengerScript", contactId: def.id, arcId: arc.id });
        break; // 而⑦깮????1媛??꾪겕留??먯뿉 異붽?
      }
    }
  }

  // ?? 8. 吏꾨줈 ?좏깮 ?대깽??(怨? 留? W50) ?????????????????????????
  const gLatest = get(gameStore);
  if (
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 &&
    weekInYear === 50 &&
    !gLatest.schoolState.careerChoiceTriggered
  ) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoice" });
  }

  // ?? 9. ?쒕옒?꾪듃 ?대깽???몃━嫄?(怨?/?4 W52) ????????????????????
  const gDraft = get(gameStore);
  const isHsDraftWeek =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 &&
    weekInYear === 52;
  const isUnivDraftWeek =
    gDraft.protagonist.careerStage === "university" &&
    careerStageYear === 3 &&
    weekInYear === 52;
  if ((isHsDraftWeek || isUnivDraftWeek) && !gDraft.schoolState.draftTriggered) {
    gameStore.markDraftTriggered(true);
    seasonStore.pushPendingAction({ type: "draft" });
  }

  // 10. 프로 트레이드 판정
  const gTrade = get(gameStore);
  if (
    (gTrade.protagonist.careerStage === "pro_kbl" || gTrade.protagonist.careerStage === "pro_abl") &&
    gTrade.protagonist.contract &&
    !get(seasonStore).pendingActions.some((a) => a.type === "trade")
  ) {
    const myStats = (get(seasonStore).stats[gTrade.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
    const myEra = myStats?.era ?? 4.2;
    const standings = get(seasonStore).standings;
    const myRank = [...standings]
      .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
      .findIndex((sRow) => sRow.teamId === gTrade.protagonist.teamId) + 1;
    const bottomTeam = myRank > 0 && myRank >= standings.length - 1;
    const poorPerf = myEra >= 5.0;
    const elitePerf = myEra <= 2.5;
    const shouldCheck = weekInYear >= 12 && weekInYear <= 40 && weekInYear % 4 === 0;
    if (shouldCheck && (poorPerf || elitePerf || bottomTeam)) {
      const sameLeagueTeams = m.teams
        .filter((t) => t.leagueId === gTrade.protagonist.leagueId && t.id !== gTrade.protagonist.teamId)
        .map((t) => t.id);
      if (sameLeagueTeams.length > 0 && Math.random() < 0.24) {
        const toTeamId = sameLeagueTeams[Math.floor(Math.random() * sameLeagueTeams.length)];
        seasonStore.pushPendingAction({
          type: "event",
          eventId: "EVT_TRADE_RUMOR",
          title: "트레이드 루머",
          description: "타 구단에서 관심을 보이고 있다는 소문이 돌고 있습니다.",
          choices: [{ id: "ok", label: "확인" }],
        });
        seasonStore.pushPendingAction({
          type: "trade",
          fromTeamId: gTrade.protagonist.teamId,
          toTeamId,
        });
      }
    }
  }

  const newMessages = evResult.newMessages.map((msg) => msg.id);

  gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek);
  if (growth.logs.length > 0) {
    gameStore.addMessage(makeTrainingMessage(nextWeek, growth.logs));
  }

  // ?? 8. ?낆쟻 泥댄겕 ???????????????????????????????????????????????
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
