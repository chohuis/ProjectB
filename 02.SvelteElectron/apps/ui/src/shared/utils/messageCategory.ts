import type { MessageCategory } from "../types/main";

/**
 * 메시지 분류의 표시 정본.
 *
 * ⚠ 예전엔 `MessagesPage.svelte` 안에 `{label, accent, bg, text}` 네 색을 들고
 * 있었고 전부 어두운 지면 기준이었다. 화면이 늘면 같은 표를 또 적게 된다.
 *
 * **분류색은 팀 색이 아니다.** "코치가 보냈다"는 사실은 이적해도 안 변한다.
 * 네 값 모두 흰 바탕 위 4.5:1을 넘는다(글자로 쓰이므로 필요한 조건).
 */
export interface CategoryMeta {
  label: string;
  /** 카드 왼쪽 띠 · 배지 글자색 */
  accent: string;
}

export const CATEGORY: Record<MessageCategory, CategoryMeta> = {
  system:  { label: "시스템", accent: "#5A6478" },
  news:    { label: "뉴스",   accent: "#9A6510" },
  coach:   { label: "코치",   accent: "#1F5FA8" },
  manager: { label: "감독",   accent: "#5B3AA8" },
};

/** 필터 순서 — 자주 쓰는 것부터 */
export const CATEGORY_ORDER: MessageCategory[] = ["coach", "manager", "news", "system"];

export function categoryMeta(c: MessageCategory): CategoryMeta {
  return CATEGORY[c] ?? { label: c, accent: "#5A6478" };
}
