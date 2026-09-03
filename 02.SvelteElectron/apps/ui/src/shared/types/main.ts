/**
 * 사이드바 6칸. (U4 — 11개에서 줄였다)
 *
 * 없어진 것은 사라진 게 아니라 **아래로 한 단 들어갔다**:
 *   home·messages  → `news`  (U3에서 소식 하나로 합쳐짐)
 *   status·training·academics·finance·achievements → `me`의 하위 탭
 *   test           → 개발 도구(Ctrl+Q)라 내비에 없었고 도달 경로도 없었다
 */
export type MainTabId =
  /** 복무 중에만 · 맨 앞 (PLAN_MILITARY_LIFE §22 · 유무는 careerStage 하나가 정한다) */
  | "military"
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
  | "achievements"
  | "hallOfFame";

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
  /**
   * 투수 보직 선택 (PLAN_ROLE_RECOMMEND §4). `"SP"|"RP"|"CP"`.
   *
   * ⚠ `applyDecision` 이 아니라 `usecases/pitcherRole.applyRoleChoice` 가 읽는다 —
   * 보직은 스탯 델타가 아니라 포지션·역할 배정이라 store 패처가 둘이다.
   */
  roleChoice?:      "SP" | "RP" | "CP";
  // ── 현역 병영생활 전용 (PLAN_MILITARY_LIFE §28) — `militaryLife` 가 있을 때만 읽는다 ──
  // ⚠ 이름이 `memberRelationDelta` 인 이유: 아래 `relationDelta`(코치·동료 관계도 · {kind, delta})가 이미 있다.
  //   이벤트 JSON 의 선택지 필드는 `relationDelta`(§28)이고, 루프가 pending 으로 옮길 때 이 이름으로 바꾼다.
  memberRelationDelta?: number;              // 부대원 관계 ± (대상은 relationTarget)
  relationTarget?:  string;                  // 부대원 id · "all" · "subunit" · "junior" (없으면 이벤트의 member → 없으면 all)
  ballDelta?:       number;                  // 야구 감각 ±
  award?:           string;                  // 표창 id
  penalty?:         string;                  // 징계 id
  leaveDays?:       number;                  // 휴가 일수 +
  perfTierDelta?:   number;                  // 성과 판정 tier 보정 (−1 이 유리)
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
   * 이번 학기 **학습 품질**을 더한다 (주당 품질 0~1이 눈금이다).
   *
   * 🔴 **학점을 건드릴 보상이 없었다.** `universityGpa`는 조건으로 읽기만 했고,
   *   힌트 여덟 자리가 "학점 유리"라 써놓고 실제로는 **성실만 움직였다**
   *   (트랙 B가 결함으로 넘긴 자리 · 문구는 B가 동작에 맞춰 고쳤다).
   *
   * ⚠ **누적 학점(`universityGpa`)을 직접 건드리지 않는다.** 학점은
   *   `settleSemester`가 `qualityAccum / weeks`로 내는 값이라, 누적을 직접
   *   밀면 다음 정산이 그 위에 또 평균을 내서 **두 번 반영된다.**
   *   여기 더하면 "이번 학기에 공부를 더/덜 했다"가 되어 구조와 맞는다.
   *
   * ⚠ 주차(`semesterWeeks`)는 안 늘린다 — 늘리면 평균이 희석돼 반대로 간다.
   * ⚠ 대학이 아니면 조용히 무시한다(고교는 9등급 경로라 학점이 없다).
   */
  studyQualityDelta?: number;

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

// ── 소식 대시보드 — 형태별 규격 셋 (PLAN_MESSAGE_DASHBOARDS §3) ──
//
// 🔴 **종류마다 타입을 만들지 않는다.** 대상이 48자리인데 그 수만큼 규격을
//    만들면 화면도 48개가 된다. 화면이 실제로 보는 것은 `columns` 와 `rows`
//    뿐이라, **형태**(표·순위·타임라인)로 셋만 둔다. 어느 소식인지는
//    `kind` 문자열이 들고, 타입 안전은 **만드는 쪽**(각 `weekPhases` 모듈)이
//    진다.
//
// ⚠ **값을 글자로 굳혀 보내지 않는다.** 지금 소식들은 `lines.join("\n")` 로
//    본문 한 덩어리를 만들어 보내는데, 그러면 화면이 정렬도 강조도 못 한다 —
//    그게 이 대시보드화가 고치려는 결함이다. 만드는 쪽이 배열을 넘긴다.

/** 표 한 칸의 값. 화면이 정렬을 고르므로 숫자는 숫자로 싣는다 */
export type TableCell = string | number | boolean | null;

export interface TableColumn {
  key: string;
  label: string;
  /** 기본은 첫 열만 왼쪽이고 나머지는 오른쪽이다 — 이 값이 그걸 뒤집는다 */
  align?: "left" | "right" | "center";
}

