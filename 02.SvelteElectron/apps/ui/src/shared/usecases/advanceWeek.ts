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
import type { MatchResult, PendingAction, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { ProtagonistSave } from "../types/save";
import { toGameDate, generateHsPostseasonSemis, generateHsPostseasonFinal } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch } from "../utils/pitcherRoleEngine";
import {
  buildKblBracket, buildAblBracket, buildUnivBracket, buildIndBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";

// ── 리그 표시명 ───────────────────────────────────────────────
const LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_HIGHSCHOOL:     "고교 리그",
  LEAGUE_HIGHSCHOOL_NPC: "고교 리그 (타조)",
  LEAGUE_KBL:            "KBL",
  LEAGUE_ABL:            "ABL",
  LEAGUE_UNIVERSITY:     "대학 리그",
  LEAGUE_INDEPENDENT:    "독립 리그",
};

// 월간 순위표를 보낼 리그 목록 (주인공 소속 리그는 별도 처리)
const MONTHLY_STANDINGS_LEAGUES = new Set([
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT", "LEAGUE_HIGHSCHOOL_NPC",
]);

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

async function simulateNpcGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  const entities = get(masterStore).entities;
  if (entities.length > 0) {
    return (await simulateGame(homeTeamId, awayTeamId, entities)).result;
  }
  const fb = JSON.parse(await (window as any).projectB.weekCalcNpcFallback(
    JSON.stringify({ homeTeamId, awayTeamId })
  )) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
  return { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] };
}

export async function simulateProtagonistGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  return simulateNpcGame(homeTeamId, awayTeamId);
}

function calcCareerStageYear(p: ProtagonistSave, seasonWeek: number, universityWeek: number): number {
  if (p.careerStage === "highschool") return Math.max(0, (p.grade ?? 1) - 1);
  if (p.careerStage === "university") return Math.floor(Math.max(0, universityWeek - 1) / 52);
  return Math.floor((seasonWeek - 1) / 52);
}

// 다음 미처리 경기 (gameDate 오름차순)
function nextUnresolvedGame(schedule: ScheduleEntry[]): ScheduleEntry | null {
  const pending = schedule.filter((e) => !e.result);
  if (pending.length === 0) return null;
  return pending.reduce((min, e) => (e.gameDate < min.gameDate ? e : min), pending[0]);
}

