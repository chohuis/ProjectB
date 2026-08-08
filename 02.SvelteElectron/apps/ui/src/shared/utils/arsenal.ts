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
  | "fastball" | "sinker" | "cutter" | "slider" | "curve"
  | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball";

/** **정본은 여기 하나다.** 경기 화면도 자동 시뮬도 이걸 쓴다 */
export const PITCH_ID_TO_ENGINE: Record<string, EnginePitchType> = {
  PITCH_FASTBALL:    "fastball",
  PITCH_SINKER:      "sinker",
  PITCH_CUTTER:      "cutter",
  PITCH_SLIDER:      "slider",
  PITCH_CURVE:       "curve",
  PITCH_CHANGEUP:    "changeup",
  PITCH_SPLITTER:    "splitter",
  PITCH_FORKBALL:    "forkball",
  PITCH_SCREWBALL:   "screwball",
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
    if (out.some((x) => x.type === t)) continue;   // 중복은 하나로
    out.push({ type: t, grade: Math.max(1, Math.min(5, p.grade ?? 3)) });
  }
  if (out.length === 0) out.push({ type: "fastball", grade: 3 });
  return out;
}
