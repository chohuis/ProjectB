import type { EntityRow } from "../stores/master";
import type {
  BattingAttributes,
  HighSchoolMaster,
  NamedNpcMeta,
  NpcCareerEntry,
  NpcSaveState,
  PitchingAttributes,
  SchoolScenario,
} from "../types/save";

// ── 한국 이름 풀 (벌크 생성용) ────────────────────────────────
const SURNAMES = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전"];
const SYLLABLES_A = ["민","준","현","재","우","지","도","성","진","동","태","수","영","혁","훈","기","상","정","세","찬"];
const SYLLABLES_B = ["준","혁","원","환","빈","욱","식","윤","완","호","진","우","기","수","민","찬","훈","성","재","현"];

// ── 시드 기반 랜덤 ────────────────────────────────────────────
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

function genName(rand: () => number): { name: string; nameEn: string } {
  const sur = SURNAMES[Math.floor(rand() * SURNAMES.length)];
  const a   = SYLLABLES_A[Math.floor(rand() * SYLLABLES_A.length)];
  const b   = SYLLABLES_B[Math.floor(rand() * SYLLABLES_B.length)];
  return { name: `${sur}${a}${b}`, nameEn: `${sur} ${a}${b}` };
}

// ── 능력치 생성 헬퍼 ──────────────────────────────────────────
function clamp(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

function makePitching(ovr: number, rand: () => number): PitchingAttributes {
  const jitter = () => (rand() - 0.5) * 12;
  return {
    ovr,
    stamina:     clamp(ovr - 2  + jitter()),
    velocity:    clamp(ovr + 4  + jitter()),
    command:     clamp(ovr - 5  + jitter()),
    control:     clamp(ovr - 3  + jitter()),
    movement:    clamp(ovr - 4  + jitter()),
    mentality:   clamp(ovr      + jitter()),
    recovery:    clamp(ovr - 6  + jitter()),
    clutch:      clamp(ovr - 8  + jitter()),
    holdRunners: clamp(ovr - 10 + jitter()),
  };
}

function makeBatting(ovr: number, rand: () => number): BattingAttributes {
  const jitter = () => (rand() - 0.5) * 12;
  return {
    ovr,
    contact:      clamp(ovr - 2  + jitter()),
    power:        clamp(ovr - 5  + jitter()),
    eye:          clamp(ovr - 3  + jitter()),
    discipline:   clamp(ovr - 4  + jitter()),
    speed:        clamp(ovr      + jitter()),
    baseInstinct: clamp(ovr - 5  + jitter()),
    bunting:      clamp(ovr - 15 + jitter()),
    platoon:      50,
    fielding:     clamp(ovr - 5  + jitter()),
    arm:          clamp(ovr - 5  + jitter()),
    battingClutch: clamp(ovr - 8 + jitter()),
  };
}

function pickPosition(rand: () => number): string {
  const pos = ["C","1B","2B","3B","SS","LF","CF","RF"];
  return pos[Math.floor(rand() * pos.length)];
}

// ── 핵심 변환: EntityRow → NpcSaveState ──────────────────────
export function entityToNpcState(
  entity: EntityRow,
  seasonYear: number,
): NpcSaveState {
  const pl = entity.details.player;
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
    careerStatus: "active",
    currentLeague: entity.leagueId,
    currentTeam:  entity.teamId,
    militaryStatus: "미필",
    pitching:     pl.pitching,
    batting:      pl.batting,
    developmentRate: pl.developmentRate,
    careerHistory: [],
    achievements:  [],
  };
}

// ── 게임 시작: 고교 전체 NPC 초기화 ──────────────────────────
export function initHighSchoolNpcs(
  entities: EntityRow[],
  scenario: SchoolScenario,
  seasonYear: number,
): NpcSaveState[] {
  void scenario;
  return entities
    .filter(e => e.role === "player" && e.leagueId === "LEAGUE_HIGHSCHOOL")
    .map(e => entityToNpcState(e, seasonYear));
}

