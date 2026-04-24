import { writable, derived } from 'svelte/store';

// ── 타입 ───────────────────────────────────────────────────────────────────

export interface TrainingProgram {
  id: string;
  name: string;
  focus: string;
  intensity: 'low' | 'medium' | 'high';
  fatigueCost: number;
  risk: number;
}

export interface PitchEntry {
  id: string;
  name: string;
  unlockRequirements?: Record<string, number>;
}

export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
}

// ── 스토어 팩토리 ───────────────────────────────────────────────────────────

function createMasterStore() {
  const { subscribe, update } = writable<MasterState>({
    loaded: false,
    trainingPrograms: [],
    pitchCatalog: [],
  });

  // vite publicDir = resource/ → /data/master/... 경로로 fetch 가능
  async function load() {
    try {
      const [trainingRes, pitchRes] = await Promise.all([
        fetch('/data/master/training/programs_pitcher.json'),
        fetch('/data/master/training/pitch_catalog.json'),
      ]);

      const trainingData  = trainingRes.ok  ? await trainingRes.json()  : { programs: [] };
      const pitchData     = pitchRes.ok     ? await pitchRes.json()     : { pitches: [] };

      update(() => ({
        loaded: true,
        trainingPrograms: trainingData.programs  ?? [],
        pitchCatalog:     pitchData.pitches      ?? [],
      }));
    } catch (e) {
      console.warn('[masterStore] 마스터 데이터 로드 실패:', e);
      update(s => ({ ...s, loaded: true }));
    }
  }

  return { subscribe, load };
}

export const masterStore = createMasterStore();

// 자주 쓰는 파생값
export const trainingProgramMap = derived(masterStore, $m =>
  new Map($m.trainingPrograms.map(p => [p.id, p]))
);
