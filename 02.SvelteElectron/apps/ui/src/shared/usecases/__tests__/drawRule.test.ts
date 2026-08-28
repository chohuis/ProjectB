import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **무승부 규칙** (2026-08-29 · 사용자 확정).
 *
 * 🔴 예전엔 무승부가 **구조상 안 나왔다.** `should_auto_finish`가
 *   `inning > limit && home != away`라 **승부가 날 때까지** 연장을 했고,
 *   `npc_sim`은 아예 **동전던지기로 승자를 만들었다.**
 *   그런데 TS는 처음부터 `loserId: string | null`로 무승부를 기다렸고
 *   `updateStandings`·`decide_pitcher`에 무승부 갈래가 **죽은 채로** 있었다.
 *
 * ⚠ **정규시즌만이다.** 대회·포스트시즌은 승자가 나와야 대진이 넘어간다 —
 *   `phase !== "season"`이면 상한 0(무제한)이다.
 *
 * 실측: 연장 무제한 무승부 0/300 → 12회 상한 4/300. 실제 게임 20,011판정에서
 * 0.05%. ⚠ KBO 실제는 약 4%다 — **밸런스 단계에서 볼 일**로 남긴다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("무승부 규칙", () => {
  const ME = read("packages/engine-native/src/match_engine.rs");
  const NS = read("packages/engine-native/src/npc_sim.rs");
  const ST = read("packages/engine-native/src/sim_types.rs");
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");

  it("엔진이 연장 상한을 본다", () => {
    expect(read("packages/engine-native/src/types.rs")).toContain("pub extra_inning_limit: u8");
    expect(ME).toContain("state.extra_inning_limit > 0 && state.inning > state.extra_inning_limit");
  });

  /** 🔴 동점이면 홈 승으로 적고 있었다 */
  it("동점을 홈 승으로 적지 않는다", () => {
    expect(ME.includes("if home >= away { (home_team_id, away_team_id) }")).toBe(false);
    expect(ME).toContain("if home == away { (\"\", None) }");
    expect(ST).toContain("pub loser_id: Option<String>");
  });

  /** 🔴 없는 점수를 지어내고 있었다 */
  it("동전던지기로 승자를 만들지 않는다", () => {
    expect(NS.includes("if rng.gen::<f64>() < 0.5 { home_score += 1; }")).toBe(false);
    expect(NS).toContain("let is_draw   = home_score == away_score;");
  });

  /** ⚠ 대회·포스트시즌이 무승부로 끝나면 대진이 못 넘어간다 */
  it("정규시즌에만 상한을 건다", () => {
    expect(GS).toContain('phase === "season" ? EXTRA_INNING_LIMIT : 0');
    expect(GS).toContain("export const EXTRA_INNING_LIMIT = 12;");
  });

  /** 🔴 한 층이라도 phase 를 안 실으면 그 경로만 무승부가 안 난다 */
  it("모든 경로가 phase 를 싣는다", () => {
    expect(GS).toContain("extraInningLimit: params.extraInningLimit ?? 0");
    expect(read("apps/ui/src/shared/workers/simWorker.ts")).toContain("phase:       g.phase");
    expect(read("apps/ui/src/shared/stores/backgroundLeague.ts")).toContain("phase:                g.phase");
    expect(read("apps/ui/src/shared/stores/backgroundLeague.ts")).toContain("phase: e.phase");
    const AW = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(AW.split("phase: game.phase").length - 1).toBe(3);
  });
});
