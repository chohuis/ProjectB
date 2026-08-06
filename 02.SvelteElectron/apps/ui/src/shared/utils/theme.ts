/**
 * 테마 판정 — 설정값과 운영체제 설정을 합쳐 실제 톤을 낸다.
 *
 * ⚠ **"system"은 값이 아니라 위임이다.** 저장된 설정은 셋(light/dark/system)
 * 이지만 화면이 실제로 그릴 수 있는 톤은 둘뿐이다. 이 둘을 같은 타입으로
 * 두면 어딘가에서 `theme === "system"`을 어두운 톤으로 잘못 다루게 된다.
 */
import type { ThemeSetting } from "../stores/settings";
import type { ThemeTone } from "./teamTheme";

export type { ThemeTone };

/** 운영체제가 어두운 테마를 쓰나. 알 수 없으면 밝음으로 본다 */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 설정 + 시스템 → 실제 톤 */
export function resolveTone(setting: ThemeSetting, systemDark = systemPrefersDark()): ThemeTone {
  if (setting === "dark") return "dark";
  if (setting === "light") return "light";
  return systemDark ? "dark" : "light";
}

/**
 * 문서에 톤을 바른다.
 *
 * ⚠ 밝은 톤에서는 **속성을 지운다** — `data-theme="light"`를 남기면
 * `:root[data-theme="dark"]`만 있는 지금 구조에서는 문제없지만, 나중에
 * 시스템 미디어 쿼리를 섞을 때 어느 쪽이 이기는지가 흐려진다.
 */
export function applyTone(tone: ThemeTone, root?: HTMLElement): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  if (tone === "dark") el.setAttribute("data-theme", "dark");
  else el.removeAttribute("data-theme");
}

/**
 * 움직임 줄이기를 문서에 바른다.
 *
 * CSS의 `prefers-reduced-motion`은 **운영체제 설정만** 본다. 앱 안에서 켠
 * 사람도 같은 대접을 받아야 하므로 속성으로 한 번 더 건다.
 */
export function applyReducedMotion(on: boolean, root?: HTMLElement): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  if (on) el.setAttribute("data-reduce-motion", "1");
  else el.removeAttribute("data-reduce-motion");
}
