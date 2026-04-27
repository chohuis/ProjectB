import { derived, writable } from "svelte/store";

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
  unlockRequirements?: Record<string, number>;
}

export interface MasterState {
  loaded: boolean;
  trainingPrograms: TrainingProgram[];
  pitchCatalog: PitchEntry[];
}

// 정적 마스터 데이터(훈련/구종) 로딩 전용 스토어
function createMasterStore() {
  const { subscribe, update } = writable<MasterState>({
    loaded: false,
    trainingPrograms: [],
    pitchCatalog: []
  });

  // 앱 시작 시 필요한 마스터 JSON을 한 번에 불러온다.
  async function load() {
    try {
      const [trainingRes, pitchRes] = await Promise.all([
        fetch("/data/master/training/programs_pitcher.json"),
        fetch("/data/master/training/pitch_catalog.json")
      ]);

      const trainingData = trainingRes.ok ? await trainingRes.json() : { programs: [] };
      const pitchData = pitchRes.ok ? await pitchRes.json() : { pitches: [] };

      update(() => ({
        loaded: true,
        trainingPrograms: trainingData.programs ?? [],
        pitchCatalog: pitchData.pitches ?? []
      }));
    } catch (error) {
      console.warn("[masterStore] failed to load master data", error);
      update((state) => ({ ...state, loaded: true }));
    }
  }

  return { subscribe, load };
}

export const masterStore = createMasterStore();

// 훈련 프로그램 조회를 빠르게 하기 위한 ID 맵
export const trainingProgramMap = derived(masterStore, ($master) => {
  return new Map($master.trainingPrograms.map((program) => [program.id, program]));
});
