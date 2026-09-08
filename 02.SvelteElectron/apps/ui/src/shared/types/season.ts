import type { PlayerSeasonStats } from "./save";
import type { DecisionEffect } from "./main";

// ── 출전 선수 한 경기 성적 라인 ────────────────────────────────
export interface PitcherGameLine {
  role: "pitcher";
  playerId: string;
  ip: number;
  er: number;
  h: number;
  /** 피홈런. **엔진은 처음부터 홈런을 따로 만드는데 안 세고 있었다**(2026-08-28).
   *  ⚠ 구 세이브의 경기 로그엔 없다 — 읽는 쪽이 `?? 0`으로 받는다. */
  hr?: number;
  k: number;
  bb: number;
  /** 사구 — 볼넷과 다른 사건이다. ⚠ 구 세이브 로그엔 없다 */
  hbp?: number;
  decision: "W" | "L" | "SV" | "HD" | "ND";
  /** **선발 등판인가.** 화면 넷이 GS(선발)를 표시하는데 올리는 코드가
   *  없어서 전원 0이었다 (2026-08-28). ⚠ 구 세이브 로그엔 없다 */
  gs?: boolean;
  /** 폭투 — 투수 책임(WP). ⚠ 구 세이브 로그엔 없다 */
  wp?: number;
  /** 보크 — 투수 책임(BK). ⚠ 구 세이브 로그엔 없다 */
  bk?: number;
  /**
   * 구종별 성적 — 무슨 공을 몇 개 던져 삼진·안타가 얼마였나.
   *
   * ⚠ **배경 리그엔 없다**(빈 객체) — 타석 단위 시뮬이라 구종을 안 정한다.
   *   지어내면 주인공 기록과 다른 척도가 된다.
   */
  pitchMix?: Record<string, { pc: number; k: number; h: number }>;
  /**
   * 이닝별 — 몇 회에 무너졌는지는 합계로 못 본다.
   *
   * ⚠ **주인공 경기에만 있다.** 배경 리그 720경기에 9이닝 배열을 붙이면
   *   세이브가 커지고 볼 화면도 없다.
   */
  byInning?: Array<{ inning: number; pc: number; er: number; outs: number }>;
  pitchCount?: number;
  /** 득점권 타수 — 위기 상황 성적을 보여주는 스플릿.
   *
   * ⚠ **시즌 ERA로는 성격이 안 보인다.** 득점권은 전체 타석의 22~23%뿐이라
   * 희석되고, 투수 기질 20↔90의 차이(ERA 0.18)가 시즌 노이즈(±0.14)에 묻힌다.
   * 실제 야구도 이걸 시즌 ERA가 아니라 상황별 성적으로 본다. */
  rispAb?: number;
  rispH?: number;
}

export interface BatterGameLine {
  role: "batter";
  playerId: string;
  ab: number;
  h: number;
  /** 2루타·3루타. 예전엔 `h` 하나로 뭉개서 **SLG가 근사였다**
   *  (`(h + hr*3)/ab` — 장타를 단타로 셌다).
   *  ⚠ 구 세이브의 경기 로그엔 없다. */
  b2?: number;
  b3?: number;
  hr: number;
  /** 득점 — **홈을 밟은 사람 것**이다. 타점(rbi)과 다르다. */
  r?: number;
  /** 사구·희생번트·희생플라이 — **셋 다 타수가 아니다.**
   *  타석(PA)·출루율(OBP) 식이 이 값들을 봐야 한다. ⚠ 구 세이브 로그엔 없다 */
  hbp?: number;
  sac?: number;
  sf?: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  /** 도루자 — `sb` 와 짝이다. ⚠ 구 세이브엔 없다 */
  cs?: number;
  /** 포일 — **포수 책임**(PB). 타자 줄에 실리지만 그 이닝 포수 것이다 */
  pb?: number;
  /** 득점권 타수·안타 — 투수 쪽과 짝이다 */
  rispAb?: number;
  rispH?: number;
}

export type PlayerGameLine = PitcherGameLine | BatterGameLine;

// ── 경기 중 발생 이벤트 ────────────────────────────────────────
export type GameEventType = "injury" | "breakout" | "slump" | "ejection";

