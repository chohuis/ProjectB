import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { autoLog } from "../stores/autoAdvance";
import {
  updateNpcEmotion,
  makeMemory,
  reactivateNpc,
  checkTeamMoodWarning,
} from "../utils/emotionEngine";
import { checkEmotionTriggers, makeReunionMessage } from "../utils/emotionMessageEngine";
import type { WeeklyEmotionContext } from "../utils/emotionEngine";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForStage } from "../utils/rosterEngine";
import { calcTrainingGrowth } from "../utils/growthEngine";
import { applyWeeklyStudy, calcExamResult, getUniversityEffBonus, getUniversityExamGainMult } from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { generateTop10, buildTop10Message, rankEffect } from "../utils/top10Engine";
import { isMonthStart, planMonthlyFriendlies, buildMonthlyNoticeMessage } from "../utils/friendlyMatchEngine";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../utils/salaryEngine";
import { isFaEligible, getFaThreshold } from "../utils/faEngine";
import type { MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { InjurySeverity, InjuryHistoryEntry, InjuryState, InjuryType, NpcMemory, PitchingAttributes, ProtagonistSave } from "../types/save";
import { INJURY_LABEL } from "../types/save";
import { toGameDate } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch } from "../utils/pitcherRoleEngine";
import {
  buildHsBracket, buildKblBracket, buildAblBracket, buildUnivBracket, buildIndBracket, buildJblBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";
import { isV3SlotActive } from "../repo/v3Mode";
import { generateFreshmenV3, ensureLeagueActivatedV3 } from "../repo/slotLifecycleV3";

// ── weekPhases 도메인 모듈 (R4: training·academics·events·games·injuries·growth·market·digest) ──
import { getPitchCoachName, makeTrainingMessage } from "./weekPhases/training";
import { EXAM_EVENT_IDS, makeExamMessage } from "./weekPhases/academics";
import { runEventEngine } from "./weekPhases/events";
import { simulateNpcGame } from "./weekPhases/games";
export { simulateProtagonistGame } from "./weekPhases/games";
import { getPermanentPenalty, processNpcInjuries } from "./weekPhases/injuries";
import { processWeeklyNpcGrowth } from "./weekPhases/growth";
import {
  processTradeWindow,
  processProTeamCallupCalldown,
  processWinNowPressureUpdate,
  processOffseasonNpcDecisions,
  processScoutingImprovement,
  getTeamProfile,
  DEFAULT_TEAM_PROFILE,
} from "./weekPhases/market";
import { buildHsLeagueDigest, LEAGUE_NAMES, MONTHLY_STANDINGS_LEAGUES, HS_DIGEST_WEEKS } from "./weekPhases/digest";

// ── 군입대 대상 판별 (nationality 기반) ──────────────────────
// nationality 없는 구버전 NPC는 originLeagueId로 폴백
function isKoreanMilitaryEligible(
  npc: import("../types/save").NpcSaveState | import("../stores/master").EntityRow,
  npcSave?: import("../types/save").NpcSaveState,
): boolean {
  const nationality = npcSave?.nationality
    ?? (npc as import("../types/save").NpcSaveState).nationality
    ?? ((npc as import("../stores/master").EntityRow).originLeagueId === "LEAGUE_ABL" ? "USA"
      : (npc as import("../stores/master").EntityRow).originLeagueId === "LEAGUE_JBL"  ? "JPN"
      : "KOR");
  return nationality === "KOR";
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

  // W1: 주인공 스냅샷 저장 + NPC 라이브 스탯 초기화 + 신규 입장 NPC 활성화
  if (weekNum === 1) {
    gameStore.saveSeasonStartSnapshot();

    const currentSeasonYear = s.seasonYear;

    if (isV3SlotActive()) {
      // ── v3: 신입생은 Rust 생성 — 진급 후 grade 1이 빈 팀에 채움 ──
      const created = await generateFreshmenV3(currentSeasonYear);
      if (created > 0) logs.push(`[신입생] ${created}명 입학 (Rust 생성)`);
    } else {
    // (레거시) entry_year == currentSeasonYear인 신규 NPC: master.db 직접 조회 (store 미갱신)
    const yearEntrants = await masterStore.fetchEntryEntities(currentSeasonYear);
    if (yearEntrants.length > 0) {
      const { entityToNpcState } = await import("../utils/gradeAdvance");
      // HS 신입생 → gameStore.npcs에 Grade 1으로 추가
      const hsEntrants = yearEntrants.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => (e as any).entryLeague === "LEAGUE_HIGHSCHOOL",
      );
      if (hsEntrants.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newNpcs = hsEntrants.map((e) => entityToNpcState(e as any, currentSeasonYear));
        gameStore.addNpcs(newNpcs);
      }
      // Pro 즉전감 (ABL/JBL) → npcLiveStats 초기화 (팀 배정은 오프시즌 FA 처리)
      const proEntrants = yearEntrants.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => ["LEAGUE_ABL", "LEAGUE_JBL"].includes((e as any).entryLeague ?? ""),
      );
      if (proEntrants.length > 0) seasonStore.initNpcLiveStats(proEntrants);
    }
    }

    // 기존 선수 전체 → npcLiveStats 초기화 (미등록 항목만)
    const currentEntities = get(masterStore).entities;
    seasonStore.initNpcLiveStats(currentEntities, currentSeasonYear);
    // 프로 NPC 초기화: KBL/ABL/JBL 선수가 npcs에 없으면 master.db entities에서 변환·추가
    gameStore.initProNpcsIfMissing(currentEntities, currentSeasonYear);
    seasonStore.snapNpcSeasonStart();
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
  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpPenalty       = newLowMoraleWeeks >= 3 ? 0.70 : 1.0;
  const alreadyInjured     = !!g.protagonist.injury;

  // 훈련 강도 계산: TRN_RECOVERY / TRN_MENTAL_P / TRN_MENTAL_B 제외한 슬롯 비율
  const LOW_INTENSITY_PROGRAMS = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);
  const trnSlots = [g.trainingPlan.primaryProgramId, g.trainingPlan.secondaryProgramId, g.trainingPlan.secondary2ProgramId].filter((id): id is string => !!id);
  const highCount = trnSlots.filter(id => !LOW_INTENSITY_PROGRAMS.has(id)).length;
  const trainingIntensity = trnSlots.length > 0 ? highCount / trnSlots.length : 0;

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(h => h.severity !== "light");
  const randCount = m.eventPools.length + m.eventPools.reduce((s, p) => s + p.maxPicksPerWeek, 0);

  // ── 4개 독립 IPC 병렬 실행 (Phase 3) ──────────────────────────
  const [facilityEffModRaw, injuryCalcRaw, weeklyNetRaw, eventRandsRaw] = await Promise.all([
    window.projectB!.weekCalcFacilityEff(
      JSON.stringify({ careerStage: g.protagonist.careerStage, teamTier: teamRef?.tier ?? null })
    ),
    window.projectB!.weekCalcInjury(JSON.stringify({
      fatigue: g.protagonist.fatigue,
      consecutiveHighFatigueWeeks: g.protagonist.consecutiveHighFatigueWeeks ?? 0,
      hasInjury: alreadyInjured,
      currentInjuryType: g.protagonist.injury?.type ?? null,
      currentSeverity:   g.protagonist.injury?.severity ?? null,
      recoveryWeeksLeft: g.protagonist.injury?.recoveryWeeksLeft ?? null,
      playerType:        g.protagonist.playerType,
      age:               g.protagonist.age,
      condition:         g.protagonist.condition,
      trainingIntensity,
      consecutiveLowMoraleWeeks: g.protagonist.consecutiveLowMoraleWeeks ?? 0,
      hasPriorInjurySameArea,
      priorSteroidUsed: g.protagonist.injury?.steroidUsed ?? false,
    })),
    window.projectB!.weekCalcWeeklyNet(
      JSON.stringify({ careerStage: g.protagonist.careerStage, salary: g.protagonist.contract?.salary ?? null })
    ),
    window.projectB!.weekRollRandomBatch(randCount),
  ]);
  const facilityEffMod = JSON.parse(facilityEffModRaw) as number;
  const injuryCalc = JSON.parse(injuryCalcRaw) as { injuryUpdate: { type: string; severity: string; recoveryWeeksLeft: number } | null; justOccurred: boolean; justHealed: boolean; effMod: number; newConsecutiveHighFatigueWeeks: number; source: string | null };
  const weeklyNet = JSON.parse(weeklyNetRaw) as number;
  const eventRands = JSON.parse(eventRandsRaw) as number[];
  const injuryJustOccurred = injuryCalc.justOccurred;
  const injuryJustHealed   = injuryCalc.justHealed;

  // Rust 출력 → InjuryState 변환
  let injuryState: InjuryState | undefined;
  if (!injuryJustHealed && injuryCalc.injuryUpdate) {
    if (injuryJustOccurred) {
      injuryState = {
        type:               injuryCalc.injuryUpdate.type as InjuryType,
        severity:           injuryCalc.injuryUpdate.severity as InjurySeverity,
        recoveryWeeksLeft:  injuryCalc.injuryUpdate.recoveryWeeksLeft,
        totalRecoveryWeeks: injuryCalc.injuryUpdate.recoveryWeeksLeft,
        permanentPenaltyApplied: false,
        source:             (injuryCalc.source ?? "fatigue") as import("../types/save").InjurySource,
      };
    } else if (alreadyInjured && g.protagonist.injury) {
      injuryState = { ...g.protagonist.injury, recoveryWeeksLeft: injuryCalc.injuryUpdate.recoveryWeeksLeft };
    }
  }

  const SURGERY_REHAB_EFF: Record<number, number> = { 1: 0.00, 2: 0.10, 3: 0.30, 4: 0.60 };
  let effectiveInjuryEffMod = injuryCalc.effMod;
  if (injuryState && injuryState.severity === "surgery") {
    const elapsed = injuryState.totalRecoveryWeeks - injuryState.recoveryWeeksLeft;
    const pct = injuryState.totalRecoveryWeeks > 0 ? elapsed / injuryState.totalRecoveryWeeks : 0;
    const phase: 1 | 2 | 3 | 4 = pct < 0.25 ? 1 : pct < 0.50 ? 2 : pct < 0.75 ? 3 : 4;
    injuryState = { ...injuryState, rehabPhase: phase };
    effectiveInjuryEffMod = SURGERY_REHAB_EFF[phase];
  }

  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus + coachEffBonus)
    * facilityEffMod * slumpPenalty * effectiveInjuryEffMod;

  const growth = await calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  if (newLowMoraleWeeks >= 3) growth.logs.push(`[슬럼프] 사기 저하 ${newLowMoraleWeeks}주 연속 — 훈련 효율 -30%`);
  if (coachEffBonus > 0.01) growth.logs.push(`[코치] 투수 코치 지도 보너스 +${Math.round(coachEffBonus * 100)}%`);
  if (injuryJustOccurred && injuryState) {
    const label = INJURY_LABEL[injuryState.type];
    growth.logs.push(`[부상] ${label} 발생 — ${injuryState.recoveryWeeksLeft}주 회복 필요`);
    if (injuryState.severity === "moderate" || injuryState.severity === "severe") {
      seasonStore.pushPendingAction({
        type: "injuryTreatment",
        injuryType: injuryState.type,
        severity: injuryState.severity,
      });
    }
  } else if (alreadyInjured && !injuryJustHealed && injuryState) {
    growth.logs.push(`[부상] 회복 중 (${injuryState.recoveryWeeksLeft}주 남음) — 훈련 효율 -80%`);
    // 주간 치료비 차감
    const weeklyTreatmentCost: Record<string, number> = {
      conservative: injuryState.severity === "moderate" ? 300_000 : 500_000,
      counseling:   800_000,
    };
    const treatCost = weeklyTreatmentCost[injuryState.treatmentChoice ?? ""] ?? 0;
    if (treatCost > 0) {
      growth.protagonistPatch.money = Math.max(0, (g.protagonist.money ?? 0) - treatCost);
      growth.logs.push(`[치료비] 주간 치료비 ${(treatCost / 10000).toFixed(0)}만원 차감`);
    }
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  }
  if (studyResult.efficiencyMod < 1.0) {
    growth.logs.push(`[학업] 주간 효율 ${Math.round(studyResult.efficiencyMod * 100)}%`);
  }

  growth.protagonistPatch.consecutiveLowMoraleWeeks  = newLowMoraleWeeks;
  growth.protagonistPatch.consecutiveHighFatigueWeeks = injuryCalc.newConsecutiveHighFatigueWeeks;
  growth.protagonistPatch.injury                      = injuryState;

  if (injuryJustHealed && g.protagonist.injury && !g.protagonist.injury.permanentPenaltyApplied) {
    const prevInj = g.protagonist.injury;
    const penalty = getPermanentPenalty(prevInj);
    const penaltyEntries = Object.entries(penalty) as [string, number][];
    if (penaltyEntries.length > 0) {
      const pitching: PitchingAttributes = { ...(growth.protagonistPatch.pitching ?? g.protagonist.pitching) };
      for (const [stat, delta] of penaltyEntries) {
        if (stat in pitching) {
          (pitching as unknown as Record<string, number>)[stat] = Math.max(1, ((pitching as unknown as Record<string, number>)[stat] ?? 0) + delta);
        }
      }
      pitching.ovr = Math.round(
        (pitching.velocity * 2.5 + pitching.command * 2.5 + pitching.control * 2.0
         + pitching.movement * 1.5 + pitching.stamina * 1.5 + pitching.mentality * 1.0
         + pitching.recovery * 0.5 + pitching.clutch * 0.3 + pitching.holdRunners * 0.2) / 12.0
      );
      growth.protagonistPatch.pitching = pitching;
      growth.logs.push(`[부상 후유증] ${INJURY_LABEL[prevInj.type]} 영구 손실 — ${penaltyEntries.map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    const histEntry: InjuryHistoryEntry = {
      type: prevInj.type,
      severity: prevInj.severity,
      year: s.seasonYear,
      week: weekNum,
      treatmentChoice: prevInj.treatmentChoice ?? "rest",
      ...(penaltyEntries.length > 0 ? { permanentLoss: penalty as InjuryHistoryEntry["permanentLoss"] } : {}),
    };
    growth.protagonistPatch.injuryHistory = [...(g.protagonist.injuryHistory ?? []), histEntry];
  }

  const shPrev = g.protagonist.seasonHealth ?? { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 };
  growth.protagonistPatch.seasonHealth = {
    lowConditionWeeks: shPrev.lowConditionWeeks + (g.protagonist.condition < 60 ? 1 : 0),
    highFatigueWeeks:  shPrev.highFatigueWeeks  + (g.protagonist.fatigue  > 70 ? 1 : 0),
    injuryCount:       shPrev.injuryCount        + (injuryJustOccurred    ? 1 : 0),
    totalWeeks:        shPrev.totalWeeks         + 1,
  };

  logs.push(...growth.logs);

  // 훈련 결과 후 주인공 상태 로컬 계산 (store 읽기 없이 이벤트·TOP10 입력 준비)
  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter  = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  const trainingScoutDelta = ovrAfter > ovrBefore ? Math.min(3, Math.max(1, ovrAfter - ovrBefore)) : 0;
  const afterP: ProtagonistSave = { ...g.protagonist, money: Math.max(0, g.protagonist.money + weeklyNet), ...growth.protagonistPatch };
  const coachName = getPitchCoachName(afterP.teamId, m.entities);
  const trainingMsg = makeTrainingMessage(weekNum, growth.logs, afterP, coachName);

  // 이벤트 엔진 (미리 계산된 eventRands 사용)
  const updatedUniversityWeek = isUniversity ? (g.schoolState.universityWeek + 1) : (g.schoolState.universityWeek ?? 0);
  const careerStageYear = calcCareerStageYear(afterP, weekNum, updatedUniversityWeek);
  const eventCtx: EventContext = {
    protagonist:     afterP,
    currentWeek:     weekNum,
    seasonPhase:     s.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    standings:       s.standings,
    stats:           s.stats,
    triggeredEvents: s.triggeredEvents,
  };
  const evResult = runEventEngine(
    m.eventRules, m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx, s.seasonYear, careerStageYear,
    eventRands,
  );
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);
  gameStore.recordCareerTriggeredEvents(evResult.careerUpdatedTriggers);

  // 고교 월간 유망주 TOP 10 (4주마다)
  let top10Snap: import("../types/save").Top10Snapshot | undefined;
  let top10Msg: MessageItem | undefined;
  let rankPopularityDelta = 0;
  let rankScoutScoreDelta = 0;
  let rankMoraleDelta = 0;
  if (
    g.protagonist.careerStage === "highschool" &&
    weekInYear % 4 === 0 &&
    weekInYear >= 4
  ) {
    const heroStats = s.stats[afterP.id] ?? null;
    const last = afterP.playerType === "pitcher" ? g.lastTop10Pitcher : g.lastTop10Batter;

    top10Snap = generateTop10(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      weekNum,
      afterP.grade ?? 1,
      s.seasonYear,
    );
    top10Msg = buildTop10Message(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      top10Snap,
      last,
      weekNum,
      s.seasonYear,
    );
    const heroEntry = top10Snap.entries.find((e) => e.id === "PLY_HERO");
    if (heroEntry) {
      const ef = rankEffect(heroEntry.rank);
      rankPopularityDelta = ef.popularity;
      rankScoutScoreDelta = ef.scoutScore;
      rankMoraleDelta = ef.morale;
    }
  }

  // ── 주차 결과 배치 적용 (store 업데이트 최소화) ────────────────
  const weekMessages: MessageItem[] = [trainingMsg, ...evResult.newMessages];
  if (top10Msg) weekMessages.push(top10Msg);

  gameStore.applyMoneyChange(weeklyNet);
  gameStore.applyWeekEndBatch({
    protagonistPatch: growth.protagonistPatch,
    logs: growth.logs,
    weekNum,
    seasonYear: s.seasonYear,
    scoutScoreDelta:  trainingScoutDelta || undefined,
    top10Snapshot:    top10Snap,
    popularityDelta:  rankPopularityDelta > 0 ? rankPopularityDelta : undefined,
    scoutScoreDelta2: rankScoutScoreDelta > 0 ? rankScoutScoreDelta : undefined,
    moraleDelta:      rankMoraleDelta > 0 ? rankMoraleDelta : undefined,
    messages:         weekMessages,
  });

  // NPC 주간 성장/하락 처리 (매주 실행)
  await processWeeklyNpcGrowth(weekNum);

  // 프로 스테이지: 콜업/콜다운 처리 (월간 첫 주에만)
  if (isMonthStart(weekInYear)) {
    const callupLogs = await processProTeamCallupCalldown(weekNum);
    logs.push(...callupLogs);
  }

  // 친선경기 월간 플래너 (고교·대학·독립리그, 월 첫 주)
  if (
    isMonthStart(weekInYear) &&
    (g.protagonist.careerStage === "highschool" ||
     g.protagonist.careerStage === "university" ||
     g.protagonist.careerStage === "independent")
  ) {
    const sFriendly  = get(seasonStore);
    const mFriendly  = get(masterStore);
    const proto      = g.protagonist;
    const allTeamIds = sFriendly.leagueState[proto.leagueId]?.standings.map((s) => s.teamId) ?? [];

    // 리그 시즌 종료 주차 추정 (고교 W44, 대학 W42, 독립리그 W39)
    const seasonPhaseEnd =
      proto.careerStage === "highschool"  ? 44 :
      proto.careerStage === "university"  ? 42 : 39;

    const plan = planMonthlyFriendlies(
      weekInYear,
      weekNum,
      proto.teamId,
      proto.leagueId,
      sFriendly.seasonYear,
      sFriendly.schedule,
      allTeamIds,
      seasonPhaseEnd,
    );

    if (plan.entries.length > 0) {
      seasonStore.injectFriendlySchedule(plan.entries);
      const teamMap = new Map(mFriendly.teams.map((t) => [t.id, t.name]));
      const officialThisMonth = sFriendly.schedule.filter(
        (e) => !e.isFriendly &&
          e.week >= weekNum && e.week <= weekNum + 5 &&
          (e.homeTeamId === proto.teamId || e.awayTeamId === proto.teamId),
      );
      const noticeMsg = buildMonthlyNoticeMessage(plan, officialThisMonth, weekNum, teamMap);
      if (noticeMsg) gameStore.addMessage(noticeMsg);
      logs.push(`[친선경기] ${plan.monthLabel} ${plan.entries.length}회 편성`);
    }
  }

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

  // 진로허브 트리거 — 스테이지별 시즌 종료 직후
  // HS 3학년: W44 (결승 직후) / 대학: W42 (결승 직후) / 독립: W39 (결승 직후)
  const gLatest = get(gameStore);
  const needsHsHub =
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 && weekInYear === 44 &&
    !gLatest.schoolState.careerChoiceTriggered;
  const needsUnivHub =
    gLatest.protagonist.careerStage === "university" &&
    weekInYear === 42 &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) => a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice"
    );
  const needsIndieHub =
    gLatest.protagonist.careerStage === "independent" &&
    weekInYear === 39 &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) => a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice"
    );
  if (needsHsHub || needsUnivHub || needsIndieHub) {
    // v3: 드래프트 보드·폴백 지원(대학/독립) 표시 전에 두 리그를 Lazy 활성화
    // 해두지 않으면 후보 풀이 고교 3학년만으로 국한돼 드래프트 라운드가 텅 빈다
    // (KBL 8팀×10라운드=80 슬롯인데 고교만으로는 부족 — DESIGN.md §2.2)
    if (needsHsHub) {
      await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", s.seasonYear);
      await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", s.seasonYear);
    }
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // W47 진로 결과 계산 — KBL 드래프트(W44~W46) 마감 후 전 스테이지 동시 발표
  const gDraft = get(gameStore);
  const hasCareerPending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub" || a.type === "careerResults"
  );

  const isHsResultWeek =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear === 47 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  const isUnivResultWeek =
    (gDraft.protagonist.careerStage === "university" || gDraft.protagonist.careerStage === "independent") &&
    weekInYear === 47 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  if (isHsResultWeek || isUnivResultWeek) {
    const p = gDraft.protagonist;
    const apps = gDraft.schoolState.careerApplications;
    const univChoices = apps?.universityChoices ?? [];
    const indieChoices = apps?.independentChoices ?? [];
    const draftApplied = apps?.draftApplied ?? false;

    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;

    const { UNIVERSITY_REQUIREMENTS, calcHsBaseballScore } = await import("../utils/universityUtils");
    const hsBaseballScore = calcHsBaseballScore(gDraft.protagonist.careerRecords ?? []);
    const univChoiceReqs = univChoices.map((teamId) => {
      const req = UNIVERSITY_REQUIREMENTS[teamId];
      return { teamId, minAcademicGrade: req?.minAcademicGrade ?? 9, minBaseballScore: req?.minBaseballScore ?? 0 };
    });
    const admissionsCalc = JSON.parse(await window.projectB!.weekCalcHsAdmissions(JSON.stringify({
      ovr: p.pitching.ovr, avgPct, hsBaseballScore, univChoices: univChoiceReqs, indieChoices,
    }))) as { univPassed: string[]; indiePassed: string[]; sportsPassed: boolean };

    gameStore.setCareerResults({
      draftDrafted: false,
      draftTeamId: null,
      draftRound: null,
      draftPick: null,
      draftSigningBonus: 0,
      universityPassed: admissionsCalc.univPassed,
      independentPassed: admissionsCalc.indiePassed,
    });

    seasonStore.pushPendingAction({ type: "careerResults" });
  }

  // W47: 배경 고교 졸업생 드래프트 (주인공 드래프트 결과 케이스가 아닐 때 항상 실행)
  // 주인공 학년과 무관하게 매년 실행되는 세계 이벤트 — needsHsHub(주인공 3학년 전용)와
  // 별개로 여기서도 대학/독립 리그를 Lazy 활성화해야 배경 드래프트 풀이 채워진다
  if (weekInYear === 47 && !isHsResultWeek && !isUnivResultWeek && !hasCareerPending) {
    const alreadyQueued = get(seasonStore).pendingActions.some(a => a.type === "draftObserve");
    if (!alreadyQueued) {
      const seasonYearNow = get(seasonStore).seasonYear;
      await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", seasonYearNow);
      await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", seasonYearNow);
      seasonStore.pushPendingAction({ type: "draftObserve" });
    }
  }

  // 프로 트레이드 윈도우 (W12~W38, 4주마다)
  // 비프로 스테이지에서도 프로 3리그를 각각 시뮬해 거래 기록 유지
  if (weekInYear >= 12 && weekInYear <= 38 && weekInYear % 4 === 0) {
    const proLeagueIds = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
    const myLeague = get(gameStore).protagonist.leagueId;
    const isProStage = proLeagueIds.includes(myLeague);
    if (isProStage) {
      await processTradeWindow(weekInYear, myLeague);
    } else {
      for (const lid of proLeagueIds) {
        await processTradeWindow(weekInYear, lid);
      }
    }
  }

  // ── 오프시즌 이벤트 ─────────────────────────────────────────────
  {
    const gOff = get(gameStore);
    const sOff = get(seasonStore);
    const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(gOff.protagonist.careerStage);

    // W39: 독립리그 시즌 종료 총평 메시지
    if (gOff.protagonist.careerStage === "independent" && weekInYear === 39) {
      gameStore.addMessage({
        id: `msg-indie-season-end-${sOff.seasonYear}`,
        category: "system", sender: "리그 사무국",
        subject: `${sOff.seasonYear} 독립리그 시즌 종료`,
        preview: "시즌이 종료되었습니다. 진로 신청을 진행하세요.",
        body: "독립리그 시즌이 종료되었습니다.\n드래프트 신청, 독립리그 재계약, 군입대 중 진로를 선택할 수 있습니다.\nW47에 최종 결과가 발표됩니다.",
        createdAt: `W${weekNum}`, readAt: null,
      });
    }

    // W40: 팀 Win-Now 압박 업데이트 (오프시즌 시작)
    if (isProStage && weekInYear === 40) {
      processWinNowPressureUpdate(weekNum).catch(e => autoLog(`[WinNow압박오류] ${e}`));
    }

    // W40: 프로 시즌 총평 메시지
    if (isProStage && weekInYear === 40) {
      const myStats = sOff.stats[gOff.protagonist.id] as import("../types/save").PitcherSeasonStats | null ?? null;
      const statSummary = myStats
        ? `ERA ${myStats.era?.toFixed(2) ?? "-"} / ${myStats.w ?? 0}승 ${myStats.l ?? 0}패 / ${myStats.k ?? 0}K`
        : "시즌 기록 없음";
      gameStore.addMessage({
        id: `msg-pro-season-end-${sOff.seasonYear}`,
        category: "system", sender: "코칭스태프",
        subject: `${sOff.seasonYear} 시즌 종료 — 오프시즌 시작`,
        preview: `시즌 성적: ${statSummary}`,
        body: [
          `${sOff.seasonYear} 시즌이 종료되었습니다.`,
          `시즌 성적: ${statSummary}`,
          "",
          "W43부터 연봉협상 및 FA 시장이 열립니다.",
          "W50 체육부대 신청, W52 새 시즌 시작.",
        ].join("\n"),
        createdAt: `W${weekNum}`, readAt: null,
      });
    }

    // W43: NPC 은퇴/FA 결정 — 플레이어 단계 무관하게 배경 프로리그 NPC 처리
    if (weekInYear === 43) {
      const offseasonLogs = await processOffseasonNpcDecisions(weekNum);
      logs.push(...offseasonLogs);
    }

    // W43: 프로 연봉협상 1차 + FA 시장 오픈
    if (isProStage && weekInYear === 43) {
      const contract = gOff.protagonist.contract;
      const hasPending = sOff.pendingActions.some(
        (a) => a.type === "salaryNegotiation" || a.type === "faMarket" || a.type === "optionClause"
      );
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;

      // applySeasonContractProgress()는 W52(SeasonEndModal)에서 호출 — 여기서는 미리 체크만
      // 이번 시즌 종료 후 계약이 만료되는지 확인 (remainingYears === 1 → 감산 후 0)
      if (!hasPending && !hasPendingNext && contract) {
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;

        if (contract.remainingYears === 1) {
          // 이번 시즌 마지막 계약 연도 — 만료 예정
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
          if (contract.teamOptionYears > 0) {
            const seasonRating = await calcSeasonRating(myStats);
            const profile = getTeamProfile(gOff.protagonist.teamId, gOff, m) ?? DEFAULT_TEAM_PROFILE;
            // winNowPressure: 0→기준75, 50→63, 100→50 (공격적 팀은 낮은 기준에도 행사)
            const threshold = 75 - Math.round((profile.winNowPressure / 100) * 25);
            const exercised = seasonRating >= threshold;
            const action: PendingAction = { type: "optionClause", optionType: "team", exercised, nextSalary: offeredSalary };
            seasonStore.pushPendingAction(action);
          } else if (contract.playerOptionYears > 0) {
            const action: PendingAction = { type: "optionClause", optionType: "player", exercised: false, nextSalary: offeredSalary };
            seasonStore.pushPendingAction(action);
          } else if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: contract.teamId,
              leagueId: contract.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        } else if (contract.remainingYears <= 0) {
          // 이미 만료된 계약 — 계약 없음 처리
          if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: gOff.protagonist.teamId,
              leagueId: gOff.protagonist.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        }
        // remainingYears > 1: 계약 기간 중 — 아무것도 하지 않음
      } else if (!contract && !hasPending && !hasPendingNext) {
        // 계약 자체 없음 (이례적)
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
        if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
          seasonStore.pushPendingAction({ type: "faMarket" });
        } else {
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
          seasonStore.pushPendingAction({
            type: "salaryNegotiation",
            teamId: gOff.protagonist.teamId,
            leagueId: gOff.protagonist.leagueId,
            offeredSalary,
            durationYears: 1,
            minDurationYears: 1,
            maxDurationYears: 3,
            signingBonus: 0,
            context: "renewal",
          });
        }
      }
    }

    // W44~W49: FA 미계약자 매주 재트리거
    if (isProStage && weekInYear >= 44 && weekInYear <= 49) {
      const hasFaPending = sOff.pendingActions.some((a) => a.type === "faMarket");
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;
      const isUnsignedFa = !gOff.protagonist.contract && !hasPendingNext && !hasFaPending &&
        isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity);
      if (isUnsignedFa) {
        gameStore.incrementFaUnsignedWeek();
        seasonStore.pushPendingAction({ type: "faMarket" });
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

  // ── NPC 감정 업데이트 ─────────────────────────────────────────
  {
    const gEmo = get(gameStore);
    const sEmo = get(seasonStore);
    const isHs = gEmo.protagonist.careerStage === "highschool";
    const namedNpcs = gEmo.npcs.filter(n => n.emotionStatus !== "archived");

    if (isHs && namedNpcs.length > 0) {
      // 이번 주 주인공 경기 결과 (schedule에서 조회)
      const myGame = sEmo.schedule.find(
        e => e.week === weekNum && e.isProtagonistGame && e.result != null,
      );
      const myResult = myGame?.result;
      const iWon = myResult != null && myResult.winnerId === gEmo.protagonist.teamId;

      // 훈련 여부: 훈련 계획에 이번 주 항목 존재 여부로 추론
      const hasTrainingPlan = !!(gEmo.trainingPlan?.primaryProgramId ?? gEmo.trainingPlan?.secondaryProgramId);

      const ctx: WeeklyEmotionContext = {
        weekInSeason:    weekInYear,
        careerStage:     gEmo.protagonist.careerStage,
        protagonistOvr:  gEmo.protagonist.pitching?.ovr ?? gEmo.protagonist.batting?.ovr ?? 50,
        gameResult:      myResult
          ? { won: iWon, era: 0, strikeouts: 0 }
          : undefined,
        ovrDelta:        0,
        trainingDone:    hasTrainingPlan,
        trainingSkipped: !hasTrainingPlan,
        consecutiveTrainingSkips: 0,
      };

      const emotionMsgs: MessageItem[] = [];
      const updatedNpcs = namedNpcs.map(npc => {
        // 재회 감지: dormant → active
        const activated = npc.emotionStatus === "dormant"
          && npc.currentLeague === gEmo.protagonist.leagueId
          ? reactivateNpc(npc, gEmo.protagonist.careerStage)
          : npc;

        if (activated.emotionStatus === "active" && npc.emotionStatus === "dormant") {
          const isSameTeam = activated.currentTeam === gEmo.protagonist.teamId;
          const reunionMsg = makeReunionMessage(activated, isSameTeam, weekNum);
          if (reunionMsg) emotionMsgs.push(reunionMsg);
        }

        // 맞대결 memory: 라이벌 NPC가 이번 주 상대팀에 있을 때
        const newMems: NpcMemory[] = [];
        if (myResult && npc.emotionRole === "rival" && npc.currentTeam === myGame?.awayTeamId) {
          newMems.push(makeMemory(
            iWon ? "humiliation" : "witness",
            weekNum,
            2,
            `W${weekNum} 경기`,
          ));
        }

        const { npc: updated, prevEmotion } = updateNpcEmotion(activated, ctx, newMems);
        const msg = checkEmotionTriggers(updated, prevEmotion, weekNum);
        if (msg) emotionMsgs.push(msg);

        return updated;
      });

      const moodMsg = checkTeamMoodWarning(updatedNpcs, weekNum);
      if (moodMsg) emotionMsgs.push(moodMsg);

      if (emotionMsgs.length) gameStore.addMessages(emotionMsgs);
      gameStore.updateNpcs(updatedNpcs);
    }
  }

  // ── 배경 리그 시뮬레이션 (await — 월간 메시지 전 완료 보장) ────
  const bgEntities = get(masterStore).entities;
  await processNpcInjuries(weekNum);
  seasonStore.applyWeeklyConditionRecovery(bgEntities);
  await seasonStore.simulateBackgroundLeaguesAsync(weekNum, gFinal.protagonist.leagueId, bgEntities, gFinal.protagonist.careerStage);
  await seasonStore.driftBackgroundLeaguesAsync(gFinal.protagonist.leagueId, gFinal.protagonist.careerStage, m.teams);
  // npcLiveStats 변경 → connectToGameStore 구독이 entities 자동 갱신 (applyNpcLiveStats 불필요)

  // 주차 → 월 레이블 헬퍼
  function weekToMonthLabel(wk: number): string {
    const d = new Date(`${sFinal.seasonYear}-03-01`);
    d.setDate(d.getDate() + (wk - 1) * 7);
    return `${d.getMonth() + 1}월`;
  }

  // ── 주인공 리그 전주 NPC 경기 결과 메시지 ─────────────────────
  if (weekNum > 1) {
    const sAfterSim = get(seasonStore);
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));

    const myGames = sAfterSim.schedule.filter((e) => e.week === weekNum && !e.isProtagonistGame && !!e.result);
    if (myGames.length > 0) {
      const leagueName = LEAGUE_NAMES[gFinal.protagonist.leagueId] ?? gFinal.protagonist.leagueId;
      const monthLabel = weekToMonthLabel(weekNum);
      const lines = myGames.map((e) => {
        const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
        const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
        const r = e.result!;
        return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
      });
      gameStore.addMessage({
        id: `msg-league-results-w${weekNum}-${Date.now()}`,
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

  // ── 타 리그 순위 메시지 ─────────────────────────────────────
  const hsGradeForMsg = gFinal.protagonist.careerStage === "highschool"
    ? (gFinal.protagonist.grade ?? 1)
    : null;

  if (hsGradeForMsg !== null) {
    // 고교: 1학년 = 없음 / 2~3학년 = 분기 Digest (W12·W24·W36)
    if (hsGradeForMsg >= 2 && HS_DIGEST_WEEKS.has(weekInYear)) {
      const sAfterSim = get(seasonStore);
      const teamById  = new Map(mFinal.teams.map((t) => [t.id, t.name]));
      const digest    = buildHsLeagueDigest(
        weekNum, weekInYear, hsGradeForMsg,
        sAfterSim.leagueState, teamById,
        gFinal.protagonist.scoutScore ?? 0,
      );
      if (digest) gameStore.addMessage(digest);
    }
  } else {
    // 비고교: 기존 월간 순위표 (4주마다)
    if (weekInYear % 4 === 0) {
      const sAfterSim = get(seasonStore);
      const myLeagueId = gFinal.protagonist.leagueId;
      const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));
      const monthLabel = weekToMonthLabel(weekNum);

      for (const [lid, ls] of Object.entries(sAfterSim.leagueState)) {
        if (lid === myLeagueId) continue;
        if (!MONTHLY_STANDINGS_LEAGUES.has(lid)) continue;
        const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
        if (sorted.length === 0) continue;
        if (!sorted.some((s) => s.wins + s.losses + s.draws > 0)) continue;
        const lgSchedule = sAfterSim.leagueSchedules[lid] ?? [];
        const lastGameWeek = lgSchedule.reduce((mx, e) => Math.max(mx, e.week), 0);
        if (lastGameWeek > 0 && weekInYear > lastGameWeek) continue;

        const leagueName = LEAGUE_NAMES[lid] ?? lid;
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
  }

  // ── 코치 리포트 (3주마다, 군 복무·오프시즌 제외) ──────────────
  const isSeasonActive = sFinal.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  if (weekInYear % 3 === 0 && gFinal.protagonist.careerStage !== "military" && isSeasonActive) {
    const p   = gFinal.protagonist;
    const pit = p.pitching;
    const myStats = sFinal.stats[p.id] as import("../types/save").PitcherSeasonStats | null ?? null;
    const coachName = getPitchCoachName(p.teamId, mFinal.entities);

    const era = myStats?.era ?? null;
    const eraLine = era !== null
      ? `  시즌 ERA ${era.toFixed(2)}  (${
          era < 2.5 ? "최상위권" : era < 3.5 ? "안정권" : era < 5.0 ? "주의 필요" : "위험 수준"
        })`
      : null;

    const fatigueTag = p.fatigue >= 70 ? "⚠ 위험" : p.fatigue >= 50 ? "주의" : "정상";

    type Choice = { id: string; label: string; effectHint: string;
      moraleDelta?: number; fatigueDelta?: number; conditionDelta?: number;
      xp?: Record<string, number> };

    let recommendation: string;
    let choices: Choice[];

    if (p.fatigue >= 65) {
      recommendation = `피로도 ${p.fatigue} — 회복 최우선 권고.`;
      choices = [
        { id: "rest", label: "회복 집중",     effectHint: "피로 -8, 컨디션 +4", fatigueDelta: -8, conditionDelta: 4 },
        { id: "push", label: "훈련 유지",     effectHint: "변화 없음" },
      ];
    } else if (p.condition >= 82 && p.morale >= 68) {
      recommendation = `컨디션·사기 양호 — 집중 훈련 적기.`;
      choices = [
        { id: "intensive", label: "강도 높여 집중 훈련", effectHint: "커맨드 XP +3, 피로 +4", xp: { command: 3 }, fatigueDelta: 4 },
        { id: "steady",    label: "현재 루틴 유지",     effectHint: "변화 없음" },
      ];
    } else if (p.morale <= 40) {
      recommendation = `사기 저하 감지 — 멘탈 관리 병행 권고.`;
      choices = [
        { id: "mental",  label: "멘탈 케어 병행",   effectHint: "사기 +6, 훈련 효율 -10%", moraleDelta: 6 },
        { id: "grind",   label: "훈련만 집중",      effectHint: "변화 없음" },
      ];
    } else {
      recommendation = `현재 상태 안정적 — 루틴 유지 권장.`;
      choices = [
        { id: "balance",  label: "현재 루틴 유지",  effectHint: "변화 없음" },
        { id: "recover",  label: "회복 세션 추가",  effectHint: "피로 -4, 컨디션 +2", fatigueDelta: -4, conditionDelta: 2 },
      ];
    }

    const bodyLines = [
      `■ 현재 수치`,
      `  구속 ${pit.velocity}  커맨드 ${pit.command}  제구 ${pit.control}  스태미나 ${pit.stamina}`,
      ...(eraLine ? [eraLine] : []),
      ``,
      `■ 상태`,
      `  컨디션 ${p.condition}  /  피로도 ${p.fatigue} [${fatigueTag}]  /  사기 ${p.morale}`,
      ``,
      `■ 권고`,
      `  ${recommendation}`,
    ];

    gameStore.addMessage({
      id: `msg-coach-report-w${weekNum}-${Date.now()}`,
      category: "coach",
      sender: coachName,
      subject: `[코치 리포트] W${weekNum} 점검`,
      preview: recommendation,
      body: bodyLines.join("\n"),
      createdAt: `W${weekNum}`,
      readAt: null,
      decision: {
        prompt: "이번 주 방향을 선택하세요.",
        options: choices.map(c => ({
          id: c.id,
          label: c.label,
          effectHint: c.effectHint,
          effects: {
            moraleDelta:    c.moraleDelta    ?? 0,
            fatigueDelta:   c.fatigueDelta   ?? 0,
            conditionDelta: c.conditionDelta ?? 0,
            ...(c.xp ? { xp: c.xp } : {}),
          },
        })),
        selectedOptionId: null,
      },
    });
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
    gameStore.addCareerEvent({ year: s.seasonYear, eventType: "military_discharge",
      toTeamId: g.protagonist.contract?.teamId ?? undefined, detail: "전역" });
    const contract = g.protagonist.contract;
    if (contract) {
      const action: PendingAction = {
        type: "salaryNegotiation",
        teamId: contract.teamId, leagueId: contract.leagueId,
        offeredSalary: contract.salary,
        durationYears: Math.max(1, contract.remainingYears),
        minDurationYears: 1,
        maxDurationYears: 2,
        signingBonus: 0,
        context: "military_return",
      };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["전역: 복귀 계약 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    // 잔여 계약 없이 전역 → FA 시장으로
    const faAction: PendingAction = { type: "faMarket" };
    seasonStore.pushPendingAction(faAction);
    return { processedWeek: s.currentWeek, logs: ["전역 완료 — FA 시장 오픈"], newMessages: [], matchResults: [], stoppedBy: faAction };
  }

  // 프로 계약 로직은 processWeekBoundary W43에서 처리
  // handleSeasonEnd는 군 복무 전역 외 단순 시즌 종료 신호만 반환
  return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };
}

// ── 통합 포스트시즌 주입 (HS / KBL / ABL / UNIV / IND) ──────────
// 매 게임 처리 후 호출. 정규시즌 종료 감지 → 브라켓 초기화 → 다음 경기 주입
async function injectLeaguePostseason(nextWeek: number): Promise<void> {
  const s   = get(seasonStore);
  const g   = get(gameStore);
  const leagueId      = g.protagonist.leagueId;
  const protagonistId = g.protagonist.teamId;
  const seasonYear    = s.seasonYear;

  const SUPPORTED = ["LEAGUE_HIGHSCHOOL", "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"];
  if (!SUPPORTED.includes(leagueId)) return;

  // 정규시즌 경기가 남아 있으면 아직 아님
  if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;

  const bracket = s.postseasonBrackets?.[leagueId] ?? null;

  // ── 브라켓 미초기화: 빌드 후 비주인공 시리즈 즉시 시뮬 ──────
  if (!bracket) {
    let built: import("../types/season").PostseasonSeries[];
    if (leagueId === "LEAGUE_HIGHSCHOOL") built = await buildHsBracket(s.standings);
    else if (leagueId === "LEAGUE_KBL") built = await buildKblBracket(s.standings);
    else if (leagueId === "LEAGUE_UNIVERSITY") built = await buildUnivBracket(s.standings);
    else if (leagueId === "LEAGUE_INDEPENDENT") built = await buildIndBracket(s.standings);
    else if (leagueId === "LEAGUE_JBL") built = await buildJblBracket(s.standings);
    else if (leagueId === "LEAGUE_ABL") {
      const { ablConference } = await import("../utils/leagueConferences");
      const eastSt = s.standings.filter((st) => ablConference(st.teamId) === "East");
      const westSt = s.standings.filter((st) => ablConference(st.teamId) === "West");
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

  // ── R3a-4c (v3): 주인공 소속 리그 Lazy 활성화 보장 ────────────
  {
    const g0 = get(gameStore);
    const s0 = get(seasonStore);
    if (g0.protagonist.careerStage !== "military") {
      const activated = await ensureLeagueActivatedV3(g0.protagonist.leagueId, s0.seasonYear);
      if (activated > 0) accLogs.push(`[리그 활성화] ${LEAGUE_NAMES[g0.protagonist.leagueId] ?? g0.protagonist.leagueId} 로스터 ${activated}명 생성`);
    }
  }

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
      const m = get(masterStore);
      const serviceWeeks = g.protagonist.militaryServiceWeeks;

      // 계급 기반 이벤트 필터링 (minRank 이하만 포함)
      const rankIndex = serviceWeeks <= 8 ? 0 : serviceWeeks <= 34 ? 1 : serviceWeeks <= 60 ? 2 : 3;
      const eligibleSports  = m.militarySportsEvents.filter(e => (e.minRank ?? 0) <= rankIndex);
      const eligibleGeneral = m.militaryGeneralEvents.filter(e => (e.minRank ?? 0) <= rankIndex);
      const eligibleCommon  = m.militaryCommonEvents.filter(e => (e.minRank ?? 0) <= rankIndex);

      const milCalc = JSON.parse(await window.projectB!.weekCalcMilitary(JSON.stringify({
        isSportsUnit,
        serviceWeeks,
        stamina:  g.protagonist.pitching.stamina,
        recovery: g.protagonist.pitching.recovery,
        command:  g.protagonist.pitching.command,
        control:  g.protagonist.pitching.control,
        velocity: g.protagonist.pitching.velocity,
        morale:   g.protagonist.morale,
        fatigue:  g.protagonist.fatigue,
        sportsEventCount:  eligibleSports.length,
        generalEventCount: eligibleGeneral.length,
        commonEventCount:  eligibleCommon.length,
      }))) as {
        stamina: number; recovery: number; command: number; control: number; velocity: number;
        morale: number; fatigue: number;
        eventPool: string | null; eventIndex: number | null; rank: string;
      };

      if (milCalc.eventPool !== null && milCalc.eventIndex !== null) {
        const pool = milCalc.eventPool === "sports" ? eligibleSports
                   : milCalc.eventPool === "general" ? eligibleGeneral
                   : eligibleCommon;
        const evt = pool[milCalc.eventIndex];
        if (evt) {
          const choices = evt.choices?.map((c) => ({
            id: c.id,
            label: c.label,
            effects: {
              moraleDelta:  c.moraleDelta  ?? 0,
              fatigueDelta: c.fatigueDelta ?? 0,
              xp:           c.xp,
              statDelta:    c.statDelta,
            },
          })) ?? [{ id: "ok", label: "확인", effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 } }];
          seasonStore.pushPendingAction({
            type: "event", eventId: evt.id, title: evt.title, description: evt.description, choices,
          });
        }
      }

      const pitching = {
        ...g.protagonist.pitching,
        stamina:  milCalc.stamina,
        recovery: milCalc.recovery,
        command:  milCalc.command,
        control:  milCalc.control,
        velocity: milCalc.velocity,
      };
      gameStore.applyWeekResult(
        { morale: milCalc.morale, fatigue: milCalc.fatigue, pitching },
        [`군 복무(${isSportsUnit ? "체육부대" : "일반부대"}) — ${milCalc.rank}`],
        [], nextWeek, s.seasonYear,
      );
      const milEntities = get(masterStore).entities;
      seasonStore.applyWeeklyConditionRecovery(milEntities);
      await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, milEntities, g.protagonist.careerStage);
      await seasonStore.driftBackgroundLeaguesAsync(g.protagonist.leagueId, g.protagonist.careerStage, m.teams);
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

  // ── 군 복무 관련 트리거 ─────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const p = g.protagonist;
    const weekNum    = s.currentWeek + 1;
    const weekInYear = ((weekNum - 1) % 52) + 1;
    const isMilUnresolved = p.militaryStatus === "미필"
      && p.careerStage !== "military"
      && p.careerStage !== "highschool";
    const hasAnyMilPending = s.pendingActions.some(
      (a) => a.type === "sportsUnitApplication" || a.type === "militaryEnlistAsk"
    );

    if (isMilUnresolved && !hasAnyMilPending) {
      // W4: 28세 입영 기간 만료 경고
      if (p.age === 28 && weekInYear === 4) {
        gameStore.addMessage({
          id: `msg-military-warning-${Date.now()}`,
          category: "system", sender: "병무청",
          subject: "입영 기간 만료 통지",
          preview: "이번 시즌 W52에 입영 절차가 진행됩니다.",
          body: "병역 의무 이행 기간이 만료되었습니다.\n이번 시즌 W52 주차에 입영 절차가 진행됩니다.",
          createdAt: `W${weekNum}`, readAt: null,
        });
      }

      // W50: 체육부대 후보 30명 공개 (주인공 제외 NPC)
      if (weekInYear === 50 && p.age <= 27) {
        const m = get(masterStore);
        const npcCandidates = m.entities
          .filter((e) => {
            if (e.role !== "player") return false;
            const npcSave = g.npcs.find((n) => n.npcId === e.id);
            if (!isKoreanMilitaryEligible(e, npcSave)) return false;
            return npcSave?.militaryStatus === "미필"
              && npcSave.careerStatus === "active"
              && e.id !== p.id;
          })
          .map((e) => {
            const live = get(npcLiveStatsStore)[e.id];
            const ep = (e.details as import("../stores/master").EntityDetails)?.player;
            const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
            return { id: e.id, name: e.name, ovr, teamId: e.teamId, position: ep?.position ?? "SP", isProtagonist: false };
          });

        if (npcCandidates.length > 0) {
          const raw = JSON.parse(
            await window.projectB!.militaryCalcCandidates(JSON.stringify({ candidates: npcCandidates, topN: 30 }))
          ) as { topCandidates: { id: string; name: string; ovr: number; teamId: string }[]; protagonistRank: number | null };

          const teamById = new Map(m.teams.map((t) => [t.id, t.name]));
          const listLines = raw.topCandidates.map((c, i) =>
            `${i + 1}위  ${c.name} (${teamById.get(c.teamId) ?? c.teamId})  OVR ${Math.round(c.ovr)}`
          );
          const msgId = `msg-sports-candidates-${weekNum}-${s.seasonYear}`;
          gameStore.addMessage({
            id: msgId,
            category: "news", sender: "스포츠조선",
            subject: `${s.seasonYear} 체육부대 입대 후보 루머`,
            preview: `이번 시즌 체육부대 후보 30인이 거론되고 있습니다.`,
            body: [
              `${s.seasonYear}년 체육부대 입대 후보로 거론되는 30인 명단입니다.`,
              `실제 신청자는 다를 수 있습니다.`,
              ``,
              ...listLines,
            ].join("\n"),
            createdAt: `W${weekNum}`, readAt: null,
          });

          const action: PendingAction = { type: "sportsUnitApplication" };
          seasonStore.pushPendingAction(action);
          return { processedWeek: s.currentWeek, logs: ["체육부대 후보 공개"], newMessages: [], matchResults: [], stoppedBy: action };
        }
      }

      // W52: 체육부대 신청자 결과 처리
      if (weekInYear === 52 && p.sportsUnitApplied) {
        const m = get(masterStore);
        const npcPool = m.entities
          .filter((e) => {
            if (e.role !== "player") return false;
            const npcSave = g.npcs.find((n) => n.npcId === e.id);
            if (!isKoreanMilitaryEligible(e, npcSave)) return false;
            return npcSave?.militaryStatus === "미필" && npcSave.careerStatus === "active" && e.id !== p.id;
          })
          .map((e) => {
            const live = get(npcLiveStatsStore)[e.id];
            const ep = (e.details as import("../stores/master").EntityDetails)?.player;
            const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
            return { id: e.id, name: e.name, ovr, teamId: e.teamId, position: ep?.position ?? "SP", isProtagonist: false };
          });

        // NPC 29명 + 주인공 1명 = 30명 풀
        const topNpcRaw = JSON.parse(
          await window.projectB!.militaryCalcCandidates(JSON.stringify({ candidates: npcPool, topN: 29 }))
        ) as { topCandidates: { id: string; name: string; ovr: number; teamId: string; position: string }[] };

        const applicants = [
          { id: p.id, name: p.name, ovr: p.pitching.ovr, teamId: p.teamId, position: p.position ?? "SP", isProtagonist: true },
          ...topNpcRaw.topCandidates.map((c) => ({ ...c, isProtagonist: false })),
        ];

        const selResult = JSON.parse(
          await window.projectB!.militaryCalcSelection(JSON.stringify({
            applicants,
            maxTotal: 10,
            maxPerTeam: 3,
          }))
        ) as { protagonistSelected: boolean; selectedIds: string[] };

        if (selResult.protagonistSelected) {
          gameStore.addMessage({
            id: `msg-sports-selected-${weekNum}`,
            category: "system", sender: "병무청",
            subject: "체육부대 선발 통보",
            preview: "체육부대에 선발되었습니다.",
            body: "이번 체육부대 선발에 합격하였습니다.\n체육부대로 입대합니다.",
            createdAt: `W${weekNum}`, readAt: null,
          });
          gameStore.enlistMilitary("sports", weekNum, true, s.seasonYear);
          gameStore.addCareerEvent({ year: s.seasonYear, eventType: "military_enlist",
            fromTeamId: p.teamId || undefined, fromLeagueId: p.leagueId || undefined, detail: "체육부대 입대" });
          // 군입대 시 SeasonEndModal이 스킵되므로 여기서 NPC 오프시즌 처리
          await gameStore.processAllLeaguesSeasonEnd(s.seasonYear);
          seasonStore.initSeason("LEAGUE_MILITARY", s.seasonYear + 1, 100, []);
          seasonStore.setSchedule([]);
          const milSlotId = get(gameStore).currentSlotId;
          if (milSlotId) {
            await window.projectB!.leagueAddTransactions(JSON.stringify({
              slotId: milSlotId,
              rows: [{ seasonYear: s.seasonYear, week: weekNum, category: "military",
                playerId: p.id, playerName: p.name,
                fromTeamId: p.teamId || null, fromLeagueId: p.leagueId || null,
                detail: "체육부대 입대" }],
            }));
          }
          await gameStore.save();
          await seasonStore.save();
          return { processedWeek: weekNum, logs: ["체육부대 입대"], newMessages: [], matchResults: [], stoppedBy: null };
        }

        const action: PendingAction = { type: "militaryEnlistAsk", reason: "rejected" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["체육부대 탈락"], newMessages: [], matchResults: [], stoppedBy: action };
      }

      // W52: 스카우트 능력치 향상 + NPC loyalty 연간 감쇠
      if (weekInYear === 52 && ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage)) {
        processScoutingImprovement().catch(e => autoLog(`[스카우트향상오류] ${e}`));

        // season_end_normal loyalty 감쇠
        const namedActive = get(gameStore).npcs.filter(n =>
          n.careerStatus === "active" && n.personality
        );
        if (namedActive.length > 0) {
          const loyaltyUpdates = await Promise.all(
            namedActive.map(async (npc) => {
              const newLoyalty = JSON.parse(
                await window.projectB!.updatePlayerLoyaltyNative(JSON.stringify({
                  currentLoyalty:      npc.personality!.loyalty,
                  eventType:           "season_end_normal",
                  eventMagnitude:      1.0,
                  stabilityPreference: npc.personality!.stabilityPreference,
                }))
              ) as number;
              return { npcId: npc.npcId, loyalty: newLoyalty };
            })
          );
          const loyaltyMap = new Map(loyaltyUpdates.map(u => [u.npcId, u.loyalty]));
          gameStore.updateNpcs(
            get(gameStore).npcs.map(n => {
              const newLoy = loyaltyMap.get(n.npcId);
              if (newLoy === undefined || !n.personality) return n;
              return { ...n, personality: { ...n.personality, loyalty: newLoy } };
            })
          );
        }
      }

      // W52: 입영 기간 만료 (28세 이상, 미신청)
      if (weekInYear === 52 && p.age >= 28) {
        const action: PendingAction = { type: "militaryEnlistAsk", reason: "overdue" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["입영 기간 만료"], newMessages: [], matchResults: [], stoppedBy: action };
      }

      // 26~27세 패널티 누적 (W1 시점 체크)
      if (weekInYear === 1 && p.age >= 26) {
        const penalty = p.age === 26 ? 3 : 5;
        gameStore.addMilitaryDeferPenalty(penalty);
      }
    }
  }

  // ── 1주 진행: 정확히 currentWeek+1 처리 후 반환 ─────────────
  {
    const s = get(seasonStore);

    if (s.pendingActions.length > 0) {
      gameStore.save(); seasonStore.save();
      return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: s.pendingActions[0] };
    }

    if (s.currentWeek >= s.totalWeeks) {
      const result = await handleSeasonEnd();
      gameStore.save(); seasonStore.save();
      return { ...result, logs: [...accLogs, ...result.logs], matchResults: [...accResults, ...result.matchResults] };
    }

    // ── 같은 주차 미완료 경기 처리 (NPC + 고아 주인공 경기) ──────
    // advanceWeek가 주인공 경기에서 멈춘 뒤 재호출될 때 실행.
    // pending action이 없는데 주인공 경기 결과가 없으면 자동 시뮬(고아 경기).
    {
      const weekAlreadyStarted = s.schedule.some(
        (e) => e.week === s.currentWeek && !!e.result,
      );
      const remainingGamesThisWeek = s.schedule.filter(
        (e) => e.week === s.currentWeek && !e.result,
      );
      const remainingNpcGames  = remainingGamesThisWeek.filter((e) => !e.isProtagonistGame);
      const orphanProtag       = remainingGamesThisWeek.filter((e) => e.isProtagonistGame);
      // pendingActions가 없는데 주인공 경기가 남아있으면 → 고아 경기 (진행 중 버그 케이스)
      const hasOrphan = orphanProtag.length > 0 && s.pendingActions.length === 0;

      const gamesToAutoSim = hasOrphan
        ? [...orphanProtag, ...remainingNpcGames]  // 고아 경기 + NPC 경기 모두 처리
        : remainingNpcGames;                        // 정상: NPC 경기만

      // processWeekBoundary pending으로 thisWeekGames 루프가 실행 안 된 케이스.
      // weekAlreadyStarted=false + 미처리 경기 + pendingActions 없음 → 주 올리기 전에 처리.
      const hasInterruptedWeekGames =
        !weekAlreadyStarted &&
        remainingGamesThisWeek.length > 0 &&
        s.pendingActions.length === 0;

      if (hasInterruptedWeekGames) {
        const sorted = [...remainingGamesThisWeek].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        for (const game of sorted) {
          const sCurrent = get(seasonStore);
          const freshGame = sCurrent.schedule.find((e) => e.id === game.id);
          if (!freshGame || freshGame.result) continue;

          const gCurrent = get(gameStore);
          const isTeamGame =
            game.homeTeamId === gCurrent.protagonist.teamId ||
            game.awayTeamId === gCurrent.protagonist.teamId;

          if (game.isProtagonistGame || (!game.isProtagonistGame && isTeamGame && gCurrent.protagonist.playerType === "pitcher")) {
            const isInjured = !!gCurrent.protagonist.injury;
            const cond = gCurrent.protagonist.condition;

            if (isInjured || cond < 35) {
              const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              if (game.isFriendly) {
                const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
                seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
              } else {
                seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
                await applyPostseasonResult(game.id, result);
              }
              accResults.push(result);
              accLogs.push(isInjured ? "부상으로 인해 경기 출전 불가" : `컨디션 불량(${cond})으로 등판 회피`);
            } else if (cond < 55) {
              seasonStore.setCurrentDate(game.gameDate);
              const action: PendingAction = { type: "conditionWarning", scheduleId: game.id, condition: cond };
              seasonStore.pushPendingAction(action);
              gameStore.save(); seasonStore.save();
              return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: action };
            } else {
              seasonStore.setCurrentDate(game.gameDate);
              const gameAction: PendingAction = { type: "game", scheduleId: game.id };
              const briefAction: PendingAction = { type: "preGameBriefing", scheduleId: game.id };
              seasonStore.pushPendingAction(briefAction);
              seasonStore.pushPendingAction(gameAction);
              gameStore.save(); seasonStore.save();
              return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: briefAction };
            }
          } else {
            const entities2 = get(masterStore).entities;
            const leagueId2   = gCurrent.protagonist.leagueId;
            const lState2     = get(seasonStore).leagueState[leagueId2];
            const homeRotIdx2 = lState2?.teamRotationIndex?.[game.homeTeamId] ?? 0;
            const awayRotIdx2 = lState2?.teamRotationIndex?.[game.awayTeamId] ?? 0;
            const conditions2 = lState2?.playerConditions ?? {};
            let npcResult2: MatchResult;
            let nextHomeRot2 = homeRotIdx2;
            let nextAwayRot2 = awayRotIdx2;
            let pitcherConds2: Record<string, PlayerCondition> = {};

            if (entities2.length > 0) {
              const _tradeWeeks2 = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
              const sim2 = await simulateGame(game.homeTeamId, game.awayTeamId, entities2, {
                conditions: conditions2, homeRotIdx: homeRotIdx2, awayRotIdx: awayRotIdx2, week: game.week,
                npcInjuries: get(seasonStore).npcInjuries,
                rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
                npcLiveStats: get(npcLiveStatsStore),
                tradeAdaptationPenalty: _tradeWeeks2 > 0
                  ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeks2 }
                  : undefined,
              });
              npcResult2 = sim2.result; nextHomeRot2 = sim2.nextHomeRotIdx; nextAwayRot2 = sim2.nextAwayRotIdx; pitcherConds2 = sim2.pitcherConditions;
            } else {
              npcResult2 = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
            }
            if (game.isFriendly) {
              seasonStore.applyFriendlyResult(game.id, npcResult2, leagueId2, game.homeTeamId, game.awayTeamId, nextHomeRot2, nextAwayRot2, null, pitcherConds2);
            } else {
              seasonStore.applyProtagonistGroupNpcResult(game.id, npcResult2, leagueId2, game.homeTeamId, game.awayTeamId, nextHomeRot2, nextAwayRot2, pitcherConds2);
              applyPostseasonResult(game.id, npcResult2);
            }
            accResults.push(npcResult2);
            accLogs.push(`${game.homeTeamId} ${npcResult2.homeScore}:${npcResult2.awayScore} ${game.awayTeamId}`);
          }
        }
        // 현재 주 경기 처리 완료 → fall-through 하여 다음 주로 진행
      }

      const shouldProcess = weekAlreadyStarted &&
        gamesToAutoSim.length > 0 &&
        (hasOrphan || remainingNpcGames.length > 0);

      if (shouldProcess) {
        const sorted = [...gamesToAutoSim].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        for (const game of sorted) {
          const gCurrent = get(gameStore);
          const entities = get(masterStore).entities;
          const leagueId    = gCurrent.protagonist.leagueId;
          const lStateSnap  = get(seasonStore).leagueState[leagueId];
          const homeRotIdx  = lStateSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0;
          const awayRotIdx  = lStateSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0;
          const conditions  = lStateSnap?.playerConditions ?? {};

          let npcResult: MatchResult;
          let nextHomeRotIdx = homeRotIdx;
          let nextAwayRotIdx = awayRotIdx;
          let pitcherConds: Record<string, PlayerCondition> = {};

          if (entities.length > 0) {
            const _tradeWeeksNpc = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
            const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
              conditions, homeRotIdx, awayRotIdx, week: game.week,
              npcInjuries: get(seasonStore).npcInjuries,
              rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
              npcLiveStats: get(npcLiveStatsStore),
              tradeAdaptationPenalty: _tradeWeeksNpc > 0
                ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeksNpc }
                : undefined,
            });
            npcResult      = sim.result;
            nextHomeRotIdx = sim.nextHomeRotIdx;
            nextAwayRotIdx = sim.nextAwayRotIdx;
            pitcherConds   = sim.pitcherConditions;
          } else {
            npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          }

          if (game.isFriendly) {
            seasonStore.applyFriendlyResult(
              game.id, npcResult, leagueId,
              game.homeTeamId, game.awayTeamId,
              nextHomeRotIdx, nextAwayRotIdx,
              null, pitcherConds,
            );
          } else {
            seasonStore.applyProtagonistGroupNpcResult(
              game.id, npcResult, leagueId,
              game.homeTeamId, game.awayTeamId,
              nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
            );
            applyPostseasonResult(game.id, npcResult);
          }
          accResults.push(npcResult);
          accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
        }
        // 현재 주 NPC 경기 처리 완료 → fall-through 하여 다음 주로 진행
      }
    }

    const nextWeekNum = s.currentWeek + 1;
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

    const sAfterBoundary = get(seasonStore);
    if (sAfterBoundary.pendingActions.length > 0) {
      gameStore.save(); seasonStore.save();
      return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: sAfterBoundary.pendingActions[0] };
    }

    // 포스트시즌 주입 (HS 포함 — 단일리그 top4 브래킷, injectLeaguePostseason로 통합)
    await injectLeaguePostseason(nextWeekNum);

    // 이번 주 미결 경기를 gameDate 순으로 처리
    const sForGames = get(seasonStore);
    const thisWeekGames = sForGames.schedule
      .filter((e) => e.week === nextWeekNum && !e.result)
      .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

    for (const game of thisWeekGames) {
      const sCurrent = get(seasonStore);
      const freshGame = sCurrent.schedule.find((e) => e.id === game.id);
      if (!freshGame || freshGame.result) continue;

      const gCurrent = get(gameStore);
      const currentRole = gCurrent.protagonist.currentRole;
      const isTeamGame =
        game.homeTeamId === gCurrent.protagonist.teamId ||
        game.awayTeamId === gCurrent.protagonist.teamId;
      // 불펜 등판 판정: 컨디션(playerConditions) + 투구 이력 전달
      const sForReliever   = get(seasonStore);
      const leagueIdR      = gCurrent.protagonist.leagueId;
      const lStateR        = sForReliever.leagueState[leagueIdR];
      const myCondR        = lStateR?.playerConditions?.[gCurrent.protagonist.id];
      const relieverPitching =
        !game.isProtagonistGame &&
        isTeamGame &&
        gCurrent.protagonist.playerType === "pitcher" &&
        !!currentRole &&
        isReliefsRole(currentRole) &&
        await relieverWouldPitch(
          currentRole,
          myCondR?.pitchOutsLast ?? 0,
          myCondR?.lastPitchedWeek ?? 0,
          nextWeekNum,
        );

      if (game.isProtagonistGame || relieverPitching) {
        const eligibilityBlocked = gCurrent.schoolState.eligibilityBlocked;
        const isInjured          = !!gCurrent.protagonist.injury;
        const cond               = gCurrent.protagonist.condition;

        if (eligibilityBlocked) {
          // 학사 경고 → 자동 시뮬
          gameStore.clearEligibilityBlock();
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("학사 경고로 인해 경기 출전 불가");
        } else if (isInjured) {
          // 부상 중 → 자동 시뮬 + 메시지
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("부상으로 인해 경기 출전 불가");
          gameStore.addMessage({
            id: `msg-inj-skip-w${nextWeekNum}-${Date.now()}`,
            category: "system", sender: "코칭스태프",
            subject: "부상으로 인한 등판 회피",
            preview: "부상 회복 중으로 이번 경기에 출전하지 않습니다.",
            body: `부상 회복 중(${gCurrent.protagonist.injury!.recoveryWeeksLeft}주 남음)으로 이번 경기 등판을 회피했습니다.`,
            createdAt: `W${nextWeekNum}`, readAt: null,
          });
        } else if (cond < 35) {
          // 컨디션 극히 낮음 → 자동 회피 + 메시지
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push(`컨디션 불량(${cond})으로 등판 회피`);
          gameStore.addMessage({
            id: `msg-cond-skip-w${nextWeekNum}-${Date.now()}`,
            category: "system", sender: "코칭스태프",
            subject: "컨디션 불량으로 인한 등판 회피",
            preview: `컨디션 ${cond} — 이번 경기 등판을 회피했습니다.`,
            body: `현재 컨디션(${cond})이 너무 낮아 코칭스태프 판단으로 이번 경기 등판을 회피했습니다.`,
            createdAt: `W${nextWeekNum}`, readAt: null,
          });
        } else if (cond < 55) {
          // 컨디션 저조 → 사용자 선택 (강행/회피)
          seasonStore.setCurrentDate(game.gameDate);
          const action: PendingAction = { type: "conditionWarning", scheduleId: game.id, condition: cond };
          seasonStore.pushPendingAction(action);
          gameStore.save(); seasonStore.save();
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: action };
        } else {
          // 정상 등판
          seasonStore.setCurrentDate(game.gameDate);

          // 브리핑 → 게임 순으로 push (공식·친선 모두)
          const gameAction: PendingAction  = { type: "game", scheduleId: game.id };
          const briefAction: PendingAction = { type: "preGameBriefing", scheduleId: game.id };

          seasonStore.pushPendingAction(briefAction);
          seasonStore.pushPendingAction(gameAction);
          gameStore.save(); seasonStore.save();
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: briefAction };
        }
      } else {
        const entities = get(masterStore).entities;

        const leagueId   = gCurrent.protagonist.leagueId;
        const lStateSnap = get(seasonStore).leagueState[leagueId];
        const homeRotIdx = lStateSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0;
        const awayRotIdx = lStateSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0;
        const conditions = lStateSnap?.playerConditions ?? {};

        let npcResult: MatchResult;
        let nextHomeRotIdx = homeRotIdx;
        let nextAwayRotIdx = awayRotIdx;
        let pitcherConds: Record<string, PlayerCondition> = {};

        if (entities.length > 0) {
          const _tradeWeeksPs = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
          const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
            conditions, homeRotIdx, awayRotIdx, week: game.week,
            npcInjuries: get(seasonStore).npcInjuries,
            rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
            npcLiveStats: get(npcLiveStatsStore),
            tradeAdaptationPenalty: _tradeWeeksPs > 0
              ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeksPs }
              : undefined,
          });
          npcResult      = sim.result;
          nextHomeRotIdx = sim.nextHomeRotIdx;
          nextAwayRotIdx = sim.nextAwayRotIdx;
          pitcherConds   = sim.pitcherConditions;
        } else {
          npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
        }

        if (game.isFriendly) {
          // 친선경기 → 순위·통계 미반영, rotationIndex만 갱신
          seasonStore.applyFriendlyResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx,
            null, pitcherConds,
          );
        } else {
          seasonStore.applyProtagonistGroupNpcResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
          );
          applyPostseasonResult(game.id, npcResult);
        }
        accResults.push(npcResult);
        accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
      }
    }

    const sFinal = get(seasonStore);
    if (sFinal.currentWeek >= sFinal.totalWeeks) {
      const result = await handleSeasonEnd();
      gameStore.save(); seasonStore.save();
      return { ...result, logs: [...accLogs, ...result.logs], matchResults: [...accResults, ...result.matchResults] };
    }

    gameStore.save(); seasonStore.save();
    return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: null };
  }
}
