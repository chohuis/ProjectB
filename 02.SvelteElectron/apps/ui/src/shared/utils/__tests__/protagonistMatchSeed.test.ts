import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { protagonistMatchSeed } from "../protagonistMatchSeed";
import { isMeasureMode } from "../measureMode";

/**
 * 주인공 경기 씨앗 — **계측 모드에서만 붙는가, 그리고 호출부가 안 빠뜨렸는가.**
 *
 * 🔴 2026-09-07 실측: 같은 씨앗·프리셋·훈련으로 고교 3년 → 드래프트를 세 번
 * 돌렸더니 2R11P → 10R91P → 5R47P 였다. 리그 경기는 씨앗을 받는데 주인공
 * 경기 호출부만 안 넘겨서 Rust 가 `thread_rng` 로 떨어진 것이었다
 * (`BALANCE_BASELINE_101.md §2`). 그 상태에서는 밸런스 전후를 못 잰다.
 *
 * ⚠ 이 검사는 **배선**만 본다. 실제로 두 번 돌려 결과가 같은지는
 *   `npm run check:measurerepro` 다(판당 수 분이라 여기 못 넣는다).
 */

const UI = join(__dirname, "../../..");   // apps/ui/src

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".svelte")) out.push(p);
  }
  return out;
}

/** `<marker>(` 부터 짝이 맞는 닫는 괄호까지 */
function callsOf(src: string, marker: string): string[] {
  const out: string[] = [];
  let i = src.indexOf(marker);
  while (i >= 0) {
    let depth = 0, j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") { depth--; if (depth === 0) break; }
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(marker, j);
  }
  return out;
}

afterEach(() => { delete (globalThis as { __PB_MEASURE__?: boolean }).__PB_MEASURE__; });

describe("주인공 경기 씨앗", () => {
  it("계측 모드가 아니면 씨앗을 안 준다 — 실제 플레이는 예전 그대로", () => {
    expect(isMeasureMode()).toBe(false);
    expect(protagonistMatchSeed(20260802, 2026, 12, "SCH_1")).toBeUndefined();
  });

  it("계측 모드면 같은 입력에 같은 씨앗이 나온다", () => {
    (globalThis as { __PB_MEASURE__?: boolean }).__PB_MEASURE__ = true;
    const a = protagonistMatchSeed(20260802, 2026, 12, "SCH_1");
    const b = protagonistMatchSeed(20260802, 2026, 12, "SCH_1");
    expect(a).toBe(b);
    expect(typeof a).toBe("number");
  });

  it("씨앗·시즌·주차·일정이 다르면 씨앗도 다르다", () => {
    (globalThis as { __PB_MEASURE__?: boolean }).__PB_MEASURE__ = true;
    const base = protagonistMatchSeed(20260802, 2026, 12, "SCH_1");
    expect(protagonistMatchSeed(777,      2026, 12, "SCH_1")).not.toBe(base);
    expect(protagonistMatchSeed(20260802, 2027, 12, "SCH_1")).not.toBe(base);
    expect(protagonistMatchSeed(20260802, 2026, 13, "SCH_1")).not.toBe(base);
    // 같은 주에 두 경기(더블헤더·대회)면 일정 id 가 갈라 준다
    expect(protagonistMatchSeed(20260802, 2026, 12, "SCH_2")).not.toBe(base);
  });

  it("0을 절대 안 돌려준다 — 엔진이 0을 '씨앗 없음'으로 읽는다", () => {
    (globalThis as { __PB_MEASURE__?: boolean }).__PB_MEASURE__ = true;
    for (let w = 0; w < 60; w++) {
      for (const id of ["", "SCH_" + w, "GAME-" + w]) {
        expect(protagonistMatchSeed(0, 2026, w, id)).not.toBe(0);
      }
    }
  });

  it("주인공 경기 호출부가 전부 seed를 넘긴다", () => {
    const missing: string[] = [];
    let total = 0;
    for (const p of walk(UI)) {
      const src = readFileSync(p, "utf8");
      for (const marker of ["matchSimulateToEntry(", "matchStart("]) {
        for (const call of callsOf(src, marker)) {
          // 타입 선언(`projectb.d.ts`)과 브리지는 호출부가 아니다
          if (p.endsWith(".d.ts")) continue;
          total++;
          if (!call.includes("seed")) {
            missing.push(`${p.replace(UI, "")} — ${call.slice(0, 70).replace(/\s+/g, " ")}…`);
          }
        }
      }
    }
    expect(total, "주인공 경기 호출부가 하나도 없다 — 검사가 헛돈다").toBeGreaterThan(2);
    expect(missing, `씨앗을 안 넘기는 호출부:\n${missing.join("\n")}`).toEqual([]);
  });
});
