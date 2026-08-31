import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INDIE_CAREER_HUB_WEEK,
  HS_CAREER_HUB_WEEK,
  UNIV_CAREER_HUB_WEEK,
  CAREER_RESULT_WEEK,
} from "../seasonWeeks";

/**
 * **아마추어 시즌이 끝나는 주차가 두 곳에 적혀 있다** (2026-08-31).
 *
 * `test-roster-balance.cjs` 는 CJS 라 TS 상수를 못 읽는다. 그래서 같은 값을
 * `SEASON_END_WEEK` 에 한 번 더 적었다 — **어긋나면 조용히 틀린다.**
 * 이 검사가 두 값을 묶는다.
 *
 * ## 🔴 왜 이 값이 필요했나
 *
 * 로스터 균형 검사의 판정 창이 전 리그 **W1~38** 이었다. 프로는 맞지만
 * 아마추어는 훨씬 일찍 끝난다:
 *
 * ```
 *   독립 W26 · 고교 W28 · 대학 W29   ←→   프로 W38
 * ```
 *
 * 그런데 `autoRun` 이 멈추는 자리가 `W0 → W32 → W40` 이라, 아마추어는
 * **시즌이 끝난 뒤인 W32 에서만** 측정됐다. 하필 W32 가
 * `CAREER_RESULT_WEEK` — **드래프트가 4학년을 데려가는 주**다.
 *
 * 주차별 실측(2026-08-31 · 씨앗 4개):
 *
 * ```
 *   2026W32 드래프트 전   야수11/투수8 · 포수0  0팀
 *   2026W32 드래프트 후   야수 8/투수6 · 포수0  4팀   ← 여기서만 나온다
 *   2026W40               야수 8/투수6 · 포수0  0팀   ← 다음 측정엔 없다
 *   4년 최소야수 추이      11 → 9 → 11 → 14           ← 돌아온다
 * ```
 *
 * `CLAUDE.md` 의 "결함인가 상황인가" 기준으로 **상황**이다. 고칠 것은
 * 로스터가 아니라 **재는 자리**였다.
 *
 * ⚠ 판정 창을 좁히기만 하면 대학은 표본이 **0건**이 된다 —
 *   `AMATEUR_SAMPLE_UNTIL` 까지 `oneWeek()` 으로 한 주씩 올라가는 쪽이
 *   같이 있어야 한다. 아래 세 번째 검사가 그 짝을 못박는다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const RB = readFileSync(resolve(ROOT, "scripts/test-roster-balance.cjs"), "utf8");

describe("아마추어 시즌 종료 주차", () => {
  it("검사가 적어 둔 값이 seasonWeeks.ts 와 같다", () => {
    expect(RB).toContain(`  INDEPENDENT: ${INDIE_CAREER_HUB_WEEK},`);
    expect(RB).toContain(`  HIGHSCHOOL:  ${HS_CAREER_HUB_WEEK},`);
    expect(RB).toContain(`  UNIVERSITY:  ${UNIV_CAREER_HUB_WEEK},`);
  });

  /**
   * 🔴 이게 깨지면 판정 창이 시즌보다 넓어져 **끝난 뒤를 재게 된다.**
   * 드래프트 주가 아마추어 시즌 안에 있으면 창을 좁혀도 소용이 없다.
   */
  it("드래프트 주는 아마추어 시즌이 다 끝난 뒤다", () => {
    expect(CAREER_RESULT_WEEK).toBeGreaterThan(INDIE_CAREER_HUB_WEEK);
    expect(CAREER_RESULT_WEEK).toBeGreaterThan(HS_CAREER_HUB_WEEK);
    expect(CAREER_RESULT_WEEK).toBeGreaterThan(UNIV_CAREER_HUB_WEEK);
  });

  /**
   * ⚠ **표본 주차가 셋 다의 시즌 안이어야 한다.** 밖이면 그 리그는 판정
   *   표본이 0건이 되고, 검사는 초록인데 아무것도 안 보는 상태가 된다.
   */
  it("표본 주차가 세 무대 모두의 시즌 안에 있다", () => {
    const line = RB.split("\n").find((l) => l.startsWith("const AMATEUR_SAMPLE_UNTIL"));
    expect(line).toBeDefined();
    const sample = Number(line!.split("=")[1].replace(";", "").trim());
    expect(Number.isFinite(sample)).toBe(true);
    expect(sample).toBeGreaterThan(0);
    expect(sample).toBeLessThan(INDIE_CAREER_HUB_WEEK);
    expect(sample).toBeLessThan(HS_CAREER_HUB_WEEK);
    expect(sample).toBeLessThan(UNIV_CAREER_HUB_WEEK);
  });

  /** 한 주씩 올라가는 갈래가 실제로 있어야 한다 — 없으면 위 검사가 다 무의미하다 */
  it("표본 주차까지 oneWeek 으로 올라간다", () => {
    expect(RB).toContain("if (before < AMATEUR_SAMPLE_UNTIL) {");
    expect(RB).toContain("await app.oneWeek();");
    // 막혔을 때 예전 경로로 돌아가는 안전장치 — 없으면 검사가 통째로 죽는다
    expect(RB).toContain("if (app.currentWeek() === before) await app.autoRun();");
  });

  /** 리그별로 창을 거르는 자리가 실제로 있어야 한다 */
  it("absorb 이 리그별 종료 주차로 거른다", () => {
    expect(RB).toContain("if (week != null && week > (SEASON_END_WEEK[lg] ?? 38)) continue;");
    expect(RB).toContain('absorb("시즌중", wkNow);');
  });
});
