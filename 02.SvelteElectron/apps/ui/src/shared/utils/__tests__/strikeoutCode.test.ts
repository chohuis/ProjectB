import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flashLabel, isStrike, isStrikeout, type PitchResultCode } from "../matchResult";

/**
 * **삼진이 삼진이라고 나오는가.**
 *
 * 🔴 실플에서 3스트라이크째에 "루킹"만 떴다(2026-08-26). 투구 결과 코드에
 *   **삼진 자체가 없어서** `STRIKE_LOOK`("이 공이 스트라이크")이 그대로
 *   화면까지 갔다 — 타자가 물러난 것을 말할 방법이 없었다.
 *
 * ⚠ 인플레이 아웃이 넷으로 쪼개진 것과 같은 구조다. 그때 배운 것:
 *   **코드를 늘리면 빠뜨리는 자리가 생긴다.** 그래서 여기서 다 훑는다.
 */

describe("삼진 코드", () => {
  it("삼진은 '삼진 아웃'이라고 나온다 — '루킹'이 아니다", () => {
    expect(flashLabel("STRIKEOUT_LOOK")).toBe("삼진 아웃");
    expect(flashLabel("STRIKEOUT_SWING")).toBe("삼진 아웃");
  });

  it("스트라이크 하나는 그대로다 — 기존 문구를 안 깼다", () => {
    expect(flashLabel("STRIKE_LOOK")).toBe("루킹");
    expect(flashLabel("STRIKE_SWING")).toBe("헛스윙");
  });

  // 🔴 여기 빠지면 **마지막 스트라이크가 카운트에서 사라진다**
  it("삼진도 스트라이크로 센다", () => {
    expect(isStrike("STRIKEOUT_LOOK")).toBe(true);
    expect(isStrike("STRIKEOUT_SWING")).toBe(true);
  });

  it("삼진만 삼진이다", () => {
    expect(isStrikeout("STRIKEOUT_LOOK")).toBe(true);
    expect(isStrikeout("STRIKE_LOOK")).toBe(false);
    expect(isStrikeout("GROUND_OUT")).toBe(false);
  });

  /**
   * 🔴 **엔진과 화면이 같은 코드를 아는가.**
   *
   * ⚠ 목록을 손으로 적지 않는다 — Rust `types.rs`의 `serde(rename)`을 긁는다.
   *   적으면 엔진이 코드를 늘릴 때 어긋나고, 그때 화면은 **아무 말 없이**
   *   그 코드를 못 알아본다.
   */
  it("Rust가 내는 결과 코드를 화면이 전부 안다", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../../../packages/engine-native/src/types.rs"), "utf8");
    const at = src.indexOf("pub enum PitchResultCode");
    expect(at, "PitchResultCode를 못 찾았다").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}", at));
    const codes = [...body.matchAll(/rename = "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(codes.length, "코드를 하나도 못 읽었다 — 정규식이 소스와 어긋났다")
      .toBeGreaterThan(10);
    const unknown = codes.filter((c) => flashLabel(c as PitchResultCode) === c);
    expect(unknown, `화면이 모르는 코드: ${unknown.join(", ")}`).toEqual([]);
  });
});
