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

// ── 상수 (UI·기타 코드에서 참조) ─────────────────────────────
export const KBL_FARM_MAP: Record<string, string> = {
  "PKT_Busan_GiantWhales":     "TEAM_KBL_GIANTWHALES_2",
  "PKT_Changwon_SteelDinos":   "TEAM_KBL_STEELDINOS_2",
  "PKT_Daegu_RoyalLions":      "TEAM_KBL_ROYALLIONS_2",
  "PKT_Daejeon_SoaringEagles": "TEAM_KBL_SOARINGEAGLES_2",
  "PKT_Gwangju_EmberTigers":   "TEAM_KBL_EMBERTIGERS_2",
  "PKT_Incheon_SkyGulls":      "TEAM_KBL_SKYGULLS_2",
  "PKT_Seoul_BearGuardians":   "TEAM_KBL_BEARGUARDIANS_2",
  "PKT_Seoul_TwinWolves":      "TEAM_KBL_TWINWOLVES_2",
};

export const ABL_FARM_MAP: Record<string, string> = {
  "TEAM_ABL_EMPIRE_1":           "TEAM_ABL_EMPIRE_2",
  "TEAM_ABL_HARBORHAWKS_1":      "TEAM_ABL_HARBORHAWKS_2",
  "TEAM_ABL_SUNDRAGONS_1":       "TEAM_ABL_SUNDRAGONS_2",
  "TEAM_ABL_WINDBEARS_1":        "TEAM_ABL_WINDBEARS_2",
  "TEAM_ABL_SPACECOMETS_1":      "TEAM_ABL_SPACECOMETS_2",
  "TEAM_ABL_PEACHTREEFALCONS_1": "TEAM_ABL_PEACHTREEFALCONS_2",
  "TEAM_ABL_LONESTARS_1":        "TEAM_ABL_LONESTARS_2",
  "TEAM_ABL_RAINARROWS_1":       "TEAM_ABL_RAINARROWS_2",
  "TEAM_ABL_BAYSEALS_1":         "TEAM_ABL_BAYSEALS_2",
  "TEAM_ABL_WAVERIDERS_1":       "TEAM_ABL_WAVERIDERS_2",
  "TEAM_ABL_MOTORWOLVES_1":      "TEAM_ABL_MOTORWOLVES_2",
  "TEAM_ABL_MOUNTAINPEAKS_1":    "TEAM_ABL_MOUNTAINPEAKS_2",
  "TEAM_ABL_LAKESPIRITS_1":      "TEAM_ABL_LAKESPIRITS_2",
  "TEAM_ABL_COASTALRAYS_1":      "TEAM_ABL_COASTALRAYS_2",
  "TEAM_ABL_DESERTSERPENTS_1":   "TEAM_ABL_DESERTSERPENTS_2",
  "TEAM_ABL_RIVERCARDINALS_1":   "TEAM_ABL_RIVERCARDINALS_2",
};

export const JBL_FARM_MAP: Record<string, string> = {
  "TEAM_JBL_CL_NEONCRANES_1":     "TEAM_JBL_CL_NEONCRANES_2",
  "TEAM_JBL_CL_TEMPOSTINGS_1":    "TEAM_JBL_CL_TEMPOSTINGS_2",
  "TEAM_JBL_CL_IRONDRAKES_1":     "TEAM_JBL_CL_IRONDRAKES_2",
  "TEAM_JBL_CL_TIDERAVES_1":      "TEAM_JBL_CL_TIDERAVES_2",
  "TEAM_JBL_CL_SILVERWOLVES_1":   "TEAM_JBL_CL_SILVERWOLVES_2",
  "TEAM_JBL_CL_IRONSTORMS_1":     "TEAM_JBL_CL_IRONSTORMS_2",
  "TEAM_JBL_PL_THUNDERFALCONS_1": "TEAM_JBL_PL_THUNDERFALCONS_2",
  "TEAM_JBL_PL_POLARBEARS_1":     "TEAM_JBL_PL_POLARBEARS_2",
  "TEAM_JBL_PL_SPIRITBUFFALOS_1": "TEAM_JBL_PL_SPIRITBUFFALOS_2",
  "TEAM_JBL_PL_MARINESOLDIERS_1": "TEAM_JBL_PL_MARINESOLDIERS_2",
  "TEAM_JBL_PL_SEAGULLS_1":       "TEAM_JBL_PL_SEAGULLS_2",
  "TEAM_JBL_PL_SUNS_1":           "TEAM_JBL_PL_SUNS_2",
};

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
): Promise<OffseasonResult> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const paramsJson = JSON.stringify({ npcs, pendingDraft, seasonYear });
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