export interface GameEvent {
  type: GameEventType;
  playerId: string;
  description: string;
}

// ── 경기 결과 ─────────────────────────────────────────────────
export interface MatchResult {
  homeScore: number;
  awayScore: number;
  winnerId: string;   // 승리팀 ID
  loserId: string | null;  // null = 무승부
  playerLines: PlayerGameLine[];
  events: GameEvent[];
}

// ── 시즌 페이즈 ────────────────────────────────────────────────
export type SeasonPhase = "preseason" | "season" | "postseason" | "offseason";

// ── 시즌 일정 항목 ─────────────────────────────────────────────
export interface ScheduleEntry {
  id: string;               // "SCH_W01_G1"
  week: number;             // 1–N (시즌 주차)
  gameDate: string;         // "2026-04-15" — 실제 경기 날짜
  leagueId?: string;        // 소속 리그 (멀티리그용)
  homeTeamId: string;
  awayTeamId: string;
  isProtagonistGame: boolean;  // 주인공 팀 경기 여부
  phase: SeasonPhase;       // 해당 경기의 시즌 페이즈
  result?: MatchResult;     // 경기 완료 후 채워짐
  isFriendly?: boolean;     // 친선경기 여부 (공식 기록 미집계)
  isTournament?: boolean;   // 전국대회 — 개인 기록은 집계, 리그 순위는 미반영 (Phase 5-4)
  friendlyStats?: {         // 친선경기 주인공 개인 성적 (isFriendly=true일 때만)
    ip:     number;
    er:     number;
    k:      number;
    bb:     number;
    rating: 1 | 2 | 3 | 4 | 5;  // 코치 평가 별점
  };
}

// ── 친선경기 성적 로그 (applyFriendlyResult 전달용 — 저장은 ScheduleEntry.friendlyStats로) ──
export interface FriendlyPerformanceLog {
  scheduleId:     string;
  week:           number;
  opponentTeamId: string;
  ip:             number;
  er:             number;
  k:              number;
  bb:             number;
  rating:         1 | 2 | 3 | 4 | 5;  // 코치 평가 별점
}

// ── 팀 순위표 항목 ─────────────────────────────────────────────
export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;       // wins / (wins + losses), draws 제외
  runsFor: number;      // 시즌 누적 득점
  runsAgainst: number;  // 시즌 누적 실점
  streak: string;       // "W3" | "L2" | "D1"
  last10: string;       // "7W2L1D" 형태
}

// ── 인게임 이벤트 선택지 ──────────────────────────────────────
export interface EventChoice {
  id: string;
  label: string;
  effectHint?: string;       // 표시용 효과 설명 (예: "+컨디션 10")
  effects?: DecisionEffect;  // 실제 적용 효과
}

