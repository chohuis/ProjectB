import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 구단 연표 배선 (1단계).
 *
 * 🔴 **화면이 IPC 를 안 부르면 아무 일도 안 일어난다** — 오류도 안 난다.
 *   빈 배열이 와서 연표가 비어 보일 뿐이고, `history_standings` 에는 값이
 *   멀쩡히 쌓인다. 이 프로젝트에서 반복된 형태다.
 *
 * ⚠ SQL 이 **실제로 도는지**는 여기서 못 본다 — 문자열만 보던 검사가
 *   `ESCAPE '\'` 가 빈 문자열이 되는 걸 놓쳤다. 실행은
 *   `scripts/probe-timeline.cjs` 가 본다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** 주석을 지운다 — **안 쓰는 이유를 적어 둔 주석이 통과시키면 안 된다** */
function strip(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("구단 연표 배선", () => {
  const modal = strip(read("apps/ui/src/features/team/ui/TeamDetailModal.svelte"));
  const preload = read("apps/desktop/preload.cjs");
  const types = read("apps/ui/src/shared/types/projectb.d.ts");
  const main = read("apps/desktop/main.cjs");

  it("다섯 층이 다 이어져 있다", () => {
    expect(main.includes("season:getTeamHistory"), "main.cjs 핸들러").toBe(true);
    expect(preload.includes("seasonGetTeamHistory"), "preload 노출").toBe(true);
    expect(types.includes("seasonGetTeamHistory"), "타입 선언").toBe(true);
    // 🔴 **이름이 아니라 호출을 본다.** 가드 절
    //   (`!window.projectB?.seasonGetTeamHistory`)에도 같은 이름이 있어서,
    //   `includes(이름)` 만 보면 **호출을 지워도 통과한다**(변이로 확인).
    expect(
      modal.includes("await window.projectB.seasonGetTeamHistory("),
      "화면이 실제로 부른다",
    ).toBe(true);
  });

  it("팀이 바뀌면 다시 읽는다", () => {
    // 한 번만 읽고 캐시하면 다른 팀을 열어도 앞 팀 연표가 남는다
    expect(modal.includes("playedFor")).toBe(true);
    expect(modal.includes("teamId !== playedFor")).toBe(true);
  });

  it("시작 전 5시즌과 플레이 기록이 겹치지 않는다", () => {
    // 🔴 새 게임에도 `history_standings` 에 그 다섯 해가 이미 있다 —
    //   거르지 않으면 연표에 같은 해가 두 번 나온다(실측).
    expect(modal.includes("playedYears")).toBe(true);
    expect(modal.includes("playedYears.has")).toBe(true);
  });

  it("순위를 같은 종류끼리 센다", () => {
    // 2군을 통째로 빼면 2군 자신도 빠져 `1위 / 0팀` 이 된다(실측)
    expect(main.includes("substr(h2.team_id, -2) = substr(h1.team_id, -2)")).toBe(true);
    expect(main.includes("substr(h3.team_id, -2) = substr(h1.team_id, -2)")).toBe(true);
  });

  it("LIKE ESCAPE 를 쓰지 않는다", () => {
    // 백틱 템플릿 안에서 `ESCAPE '\'` 는 JS 에 먹혀 빈 문자열이 된다
    expect(main.includes("NOT LIKE '%\\_2'")).toBe(false);
  });
});
