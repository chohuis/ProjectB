import { describe, it, expect } from "vitest";
import { careerRoutePriority, SIM_PERSONAS, type SimCareerRoute } from "../simPersona";

/**
 * 🔴 **한 갈래가 구조적으로 0 이면 계측이 아니라 편향이다.**
 *
 * 드라이버가 `해외 > 대학 > 독립` 을 박아 두고 있었고, 고르는 대학이 전력★
 * 최하위 셋이라 입시가 사실상 없었다 — 12판 독립 0 · 성향 3판도 0
 * (`docs/SIM_102_STAGE0_2026-09-12.md`).
 *
 * 여기서 지키는 것은 셋이다:
 *   ① 성향마다 차례가 **다르다**(같으면 성향을 나눈 뜻이 없다)
 *   ② 적어도 한 성향은 **독립을 대학보다 앞에** 둔다
 *   ③ 씨앗이 같으면 늘 같다 · 갈래를 빠뜨리거나 겹치지 않는다
 */
const ROUTES: readonly SimCareerRoute[] = ["overseas", "university", "independent"];

describe("성향이 진로 차례를 고른다", () => {
  it("셋 다 갈래를 하나씩만 담는다 — 빠뜨림·겹침 없음", () => {
    for (const p of SIM_PERSONAS) {
      for (const seed of [0, 1, 7, 20260802, 777, 31337]) {
        const order = careerRoutePriority(p, seed);
        expect([...order].sort(), `${p}/${seed}`).toEqual([...ROUTES].sort());
      }
    }
  });

  it("씨앗이 같으면 늘 같다 — 재현된다", () => {
    for (const p of SIM_PERSONAS) {
      const a = careerRoutePriority(p, 20260802);
      const b = careerRoutePriority(p, 20260802);
      expect(a).toEqual(b);
    }
  });

  it("🔴 성장형은 독립을 대학보다 앞에 둔다 — 즉시 실전이 곧 성장이다", () => {
    const o = careerRoutePriority("growth", 20260802);
    expect(o.indexOf("independent")).toBeLessThan(o.indexOf("university"));
  });

  it("안전형은 대학이 맨 앞이다 — 옛 차례와 같아 기준선이 안 흔들린다", () => {
    expect(careerRoutePriority("safe", 20260802)[0]).toBe("university");
  });

  it("대충형은 씨앗에 따라 차례가 갈린다 — 한 줄로 굳지 않는다", () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => careerRoutePriority("lazy", i * 7 + 1).join(">")),
    );
    // 순열 여섯을 다 보라고 하지는 않는다(씨앗 흩어짐에 기대는 잣대가 된다).
    // 「한 줄로 굳지 않는다」만 못박는다.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("성향 셋의 차례가 서로 다르다 — 같으면 나눈 뜻이 없다", () => {
    const g = careerRoutePriority("growth", 20260802).join(">");
    const s = careerRoutePriority("safe", 20260802).join(">");
    expect(g).not.toBe(s);
  });
});
