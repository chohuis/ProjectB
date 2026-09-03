import type { MessageItem } from "../../types/main";

// ⚠ **대학 시험 트리거가 없어서 학기 확정이 죽은 코드였다.** `EVT_HS_*`는
// `career_stage: highschool` 전용이라 대학에서는 아예 안 뜬다 — 9-C-1이
// 붙인 학점 확정 경로가 영영 실행되지 않았다.
export const EXAM_EVENT_IDS = new Set([
  "EVT_HS_MIDTERM", "EVT_HS_FINAL",
  "EVT_UNIV_MIDTERM", "EVT_UNIV_FINAL",
]);

/** 중간고사인가 — id가 무대별로 둘씩이라 이름으로 가른다 */
export function isMidtermEvent(eventId: string): boolean {
  return eventId.endsWith("_MIDTERM");
}

/**
 * 시험 결과 소식.
 *
 * ⚠ **막대는 부르는 쪽이 만든다.** 고교는 과목 백분위, 대학은 학점이라
 *   눈금과 문안이 다르다(`bars.exam` · `byStage.university`) — 여기서
 *   가르면 이 함수가 두 무대를 다 알아야 한다.
 */
export function makeExamMessage(
  week: number, subject: string, body: string,
  metadata?: import("../../types/main").BarsMetadata,
): MessageItem {
  return {
    id: `msg-exam-w${week}-${Date.now()}`,
    category: "system",
    sender: "학업 시스템",
    subject,
    preview: body.split("\n")[0] ?? "",
    body,
    createdAt: `W${week}`,
    readAt: null,
    ...(metadata ? { metadata } : {}),
  };
}
