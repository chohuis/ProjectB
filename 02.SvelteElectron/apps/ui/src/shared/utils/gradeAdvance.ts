import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type {
  BattingAttributes,
  HighSchoolMaster,
  NamedNpcMeta,
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
  isNamed = false,
  emotionRole?: NpcEmotionRole,
): NpcSaveState {
  const pl   = entity.details.player as EntityPlayerDetails;
  const grade = entity.grade ?? 3;
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
    isNamed,
    emotionRole,
    careerStatus:  "active",
    currentLeague: entity.leagueId,
    currentTeam:   entity.teamId,
    militaryStatus: "미필",
    pitching:      pl.pitching as PitchingAttributes | undefined,
    batting:       pl.batting  as BattingAttributes  | undefined,
    developmentRate: pl.developmentRate,
    careerHistory:  [],
    achievements:   [],
  };
}

export function initHighSchoolNpcs(
  entities: EntityRow[],
  seasonYear: number,
  namedIds: Set<string>,
  emotionRoleMap: Map<string, NpcEmotionRole>,
): NpcSaveState[] {
  return entities
    .filter(e => e.role === "player" && e.leagueId === "LEAGUE_HIGHSCHOOL" && namedIds.has(e.id))
    .map(e => entityToNpcState(e, seasonYear, true, emotionRoleMap.get(e.id)));
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
  const namedIds = new Set(npcs.filter(n => n.isNamed).map(n => n.npcId));
  const emotionRoles = new Map(npcs.map(n => [n.npcId, n.emotionRole] as const));
  const json = await api().npcAdvanceGrades(JSON.stringify({ npcs, seasonYear }));
  const raw = parseResult<GradeAdvanceResult>(json);
  const rehydrate = (n: NpcSaveState): NpcSaveState => ({
    ...n,
    isNamed:     n.isNamed ?? namedIds.has(n.npcId),
    emotionRole: n.emotionRole ?? emotionRoles.get(n.npcId),
  });
  return {
    updated:   raw.updated.map(rehydrate),
    graduated: raw.graduated.map(rehydrate),
  };
}

// ── 신입생 생성 (Rust DLL 위임) ──────────────────────────────
export async function generateFreshmenNpcs(
  school:        HighSchoolMaster,
  namedGrade1:   NamedNpcMeta[],
  namedEntities: EntityRow[],
  seasonYear:    number,
  idOffset:      number,
): Promise<NpcSaveState[]> {
  const namedNpcs = namedGrade1
    .map(m => namedEntities.find(e => e.id === m.npcId))
    .filter(Boolean)
    .map(e => entityToNpcState(e!, seasonYear, true, "teammate"));

  const params = {
    schoolId:       school.id,
    teamId:         school.teamId,
    annualRosterSize: school.annualRosterSize,
    pitchingOvrMin: school.template.pitching.ovrMin,
    pitchingOvrMax: school.template.pitching.ovrMax,
    battingOvrMin:  school.template.batting.ovrMin,
    battingOvrMax:  school.template.batting.ovrMax,
    devRateMin:     school.template.developmentRate.min,
    devRateMax:     school.template.developmentRate.max,
    namedNpcs,
    seasonYear,
    idOffset,
  };

  const json = await api().npcGenerateFreshmen(JSON.stringify(params));
  const all = parseResult<NpcSaveState[]>(json);
  const namedIdSet = new Set(namedGrade1.map(m => m.npcId));
  return all.map(npc => ({
    ...npc,
    isNamed:     namedIdSet.has(npc.npcId),
    emotionRole: namedIdSet.has(npc.npcId) ? ("teammate" as NpcEmotionRole) : undefined,
  }));
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
