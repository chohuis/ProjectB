import {
  TRADE_DEADLINE_WEEK, HS_CAREER_HUB_WEEK, UNIV_CAREER_HUB_WEEK,
  INDIE_CAREER_HUB_WEEK, INDIE_SEASON_REVIEW_WEEK,
  CAREER_RESULT_WEEK,
  OFFSEASON_START_WEEK, STOVE_LEAGUE_WEEK,
  FA_RETRY_START_WEEK, FA_RETRY_END_WEEK,
  SPORTS_UNIT_CANDIDATES_WEEK, MILITARY_RESULT_WEEK, MILITARY_AGE_WARNING_WEEK,
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
import { applyWeeklyRelations, reconcileRelationships, relationEffects, trainingAreaOf } from "./relationships";
import { slotRepo } from "../repo/slotRepo";
import { buildRelationMessages } from "../utils/relationMessages";
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
import { HS_REGIONS } from "../utils/leagueScheduler";
import { buildMyBodyReport } from "./weekPhases/myBodyReport";
import { runNationalTeamWeek } from "./nationalTeam";
import { runCampusEventsWeek } from "./campusEvents";
import { enlistProtagonist, dischargeProtagonist } from "./militaryDecision";
import { runMilitaryLifeWeek } from "./militaryLife";
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
import {
  buildKblBracket, buildAblBracket, buildIndLadder, buildJblBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";
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
import {
  collectTournamentLines, tournamentAwards, weekRangeOf,
} from "./tournamentAwards";
import { simulateNpcGame, logGameLines } from "./weekPhases/games";
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
  pitcherSeasonTableMeta, gameResultsTableMeta, rankListMeta, coachReportTableMeta,
  examBarsMeta, semesterBarsMeta, cardsMeta,
} from "../utils/dashboardMeta";
import { applyRoundResults, missingRoundEntries, openTournamentsForWeek, promoteFinishedGroupStages } from "./tournaments";
import { TOURNAMENTS } from "../utils/tournament";
import {
  buildOpenMessage, buildMyRoundMessage, buildChampionMessage, buildRoundProgressMessage,
} from "./weekPhases/tournamentNews";
import { progressSurvival } from "./survivalLeague";
import { runBackgroundPostseasons } from "./backgroundPostseason";
import { winnerById, scheduledIdSet } from "../utils/scheduleView";
import { buildInjuryNews, isInjuryNewsWeek } from "./weekPhases/injuryNews";
import { IND_LEAGUE_ID, emptySurvivalState } from "../utils/survivalLeague";
// 팀 목록의 정본 — 생존리그 순위 모수를 **리그 전체**로 고정한다
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
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
        id: `msg-season-brief-${Date.now()}`,
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
        id: `msg-season-brief-${Date.now()}`,
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
        const roll = (JSON.parse(await window.projectB!.weekRollRandomBatch(1)) as number[])[0] ?? 1;
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
  const trainingMsg = makeTrainingMessage(weekNum, growth.logs, afterP, coachName);

  // 이벤트 엔진 (미리 계산된 eventRands 사용)
  const updatedUniversityWeek = isUniversity ? (g.schoolState.universityWeek + 1) : (g.schoolState.universityWeek ?? 0);
  const careerStageYear = calcCareerStageYear(afterP, weekNum, updatedUniversityWeek);
  const eventCtx: EventContext = {
    protagonist:     afterP,
    currentWeek:     weekNum,
    // 전역 뒤 경과(`weeksSinceDischarge`)가 시즌을 넘어 세려면 연도가 있어야 한다 (B-20 재회)
    seasonYear:      s.seasonYear,
    seasonPhase:     s.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    // 🔴 **주인공 리그를 명시해 읽는다** (2026-09-01).
    //
    // `s.standings`는 "지금 열려 있는 시즌"의 순위표인데, **진로가 바뀌고
    // 새 시즌이 열리기 전까지 옛 리그 것**이다. `applyDraftDecision`이
    // `careerStage`·`leagueId`를 먼저 바꾸고, `openProSeason`(→`initSeason`)은
    // 계약 수락 뒤에야 불린다 — 그 사이 주가 흐르면 **주인공이 독립인데
    // 순위표는 고교 102팀**이다.
    //
    // 실측(트랙 B · `rankCtxProbe`): 독립 주인공의 `s.standings`가 102팀이고
    // **그 안에 주인공 팀이 없었다**(`top_순위 = 0`). `team_rank` 조건은
    // 팀을 못 찾으면 **조용히 false**다 — 오류도 로그도 없다.
    //
    // ⚠ `leagueState`는 `initAllLeaguesV3`가 전 리그를 미리 채우므로
    // 그 창에서도 옳다. 없을 때만 `s.standings`로 떨어진다(구 세이브).
    standings:       s.leagueState?.[afterP.leagueId]?.standings ?? s.standings,
    stats:           s.stats,
    triggeredEvents: s.triggeredEvents,
    sentenceMemory: s.sentenceMemory ?? {},
    // 대학 이벤트가 학점·경고를 조건으로 읽는다 (Phase 9-C).
    // **`get(gameStore)`로 최신을 읽는다** — 이번 주 학점 누적이 반영돼야 한다
    schoolState: get(gameStore).schoolState,
    // 관계도 조건이 읽는다 — 안 실으면 `relation_gte`/`relation_lte`가 항상 false다
    relations: relRows,
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

    // 팀 이름은 `refs.json`이 정본이다 — 예전엔 top10Engine 안에 옛 16팀 표가
    // 박혀 있어 나머지 팀은 ID가 그대로 문구에 찍혔다
    const teamNameOf = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;
    top10Snap = await generateTop10(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      weekNum,
      afterP.grade ?? 1,
      s.seasonYear,
      teamNameOf,
    );
    top10Msg = await buildTop10Message(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      top10Snap,
      last,
      weekNum,
      s.seasonYear,
      teamNameOf,
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
        plan, officialThisMonth, weekNum, teamMap, briefOf,
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
      gameStore.addMessage(makeExamMessage(weekNum, res.messageSubject, res.messageBody,
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
      gameStore.addMessage(makeExamMessage(weekNum, examRes.messageSubject, examRes.messageBody,
        examBarsMeta(gAfterStudy.schoolState.subjectScores)));
      logs.push(`[시험] ${examRes.messageSubject}`);
    }
  }

  // 진로허브 트리거 — 스테이지별 시즌 종료 직후
  // **각 무대의 결승 직후다.** 주차는 `utils/seasonWeeks`가 정본이다 —
  // 예전엔 여기 숫자가 박혀 있어서 캘린더를 바꾸면 조용히 안 일어났다
  const gLatest = get(gameStore);
  const needsHsHub =
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 && weekInYear === HS_CAREER_HUB_WEEK &&
    !gLatest.schoolState.careerChoiceTriggered;
  const needsUnivHub =
    gLatest.protagonist.careerStage === "university" &&
    weekInYear === UNIV_CAREER_HUB_WEEK &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) => a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice"
    );
  const needsIndieHub =
    gLatest.protagonist.careerStage === "independent" &&
    weekInYear === INDIE_CAREER_HUB_WEEK &&
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

  // 진로 결과 계산 — 드래프트 마감 후 전 스테이지 동시 발표
  const gDraft = get(gameStore);
  const hasCareerPending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub" || a.type === "careerResults"
  );

  const isHsResultWeek =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear === CAREER_RESULT_WEEK &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  const isUnivResultWeek =
    (gDraft.protagonist.careerStage === "university" || gDraft.protagonist.careerStage === "independent") &&
    weekInYear === CAREER_RESULT_WEEK &&
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
    // 해외 2군 직행 (실플 ②) — 고교·대학·독립 셋 다에서 지원할 수 있다
    // ⚠ 대학 재학생·독립 소속도 여기 오므로 무대 게이트를 안 건다 —
    //   지원 자체가 그 무대에서 이뤄진다
    const overseasChoices = apps?.overseasChoices ?? [];
    const draftApplied = apps?.draftApplied ?? false;

    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;

    const { requirementOfPower, calcHsBaseballScore, indieCutOfPower, isApplicableIndependent } =
      await import("../utils/universityUtils");
    const hsBaseballScore = calcHsBaseballScore(gDraft.protagonist.careerRecords ?? []);
    // 요건은 팀의 전력★에서 나온다 — 예전엔 하드코딩 표를 뒤졌고, 거기 없는
    // 49개 대학이 `?? 9` / `?? 0`으로 떨어져 **전부 무조건 합격**이었다
    const teamsNow = get(masterStore).teams;
    const univChoiceReqs = univChoices.map((teamId) => {
      const req = requirementOfPower(teamsNow.find((t) => t.id === teamId)?.power);
      return { teamId, minAcademicGrade: req.minAcademicGrade, minBaseballScore: req.minBaseballScore };
    });
    // 독립도 팀별 난이도를 넘긴다. 상무는 병역 경로가 따로 있어 제외한다
    const indieChoiceReqs = indieChoices
      .filter(isApplicableIndependent)
      .map((teamId) => ({ teamId, minOvr: indieCutOfPower(teamsNow.find((t) => t.id === teamId)?.power) }));
    const admissionsCalc = JSON.parse(await window.projectB!.weekCalcHsAdmissions(JSON.stringify({
      ovr: p.pitching.ovr, avgPct, hsBaseballScore,
      univChoices: univChoiceReqs, indieChoices: indieChoiceReqs,
      // ⚠ 진학 합격이 주인공 진로를 정한다 — 씨앗이 없으면 매번 갈린다
      seed: seedOf(get(seasonStore).worldSeed ?? 0, get(seasonStore).seasonYear, weekNum, "admissions"),
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
    const { determineProtagonistDraft, hsDraftInputsOf, draftOrderOf, draftInjuryCounts } = await import("../utils/draftSystem");
    // ⚠ **상대평가 입력을 모아 넘긴다.** 안 넘기면 Rust가 폴백으로 OVR을
    // 백분위처럼 쓰고, 그건 세계 전력이 바뀌면 어긋나는 옛 동작이다.
    //
    // 또래 = 같은 해 지명 대상 고교 3학년 투수. 주인공은 뺀다 —
    // 자기 자신을 분모에 넣으면 백분위가 인원수만큼 낮게 나온다
    //
    // ⚠ **`npcs[].pitching`이 아니라 live를 읽는다.** 생성값은 안 자란다 —
    // 3년을 추적해도 9종 전부 +0이다. 그걸 또래로 쓰면 **1학년 때 능력치와
    // 3학년인 나를 비교**하게 돼서 백분위가 통째로 부풀었다
    const liveStats = get(npcLiveStatsStore);
    const peerOvrs = g.npcs
      .filter((n) => n.playerType === "pitcher" && n.grade === 3
        && n.currentLeague === "LEAGUE_HIGHSCHOOL" && n.npcId !== p.id)
      .map((n) => livePitchingOvrOf(n, liveStats))
      .filter((o) => o > 0);
    // 팀 내 투수 순위 — 나보다 나은 팀 동료 수 + 1
    const teamAceRank = 1 + g.npcs.filter((n) =>
      n.playerType === "pitcher" && n.currentTeam === p.teamId && n.npcId !== p.id
      && livePitchingOvrOf(n, liveStats) > p.pitching.ovr).length;
    // 대회 활약과 수상 — **한 시즌 평균**이다. `calcHsBaseballScore`의 합계를
    // 그대로 넘기면 Rust의 0~100 척도와 어긋난다(그 함수는 진학 판정용이다)
    const hsInputs = hsDraftInputsOf(p.careerRecords ?? []);
    // ⚠ **심각도별로 센다.** 예전엔 `severity !== "light"`를 한 덩어리로 넘겨서
    // 팔꿈치 염증과 UCL 파열이 같은 무게(건당 -12, 상한 없음)였다 — 실측 감점이
    // -252까지 갔고 30커리어 중 6명이 이 항 하나로 미지명이었다
    // ⚠ **최근 세 시즌만 센다** — 이력은 평생 누적이라 전체를 세면 독립 재지원이
    // 해마다 나빠진다 (`draftInjuryCounts` 주석 · 씨앗 20260803 실측)
    const injuryCounts = draftInjuryCounts(p.injuryHistory ?? [], get(seasonStore).seasonYear);

    const draftOutcome = draftApplied
      ? await determineProtagonistDraft(p.scoutScore, p.pitching.ovr, get(seasonStore).seasonYear,
          { peerOvrs, teamAceRank, ...hsInputs, ...injuryCounts },
          // ⚠ **그 해 지명 순서를 넘긴다.** 안 넘기면 알파벳순 기본값이 쓰여
          // 순번은 맞는데 그 순번의 주인이 다른 팀이 된다
          draftOrderOf(get(seasonStore).prevSeasonKblStandings ?? []))
      : { drafted: false };

    // 계측 전용 — 산식 항이 여섯이라 합만 보면 어느 항이 미는지 못 고친다.
    // 세이브에 넣을 값은 아니다 (`__lastOffseasonSummary`와 같은 자리)
    (globalThis as Record<string, unknown>).__lastDraftBreakdown =
      (draftOutcome as { breakdown?: unknown }).breakdown ?? null;

    // ── 해외 2군 직행 판정 (실플 ②) ─────────────────────────
    //
    // ⚠ **팀 전력★이 문턱을 정한다** — `indieCutOfPower`와 같은 축이다.
    //   ★5는 84, ★3은 78(사용자 확정선), ★1은 72.
    // ⚠ 대회 성적은 `hsBaseballScore`를 그대로 쓴다 — 새로 만들지 않는다.
    const { overseasOfferTeams, calcIndividualScore } =
      await import("../utils/universityUtils");
    const { firstTeamIdOf } = await import("../utils/ids");
    // 🔴 **팀 점수가 아니라 개인 기여를 본다** — 우승팀이면 벤치도 100점인
    //   `hsBaseballScore`는 대학 입시용이다. 해외 스카우트는 그 선수를 본다.
    const indivScore = calcIndividualScore(gDraft.protagonist.careerRecords ?? []);
    // 🔴 **해외 2군 직행은 신청이 아니라 제안이다** (2026-09-02 · 사용자 확정).
    //   `overseasChoices`(허브에서 고른 3곳)는 더 이상 판정에 안 쓴다 — 범위 안
    //   해외 2군 28팀 전부를 **부모 1군 전력** 문턱으로 보고 넘는 팀이 제안한다.
    //   근거·숫자는 `overseasOfferTeams` 주석. 2군 팀만 후보다(1군은 FA·포스팅).
    const overseasFarmTeams = ["LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]
      .filter((lid) => isLeagueInScope(lid))
      .flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? [])
      .map((id) => {
        const parent = firstTeamIdOf(id);
        return { id, parentPower: teamsNow.find((x) => x.id === parent)?.power };
      });
    const overseasPassed = overseasOfferTeams(p.pitching.ovr, indivScore, overseasFarmTeams);
    logs.push(`[해외제안] ${overseasFarmTeams.length}팀 중 ${overseasPassed.length}팀 제안`
      + ` (OVR ${p.pitching.ovr} · 개인 ${Math.round(indivScore)}`
      + (overseasChoices.length > 0 ? ` · 허브 신청 ${overseasChoices.length}곳은 무시` : "") + ")");

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
      overseasPassed,
    });

    seasonStore.pushPendingAction({ type: "careerResults" });
  }

  // 배경 고교 졸업생 드래프트 (주인공 드래프트 결과 케이스가 아닐 때 항상 실행)
  // 주인공 학년과 무관하게 매년 실행되는 세계 이벤트 — needsHsHub(주인공 3학년 전용)와
  // 별개로 여기서도 대학/독립 리그를 Lazy 활성화해야 배경 드래프트 풀이 채워진다
  if (weekInYear === CAREER_RESULT_WEEK && !isHsResultWeek && !isUnivResultWeek && !hasCareerPending) {
    const alreadyQueued = get(seasonStore).pendingActions.some(a => a.type === "draftObserve");
    if (!alreadyQueued) {
      const seasonYearNow = get(seasonStore).seasonYear;
      await ensureLeagueActivatedV3("LEAGUE_UNIVERSITY", seasonYearNow);
      await ensureLeagueActivatedV3("LEAGUE_INDEPENDENT", seasonYearNow);
      seasonStore.pushPendingAction({ type: "draftObserve" });
    }
  }

  // 프로 트레이드 윈도우 — 연 2회(시즌 중 데드라인 + 스토브리그)
  //
  // 🔴 **예전엔 주인공 리그에서만 돌았다.** 리그 셋을 손으로 적고
  // `proLeagueIds.includes(myLeague)`로 걸러서, 주인공이 고교·대학에 있는
  // 동안(최대 7년) **프로 트레이드가 한 건도 안 났다.**
  //
  // 실측(고교 주인공 3시즌): 진행 중 트레이드 0건 · 같은 기간 FA 115건.
  // "트레이드 5건"으로 보이던 건 전부 **FA 보상선수**였다(W39·detail이 증거).
  // 로스터가 FA로만 움직이고 트레이드로는 안 움직이는 한쪽만 도는 상태였다.
  //
  // ⚠ **리그를 손으로 적지 않는다** — CLAUDE.md: "프로 운영에 리그를 직접
  // 적지 말 것". `activeProLeagues()`가 정본이라 `releaseScope`로 해외를
  // 닫으면 여기서도 자동으로 빠진다.
  if (weekInYear === TRADE_DEADLINE_WEEK || weekInYear === STOVE_LEAGUE_WEEK) {
    // 리그별로 돈다 — `processTradeWindow`가 리그 하나를 받는다.
    // 순차로 부르는 건 안쪽이 gameStore를 읽고 쓰기 때문이다(동시에 돌리면 덮어쓴다)
    for (const lid of activeProLeagues()) {
      await processTradeWindow(weekInYear, lid);
    }
  }

  // ── 오프시즌 이벤트 ─────────────────────────────────────────────
  {
    const gOff = get(gameStore);
    const sOff = get(seasonStore);
    const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(gOff.protagonist.careerStage);

    // 독립리그 시즌 종료 총평 메시지
    if (gOff.protagonist.careerStage === "independent" && weekInYear === INDIE_SEASON_REVIEW_WEEK) {
      gameStore.addMessage({
        id: `msg-indie-season-end-${sOff.seasonYear}`,
        category: "system", sender: "리그 사무국",
        subject: `${sOff.seasonYear} 독립리그 시즌 종료`,
        preview: "시즌이 종료되었습니다. 진로 신청을 진행하세요.",
        body: "독립리그 시즌이 종료되었습니다.\n드래프트 신청, 독립리그 재계약, 군입대 중 진로를 선택할 수 있습니다.\nW47에 최종 결과가 발표됩니다.",
        createdAt: `W${weekNum}`, readAt: null,
        // 시즌 성적을 표로도 싣는다 (PLAN_MESSAGE_DASHBOARDS §1-1).
        // ⚠ 본문엔 성적이 아예 없었다 — 표가 새로 보여주는 자리다
        metadata: pitcherSeasonTableMeta(
          "seasonEndIndie",
          sOff.stats[gOff.protagonist.id]?.type === "pitcher"
            ? (sOff.stats[gOff.protagonist.id] as import("../types/save").PitcherSeasonStats)
            : undefined,
        ),
      });
    }

    // 팀 Win-Now 압박 업데이트 (오프시즌 시작)
    if (isProStage && weekInYear === OFFSEASON_START_WEEK) {
      processWinNowPressureUpdate(weekNum).catch(e => autoLog(`[WinNow압박오류] ${e}`));
    }

    // 프로 시즌 총평 메시지
    if (isProStage && weekInYear === OFFSEASON_START_WEEK) {
      // ⚠ 여기는 **투수 전용**이다 — 바로 아래가 era·w·l 을 읽는다.
      //   타자를 넓히면 그 줄이 깨진다. 계약 쪽(1160·1245)만 넓혔다.
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
        // 한 줄에 여섯 값이 뭉쳐 있던 자리를 표로 갈라 싣는다
        // (PLAN_MESSAGE_DASHBOARDS §1-1). 본문 줄은 그대로 둔다.
        // ⚠ **지난해 열은 안 보낸다.** `CareerRecord.statLine` 이 이미 굳은
        //   문자열이라 숫자로 못 쪼갠다 — 없으면 그 열을 아예 안 그린다
        metadata: pitcherSeasonTableMeta("seasonEndPro", myStats ?? undefined),
      });
    }

    // NPC 은퇴/FA 결정 — 플레이어 단계 무관하게 배경 프로리그 NPC 처리
    if (weekInYear === STOVE_LEAGUE_WEEK) {
      const offseasonLogs = await processOffseasonNpcDecisions(weekNum);
      logs.push(...offseasonLogs);
    }

    // 프로 연봉협상 1차 + FA 시장 오픈
    if (isProStage && weekInYear === STOVE_LEAGUE_WEEK) {
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
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null;

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
          // 계측 — 은퇴 판정이 실제로 무엇을 돌려주는지 본다(C-1).
          // ⚠ 지우지 마라: "매번 재계약 오퍼를 만들어 거기 도달할 일이 없었다"가
          //   고쳐졌다고 적혀 있는데 증상이 그대로다. 값을 봐야 갈린다.
          if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>).__PB_RETIRE_LOG) {
            console.log("[은퇴판정] " + gOff.protagonist.age + "세 trend=" + trend.toFixed(2)
              + " mv=" + mv + " remain=" + contract.remainingYears
              + " suggest=" + pressure.suggest + " urgency=" + pressure.urgency);
          }
          if (pressure.suggest) {
            seasonStore.pushPendingAction({
              type: "retirementAsk", urgency: pressure.urgency, reason: "decline",
            });
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
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null;
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

    // FA 미계약자 매주 재트리거
    if (isProStage && weekInYear >= FA_RETRY_START_WEEK && weekInYear <= FA_RETRY_END_WEEK) {
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

        // ⚠ **`weekNum`이 아니라 `weekNum - 1`이다.** `processWeekBoundary`는
        // `advanceWeek()` **뒤에** `nextWeekNum`으로 불린다 — 막 들어선 주다.
        // 그 주 경기는 아직 안 치렀으므로 `result != null`이 영원히 거짓이었고,
        // **경기에 걸린 관계 항목이 전부 죽어 있었다.**
        //
        // 증상이 조용했던 이유: 훈련에 걸린 코치 관계는 멀쩡히 움직여서
        // "관계도가 도는데 감독·동료만 안 오른다"로 보였다. 실측(2026-08-08
        // `measure:relations`)에서 갈렸다 — 코치 −6~40, **동료 30명 전원
        // 초기값 그대로에 갱신 주차가 W1**이었다.
        const gameWeek = weekNum - 1;
        const myGame = sRel.schedule.find(
          e => e.week === gameWeek && e.isProtagonistGame && e.result != null,
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
            // ⚠ **0이 박혀 있었다.** 그래서 `growth_threshold: 2`를 영원히
            // 못 넘었고 감독 +1 · 코치 +2 성장 보너스가 죽어 있었다.
            // 실제 이번 주 OVR 변화를 넘긴다.
            ovrDelta: ovrDeltaThisWeek,
            trainingDone: hasTrainingPlan,
            trainingSkipped: !hasTrainingPlan,
            trainingArea,
            facedRivals,
          },
          relationMod: myMods.relation,
        });

        // 라벨이 바뀐 것만 알린다 — 값은 플레이어에게 보여주지 않는다
        const kindOf = new Map(deltas.flatMap(d => d.kind ? [[d.personId, d.kind] as const] : []));
        const msgs = buildRelationMessages(
          deltas, weekNum, get(masterStore).entities, new Map(kindOf), sRel.seasonYear);
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
        const inv = getTeamProfile(tid, gNow, mNow)?.farmInvestment ?? 50;
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
      gameStore.addMessage({
        id: `msg-league-results-w${weekNum}-${Date.now()}`,
        category: "system",
        sender: "리그 사무국",
        subject: `${monthLabel} ${leagueName} 경기 결과`,
        preview: lines[0] ?? "",
        body: lines.join("\n"),
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
    );
    if (myBody) gameStore.addMessage(myBody);
  }

  // ── 코치 리포트 (3주마다, 군 복무·오프시즌 제외) ──────────────
  const isSeasonActive = sFinal.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  if (weekInYear % 3 === 0 && gFinal.protagonist.careerStage !== "military" && isSeasonActive) {
    const p   = gFinal.protagonist;
    const pit = p.pitching;
    // ⚠ 투수 전용 — 아래가 ERA 로 코치 총평을 쓴다
    const myStats = sFinal.stats[p.id] as import("../types/save").PitcherSeasonStats | null ?? null;
    const coachName = getPitchCoachName(p.teamId, mFinal.entities);

    const era = myStats?.era ?? null;
    const eraLine = era !== null
      ? `  시즌 ERA ${era.toFixed(2)}  (${
          era < 2.5 ? "최상위권" : era < 3.5 ? "안정권" : era < 5.0 ? "주의 필요" : "위험 수준"
        })`
      : null;

    /**
     * 시즌 시작 대비 변화. **없으면 `undefined` 다** — 구 세이브·시즌 첫 주엔
     * 견줄 값이 없고, 0 을 채우면 「안 변했다」와 「모른다」가 같아 보인다.
     */
    const startPit = p.seasonStartPitching;
    const deltaFromStart = (k: keyof typeof pit): number | undefined => {
      const before = startPit?.[k as keyof typeof startPit];
      return typeof before === "number" ? (pit[k] as number) - before : undefined;
    };

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
      // 🔴 **지표 이름을 안 싣는다** — 키만 보내고 화면이 문안
      //   (`table.coachReport.rows`)으로 이름을 붙인다 (B-35).
      // ⚠ 변화는 시즌 시작 스냅샷이 있을 때만이다 — 없으면 그 칸이 안 그려진다
      metadata: coachReportTableMeta([
        { key: "velocity", value: pit.velocity, delta: deltaFromStart("velocity") },
        { key: "command",  value: pit.command,  delta: deltaFromStart("command") },
        { key: "control",  value: pit.control,  delta: deltaFromStart("control") },
        { key: "stamina",  value: pit.stamina,  delta: deltaFromStart("stamina") },
        { key: "condition", value: p.condition },
        { key: "fatigue",   value: p.fatigue },
        { key: "morale",    value: p.morale },
      ]),
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

  // ⚠ **여기서 순위표를 만들지 않는다** (2026-09-01).
  //
  // 한때 `stageStandings` 결과를 매주 `leagueState` 로 옮겼다. 독립 경기가
  // 아무도 안 돌아 순위표가 전원 0-0 이던 시절의 대증요법이었다.
  //
  // 🔴 **뿌리를 고치자 그게 해로워졌다.** `injectLeagueEntries` 가 주인공
  // 리그 일정을 `s.schedule` 에 넣게 되면서 **일반 경로가 순위를 제대로
  // 만든다**(`syncProtagonistLeagueUpdate`). 그런데 마지막 단계에는
  // `INDS{stage}_` 일정이 없어 `stageStandings` 가 **빈 결과**를 내고,
  // 그게 멀쩡한 순위표를 **0-0 으로 덮었다.**
  //
  // 실측(트랙 B): 순위는 8~10 으로 움직이는데 `survivalProbe` 의
  // `반영_승패합` 은 0 이었다 — **두 경로가 같은 자리를 두고 다퉜다.**
  //
  // ⚠ `stageStandings` 는 **탈락 판정에만** 쓴다(`progressSurvival` 안).
  //   그게 원래 그 함수의 몫이다.

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

  /**
   * 주인공 권역의 팀들 — 라운드 진출 명단에서 **아는 팀을 짚어주는** 데 쓴다.
   *
   * ⚠ 없으면 남의 대회 8강 명단은 그냥 모르는 이름 나열이라 읽을 이유가 없다.
   * 고교가 아니면 빈 집합이다(권역은 고교 개념이다) — 그때는 명단만 나온다.
   */
  const myRegionTeamIds = (): Set<string> | undefined => {
    for (const ids of Object.values(HS_REGIONS)) {
      if (ids.includes(protagonistTeamId)) return new Set(ids);
    }
    return undefined;
  };
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
      // 브래킷을 같이 넘긴다 — 개막 소식이 1라운드 대진을 표로 얹는다
      // (A 단위 5 묶음 3). 조별예선 대회(`o.stage`)는 대진이 아직 없어
      // `null` 이고, 그러면 소식이 표를 안 싣는다
      gameStore.addMessage(buildOpenMessage(
        def, entrants, protagonistTeamId, week, get(seasonStore).seasonYear,
        o.bracket, tName4Tour,
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
  // 두 군데(주인공 리그 / 그 밖)를 합치는 규칙은 `scheduleView` 하나다
  const resultOf = winnerById(s);
  const scheduledIds = scheduledIdSet(s);

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

          // ⚠ **내 팀이 없는 라운드도 알린다** (32강부터, 사용자 확정 2026-08-08).
          // 예전엔 우리가 안 나간 대회는 개막·우승 두 통뿐이라 누가 올라갔는지
          // 알 수 없었고, 나간 대회도 탈락한 뒤로는 깜깜했다.
          // `buildRoundProgressMessage`가 내 팀 라운드면 스스로 null을 내므로
          // 위 `mine`과 겹치지 않는다.
          const progress = buildRoundProgressMessage(
            def, next, r, protagonistTeamId, tName4Tour, week, myRegionTeamIds());
          if (progress) gameStore.addMessage(progress);

          if (r === next.totalRounds) {
            const champ = buildChampionMessage(
              def, next, protagonistTeamId, tName4Tour, week);
            if (champ) gameStore.addMessage(champ);

            // 🔴 **대회 개인 수상** — 5개 대회가 도는데 우승해도 개인에게
            //   남는 게 없었다. 팀 성적만 쌓여 진로 판정의 팀 점수로만 갔다.
            // ⚠ MVP는 우승팀 안에서, 부문상은 참가팀 전체에서 뽑는다
            //   (사용자 확정 2026-08-30).
            // ⚠ 기록은 시즌 수상과 **같은 자리**(`careerHistory.highlights`)에
            //   남긴다 — 명예의 전당·진학 점수가 그걸 본다.
            const finalM = next.matches.find((m) => m.round === next.totalRounds);
            const championId = finalM?.winnerTeamId ?? null;
            if (championId) {
              const sNow = get(seasonStore);
              const range = weekRangeOf(sNow, def.id);
              if (range) {
                const ents = get(masterStore).entities;
                const teamsNow2 = get(masterStore).teams;
                // 🔴 **리그 게이트가 없으면 섞인다.** 일정은 주인공 것 하나라,
                //   대학 대회의 주차 범위로 고교 경기를 모으면 **대학 대회
                //   이름으로 고교 선수가 상을 받는다** — 실측에서 고교 집계에
                //   여명기·은하기·왕중왕전이 섞여 나왔다.
                const teamOf = (pid: string): string | null => {
                  const tid = ents.find((e) => e.id === pid)?.teamId ?? null;
                  if (!tid) return null;
                  const lg = teamsNow2.find((t) => t.id === tid)?.leagueId ?? null;
                  return lg === def.leagueId ? tid : null;
                };
                const awards = tournamentAwards(
                  collectTournamentLines(sNow.schedule, range.start, range.end),
                  championId, teamOf);
                if (awards.length > 0) {
                  const byPlayer = new Map<string, string[]>();
                  for (const a of awards) {
                    const list = byPlayer.get(a.playerId) ?? [];
                    list.push(`${def.name} ${a.label}`);
                    byPlayer.set(a.playerId, list);
                  }
                  gameStore.addSeasonHighlights(next.seasonYear, byPlayer);

                  // 우리 팀이 걸린 상만 알린다 — 5대회 × 3상이면 한 해 15통이다
                  const mineAw = awards.filter((a) => a.teamId === protagonistTeamId);
                  if (mineAw.length > 0) {
                    const nameOf = (pid: string) =>
                      ents.find((e) => e.id === pid)?.name ?? pid;
                    gameStore.addMessage({
                      id: `msg-tour-award-${def.id}-${next.seasonYear}`,
                      category: "news",
                      sender: "고교야구연맹",
                      subject: `${def.name} 시상 — 우리 학교 ${mineAw.length}명`,
                      preview: mineAw.map((a) => a.label).join(" · "),
                      body: [
                        `${next.seasonYear} ${def.name} 시상식`,
                        "",
                        ...mineAw.map((a) =>
                          `🏅 ${a.label}  ${nameOf(a.playerId)}  (${a.value})`),
                      ].join(String.fromCharCode(10)),
                      createdAt: `W${week}`,
                      readAt: null,
                      // 상마다 사람이 붙는다 (§1-2). **소속 열은 안 싣는다** —
                      // 여긴 `teamId === protagonistTeamId` 로 걸러진 우리 학교
                      // 몫이라 전 행이 같은 팀이다(바로 위 `mineAw`)
                      metadata: rankListMeta("tourAward", mineAw.map((a) => ({
                        label: nameOf(a.playerId),
                        sub: `${a.label} ${a.value}`,
                        isMe: a.playerId === get(gameStore).protagonist.id,
                      }))),
                    });
                  }
                }
              }
            }
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

      // 계급 기반 이벤트 필터링
      //
      // 🔴 **`minRank` 하나로는 한 번 열린 이벤트가 전역까지 안 닫힌다**
      // (2026-09-01 · 트랙 B 실측). 셋을 같이 본다:
      //
      // ```
      //   minRank   그 계급 **이상**이면 후보                      (예전부터)
      //   maxRank   그 계급 **이하**여야 후보 — 훈련소 이벤트가
      //             병장 때 뜨는 걸 막는다
      //   once      커리어에 한 번만 — 「자대 배치 첫날」이 두 번 뜨던 것
      // ```
      //
      // ⚠ **`once` 는 커리어 통을 쓴다**(`careerTriggeredEvents`).
      // `seasonStore.triggeredEvents` 는 `makeEmptySeason` 이 매 시즌 비우는데
      // **군 복무는 100주(`SERVICE_WEEKS` · 52주 시즌 둘에 걸친다)** 라 그걸 쓰면 시즌 경계에서 되살아난다.
      //
      // ⚠ 뽑기는 Rust 가 한다 — 복원추출이고 쿨다운이 없다. 그래서 후보에
      // 남아 있는 한 계속 뽑힌다. **거르는 자리는 여기 하나뿐이다.**
      const rankIndex = serviceWeeks <= 8 ? 0 : serviceWeeks <= 34 ? 1 : serviceWeeks <= 60 ? 2 : 3;
      const fired = get(gameStore).protagonist.careerTriggeredEvents ?? {};
      const eligible = <T extends { id: string; minRank?: number; maxRank?: number; once?: boolean }>(
        list: T[],
      ) => list.filter((e) =>
        (e.minRank ?? 0) <= rankIndex
        && rankIndex <= (e.maxRank ?? Number.POSITIVE_INFINITY)
        && !(e.once && fired[e.id] !== undefined));
      const eligibleSports  = eligible(m.militarySportsEvents);
      const eligibleGeneral = eligible(m.militaryGeneralEvents);
      const eligibleCommon  = eligible(m.militaryCommonEvents);

      // ── 현역 병영생활 (PLAN_MILITARY_LIFE 4부 · 2026-09-02) ───────────────
      // 상무와 `militaryLife` 가 없는 옛 세이브는 아래 옛 갈래 그대로 간다.
      // 이 갈래는 **능력치를 안 건드린다** — 전역 때 야구 감각으로 환산한다.
      if (!isSportsUnit && g.protagonist.militaryLife) {
        const life = await runMilitaryLifeWeek({ nextWeek, seasonYear: s.seasonYear });
        if (life) {
          gameStore.applyWeekResult(life.patch, life.logs, [], nextWeek, s.seasonYear);
          for (const lifeMsg of life.messages) gameStore.addMessage(lifeMsg);
          const lifeEntities = get(masterStore).entities;
          seasonStore.applyWeeklyConditionRecovery(lifeEntities);
          await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, lifeEntities, g.protagonist.careerStage);
          gameStore.save(); seasonStore.save();
          const lifePending = get(seasonStore).pendingActions;
          return {
            processedWeek: nextWeek, logs: life.logs,
            newMessages: life.messages.map((x) => x.id), matchResults: [],
            stoppedBy: lifePending.length > 0 ? lifePending[0] : null,
          };
        }
      }

      // ⚠ **정수로 반올림해서 넘긴다.** Rust `MilitaryWeekPayload`는 이 값들이
      // 전부 `u32`/`i32`인데 주인공 스탯은 소수다(피로 62.125 · 스태미나 54.3).
      // serde가 소수를 정수로 못 받아 **호출 전체가 `{error}`로 떨어졌고**,
      // 아래에서 그걸 확인 없이 읽어 `undefined` → **피로가 NaN이 됐다.**
      //
      // 그래서 **군 복무 주간 계산이 통째로 안 돌고 있었다** — 계급별 스탯
      // 변화도, 사기·피로 변화도 전부. 전역해서 훈련 계산이 도는 순간
      // "성장 입력이 숫자가 아니다"로 터졌다(60회 조사에서 10회, 군 경로만).
      //
      // 소수부는 여기서만 버린다 — 결과를 그대로 덮어쓰는 게 아니라
      // 아래 `applyWeekResult`가 받는 값이라 누적 손실이 안 생긴다.
      const milCalcRaw = JSON.parse(await window.projectB!.weekCalcMilitary(JSON.stringify({
        isSportsUnit,
        serviceWeeks,
        stamina:  Math.round(g.protagonist.pitching.stamina),
        recovery: Math.round(g.protagonist.pitching.recovery),
        command:  Math.round(g.protagonist.pitching.command),
        control:  Math.round(g.protagonist.pitching.control),
        velocity: Math.round(g.protagonist.pitching.velocity),
        morale:   Math.round(g.protagonist.morale),
        fatigue:  Math.round(g.protagonist.fatigue),
        sportsEventCount:  eligibleSports.length,
        generalEventCount: eligibleGeneral.length,
        commonEventCount:  eligibleCommon.length,
      })));
      // ⚠ **오류를 삼키지 않는다.** 예전엔 `{error}`가 와도 그대로 필드를 읽어
      // undefined가 스탯에 들어갔다 — 조용히 NaN이 되는 자리다.
      if (!milCalcRaw || milCalcRaw.error || typeof milCalcRaw.fatigue !== "number") {
        throw new Error(`[군 복무] 주간 계산 실패: ${milCalcRaw?.error ?? JSON.stringify(milCalcRaw).slice(0, 200)}`);
      }
      const milCalc = milCalcRaw as {
        stamina: number; recovery: number; command: number; control: number; velocity: number;
        morale: number; fatigue: number;
        eventPool: string | null; eventIndex: number | null; rank: string;
      };
      /**
       * 이번 주에 뜬 군 이벤트 제목 — 주간 로그에 남긴다.
       *
       * ⚠ **이건 기록의 대체가 아니다.** `logs` 는 `slice(0, 30)` 인 **굴림
       * 버퍼**라 104주 복무 중 **마지막 30주만** 남고, 전역 뒤엔 리그 로그가
       * 몇 주 만에 밀어낸다. 그래도 지금은 `군 복무(체육부대)` 고정 한 줄이라
       * **이벤트가 떴다는 것조차 안 남는다** — 그 사이를 메운다.
       *
       * ✅ 소식함에도 남긴다 (사용자 확정 2026-09-01) — 아래 `milMessages`.
       */
      let milEventTitle: string | null = null;
      /**
       * 군 이벤트 소식 (사용자 확정 2026-09-01).
       *
       * 🔴 예전엔 `newMessages: []` 가 박혀 있어서 **104주 동안 소식함에 한
       * 줄도 안 남았다.** 이벤트는 54종이 매주 40%로 떠서 약 42번 뜨는데
       * 전부 모달로만 갔다 — 나중에 2년을 되돌아볼 방법이 없었다.
       *
       * ⚠ **통수를 걱정할 자리가 아니다.** 2년에 42통이면 **연 21통**이고,
       * 사용자가 그대로 두기로 한 훈련 소식이 **연 52통**이다. A 가 처음에
       * "훈련 접기를 거부하셨으니 통수에 민감하다"고 읽었는데 **방향이
       * 반대였다** — 거부한 건 통수가 아니라 **개별 소식이 접히는 것**이다.
       */
      const milMessages: MessageItem[] = [];

      if (milCalc.eventPool !== null && milCalc.eventIndex !== null) {
        const pool = milCalc.eventPool === "sports" ? eligibleSports
                   : milCalc.eventPool === "general" ? eligibleGeneral
                   : eligibleCommon;
        const evt = pool[milCalc.eventIndex];
        if (evt) {
          // ⚠ **필드를 손으로 옮겨 적지 않는다.** 예전엔 네 개(morale·fatigue·
          // xp·statDelta)만 복사해서, 데이터에 성실도·명성을 넣어도 여기서
          // 조용히 잘렸다. 선택지에서 표시용 두 개만 떼고 나머지는 통째로
          // 넘긴다 — 효과 필드가 늘어도 이 줄을 다시 고칠 일이 없다.
          const choices = evt.choices?.map(({ id, label, effectHint, ...effects }) => ({
            id, label, effectHint, effects,
          })) ?? [{
            id: "ok", label: "확인",
            effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 },
          }];
          seasonStore.pushPendingAction({
            type: "event", eventId: evt.id, title: evt.title, description: evt.description, choices,
          });
          // 🔴 **뜬 자리에서 기록한다.** 선택 완료를 기다리면 그 사이 다음 주가
          //   오고, `once` 가 안 먹은 채로 같은 이벤트가 또 후보에 오른다.
          //   기록은 "떴다"의 뜻이고, 선택 결과는 효과가 따로 담는다.
          // ⚠ 커리어 통이라 시즌을 넘어 산다 — 군 복무 104주를 덮는다.
          if (evt.once) gameStore.recordCareerTriggeredEvents({ [evt.id]: nextWeek });
          milEventTitle = evt.title;
          // ⚠ **id 는 유일해야 한다.** 소식 목록이 id 를 키로 잡아서 중복이
          //   하나만 생겨도 Svelte 가 죽고 **세이브가 아예 안 열린다**
          //   (CLAUDE.md). `once` 가 아닌 종은 같은 해에 두 번 뜰 수 있으므로
          //   **연도 + 주차**를 둘 다 넣는다.
          const milMsg: MessageItem = {
            id: `msg-mil-${evt.id}-${s.seasonYear}-w${nextWeek}`,
            category: "system",
            sender: isSportsUnit ? "체육부대" : "군 복무",
            subject: evt.title,
            preview: evt.description.split("\n")[0] ?? "",
            body: evt.description,
            createdAt: `W${nextWeek}`,
            readAt: null,
          };
          milMessages.push(milMsg);
          // 🔴 **여기서 실제로 넣는다.** 아래 반환값의 `newMessages` 는
          //   **아무도 안 읽는다**(호출부 전수 확인 · 2026-09-01) — 거기만
          //   채우면 층은 맞는데 잇는 선이 없어 아무 일도 안 일어난다.
          //   군 분기는 `applyWeekResult` 를 쓰는데 그건 메시지 인자가 없다.
          gameStore.addMessage(milMsg);
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
        [
          `군 복무(${isSportsUnit ? "체육부대" : "일반부대"}) — ${milCalc.rank}`,
          ...(milEventTitle ? [`[군] ${milEventTitle}`] : []),
        ],
        [], nextWeek, s.seasonYear,
      );
      const milEntities = get(masterStore).entities;
      seasonStore.applyWeeklyConditionRecovery(milEntities);
      await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, milEntities, g.protagonist.careerStage);
      gameStore.save(); seasonStore.save();

      const pending = get(seasonStore).pendingActions;
      return {
        processedWeek: nextWeek,
        logs: [
          isSportsUnit ? "군 복무(체육부대)" : "군 복무(일반부대)",
          ...(milEventTitle ? [`[군] ${milEventTitle}`] : []),
        ],
        // ⚠ **이 필드는 아무도 안 읽는다** (호출부 전수 확인 · 2026-09-01).
        //   소식은 위에서 `gameStore.addMessage` 로 **이미 넣었다.**
        //   여기 채우는 것만으로는 아무 일도 안 일어난다 — 반환 타입에
        //   있으니 모양만 맞춰 둔다.
        //   🔴 트랙 B 가 "`newMessages: []` 가 박혀 있다"고 제보했는데
        //      **원인은 맞고 고칠 자리는 여기가 아니었다.**
        //   ⚠ 타입이 `string[]`(**메시지 id 목록**)이다 — `MessageItem[]` 이
        //     아니다. 소식 자체를 여기 넣을 수 있는 구조가 애초에 아니었다.
        newMessages: milMessages.map((msg) => msg.id),
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
    const weekInYear = weekInYearOf(weekNum);
    const isMilUnresolved = p.militaryStatus === "미필"
      && p.careerStage !== "military"
      && p.careerStage !== "highschool";
    const hasAnyMilPending = s.pendingActions.some(
      (a) => a.type === "sportsUnitApplication" || a.type === "militaryEnlistAsk"
    );

    if (isMilUnresolved && !hasAnyMilPending) {
      // 28세 입영 기간 만료 경고
      if (p.age === 28 && weekInYear === MILITARY_AGE_WARNING_WEEK) {
        gameStore.addMessage({
          id: `msg-military-warning-${Date.now()}`,
          category: "system", sender: "병무청",
          subject: "입영 기간 만료 통지",
          preview: "이번 시즌 W52에 입영 절차가 진행됩니다.",
          body: "병역 의무 이행 기간이 만료되었습니다.\n이번 시즌 W52 주차에 입영 절차가 진행됩니다.",
          createdAt: `W${weekNum}`, readAt: null,
        });
      }

      // 체육부대 후보 30명 공개 (주인공 제외 NPC)
      //
      // ⚠ `sportsUnitPromptedYear` 가드가 **반드시 있어야 한다.** 이 블록은
      // 주를 안 넘기고 pending만 밀어넣은 채 반환한다 — 사용자가 신청/거절
      // 어느 쪽을 눌러도 주차가 그대로라 다음 진행에서 조건이 또 참이 된다.
      // 그러면 미필·비고교·27세 이하는 **매년 여기서 게임이 멈춘다** (실측 확인).
      if (weekInYear === SPORTS_UNIT_CANDIDATES_WEEK && p.age <= 27 && p.sportsUnitPromptedYear !== s.seasonYear) {
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

      // 체육부대 신청자 결과 처리
      if (weekInYear === MILITARY_RESULT_WEEK && p.sportsUnitApplied) {
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

        // ⚠ **규칙 파일이 정본이다.** 예전엔 `maxTotal: 10`·`maxPerTeam: 3`이
        // 여기 박혀 있었다. NPC 경로는 `rosterSize / 복무연수`(26/2 = 13)를
        // 쓰는데 주인공만 10이라, 같은 해에 주인공은 30명 중 10명(33%)·NPC는
        // 70명 중 13명(19%)을 놓고 겨뤘다.
        const milLimits = await sportsUnitLimits();
        const selResult = JSON.parse(
          await window.projectB!.militaryCalcSelection(JSON.stringify({
            applicants,
            maxTotal: Math.min(milLimits.annualIntake, applicants.length),
            maxPerTeam: milLimits.maxPerTeam,
            // 🔴 **여기가 안 넘어가고 있었다** (2026-08-28). `serde(default)`라
            //    조용히 빈 배열로 통과했고, **주인공만 Phase 1 없이 순수 OVR로**
            //    판정받았다. NPC 경로(`stores/game.ts`)는 넘기고 있었다.
            //
            // ⚠ 바로 위 주석의 `maxTotal: 10`과 **같은 형태**다 — 같은 함수의
            //   다음 인자에서 같은 일이 또 일어났다. 거르는 규칙을 인라인으로
            //   적지 않고 `militaryRules`의 함수를 쓴다.
            vacatingPositions: sportsVacatingFromNpcs(g.npcs, s.seasonYear),
            phase1Max: milLimits.phase1Max,
          }))
        ) as { protagonistSelected: boolean; selectedIds: string[] };

        if (selResult.protagonistSelected) {
          gameStore.addMessage({
            id: `msg-sports-selected-${s.seasonYear}-w${weekNum}`,
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

      // 스카우트 능력치 향상 + NPC loyalty 연간 감쇠
      if (weekInYear === MILITARY_RESULT_WEEK && ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage)) {
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
      if (weekInYear === MILITARY_RESULT_WEEK && p.age >= 28 && p.militaryAskedYear !== s.seasonYear) {
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
      // 1.1 A④ §5 — 고른 자리에서 몇 칸 밖인가. 0 이면 아래 두 판정이 예전 그대로 돈다
      const depthR         = roleDepthOf(gCurrent.protagonist.roleFit);
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
