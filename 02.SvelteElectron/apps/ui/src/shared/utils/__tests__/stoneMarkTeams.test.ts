import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inkFor, luminanceOf, stoneStyle } from "../stoneMark";

/**
 * **실제 팀 색 전부**로 알 표식을 검증한다.
 *
 * 🔴 원본(Godot)은 48팀을 그려 보고 **21팀에서 글자가 묻힌 것**을 발견했다.
 *   보조색을 글자에 썼기 때문이다. 여기는 그 실패를 검사로 굳힌다 —
 *   **한 팀이라도 묻히면 실패한다.**
 *
 * 🔴 **잣대가 틀려 있었다** (2026-09-22 실측). 예전엔 `resource/data/master/teams/`
 *   아래를 훑었는데 그 파일들은 **게임이 한 번도 안 읽는 구 데이터**다 —
 *   `_manifest.json` 에 없고(런타임 로드 대상이 아니다), 고교·대학·독립·
 *   pro_korea 의 `teamId` 는 Phase 5 ID 교체 뒤 `refs.json` 에 **하나도 없다.**
 *   ABL 16팀은 id 는 살아 있지만 **색이 16팀 전부 refs 와 다르다.**
 *   즉 화면이 그리는 색이 아니라 아무도 안 쓰는 색 48개를 검사하고 있었다.
 *
 *   **정본은 `refs.json` 이다**(DESIGN §8.2 원칙 6). 거기서 읽는다 —
 *   표본이 48 → **238팀 전수**가 되고, 그중에 화면이 실제로 그리는 색이 있다.
 */

const ROOT = process.cwd();

function allTeams(): Array<{ id: string; colors: [string, string] }> {
  const refs = JSON.parse(
    readFileSync(join(ROOT, "resource/data/master/entities/refs.json"), "utf8"),
  ) as { teams: { id: string; colors?: [string, string] }[] };
  return refs.teams.filter((t) => t.colors).map((t) => ({ id: t.id, colors: t.colors! }));
}

function contrast(a: string, b: string): number {
  const la = luminanceOf(a),
    lb = luminanceOf(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `stoneMark.test.ts`와 같은 값이다 — 근거는 그쪽에 적었다 */
const MIN_CONTRAST = 4.0;

describe("실제 팀 색으로 그린 알", () => {
  const teams = allTeams();

  it("색을 가진 팀이 실제로 있다 — 없으면 아래가 다 헛돈다", () => {
    // ⚠ 정본으로 옮기면서 48 → 238 이 됐다. 다시 48 대로 떨어지면 잣대가
    //   구 데이터로 되돌아간 것이다
    expect(teams.length).toBeGreaterThan(200);
  });

  it("모든 팀에서 자리 이름이 읽힌다", () => {
    const bad = teams
      .map((t) => ({ id: t.id, c: contrast(t.colors[0], inkFor(t.colors[0])) }))
      .filter((r) => r.c < MIN_CONTRAST);
    expect(
      bad,
      `묻히는 팀 ${bad.length}개: ${bad.map((b) => `${b.id} ${b.c.toFixed(2)}`).join(", ")}`,
    ).toEqual([]);
  });

  // 🔴 **원본이 겪은 그 실패를 여기서 재현한다.** 보조색을 글자로 썼다면
  //   몇 팀이 묻혔을지 세서, 흰/검을 고른 것이 실제로 값을 하는지 보인다
  it("보조색을 글자로 썼다면 묻혔을 팀이 실제로 있다", () => {
    const wouldFail = teams.filter((t) => contrast(t.colors[0], t.colors[1]) < MIN_CONTRAST);
    expect(
      wouldFail.length,
      `보조색을 글자로 쓰면 ${wouldFail.length}/${teams.length}팀이 묻힌다`,
    ).toBeGreaterThan(0);
  });

  it("테두리가 보조색으로 남는다 — 팀 색 둘을 다 쓴다", () => {
    for (const t of teams) {
      const s = stoneStyle(t.colors[0], t.colors[1], 17);
      expect(s.rim, t.id).toBe(t.colors[1]);
      expect(s.body, t.id).toBe(t.colors[0]);
    }
  });
});
