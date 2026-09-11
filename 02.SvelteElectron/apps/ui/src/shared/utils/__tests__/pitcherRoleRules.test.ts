import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  primePitcherRoleRules,
  resetPitcherRoleRulesForTest,
  isPitcherRoleRulesPrimed,
  bullpenSizeForLeague,
  buildRecommendParams,
  isSeasonOut,
  pitcherRoleRules,
} from "../pitcherRoleRules";
import { primeRosterOpsRules } from "../rosterEngine";
import type { EntityRow } from "../../stores/master";

// ── 보직 추천 재료 (1.1 A①) ───────────────────────────────────
//
// 규칙은 파일이 정본이다 — 여기서도 실제 generation_rules.json 을 읽어 싣는다.
// Rust 산식 자체는 cargo 검사(pitcher_role.rs)가 본다. 이 검사는 **재료**만 본다:
// 누가 후보에 들고 빠지는지, 구종 계열이 붙는지, 자리 수가 리그별로 맞는지.

const ROOT = resolve(__dirname, "../../../../../..");
const rulesFile = JSON.parse(
  readFileSync(resolve(ROOT, "resource/data/master/players/generation_rules.json"), "utf8"),
);

const attrs = (v: number) => ({
  ovr: v,
  stamina: v,
  velocity: v,
  command: v,
  control: v,
  movement: v,
  mentality: v,
  recovery: v,
  clutch: v,
  holdRunners: v,
});

function pitcher(
  id: string,
  teamId: string,
  extra: Partial<EntityRow> = {},
  pl: Record<string, unknown> = {},
): EntityRow {
  return {
    id,
    teamId,
    role: "player",
    status: "active",
    name: id,
    details: {
      player: { playerType: "pitcher", position: "SP", pitching: attrs(50), batting: {}, ...pl },
    },
    ...extra,
  } as unknown as EntityRow;
}

const catalog = [
  { id: "PITCH_FASTBALL", name: "Fastball", group: "fastball", unlockRuleId: "" },
  { id: "PITCH_SLIDER", name: "Slider", group: "breaking", unlockRuleId: "" },
];

const me = {
  id: "me",
  teamId: "TEAM_A",
  leagueId: "LEAGUE_HIGHSCHOOL",
  pitching: attrs(60),
  pitches: [
    { id: "PITCH_FASTBALL", grade: 3 as const },
    { id: "PITCH_SLIDER", grade: 2 as const },
  ],
};

beforeEach(() => {
  resetPitcherRoleRulesForTest();
  primeRosterOpsRules(rulesFile);
  primePitcherRoleRules(rulesFile);
});

describe("규칙 싣기", () => {
  it("파일의 pitcherRoleRules 를 싣고 설명 키는 뺀다", () => {
    expect(isPitcherRoleRulesPrimed()).toBe(true);
    const r = pitcherRoleRules()!;
    expect(Object.keys(r.weights).sort()).toEqual(["CP", "RP", "SP"]);
    expect(Object.keys(r.arsenal).sort()).toEqual(["CP", "RP", "SP"]);
    expect(Object.keys(r.arsenal).includes("_note")).toBe(false);
  });
  it("불펜 자리 수가 리그별로 실린다", () => {
    expect(bullpenSizeForLeague("LEAGUE_HIGHSCHOOL")).toBe(4);
    expect(bullpenSizeForLeague("LEAGUE_UNIVERSITY")).toBe(5);
    expect(bullpenSizeForLeague("LEAGUE_INDEPENDENT")).toBe(3);
    expect(bullpenSizeForLeague("LEAGUE_KBL")).toBe(6);
  });
  it("안 실리면 primed 가 false 다 — recommendRole 이 옛 엔진으로 간다", () => {
    resetPitcherRoleRulesForTest();
    expect(isPitcherRoleRulesPrimed()).toBe(false);
  });
});

