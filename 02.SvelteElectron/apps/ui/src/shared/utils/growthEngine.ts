import type {
  PitchEntry,
  PitchGrade,
  PitchingAttributes,
  PitchingStatKey,
  BattingAttributes,
  BattingStatKey,
  ProtagonistSave,
  TrainingPlanState,
} from "../types/save";

const PITCH_NAMES: Record<string, string> = {
  PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
  PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
  PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
  PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
};

// ── 투수 스탯 레이블 ───────────────────────────────────────────
const PITCHING_LABELS: Record<PitchingStatKey, string> = {
  velocity:    "구위",
  command:     "커맨드",
  control:     "제구",
  movement:    "무브먼트",
  mentality:   "멘탈",
  stamina:     "스태미나",
  recovery:    "회복력",
  clutch:      "위기집중력",
  holdRunners: "견제력",
};

// ── 타자 스탯 레이블 ───────────────────────────────────────────
const BATTING_LABELS: Record<BattingStatKey, string> = {
  contact:      "컨택",
  power:        "장타력",
  eye:          "선구안",
  discipline:   "극기",
  speed:        "주력",
  baseInstinct: "주루판단",
  bunting:      "번트",
  platoon:      "플래툰",
  fielding:     "수비",
  arm:          "어깨",
  battingClutch: "클러치",
};

// ── 훈련 프로그램 설정 ─────────────────────────────────────────
interface ProgramConfig {
  primaryStat: PitchingStatKey | BattingStatKey;
  secondaryStat?: PitchingStatKey | BattingStatKey;
  baseXP: number;
  fatigueCost: number;
  conditionCost: number;
  isRecovery?: boolean;
  isPitchDev?: boolean;      // 구종 개발 전용
  progressPerWeek?: number;  // 주당 progress 획득량
  type: "pitching" | "batting" | "shared";
}

const TRAINING_MAP: Record<string, ProgramConfig> = {
  // 투수 훈련
  TRN_CMD_BASE:    { type: "pitching", primaryStat: "command",      secondaryStat: "control",      baseXP: 3.0, fatigueCost: 8,   conditionCost: 3 },
  TRN_VEL_POWER:   { type: "pitching", primaryStat: "velocity",     secondaryStat: "stamina",      baseXP: 4.0, fatigueCost: 14,  conditionCost: 6 },
  TRN_CTRL_MECH:   { type: "pitching", primaryStat: "control",      secondaryStat: "command",      baseXP: 3.0, fatigueCost: 8,   conditionCost: 3 },
  TRN_MVT_PITCH:   { type: "pitching", primaryStat: "movement",     secondaryStat: "control",      baseXP: 3.2, fatigueCost: 9,   conditionCost: 4 },
  TRN_MNT_FOCUS:   { type: "pitching", primaryStat: "mentality",                                   baseXP: 2.5, fatigueCost: 5,   conditionCost: 2 },
  TRN_STA_COND:    { type: "pitching", primaryStat: "stamina",      secondaryStat: "recovery",     baseXP: 3.8, fatigueCost: 12,  conditionCost: 5 },
  TRN_CLUTCH:      { type: "pitching", primaryStat: "clutch",       secondaryStat: "mentality",    baseXP: 2.8, fatigueCost: 6,   conditionCost: 2 },
  TRN_HOLD:        { type: "pitching", primaryStat: "holdRunners",  secondaryStat: "control",      baseXP: 2.5, fatigueCost: 7,   conditionCost: 3 },
  // 타자 훈련
  TRN_CONTACT:     { type: "batting",  primaryStat: "contact",      secondaryStat: "eye",          baseXP: 3.0, fatigueCost: 8,   conditionCost: 3 },
  TRN_POWER:       { type: "batting",  primaryStat: "power",        secondaryStat: "contact",      baseXP: 3.8, fatigueCost: 12,  conditionCost: 5 },
  TRN_EYE:         { type: "batting",  primaryStat: "eye",          secondaryStat: "discipline",   baseXP: 2.8, fatigueCost: 6,   conditionCost: 2 },
  TRN_SPEED:       { type: "batting",  primaryStat: "speed",        secondaryStat: "baseInstinct", baseXP: 3.2, fatigueCost: 10,  conditionCost: 4 },
  TRN_FIELDING:    { type: "batting",  primaryStat: "fielding",     secondaryStat: "arm",          baseXP: 3.0, fatigueCost: 9,   conditionCost: 3 },
  TRN_BUNTING:     { type: "batting",  primaryStat: "bunting",      secondaryStat: "contact",      baseXP: 2.0, fatigueCost: 5,   conditionCost: 2 },
  TRN_BCLUTCH:     { type: "batting",  primaryStat: "battingClutch",secondaryStat: "discipline",   baseXP: 2.5, fatigueCost: 5,   conditionCost: 2 },
  // 구종 개발 (trainingPitchState 대상 구종의 progress 누적)
  TRN_PITCH_DEV:   { type: "pitching", primaryStat: "command",                                     baseXP: 0,   fatigueCost: 10,  conditionCost: 2,   isPitchDev: true, progressPerWeek: 17 },
  // 공용 회복
  TRN_RECOVERY:    { type: "shared",   primaryStat: "recovery",                                    baseXP: 0,   fatigueCost: -5,  conditionCost: -6, isRecovery: true },
};

