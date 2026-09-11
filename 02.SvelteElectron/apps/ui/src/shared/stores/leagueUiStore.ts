import { writable } from "svelte/store";

/**
 * 리그 화면의 선택 상태 — 다른 탭에 갔다 와도 보던 자리로 돌아온다.
 *
 * ⚠ **탭 유니온의 정본은 여기다.** `LeaguePage.svelte`가 같은 이름의 타입을
 * 따로 들고 있었고, U6에서 "포스트시즌"을 페이지 쪽에만 추가하자
 * `Two different types with this name exist, but they are unrelated`로 깨졌다.
 * 스토어에 넣는 값의 타입이므로 스토어가 갖는 게 맞다.
 */
export type TxCategory = "all" | "trade" | "fa" | "draft" | "military" | "retirement";
export type LeagueTab =
  | "standings"
  | "leaderboard"
  | "tournaments"
  | "postseason"
  | "transactions"
  // 연혁 — 다른 탭이 전부 "한 해를 골라" 보는 것과 달리
  // 여러 해를 가로지른다 (우승 계보 · 통산 수상)
  | "history";

export const leagueUiState = writable<{
  selectedYear: number;
  tab: LeagueTab;
  txCategory: TxCategory;
  txLeagueId: string;
}>({
  selectedYear: 0,
  tab: "standings",
  txCategory: "all",
  txLeagueId: "",
});
