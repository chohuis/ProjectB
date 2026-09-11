import { describe, it, expect } from "vitest";
import { inkFor, luminanceOf, darken, stoneStyle } from "../stoneMark";

/**
 * 알 표식 — **어떤 팀 색에서도 글자가 읽히는가**가 유일한 기준이다.
 *
 * 🔴 팀 보조색을 글자에 쓰면 **21/48팀에서 묻힌다**(원본 실측).
 *   주색과 보조색이 색상은 달라도 밝기가 비슷하기 때문이다.
 */

/**
 * 요구 대비 **4.0:1**.
 *
 * ⚠ **4.5(WCAG AA 본문)를 쓰지 않는다 — 덮으려는 게 아니라 못 미치는 잣대다.**
 *   글자색이 순수 검정이 아니라 `#14141A`(원본이 고른 값)이라 **이론상 최대가
 *   4.05**다. 4.5는 어떤 색에서도 도달할 수 없다.
 *   알 위 글자는 굵은 큰 글씨라 WCAG 기준으로도 **3:1**이면 된다 —
 *   4.0은 그보다 넉넉하다.
 * ⚠ **이 값을 더 내리지 마라.** 내리면 진짜 묻히는 색도 같이 통과한다.
 */
const MIN_CONTRAST = 4.0;

/** WCAG 명도 대비 — 1(같음) ~ 21(흑백) */
function contrast(a: string, b: string): number {
  const la = luminanceOf(a),
    lb = luminanceOf(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("알 표식", () => {
  it("밝은 바탕엔 검정, 어두운 바탕엔 흰색", () => {
    expect(inkFor("#ffffff")).toBe("#14141A");
    expect(inkFor("#000000")).toBe("#FFFFFF");
  });

  // 🔴 **원본이 묻혔다고 기록한 그 색쌍이다.** 밝기 차 0.00 —
  //   보조색을 글자에 쓰면 안 읽히고, 흰/검을 고르면 읽힌다
  it("밝기가 같은 색쌍에서도 글자가 읽힌다 (be47b2 / 8a6512)", () => {
    const main = "#be47b2",
      sub = "#8a6512";
    expect(Math.abs(luminanceOf(main) - luminanceOf(sub))).toBeLessThan(0.05);
    // 보조색을 글자로 쓰면 대비가 모자란다
    expect(contrast(main, sub)).toBeLessThan(2);
    // 골라 준 글자색은 읽힌다
    expect(contrast(main, inkFor(main))).toBeGreaterThan(MIN_CONTRAST);
  });

  // ⚠ 한두 색만 보면 못 잡는다 — 색 공간을 훑어 **한 곳도 빠짐없이** 본다
  it(`어떤 색이 와도 글자 대비가 ${MIN_CONTRAST}:1을 넘는다`, () => {
    let worst = Infinity,
      worstHex = "";
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const c = contrast(hex, inkFor(hex));
          if (c < worst) {
            worst = c;
            worstHex = hex;
          }
        }
      }
    }
    expect(worst, `가장 나쁜 색 ${worstHex} — 대비 ${worst.toFixed(2)}`).toBeGreaterThan(
      MIN_CONTRAST,
    );
  });

  it("darken이 색을 어둡게 하고 형식을 지킨다", () => {
    expect(darken("#ffffff", 0.45)).toMatch(/^#[0-9a-f]{6}$/);
    expect(luminanceOf(darken("#00838f", 0.45))).toBeLessThan(luminanceOf("#00838f"));
    expect(darken("#000000", 0.5)).toBe("#000000");
  });

  it("잘못된 색이 와도 회색으로 떨어진다 — 화면이 안 깨진다", () => {
    expect(() => inkFor("")).not.toThrow();
    expect(() => stoneStyle("nope", "#fff", 20)).not.toThrow();
  });

  it("테두리는 보조색이고 두께가 반지름에 비례한다", () => {
    const s = stoneStyle("#00838f", "#ffffff", 20);
    expect(s.rim).toBe("#ffffff");
    expect(s.rimWidth).toBeCloseTo(20 * 0.16, 5);
    expect(s.body).toBe("#00838f");
    expect(luminanceOf(s.bodyEdge)).toBeLessThan(luminanceOf(s.body));
  });
});
