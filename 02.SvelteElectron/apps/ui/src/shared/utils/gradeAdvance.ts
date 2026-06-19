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
  // 체육부대: notes에서 group 파악 ("senior" = 전역 1년 남음, "junior" = 막입대 2년 남음)
  const notes = (entity as unknown as { notes?: string }).notes ?? "";
  const group = notes.includes("senior") ? "senior" : "junior";
  // clubId에서 원소속팀 ID 파생 (CLUB_KBL_TWINWOLVES → TEAM_KBL_TWINWOLVES_1)
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
  updated:   NpcSaveState[];
  graduated: NpcSaveState[];
}

// ── 학년 진급 (Rust DLL 위임) ────────────────────────────────
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
    updated:   raw.updated.map(rehydrate),
    graduated: raw.graduated.map(rehydrate),
  };
}

// ── 주인공 학년 진급 (경량 — TS 유지) ───────────────────────
export interface ProtagonistGradeResult {
  newGrade:     1 | 2 | 3 | "graduated";
  patch:        { grade?: 1 | 2 | 3; age: number };
  isGraduating: boolean;
}

export function advanceProtagonistGrade(
  currentGrade: 1 | 2 | 3,
  currentAge:   number,
): ProtagonistGradeResult {
  const newAge = currentAge + 1;
  if (currentGrade === 3) {
    return { newGrade: "graduated", patch: { age: newAge }, isGraduating: true };
  }
  const next = (currentGrade + 1) as 1 | 2 | 3;
  return { newGrade: next, patch: { grade: next, age: newAge }, isGraduating: false };
}
