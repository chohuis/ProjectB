export type MainTabId =
  | "home"
  | "messages"
  | "status"
  | "team"
  | "schedule"
  | "training"
  | "finance"
  | "test"
  | "league"
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
  conditionDelta?:  number;
  fatigueDelta?:    number;
  moraleDelta?:     number;
  moneyDelta?:      number;
  xp?:              Record<string, number>;  // PitchingStatKey → XP 적립량
  statDelta?:       Record<string, number>;  // PitchingStatKey → 즉시 스탯 증가량
  fameDelta?:       number;                  // 명성 ± (0~200 clamp)
  popularityDelta?: number;                  // 인기도 ± (0~100 clamp)
  diligenceDelta?:  number;                  // 성실도 ± (1~99 clamp)
  addTag?:          string[];                // 태그 추가 (중복 무시)
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

export interface TrainingStat {
  key: string;
  label: string;
  pct: number;
  current: number;
  leveledUp: boolean;
}

export interface TrainingMetadata {
  type: "training";
  stats: TrainingStat[];
  condition: number;
  fatigue: number;
  morale: number;
  extraLogs: string[];
}

export interface Top10ColumnEntry {
  id: string;       // "PLY_HERO" or NPC id
  name: string;
  teamName: string;
  rank: number;
}

export interface Top10Column {
  label: "통합" | "3학년" | "2학년" | "1학년";
  entries: Top10ColumnEntry[];
  heroRank: number | null;  // 통합 컬럼에서만 top10 밖 순위, 나머지 null
}

export interface Top10Metadata {
  type: "top10";
  playerType: "pitcher" | "batter";
  week: number;
  seasonYear: number;
  columns: [Top10Column, Top10Column, Top10Column, Top10Column];
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
  metadata?: TrainingMetadata | Top10Metadata | { type: string };
}
