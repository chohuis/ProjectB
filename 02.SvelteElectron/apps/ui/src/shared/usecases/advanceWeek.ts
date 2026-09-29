import {
  TRADE_DEADLINE_WEEK, HS_CAREER_HUB_WEEK, UNIV_CAREER_HUB_WEEK,
  INDIE_CAREER_HUB_WEEK, INDIE_SEASON_REVIEW_WEEK,
  CAREER_RESULT_WEEK,
  OFFSEASON_START_WEEK, STOVE_LEAGUE_WEEK,
  FA_RETRY_START_WEEK, FA_RETRY_END_WEEK,
  SPORTS_UNIT_CANDIDATES_WEEK, MILITARY_RESULT_WEEK, MILITARY_AGE_WARNING_WEEK,
  WEEKS_PER_SEASON,
  weekInYearOf,
} from "../utils/seasonWeeks";
import { get } from "svelte/store";
import { trainingIntensityOf } from "../utils/arsenal";
import { seedOf } from "../utils/seedOf";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { livePitchingOvrOf } from "../stores/npcLiveStats";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { autoLog } from "../stores/autoAdvance";
import { relationEffects, trainingAreaOf } from "./relationships";
import { slotRepo } from "../repo/slotRepo";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForStage } from "../utils/rosterEngine";
import { calcTrainingGrowth } from "../utils/growthEngine";
import {
  applyWeeklyStudy, NEUTRAL_STUDY, calcExamResult,
  loadAcademicsRules, majorEffects, warningEffect, settleSemester,
} from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { generateTop10, buildTop10Message, rankEffect } from "../utils/top10Engine";
import { isMonthStart, planMonthlyFriendlies, buildMonthlyNoticeMessage } from "../utils/friendlyMatchEngine";
import { buildOpponentBrief, rotIdxOf } from "../utils/matchLineupBuilder";
import { buildMyBodyReport } from "./weekPhases/myBodyReport";
import { runNationalTeamWeek } from "./nationalTeam";
import { runCampusEventsWeek } from "./campusEvents";
import { enlistProtagonist, dischargeProtagonist } from "./militaryDecision";
import { runMilitaryLifeWeek, militaryLifeCounters } from "./militaryLife";
import { isMeasureMode } from "../utils/measureMode";
import {
  isRetired, evalRetirementPressure, ovrTrendOf, calcMarketValueForProtagonist,
  loadRetirementRules, surgeryRetireChance,
} from "./retirement";
import { sportsUnitLimits, sportsVacatingFromNpcs } from "../utils/militaryRules";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../utils/salaryEngine";
import { isFaEligible, getFaThreshold } from "../utils/faEngine";
import { facilityTierOf, activeProLeagues } from "../utils/ids";
import { staffModsOf, staffStatsOf } from "../utils/staffEffects";
import { calcWeeklyFinance, calcTrainingBonus } from "./finance";
import type { MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { InjurySeverity, InjuryHistoryEntry, InjuryState, InjuryType, PitchingAttributes, ProtagonistSave } from "../types/save";
import { INJURY_LABEL } from "../types/save";
import { toGameDate } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch, starterWouldStart } from "../utils/pitcherRoleEngine";
import { roleDepthOf } from "../utils/pitcherRoleRules";
import { isV3SlotActive } from "../repo/v3Mode";
import { askRoleChoice, hasRoleChoiceThisSeason } from "./pitcherRole";
import { loadRosterRules } from "../repo/newGameV3";
import { campConditionBonus } from "../utils/clubEffects";
import { generateFreshmenV3, ensureLeagueActivatedV3, generateOverseasIntakeV3, generateFarmDevelopmentV3 } from "../repo/slotLifecycleV3";
import { applyForeignTurnover } from "./foreignPlayers";

// ── weekPhases 도메인 모듈 (R4: training·academics·events·games·injuries·growth·market·digest) ──
import { findTeamCoach, getPitchCoachName, makeTrainingMessage } from "./weekPhases/training";
import { EXAM_EVENT_IDS, isMidtermEvent, makeExamMessage } from "./weekPhases/academics";
import { runEventEngine } from "./weekPhases/events";
import { EVENT_LANE_RANDS } from "../utils/eventEngine";
import { stageGroupOf } from "../utils/tierRules";
import { collectStreakKeys, tickStreaks, lastGameOf } from "../utils/eventCounters";
import { storyNpcIdOf } from "../utils/storyNpcRegistry";
import { runMilitaryServiceWeek, runMilitaryTriggers } from "./weekPhases/military";
import { applyTraitMods } from "../utils/protagonistTraits";
import { applySideEffects } from "./decisions";
import { simulateNpcGame, logGameLines } from "./weekPhases/games";
import { runRelationsWeek } from "./weekPhases/relations";
import { runCoachReport } from "./weekPhases/coachReport";
import { runCareerHubWeek } from "./weekPhases/careerHub";
import { runOffseasonMarketWeek } from "./weekPhases/offseasonMarket";
import { runEventLaneWeek } from "./weekPhases/eventLane";
// 시즌 경계 — 포스트시즌·대회·독립리그 (2026-09-27 · Ⅱ-1 쪼개기 · 로직 불변)
import {
  progressIndependentLeague, isKnockoutGame, progressTournaments,
  injectLeaguePostseason, applyPostseasonResult,
} from "./weekPhases/postseason";
/**
 * 성실 주간 자연 감쇠 (사용자 확정 2026-08-26).
 *
 * **0.4는 실측으로 골랐다.** 같은 씨앗에 0 / 0.1 / 0.2 / 0.4를 걸어 재고,
 * 0.4를 다시 3회 재서 확정했다:
 *
 *     감쇠 0.1  평균 95 · 80이상 92%   ← 거의 안 듣는다
 *     감쇠 0.2  평균 91 · 80이상 83%   ← 미미하다
 *     감쇠 0.4  평균 76 · 80이상 44%   ← **띠가 생긴다**
 *
 *     0.4 · 3회 최소   49.4 · 56.2 · 54.6   (전에는 60 · 60 · 60)
 *          · 80이상    45% · 0% · 54%       (전에는 82~95%)
 *
 * ⚠ **`diligence_lte 30`은 여전히 0회다. 그게 맞다** — 계측 하네스는 늘
 *   최선을 고르는 주인공이다. 성실히 플레이하는데 30까지 떨어지면
 *   그 조건의 뜻이 뒤집힌다. 30은 **게으른 플레이어**가 닿을 자리다.
 *
 * ⚠ `PB_DIL_DECAY`로 덮어 다시 잴 수 있다.
 */
const DILIGENCE_WEEKLY_DECAY = Number(
  (typeof process !== "undefined" && process.env?.PB_DIL_DECAY) || 0.4);

/**
 * 🔴 **사기는 기준값으로 끌린다 — 평균 회귀** (사용자 확정 2026-09-01).
 *
 * 성실과 **같은 병**이었는데 더 심했다. 실측(`probe:traits --path univ` ·
 * 8시즌 · 씨앗 20260803):
 *
 * ```
 *   대학  최소 100 · 최대 100 · 평균 100   표본 56주 — **한 번도 안 움직인다**
 *   고교  최소  70 · 최대 100 · 평균  99
 *   사기 ≤60 에 닿은 주   0
 * ```
 *
 * 그래서 사기를 조건으로 쓰는 **대학 이벤트 아홉이 전멸**했다(트랙 B 실측 ·
 * 문턱 40·48·50·50·55·55·55·58·60). 다른 무대는 같은 문턱대가 뜬다.
 *
 * ⚠ **올리는 경로만 있었다** — 경기 승패로도 훈련으로도 안 움직이고
 * 자연 감쇠도 없다. 이벤트 선택지(양수가 3배)와 TOP10 순위 보상
 * (`rankEffect` · 매주 +1~5, **음수 없음**)이 전부였다.
 *
 * ## 왜 감쇠가 아니라 회귀인가
 *
 * 성실은 **습관**이라 방치하면 떨어지는 게 맞다(단방향 감쇠). 사기는
 * **기분**이라 좋을 때도 나쁠 때도 중립으로 돌아온다 — 바닥에 붙어
 * 영영 못 올라오면 그것도 죽은 축이다.
 *
 * ```
 *   사기 100 → 매주 (60-100) × 0.05 = **-2.0**
 *   사기  70 →       (60- 70) × 0.05 = **-0.5**   가까울수록 느려진다
 *   사기  30 →       (60- 30) × 0.05 = **+1.5**   바닥에서는 올라온다
 * ```
 *
 * TOP10 보상(+1~5)과 만나 **평형점**이 생긴다 — 상위권 주인공은 높게,
 * 무명은 60 근처. 그게 노린 것이다.
 *
 * ⚠ **소수를 유지한다.** 정수로 반올림하면 회귀량이 1 미만일 때 매주 0이
 * 되어 아무 일도 안 일어난다(성실에서 겪었다).
 *
 * ⚠ `PB_MORALE_PIVOT` · `PB_MORALE_PULL` 로 덮어 다시 잴 수 있다.
 */
