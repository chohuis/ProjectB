import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { simulateGame } from "../utils/gameSimulator";
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

// ── 시설 효율 계산 함수 ────────────────────────────────────────
function calcFacilityEffMod(p: ProtagonistSave, teamTier?: string): number {
  switch (p.careerStage) {
    case "highschool":  return 0.92;
    case "university":  return 0.95;
    case "military":    return 0.88;
    case "independent": return 0.85;
    case "pro":
    case "pro_kbl":
    case "pro_abl":
      return teamTier === "1군" ? 1.05 : 0.95;
    default: return 0.92;
  }
}

// ── 주간 순수입 계산 (수입 - 실제 지출액 환산) ──────────────────
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
    subject: `W${week} 훈련 결과`,
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
    sender: "학업 시스템",
    subject,
    preview: body.split("\n")[0] ?? "",
    body,
    createdAt: `W${week}`,
    readAt: null,
  };
}

function simulateNpcGame(homeTeamId: string, awayTeamId: string): MatchResult {
  const entities = get(masterStore).entities;
  if (entities.length > 0) {
    return simulateGame(homeTeamId, awayTeamId, entities);
  }
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

function calcCareerStageYear(p: ProtagonistSave, seasonWeek: number, universityWeek: number): number {
  if (p.careerStage === "highschool") {
    return Math.max(0, (p.grade ?? 1) - 1);
  }
  if (p.careerStage === "university") {
    return Math.floor(Math.max(0, universityWeek - 1) / 52);
  }
  return Math.floor((seasonWeek - 1) / 52);
}

export async function advanceWeek(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const g = get(gameStore);

  // 1. 미결정 선택지 메시지 처리 체크
  const unresolvedMsg = g.mailbox.find(
    (m) => m.decision && m.decision.selectedOptionId === null,
  );
  if (unresolvedMsg) {
    const action = { type: "message" as const, messageId: unresolvedMsg.id };
    const hasPendingMessage = s.pendingActions.some(
      (a) => a.type === "message" && a.messageId === unresolvedMsg.id,
    );
    if (!hasPendingMessage) {
      seasonStore.pushPendingAction(action);
    }
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

  // 2. 시즌 종료 처리
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
      s.seasonYear,
    );
    await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, get(masterStore).entities);
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
      s.seasonYear,
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
      s.seasonYear,
    );
  }

  // ── 3. 훈련 프로그램 실행 + 효율 연산 ──────────────────────────
  const isUniversity = g.protagonist.careerStage === "university";

  // 대학 주차 증가
  if (isUniversity) {
    gameStore.incrementUniversityWeek();
  }

  // ── 6. 시험 이벤트 처리 ──────────────────────────────────────
  const examGainMult = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult = applyWeeklyStudy(g.schoolState, examGainMult);
  gameStore.applyWeeklyStudyResult(studyResult);

  // 전공 훈련 효율 보정값
  const majorEffBonus = isUniversity ? getUniversityEffBonus(g.schoolState.universityMajor) : 0;

  // 코치 스탯 기반 효율 보너스 (teaching 50 기준, +4%/10pt)
  const master = get(masterStore);
  const pitchCoach = master.entities.find(
    (e) => e.role === "coach" && e.teamId === g.protagonist.teamId &&
           (e.details as import("../stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  const coachTeaching = (pitchCoach?.details as import("../stores/master").EntityDetails)?.coach?.stats?.teaching ?? 50;
  const coachEffBonus = Math.max(-0.10, Math.min(0.20, (coachTeaching - 50) * 0.004));

  // ── 시설 효율 계산 함수 ────────────────────────────────────────
  const teamRef       = master.teams.find((t) => t.id === g.protagonist.teamId);
  const facilityEffMod = calcFacilityEffMod(g.protagonist, teamRef?.tier);

  // ── 시설 효율 계산 함수 ────────────────────────────────────────
  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpPenalty       = newLowMoraleWeeks >= 3 ? 0.70 : 1.0;

  // 부상 카운터 + 부상 발생 판정
  const prevHighFatigueWeeks  = g.protagonist.consecutiveHighFatigueWeeks ?? 0;
  const isHighFatigue         = g.protagonist.fatigue >= 85;
  const newHighFatigueWeeks   = isHighFatigue ? prevHighFatigueWeeks + 1 : 0;
  const alreadyInjured        = !!g.protagonist.injury;

  let injuryUpdate: ProtagonistSave["injury"] | undefined = g.protagonist.injury;
  let injuryJustOccurred = false;
  let injuryJustHealed   = false;

  if (!alreadyInjured && newHighFatigueWeeks >= 2) {
    const chance = Math.min(0.65, 0.30 + Math.max(0, newHighFatigueWeeks - 2) * 0.25);
    if (Math.random() < chance) {
      const type = g.protagonist.fatigue >= 92 ? "moderate" : "light";
      injuryUpdate       = { type, recoveryWeeksLeft: type === "moderate" ? 3 : 2 };
      injuryJustOccurred = true;
    }
  } else if (alreadyInjured && g.protagonist.injury) {
    const weeksLeft = g.protagonist.injury.recoveryWeeksLeft - 1;
    if (weeksLeft <= 0) {
      injuryUpdate      = undefined;
      injuryJustHealed  = true;
    } else {
      injuryUpdate = { ...g.protagonist.injury, recoveryWeeksLeft: weeksLeft };
    }
  }

  // 부상 중 훈련 효율 -80%
  const injuryEffMod = alreadyInjured && !injuryJustHealed ? 0.20 : 1.0;

  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus + coachEffBonus)
    * facilityEffMod * slumpPenalty * injuryEffMod;

  const growth = calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  // 슬럼프/코치/시설/부상 로그
  if (newLowMoraleWeeks >= 3) {
    growth.logs.push(`[슬럼프] 사기 저하 ${newLowMoraleWeeks}주 연속 — 훈련 효율 -30%`);
  }
  if (coachEffBonus > 0.01) {
    growth.logs.push(`[코치] 투수 코치 지도 보너스 +${Math.round(coachEffBonus * 100)}%`);
  }
  if (injuryJustOccurred && injuryUpdate) {
    const label = injuryUpdate.type === "moderate" ? "중상" : "경상";
    growth.logs.push(`[부상] ${label} 발생 — ${injuryUpdate.recoveryWeeksLeft}주 회복 필요. 훈련 제한 적용`);
  } else if (alreadyInjured && !injuryJustHealed && injuryUpdate) {
    growth.logs.push(`[부상] 회복 중 (${injuryUpdate.recoveryWeeksLeft}주 남음) — 훈련 효율 -80%`);
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  }

  // 카운터·부상 상태 갱신
  growth.protagonistPatch.consecutiveLowMoraleWeeks   = newLowMoraleWeeks;
  growth.protagonistPatch.consecutiveHighFatigueWeeks  = injuryJustOccurred ? 0 : newHighFatigueWeeks;
  growth.protagonistPatch.injury                       = injuryUpdate;

  gameStore.applyMoneyChange(calcWeeklyNet(g.protagonist));
  gameStore.recordTrainingWeek();

  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  if (ovrAfter > ovrBefore) {
    gameStore.updateScoutScore(Math.min(3, Math.max(1, ovrAfter - ovrBefore)));
  }

  // 주간 효율 감소 로그
  if (studyResult.efficiencyMod < 1.0) {
    const pct = Math.round(studyResult.efficiencyMod * 100);
    growth.logs.push(`[학업] 주간 효율 ${pct}% (${g.schoolState.weeklyStudyMode === "focus" ? "집중 학습" : "일반 학습"})`);
  }

  // ── 4. 경기 일정 처리 ─────────────────────────────────────────
  const weekGames = s.schedule.filter((e) => e.week === nextWeek && !e.result);
  const logs: string[] = [...growth.logs];
  const matchResults: MatchResult[] = [];

  // 학사 자격 정지 시 경기 출전 불가 처리
  const eligibilityBlocked = g.schoolState.eligibilityBlocked;
  if (eligibilityBlocked) {
    gameStore.clearEligibilityBlock();
  }

  for (const game of weekGames) {
    if (game.isProtagonistGame) {
      if (eligibilityBlocked) {
        logs.push("학사 경고로 인해 경기 출전 불가");
        seasonStore.applyMatchResult(game.id, simulateNpcGame(game.homeTeamId, game.awayTeamId));
      } else {
        const action = { type: "game" as const, scheduleId: game.id };
        seasonStore.pushPendingAction(action);
        gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek, s.seasonYear);
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

  // ── 5. 이벤트 엔진 실행 ────────────────────────────────────────────────────
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

  const gForStageYear = get(gameStore);
  const careerStageYear = calcCareerStageYear(
    gForStageYear.protagonist,
    nextWeek,
    gForStageYear.schoolState.universityWeek ?? 0,
  );
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

  // ── 6. 시험 이벤트 처리 ────────────────────────────────────────────────────
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

  // ── 7. 메신저 아크 처리 (contactDefs 순회, 아크 트리거 조건 판정)
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
        break;  // 주당 1개 아크에만 반응
      }
    }
  }

  // ── 8. 진로 선택 이벤트 (고3 W50) ──────────────────────────────────────────
  const gLatest = get(gameStore);
  if (
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 &&
    weekInYear === 50 &&
    !gLatest.schoolState.careerChoiceTriggered
  ) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // ── 8. 진로 결정 이벤트 (고교 W50) ────────────────────────────
  const gDraft = get(gameStore);
  const hasCareerChoicePending = get(seasonStore).pendingActions.some((a) => a.type === "careerChoice" || a.type === "careerChoiceHub");
  const isUnivDraftWeek =
    gDraft.protagonist.careerStage === "university" &&
    careerStageYear === 3 &&
    weekInYear === 52;
  if (isUnivDraftWeek && !gDraft.schoolState.draftTriggered && !get(seasonStore).pendingActions.some((a) => a.type === "draft")) {
    gameStore.markDraftTriggered(true);
    seasonStore.pushPendingAction({ type: "draft" });
  }

  const needHsCareerResult =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 &&
    weekInYear === 51 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    !gDraft.schoolState.fallbackSelectionPending &&
    !hasCareerChoicePending;

  if (needHsCareerResult) {
    const p = gDraft.protagonist;
    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;
    const univChoices = gDraft.schoolState.fallbackUniversityChoices.slice(0, 3);
    const indieChoices = gDraft.schoolState.fallbackIndependentChoices.slice(0, 3);
    const evalUnivPass = (ovr: number, idx: number): boolean => {
      const cutByChoice = [58, 53, 48][idx] ?? 48;
      const score = ovr * 0.62 + avgPct * 0.38;
      if (score < cutByChoice - 8) return false;
      const base = 28 + (score - cutByChoice) * 3.4;
      const chance = Math.max(8, Math.min(94, base));
      return Math.random() * 100 < chance;
    };
    const evalIndiePass = (ovr: number, idx: number): boolean => {
      const cutByChoice = [52, 48, 44][idx] ?? 44;
      if (ovr < cutByChoice - 10) return false;
      const base = 36 + (ovr - cutByChoice) * 3.2;
      const chance = Math.max(12, Math.min(96, base));
      return Math.random() * 100 < chance;
    };
    const evalSportsMilitaryPass = (ovr: number): boolean => {
      if (ovr < 56) return false;
      const base = 22 + (ovr - 56) * 2.1;
      const chance = Math.max(6, Math.min(84, base));
      return Math.random() * 100 < chance;
    };
    const univPassed = univChoices.filter((id, i) => evalUnivPass(p.pitching.ovr, i));
    const indiePassed = indieChoices.filter((id, i) => evalIndiePass(p.pitching.ovr, i));
    const sportsPassed = evalSportsMilitaryPass(p.pitching.ovr);

    gameStore.setFallbackAdmissions({
      universityChoices: univChoices,
      independentChoices: indieChoices,
      universityPassed: univPassed,
      independentPassed: indiePassed,
      sportsMilitaryPassed: sportsPassed,
      draftPassed: false,
      draftTeamId: null,
      draftRound: null,
      draftPick: null,
      draftSigningBonus: 0,
    });

    if (gDraft.schoolState.draftIntent) {
      gameStore.addMessage({
        id: `msg-hs-draft-invite-${Date.now()}`,
        category: "system",
        sender: "Career Office",
        subject: "W51 드래프트 참가 안내",
        preview: "W51주 드래프트에 참가하시겠습니까?",
        body: "드래프트 참가 신청이 완료되었습니다.\nW51주 드래프트에 참가하시겠습니까?",
        createdAt: `W${nextWeek}`,
        readAt: null,
        decision: {
          prompt: "W51주 드래프트에 참가하시겠습니까?",
          options: [
            { id: "join_draft", label: "참가", effectHint: "드래프트 진행" },
            { id: "skip_draft", label: "불참", effectHint: "드래프트 제외 후 진로 선택" },
          ],
          selectedOptionId: null,
        },
      });
    } else {
      seasonStore.pushPendingAction({ type: "careerChoice" });
      gameStore.addMessage({
        id: `msg-career-result-${Date.now()}`,
        category: "system",
        sender: "Career Office",
        subject: "W51 application results",
        preview: "지원 결과가 도착했습니다. 최종 진로를 선택하세요.",
        body: "지원 결과가 도착했습니다.\n메인 화면에서 최종 진로를 선택하세요.",
        createdAt: `W${nextWeek}`,
        readAt: null,
      });
    }
  }

  const needFallbackChoice =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 &&
    weekInYear >= 51 &&
    gDraft.schoolState.fallbackSelectionPending;
  if (needFallbackChoice && !get(seasonStore).pendingActions.some((a) => a.type === "careerChoice" || a.type === "careerChoiceHub")) {
    seasonStore.pushPendingAction({ type: "careerChoice" });
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

  gameStore.applyWeekResult(growth.protagonistPatch, logs, [], nextWeek, s.seasonYear);
  if (growth.logs.length > 0) {
    gameStore.addMessage(makeTrainingMessage(nextWeek, growth.logs));
  }

  // ── 10. 업적 처리 ──────────────────────────────────────────────────────────
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

  // ── L5: 배경 리그 시뮬레이션 (Worker 비동기) ─────────────────
  await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, get(masterStore).entities);

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

