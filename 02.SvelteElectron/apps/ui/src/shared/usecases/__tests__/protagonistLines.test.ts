import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **주인공 경기 기록이 엔진에서 오는가** (2026-08-28).
 *
 * 🔴 `finish_match`가 `player_lines`를 **아예 안 만들었다.** `FinishMatchResult`에
 *   그 필드가 없었고 `collect_player_lines`는 리그 경로에서만 불렸다.
 *   `match.cjs`는 세 자리에서 `result.playerLines ?? []`로 받고 있었으므로
 *   **주인공 경기는 늘 빈 배열**이었다. 파급이 셋:
 *
 *     ① 화면이 자책점을 `피안타 × 0.35`로 되돌아가 지어냈다
 *     ② `applyGameOutcome`이 빈 배열을 보고 **경기를 한 판 더 돌려서**
 *        그 결과를 동료·상대 성적에 넣었다 — 화면에서 본 경기와 다른 경기다
 *     ③ 동료·상대의 2루타·득점·사구가 구 `batterLines`로만 왔다
 *
 * 실측(씨앗 777 · 주인공 40경기): 엔진줄 0% → **100%** · 재시뮬 40건 → **0건** ·
 * 자책 합계 134 (옛 역산이었으면 92 — **46% 낮았다**)
 *
 * ⚠ **주인공 줄은 `playerLines`에 없다.** 엔진이 등판 중엔 큐 누적을 건너뛰고
 *   `*_since_entry`에 따로 쌓기 때문이다. 그래서 자책점은 `erSinceEntry`로
 *   따로 받고, 주인공 줄은 **합친다** — 갈아치우면 주인공 기록이 사라진다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 경기 기록", () => {
  const ME  = read("packages/engine-native/src/match_engine.rs");
  const TY  = read("packages/engine-native/src/types.rs");
  const CJS = read("apps/desktop/ipc/match.cjs");
  const MP  = read("apps/ui/src/pages/match/MatchPage.svelte");
  const AGO = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");

  it("엔진이 경기 종료에서 player_lines를 만든다", () => {
    expect(TY).toContain("pub player_lines: Vec<crate::sim_types::PlayerGameLine>");
    expect(ME).toContain("player_lines: collect_player_lines(state)");
    expect(ME).toContain("let player_lines = collect_player_lines(&next);");
  });

  /** ⚠ 리그 경기와 **같은 함수**여야 한다 — 두 벌이면 주인공만 다른 기록을 갖는다 */
  it("리그 경기와 같은 함수를 쓴다", () => {
    const n = ME.split("fn collect_player_lines").length - 1;
    expect(n, "collect_player_lines 정의가 둘 이상이다").toBe(1);
  });

  /** 🔴 주인공 자책점은 `erSinceEntry`다 — 안 돌려주면 화면이 지어낸다 */
  it("경기 종료가 주인공 자책점을 돌려준다", () => {
    expect(CJS).toContain("earnedRuns: activeMatchState?.erSinceEntry ?? 0");
  });

  it("화면이 엔진 자책점을 먼저 본다", () => {
    expect(MP).toContain("typeof engineEarnedRuns === \"number\"");
    // 역산은 **마지막 폴백으로만** 남는다
    const at = MP.indexOf("const runsAllowed =");
    expect(at).toBeGreaterThan(0);
    const body = MP.slice(at, at + 400);
    expect(body.indexOf("engineEarnedRuns"))
      .toBeLessThan(body.indexOf("totalHitsAllowed * 0.35"));
  });

  it("직접 플레이 경기도 자책점을 넘긴다", () => {
    // 🔴 안 넘겨서 받는 쪽이 다시 역산했다 — 자동 진행만 넘기고 있었다
    expect(MP).toContain("earnedRuns: gameResult.runsAllowed");
    expect(read("apps/ui/src/shared/usecases/runAutoAdvance.ts")).toContain("earnedRuns");
  });

  /**
   * 🔴 **주인공 줄을 갈아치우지 않는다.** 엔진 줄엔 주인공이 없으므로
   *   교체하면 주인공 기록이 통째로 사라진다.
   */
  it("주인공 줄을 엔진 줄과 합친다", () => {
    expect(AGO.includes("? outcome.playerLines\n")).toBe(false);
    expect(AGO).toContain("engineLines.filter((l) => l.playerId !== protagonist.id)");
    expect(AGO).toContain("...(pitcherLine ? [pitcherLine] : []),");
  });

  /** ⚠ 엔진 줄이 있으면 **경기를 다시 돌리지 않는다** */
  it("엔진 줄이 있으면 재시뮬하지 않는다", () => {
    expect(AGO).toContain("if (!hasEngineLines) {");
  });

  /** ⚠ 선언이 현실보다 뒤처지면 화면이 값을 못 읽는다 */
  it("타입 선언이 자책점을 안다", () => {
    expect(read("apps/ui/src/shared/types/projectb.d.ts")).toContain("earnedRuns?: number;");
  });
});
