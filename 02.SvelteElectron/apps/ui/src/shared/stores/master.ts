import { derived, writable } from "svelte/store";

// ── 훈련·구종 타입 ─────────────────────────────────────────────
export interface TrainingProgram {
  id: string;
  name: string;
  focus: string;
  intensity: "low" | "medium" | "high";
  fatigueCost: number;
  risk: number;
}

export interface PitchEntry {
  id: string;
  name: string;
  group: string;
  unlockRuleId: string;
}

export interface PitchUnlockRule {
  id: string;
  type: "always" | "min_stat";
  params: { stat?: string; value?: number };
}

// ── refs 타입 (refs.json 구조) ─────────────────────────────────
export interface LeagueRef {
  id: string;
  name: string;
  nameEn?: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  nameEn?: string;
}

export interface ClubRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
}

export interface TeamRef {
  id: string;
  name: string;
  nameEn?: string;
  leagueId: string;
  clubId?: string;
  schoolId?: string;
  tier?: string;
}

// ── 인물 엔티티 타입 (people_*.json 구조) ─────────────────────
export interface EntityRow {
  id: string;
  name: string;
  nameEn?: string;
  role: "player" | "coach" | "manager" | "owner";
  age: number;
  status: "active" | "inactive" | "retired" | "injured";
  originLeagueId: string;
  leagueId: string;
  clubId: string;
  teamId: string;
  tier?: string;
  schoolId: string;
  grade?: 1 | 2 | 3;
  notes: string;
  details: Record<string, unknown>;
}

// ── 스토어 상태 ───────────────────────────────────────────────
export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
  pitchUnlockRules: PitchUnlockRule[];
  leagues: LeagueRef[];
  schools: SchoolRef[];
  clubs: ClubRef[];
  teams: TeamRef[];
  entities: EntityRow[];
}

// ── masterFetch 래퍼 (IPC 우선, fetch 폴백) ───────────────────
async function fetchMaster<T>(relPath: string): Promise<T | null> {
  try {
    if (window.projectB?.masterFetch) {
      return (await window.projectB.masterFetch(relPath)) as T;
    }
    const res = await fetch(`/data/master/${relPath}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── 스토어 생성 ───────────────────────────────────────────────
function createMasterStore() {
  const { subscribe, update } = writable<MasterState>({
    loaded: false,
    trainingPrograms: [],
    pitchCatalog: [],
    pitchUnlockRules: [],
    leagues: [],
    schools: [],
    clubs: [],
    teams: [],
    entities: [],
  });

  async function load() {
    try {
      const [trainingData, pitchData, unlockData, refsData] = await Promise.all([
        fetchMaster<{ programs: TrainingProgram[] }>("training/programs_pitcher.json"),
        fetchMaster<{ pitches: PitchEntry[] }>("training/pitch_catalog.json"),
        fetchMaster<{ rules: PitchUnlockRule[] }>("training/pitch_unlock_rules.json"),
        fetchMaster<{ leagues: LeagueRef[]; schools: SchoolRef[]; clubs: ClubRef[]; teams: TeamRef[] }>(
          "entities/refs.json"
        ),
      ]);

      update((s) => ({
        ...s,
        loaded: true,
        trainingPrograms: trainingData?.programs  ?? [],
        pitchCatalog:     pitchData?.pitches      ?? [],
        pitchUnlockRules: unlockData?.rules       ?? [],
        leagues:          refsData?.leagues ?? [],
        schools:          refsData?.schools ?? [],
        clubs:            refsData?.clubs   ?? [],
        teams:            refsData?.teams   ?? [],
      }));
    } catch (e) {
      console.warn("[masterStore] load failed", e);
      update((s) => ({ ...s, loaded: true }));
    }
  }

  // 특정 리그의 인물 엔티티 로드
  async function loadEntities(leagueId: string) {
    const fileMap: Record<string, string> = {
      LEAGUE_HIGHSCHOOL:  "entities/people_hs.json",
      LEAGUE_UNIVERSITY:  "entities/people_univ.json",
      LEAGUE_INDEPENDENT: "entities/people_ind.json",
      LEAGUE_KBL:         "entities/people_kbl.json",
      LEAGUE_ABL:         "entities/people_abl.json",
    };
    const relPath = fileMap[leagueId];
    if (!relPath) return;

    const data = await fetchMaster<{ entities: EntityRow[] }>(relPath);
    update((s) => ({ ...s, entities: data?.entities ?? [] }));
  }

  return { subscribe, load, loadEntities };
}

export const masterStore = createMasterStore();

// ── 파생 스토어 ───────────────────────────────────────────────
export const trainingProgramMap = derived(masterStore, ($m) =>
  new Map($m.trainingPrograms.map((p) => [p.id, p]))
);

export const teamMap = derived(masterStore, ($m) =>
  new Map($m.teams.map((t) => [t.id, t]))
);

export const leagueMap = derived(masterStore, ($m) =>
  new Map($m.leagues.map((l) => [l.id, l]))
);

export const pitchUnlockRuleMap = derived(masterStore, ($m) =>
  new Map($m.pitchUnlockRules.map((r) => [r.id, r]))
);
