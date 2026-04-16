export type MainTabId =
  | "home"
  | "messages"
  | "roster"
  | "schedule"
  | "training"
  | "records";

export interface MainSnapshot {
  dayLabel: string;
  teamName: string;
  playerName: string;
  morale: number;
  fatigue: number;
  upcoming: string[];
  logs: string[];
}

