import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **계산은 Rust가 한다** — CLAUDE.md의 아키텍처 원칙이다.
 *
 *     apps/ui/       화면 렌더링, 입력값 전달만.  게임 로직·Math.random() 금지
 *     engine-native  게임 본체 — 로직·난수·암호화 전부
 *
 * 🔴 감사(2026-08-28)에서 세 부류의 누수를 찾았고, 이 검사는 그중 **고친 둘**을
 *   지킨다. 나머지는 `docs/`에 남겼다.
 *
 *   ① **값을 지어내던 자리** — 자책점을 `피안타 × 0.35`로 역산했다.
 *      엔진이 실제 자책점을 아는데 TS가 어림수를 만들어 ERA·경력 기록·계약
 *      평가로 흘려보냈다. 같은 역산이 **세 곳**이었고 하나만 고쳐져 있었다.
 *
 *   ② **규칙이 두 벌이던 자리** — 투수 승패 판정. `npc_sim`의 클로저 안에
 *      갇혀 있어서 TS가 손으로 옮겨 적었고, 그 사본이 **이미 갈라져 있었다**
 *      (세이브에 `outs >= 1`이 붙고 여유 점수가 3으로 박혔다).
 *      **주인공만 다른 승패 규칙**을 쓰고 있었다.
 *
 * ⚠ 정규식을 최소로 쓴다 — 찾는 문자열을 그대로 적는다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const UI = resolve(ROOT, "apps/ui/src");

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      srcFiles(p, out);
    } else if (name.endsWith(".ts") || name.endsWith(".svelte")) out.push(p);
  }
  return out;
}
const FILES = srcFiles(UI).map((p) => ({ path: p, src: readFileSync(p, "utf8") }));
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

describe("자책점은 엔진이 준다", () => {
  /**
   * 🔴 **`피안타 × 0.35`가 남아 있으면 안 된다** — 폴백으로만 허용한다.
   *   그 식이 조건 없이 서 있으면 값을 지어내는 것이다.
   */
  it("역산이 폴백으로만 남아 있다", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (!f.src.includes("* 0.35")) continue;
      // 폴백이면 바로 위에 엔진 값을 먼저 보는 갈래가 있어야 한다
      const usesEngine = f.src.includes("outcome.earnedRuns") || f.src.includes("myLine.er");
      // 성장 xp 공식은 이 검사의 대상이 아니다(아래에서 따로 본다)
      const isXp = f.src.includes("xp_threshold");
      if (!usesEngine && !isXp) bad.push(rel(f.path));
    }
    expect(bad).toEqual([]);
  });

  /** ⚠ 세 자리가 다 고쳐졌는지 본다 — 하나만 고치는 게 이 저장소의 버릇이다 */
  it("세 자리가 다 엔진 값을 본다", () => {
    const apply = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
    const match = read("apps/ui/src/pages/match/MatchPage.svelte");
    // 연습경기 · 정식경기 두 갈래.
    // ⚠ **자리를 세지 말고 갈래를 봐야 한다.** 처음엔 `earnedRuns`가 몇 번
    //   나오는지만 셌는데, 정식 갈래 하나에 이미 두 번 나와서 **연습 갈래를
    //   역산으로 되돌려도 통과**했다(변이 검증에서 걸렸다).
    //   두 갈래가 각자 엔진 값을 쓰는 꼴을 그대로 찾는다.
    const useEngine = "typeof outcome.earnedRuns === \"number\"";
    expect(apply.split(useEngine).length - 1,
      "자책점을 엔진에서 받는 갈래가 둘이어야 한다(연습·정식)").toBe(2);
    // 경기 화면 — **쓰는 자리**를 본다. `myLine.er`은 조건절에도 나오므로
    // 그것만 찾으면 값을 도로 역산으로 바꿔도 통과한다(변이 검증에서 걸렸다).
    expect(match.includes("Math.max(0, Math.round(myLine.er))")).toBe(true);
    // ⚠ **표시 문자열만 본다 — 주석은 세지 않는다.** 왜 고쳤는지 적으려고
    //   주석에 옛 라벨이 남아 있고, 그냥 찾으면 **거짓으로 실패한다.**
    //   실제로 걸렸다. 이 저장소에서 되풀이되는 함정이다.
    expect(match.includes("<span>자책(추정)</span>")).toBe(false);
    expect(match.includes("<span>자책</span>")).toBe(true);
  });
});

describe("승패 판정은 규칙이 하나다", () => {
  const APPLY = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
  const NPC   = read("packages/engine-native/src/npc_sim.rs");

  /** 🔴 규칙이 Rust에 자유 함수로 있어야 TS가 부를 수 있다 */
  it("Rust가 규칙을 내보낸다", () => {
    expect(NPC.includes("pub fn decide_pitcher(")).toBe(true);
    expect(read("packages/engine-native/src/lib.rs")
      .includes("pub fn calc_pitcher_decision_native")).toBe(true);
  });

  it("TS가 그 규칙을 부른다", () => {
    expect(APPLY.includes('"calcPitcherDecisionNative"')).toBe(true);
  });

  /**
   * 🔴 **TS가 규칙을 다시 적으면 안 된다.** 갈라진 사본의 표식들이
   *   되살아나지 않게 못박는다.
   */
  it("TS에 규칙 사본이 없다", () => {
    expect(APPLY.includes('outs >= 15 ? "W"')).toBe(false);
    expect(APPLY.includes('outs >= 3 ? "HD"')).toBe(false);
    expect(APPLY.includes("margin <= 3")).toBe(false);
  });

  /** ⚠ 여유 점수는 `tuning`이 정본이다 — 숫자를 두 번 적지 않는다 */
  it("세이브 여유 점수가 Rust 상수다", () => {
    expect(NPC.includes("margin <= crate::tuning::SAVE_MAX_MARGIN")).toBe(true);
  });
});

describe("성장 xp 공식", () => {
  /**
   * ⚠ **표시용 진행바가 Rust 공식을 옮겨 적고 있다.** 렌더마다 IPC를 태울 수
   *   없어 사본을 남겼다 — 대신 **어긋나면 여기서 잡는다.**
   *   Rust가 바뀌면 이 검사가 먼저 빨간불이 된다.
   */
  it("TS 사본이 Rust와 같은 값이다", () => {
    const rs = read("packages/engine-native/src/growth_engine.rs");
    const ts = read("apps/ui/src/shared/usecases/weekPhases/training.ts");
    expect(rs.includes("fn xp_threshold(v: f64) -> f64 { 7.5 + v * 0.35 }")).toBe(true);
    expect(ts.includes("return 7.5 + statVal * 0.35;")).toBe(true);
  });
});
