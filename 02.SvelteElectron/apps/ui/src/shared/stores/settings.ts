/**
 * 앱 환경설정 — **슬롯이 아니라 앱 전체**의 값이다.
 *
 * ⚠ `slot.db`에 넣지 않는다. 세이브를 옮겼다고 테마가 따라가면 이상하고,
 * 스키마 마이그레이션 비용도 붙는다. 언어가 이미 `localStorage`를 쓰고 있어
 * 같은 길로 간다 (`shared/i18n/index.ts`).
 *
 * ⚠ 게임 로직을 넣지 않는다. 이 파일은 **값 보관과 저장**만 한다
 * (CLAUDE.md: store는 상태 보관 + 얇은 패처).
 */
import { writable } from "svelte/store";

const STORAGE_KEY = "ui_settings";

/** 시스템 따름 — OS의 `prefers-color-scheme`을 그대로 쓴다 */
export type ThemeSetting = "light" | "dark" | "system";

/** 경기 연출 속도. 오버레이가 100구 × 1.4초 = 2분 20초를 먹는다 */
export type EffectSpeed = "fast" | "normal" | "off";

export type WindowSize = "1280x800" | "1440x900" | "1600x900" | "1920x1080" | "fullscreen";

export interface Settings {
  theme: ThemeSetting;
  effectSpeed: EffectSpeed;
  /** 애니메이션 줄이기. OS 설정(`prefers-reduced-motion`)과 **OR**로 판정한다 */
  reduceMotion: boolean;
  windowSize: WindowSize;
  /** 0~100. 소리 파일이 아직 없어 저장만 된다 (S6) */
  volumeMaster: number;
  volumeSfx: number;
  volumeBgm: number;
}

export const DEFAULTS: Settings = {
  theme: "light",
  effectSpeed: "normal",
  reduceMotion: false,
  windowSize: "1440x900",
  volumeMaster: 70,
  volumeSfx: 70,
  volumeBgm: 50,
};

const THEMES: ThemeSetting[] = ["light", "dark", "system"];
const SPEEDS: EffectSpeed[] = ["fast", "normal", "off"];
const SIZES: WindowSize[] = ["1280x800", "1440x900", "1600x900", "1920x1080", "fullscreen"];

const clampVolume = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;

/**
 * 저장된 값에서 **알아볼 수 있는 것만** 받는다.
 *
 * ⚠ 옛 저장값이나 손으로 고친 값이 그대로 들어오면 화면이 조용히 깨진다.
 * 모르는 값은 버리고 기본값을 쓴다 — 통째로 버리지는 않는다(한 항목이
 * 이상하다고 나머지 설정까지 날릴 이유가 없다).
 */
export function parseSettings(raw: unknown): Settings {
  const s = { ...DEFAULTS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return s;
  const o = raw as Record<string, unknown>;

  if (THEMES.includes(o.theme as ThemeSetting)) s.theme = o.theme as ThemeSetting;
  if (SPEEDS.includes(o.effectSpeed as EffectSpeed)) s.effectSpeed = o.effectSpeed as EffectSpeed;
  if (SIZES.includes(o.windowSize as WindowSize)) s.windowSize = o.windowSize as WindowSize;
  if (typeof o.reduceMotion === "boolean") s.reduceMotion = o.reduceMotion;

  const m = clampVolume(o.volumeMaster); if (m !== null) s.volumeMaster = m;
  const x = clampVolume(o.volumeSfx);    if (x !== null) s.volumeSfx = x;
  const b = clampVolume(o.volumeBgm);    if (b !== null) s.volumeBgm = b;

  return s;
}

function load(): Settings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return parseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

function createSettingsStore() {
  const { subscribe, update, set } = writable<Settings>(load());

  const persist = (s: Settings) => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  };

  return {
    subscribe,
    /** 한 항목만 바꾼다 */
    patch<K extends keyof Settings>(key: K, value: Settings[K]) {
      update((s) => {
        const next = { ...s, [key]: value };
        persist(next);
        return next;
      });
    },
    reset() {
      const next = { ...DEFAULTS };
      persist(next);
      set(next);
    },
  };
}

export const settingsStore = createSettingsStore();
