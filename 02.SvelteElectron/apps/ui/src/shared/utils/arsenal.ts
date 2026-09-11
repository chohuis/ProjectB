// ── 보유 구종을 엔진 표기로 ──────────────────────────────────────
//
// 세이브·마스터는 `PITCH_SLIDER` 같은 ID를 쓰고, 엔진은 `"slider"`를 받는다.
// 그 변환표가 **경기 화면 안에만** 있었다 — 자동 시뮬 경로에서 쓰려면 복제해야
// 했고, 그러면 이 프로젝트가 이미 여러 번 당한 "표가 둘"이 또 생긴다.
//
// ⚠ 그리고 애초에 **구종이 엔진에 안 갔다.** `PitcherStats`에 배열 자체가
// 없어서 자동 시뮬은 Fastball/Slider/Changeup을 하드코딩으로 던졌다 —
// 너클볼을 마스터해도 안 나왔고, 숙련도는 화면의 숫자였을 뿐이다.

import type { PitchEntry } from "../types/save";

/** 엔진이 아는 구종 이름 — Rust `PitchType`의 serde 이름과 같아야 한다 */
export type EnginePitchType =
  | "fastball"
  | "sinker"
  | "cutter"
  | "slider"
  | "curve"
  | "changeup"
  | "splitter"
  | "forkball"
  | "screwball"
  | "knuckleball";

/** **정본은 여기 하나다.** 경기 화면도 자동 시뮬도 이걸 쓴다 */
export const PITCH_ID_TO_ENGINE: Record<string, EnginePitchType> = {
  PITCH_FASTBALL: "fastball",
  PITCH_SINKER: "sinker",
  PITCH_CUTTER: "cutter",
  PITCH_SLIDER: "slider",
  PITCH_CURVE: "curve",
  PITCH_CHANGEUP: "changeup",
  PITCH_SPLITTER: "splitter",
  PITCH_FORKBALL: "forkball",
  PITCH_SCREWBALL: "screwball",
  PITCH_KNUCKLEBALL: "knuckleball",
};

export interface EngineArsenalPitch {
  type: EnginePitchType;
  grade: number;
}

/**
 * 세이브의 구종 목록 → 엔진 페이로드.
 *
 * ⚠ **빈 배열을 넘기지 않는다.** 비면 엔진이 패스트볼 하나로 폴백하는데,
 * 그건 "구종이 없는 투수"가 아니라 **배선을 빠뜨렸을 때와 같은 모습**이다.
 * 여기서 최소 하나를 보장해 두 상황을 구분할 수 있게 한다.
 *
 * 모르는 ID는 버린다 — 엔진이 모르는 이름을 받으면 역직렬화가 통째로 실패한다.
 */
export function toEngineArsenal(
  pitches: readonly PitchEntry[] | undefined | null,
): EngineArsenalPitch[] {
  const out: EngineArsenalPitch[] = [];
  for (const p of pitches ?? []) {
    const t = PITCH_ID_TO_ENGINE[p.id];
    if (!t) continue;
    if (out.some((x) => x.type === t)) continue; // 중복은 하나로
    out.push({ type: t, grade: Math.max(1, Math.min(5, p.grade ?? 3)) });
  }
  if (out.length === 0) out.push({ type: "fastball", grade: 3 });
  return out;
}

/**
 * 지금 익히는 중인 구종의 **폼 난이도** (0~3). 정본은 `pitch_catalog.json`.
 *
 * ⚠ 이 값이 있으면 경기에서 제구가 실제로 흔들린다(`build_pitcher`).
 * 안 넘기면 그 페널티가 조용히 사라진다 — 화면에는 "폼 교정 중"이 떠 있는데
 * 경기는 멀쩡한 상태가 되고, 그게 제일 나쁜 종류의 불일치다.
 */
export function developingDifficultyOf(
  trainingPitchState: { id: string } | null | undefined,
  catalog: readonly { id: string; formDifficulty?: number }[],
): number {
  if (!trainingPitchState) return 0;
  return catalog.find((c) => c.id === trainingPitchState.id)?.formDifficulty ?? 0;
}

// ── 훈련 강도 ────────────────────────────────────────────────────
//
// ⚠ 이 정의가 두 곳에 있었다 — `advanceWeek`(부상 판정용)과 훈련 화면
// (미리보기용). **Phase 2에서 내가 두 번째를 만들었다.** 정본을 하나로 모으는
// 작업을 하면서 같은 실수를 반복한 것이라 여기 적어 둔다.
//
// 마스터 데이터에 `intensity: low|medium|high` 필드도 있었지만 안 쓰이고 있었고,
// 정의가 셋이 되므로 **정본은 이 함수 하나**로 한다.

/** 강도에 안 치는 프로그램 — 회복·정신 훈련 */
const LOW_INTENSITY = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);

/**
 * 이번 주 훈련 강도 (0~1). 회복·정신을 뺀 슬롯 비율이다.
 * 부상 판정(`trainingIntensity`)과 화면 미리보기가 **같은 값**을 써야 한다.
 */
export function trainingIntensityOf(slots: readonly (string | null | undefined)[]): number {
  const used = slots.filter((x): x is string => !!x);
  if (used.length === 0) return 0;
  return used.filter((id) => !LOW_INTENSITY.has(id)).length / used.length;
}
