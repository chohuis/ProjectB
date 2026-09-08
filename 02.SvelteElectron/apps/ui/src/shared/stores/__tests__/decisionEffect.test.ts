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
  battingXP: {}, batting: {
    ovr: 30, contact: 35, power: 28, eye: 30, discipline: 30, speed: 50,
    baseInstinct: 50, bunting: 45, platoon: 50, fielding: 45, arm: 55, battingClutch: 30,
  },
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
    // ⚠ 2026-09-09 에 인자가 둘이 되며(구종 보상 등급 문지기 · R1) 서명이
    //   여러 줄로 나뉘었다 — 열린 괄호까지만 짚는다
    const src = read("../game.ts");
    const body = src.slice(src.indexOf("applyEventEffect("));
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
    // 2026-09-02: 헤드리스(handleEvent)와 화면(이벤트 모달)이 같은 `resolveEventPending` 을 부른다 —
    // 효과 셋(applyEventEffect · applySideEffects · applyMilitaryEventChoice)은 그 안에 한 번만 있다
    const h = src.indexOf("async function handleEvent");
    expect(h).toBeGreaterThan(-1);
    expect(src.slice(h, src.indexOf("\n}", h))).toContain("resolveEventPending(");
    const i = src.indexOf("export async function resolveEventPending");
    expect(i).toBeGreaterThan(-1);
    const fn = src.slice(i, src.indexOf("\n}", i));
    expect(fn).toContain("applySideEffects");
    expect(fn).toContain("applyMilitaryEventChoice");
  });
});

/**
 * **보상 대상: 투구 / 타격** (2026-08-24).
 *
 * 예전엔 `xp`·`statDelta`가 `pitchingXP`·`pitching` 고정이라 **타자 주인공이
 * 이벤트로 성장할 길이 아예 없었다.** 키에 접두사를 붙여 가른다.
 *
 * 🔴 **제일 중요한 건 마지막 검사다.** 접두사 없는 키는 예전처럼 투구여야 한다 —
 * 데이터 296곳이 그 형태이고, `ovr`처럼 양쪽에 다 있는 이름이 조용히 타격으로
 * 새면 아무도 모른다.
 */
describe("보상 대상 — 투구/타격", () => {
  it("batting. 접두사는 타격으로 간다", () => {
    const p = applyEffectToProtagonist(base(), { statDelta: { "batting.contact": 5 } });
    expect(p.batting.contact).toBe(base().batting.contact + 5);
    expect(p.pitching.command).toBe(base().pitching.command);
  });

  it("batting. 접두사 xp는 battingXP로 쌓인다", () => {
    const p = applyEffectToProtagonist(base(), { xp: { "batting.power": 7 } });
    expect(p.battingXP?.power).toBe(7);
    // ⚠ `power`는 투구 키가 아니라 `pitchingXP`에 물을 수조차 없다(타입이 잡는다).
    // 투구 쪽이 통째로 안 늘었는지를 본다
    expect(Object.keys(p.pitchingXP ?? {})).toHaveLength(0);
  });

  it("🔴 접두사 없는 키는 예전처럼 투구다 — 기존 데이터 296곳이 그 형태다", () => {
    const p = applyEffectToProtagonist(base(), { statDelta: { command: 3 }, xp: { velocity: 4 } });
    expect(p.pitching.command).toBe(base().pitching.command + 3);
    expect(p.pitchingXP?.velocity).toBe(4);
    expect(p.batting.contact).toBe(base().batting.contact);
  });

  it("ovr은 양쪽 다 못 바꾼다 — 파생값이다", () => {
    const p = applyEffectToProtagonist(base(), { statDelta: { ovr: 9, "batting.ovr": 9 } });
    expect(p.pitching.ovr).toBe(base().pitching.ovr);
    expect(p.batting.ovr).toBe(base().batting.ovr);
  });
});
