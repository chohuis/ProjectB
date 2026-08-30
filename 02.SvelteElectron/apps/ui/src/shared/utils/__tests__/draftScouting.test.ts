import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 드래프트 스카우팅 (D단계).
 *
 * 🔴 `apply_scouting_noise_native` 가 Rust·preload·타입까지 다 있는데
 *   **TS 가 한 번도 안 불렀다.** 완성된 죽은 갈래였고, 그래서
 *   **전 구단이 모든 선수의 진짜 능력을 정확히 알았다.**
 *
 * ⚠ 드래프트는 Rust 안에서 통째로 돈다 — TS 가 뷰를 만들어 넘길 자리가
 *   없어서, **순번마다 그 팀 눈으로 점수를 매기는 자리**에 직접 얹었다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const rules = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
) as { draftScoutingRules?: { span?: number } };

describe("드래프트 스카우팅", () => {
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const types = read("packages/engine-native/src/sim_types.rs");
  const ds = strip(read("apps/ui/src/shared/utils/draftSystem.ts"));
  const store = strip(read("apps/ui/src/shared/stores/game.ts"));

  it("규칙 파일에 값이 있다", () => {
    expect(rules.draftScoutingRules?.span).toBeGreaterThan(0);
  });

  it("네 층이 이어져 있다", () => {
    // ⚠ `serde(default)` 라 **안 넘겨도 조용히 통과한다** — 층마다 본다
    expect(types.includes("pub struct DraftScoutingParams"), "Rust 타입").toBe(true);
    expect(types.includes("pub scouting: Option<DraftScoutingParams>"), "필드").toBe(true);
    expect(rust.includes("params.scouting.as_ref()"), "엔진이 쓴다").toBe(true);
    expect(ds.includes("scouting ? { scouting }"), "TS 가 넘긴다").toBe(true);
    expect(store.includes("draftScoutingRules"), "규칙에서 읽는다").toBe(true);
  });

  it("🔴 점수만 흔든다 — 실제 능력은 그대로다", () => {
    // 잘못 본 팀이 잘못 뽑는 것이지 뽑힌 선수가 나빠지는 게 아니다.
    // 잡음은 `base` 에만 더해지고 npc 를 안 건드린다.
    expect(rust.includes("+ bias_of(id) + scout_noise")).toBe(true);
    expect(rust.includes("npc.ovr = "), "선수를 고치면 안 된다").toBe(false);
  });

  it("씨앗이 선수 + 팀 + 연도다", () => {
    // 순번마다 흔들리면 같은 팀이 같은 선수를 볼 때마다 값이 달라진다
    expect(rust.includes("crate::scouting_engine::simple_hash(id)")).toBe(true);
    expect(rust.includes("simple_hash(team)")).toBe(true);
    expect(rust.includes("params.year as u32")).toBe(true);
  });

  it("해시를 두 벌로 두지 않는다", () => {
    // `scouting_engine` 의 것을 그대로 쓴다 — 갈리면 뷰가 안 맞는다
    expect(read("packages/engine-native/src/scouting_engine.rs")
      .includes("pub fn simple_hash")).toBe(true);
  });

  it("품질이 낮을수록 크게 흔들린다", () => {
    expect(rust.includes("((100.0 - q) / 100.0) * sc.span")).toBe(true);
  });

  it("span이 0이면 안 돈다 (예전 동작)", () => {
    expect(rust.includes("Some(sc) if sc.span > 0.0")).toBe(true);
    expect(store.includes("if (sp <= 0) return undefined;")).toBe(true);
  });
});
