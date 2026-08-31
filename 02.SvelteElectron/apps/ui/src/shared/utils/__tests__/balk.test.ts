import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 보크 — 2단계 (2026-08-30).
 *
 * ⚠ **결과 코드가 없다.** 투구 전 사건이라 타석은 그대로고 주자만 한 칸씩
 *   간다 — 타자에겐 아무 일도 안 일어난다.
 *
 * 🔴 **도루 함수 안에 못 넣었다.** 3루 주자가 홈에 오면 득점인데
 *   `attempt_steals` 는 득점을 반환하지 않는다. 호출 직후(투구 전)에 뒀다.
 *
 * ⚠ **판정만 하고 안 세면 "왜 주자가 갔지"만 남는다** — KBO 투수 표의
 *   BK 칸이다. 도루자에서 겪은 것과 같은 형태다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("보크 배선", () => {
  const me = read("packages/engine-native/src/match_engine.rs");
  const ty = read("packages/engine-native/src/types.rs");
  const st = read("packages/engine-native/src/sim_types.rs");
  const npc = read("packages/engine-native/src/npc_sim.rs");

  it("🔴 투구 전에 판정한다 — 도루 함수 밖이다", () => {
    // 안에 넣으면 3루 주자 득점을 처리할 수 없다
    expect(me.includes("    let mut balk_runs = 0i32;")).toBe(true);
    expect(me.includes("    let mut balked = false;")).toBe(true);
  });

  it("🔴 주자를 뒤에서부터 민다", () => {
    // 앞에서 밀면 덮어쓴다
    expect(me.includes("            pre_runners.third  = pre_runners.second.take();")).toBe(true);
    expect(me.includes("            pre_runners.second = pre_runners.first.take();")).toBe(true);
  });

  it("🔴 3루 주자가 홈에 오면 득점이다", () => {
    // 판정만 하고 점수를 안 올리면 주자가 사라지기만 한다
    expect(me.includes("            if let Some(r3) = pre_runners.third.take() {")).toBe(true);
    expect(me.includes("        add_runs(balk_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);")).toBe(true);
  });

  it("주자가 없으면 안 난다", () => {
    expect(me.includes("    if pre_runners.first.is_some() || pre_runners.second.is_some()")).toBe(true);
  });

  it("🔴 투수 기록에 남는다 (BK)", () => {
    expect(ty.includes("    pub bk: i32,")).toBe(true);
    expect(st.includes("        bk: i32,")).toBe(true);
    expect(me.includes("                if balked { line.bk += 1; }")).toBe(true);
    expect(me.includes("                bk: l.bk,")).toBe(true);
  });

  it("배경 리그는 0이다 — 투구 단위로 안 돈다", () => {
    expect(npc.includes("            bk: 0,")).toBe(true);
  });

  it("로그가 두 갈래다 — 득점 여부로 갈린다", () => {
    expect(me.includes('                "보크! 3루 주자가 홈을 밟는다".to_string()')).toBe(true);
    expect(me.includes('                "보크! 주자가 한 베이스씩 진루한다".to_string()')).toBe(true);
  });
});
