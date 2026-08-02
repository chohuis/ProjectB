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

/**
 * 팀당 유지 인원 상한 — **정본은 `generation_rules.json rosterRules`다.**
 *
 * 예전엔 여기와 Rust `roster_rule()`에 각각 표가 박혀 있었고 둘 다 규칙 파일과
 * 달랐다 (KBL 상한 65 vs 생성 인원 30). 그 65가 1군·2군 합산에 걸리는 바람에
 * 프로 소속이 700명까지 부풀었다.
 */
export interface RosterLimit { rosterMin?: number; rosterMax: number }

export function rosterLimitsFrom(
  rosterRules: Record<string, { rosterMin?: number; rosterMax?: number }>,
): Record<string, RosterLimit> {
  const out: Record<string, RosterLimit> = {};
  for (const [leagueId, r] of Object.entries(rosterRules)) {
    if (typeof r?.rosterMax !== "number") continue;
    out[leagueId] = { rosterMin: r.rosterMin, rosterMax: r.rosterMax };
  }
  return out;
}

/**
 * 외국인 판정에 필요한 두 표. **정본은 규칙 파일이고 여기서 파생만 한다.**
 *
 * ⚠ 자국 국적을 빼먹으면 Rust가 전부 KOR로 읽어 ABL(USA)·JBL(JPN) 로스터
 * 전원이 외국인이 된다 — 그 리그 FA가 통째로 멎는다.
 */
export function foreignParamsFrom(rulesFile: {
  foreignRules?: { leagues?: string[] };
  rosterRules?: Record<string, { nationality?: string }>;
}): { foreignLeagues: string[]; homeNationality: Record<string, string> } {
  const homeNationality: Record<string, string> = {};
  for (const [lid, r] of Object.entries(rulesFile.rosterRules ?? {})) {
    homeNationality[lid] = r?.nationality ?? "KOR";
  }
  return { foreignLeagues: rulesFile.foreignRules?.leagues ?? [], homeNationality };
}

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
  /** 규칙 파일의 상한. 안 넘기면 Rust에 상한이 없어 로스터가 무한히 부푼다 */
  rosterLimits?: Record<string, RosterLimit>,
  salaryRules?: unknown,
  /**
   * 방출·FA 미계약자가 갈 곳. **안 넘기면 그 사람들이 전부 은퇴 처리된다** —
   * 22세 신인이 방출 한 번에 야구를 그만두게 된다
   */
  placement?: {
    universityTeamIds: string[];
    independentTeamIds: string[];
    rules: import("./draftSystem").PlacementRules;
  },
  /**
   * 방출 2단계 (faRules.release). 안 넘기면 1단계(정원 초과)만 돈다 —
   * 그러면 부진한 고연봉 베테랑이 정원 안에서 계속 버틴다
   */
  releaseRules?: unknown,
  /**
   * 외국인 판정표 (`foreignParamsFrom`). 안 넘기면 외국인 개념이 없는 세계로
   * 돌아간다 — 용병이 FA를 취득하고 2군으로 강등되며 보유 한도가 깨진다
   */
  foreign?: { foreignLeagues: string[]; homeNationality: Record<string, string> },
): Promise<OffseasonResult> {
  const namedFlags = new Map(npcs.map(n => [n.npcId, n.isNamed] as const));
  const paramsJson = JSON.stringify({
    npcs, pendingDraft, seasonYear, namedNpcIds: namedNpcIds ?? [],
    rosterLimits: rosterLimits ?? {},
    ...(salaryRules ? { salaryRules } : {}),
    ...(placement ? {
      universityTeamIds: placement.universityTeamIds,
      independentTeamIds: placement.independentTeamIds,
      placement: placement.rules,
    } : {}),
    ...(releaseRules ? { releaseRules } : {}),
    ...(foreign ?? {}),
  });
  const json = await api().npcRunOffseason(paramsJson);
  const raw = parseResult<{ npcs: NpcSaveState[]; pendingDraft: NpcSaveState[]; summary: SeasonEndSummary; logs: string[] }>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => ({
    ...n,
    isNamed:         n.isNamed         ?? namedFlags.get(n.npcId),
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
