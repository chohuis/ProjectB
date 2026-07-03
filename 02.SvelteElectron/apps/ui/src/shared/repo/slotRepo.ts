// ── R3a: 슬롯 DB v3 Repository 계층 (DESIGN.md §8.2 원칙 3) ──────────────
// 상태 읽기/쓰기의 유일한 접점. 이 모듈 밖에서 window.projectB.repo() 직접 호출 금지.
// 커맨드 실패는 항상 RepoError throw — 호출측은 부분 성공을 걱정할 필요 없음
// (main 프로세스에서 트랜잭션 전체가 롤백됨).

import type {
  PitchingAttributes, BattingAttributes, PositionRatings, PitchEntry,
  NpcPersonality, Handedness, PlayerType, Nationality, MilitaryStatus,
  NpcCareerStatus, InjurySeverity, InjuryType, PlayerSeasonStats,
} from "../types/save";

// ── 타입 (slotdb.cjs mapNpcRow와 1:1) ─────────────────────────
export interface RepoAbilities {
  pitching?: PitchingAttributes;
  batting?: BattingAttributes;
  positionRatings?: PositionRatings;
  pitches?: PitchEntry[];
}

export interface RepoMilitary {
  unit?: "sports" | "general";
  enlistYear?: number;
  dischargeYear?: number;
  originalLeagueId?: string;
  originalTeamId?: string;
}

export interface RepoInjury {
  type: InjuryType | string;
  severity?: InjurySeverity;
  weeksLeft: number;
  totalWeeks?: number;
}

export interface RepoNpc {
  npcId: string;
  name: string;
  nameEn?: string;
  isNamed: boolean;
  playerType: PlayerType;
  position: string;
  handedness: Handedness;
  jerseyNumber: number;
  age: number;
  grade?: number;
  schoolId: string;
  graduationYear: number;
  nationality: Nationality | string;
  careerStatus: NpcCareerStatus;
  currentLeague: string;
  currentTeam: string;
  salary: number;
  contractYears: number;
  proServiceYears: number;
  militaryStatus: MilitaryStatus;
  military?: RepoMilitary;
  developmentRate: number;
  potentialHidden: number;
  abilities: RepoAbilities;
  xp: { pitchingXp?: Record<string, number>; battingXp?: Record<string, number> };
  form?: unknown;                 // R3b 합성 궤적
  personality?: NpcPersonality;
  emotion?: unknown;              // Named 전용 (emotion/memories/status)
  injury?: RepoInjury;
  extra?: Record<string, unknown>; // fame·tags 등 확장
}

export interface RepoTransaction {
  id: number;
  season_year: number;
  week: number | null;
  category: "trade" | "fa" | "draft" | "military" | "retirement" | "callup" | "release";
  npc_id: string;
  npc_name: string;
  from_team_id: string | null;
  from_league_id: string | null;
  to_team_id: string | null;
  to_league_id: string | null;
  detail: string | null;
  group_id: string | null;
}

export interface RepoCareerLine {
  npcId: string;
  year: number;
  leagueId: string;
  teamId: string;
  statLine: string;
  stats?: PlayerSeasonStats;
  highlights?: string[];
}

export interface RepoSlotMeta {
  slotId: string;
  schema_version?: string;
  world_seed?: string;
  created_at?: string;
  updated_at?: string;
  slot_name?: string;
  [key: string]: string | undefined;
}

export class RepoError extends Error {
  constructor(public cmd: string, message: string) {
    super(`[slotRepo:${cmd}] ${message}`);
  }
}

async function call<T>(cmd: string, payload?: unknown): Promise<T> {
  const raw = await window.projectB!.repo(cmd, payload);
  const v = JSON.parse(raw) as T & { error?: string };
  if (v && typeof v === "object" && !Array.isArray(v) && "error" in v && v.error) {
    throw new RepoError(cmd, v.error);
  }
  return v as T;
}

