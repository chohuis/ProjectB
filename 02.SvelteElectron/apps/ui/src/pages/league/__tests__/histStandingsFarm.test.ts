import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 역대 순위표에 2군이 섞이지 않는가 (C-13).
 *
 * 🔴 `refs.json`은 1군·팜을 **같은 `leagueId`**로 담는다 — `_1`/`_2`로만 갈린다.
 *    `league_id`로만 거르면 ABL이 16팀이 아니라 **32팀**, JBL은 12팀이 아니라
 *    **24팀**으로 뜬다. 합 56이 백로그의 "해외 빈 순위표 56행"이다.
 *
 * ⚠ **KBL은 안 걸렸다** — `LEAGUE_KBL`/`LEAGUE_KBL_FARM`으로 갈려 있다.
 *   해외만 같은 id를 쓴다. 그래서 여태 안 드러났다.
 */
const SRC = readFileSync(join(__dirname, "../LeaguePage.svelte"), "utf8");
const REFS = JSON.parse(readFileSync(
  join(__dirname, "../../../../../../resource/data/master/entities/refs.json"),
  "utf8")) as { teams?: { id: string; leagueId: string }[] };

describe("역대 순위표", () => {
  it("2군을 걸러낸다", () => {
    expect(SRC, "2군 필터가 없다 — 해외 순위표에 팜이 섞인다")
      // ⚠ **느슨하게 찾으면 안 된다.** `endsWith("_2")`는 이 파일에 원래 있어서
      //   필터를 지워도 통과했다 — 변이 검증이 그걸 잡았다. 필터 전체를 본다.
      .toContain("!r.team_id.endsWith(\"_2\")");
  });
});

describe("전제 — 해외는 1·2군이 같은 leagueId다", () => {
  const teams = REFS.teams ?? [];
  const count = (lg: string, suffix: string) =>
    teams.filter((t) => t.leagueId === lg && t.id.endsWith(suffix)).length;

  it("ABL은 같은 id로 1군 16 + 2군 16이다", () => {
    expect(count("LEAGUE_ABL", "_1")).toBe(16);
    expect(count("LEAGUE_ABL", "_2")).toBe(16);
  });

  it("JBL은 같은 id로 1군 12 + 2군 12이다", () => {
    expect(count("LEAGUE_JBL", "_1")).toBe(12);
    expect(count("LEAGUE_JBL", "_2")).toBe(12);
  });

  it("합이 56이다 — 백로그의 그 숫자", () => {
    const abl = teams.filter((t) => t.leagueId === "LEAGUE_ABL").length;
    const jbl = teams.filter((t) => t.leagueId === "LEAGUE_JBL").length;
    expect(abl + jbl).toBe(56);
  });
});
