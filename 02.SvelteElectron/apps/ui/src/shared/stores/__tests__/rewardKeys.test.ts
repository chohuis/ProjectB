import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyEffectToProtagonist } from "../game";
import { parseEffectsArray } from "../master";
import { primeProtagonistTraits, applyTraitMods, traitDefs } from "../../utils/protagonistTraits";
import { NEUTRAL_MODS } from "../../utils/staffEffects";
import type { ProtagonistSave } from "../../types/save";

/**
 * **새 보상 열쇠 열하나** (PLAN_EVENT_TIERS §5 · A 4-3 · 2026-09-08).
 *
 * 🔴 **왜 만들었나.** B 4-2 가 올린 레어 99 가 전부 「XP + 피로」 한 가지
 *   꼴이었다 — §2 가 말한 레어의 보상 폭은 「XP 8~10 · 훈련 효율 N주 ·
 *   기회」인데 뒤 둘을 쓸 열쇠가 없었다. **그게 맞아서가 아니라 없어서**였다.
 *
 * 🔴 **상한은 커리어 누계로 잰다.** 「한 번에 +3 까지」로 재면 +1 짜리를 세 번
 *   받아 넘는다 — 이 저장소가 「한 해에 한 번」 가드에서 두 번 밟은 형태다.
 */
const base = (over: Partial<ProtagonistSave> = {}): ProtagonistSave =>
  ({
    condition: 50,
    fatigue: 50,
    morale: 50,
    money: 1000,
    fame: 50,
    popularity: 50,
    diligence: 50,
    tags: [],
    developmentRate: 50,
    potentialHidden: 70,
    pitches: [{ id: "PITCH_FASTBALL", grade: 3 }],
    battingXP: {},
    batting: {
      ovr: 30,
      contact: 35,
      power: 28,
      eye: 30,
      discipline: 30,
      speed: 50,
      baseInstinct: 50,
      bunting: 45,
      platoon: 50,
      fielding: 45,
      arm: 55,
      battingClutch: 30,
    },
    pitchingXP: {},
    pitching: {
      ovr: 60,
      stamina: 60,
      velocity: 60,
      command: 60,
      control: 60,
      movement: 60,
      mentality: 60,
      recovery: 60,
      clutch: 60,
      holdRunners: 60,
    },
    ...over,
  }) as unknown as ProtagonistSave;

describe("잠재력·성장률 — 커리어 누계 상한", () => {
  it("잠재력은 커리어 누적 +3 까지고, 넘는 몫은 무시한다", () => {
    let p = base();
    for (let i = 0; i < 5; i++) p = applyEffectToProtagonist(p, { potentialDelta: 1 });
    expect(p.potentialGranted).toBe(3);
    expect(p.potentialHidden).toBe(73);
  });

  it("한 번에 크게 줘도 상한을 안 넘는다 — 「한 번에 +3」으로 재면 새는 자리다", () => {
    const p = applyEffectToProtagonist(base(), { potentialDelta: 99 });
    expect(p.potentialGranted).toBe(3);
    expect(p.potentialHidden).toBe(73);
  });

  it("성장률은 커리어 누적 +10 까지다", () => {
    let p = base();
    for (let i = 0; i < 4; i++) p = applyEffectToProtagonist(p, { devRateDelta: 4 });
    expect(p.devRateGranted).toBe(10);
    expect(p.developmentRate).toBe(60);
  });
});