// ── 주간 처리 블록 ─────────────────────────────────────────────
// week 경계를 넘을 때 호출: 훈련·이벤트·시험·메신저·진로·업적·배경리그
// 반환: 새로 생긴 logs
async function processWeekBoundary(weekNum: number): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);
  const logs: string[] = [];

  // W1: 투수 포지션/역할 배정 + 시즌 시작 브리핑
  if (weekNum === 1 && g.protagonist.playerType === "pitcher") {
    if (g.protagonist.careerStage === "highschool") {
      // 고교: SP / RP 두 범주만 사용
      const pos = await assignHighschoolPosition(g.protagonist, m.entities);
      const posLabel = pos === "SP" ? "선발 투수" : "중계 투수";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(pos === "SP" ? "1선발" : "중간계투");
      gameStore.addMessage({
        id: `msg-season-brief-${Date.now()}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 보직: ${posLabel}`,
        body: `이번 시즌 당신의 보직은 [${posLabel}]로 배정되었습니다.\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
      });
      logs.push(`[보직 배정] ${posLabel}`);
    } else {
      // 프로(대학·독립 포함): 상세 역할 배정
      const role = await assignProtagonistRole(g.protagonist, m.entities);
      const pos: "SP" | "RP" | "CP" =
        role === "마무리" ? "CP" : isReliefsRole(role) ? "RP" : "SP";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(role);
      gameStore.addMessage({
        id: `msg-season-brief-${Date.now()}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 역할: ${role}`,
        body: `이번 시즌 당신의 역할은 [${role}]로 배정되었습니다.\n\n${ROLE_DESCRIPTION[role]}\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
      });
      logs.push(`[역할 배정] ${role}`);
    }
  }

  const isUniversity = g.protagonist.careerStage === "university";
  const weekInYear   = ((weekNum - 1) % 52) + 1;

  if (isUniversity) gameStore.incrementUniversityWeek();

  const examGainMult  = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult   = applyWeeklyStudy(g.schoolState, examGainMult);
  gameStore.applyWeeklyStudyResult(studyResult);

  const majorEffBonus = isUniversity ? getUniversityEffBonus(g.schoolState.universityMajor) : 0;

  const pitchCoach = m.entities.find(
    (e) => e.role === "coach" && e.teamId === g.protagonist.teamId &&
           (e.details as import("../stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  const coachTeaching  = (pitchCoach?.details as import("../stores/master").EntityDetails)?.coach?.stats?.teaching ?? 50;
  const coachEffBonus  = Math.max(-0.10, Math.min(0.20, (coachTeaching - 50) * 0.004));
  const teamRef        = m.teams.find((t) => t.id === g.protagonist.teamId);
  const facilityEffMod = JSON.parse(await (window as any).projectB.weekCalcFacilityEff(
    JSON.stringify({ careerStage: g.protagonist.careerStage, teamTier: teamRef?.tier ?? null })
  )) as number;

  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpPenalty       = newLowMoraleWeeks >= 3 ? 0.70 : 1.0;

  const alreadyInjured = !!g.protagonist.injury;
  const injuryCalc = JSON.parse(await (window as any).projectB.weekCalcInjury(JSON.stringify({
    fatigue: g.protagonist.fatigue,
    consecutiveHighFatigueWeeks: g.protagonist.consecutiveHighFatigueWeeks ?? 0,
    hasInjury: alreadyInjured,
    injuryType: g.protagonist.injury?.type ?? null,
    recoveryWeeksLeft: g.protagonist.injury?.recoveryWeeksLeft ?? null,
  }))) as { injuryUpdate: { type: string; recoveryWeeksLeft: number } | null; justOccurred: boolean; justHealed: boolean; effMod: number; newConsecutiveHighFatigueWeeks: number };
  const injuryUpdate = injuryCalc.injuryUpdate as ProtagonistSave["injury"] | undefined;
  const injuryJustOccurred = injuryCalc.justOccurred;
  const injuryJustHealed   = injuryCalc.justHealed;

  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus + coachEffBonus)
    * facilityEffMod * slumpPenalty * injuryCalc.effMod;

  const growth = await calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  if (newLowMoraleWeeks >= 3) growth.logs.push(`[슬럼프] 사기 저하 ${newLowMoraleWeeks}주 연속 — 훈련 효율 -30%`);
  if (coachEffBonus > 0.01) growth.logs.push(`[코치] 투수 코치 지도 보너스 +${Math.round(coachEffBonus * 100)}%`);
  if (injuryJustOccurred && injuryUpdate) {
    const label = injuryUpdate.type === "moderate" ? "중상" : "경상";
    growth.logs.push(`[부상] ${label} 발생 — ${injuryUpdate.recoveryWeeksLeft}주 회복 필요`);
  } else if (alreadyInjured && !injuryJustHealed && injuryUpdate) {
    growth.logs.push(`[부상] 회복 중 (${injuryUpdate.recoveryWeeksLeft}주 남음) — 훈련 효율 -80%`);
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  }
  if (studyResult.efficiencyMod < 1.0) {
    growth.logs.push(`[학업] 주간 효율 ${Math.round(studyResult.efficiencyMod * 100)}%`);
  }

  growth.protagonistPatch.consecutiveLowMoraleWeeks  = newLowMoraleWeeks;
  growth.protagonistPatch.consecutiveHighFatigueWeeks = injuryCalc.newConsecutiveHighFatigueWeeks;
  growth.protagonistPatch.injury                      = injuryUpdate;

  const weeklyNet = JSON.parse(await (window as any).projectB.weekCalcWeeklyNet(
    JSON.stringify({ careerStage: g.protagonist.careerStage, salary: g.protagonist.contract?.salary ?? null })
  )) as number;
  gameStore.applyMoneyChange(weeklyNet);
  gameStore.recordTrainingWeek();

  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter  = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  if (ovrAfter > ovrBefore) gameStore.updateScoutScore(Math.min(3, Math.max(1, ovrAfter - ovrBefore)));

  gameStore.applyWeekResult(growth.protagonistPatch, growth.logs, [], weekNum, s.seasonYear);
  if (growth.logs.length > 0) gameStore.addMessage(makeTrainingMessage(weekNum, growth.logs));
  logs.push(...growth.logs);

  // 이벤트 엔진
  const gForEvent = get(gameStore);
  const sForEvent = get(seasonStore);
  const careerStageYear = calcCareerStageYear(gForEvent.protagonist, weekNum, gForEvent.schoolState.universityWeek ?? 0);
  const eventCtx: EventContext = {
    protagonist:     gForEvent.protagonist,
    currentWeek:     weekNum,
    seasonPhase:     sForEvent.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    standings:       sForEvent.standings,
    stats:           sForEvent.stats,
    triggeredEvents: sForEvent.triggeredEvents,
  };
  const evResult = runEventEngine(
    m.eventRules, m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx, sForEvent.seasonYear, careerStageYear,
  );
  for (const action of evResult.pendingActions) seasonStore.pushPendingAction(action);
  for (const msg of evResult.newMessages) gameStore.addMessage(msg);
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);

  // 시험 이벤트
  const gAfterStudy = get(gameStore);
  const triggeredExamId = Object.keys(evResult.updatedTriggers).find((id) => EXAM_EVENT_IDS.has(id));
  if (triggeredExamId && (g.protagonist.careerStage === "highschool" || g.protagonist.careerStage === "university")) {
    const examType = triggeredExamId === "EVT_HS_MIDTERM" ? "midterm" : "final";
    const examRes  = await calcExamResult(gAfterStudy.schoolState.examAccumScore, gAfterStudy.schoolState.warningCount, examType);
    gameStore.applyExamResult(examRes);
    gameStore.addMessage(makeExamMessage(weekNum, examRes.messageSubject, examRes.messageBody));
    logs.push(`[시험] ${examRes.messageSubject}`);
  }

  // 메신저 아크
  {
    const gCur = get(gameStore);
    const contactMap = new Map(gCur.contacts.map((c) => [c.id, c]));
    for (const def of m.contactDefs) {
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
        break;
      }
    }
  }

  // 고3 진로 선택 이벤트 (W50)
  const gLatest = get(gameStore);
  if (
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 && weekInYear === 50 &&
    !gLatest.schoolState.careerChoiceTriggered
  ) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // 대학 졸업반 드래프트 이벤트 (W52)
  const gDraft = get(gameStore);
  const hasCareerChoicePending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub"
  );
  const isUnivDraftWeek =
    gDraft.protagonist.careerStage === "university" &&
    careerStageYear === 3 && weekInYear === 52;
  if (isUnivDraftWeek && !gDraft.schoolState.draftTriggered &&
      !get(seasonStore).pendingActions.some((a) => a.type === "draft")) {
    gameStore.markDraftTriggered(true);
    seasonStore.pushPendingAction({ type: "draft" });
  }

  // 고교 W51 지원 결과
  const needHsCareerResult =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear === 51 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    !gDraft.schoolState.fallbackSelectionPending &&
    !hasCareerChoicePending;
  if (needHsCareerResult) {
    const p = gDraft.protagonist;
    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;
    const univChoices = gDraft.schoolState.fallbackUniversityChoices.slice(0, 3);
    const indieChoices = gDraft.schoolState.fallbackIndependentChoices.slice(0, 3);
    const admissionsCalc = JSON.parse(await (window as any).projectB.weekCalcHsAdmissions(JSON.stringify({
      ovr: p.pitching.ovr, avgPct, univChoices, indieChoices,
    }))) as { univPassed: string[]; indiePassed: string[]; sportsPassed: boolean };
    const univPassed  = admissionsCalc.univPassed;
    const indiePassed = admissionsCalc.indiePassed;
    const sportsPassed = admissionsCalc.sportsPassed;
    gameStore.setFallbackAdmissions({
      universityChoices: univChoices, independentChoices: indieChoices,
      universityPassed: univPassed,   independentPassed: indiePassed,
      sportsMilitaryPassed: sportsPassed,
      draftPassed: false, draftTeamId: null, draftRound: null, draftPick: null, draftSigningBonus: 0,
    });
    if (gDraft.schoolState.draftIntent) {
      gameStore.addMessage({
        id: `msg-hs-draft-invite-${Date.now()}`,
        category: "system", sender: "Career Office",
        subject: "W51 드래프트 참가 안내",
        preview: "W51주 드래프트에 참가하시겠습니까?",
        body: "드래프트 참가 신청이 완료되었습니다.\nW51주 드래프트에 참가하시겠습니까?",
        createdAt: `W${weekNum}`, readAt: null,
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
        category: "system", sender: "Career Office",
        subject: "W51 application results",
        preview: "지원 결과가 도착했습니다. 최종 진로를 선택하세요.",
        body: "지원 결과가 도착했습니다.\n메인 화면에서 최종 진로를 선택하세요.",
        createdAt: `W${weekNum}`, readAt: null,
      });
    }
  }

  const needFallbackChoice =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear >= 51 &&
    gDraft.schoolState.fallbackSelectionPending;
  if (needFallbackChoice && !get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub"
  )) {
    seasonStore.pushPendingAction({ type: "careerChoice" });
  }

  // 프로 트레이드 판정
  const gTrade = get(gameStore);
  if (
    (gTrade.protagonist.careerStage === "pro_kbl" || gTrade.protagonist.careerStage === "pro_abl") &&
    gTrade.protagonist.contract && !get(seasonStore).pendingActions.some((a) => a.type === "trade")
  ) {
    const myStats = (get(seasonStore).stats[gTrade.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
    const myEra = myStats?.era ?? 4.2;
    const standings = get(seasonStore).standings;
    const myRank = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
      .findIndex((sRow) => sRow.teamId === gTrade.protagonist.teamId) + 1;
    const sameLeagueTeams = m.teams
      .filter((t) => t.leagueId === gTrade.protagonist.leagueId && t.id !== gTrade.protagonist.teamId)
      .map((t) => t.id);
    if (sameLeagueTeams.length > 0) {
      const tradeCalc = JSON.parse(await (window as any).projectB.weekCalcTradeRumor(JSON.stringify({
        era: myEra, myRank, totalTeams: standings.length, weekInYear, sameLeagueTeams,
      }))) as { shouldTrigger: boolean; toTeamId: string | null };
      if (tradeCalc.shouldTrigger && tradeCalc.toTeamId) {
        seasonStore.pushPendingAction({
          type: "event", eventId: "EVT_TRADE_RUMOR",
          title: "트레이드 루머",
          description: "타 구단에서 관심을 보이고 있다는 소문이 돌고 있습니다.",
          choices: [{ id: "ok", label: "확인" }],
        });
        seasonStore.pushPendingAction({ type: "trade", fromTeamId: gTrade.protagonist.teamId, toTeamId: tradeCalc.toTeamId });
      }
    }
  }

  // 업적 체크
  const gFinal  = get(gameStore);
  const sFinal  = get(seasonStore);
  const mFinal  = get(masterStore);
  const metrics = computeMetrics(gFinal.achievementMetrics, gFinal.mailbox, sFinal.standings, sFinal.schedule, gFinal.protagonist.teamId);
  const achResult = checkAchievements(mFinal.achievements, gFinal.achievements, metrics, `W${weekNum}`);
  if (achResult.newlyUnlocked.length > 0 ||
      achResult.updatedRuntime.some((r, i) => r.progress !== gFinal.achievements[i]?.progress)) {
    gameStore.applyAchievementCheck(achResult);
  }

  // ── 배경 리그 시뮬레이션 (await — 월간 메시지 전 완료 보장) ────
  const bgEntities = get(masterStore).entities;
  seasonStore.applyWeeklyConditionRecovery(bgEntities);
  await seasonStore.simulateBackgroundLeaguesAsync(weekNum, gFinal.protagonist.leagueId, bgEntities);

  // 주차 → 월 레이블 헬퍼
  function weekToMonthLabel(wk: number): string {
    const d = new Date(`${sFinal.seasonYear}-03-01`);
    d.setDate(d.getDate() + (wk - 1) * 7);
    return `${d.getMonth() + 1}월`;
  }

  // ── 주인공 리그 전주 NPC 경기 결과 메시지 ─────────────────────
  if (weekNum > 1) {
    const sAfterSim = get(seasonStore);
    const isHighschool = gFinal.protagonist.careerStage === "highschool";
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));

    if (isHighschool) {
      const protagonistIsA = sAfterSim.hsGroupA.includes(gFinal.protagonist.teamId);
      const myGroupLabel  = protagonistIsA ? "A조" : "B조";
      const npcGroupLabel = protagonistIsA ? "B조" : "A조";

      const myGames  = sAfterSim.schedule.filter((e) => e.week === weekNum - 1 && !e.isProtagonistGame && !!e.result);
      const npcGames = (sAfterSim.leagueSchedules["LEAGUE_HIGHSCHOOL_NPC"] ?? []).filter(
        (e) => e.week === weekNum - 1 && !!e.result,
      );

      if (myGames.length > 0 || npcGames.length > 0) {
        const toLine = (e: { homeTeamId: string; awayTeamId: string; result?: import("../types/season").MatchResult }) => {
          const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
          const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
          const r = e.result!;
          return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
        };
        const parts: string[] = [];
        if (myGames.length > 0)  parts.push(`[${myGroupLabel}]\n${myGames.map(toLine).join("\n")}`);
        if (npcGames.length > 0) parts.push(`[${npcGroupLabel}]\n${npcGames.map(toLine).join("\n")}`);
        const body = parts.join("\n\n");
        const monthLabel = weekToMonthLabel(weekNum - 1);
        gameStore.addMessage({
          id: `msg-league-results-w${weekNum - 1}-${Date.now()}`,
          category: "system",
          sender: "리그 사무국",
          subject: `${monthLabel} 고교 리그 경기 결과`,
          preview: body.split("\n")[1] ?? "",
          body,
          createdAt: `W${weekNum}`,
          readAt: null,
        });
      }
    } else {
      const myGames = sAfterSim.schedule.filter((e) => e.week === weekNum - 1 && !e.isProtagonistGame && !!e.result);
      if (myGames.length > 0) {
        const leagueName = LEAGUE_NAMES[gFinal.protagonist.leagueId] ?? gFinal.protagonist.leagueId;
        const monthLabel = weekToMonthLabel(weekNum - 1);
        const lines = myGames.map((e) => {
          const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
          const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
          const r = e.result!;
          return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
        });
        gameStore.addMessage({
          id: `msg-league-results-w${weekNum - 1}-${Date.now()}`,
          category: "system",
          sender: "리그 사무국",
          subject: `${monthLabel} ${leagueName} 경기 결과`,
          preview: lines[0] ?? "",
          body: lines.join("\n"),
          createdAt: `W${weekNum}`,
          readAt: null,
        });
      }
    }
  }

  // ── 타 리그 월간 순위표 메시지 (4주마다) ──────────────────────
  if (weekInYear % 4 === 0) {
    const sAfterSim = get(seasonStore);
    const myLeagueId = gFinal.protagonist.leagueId;
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    const protagonistIsA = sAfterSim.hsGroupA.includes(gFinal.protagonist.teamId);
    const monthLabel = weekToMonthLabel(weekNum);

    for (const [lid, ls] of Object.entries(sAfterSim.leagueState)) {
      if (lid === myLeagueId) continue;
      if (!MONTHLY_STANDINGS_LEAGUES.has(lid)) continue;
      if (lid === "LEAGUE_HIGHSCHOOL_NPC" && gFinal.protagonist.careerStage !== "highschool") continue;
      const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
      if (sorted.length === 0) continue;
      if (!sorted.some((s) => s.wins + s.losses + s.draws > 0)) continue;
      const lgSchedule = sAfterSim.leagueSchedules[lid] ?? [];
      const lastGameWeek = lgSchedule.reduce((mx, e) => Math.max(mx, e.week), 0);
      if (lastGameWeek > 0 && weekInYear > lastGameWeek) continue;

      const leagueName = lid === "LEAGUE_HIGHSCHOOL_NPC"
        ? (protagonistIsA ? "B조" : "A조")
        : (LEAGUE_NAMES[lid] ?? lid);

      const lines = sorted.map((st, i) => {
        const name = teamById.get(st.teamId) ?? st.teamId;
        const pct = String(Math.round(st.winPct * 1000)).padStart(3, "0");
        return `${i + 1}위  ${name}  ${st.wins}승 ${st.losses}패  .${pct}  ${st.streak}`;
      });
      gameStore.addMessage({
        id: `msg-standings-${lid}-w${weekNum}-${Date.now()}`,
        category: "system",
        sender: "리그 사무국",
        subject: `[${leagueName}] ${monthLabel} 순위표`,
        preview: lines[0] ?? "",
        body: `── ${leagueName} 순위 (${monthLabel}) ──\n${lines.join("\n")}`,
        createdAt: `W${weekNum}`,
        readAt: null,
      });
    }
  }

  return logs;
}

