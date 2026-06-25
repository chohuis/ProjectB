import { writable } from "svelte/store";

// ── 이벤트 로그 타입 ──────────────────────────────────────────────
export type PlayerEventType =
  | "trade" | "fa_apply" | "fa_result"
  | "draft" | "enlist_sports" | "enlist_general" | "discharge"
  | "callup" | "calldown" | "renewal" | "adjustment" | "retire";

export interface PlayerEventEntry {
  npcId: string;
  name: string;
  fromTeamId?: string;
  toTeamId?: string;
  fromLeagueId?: string;
  toLeagueId?: string;
  detail: string;        // "OVR:75 SP 28세 → 3500만/2년" 등
}

export interface PlayerEvent {
  id: string;
  type: PlayerEventType;
  seasonYear: number;
  week?: number;
  leagueId?: string;
  players: PlayerEventEntry[];
  counts: { input: number; processed: number; saved: number };
  dbOk: boolean;
  durationMs: number;
  extra?: string;        // 추가 요약 텍스트
}

// ── EventHistory 스토어 (세션 내 이벤트 누적) ─────────────────────
interface EventHistoryState {
  events: PlayerEvent[];
}

function createEventHistoryStore() {
  const { subscribe, update, set } = writable<EventHistoryState>({ events: [] });
  return {
    subscribe,
    push(event: PlayerEvent) {
      update(s => ({ events: [...s.events.slice(-499), event] }));
    },
    clear() { set({ events: [] }); },
  };
}

export const eventHistory = createEventHistoryStore();

// ── AutoAdvance UI 스토어 ─────────────────────────────────────────
interface AutoAdvanceState {
  running: boolean;
  log: string[];
  stopReason: string | null;
}

function createAutoAdvanceStore() {
  const { subscribe, update, set } = writable<AutoAdvanceState>({
    running: false,
    log: [],
    stopReason: null,
  });

  return {
    subscribe,
    start() {
      update(() => ({ running: true, stopReason: null, log: [] }));
    },
    stop(reason: string) {
      update((s) => ({ ...s, running: false, stopReason: reason }));
    },
    addLog(msg: string) {
      update((s) => ({ ...s, log: [...s.log.slice(-99), msg] }));
    },
    reset() {
      set({ running: false, log: [], stopReason: null });
    },
  };
}

export const autoAdvanceStore = createAutoAdvanceStore();

// ── 파일 로그 공유 유틸 ───────────────────────────────────────────
let _autoLogFile: string | null = null;

export function setAutoLogFile(filename: string | null): void {
  _autoLogFile = filename;
}

export function autoLog(msg: string): void {
  if (!_autoLogFile) return;
  const api = (window as Window & { projectB?: { logWrite?: (p: string) => Promise<string> } }).projectB;
  if (!api?.logWrite) return;
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  api.logWrite(JSON.stringify({ filename: _autoLogFile, content: `[${ts}] ${msg}` })).catch(() => {});
}

// ── 이벤트 타입 한글명 ─────────────────────────────────────────────
const EVENT_LABEL: Record<PlayerEventType, string> = {
  trade:          "트레이드",
  fa_apply:       "FA신청",
  fa_result:      "FA결과",
  draft:          "드래프트",
  enlist_sports:  "체육부대입대",
  enlist_general: "일반병입대",
  discharge:      "전역",
  callup:         "콜업",
  calldown:       "콜다운",
  renewal:        "재계약",
  adjustment:     "계약조정",
  retire:         "은퇴",
};

// 팀ID 축약 (TEAM_KBL_TWINWOLVES_1 → TW1)
function shortTeam(teamId?: string): string {
  if (!teamId) return "-";
  // TEAM_KBL_TWINWOLVES_1 → TW_1, LEAGUE_MILITARY → MIL
  const league = teamId.replace(/^TEAM_[A-Z]+_/, "").replace(/_(\d)$/, "·$1");
  return league.length > 16 ? league.slice(0, 14) + "…" : league;
}

// ── 구조화 블록 로그 ──────────────────────────────────────────────
export function logEvent(event: PlayerEvent): void {
  eventHistory.push(event);

  const label = EVENT_LABEL[event.type] ?? event.type;
  const league = event.leagueId ? ` ${event.leagueId.replace("LEAGUE_", "")}` : "";
  const week   = event.week    ? ` W${event.week}` : "";
  const header = `━━ [${label}] Y${event.seasonYear}${league}${week} ━━━━━━━━━━━━━━━━━`;

  autoLog(header);
  autoLog(
    `  투입 ${event.counts.input} / 처리 ${event.counts.processed} / DB ${event.counts.saved}건 ${event.dbOk ? "✓" : "✗"} | ${event.durationMs}ms`
  );

  for (const p of event.players.slice(0, 30)) {
    const from = shortTeam(p.fromTeamId);
    const to   = shortTeam(p.toTeamId);
    const arrow = (p.fromTeamId || p.toTeamId) ? ` ${from}→${to}` : "";
    autoLog(`  ─ ${p.name}${arrow} | ${p.detail}`);
  }
  if (event.players.length > 30) {
    autoLog(`  ... 외 ${event.players.length - 30}명`);
  }
  if (event.extra) autoLog(`  ${event.extra}`);
  autoLog(`━━ END ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// ── 상태 일관성 검증 ──────────────────────────────────────────────
export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export function logVerify(label: string, checks: VerifyCheck[]): void {
  const allOk = checks.every(c => c.ok);
  autoLog(`[VERIFY${allOk ? " ✓" : " ⚠"}] ${label}`);
  for (const c of checks) {
    const mark = c.ok ? "✓" : "⚠";
    autoLog(`  ${mark} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
  }
}

// ── 이벤트 카운트 헬퍼 (UI에서 사용) ─────────────────────────────
export function countByType(events: PlayerEvent[], type: PlayerEventType): number {
  return events.filter(e => e.type === type).reduce((s, e) => s + e.players.length, 0);
}