describe("지속 보정 — 겹치면 긴 쪽", () => {
  it("훈련 효율은 긴 쪽이 남는다 — 짧은 쪽으로 덮으면 보상을 뺏는 꼴이다", () => {
    let p = applyEffectToProtagonist(base(), { trainEffBoost: { pct: 10, weeks: 6 } });
    p = applyEffectToProtagonist(p, { trainEffBoost: { pct: 30, weeks: 2 } });
    expect(p.trainEffBoost).toEqual({ pct: 10, weeksLeft: 6 });
  });

  it("더 긴 것이 오면 갈아탄다", () => {
    let p = applyEffectToProtagonist(base(), { trainEffBoost: { pct: 10, weeks: 2 } });
    p = applyEffectToProtagonist(p, { trainEffBoost: { pct: 30, weeks: 8 } });
    expect(p.trainEffBoost).toEqual({ pct: 30, weeksLeft: 8 });
  });

  it("부상 위험도 같은 규칙이다 — 음수가 덜 다치는 쪽", () => {
    const p = applyEffectToProtagonist(base(), { injuryRiskMod: { pct: -20, weeks: 4 } });
    expect(p.injuryRiskMod).toEqual({ pct: -20, weeksLeft: 4 });
  });

  it("🔴 남은 주를 줄이는 자리가 `advanceWeek` 에 있다 — 없으면 영구가 된다", () => {
    const src = readFileSync(resolve("apps/ui/src/shared/usecases/advanceWeek.ts"), "utf8");
    expect(src).toContain("growth.protagonistPatch.trainEffBoost");
    expect(src).toContain("growth.protagonistPatch.injuryRiskMod");
    // 효율 산식에 실제로 곱해지는가 — 안 곱하면 데이터에만 있고 아무 일도 안 한다
    expect(src).toContain("* trainEffFactor");
    expect(src).toContain("myMods.injuryPrevention / injuryRiskFactor");
  });
});

describe("구종 셋", () => {
  it("없는 구종은 등급 1 로 습득한다", () => {
    const p = applyEffectToProtagonist(base(), { pitchGrant: { id: "PITCH_SLIDER" } });
    expect(p.pitches.find((x) => x.id === "PITCH_SLIDER")?.grade).toBe(1);
  });

  it("🔴 이미 있으면 등급 +1 이다 — 「배웠다」가 아무 일도 안 하면 안 된다", () => {
    const p = applyEffectToProtagonist(base(), { pitchGrant: { id: "PITCH_FASTBALL" } });
    expect(p.pitches.find((x) => x.id === "PITCH_FASTBALL")?.grade).toBe(4);
  });

  it("등급은 5 가 상한이다", () => {
    let p = base({ pitches: [{ id: "PITCH_FASTBALL", grade: 5 }] });
    p = applyEffectToProtagonist(p, { pitchGradeUp: { id: "PITCH_FASTBALL" } });
    expect(p.pitches[0].grade).toBe(5);
  });

  it("진행도 점프는 훈련 중일 때만 — 없는 훈련을 만들어 주지 않는다", () => {
    expect(
      applyEffectToProtagonist(base(), { pitchProgressJump: { pct: 30 } }).trainingPitchState,
    ).toBeUndefined();
    const p = applyEffectToProtagonist(
      base({ trainingPitchState: { id: "PITCH_SLIDER", progress: 80 } }),
      { pitchProgressJump: { pct: 30 } },
    );
    expect(p.trainingPitchState).toEqual({ id: "PITCH_SLIDER", progress: 100 });
  });
});

describe("특성·멘토·선발 보장·카운터", () => {
  beforeAll(() => {
    primeProtagonistTraits(
      JSON.parse(readFileSync(resolve("resource/data/master/traits/protagonist.json"), "utf8")),
    );
  });

  it("특성은 중복이 안 쌓인다 — 두 번 받아도 계수가 두 번 곱하면 안 된다", () => {
    let p = applyEffectToProtagonist(base(), { trait: { id: "TRAIT_IRON_ARM" } });
    p = applyEffectToProtagonist(p, { trait: { id: "TRAIT_IRON_ARM" } });
    expect(p.traits).toEqual(["TRAIT_IRON_ARM"]);
  });

  it("🔴 특성은 기존 계수(`StaffMods`)에 곱해진다 — 새 산식이 아니다", () => {
    expect(traitDefs().length).toBe(3);
    const m = applyTraitMods(NEUTRAL_MODS, ["TRAIT_IRON_ARM", "TRAIT_FAST_RECOVERY"]);
    expect(m.injuryPrevention).toBeCloseTo(1.15);
    expect(m.facility).toBeCloseTo(1.15);
    // 모르는 id 는 조용히 넘긴다 — 옛 세이브가 로드를 막으면 안 된다
    expect(applyTraitMods(NEUTRAL_MODS, ["TRAIT_없음"]).injuryPrevention).toBe(1);
  });

  it("멘토는 한 명이다 — 둘째가 오면 덮는다", () => {
    let p = applyEffectToProtagonist(base(), { mentor: { npcId: "PLY_A", pct: 5 } });
    p = applyEffectToProtagonist(p, { mentor: { npcId: "PLY_B", pct: 8 } });
    expect(p.mentor).toEqual({ id: "PLY_B", role: undefined, pct: 8 });
  });

  it("선발 보장은 더해진다 — 「N경기 더」가 두 번이면 그만큼 더다", () => {
    let p = applyEffectToProtagonist(base(), { startGuarantee: { games: 3 } });
    p = applyEffectToProtagonist(p, { startGuarantee: { games: 2 } });
    expect(p.startGuaranteeGames).toBe(5);
  });

  it("카운터를 민다 — `count` 조건(§12)의 유일한 손이다", () => {
    const p = applyEffectToProtagonist(base(), { counterDelta: { menteeCount: 1 } });
    expect(p.counters?.menteeCount).toBe(1);
  });
});

