import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FA_INTEREST_MIN } from "../faEngine";

/**
 * **주인공 FA가 제비뽑기를 벗어났는가.**
 *
 * 🔴 `player_engine.rs`가 `rng.gen_range(3..=5)`로 팀을 뽑고 있었다 —
 *   OVR 60이든 90이든 제안이 3~5개고, **팀이 필요해서 부르는 게 아니었다.**
 *
 * 🔴 **NPC는 이미 제대로 돈다.** `team_engine::eval_fa_bid`가 정원·OVR·
 *   성향×나이·예산을 본다. **주인공만 그 판정을 안 탔다** — 이번에 붙였다.
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const RUST = read("packages/engine-native/src/player_engine.rs");
const TS = read("apps/ui/src/shared/utils/faEngine.ts");

describe("주인공 FA 관심도 판정", () => {
  it("문턱이 켜져 있다 — 0이면 예전 제비뽑기로 떨어진다", () => {
    expect(FA_INTEREST_MIN).toBeGreaterThan(0);
  });

  // 🔴 이게 이번에 붙인 것이다
  it("Rust가 팀별로 eval_fa_bid를 부른다", () => {
    expect(RUST.includes("team_engine::eval_fa_bid")).toBe(true);
    expect(RUST.includes("bid.interest_level >= params.interest_min")).toBe(true);
  });

  it("TS가 판정에 필요한 값을 넘긴다", () => {
    expect(TS.includes("interestMin:")).toBe(true);
    expect(TS.includes("proServiceYears:")).toBe(true);
    expect(TS.includes("age:")).toBe(true);
  });

  /**
   * ⚠ **예전 경로를 지우지 않았다.** 호출부가 값을 안 넘기면(`interest_min` 0)
   *   조용히 옛 길로 떨어진다 — 배선이 빠졌을 때 게임이 안 죽는다.
   *   ⚠ 이건 죽은 갈래가 아니라 **폴백**이다. 그 뜻을 검사로 남긴다.
   */
  it("판정이 꺼져 있으면 예전 동작으로 떨어진다", () => {
    expect(RUST.includes("params.interest_min > 0.0")).toBe(true);
    expect(RUST.includes("rng.gen_range(3..=5usize)")).toBe(true);
  });

  /**
   * 🔴 **`roster_needs`를 실제로 넘긴다** — 그게 "팀이 필요해서 부른다"는 것 자체다.
   *
   * ⚠ 처음엔 `Vec::new()`로 비웠다. 그러면 모든 팀이 **같은 관심도**를 받아
   *   문턱이 전부/전무로 갈렸다 — 실측(2026-08-27):
   *       문턱 40 → 평균 16.9개(전부 통과) · 문턱 45 → 평균 1.1개(KBL 0)
   *   그 사이에 값이 없다. 관심도가 이산값이라 그렇다.
   */
  it("얇은 자리를 판정에 넘긴다", () => {
    expect(RUST.includes("roster_needs: team.roster_needs.clone()")).toBe(true);
    expect(RUST.includes("roster_needs: Vec::new()")).toBe(false);
    expect(TS.includes("rosterNeeds: rosterNeedsOf(")).toBe(true);
  });

  /**
   * ⚠ **팀 사정을 안 넘기면 판정이 헛돈다.** 예전엔 `id`와 `leagueId`뿐이라
   *   Rust가 성향·예산·정원을 전부 기본값으로 봤다.
   */
  it("성향·예산도 함께 넘긴다", () => {
    expect(TS.includes("profile: teamProfileOf(")).toBe(true);
    expect(TS.includes("currentPayroll: payrollOf(")).toBe(true);
    expect(TS.includes("salaryCap: salaryCapOf(")).toBe(true);
  });

  /**
   * ⚠ **NPC와 같은 잣대를 써야 한다.** Rust `npc_sim`의 NPC FA가
   *   `at_pos <= 1`로 얇은 자리를 본다 — 주인공만 다른 기준이면 유불리가 생긴다.
   */
  it("얇은 자리 기준이 NPC와 같다", () => {
    expect(TS.includes("atPos <= 1")).toBe(true);
  });
});
