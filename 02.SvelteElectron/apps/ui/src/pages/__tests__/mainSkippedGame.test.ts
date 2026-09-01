import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 등판 회피 — **회피해도 나머지 선수 기록은 남는다.** (2026-09-01)
 *
 * 🔴 예전엔 `weekCalcNpcFallback`(점수 넷)을 부르고 `playerLines: []` 로
 *    감쌌다. 점수는 나오고 순위도 오르는데 그 경기 기록만 통째로 없었다 —
 *    순위표로는 안 보이고, 회피를 자주 쓰면 시즌 성적이 조용히 빈다.
 *
 * usecase 는 A 가 만들었고(`simulateSkippedGame`), 화면 배선이 C 몫이다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../main/MainPage.svelte"), "utf8");
const SKIP = SRC.slice(SRC.indexOf('class="cond-btn skip"'));

describe("회피 갈래", () => {
  it("진짜 시뮬을 먼저 부른다", () => {
    expect(SRC, "simulateSkippedGame 을 import 안 했다")
      .toMatch(/import \{ simulateSkippedGame \}/);
    expect(SKIP, "회피 갈래가 usecase 를 안 부른다")
      .toMatch(/await simulateSkippedGame\(schedId\)/);
  });

  /**
   * ⚠ **폴백을 지우면 안 된다.** 로스터가 비면 시뮬이 여전히 실패하고
   *   (`null`), 그때는 점수라도 나와야 일정이 안 막힌다.
   */
  it("폴백을 지우지 않았다", () => {
    expect(SKIP, "weekCalcNpcFallback 을 지웠다 — 로스터가 비면 일정이 막힌다")
      .toMatch(/weekCalcNpcFallback/);
  });

  it("빈 playerLines 는 폴백 갈래에만 남는다", () => {
    // 시뮬이 성공했으면 sim.result 를 그대로 쓴다 — 다시 감싸지 않는다
    expect(SKIP).toMatch(/matchResult = sim\?\.result/);
  });

  /**
   * 🔴 **정규 갈래가 `rot` 을 안 넘기고 있었다.** 친선은 넘기는데 여기만
   *    빠져서, 회피한 정규경기는 로테이션도 피로도 안 올랐다.
   *    이 경로는 `syncProtagonistLeagueResult` 를 안 타므로
   *    (그건 `applyGameOutcome` 전용) 이중 적용이 아니다.
   */
  it("정규 갈래도 로테이션·피로를 넘긴다", () => {
    const call = SKIP.slice(SKIP.indexOf("applyMatchResult"));
    expect(call, "applyMatchResult 에 rot 을 안 넘긴다")
      .toMatch(/nextHomeRotIdx/);
    expect(call).toMatch(/pitcherConditions/);
  });
});
