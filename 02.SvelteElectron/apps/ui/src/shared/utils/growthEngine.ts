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
  /**
   * 훈련 프로그램 표 — **정본은 `training/programs.json`이고 화면·엔진이 같이 쓴다.**
   *
   * ⚠ 기본값을 두지 않는다. 안 넘기면 Rust 역직렬화가 실패해서 위의 `{error}`
   * 갈래로 떨어진다 — 배선을 빠뜨렸을 때 **조용히 0이 되는 대신 터진다.**
   * 예전엔 이 표가 Rust에 하드코딩돼 있었고, 마스터·화면과 값이 달라서
   * 화면이 "피로 +7"이라 하고 엔진은 −4.25를 적용했다.
   */
  programs: readonly import("../stores/master").TrainingProgram[] = [],
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
    programs,
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

export interface TrainingPreview {
  fatigueDelta: number;
  conditionDelta: number;
  projectedFatigue: number;
  projectedCondition: number;
  /** 지금 피로에서 걸리는 구간 승수 (1.0 / 1.5 / 2.5 / 4.0) */
  fatigueZoneMult: number;
  /** 예상 피로에서 걸릴 승수 — 다음 주가 더 나빠지는지 알려줄 근거 */
  nextZoneMult: number;
}

/**
 * 이 계획이면 이번 주에 어떻게 되는가 — **엔진에 묻는다.**
 *
 * ⚠ **화면이 다시 계산하지 않는다.** 예전엔 훈련 화면이 자기 식을 갖고 있었고,
 * 슬롯 배수(0.5)도 피로 구간 승수(1.5/2.5/4.0)도 몰라서 화면은 "피로 +7"이라
 * 하고 엔진은 −4.25를 적용했다 — **부호가 반대였다.** 실제 계산과 같은
 * `plan_load`를 타므로 이제 구조적으로 어긋날 수 없다.
 */
export async function previewTraining(p: {
  fatigue: number;
  condition: number;
  plan: TrainingPlanState;
  programs: readonly import("../stores/master").TrainingProgram[];
}): Promise<TrainingPreview | null> {
  const raw = JSON.parse(
    await window.projectB!.engine("previewTrainingNative", JSON.stringify(p)),
  );
  if (raw?.error || raw?.fatigueDelta === undefined) return null;
  return raw as TrainingPreview;
}

/**
 * 이번 주 부상 확률 — **`calc_injury`가 굴리는 것과 같은 식이다.**
 * 예상 피로를 넣어 "이 계획대로 가면 N%"를 얻는다.
 */
export async function injuryChance(payload: Record<string, unknown>): Promise<number | null> {
  const raw = JSON.parse(
    await window.projectB!.engine("injuryChanceNative", JSON.stringify(payload)),
  );
  return typeof raw?.chance === "number" ? raw.chance : null;
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
