import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pitchingOvrOf, battingOvrOf } from "../ovr";
import type { PitchingAttributes, BattingAttributes } from "../../types/save";

/**
 * **OVR 은 파생값이다** — 능력치가 바뀌면 같이 바뀌어야 한다.
 *
 * 🔴 안 그랬다 (2026-09-06 · `check:roundtrip` 이 잡았다):
 *
 *     protagonist.json:protagonist.batting.ovr   30 → 35
 *
 *   불러오기(`normalizeProtagonist`)는 늘 다시 계산하는데, **이벤트로
 *   능력치를 올리는 자리**(`applyEffectToProtagonist`)는 안 했다. 그 함수
 *   주석은 "`ovr`은 파생값이라 못 바꾼다 — 능력치에서 계산된다"고 적어
 *   놓고 **계산하는 코드가 없었다.** 그래서 껐다 켜야 값이 맞았다.
 *
 * ⚠ 화면만의 문제가 아니다 — `pitching.ovr` 은 주인공을 NPC 로 볼 때의
 *   `overall` 이라 스카우트·드래프트 순위가 그 값을 읽는다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const P: PitchingAttributes = {
  ovr: 0,
  stamina: 58,
  velocity: 52,
  command: 60,
  control: 55,
  movement: 50,
  mentality: 57,
  recovery: 55,
  clutch: 50,
  holdRunners: 50,
};
const B: BattingAttributes = {
  ovr: 0,
  contact: 35,
  power: 28,
  eye: 32,
  discipline: 30,
  speed: 50,
  baseInstinct: 50,
  bunting: 45,
  platoon: 50,
  fielding: 45,
  arm: 55,
  battingClutch: 30,
};

describe("OVR 식", () => {
  it("가중합을 나눈 값이다", () => {
    // 손으로 한 번 더 셈한다 — 식이 바뀌면 여기가 먼저 걸린다
    const p =
      (52 * 2.5 +
        60 * 2.5 +
        55 * 2.0 +
        50 * 1.5 +
        58 * 1.5 +
        57 * 1.0 +
        55 * 0.5 +
        50 * 0.3 +
        50 * 0.2) /
      12.0;
    expect(pitchingOvrOf(P)).toBe(Math.round(p));
    const b =
      (35 * 2.0 +
        28 * 1.8 +
        32 * 1.5 +
        30 * 1.2 +
        50 * 1.3 +
        50 * 0.7 +
        45 * 0.3 +
        50 * 0.3 +
        45 * 1.3 +
        55 * 0.8 +
        30 * 0.6) /
      11.8;
    expect(battingOvrOf(B)).toBe(Math.round(b));
  });

  it("능력치가 오르면 OVR 도 오른다", () => {
    expect(pitchingOvrOf({ ...P, velocity: P.velocity + 10 })).toBeGreaterThan(pitchingOvrOf(P));
    expect(battingOvrOf({ ...B, contact: B.contact + 10 })).toBeGreaterThan(battingOvrOf(B));
  });

  /**
   * 🔴 **Rust 에도 같은 식이 있다** — 언어가 달라 합칠 수가 없다.
   *   합칠 수 없으면 **갈리는지를 본다.** 계수 하나가 어긋나면 성장 직후와
   *   불러온 뒤의 OVR 이 달라지고, 그건 "껐다 켜니 능력이 바뀌었다"로 나온다.
   */
  it("Rust 와 나누는 수가 같다", () => {
    const GE = read("packages/engine-native/src/growth_engine.rs");
    expect(GE).toContain("(weighted / 12.0).round()");
    expect(GE).toContain("(weighted / 11.8).round()");
    const TS = read("apps/ui/src/shared/utils/ovr.ts");
    expect(TS).toContain(") / 12.0);");
    expect(TS).toContain(") / 11.8);");
  });

  it("Rust 와 계수가 같다", () => {
    const GE = read("packages/engine-native/src/growth_engine.rs");
    for (const [stat, w] of [
      ["velocity", "2.5"],
      ["command", "2.5"],
      ["control", "2.0"],
      ["movement", "1.5"],
      ["stamina", "1.5"],
      ["mentality", "1.0"],
      ["recovery", "0.5"],
      ["clutch", "0.3"],
      ["hold_runners", "0.2"],
    ] as const) {
      expect(GE).toContain(`p.${stat}`);
      expect(GE).toContain(`* ${w}`);
    }
    for (const [stat, w] of [
      ["contact", "2.0"],
      ["power", "1.8"],
      ["eye", "1.5"],
      ["discipline", "1.2"],
      ["speed", "1.3"],
      ["base_instinct", "0.7"],
      ["bunting", "0.3"],
      ["platoon", "0.3"],
      ["fielding", "1.3"],
      ["arm", "0.8"],
      ["batting_clutch", "0.6"],
    ] as const) {
      expect(GE).toContain(`b.${stat}`);
      expect(GE).toContain(`* ${w}`);
    }
  });

  /** 식이 **한 벌**이어야 한다 — 불러오기가 따로 셈하면 또 갈린다 */
  it("불러오기와 이벤트가 같은 함수를 쓴다", () => {
    const G = read("apps/ui/src/shared/stores/game.ts");
    expect(G).toContain("pitchingMerged.ovr = pitchingOvrOf(pitchingMerged);");
    expect(G).toContain("battingMerged.ovr = battingOvrOf(battingMerged);");
    expect(G).toContain("if (pTouched) pitching.ovr = pitchingOvrOf(pitching);");
    expect(G).toContain("if (bTouched) batting.ovr = battingOvrOf(batting);");
    // 가중합을 손으로 다시 적은 자리가 없어야 한다
    expect(G.includes("* 2.5 +")).toBe(false);
  });
});
