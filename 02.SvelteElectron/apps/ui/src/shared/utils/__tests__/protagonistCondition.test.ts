import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { protagonistPitchCondition, protagonistRestCondition } from "../protagonistCondition";
import type { PlayerCondition } from "../../types/season";

// ── 1.1 A② §6-1-4 — 주인공 자신의 등판 기록 ─────────────────────────
//
// 이 값이 없으면 의무 휴식이 통째로 안 걸린다(`restGuard`·`myCondR` 둘 다 재료가 이것뿐이다).
// 배선은 문자열 포함으로 본다 — 정규식을 쓰지 않는다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const base = {
  isStarter: false,
  week: 12,
  gameDate: "2027-05-02",
  pitchCount: 24,
  outsRecorded: 4,
  teamGameCount: 7,
  fatigue: 61,
};

describe("한 장 만들기", () => {
  it("휴식 재료 셋(날짜·투구수·아웃)을 그대로 싣는다", () => {
    const c = protagonistPitchCondition({ ...base });
    expect(c.lastPitchedDate).toBe("2027-05-02");
    expect(c.lastPitchCount).toBe(24);
    expect(c.pitchOutsLast).toBe(4);
    expect(c.lastPitchedWeek).toBe(12);
    expect(c.fatigue).toBe(61);
  });

  it("피로는 0~100 으로 자른다", () => {
    expect(protagonistPitchCondition({ ...base, fatigue: 140 }).fatigue).toBe(100);
    expect(protagonistPitchCondition({ ...base, fatigue: -3 }).fatigue).toBe(0);
  });

  it("선발은 연속 출전이 0 이고 선발 시점을 남긴다", () => {
    const c = protagonistPitchCondition({ ...base, isStarter: true });
    expect(c.consecutiveAppearances).toBe(0);
    expect(c.lastStartGameCount).toBe(7);
  });

  it("불펜은 바로 앞 경기에서 던졌으면 연속이 는다", () => {
    const prev: PlayerCondition = {
      fatigue: 40, lastPitchedWeek: 11, pitchOutsLast: 3,
      lastAppearanceGameCount: 6, consecutiveAppearances: 2,
    };
    expect(protagonistPitchCondition({ ...base, prev }).consecutiveAppearances).toBe(3);
  });

  it("불펜이 한 경기 쉬었으면 연속이 1 로 다시 센다", () => {
    const prev: PlayerCondition = {
      fatigue: 40, lastPitchedWeek: 9, pitchOutsLast: 3,
      lastAppearanceGameCount: 4, consecutiveAppearances: 2,
    };
    expect(protagonistPitchCondition({ ...base, prev }).consecutiveAppearances).toBe(1);
  });

  it("첫 등판(직전 기록 없음)은 연속 1", () => {
    expect(protagonistPitchCondition({ ...base, prev: null }).consecutiveAppearances).toBe(1);
  });
});

describe("안 던진 경기", () => {
  it("직전 기록이 없으면 아무것도 안 만든다", () => {
    expect(protagonistRestCondition(null)).toBeNull();
    expect(protagonistRestCondition(undefined)).toBeNull();
  });
  it("이미 0 이면 다시 안 쓴다", () => {
    const prev: PlayerCondition = { fatigue: 40, lastPitchedWeek: 9, pitchOutsLast: 0, consecutiveAppearances: 0 };
    expect(protagonistRestCondition(prev)).toBeNull();
  });
  it("연속만 끊고 등판 기록은 그대로 둔다", () => {
    const prev: PlayerCondition = {
      fatigue: 40, lastPitchedWeek: 9, pitchOutsLast: 3,
      lastPitchedDate: "2027-04-20", lastPitchCount: 31, consecutiveAppearances: 2,
    };
    const c = protagonistRestCondition(prev)!;
    expect(c.consecutiveAppearances).toBe(0);
    expect(c.lastPitchedDate).toBe("2027-04-20");
    expect(c.lastPitchCount).toBe(31);
  });
});

describe("배선 — applyGameOutcome 두 갈래가 다 쓴다", () => {
  const src = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
  it("헬퍼를 불러온다", () => {
    expect(src.includes('from "../utils/protagonistCondition"')).toBe(true);
  });
  it("등판 기록을 두 번 쓴다 — 친선 갈래와 정식 갈래", () => {
    expect(src.split("protagonistPitchCondition({").length - 1).toBe(2);
  });
  it("두 갈래 다 주인공 id 를 키로 쓴다", () => {
    expect(src.includes("pitcherConditions[protagonist.id] = protagonistPitchCondition({")).toBe(true);
    expect(src.includes("rotConditions[protagonist.id] = protagonistPitchCondition({")).toBe(true);
  });
  it("안 던진 갈래에서 연속만 끊는다", () => {
    expect(src.split("protagonistRestCondition(").length - 1).toBe(2);
  });
  it("피로를 지어내지 않고 gameStore 값을 쓴다", () => {
    expect(src.split("fatigue:       get(gameStore).protagonist.fatigue").length - 1).toBe(2);
  });
});
