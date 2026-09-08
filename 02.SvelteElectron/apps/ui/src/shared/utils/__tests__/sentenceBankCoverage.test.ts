/**
 * **뽑기가 한 자리를 굶기는가** — 성질을 못박는다 (2026-09-08 · A · B 제보).
 *
 * 🔴 B 가 문안 은행 제목을 12 로 늘리자 `reportCopy.test.ts` 의 「은행을 다 쓴다」가
 *   11/12 로 떨어졌다. 4~16 을 다 돌려 보니 **정확히 12 일 때만** 그 검사의
 *   수열에서 한 자리(4번)에 영영 안 닿는다.
 *
 * ── 판정: **수열의 성질이지 `pickSentence` 의 성질이 아니다** ────────────
 *
 * 그 검사의 난수는 `(i*37)%100 / 100` 이다. 은행 12 면 직전 제외로 후보가 11 이라
 * `k = floor(r*11)` 이고, 자리 4 는 **`k=4 이고 last>4`** 이거나
 * **`k=3 이고 last<=3`** 일 때만 나온다. 그런데 그 수열의 궤도는 고정돼 있어서:
 *
 * ```
 *   k=4 가 나오는 순간(m=37..45)의 last  →  **언제나 0**   → 자리 5 가 나온다
 *   k=3 이 나오는 순간(m=28..36)의 last  →  **언제나 11**  → 자리 3 이 나온다
 * ```
 *
 * 곱수 37 과 모듈러 100 이 만드는 **닫힌 고리**다(주기 100). 다른 곱수(31·17·7)·
 * 균등 스윕·LCG 로는 12 에서도 열두 자리에 다 닿는다 — 실측으로 확인했다.
 *
 * ⚠ **실게임은 Rust 난수라 화면 결함이 아니다.** 그래도 성질은 남으므로,
 *   여기서 「뽑기는 균등한 난수면 모든 자리에 닿는다」를 못박아 다음 사람이
 *   `pickSentence` 를 의심하지 않게 한다.
 */
import { describe, it, expect } from "vitest";
import { pickSentence } from "../sentenceBank";

const bankOf = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

/** 뽑힌 인덱스를 모은다 — 균등 스윕(모든 `last` × 촘촘한 난수) */
function reachable(n: number): Set<number> {
  const bank = bankOf(n);
  const seen = new Set<number>();
  for (let last = -1; last < n; last++) {
    for (let t = 0; t < 500; t++) {
      const got = pickSentence(bank, t / 500, last);
      if (got) seen.add(got.index);
    }
  }
  return seen;
}

describe("pickSentence — 굶는 자리가 있나", () => {
  it("은행 2~24 · 균등 난수면 **모든 자리**에 닿는다", () => {
    const starved: string[] = [];
    for (let n = 2; n <= 24; n++) {
      const seen = reachable(n);
      if (seen.size !== n) {
        starved.push(`${n}: ${[...Array(n).keys()].filter((i) => !seen.has(i)).join(",")}`);
      }
    }
    expect(starved, "은행 크기별로 안 닿는 자리").toEqual([]);
  });

  it("직전 것은 절대 안 나온다 — 그게 이 함수의 일이다", () => {
    for (let n = 2; n <= 12; n++) {
      const bank = bankOf(n);
      for (let last = 0; last < n; last++) {
        for (let t = 0; t < 200; t++) {
          expect(pickSentence(bank, t / 200, last)!.index).not.toBe(last);
        }
      }
    }
  });

  it("🔴 굶은 것은 **검사의 수열**이었다 — 곱수를 바꾸면 12 에서도 다 닿는다", () => {
    const run = (mul: number, n = 12) => {
      const bank = bankOf(n);
      const seen = new Set<number>();
      let last = -1;
      for (let i = 0; i < 200; i++) {
        const got = pickSentence(bank, ((i * mul) % 100) / 100, last)!;
        last = got.index;
        seen.add(got.index);
      }
      return seen.size;
    };
    // 문제의 수열 — 열두 자리 중 열하나만
    expect(run(37)).toBe(11);
    // 곱수만 바꾸면 열둘 다
    for (const mul of [7, 17, 31, 41]) expect(run(mul), `곱수 ${mul}`).toBe(12);
  });

  it("은행 하나면 그것만 · 빈 은행이면 null — 가장자리", () => {
    expect(pickSentence(["only"], 0.5, 0)).toEqual({ text: "only", index: 0 });
    expect(pickSentence([], 0.5, -1)).toBeNull();
  });
});
