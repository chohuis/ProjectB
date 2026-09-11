import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logLabel, logClass, isOutInPlay } from "../matchResult";

/**
 * 삼중살 — 2단계 (2026-08-30).
 *
 * ⚠ **병살 판정 안에서 갈린다.** 따로 만들면 두 판정이 같은 타구를 두 번
 *   보고, 병살이 난 뒤 삼중살이 또 난다.
 *
 * 🔴 **`bool` 로는 표현이 안 됐다.** `try_double_play` 가 참/거짓만 돌려줘서
 *   아웃이 둘만 올라갔다 — 삼중살인데 이닝이 안 끝난다. 몇 명이 죽었는지를
 *   돌려주게 바꿨다(0·2·3).
 *
 * ⚠ 병살과 같이 다뤄야 하는 자리가 넷이다(아웃 판정·멘탈·타수·히트앤런).
 *   하나만 빠뜨려도 죽은 갈래가 된다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s
    .split("\n")
    .filter((ln) => !ln.trimStart().startsWith("//"))
    .join("\n");

describe("삼중살 엔진", () => {
  const me = read("packages/engine-native/src/match_engine.rs");
  const ty = read("packages/engine-native/src/types.rs");
  const tu = read("packages/engine-native/src/tuning.rs");

  it("결과 코드가 있다", () => {
    expect(ty.includes('#[serde(rename = "TRIPLE_PLAY")]    TriplePlay,')).toBe(true);
  });

  it("🔴 몇 명이 죽었는지 돌려준다 — bool로는 아웃이 둘만 올라간다", () => {
    expect(me.includes(") -> (u8, MatchRunners) {")).toBe(true);
    expect(me.includes("                next_outs += killed - 1;")).toBe(true);
  });

  it("🔴 병살 판정 안에서 갈린다", () => {
    // 따로 판정하면 병살이 난 뒤 삼중살이 또 난다
    expect(me.includes("    if outs_before == 0 && on_base >= 2")).toBe(true);
    expect(me.includes("        && rng.gen::<f64>() < T::TRIPLE_PLAY_FROM_DP")).toBe(true);
  });

  it("주자가 다 죽는다", () => {
    expect(
      me.includes("        return (3, MatchRunners { first: None, second: None, third: None });"),
    ).toBe(true);
  });

  it("드문 사건이다 — 실제 KBO는 시즌 0~2건", () => {
    expect(tu.includes("pub const TRIPLE_PLAY_FROM_DP: f64 = 0.02;")).toBe(true);
  });

  it("🔴 병살과 같이 다뤄야 하는 자리 넷", () => {
    const code = stripComments(me);
    // ① 아웃으로 센다
    expect(code.includes("PitchResultCode::DoublePlay | PitchResultCode::TriplePlay)")).toBe(true);
    // ② 멘탈 — 아웃 셋이라 병살보다 크다
    expect(code.includes("PitchResultCode::TriplePlay  =>  2.4,")).toBe(true);
    // ③ 타수
    expect(code.includes("DoublePlay | TriplePlay | FieldingError => { b.ab += 1; }")).toBe(true);
    // ④ 히트앤런이 낮춘다 — 안 그러면 작전을 걸고도 주자 둘이 죽는다
    expect(code.includes("PitchResultCode::DoublePlay | PitchResultCode::TriplePlay => {")).toBe(
      true,
    );
  });
});

describe("삼중살 화면", () => {
  it("큰 글자 이름이 있다", () => {
    // ⚠ `FLASH_LABEL` 은 내보내지 않는 상수라 소스로 확인한다 —
    //   `Record<PitchResultCode, string>` 이라 빠지면 tsc 가 먼저 잡는다
    const src = read("apps/ui/src/shared/utils/matchResult.ts");
    expect(src.includes('DOUBLE_PLAY: "병살!", TRIPLE_PLAY: "삼중살!!",')).toBe(true);
  });

  it("아웃 목록에 든다 — 안 들면 타석이 안 끝난다", () => {
    expect(isOutInPlay("TRIPLE_PLAY")).toBe(true);
  });

  it("수비 위치를 붙여 읽는다", () => {
    const label = logLabel("TRIPLE_PLAY", {
      hitType: "groundBall",
      zone: "SS",
      hardness: 3,
    } as never);
    expect(label.includes("삼중살")).toBe(true);
    expect(label).not.toBe("삼중살!!"); // 위치가 붙었다
  });

  it("타구 정보가 없으면 지어내지 않는다", () => {
    expect(logLabel("TRIPLE_PLAY")).toBe("삼중살!!");
  });

  it("병살과 같은 색이다 — 아웃 색이 아니다", () => {
    expect(logClass("TRIPLE_PLAY")).toBe("log-dp");
    expect(logClass("TRIPLE_PLAY")).toBe(logClass("DOUBLE_PLAY"));
  });
});
