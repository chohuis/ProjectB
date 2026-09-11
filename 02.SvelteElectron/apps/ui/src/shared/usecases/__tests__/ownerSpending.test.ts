import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **구단주 성향이 재계약 제시액을 탄다** (2026-09-01 · 감사 C-3).
 *
 * ## 🔴 무엇이 죽어 있었나
 *
 * 구단 성향 12축 중 `ownerSpendingWillingness` **하나만** 아무 데서도
 * 안 읽혔다. Rust 전체에서 그 축을 읽는 자리가 하나뿐이었고
 * (`team_engine::base_contract_offer`) 그 함수의 TS 호출부가 **0건**이었다.
 *
 * 같이 죽어 있던 것 셋 — 전부 지웠다:
 *
 * ```
 *   team_engine::eval_renewal_offer        호출부 0건
 *   team_engine::eval_new_contract         호출부 0건
 *   player_agent::player_eval_contract_offer  호출부 0건
 * ```
 *
 * 앞의 둘은 살아 있는 `calc_npc_renewal_salary` 와 **같은 일**을 했다 —
 * 같은 세계에 연봉 산식이 둘인 형태다.
 *
 * ## 배선은 한 줄이었다
 *
 * 호출부(`market.ts` 재계약 갈래)가 **이미 프로필을 손에 쥐고 있었다.**
 * 바로 옆 `calcNpcContractYearsNative` 에는 성향 둘을 넘기는데
 * **연봉 쪽에만 안 넘겼다.**
 *
 * ## ⚠ 실측 — 절반은 상·하한이 삼킨다
 *
 * 3시즌 재계약 228건:
 *
 * ```
 *   상한 43(19%) · 하한 81(36%) · 안쪽 104(46%)
 *   KBL 67건  상한 25(37%) · 하한 13(19%)
 *   ABL 83건  상한 10(12%) · 하한 40(48%)
 *   JBL 78건  상한  8(10%) · 하한 28(36%)
 * ```
 *
 * `market * 0.55 ~ 1.35` 밖으로 밀린 선수는 **성향뿐 아니라 성적·greed·
 * 나이 축도 안 보인다.** 상·하한을 손대는 건 밸런스라 이번엔 안 건드렸다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("구단주 성향 배선", () => {
  const M = read("apps/ui/src/shared/usecases/weekPhases/market.ts");

  it("재계약이 구단주 성향을 넘긴다", () => {
    expect(M).toContain("ownerSpendingWillingness: profile.ownerSpendingWillingness,");
  });

  /**
   * ⚠ **같은 자리에서 프로필을 읽어야 한다.** 다른 데서 가져오면
   *   연수와 연봉이 서로 다른 팀의 성향을 볼 수 있다.
   */
  it("연수와 같은 프로필을 쓴다", () => {
    expect(M).toContain(
      "const profile = getTeamProfile(npc.currentTeam, g, m) ?? DEFAULT_TEAM_PROFILE;",
    );
    expect(M).toContain("developmentFocus:    profile.developmentFocus,");
  });

  /** Rust 쪽이 필드를 실제로 받는지 — 한쪽만 있으면 조용히 무시된다 */
  it("엔진이 그 필드를 받는다", () => {
    const P = read("packages/engine-native/src/player_engine.rs");
    expect(P).toContain("pub owner_spending_willingness: Option<f64>,");
    expect(P).toContain("let raw = blend * perf * greed * age_damp * owner;");
  });

  /**
   * 🔴 **죽은 갈래를 안 남긴다.** 셋 다 지웠으니 다시 생기면 잡는다 —
   *   되살릴 거면 호출부를 같이 만들어야 한다.
   */
  it("죽어 있던 계약 함수 셋이 사라졌다", () => {
    const T = read("packages/engine-native/src/team_engine.rs");
    const A = read("packages/engine-native/src/player_agent.rs");
    const L = read("packages/engine-native/src/lib.rs");
    expect(T).not.toContain("pub fn eval_renewal_offer(");
    expect(T).not.toContain("pub fn eval_new_contract(");
    expect(A).not.toContain("pub fn player_eval_contract_offer(");
    expect(L).not.toContain("eval_renewal_offer_native");
    expect(L).not.toContain("player_eval_contract_offer_native");
    // preload 브릿지도 같이 지웠다 — 남으면 없는 함수를 부르게 된다
    const PL = read("apps/desktop/preload.cjs");
    expect(PL).not.toContain("evalRenewalOfferNative");
    expect(PL).not.toContain("playerEvalContractOfferNative");
  });

  /** 생성된 타입 선언에서도 사라져야 한다 — 남으면 호출이 컴파일된다 */
  it("생성된 index.d.ts 에도 안 남았다", () => {
    const dts = resolve(ROOT, "packages/engine-native/index.d.ts");
    if (!existsSync(dts)) return; // 빌드 전이면 건너뛴다
    const D = readFileSync(dts, "utf8");
    expect(D).not.toContain("evalRenewalOfferNative");
    expect(D).not.toContain("playerEvalContractOfferNative");
  });
});
