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
    expect(GS).toContain('(phase === "season" && !knockout) ? EXTRA_INNING_LIMIT : 0');
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

  /**
   * 🔴 **넉아웃은 `phase` 로 못 가른다** (2026-09-06).
   *
   * 대회 본선 경기도 `phase` 가 `"season"` 이다(`bracket_to_schedule` —
   * `SeasonPhase` 에 대회 값이 없다). 그래서 정규시즌 연장 12이닝 상한이
   * 그대로 걸렸고, 무승부가 나면 `winnerId` 가 빈 문자열이라
   * `advance_tournament_round` 가 승자를 안 찍는다. 그 라운드는
   * `live.every(winnerTeamId)` 를 영영 못 채워 **주마다 다시 확정되고
   * 같은 소식 id 가 다시 났다** — 실사용자 세이브에서 장미기 1R 이
   * 동래 4:4 거제로 그렇게 죽었다(2026-09-06 실측).
   *
   * ⚠ **한 호출부라도 빠지면 그 경로의 대회만 죽는다.** 그래서 수를 센다.
   */
  it("넉아웃은 무승부를 안 낸다 — 호출부마다 knockout 을 싣는다", () => {
    // 가르는 규칙은 한 곳이다 — 브래킷에 있는 경기냐
    expect(read("apps/ui/src/shared/utils/scheduleView.ts"))
      .toContain("export function knockoutMatchIds(");
    // 대회 경기가 도는 세 갈래: 주인공 리그 · 배경 리그 · 회피 경기
    const AW = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(AW.split("knockout: isKnockoutGame(game.id)").length - 1).toBe(3);
    expect(read("apps/ui/src/shared/stores/backgroundLeague.ts"))
      .toContain("knockout: knockoutIds.has(e.id)");
    expect(read("apps/ui/src/shared/stores/backgroundLeague.ts"))
      .toContain("knockout:             g.knockout ?? false");
    expect(read("apps/ui/src/shared/usecases/simulateSkippedGame.ts"))
      .toContain("knockout: knockoutMatchIds(s).has(entry.id)");
    expect(read("apps/ui/src/shared/workers/simWorker.ts"))
      .toContain("knockout:    g.knockout ?? false");
  });

  /**
   * ⚠ **이미 저장된 무승부**를 푸는 자리도 있어야 한다 — 만드는 쪽만 고치면
   * 테스터 세이브의 장미기는 영영 1라운드에 갇힌 채다.
   */
  it("저장된 넉아웃 무승부를 재경기로 푼다", () => {
    const AW = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(AW).toContain("async function replayDrawnKnockout(");
    expect(AW).toContain("if (settled) resultOf.set(m.id, settled);");
    // 못 풀면 **라운드를 안 닫는다** — 승자 없는 결과를 억지로 넘기지 않는다
    expect(AW).toContain("if (results.some((x) => !x.winnerTeamId))");
    expect(read("apps/ui/src/shared/stores/season.ts"))
      .toContain("settleDrawnKnockout(");
  });
});
