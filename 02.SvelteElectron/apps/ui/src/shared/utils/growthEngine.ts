import type { ProtagonistSave, TrainingPlanState } from "../types/save";
import { NEUTRAL_MODS, type StaffMods } from "./staffEffects";

export interface GrowthResult {
  protagonistPatch: Partial<ProtagonistSave>;
  logs: string[];
  fameDelta: number;
}

export async function calcTrainingGrowth(
  protagonist: ProtagonistSave,
  plan: TrainingPlanState,
  efficiencyMod = 1.0,
  /** 소속팀 스태프 배수 (§7-5 F-1) */
  mods: StaffMods = NEUTRAL_MODS,
): Promise<GrowthResult> {
  const params = {
    protagonist: {
      age:              protagonist.age,
      condition:        protagonist.condition,
      fatigue:          protagonist.fatigue,
      // 코치 분석력이 성장률을 민다 — 지도력(훈련 효율)과 다른 축이다
      developmentRate:  protagonist.developmentRate * mods.devRate,
      diligence:        protagonist.diligence,
      potentialHidden:  protagonist.potentialHidden,
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

  // ⚠ 엔진이 역직렬화에 실패하면 `{error}`만 온다. 예전엔 그대로
  // `raw.protagonistPatch.pitchStateAction`을 읽어 **"undefined의 속성을 읽을 수
  // 없다"** 로 터졌다 — 원인이 뭔지 알 수 없는 메시지다(실측: 전역 후 독립리그
  // 복귀 구간에서 매주 반복). 승강 판정(`weekPhases/market`)과 같은 자리다.
  if (!raw?.protagonistPatch) {
    throw new Error(`[훈련] 성장 계산 실패: ${raw?.error ?? JSON.stringify(raw).slice(0, 200)}`);
  }

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
  /** 소속팀 스태프 배수 (§7-5 F-1). 스태프 없는 무대는 NEUTRAL_MODS */
  mods: StaffMods = NEUTRAL_MODS,
): Promise<GrowthResult> {
  const params = {
    protagonist: {
      age:             protagonist.age,
      condition:       protagonist.condition,
      fatigue:         protagonist.fatigue,
      developmentRate: protagonist.developmentRate * mods.devRate,
      diligence:       protagonist.diligence,
      potentialHidden: protagonist.potentialHidden,
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
    moraleMod: mods.morale,
    fameMod:   mods.fame,
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
  const sh = protagonist.seasonHealth ?? { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 };
  const params = {
    age:               protagonist.age,
    lowConditionWeeks: sh.lowConditionWeeks,
    highFatigueWeeks:  sh.highFatigueWeeks,
    injuryCount:       sh.injuryCount,
    totalWeeks:        sh.totalWeeks,
    pitching:          protagonist.pitching,
    batting:           protagonist.batting,
    playerType:        protagonist.playerType,
  };
  return JSON.parse(
    await window.projectB!.growthCalcProtagonistAging(JSON.stringify(params))
  ) as AgingResult;
}
