/**
 * 연출 시간 — **한 곳에서 정한다.**
 *
 * ⚠ 지금까지 `1400`·`600`·`200`·`16` 같은 숫자가 경기 화면에 흩어져 있었다.
 * 설정으로 조절하려면 곱할 자리가 하나여야 한다.
 *
 * ⚠ **"끄기"는 0이 아니다.** 공 이동을 0ms로 만들면 화면이 순간이동해
 * 무슨 일이 있었는지 못 본다. 결과 오버레이만 건너뛰고 나머지는 최소 시간을
 * 남긴다 — 빠른 것과 안 보이는 것은 다르다.
 */
import type { EffectSpeed } from "../stores/settings";

/** 각 속도의 배수. `off`도 0이 아니다 */
const SCALE: Record<EffectSpeed, number> = {
  fast: 0.45,
  normal: 1,
  off: 0.2,
};

/** 이 밑으로는 사람이 못 따라간다 */
const FLOOR_MS = 16;

/** 연출 시간을 설정에 맞춰 줄인다 */
export function scaleMs(baseMs: number, speed: EffectSpeed): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0;
  return Math.max(FLOOR_MS, Math.round(baseMs * SCALE[speed]));
}

/**
 * 결과 오버레이(큰 글자)를 띄우나.
 *
 * 한 경기 투구가 100구 안팎이고 기본 1.4초라 **2분 20초가 연출에만** 쓰인다.
 * "끄기"는 그걸 통째로 없애는 선택이다.
 */
export function showsOverlay(speed: EffectSpeed): boolean {
  return speed !== "off";
}

/** 오버레이가 떠 있는 시간 */
export const OVERLAY_BASE_MS = 1400;

export function overlayMs(speed: EffectSpeed): number {
  return scaleMs(OVERLAY_BASE_MS, speed);
}

/**
 * 움직임을 줄이나 — **설정과 운영체제 중 하나라도 켜져 있으면** 줄인다.
 *
 * ⚠ OR이지 AND가 아니다. 운영체제에서 켜 둔 사람에게 앱 설정이 꺼져 있다고
 * 애니메이션을 돌려주면 접근성 설정을 무시하는 것이 된다.
 */
export function reducesMotion(appSetting: boolean, systemSetting: boolean): boolean {
  return appSetting || systemSetting;
}

/** 운영체제가 움직임 줄이기를 켜 뒀나 */
export function systemReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