// ── 주 진행 정지 조건 ──────────────────────────────────────────
export type PendingAction =
  | { type: "game";            scheduleId: string }
  | { type: "message";         messageId: string }
  | {
      type: "event"; eventId: string; title: string; description: string; choices?: EventChoice[];
      // ── 등급 표시 (2026-09-08 · PLAN_EVENT_TIERS §9 · C 4-5) ──
      //
      // 🔴 **지금 이 셋을 채워 보내는 자리는 없다**(2026-09-08 실측). 등급 줄기가
      //   뿑은 이벤트는 **소식함으로** 가고(`MessageItem.eventGrade`), 이 pending 을
      //   올리는 것은 병영생활·트레이드 둘뿐이라 둘 다 등급이 없다.
      //   그래도 칸을 둔 이유: 모달과 소식이 **같은 칩·같은 「종류만」 규칙**을
      //   쓰게 둘을 한 번에 맞춰 두지 않으면, 나중에 등급 이벤트가 모달로 오는 날
      //   숨기는 규칙이 한쪽에만 있게 된다 — 숨기는 줄은 빠지면 **숫자가 새는** 쪽이다.
      grade?: import("../utils/tierRules").EventGrade;
      theme?: import("../utils/eventTierCopy").EventTheme;
      /** 이벤트에 붙은 대가(§4). 어느 갈래를 골라도 낸다 — 모달은 종류만 적는다 */
      cost?: DecisionEffect;
      /**
       * 소식 갈래 (2026-09-08 · L3). `"notice"` 면 상태 효과가 먹는다.
       * ⚠ **없으면 이벤트다** — 상태 효과는 무시되고 로그만 남는다
       *   (`usecases/decisions.applySideEffects`).
       */
      lane?: import("./event").MessageLane;
    }
  | { type: "careerChoiceHub" }
  | { type: "careerResults" }
  | { type: "careerChoice" }
  | { type: "draftObserve" }
  | {
      type: "draftNotification";
      teamId: string;
      leagueId: string;
      round: number;
      pickNo: number;
      salary: number;
      /** 신인 계약 연수. 규칙 파일(draftRules.contract.durationYears)이 정한다 —
       *  예전엔 리터럴 `3`이라 규칙을 바꾸면 타입이 먼저 깨졌다 */
      durationYears: number;
      signingBonus: number;
      altUniversityTeamId?: string;
      altIndependentTeamId?: string;
    }
  | {
      type: "salaryNegotiation";
      teamId: string;
      leagueId: string;
      offeredSalary: number;
      durationYears: number;
      minDurationYears: number;
      maxDurationYears: number;
      signingBonus: number;
      context: "initial" | "renewal" | "military_return";
    }
  | { type: "faMarket" }
  /**
   * 은퇴 권고 (05_히스토리_엔딩 §3).
   *
   * `decline` 계약이 끝났고 구단이 다시 부르지 않는 상황 — 거절하고 더 뛸 수 있다
   * `injury` 수술급 부상의 재기 불가 판정 — **거절 선택지가 없다**(설계상 "부상 강제")
   */
  | { type: "retirementAsk"; urgency: number; reason?: "decline" | "injury"; detail?: string }
  | {
      type: "trade";
      fromTeamId: string;
      toTeamId: string;
      toLeagueId?: string;
      receivedNpcId: string;
      receivedNpcName: string;
      receivedOvr: number;
      receivedPosition: string;
      receivedSalary: number;
      tradeReason: string;           // "position_surplus"|"injury_cover"|"seller_mode"|"buyer_mode"|"expiring_contract"|"player_ambition"
      receivedMedicalConcern: number; // 0~1 (받는 선수 우려도)
      receivedMedicalNote?: string;  // "현재 부상 중 (회복 4주)" 등 표시용
    }
  | { type: "sportsUnitApplication" }
  | { type: "militaryEnlistAsk"; reason: "rejected" | "overdue" }
  | {
      type: "optionClause";
      optionType: "team" | "player";
      exercised: boolean;
      nextSalary: number;
    }
  | {
      type: "injuryTreatment";
      injuryType: string;
      /**
       * 🔴 **`"surgery"` 를 뺐다** (2026-09-01 · 트랙 C 가 잡았다).
       *
       * 수술은 **심각도가 아니라 치료법**이다. 이 pending 은 "치료를
       * 고르라"고 묻는 것이고, 수술은 그 화면의 **선택지 중 하나**다
       * (`InjuryTreatmentModal` 의 `id: "surgery"`).
       *
       * 두 생산부 모두 `=== "moderate" || === "severe"` 로 막는다 —
       * **선언만 넓었다.** 그래서 `applyGameOutcome:490` 이
       * `as "moderate" | "severe"` 로 우회하고 있었고, 좁히면서 같이 지웠다.
       */
      severity: "moderate" | "severe";
    }
  | {
      type: "conditionWarning";
      scheduleId: string;
      condition: number;
    };

// ⚠ `preGameBriefing`은 **정지 조건이 아니다** (2026-08-07 제거). 경기 앞에
// 강제로 뜨는 창이라 매 경기 하나를 더 닫아야 넘어갔고, 그 사이 쌓인 소식은
// 볼 기회가 없었다. 지금은 경기 창(`GameStatusModal`)에서 여는 읽기 전용
// 창이고, 진행은 그 창의 자동/직접 플레이 버튼이 맡는다.

