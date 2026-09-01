import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * 🔴 **`initSeason` 은 `leagueSchedules` 를 비운다. 여는 자리는 다시 채워야 한다.**
 *
 * `seasonStore.initSeason` 은 `set(next)` 로 상태를 통째로 갈아끼운다
 * (`makeEmptySeason` — `leagueSchedules: {}` · `leagueState: {}`).
 * 그래서 무대를 여는 자리마다 `reinitSeasonSchedules` 로 배경 리그를
 * 다시 만들지 않으면 **그 시즌엔 전 리그가 한 경기도 안 치러진다.**
 *
 * ## 이 결함은 **자리를 옮겨 다녔다** (2026-09-02)
 *
 * 롤오버만 고쳤더니 구멍이 다음 자리로 갔다. 실측(`probe:bgsched`):
 *
 * ```
 *   1차 수정 후   2029 [independent] INDEPENDENT 171 · HIGHSCHOOL 210 ·
 *                                    UNIVERSITY 85          ← 졸업하는 해
 *   2차 수정 후   2029 [pro_kbl]     KBL 630 · HIGHSCHOOL 233 ·
 *                                    UNIVERSITY 85          ← 프로 진입 첫 해
 *   군 복무       [일정끝:military]  (전 리그 0)             ← 2년 내내
 * ```
 *
 * **한 자리씩 고치면 한 자리씩 옮겨 간다.** 그래서 전수로 못박는다.
 *
 * ⚠ 아무도 안 죽고 로그도 안 남는다 — 게임은 돌고 세상만 멈춘다.
 */

const ROOT = resolve(__dirname, "../../..");   // apps/ui/src

function sources(): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|svelte)$/.test(e.name)) continue;
      if (e.name.endsWith(".test.ts")) continue;
      out.push({
        path: p.slice(ROOT.length + 1).replace(/\\/g, "/"),
        // 주석은 걷되 **줄 수를 유지한다** — 보고하는 줄 번호가 어긋나면
        // 고치는 사람이 그 자리를 못 찾는다
        body: readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1"),
      });
    }
  };
  walk(ROOT);
  return out;
}

describe("무대를 여는 자리는 배경 리그를 다시 채운다", () => {
  it("파일을 실제로 읽었다", () => {
    expect(sources().length).toBeGreaterThan(100);
  });

  it("대조군: `initSeason` 을 부르는 자리가 실제로 있다", () => {
    // 0건이면 아래 검사가 공회전한다
    const n = sources().filter(({ body }) => body.includes(".initSeason(")).length;
    expect(n).toBeGreaterThan(0);
  });

  /**
   * ⚠ **정의부(`stores/season.ts`)는 뺀다.** 거기가 비우는 당사자다.
   *
   * ⚠ 짝은 **같은 함수 안**이면 된다 — 바로 다음 줄일 필요는 없다.
   *   `openProSeason` 은 독립리그 조기 반환 갈래가 있어 호출이 둘로 갈린다.
   *   그래서 파일 단위가 아니라 **`initSeason` 뒤쪽 40줄** 안에서 찾는다.
   */
  it("`initSeason` 을 부르면 그 아래에서 배경을 채운다", () => {
    const bad: string[] = [];
    for (const { path, body } of sources()) {
      if (path === "shared/stores/season.ts") continue;
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(".initSeason(")) continue;
        const after = lines.slice(i, i + 40).join("\n");
        // 직접 채우거나, 채우는 함수(`initAllLeaguesV3`)를 부르면 된다
        if (/reinitSeasonSchedules|reinitHighschoolSeason|initAllLeaguesV3/.test(after)) continue;
        bad.push(`${path}:${i + 1}  ${lines[i].trim().slice(0, 80)}`);
      }
    }
    expect(
      bad,
      "`initSeason` 은 `leagueSchedules` 를 비운다 — 그 시즌 배경 리그가 통째로 멈춘다.\n"
      + "`seasonStore.reinitSeasonSchedules(내리그, 팀id, { keepOwnSchedule })` 를 이어 불러라",
    ).toEqual([]);
  });
});
