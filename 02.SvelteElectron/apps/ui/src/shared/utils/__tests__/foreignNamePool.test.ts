import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **외국인 선수 이름이 한글로 나오는가.**
 *
 * 🔴 실플에서 KBL 외국인이 `victor gibson`처럼 **영문 그대로** 떴다(2026-08-26).
 *   `foreignRules.namePool`에 **한글 짝이 하나도 없었다** — 엔진은
 *   짝이 없으면 영문을 그대로 쓴다(`gen_name_pooled`).
 *
 * ⚠ `LEAGUE_ABL.namePool`에는 48성·54이름이 이미 있었고 **목록이 글자 하나까지
 *   같았다.** 그래서 그쪽 것을 그대로 옮겼다.
 */

const RULES = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../../../resource/data/master/players/generation_rules.json"),
    "utf8",
  ),
);

type Pool = {
  western?: boolean;
  surnames: string[];
  givenA: string[];
  surnamesKo?: string[];
  givenAKo?: string[];
};

/** `western: true`인 풀 — 원본이 영문이라 한글 짝이 필요하다 */
function westernPools(): Array<[string, Pool]> {
  const out: Array<[string, Pool]> = [];
  const walk = (o: Record<string, unknown>, path: string) => {
    for (const [k, v] of Object.entries(o ?? {})) {
      if (k === "namePool" && v && (v as Pool).western) out.push([path, v as Pool]);
      else if (v && typeof v === "object") walk(v as Record<string, unknown>, `${path}.${k}`);
    }
  };
  walk(RULES, "");
  return out;
}

const HANGUL = /[가-힣]/;

describe("외국인 이름 풀", () => {
  const pools = westernPools();

  it("서양식 풀이 실제로 있다 — 없으면 아래가 다 헛돈다", () => {
    expect(pools.length).toBeGreaterThan(0);
  });

  // 🔴 짝이 없으면 엔진이 영문을 그대로 쓴다
  it("서양식 풀은 전부 한글 짝을 갖는다", () => {
    const bad = pools.filter(([, p]) => !p.surnamesKo?.length || !p.givenAKo?.length);
    expect(
      bad.map(([n]) => n),
      `한글 짝이 없는 풀: ${bad.map(([n]) => n).join(", ")}`,
    ).toEqual([]);
  });

  // 🔴 인덱스로 짝을 짓는다 — 길이가 다르면 엉뚱한 이름이 붙는다
  it("한글 짝의 개수가 원본과 같다", () => {
    for (const [name, p] of pools) {
      expect(p.surnamesKo!.length, `${name} 성`).toBe(p.surnames.length);
      expect(p.givenAKo!.length, `${name} 이름`).toBe(p.givenA.length);
    }
  });

  it("한글 짝이 실제로 한글이다", () => {
    for (const [name, p] of pools) {
      for (const s of p.surnamesKo!) expect(HANGUL.test(s), `${name}: ${s}`).toBe(true);
      for (const s of p.givenAKo!) expect(HANGUL.test(s), `${name}: ${s}`).toBe(true);
    }
  });

  /**
   * ⚠ **같은 영문 이름이 리그마다 다른 한글로 나오면 안 된다.**
   *   목록이 같은 풀끼리는 한글 짝도 같아야 한다.
   */
  it("목록이 같은 풀은 한글 짝도 같다", () => {
    const byKey = new Map<string, Array<[string, Pool]>>();
    for (const [n, p] of pools) {
      const key = JSON.stringify([p.surnames, p.givenA]);
      byKey.set(key, [...(byKey.get(key) ?? []), [n, p]]);
    }
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      const first = JSON.stringify([group[0][1].surnamesKo, group[0][1].givenAKo]);
      for (const [n, p] of group.slice(1)) {
        expect(JSON.stringify([p.surnamesKo, p.givenAKo]), `${n}이 ${group[0][0]}과 다르다`).toBe(
          first,
        );
      }
    }
  });
});
