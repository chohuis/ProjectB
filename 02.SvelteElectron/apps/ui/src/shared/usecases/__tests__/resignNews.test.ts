import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * FA 미계약 → 원소속 재계약 소식 (A단계 · 3/6).
 *
 * 🔴 **`fa_signed` 는 FA 취득에도 쓰인다.** 이벤트 종류만 보면 FA 를 **얻은**
 *   사람까지 "재계약"으로 센다 — `detail` 로 갈라야 한다.
 *
 * ⚠ 주인공 팀 것만. 실측 미계약자가 한 해 652건이다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("원소속 재계약 소식", () => {
  const src = strip(read("apps/ui/src/shared/usecases/seasonRollover.ts"));
  const rust = read("packages/engine-native/src/npc_sim.rs");

  it("소식을 만든다", () => {
    expect(src.includes("msg-resign-")).toBe(true);
    expect(src.includes("FA 잔류")).toBe(true);
  });

  it("🔴 detail로 FA 취득과 가른다", () => {
    // 종류만 보면 FA 를 **얻은** 사람까지 센다
    expect(src.includes("원소속 재계약")).toBe(true);
    expect(src.includes("e.detail")).toBe(true);
  });

  it("Rust가 그 detail을 실제로 넣는다", () => {
    // 문자열이 갈리면 조용히 0건이 된다 — 양쪽을 같이 못박는다
    expect(rust.includes('Some("FA 미계약 → 원소속 재계약".into())')).toBe(true);
  });

  it("주인공 팀·그 해 것만", () => {
    // ⚠ **같은 파일의 웨이버 소식에도 `e.toTeamId === myTeam` 이 있다.**
    //   그것만 보면 재계약 쪽을 지워도 통과한다(변이로 확인).
    //   이 블록에만 있는 `resigned.push` 를 함께 본다.
    expect(src.includes("if (e.toTeamId === myTeam) resigned.push(n.name);")).toBe(true);
    expect(src.includes("e.year !== now")).toBe(true);
  });

  it("id에 연도가 들어간다", () => {
    expect(src.includes("msg-resign-${now}-${myTeam}")).toBe(true);
  });
});
