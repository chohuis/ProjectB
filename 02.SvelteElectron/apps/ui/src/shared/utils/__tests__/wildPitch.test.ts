import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 폭투 · 포일 — 2단계 (2026-08-30).
 *
 * 형제다: 둘 다 **포수를 지나친 공에 주자가 진루**한다.
 *
 * 🔴 **책임이 갈린다**(실제 야구 규칙):
 *   폭투(WP)  공이 너무 벗어나 포수가 잡을 수 없었다 → **투수** 기록
 *   포일(PB)  잡을 수 있는 공을 놓쳤다               → **포수** 기록
 *
 * ⚠ 포수는 **수비 팀** 소속이다 — 공격 팀 타자 줄에 달면 엉뚱한 사람
 *   기록이 된다. 도루(공격 쪽)와 반대편이다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("폭투·포일 배선", () => {
  const me = read("packages/engine-native/src/match_engine.rs");
  const ty = read("packages/engine-native/src/types.rs");
  const st = read("packages/engine-native/src/sim_types.rs");
  const npc = read("packages/engine-native/src/npc_sim.rs");

  it("🔴 착탄 거리로 가른다", () => {
    // 같은 확률을 쓰면 "못 막을 공"과 "놓친 공"이 구분되지 않는다
    expect(me.includes("        let (p, is_wp) = if dist >= T::WILD_PITCH_DISTANCE {")).toBe(true);
  });

  it("타자가 안 쳤을 때만 — 친 공은 인플레이다", () => {
    expect(me.includes("    if !swings\n        && (next_runners.first.is_some()")).toBe(true);
  });

  it("주자가 없으면 안 난다", () => {
    // 주자가 없으면 진루할 사람이 없어 기록도 의미가 없다
    expect(me.includes("|| next_runners.third.is_some())")).toBe(true);
  });

  it("🔴 폭투는 투수 줄에 단다 (WP)", () => {
    expect(ty.includes("    pub wp: i32,")).toBe(true);
    expect(me.includes("                if wp_count > 0 { line.wp += wp_count; }")).toBe(true);
    expect(me.includes("                wp: l.wp,")).toBe(true);
  });

  it("🔴 포일은 포수 줄에 단다 (PB) — 수비 팀이다", () => {
    // 공격 팀 타자 줄에 달면 엉뚱한 사람 기록이 된다
    expect(ty.includes("    pub pb: i32,")).toBe(true);
    expect(me.includes("                let dl = if is_top { &mut next_state.home_bat_lines }")).toBe(true);
    expect(me.includes("                    b.pb += pb_count;")).toBe(true);
  });

  it("🔴 포수 이름을 판정 자리에서 잡는다", () => {
    // 아래에선 `pre_state` 가 이미 옮겨져 못 읽는다(컴파일러가 잡았다)
    expect(me.includes("    let mut pb_catcher: Option<String> = None;")).toBe(true);
  });

  it("주자를 뒤에서부터 민다", () => {
    expect(me.includes("            next_runners.third  = next_runners.second.take();")).toBe(true);
  });

  it("🔴 3루 주자가 홈에 오면 득점이다", () => {
    expect(me.includes("        add_runs(loose_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);")).toBe(true);
  });

  it("결과 줄에 실린다", () => {
    expect(st.includes("        wp: i32,")).toBe(true);
    expect(st.includes("        pb: i32,")).toBe(true);
  });

  it("배경 리그는 0이다 — 투구 단위로 안 돈다", () => {
    expect(npc.includes("            wp: 0,")).toBe(true);
    expect(npc.includes("cs: acc.cs, pb: 0,")).toBe(true);
  });

  it("로그가 두 갈래다 — 책임이 다르니 문구도 다르다", () => {
    expect(me.includes('                "폭투! 주자가 진루한다".to_string()')).toBe(true);
    expect(me.includes('                "포일! 포수가 공을 빠뜨렸다".to_string()')).toBe(true);
  });
});
