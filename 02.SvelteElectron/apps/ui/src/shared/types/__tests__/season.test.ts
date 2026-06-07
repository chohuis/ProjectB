import { describe, it, expect } from "vitest";
import { calcEra, calcWhip, calcAvg, calcOps } from "../season";

describe("calcEra", () => {
  it("기본 계산", () => {
    expect(calcEra(9, 9)).toBe(9.0);
    expect(calcEra(3, 9)).toBe(3.0);
    expect(calcEra(2, 18)).toBe(1.0);
  });

  it("소수점 2자리 반올림", () => {
    expect(calcEra(5, 13)).toBe(3.46);
  });

  it("IP=0 이면 0 반환", () => {
    expect(calcEra(3, 0)).toBe(0);
    expect(calcEra(0, 0)).toBe(0);
  });
});

describe("calcWhip", () => {
  it("기본 계산", () => {
    expect(calcWhip(2, 7, 9)).toBe(1.0);
    expect(calcWhip(3, 9, 9)).toBe(1.33);
  });

  it("IP=0 이면 0 반환", () => {
    expect(calcWhip(1, 1, 0)).toBe(0);
  });
});

describe("calcAvg", () => {
  it("기본 계산", () => {
    expect(calcAvg(3, 10)).toBe(0.3);
    expect(calcAvg(1, 4)).toBe(0.25);
  });

  it("소수점 3자리 반올림", () => {
    expect(calcAvg(1, 3)).toBe(0.333);
  });

  it("AB=0 이면 0 반환", () => {
    expect(calcAvg(0, 0)).toBe(0);
    expect(calcAvg(3, 0)).toBe(0);
  });
});

describe("calcOps", () => {
  it("OBP + SLG 합산 후 3자리 반올림", () => {
    expect(calcOps(0.350, 0.500)).toBe(0.85);
    expect(calcOps(0.333, 0.444)).toBe(0.777);
  });

  it("소수점 반올림 케이스", () => {
    expect(calcOps(0.3333, 0.4444)).toBe(0.778);
  });
});
