/**
 * **옛 현역 풀 20종이 새 게임에서 한 번도 안 떴다** (2026-09-08 · B 제보 · A 가 이었다).
 *
 * 🔴 사슬: `militaryDecision.enlistProtagonist` 는 `unit === "general"` 이면 **반드시**
 *   `militaryLife` 를 만든다 → `advanceWeek` 이 그걸 보고 새 경로로 빠진다 →
 *   그 경로(`militaryLife.runMilitaryLifeWeek`)는 `militaryLifeEvents` 만 읽었다.
 *   두 풀은 id 가 **하나도 안 겹친다**(실측 0/20) — 다른 이야기가 통째로 죽어 있었다.
 *
 * ⚠ 옛 세이브(`militaryLife` 없음)는 예전 갈래를 그대로 타므로 안 건드렸다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toLifeEvent, isEligible } from "../militaryLifeRules";
import type { MilitaryLifeState } from "../../types/militaryLife";

const pool = (name: string) => {
  const raw = JSON.parse(readFileSync(
    resolve(__dirname, `../../../../../../resource/data/master/events/pools/${name}.json`), "utf8"));
  return (Array.isArray(raw) ? raw : raw.events) as Array<Record<string, unknown>>;
};

const emptyState = () => ({
  cooldown: {}, relations: {}, roleId: null, calendarDone: [],
} as unknown as MilitaryLifeState);

describe("옛 현역 풀 → 병영생활 후보", () => {
  const general = pool("military_general");
  const life = pool("military_life");

  it("두 풀은 id 가 하나도 안 겹친다 — 그래서 죽은 20종이 그대로 손실이었다", () => {
    const ids = new Set(life.map((e) => e.id as string));
    expect(general.filter((e) => ids.has(e.id as string))).toHaveLength(0);
    expect(general.length).toBeGreaterThan(0);
  });

  it("20종이 전부 병영생활 이벤트로 옮겨진다 — 하나도 안 버린다", () => {
    const moved = general.map((e) => toLifeEvent(e as never));
    expect(moved.filter((x) => x === null)).toHaveLength(0);
    expect(moved).toHaveLength(general.length);
  });

  it("🔴 `relationDelta` 를 부대원 관계로 안 읽는다 — 객체가 숫자 칸에 들어가면 조용히 망가진다", () => {
    // 옛 풀은 `{kind,delta}`(관계도), 병영생활은 숫자(부대원 관계)다
    const src = general.find((e) =>
      (e.choices as Array<Record<string, unknown>>).some((c) => typeof c.relationDelta === "object"));
    expect(src).toBeDefined();
    const moved = toLifeEvent(src as never)!;
    const withRel = moved.choices.find((c) => c.extraEffects?.relationDelta);
    expect(withRel).toBeDefined();
    // 숫자 칸은 비어 있어야 한다
    expect(withRel!.relationDelta).toBeUndefined();
    expect(withRel!.extraEffects!.relationDelta).toMatchObject({ delta: expect.any(Number) });
  });

  it("병영생활 칸(피로·사기·감각)은 그대로 온다", () => {
    const boot = toLifeEvent(general.find((e) => e.id === "MIL_GEN_BOOT_CAMP") as never)!;
    expect(boot.maxRank).toBe(0);
    expect(boot.choices[0].fatigueDelta).toBe(5);
    expect(boot.choices[0].moraleDelta).toBe(-2);
    expect(boot.choices[0].ballDelta).toBe(-2);
    // 병영생활 칸만 옮겼으니 남는 것이 없다
    expect(boot.choices[0].extraEffects).toBeUndefined();
  });

  it("옮긴 뒤에도 계급 띠 규칙이 그대로 걸린다 — 훈련소 이벤트가 병장 때 안 뜬다", () => {
    const boot = toLifeEvent(general.find((e) => e.id === "MIL_GEN_BOOT_CAMP") as never)!;
    const ctx = (band: number) => ({
      week: 20, band, roleId: null, state: emptyState(),
      present: new Set<string>(), fatigue: 50, morale: 50, month: 6, defaultCooldown: 8,
    });
    expect(isEligible(boot, ctx(0))).toBe(true);
    expect(isEligible(boot, ctx(3))).toBe(false);
  });
});
