import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  managerEffect, primeManagerStyleRules, NEUTRAL_STYLE, styleNoiseOf,
} from "../managerStyle";

/**
 * 감독 스타일 (2026-08-30).
 *
 * 🔴 **스타일 9종이 생성·저장되고 팀 상세에 표시까지 되는데 아무것도
 *   안 바꿨다.** `tacticalIQ`·`riskTolerance` 도 같이 죽어 있었다.
 *
 * ⚠ **보이는 값이 아무 효과가 없으면 플레이어가 먼저 알아챈다** —
 *   "공격 지향"이라 떠 있는 팀이 번트를 제일 많이 댈 수 있었다.
 *
 * ⚠ `offenseMind` 는 예외였다 — Rust 경기 엔진의 도루에 이미 쓰이고
 *   있었다(`OFFENSE_STEAL_MODIFIER`). **단, 주인공 팀 공격일 때만**이고
 *   타순에는 안 쓰였다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const rules = JSON.parse(
  read("resource/data/master/players/generation_rules.json"),
).managerStyleRules;

describe("감독 효과", () => {
  beforeEach(() => primeManagerStyleRules(rules));

  it("규칙 파일에 스타일 9종이 다 있다", () => {
    // 생성 규칙(`staff_rules.json`)의 9종과 하나라도 어긋나면
    // 그 스타일 감독은 조용히 중립이 된다
    const gen = JSON.parse(read("resource/data/master/players/staff_rules.json"))
      .rules.manager.styles as string[];
    expect(gen.length).toBe(9);
    for (const s of gen) {
      expect(Object.keys(rules.styles), `표에 없는 스타일: ${s}`).toContain(s);
    }
  });

  it("규칙이 없으면 중립이다 — 예전과 같게 돈다", () => {
    primeManagerStyleRules(null);
    expect(managerEffect({ style: "공격 지향" })).toEqual(NEUTRAL_STYLE);
  });

  it("감독이 없어도 중립이다", () => {
    const e = managerEffect(null);
    expect(e.power).toBe(0);
    expect(e.buntMult).toBe(1);
  });

  it("공격 지향은 파워를 올리고 번트를 줄인다", () => {
    const e = managerEffect({ style: "공격 지향", tacticalIQ: 50,
      offenseMind: 50, riskTolerance: 50 });
    expect(e.power).toBeGreaterThan(0);
    expect(e.buntMult).toBeLessThan(1);
    expect(e.stealMult).toBeGreaterThan(1);
  });

  it("수비 조직은 반대다", () => {
    const e = managerEffect({ style: "수비 조직", tacticalIQ: 50,
      offenseMind: 50, riskTolerance: 50 });
    expect(e.buntMult).toBeGreaterThan(1);
    expect(e.stealMult).toBeLessThan(1);
  });

  it("육성 우선과 노장 중용은 나이가 반대다", () => {
    const y = managerEffect({ style: "육성 우선", tacticalIQ: 50 });
    const o = managerEffect({ style: "노장 중용", tacticalIQ: 50 });
    expect(y.age).toBeLessThan(0);
    expect(o.age).toBeGreaterThan(0);
  });

  it("🔴 전술 이해도가 낮을수록 타순이 흔들린다", () => {
    const dumb = managerEffect({ style: "데이터 중심", tacticalIQ: 10 });
    const smart = managerEffect({ style: "데이터 중심", tacticalIQ: 95 });
    expect(dumb.noise).toBeGreaterThan(smart.noise);
  });

  it("과감할수록 도루가 늘고 번트가 준다", () => {
    const bold = managerEffect({ style: "데이터 중심", riskTolerance: 75 });
    const safe = managerEffect({ style: "데이터 중심", riskTolerance: 30 });
    expect(bold.stealMult).toBeGreaterThan(safe.stealMult);
    expect(bold.buntMult).toBeLessThan(safe.buntMult);
  });

  it("잡음은 선수마다 고정이다", () => {
    // 매번 다르면 같은 팀이 경기마다 타순을 새로 짠다
    expect(styleNoiseOf("PLY_1", "TEAM_A", 8)).toBe(styleNoiseOf("PLY_1", "TEAM_A", 8));
    expect(styleNoiseOf("PLY_1", "TEAM_A", 8)).not.toBe(styleNoiseOf("PLY_2", "TEAM_A", 8));
  });

  it("폭이 0이면 잡음이 없다", () => {
    expect(styleNoiseOf("PLY_1", "TEAM_A", 0)).toBe(0);
  });
});

describe("배선", () => {
  const roster = read("apps/ui/src/shared/utils/rosterEngine.ts");

  it("타순이 감독을 받는다", () => {
    expect(roster.includes("sortBattingOrder(lineup9, entities, managerEff, teamId)")).toBe(true);
  });

  it("🔴 감독을 실제로 뽑아 넘긴다", () => {
    // 인자만 만들고 안 넘기면 **아무 일도 안 일어난다**
    expect(roster.includes("const mgrProfile = managerProfileOf(teamId, entities);")).toBe(true);
    expect(roster.includes("const mgrEff = managerEffect(mgrProfile);")).toBe(true);
  });

  it("🔴 나이를 팀 안 상대값으로 잰다", () => {
    // 절대 나이(25 기준)는 고교(전원 16~18세)에서 안 먹어
    // **"육성 우선"과 "노장 중용"이 같은 타순**을 냈다(실측)
    expect(roster.includes("const ageAdj = ((age - ageMid) / ageSpan) * eff.age;")).toBe(true);
  });

  it("🔴 규칙 파일을 부팅 때 싣는다", () => {
    // 안 실으면 규칙이 늘 null 이라 스타일이 다시 죽는다
    const master = read("apps/ui/src/shared/stores/master.ts");
    expect(master.includes("primeManagerStyleRules(")).toBe(true);
  });
});

describe("경기 엔진 배선", () => {
  const rust = read("packages/engine-native/src/match_engine.rs");
  const types = read("packages/engine-native/src/types.rs");
  const page = read("apps/ui/src/pages/match/MatchPage.svelte");

  it("Rust가 배수를 받는다", () => {
    // ⚠ `serde(default)` 라 **안 넘겨도 조용히 통과한다** — 층마다 본다
    expect(types.includes("pub bunt_mult: f64,")).toBe(true);
    expect(types.includes("pub steal_mult: f64,")).toBe(true);
  });

  it("🔴 안 넘기면 1.0 — 예전 동작이다", () => {
    expect(types.includes('#[serde(default = "one", rename = "buntMult")]')).toBe(true);
    // ⚠ **TS 는 camelCase 로 보낸다** — 이 구조체엔 rename_all 이 없어
    //   이름을 명시해야 한다. 안 붙이면 조용히 기본값으로 돌아간다.
    expect(types.includes('rename = "stealMult"')).toBe(true);
    expect(rust.includes("opts.bunt_mult.unwrap_or(1.0)")).toBe(true);
    expect(rust.includes("opts.steal_mult.unwrap_or(1.0)")).toBe(true);
  });

  it("번트·도루에 실제로 곱한다", () => {
    // 받기만 하고 안 쓰면 죽은 갈래다
    expect(rust.includes("else { state.my_manager.bunt_mult.clamp(0.0, 3.0) }")).toBe(true);
    expect(rust.includes("if rng.gen::<f64>() < attempt_prob * steal_mult {")).toBe(true);
  });

  it("🔴 TS가 실제로 넘긴다", () => {
    // 엔진·타입이 다 맞아도 TS가 안 넘기면 **아무 일도 안 일어난다**
    expect(page.includes("buntMult: myMgrEff.buntMult, stealMult: myMgrEff.stealMult")).toBe(true);
  });

  it("우리 팀 공격일 때만 건다", () => {
    // 상대 감독은 이 모델에 없다
    expect(rust.includes("let steal_mult = if is_our_batting {")).toBe(true);
  });
});
