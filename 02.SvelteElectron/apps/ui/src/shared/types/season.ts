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
  | { type: "careerChoice" }
  | { type: "messengerScript"; contactId: string; arcId: string }
  | { type: "draft" }
  | {
      type: "salaryNegotiation";
      teamId: string;
      leagueId: string;
      offeredSalary: number;
      durationYears: number;
      signingBonus: number;
    }
  | { type: "faMarket" }
  | { type: "trade"; fromTeamId: string; toTeamId: string }
  | { type: "militaryEnlist" }
  | {
      type: "optionClause";
      optionType: "team" | "player";
      exercised: boolean;
      nextSalary: number;
    };

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
  errors: number;
  pitchCount: number;
  summary: string;
  batterLines?: BatterGameLine[];
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
  errors: number;
  pitchCount: number;
  summary: string;
  batterLines?: BatterGameLine[];
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
  lastPitchedWeek: number;  // 마지막 등판 주차 (0 = 미등판)
  pitchOutsLast: number;    // 직전 경기 던진 아웃 수
}

// ── 리그별 순위·스탯 ─────────────────────────────────────────
export interface LeagueSeasonState {
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;
  playerConditions: Record<string, PlayerCondition>;  // 투수 피로도·컨디션
  teamRotationIndex: Record<string, number>;           // teamId → 다음 선발 로테이션 슬롯
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
  // L1: 멀티리그 지원
  leagueSchedules: Record<string, ScheduleEntry[]>;      // leagueId → 경기 일정
  leagueState: Record<string, LeagueSeasonState>;        // leagueId → 순위·스탯
  // 고교 A/B조 배정 (매 시즌 랜덤, protagonist 조는 schedule/standings에 반영)
  hsGroupA: string[];
  hsGroupB: string[];
  // 포스트시즌 브라켓 (leagueId → 시리즈 목록)
  postseasonBrackets: Record<string, PostseasonSeries[]>;
  // ABL 컨퍼런스 배정 (시즌 시작 시 랜덤)
  ablEastTeams: string[];
  ablWestTeams: string[];
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
    leagueSchedules: {},
    leagueState: {},
    hsGroupA: [],
    hsGroupB: [],
    postseasonBrackets: {},
    ablEastTeams: [],
    ablWestTeams: [],
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