describe("재료 만들기", () => {
  const rules = () => pitcherRoleRules()!;
  it("같은 팀 활동 중 투수만 후보다 — 나·야수·다른 팀·비활동은 뺀다", () => {
    const entities = [
      pitcher("me", "TEAM_A"),
      pitcher("p1", "TEAM_A"),
      pitcher("p2", "TEAM_A", { status: "retired" } as Partial<EntityRow>),
      pitcher("p3", "TEAM_B"),
      pitcher("b1", "TEAM_A", {}, { playerType: "batter" }),
    ];
    const params = buildRecommendParams({
      protagonist: me,
      entities,
      live: {},
      catalog,
      injuries: {},
      rules: rules(),
    });
    expect(params.teammates.map((t) => t.id)).toEqual(["p1"]);
  });
  it("시즌아웃 부상은 뺀다 · 뛰면서 버티는 부상은 남긴다", () => {
    const entities = [pitcher("p1", "TEAM_A"), pitcher("p2", "TEAM_A")];
    const injuries = {
      p1: { severity: "severe", weeksLeft: 12, isPlayingThrough: false },
      p2: { severity: "mild", weeksLeft: 1, isPlayingThrough: true },
    } as never;
    const params = buildRecommendParams({
      protagonist: me,
      entities,
      live: {},
      catalog,
      injuries,
      rules: rules(),
    });
    expect(params.teammates.map((t) => t.id)).toEqual(["p2"]);
    expect(isSeasonOut(undefined)).toBe(false);
  });
  it("라이브 스탯이 있으면 그걸, 없으면 생성값을 쓴다", () => {
    const entities = [pitcher("p1", "TEAM_A"), pitcher("p2", "TEAM_A")];
    const live = { p1: { pitching: attrs(77) } } as never;
    const params = buildRecommendParams({
      protagonist: me,
      entities,
      live,
      catalog,
      injuries: {},
      rules: rules(),
    });
    expect(params.teammates.find((t) => t.id === "p1")?.stamina).toBe(77);
    expect(params.teammates.find((t) => t.id === "p2")?.stamina).toBe(50);
  });
  it("구종에 카탈로그 계열이 붙고, 구종이 없으면 항목을 아예 안 보낸다", () => {
    const entities = [
      pitcher("p1", "TEAM_A", {}, { pitches: [{ id: "PITCH_SLIDER", grade: 4 }] }),
      pitcher("p2", "TEAM_A"),
    ];
    const params = buildRecommendParams({
      protagonist: me,
      entities,
      live: {},
      catalog,
      injuries: {},
      rules: rules(),
    });
    expect(params.me.pitches).toEqual([
      { grade: 3, group: "fastball" },
      { grade: 2, group: "breaking" },
    ]);
    expect(params.teammates.find((t) => t.id === "p1")?.pitches).toEqual([
      { grade: 4, group: "breaking" },
    ]);
    expect(params.teammates.find((t) => t.id === "p2")?.pitches).toBeUndefined();
  });
  it("자리 수는 리그에서 온다 — 고교 3/4/1", () => {
    const params = buildRecommendParams({
      protagonist: me,
      entities: [],
      live: {},
      catalog,
      injuries: {},
      rules: rules(),
      roleOvrBias: 4,
    });
    expect(params.rotationSize).toBe(3);
    expect(params.bullpenSize).toBe(4);
    expect(params.closerSize).toBe(1);
    expect(params.roleOvrBias).toBe(4);
  });
});

describe("배선", () => {
  it("Rust export 가 있다 — recommendPitcherRoleNative", () => {
    const lib = readFileSync(resolve(ROOT, "packages/engine-native/src/lib.rs"), "utf8");
    expect(lib.includes("pub fn recommend_pitcher_role_native(")).toBe(true);
    expect(lib.includes("mod pitcher_role;")).toBe(true);
  });
  it("규칙 파일 가중치 합이 역할마다 1 이다", () => {
    const r = pitcherRoleRules()!;
    for (const role of ["SP", "RP", "CP"]) {
      const sum = Object.values(r.weights[role]).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});
