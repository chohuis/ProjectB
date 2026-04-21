export type MainTabId =
  | "home"
  | "status"
  | "roster"
  | "schedule"
  | "training"
  | "finance"
  | "test"
  | "records"
  | "messages"
  | "team";

export interface MainSnapshot {
  dayLabel: string;
  teamName: string;
  playerName: string;
  morale: number;
  fatigue: number;
  upcoming: string[];
  logs: string[];
}
