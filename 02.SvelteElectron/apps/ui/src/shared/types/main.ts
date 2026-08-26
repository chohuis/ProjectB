/**
 * 사이드바 6칸. (U4 — 11개에서 줄였다)
 *
 * 없어진 것은 사라진 게 아니라 **아래로 한 단 들어갔다**:
 *   home·messages  → `news`  (U3에서 소식 하나로 합쳐짐)
 *   status·training·academics·finance·achievements → `me`의 하위 탭
 *   test           → 개발 도구(Ctrl+Q)라 내비에 없었고 도달 경로도 없었다
 */
export type MainTabId =
  | "news"
  | "me"
  | "team"
  | "league"
  | "people"
  | "schedule";

/** "나" 안의 상위 탭. 각 탭은 자기 하위 탭을 또 갖는다(2단) */
export type MeTabId =
  | "status"
  | "training"
  | "academics"
  | "finance"
  | "achievements";

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
  /**
   * 태그 제거.
   *
   * 🔴 **`addTag`만 있고 닫을 수단이 없었다.** 이벤트 연계를 태그로 만들면
   *   ("부상 이력" → 후속 이벤트) **한 번 붙은 태그가 평생 남는다.**
   *   연계가 끝나도 그 갈래가 계속 후보로 남아 다른 이야기를 밀어낸다.
   * ⚠ 없는 태그를 지우는 건 조용히 넘어간다 — 순서가 어긋나도 안 터진다.
   */
  removeTag?:       string[];

  /**
   * 관계도 변화 (Phase 7-6c). **`effectHint`와 반드시 일치시킬 것.**
   *
   * 6C가 걷어낸 감정 문구는 힌트에 "trust +5"라고 적어놓고 실제로는 사기·피로만
   * 움직였다 — 표시와 동작이 달랐다. 그 결함을 되풀이하지 않으려고 만든 필드다.
   *
   * `personId`를 비우면 그 종류의 현재 접촉 중인 첫 상대 (감독·구단주는 팀당 1명).
   */
  relationDelta?: {
    kind: import("./relationship").RelationKind;
    personId?: string;
    delta: number;
  };

  /**
   * 사치품 소비 (Phase 7-5 F-3 → 7-6c 배선). **`moneyDelta`와 같이 쓰지 않는다**
   * — 금액은 여기서 빠지므로 둘 다 적으면 두 번 빠진다.
   *
   * 관계도·명성 변화는 Rust `calc_luxury`가 정한다. 자기 소비는 성격에 따라
   * 명성의 **부호가 갈린다** (성실한 선수의 씀씀이는 구설이 된다).
   */
  luxurySpend?: {
    cost: number;
    onTeammate: boolean;
    /** 동료 지목. 비우면 접촉 중인 첫 동료 */
    personId?: string;
  };
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

/**
 * 오프시즌 결산. **`npcId`만 담고 이름·팀명은 안 담는다** —
 * 화면이 `npcs`에서 조회한다. 이유는 `utils/offseasonReport.ts` 머리말.
 */
export interface OffseasonMetadata {
  type: "offseason";
  seasonYear: number;
  events: import("../utils/offseasonReport").OffseasonEvent[];
}

/**
 * 월간 부상 리포트. 오프시즌 결산과 **같은 규격**이다 —
 * `npcId`만 담고 이름·팀명은 화면이 조회한다.
 */
export interface InjuryMetadata {
  type: "injury";
  week: number;
  /** "시즌 아웃" 판정의 근거. 0이면 화면이 그 등급을 안 만든다 */
  weeksLeftInSeason: number;
  events: import("../utils/injuryReport").InjuryEvent[];
}

/**
 * 주인공 몸 상태 월간 리포트.
 *
 * ⚠ **NPC 월간 부상 리포트(`InjuryMetadata`)와 데이터가 다르다.** 그쪽은
 * `npcId` 목록이고 이쪽은 내 부상 하나 + 결장·경고 기록이다. 규격을 억지로
 * 합치면 화면이 둘 다 어중간하게 그린다 — **주기와 구조만 같게** 둔다.
 *
 * ⚠ **부상 발생은 여기 안 담는다.** 다치는 순간은 사건이라 즉시 보낸다.
 * 여기 모으는 것은 **경고·결장·경과** — 월말에 몰아 봐도 되는 것들이다.
 */
export interface MyBodyEvent {
  week: number;
  kind: "absence" | "warning";
  /** absence — 왜 못 나갔나 */
  reason?: "injury" | "condition";
  /** absence — 상대 팀. 이름은 화면이 조회한다 */
  opponentTeamId?: string;
  /** absence(condition) — 그때 컨디션 값 */
  condition?: number;
  /** warning — 그때 피로와 부상 위험 % */
  fatigue?: number;
  riskPct?: number;
}

export interface MyBodyMetadata {
  type: "myBody";
  week: number;
  /** 월말 시점의 부상 상태. 없으면 null */
  injury: { injuryType: string; severity: string; weeksLeft: number; sinceWeek: number } | null;
  events: MyBodyEvent[];
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
  metadata?: TrainingMetadata | Top10Metadata | OffseasonMetadata | InjuryMetadata
           | MyBodyMetadata
           | { type: string };
}
