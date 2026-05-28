import type { ProtagonistSave, TrainingPlanState } from "../types/save";

export interface GrowthResult {
  protagonistPatch: Partial<ProtagonistSave>;
  logs: string[];
  fameDelta: number;
}

export async function calcTrainingGrowth(
  protagonist: ProtagonistSave,
  plan: TrainingPlanState,
  efficiencyMod = 1.0,
): Promise<GrowthResult> {
  const params = {
    protagonist: {
      age:              protagonist.age,
      condition:        protagonist.condition,
      fatigue:          protagonist.fatigue,
      developmentRate:  protagonist.developmentRate,
      diligence:        protagonist.diligence,
      pitching:         protagonist.pitching,
      batting:          protagonist.batting,
      pitchingXP:       protagonist.pitchingXP ?? {},
      battingXP:        protagonist.battingXP  ?? {},
      trainingPitchState: protagonist.trainingPitchState,
      pitches:          protagonist.pitches ?? [],
      playerType:       protagonist.playerType,
      morale:           protagonist.morale,
    },
    plan,
    efficiencyMod,
  };

  const raw = JSON.parse(
    await window.projectB!.growthCalcTraining(JSON.stringify(params))
  );

  const patch: Partial<ProtagonistSave> = { ...raw.protagonistPatch };
  const action: string = raw.protagonistPatch.pitchStateAction ?? "keep";
  delete (patch as any).pitchStateAction;

  if (action === "clear") {
    patch.trainingPitchState = undefined;
  } else if (action === "update") {
    patch.trainingPitchState = raw.protagonistPatch.trainingPitchState;
  } else {
    delete (patch as any).trainingPitchState;
  }

  return { protagonistPatch: patch, logs: raw.logs, fameDelta: raw.fameDelta };
}

export async function calcGameGrowth(
  protagonist: ProtagonistSave,
  won: boolean,
  scoreDiff: number,
  strikeouts = 0,
): Promise<GrowthResult> {
  const params = {
    protagonist: {
      age:             protagonist.age,
      condition:       protagonist.condition,
      fatigue:         protagonist.fatigue,
      developmentRate: protagonist.developmentRate,
      diligence:       protagonist.diligence,
      pitching:        protagonist.pitching,
      batting:         protagonist.batting,
      pitchingXP:      protagonist.pitchingXP ?? {},
      battingXP:       protagonist.battingXP  ?? {},
      playerType:      protagonist.playerType,
      morale:          protagonist.morale,
    },
    won,
    scoreDiff,
    strikeouts,
  };

  const raw = JSON.parse(
    await window.projectB!.growthCalcGame(JSON.stringify(params))
  );

  const patch: Partial<ProtagonistSave> = { ...raw.protagonistPatch };
  delete (patch as any).pitchStateAction;
  delete (patch as any).trainingPitchState;

  return { protagonistPatch: patch, logs: raw.logs, fameDelta: raw.fameDelta };
}

export interface AgingResult {
  pitching: ProtagonistSave["pitching"];
  batting:  ProtagonistSave["batting"];
  logs:     string[];
}

export async function calcProtagonistAging(
  protagonist: ProtagonistSave,
): Promise<AgingResult> {
  const params = {
    age:        protagonist.age,
    condition:  protagonist.condition,
    fatigue:    protagonist.fatigue,
    pitching:   protagonist.pitching,
    batting:    protagonist.batting,
    playerType: protagonist.playerType,
  };
  return JSON.parse(
    await window.projectB!.growthCalcProtagonistAging(JSON.stringify(params))
  ) as AgingResult;
}