const PITCHING_OVR_STATS: PitchingStatKey[] = [
  "velocity", "command", "control", "movement", "mentality", "stamina", "recovery", "clutch", "holdRunners"
];

const BATTING_OVR_STATS: BattingStatKey[] = [
  "contact", "power", "eye", "discipline", "speed", "fielding", "arm", "battingClutch"
];

function xpThreshold(v: number): number {
  return 8 + v * 0.4;
}

// diligence: 성실함 — devFactor 보정 계수
// 기본 devRate 62 기준, diligence 50=1.0배, 99=최대 1.4배, 1=최소 0.6배
function weekXP(
  base: number,
  condition: number,
  fatigue: number,
  devRate: number,
  diligence: number,
): number {
  const condFactor = condition / 100;
  // 피로 단계별 XP 페널티: 70+ → ×0.7, 85+ → ×0.5
  const fatFactor  = fatigue >= 85 ? 0.35
                   : fatigue >= 70 ? 0.65
                   : Math.max(0.80, 1 - fatigue / 200);
  const devFactor       = devRate / 62;
  const diligenceFactor = 0.6 + (diligence / 99) * 0.8; // 0.6~1.4
  return base * condFactor * fatFactor * devFactor * diligenceFactor;
}

function calcPitchingOvr(pit: PitchingAttributes): number {
  const sum = PITCHING_OVR_STATS.reduce((acc, k) => acc + pit[k], 0);
  return Math.round(sum / PITCHING_OVR_STATS.length);
}

function calcBattingOvr(bat: BattingAttributes): number {
  const sum = BATTING_OVR_STATS.reduce((acc, k) => acc + bat[k], 0);
  return Math.round(sum / BATTING_OVR_STATS.length);
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

function applyPitchingXP(
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
      logs.push(`${PITCHING_LABELS[stat]} +${result.leveled}`);
    }
  }

  return { pitchingPatch, updatedXP, logs };
}

function applyBattingXP(
  protagonist: ProtagonistSave,
  xpGains: Map<BattingStatKey, number>,
): { battingPatch: Partial<BattingAttributes>; updatedXP: Partial<Record<BattingStatKey, number>>; logs: string[] } {
  const currentXP = protagonist.battingXP ?? {};
  const updatedXP: Partial<Record<BattingStatKey, number>> = { ...currentXP };
  const battingPatch: Partial<BattingAttributes> = {};
  const logs: string[] = [];

  for (const [stat, gain] of xpGains) {
    if (gain <= 0) continue;
    const result = tryLevelUp(protagonist.batting[stat], currentXP[stat] ?? 0, gain);
    updatedXP[stat] = result.remainingXP;
    if (result.leveled > 0) {
      battingPatch[stat] = result.newValue;
      logs.push(`${BATTING_LABELS[stat]} +${result.leveled}`);
    }
  }

  return { battingPatch, updatedXP, logs };
}

export interface GrowthResult {
  protagonistPatch: Partial<ProtagonistSave>;
  logs: string[];
  fameDelta: number;
}

