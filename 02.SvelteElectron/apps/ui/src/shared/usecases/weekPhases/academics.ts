import type { MessageItem } from "../../types/main";

export const EXAM_EVENT_IDS = new Set(["EVT_HS_MIDTERM", "EVT_HS_FINAL"]);

export function makeExamMessage(week: number, subject: string, body: string): MessageItem {
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
