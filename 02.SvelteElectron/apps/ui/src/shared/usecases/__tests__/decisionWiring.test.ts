import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **승·패·세이브·홀드와 선발 등판이 끝까지 이어지는가** (2026-08-28).
 *
 * 🔴 세 자리가 끊겨 있었다:
 *
 *   ① `match_engine::collect_player_lines`가 `decision`을 **빈 문자열**로 뒀다.
 *      "승패는 리그 쪽이 정한다"고 적혀 있었는데 **리그 쪽이 안 채웠다.**
 *      모든 리그가 이 경로라 실측 투수 라인의 **77.3%가 빈 값**이었고,
 *      KBL·ABL·JBL·고교·대학·독립 **NPC 전원이 W/L/SV/HD 0**이었다.
 *   ② `accumulateStats`가 `gs`(선발 등판)를 **올리는 코드가 아무 데도 없었다.**
 *      화면 넷이 그걸 표시한다.
 *   ③ 마무리가 불펜 목록에도 들어가 큐에 **두 번** 실렸다. `npc_sim`은
 *      걸러내는데 match_engine 경로만 안 걸러냈다 — **고친 곳이 둘인데 하나만.**
 *
 * 실측: 빈 decision **77.3% → 0.0%** · 선발 라인 0 → 23,476 (40,014 표본)
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("승패·선발 등판 배선", () => {
  const ME = read("packages/engine-native/src/match_engine.rs");
  const SH = read("apps/ui/src/shared/utils/season-helpers.ts");
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");

  it("match_engine이 decision을 비워 두지 않는다", () => {
    expect(ME.includes('decision: String::new()')).toBe(false);
  });

  /** ⚠ 규칙은 한 곳이다 — 여기서 다시 적으면 주인공과 NPC가 갈린다 */
  it("규칙은 decide_pitcher 하나다", () => {
    expect(ME).toContain("npc_sim::decide_pitcher(");
    // 승패 문자열을 여기서 손으로 만들지 않는다
    expect(ME.includes('"SV".to_string()')).toBe(false);
    expect(ME.includes('"HD".to_string()')).toBe(false);
  });

  /** ⚠ 무승부면 아무도 승패를 안 진다 — TS 래퍼와 같은 규칙 */
  it("무승부는 ND다", () => {
    expect(ME).toContain("if is_draw {");
  });

  it("엔진이 선발 여부를 보낸다", () => {
    expect(read("packages/engine-native/src/sim_types.rs")).toContain("gs: bool");
    expect(ME).toContain("gs: is_starter");
    expect(read("packages/engine-native/src/npc_sim.rs")).toContain("gs: pit_q.first()");
  });

  it("집계가 선발 등판을 실제로 센다", () => {
    // 🔴 `gs: prev.gs`였다 — 올리는 코드가 없었다
    expect(SH.includes("gs: prev.gs,")).toBe(false);
    expect(SH).toContain("gs: prev.gs + (line.gs ? 1 : 0)");
  });

  it("주인공 라인도 선발 여부를 싣는다", () => {
    expect(read("apps/ui/src/shared/usecases/applyGameOutcome.ts"))
      .toContain('gs: role === "SP"');
  });

  /** 🔴 마무리가 큐에 두 번 들어가면 6~7회에 소모되고 9회에 없다 */
  it("마무리를 큐에 두 번 싣지 않는다", () => {
    expect(GS).toContain("const queueOf = (");
    expect(GS.includes("...params.homeBullpen,\n                        ...(params.homeCloser")).toBe(false);
  });
});