// ── Repository API ────────────────────────────────────────────
export const slotRepo = {
  // 슬롯 수명
  createSlot: (p: { slotId: string; worldSeed: number; name?: string; protagonist: unknown; season: unknown; npcs: Partial<RepoNpc>[] }) =>
    call<{ ok: true; npcCount: number }>("createSlot", p),
  listSlots: () => call<RepoSlotMeta[]>("listSlots", {}),
  deleteSlot: (slotId: string) => call<{ ok: true }>("deleteSlot", { slotId }),

  getMeta: (slotId: string) => call<Record<string, string>>("getMeta", { slotId }),
  setMeta: (slotId: string, entries: Record<string, string | number>) =>
    call<{ ok: true }>("setMeta", { slotId, entries }),

  getProtagonist: <T>(slotId: string) => call<T | null>("getProtagonist", { slotId }),
  setProtagonist: (slotId: string, data: unknown) => call<{ ok: true }>("setProtagonist", { slotId, data }),
  getSeason: <T>(slotId: string) => call<T | null>("getSeason", { slotId }),
  setSeason: (slotId: string, data: unknown) => call<{ ok: true }>("setSeason", { slotId, data }),

  // NPC 삽입 (Lazy 리그 활성화·신입생)
  insertNpcs: (slotId: string, npcs: Partial<RepoNpc>[]) =>
    call<{ ok: true; inserted: number }>("insertNpcs", { slotId, npcs }),

  // ── 상태 변이 커맨드 ────────────────────────────────────────
  transfer: (p: {
    slotId: string; npcId: string; toTeamId: string; toLeagueId?: string;
    seasonYear: number; week?: number;
    category?: "fa" | "callup" | "release"; detail?: string; groupId?: string;
    salary?: number; contractYears?: number;
  }) => call<{ ok: true }>("transfer", p),

  swapTeams: (p: {
    slotId: string; seasonYear: number; week?: number; detail?: string; groupId?: string;
    a: { npcId: string; toTeamId: string; toLeagueId?: string };
    b: { npcId: string; toTeamId: string; toLeagueId?: string };
  }) => call<{ ok: true; groupId: string }>("swapTeams", p),

  assignDraft: (p: {
    slotId: string; seasonYear: number; week?: number;
    picks: { npcId: string; teamId: string; leagueId: string; round: number; pickNo: number; salary?: number; contractYears?: number }[];
  }) => call<{ ok: true; assigned: number }>("assignDraft", p),

  enlist: (p: {
    slotId: string; npcId: string; unit: "sports" | "general";
    enlistYear: number; dischargeYear: number; seasonYear: number; week?: number;
    toTeamId?: string; toLeagueId?: string;
  }) => call<{ ok: true }>("enlist", p),

  discharge: (p: { slotId: string; npcId: string; seasonYear: number; week?: number; toTeamId?: string; toLeagueId?: string }) =>
    call<{ ok: true }>("discharge", p),

  retire: (p: { slotId: string; npcId: string; seasonYear: number; week?: number; detail?: string }) =>
    call<{ ok: true }>("retire", p),

  updateWeekly: (slotId: string, updates: Array<{
    npcId: string; age?: number; careerStatus?: NpcCareerStatus;
    abilities?: RepoAbilities; xp?: RepoNpc["xp"]; form?: unknown;
    injury?: RepoInjury; clearInjury?: boolean; extra?: Record<string, unknown>;
  }>) => call<{ ok: true; updated: number }>("updateWeekly", { slotId, updates }),

  appendCareerHistory: (slotId: string, rows: RepoCareerLine[]) =>
    call<{ ok: true; rows: number }>("appendCareerHistory", { slotId, rows }),

  saveHistoryLeague: (p: { slotId: string; year: number; leagueId: string; kind: "standings" | "leaders" | "postseason"; data: unknown }) =>
    call<{ ok: true }>("saveHistoryLeague", p),

  // 시즌 경계 벌크 동기화 (오프시즌 일괄 결과 반영 전용 — 주간 변이는 개별 커맨드)
  syncNpcs: (slotId: string, npcs: RepoNpc[]) =>
    call<{ ok: true; synced: number }>("syncNpcs", { slotId, npcs }),

  // ── 조회 ────────────────────────────────────────────────────
  getNpc: (slotId: string, npcId: string) => call<RepoNpc | null>("getNpc", { slotId, npcId }),
  getAllNpcs: (slotId: string) => call<RepoNpc[]>("getAllNpcs", { slotId }),
  getByLeague: (slotId: string, leagueId: string, activeOnly = false) =>
    call<RepoNpc[]>("getByLeague", { slotId, leagueId, activeOnly }),
  getByTeam: (slotId: string, teamId: string) => call<RepoNpc[]>("getByTeam", { slotId, teamId }),
  getNamed: (slotId: string) => call<RepoNpc[]>("getNamed", { slotId }),
  countByTeam: (slotId: string) => call<{ teamId: string; n: number }[]>("countByTeam", { slotId }),
  getTransactions: (p: { slotId: string; seasonYear?: number; category?: RepoTransaction["category"]; leagueId?: string; npcId?: string; limit?: number }) =>
    call<RepoTransaction[]>("getTransactions", p),
  getCareerHistory: (slotId: string, npcId: string) =>
    call<RepoCareerLine[]>("getCareerHistory", { slotId, npcId }),
  getHistoryLeague: (p: { slotId: string; year?: number; leagueId?: string }) =>
    call<{ year: number; leagueId: string; kind: string; data: unknown }[]>("getHistoryLeague", p),
};
