import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyEffectToProtagonist } from "../game";
import type { ProtagonistSave } from "../../types/save";
import type { DecisionEffect } from "../../types/main";

/**
 * 선택지 효과 적용.
 *
 * ⚠ **한쪽만 고치는 사고를 막는 검사다.** 예전엔 `resolveDecision`(화면 선택)과
 * `applyEventEffect`(자동 진행)가 같은 `DecisionEffect`를 받으면서 각자 계산을
 * 갖고 있었고, 후자가 **명성·인기·성실·태그 넷을 빠뜨렸다.** 당시 데이터가
 * 우연히 그 넷을 안 써서 안 터졌을 뿐이고, 병역 이벤트에 "성실도 +5"를 하나
 * 넣는 순간 에러 없이 조용히 무시됐을 것이다.
 *
 * 그래서 `DecisionEffect`의 **동기 필드 전부**가 실제로 주인공에 닿는지를 본다.
 */

const base = (): ProtagonistSave => ({
  condition: 50, fatigue: 50, morale: 50, money: 1000,
  fame: 50, popularity: 50, diligence: 50, tags: ["기존"],
  pitchingXP: {}, pitching: {
    ovr: 60, stamina: 60, velocity: 60, command: 60, control: 60,
    movement: 60, mentality: 60, recovery: 60, clutch: 60, holdRunners: 60,
  },
} as unknown as ProtagonistSave);

/**
 * `DecisionEffect`의 동기 필드 → [효과, 그 필드가 닿았는지 보는 함수].
 *
 * 비동기 두 개(`relationDelta`·`luxurySpend`)는 제외한다 — slot.db·Rust
 * 왕복이라 store 동기 패처가 못 하고 `applySideEffects`가 맡는다.
 */
const SYNC_FIELDS: Array<[string, DecisionEffect, (p: ProtagonistSave) => boolean]> = [
  ["conditionDelta",  { conditionDelta: 10 },  (p) => p.condition === 60],
  ["fatigueDelta",    { fatigueDelta: 10 },    (p) => p.fatigue === 60],
  ["moraleDelta",     { moraleDelta: 10 },     (p) => p.morale === 60],
  ["moneyDelta",      { moneyDelta: -100 },    (p) => p.money === 900],
  ["fameDelta",       { fameDelta: 10 },       (p) => p.fame === 60],
  ["popularityDelta", { popularityDelta: 10 }, (p) => p.popularity === 60],
  ["diligenceDelta",  { diligenceDelta: 10 },  (p) => p.diligence === 60],
  ["addTag",          { addTag: ["새태그"] },   (p) => p.tags.includes("새태그")],
  ["xp",              { xp: { command: 5 } },  (p) => p.pitchingXP.command === 5],
  ["statDelta",       { statDelta: { control: 5 } }, (p) => p.pitching.control === 65],
];

describe("applyEffectToProtagonist", () => {
  for (const [name, fx, ok] of SYNC_FIELDS) {
    it(`${name} 가 실제로 적용된다`, () => {
      expect(ok(applyEffectToProtagonist(base(), fx)), name).toBe(true);
    });
  }

  it("원본을 바꾸지 않는다", () => {
    const p = base();
    applyEffectToProtagonist(p, { moraleDelta: 20, addTag: ["x"] });
    expect(p.morale).toBe(50);
    expect(p.tags).toEqual(["기존"]);
  });

  it("범위를 넘지 않는다", () => {
    const hi = applyEffectToProtagonist(base(), {
      conditionDelta: 999, fameDelta: 999, diligenceDelta: 999,
    });
    expect(hi.condition).toBe(100);
    expect(hi.fame).toBe(200);
    expect(hi.diligence).toBe(99);
    const lo = applyEffectToProtagonist(base(), { moraleDelta: -999, moneyDelta: -99999 });
    expect(lo.morale).toBe(0);
    expect(lo.money).toBe(0);
  });

  it("없는 스탯 키는 무시한다", () => {
    // `stat in pitching` 게이트. 오타가 들어와도 죽지 않아야 한다
    const p = applyEffectToProtagonist(base(), { statDelta: { 없는스탯: 5, ovr: 5 } });
    expect(p.pitching.ovr).toBe(60);
  });
});

describe("효과 적용 경로가 하나인가", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

  it("applyEventEffect 가 자기 계산을 갖지 않는다", () => {
    // 예전엔 이 함수가 clamp·xp·statDelta 를 따로 계산하면서 넷을 빠뜨렸다.
    // 정본(`applyEffectToProtagonist`)을 부르기만 해야 한다
    const src = read("../game.ts");
    const body = src.slice(src.indexOf("applyEventEffect(effect"));
    const fn = body.slice(0, body.indexOf("\n    },"));
    expect(fn).toContain("applyEffectToProtagonist");
    expect(fn).not.toContain("fatigueDelta");
    expect(fn).not.toContain("statDelta");
  });

  it("병역 이벤트 선택지가 효과 필드를 손으로 옮겨 적지 않는다", () => {
    // `advanceWeek`가 네 필드만 복사하고 있었다 — 데이터에 성실도를 넣어도
    // 거기서 잘렸다. 구조분해로 통째 전달해야 한다
    const src = read("../../usecases/advanceWeek.ts");
    const i = src.indexOf("const choices = evt.choices");
    expect(i).toBeGreaterThan(-1);
    const stmt = src.slice(i, i + 400);
    expect(stmt).toContain("...effects");
    expect(stmt).not.toContain("moraleDelta:  c.moraleDelta");
  });

  it("자동 진행의 이벤트 처리가 관계·사치품 경로를 거친다", () => {
    const src = read("../../usecases/runAutoAdvance.ts");
    const i = src.indexOf("async function handleEvent");
    expect(i).toBeGreaterThan(-1);
    const fn = src.slice(i, src.indexOf("\n}", i));
    expect(fn).toContain("applySideEffects");
  });
});
