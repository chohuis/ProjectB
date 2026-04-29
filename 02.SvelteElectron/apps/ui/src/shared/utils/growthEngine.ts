import type { PitchingAttributes, PitchingStatKey, ProtagonistSave, TrainingPlanState } from "../types/save";

const STAT_LABELS: Record<PitchingStatKey, string> = {
  velocity:  "구위",
  command:   "커맨드",
  control:   "제구",
  movement:  "무브먼트",
  mentality: "멘탈",
  stamina:   "스태미나",
  recovery:  "회복력",
};

interface ProgramConfig {
  primaryStat: PitchingStatKey;
  secondaryStat?: PitchingStatKey;
  baseXP: number;
  fatigueCost: number;
  conditionCost: number;
  isRecovery?: boolean;
}

const TRAINING_MAP: Record<string, ProgramConfig> = {
  TRN_CMD_BASE:  { primaryStat: "command",   secondaryStat: "control",   baseXP: 3.0, fatigueCost: 8,   conditionCost: 3 },
  TRN_VEL_POWER: { primaryStat: "velocity",  secondaryStat: "stamina",   baseXP: 4.0, fatigueCost: 14,  conditionCost: 6 },
  TRN_CTRL_MECH: { primaryStat: "control",   secondaryStat: "command",   baseXP: 3.0, fatigueCost: 8,   conditionCost: 3 },
  TRN_MVT_PITCH: { primaryStat: "movement",  secondaryStat: "control",   baseXP: 3.2, fatigueCost: 9,   conditionCost: 4 },
  TRN_MNT_FOCUS: { primaryStat: "mentality",                             baseXP: 2.5, fatigueCost: 5,   conditionCost: 2 },
  TRN_STA_COND:  { primaryStat: "stamina",   secondaryStat: "recovery",  baseXP: 3.8, fatigueCost: 12,  conditionCost: 5 },
  TRN_RECOVERY:  { primaryStat: "recovery",                              baseXP: 0,   fatigueCost: -8,  conditionCost: -10, isRecovery: true },
};

const OVR_STATS: PitchingStatKey[] = ["velocity", "command", "control", "movement", "mentality", "stamina", "recovery"];

function xpThreshold(v: number): number {
  return 8 + v * 0.4;
}

function weekXP(base: number, condition: number, fatigue: number, devRate: number): number {
  const condFactor = condition / 100;
  const fatFactor  = Math.max(0.3, 1 - fatigue / 120);
  const devFactor  = devRate / 62;
  return base * condFactor * fatFactor * devFactor;
}

