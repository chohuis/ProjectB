import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **선수별 수비 기록** (G-2 · 2026-08-29).
 *
 * 🔴 두 가지가 막고 있었다:
 *
 *   ① **수비진이 한 벌뿐이었다.** `MatchState.fielders` 하나를 반과 무관하게
 *      썼다 — **원정 수비가 존재하지 않았고** 홈(또는 주인공) 팀 9명이
 *      양 팀 이닝을 다 지켰다. 그 상태로 기록을 달면 홈 선수가 **상대
 *      수비 기록까지 먹는다.**
 *   ② `fr.is_error`가 **팀 카운터**(`DefenseStat`)만 올렸다. 선수별로는
 *      한 건도 안 쌓였다 — 오늘 삼진·도루와 같은 형태다.
 *
 * 실측(씨앗 555 · 2시즌 · 타자 라인 280,006):
 *   실책 9,346 · 보살 169,831 · 자살 341,505   (전에는 전부 0)
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("선수별 수비 기록", () => {
  const ME = read("packages/engine-native/src/match_engine.rs");
  const TY = read("packages/engine-native/src/types.rs");

  it("양 팀 수비진이 있다", () => {
    expect(TY).toContain("pub opponent_fielders: Vec<FielderStats>");
    expect(ME).toContain("fn fielding_side<'a>(state: &'a MatchState) -> &'a [FielderStats]");
    // 반에 따라 고른다 — 예전엔 state.fielders 하나만 봤다
    expect(ME).toContain("resolve_fielding_result(ball, fielding_side(&pre_state), rng)");
  });

  /** ⚠ 비면 예전 동작으로 떨어진다 — 구 세이브가 죽으면 안 된다 */
  it("상대 수비진이 없으면 예전 동작이다", () => {
    expect(ME).toContain("if state.opponent_fielders.is_empty() { return &state.fielders; }");
    // 기본 수비진으로 채우지 않는다 — 채우면 상대가 평균 50 수비를 갖는다
    expect(ME).toContain("opts.opponent_fielders.clone().unwrap_or_default()");
  });

  it("누적 칸이 있다", () => {
    expect(TY).toContain("pub errors: i32,");
    expect(TY).toContain("pub assists: i32,");
    expect(TY).toContain("pub putouts: i32,");
  });

  /** 🔴 수비수는 **공격 팀의 반대편**이다 — 타자 줄과 정반대다 */
  it("수비 기록이 수비 팀에 붙는다", () => {
    expect(ME).toContain("let lines = if is_top { &mut next_state.home_bat_lines }\n                        else      { &mut next_state.away_bat_lines };");
  });

  /** 던진 사람이 보살, 받은 사람이 자살 · 송구 없는 아웃은 잡은 사람이 자살 */
  it("보살과 자살을 가른다", () => {
    expect(ME).toContain("if let Some(ref r) = recv_id { bump(r, 2); }");
    expect(ME).toContain("} else if delta > 0 {");
  });

  it("결과 줄이 수비 칸을 싣는다", () => {
    expect(read("packages/engine-native/src/sim_types.rs")).toContain("#[serde(default)] e: i32,");
    expect(ME).toContain("e: b.errors, a: b.assists, po: b.putouts,");
  });

  /** 🔴 호출부가 안 넘기면 **원정 수비가 다시 사라진다** */
  it("두 경로가 상대 수비진을 넘긴다", () => {
    expect(read("apps/ui/src/shared/utils/gameSimulator.ts"))
      .toContain("opponentFielders: buildFieldersFromLineup(params.awayLineup)");
    expect(read("apps/ui/src/pages/main/MainPage.svelte"))
      .toContain("opponentFielders: buildFielders(opponentTeamId, $entitiesL10n)");
  });
});
