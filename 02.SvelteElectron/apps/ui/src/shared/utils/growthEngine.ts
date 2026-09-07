import type { ProtagonistSave, TrainingPlanState } from "../types/save";
import { NEUTRAL_MODS, type StaffMods } from "./staffEffects";

export interface GrowthResult {
  protagonistPatch: Partial<ProtagonistSave>;
  logs: string[];
  fameDelta: number;
  /**
   * 이번 주 XP 가 **기준 대비 몇 배인가** — 1.0 이 기준이다 (C2 문안 은행).
   *
   * 🔴 **정본은 Rust `growth_engine.rs::xp_ratio_of` 다.** 여기서 계수를 다시
   *   곱하지 않는다 — 결정 ④ 가 지운 사본이 그 자리에서 되살아난다.
   *
   * ⚠ **구 엔진은 안 보낸다.** 없으면 `1.0`(= 기준)으로 읽어 「평소만큼」이
   *   된다 — 없는 값을 좋은 쪽으로도 나쁜 쪽으로도 밀지 않는다.
   */
  xpRatio: number;
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

  // ⚠ **어느 값이 망가졌는지 여기서 말한다.** Rust는 `invalid type: null,
  // expected f64 at line 1 column 54`라고만 하는데, 그 열 번호로 필드를
  // 되짚는 데 여러 단계가 걸린다. 실제로 60회 조사에서 대학 3년차 시즌
  // 롤오버마다 이 오류로 **주 진행이 통째로 막혔다**(플레이어라면 게임이 멈춘다).
  {
    const bad: string[] = [];
    const chk = (name: string, v: unknown) => {
      if (typeof v !== "number" || !Number.isFinite(v)) bad.push(`${name}=${v}`);
    };
    chk("developmentRate", params.protagonist.developmentRate);
    chk("condition", params.protagonist.condition);
    chk("fatigue", params.protagonist.fatigue);
    chk("mods.devRate", mods.devRate);
    if (bad.length > 0) {
      throw new Error(`[훈련] 성장 입력이 숫자가 아니다: ${bad.join(", ")}`
        + ` (팀 ${protagonist.teamId} · 단계 ${protagonist.careerStage})`);
    }
  }

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

