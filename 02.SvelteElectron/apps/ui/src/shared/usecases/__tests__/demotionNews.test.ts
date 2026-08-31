import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 등록말소 소식 (A단계 · 1/6).
 *
 * 🔴 등록말소는 **`autoLog`(개발용)로만 남고 플레이어에게 안 갔다.**
 *
 * ⚠ **주인공 팀 것만 보낸다.** 리그 전체를 보내면 주당 수십 통이고,
 *   소식함이 3시즌에 1,021통인 상태에서 그걸 더하면 다시 막힌다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("등록말소 소식", () => {
  const src = strip(read("apps/ui/src/shared/usecases/weekPhases/market.ts"));

  it("소식을 만든다", () => {
    expect(src.includes("msg-demote-")).toBe(true);
    expect(src.includes("2군 등록말소")).toBe(true);
  });

  it("🔴 주인공 팀 것만 보낸다", () => {
    // 리그 전체면 주당 수십 통 — 소식함이 다시 막힌다
    expect(src.includes("const myTeam = g.protagonist.teamId")).toBe(true);
    expect(src.includes("=== myTeam")).toBe(true);
  });

  it("id에 연도가 들어간다", () => {
    // `weekNum` 은 시즌마다 리셋된다 — 연도가 없으면 해마다 겹치고,
    // 중복이 하나만 생겨도 세이브가 안 열린다
    expect(src.includes("msg-demote-${s.seasonYear}-w${weekNum}")).toBe(true);
  });

  it("기간을 규칙 파일에서 읽어 문장에 넣는다", () => {
    // 문장에 숫자를 박으면 규칙을 바꿔도 안 바뀐다
    expect(src.includes("${lockWeeks}주간")).toBe(true);
  });

  it("락이 꺼져 있으면 소식도 안 보낸다", () => {
    // `demotionLockWeeks: 0` 이면 제한이 없다 — "2주간 불가"가 거짓말이 된다
    expect(src.includes("mine.length > 0 && lockWeeks > 0")).toBe(true);
  });
});