/**
 * 세이브에서 되살릴 정지 조건 — `hydrateFromSlot`이 이 목록으로 거른다.
 *
 * ⚠ **화면이 없는 정지 조건은 세이브를 잠근다.** 큐에 남아 있으면
 * `hasPendingAction`이 계속 true라 "다음 주 진행"이 안 먹는데, 화면엔
 * 아무것도 안 떠서 원인이 안 보인다 — `preGameBriefing`을 뺐을 때 실제로
 * 그렇게 됐다(W6에서 잠김).
 *
 * ⚠ **아래 `_assert`가 이 배열과 `PendingAction`을 붙들어 맨다.** 타입에만
 * 추가하고 여기 빠뜨리면 그 정지 조건이 저장은 되는데 로드에서 조용히
 * 사라진다 — 정본이 둘이 되는 그 형태다. 컴파일 에러로 잡는다.
 */
export const PENDING_ACTION_TYPES = [
  "game", "message", "event",
  "careerChoiceHub", "careerResults", "careerChoice",
  "draftObserve", "draftNotification", "salaryNegotiation", "faMarket",
  "trade", "optionClause",
  "sportsUnitApplication", "militaryEnlistAsk", "retirementAsk",
  "injuryTreatment", "conditionWarning",
] as const;

/** 타입에 있는데 위 배열에 없으면 여기서 컴파일이 깨진다 */
type _MissingPendingType = Exclude<PendingAction["type"], typeof PENDING_ACTION_TYPES[number]>;
const _assertNoMissingPendingType: [_MissingPendingType] extends [never] ? true : never = true;
void _assertNoMissingPendingType;

// ── 주 진행 결과 (advanceWeek 반환값) ──────────────────────────
export interface WeekAdvanceResult {
  processedWeek: number;
  logs: string[];                       // 해당 주 발생 로그
  newMessages: string[];                // 새로 생긴 메시지 ID들
  matchResults: MatchResult[];          // 시뮬된 경기 결과들
  stoppedBy: PendingAction | null;      // null = 주 완료, non-null = 중단됨
}

export interface InteractiveMatchContext {
  scheduleId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  protagonistTeamId: string;
  weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
  role?: "SP" | "RP" | "CP";
  entryTrigger?:
    | { type: "inning_start"; inning: number }
    | { type: "mid_inning"; inning: number; maxOuts: number }
    | { type: "close_game"; inningThreshold: number; maxLeadDiff: number };
}

export interface MatchInjury {
  injuryType: string;
  severity: string;
}

export interface InteractiveMatchResult {
  scheduleId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  strikeouts: number;
  hitsAllowed: number;
  walksAllowed: number;
  outsRecorded: number;
  /** 등판 중 실점. 없으면 호출측이 피안타로 역산한다(구 경로 호환) */
  earnedRuns?: number;
  errors: number;
  pitchCount: number;
  /** 경기 날짜 "YYYY-MM-DD" — 의무 휴식 판정용 (Phase 5-8). 없으면 일정에서 찾는다 */
  gameDate?: string;
  summary: string;
  /**
   * 주인공이 **실제로 나갔는가**. 없으면 나간 것으로 본다(구 경로 호환).
   *
   * 🔴 `UnifiedGameOutcome` 에는 있는데 **여기만 빠져 있었다**
   * (2026-09-01 · 트랙 C 가 잡았다). `MatchPage` 는 이미 만들어 넘기고
   * 화면도 `=== false` 로 갈라 그리는데 타입만 뒤처져 있었다.
   *
   * ⚠ **`false` 와 `undefined` 가 다르다.** 판정이 전부
   *   `!== true` / `!== false` 형태라, 없으면 "나갔다"로 떨어진다 —
   *   기록이 0 이어도 등판으로 세는 갈래가 여기 걸려 있다.
   */
  protagonistEntered?: boolean;
  batterLines?: BatterGameLine[];
  playerLines?: PlayerGameLine[];
  midGameInjury?: MatchInjury;
}

export interface UnifiedGameOutcome {
  source: "auto" | "interactive";
  scheduleId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  protagonistTeamId: string;
  homeScore: number;
  awayScore: number;
  strikeouts: number;
  hitsAllowed: number;
  walksAllowed: number;
  outsRecorded: number;
  /** 등판 중 실점. 없으면 호출측이 피안타로 역산한다(구 경로 호환) */
  earnedRuns?: number;
  errors: number;
  pitchCount: number;
  /** 경기 날짜 "YYYY-MM-DD" — 의무 휴식 판정용 (Phase 5-8). 없으면 일정에서 찾는다 */
  gameDate?: string;
  summary: string;
  protagonistEntered?: boolean;
  batterLines?: BatterGameLine[];
  playerLines?: PlayerGameLine[];
  midGameInjury?: MatchInjury;
}

