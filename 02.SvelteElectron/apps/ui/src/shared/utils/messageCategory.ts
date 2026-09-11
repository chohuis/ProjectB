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
  system: { label: "시스템", accent: "#5A6478" },
  news: { label: "뉴스", accent: "#9A6510" },
  coach: { label: "코치", accent: "#1F5FA8" },
  manager: { label: "감독", accent: "#5B3AA8" },
};

/** 필터 순서 — 자주 쓰는 것부터 */
export const CATEGORY_ORDER: MessageCategory[] = ["coach", "manager", "news", "system"];

/**
 * 소식 목록의 필터 묶음.
 *
 * ⚠ **분류 4종을 그대로 칩으로 깔면 한 줄에 안 들어간다.** 2단으로 바꾸면서
 * 목록 폭이 좁아졌고, `전체·안읽음 + 4분류` 여섯 개가 두 줄로 깨졌다.
 *
 * ⚠ **묶는 기준은 "보낸 사람이 누구인가"다.** 코치와 감독은 둘 다 팀 사람이고
 * 실측에서 각각 2건뿐이라(대부분이 news 20 · system 26) 따로 둘 값이 없다.
 *
 * ⚠ 화면이 자기 표를 들면 정본이 둘이 된다 — 분류가 늘 때 여기만 고치면
 * 되도록 그룹도 이 파일에 둔다.
 */
export interface FilterGroup {
  id: string;
  label: string;
  cats: MessageCategory[];
}

export const FILTER_GROUPS: FilterGroup[] = [
  { id: "staff", label: "코치·감독", cats: ["coach", "manager"] },
  { id: "news", label: "뉴스", cats: ["news"] },
  { id: "system", label: "시스템", cats: ["system"] },
];

export function categoryMeta(c: MessageCategory): CategoryMeta {
  return CATEGORY[c] ?? { label: c, accent: "#5A6478" };
}
