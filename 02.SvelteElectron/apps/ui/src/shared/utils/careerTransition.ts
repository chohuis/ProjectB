// 선수 커리어 전이 규칙 (Phase 6B 보강)
//
// 학적은 **되돌릴 수 없다.** 고교 재입학·대학 두 번 입학·프로에서 학교로 복귀는
// 전부 불가다. 그런데 `gameStore.applyDraftDecision`은 어떤 `CareerStage`든
// 검증 없이 받아서 구조적 보호가 없었다.
//
// 실제로 도달 가능한 결함이 있었다: `isUnivResultWeek`가 대학 재학생·독립 소속에도
// 발동하면서 `universityChoices`를 그대로 처리해 **대학 두 번 입학**이 성립했다.
// UI에서 지원 선택지를 막고(1차), 전이 자체를 거부한다(2차).

import type { CareerStage } from "../types/save";
import { WEEKS_PER_SEASON } from "./seasonWeeks";

/**
 * 전이 허용표. 값에 없는 조합은 전부 거부한다.
 *
 * `military`는 여기 없다 — 전역은 `militaryHiatusStage`(입대 전 단계) 복원이라
 * 이 표가 아니라 저장된 값을 그대로 되돌리는 별도 경로다.
 */
const ALLOWED: Record<CareerStage, CareerStage[]> = {
  highschool:  ["university", "independent", "pro", "pro_kbl", "pro_abl", "pro_jbl", "military"],
  // 대학은 1~4학년 매년 드래프트 신청 가능. 미지명 시 독립으로 갈 수 있다.
  // **대학은 없다** — 두 번 입학 불가.
  university:  ["independent", "pro", "pro_kbl", "pro_abl", "pro_jbl", "military"],
  // 독립은 매년 재지원. 학교로는 돌아가지 않는다.
  independent: ["pro", "pro_kbl", "pro_abl", "pro_jbl", "military"],
  // 프로끼리는 이적·해외 진출로 자유롭게 오간다. 학교로는 못 돌아간다.
  pro:         ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
  pro_kbl:     ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
  pro_abl:     ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
  pro_jbl:     ["pro", "pro_kbl", "pro_abl", "pro_jbl", "independent", "military"],
  // 전역은 militaryHiatusStage 복원 전용 — 이 표를 거치지 않는다
  military:    [],
};

/** 같은 단계 유지(재계약·팀 내 이동)는 전이가 아니다 */
export function isSameStage(from: CareerStage, to: CareerStage): boolean {
  return from === to;
}

export function canTransition(from: CareerStage, to: CareerStage): boolean {
  if (from === to) return true;                 // 재계약·팀 이동
  return (ALLOWED[from] ?? []).includes(to);
}

/** 거부 이유 — 로그·개발자 확인용 */
export function transitionReason(from: CareerStage, to: CareerStage): string | null {
  if (canTransition(from, to)) return null;
  if (to === "highschool") return "고교 재입학 불가";
  if (to === "university" && from === "university") return "대학 두 번 입학 불가";
  if (to === "university") return `${from} → 대학 진학 불가 (학적 역행)`;
  if (from === "military") return "전역은 militaryHiatusStage 복원 경로로만";
  return `${from} → ${to} 전이 불가`;
}

/**
 * 지금 단계에서 대학에 지원할 수 있는가.
 *
 * 고교생만 가능하다. 대학 재학생·독립 소속·프로는 대학 선택지를 아예 못 본다 —
 * 보이는데 눌러도 아무 일이 없으면 그게 더 나쁘다.
 */
export function canApplyToUniversity(stage: CareerStage): boolean {
  return stage === "highschool";
}

/** 지금 단계에서 독립리그에 지원할 수 있는가 (프로는 방출 경로로 따로 간다) */
export function canApplyToIndependent(stage: CareerStage): boolean {
  return stage === "highschool" || stage === "university";
}