// ── 포스트시즌 시리즈 ──────────────────────────────────────────
export interface PostseasonSeries {
  id: string;           // "KBL_WC" | "KBL_PREP" | "ABL_EDS" 등
  leagueId: string;
  round: string;        // 표시용: "와일드카드" | "준플레이오프" 등
  homeTeamId: string;   // "" = 아직 미결정 (이전 시리즈 대기)
  awayTeamId: string;
  bestOf: 1 | 3 | 5 | 7;
  homeWins: number;
  awayWins: number;
  winner: string | null;
  homeFrom: string | null;             // 홈팀 공급 시리즈 ID
  awayFrom: string | null;             // 원정팀 공급 시리즈 ID
  nextSeriesId: string | null;         // 승자가 진출하는 다음 시리즈 ID
  nextSeriesSlot: "home" | "away" | null;
}

// ── 선수 경기간 컨디션 ────────────────────────────────────────
export interface PlayerCondition {
  fatigue: number;          // 0~100, 100 = 완전 회복
  lastPitchedWeek: number;  // 마지막 등판 주차 (0 = 미등판) — 구 경로, 호환용
  /**
   * 마지막 등판 날짜 "YYYY-MM-DD" (Phase 5-8).
   *
   * 의무 휴식표가 일 단위라 주차로는 표현이 안 된다 — 고교 주말리그(토·일)에서
   * "토요일 105구 던지고 일요일 또"가 주 단위 검사로는 안 걸린다.
   */
  lastPitchedDate?: string;
  /** 그날 던진 투구 수 — 휴식일 산출의 입력 */
  lastPitchCount?: number;
  pitchOutsLast: number;    // 직전 경기 던진 아웃 수
  lastStartGameCount?: number;       // SP: 마지막 선발 시점의 teamRotationIndex
  lastAppearanceGameCount?: number;  // RP/CP: 마지막 출전 시점의 teamRotationIndex
  consecutiveAppearances?: number;   // RP/CP: 현재 연속 출전 수 (쉬면 0 리셋)
}

// ── 리그별 순위·스탯 ─────────────────────────────────────────
export interface LeagueSeasonState {
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;
  playerConditions: Record<string, PlayerCondition>;  // 투수 피로도·컨디션
  teamRotationIndex: Record<string, number>;           // teamId → 다음 선발 로테이션 슬롯
}

// ── NPC 라이브 스탯 (월간 성장/하락 반영, npcLiveStats에 저장) ──
export interface NpcLiveStat {
  pitching?: import("../types/save").NpcPitchingAttrs;
  batting?: import("../types/save").NpcBattingAttrs;
  pitchingXp: Record<string, number>;
  battingXp: Record<string, number>;
  seasonStartPitching?: import("../types/save").NpcPitchingAttrs;
  seasonStartBatting?: import("../types/save").NpcBattingAttrs;
  peakOvr?: number;
  pitches?: import("../types/save").PitchEntry[];
  pitchInTraining?: { id: string; progress: number; isNew: boolean };
  /**
   * 스탯별 미반영 노화 누적분.
   *
   * ⚠ **매주 왕복시켜야 한다.** 안 넘기면 Rust가 매번 0에서 시작하고,
   * 주당 감퇴량(연 2.5 / 52 = 0.048)이 영원히 1.0을 못 넘어 **노화가
   * 통째로 사라진다** — 실제로 그 상태였다.
   */
  agingDebt?: Record<string, number>;
}

