import { describe, it, expect } from "vitest";
import { accumulateStats } from "../season-helpers";
import type { PlayerGameLine } from "../../types/season";
import type { BatterSeasonStats, PitcherSeasonStats } from "../../types/save";

/**
 * **타석·출루율·장타율 식** — 사구·희생타가 생기면서 셋 다 바뀌었다.
 *
 * 🔴 예전 주석이 "희생타·사구를 안 세는 이 모델에서 타석 = 타수 + 볼넷"이라
 *   적고 있었다. **그 사건들이 엔진에 아예 없어서** 맞는 말이었다.
 *   이제 셋 다 일어나므로 야구 규칙대로 센다:
 *
 *       PA  = AB + BB + HBP + SAC + SF
 *       OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
 *       SLG = TB / AB,  TB = 단타 + 2×2B + 3×3B + 4×HR
 *
 * ⚠ **희생번트는 출루율 분모에 안 들어간다.** 야구 규칙이다 — 번트는 작전이라
 *   타자에게 책임을 안 묻는다. 희생플라이는 들어간다.
 *
 * ⚠ **구 세이브는 타석·출루율만 옛 식으로 떨어진다**(값이 없으니 `?? 0`).
 *   장타율은 갈래가 필요 없다 — 장타 수가 0이면 새 식이 옛 근사와 **같은 값**을
 *   낸다(`(h − hr) + 4hr = h + 3hr`). 처음엔 갈래를 뒀다가 변이 검증에서
 *   죽은 코드인 게 드러나 지웠다.
 */

const bat = (o: Partial<Extract<PlayerGameLine, { role: "batter" }>>): PlayerGameLine => ({
  role: "batter", playerId: "P", ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, ...o,
});

const runBat = (lines: PlayerGameLine[]) =>
  accumulateStats({}, lines)["P"] as BatterSeasonStats;

describe("타석 · 출루율", () => {
  it("타석이 사구·희생타를 센다", () => {
    // 타수 4 · 볼넷 1 · 사구 1 · 희생번트 1 · 희생플라이 1 → 타석 8
    const s = runBat([bat({ ab: 4, h: 1, bb: 1, hbp: 1, sac: 1, sf: 1 })]);
    expect(s.pa).toBe(8);
  });

  /** 🔴 **희생번트만 분모에서 빠진다** — 야구 규칙이다 */
  it("출루율 분모에서 희생번트만 빠진다", () => {
    const s = runBat([bat({ ab: 4, h: 1, bb: 1, hbp: 1, sac: 1, sf: 1 })]);
    // (1 + 1 + 1) / (4 + 1 + 1 + 1) = 3/7 = 0.429
    expect(s.obp).toBe(0.429);
  });

  /** ⚠ 구 세이브(값 없음)는 옛 식이다 — PA = AB + BB */
  it("구 세이브는 옛 식으로 떨어진다", () => {
    const s = runBat([bat({ ab: 4, h: 1, bb: 1 })]);
    expect(s.pa).toBe(5);
    expect(s.obp).toBe(0.4);      // 2/5
    expect(s.hbp).toBeUndefined();
  });
});

describe("장타율 · 루타", () => {
  /**
   * 🔴 예전엔 `(h + hr*3)/ab`였다 — 2루타·3루타를 **단타로 세는 근사**다.
   */
  it("루타로 장타율을 낸다", () => {
    // 타수 10 · 안타 4 = 단타 1 + 2루타 2 + 3루타 0 + 홈런 1
    // TB = 1 + 4 + 0 + 4 = 9 → SLG = .900
    const s = runBat([bat({ ab: 10, h: 4, b2: 2, b3: 0, hr: 1 })]);
    expect(s.slg).toBe(0.9);
  });

  /**
   * 🔴 **두 식이 같은 값을 낸다.** 장타 수가 없으면 `?? 0`이 되고
   *   `(h − hr) + 4hr = h + 3hr`로 옛 근사와 **정확히 일치**한다.
   *
   * ⚠ 처음엔 구 세이브용 갈래를 따로 뒀는데 **변이 검증에서 그 갈래를 없애도
   *   검사가 안 깨져** 죽은 코드인 게 드러났다. 그래서 지웠다.
   *   이 검사가 그 사실을 못박는다 — 갈래를 다시 만들지 않게.
   */
  it("장타 수를 몰라도 옛 근사와 같은 값이다", () => {
    const s = runBat([bat({ ab: 10, h: 4, hr: 1 })]);
    // 옛 식: (4 + 3) / 10 = .700
    expect(s.slg).toBe(0.7);
    expect(s.b2).toBeUndefined();
  });

  /** ⚠ 전부 단타면 두 식이 같아야 한다 — 근사가 틀리는 건 장타가 있을 때다 */
  it("전부 단타면 두 식이 같다", () => {
    const a = runBat([bat({ ab: 10, h: 4, b2: 0, b3: 0, hr: 0 })]);
    const b = runBat([bat({ ab: 10, h: 4, hr: 0 })]);
    expect(a.slg).toBe(b.slg);
  });
});

describe("투수 기록", () => {
  const pit = (o: Partial<Extract<PlayerGameLine, { role: "pitcher" }>>): PlayerGameLine => ({
    role: "pitcher", playerId: "P", ip: 0, er: 0, h: 0, k: 0, bb: 0, decision: "ND", ...o,
  });

  it("피홈런·사구가 쌓인다", () => {
    const s = accumulateStats({}, [pit({ ip: 6, h: 5, hr: 2, bb: 1, hbp: 1 })])["P"] as PitcherSeasonStats;
    expect(s.hr).toBe(2);
    expect(s.hbp).toBe(1);
  });

  /** 🔴 **없는 것과 0을 가른다** — 0이면 "피홈런 0인 투수"가 되어 거짓이다 */
  it("구 세이브는 필드를 안 만든다", () => {
    const s = accumulateStats({}, [pit({ ip: 6, h: 5 })])["P"] as PitcherSeasonStats;
    expect(s.hr).toBeUndefined();
    expect(s.hbp).toBeUndefined();
  });
});
