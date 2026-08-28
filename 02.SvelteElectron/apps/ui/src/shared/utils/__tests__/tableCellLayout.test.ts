import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **표 칸(`<td>`/`<th>`)에 `display: flex`를 걸면 안 된다.**
 *
 * 🔴 실제 플레이에서 나왔다(2026-08-28, 부상 리포트): `td`가 flex 컨테이너가
 *   되면 **표의 열 계산에서 빠진다.** 그 열부터 정렬이 어긋나고("가운데가
 *   잘리듯이 나온다"), 안쪽 이름이 한두 글자로 잘렸다("탄…", "금…").
 *
 * 배치가 필요하면 **안쪽 래퍼**가 맡는다:
 *
 *     <td class="c-team"><span class="team-cell">…</span></td>
 *     .c-team    { width: 28%; }
 *     .team-cell { display: flex; min-width: 0; }
 *
 * ⚠ **정규식을 쓴다** — 여기선 클래스 이름을 마크업에서 뽑아 CSS와 맞대야 해서
 *   문자열 비교로는 못 한다. 대신 **패턴을 좁게** 잡고, 아래 자기검사가
 *   패턴 자체를 확인한다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const UI = resolve(ROOT, "apps/ui/src");

function svelteFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) svelteFiles(p, out);
    else if (name.endsWith(".svelte")) out.push(p);
  }
  return out;
}

const CELL_CLASS = /<t[dh][^>]*class="([^"]+)"/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 그 파일 안에서 `<td>`/`<th>`에 붙은 클래스 중 display:flex|grid가 걸린 것 */
function badCells(src: string): string[] {
  const classes = new Set<string>();
  for (const m of src.matchAll(CELL_CLASS)) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  }
  // 🔴 **주석은 세지 않는다.** CSS 주석에 적힌 `.tm`이 걸렸고, 선택자 틈이
  //   주석 끝을 넘어 **다음 규칙의 `display: grid`에 닿았다** — 이 저장소에서
  //   여러 번 나온 함정을 검사가 그대로 밟았다.
  const css = src.replace(/\/\*[\s\S]*?\*\//g, "");

  // 🔴 **규칙을 제대로 쪼갠다.** 통짜 정규식으로는 `A .b { display:flex }`에서
  //   `A`까지 걸려, **안쪽 래퍼로 옮긴 코드가 여전히 빨간불**이었다.
  //   flex가 걸리는 건 선택자의 **마지막 조각**이지 조상이 아니다.
  const bad = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display:\s*(flex|grid)/.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      const parts = sel.trim().split(/[\s>+~]+/).filter(Boolean);
      const last = parts[parts.length - 1] ?? "";
      for (const c of classes) {
        // ⚠ **경계가 없으면 짧은 이름이 긴 이름에 걸린다** — `.l`이 `.lb-card-list`에
        //   걸려 거짓 실패했다.
        if (new RegExp("\\." + escape(c) + "(?![\\w-])").test(last)) bad.add(c);
      }
    }
  }
  return [...bad];
}

describe("표 칸 배치", () => {
  /** ⚠ 패턴이 헛돌면 이 검사가 통째로 무의미하다 — 먼저 자기 자신을 확인한다 */
  it("패턴이 실제로 잡는다", () => {
    const broken = `<td class="c-team">x</td><style>.c-team { width: 28%; display: flex; }</style>`;
    expect(badCells(broken)).toEqual(["c-team"]);
    const ok = `<td class="c-team"><span class="cell">x</span></td>`
             + `<style>.c-team { width: 28%; } .cell { display: flex; }</style>`;
    expect(badCells(ok)).toEqual([]);
    // ⚠ 짧은 이름이 긴 이름에 걸리면 안 된다 — 실제로 `.l`이 `.lb-card-list`에 걸렸다
    const prefix = `<td class="l">x</td><style>.lb-card-list .tm { display: flex; }</style>`;
    expect(badCells(prefix)).toEqual([]);
    // ⚠ 주석에 적힌 이름에 걸리면 안 된다 — 실제로 `.tm`이 주석에서 걸려
    //   틈이 주석 끝을 넘어 다음 규칙의 `display: grid`에 닿았다
    const inComment = `<td class="tm">x</td>`
      + `<style>/* .tm 은 좁은 칸에서 숨긴다 */ .card li { display: grid; }</style>`;
    expect(badCells(inComment)).toEqual([]);
    // 🔴 **안쪽 래퍼로 옮긴 건 정상이다.** 조상까지 걸면 고친 코드가 계속 빨간불이다
    const wrapped = `<th class="team-col"><span class="team-cell">x</span></th>`
      + `<style>.board tbody th.team-col .team-cell { display: flex; }</style>`;
    expect(badCells(wrapped)).toEqual([]);
  });

  it("표 칸에 flex/grid를 건 화면이 없다", () => {
    const hits: string[] = [];
    for (const p of svelteFiles(UI)) {
      const bad = badCells(readFileSync(p, "utf8"));
      if (bad.length) hits.push(`${p.slice(ROOT.length + 1).replace(/\\/g, "/")} → .${bad.join(", .")}`);
    }
    expect(hits).toEqual([]);
  });
});
