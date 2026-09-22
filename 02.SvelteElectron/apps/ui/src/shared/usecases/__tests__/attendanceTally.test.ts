import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAttendanceTally, resetAttendanceTally } from "../clubFinance";
import { isMeasureMode } from "../../utils/measureMode";

/**
 * 관중 계측 칸 — **실제 플레이는 안 바뀐다.**
 *
 * 🔴 왜 있나 (2026-09-22). `calcClubRevenueNative` 가 `attendanceRate`·
 *   `attendanceTotal` 을 내는데 **읽는 코드가 0건**이었다. 그래서 0단계가
 *   "구장·성향을 채우면 관중이 갈리는가"를 **못 재고** 네 입력만 적었다.
 *
 * ⚠ 계측을 붙이면서 게임이 바뀌면 그 계측은 못 믿는다. 그래서 쌓는 자리에
 *   `isMeasureMode()` 를 걸었고, 여기서 그 걸쇠가 그대로인지 본다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("관중 계측 칸", () => {
  const S = read("apps/ui/src/shared/usecases/clubFinance.ts");

  it("계측 모드에서만 쌓는다", () => {
    expect(S).toContain("if (isMeasureMode()) {");
    expect(S).toContain("a.total += r.attendanceTotal ?? 0;");
  });

  /**
   * 🔴 **엔진 값을 그대로 더한다.** 계측이 제 산식을 지으면 재는 값과 도는
   *   값이 갈리고, 그때 보고서는 게임이 아니라 계측을 설명하게 된다.
   */
  it("홈경기 수를 수입 산식과 같은 값으로 센다", () => {
    expect(S).toContain("const homeGames = Math.max(0, Math.round(games / 2));");
    expect(S).toContain("homeGames,");
    // 예전엔 payload 안에 식이 박혀 있었다 — 두 군데면 갈린다
    expect(S).not.toContain("homeGames: Math.max(0, Math.round(games / 2)),");
  });

  it("세이브에도 화면에도 안 간다 — 소비처는 계측뿐이다", () => {
    for (const p of ["apps/ui/src/shared/types/save.ts", "apps/ui/src/shared/stores/game.ts"]) {
      expect(read(p)).not.toContain("attendanceTally");
    }
  });

  it("vitest 는 계측 모드가 아니다 — 누적이 비어 있다", () => {
    expect(isMeasureMode()).toBe(false);
    expect(readAttendanceTally()).toEqual({});
    resetAttendanceTally();
    expect(readAttendanceTally()).toEqual({});
  });
});
