import type { PlayerSeasonStats } from "./save";

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

// ── 주 진행 정지 조건 ──────────────────────────────────────────
export type PendingAction =
  | { type: "game";    scheduleId: string }   // 경기 시작 대기
  | { type: "message"; messageId: string }    // 결정 메시지 대기
  | { type: "event";   eventId: string };     // 이벤트 선택 대기

// ── 주 진행 결과 (advanceWeek 반환값) ──────────────────────────
export interface WeekAdvanceResult {
  processedWeek: number;
  logs: string[];                       // 해당 주 발생 로그
  newMessages: string[];                // 새로 생긴 메시지 ID들
  matchResults: MatchResult[];          // 시뮬된 경기 결과들
  stoppedBy: PendingAction | null;      // null = 주 완료, non-null = 중단됨
}

// ── save_season.json 전체 구조 ─────────────────────────────────
export interface SaveSeason {
  version: number;      // 저장 포맷 버전
  savedAt: string;      // ISO 8601 timestamp
  leagueId: string;     // 현재 진행 리그 (예: "LEAGUE_HIGHSCHOOL")
  seasonYear: number;   // 시즌 연도
  currentWeek: number;  // 현재 주차 (1부터)
  totalWeeks: number;   // 전체 주차 수
  pendingActions: PendingAction[];        // 미처리 정지 조건 (순서 중요)
  schedule: ScheduleEntry[];
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;  // playerId → 누적 스탯
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
  };
}

// ── 스탯 계산 헬퍼 ─────────────────────────────────────────────
export function calcEra(er: number, ip: number): number {
  if (ip === 0) return 0;
  return Math.round((er * 9) / ip * 100) / 100;
}

export function calcWhip(bb: number, h: number, ip: number): number {
  if (ip === 0) return 0;
  return Math.round(((bb + h) / ip) * 100) / 100;
}

export function calcAvg(h: number, ab: number): number {
  if (ab === 0) return 0;
  return Math.round((h / ab) * 1000) / 1000;
}

export function calcOps(obp: number, slg: number): number {
  return Math.round((obp + slg) * 1000) / 1000;
}
