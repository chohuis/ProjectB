import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 도루자(`cs`) 기록 — 1단계 ① (2026-08-30).
 *
 * 🔴 **판정은 처음부터 돌았다.** 주자가 아웃되고 로그도 남는데
 *   **셀 자리가 없어서** 화면엔 도루 성공만 보였다 — 성공률을 낼 수 없었다.
 *   도루 성공에서 겪은 것과 같은 형태다("로그 문자열만 만들고 타자 줄을
 *   안 건드렸다 — 규정타자 전원 도루 0").
 *
 * ⚠ **배선이 다섯 층이다.** 하나만 빠져도 조용히 0이 된다:
 *   Rust 판정 → Rust 집계 → 타입 → TS 합산(`accumulateStats`) → 화면
 *   실제로 `accumulateStats` 를 빠뜨려서 처음 실측이 **0건**이었다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("도루자 배선", () => {
  const me = read("packages/engine-native/src/match_engine.rs");
  const npc = read("packages/engine-native/src/npc_sim.rs");
  const st = read("packages/engine-native/src/sim_types.rs");
  const helpers = read("apps/ui/src/shared/utils/season-helpers.ts");

  it("① 주인공 경기가 잡힌 주자를 돌려준다", () => {
    // 예전엔 성공(`stole`)만 넘겼다
    expect(me.includes("    -> (MatchRunners, u8, Vec<String>, Vec<String>, Vec<String>)")).toBe(
      true,
    );
    expect(me.includes("let mut caught: Vec<String> = vec![];")).toBe(true);
  });

  it("② 주인공 경기가 센다", () => {
    expect(
      me.includes("if let Some(b) = lines.iter_mut().find(|x| &x.player_id == id) { b.cs += 1; }"),
    ).toBe(true);
  });

  it("③ 배경 리그도 센다 — 두 경로가 같아야 한다", () => {
    // 한쪽만 세면 주인공 기록과 리그 기록이 다른 척도가 된다
    expect(npc.includes("                    .cs += 1;")).toBe(true);
    expect(npc.includes("cs: i32, risp_ab: i32")).toBe(true);
  });

  it("④ 결과 줄에 칸이 있다", () => {
    expect(st.includes("        cs: i32,")).toBe(true);
  });

  it("🔴 ⑤ TS가 합산한다 — 이걸 빠뜨려 처음 실측이 0건이었다", () => {
    expect(helpers.includes("const cs  = (prev.cs ?? 0) + (line.cs ?? 0);")).toBe(true);
    // ⚠ 3단계에서 포일(pb)을 같은 줄에 더했다 — 순서가 바뀌었다
    expect(
      helpers.includes('type:"batter", g: prev.g+1, pa, ab, h, hr, rbi, sb, cs, pb, bb, k,'),
    ).toBe(true);
  });

  it("구 세이브 호환 — 없으면 0이다", () => {
    // `default`가 없으면 옛 로그를 읽다 죽는다
    expect(st.includes("        #[serde(default)]\n        cs: i32,")).toBe(true);
  });
});

describe("도루자 화면", () => {
  const modal = read("apps/ui/src/features/player/ui/PlayerDetailModal.svelte");
  const career = read("apps/ui/src/features/retirement/ui/CareerEndScreen.svelte");
  const summary = read("apps/ui/src/shared/utils/careerSummary.ts");

  it("선수 상세 요약에 CS가 있다", () => {
    expect(modal.includes('["CS", modalStats.cs ?? 0]')).toBe(true);
  });

  it("표 머리와 칸 수가 맞는다", () => {
    // 머리만 늘리거나 칸만 늘리면 열이 어긋난다
    expect(modal.includes("<th>OPS</th><th>SB</th><th>CS</th>")).toBe(true);
    expect(modal.includes("<th>K</th><th>SB</th><th>CS</th>")).toBe(true);
  });

  it("커리어 합계가 cs를 모은다", () => {
    expect(summary.includes("b.cs += st.cs ?? 0;")).toBe(true);
    expect(summary.includes("rbi: b.rbi, sb: b.sb, cs: b.cs, bb: b.bb, k: b.k,")).toBe(true);
  });

  it("은퇴 화면에 도루자가 뜬다", () => {
    expect(career.includes('["도루자", totals.batting.cs ?? 0]')).toBe(true);
  });
});
