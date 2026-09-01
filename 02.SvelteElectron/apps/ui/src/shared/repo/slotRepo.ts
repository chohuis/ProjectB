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
  /** 복무 **중**인 부대. 전역하면 비워진다 */
  unit?: "sports" | "general";
  /** 다녀온 부대 — **전역 뒤에도 남는다.** 없으면 상무/현역 구분이 사라진다 */
  servedUnit?: "sports" | "general";
  /** 군 계급 — 생성 시 복무 개월로 정해진다 (military_roster.rs) */
  rank?: string;
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
  createSlot: (p: {
    slotId: string; worldSeed: number; name?: string;
    protagonist: unknown; season: unknown;
    npcs: Partial<RepoNpc>[];
    /** 스태프 국내 전원 (Phase 6A) — 같은 트랜잭션에 들어간다 */
    staff?: import("./staffGen").StaffRow[];
  }) =>
    call<{ ok: true; npcCount: number; staffCount: number }>("createSlot", p),

  // ── 스태프 (Phase 6A) ───────────────────────────────────────
  insertStaff: (slotId: string, staff: import("./staffGen").StaffRow[]) =>
    call<{ ok: true; inserted: number }>("insertStaff", { slotId, staff }),
  /** teamId/role/leagueId/status로 좁힐 수 있다 */
  getStaff: (slotId: string, filter: { teamId?: string; role?: string; leagueId?: string; status?: string } = {}) =>
    call<import("./staffGen").StaffRow[]>("getStaff", { slotId, ...filter }),
  updateStaff: (slotId: string, updates: Array<{
    staffId: string; age: number; status: string; years: number;
    teamId: string; leagueId: string; stats: Record<string, number>;
  }>) => call<{ ok: true; updated: number }>("updateStaff", { slotId, updates }),
  // ── 관계도 (Phase 6C) ───────────────────────────────────────
  /** `withPerson`이면 person VIEW를 조인해 이름·소속까지 온다 (화면용) */
  getRelationships: (slotId: string, filter: {
    kind?: import("../types/relationship").RelationKind;
    contact?: import("../types/relationship").RelationContact;
    personIds?: string[];
    withPerson?: boolean;
  } = {}) =>
    call<import("../types/relationship").Relationship[]>("getRelationships", { slotId, ...filter }),

  /** 신규 생성과 갱신이 같은 경로. 값 clamp는 커맨드 쪽에서도 한 번 더 한다 */
  upsertRelationships: (slotId: string, rows: import("../types/relationship").Relationship[]) =>
    call<{ ok: true; written: number }>("upsertRelationships", { slotId, rows }),

  /** 팀 이동·은퇴 시 접촉 상태만 바꾼다. `fromTeam`이면 그 팀 전원 일괄 */
  setRelationshipContact: (slotId: string, p: {
    contact: import("../types/relationship").RelationContact;
    personIds?: string[];
    fromTeam?: string;
  }) => call<{ ok: true }>("setRelationshipContact", { slotId, ...p }),

  listSlots: () => call<RepoSlotMeta[]>("listSlots", {}),
  deleteSlot: (slotId: string) => call<{ ok: true }>("deleteSlot", { slotId }),

  getMeta: (slotId: string) => call<Record<string, string>>("getMeta", { slotId }),
  setMeta: (slotId: string, entries: Record<string, string | number>) =>
    call<{ ok: true }>("setMeta", { slotId, entries }),

  getProtagonist: <T>(slotId: string) => call<T | null>("getProtagonist", { slotId }),
  setProtagonist: (slotId: string, data: unknown) => call<{ ok: true }>("setProtagonist", { slotId, data }),
  getSeason: <T>(slotId: string) => call<T | null>("getSeason", { slotId }),
  /**
   * 시즌 저장. `scheduleDelta`를 주면 **일정만 항목 단위로** 갱신한다
   * (없으면 예전처럼 전량 교체).
   *
   * ⚠ 시즌 롤오버처럼 일정이 통째로 갈릴 땐 델타를 주면 안 된다 —
   * 지우기를 못 나르므로 옛 일정이 남는다. `collectScheduleDelta`가
   * 그럴 때 `null`을 돌려준다.
   */
  setSeason: (slotId: string, data: unknown, scheduleDelta?: unknown) =>
    call<{ ok: true }>("setSeason", { slotId, data, ...(scheduleDelta ? { scheduleDelta } : {}) }),

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
    picks: { npcId: string; teamId: string; leagueId: string; round: number; pickNo: number; salary?: number; contractYears?: number; detail?: string }[];
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

  saveHistoryLeague: (p: { slotId: string; year: number; leagueId: string; kind: "standings" | "leaders" | "postseason" | "awards"; data: unknown }) =>
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

  /**
   * 거래기록 일괄 삽입 (1 트랜잭션).
   *
   * 새 게임의 과거 경력 시딩(Phase 6.5)이 유일한 대량 사용처다. 개별 이적은
   * `transfer`/`assignDraft` 같은 커맨드가 기록까지 같이 남기므로 이걸 쓰지 않는다 —
   * 여기로 직접 쓰면 npc 테이블과 기록이 어긋날 수 있다.
   */
  addTransactions: (slotId: string, rows: Array<Record<string, unknown>>) =>
    call<{ ok: true }>("addTransactions", { slotId, rows }),
  getCareerHistory: (slotId: string, npcId: string) =>
    call<RepoCareerLine[]>("getCareerHistory", { slotId, npcId }),
  /**
   * 리그 연감. **셋 다 선택이다** — 아무것도 안 주면 전 연도·전 리그를 준다.
   * 연도별로 N번 부르지 않게 `kind` 로 걸러 한 번에 읽어라.
   */
  getHistoryLeague: (p: { slotId: string; year?: number; leagueId?: string; kind?: string }) =>
    call<{ year: number; leagueId: string; kind: string; data: unknown }[]>("getHistoryLeague", p),
};