export function calcTrainingGrowth(
  protagonist: ProtagonistSave,
  plan: TrainingPlanState,
  efficiencyMod = 1.0,
): GrowthResult {
  const pitchingXpGains = new Map<PitchingStatKey, number>();
  const battingXpGains  = new Map<BattingStatKey, number>();

  const addP = (stat: PitchingStatKey, gain: number) =>
    pitchingXpGains.set(stat, (pitchingXpGains.get(stat) ?? 0) + gain);
  const addB = (stat: BattingStatKey, gain: number) =>
    battingXpGains.set(stat, (battingXpGains.get(stat) ?? 0) + gain);

  let fatigueDelta   = 0;
  let conditionDelta = 0;
  let pitchDevGain   = 0;

  function applyProgram(id: string | null, mult: number) {
    if (!id) return;
    const cfg = TRAINING_MAP[id];
    if (!cfg) return;
    fatigueDelta   += cfg.fatigueCost   * mult;
    conditionDelta -= cfg.conditionCost * mult;
    if (cfg.isRecovery) return;
    if (cfg.isPitchDev) {
      // 컨디션·피로 보정 적용
      const condFactor = protagonist.condition / 100;
      const fatFactor  = Math.max(0.3, 1 - protagonist.fatigue / 120);
      pitchDevGain += (cfg.progressPerWeek ?? 20) * mult * condFactor * fatFactor * efficiencyMod;
      return;
    }

    const xp = weekXP(
      cfg.baseXP,
      protagonist.condition,
      protagonist.fatigue,
      protagonist.developmentRate,
      protagonist.diligence ?? 50,
    ) * mult * efficiencyMod;

    if (cfg.type === "pitching") {
      addP(cfg.primaryStat as PitchingStatKey, xp);
      if (cfg.secondaryStat) addP(cfg.secondaryStat as PitchingStatKey, xp * 0.3);
    } else if (cfg.type === "batting") {
      addB(cfg.primaryStat as BattingStatKey, xp);
      if (cfg.secondaryStat) addB(cfg.secondaryStat as BattingStatKey, xp * 0.3);
    }
  }

  applyProgram(plan.primaryProgramId,   1.0);
  applyProgram(plan.secondaryProgramId, 0.5);
  applyProgram(plan.recoveryProgramId,  1.0);

  const { pitchingPatch, updatedXP: updatedPitchingXP, logs: pLogs } = applyPitchingXP(protagonist, pitchingXpGains);
  const { battingPatch,  updatedXP: updatedBattingXP,  logs: bLogs } = applyBattingXP(protagonist, battingXpGains);

  const newPitching = { ...protagonist.pitching, ...pitchingPatch };
  if (Object.keys(pitchingPatch).length > 0) newPitching.ovr = calcPitchingOvr(newPitching);

  const newBatting = { ...protagonist.batting, ...battingPatch };
  if (Object.keys(battingPatch).length > 0) newBatting.ovr = calcBattingOvr(newBatting);

  // ── 구종 개발 progress 처리 ────────────────────────────────────
  let pitchesPatch: PitchEntry[] | undefined;
  let trainingPitchStatePatch: ProtagonistSave["trainingPitchState"] | undefined;
  const pitchLogs: string[] = [];

  if (pitchDevGain > 0 && protagonist.trainingPitchState) {
    const ts = protagonist.trainingPitchState;
    const newProgress = ts.progress + pitchDevGain;
    const pitchName   = PITCH_NAMES[ts.id] ?? ts.id;

    if (newProgress >= 100) {
      const currentPitches = [...(protagonist.pitches ?? [])];
      const existingIdx = currentPitches.findIndex((p) => p.id === ts.id);

      if (existingIdx >= 0) {
        const cur = currentPitches[existingIdx];
        if (cur.grade < 5) {
          const nextGrade = (cur.grade + 1) as PitchGrade;
          currentPitches[existingIdx] = { ...cur, grade: nextGrade };
          pitchLogs.push(`${pitchName} 숙련도 ${cur.grade}→${nextGrade}`);
        } else {
          pitchLogs.push(`${pitchName} 이미 마스터`);
        }
      } else {
        currentPitches.push({ id: ts.id, grade: 1 });
        pitchLogs.push(`${pitchName} 습득!`);
      }
      pitchesPatch = currentPitches;
      trainingPitchStatePatch = undefined;
    } else {
      trainingPitchStatePatch = { ...ts, progress: newProgress };
    }
  }

  const allLogs = [...pLogs, ...bLogs, ...pitchLogs];

  return {
    protagonistPatch: {
      pitching:    newPitching,
      batting:     newBatting,
      pitchingXP:  updatedPitchingXP,
      battingXP:   updatedBattingXP,
      fatigue:     clamp(protagonist.fatigue   + fatigueDelta,   0, 100),
      condition:   clamp(protagonist.condition + conditionDelta, 0, 100),
      ...(pitchesPatch          !== undefined ? { pitches: pitchesPatch }                       : {}),
      ...(pitchDevGain > 0 && protagonist.trainingPitchState
          ? { trainingPitchState: trainingPitchStatePatch }
          : {}),
    },
    logs: allLogs.length > 0 ? [`[훈련] ${allLogs.join(", ")}`] : [],
    fameDelta: 0,
  };
}

