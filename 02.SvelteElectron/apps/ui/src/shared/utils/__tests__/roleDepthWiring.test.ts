import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { primePitcherRoleRules, resetPitcherRoleRulesForTest, roleDepthOf } from "../pitcherRoleRules";
import { leagueMatchOptions } from "../matchLeagueOptions";
import { primeRosterOpsRules } from "../rosterEngine";

// ── 1.1 A④ §5 — 추천 밖 깊이가 세 자리에 실제로 넘어가는가 ──────────────────
//
// 🔴 **계수를 여기서 다시 계산하지 않는다.** `1 − k × over` 는 Rust 하나뿐이고
//   (`pitcher_role::depth_factor` · cargo 검사), 여기는 **재료가 넘어가는지**만 본다.
// ⚠ `serde(default)` 라 배선을 빼도 오류가 안 난다 — 그래서 배선마다 **대조군**을 넣는다.
//   빼면 실패해야 그 검사가 배선을 보는 것이다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json"));

beforeEach(() => {
  resetPitcherRoleRulesForTest();
  primePitcherRoleRules(RULES);
  primeRosterOpsRules(RULES);
});

describe("깊이 재료", () => {
  it("자리 안이면 0 · 밖이면 칸 수", () => {
    expect(roleDepthOf({ rank: 1, seats: 3 }).roleDepth).toBe(0);
    expect(roleDepthOf({ rank: 3, seats: 3 }).roleDepth).toBe(0);
    expect(roleDepthOf({ rank: 4, seats: 3 }).roleDepth).toBe(1);
    expect(roleDepthOf({ rank: 7, seats: 3 }).roleDepth).toBe(4);
  });
  it("roleFit 이 없으면(구 세이브·야수) 0 이다", () => {
    expect(roleDepthOf(undefined).roleDepth).toBe(0);
    expect(roleDepthOf(null).roleDepth).toBe(0);
  });
  it("규칙 파일의 계수를 그대로 싣는다 — 값을 여기 안 적는다", () => {
    const off = roleDepthOf({ rank: 5, seats: 3 }).offRecommendation!;
    expect(off).toEqual(RULES.pitcherRoleRules.offRecommendation);
    expect(off.perSeatOver).toBeGreaterThan(0);
    expect(off.floor).toBeGreaterThan(0);
    expect(off.floor).toBeLessThan(1);
  });
  it("🔴 대조군 — 규칙이 안 실렸으면 계수를 안 넘긴다(Rust 가 1.0 으로 떨어진다)", () => {
    resetPitcherRoleRulesForTest();
    expect(roleDepthOf({ rank: 9, seats: 3 }).offRecommendation).toBeUndefined();
  });
});

describe("경기 시작 옵션 (§5-c)", () => {
  it("자리 안이면 roleDepth 를 아예 안 싣는다", () => {
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", null, null, { rank: 1, seats: 3 }).roleDepth).toBeUndefined();
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL").roleDepth).toBeUndefined();
  });
  it("자리 밖이면 칸 수를 싣는다", () => {
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", null, null, { rank: 6, seats: 4 }).roleDepth).toBe(2);
  });
});

describe("배선 — 네 호출부가 roleFit 을 넘긴다", () => {
  it("자동 진행", () => {
    expect(read("apps/ui/src/shared/usecases/runAutoAdvance.ts")
      .includes("entry.gameDate, p.roleFit)")).toBe(true);
  });
  it("실제 플레이(MainPage)", () => {
    expect(read("apps/ui/src/pages/main/MainPage.svelte")
      .includes("$seasonStore.currentDate, p.roleFit)")).toBe(true);
  });
  it("경기 화면(MatchPage) 시작 둘", () => {
    const s = read("apps/ui/src/pages/match/MatchPage.svelte");
    expect(s.split("protagonist.roleFit)").length - 1).toBe(2);
  });
  it("Rust 가 roleDepth 를 받는다", () => {
    expect(read("packages/engine-native/src/types.rs").includes("pub role_depth: Option<u32>")).toBe(true);
  });
});

describe("배선 — 주 경계의 두 판정 (§5-a · §5-b)", () => {
  const src = read("apps/ui/src/shared/usecases/advanceWeek.ts");
  it("깊이 재료를 한 번 만들어 둘 다에 쓴다", () => {
    expect(src.includes("const depthR         = roleDepthOf(gCurrent.protagonist.roleFit);")).toBe(true);
  });
  it("불펜 판정에 넘긴다", () => {
    expect(src.includes("          depthR,\n        );")).toBe(true);
  });
  it("선발 건너뛰기가 갈래를 바꾼다", () => {
    expect(src.includes("await starterWouldStart(depthR, seedOf(")).toBe(true);
    expect(src.includes("if ((game.isProtagonistGame && !starterSkips) || relieverPitching) {")).toBe(true);
  });
  it("깊이 0 이면 엔진을 안 부른다 — 판정 첫 줄이 깊이다", () => {
    const at = src.indexOf("const starterSkips =");
    expect(src.slice(at, at + 120).includes("depthR.roleDepth > 0")).toBe(true);
  });
  it("씨앗을 넘긴다 — `Math.random()` 도 무씨앗도 아니다", () => {
    expect(src.includes('"starter-start", game.id)')).toBe(true);
  });
});

describe("배선 — 고른 뒤 roleFit 을 적는다", () => {
  const src = read("apps/ui/src/shared/usecases/pitcherRole.ts");
  it("순위·자리 수가 있을 때만 적는다", () => {
    expect(src.includes("gameStore.setRoleFit(")).toBe(true);
    expect(src.includes("(meta.ranks && meta.seats)")).toBe(true);
  });
  it("소식 metadata 가 순위·자리 수를 싣는다", () => {
    expect(src.includes("...(rec.ranks ? { ranks: rec.ranks } : {})")).toBe(true);
    expect(src.includes("...(rec.seats ? { seats: rec.seats } : {})")).toBe(true);
  });
  it("세이브 타입에 roleFit 이 있다 — 세션에만 두면 앱을 껐다 켤 때 사라진다", () => {
    expect(read("apps/ui/src/shared/types/save.ts").includes("roleFit?: {")).toBe(true);
  });
});
