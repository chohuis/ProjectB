import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { leagueMatchOptions } from "../matchLeagueOptions";
import { primeRosterOpsRules, starterPitchLimitForLeague, starterOutsFactorForLeague, closerGateForLeague } from "../rosterEngine";

// ── 1.1 A② §6-1 — 리그가 정하는 경기 옵션 한 벌 ─────────────────────
//
// 규칙 파일이 정본이다 — 실제 generation_rules.json 을 싣는다. 값(고교 95 · 0.80 · 8회)은
// 전부 제안값이고 사용자 확정 뒤 바뀔 수 있으므로 **관계**만 본다(고교 < 기본 · 문이 고교에만 있다).
// 세 호출부가 같은 헬퍼를 쓰는지는 문자열 포함으로 본다 — 정규식을 쓰지 않는다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

beforeEach(() => {
  primeRosterOpsRules(JSON.parse(read("resource/data/master/players/generation_rules.json")));
});

describe("규칙 접근자", () => {
  it("고교 투구수 상한이 기본보다 낮고 설명 키는 안 실린다", () => {
    expect(starterPitchLimitForLeague("LEAGUE_HIGHSCHOOL")).toBeLessThan(starterPitchLimitForLeague("LEAGUE_KBL"));
    expect(starterPitchLimitForLeague("_note")).toBe(starterPitchLimitForLeague("LEAGUE_KBL"));
  });
  it("고교 선발 아웃 계수가 1 보다 작고 프로는 1 이다", () => {
    expect(starterOutsFactorForLeague("LEAGUE_HIGHSCHOOL")).toBeLessThan(1);
    expect(starterOutsFactorForLeague("LEAGUE_KBL")).toBe(1);
  });
  it("마무리 문은 고교에만 있다", () => {
    expect(closerGateForLeague("LEAGUE_HIGHSCHOOL")?.inningThreshold).toBeGreaterThan(0);
    expect(closerGateForLeague("LEAGUE_KBL")).toBeUndefined();
  });
});

describe("경기 옵션 한 벌", () => {
  it("고교는 상한·계수·문을 다 넘기고 프로는 문을 안 넘긴다", () => {
    const hs = leagueMatchOptions("LEAGUE_HIGHSCHOOL");
    expect(hs.pitchLimitOverride).toBe(starterPitchLimitForLeague("LEAGUE_HIGHSCHOOL"));
    expect(hs.closerGate).toBeDefined();
    const pro = leagueMatchOptions("LEAGUE_KBL");
    expect(pro.closerGate).toBeUndefined();
    expect(pro.starterOutsFactor).toBe(1);
  });
  it("의무 휴식 재료는 셋이 다 있을 때만 붙는다", () => {
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", { lastPitchedDate: "2027-05-01", lastPitchCount: 98 }, "2027-05-02").restGuard)
      .toEqual({ lastPitchedDate: "2027-05-01", lastPitchCount: 98, gameDate: "2027-05-02" });
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", { lastPitchedDate: "2027-05-01", lastPitchCount: 0 }, "2027-05-02").restGuard).toBeUndefined();
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", null, "2027-05-02").restGuard).toBeUndefined();
    expect(leagueMatchOptions("LEAGUE_HIGHSCHOOL", { lastPitchedDate: "2027-05-01", lastPitchCount: 98 }, undefined).restGuard).toBeUndefined();
  });
});

describe("배선 — 주인공 경기 호출부 셋이 같은 헬퍼를 쓴다", () => {
  it("자동 진행", () => {
    expect(read("apps/ui/src/shared/usecases/runAutoAdvance.ts").includes("...leagueMatchOptions(lid,")).toBe(true);
  });
  it("실제 플레이(MainPage)", () => {
    expect(read("apps/ui/src/pages/main/MainPage.svelte").includes("...leagueMatchOptions(lid,")).toBe(true);
  });
  it("경기 화면(MatchPage) 시작 둘", () => {
    const s = read("apps/ui/src/pages/match/MatchPage.svelte");
    expect(s.split("...leagueMatchOptions(").length - 1).toBeGreaterThanOrEqual(2);
  });
  it("Rust 옵션이 넷을 받는다", () => {
    const t = read("packages/engine-native/src/types.rs");
    for (const f of ["pub pitch_limit_override: Option<f64>", "pub starter_outs_factor: Option<f64>", "pub closer_gate: Option<CloserGate>", "pub rest_guard: Option<RestGuard>"]) {
      expect(t.includes(f)).toBe(true);
    }
  });
});
