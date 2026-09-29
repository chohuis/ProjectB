/**
 * **학업 · 계수 준비** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에서 「학생일 때만 학업이 돈다」부터
 *   「`alreadyInjured`」까지, **훈련 계산에 들어갈 계수를 만드는 절**이 그대로
 *   나왔다. 블록 경계는 옮기기 전 파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **`runWeeklyTraining` 의 입력을 만드는 자리다.** 그래서 내는 값 열하나가
 *   그 함수의 인자 이름과 하나씩 맞는다 — 이름을 바꾸면 그게 「뜻 불변」의
 *   증명을 깎는다.
 *
 * ⚠ **`acaRules` 도 같이 낸다.** 아래 「대학: 학점 확정」(`settleSemester`)이
 *   같은 객체를 읽는다 — 거기서 다시 읽으면 규칙 파일을 두 번 여는 것이고,
 *   그게 정본 둘로 가는 길이다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { gameStore, type GameStoreState } from "../../stores/game";
import type { MasterState, TeamRef } from "../../stores/master";
import {
  applyWeeklyStudy,
  NEUTRAL_STUDY,
  loadAcademicsRules,
  majorEffects,
  warningEffect,
  type AcademicsRules,
  type WeeklyStudyResult,
} from "../../utils/academicsEngine";
import { findTeamCoach } from "./training";
import { staffModsOf, staffStatsOf, type StaffMods } from "../../utils/staffEffects";
import { relationEffects, trainingAreaOf } from "../relationships";
import { applyTraitMods } from "../../utils/protagonistTraits";
import { isV3SlotActive } from "../../repo/v3Mode";
import { slotRepo } from "../../repo/slotRepo";
import type { EventContext } from "../../types/event";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface WeeklyPrepArgs {
  g: GameStoreState;
  m: MasterState;
  /** 함수 머리에서 이미 가른 값 — 여기서 다시 세지 않는다 */
  isUniversity: boolean;
}

/** `runWeeklyTraining` 의 인자 이름과 하나씩 맞는다 + 학점 확정이 쓰는 규칙 */
export interface WeeklyPrepResult {
  studyResult: WeeklyStudyResult;
  univEffMod: number;
  majorEffBonus: number;
  coachEffBonus: number;
  myMods: StaffMods;
  teamRef: TeamRef | undefined;
  slumpPenalty: number;
  newLowMoraleWeeks: number;
  alreadyInjured: boolean;
  /** 이벤트 조건이 읽는 관계도 행 — 안 실으면 늘 false 다 */
  relRows: NonNullable<EventContext["relations"]>;
  /** 아래 「대학: 학점 확정」이 같은 객체를 읽는다 */
  acaRules: AcademicsRules | null;
}

