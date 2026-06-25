import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type {
  BattingAttributes,
  NpcEmotionRole,
  NpcSaveState,
  PitchingAttributes,
} from "../types/save";

// ── IPC 헬퍼 ─────────────────────────────────────────────────
const api = () => (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;

function parseResult<T>(json: string): T {
  const v = JSON.parse(json) as { error?: string } & T;
  if (v && typeof v === "object" && "error" in v) throw new Error(String((v as { error: string }).error));
  return v as T;
}

// ── 핵심 변환: EntityRow → NpcSaveState (TS 유지) ────────────
export function entityToNpcState(
  entity: EntityRow,
  seasonYear: number,
  emotionRole?: NpcEmotionRole,
): NpcSaveState {
  const pl   = entity.details.player as EntityPlayerDetails;
  const grade = (Math.min(entity.grade ?? 3, 3)) as 1 | 2 | 3;
  const isMilitary = entity.militaryStatus === "현역";
  const notes = (entity as unknown as { notes?: string }).notes ?? "";
  const group = notes.includes("senior") ? "senior" : "junior";
  const clubId = (entity as unknown as { clubId?: string }).clubId ?? "";
  const originLeagueId = entity.originLeagueId ?? "";
  const originalTeamId = clubId
    ? clubId.replace(/^CLUB_/, "TEAM_") + "_1"
    : undefined;
  return {
    npcId:        entity.id,
    name:         entity.name,
    nameEn:       entity.nameEn,
    playerType:   pl.playerType === "twoWay" ? "pitcher" : pl.playerType,
    position:     pl.position,
    grade,
    age:          entity.age,
    schoolId:     entity.schoolId ?? "",
    graduationYear: seasonYear + (3 - grade),
    emotionRole,
    careerStatus:  isMilitary ? "military" : "active",
    currentLeague: entity.leagueId,
    currentTeam:   entity.teamId,
    militaryStatus:    isMilitary ? "현역" : (entity.militaryStatus ?? "미필"),
    militaryUnit:      isMilitary ? "sports" : undefined,
    militaryEnlistYear:    isMilitary ? seasonYear - (group === "senior" ? 1 : 0) : undefined,
    militaryDischargeYear: isMilitary ? seasonYear + (group === "senior" ? 1 : 2) : undefined,
    originalLeagueId:  isMilitary && originLeagueId ? originLeagueId : undefined,
    originalTeamId:    isMilitary && originalTeamId ? originalTeamId : undefined,
    pitching:        pl.pitching as PitchingAttributes | undefined,
    batting:         pl.batting  as BattingAttributes  | undefined,
    developmentRate: pl.developmentRate,
    potentialHidden: pl.potentialHidden ?? 75,
    careerHistory:  [],
    achievements:   [],
    fame:           0,
    personality:    entity.personality,
  };
}

// ── 프로 선수 EntityRow → NpcSaveState 변환 ─────────────────
export function entityToProNpcState(
  entity: EntityRow,
  _seasonYear: number,
): NpcSaveState {
  const pl = entity.details?.player;
  const isMilitary =
    entity.militaryStatus === "현역" || pl?.militaryStatus === "현역";
  const enlistYear = pl?.militaryEnlistYear;
  const careerStatus: NpcSaveState["careerStatus"] =
    entity.status === "retired" ? "retired"
    : isMilitary               ? "military"
    : entity.status === "inactive" ? "free_agent"
    : "active";

  return {
    npcId:          entity.id,
    name:           entity.name,
    nameEn:         entity.nameEn,
    playerType:     pl?.playerType === "twoWay" ? "pitcher" : (pl?.playerType ?? "pitcher"),
    position:       pl?.position ?? "",
    age:            entity.age,
    schoolId:       "",
    graduationYear: 0,
    careerStatus,
    currentLeague:  isMilitary ? (pl?.originalLeagueId ?? entity.leagueId) : entity.leagueId,
    currentTeam:    isMilitary ? (pl?.originalTeamId   ?? entity.teamId)   : entity.teamId,
    militaryStatus: entity.militaryStatus ?? pl?.militaryStatus ?? "미필",
    militaryUnit:   isMilitary ? (pl?.militaryUnit ?? "general") : undefined,
    militaryEnlistYear:    enlistYear,
    militaryDischargeYear: enlistYear ? enlistYear + 2 : undefined,
    originalLeagueId: isMilitary ? entity.leagueId : undefined,
    originalTeamId:   isMilitary ? entity.teamId   : undefined,
    developmentRate:  pl?.developmentRate ?? 50,
    potentialHidden:  pl?.potentialHidden ?? 75,
    proServiceYears:  pl?.proServiceYears ?? 0,
    currentSalary:    pl?.contract?.salary,
    contractYears:    pl?.contract?.remainingYears,
    personality:      entity.personality,
    careerHistory:    [],
    achievements:     [],
    fame:             0,
  };
}

export function initHighSchoolNpcs(
  entities: EntityRow[],
  seasonYear: number,
  emotionRoleMap: Map<string, NpcEmotionRole>,
): NpcSaveState[] {
  return entities
    .filter(e =>
      e.role === "player" &&
      e.leagueId === "LEAGUE_HIGHSCHOOL" &&
      (!e.entryYear || e.entryYear <= seasonYear),
    )
    .map(e => entityToNpcState(e, seasonYear, emotionRoleMap.get(e.id)));
}

// ── 학년 진급 결과 ────────────────────────────────────────────
export interface GradeAdvanceResult {
  updated:       NpcSaveState[];
  hsGraduated:   NpcSaveState[];  // HS grade 3 → 드래프트 풀
  univGraduated: NpcSaveState[];  // 대학 grade 4 → 드래프트 풀
}

// ── HS 전용 학년 진급 (기존 호환, advance_all_grades 사용 권장) ──
export async function advanceHighSchoolGrades(
  npcs: NpcSaveState[],
  seasonYear: number,
): Promise<GradeAdvanceResult> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcAdvanceGrades(JSON.stringify({ npcs, seasonYear }));
  const raw = parseResult<GradeAdvanceResult>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => ({
    ...n,
    emotionRole:     n.emotionRole     ?? emotionRoles.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
  });
  return {
    updated:       raw.updated.map(rehydrate),
    hsGraduated:   raw.hsGraduated.map(rehydrate),
    univGraduated: raw.univGraduated.map(rehydrate),
  };
}

