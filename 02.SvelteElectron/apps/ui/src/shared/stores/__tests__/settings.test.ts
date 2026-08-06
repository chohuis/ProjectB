import { describe, it, expect } from "vitest";
import { parseSettings, DEFAULTS } from "../settings";

describe("저장값 읽기", () => {
  it("빈 값이면 기본값", () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(parseSettings(undefined)).toEqual(DEFAULTS);
    expect(parseSettings({})).toEqual(DEFAULTS);
  });

  it("객체가 아니면 기본값 — 배열도 아니다", () => {
    expect(parseSettings("dark")).toEqual(DEFAULTS);
    expect(parseSettings(42)).toEqual(DEFAULTS);
    expect(parseSettings(["dark"])).toEqual(DEFAULTS);
  });

  it("알아볼 수 있는 값만 받는다", () => {
    const s = parseSettings({ theme: "dark", effectSpeed: "fast", reduceMotion: true });
    expect(s.theme).toBe("dark");
    expect(s.effectSpeed).toBe("fast");
    expect(s.reduceMotion).toBe(true);
  });

  it("⚠ 모르는 값은 버리되 나머지는 살린다 — 한 항목 때문에 설정을 다 날리지 않는다", () => {
    const s = parseSettings({ theme: "형광", effectSpeed: "fast" });
    expect(s.theme).toBe(DEFAULTS.theme);
    expect(s.effectSpeed).toBe("fast");
  });

  it("테마 세 가지만", () => {
    for (const t of ["light", "dark", "system"]) {
      expect(parseSettings({ theme: t }).theme).toBe(t);
    }
    expect(parseSettings({ theme: "auto" }).theme).toBe(DEFAULTS.theme);
  });

  it("연출 속도 세 가지만", () => {
    for (const v of ["fast", "normal", "off"]) {
      expect(parseSettings({ effectSpeed: v }).effectSpeed).toBe(v);
    }
    expect(parseSettings({ effectSpeed: "slow" }).effectSpeed).toBe(DEFAULTS.effectSpeed);
  });

  it("창 크기는 목록에 있는 것만 — 임의 크기를 받으면 창이 이상해진다", () => {
    expect(parseSettings({ windowSize: "1600x900" }).windowSize).toBe("1600x900");
    expect(parseSettings({ windowSize: "fullscreen" }).windowSize).toBe("fullscreen");
    expect(parseSettings({ windowSize: "9999x9999" }).windowSize).toBe(DEFAULTS.windowSize);
  });

  it("reduceMotion은 불리언만 — 'true' 문자열은 안 받는다", () => {
    expect(parseSettings({ reduceMotion: true }).reduceMotion).toBe(true);
    expect(parseSettings({ reduceMotion: "true" }).reduceMotion).toBe(DEFAULTS.reduceMotion);
  });
});

describe("볼륨", () => {
  it("0~100으로 자른다", () => {
    expect(parseSettings({ volumeMaster: 150 }).volumeMaster).toBe(100);
    expect(parseSettings({ volumeMaster: -20 }).volumeMaster).toBe(0);
    expect(parseSettings({ volumeMaster: 55 }).volumeMaster).toBe(55);
  });

  it("소수는 반올림한다", () => {
    expect(parseSettings({ volumeSfx: 33.7 }).volumeSfx).toBe(34);
  });

  it("숫자가 아니면 기본값 — 0으로 떨어뜨리지 않는다", () => {
    // 0으로 떨어뜨리면 "소리를 껐다"가 되어 뜻이 달라진다
    expect(parseSettings({ volumeBgm: "70" }).volumeBgm).toBe(DEFAULTS.volumeBgm);
    expect(parseSettings({ volumeBgm: NaN }).volumeBgm).toBe(DEFAULTS.volumeBgm);
    expect(parseSettings({ volumeBgm: null }).volumeBgm).toBe(DEFAULTS.volumeBgm);
  });

  it("0은 진짜 0이다", () => {
    expect(parseSettings({ volumeMaster: 0 }).volumeMaster).toBe(0);
  });
});