// ── 시즌 종료 처리 ────────────────────────────────────────────
async function handleSeasonEnd(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const g = get(gameStore);

  // 군 복무 종료
  if (g.protagonist.careerStage === "military") {
    gameStore.completeMilitaryService();
    const contract = g.protagonist.contract;
    if (contract) {
      const action: PendingAction = {
        type: "salaryNegotiation",
        teamId: contract.teamId, leagueId: contract.leagueId,
        offeredSalary: contract.salary,
        durationYears: Math.max(1, contract.remainingYears),
        signingBonus: 0,
      };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["전역: 복귀 계약 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    return { processedWeek: s.currentWeek, logs: ["전역 완료"], newMessages: [], matchResults: [], stoppedBy: null };
  }

  const isProStage = g.protagonist.careerStage === "pro_kbl" || g.protagonist.careerStage === "pro_abl";
  const hasOptionPending = s.pendingActions.some((a) => a.type === "optionClause");
  const hasSalaryPending = s.pendingActions.some((a) => a.type === "salaryNegotiation");

  if (isProStage && g.protagonist.contract && !hasOptionPending && !hasSalaryPending) {
    gameStore.applySeasonContractProgress();
    const gAfter   = get(gameStore);
    const contract = gAfter.protagonist.contract;
    if (!contract) return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };

    const myStats      = (s.stats[g.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
    const seasonRating = await calcSeasonRating(myStats);
    const offeredSalary = await calcOfferedSalaryForProtagonist(g.protagonist, myStats);

    if (contract.remainingYears === 0) {
      if (contract.teamOptionYears > 0) {
        const exercised = seasonRating >= 60;
        const action: PendingAction = { type: "optionClause", optionType: "team", exercised, nextSalary: offeredSalary };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 팀 옵션 조항이 처리됩니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      if (contract.playerOptionYears > 0) {
        const action: PendingAction = { type: "optionClause", optionType: "player", exercised: false, nextSalary: offeredSalary };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 선수 옵션 선택이 필요합니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      if (isFaEligible(g.protagonist, g.schoolState.attendsUniversity)) {
        const action: PendingAction = { type: "faMarket" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 계약 만료로 FA 시장에 진입합니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      const action: PendingAction = { type: "salaryNegotiation", teamId: contract.teamId, leagueId: contract.leagueId, offeredSalary, durationYears: 1, signingBonus: 0 };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["시즌 종료: FA 자격 미충족으로 연봉 협상을 진행합니다."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    const action: PendingAction = { type: "salaryNegotiation", teamId: contract.teamId, leagueId: contract.leagueId, offeredSalary, durationYears: Math.max(1, contract.remainingYears), signingBonus: 0 };
    seasonStore.pushPendingAction(action);
    return { processedWeek: s.currentWeek, logs: ["시즌 종료: 연봉 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
  }

  return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };
}

// ── HS 포스트시즌 주입 ─────────────────────────────────────────
async function injectHsPostseason(nextWeek: number): Promise<void> {
  const g  = get(gameStore);
  const sPS = get(seasonStore);

  const lastSeasonWeek = sPS.schedule.reduce(
    (mx, e) => (e.phase === "season" ? Math.max(mx, e.week) : mx), 0
  );
  const hasPostseason = sPS.schedule.some((e) => e.phase === "postseason");

  if (!hasPostseason && nextWeek > lastSeasonWeek && lastSeasonWeek > 0) {
    const sortedStandings = [...sPS.standings].sort(
      (a, b) => b.winPct - a.winPct || (b.wins - b.losses) - (a.wins - a.losses)
    );
    const top4 = sortedStandings.slice(0, 4).map((st) => st.teamId);
    if (top4.length >= 4) {
      const semis = await generateHsPostseasonSemis(top4, g.protagonist.teamId, nextWeek, sPS.seasonYear);
      seasonStore.injectPostseasonEntries(semis);
    }
  } else if (hasPostseason) {
    const semiEntries = sPS.schedule.filter((e) => e.phase === "postseason" && e.id.startsWith("PS_SEMI"));
    const allSemisResolved = semiEntries.length >= 2 && semiEntries.every((e) => !!e.result);
    const hasFinal = sPS.schedule.some((e) => e.id.startsWith("PS_FINAL"));
    if (allSemisResolved && !hasFinal) {
      const semi1 = semiEntries.find((e) => e.id.startsWith("PS_SEMI1_"));
      const semi2 = semiEntries.find((e) => e.id.startsWith("PS_SEMI2_"));
      if (semi1?.result && semi2?.result) {
        const finalWeek = Math.max(semi1.week, semi2.week) + 1;
        seasonStore.injectPostseasonEntries([
          await generateHsPostseasonFinal(semi1.result.winnerId, semi2.result.winnerId, g.protagonist.teamId, finalWeek, sPS.seasonYear)
        ]);
      }
    }
  }
}

// ── 통합 포스트시즌 주입 (KBL / ABL / UNIV / IND) ───────────────
// 매 게임 처리 후 호출. 정규시즌 종료 감지 → 브라켓 초기화 → 다음 경기 주입
async function injectLeaguePostseason(nextWeek: number): Promise<void> {
  const s   = get(seasonStore);
  const g   = get(gameStore);
  const leagueId      = g.protagonist.leagueId;
  const protagonistId = g.protagonist.teamId;
  const seasonYear    = s.seasonYear;

  const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"];
  if (!SUPPORTED.includes(leagueId)) return;

  // 정규시즌 경기가 남아 있으면 아직 아님
  if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;

  const bracket = s.postseasonBrackets?.[leagueId] ?? null;

  // ── 브라켓 미초기화: 빌드 후 비주인공 시리즈 즉시 시뮬 ──────
  if (!bracket) {
    let built: import("../types/season").PostseasonSeries[];
    if (leagueId === "LEAGUE_KBL") built = await buildKblBracket(s.standings);
    else if (leagueId === "LEAGUE_UNIVERSITY") built = await buildUnivBracket(s.standings);
    else if (leagueId === "LEAGUE_INDEPENDENT") built = await buildIndBracket(s.standings);
    else if (leagueId === "LEAGUE_ABL") {
      const east = s.ablEastTeams ?? [];
      const west = s.ablWestTeams ?? [];
      const eastSt = s.standings.filter((st) => east.includes(st.teamId));
      const westSt = s.standings.filter((st) => west.includes(st.teamId));
      built = await buildAblBracket(eastSt, westSt);
    } else {
      return;
    }
    if (built.length === 0) return;
    built = await resolveNonProtagonistSeries(built, protagonistId);
    seasonStore.initPostseasonBracket(leagueId, built);
    return; // 다음 루프 이터레이션에서 경기 주입
  }

  // ── 주인공 팀이 참여하는 활성 시리즈 탐색 ───────────────────
  const activeSeries = bracket.find(
    (ser) =>
      !ser.winner &&
      ser.homeTeamId !== "" &&
      ser.awayTeamId !== "" &&
      (ser.homeTeamId === protagonistId || ser.awayTeamId === protagonistId),
  );

  if (!activeSeries) {
    // 주인공 팀 탈락 or 포스트시즌 완료 — 남은 비주인공 시리즈 자동 처리
    const hasUnresolved = bracket.some(
      (ser) => !ser.winner && ser.homeTeamId !== "" && ser.awayTeamId !== "",
    );
    if (hasUnresolved) {
      seasonStore.updatePostseasonBracket(
        leagueId,
        await resolveNonProtagonistSeries(bracket, protagonistId),
      );
    }
    return;
  }

  // ── 다음 경기 주입 여부 확인 ────────────────────────────────
  const gNum  = nextGameNum(activeSeries);
  const gId   = `${activeSeries.id}_G${gNum}`;
  if (s.schedule.some((e) => e.id === gId)) return; // 이미 주입됨

  const game = await makeSeriesGame(activeSeries, gNum, nextWeek, protagonistId, seasonYear);
  seasonStore.injectPostseasonEntries([game]);
}

// ── 포스트시즌 경기 결과 → 브라켓 업데이트 ──────────────────────
async function applyPostseasonResult(scheduleId: string, result: MatchResult): Promise<void> {
  const match = scheduleId.match(/^(.+)_G(\d+)$/);
  if (!match) return;
  const seriesId = match[1];

  const s        = get(seasonStore);
  const g        = get(gameStore);
  const leagueId = g.protagonist.leagueId;
  const bracket  = s.postseasonBrackets?.[leagueId];
  if (!bracket) return;

  const idx = bracket.findIndex((ser) => ser.id === seriesId);
  if (idx < 0) return;

  const updated = await applyGameToSeries(bracket[idx], result.winnerId);
  let newBracket = bracket.map((ser, i) => (i === idx ? updated : ser));

  if (updated.winner) {
    newBracket = await fillNextSeries(newBracket, updated);
    newBracket = await resolveNonProtagonistSeries(newBracket, g.protagonist.teamId);
  }

  seasonStore.updatePostseasonBracket(leagueId, newBracket);
}

// ══════════════════════════════════════════════════════════════
// advanceWeek — "다음 이벤트까지 자동 진행"
// · 군 복무: 주 1단위 진행 (기존 동일)
// · 일반 시즌: NPC 경기 자동 처리 후 주인공 경기·이벤트에서 정지
// ══════════════════════════════════════════════════════════════
export async function advanceWeek(): Promise<WeekAdvanceResult> {
  const accLogs: string[]       = [];
  const accResults: MatchResult[] = [];

  // ── 군 복무 특수 처리 (주 1단위 반환) ────────────────────────
  {
    const s = get(seasonStore);
    const g = get(gameStore);

    if (g.protagonist.careerStage === "military") {
      // 시즌 종료 시 전역 처리
      if (s.currentWeek + 1 > s.totalWeeks) {
        const result = await handleSeasonEnd();
        gameStore.save(); seasonStore.save();
        return result;
      }

      const nextWeek = s.currentWeek + 1;
      seasonStore.advanceWeek();
      seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeek, 0));

      gameStore.advanceMilitaryWeek();
      const isSportsUnit = g.protagonist.militaryUnit === "sports";
      const militaryEvents = get(masterStore).militaryEvents;
      const milCalc = JSON.parse(await (window as any).projectB.weekCalcMilitary(JSON.stringify({
        isSportsUnit,
        stamina:  g.protagonist.pitching.stamina,
        recovery: g.protagonist.pitching.recovery,
        command:  g.protagonist.pitching.command,
        control:  g.protagonist.pitching.control,
        morale:   g.protagonist.morale,
        fatigue:  g.protagonist.fatigue,
        militaryEventCount: militaryEvents.length,
      }))) as { stamina: number; recovery: number; command: number; control: number; morale: number; fatigue: number; eventIndex: number | null };
      if (milCalc.eventIndex !== null) {
        const evt = militaryEvents[milCalc.eventIndex];
        seasonStore.pushPendingAction({
          type: "event", eventId: evt.id, title: evt.title, description: evt.description,
          choices: [{ id: "ok", label: "확인", effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 } }],
        });
      }
      const pitching = {
        ...g.protagonist.pitching,
        stamina: milCalc.stamina, recovery: milCalc.recovery,
        command: milCalc.command, control: milCalc.control,
      };
      gameStore.applyWeekResult(
        { morale: milCalc.morale, fatigue: milCalc.fatigue, pitching },
        [isSportsUnit ? "군 복무(체육부대): 훈련 루틴 유지" : "군 복무(일반부대): 기본 근무 수행"],
        [], nextWeek, s.seasonYear,
      );
      const milEntities = get(masterStore).entities;
      seasonStore.applyWeeklyConditionRecovery(milEntities);
      await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, milEntities);
      gameStore.save(); seasonStore.save();

      const pending = get(seasonStore).pendingActions;
      return {
        processedWeek: nextWeek,
        logs: [isSportsUnit ? "군 복무(체육부대)" : "군 복무(일반부대)"],
        newMessages: [],
        matchResults: [],
        stoppedBy: pending.length > 0 ? pending[0] : null,
      };
    }
  }

  // ── 미결정 메시지 확인 ────────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const unresolvedMsg = g.mailbox.find((m) => m.decision && m.decision.selectedOptionId === null);
    if (unresolvedMsg) {
      const action: PendingAction = { type: "message", messageId: unresolvedMsg.id };
      if (!s.pendingActions.some((a) => a.type === "message" && a.messageId === unresolvedMsg.id)) {
        seasonStore.pushPendingAction(action);
      }
      return { processedWeek: s.currentWeek, logs: [], newMessages: [], matchResults: [], stoppedBy: action };
    }
  }

  // ── 군입대 나이 체크 ──────────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const hasMilitaryPending = s.pendingActions.some((a) => a.type === "militaryEnlist");
    if (!hasMilitaryPending && g.protagonist.careerStage !== "military" &&
        g.protagonist.age >= 28 &&
        (g.protagonist.careerStage === "pro_kbl" || g.protagonist.careerStage === "pro_abl" || g.protagonist.careerStage === "independent")) {
      const action: PendingAction = { type: "militaryEnlist" };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["입영 대상: 군 복무 진행이 필요합니다."], newMessages: [], matchResults: [], stoppedBy: action };
    }
  }

  // ── 메인 루프: NPC 경기 자동 처리 → 주인공 경기에서 정지 ───────
  while (true) {
    const s = get(seasonStore);
    const g = get(gameStore);

    // 기존 pending actions 있으면 즉시 반환
    if (s.pendingActions.length > 0) {
      gameStore.save(); seasonStore.save();
      return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: s.pendingActions[0] };
    }

    // 다음 미처리 경기 탐색
    const nextGame = nextUnresolvedGame(s.schedule);

    // 시즌 종료 판정: 더 이상 경기가 없거나 totalWeeks 초과
    if (!nextGame || s.currentWeek >= s.totalWeeks) {
      // totalWeeks에 아직 도달하지 않았고 경기도 없으면 주차 전진
      if (!nextGame && s.currentWeek < s.totalWeeks) {
        const nextWeekNum = s.currentWeek + 1;
        seasonStore.advanceWeek();
        seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeekNum, 0));
        const weekLogs = await processWeekBoundary(nextWeekNum);
        accLogs.push(...weekLogs);
        gameStore.save(); seasonStore.save();
        const pending = get(seasonStore).pendingActions;
        if (pending.length > 0) {
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: pending[0] };
        }
        continue;
      }
      const result = await handleSeasonEnd();
      gameStore.save(); seasonStore.save();
      return { ...result, logs: [...accLogs, ...result.logs], matchResults: [...accResults, ...result.matchResults] };
    }

    // 주 경계 처리: nextGame.week까지 필요한 주차를 모두 전진
    let currentWeekNum = s.currentWeek;
    while (currentWeekNum < nextGame.week) {
      const nextWeekNum = currentWeekNum + 1;
      seasonStore.advanceWeek();
      seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeekNum, 0));

      // 전역 회복 / 이적 적응 처리
      {
        const gInner = get(gameStore);
        if ((gInner.protagonist.militaryRecoveryWeeks ?? 0) > 0) {
          gameStore.advanceMilitaryRecoveryWeek();
          gameStore.applyWeekResult(
            { condition: Math.min(100, gInner.protagonist.condition + 2), fatigue: Math.max(0, gInner.protagonist.fatigue - 3) },
            ["전역 후 재활 진행"], [], nextWeekNum, s.seasonYear,
          );
        }
        if ((gInner.protagonist.tradeAdaptationWeeks ?? 0) > 0) {
          gameStore.advanceTradeAdaptationWeek();
          gameStore.applyWeekResult(
            { condition: Math.max(0, gInner.protagonist.condition - 2), morale: Math.max(0, gInner.protagonist.morale - 2) },
            ["이적 적응 기간: 컨디션/사기 패널티 적용"], [], nextWeekNum, s.seasonYear,
          );
        }
      }

      const weekLogs = await processWeekBoundary(nextWeekNum);
      accLogs.push(...weekLogs);
      currentWeekNum = nextWeekNum;

      const sAfterWeek = get(seasonStore);
      if (sAfterWeek.pendingActions.length > 0) {
        gameStore.save(); seasonStore.save();
        return { processedWeek: currentWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: sAfterWeek.pendingActions[0] };
      }
    }

    // 현재 날짜를 경기 날짜로 업데이트
    seasonStore.setCurrentDate(nextGame.gameDate);

    // 포스트시즌 주입 (리그별 분기)
    if (g.protagonist.careerStage === "highschool") {
      await injectHsPostseason(nextGame.week);
    } else {
      await injectLeaguePostseason(nextGame.week);
    }

    // injectLeaguePostseason이 새 경기를 주입했을 수 있으므로 re-fetch
    {
      const sAfterInject = get(seasonStore);
      const injectedGame = sAfterInject.schedule.find(
        (e) => !e.result && e.phase === "postseason" && e.gameDate >= nextGame.gameDate,
      );
      // 방금 주입된 경기가 아직 결과 없는 nextGame 바로 뒤라면 루프 계속
      if (injectedGame && injectedGame.id !== nextGame.id && nextGame.result) continue;
    }

    // 불펜 등판 판정: 주인공 팀 NPC 경기에서 불펜 역할이면 확률적으로 등판
    const currentRole = g.protagonist.currentRole;
    const isTeamGame =
      nextGame.homeTeamId === g.protagonist.teamId ||
      nextGame.awayTeamId === g.protagonist.teamId;
    const relieverPitching =
      !nextGame.isProtagonistGame &&
      isTeamGame &&
      g.protagonist.playerType === "pitcher" &&
      !!currentRole &&
      isReliefsRole(currentRole) &&
      await relieverWouldPitch(currentRole);

    // 경기 처리
    if (nextGame.isProtagonistGame || relieverPitching) {
      const eligibilityBlocked = g.schoolState.eligibilityBlocked;
      if (eligibilityBlocked) {
        gameStore.clearEligibilityBlock();
        const result = await simulateNpcGame(nextGame.homeTeamId, nextGame.awayTeamId);
        seasonStore.applyMatchResult(nextGame.id, result);
        await applyPostseasonResult(nextGame.id, result);
        accResults.push(result);
        accLogs.push("학사 경고로 인해 경기 출전 불가");
      } else {
        const action: PendingAction = { type: "game", scheduleId: nextGame.id };
        seasonStore.pushPendingAction(action);
        gameStore.save(); seasonStore.save();
        return { processedWeek: get(seasonStore).currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: action };
      }
    } else {
      // NPC 경기 자동 처리
      const result = await simulateNpcGame(nextGame.homeTeamId, nextGame.awayTeamId);
      seasonStore.applyMatchResult(nextGame.id, result);
      applyPostseasonResult(nextGame.id, result);
      accResults.push(result);
      accLogs.push(`${nextGame.homeTeamId} ${result.homeScore}:${result.awayScore} ${nextGame.awayTeamId}`);
    }
  }
}
