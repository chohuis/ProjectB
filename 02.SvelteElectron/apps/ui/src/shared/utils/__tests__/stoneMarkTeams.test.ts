import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inkFor, luminanceOf, stoneStyle } from "../stoneMark";

/**
 * **실제 팀 색 전부**로 알 표식을 검증한다.
 *
 * 🔴 원본(Godot)은 48팀을 그려 보고 **21팀에서 글자가 묻힌 것**을 발견했다.
 *   보조색을 글자에 썼기 때문이다. 여기는 그 실패를 검사로 굳힌다 —
 *   **한 팀이라도 묻히면 실패한다.**
 *
 * ⚠ 색 몇 개만 골라 보면 못 잡는다. `teams/` 아래를 전부 훑는다.
 */

const ROOT = join(process.cwd(), "resource/data/master/teams");

function allTeams(): Array<{ id: string; colors: [string, string] }> {
  const out: Array<{ id: string; colors: [string, string] }> = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith(".json")) continue;
      const j = JSON.parse(readFileSync(p, "utf8")) as
        { teamId?: string; colors?: [string, string] };
      if (j.colors) out.push({ id: j.teamId ?? f, colors: j.colors });
    }
  };
  walk(ROOT);
  return out;
}

function contrast(a: string, b: string): number {
  const la = luminanceOf(a), lb = luminanceOf(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `stoneMark.test.ts`와 같은 값이다 — 근거는 그쪽에 적었다 */
const MIN_CONTRAST = 4.0;

describe("실제 팀 색으로 그린 알", () => {
  const teams = allTeams();

  it("색을 가진 팀이 실제로 있다 — 없으면 아래가 다 헛돈다", () => {
    expect(teams.length).toBeGreaterThan(40);
  });

  it("모든 팀에서 자리 이름이 읽힌다", () => {
    const bad = teams
      .map((t) => ({ id: t.id, c: contrast(t.colors[0], inkFor(t.colors[0])) }))
      .filter((r) => r.c < MIN_CONTRAST);
    expect(bad, `묻히는 팀 ${bad.length}개: ${bad.map((b) => `${b.id} ${b.c.toFixed(2)}`).join(", ")}`)
      .toEqual([]);
  });

  // 🔴 **원본이 겪은 그 실패를 여기서 재현한다.** 보조색을 글자로 썼다면
  //   몇 팀이 묻혔을지 세서, 흰/검을 고른 것이 실제로 값을 하는지 보인다
  it("보조색을 글자로 썼다면 묻혔을 팀이 실제로 있다", () => {
    const wouldFail = teams.filter(
      (t) => contrast(t.colors[0], t.colors[1]) < MIN_CONTRAST);
    expect(wouldFail.length,
      `보조색을 글자로 쓰면 ${wouldFail.length}/${teams.length}팀이 묻힌다`)
      .toBeGreaterThan(0);
  });

  it("테두리가 보조색으로 남는다 — 팀 색 둘을 다 쓴다", () => {
    for (const t of teams) {
      const s = stoneStyle(t.colors[0], t.colors[1], 17);
      expect(s.rim, t.id).toBe(t.colors[1]);
      expect(s.body, t.id).toBe(t.colors[0]);
    }
  });
});