export async function runWeeklyPrep({
  g,
  m,
  isUniversity,
}: WeeklyPrepArgs): Promise<WeeklyPrepResult> {
  // ⚠ **학생일 때만 학업이 돈다.** 예전엔 단계 게이트가 없어서 프로 선수도
  // 매주 출석·과제·백분위가 갱신됐다 (실측: pro_kbl 주간 로그에 "[학업] 주간
  // 효율 85%"). 학사 경고가 걸리면 `eligibilityBlocked`로 경기가 자동 시뮬되는데,
  // 프로 선수에게 그게 걸리는 건 말이 안 된다.
  const isStudent = g.protagonist.careerStage === "highschool" || isUniversity;
  // ⚠ 배수 인자를 지웠다 — 대학은 결과를 저장하지 않아 **죽은 갈래였다**
  const studyResult = isStudent ? await applyWeeklyStudy(g.schoolState) : NEUTRAL_STUDY;
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
    univEffMod =
      warningEffect(acaRules, g.schoolState.academicWarningLevel ?? 0)?.trainingEffMod ?? 1.0;
  }

  // ⚠ 전공 계수의 정본은 `generation_rules.json`이다. 예전엔
  // `academicsEngine.UNIVERSITY_MAJORS` 상수에도 같은 숫자가 있었는데,
  // 규칙 파일에 `majors`를 넣으면서 **표가 둘이 됐다** — 규칙 파일만 읽는다.
  const majorEffBonus = acaRules
    ? majorEffects(acaRules, g.schoolState.universityMajor).trainingEffBonus
    : 0;

  const pitchCoach = findTeamCoach(g.protagonist.teamId, "투수", m.entities);
  // 스태프 능력치는 `staffEffects`만 읽는다 — 여기서 직접 파면 그게 다음 드리프트다
  const coachTeaching = staffStatsOf(g.protagonist.teamId ?? "", m.entities, {
    specialty: "투수",
  }).teaching;

  // 관계 보정 (Phase 6C-5) — 이번 주 훈련 영역의 담당 코치와 감독 관계를 한 번에 읽는다.
  // 이 조회가 여기 있는 이유: coachEffBonus와 보직 배정이 둘 다 아래에서 쓰인다.
  const trainingFocus = m.trainingPrograms.find(
    (pr) => pr.id === g.trainingPlan?.primaryProgramId,
  )?.focus;
  const relEffects =
    isV3SlotActive() && g.currentSlotId
      ? await relationEffects({
          slotId: g.currentSlotId,
          teamId: g.protagonist.teamId,
          coachSpecialty: await trainingAreaOf(trainingFocus),
        })
      : {
          roleOvrBias: 0,
          trainingBonus: 0,
          contractBonus: 0,
          managerLabel: "중립",
          coachLabel: "중립",
          ownerLabel: "중립",
        };

  // 🔴 **관계도 조건(`relation_gte`/`relation_lte`)이 값을 못 받아 항상 false였다.**
  //    조건은 트랙 B가 만들었고 평가기도 있는데(`conditionEvaluator.ts:206`)
  //    `EventContext.relations`를 채우는 코드가 없었다.
  //
  //    ⚠ 이 프로젝트가 반복해 밟는 형태다 — **조건만 만들고 배선을 안 하면**
  //      **조용히 false다.** 이벤트가 안 떠도 로그 한 줄 안 남는다.
  //
  //    평가기가 동기라 여기서 미리 실어야 한다(`types/event.ts:79` 주석).
  //    조회는 위 `relationEffects`와 같은 슬롯이라 왕복이 하나 더 늘 뿐이다.
  const relRows =
    isV3SlotActive() && g.currentSlotId ? await slotRepo.getRelationships(g.currentSlotId) : [];

  // 능력치 보정과 관계 보정을 더한 뒤 clamp한다 — 각각 clamp하면 상한이 두 배가 된다
  //
  // ⚠ **멘토도 같은 통에 넣는다** (2026-09-08 · §5 `mentor`). 코치 지도력과
  //   같은 축이라 따로 곱하면 상한(0.25)을 두 번 쓰게 된다 — 멘토가 붙었다고
  //   효율이 두 배로 튀면 그건 산식이 둘이라는 뜻이다.
  const mentorBonus = (g.protagonist.mentor?.pct ?? 0) / 100;
  const coachEffBonus = Math.max(
    -0.15,
    Math.min(0.25, (coachTeaching - 50) * 0.004 + relEffects.trainingBonus + mentorBonus),
  );
  const teamRef = m.teams.find((t) => t.id === g.protagonist.teamId);
  // 🔴 **특성은 계수에 곱한다** (2026-09-08 · §5 `trait`). 새 산식을 만들지
  //    않고 코치·구단 시설과 **같은 자리**로 들어간다 — 그래야 「특성이 얼마나
  //    세나」를 이미 있는 계측으로 잰다(`utils/protagonistTraits.ts` 머리말).
  const myMods = applyTraitMods(
    staffModsOf(g.protagonist.teamId ?? "", m.entities, { specialty: "투수" }),
    g.protagonist.traits,
  );
  // 통솔력 있는 코치진이면 슬럼프에 늦게 빠지고 덜 깎인다 (§7-5 F-1).
  // 1.07배면 임계 3주 → 4주 · 페널티 0.70 → 0.72
  const slumpResist = myMods.slump;
  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale = g.protagonist.morale < 35;
  const newLowMoraleWeeks = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpThreshold = Math.max(2, Math.round(3 * slumpResist));
  const slumpPenalty =
    newLowMoraleWeeks >= slumpThreshold ? Math.min(0.95, 1 - (1 - 0.7) / slumpResist) : 1.0;
  const alreadyInjured = !!g.protagonist.injury;

  // ⚠ **`pitchCoach` 는 아직 아무도 안 읽는다.** 옮기기 전에도 그랬다 —
  //   자리를 옮기면서 뜻을 바꾸지 않으려고 그대로 뒀다. 죽은 것인지 아직
  //   안 부른 것인지는 여기서 판정하지 않는다(별건)
  void pitchCoach;

  return {
    studyResult,
    univEffMod,
    majorEffBonus,
    coachEffBonus,
    myMods,
    teamRef,
    slumpPenalty,
    newLowMoraleWeeks,
    alreadyInjured,
    relRows,
    acaRules,
  };
}