export function calcGameGrowth(
  protagonist: ProtagonistSave,
  won: boolean,
  scoreDiff: number,
  strikeouts = 0,
): GrowthResult {
  const isPitcher = protagonist.playerType === "pitcher" || protagonist.playerType === "twoWay";
  const isBatter  = protagonist.playerType === "batter"  || protagonist.playerType === "twoWay";

  const pitchingXpGains = new Map<PitchingStatKey, number>();
  const battingXpGains  = new Map<BattingStatKey, number>();

  const gameXP = weekXP(
    3.5 * 0.35,
    protagonist.condition,
    protagonist.fatigue,
    protagonist.developmentRate,
    protagonist.diligence ?? 50,
  );

  if (isPitcher) {
    (["velocity", "command", "control"] as PitchingStatKey[]).forEach((s) =>
      pitchingXpGains.set(s, gameXP)
    );
    const mentalXP = won ? 0.5 : scoreDiff >= 5 ? 0 : 0.3;
    if (mentalXP > 0) pitchingXpGains.set("mentality", mentalXP);
  }

  if (isBatter) {
    (["contact", "eye"] as BattingStatKey[]).forEach((s) =>
      battingXpGains.set(s, gameXP * 0.7)
    );
    if (won) battingXpGains.set("battingClutch", 0.3);
  }

  const { pitchingPatch, updatedXP: updatedPitchingXP, logs: pLogs } = applyPitchingXP(protagonist, pitchingXpGains);
  const { battingPatch,  updatedXP: updatedBattingXP,  logs: bLogs } = applyBattingXP(protagonist, battingXpGains);

  const newPitching = { ...protagonist.pitching, ...pitchingPatch };
  if (Object.keys(pitchingPatch).length > 0) newPitching.ovr = calcPitchingOvr(newPitching);

  const newBatting = { ...protagonist.batting, ...battingPatch };
  if (Object.keys(battingPatch).length > 0) newBatting.ovr = calcBattingOvr(newBatting);

  const moraleDelta = won ? 6 : scoreDiff >= 5 ? -15 : -8;
  const resultLog   = won ? "경기 승리 — 사기 +6" : scoreDiff >= 5 ? "대패 — 사기 -15" : "경기 패배 — 사기 -8";

  const fameDelta = Math.round(
    (won ? 2 : scoreDiff >= 5 ? -1 : 0) + strikeouts * 0.3
  );

  const growthLogs = [...pLogs, ...bLogs];

  return {
    protagonistPatch: {
      pitching:    newPitching,
      batting:     newBatting,
      pitchingXP:  updatedPitchingXP,
      battingXP:   updatedBattingXP,
      fatigue:     clamp(protagonist.fatigue   + 12, 0, 100),
      condition:   clamp(protagonist.condition - 8,  0, 100),
      morale:      clamp(protagonist.morale + moraleDelta, 0, 100),
    },
    logs: [resultLog, ...(growthLogs.length > 0 ? [`[경기 성장] ${growthLogs.join(", ")}`] : [])],
    fameDelta,
  };
}
