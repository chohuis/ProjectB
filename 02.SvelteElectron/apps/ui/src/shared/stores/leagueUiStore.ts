import { writable } from "svelte/store";

type TxCategory = "all" | "trade" | "fa" | "draft" | "military" | "retirement";
type LeagueTab  = "standings" | "leaderboard" | "transactions";

export const leagueUiState = writable<{
  selectedYear: number;
  tab:          LeagueTab;
  txCategory:   TxCategory;
  txLeagueId:   string;
}>({
  selectedYear: 0,
  tab:          "standings",
  txCategory:   "all",
  txLeagueId:   "",
});
