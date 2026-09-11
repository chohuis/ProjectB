import { describe, it, expect } from "vitest";
import anchors from "../../../../../../resource/park/_spec/anchors.json";

/**
 * 구장 앵커가 **그림과 같은 모양인가**.
 *
 * 🔴 **2026-08-20까지 어긋나 있었다.** 앵커 다이아몬드가 그림보다 세로로
 * 17% 길어서 1루수·3루수가 베이스보다 42px 위 잔디에 떠 있었고, 투수는
 * 마운드보다 69px 위였다. `fit-park-anchors.cjs`가 "프로는 정본이라 손대지
 * 않는다"고 박아 두고 대학·고교를 그 프로에 맞춘 탓에 셋이 같이 틀어졌다.
 * `_measured`에 그림에서 잰 베이스가 이미 들어 있었는데 쓰이질 않았다.
 *
 * ⚠ **좌표를 그대로 베껴 적지 않는다.** 그러면 값을 바꿀 때 검사도 같이
 * 바꾸게 되어 아무것도 못 잡는다. **그림이 정하는 관계**만 본다:
 * `_measured`의 베이스와 맞는가 · 마운드가 홈→2루의 몇 % 지점인가.
 */

type XY = [number, number];
type Tier = { field: Record<string, XY>; defense: Record<string, XY> };

const tiers = anchors.tiers as unknown as Record<string, Tier>;
const measured = anchors._measured as unknown as Record<string, { bases: Record<string, XY> }>;

const TIERS = ["pro", "university", "highschool"] as const;

/** 앵커와 `_measured` 베이스가 붙어 있어야 하는 거리 (px) */
const BASE_TOLERANCE = 3;

/** 마운드는 홈→2루의 64% 지점이다 — 그림 27장이 티어마다 같은 값을 냈다 */
const MOUND_RATIO = 0.64;
const MOUND_RATIO_TOLERANCE = 0.03;

describe("구장 앵커가 그림과 같은 모양인가", () => {
  // ⚠ **대학은 `_measured`가 기준이 아니다.** `tier_university.png`만
  // 1317×1194이고 실제 대학 구장 9장은 1306×1204다 — 기준 그림에서 잰 값이라
  // 실제 구장과 3px쯤 어긋난다. 04가 실제 9장을 재서 잡은 값이 정본이다.
  // **오차를 늘려 덮지 않는다** — 늘리면 진짜 어긋남도 같이 통과한다
  it.each(TIERS.filter((t) => t !== "university"))(
    "%s — 베이스 넷이 그림에서 잰 자리에 있다",
    (tier) => {
      const f = tiers[tier].field;
      const m = measured[tier].bases;
      const pairs: Array<[string, string]> = [
        ["HOME", "HOME"],
        ["B1", "B1"],
        ["B2", "B2"],
        ["B3", "B3"],
      ];
      for (const [k, mk] of pairs) {
        const d = Math.hypot(f[k][0] - m[mk][0], f[k][1] - m[mk][1]);
        expect(
          d,
          `${tier}.${k} 앵커 ${f[k]} vs 그림 ${m[mk]} — ${d.toFixed(1)}px 떨어져 있다`,
        ).toBeLessThanOrEqual(BASE_TOLERANCE);
      }
    },
  );

  it.each(TIERS)("%s — 마운드가 홈→2루의 64% 지점이다", (tier) => {
    const f = tiers[tier].field;
    const span = f.HOME[1] - f.B2[1];
    const ratio = (f.HOME[1] - f.P[1]) / span;
    expect(ratio, `${tier} 마운드가 ${(ratio * 100).toFixed(0)}% 지점이다`).toBeCloseTo(
      MOUND_RATIO,
      1,
    );
    expect(Math.abs(ratio - MOUND_RATIO)).toBeLessThanOrEqual(MOUND_RATIO_TOLERANCE);
  });

  it.each(TIERS)("%s — 1루수·3루수가 베이스에 붙어 있다", (tier) => {
    const f = tiers[tier].field;
    const d = tiers[tier].defense;
    // 수비수는 베이스보다 안쪽(홈 쪽)에 서지만 멀리 떨어지지 않는다.
    // 옛 값은 42px 위 잔디에 떠 있었다
    for (const [pos, base] of [
      ["1B", "B1"],
      ["3B", "B3"],
    ] as const) {
      const dy = d[pos][1] - f[base][1];
      expect(dy, `${tier} ${pos}가 ${base}보다 ${-dy}px 위에 있다`).toBeGreaterThan(-20);
      expect(dy).toBeLessThan(30);
    }
  });

  it("포수는 홈보다 뒤(아래)에 있다", () => {
    for (const tier of TIERS) {
      const f = tiers[tier].field;
      const d = tiers[tier].defense;
      expect(d.C[1], `${tier} 포수가 홈보다 앞에 있다`).toBeGreaterThan(f.HOME[1]);
    }
  });
});
