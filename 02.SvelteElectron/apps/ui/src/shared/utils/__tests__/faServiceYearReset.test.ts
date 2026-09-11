import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canReacquireFa, FA_REACQUIRE_YEARS } from "../faEngine";

/**
 * FA를 신청해도 통산 연차는 안 줄어든다.
 *
 * 🔴 `market.ts`가 FA 신청 시 `proServiceYears: 0`을 넣고 있었다. 그 값은
 *    **연봉 산식의 입력**이라(`estimate_salary_and_contract`) 신청한 순간
 *    몸값이 신인 수준으로 떨어졌다.
 *
 *    Rust는 이미 고쳐져 있었고 그 주석이 증상까지 적어 뒀다 —
 *    "리셋해서 7년차 이상이 157명 → 0명". **TS 경로만 남아 있었다.**
 *
 *    실측(씨앗 20260731 · 한 시즌): KBL 1군 7년차+ 45% → 5%,
 *    리셋을 빼면 16%. 같은 사람 90명이 평균 9.3년을 잃었다.
 */
const MARKET = readFileSync(join(__dirname, "../../usecases/weekPhases/market.ts"), "utf8");

describe("FA 신청이 통산 연차를 지우지 않는다", () => {
  it("`proServiceYears: 0`으로 되돌리는 코드가 없다", () => {
    expect(MARKET, "FA 신청에서 연차를 0으로 리셋하는 코드가 살아 있다").not.toMatch(
      /proServiceYears:\s*0\s*,/,
    );
  });

  it("리셋 대신 재취득 기간을 본다", () => {
    expect(MARKET, "canReacquireFa 판정이 없다 — 리셋을 빼면 매년 FA가 된다").toMatch(
      /canReacquireFa\(/,
    );
  });

  it("Rust의 FA_REACQUIRE_YEARS와 값이 같다", () => {
    const rust = readFileSync(
      join(__dirname, "../../../../../../packages/engine-native/src/npc_sim.rs"),
      "utf8",
    );
    const m = rust.match(/const FA_REACQUIRE_YEARS:\s*i32\s*=\s*(\d+)/);
    expect(m, "Rust 상수를 못 찾았다 — 이름이 바뀌었으면 이 검사도 같이 고친다").toBeTruthy();
    expect(FA_REACQUIRE_YEARS).toBe(Number(m![1]));
  });
});

describe("canReacquireFa", () => {
  it("기록이 없으면 첫 취득이라 통과한다", () => {
    expect(canReacquireFa(undefined, 2030)).toBe(true);
    expect(canReacquireFa([], 2030)).toBe(true);
  });

  it("다른 사건은 재취득을 막지 않는다", () => {
    expect(canReacquireFa([{ year: 2029, eventType: "trade" }], 2030)).toBe(true);
  });

  it("마지막 취득으로부터 4년이 지나야 다시 신청한다", () => {
    const ev = [{ year: 2026, eventType: "fa_signed" }];
    expect(canReacquireFa(ev, 2029)).toBe(false);
    expect(canReacquireFa(ev, 2030)).toBe(true);
  });

  it("가장 **나중** 취득을 본다 — 여러 번 얻었어도", () => {
    const ev = [
      { year: 2020, eventType: "fa_signed" },
      { year: 2028, eventType: "fa_signed" },
    ];
    expect(canReacquireFa(ev, 2030)).toBe(false);
    expect(canReacquireFa(ev, 2032)).toBe(true);
  });
});