function calcOvr(pit: PitchingAttributes): number {
  const sum = OVR_STATS.reduce((acc, k) => acc + pit[k], 0);
  return Math.round(sum / OVR_STATS.length);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function tryLevelUp(
  currentValue: number,
  accXP: number,
  gainXP: number,
): { newValue: number; remainingXP: number; leveled: number } {
  let xp  = accXP + gainXP;
  let val = currentValue;
  let leveled = 0;
  while (xp >= xpThreshold(val)) {
    xp -= xpThreshold(val);
    val++;
    leveled++;
  }
  return { newValue: val, remainingXP: xp, leveled };
}

function applyXPGains(
  protagonist: ProtagonistSave,
  xpGains: Map<PitchingStatKey, number>,
): { pitchingPatch: Partial<PitchingAttributes>; updatedXP: Partial<Record<PitchingStatKey, number>>; logs: string[] } {
  const currentXP = protagonist.pitchingXP ?? {};
  const updatedXP: Partial<Record<PitchingStatKey, number>> = { ...currentXP };
  const pitchingPatch: Partial<PitchingAttributes> = {};
  const logs: string[] = [];

  for (const [stat, gain] of xpGains) {
    if (gain <= 0) continue;
    const result = tryLevelUp(protagonist.pitching[stat], currentXP[stat] ?? 0, gain);
    updatedXP[stat] = result.remainingXP;
    if (result.leveled > 0) {
      pitchingPatch[stat] = result.newValue;
      logs.push(`${STAT_LABELS[stat]} +${result.leveled}`);
    }
  }

  return { pitchingPatch, updatedXP, logs };
}

export interface GrowthResult {
  protagonistPatch: Partial<ProtagonistSave>;
  logs: string[];
}

export function calcTrainingGrowth(
  protagonist: ProtagonistSave,
  plan: TrainingPlanState,
  efficiencyMod = 1.0,  // 학업 모드에 따른 훈련 효율 배율
): GrowthResult {
  const xpGains = new Map<PitchingStatKey, number>();
  const add = (stat: PitchingStatKey, gain: number) =>
    xpGains.set(stat, (xpGains.get(stat) ?? 0) + gain);

  let fatigueDelta   = -5; // 주간 기본 회복
  let conditionDelta =  3;

  function applyProgram(id: string | null, mult: number) {
    if (!id) return;
    const cfg = TRAINING_MAP[id];
    if (!cfg) return;
    fatigueDelta   += cfg.fatigueCost   * mult;
    conditionDelta -= cfg.conditionCost * mult;
    if (cfg.isRecovery) return;
    const xp = weekXP(cfg.baseXP, protagonist.condition, protagonist.fatigue, protagonist.developmentRate) * mult * efficiencyMod;
    add(cfg.primaryStat, xp);
    if (cfg.secondaryStat) add(cfg.secondaryStat, xp * 0.3);
  }

  applyProgram(plan.primaryProgramId,   1.0);
  applyProgram(plan.secondaryProgramId, 0.5);
  applyProgram(plan.recoveryProgramId,  1.0);

  const { pitchingPatch, updatedXP, logs } = applyXPGains(protagonist, xpGains);
  const newPitching = { ...protagonist.pitching, ...pitchingPatch };
  if (Object.keys(pitchingPatch).length > 0) newPitching.ovr = calcOvr(newPitching);

  return {
    protagonistPatch: {
      pitching:   newPitching,
      pitchingXP: updatedXP,
      fatigue:    clamp(protagonist.fatigue   + fatigueDelta,   0, 100),
      condition:  clamp(protagonist.condition + conditionDelta, 0, 100),
    },
    logs: logs.length > 0 ? [`[훈련] ${logs.join(", ")}`] : [],
  };
}

export function calcGameGrowth(
  protagonist: ProtagonistSave,
  won: boolean,
  scoreDiff: number,
): GrowthResult {
  const xpGains = new Map<PitchingStatKey, number>();
  const add = (stat: PitchingStatKey, gain: number) =>
    xpGains.set(stat, (xpGains.get(stat) ?? 0) + gain);

  // 경기 출전 XP: 주간 훈련 XP의 35%
  const gameXP = weekXP(3.5 * 0.35, protagonist.condition, protagonist.fatigue, protagonist.developmentRate);
  (["velocity", "command", "control"] as PitchingStatKey[]).forEach((s) => add(s, gameXP));

  // 결과별 멘탈 XP
  const mentalXP = won ? 0.5 : scoreDiff >= 5 ? 0 : 0.3;
  if (mentalXP > 0) add("mentality", mentalXP);

  const { pitchingPatch, updatedXP, logs } = applyXPGains(protagonist, xpGains);
  const newPitching = { ...protagonist.pitching, ...pitchingPatch };
  if (Object.keys(pitchingPatch).length > 0) newPitching.ovr = calcOvr(newPitching);

  const moraleDelta = won ? 6 : scoreDiff >= 5 ? -15 : -8;
  const resultLog   = won ? "경기 승리 — 사기 +6" : scoreDiff >= 5 ? "대패 — 사기 -15" : "경기 패배 — 사기 -8";

  return {
    protagonistPatch: {
      pitching:   newPitching,
      pitchingXP: updatedXP,
      fatigue:    clamp(protagonist.fatigue   + 12, 0, 100),
      condition:  clamp(protagonist.condition - 8,  0, 100),
      morale:     clamp(protagonist.morale + moraleDelta, 0, 100),
    },
    logs: [resultLog, ...(logs.length > 0 ? [`[경기 성장] ${logs.join(", ")}`] : [])],
  };
}
