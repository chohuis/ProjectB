import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 경기 시뮬 호출부가 **씨앗을 빠뜨리지 않았는가**.
 *
 * 🔴 **이 프로젝트의 되풀이 결함이 "배선을 빠뜨린다"이다.** 층마다 값이
 * 맞는데 잇는 선이 하나 없어서, 오류가 아니라 **"아무 일도 안 일어남"**으로
 * 나타난다(CLAUDE.md "함정: 층마다 맞는데 잇는 선이 없다" 참고).
 *
 * 씨앗도 같은 모양이다 — `simulateGame`이 `worldSeed`를 **선택**으로 받으므로
 * 안 넘긴 호출부는 조용히 예전처럼(매번 다른 결과) 돈다. 타입도 안 깨진다.
 * 그래서 **호출부를 세는 검사**를 둔다. 새 호출부가 생겨도 여기서 걸린다.
 */

const SRC = join(__dirname, "../.."); // shared/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".svelte")) out.push(p);
  }
  return out;
}

/** `await simulateGame(` 부터 짝이 맞는 닫는 괄호까지 */
function callsOf(src: string): string[] {
  const out: string[] = [];
  const marker = "await simulateGame(";
  let i = src.indexOf(marker);
  while (i >= 0) {
    let depth = 0,
      j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(marker, j);
  }
  return out;
}

describe("경기 씨앗 배선", () => {
  it("simulateGame 호출부가 전부 worldSeed를 넘긴다", () => {
    const missing: string[] = [];
    let total = 0;
    for (const p of walk(SRC)) {
      const src = readFileSync(p, "utf8");
      for (const call of callsOf(src)) {
        total++;
        if (!call.includes("worldSeed")) {
          missing.push(`${p.replace(SRC, "")} — ${call.slice(0, 70).replace(/\s+/g, " ")}…`);
        }
      }
    }
    // 대상이 0이면 이 검사가 헛돈다 — 호출부가 사라졌다는 뜻이니 그때 지운다
    expect(total, "simulateGame 호출부가 하나도 없다 — 검사가 헛돈다").toBeGreaterThan(3);
    expect(missing, `씨앗을 안 넘기는 호출부:\n${missing.join("\n")}`).toEqual([]);
  });

  it("runSimBatch도 씨앗을 받아 넘긴다", () => {
    const p = join(SRC, "stores/backgroundLeague.ts");
    const src = readFileSync(p, "utf8");
    // 배경 리그는 한 번에 수십 경기를 돌린다 — 여기가 빠지면 리그 대부분이
    // 재현이 안 되면서 주인공 경기만 재현되는 반쪽이 된다
    expect(src).toMatch(/runSimBatch\([^)]*worldSeed/s);
  });
});
