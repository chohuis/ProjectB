import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 구장 담장 — 4단계 ① (2026-08-30).
 *
 * 🔴 **`stadiums.json` 이 정본이다.** 처음에 `stadiums.csv` 를 고쳤다가
 *   되돌렸다 — 그 csv 는 **어디서도 안 쓴다**(grep 0건). id 체계도 다르다
 *   (`stadium:*` vs `STADIUM_*`).
 *
 * 🔴 **중앙 거리는 이미 있었는데 성격별 한 값씩이었다** —
 *   타자친화 100 · 중립 110 · 투수친화 122. 27개 구장이 세 값만 썼고
 *   **아무도 안 읽었다**(`.dist` 참조 0건).
 *
 * ⚠ 타자친화 100m 는 실제(사직 118)보다 18m 짧았다. 대역을 KBO 에
 *   맞추고 좌·우·펜스를 더했다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

interface Dist {
  lf: number;
  cf: number;
  rf: number;
  fence: number;
}
interface Stadium {
  id: string;
  name: string;
  pf: string;
  dist: Dist;
}

const parks = JSON.parse(read("resource/park/_spec/stadiums.json")) as Stadium[];
const avgOf = (pf: string, k: keyof Dist) => {
  const xs = parks.filter((p) => p.pf === pf);
  return xs.reduce((n, p) => n + p.dist[k], 0) / xs.length;
};

describe("구장 담장", () => {
  it("27개 전부에 좌·중·우·펜스가 있다", () => {
    expect(parks.length).toBe(27);
    for (const p of parks) {
      expect(typeof p.dist?.lf, `${p.name} 좌`).toBe("number");
      expect(typeof p.dist?.cf, `${p.name} 중`).toBe("number");
      expect(typeof p.dist?.rf, `${p.name} 우`).toBe("number");
      expect(typeof p.dist?.fence, `${p.name} 펜스`).toBe("number");
    }
  });

  it("🔴 `park_factor` 와 어긋나지 않는다 — 타자친화가 제일 짧다", () => {
    // 지어낸 값이 아니라 **이미 있는 성격을 숫자로 푼 것**이다.
    // 순서가 뒤집히면 타자친화 구장에서 홈런이 덜 나온다.
    expect(avgOf("타자친화", "cf")).toBeLessThan(avgOf("중립", "cf"));
    expect(avgOf("중립", "cf")).toBeLessThan(avgOf("투수친화", "cf"));
    expect(avgOf("타자친화", "lf")).toBeLessThan(avgOf("투수친화", "lf"));
  });

  it("펜스도 성격을 따른다 — 투수친화가 높다", () => {
    expect(avgOf("타자친화", "fence")).toBeLessThan(avgOf("투수친화", "fence"));
  });

  it("실제 KBO 대역 안이다", () => {
    // 좌·우 92~105 · 중앙 112~130 · 펜스 1.5~5.5
    // (잠실 100/125/2.6 · 사직 95/118/4.8 · 고척 99/122/4.0)
    for (const p of parks) {
      expect(p.dist.lf, `${p.name} 좌`).toBeGreaterThanOrEqual(92);
      expect(p.dist.lf, `${p.name} 좌`).toBeLessThanOrEqual(105);
      expect(p.dist.cf, `${p.name} 중`).toBeGreaterThanOrEqual(112);
      expect(p.dist.cf, `${p.name} 중`).toBeLessThanOrEqual(130);
      expect(p.dist.rf, `${p.name} 우`).toBeGreaterThanOrEqual(92);
      expect(p.dist.rf, `${p.name} 우`).toBeLessThanOrEqual(105);
      expect(p.dist.fence, `${p.name} 펜스`).toBeGreaterThanOrEqual(1.5);
      expect(p.dist.fence, `${p.name} 펜스`).toBeLessThanOrEqual(5.5);
    }
  });

  it("중앙이 좌·우보다 멀다 — 그게 야구장 모양이다", () => {
    for (const p of parks) {
      expect(p.dist.cf, `${p.name}`).toBeGreaterThan(p.dist.lf);
      expect(p.dist.cf, `${p.name}`).toBeGreaterThan(p.dist.rf);
    }
  });

  it("구장마다 다르다 — 27개가 세 값만 쓰면 뜻이 없다", () => {
    const uniq = new Set(parks.map((p) => `${p.dist.lf}/${p.dist.cf}/${p.dist.rf}`));
    expect(uniq.size).toBeGreaterThan(20);
  });

  it("🔴 좌우가 비대칭인 구장이 있다", () => {
    // 전부 대칭이면 좌·우를 따로 둔 뜻이 없다
    const asym = parks.filter((p) => p.dist.lf !== p.dist.rf);
    expect(asym.length).toBeGreaterThan(10);
  });
});
