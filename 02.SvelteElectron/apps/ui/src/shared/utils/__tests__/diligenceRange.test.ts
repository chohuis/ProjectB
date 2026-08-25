import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * 🔴 **성실은 사실상 내려가지 않는다.**
 *
 * 2026-08-25에 `EVT_COMMON_SLACKING`("훈련을 빼먹었다", `diligence_lte 30`)을
 * 만들었다가 6시즌 **0회**로 지웠다. 도달할 수가 없다:
 *
 *   시작 60 · 범위 1~99
 *   움직이는 경로는 `diligenceDelta` **하나뿐** (`game.ts:840`)
 *   보상 99건 중 **음수는 3건**, 전부 대학 전용이고 각 −2
 *   → 다 골라도 바닥이 **54**다. 30은 못 간다
 *
 * 반대쪽은 널널하다 — 양수 95건이라 성실은 오르기만 하고 곧 천장에 붙는다.
 * 실측: `diligence_gte 80` 이벤트가 2027~2031 **매년** 떴다.
 *
 * ⚠ **조건을 낮추는 걸로는 안 풀린다.** 성실 하락 경로가 없는 게 원인이고
 * 그건 밸런스다(A 트랙). 여기서는 **같은 함정을 다시 파지 않는 것**만 지킨다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const DEC = JSON.parse(readFileSync(join(MASTER, "messages/decision_templates.json"), "utf8"))
  .decisions as { id: string; options?: { id: string; effects?: unknown }[] }[];

/** 그 선택지의 성실 증감. 없으면 null */
function diligenceOf(effects: unknown): number | null {
  if (Array.isArray(effects)) {
    for (const s of effects as string[]) {
      if (s.startsWith("diligence:")) return parseInt(s.slice("diligence:".length), 10);
    }
    return null;
  }
  const e = effects as { diligenceDelta?: number } | undefined;
  return e?.diligenceDelta ?? null;
}

const START = 60;

describe("성실 범위", () => {
  it("성실을 내리는 보상이 거의 없다 — 이게 사실이다", () => {
    let down = 0;
    for (const d of DEC) for (const o of d.options ?? []) {
      const v = diligenceOf(o.effects);
      if (v !== null && v < 0) down += v;
    }
    // 전부 한 번씩 다 고른다는 가장 후한 가정에서의 바닥
    const floor = START + down;
    expect(floor).toBeGreaterThan(30);
  });

  /**
   * 🔴 **`diligence_lte`를 바닥 아래로 걸면 그 이벤트는 영원히 안 뜬다.**
   * 데이터 쪽에서 막는다 — 조건선이 도달 가능한지 여기서 본다.
   */
  it("diligence_lte 조건선이 도달 가능한 값이다", () => {
    let down = 0;
    for (const d of DEC) for (const o of d.options ?? []) {
      const v = diligenceOf(o.effects);
      if (v !== null && v < 0) down += v;
    }
    const floor = START + down;

    const rules = JSON.parse(readFileSync(join(MASTER, "_manifest.json"), "utf8"));
    const all = JSON.stringify(rules);
    // 매니페스트에 조건까지 실리지 않으면 이 검사는 규칙 파일을 직접 본다
    expect(typeof all).toBe("string");

    const unreachable: string[] = [];
    for (const lane of ["mandatory", "conditional", "random"]) {
      const dir = join(MASTER, "events", lane);
      const walk = (d: string): string[] => {
        const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
        return readdirSync(d).flatMap((n: string) => {
          const p = join(d, n);
          return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
        });
      };
      for (const f of walk(dir)) {
        const r = JSON.parse(readFileSync(f, "utf8"));
        for (const c of r.conditions ?? []) {
          if (c.type === "diligence_lte" && c.value < floor) unreachable.push(`${r.id} (${c.value} < ${floor})`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });
});
