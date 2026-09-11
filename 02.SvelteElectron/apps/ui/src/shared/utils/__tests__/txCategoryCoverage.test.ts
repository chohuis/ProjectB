import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **거래 기록 종류를 저장·타입·화면이 같이 알아야 한다.**
 *
 * 🔴 실제 플레이에서 나왔다(2026-08-28): "리그 기록에서 전체로 놓으면
 *   **아이콘만 있고 내용이 없는 게** 잡힌다."
 *
 *   저장 계층(`slotRepo`)은 일곱을 쓰는데 타입과 화면은 다섯뿐이었다:
 *
 *       slotRepo   trade fa draft military retirement **callup release**
 *       save.ts    trade fa draft military retirement
 *       LeaguePage trade fa draft military retirement
 *
 *   그래서 콜업·방출로 저장된 행이 `tx-body`가 통째로 빈 채 아이콘만 남았다.
 *   **타입이 좁으면 데이터가 조용히 없어진다** — 이 저장소에서 여러 번 나온 형태다.
 *
 * ⚠ 정규식을 최소로 쓴다 — 값 목록을 뽑는 데만 쓰고, 패턴은 아래에서 확인한다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const SAVE = read("apps/ui/src/shared/types/save.ts");
const REPO = read("apps/ui/src/shared/repo/slotRepo.ts");
const LEAGUE = read("apps/ui/src/pages/league/LeaguePage.svelte");

/** `"a" | "b" | ...` 꼴에서 값을 뽑는다 */
function unionValues(src: string, anchor: string): string[] {
  const i = src.indexOf(anchor);
  if (i < 0) return [];
  const end = src.indexOf(";", i);
  const body = src.slice(i + anchor.length, end);
  return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("거래 기록 종류", () => {
  /** ⚠ 값을 못 뽑으면 아래 검사가 통째로 무의미하다 */
  it("목록을 실제로 뽑는다", () => {
    expect(
      unionValues(SAVE, "export type LeagueTransactionCategory =").length,
    ).toBeGreaterThanOrEqual(5);
    expect(unionValues(REPO, "  category:").length).toBeGreaterThanOrEqual(5);
  });

  /** 🔴 저장이 쓰는 종류를 타입이 다 알아야 한다 */
  it("저장 계층이 쓰는 종류를 타입이 안다", () => {
    const repo = unionValues(REPO, "  category:");
    const type = unionValues(SAVE, "export type LeagueTransactionCategory =");
    expect(repo.filter((c) => !type.includes(c))).toEqual([]);
  });

  /**
   * 🔴 **화면이 그릴 줄 알아야 한다.** 아이콘 표에 없으면 `·`로 떨어지고,
   *   분기에 없으면 본문이 빈다.
   */
  it("화면이 모든 종류의 아이콘을 안다", () => {
    const type = unionValues(SAVE, "export type LeagueTransactionCategory =");
    const missing = type.filter((c) => !LEAGUE.includes(c + ': "'));
    expect(missing).toEqual([]);
  });

  /**
   * 🔴 **모르는 종류를 조용히 삼키면 안 된다.** 분기 끝에 `{:else}`가 없어서
   *   본문이 통째로 비었다 — 데이터가 늘어도 화면이 그대로라 아무도 모른다.
   */
  it("모르는 종류에도 폴백이 있다", () => {
    expect(LEAGUE.includes('<span class="tx-tag tag-unknown">')).toBe(true);
  });
});
