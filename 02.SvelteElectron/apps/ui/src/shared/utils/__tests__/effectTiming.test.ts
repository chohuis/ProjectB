import { describe, it, expect } from "vitest";
import {
  scaleMs, showsOverlay, overlayMs, reducesMotion, OVERLAY_BASE_MS,
} from "../effectTiming";

describe("연출 시간", () => {
  it("보통은 원래 시간 그대로", () => {
    expect(scaleMs(1400, "normal")).toBe(1400);
    expect(scaleMs(600, "normal")).toBe(600);
  });

  it("빠르게는 절반 아래로", () => {
    expect(scaleMs(1400, "fast")).toBeLessThan(1400 * 0.5);
    expect(scaleMs(1400, "fast")).toBeGreaterThan(0);
  });

  it("⚠ '끄기'도 0이 아니다 — 0이면 화면이 순간이동해 무슨 일인지 못 본다", () => {
    expect(scaleMs(1400, "off")).toBeGreaterThan(0);
    expect(scaleMs(600, "off")).toBeGreaterThan(0);
  });

  it("빠를수록 짧다 — 순서가 뒤집히면 안 된다", () => {
    const n = scaleMs(1000, "normal");
    const f = scaleMs(1000, "fast");
    const o = scaleMs(1000, "off");
    expect(n).toBeGreaterThan(f);
    expect(f).toBeGreaterThan(o);
  });

  it("아주 짧은 시간은 바닥값 아래로 안 내려간다", () => {
    expect(scaleMs(20, "off")).toBeGreaterThanOrEqual(16);
    expect(scaleMs(16, "fast")).toBeGreaterThanOrEqual(16);
  });

  it("0이나 음수는 0으로 — 없는 연출에 바닥값을 주지 않는다", () => {
    expect(scaleMs(0, "normal")).toBe(0);
    expect(scaleMs(-5, "normal")).toBe(0);
    expect(scaleMs(NaN, "normal")).toBe(0);
  });
});

describe("결과 오버레이", () => {
  it("끄기에서만 안 뜬다", () => {
    expect(showsOverlay("normal")).toBe(true);
    expect(showsOverlay("fast")).toBe(true);
    expect(showsOverlay("off")).toBe(false);
  });

  it("기본이 1.4초 — 100구면 2분 20초다", () => {
    expect(OVERLAY_BASE_MS).toBe(1400);
    expect(overlayMs("normal")).toBe(1400);
    expect(overlayMs("fast")).toBeLessThan(700);
  });
});

describe("움직임 줄이기", () => {
  it("⚠ 둘 중 하나라도 켜져 있으면 줄인다 — AND면 접근성 설정을 무시하게 된다", () => {
    expect(reducesMotion(false, true)).toBe(true);
    expect(reducesMotion(true, false)).toBe(true);
    expect(reducesMotion(true, true)).toBe(true);
    expect(reducesMotion(false, false)).toBe(false);
  });
});