// ── 시즌 종료: 학년 진급 + 졸업 처리 ─────────────────────────
export interface GradeAdvanceResult {
  updated:   NpcSaveState[];  // 전체 갱신 목록 (진급 + 졸업 포함)
  graduated: NpcSaveState[];  // 이번 시즌 졸업생 (드래프트 입력용)
}

export function advanceHighSchoolGrades(
  npcs: NpcSaveState[],
  seasonYear: number,
): GradeAdvanceResult {
  const updated:   NpcSaveState[] = [];
  const graduated: NpcSaveState[] = [];

  for (const npc of npcs) {
    const isHs = npc.currentLeague === "LEAGUE_HIGHSCHOOL"
               && npc.careerStatus === "active"
               && npc.grade != null;

    if (!isHs) { updated.push(npc); continue; }

    const grade = npc.grade!;

    if (grade === 3) {
      const historyEntry: NpcCareerEntry = {
        year:      seasonYear,
        leagueId:  "LEAGUE_HIGHSCHOOL",
        teamId:    npc.currentTeam,
        statLine:  "-",
        highlights: [],
      };
      const g: NpcSaveState = {
        ...npc,
        grade:         undefined,
        age:           npc.age + 1,
        currentLeague: "LEAGUE_DRAFT_POOL",
        careerHistory: [...npc.careerHistory, historyEntry],
      };
      graduated.push(g);
      updated.push(g);
    } else {
      updated.push({ ...npc, grade: (grade + 1) as 1 | 2 | 3, age: npc.age + 1 });
    }
  }

  return { updated, graduated };
}

// ── 시즌 시작: 신입생 생성 ────────────────────────────────────
export function generateFreshmenNpcs(
  school:         HighSchoolMaster,
  namedGrade1:    NamedNpcMeta[],
  namedEntities:  EntityRow[],
  seasonYear:     number,
  idOffset:       number,
): NpcSaveState[] {
  const result: NpcSaveState[] = [];

  // 명명 NPC Grade 1 먼저 삽입
  for (const meta of namedGrade1) {
    const entity = namedEntities.find(e => e.id === meta.npcId);
    if (entity) result.push(entityToNpcState(entity, seasonYear));
  }

  // 벌크 생성
  const bulkCount = Math.max(0, school.annualRosterSize - namedGrade1.length);
  const rand = makeRand(school.id.length * 997 + seasonYear * 31);
  const tpl  = school.template;

  for (let i = 0; i < bulkCount; i++) {
    const npcId = `GEN_${school.id}_Y${seasonYear}_${String(idOffset + i + 1).padStart(3, "0")}`;
    const { name, nameEn } = genName(rand);
    const isSP  = rand() < 0.3;
    const ovrP  = tpl.pitching.ovrMin + rand() * (tpl.pitching.ovrMax - tpl.pitching.ovrMin);
    const ovrB  = tpl.batting.ovrMin  + rand() * (tpl.batting.ovrMax  - tpl.batting.ovrMin);
    const devR  = tpl.developmentRate.min + rand() * (tpl.developmentRate.max - tpl.developmentRate.min);

    result.push({
      npcId,
      name,
      nameEn,
      playerType:    isSP ? "pitcher" : "batter",
      position:      isSP ? "SP" : pickPosition(rand),
      grade:         1,
      age:           16,
      schoolId:      school.id,
      graduationYear: seasonYear + 2,
      careerStatus:  "active",
      currentLeague: "LEAGUE_HIGHSCHOOL",
      currentTeam:   school.teamId,
      militaryStatus: "미필",
      pitching:      makePitching(Math.round(ovrP), rand),
      batting:       makeBatting(Math.round(ovrB),  rand),
      developmentRate: Math.round(devR),
      careerHistory: [],
      achievements:  [],
    });
  }

  return result;
}

// ── 주인공 학년 진급 ──────────────────────────────────────────
export interface ProtagonistGradeResult {
  newGrade:  1 | 2 | 3 | "graduated";
  patch:     { grade?: 1 | 2 | 3; age: number };
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