// ── save_season.json 전체 구조 ─────────────────────────────────
export interface SaveSeason {
  version: number;      // 저장 포맷 버전
  savedAt: string;      // ISO 8601 timestamp
  leagueId: string;     // 현재 진행 리그 (예: "LEAGUE_HIGHSCHOOL")
  seasonYear: number;   // 시즌 연도
  currentWeek: number;  // 현재 주차 (1부터)
  currentDate: string;  // "2026-04-15" — 현재 게임내 날짜
  totalWeeks: number;   // 전체 주차 수
  pendingActions: PendingAction[];        // 미처리 정지 조건 (순서 중요)
  schedule: ScheduleEntry[];
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;  // playerId → 누적 스탯
  triggeredEvents: Record<string, number>;   // eventId → 마지막 발생 주차
  /**
   * 문장 뱅크의 직전 선택 (Phase 7-6). `templateId#body → index`.
   * 시즌이 바뀌어도 안 지운다 — 시즌 경계에서 같은 문장이 반복되면 그게 더 티난다
   */
  sentenceMemory?: Record<string, number>;

  // ── 등급 줄기의 시즌 상태 (2026-09-08 · PLAN_EVENT_TIERS §3) ────
  //
  // 셋 다 **시즌마다 비운다**(`makeEmptySeason`) — 상한도 마른 시즌도 밀린 주도
  // 시즌 단위 개념이다. 커리어를 넘는 것은 `careerTriggeredEvents`(히든 종당 1회)
  // 하나뿐이고 그건 주인공 쪽에 있다.
  /** 등급별 이번 시즌 발동 수 — 시즌 상한(rare 6 · unique 2 · hidden 1)을 잰다 */
  tierCounts?: Record<string, number>;
  /** 등급별 마지막으로 뜬 주 — `dryBoost`(마른 시즌 방지)의 입력 */
  tierLastWeek?: Record<string, number>;
  /**
   * 규칙별 밀린 주 수 — 등급 안 가중(`starve`)의 입력.
   *
   * ⚠ **저장 안 하면 밀린 이야기가 매주 처음부터 다시 밀린다** —
   *   가중이 낮은 규칙이 한 시즌 내내 뒤에 서게 된다.
   */
  eventStarve?: Record<string, number>;
  // L1: 멀티리그 지원
  leagueSchedules: Record<string, ScheduleEntry[]>;      // leagueId → 경기 일정
  leagueState: Record<string, LeagueSeasonState>;        // leagueId → 순위·스탯
  // 포스트시즌 브라켓 (leagueId → 시리즈 목록)
  postseasonBrackets: Record<string, PostseasonSeries[]>;
  // ABL 컨퍼런스 배정 (시즌 시작 시 랜덤)
  ablEastTeams: string[];
  ablWestTeams: string[];
  // NPC 부상 상태 (playerId → 부상 정보)
  npcInjuries: Record<string, import("../types/save").NpcInjuryEntry>;
  /**
   * 아직 소식으로 안 나간 부상 — **월 1회 모아서 보낸다.**
   *
   * ⚠ `npcInjuries`에서 파생할 수 없다. 그건 *지금 다친 사람*이라
   * 한 달 안에 낫고 만 부상은 이미 사라졌고, 부상 은퇴자는 아예 안 들어온다.
   * 소식은 **그 달에 일어난 일**이라 따로 쌓아야 한다.
   */
  injuryNewsBuffer: import("../utils/injuryReport").InjuryEvent[];
  /**
   * **주인공** 몸 상태 사건 — 경고·결장. 월 1회 모아서 보낸다.
   *
   * NPC 부상은 위에서 이미 월간인데 **내 몸만 낱개로 왔다**(경고 한 통,
   * 부상 결장 한 통, 컨디션 결장 한 통). 그 비대칭을 없앤다.
   *
   * ⚠ **부상 발생은 여기 안 쌓는다** — 다치는 순간은 사건이라 즉시 보낸다.
   */
  myBodyBuffer: import("./main").MyBodyEvent[];
  /**
   * 국가대표 차출 — npcId → 남은 주.
   *
   * 부상과 **같은 취급**이다: 승강의 상시 콜업이 이 자리를 메운다
   * (사용자 확정 — 발탁되면 그 주 소속팀 경기에서 빠진다).
   * 대회가 끝나면 비워진다.
   */
  nationalDuty?: Record<string, number>;
  /** 진행 중인 대회 — 폐막 주에 결과를 뽑기 위해 들고 있는다 */
  activeTournament?: {
    def: import("../usecases/nationalTeam").TournamentDef;
    squadStrength: number;
    endWeek: number;
  } | null;
  // 부상 은퇴 NPC 목록 (playerId)
  npcRetired: string[];
  // 모든 선수 NPC 라이브 스탯 (월간 성장/하락 누적, entityId → NpcLiveStat)
  npcLiveStats: Record<string, NpcLiveStat>;
  // 전년도 KBL 최종 순위 — 드래프트 지명 순서 결정 (꼴지팀부터)
  prevSeasonKblStandings: Standing[];
  // 전국대회 브래킷 (tournamentId → 브래킷). 개설 전에는 없다 (Phase 5-4)
  tournaments: Record<string, import("../utils/tournament").TournamentBracket>;
  // 대회 시드용 순위 스냅샷 — 대회마다 보는 시점이 다르다 (Phase 5-5a)
  standingsSnapshots: import("../utils/standingsSnapshot").StandingsSnapshots;
  // 조별예선 (은하기·여명기). 예선이 끝나면 tournaments에 본선 브래킷이 생긴다 (Phase 5-5d)
  groupStages: Record<string, import("../utils/tournament").GroupStage>;
  // 독립 4단계 생존리그 진행 상태 (Phase 5-6)
  survival: import("../utils/survivalLeague").SurvivalState | null;
  /**
   * 팀별 부진 시즌 누적 — 감독 경질 판정의 입력 (Phase 6B).
   *
   * 전력★ 기대 순위에 미달한 시즌이 쌓이고, 구단주 patience가 정한 임계값에
   * 닿으면 경질된다. 시즌을 넘겨야 누적되므로 세이브에 남는다.
   */
  staffSlumpSeasons: Record<string, number>;
  /**
   * 세계 시드. slot.db meta의 world_seed와 같은 값을 시즌 상태에도 둔다.
   *
   * 조 추첨처럼 "세이브마다 달라야 하지만 다시 열면 같아야" 하는 뽑기가
   * 매 주 진행 중에 필요한데, 그때마다 slot.db를 비동기로 읽을 수는 없다.
   */
  worldSeed: number;
}

