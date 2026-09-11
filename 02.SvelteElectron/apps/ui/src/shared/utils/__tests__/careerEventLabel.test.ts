import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { careerEventLabel, KNOWN_CAREER_EVENTS } from "../careerEventLabel";

/**
 * 커리어 이벤트 이름 — **코드가 화면에 새지 않는가.**
 *
 * 🔴 실플에서 `foreign_signing`이 그대로 떴다(2026-08-26). 번역이 화면마다
 *   따로 있었고 **폴백이 원문**이라, 표에 없는 유형은 영어로 나왔다.
 */

describe("커리어 이벤트 이름", () => {
  it("아는 유형은 한국어로 나온다", () => {
    expect(careerEventLabel("foreign_signing")).toBe("용병 영입");
    expect(careerEventLabel("draft_picked")).toBe("드래프트 지명");
  });

  // 🔴 코드가 그대로 나오면 안 된다
  it("모르는 유형도 밑줄이 안 보인다", () => {
    expect(careerEventLabel("some_new_type")).toBe("some new type");
    expect(careerEventLabel("some_new_type")).not.toContain("_");
  });

  /**
   * 🔴 **엔진이 내는 유형을 표가 다 아는가.**
   *
   * ⚠ 목록을 손으로 적지 않는다 — Rust 소스에서 `ev("...")`를 긁는다.
   *   적으면 엔진이 유형을 늘릴 때 어긋나고, 그러면 이 검사가 검사를 안 하게 된다.
   */
  it("Rust가 내는 유형을 전부 안다", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../../../packages/engine-native/src/npc_sim.rs"),
      "utf8",
    );
    const emitted = new Set([...src.matchAll(/\bev(?:_to)?\("([a-z_]+)"/g)].map((m) => m[1]));
    expect(
      emitted.size,
      "Rust에서 이벤트 유형을 하나도 못 읽었다 — 정규식이 소스와 어긋났다",
    ).toBeGreaterThan(3);
    const unknown = [...emitted].filter((t) => !KNOWN_CAREER_EVENTS.includes(t));
    expect(unknown, `표에 없는 유형: ${unknown.join(", ")}`).toEqual([]);
  });

  /**
   * 🔴 **위 검사에 사각지대가 있었다 — Rust만 본다.**
   *
   * `military_exempt`(game.ts) · `graduation`(careerDecision.ts) 는 TS 가
   * 내는데 표에 없었고, Rust 소스엔 없으니 위 검사가 통과했다. 은퇴 결산에
   * 그대로 "military exempt" 라고 뜰 자리였다(2026-09-01).
   *
   * ⚠ 여기도 목록을 손으로 적지 않는다 — `NpcCareerEventType` 유니온을 긁는다.
   */
  it("TS 타입이 정의한 유형을 전부 안다", () => {
    const src = readFileSync(resolve(__dirname, "../../types/save.ts"), "utf8");
    const union = src.match(/export type NpcCareerEventType =([\s\S]*?);/)?.[1] ?? "";
    const declared = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(declared.length, "유니온을 못 읽었다 — 정규식이 타입 선언과 어긋났다").toBeGreaterThan(
      5,
    );
    const unknown = declared.filter((t) => !KNOWN_CAREER_EVENTS.includes(t));
    expect(unknown, `표에 없는 유형: ${unknown.join(", ")}`).toEqual([]);
  });
});
