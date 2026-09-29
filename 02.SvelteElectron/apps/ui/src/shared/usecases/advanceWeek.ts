// ⚠ **주차 상수가 하나만 남았다** (2026-09-30 · Ⅱ-1). 진로·계약·군 블록이
//   `weekPhases/` 로 가면서 그쪽이 자기 상수를 직접 읽는다 — 여기 남겨 두면
//   안 쓰이는 import 가 「아직 쓰는 줄」처럼 보인다.
import { weekInYearOf } from "../utils/seasonWeeks";
import { get } from "svelte/store";
import { seedOf } from "../utils/seedOf";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { autoLog } from "../stores/autoAdvance";
import { relationEffects, trainingAreaOf } from "./relationships";
import { slotRepo } from "../repo/slotRepo";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForStage } from "../utils/rosterEngine";
import {
  applyWeeklyStudy, NEUTRAL_STUDY, calcExamResult,
  loadAcademicsRules, majorEffects, warningEffect, settleSemester,
} from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { isMonthStart, planMonthlyFriendlies, buildMonthlyNoticeMessage } from "../utils/friendlyMatchEngine";
import { buildOpponentBrief, rotIdxOf } from "../utils/matchLineupBuilder";
import { runNationalTeamWeek } from "./nationalTeam";
import { runCampusEventsWeek } from "./campusEvents";
import { dischargeProtagonist } from "./militaryDecision";
import { isRetired } from "./retirement";
import { staffModsOf, staffStatsOf } from "../utils/staffEffects";
import type { MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { MessageItem } from "../types/main";
import type { ProtagonistSave } from "../types/save";
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
import { findTeamCoach } from "./weekPhases/training";
import { EXAM_EVENT_IDS, isMidtermEvent, makeExamMessage } from "./weekPhases/academics";
import { runMilitaryServiceWeek, runMilitaryTriggers } from "./weekPhases/military";
import { applyTraitMods } from "../utils/protagonistTraits";
import { applySideEffects } from "./decisions";
import { simulateNpcGame, logGameLines } from "./weekPhases/games";
import { runRelationsWeek } from "./weekPhases/relations";
import { runCoachReport } from "./weekPhases/coachReport";
import { runCareerHubWeek } from "./weekPhases/careerHub";
import { runOffseasonMarketWeek } from "./weekPhases/offseasonMarket";
import { runEventLaneWeek } from "./weekPhases/eventLane";
import { runWeeklyNews } from "./weekPhases/weeklyNews";
// 시즌 경계 — 포스트시즌·대회·독립리그 (2026-09-27 · Ⅱ-1 쪼개기 · 로직 불변)
import {
  progressIndependentLeague, isKnockoutGame, progressTournaments,
  injectLeaguePostseason, applyPostseasonResult,
} from "./weekPhases/postseason";
// 훈련·컨디션·부상·성장 (2026-09-30 · Ⅱ-1 쪼개기 · 로직 불변)
//
// ⚠ **성실 감쇠·사기 회귀 상수와 `moraleAfterWeek` 도 같이 갔다.** 그 셋은
//   옮겨 간 블록에서만 쓰는데 여기 남겨 두면 두 파일이 서로를 물어 **순환**이
//   된다. 여기서는 **다시 내보내기만** 한다 — 정본은 하나이고, 옛 import
//   경로(`usecases/advanceWeek`)로 들어오던 검사가 그대로 산다.
import { runWeeklyTraining } from "./weekPhases/weeklyTraining";
export { moraleAfterWeek } from "./weekPhases/weeklyTraining";
import { recordGameResult } from "./recordGameResult";
export { simulateProtagonistGame } from "./weekPhases/games";
import { processNpcInjuries } from "./weekPhases/injuries";
import { processPositionGaps } from "./weekPhases/positionGaps";
import { processJerseyNumbers } from "./weekPhases/jerseyNumbers";
import { processWeeklyNpcGrowth } from "./weekPhases/growth";
import { processProTeamCallupCalldown, getTeamProfile } from "./weekPhases/market";
import { LEAGUE_NAMES } from "./weekPhases/digest";
// 소식에 실을 표 (PLAN_MESSAGE_DASHBOARDS §1-1) — 본문은 그대로 두고 값만 더한다
import { examBarsMeta, semesterBarsMeta, cardsMeta } from "../utils/dashboardMeta";
import { bundleRoundProgressMessages } from "./weekPhases/tournamentNews";
import { runBackgroundPostseasons } from "./backgroundPostseason";
import { snapshotDueAt } from "../utils/standingsSnapshot";
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

  // ── 훈련·컨디션 — `weekPhases/weeklyTraining.ts` (2026-09-30 · Ⅱ-1) ─
  //
  // ⚠ **자리에 뜻이 있다.** 학업·계수 준비 **뒤**, 이벤트 뽑기 **앞**이다.
  //   이 절이 내는 `afterP` 가 이벤트 조건의 입력이라 순서를 바꾸면 이벤트가
  //   지난주 값을 본다.
  // ⚠ 내는 값 열을 **옮기기 전과 같은 이름으로** 받는다 — 아래 본문을 한
  //   글자도 안 고치기 위해서다.
  const trainWeek = await runWeeklyTraining({
    weekNum, g, s, m, logs,
    studyResult, univEffMod, majorEffBonus, coachEffBonus,
    myMods, teamRef, slumpPenalty, newLowMoraleWeeks, alreadyInjured,
  });
  const {
    growth,
    afterP,
    trainingMsg,
    trainingScoutDelta,
    ovrDeltaThisWeek,
    weeklyNet,
    reportPicker,
    eventRands,
    teb,
    irm,
  } = trainWeek;

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

  // ── 주간 소식 — `weekPhases/weeklyNews.ts` (2026-09-30 · Ⅱ-1) ──
  //
  // ⚠ **자리에 뜻이 있다.** 배경 리그 시뮬 **뒤**여야 한다 — 리그 결과 소식이
  //   막 시뮬한 결과를 다시 읽는다. 앞으로 옮기면 한 통도 안 온다(실측 0건인
  //   결함이 바로 그 형태였다).
  // ⚠ 넷(리그 결과 · 야구계 다이제스트 · 월간 부상 · 내 몸)을 한 덩이로 옮겼다 —
  //   월 레이블 헬퍼를 같이 쓰고, 마지막에 **세 리포트가 뽑은 문장 인덱스를
  //   한 번에** 되돌린다(그 파일 머리말).
  runWeeklyNews({ weekNum, weekInYear, gFinal, sFinal, mFinal, reportPicker });

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
