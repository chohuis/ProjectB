export type MainTabId =
  | "home"
  | "messages"
  | "messenger"
  | "status"
  | "team"
  | "roster"
  | "schedule"
  | "training"
  | "finance"
  | "test"
  | "records"
  | "academics";

export interface MainSnapshot {
  dayLabel: string;
  teamName: string;
  playerName: string;
  morale: number;
  fatigue: number;
  upcoming: string[];
  logs: string[];
}

export type MessageCategory = "system" | "news" | "coach" | "manager";

export interface MessageDecisionOption {
  id: string;
  label: string;
  effect: string;
}

export interface MessageDecision {
  prompt: string;
  options: MessageDecisionOption[];
  selectedOptionId: string | null;
}

export interface MessageItem {
  id: string;
  category: MessageCategory;
  sender: string;
  subject: string;
  preview: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  decision?: MessageDecision;
}
