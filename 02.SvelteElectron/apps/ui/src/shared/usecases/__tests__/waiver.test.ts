import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 웨이버 공시 — 방출 선수를 다른 구단이 데려간다 (3단계 · 4).
 *
 * 🔴 두 번 좁혀야 했다:
 *   ① "팀이 빈 사람"으로 잡았더니 **졸업생·미배정자까지** 걸렸다
 *      (실측 2027년 102명 — 고교·대학 선수가 프로 2군으로).
 *   ② 방출자를 `career_events` 에서 찾으려 했는데 **거기 안 남는다** —
 *      `ev()` 는 `OffseasonEvent` 에만 넣는다. 그걸 보면 아무도 안 걸려
 *      **웨이버가 죽은 갈래가 된다.**
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
) as { waiverRules?: { enabled?: boolean; ovrMargin?: number; maxPerTeam?: number } };

describe("웨이버 공시", () => {
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const types = read("packages/engine-native/src/sim_types.rs");
  const engine = read("apps/ui/src/shared/utils/npcEngine.ts");
  const store = read("apps/ui/src/shared/stores/game.ts");

  it("규칙 파일에 값이 있다", () => {
    expect(rules.waiverRules, "waiverRules").toBeTruthy();
    expect(rules.waiverRules!.enabled).toBe(true);
    expect(rules.waiverRules!.maxPerTeam).toBeGreaterThan(0);
  });

  it("다섯 층이 이어져 있다", () => {
    // ⚠ `serde(default)` 라 **안 넘겨도 조용히 통과한다** — 층마다 본다
    expect(types.includes("pub struct WaiverRules"), "Rust 타입").toBe(true);
    expect(types.includes("pub waiver_rules"), "파라미터 필드").toBe(true);
    expect(rust.includes("fn waiver_claim"), "함수").toBe(true);
    expect(rust.includes("params.waiver_rules.as_ref()"), "호출").toBe(true);
    expect(engine.includes("waiverRules"), "TS 시그니처").toBe(true);
    expect(store.includes(".waiverRules"), "규칙 파일에서 넘긴다").toBe(true);
  });

  it("🔴 그 해 **방출된 사람만** 대상이다", () => {
    // "팀이 빈 사람"이면 졸업생·미배정자까지 걸린다
    expect(rust.includes("released_ids.contains(&n.npc_id)")).toBe(true);
    expect(rust.includes("n.career_events.iter().any(|e| e.year == season_year"),
      "career_events 로 찾으면 아무도 안 걸린다").toBe(false);
  });

  it("방출자를 `events` 에서 모은다", () => {
    // `ev()` 는 `OffseasonEvent` 에만 넣는다 — 선수의 career_events 가 아니다
    expect(rust.includes('e.kind == "release_score" || e.kind == "release_roster"')).toBe(true);
  });

  it("정원과 팀당 상한을 지킨다", () => {
    // 상한이 없으면 웨이버가 로스터 캡을 뚫고, 여유 큰 팀이 쓸어담는다
    expect(rust.includes("if cnt >= max { continue; }"), "정원").toBe(true);
    expect(rust.includes("max_per_team { continue; }"), "팀당 상한").toBe(true);
  });

  it("최약체만도 못하면 안 데려간다", () => {
    // 아무나 데려가면 방출이 무의미하다
    expect(rust.includes("if ovr < w + ovr_margin { continue; }")).toBe(true);
  });

  it("방출 **직후**에 돈다", () => {
    // 육성 만료(11-c)·진로 배정(12)이 돌면 이미 독립·은퇴로 갈려 나간 뒤다
    const a = rust.indexOf("release_second_stage(");
    const b = rust.indexOf("params.waiver_rules.as_ref()");
    const c = rust.indexOf("expire_development_contracts(&mut after_normalize");
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(c);
  });
});
