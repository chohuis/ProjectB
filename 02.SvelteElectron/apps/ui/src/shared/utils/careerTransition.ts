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

/** 표 전체 — 테스트가 읽는다 */
export const TRANSITION_TABLE = ALLOWED;