describe("문자열형 표기도 같은 열쇠로 온다", () => {
  it("열하나가 파서를 지난다 — 한쪽만 열면 B 가 쓴 표기가 조용히 버려진다", () => {
    expect(parseEffectsArray(["potential:+2"]).potentialDelta).toBe(2);
    expect(parseEffectsArray(["devRate:+5"]).devRateDelta).toBe(5);
    expect(parseEffectsArray(["trainEff:15/4"]).trainEffBoost).toEqual({ pct: 15, weeks: 4 });
    expect(parseEffectsArray(["injuryRisk:-20/6"]).injuryRiskMod).toEqual({ pct: -20, weeks: 6 });
    expect(parseEffectsArray(["pitchGrant:PITCH_SLIDER"]).pitchGrant).toEqual({
      id: "PITCH_SLIDER",
    });
    expect(parseEffectsArray(["pitchGradeUp:PITCH_SLIDER"]).pitchGradeUp).toEqual({
      id: "PITCH_SLIDER",
    });
    expect(parseEffectsArray(["pitchProgress:+30"]).pitchProgressJump).toEqual({ pct: 30 });
    expect(parseEffectsArray(["trait:TRAIT_IRON_ARM"]).trait).toEqual({ id: "TRAIT_IRON_ARM" });
    expect(parseEffectsArray(["mentor:PLY_A/10"]).mentor).toEqual({ npcId: "PLY_A", pct: 10 });
    expect(parseEffectsArray(["startGuarantee:5"]).startGuarantee).toEqual({ games: 5 });
    expect(parseEffectsArray(["counter.menteeCount:+1"]).counterDelta).toEqual({ menteeCount: 1 });
  });

  it("모르는 카운터 이름은 버린다 — 아무도 안 읽는 칸이 생기면 안 된다", () => {
    expect(parseEffectsArray(["counter.없는칸:+1"]).counterDelta).toBeUndefined();
  });
});

describe("선발 보장이 자리 깊이를 0 으로 본다", () => {
  it("보장 중에는 깊이가 0 이다 — 깊이가 미는 것이 곧 선발 건너뛰기다", async () => {
    const { roleDepthOf } = await import("../../utils/pitcherRoleRules");
    expect(roleDepthOf({ rank: 8, seats: 5 }).roleDepth).toBe(3);
    expect(roleDepthOf({ rank: 8, seats: 5 }, 2).roleDepth).toBe(0);
    expect(roleDepthOf({ rank: 8, seats: 5 }, 0).roleDepth).toBe(3);
  });

  it("쓰는 자리가 있다 — 없으면 보장이 영구가 된다", () => {
    const src = readFileSync(resolve("apps/ui/src/shared/stores/game.ts"), "utf8");
    expect(src).toContain("p.started && guard > 0 ? guard - 1 : guard");
    const app = readFileSync(resolve("apps/ui/src/shared/usecases/applyGameOutcome.ts"), "utf8");
    expect(app).toContain('started: role === "SP"');
  });
});