  return {
    protagonistPatch: patch, logs: raw.logs, fameDelta: raw.fameDelta,
    // ⚠ 없으면 기준(1.0)이다 — 구 엔진·검사 더미가 이 칸을 안 보낸다
    xpRatio: typeof raw.xpRatio === "number" && Number.isFinite(raw.xpRatio) ? raw.xpRatio : 1.0,
  };
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

/**
 * 폼 무너짐 하락폭 — **경기에 걸리는 것과 같은 식이다.**
 * 화면이 자기 식으로 적으면 표시와 실제가 갈린다.
 */
export async function formPenalty(difficulty: number, control: number):
  Promise<{ command: number; control: number }> {
  if (difficulty <= 0) return { command: 0, control: 0 };
  const raw = JSON.parse(
    await window.projectB!.engine("formPenaltyNative", JSON.stringify({ difficulty, control })),
  );
  return { command: raw?.command ?? 0, control: raw?.control ?? 0 };
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

  return {
    protagonistPatch: patch, logs: raw.logs, fameDelta: raw.fameDelta,
    // ⚠ 없으면 기준(1.0)이다 — 구 엔진·검사 더미가 이 칸을 안 보낸다
    xpRatio: typeof raw.xpRatio === "number" && Number.isFinite(raw.xpRatio) ? raw.xpRatio : 1.0,
  };
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

// ── 이번 주 훈련 효율 — 화면에 보여 줄 계수 (결정 ④ 1단계) ───────
//
// 🔴 **정본은 Rust `growth_engine.rs` 다.** 여기서 계수를 **만들지 않는다.**
//
//    2026-09-04 ~ 09-06 에는 컨디션·피로·성실 계수 셋과 슬롯 배수 셋이
//    **여기 옮겨 적혀** 있었다(값은 Rust `week_xp` · `SLOT_MULTS` 를 본다 —
//    여기 다시 적으면 그것이 곧 사본이다). Rust 에 「계수만 돌려주는 문」이
//    없어서였다 —
//    `previewTrainingNative` 는 피로·컨디션 변화만 주고 XP 계수는 안 준다.
//    사본이라 한쪽만 고쳐진 채 남을 수 있었고, 검사는 **Rust 파일을 문자열로
//    읽어** 식이 그대로인지 보는 것으로 겨우 막고 있었다.
//
//    2026-09-07 에 `trainingEfficiencyNative` 를 내서 사본을 없앴다.
//    Rust 쪽에서도 `week_xp` 가 그 계수 함수들을 부른다 — 자리가 하나다.
//
// ⚠ **비동기다.** 엔진 왕복이 IPC 라 동기로 못 만든다. 화면 둘(훈련 화면 ·
//    소식 선택지 꼬리)이 그래서 `await` 로 바뀌었다 — 사본을 남기는 것보다
//    이쪽이 싸다. 왕복 수를 줄이려고 **여러 지점을 한 번에** 묻는다.
// ⚠ **엔진이 없으면 `null` 이다**(Vite 단독·검사). 여기서 값을 지어 내면
//    그게 곧 사본이다 — 화면은 그때 효율 칸을 **안 그린다.**

/** Rust `TrainingEfficiencyOne` — 계수 셋과 그 곱 */
export interface TrainingEfficiency {
  /** 계수 셋 */
  condition: number;
  fatigue: number;
  diligence: number;
  /** 셋의 곱 — 기준(각 계수 1.0)이 1.0 이다 */
  total: number;
  /** 기준 대비 백분율 (+12 / −23). 반올림한 정수다 */
  pct: number;
}

interface EfficiencyPoint { condition: number; fatigue: number; diligence: number }
interface NativeEfficiency { entries: Omit<TrainingEfficiency, "pct">[]; slotMults: number[] }

/**
 * 여러 지점의 계수를 **한 번에** 묻는다.
 *
 * ⚠ 왕복을 늘리지 않으려고 배열로 받는다 — 선택지마다 「지금」과 「고른 뒤」
 *   둘을 재는데 하나씩 물으면 왕복이 배가 된다.
 */
async function askEfficiency(points: readonly EfficiencyPoint[]): Promise<NativeEfficiency | null> {
  // ⚠ `window` 자체가 없는 자리가 있다 (vitest node 환경 · 헤드리스 부팅 전).
  //   `window.projectB` 만 보면 거기서 **던진다** — 없으면 없는 대로 null 이다
  const api = typeof window === "undefined" ? undefined : window.projectB?.engine;
  if (!api || points.length === 0) return null;
  try {
    const r = JSON.parse(await api("trainingEfficiencyNative",
      JSON.stringify({ queries: points }))) as NativeEfficiency & { error?: string };
    if (r.error || !Array.isArray(r.entries) || r.entries.length !== points.length) return null;
    return r;
  } catch {
    return null;
  }
}

/**
 * 슬롯 배수 — 주/보조1/보조2 의 XP 배수. **정본은 Rust `SLOT_MULTS` 다.**
 *
 * ⚠ 못 물으면 빈 배열이다 — 화면이 그때 그 줄을 안 그린다. 옛 값을 적어 두면
 *   그게 다시 사본이다 — 뒤집기 전 옛 배수가 그래서 오래 남아 있었다.
 */
export async function trainingSlotMults(): Promise<readonly number[]> {
  const r = await askEfficiency([{ condition: 100, fatigue: 0, diligence: 99 }]);
  return r?.slotMults ?? [];
}

/**
 * 지금 상태가 훈련 XP 를 **몇 % 밀거나 깎고 있나.**
 *
 * ⚠ 기준은 「각 계수 1.0」이다 — 컨디션 100 · 피로 0 · 성실 약 49.5.
 *   성장률·잠재력·나이는 **안 넣는다**: 선택지로 못 움직이는 축이라
 *   같이 곱하면 「내가 고른 것이 얼마나 바꿨나」가 안 보인다.
 */
export async function trainingEfficiency(p: EfficiencyPoint): Promise<TrainingEfficiency | null> {
  const r = await askEfficiency([p]);
  if (!r) return null;
  const e = r.entries[0];
  return { ...e, pct: Math.round((e.total - 1) * 100) };
}

/**
 * 선택지 하나가 훈련 효율을 몇 % 움직이나 — 「→ 훈련 효율 ±N%」 꼬리용.
 *
 * ⚠ **지금 값에서 잰다.** 같은 「피로 −8」도 피로 72 에서는 문턱(70)을 넘어
 *   크게 튀고 피로 20 에서는 미미하다 — 고정 표를 적으면 거짓말이 된다.
 * ⚠ 값이 안 움직이면 `null` — 0% 를 적으면 「효과 없음」과 「해당 없음」이
 *   같아 보인다.
 * ⚠ 값은 1~99 로 잘린다(`game.ts` 의 효과 적용과 같은 범위).
 */
export async function trainingEfficiencyDelta(
  now: EfficiencyPoint,
  d: { conditionDelta?: number; fatigueDelta?: number; diligenceDelta?: number },
): Promise<number | null> {
  const dc = d.conditionDelta ?? 0, df = d.fatigueDelta ?? 0, dd = d.diligenceDelta ?? 0;
  if (dc === 0 && df === 0 && dd === 0) return null;
  const clamp = (v: number) => Math.max(1, Math.min(99, v));
  // 🔴 **두 지점을 한 번에 묻는다** — 앞뒤를 따로 물으면 왕복이 둘이다
  const r = await askEfficiency([now, {
    // ⚠ 컨디션은 100 까지다 — 1~99 로 자르면 컨디션 100 이 99 로 깎인다
    condition: Math.max(1, Math.min(100, now.condition + dc)),
    fatigue:   clamp(now.fatigue + df),
    diligence: clamp(now.diligence + dd),
  }]);
  if (!r) return null;
  const [before, after] = r.entries;
  if (before.total <= 0) return null;
  const pct = Math.round((after.total / before.total - 1) * 100);
  return pct === 0 ? null : pct;
}
