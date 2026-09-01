import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **상황판 다이아몬드가 마름모인가.**
 *
 * 🔴 **2026-08-26까지 네 베이스가 8px씩 어긋나 있었다.** `.base`는 16px인데
 *   `left: 52px`가 **절반을 안 빼서** 상자 모서리가 52에 놓였다 —
 *   중심이 60이 되어 다이아몬드 중앙(52)에서 밀렸다.
 *   홈-1루 28.3 대 2루-3루 50.9로, **홈과 1루만 붙어 보였다.**
 *
 * ⚠ **좌표를 베껴 적지 않는다.** 값을 바꿀 때 검사도 같이 바꾸게 되면
 *   아무것도 못 잡는다. **네 변이 같은가**만 본다 — 그게 마름모의 정의다.
 * ⚠ 경기장 그림 위의 좌표(`parkAnchors`)와는 **다른 것이다.** 이건 우측
 *   상황판의 작은 위젯이고, 그쪽은 `parkAnchorsMatchSpec.test.ts`가 본다.
 *
 * 🔴 **2026-09-01 — 다이아몬드가 줄어들 수 있게 됐다.** 720p 에서 선수 카드가
 *   이름만 남아서, 짧은 높이일 때 상황 패널이 자리를 내주기로 했다(88px).
 *   좌표가 px 로 박혀 있어 그대로 줄였더니 **네 베이스가 제자리를 벗어났다** —
 *   위에 적힌 것과 같은 종류의 어긋남이 다시 났다.
 *
 *   비율로 옮겼다. `15.38% x 104 = 16` · `calc(50% - 8px) = 44` 라
 *   **104px 에서는 값이 한 픽셀도 안 바뀐다.**
 *
 *   ⚠ 그래서 이 검사는 이제 **두 크기 모두**에서 돈다. 줄어든 쪽이 안 깨지는지
 *     보는 것이 요점이다 — 한 크기만 보면 이번 결함을 또 놓친다.
 */

const CSS = readFileSync(resolve(__dirname, "../MatchPage.svelte"), "utf8");

/** `.diamond`와 `.base`의 크기를 소스에서 읽는다 */
function px(selector: string, prop: string): number {
  const re = new RegExp("^\\s*[.]" + selector + "\\s*[{]", "m");
  const at = CSS.search(re);
  if (at < 0) throw new Error(selector + " 규칙이 없다");
  const block = CSS.slice(at);
  const m = block.slice(0, block.indexOf("}")).match(new RegExp(prop + ":\\s*(\\d+)px"));
  if (!m) throw new Error(`${selector}의 ${prop}을 못 읽었다`);
  return Number(m[1]);
}

/**
 * `.b1 { top: calc(50% - 8px); right: 15.38%; }` 같은 한 줄에서 좌표를 읽어
 * **주어진 상자 크기 기준의 px** 로 푼다.
 *
 * ⚠ 셋을 다 받는다 — `16px` · `15.38%` · `calc(50% - 8px)`.
 *   브라우저가 푸는 것과 같은 방식이라야 검사가 실물을 본다.
 */
function edges(cls: string, box: number): Record<string, number> {
  const line = CSS.split("\n").find((l) => l.trim().startsWith(`.${cls} {`));
  if (!line) throw new Error(`.${cls} 규칙이 없다`);
  const out: Record<string, number> = {};
  for (const m of line.matchAll(/(top|left|right|bottom):\s*([^;]+);/g)) {
    out[m[1]] = resolveLen(m[2].trim(), box, cls);
  }
  return out;
}

/** `16px` · `15.38%` · `calc(50% - 8px)` 을 px 로 푼다. */
function resolveLen(v: string, box: number, cls: string): number {
  let m = v.match(/^(-?[\d.]+)px$/);
  if (m) return Number(m[1]);
  m = v.match(/^([\d.]+)%$/);
  if (m) return (Number(m[1]) / 100) * box;
  m = v.match(/^calc\(\s*([\d.]+)%\s*([-+])\s*([\d.]+)px\s*\)$/);
  if (m) return (Number(m[1]) / 100) * box + (m[2] === "-" ? -1 : 1) * Number(m[3]);
  throw new Error(`.${cls} 의 "${v}" 를 못 읽었다 — 단위가 늘었나`);
}

/**
 * 짧은 높이 블록이 다이아몬드를 줄인다. **그 숫자도 소스에서 읽는다** —
 * 여기 베껴 적으면 블록이 바뀔 때 검사가 조용히 낡는다.
 */
function shrunkBox(): number | null {
  const at = CSS.indexOf("@media (max-height:");
  if (at < 0) return null;
  const block = CSS.slice(at, CSS.indexOf("\n  }", at));
  return Number(block.match(/\.diamond \{[^}]*width:\s*(\d+)px/)?.[1]) || null;
}

/** 기본 크기와 **짧은 높이에서 줄어든 크기**. 둘 다에서 마름모여야 한다. */
const SIZES = [px("diamond", "width"), shrunkBox()]
  .filter((v): v is number => typeof v === "number");

describe.each(SIZES)("상황판 다이아몬드 (%dpx)", (BOX) => {
  const SZ = px("base", "width");
  const half = SZ / 2;

  const centerOf = (cls: string): [number, number] => {
    const e = edges(cls, BOX);
    const x = e.left !== undefined ? e.left + half : BOX - (e.right ?? 0) - half;
    const y = e.top !== undefined ? e.top + half : BOX - (e.bottom ?? 0) - half;
    return [x, y];
  };

  const P = {
    home: centerOf("home"), b1: centerOf("b1"),
    b2: centerOf("b2"), b3: centerOf("b3"),
  };
  const dist = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  it("네 변의 길이가 같다 — 마름모의 정의다", () => {
    const sides = [
      dist(P.home, P.b1), dist(P.b1, P.b2),
      dist(P.b2, P.b3), dist(P.b3, P.home),
    ];
    for (const s of sides) {
      expect(s, `변 길이 ${sides.map((v) => v.toFixed(1)).join(" / ")}`)
        .toBeCloseTo(sides[0], 5);
    }
  });

  it("홈과 2루가 세로 한 줄에, 1루와 3루가 가로 한 줄에 있다", () => {
    expect(P.home[0]).toBeCloseTo(P.b2[0], 5);
    expect(P.b1[1]).toBeCloseTo(P.b3[1], 5);
  });

  it("다이아몬드 한가운데를 중심으로 대칭이다", () => {
    const c = BOX / 2;
    // ⚠ 비율이 섞이면서 값이 정수가 아니게 됐다. 근사로 본다
    expect((P.home[1] + P.b2[1]) / 2).toBeCloseTo(c, 5);
    expect((P.b1[0] + P.b3[0]) / 2).toBeCloseTo(c, 5);
    expect(P.home[0]).toBeCloseTo(c, 5);
    expect(P.b1[1]).toBeCloseTo(c, 5);
  });

  it("네 베이스가 상자 안에 있다", () => {
    for (const [k, [x, y]] of Object.entries(P)) {
      expect(x - half, k).toBeGreaterThanOrEqual(0);
      expect(y - half, k).toBeGreaterThanOrEqual(0);
      expect(x + half, k).toBeLessThanOrEqual(BOX);
      expect(y + half, k).toBeLessThanOrEqual(BOX);
    }
  });
});
