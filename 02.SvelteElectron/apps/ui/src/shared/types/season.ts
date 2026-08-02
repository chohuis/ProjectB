import type { PlayerSeasonStats } from "./save";
import type { DecisionEffect } from "./main";

// ── 출전 선수 한 경기 성적 라인 ────────────────────────────────
export interface PitcherGameLine {
  role: "pitcher";
  playerId: string;
  ip: number;
  er: number;
  h: number;
  k: number;
  bb: number;
  decision: "W" | "L" | "SV" | "HD" | "ND";
  pitchCount?: number;
}

export interface BatterGameLine {
  role: "batter";
  playerId: string;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
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
  | { type: "event";           eventId: string; title: string; description: string; choices?: EventChoice[] }
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
  /** 은퇴 권고 — 계약이 끝났고 구단이 다시 부르지 않는 상황 (05_히스토리_엔딩 §3) */
  | { type: "retirementAsk"; urgency: number }
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
      severity: "moderate" | "severe" | "surgery";
    }
  | {
      type: "conditionWarning";
      scheduleId: string;
      condition: number;
    }
  | { type: "preGameBriefing"; scheduleId: string };

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
    leagueSchedules: {},
    leagueState: {},
    postseasonBrackets: {},
    ablEastTeams: [],
    ablWestTeams: [],
    npcInjuries: {},
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