export const SAVE_SEASON_VERSION = 1;

export function makeEmptySeason(
  leagueId: string,
  seasonYear: number,
  totalWeeks: number,
  teamIds: string[],
): SaveSeason {
  return {
    version: SAVE_SEASON_VERSION,
    savedAt: new Date().toISOString(),
    leagueId,
    seasonYear,
    currentWeek: 0,
    currentDate: `${seasonYear}-03-01`,
    totalWeeks,
    pendingActions: [],
    schedule: [],
    standings: teamIds.map((teamId) => ({
      teamId,
      wins: 0,
      losses: 0,
      draws: 0,
      winPct: 0,
      runsFor: 0,
      runsAgainst: 0,
      streak: "",
      last10: "",
    })),
    stats: {},
    triggeredEvents: {},
    sentenceMemory: {},
    tierCounts: {},
    tierLastWeek: {},
    eventStarve: {},
    leagueSchedules: {},
    leagueState: {},
    postseasonBrackets: {},
    ablEastTeams: [],
    ablWestTeams: [],
    npcInjuries: {},
    injuryNewsBuffer: [],
    myBodyBuffer: [],
    npcRetired: [],
    npcLiveStats: {},
    prevSeasonKblStandings: [],
    tournaments: {},
    standingsSnapshots: {},
    groupStages: {},
    survival: null,
    staffSlumpSeasons: {},
    worldSeed: 0,
  };
}

// ── 스탯 계산 헬퍼 ─────────────────────────────────────────────
export function calcEra(er: number, ip: number): number {
  if (!ip || isNaN(ip)) return 0;
  return Math.round((er * 9) / ip * 100) / 100;
}

export function calcWhip(bb: number, h: number, ip: number): number {
  if (!ip || isNaN(ip)) return 0;
  return Math.round(((bb + h) / ip) * 100) / 100;
}

export function calcAvg(h: number, ab: number): number {
  if (ab === 0) return 0;
  return Math.round((h / ab) * 1000) / 1000;
}

export function calcOps(obp: number, slg: number): number {
  return Math.round((obp + slg) * 1000) / 1000;
}
