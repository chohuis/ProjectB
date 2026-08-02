import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { autoLog } from "../stores/autoAdvance";
import { applyWeeklyRelations, reconcileRelationships, relationEffects, trainingAreaOf } from "./relationships";
import { buildRelationMessages } from "../utils/relationMessages";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForStage } from "../utils/rosterEngine";
import { calcTrainingGrowth } from "../utils/growthEngine";
import {
  applyWeeklyStudy, NEUTRAL_STUDY, calcExamResult, getUniversityExamGainMult,
  loadAcademicsRules, majorEffects, warningEffect, settleSemester,
} from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { generateTop10, buildTop10Message, rankEffect } from "../utils/top10Engine";
import { isMonthStart, planMonthlyFriendlies, buildMonthlyNoticeMessage } from "../utils/friendlyMatchEngine";
import { runNationalTeamWeek } from "./nationalTeam";
import { runCampusEventsWeek } from "./campusEvents";
import { enlistProtagonist, dischargeProtagonist } from "./militaryDecision";
import {
  isRetired, evalRetirementPressure, ovrTrendOf, calcMarketValueForProtagonist,
} from "./retirement";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../utils/salaryEngine";
import { isFaEligible, getFaThreshold } from "../utils/faEngine";
import { facilityTierOf } from "../utils/ids";
import { staffModsOf, staffStatsOf } from "../utils/staffEffects";
import { calcWeeklyFinance, calcTrainingBonus } from "./finance";
import type { MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { InjurySeverity, InjuryHistoryEntry, InjuryState, InjuryType, PitchingAttributes, ProtagonistSave } from "../types/save";
import { INJURY_LABEL } from "../types/save";
import { toGameDate } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch } from "../utils/pitcherRoleEngine";
import {
  buildKblBracket, buildAblBracket, buildIndLadder, buildJblBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";
import { isV3SlotActive } from "../repo/v3Mode";
import { generateFreshmenV3, ensureLeagueActivatedV3, generateOverseasIntakeV3 } from "../repo/slotLifecycleV3";
import { applyForeignTurnover } from "./foreignPlayers";

// ── weekPhases 도메인 모듈 (R4: training·academics·events·games·injuries·growth·market·digest) ──
import { findTeamCoach, getPitchCoachName, makeTrainingMessage } from "./weekPhases/training";
import { EXAM_EVENT_IDS, isMidtermEvent, makeExamMessage } from "./weekPhases/academics";
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
import {
  MY_RANK_WEEKS, calcMyRank, buildMyRankMessage, buildNeighborDigest,
} from "./weekPhases/standingsNews";
import { applyRoundResults, missingRoundEntries, openTournamentsForWeek, promoteFinishedGroupStages } from "./tournaments";
import { TOURNAMENTS } from "../utils/tournament";
import {
  buildOpenMessage, buildMyRoundMessage, buildChampionMessage,
} from "./weekPhases/tournamentNews";
import { progressSurvival } from "./survivalLeague";
import { runBackgroundPostseasons } from "./backgroundPostseason";
import { IND_LEAGUE_ID, emptySurvivalState } from "../utils/survivalLeague";
import { snapshotDueAt } from "../utils/standingsSnapshot";
import { canApplyToUniversity, canApplyToIndependent } from "../utils/careerTransition";
import { isLeagueInScope } from "../config/releaseScope";

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
      // 프로(대학·독립 포함): 상세 역할 배정.
      // 감독 관계가 OVR 평가를 보정한다 (Phase 6C-5) — 관계 행이 아직 없으면
      // 0이라 구 동작과 같다(새 팀 첫 시즌 W1이 그렇다).
      const roleBias = (isV3SlotActive() && g.currentSlotId)
        ? (await relationEffects({ slotId: g.currentSlotId, teamId: g.protagonist.teamId })).roleOvrBias
        : 0;
      const role = await assignProtagonistRole(g.protagonist, m.entities, roleBias);
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

      // ── 해외 리그 로스터 보장 (확장팩) ──────────────────────────
      //
      // ⚠ 예전엔 해외가 **Lazy 활성화 전용**이었고 `ensureLeagueActivatedV3`를
      // 대학·독립·주인공 리그만 불렀다. 그래서 확장팩 게이트를 열어도
      // **선수 0명인 리그에 일정만 1,740경기 깔렸다**(실측 ABL 1,080 · JBL 660,
      // 2시즌 굴려도 인원 0·결과 0). 게이트를 연다고 도는 게 아니다.
      //
      // 범위 밖이면 `ensureLeagueActivatedV3`가 호출돼도 할 일이 없어야 하므로
      // 여기서 먼저 거른다.
      for (const lid of ["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
        if (!isLeagueInScope(lid)) continue;
        const n = await ensureLeagueActivatedV3(lid, currentSeasonYear);
        if (n > 0) logs.push(`[해외활성화] ${lid.replace("LEAGUE_", "")} ${n}명`);
      }
      // 해외는 하부 파이프라인(고교→대학→드래프트)이 없다 — 매년 리그에
      // 직접 신인을 배정한다. 안 하면 `fill_first_teams`가 1군을 채우려고
      // 팜에서 빼오기만 해서 **팜이 말라붙는다**(실측 544 → 184).
      const intake = await generateOverseasIntakeV3(currentSeasonYear);
      if (intake > 0) logs.push(`[해외신인] ${intake}명 배정`);

      // ── 외국인 순환 (F-4·F-5) ─────────────────────────────────
      //
      // 은퇴·로스터 정리가 끝난 **뒤**여야 빈 자리를 정확히 센다.
      // 안 돌면 보유 3명이 은퇴·부진 퇴출로 매년 줄어들기만 한다
      const fgn = await applyForeignTurnover(currentSeasonYear);
      for (const l of fgn.logs) logs.push(l);
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

  // ⚠ **학생일 때만 학업이 돈다.** 예전엔 단계 게이트가 없어서 프로 선수도
  // 매주 출석·과제·백분위가 갱신됐다 (실측: pro_kbl 주간 로그에 "[학업] 주간
  // 효율 85%"). 학사 경고가 걸리면 `eligibilityBlocked`로 경기가 자동 시뮬되는데,
  // 프로 선수에게 그게 걸리는 건 말이 안 된다.
  const isStudent = g.protagonist.careerStage === "highschool" || isUniversity;
  const examGainMult  = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult = isStudent
    ? applyWeeklyStudy(g.schoolState, examGainMult)
    : NEUTRAL_STUDY;
  // ⚠ **대학은 고교식 주간 학업 결과를 저장하지 않는다.** 석차백분율·출석·
  // 과제·경고누적은 고교 축이고, 대학은 학점 축이다(설계 §1-1).
  // 훈련 효율(`studyResult.efficiencyMod`)만 아래에서 그대로 쓴다
  if (isStudent && !isUniversity) gameStore.applyWeeklyStudyResult(studyResult);

  // ── 대학 학업 (Phase 9-C) ────────────────────────────────────
  //
  // 고교와 축이 다르다 — 고교는 석차 9등급으로 대학 입학 티어를 정하고,
  // 대학은 **학점 → 졸업 자격**이다. 수치는 전부 `academicsRules`에서 온다.
  const acaRules = isUniversity ? await loadAcademicsRules() : null;
  let univEffMod = 1.0;
  if (acaRules) {
    const mj = majorEffects(acaRules, g.schoolState.universityMajor);
    // 주간 학점 누적 — 학업 모드와 전공이 함께 정한다
    const perWeek = acaRules.university.studyModeGpa[g.schoolState.weeklyStudyMode] ?? 0;
    if (perWeek > 0) gameStore.addWeeklyGpa(perWeek * mj.gpaGainMult);
    // 경고 단계는 훈련 효율을 깎는다. **한 번에 출전 정지로 가지 않는다** —
    // 1차는 효율만 깎고 경기는 뛴다(회복할 틈)
    univEffMod = warningEffect(acaRules, g.schoolState.academicWarningLevel ?? 0)?.trainingEffMod ?? 1.0;
  }

  // ⚠ 전공 계수의 정본은 `generation_rules.json`이다. 예전엔
  // `academicsEngine.UNIVERSITY_MAJORS` 상수에도 같은 숫자가 있었는데,
  // 규칙 파일에 `majors`를 넣으면서 **표가 둘이 됐다** — 규칙 파일만 읽는다.
  const majorEffBonus = acaRules
    ? majorEffects(acaRules, g.schoolState.universityMajor).trainingEffBonus
    : 0;

  const pitchCoach = findTeamCoach(g.protagonist.teamId, "투수", m.entities);
  // 스태프 능력치는 `staffEffects`만 읽는다 — 여기서 직접 파면 그게 다음 드리프트다
  const coachTeaching  = staffStatsOf(g.protagonist.teamId ?? "", m.entities, { specialty: "투수" }).teaching;

  // 관계 보정 (Phase 6C-5) — 이번 주 훈련 영역의 담당 코치와 감독 관계를 한 번에 읽는다.
  // 이 조회가 여기 있는 이유: coachEffBonus와 보직 배정이 둘 다 아래에서 쓰인다.
  const trainingFocus = m.trainingPrograms.find(
    pr => pr.id === g.trainingPlan?.primaryProgramId,
  )?.focus;
  const relEffects = (isV3SlotActive() && g.currentSlotId)
    ? await relationEffects({
        slotId: g.currentSlotId,
        teamId: g.protagonist.teamId,
        coachSpecialty: await trainingAreaOf(trainingFocus),
      })
    : { roleOvrBias: 0, trainingBonus: 0, contractBonus: 0, managerLabel: "중립", coachLabel: "중립", ownerLabel: "중립" };

  // 능력치 보정과 관계 보정을 더한 뒤 clamp한다 — 각각 clamp하면 상한이 두 배가 된다
  const coachEffBonus  = Math.max(-0.15, Math.min(0.25,
    (coachTeaching - 50) * 0.004 + relEffects.trainingBonus));
  const teamRef        = m.teams.find((t) => t.id === g.protagonist.teamId);
  const myMods             = staffModsOf(g.protagonist.teamId ?? "", m.entities, { specialty: "투수" });
  // 통솔력 있는 코치진이면 슬럼프에 늦게 빠지고 덜 깎인다 (§7-5 F-1).
  // 1.07배면 임계 3주 → 4주 · 페널티 0.70 → 0.72
  const slumpResist        = myMods.slump;
  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpThreshold     = Math.max(2, Math.round(3 * slumpResist));
  const slumpPenalty       = newLowMoraleWeeks >= slumpThreshold
    ? Math.min(0.95, 1 - (1 - 0.70) / slumpResist)
    : 1.0;
  const alreadyInjured     = !!g.protagonist.injury;

  // 훈련 강도 계산: TRN_RECOVERY / TRN_MENTAL_P / TRN_MENTAL_B 제외한 슬롯 비율
  const LOW_INTENSITY_PROGRAMS = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);
  const trnSlots = [g.trainingPlan.primaryProgramId, g.trainingPlan.secondaryProgramId, g.trainingPlan.secondary2ProgramId].filter((id): id is string => !!id);
  const highCount = trnSlots.filter(id => !LOW_INTENSITY_PROGRAMS.has(id)).length;
  const trainingIntensity = trnSlots.length > 0 ? highCount / trnSlots.length : 0;

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(h => h.severity !== "light");
  // +2는 인접권역 다이제스트용이다 (권역 하나 · 리그 하나 고르기).
  // 이벤트 엔진은 앞에서부터 순서대로 소비하므로 뒤 두 개는 안 건드린다 —
  // TS 게임 로직에서 Math.random()은 금지라 난수는 전부 Rust에서 온다
  const NEWS_RANDS = 2;
  const randCount = m.eventPools.length + m.eventPools.reduce((s, p) => s + p.maxPicksPerWeek, 0) + NEWS_RANDS;

  // ── 4개 독립 IPC 병렬 실행 (Phase 3) ──────────────────────────
  const [facilityEffModRaw, injuryCalcRaw, finance, trainingSub, eventRandsRaw] = await Promise.all([
    window.projectB!.weekCalcFacilityEff(
      JSON.stringify({
        careerStage: g.protagonist.careerStage,
        // refs의 국내 팀엔 `tier`가 없다 — 리그에서 파생한다 (ids.ts 정본)
        teamTier: teamRef ? facilityTierOf(teamRef.leagueId) : null,
        facilityInvestment: myMods.facility,
      })
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
      // 코치 관리력이 발생 확률을, 구단 시설이 회복 주차를 민다 (§7-5 F-1)
      injuryPrevention: myMods.injuryPrevention,
      recoveryBoost:    myMods.facility,
    })),
    // 개인 재정 (§7-5 F-3). 예전 `weekCalcWeeklyNet`은 무대별 상수 표가 Rust
    // 안에 박혀 있어 조정하려면 재컴파일이 필요했다 — 이제 규칙 파일이 정본이다
    calcWeeklyFinance({ protagonist: g.protagonist, seasonYear: s.seasonYear }),
    // 개인 트레이닝 구독 — 보너스가 팀 자원에 반비례한다 (DESIGN §7.3)
    calcTrainingBonus({ protagonist: g.protagonist }),
    window.projectB!.weekRollRandomBatch(randCount),
  ]);
  const facilityEffMod = JSON.parse(facilityEffModRaw) as number;
  const injuryCalc = JSON.parse(injuryCalcRaw) as {
    injuryUpdate: { type: string; severity: string; recoveryWeeksLeft: number } | null;
    justOccurred: boolean; justHealed: boolean; effMod: number;
    newConsecutiveHighFatigueWeeks: number; source: string | null;
    /** 부상 전조 — 임계 넘긴 첫 주에만 온다 (§7-5 F-2) */
    warning?: { kind: string; fatigue: number; risk: number };
  };
  const weeklyNet = finance.netWeekly;
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

  // ── 부상 전조 (§7-5 F-2) ────────────────────────────────────
  //
  // 임계를 넘은 첫 주는 부상 판정을 건너뛰고 여기서 경고만 낸다. 그대로 두면
  // 다음 주에 risk 확률로 실제 판정이 돈다 — 손쓸 기회를 한 번 주는 장치다.
  const injuryWarning = injuryCalc.warning ?? null;

  const SURGERY_REHAB_EFF: Record<number, number> = { 1: 0.00, 2: 0.10, 3: 0.30, 4: 0.60 };
  let effectiveInjuryEffMod = injuryCalc.effMod;
  if (injuryState && injuryState.severity === "surgery") {
    const elapsed = injuryState.totalRecoveryWeeks - injuryState.recoveryWeeksLeft;
    const pct = injuryState.totalRecoveryWeeks > 0 ? elapsed / injuryState.totalRecoveryWeeks : 0;
    const phase: 1 | 2 | 3 | 4 = pct < 0.25 ? 1 : pct < 0.50 ? 2 : pct < 0.75 ? 3 : 4;
    injuryState = { ...injuryState, rehabPhase: phase };
    effectiveInjuryEffMod = SURGERY_REHAB_EFF[phase];
  }

  // 개인 트레이닝 구독 보너스 — 사비를 들인 만큼 효율이 오른다.
  // **팀 자원에 반비례**하므로 열악한 팀일수록 이 값이 크다 (DESIGN §7.3)
  const subBonus = trainingSub.byArea.reduce((a, b) => a + b.effective, 0);

  // `univEffMod`는 학사 경고 단계의 훈련 효율 하락이다 (대학 전용, 없으면 1.0)
  const finalEffMod = studyResult.efficiencyMod * univEffMod
    * (1 + majorEffBonus + coachEffBonus + subBonus)
    * facilityEffMod * slumpPenalty * effectiveInjuryEffMod;

  const growth = await calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod, myMods);
  if (subBonus > 0) {
    growth.logs.push(
      `[개인 트레이닝] 효율 +${(subBonus * 100).toFixed(1)}% (구독 ${trainingSub.byArea.length}건 · 주 ${trainingSub.weeklyCost}만원${trainingSub.inverseFactor !== 1 ? ` · 팀 시설 보정 ×${trainingSub.inverseFactor.toFixed(2)}` : ""})`,
    );
  }

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
    // 주간 치료비 차감. **단위는 만원이다** — `money`도 드래프트 계약금도 만원이다.
    //
    // 고치기 전엔 이 표만 원 단위(500_000)로 만원 단위 `money`에서 빼고 있었다.
    // 초기 자산이 1,200(=1,200만원)이니 **보존 치료 한 주면 자산이 0**이 됐다.
    const weeklyTreatmentCost: Record<string, number> = {
      conservative: injuryState.severity === "moderate" ? 30 : 50,
      counseling:   80,
    };
    const treatCost = weeklyTreatmentCost[injuryState.treatmentChoice ?? ""] ?? 0;
    if (treatCost > 0) {
      growth.protagonistPatch.money = Math.max(0, (g.protagonist.money ?? 0) - treatCost);
      growth.logs.push(`[치료비] 주간 치료비 ${treatCost}만원 차감`);
    }
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  } else if (injuryWarning) {
    const pct = Math.round(injuryWarning.risk * 100);
    growth.logs.push(
      `[부상 경고] 피로 ${Math.round(injuryWarning.fatigue)} — 이대로 한 주 더 가면 ${pct}% 확률로 부상`,
    );
    gameStore.addMessage({
      id:        `msg-injury-warn-w${weekNum}`,
      category:  "coach",
      sender:    getPitchCoachName(g.protagonist.teamId, m.entities),
      subject:   "몸 상태 경고 — 이번 주는 넘겼습니다",
      preview:   `피로 ${Math.round(injuryWarning.fatigue)} / 다음 주 부상 위험 ${pct}%`,
      body:
        `피로도가 임계선을 넘었습니다. 이번 주는 별 탈 없이 지나갔지만 운이 좋았던 겁니다.\n\n`
        + `이대로 한 주를 더 보내면 **약 ${pct}% 확률로 부상**이 옵니다.\n\n`
        + `회복 훈련(TRN_RECOVERY)으로 슬롯을 돌리거나 등판을 걸러 피로를 떨어뜨리십시오.\n`
        + `임계선 아래로 내려가면 이 경고는 초기화됩니다.`,
      createdAt: `W${weekNum}`,
      readAt:    null,
    });
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
    sentenceMemory: s.sentenceMemory ?? {},
    // 대학 이벤트가 학점·경고를 조건으로 읽는다 (Phase 9-C).
    // **`get(gameStore)`로 최신을 읽는다** — 이번 주 학점 누적이 반영돼야 한다
    schoolState: get(gameStore).schoolState,
  };
  const evResult = runEventEngine(
    m.eventRules, m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx, s.seasonYear, careerStageYear,
    eventRands,
  );
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);
  seasonStore.recordSentencePicks(evResult.sentencePicks);
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
  await processWeeklyNpcGrowth(weekNum, g.protagonist.careerStage);

  // ── 국가대표 · 국제대회 (Phase 7-3) ─────────────────────────
  // 대회는 4년 주기이고 한 해에 하나만 열린다. 발탁되면 그 기간 소속팀에서
  // 빠지고(부상과 같은 취급), 폐막 주에 순위·메달·병역 면제가 정해진다
  {
    const nationalLogs = await runNationalTeamWeek(weekNum, weekInYear);
    logs.push(...nationalLogs);
  }

  // ── 대학 쇼케이스 · 올스타전 · 고교 스카우트 데이 (Phase 7-7) ─
  // 학생 무대에서만 돈다. 프로 선수에게 대학 쇼케이스 소식을 보내면 잡음이다
  {
    const campusLogs = await runCampusEventsWeek(weekNum, weekInYear);
    logs.push(...campusLogs);
  }

  // 1군 ↔ 2군 승강 — 국내 10구단 전부, 주인공 무관.
  //
  //   월 첫 주: 정기 재편 (콜업 + 콜다운)
  //   나머지 주: 상시 콜업 — 부상·장기 부진으로 빈 자리만 메운다
  //
  // 예전엔 연 2회(W20·W43)에 주인공 리그만이라, 드래프트가 매년 2군에 넣는
  // 110명을 따라가지 못했고 주인공이 프로가 아니면 아예 안 돌았다.
  {
    const callupLogs = await processProTeamCallupCalldown(
      weekNum, isMonthStart(weekInYear) ? {} : { urgentOnly: true });
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
    const examType = isMidtermEvent(triggeredExamId) ? "midterm" : "final";
    if (isUniversity && acaRules) {
      // ── 대학: 학점 확정 (Phase 9-C) ───────────────────────────
      //
      // 고교의 9등급 경로와 **다른 경로다.** 고교는 그 등급으로 대학 입학
      // 티어가 정해지고(`universityUtils`), 대학은 학점으로 졸업 자격이
      // 정해진다. 경고는 한 번에 출전 정지로 가지 않고 단계로 오르내린다.
      const sc = gAfterStudy.schoolState;
      const res = settleSemester(acaRules, {
        qualityAccum: sc.semesterQualityAccum ?? 0,
        weeks: sc.semesterWeeks ?? 0,
        priorCumulative: sc.universityGpa ?? 0,
        semestersDone: (sc.semesterGpaHistory?.length ?? 0) + 1,
        warningLevel: sc.academicWarningLevel ?? 0,
        major: sc.universityMajor,
      });
      gameStore.applySemesterResult(res, examType, s.seasonYear);
      gameStore.addMessage(makeExamMessage(weekNum, res.messageSubject, res.messageBody));
      logs.push(`[학업] ${res.messageSubject} (학점 ${res.gpa.toFixed(2)} / 누적 ${res.cumulativeGpa.toFixed(2)})`);
      if (res.repeats) logs.push("[학업] 유급 — 졸업이 한 해 밀린다");
    } else {
      const examRes = await calcExamResult(gAfterStudy.schoolState.examAccumScore, gAfterStudy.schoolState.warningCount, examType);
      gameStore.applyExamResult(examRes);
      gameStore.addMessage(makeExamMessage(weekNum, examRes.messageSubject, examRes.messageBody));
      logs.push(`[시험] ${examRes.messageSubject}`);
    }
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
    // 학적 역행 방어 (Phase 6B 보강) — `isUnivResultWeek`는 대학 재학생·독립 소속에도
    // 발동한다. 그때 universityChoices를 그대로 처리하면 **대학 두 번 입학**이 된다.
    // 지원 UI에서도 막지만, 구 세이브에 남은 지원 기록이 여기로 흘러들 수 있다.
    const univChoices = canApplyToUniversity(p.careerStage)
      ? (apps?.universityChoices ?? [])
      : [];
    const indieChoices = canApplyToIndependent(p.careerStage)
      ? (apps?.independentChoices ?? [])
      : [];
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

    // ── 주인공 드래프트 결과 ──────────────────────────────────
    //
    // ⚠ 예전엔 여기서 `draftDrafted: false`로 못박고 끝났다. 그리고 이 값을
    // true로 만드는 곳이 **어디에도 없었다**:
    //   · `DraftBoardModal`은 `careerResults.draftDrafted`가 이미 true여야
    //     주인공을 보드에 끼워 넣는다 → 순환이라 영원히 false
    //   · `determineProtagonistDraft`를 부르는 유일한 곳(`gameStore.processDraft`)은
    //     `processNpcDraft`로 대체되면서 **죽은 코드**가 됐다
    // 결과: **주인공은 절대 지명될 수 없었고, 따라서 프로에 갈 수 없었다.**
    // 승강·FA·트레이드·연봉협상 등 프로 콘텐츠 전부가 도달 불가였다.
    //
    // 주인공은 NPC 드래프트 풀에 안 들어간다 — 진로 결과가 따로 정해지는 게
    // 설계다(`DraftBoardModal` 주석). 그 "따로 정하는" 호출이 빠져 있었다.
    const { determineProtagonistDraft } = await import("../utils/draftSystem");
    const draftOutcome = draftApplied
      ? await determineProtagonistDraft(p.scoutScore, p.pitching.ovr, get(seasonStore).seasonYear)
      : { drafted: false };

    gameStore.setCareerResults({
      draftDrafted: draftOutcome.drafted,
      draftTeamId: draftOutcome.teamId ?? null,
      draftRound: draftOutcome.round ?? null,
      draftPick: draftOutcome.pick ?? null,
      // 계약금은 지명 순위가 정한다 — 계약 표는 수락 시 규칙 파일에서 다시 읽는다
      draftSigningBonus: draftOutcome.drafted
        ? Math.max(3000, Math.round((p.pitching.ovr - 45) * 220))
        : 0,
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

  // 프로 트레이드 윈도우 — 연 2회(시즌 중 데드라인 W36 + 오프시즌 W43), 주인공 리그만 (R5, DESIGN.md §5)
  if (weekInYear === 36 || weekInYear === 43) {
    const proLeagueIds = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
    const myLeague = get(gameStore).protagonist.leagueId;
    if (proLeagueIds.includes(myLeague)) {
      await processTradeWindow(weekInYear, myLeague);
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
      // 지갑을 여는 구단주면 오퍼가 후하다 (§7-5 F-1). 주인공 소속팀 기준
      const offSeasonBudgetMod = (): number =>
        staffModsOf(gOff.protagonist.teamId ?? "", m.entities).budget;

      // applySeasonContractProgress()는 W52(SeasonEndModal)에서 호출 — 여기서는 미리 체크만
      // 이번 시즌 종료 후 계약이 만료되는지 확인 (remainingYears === 1 → 감산 후 0)
      if (!hasPending && !hasPendingNext && contract) {
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;

        // ── 노쇠·방출 압박 판정 ──────────────────────────────────
        //
        // ⚠ **계약이 끝나는 해마다 여기를 지난다.** 예전엔 이 판정이
        // `remainingYears <= 0` 가지에만 있었는데, 바로 위 `=== 1` 가지가
        // 나이·성적과 무관하게 **매번 재계약 오퍼를 만들어서** 거기 도달할
        // 일이 없었다. 실측: 25시즌(2026→2051, 42세)을 완주하고도 은퇴 0건.
        //
        // 판정은 NPC와 같은 엔진이다 — 주인공 전용 기준을 만들면 "NPC는 38세에
        // 은퇴하는데 나는 45세까지 뛴다"가 되고, 그걸 맞추려고 표를 두 번 관리하게 된다.
        // 결과를 강제하지는 않는다: 제안하고 선택은 플레이어가 한다.
        if (contract.remainingYears <= 1) {
          const trend = ovrTrendOf(gOff.protagonist);
          const mv = await calcMarketValueForProtagonist(gOff.protagonist);
          const pressure = await evalRetirementPressure(trend, mv);
          if (pressure.suggest) {
            seasonStore.pushPendingAction({ type: "retirementAsk", urgency: pressure.urgency });
            logs.push("은퇴 권고 — 계약이 끝났고 구단이 다시 부르지 않는다");
            return logs;
          }
        }

        if (contract.remainingYears === 1) {
          // 이번 시즌 마지막 계약 연도 — 만료 예정
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats, offSeasonBudgetMod());
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
          // 계약이 이미 끝나 있다 (이례적 — 위 압박 판정을 이미 지났다).
          // 갈 곳을 찾아준다
          if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats, offSeasonBudgetMod());
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
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats, offSeasonBudgetMod());
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

  // ── 관계도 갱신 (Phase 6C — 구 NPC 감정 시스템을 대체) ─────────
  //
  // 구 코드는 `careerStage === "highschool"`일 때만 돌았고, 감독·코치는
  // npcs 배열에 없어서 애초에 대상이 아니었다. 지금은 스태프 전원 + 팀동료가
  // 전 커리어에 걸쳐 갱신된다.
  {
    const gRel = get(gameStore);
    const sRel = get(seasonStore);
    const slotId = gRel.currentSlotId;

    if (isV3SlotActive() && slotId) {
      try {
        // ① 소속 정합 먼저 — 팀이 바뀌었으면 감쇠·apart 처리 후 새 팀 인원을 만든다.
        //    팀 변경 훅을 개별 지점에 박지 않는다 (relationships.ts 주석 참고)
        await reconcileRelationships({
          slotId,
          worldSeed: sRel.worldSeed,
          teamId: gRel.protagonist.teamId,
          season: sRel.seasonYear,
          week: weekNum,
          teammateIds: gRel.npcs
            .filter(n => n.currentTeam === gRel.protagonist.teamId && n.npcId !== gRel.protagonist.id)
            .map(n => n.npcId),
          // 지명 순위는 "팀이 나를 어떻게 보고 데려왔나"라서 감독 초기값에만 붙는다
          draftRound: gRel.schoolState.careerResults?.draftRound ?? 0,
          draftedContext: !!gRel.schoolState.careerResults?.draftDrafted,
        });

        const myGame = sRel.schedule.find(
          e => e.week === weekNum && e.isProtagonistGame && e.result != null,
        );
        const myResult = myGame?.result;
        const teamWon = myResult != null && myResult.winnerId === gRel.protagonist.teamId;

        // 등판 여부·성적은 **경기 라인이 정본**이다. 누적 stats에서 역산하면
        // 주 단위 델타를 다시 만들어야 하고 그 계산이 또 하나의 진실이 된다.
        const lines = myResult?.playerLines ?? [];
        const myLine = lines.find(
          (l): l is import("../types/season").PitcherGameLine =>
            l.role === "pitcher" && l.playerId === gRel.protagonist.id,
        );
        const era = myLine && myLine.ip > 0 ? (myLine.er * 9) / myLine.ip : 0;

        // 이번 주 훈련 영역 — 담당 코치만 오르게 하는 근거
        const primaryId = gRel.trainingPlan?.primaryProgramId ?? null;
        const focus = get(masterStore).trainingPrograms.find(pr => pr.id === primaryId)?.focus;
        const trainingArea = await trainingAreaOf(focus);
        const hasTrainingPlan = !!(primaryId ?? gRel.trainingPlan?.secondaryProgramId);

        // 맞대결 상대 = **실제로 나와 맞붙어 던진 투수**. 구 코드는 시나리오에
        // 하드코딩된 emotionRole="rival" ID에 의존해 고교에서만 동작했다.
        // 경기 라인에서 뽑으면 전 커리어에 걸쳐 실측으로 잡힌다.
        const facedRivals = myLine
          ? lines
              .filter((l): l is import("../types/season").PitcherGameLine =>
                l.role === "pitcher" && l.playerId !== gRel.protagonist.id)
              .sort((a, b) => b.ip - a.ip)
              .slice(0, 1)      // 상대 선발 1명 — 불펜까지 라이벌로 잡으면 관계가 폭증한다
              .map((l) => l.playerId)
          : [];

        const deltas = await applyWeeklyRelations({
          slotId,
          worldSeed: sRel.worldSeed,
          week: weekNum,
          season: sRel.seasonYear,
          ctx: {
            pitched: !!myLine,
            won: teamWon,
            era,
            completeShutout: !!myLine && myLine.ip >= 9 && myLine.er === 0,
            teamPlayed: myResult != null,
            teamWon,
            ovrDelta: 0,
            trainingDone: hasTrainingPlan,
            trainingSkipped: !hasTrainingPlan,
            trainingArea,
            facedRivals,
          },
          relationMod: myMods.relation,
        });

        // 라벨이 바뀐 것만 알린다 — 값은 플레이어에게 보여주지 않는다
        const kindOf = new Map(deltas.flatMap(d => d.kind ? [[d.personId, d.kind] as const] : []));
        const msgs = buildRelationMessages(deltas, weekNum, get(masterStore).entities, new Map(kindOf));
        if (msgs.length) gameStore.addMessages(msgs);
      } catch (e) {
        // 관계도가 못 돌아도 주간 진행 자체는 막지 않는다
        console.warn("[advanceWeek] 관계도 갱신 실패 — 이번 주는 건너뜀", e);
      }
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
    const sAfterSim = get(seasonStore);
    const teamById  = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    const tName     = (id: string) => teamById.get(id) ?? id;
    // 권역 표시명은 refs의 구장 이름에서 나온다 — 손으로 표를 만들면 빠뜨린다.
    // "한라구장" 그대로면 "한라구장 3위"가 되어 어색하니 접미를 권역으로 바꾼다
    const stadiumById = new Map(mFinal.stadiums.map((x) => [x.id, x.name]));
    const rName = (id: string) => {
      const nm = stadiumById.get(id);
      return nm ? `${nm.replace(/구장$/, "")}권역` : `${id.replace(/^STADIUM_/, "")}권역`;
    };

    // 고교 2~3학년 = 분기 Digest (W12·W24·W36). 1학년은 대상이 아니다 —
    // 진로가 아직 안 걸린 학년에게 프로 순위표는 잡음이라는 판단
    if (hsGradeForMsg >= 2 && HS_DIGEST_WEEKS.has(weekInYear)) {
      const digest = buildHsLeagueDigest(
        weekNum, weekInYear, hsGradeForMsg,
        sAfterSim.leagueState, teamById,
        gFinal.protagonist.scoutScore ?? 0,
      );
      if (digest) gameStore.addMessage(digest);
    }

    // ── 내 위치 뉴스 (설계 원장 D-3 #3·#4) ────────────────────
    //
    // **학년을 안 가린다.** 1학년도 받는다 — 오히려 1학년에게 제일 필요하다.
    // 102교 세계에서 자기 위치를 알려주는 유일한 장치인데, 예전엔 분기
    // 다이제스트뿐이라 첫 시즌 리그 소식이 스카우트 데이 하나였다.
    //
    // 새 시뮬을 돌리지 않는다 — 이미 있는 순위표만 다시 읽는다.
    if (MY_RANK_WEEKS.has(weekInYear)) {
      const rank = calcMyRank(sAfterSim.standings, gFinal.protagonist.teamId);
      if (rank) {
        gameStore.addMessage(buildMyRankMessage(
          rank, weekNum, sAfterSim.seasonYear,
          sAfterSim.standings.find((st) => st.teamId === gFinal.protagonist.teamId),
          rName,
        ));
      }
    }

    // 주간 — 다른 권역 하나 + 다른 리그 하나. 시즌 초(전부 0-0)에는 null이 온다
    {
      const nd = buildNeighborDigest({
        weekNum, seasonYear: sAfterSim.seasonYear,
        hsStandings: sAfterSim.standings,
        myTeamId: gFinal.protagonist.teamId,
        leagueState: sAfterSim.leagueState,
        teamName: tName,
        regionName: rName,
        rand01: [
          eventRands[eventRands.length - 2] ?? 0.5,
          eventRands[eventRands.length - 1] ?? 0.5,
        ],
      });
      if (nd) gameStore.addMessage(nd);
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

  // 군 복무 종료.
  //
  // ⚠ 실제로 여기 오는 일은 거의 없다 — `runAutoAdvance`가 한 주 먼저
  // 시즌 종료(`currentWeek >= totalWeeks`)에서 멈추고 롤오버로 넘어간다.
  // 그래서 전역 정본은 `militaryDecision.dischargeProtagonist`이고
  // **롤오버가 그걸 부른다.** 여기서는 같은 함수를 부르기만 한다 —
  // 예전엔 이 자리에 전역 로직 전체가 복제돼 있었고, 도달하지 못해
  // **입대하면 영원히 군대에 있었다**(실측 700주).
  if (g.protagonist.careerStage === "military") {
    if (await dischargeProtagonist()) {
      const stopped = get(seasonStore).pendingActions[0] ?? null;
      return { processedWeek: s.currentWeek, logs: ["전역 처리 완료"], newMessages: [], matchResults: [], stoppedBy: stopped };
    }
  }

  // 프로 계약 로직은 processWeekBoundary W43에서 처리
  // handleSeasonEnd는 군 복무 전역 외 단순 시즌 종료 신호만 반환
  return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };
}

// ── 통합 포스트시즌 주입 (HS / KBL / ABL / UNIV / IND) ──────────
// 매 게임 처리 후 호출. 정규시즌 종료 감지 → 브라켓 초기화 → 다음 경기 주입
/**
 * 독립 생존리그 진행 (Phase 5-6).
 *
 * 대회와 달리 한 주에 여러 단계가 겹치지 않으므로 반복 루프가 필요 없다 —
 * 단계가 끝나야 다음 단계 일정이 나오고, 단계 사이에는 최소 한 주가 있다.
 */
async function progressIndependentLeague(week: number): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const state = s.survival ?? emptySurvivalState();

  const r = await progressSurvival(week, s, state, g.protagonist.teamId);
  if (!r) return;

  seasonStore.setSurvivalState(r.state);
  if (r.entries.length > 0) {
    seasonStore.injectLeagueEntries(IND_LEAGUE_ID, r.entries);
  }
  if (r.eliminated.length > 0) {
    console.info(`[독립] ${r.state.stage - 1}차 Stage 종료 — 탈락 ${r.eliminated.length}팀`);
  }
}

/**
 * 전국대회 진행 (Phase 5-4).
 *
 * 대회는 한 주에 여러 라운드가 들어간다(국화기 7R/4주). 다음 라운드 대진은
 * 직전 라운드 결과가 나와야 정해지므로, 경기 처리 루프와 번갈아 돌려야 한다.
 * → 이 함수는 "지금 넣을 수 있는 경기를 넣고, 넣었으면 true"를 돌려주고
 *   호출부가 경기를 치른 뒤 다시 부른다.
 *
 * @returns 일정에 새 경기를 넣었으면 true
 */
async function progressTournaments(week: number): Promise<boolean> {
  const g = get(gameStore);
  // 앞 라운드가 늦게 끝나 주차를 넘긴 대회 경기를 이번 주로 당긴다.
  // 경기 처리 루프가 `e.week === 이번주`만 보므로, 안 당기면 영영 안 치러진다
  seasonStore.pullOverdueTournamentGames(
    week, toGameDate(get(seasonStore).seasonYear, week, 6),
  );
  // 주인공 소속과 무관하게 전 리그 대회가 돈다 — DESIGN §2 국내 풀 시뮬.
  // 주인공이 대학에 가도 모교의 국화기는 계속 열린다.
  const protagonistTeamId = g.protagonist.teamId;
  let injected = false;

  // ① 이번 주에 개막하는 대회 (넉아웃이면 브래킷, 은하기·여명기면 조 추첨)
  const sOpen = get(seasonStore);
  const opened = await openTournamentsForWeek(
    week, sOpen, protagonistTeamId, get(masterStore).teams, sOpen.worldSeed ?? 0,
  );
  const tName4Tour = (id: string) =>
    get(masterStore).teams.find((t) => t.id === id)?.name ?? id;
  for (const o of opened) {
    if (o.bracket) seasonStore.setTournamentBracket(o.bracket);
    if (o.stage) seasonStore.setGroupStage(o.stage);
    if (o.entries.length > 0) {
      seasonStore.injectTournamentEntries(o.entries);
      injected = true;
    }
    // 개막 알림 — 대회는 고교 시즌 서사의 본체인데 예전엔 아무 통지가 없었다
    const def = TOURNAMENTS.find((t) => t.id === (o.bracket?.tournamentId ?? o.stage?.tournamentId));
    if (def) {
      const entrants = o.bracket
        ? [...new Set(o.bracket.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))]
            .filter((x): x is string => !!x)
        : (o.stage?.groups ?? []).flatMap((gr) => gr.teams);
      gameStore.addMessage(buildOpenMessage(
        def, entrants, protagonistTeamId, week, get(seasonStore).seasonYear,
      ));
    }
  }

  // ② 예선이 다 끝난 대회 → 본선 8강 브래킷 생성
  {
    const promoted = await promoteFinishedGroupStages(get(seasonStore), protagonistTeamId);
    for (const p of promoted) {
      seasonStore.setTournamentBracket(p.bracket);
      const due = p.entries.filter((e) => e.week <= week);
      if (due.length > 0) {
        seasonStore.injectTournamentEntries(due);
        injected = true;
      }
    }
  }

  // ③ 결과가 다 나온 라운드 → 다음 라운드 대진 확정 + 주입
  const s = get(seasonStore);
  const resultOf = new Map(
    s.schedule.filter((e) => e.result).map((e) => [e.id, e.result!.winnerId]),
  );
  const scheduledIds = new Set(s.schedule.map((e) => e.id));

  for (const bracket of Object.values(s.tournaments ?? {})) {
    for (let r = 1; r <= bracket.totalRounds; r++) {
      const live = bracket.matches.filter(
        (m) => m.round === r && !m.isBye && m.homeTeamId && m.awayTeamId,
      );
      if (live.length === 0) continue;
      if (live.every((m) => m.winnerTeamId)) continue;   // 이미 반영됨

      // ⚠ 대진은 확정됐는데 **일정에 없는** 라운드 — 먼저 넣는다.
      // 예전엔 다음 라운드 일정을 `week <= 현재주`로 걸러 버리고 다시 넣는
      // 경로가 없어서, 모든 대회가 1라운드에서 교착했다 (우승팀 0)
      {
        const missing = await missingRoundEntries(bracket, r, scheduledIds);
        // ⚠ **지난 주차로 들어가면 영영 안 치러진다.** 경기 처리 루프가
        // `e.week === 이번주`만 보기 때문이다. 앞 라운드가 늦게 끝나
        // 원래 주차를 넘겼으면 **이번 주로 당겨서** 넣는다 —
        // 실제 대회도 앞 라운드가 밀리면 다음 라운드가 곧바로 붙는다.
        const due = missing
          .filter((e) => e.week <= week)
          .map((e) => e.week === week ? e : {
            ...e,
            week,
            gameDate: toGameDate(get(seasonStore).seasonYear, week, 6),
          });
        if (due.length > 0) {
          seasonStore.injectTournamentEntries(due);
          injected = true;
        }
        if (missing.length > 0) break;   // 경기를 치른 뒤 다시 부른다
      }

      const results = live
        .filter((m) => resultOf.has(m.id))
        .map((m) => ({ matchId: m.id, winnerTeamId: resultOf.get(m.id)! }));
      if (results.length < live.length) break;            // 아직 안 끝난 라운드

      const { bracket: next, nextEntries } = await applyRoundResults(
        bracket, r, results, protagonistTeamId,
      );
      seasonStore.setTournamentBracket(next);

      // 내 팀 결과 · 우승 확정 — 둘 다 확정된 브래킷만 읽는다 (새 시뮬 없음)
      {
        const def = TOURNAMENTS.find((t) => t.id === next.tournamentId);
        if (def) {
          const mine = buildMyRoundMessage(
            def, next, r, protagonistTeamId, tName4Tour, week);
          if (mine) gameStore.addMessage(mine);
          if (r === next.totalRounds) {
            const champ = buildChampionMessage(
              def, next, protagonistTeamId, tName4Tour, week);
            if (champ) gameStore.addMessage(champ);
          }
        }
      }
      const due = nextEntries.filter((e) => e.week <= week);
      if (due.length > 0) {
        seasonStore.injectTournamentEntries(due);
        injected = true;
      }
      break;  // 이 대회는 한 번에 한 라운드씩
    }
  }

  return injected;
}

async function injectLeaguePostseason(nextWeek: number): Promise<void> {
  const s   = get(seasonStore);
  const g   = get(gameStore);
  const leagueId      = g.protagonist.leagueId;
  const protagonistId = g.protagonist.teamId;
  const seasonYear    = s.seasonYear;

  // 고교·대학은 제외 — 시즌 결산이 패왕기(11월)·왕중왕전(5월)로 옮겨갔다 (Phase 5-5a).
  // top4 준결승/결승을 남기면 결승이 두 번 열린다.
  const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_INDEPENDENT"];
  if (!SUPPORTED.includes(leagueId)) return;

  // 정규시즌 경기가 남아 있으면 아직 아님
  if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;

  const bracket = s.postseasonBrackets?.[leagueId] ?? null;

  // ── 브라켓 미초기화: 빌드 후 비주인공 시리즈 즉시 시뮬 ──────
  if (!bracket) {
    let built: import("../types/season").PostseasonSeries[];
    if (leagueId === "LEAGUE_KBL") built = await buildKblBracket(s.standings);
    else if (leagueId === "LEAGUE_INDEPENDENT") built = await buildIndLadder(s.standings);
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
  // ⚠ 은퇴하면 커리어가 끝난다 — 여기서 멈추지 않으면 은퇴한 선수가
  // 계속 등판하고 나이를 먹는다. 인생 기록 화면이 이 상태를 읽는다
  if (isRetired(get(gameStore).protagonist)) {
    const sR = get(seasonStore);
    return {
      processedWeek: sR.currentWeek, logs: ["은퇴 — 커리어 종료"],
      newMessages: [], matchResults: [], stoppedBy: null,
    };
  }

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
      //
      // ⚠ `sportsUnitPromptedYear` 가드가 **반드시 있어야 한다.** 이 블록은
      // 주를 안 넘기고 pending만 밀어넣은 채 반환한다 — 사용자가 신청/거절
      // 어느 쪽을 눌러도 주차가 그대로라 다음 진행에서 조건이 또 참이 된다.
      // 그러면 미필·비고교·27세 이하는 **매년 여기서 게임이 멈춘다** (실측 확인).
      if (weekInYear === 50 && p.age <= 27 && p.sportsUnitPromptedYear !== s.seasonYear) {
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
          gameStore.markSportsUnitPrompted(s.seasonYear);
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
          // 입대 처리는 `militaryDecision`이 정본이다 — 네 경로가 각자
          // 적고 있었고 그중 둘이 오프시즌 처리를 빠뜨렸다
          await enlistProtagonist("sports", weekNum, true);
          return { processedWeek: weekNum, logs: ["체육부대 입대"], newMessages: [], matchResults: [], stoppedBy: null };
        }

        gameStore.markMilitaryAsked(s.seasonYear);
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
      //
      // ⚠ `militaryAskedYear` 가드 필수 — W50 체육부대 공개와 **같은 결함**이다.
      // 주를 안 넘기고 pending만 밀어넣는데 모달의 "연기"는 상태를 안 바꾸므로
      // 다음 진행에서 조건이 또 참이 된다. 실측: 2038 W51에서 자동 진행이
      // 1000회 반복 상한에 걸려 멈췄고, 수동 진행이면 영영 W51이다.
      if (weekInYear === 52 && p.age >= 28 && p.militaryAskedYear !== s.seasonYear) {
        gameStore.markMilitaryAsked(s.seasonYear);
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

    // 포스트시즌 — 주인공 리그는 경기를 주입해가며, 나머지 국내 리그는 통째로 (Phase 5-7)
    await injectLeaguePostseason(nextWeekNum);
    {
      const sBg = get(seasonStore);
      const gBg = get(gameStore);
      const done = await runBackgroundPostseasons(
        sBg, gBg.protagonist.leagueId, gBg.protagonist.teamId,
      );
      for (const r of done) {
        seasonStore.initPostseasonBracket(r.leagueId, r.bracket);
        if (r.champion) accLogs.push(`[${r.leagueId}] 우승 ${r.champion}`);
      }
    }

    // 전·후반기 경계에서 순위 스냅샷 (Phase 5-5a).
    // 대회 개설보다 먼저 찍어야 그 주에 여는 대회가 새 스냅샷을 본다.
    {
      const key = snapshotDueAt(nextWeekNum);
      if (key) seasonStore.captureStandingsSnapshot(key);
    }

    // 독립 생존리그 단계 진행 (Phase 5-6)
    await progressIndependentLeague(nextWeekNum);

    // 대회 개막 라운드를 먼저 얹는다 (Phase 5-4)
    await progressTournaments(nextWeekNum);

    // 이번 주 미결 경기를 gameDate 순으로 처리.
    // 대회는 한 주에 여러 라운드가 들어가고 다음 대진이 직전 결과에 달렸으므로,
    // "경기 치르기 → 다음 라운드 주입"을 더 넣을 게 없을 때까지 반복한다.
    for (let pass = 0; ; pass++) {
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
          // 의무 휴식은 일 단위 (Phase 5-8) — 주말리그 토→일 연투를 여기서 막는다
          {
            lastPitchedDate: myCondR?.lastPitchedDate,
            lastPitchCount:  myCondR?.lastPitchCount,
            gameDate:        game.gameDate,
          },
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
        } else if (game.isTournament) {
          // 전국대회 → 개인 기록만. 순위표에 섞이면 다음 대회 시드가 오염된다
          seasonStore.applyTournamentResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
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

    // 방금 끝난 라운드로 다음 대진이 열리면 한 번 더 돈다.
    // 상한 20 = 국화기 7R + 여유. 무한 루프 방지용이지 정상 경로에서 닿지 않는다.
    if (pass >= 20 || !(await progressTournaments(nextWeekNum))) break;
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
