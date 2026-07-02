import type { MessageItem } from "../types/main";
import type { NpcSaveState } from "../types/save";

// ── 시즌 종료 요약 ────────────────────────────────────────────
export interface SeasonEndSummary {
  retiredCount: number;
  militaryEnlistedCount: number;
  militaryDischargedCount: number;
  faCount: number;
  univGraduatedCount: number;
}

// 팀/구단 ID 파생 규칙(팜 팀·구단→1군 등)은 utils/ids.ts 참조 — 하드코딩 맵 금지

type RosterRule = { min: number; max: number };
export const ROSTER_RULES: Record<string, RosterRule> = {
  LEAGUE_HIGHSCHOOL:  { min: 18, max: 30 },
  LEAGUE_UNIVERSITY:  { min: 20, max: 40 },
  LEAGUE_INDEPENDENT: { min: 18, max: 45 },
  LEAGUE_KBL:         { min: 40, max: 65 },
  LEAGUE_ABL:         { min: 50, max: 90 },
  LEAGUE_JBL:         { min: 45, max: 80 },
};

export function clampStat(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

export function npcCoreOvr(npc: NpcSaveState): number {
  if (npc.playerType === "pitcher") return npc.pitching?.ovr ?? 0;
  return npc.batting?.ovr ?? 0;
}

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── 오프시즌 결과 ─────────────────────────────────────────────
export interface OffseasonResult {
  npcs: NpcSaveState[];
  pendingDraft: NpcSaveState[];
  summary: SeasonEndSummary;
  logs: string[];
  mailboxEntry: MessageItem | null;
}

// ── 오프시즌 전체 처리 (Rust DLL 위임) ──────────────────────
export async function runOffseasonProcessing(
  npcs: NpcSaveState[],
  pendingDraft: NpcSaveState[],
  seasonYear: number,
  namedNpcIds?: string[],
): Promise<OffseasonResult> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const paramsJson = JSON.stringify({ npcs, pendingDraft, seasonYear, namedNpcIds: namedNpcIds ?? [] });
  const json = await api().npcRunOffseason(paramsJson);
  const raw = parseResult<{ npcs: NpcSaveState[]; pendingDraft: NpcSaveState[]; summary: SeasonEndSummary; logs: string[] }>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => ({
    ...n,
    emotionRole:     n.emotionRole     ?? emotionRoles.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
  });

  const mailboxEntry: MessageItem | null = raw.logs.length > 0
    ? {
        id: `msg-offseason-${Date.now()}`,
        category: "news",
        sender: "연감",
        subject: "오프시즌 선수 동향",
        preview: raw.logs[0],
        body: raw.logs.join("\n"),
        createdAt: `Y${seasonYear}`,
        readAt: null,
      }
    : null;

  return {
    npcs:        raw.npcs.map(rehydrate),
    pendingDraft: raw.pendingDraft.map(rehydrate),
    summary:     raw.summary,
    logs:        raw.logs,
    mailboxEntry,
  };
}
