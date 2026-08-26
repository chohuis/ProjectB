import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * **표기 규칙이 다시 흩어지지 않는가.**
 *
 * 🔴 실플에서 나온 것들이 전부 같은 뿌리였다(2026-08-26):
 *   · 타율이 `.30` — `toFixed(2)`를 쓰는 자리가 있었다
 *   · IP가 `5.7` — `toFixed(1)`은 야구 표기가 아니다(`.7`은 없다)
 *   · 피로가 `58.333333` — 아무 반올림이 없었다
 *
 * 같은 일을 하는 함수가 **셋 이상** 흩어져 있었고, 그중 일부만 맞았다.
 * 정본은 `baseballFormat.ts`다 — 새 자리에서 다시 만들면 여기가 잡는다.
 *
 * ⚠ **`baseballFormat.ts` 자신은 검사하지 않는다** — 거기가 정의하는 곳이다.
 */

const SRC = resolve(__dirname, "../../..");
const CANON = "baseballFormat";

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    if (f === "node_modules" || f === "__tests__") continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith(".ts") || f.endsWith(".svelte")) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).filter((p) => !p.includes(CANON));

/** 그 자리가 정본을 이미 쓰고 있으면 봐준다 — 옮기는 중일 수 있다 */
const usesCanon = (src: string) => src.includes(CANON);

describe("표기 규칙이 한곳에 있는가", () => {
  // 🔴 타율·출루율·장타율은 셋째 자리다. `toFixed(2)` + `replace(/^0/)`는 `.30`을 만든다
  it("타율을 소수 둘째 자리로 만드는 자리가 없다", () => {
    const bad: string[] = [];
    for (const p of FILES) {
      const src = readFileSync(p, "utf8");
      if (/avg[^;\n]*toFixed\(2\)/.test(src) && !usesCanon(src)) bad.push(p.replace(SRC, ""));
    }
    expect(bad, `타율을 2자리로: ${bad.join(", ")}`).toEqual([]);
  });

  // 🔴 `toFixed(1)`은 `.7` 같은 없는 표기를 만든다 — `ipLabel`을 써야 한다
  it("이닝을 toFixed(1)로 찍는 자리가 없다", () => {
    const bad: string[] = [];
    for (const p of FILES) {
      const src = readFileSync(p, "utf8");
      if (/\bip[^;\n]*toFixed\(1\)/.test(src) && !usesCanon(src)) bad.push(p.replace(SRC, ""));
    }
    expect(bad, `이닝을 toFixed(1)로: ${bad.join(", ")}`).toEqual([]);
  });
});
