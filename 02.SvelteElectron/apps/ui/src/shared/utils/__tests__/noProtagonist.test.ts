import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **리그 경기 홈 마운드에 기본값 투수가 서 있었다** (2026-08-31).
 *
 * 🔴 `role: "SP"` 면 엔진이 `is_immediate` 로 **1구부터 주인공을 세운다.**
 * 리그 시뮬은 주인공이 없어 `pitcher` 를 안 넘기니 그 자리에 기본값
 * (50/52/55…)이 섰고, **홈 투수 큐는 한 번도 안 탔다.**
 *
 * `simulateWithMatchEngine` 의 주석이 *"양쪽 다 NPC라 큐 두 개로 전부
 * 처리된다"* 고 적고 있었는데 **홈 쪽이 그 전제를 안 지켰다.**
 *
 * 실측 — 같은 로스터끼리 400경기 × 씨앗 셋 (`scratchpad/repro`):
 * ```
 *   없음         홈 승률 33.0 / 36.0 / 32.3 %   득점 홈 4.75 / 원정 6.92
 *   true         홈 승률 43.3 / 47.5 / 50.2 %        홈 4.28 / 원정 4.88
 * ```
 * 시즌 계측(KBL 1시즌 × 씨앗 셋):
 * ```
 *   없음   타율 .310 / .307 / .304   규정투수 57 / 55 / 55
 *   true   타율 .266 / .243 / .264   규정투수 65 / 58 / 63
 * ```
 * ⚠ 타율이 .045 내려가 KBO 범위(.260~.280)에 들어왔다. **밸런스 조정이
 *   아니라 배선 결함이었다.** 규정투수가 는 건 홈 투수의 이닝이 이제
 *   리그 집계에 올라오기 때문이다 — 예전엔 통째로 빠져 있었다.
 *
 * ⚠ 남은 47% 언저리는 **주인공과 무관하다** — 주인공을 원정에 둬도 같다.
 *   엔진에 홈 이점이 아예 없는 것이고 그건 따로 볼 일이다(실제 54%).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 없는 경기 — 배선", () => {
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");
  const TY = read("packages/engine-native/src/types.rs");
  const ME = read("packages/engine-native/src/match_engine.rs");

  /** 🔴 `serde(default)` 라 빠뜨려도 오류가 안 난다 — 여기가 유일한 문지기다 */
  it("리그 시뮬이 주인공 없음을 넘긴다", () => {
    expect(GS).toContain("noProtagonist: true,");
  });

  it("엔진이 그 값을 받아 상태에 싣는다", () => {
    expect(TY).toContain("pub no_protagonist: Option<bool>");
    expect(TY).toContain("pub no_protagonist: bool");
    expect(ME).toContain("let no_protagonist = opts.no_protagonist.unwrap_or(false);");
  });

  /**
   * ⚠ **갈래가 둘이다.** 시작(`is_immediate`)만 막으면 `entry_trigger` 가
   *   나중에 불러들여 5~6회에 기본값 투수가 등판한다.
   */
  it("시작과 도중 등판을 둘 다 막는다", () => {
    expect(ME).toContain("let is_immediate = !no_protagonist");
    expect(ME).toContain("if state.no_protagonist { return false; }");
  });

  /** ⚠ 안 넘기면 예전과 완전히 같다 — `tuning.cjs` 는 기본값 주인공이 의도다 */
  it("기본값은 예전 동작이다", () => {
    expect(ME).toContain("opts.no_protagonist.unwrap_or(false)");
  });

  /**
   * 🔴 **추론으로 끄지 않는다.** `pitcher` 가 없으면 주인공도 없다고
   * 넘겨짚으면 `tuning.cjs` 가 죽는다 — 거긴 일부러 합성 주인공을 돌린다.
   */
  it("pitcher 유무로 추론하지 않는다", () => {
    expect(ME).not.toContain("opts.pitcher.is_none()");
  });
});