const MORALE_PIVOT = Number(
  (typeof process !== "undefined" && process.env?.PB_MORALE_PIVOT) || 60);
const MORALE_WEEKLY_PULL = Number(
  (typeof process !== "undefined" && process.env?.PB_MORALE_PULL) || 0.05);

/**
 * 한 주가 지난 뒤의 사기. **검사가 이 함수를 부른다.**
 *
 * ⚠ 식을 인라인으로 두면 검사가 자기 사본을 만들어 보게 되고, 그러면
 * **코드를 되돌려도 검사가 초록**이다(변이가 안 잡힌다). 순수 함수로
 * 뽑아 두면 검사와 코드가 같은 것을 본다.
 */
export function moraleAfterWeek(cur: number): number {
  return Math.max(0, Math.min(100, cur + (MORALE_PIVOT - cur) * MORALE_WEEKLY_PULL));
}
import { recordGameResult } from "./recordGameResult";
export { simulateProtagonistGame } from "./weekPhases/games";
import { getPermanentPenalty, processNpcInjuries } from "./weekPhases/injuries";
import { processPositionGaps } from "./weekPhases/positionGaps";
import { processJerseyNumbers } from "./weekPhases/jerseyNumbers";
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
import { buildLeagueDigest, DIGEST_WEEKS, LEAGUE_NAMES } from "./weekPhases/digest";
// 소식에 실을 표 (PLAN_MESSAGE_DASHBOARDS §1-1) — 본문은 그대로 두고 값만 더한다
import {
  pitcherSeasonTableMeta, gameResultsTableMeta,
  examBarsMeta, semesterBarsMeta, cardsMeta,
} from "../utils/dashboardMeta";
import { tableCopy } from "../utils/dashboardCopy";
import { bundleRoundProgressMessages } from "./weekPhases/tournamentNews";
import { runBackgroundPostseasons } from "./backgroundPostseason";
import { buildInjuryNews, isInjuryNewsWeek } from "./weekPhases/injuryNews";
import { BankPicker } from "../utils/reportCopy";
// 팀 목록의 정본 — 생존리그 순위 모수를 **리그 전체**로 고정한다
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { snapshotDueAt } from "../utils/standingsSnapshot";
import { canApplyToUniversity, canApplyToIndependent } from "../utils/careerTransition";
import { isLeagueInScope } from "../config/releaseScope";

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
// week 경계를 넘을 때 호출: 훈련·이벤트·시험·진로·업적·배경리그
// 반환: 새로 생긴 logs
async function processWeekBoundary(weekNum: number): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);
  const logs: string[] = [];

  // ── 보직 선택 — **각 리그의 개막 전 주** (PLAN_ROLE_RECOMMEND §4 · 확정 8) ──
  //
  // 🔴 새 pending 타입을 안 만든다. 소식을 넣기만 하면 아래 「미결정 메시지 확인」
  //   갈래가 `{type:"message"}` pending 으로 그 주에서 멈춘다 (§4).
  //
  // ⚠ **W1 자동 배정보다 먼저 부른다.** 프로 1군은 묻는 주가 W1 이라(시범경기가
  //   W1~4 에 12경기 있다) 순서가 뒤집히면 브리핑과 물음이 같은 주에 겹친다.
  {
    const askedId = await askRoleChoice(s.seasonYear, weekInYearOf(weekNum));
    if (askedId) logs.push("[보직] 감독 추천 도착 — 선택 대기");
  }

  // W1: 투수 포지션/역할 배정 + 시즌 시작 브리핑
  //
  // ⚠ **선택이 이미 있으면 덮어쓰지 않는다** (§7). 구 세이브·헤드리스 안전망으로
  //   남긴 갈래다 — 물어본 시즌에는 주인공이 고른 보직이 정본이다.
  //
  // 🔴 **`g` 를 다시 읽는다.** 위 `askRoleChoice` 가 방금 가드를 세웠는데 함수
  //   머리의 스냅샷에는 그게 없다 — 프로 1군은 묻는 주가 W1 이라 그대로 두면
  //   같은 주에 물음과 브리핑이 **둘 다** 뜬다.
  if (weekNum === 1 && g.protagonist.playerType === "pitcher"
      && !hasRoleChoiceThisSeason(get(gameStore).protagonist, s.seasonYear)) {
    if (g.protagonist.careerStage === "highschool") {
      // 고교: SP / RP 두 범주만 사용
      const pos = await assignHighschoolPosition(g.protagonist, m.entities);
      const posLabel = pos === "SP" ? "선발 투수" : "중계 투수";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(pos === "SP" ? "1선발" : "중간계투");
      gameStore.addMessage({
        id: `msg-season-brief-${s.seasonYear}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 보직: ${posLabel}`,
        body: `이번 시즌 당신의 보직은 [${posLabel}]로 배정되었습니다.\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
        // 보직은 **눈금 키**(SP·RP·CP)로 싣는다 — 카드 아래 한 줄을 문안의
        // 굴절표(`roleAs`)가 만든다. 낱말을 실으면 「중계으로」가 된다.
        // ⚠ 상세 역할(`1선발`)과 그 설명은 본문이 든다 — 굴절표에 없다
        metadata: cardsMeta("cards.seasonBrief", [{ key: "role", value: pos }]),
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
        id: `msg-season-brief-${s.seasonYear}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 역할: ${role}`,
        body: `이번 시즌 당신의 역할은 [${role}]로 배정되었습니다.\n\n${ROLE_DESCRIPTION[role]}\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
        // 보직은 **눈금 키**(SP·RP·CP)로 싣는다 — 카드 아래 한 줄을 문안의
        // 굴절표(`roleAs`)가 만든다. 낱말을 실으면 「중계으로」가 된다.
        // ⚠ 상세 역할(`1선발`)과 그 설명은 본문이 든다 — 굴절표에 없다
        metadata: cardsMeta("cards.seasonBrief", [{ key: "role", value: pos }]),
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

      // ── 육성선수: 2군 보직 하한 미달분만 ────────────────────────
      //
      // ⚠ 유출은 다 막았는데(콜다운·트레이드·공백 충원 하한) 그러자 반대편이
      // 막혔다 — 2군 투수가 하한이면 1군 포수 공백을 메울 수가 없다.
      // 하한을 더 걸어봐야 교착이라 **없는 사람을 만들어야 한다.**
      const dev = await generateFarmDevelopmentV3(currentSeasonYear);
      if (dev > 0) logs.push(`[육성선수] ${dev}명 (2군 보직 하한 충원)`);

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
    }
    // ⚠ 여기 `else` 갈래가 하나 있었다 — `master.db` `npc_master` 에서
    //   `entry_year == 올해` 인 사전 생성 NPC 를 꺼내 고교 신입생·해외
    //   즉전감으로 심는 **레거시 경로**다. 2026-09-04 에 지웠다: 그 표는
    //   Phase 6A 이후 0행이라 **어느 갈래로 와도 아무 일도 안 일어났고**,
    //   `master.db` 자체를 접으면서 재료가 사라졌다. 신입생은 위쪽
    //   `generateFreshmenV3`(Rust 생성)가 만든다.

    // 기존 선수 전체 → npcLiveStats 초기화 (미등록 항목만)
    const currentEntities = get(masterStore).entities;
    seasonStore.initNpcLiveStats(currentEntities, currentSeasonYear);
    // 프로 NPC 초기화: KBL/ABL/JBL 선수가 npcs에 없으면 `entities`에서 변환·추가
    gameStore.initProNpcsIfMissing(currentEntities, currentSeasonYear);
    seasonStore.snapNpcSeasonStart();
  }

  const isUniversity = g.protagonist.careerStage === "university";
  const weekInYear   = weekInYearOf(weekNum);

  if (isUniversity) gameStore.incrementUniversityWeek();

  // ⚠ **학생일 때만 학업이 돈다.** 예전엔 단계 게이트가 없어서 프로 선수도
  // 매주 출석·과제·백분위가 갱신됐다 (실측: pro_kbl 주간 로그에 "[학업] 주간
  // 효율 85%"). 학사 경고가 걸리면 `eligibilityBlocked`로 경기가 자동 시뮬되는데,
  // 프로 선수에게 그게 걸리는 건 말이 안 된다.
  const isStudent = g.protagonist.careerStage === "highschool" || isUniversity;
  // ⚠ 배수 인자를 지웠다 — 대학은 결과를 저장하지 않아 **죽은 갈래였다**
  const studyResult = isStudent
    ? await applyWeeklyStudy(g.schoolState)
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

  // 🔴 **관계도 조건(`relation_gte`/`relation_lte`)이 값을 못 받아 항상 false였다.**
  //    조건은 트랙 B가 만들었고 평가기도 있는데(`conditionEvaluator.ts:206`)
  //    `EventContext.relations`를 채우는 코드가 없었다.
  //
  //    ⚠ 이 프로젝트가 반복해 밟는 형태다 — **조건만 만들고 배선을 안 하면**
  //      **조용히 false다.** 이벤트가 안 떠도 로그 한 줄 안 남는다.
  //
  //    평가기가 동기라 여기서 미리 실어야 한다(`types/event.ts:79` 주석).
  //    조회는 위 `relationEffects`와 같은 슬롯이라 왕복이 하나 더 늘 뿐이다.
  const relRows = (isV3SlotActive() && g.currentSlotId)
    ? await slotRepo.getRelationships(g.currentSlotId)
    : [];

  // 능력치 보정과 관계 보정을 더한 뒤 clamp한다 — 각각 clamp하면 상한이 두 배가 된다
  //
  // ⚠ **멘토도 같은 통에 넣는다** (2026-09-08 · §5 `mentor`). 코치 지도력과
  //   같은 축이라 따로 곱하면 상한(0.25)을 두 번 쓰게 된다 — 멘토가 붙었다고
  //   효율이 두 배로 튀면 그건 산식이 둘이라는 뜻이다.
  const mentorBonus = (g.protagonist.mentor?.pct ?? 0) / 100;
  const coachEffBonus  = Math.max(-0.15, Math.min(0.25,
    (coachTeaching - 50) * 0.004 + relEffects.trainingBonus + mentorBonus));
  const teamRef        = m.teams.find((t) => t.id === g.protagonist.teamId);
  // 🔴 **특성은 계수에 곱한다** (2026-09-08 · §5 `trait`). 새 산식을 만들지
  //    않고 코치·구단 시설과 **같은 자리**로 들어간다 — 그래야 「특성이 얼마나
  //    세나」를 이미 있는 계측으로 잰다(`utils/protagonistTraits.ts` 머리말).
  const myMods             = applyTraitMods(
    staffModsOf(g.protagonist.teamId ?? "", m.entities, { specialty: "투수" }),
    g.protagonist.traits);
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

  // ── 새 보상의 지속 효과 (2026-09-08 · §5 `trainEffBoost`·`injuryRiskMod`) ──
  //
  // 🔴 **남은 주가 0이면 없는 것과 같다.** 주를 안 줄이면 한 번 받은 보정이
  //    커리어 내내 남는다 — 아래 `growth.protagonistPatch` 에서 줄인다.
  const teb = g.protagonist.trainEffBoost;
  const trainEffFactor = teb && teb.weeksLeft > 0 ? 1 + teb.pct / 100 : 1;
  const irm = g.protagonist.injuryRiskMod;
  // `pct` 는 「위험이 몇 % 오르나」라 음수가 덜 다치는 쪽이다.
  // `injuryPrevention` 은 **클수록 덜 다치는** 축이라 나눠서 부호를 맞춘다
  const injuryRiskFactor = Math.max(0.2, irm && irm.weeksLeft > 0 ? 1 + irm.pct / 100 : 1);

  // 훈련 강도 — 정본은 `utils/arsenal.ts`의 `trainingIntensityOf` 하나다
  const trainingIntensity = trainingIntensityOf([
    g.trainingPlan.primaryProgramId, g.trainingPlan.secondaryProgramId,
    g.trainingPlan.secondary2ProgramId,
  ]);

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(h => h.severity !== "light");
  // +2는 인접권역 다이제스트용이다 (권역 하나 · 리그 하나 고르기).
  // 이벤트 엔진은 앞에서부터 순서대로 소비하므로 뒤 두 개는 안 건드린다 —
  // TS 게임 로직에서 Math.random()은 금지라 난수는 전부 Rust에서 온다
  const NEWS_RANDS = 2;
  /**
   * 주간 리포트 문안 은행 여섯 (C2) — `train#subject`·`train#body`·
   * `train#program`·`injury#subject`·`mybody#subject`·`mybody#lead`.
   *
   * 🔴 **꼬리에서 가져간다.** 이벤트 엔진은 앞에서부터 순서대로 먹으므로
   *   여기서 뒤를 떼어 써야 이벤트 뽑기가 안 밀린다 — 앞에서 떼면 같은
   *   씨앗의 이벤트가 통째로 달라진다.
   * ⚠ `Math.random()` 은 금지다(CLAUDE.md) — 문안 뽑기도 Rust 난수다.
   */
  const REPORT_RANDS = 6;
  // 🔴 **풀 수로 세던 걸 상수로 바꿨다** (2026-09-08). 랜덤 풀이 노말 등급으로
  //    흡수돼 `maxPicksPerWeek` 가 없어졌다 — 이제 이벤트가 쓰는 난수는
  //    등급 추첨 1 + 등급 안 뽑기(폴백 포함) 최대 4 + 문장 뱅크다
  //    (`eventEngine.EVENT_LANE_RANDS`).
  const randCount = EVENT_LANE_RANDS + NEWS_RANDS + REPORT_RANDS;

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
      // 🔴 **씨앗을 넘긴다.** 안 넘기면 엔진이 `thread_rng`로 떨어져
      //    같은 세이브도 실행마다 다른 주에 다친다. 그 차이가 성적으로,
      //    성적이 진로로 번져 같은 씨앗이어도 프로에 갔다 독립에 갔다 한다.
      seed: seedOf(get(seasonStore).worldSeed ?? 0, get(seasonStore).seasonYear, weekNum, "injury-protagonist"),
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
      // 코치 관리력이 발생 확률을, 구단 시설이 회복 주차를 민다 (§7-5 F-1).
      // 🔴 **부상 위험 보정도 같은 축이다** (2026-09-08 · §5 `injuryRiskMod`).
      //    `pct` 는 「위험이 몇 % 오르나」라 음수가 덜 다치는 쪽이고,
      //    `injuryPrevention` 은 **클수록 덜 다치는** 축이라 부호를 뒤집어 나눈다.
      //    ⚠ 새 인자를 만들지 않는다 — 만들면 Rust 쪽에 계수 자리가 둘이 된다.
      injuryPrevention: myMods.injuryPrevention / injuryRiskFactor,
      recoveryBoost:    myMods.facility,
    })),
    // 개인 재정 (§7-5 F-3). 예전 `weekCalcWeeklyNet`은 무대별 상수 표가 Rust
    // 안에 박혀 있어 조정하려면 재컴파일이 필요했다 — 이제 규칙 파일이 정본이다
    calcWeeklyFinance({ protagonist: g.protagonist, seasonYear: s.seasonYear }),
    // 개인 트레이닝 구독 — 보너스가 팀 자원에 반비례한다 (DESIGN §7.3)
    calcTrainingBonus({ protagonist: g.protagonist }),
    // 🔴 **씨앗을 안 넘기고 있었다** (2026-09-07). `roll_random_batch` 는
    //    씨앗이 0이면 `thread_rng` 로 떨어진다 — 그래서 **이벤트 뽑기가 실행마다
    //    달랐고**, 선택지 효과가 능력치를 밀어 같은 씨앗·같은 경기 결과인데도
    //    고교 3년 뒤 OVR·구속이 갈렸다(실측: 3회에 75/76/76 · 76/77/78).
    //    같은 자리의 `injuries.ts` 는 처음부터 `seedOf` 를 넘기고 있었다 —
    //    **한쪽만 배선된 형태**다.
    window.projectB!.weekRollRandomBatch(
      randCount,
      seedOf(get(seasonStore).worldSeed ?? 0, get(seasonStore).seasonYear, weekNum, "event-rands")),
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
  /**
   * 문안 은행 하나 — 훈련·부상·내 몸 셋이 **같은 것을 쓴다.**
   *
   * 🔴 **하나여야 한다.** 리포트마다 따로 만들면 난수 꼬리를 셋이 같은
   *   자리에서 떼어 가고, 같은 주 세 리포트가 늘 같은 인덱스를 뽑는다.
   *   기억 키(`train#subject`·`injury#subject`…)는 은행마다 갈려 있으니
   *   하나로 묶어도 서로를 안 흔든다(`reportCopy.BankPicker` 머리말).
   * ⚠ 뽑은 인덱스는 아래에서 `sentenceMemory` 로 되돌린다 — 안 되돌리면
   *   「직전 제외」가 매주 초기화돼 같은 제목이 연속으로 난다.
   */
  const reportPicker = new BankPicker(
    get(seasonStore).sentenceMemory ?? {}, eventRands.slice(-REPORT_RANDS),
  );
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
    // 이벤트가 준 훈련 효율 보정 (§5 `trainEffBoost`) — 시설·개인 트레이닝과
    // 같은 층이다. 안 곱하면 레어 보상이 데이터에만 있고 아무 일도 안 한다
    * trainEffFactor
    * facilityEffMod * slumpPenalty * effectiveInjuryEffMod;

  // ⚠ **프로그램 표를 넘긴다.** 안 넘기면 Rust 역직렬화가 실패해 오류가 난다 —
  // 예전처럼 하드코딩된 표로 조용히 굴러가지 않는다 (정본은 programs.json)
  const growth = await calcTrainingGrowth(
    g.protagonist, g.trainingPlan, finalEffMod, myMods, m.trainingPrograms);
  // 관계도가 "이번 주 성장"을 보려면 여기서 잡아 둬야 한다 — 아래에서
  // 패치가 스토어에 반영된 뒤엔 차이를 구할 수 없다
  const ovrDeltaThisWeek =
    (growth.protagonistPatch.pitching?.ovr ?? g.protagonist.pitching.ovr)
    - g.protagonist.pitching.ovr;
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
    // ── 부상 은퇴 판정 (수술급 발생 즉시) ────────────────────────
    //
    // ⚠ **주인공에게는 이 경로가 없었다.** NPC는 `weekPhases/injuries`가
    // 수술 발생 즉시 굴리는데(36세 이상 65%), 주인공은 수술을 받아도 아무
    // 판정이 없어 설계의 트리거 셋 중 "부상 강제"가 데이터상 존재하지 않았다.
    //
    // **NPC와 같은 표를 쓴다** (`retirementRules.surgery`). 따로 두면
    // "NPC는 36세에 은퇴하는데 나는 45세까지 뛴다"가 된다.
    if (injuryState.severity === "surgery") {
      const retireRules = await loadRetirementRules();
      // 조용히 넘어가지 않는다 — 규칙이 없으면 커리어가 끝나지 않는다
      if (!retireRules) {
        throw new Error("[은퇴판정] generation_rules.json에 retirementRules가 없다");
      }
      {
        const hadSurgery = (g.protagonist.injuryHistory ?? [])
          .some((h) => h.severity === "surgery");
        const chance = surgeryRetireChance(g.protagonist.age, hadSurgery, retireRules);
        // TS에서 Math.random()은 금지 — 난수는 전부 Rust에서 온다
        // ⚠ **씨앗도 넘긴다.** 안 넘기면 `thread_rng` 라 같은 세이브를 다시
        //   열 때마다 은퇴 여부가 달라진다(2026-09-07 · 위 배치와 같은 결함)
        const roll = (JSON.parse(await window.projectB!.weekRollRandomBatch(
          1,
          seedOf(get(seasonStore).worldSeed ?? 0, get(seasonStore).seasonYear, weekNum, "surgery-retire"),
        )) as number[])[0] ?? 1;
        if (roll < chance) {
          seasonStore.pushPendingAction({
            type: "retirementAsk", urgency: 1, reason: "injury",
            detail: `${INJURY_LABEL[injuryState.type]} — 재기 불가 판정`,
          });
          growth.logs.push(`[은퇴] ${INJURY_LABEL[injuryState.type]} 재기 불가 판정`);
        }
      }
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
    // ⚠ **소식을 여기서 바로 보내지 않는다.** NPC 부상은 이미 월간 리포트인데
    // 내 몸만 낱개로 왔다 — 경고 한 통, 부상 결장 한 통, 컨디션 결장 한 통이
    // 따로 떴다. 월말에 한 통으로 모은다(`buildMyBodyReport`).
    seasonStore.pushMyBodyEvent({
      week: weekNum, kind: "warning",
      fatigue: Math.round(injuryWarning.fatigue), riskPct: pct,
    });
  }
  if (studyResult.efficiencyMod < 1.0) {
    growth.logs.push(`[학업] 주간 효율 ${Math.round(studyResult.efficiencyMod * 100)}%`);
  }

  // ── 성실 자연 감쇠 ───────────────────────────────────────────
  //
  // 🔴 **성실이 오르기만 했다.** 실측(2026-08-26 · 3회):
  //      최소 60(=시작값) · 최대 99 · 표본의 82~95%가 80 이상
  //      `diligence_lte 30`은 **0회** — 영원히 false였다
  //
  //   보상이 양수 147건 대 음수 9건이고 **음수 중 7건이 대학 전용**이라,
  //   데이터로 음수를 아무리 늘려도 못 이긴다. 성실은 습관이니
  //   **방치하면 떨어지는 것**이 자연스럽다 (사용자 확정 2026-08-26).
  //
  // ⚠ **소수를 유지한다.** 정수로 반올림하면 감쇠율이 1 미만일 때
  //   매주 0이 되어 아무 일도 안 일어난다. 사기도 소수로 돈다.
  {
    const cur = g.protagonist.diligence ?? 0;
    const next = Math.max(1, cur - DILIGENCE_WEEKLY_DECAY);
    if (next !== cur) growth.protagonistPatch.diligence = next;
  }

  // 사기 — **기준값으로 끌린다.** 근거는 `MORALE_PIVOT` 주석에 있다.
  //
  // ⚠ **여기서 patch 에 넣는 게 맞다.** `applyWeekEndBatch` 가
  //   `{ ...protagonist, ...patch }` 를 먼저 만들고 그 위에 `moraleDelta`
  //   (TOP10 보상)를 더한다 — 회귀가 기준값이 되고 보상이 얹힌다.
  //   순서가 반대면 회귀가 보상을 덮어 TOP10 이 아무 일도 안 하게 된다.
  {
    const cur = g.protagonist.morale ?? MORALE_PIVOT;
    const next = moraleAfterWeek(cur);
    if (Math.abs(next - cur) > 1e-9) growth.protagonistPatch.morale = next;
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
  const trainingMsg = makeTrainingMessage(s.seasonYear, weekNum, growth.logs, afterP, coachName, {
    copy: m.reportCopy,
    picker: reportPicker,
    // 🔴 **엔진이 판정 재료를 준다.** 계수 셋이 Rust 안이라 여기서 다시
    //   곱하면 결정 ④ 가 지운 사본이 되살아난다(`growth_engine.rs::xp_ratio_of`)
    xpRatio: growth.xpRatio,
    primaryProgramId: g.trainingPlan.primaryProgramId,
  });

  // 이벤트 엔진 (미리 계산된 eventRands 사용)
  const updatedUniversityWeek = isUniversity ? (g.schoolState.universityWeek + 1) : (g.schoolState.universityWeek ?? 0);
  const careerStageYear = calcCareerStageYear(afterP, weekNum, updatedUniversityWeek);

  // ── 이벤트 뽑기·통지 — `weekPhases/eventLane.ts` (2026-09-30 · Ⅱ-1) ─
  //
  // ⚠ **자리에 뜻이 있다.** 훈련·부상 계산 **뒤**(그래서 `afterP` 를 넘긴다),
  //   주차 결과 배치 적용 **앞**이다. 뒤로 옮기면 이번 주 성장이 이벤트 조건에
  //   안 잡히고, 앞으로 옮기면 지난주 값으로 이벤트가 돈다.
  // ⚠ 내는 값 여섯을 **옮기기 전과 같은 이름으로** 받는다 — 아래 배치 적용
  //   본문을 한 글자도 안 고치기 위해서다.
  const evtLane = await runEventLaneWeek({
    weekNum, weekInYear, careerStageYear, g, s, m, afterP, relRows, growth, teb, irm, eventRands,
  });
  const {
    evResult,
    top10Snap,
    top10Msg,
    rankPopularityDelta,
    rankScoutScoreDelta,
    rankMoraleDelta,
  } = evtLane;

  // ── 주차 결과 배치 적용 (store 업데이트 최소화) ────────────────
  //
  // ⚠ **훈련 소식은 안 낼 수 있다** (2026-09-01 · B 요청). 매주 1통이
  // 코드 소식 985통 중 292통(29.6%)이라 소식함의 3분의 1을 혼자 먹고 있었다.
  // `makeTrainingMessage`가 null을 내면 그 주는 건너뛴다 — 여기서 안 거르면
  // 배열에 null이 들어가고 `{#each ... (msg.id)}`가 undefined 키로 죽는다
  // (CLAUDE.md가 "세이브가 아예 안 열린다"고 적은 그 결함이다).
  const weekMessages: MessageItem[] = trainingMsg
    ? [trainingMsg, ...evResult.newMessages]
    : [...evResult.newMessages];
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

  // ── 유니크·히든의 대가 (2026-09-08 · §4 `cost`) ────────────────
  //
  // 🔴 **선택지가 아니라 이벤트에 붙는다** — 어느 갈래를 골라도 낸다.
  //    B 가 41종에 달아 놨는데 **읽는 코드가 없었다**: 데이터에만 있고 아무
  //    일도 안 일어나는, 이 저장소가 반복해 겪은 형태다.
  // ⚠ 스탯·돈은 store 패처가, 관계·사치품은 `applySideEffects` 가 낸다 —
  //    정본 둘을 그대로 쓴다(여기서 계산을 다시 적으면 그게 사본이다).
  for (const cost of evResult.costs) {
    gameStore.applyEventEffect(cost);
    await applySideEffects(cost);
  }

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
      // ⚠ **`briefOf`를 안 넘기면 날짜·상대만 나온다** — 예전 소식 그대로다.
      // 에러가 아니라 "아무 일도 안 일어남"으로 나타나는 자리라 배선을 여기 둔다.
      // 순위·성적은 시즌 상태에서, 선발·타선은 엔티티에서 온다
      const standRank = new Map(
        [...sFriendly.standings]
          .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
          .map((s, i) => [s.teamId, { rank: i + 1, row: s }]),
      );
      const totalTeams = sFriendly.standings.length;
      const briefOf = (teamId: string) => {
        const hit = standRank.get(teamId);
        return buildOpponentBrief(teamId, mFriendly.entities, {
          // ⚠ 셋을 다 넘긴다 — 하나라도 빠지면 예고가 늘 1번 투수다
          conditions: sFriendly.leagueState[proto.leagueId]?.playerConditions,
          rotIdx: rotIdxOf(sFriendly.leagueState, proto.leagueId, teamId),
          npcInjuries: sFriendly.npcInjuries,
          rank:  hit ? hit.rank : null,
          total: hit ? totalTeams : null,
          record: hit
            ? `${hit.row.wins}승 ${hit.row.losses}패${hit.row.draws ? ` ${hit.row.draws}무` : ""}`
            : null,
          leagueId: proto.leagueId,
        });
      };
      const noticeMsg = buildMonthlyNoticeMessage(
        plan, officialThisMonth, weekNum, sFriendly.seasonYear, teamMap, briefOf,
      );
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
      const res = await settleSemester(acaRules, {
        qualityAccum: sc.semesterQualityAccum ?? 0,
        weeks: sc.semesterWeeks ?? 0,
        priorCumulative: sc.universityGpa ?? 0,
        semestersDone: (sc.semesterGpaHistory?.length ?? 0) + 1,
        warningLevel: sc.academicWarningLevel ?? 0,
        major: sc.universityMajor,
      });
      gameStore.applySemesterResult(res, examType, s.seasonYear);
      // 대학은 학점 하나다 — 눈금이 0~4.5 라 문안도 `byStage.university` 다
      gameStore.addMessage(makeExamMessage(s.seasonYear, weekNum, res.messageSubject, res.messageBody,
        semesterBarsMeta(res.gpa, res.cumulativeGpa)));
      logs.push(`[학업] ${res.messageSubject} (학점 ${res.gpa.toFixed(2)} / 누적 ${res.cumulativeGpa.toFixed(2)})`);
      if (res.repeats) logs.push("[학업] 유급 — 졸업이 한 해 밀린다");
    } else {
      // ⚠ **씨앗을 넘긴다.** 시험 결과가 내신 등급→대학 진학을 정하므로,
      //   안 넘기면 같은 씨앗이어도 주인공이 대학에 갔다 말았다 한다.
      const examRes = await calcExamResult(
        gAfterStudy.schoolState.examAccumScore, gAfterStudy.schoolState.warningCount, examType,
        seedOf(get(seasonStore).worldSeed ?? 0, get(seasonStore).seasonYear, weekNum, "exam", examType));
      gameStore.applyExamResult(examRes);
      // 고교는 과목 백분위 다섯 — 이름은 문안(`bars.exam.subjects`)이 붙인다
      gameStore.addMessage(makeExamMessage(s.seasonYear, weekNum, examRes.messageSubject, examRes.messageBody,
        examBarsMeta(gAfterStudy.schoolState.subjectScores)));
      logs.push(`[시험] ${examRes.messageSubject}`);
    }
  }

  // ── 진로 허브·진학 확정 — `weekPhases/careerHub.ts` (2026-09-30 · Ⅱ-1) ─
  //
  // ⚠ 자리는 그대로다 — 시험 이벤트 **뒤**, 프로 트레이드 윈도우 **앞**이다.
  //   셋(허브 트리거 · 결과 계산 · 배경 졸업생 드래프트)이 한 덩이인 이유는
  //   가운데가 세우는 주차 판정 셋을 마지막 절이 읽기 때문이다 — 갈라 놓으면
  //   그 셋이 정본 둘이 된다(그 파일 머리말).
  await runCareerHubWeek({ weekNum, weekInYear, careerStageYear, s, g, logs });

  // ── 계약·시장 — `weekPhases/offseasonMarket.ts` (2026-09-30 · Ⅱ-1) ─
  //
  // ⚠ 자리는 그대로다 — 진로 확정 **뒤**, 업적 체크 **앞**이다. 트레이드
  //   윈도우와 오프시즌 블록을 한 덩이로 옮긴 것은 둘이 같은 주차 상수
  //   (`STOVE_LEAGUE_WEEK`)를 공유하고 순서에 뜻이 있어서다.
  // 🔴 **참이면 이 주에서 끝낸다**(은퇴 권고). 옮기기 전 그 자리에 있던
  //   `return logs` 하나에 대응한다 — 안 받으면 권고가 떠도 주가 흘러간다.
  if (await runOffseasonMarketWeek({ weekNum, weekInYear, m, logs })) return logs;

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

  // ── 관계도 갱신 — `weekPhases/relations.ts` (2026-09-27 · Ⅱ-1) ─
  //
  // ⚠ 자리는 그대로다. 옛 블록은 여기서 통째로 돌았고 지금도 같은 자리에서
  //   같은 순서로 돈다 — 배경 리그 시뮬 **전**이어야 한다(그 뒤로 옮기면
  //   이번 주 경기 결과가 이미 다음 주 것으로 바뀌어 있다).
  await runRelationsWeek(weekNum, ovrDeltaThisWeek, myMods);

  // ── 배경 리그 시뮬레이션 (await — 월간 메시지 전 완료 보장) ────
  const bgEntities = get(masterStore).entities;
  await processNpcInjuries(weekNum);
  // 포지션 공백 — **부상으로 포수가 빠진 그 주에 바로 메운다.** 예전엔 메우는
  // 경로가 오프시즌에만 있어 공백이 다음 해까지 갔다(실측 1~4팀이 포수 0명)
  for (const line of await processPositionGaps(get(seasonStore).seasonYear)) autoLog(line);
  // 등번호 — **유입 경로가 여럿이라 여기 한 곳에 모았다.** 신입생·육성선수·
  // 해외·드래프트·FA 이적이 각각 선수를 팀에 넣는데 번호를 주는 곳은
  // 초기 생성뿐이었다(실측: 238팀 전부 중복 · 한 번호 최대 45명).
  // ⚠ 문제 있는 팀이 없으면 IPC 를 아예 안 탄다.
  for (const line of await processJerseyNumbers()) autoLog(line);
  // 전지훈련 (4단계) — **시즌 초 몇 주만** 컨디션이 더 붙는다.
  // ⚠ 값은 규칙 파일이 정본(`campRules`). 없으면 안 돈다 — 예전 동작이다.
  {
    const camp = (await loadRosterRules() as unknown as
      { campRules?: { conditionBonus?: number; weeks?: number } }).campRules;
    let campBonus: Record<string, number> | undefined;
    if (camp?.conditionBonus && weekInYear <= (camp.weeks ?? 0)) {
      // 전훈비는 **규모 비례**라 부자 구단이 유리하다 — 현실도 그렇다.
      // 규모 지수를 그대로 쓰지 않고 성향(`farmInvestment`)으로 가른다:
      // 육성에 투자하는 구단이 캠프도 잘 차린다.
      const gNow = get(gameStore);
      const mNow = get(masterStore);
      campBonus = {};
      for (const n of gNow.npcs ?? []) {
        const tid = n.currentTeam ?? "";
        if (!tid) continue;
        const inv = getTeamProfile(tid, gNow)?.farmInvestment ?? 50;
        // ⚠ 식은 `clubEffects` 한 곳에 — 팀 상세가 같은 함수를 쓴다
        campBonus[n.npcId] = campConditionBonus(inv, camp.conditionBonus);
      }
    }
    seasonStore.applyWeeklyConditionRecovery(bgEntities, campBonus);
  }
  await seasonStore.simulateBackgroundLeaguesAsync(weekNum, gFinal.protagonist.leagueId, bgEntities, gFinal.protagonist.careerStage);
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

    // ⚠ 관계도와 **같은 한 칸 어긋남**이었다. 위 주석대로 "전주"가 맞는데
    // 필터는 `weekNum`을 봤다 — 막 들어선 주라 결과가 없어서 이 소식은
    // **한 통도 온 적이 없다**(실측 `measure:relations`, `league-results` 0건).
    const myGames = sAfterSim.schedule.filter((e) => e.week === weekNum - 1 && !e.isProtagonistGame && !!e.result);
    if (myGames.length > 0) {
      const leagueName = LEAGUE_NAMES[gFinal.protagonist.leagueId] ?? gFinal.protagonist.leagueId;
      const monthLabel = weekToMonthLabel(weekNum);
      const lines = myGames.map((e) => {
        const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
        const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
        const r = e.result!;
        return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
      });
      // 🔴 **본문은 한 줄이다** (U6② · 2026-09-07 · 사용자). 값은 아래 표가
      //   든다 — 본문에도 같은 줄을 실으면 화면에 **두 번** 나온다.
      //   2026-09-04 에 다른 다섯 자리를 이 규칙으로 줄였는데(`dashboardMeta34`
      //   §본문) 여기만 **본문에 값 줄밖에 없어** 남길 문장이 없었다.
      //   새 말을 짓지 않는 규칙이라 미뤘고, 이제 문안이 그 한 줄을 갖는다
      //   (`dashboard_labels.json` `table.leagueResults.lead`).
      //
      // ⚠ **폴백은 문안이 없을 때만이다.** 문안을 못 읽으면 빈 본문이 되어
      //   소식함에서 「내용 없음」과 구분이 안 된다 — 그때만 값 줄을 남긴다.
      const lead = tableCopy(mFinal.dashboardLabels, "leagueResults").lead;
      gameStore.addMessage({
        id: `msg-league-results-${sFinal.seasonYear}-w${weekNum}`,
        category: "system",
        sender: "리그 사무국",
        subject: `${monthLabel} ${leagueName} 경기 결과`,
        preview: lines[0] ?? "",
        body: lead || lines.join("\n"),
        // 경기마다 열이 같다 — 표로도 싣는다 (PLAN_MESSAGE_DASHBOARDS §1-1 · 묶음 2).
        // ⚠ **본문 줄 순서(원정 먼저)와 표 열 순서(홈 먼저)가 다르다.** 열 순서는
        //   문안이 정한다 — 본문을 표에 맞춰 고치면 텍스트 폴백이 바뀐다
        metadata: gameResultsTableMeta(myGames.map((e) => ({
          homeName: teamById.get(e.homeTeamId) ?? e.homeTeamId,
          awayName: teamById.get(e.awayTeamId) ?? e.awayTeamId,
          homeScore: e.result!.homeScore,
          awayScore: e.result!.awayScore,
          mine: e.homeTeamId === gFinal.protagonist.teamId
             || e.awayTeamId === gFinal.protagonist.teamId,
        }))),
        createdAt: `W${weekNum}`,
        readAt: null,
      });
    }
  }

  // ── 야구계 소식 (통합 다이제스트) ────────────────────────────
  //
  // **같은 성격의 소식 네 갈래를 한 통으로 합쳤다** (2026-08-08).
  // 실측 `measure:messagekinds` 6시즌 기준 고교 62.3통/시즌 · 프로 28.0통/시즌:
  //
  //   msg-neighbor   고교 매주      무작위 1권역+1리그 선두 두 줄
  //   msg-myrank     고교 월 1회    내 권역·전국 순위
  //   msg-hs-digest  고교2~3 분기   5리그 선두/최하위 + 스카우트
  //   msg-standings  프로 4주마다   리그당 한 통, 전체 순위표
  //
  // 넷이 각자 주기를 들고 있어 네 박자로 왔고, **제일 잘 만든 형식(다이제스트)이
  // 고교 2~3학년에만** 있었다. 프로가 되면 리그당 한 통으로 다시 쪼개지면서
  // 정작 내 리그는 안 왔다(`lid === myLeagueId`로 건너뛰었다).
  if (DIGEST_WEEKS.has(weekInYear)) {
    const sAfterSim = get(seasonStore);
    const teamById  = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    // 권역 표시명은 refs의 구장 이름에서 나온다 — 손으로 표를 만들면 빠뜨린다.
    // "한라구장" 그대로면 "한라구장 3위"가 되어 어색하니 접미를 권역으로 바꾼다
    const stadiumById = new Map(mFinal.stadiums.map((x) => [x.id, x.name]));

    // ⚠ 시즌이 끝난 리그는 빼야 한다 — 안 그러면 겨울에도 순위표가 온다.
    // 기존 월간 순위표에 있던 `lastGameWeek` 게이트를 그대로 옮긴 것이다
    const isLeagueActive = (lid: string) => {
      const sched = sAfterSim.leagueSchedules[lid] ?? [];
      const lastGameWeek = sched.reduce((mx, e) => Math.max(mx, e.week), 0);
      return lastGameWeek === 0 || weekInYear <= lastGameWeek;
    };

    const digest = buildLeagueDigest({
      weekNum,
      seasonYear: sAfterSim.seasonYear,
      monthLabel: weekToMonthLabel(weekNum),
      careerStage: gFinal.protagonist.careerStage,
      hsGrade: gFinal.protagonist.careerStage === "highschool"
        ? (gFinal.protagonist.grade ?? 1) : undefined,
      myTeamId:   gFinal.protagonist.teamId,
      myLeagueId: gFinal.protagonist.leagueId,
      leagueState: sAfterSim.leagueState,
      // ⚠ **내 리그 순위표는 여기 있다.** `leagueState`엔 내가 안 뛰는 리그만
      // 들어 있어서, 거기서 읽으면 프로 다이제스트에 내 순위가 통째로 빠진다
      myStandings: sAfterSim.standings,
      teamName: (id: string) => teamById.get(id) ?? id,
      regionName: (id: string) => {
        const nm = stadiumById.get(id);
        return nm ? `${nm.replace(/구장$/, "")}권역` : `${id.replace(/^STADIUM_/, "")}권역`;
      },
      scoutScore: gFinal.protagonist.scoutScore ?? 0,
      isLeagueActive,
      // 지난 달 순위 — 변동 열의 재료 (PLAN_MESSAGE_DASHBOARDS §3-1 (나)).
      // 첫 달·첫 시즌엔 없고, 그러면 변동을 아예 안 그린다
      prevStandings:
        sAfterSim.standingsSnapshots?.[gFinal.protagonist.leagueId]?.last_digest,
    });
    if (digest) {
      gameStore.addMessage(digest);
      // 🔴 **소식을 보낸 뒤에 덮는다.** 앞에 두면 이번 달 순위와 자기 자신을
      //   견주게 되어 변동이 늘 0 이다. 안 보낸 달은 안 덮는다 — 다음 달이
      //   「마지막으로 본 순위」와 견주는 게 맞다
      seasonStore.captureStandingsSnapshot("last_digest", gFinal.protagonist.leagueId);
    }
  }

  // ── 월간 부상 리포트 ────────────────────────────────────────
  //
  // ⚠ **커리어 단계를 안 가린다.** 다이제스트도 이제 안 가리지만, 부상은
  // 주기가 다르다 — 같은 학교 동료가 빠지면 내 출전이 바뀐다.
  if (isInjuryNewsWeek(weekInYear)) {
    const buffered = seasonStore.drainInjuryNews();
    const news = buildInjuryNews({
      events: buffered, weekNum, weekInYear,
      season: get(seasonStore), monthLabel: weekToMonthLabel(weekNum),
      subjectBank: { copy: mFinal.reportCopy, picker: reportPicker },
    });
    if (news) gameStore.addMessage(news);

    // ── 주인공 몸 상태 (같은 주기) ──────────────────────────────
    //
    // ⚠ **버퍼를 반드시 비운다.** 리포트를 안 보내도(담을 게 없어 null이어도)
    // drain은 해야 한다 — 안 그러면 다음 달 리포트에 지난달 경고가 섞인다.
    const myEvents = seasonStore.drainMyBodyEvents();
    const inj = gFinal.protagonist.injury;
    const teamByIdMB = new Map(mFinal.teams.map((t) => [t.id, t.name]));
    const myBody = buildMyBodyReport(
      myEvents,
      inj
        ? {
            injuryType: inj.type, severity: inj.severity,
            recoveryWeeksLeft: inj.recoveryWeeksLeft,
            // ⚠ `InjuryState`에 **발생 주차가 없다.** 지어내지 않고 전체 기간에서
            // 되짚는다 — 치료로 기간이 바뀌면 어긋날 수 있어 표시만 쓴다
            sinceWeek: Math.max(1, weekNum - (inj.totalRecoveryWeeks - inj.recoveryWeeksLeft)),
          }
        : null,
      weekNum,
      sFinal.seasonYear,
      weekToMonthLabel(weekNum),
      (id) => teamByIdMB.get(id) ?? id,
      { copy: mFinal.reportCopy, picker: reportPicker },
    );
    if (myBody) gameStore.addMessage(myBody);
  }

  // 🔴 **뽑은 인덱스를 세이브로 되돌린다** (C2). 안 되돌리면 「직전 제외」가
  //   매주 초기화돼 같은 제목이 연속으로 난다 — 이벤트 본문 은행이
  //   `recordSentencePicks` 로 먼저 그은 선이고, 같은 칸을 쓴다.
  // ⚠ **위 세 리포트를 다 만든 뒤다.** 앞에 두면 이번 주 훈련 제목만 남고
  //   부상·내 몸이 뽑은 것은 안 남는다.
  if (Object.keys(reportPicker.picks).length > 0) {
    seasonStore.recordSentencePicks(reportPicker.picks);
  }

  // ── 코치 리포트 — `weekPhases/coachReport.ts` (2026-09-30 · Ⅱ-1) ─
  //
  // ⚠ 자리는 그대로다 — 주간 진행의 **마지막** 절이다. 스냅샷 셋을 넘기는 것은
  //   「업적 체크」 자리에서 읽은 값을 그대로 보여 주기 위해서다. 안에서 다시
  //   읽으면 관계도·배경 시뮬이 바꾼 뒤 값이 되어 뜻이 바뀐다.
  runCoachReport({ weekNum, weekInYear, gFinal, sFinal, mFinal });

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
  /** 이번 주 대회 「진출 명단」 — 주가 끝난 뒤 한 통으로 묶는다(아래 flush) */
  const accTourRoundNews: MessageItem[] = [];
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
  //
  // 🔴 **자리를 옮겼다** (2026-09-21 · A-4). 이 블록은 이번 구간에 두 번
  //   고쳐졌고(체육부대 계수기 · 28세 경고 문안) 그때마다 3,800줄 안에서
  //   찾아야 했다. 로직은 한 줄도 안 바꿨다 — `weekPhases/military.ts`.
  // ⚠ `handleSeasonEnd` 를 **넘긴다.** 거기서 import 하면 서로를 물어 순환이다.
  {
    const milWeek = await runMilitaryServiceWeek(handleSeasonEnd);
    if (milWeek) return milWeek;
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
  // 넷 다 주를 안 넘기고 pending 만 민다 — 가드는 `weekPhases/military.ts` 안에.
  {
    const milTrigger = await runMilitaryTriggers();
    if (milTrigger) return milTrigger;
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
              const sim = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              const result = sim.result;
              if (game.isFriendly) {
                const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
                await recordGameResult({
                  kind: "friendly",
                  scheduleId: game.id,
                  result: result,
                  leagueId: gCurrent.protagonist.leagueId,
                  homeTeamId: game.homeTeamId,
                  awayTeamId: game.awayTeamId,
                  nextHomeRotIdx: sim.nextHomeRotIdx,
                  nextAwayRotIdx: sim.nextAwayRotIdx,
                  pitcherConditions: sim.pitcherConditions,
                  gameDate: game.gameDate,
                });
              } else {
                await recordGameResult({
                  kind: "league",
                  scheduleId: game.id,
                  result: result,
                  leagueId: gCurrent.protagonist.leagueId,
                  nextHomeRotIdx: sim.nextHomeRotIdx,
                  nextAwayRotIdx: sim.nextAwayRotIdx,
                  pitcherConditions: sim.pitcherConditions,
                  homeTeamId: game.homeTeamId,
                  awayTeamId: game.awayTeamId,
                  gameDate: game.gameDate,
                });
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
              // 브리핑은 정지 조건이 아니다 — 위 주석 참고
              const gameAction: PendingAction = { type: "game", scheduleId: game.id };
              seasonStore.pushPendingAction(gameAction);
              gameStore.save(); seasonStore.save();
              return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: gameAction };
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
                phase: game.phase,
                // 🔴 넉아웃은 무승부가 나면 대진이 죽는다 (`isKnockoutGame` 머리말)
                knockout: isKnockoutGame(game.id),
                worldSeed: get(seasonStore).worldSeed, scheduleId: game.id,
                npcInjuries: get(seasonStore).npcInjuries,
                // ⚠ **leagueId를 넘긴다.** 안 넘기면 리그별 분기(C-4 풀 엔진 전환·투구수
                // 상한)가 통째로 안 걸린다 — 값이 있고 타입도 맞아 조용히 옛 경로로 돈다
                leagueId: game.leagueId ?? gCurrent.protagonist.leagueId,
                rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
                npcLiveStats: get(npcLiveStatsStore),
                tradeAdaptationPenalty: _tradeWeeks2 > 0
                  ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeks2 }
                  : undefined,
              });
              npcResult2 = sim2.result; nextHomeRot2 = sim2.nextHomeRotIdx; nextAwayRot2 = sim2.nextAwayRotIdx; pitcherConds2 = sim2.pitcherConditions;
              await logGameLines(npcResult2, game.homeTeamId, game.awayTeamId);   // simulateGame 직행 갈래 — 여기서 안 부르면 이 경기만 기록이 빈다
            } else {
              { const _s = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              npcResult2 = _s.result; nextHomeRot2 = _s.nextHomeRotIdx; nextAwayRot2 = _s.nextAwayRotIdx; pitcherConds2 = _s.pitcherConditions; }
            }
            if (game.isFriendly) {
              await recordGameResult({
                kind: "friendly",
                scheduleId: game.id,
                result: npcResult2,
                leagueId: leagueId2,
                homeTeamId: game.homeTeamId,
                awayTeamId: game.awayTeamId,
                nextHomeRotIdx: nextHomeRot2,
                nextAwayRotIdx: nextAwayRot2,
                pitcherConditions: pitcherConds2,
                gameDate: game.gameDate,
              });
            } else {
              await recordGameResult({
                kind: "group",
                scheduleId: game.id,
                result: npcResult2,
                leagueId: leagueId2,
                homeTeamId: game.homeTeamId,
                awayTeamId: game.awayTeamId,
                nextHomeRotIdx: nextHomeRot2,
                nextAwayRotIdx: nextAwayRot2,
                pitcherConditions: pitcherConds2,
                gameDate: game.gameDate,
              });
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
              conditions, homeRotIdx, awayRotIdx, week: game.week, phase: game.phase,
              // 🔴 넉아웃은 무승부가 나면 대진이 죽는다 (`isKnockoutGame` 머리말)
              knockout: isKnockoutGame(game.id),
              worldSeed: get(seasonStore).worldSeed, scheduleId: game.id,
              npcInjuries: get(seasonStore).npcInjuries,
              // ⚠ **leagueId를 넘긴다.** 안 넘기면 리그별 분기(C-4 풀 엔진 전환·투구수
              // 상한)가 통째로 안 걸린다 — 값이 있고 타입도 맞아 조용히 옛 경로로 돈다
              leagueId: game.leagueId ?? gCurrent.protagonist.leagueId,
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
          await logGameLines(npcResult, game.homeTeamId, game.awayTeamId);   // simulateGame 직행 갈래
          } else {
            { const _s = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              npcResult = _s.result; nextHomeRotIdx = _s.nextHomeRotIdx; nextAwayRotIdx = _s.nextAwayRotIdx; pitcherConds = _s.pitcherConditions; }
          }

          if (game.isFriendly) {
            await recordGameResult({
              kind: "friendly",
              scheduleId: game.id,
              result: npcResult,
              leagueId: leagueId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              nextHomeRotIdx: nextHomeRotIdx,
              nextAwayRotIdx: nextAwayRotIdx,
              pitcherConditions: pitcherConds,
              gameDate: game.gameDate,
            });
          } else {
            await recordGameResult({
              kind: "group",
              scheduleId: game.id,
              result: npcResult,
              leagueId: leagueId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              nextHomeRotIdx: nextHomeRotIdx,
              nextAwayRotIdx: nextAwayRotIdx,
              pitcherConditions: pitcherConds,
              gameDate: game.gameDate,
            });
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
    //
    // 🔴 **내 리그가 빠져 있었다** (2026-09-03 실측 · A 단위 5).
    //   `captureStandingsSnapshot` 은 `leagueState` 를 훑는데 **거기엔 내
    //   리그가 없다**(`digest.myStandings` 주석 · `postseason.ts` 머리말) —
    //   주인공 리그 순위표는 `s.standings` 에 따로 있다. 그래서 고교에
    //   있는 동안 `first_half`·`second_half_base` 가 **한 번도 안 찍혔고**,
    //   `standingsForSeed` 가 스냅샷을 못 찾아 늘 **현재 누적 순위**로
    //   떨어졌다. 장미기·무궁화기(전반기 시드)와 패왕기(후반기 시드)가
    //   시점을 보는 기능이 통째로 죽어 있었다는 뜻이다.
    //   ⚠ 시드가 바뀌면 대회 진출 조합이 바뀐다 — BALANCE_BACKLOG 에 적었다.
    {
      const key = snapshotDueAt(nextWeekNum);
      if (key) {
        seasonStore.captureStandingsSnapshot(key, get(gameStore).protagonist.leagueId);
      }
    }

    // 독립 생존리그 단계 진행 (Phase 5-6)
    await progressIndependentLeague(nextWeekNum);

    // 대회 개막 라운드를 먼저 얹는다 (Phase 5-4)
    await progressTournaments(nextWeekNum, accTourRoundNews);

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
      // 1.1 A④ §5 — 고른 자리에서 몇 칸 밖인가. 0 이면 아래 두 판정이 예전 그대로 돈다
      const depthR         = roleDepthOf(gCurrent.protagonist.roleFit, gCurrent.protagonist.startGuaranteeGames);
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
          // §5-b — 자리 밖이면 등판 확률이 그만큼 깎인다
          depthR,
        );

      // ── §5-a 선발 등판 건너뛰기 ────────────────────────────────
      // 로테이션 자리 밖 선발은 그 주를 건너뛴다. 건너뛰면 아래 `else` 갈래(`simulateGame`)로
      // 떨어져 **팀·동료 기록이 정상으로 남는다** — MainPage 회피 갈래(`playerLines: []`)로 보내지 않는다.
      // ⚠ 깊이 0 이면 엔진을 아예 안 부른다 — 경기마다 IPC 를 한 번 더 쓰지 않는다.
      const starterSkips =
        depthR.roleDepth > 0 &&
        game.isProtagonistGame &&
        isTeamGame &&
        gCurrent.protagonist.playerType === "pitcher" &&
        !!currentRole &&
        !isReliefsRole(currentRole) &&
        !(await starterWouldStart(depthR, seedOf(
          sForReliever.worldSeed ?? 0, sForReliever.seasonYear, nextWeekNum, "starter-start", game.id)));

      if ((game.isProtagonistGame && !starterSkips) || relieverPitching) {
        const eligibilityBlocked = gCurrent.schoolState.eligibilityBlocked;
        const isInjured          = !!gCurrent.protagonist.injury;
        const cond               = gCurrent.protagonist.condition;

        if (eligibilityBlocked) {
          // 학사 경고 → 자동 시뮬
          gameStore.clearEligibilityBlock();
          const sim = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              const result = sim.result;
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            await recordGameResult({
              kind: "friendly",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              gameDate: game.gameDate,
            });
          } else {
            await recordGameResult({
              kind: "league",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              gameDate: game.gameDate,
            });
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("학사 경고로 인해 경기 출전 불가");
        } else if (isInjured) {
          // 부상 중 → 자동 시뮬 + 메시지
          const sim = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              const result = sim.result;
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            await recordGameResult({
              kind: "friendly",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              gameDate: game.gameDate,
            });
          } else {
            await recordGameResult({
              kind: "league",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              gameDate: game.gameDate,
            });
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("부상으로 인해 경기 출전 불가");
          // 월간 몸 상태 리포트로 모은다 (낱개 소식 대신)
          seasonStore.pushMyBodyEvent({
            week: nextWeekNum, kind: "absence", reason: "injury",
            opponentTeamId: game.homeTeamId === gCurrent.protagonist.teamId
              ? game.awayTeamId : game.homeTeamId,
          });
        } else if (cond < 35) {
          // 컨디션 극히 낮음 → 자동 회피 + 메시지
          const sim = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              const result = sim.result;
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            await recordGameResult({
              kind: "friendly",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              gameDate: game.gameDate,
            });
          } else {
            await recordGameResult({
              kind: "league",
              scheduleId: game.id,
              result: result,
              leagueId: gCurrent.protagonist.leagueId,
              nextHomeRotIdx: sim.nextHomeRotIdx,
              nextAwayRotIdx: sim.nextAwayRotIdx,
              pitcherConditions: sim.pitcherConditions,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              gameDate: game.gameDate,
            });
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push(`컨디션 불량(${cond})으로 등판 회피`);
          seasonStore.pushMyBodyEvent({
            week: nextWeekNum, kind: "absence", reason: "condition", condition: cond,
            opponentTeamId: game.homeTeamId === gCurrent.protagonist.teamId
              ? game.awayTeamId : game.homeTeamId,
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

          // ⚠ **브리핑은 더 이상 정지 조건이 아니다.** 예전엔 경기 앞에
          // `preGameBriefing`을 같이 push해서 매 경기 창을 하나 더 닫아야
          // 넘어갔다 — 그 사이 쌓인 소식은 볼 기회가 없었다. 지금은 경기
          // 창에서 열어보는 창이다 (사용자 확정 2026-08-07)
          const gameAction: PendingAction = { type: "game", scheduleId: game.id };
          seasonStore.pushPendingAction(gameAction);
          gameStore.save(); seasonStore.save();
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: gameAction };
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
            conditions, homeRotIdx, awayRotIdx, week: game.week, phase: game.phase,
            // 🔴 넉아웃은 무승부가 나면 대진이 죽는다 (`isKnockoutGame` 머리말)
            knockout: isKnockoutGame(game.id),
              worldSeed: get(seasonStore).worldSeed, scheduleId: game.id,
            npcInjuries: get(seasonStore).npcInjuries,
            // ⚠ **leagueId를 넘긴다.** 안 넘기면 리그별 분기(C-4 풀 엔진 전환·투구수
            // 상한)가 통째로 안 걸린다 — 값이 있고 타입도 맞아 조용히 옛 경로로 돈다
            leagueId: game.leagueId ?? gCurrent.protagonist.leagueId,
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
          await logGameLines(npcResult, game.homeTeamId, game.awayTeamId);   // simulateGame 직행 갈래
        } else {
          { const _s = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              npcResult = _s.result; nextHomeRotIdx = _s.nextHomeRotIdx; nextAwayRotIdx = _s.nextAwayRotIdx; pitcherConds = _s.pitcherConditions; }
        }

        if (game.isFriendly) {
          // 친선경기 → 순위·통계 미반영, rotationIndex만 갱신
          await recordGameResult({
            kind: "friendly",
            scheduleId: game.id,
            result: npcResult,
            leagueId: leagueId,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            nextHomeRotIdx: nextHomeRotIdx,
            nextAwayRotIdx: nextAwayRotIdx,
            pitcherConditions: pitcherConds,
            gameDate: game.gameDate,
          });
        } else if (game.isTournament) {
          // 전국대회 → 개인 기록만. 순위표에 섞이면 다음 대회 시드가 오염된다
          await recordGameResult({
            kind: "tournament",
            scheduleId: game.id, result: npcResult, leagueId,
            homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx, pitcherConditions: pitcherConds,
            gameDate: game.gameDate,
          });
        } else {
          await recordGameResult({
            kind: "group",
            scheduleId: game.id,
            result: npcResult,
            leagueId: leagueId,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            nextHomeRotIdx: nextHomeRotIdx,
            nextAwayRotIdx: nextAwayRotIdx,
            pitcherConditions: pitcherConds,
            gameDate: game.gameDate,
          });
          applyPostseasonResult(game.id, npcResult);
        }
        accResults.push(npcResult);
        accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
      }
    }

    // 방금 끝난 라운드로 다음 대진이 열리면 한 번 더 돈다.
    // 상한 20 = 국화기 7R + 여유. 무한 루프 방지용이지 정상 경로에서 닿지 않는다.
    if (pass >= 20 || !(await progressTournaments(nextWeekNum, accTourRoundNews))) break;
    }

    // ── 이번 주 대회 「진출 명단」을 한 통으로 (2026-09-08) ──────
    //
    // 🔴 **여기가 유일하고 자연스러운 자리다.** 위 `pass` 루프가 그 주의 대회
    //   라운드를 다 닫은 뒤라 「이번 주 대회 소식」이 그제야 성립한다.
    // ⚠ 한 통이면 안 묶는다 — 묶음 제목이 붙어 오히려 읽기 나빠진다.
    // ⚠ 표는 안 버린다: 「진출 명단」은 전부 같은 `tourRound` 표라 행을 이어
    //   붙이면 그대로 산다(`bundleRoundProgressMessages` 머리말).
    {
      const bundled = bundleRoundProgressMessages(
        accTourRoundNews, get(seasonStore).seasonYear, nextWeekNum);
      if (bundled) gameStore.addMessage(bundled);
      else for (const m of accTourRoundNews) gameStore.addMessage(m);
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