/**
 * 표 — 값이 여러 줄이고 열이 같은 소식 19자리가 이것 하나를 쓴다
 * (다이제스트·경기 결과·시즌 결산·계약·로스터·대진 …).
 */
export interface TableMetadata {
  type: "table";
  /** 어느 소식인지 — 화면이 제목·단위를 고를 때만 쓴다 ("digest" | "bracket" | …) */
  kind: string;
  columns: TableColumn[];
  /**
   * 행. 열 `key` 로 값을 찾는다.
   *
   * ⚠ `myTeam: true` 를 실은 행은 굵게 그린다 — 대진은 **내 팀 행이 라운드마다
   *   하나씩 여럿**이라 `highlightRow` 인덱스 하나로는 모자란다 (§3 대진).
   */
  rows: (Record<string, TableCell> & { myTeam?: boolean })[];
  /** 강조할 행 하나 (내 팀·나). 여럿이면 행의 `myTeam` 을 쓴다 */
  highlightRow?: number;
  /**
   * 순위 변동을 그릴 열. 각 행이 이 키에 **지난 값과의 차**를 든다 —
   * 양수면 `↑n`, 음수면 `↓n`, 0 이면 `—`.
   *
   * ⚠ **지난 값이 없으면 이 키를 빼고 보낸다.** `0` 으로 채우면
   *   「변동 없음」과 「모름」이 같아 보인다 (§3-1).
   */
  deltaKey?: string;
  /** 표 아래 한 줄. 없으면 문안(dashboard_labels.json)의 것을 쓴다 */
  footnote?: string;
  /**
   * 표 아래 붙는 **두 번째 표**. 계약 완료 소식이 「조건」(항목·값) 아래
   * 「인센티브」(항목·조건·금액)를 다는 자리다 — 열이 아예 달라 한 표에
   * 못 넣는다 (PLAN_MESSAGE_DASHBOARDS §5 시안 3).
   *
   * ⚠ **선택이다.** 안 실어 보내면 아무것도 안 그린다. 문안은 점으로 이어
   *   찾으므로 `kind` 를 `"contractSigned.incentives"` 로 준다.
   */
  extra?: TableMetadata;
}

/** 순위 — 등수가 뜻을 갖는 소식 셋 (대회 최종 순위·대회 수상·2군 우승) */
export interface RankListMetadata {
  type: "rankList";
  kind: string;
  /** 제목 줄. 없으면 안 그린다 */
  title?: string;
  /** `delta` 는 지난 값과의 차. 없으면 변동을 안 그린다 (§3-1) */
  items: { rank: number; label: string; sub?: string; isMe?: boolean; delta?: number }[];
}

/** 타임라인 — 시간 순서 자체가 뜻인 소식 셋 (군 경력·복무 연차·고교 연감) */
export interface TimelineMetadata {
  type: "timeline";
  kind: string;
  entries: { when: string; label: string; detail?: string }[];
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

/**
 * 보직 선택 소식 (PLAN_ROLE_RECOMMEND §4).
 *
 * 🔴 **적합도(fits)는 안 싣는다.** 화면이 안 그리는 값을 세이브에 넣으면
 * 「보이지 않는데 저장되는 값」이 되고, 나중에 그걸 근거로 화면을 만들면 두 벌이 된다.
 *
 * ⚠ `ahead` 는 **화면이 다시 계산하지 않는다.** 소식이 들고 온 값을 그대로 쓴다 —
 * 두 벌이 되면 한쪽만 고쳐진 채 남는다 (§5).
 */
export interface RoleChoiceMetadata {
  type: "roleChoice";
  /** 감독 추천 — 옵션 id 와 같은 눈금 */
  recommended: "sp" | "rp" | "cp";
  /** 그 자리를 지금 차지한 같은 팀 투수 수. 확인 문구가 쓰는 유일한 숫자 */
  ahead: { sp: number; rp: number; cp: number };
  /**
   * 자리별 내 순위와 자리 수 — **고른 뒤 `roleFit` 으로 옮겨 적는 재료다** (§5 · 1.1 A④).
   *
   * ⚠ 화면은 안 쓴다(문구는 `ahead` 만 본다). 옛 산식 폴백·구 세이브엔 없어서 optional 이고,
   *   없으면 깊이 0 = 불이익 없음으로 떨어진다.
   */
  ranks?: { sp: number; rp: number; cp: number };
  seats?: { sp: number; rp: number; cp: number };
  managerName: string;
  year: number;
  teamId: string;
  week: number;
  /** 왜 묻나 — 문안의 머리말 키 (season|stageMove|callup|demote|discharge) */
  reason: import("../utils/roleChoiceCopy").RoleAskReason;
  /** 추천 문안을 고른 무대 (highschool|university|independent|pro|farm) */
  stage: import("../utils/roleChoiceCopy").RoleCopyStage;
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
           | MyBodyMetadata | RoleChoiceMetadata
           | TableMetadata | RankListMetadata | TimelineMetadata
           | { type: string };
}
