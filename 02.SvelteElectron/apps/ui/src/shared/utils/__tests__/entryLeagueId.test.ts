import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공 경기에도 리그가 실린다 ─────────────────────────────────
//
// `matchSimulateToEntry` 요청에 `leagueId` 가 없으면 Rust `MatchStartOptions.league_id` 가
// 비고, 투구수 상한이 리그 기본(120)으로 떨어진다 — 고교 105구가 **주인공 경기에만**
// 안 걸렸다(자동 시뮬 `simulateSkippedGame` 은 처음부터 넘겼다). 2026-09-03 C 실측.
//
// 실측(씨앗 20260802 · 고교 한 시즌 · 등판 20): 고치기 전 요청 20건 전부 leagueId 없음.
// 문자열 포함으로만 본다 — 정규식을 쓰지 않는다(CLAUDE.md).

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function requestBlock(src: string): string {
  const at = src.indexOf("matchSimulateToEntry({");
  expect(at).toBeGreaterThan(-1);
  return src.slice(at, at + 2500);
}

describe("경기 진입 요청의 리그", () => {
  it("자동 진행이 leagueId 를 넘긴다", () => {
    const block = requestBlock(read("apps/ui/src/shared/usecases/runAutoAdvance.ts"));
    expect(block.includes("leagueId: lid,")).toBe(true);
  });
  it("실제 플레이(MainPage)도 leagueId 를 넘긴다", () => {
    const block = requestBlock(read("apps/ui/src/pages/main/MainPage.svelte"));
    expect(block.includes("leagueId: lid,")).toBe(true);
  });
  it("IPC 선언이 leagueId 를 받는다", () => {
    const s = read("apps/ui/src/shared/types/projectb.d.ts");
    const at = s.indexOf("matchSimulateToEntry");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 3000).includes("leagueId?: string;")).toBe(true);
  });
  it("Rust 옵션이 leagueId 를 camelCase 로 받는다", () => {
    const s = read("packages/engine-native/src/types.rs");
    const at = s.indexOf("pub struct MatchStartOptions");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at - 200, at + 400);
    expect(block.includes('rename_all = "camelCase"')).toBe(true);
    expect(block.includes("pub league_id: Option<String>")).toBe(true);
  });
});
