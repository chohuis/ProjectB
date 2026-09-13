import { describe, it, expect } from "vitest";
import { schoolPicksFor, SIM_PERSONAS, type SimSchoolOption } from "../simPersona";

/**
 * 🔴 **드라이버가 D등급에만 지원하고 있었다** (2026-09-13 · D 실측).
 *
 * 전력★ 오름차순 셋을 고정으로 골라 대학 50팀 중 **★1 네 팀 가운데 셋**에만
 * 늘 원서를 냈다. C~S 에는 한 번도 안 가서 **사다리를 올려도 실측이 불가능**
 * 했다 — 진로 우선순위가 박혀 독립이 0/12 이던 것과 같은 편향이다.
 *
 * 여기서 지키는 것:
 *   ① 성향마다 고르는 곳이 **다르다**
 *   ② 성장형은 **위를 본다** · 안전형은 **한 곳은 반드시 안전하게** 잡는다
 *   ③ 붙을 곳이 모자라도 **셋을 채운다**(지원을 덜 한 것과 못 붙은 것이 안 섞이게)
 *   ④ 씨앗이 같으면 늘 같다
 */
const 학교 = (power: number, eligible: boolean, n: number): SimSchoolOption => ({
  id: `U${power}_${n}`,
  power,
  eligible,
});

// ★1~★5 각 둘씩 · ★3 이하만 붙는다
const POOL: SimSchoolOption[] = [1, 2, 3, 4, 5].flatMap((p) => [
  학교(p, p <= 3, 1),
  학교(p, p <= 3, 2),
]);

describe("성향이 대학 등급을 고른다", () => {
  it("셋을 고른다 — 붙을 곳이 모자라도 빈 자리를 안 남긴다", () => {
    const 붙는곳없음 = POOL.map((s) => ({ ...s, eligible: false }));
    for (const p of SIM_PERSONAS) {
      expect(schoolPicksFor(p, POOL, 1), p).toHaveLength(3);
      expect(schoolPicksFor(p, 붙는곳없음, 1), `${p}/전부 불합격 예상`).toHaveLength(3);
    }
  });

  it("후보가 셋보다 적으면 있는 만큼만", () => {
    expect(schoolPicksFor("growth", POOL.slice(0, 2), 1)).toHaveLength(2);
    expect(schoolPicksFor("safe", [], 1)).toEqual([]);
  });

  it("🔴 성장형은 붙는 곳 중 **가장 높은** 등급을 먼저 본다", () => {
    const got = schoolPicksFor("growth", POOL, 1);
    const powers = got.map((id) => POOL.find((s) => s.id === id)!.power);
    // 붙는 것은 ★1~★3 이고 그중 위부터 — ★3 둘이 먼저다
    expect(powers[0]).toBe(3);
    expect(powers.every((p) => p <= 3)).toBe(true);
  });

  it("성장형은 붙을 곳이 모자라면 **한 단계 위로 도전**한다", () => {
    const 하나만 = POOL.map((s) => ({ ...s, eligible: s.power === 1 && s.id.endsWith("_1") }));
    const got = schoolPicksFor("growth", 하나만, 1);
    const powers = got.map((id) => 하나만.find((s) => s.id === id)!.power);
    expect(powers[0], "붙는 곳을 먼저").toBe(1);
    expect(
      powers.slice(1).some((p) => p > 1),
      "그다음은 위로 뻗는다",
    ).toBe(true);
  });

  it("🔴 안전형은 **한 곳을 반드시 안전하게** 잡는다 — 가장 낮은 붙는 곳", () => {
    const got = schoolPicksFor("safe", POOL, 1);
    const powers = got.map((id) => POOL.find((s) => s.id === id)!.power);
    expect(Math.min(...powers), "제일 낮은 붙는 곳이 들어 있어야 한다").toBe(1);
    expect(
      powers.every((p) => p <= 3),
      "안전형은 못 붙을 곳으로 안 뻗는다",
    ).toBe(true);
  });

  it("성장형과 안전형이 서로 다른 곳을 고른다", () => {
    expect(schoolPicksFor("growth", POOL, 1).join()).not.toBe(
      schoolPicksFor("safe", POOL, 1).join(),
    );
  });

  it("대충형은 씨앗이 같으면 늘 같고, 씨앗이 다르면 갈린다", () => {
    expect(schoolPicksFor("lazy", POOL, 42)).toEqual(schoolPicksFor("lazy", POOL, 42));
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => schoolPicksFor("lazy", POOL, i * 31 + 1).join()),
    );
    expect(seen.size, "한 줄로 굳으면 무작위가 아니다").toBeGreaterThan(1);
  });

  it("같은 학교를 두 번 고르지 않는다", () => {
    for (const p of SIM_PERSONAS) {
      for (const seed of [1, 7, 20260802]) {
        const got = schoolPicksFor(p, POOL, seed);
        expect(new Set(got).size, `${p}/${seed}`).toBe(got.length);
      }
    }
  });
});
