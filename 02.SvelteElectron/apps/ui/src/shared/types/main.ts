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
  | "achievements"
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

// 선택지 실제 효과 (타입 기반 적용)
export interface DecisionEffect {
  conditionDelta?: number;
  fatigueDelta?: number;
  moraleDelta?: number;
  xp?: Record<string, number>; // PitchingStatKey → XP 적립량
}

export interface MessageDecisionOption {
  id: string;
  label: string;
  effectHint: string;         // 표시용 효과 설명
  effects?: DecisionEffect;   // 실제 적용 효과
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
