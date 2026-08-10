import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공도 여덟 개를 다 넘긴다 ─────────────────────────────────
//
// 경기 엔진의 `PartialPitcherStats`는 여덟 개를 받는데(`types.rs`), 주인공
// 경로만 **넷**을 넘기고 있었다. 빠진 것과 OVR 가중치:
//
//   control 2.0 · movement 1.5 · clutch 0.3 · holdRunners 0.2  →  4.0/12.0 = 33%
//
// 제구와 무브먼트는 투수의 핵심이고 훈련 슬롯에서 플레이어가 직접 올리는
// 값이다. 전부 `Option<f64>`라 **안 넘겨도 오류가 안 난다** — CLAUDE.md가
// 경고하는 "층마다 맞는데 잇는 선이 없다" 패턴이다.
//
// 실측(2026-08-10), 같은 고교 리그 20이닝 이상:
//
//   OVR 50~ 5.85 · 55~ 4.50 · 60~ 4.20 · 65~ 3.52 · 70~ 3.35 · 75~ 3.86
//   주인공  OVR 70 · 87이닝 · **ERA 7.45**   ← 자기 구간 중앙값의 2배
//
// 리그 캘리브레이션은 정상이었다 — OVR이 오를수록 ERA가 내려간다.
// NPC 투수(`buildStarterStats`)는 처음부터 여덟 개를 다 넘겼다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** 엔진이 받는 투수 능력치 — 이 여덟이 정본이다 */
const STATS = [
  "command", "velocity", "staminaCap", "mentalResil",
  "control", "movement", "clutch", "holdRunners",
] as const;

/** `pitcher: { … }` 블록을 통째로 뽑는다 (중첩 없는 한 겹) */
function pitcherBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/pitcher:\s*\{/g)) {
    let depth = 0, i = m.index! + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) break; }
    }
    out.push(src.slice(m.index!, i + 1));
  }
  return out;
}

describe("주인공 투수 페이로드", () => {
  it("자동 진행 경로가 여덟 개를 다 넘긴다", () => {
    const blocks = pitcherBlocks(read("apps/ui/src/shared/usecases/runAutoAdvance.ts"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const s of STATS) expect(blocks.some((b) => b.includes(`${s}:`))).toBe(true);
  });

  it("실제 플레이 경로(MainPage)도 여덟 개를 다 넘긴다", () => {
    const blocks = pitcherBlocks(read("apps/ui/src/pages/main/MainPage.svelte"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const s of STATS) expect(blocks.some((b) => b.includes(`${s}:`))).toBe(true);
  });

  it("뷰모델 타입이 여덟 개를 선언한다", () => {
    // 타입이 좁으면 호출부가 넘기려 해도 막힌다 — 실제로 그래서 막혔다
    const s = read("apps/ui/src/shared/stores/game.ts");
    const m = s.match(/pitcherStats:\s*\{[\s\S]*?\};/);
    expect(m).not.toBeNull();
    for (const k of STATS) expect(m![0]).toContain(k);
  });

  it("IPC 선언이 여덟 개를 받는다", () => {
    // ⚠ **`developingDifficulty`로 고정한다.** 이 파일엔 `pitcher?:` 블록이
    // 여럿이고 다른 것들은 이미 control·movement를 갖고 있다. 느슨하게
    // 잡았더니 변이 검증에서 **엉뚱한 블록을 보고 통과**했다 — 게이트 구멍이었다.
    // 중첩 중괄호(`arsenal?: { type; grade }[]`)가 있어 `[^}]*`로는 못 자른다 —
    // `developingDifficulty` 위치를 찾아 그 선언의 끝(`};`)까지 훑는다
    const s = read("apps/ui/src/shared/types/projectb.d.ts");
    const at = s.indexOf("developingDifficulty?: number; name?: string;");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, s.indexOf("};", at) + 2);
    for (const k of STATS) expect(block).toContain(k);
  });

  it("NPC 투수도 같은 여덟 개를 쓴다 — 주인공만 다른 저울이면 안 된다", () => {
    const s = read("apps/ui/src/shared/utils/matchLineupBuilder.ts");
    const m = s.match(/export interface StarterStats \{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    for (const k of STATS) expect(m![0]).toContain(k);
  });
});