// ── HS + 대학 전체 학년 진급 (단일 호출) ─────────────────────
export async function advanceAllGrades(
  npcs: NpcSaveState[],
  seasonYear: number,
): Promise<GradeAdvanceResult> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcAdvanceAllGrades(JSON.stringify({ npcs, seasonYear }));
  const raw = parseResult<GradeAdvanceResult>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => ({
    ...n,
    emotionRole:     n.emotionRole     ?? emotionRoles.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
  });
  return {
    updated:       raw.updated.map(rehydrate),
    hsGraduated:   raw.hsGraduated.map(rehydrate),
    univGraduated: raw.univGraduated.map(rehydrate),
  };
}

// ── 전체 NPC 나이 +1 (학년 진급 이후 단일 호출) ──────────────
export async function advanceAllAges(
  npcs: NpcSaveState[],
): Promise<NpcSaveState[]> {
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcAdvanceAllAges(JSON.stringify({ npcs }));
  const result = parseResult<NpcSaveState[]>(json);
  return result.map(n => ({
    ...n,
    emotionRole:     n.emotionRole     ?? emotionRoles.get(n.npcId),
    potentialHidden: n.potentialHidden ?? 75,
  }));
}

// ── 주인공 학년 진급 (TS 유지) ───────────────────────────────
export interface ProtagonistGradeResult {
  newGrade:     1 | 2 | 3 | 4 | "graduated";
  patch:        { grade?: 1 | 2 | 3 | 4 };
  isGraduating: boolean;
}

export function advanceProtagonistGrade(
  currentGrade: number,
  careerStage: string,
): ProtagonistGradeResult {
  const maxGrade = careerStage === "university" ? 4 : 3;
  if (currentGrade >= maxGrade) {
    return { newGrade: "graduated", patch: {}, isGraduating: true };
  }
  const next = (currentGrade + 1) as 1 | 2 | 3 | 4;
  return { newGrade: next, patch: { grade: next }, isGraduating: false };
}
