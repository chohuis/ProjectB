import { describe, it, expect } from "vitest";
import spec from "../../../../../../resource/park/_spec/anchors.json";
import { PARK_COORDS, PARK_VIEWBOX, PARK_SPRITE_OFFSETS, type ParkTier } from "../parkAnchors";

/**
 * **화면이 쓰는 좌표가 정본과 같은가.**
 *
 * 🔴 **2026-08-26까지 달랐다.** `anchors.json`은 2026-08-20에 구장 27장
 * 실측으로 고쳐졌는데 `parkAnchors.ts`가 옛 값 그대로였다 — 마운드가 홈→2루의
 * **72% 지점**(정본 63~64%)이라 투수가 마운드보다 위에 떠 있었다.
 * `parkAnchorGeometry.test.ts`는 `anchors.json`만 보고 있어서 못 잡았다.
 * **재는 자리와 쓰는 자리가 달랐다.**
 *
 * ⚠ 그 검사는 "그림이 정하는 관계"를 본다(마운드 비율·베이스 거리).
 *   여기는 **두 파일이 같은가**만 본다. 둘 다 있어야 한다 —
 *   관계만 보면 옛 파일이 안 걸리고, 같은지만 보면 둘이 같이 틀려도 통과한다.
 */

const TIERS: ParkTier[] = ["pro", "university", "highschool"];
const FIELD: Array<[keyof typeof PARK_COORDS.pro.field, string]> = [
  ["home", "HOME"], ["first", "B1"], ["second", "B2"], ["third", "B3"], ["mound", "P"],
];

type XY = [number, number];
const tiers = spec.tiers as unknown as Record<string, {
  field: Record<string, XY>; defense: Record<string, XY>;
}>;

describe("parkAnchors.ts가 정본과 같은가", () => {
  it.each(TIERS)("%s — 베이스와 투수판이 정본 그대로다", (tier) => {
    const f = PARK_COORDS[tier].field;
    for (const [k, K] of FIELD) {
      const m = tiers[tier].field[K];
      expect([f[k].x, f[k].y], `${tier}.${k} — 정본 ${K} ${JSON.stringify(m)}`).toEqual(m);
    }
  });

  it.each(TIERS)("%s — 수비 아홉이 정본 그대로다", (tier) => {
    const d = PARK_COORDS[tier].defense;
    const m = tiers[tier].defense;
    expect(d.length).toBe(Object.keys(m).length);
    for (const one of d) {
      expect([one.x, one.y], `${tier}.${one.pos} — 정본 ${JSON.stringify(m[one.pos])}`)
        .toEqual(m[one.pos]);
    }
  });

  it("좌표계와 스프라이트 오프셋이 정본 그대로다", () => {
    expect(PARK_VIEWBOX.width).toBe(spec.coordSpace.width);
    expect(PARK_VIEWBOX.height).toBe(spec.coordSpace.height);
    const so = spec.spriteOffsets as unknown as {
      batter: { dx: number; dy: number }; runner: Record<string, XY>;
    };
    expect(PARK_SPRITE_OFFSETS.batter).toEqual(so.batter);
    const R: Array<[keyof typeof PARK_SPRITE_OFFSETS.runner, string]> = [
      ["first", "B1"], ["second", "B2"], ["third", "B3"],
    ];
    for (const [k, K] of R) {
      const r = PARK_SPRITE_OFFSETS.runner[k];
      expect([r.dx, r.dy], `runner.${k}`).toEqual(so.runner[K]);
    }
  });
});