/** 대학은 4년제 — 그 이상은 없다 */
export const UNIVERSITY_FINAL_GRADE = 4;

/**
 * 🔴 **진학할 때 `universityWeek`을 무엇으로 세우나** — 학년 계수기의 원점.
 *
 * 진학은 시즌 도중(`CAREER_RESULT_WEEK` = W32)에 확정된다. 계수기를 거기서
 * 0으로 시작하면 **학년이 매 시즌 W33에 오른다** — 야구 시즌과 20주 어긋난다.
 *
 * 그래서 `진학주차 - 52`로 세운다. 그러면 그 뒤로는 **진학 주차와 무관하게**
 * `uw = 절대주 - 52`가 되어, 다음 시즌 W1에 정확히 1이 된다:
 *
 * ```
 *   진학 W32          uw -20      합격했으나 학기 전
 *   같은 시즌 W52     uw   0
 *   다음 시즌 W1      uw   1      1학년 시작
 *   다음 시즌 W52     uw  52      1학년 끝
 *   그다음 W1         uw  53      2학년 시작
 * ```
 *
 * ⚠ **음수가 정상이다.** `universityGradeOf`는 `uw >= 1`일 때만 계수기를
 * 쓰고 그 전에는 `grade`로 떨어진다 — 입학 전 위상에서 학년을 세지 않는다.
 *
 * ⚠ 이벤트가 `week_eq`와 `school.universityWeek` 창을 **같이** 건다.
 * 축이 어긋나면 창 밖으로 밀려 조용히 사라진다 — 실측으로 넷이 죽어 있었다.
 * `universityAxis.test.ts`가 그 조합을 전수로 본다.
 */
export function universityWeekOnEnroll(enrollWeekInYear: number): number {
  return enrollWeekInYear - WEEKS_PER_SEASON;
}

/**
 * 대학 몇 학년인가 (1~4).
 *
 * ⚠ **정본이 둘이었다.** 저장 필드 `protagonist.grade`와
 * `schoolState.universityWeek / 52`를 서로 다른 곳에서 각자 계산했다.
 * 게다가 `grade`는 대학 진학 시 지워지고 있어서(수정 전) 늘 null이었고,
 * 화면만 `universityWeek`로 버티고 있었다 — 그래서 **화면은 4학년에서
 * 진급을 막는데 헤드리스는 7년째 "계속"을 눌렀다**(실측 29세 대학생).
 *
 * **`universityWeek`이 정본이다** — 매주 오르는 실제 계수기다. `grade`는
 * 그걸 비추는 값이라 계수기가 없을 때(구 세이브)만 쓴다.
 *
 * ⚠ **여기 "진학이 시즌 도중에 확정돼도 어긋나지 않는다"고 적혀 있었다.
 * 틀렸다** (2026-09-01 실측). 계수기를 진학한 주부터 세면 **정확히 그만큼
 * 어긋난다** — 진학은 W32이고 학년이 매 시즌 W33에 올랐다. 원점을
 * `universityWeekOnEnroll`로 옮겨 고쳤다.
 */
export function universityGradeOf(
  grade: number | null | undefined,
  universityWeek: number | null | undefined,
): number {
  if (typeof universityWeek === "number" && universityWeek >= 1) {
    return Math.min(
      Math.floor((universityWeek - 1) / WEEKS_PER_SEASON) + 1, UNIVERSITY_FINAL_GRADE);
  }
  if (typeof grade === "number" && grade >= 1) return Math.min(grade, UNIVERSITY_FINAL_GRADE);
  return 1;
}

/** 이번이 마지막 학년인가 — 진급 선택지를 낼지 정한다 */
export function isUniversityFinalYear(
  grade: number | null | undefined,
  universityWeek: number | null | undefined,
): boolean {
  return universityGradeOf(grade, universityWeek) >= UNIVERSITY_FINAL_GRADE;
}

/** 표 전체 — 테스트가 읽는다 */
export const TRANSITION_TABLE = ALLOWED;
