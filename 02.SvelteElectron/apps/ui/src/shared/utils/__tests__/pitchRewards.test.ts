/**
 * **구종 보상 — 배우는 중이냐로 갈리고, 유니크부터 먹는다**
 * (2026-09-09 · R1 · `docs/PLAN_REWARDS_2026-09-09.md` §2 · 사용자 확정).
 *
 * 🔴 구종을 주는 보상이 커리어 전체에 **여덟 건**뿐이었다(733종 중). 늘리기로
 *   하면서 사용자가 두 줄을 확정했다 — **유니크부터** · **훈련이 주, 이벤트는
 *   가속**. 그리고 한 줄 더:
 *
 *   > 「기존에 배우고 있는 것만 경험치로 뜨거나, 새로 배우는 건 기존에 배우는
 *   >  게 안 뜨거나 하는 게 있어야 하지 않나」
 *
 *   그래서 **효과 키가 아니라 조건으로 후보를 가른다**(`pitch_learning`).
 */
import { describe, it, expect, vi } from "vitest";
import { evaluateCondition } from "../conditionEvaluator";
import {
  PITCH_REWARD_KEYS,
  PITCH_REWARD_GRADES,
  pitchRewardsOf,
  gatePitchRewards,
} from "../pitchRewards";
import type { EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

const ctx = (learning: { id: string; progress: number } | undefined): EventContext =>
  ({
    protagonist: { id: "P", trainingPitchState: learning } as unknown as ProtagonistSave,
    currentWeek: 5,
    seasonPhase: "season",
    standings: [],
    stats: {},
    triggeredEvents: {},
  }) as unknown as EventContext;

describe("`pitch_learning` — 배우는 중인가", () => {
  it("배우는 중이면 true 쪽이 열린다", () => {
    const c = ctx({ id: "PITCH_SLIDER", progress: 40 });
    expect(evaluateCondition({ type: "pitch_learning", value: true }, c)).toBe(true);
    expect(evaluateCondition({ type: "pitch_learning", value: false }, c)).toBe(false);
  });

  it("안 배우는 중이면 false 쪽이 열린다 — 새 구종을 줄 자리가 비어 있다", () => {
    const c = ctx(undefined);
    expect(evaluateCondition({ type: "pitch_learning", value: false }, c)).toBe(true);
    expect(evaluateCondition({ type: "pitch_learning", value: true }, c)).toBe(false);
  });

  it("🔴 진행도 0 도 배우는 중이다 — 막 시작한 주에 새 구종을 얹으면 시작한 것이 지워진다", () => {
    expect(
      evaluateCondition(
        { type: "pitch_learning", value: true },
        ctx({ id: "PITCH_CURVE", progress: 0 }),
      ),
    ).toBe(true);
  });

  it("두 갈래는 배타다 — 어느 쪽도 안 열리는 주가 없다", () => {
    for (const st of [undefined, { id: "X", progress: 0 }, { id: "X", progress: 99 }]) {
      const c = ctx(st);
      const t = evaluateCondition({ type: "pitch_learning", value: true }, c);
      const f = evaluateCondition({ type: "pitch_learning", value: false }, c);
      expect(t !== f, "둘 다 열리거나 둘 다 닫히면 안 된다").toBe(true);
    }
  });
});

describe("구종 보상 등급 문지기", () => {
  it("열쇠 셋 · 먹는 등급 둘", () => {
    expect([...PITCH_REWARD_KEYS].sort()).toEqual([
      "pitchGradeUp",
      "pitchGrant",
      "pitchProgressJump",
    ]);
    expect([...PITCH_REWARD_GRADES]).toEqual(["unique", "hidden"]);
  });

  it("유니크·히든이면 그대로 먹는다", () => {
    const fx = { pitchGrant: { id: "PITCH_SLIDER" }, moraleDelta: 3 };
    expect(gatePitchRewards(fx, "unique")).toBe(fx);
    expect(gatePitchRewards(fx, "hidden")).toBe(fx);
  });

  it("🔴 노말·레어면 구종만 떼어 낸다 — 나머지 보상은 그대로다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const g of ["normal", "rare"] as const) {
      const out = gatePitchRewards(
        { pitchGrant: { id: "X" }, pitchGradeUp: { id: "Y" }, moraleDelta: 3, xp: { command: 2 } },
        g,
      );
      expect(pitchRewardsOf(out)).toEqual([]);
      expect(out.moraleDelta).toBe(3);
      expect(out.xp).toEqual({ command: 2 });
    }
    // 조용히 넘어가지 않는다
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("등급을 모르면 안 먹인다 — 등급 없는 자리에서 구종이 나오면 출처를 모른다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(pitchRewardsOf(gatePitchRewards({ pitchProgressJump: { pct: 40 } }, undefined))).toEqual(
      [],
    );
    warn.mockRestore();
  });

  it("구종 보상이 없으면 원본을 그대로 돌려준다 — 사본을 안 만든다", () => {
    const fx = { moraleDelta: 1 };
    expect(gatePitchRewards(fx, "normal")).toBe(fx);
  });

  it("원본을 안 건드린다 — 소식에 실린 효과는 스냅샷이라 그대로 남아야 한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fx = { pitchGrant: { id: "X" } };
    gatePitchRewards(fx, "normal");
    expect(fx.pitchGrant).toEqual({ id: "X" });
    warn.mockRestore();
  });
});
