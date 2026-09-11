import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ── 소식 id는 해가 바뀌어도 안 겹쳐야 한다 ──────────────────────
//
// `weekNum`은 **시즌마다 1로 리셋된다.** 그래서 주차만 넣은 id는 해마다
// 같은 값이 다시 난다. 소식 목록이 `{#each sorted as msg (msg.id)}`로 id를
// 키로 잡기 때문에 중복이 하나만 생겨도 Svelte가 `each_key_duplicate`로 죽고
// **세이브가 아예 안 열린다** — 로드 화면에서 멈춘 채 화면엔 단서가 없다.
//
// 이 프로젝트는 여기 두 번 물렸다:
//   ① `msg-digest-w13`     — 실제로 세이브가 안 열렸다
//   ② `msg-rel-<사람>-w31` — 관계도가 죽어 있어서(주 경계 어긋남) 라벨 변화가
//      아예 없었고, 그래서 **터질 기회가 없었을 뿐이다.** 고치자마자 도달 가능해졌다
//
// ②가 이 검사를 만든 이유다. 눈으로 훑는 것으로는 "지금 안 터지는 것"과
// "안전한 것"을 못 가른다.

const ROOT = resolve(__dirname, "../../../");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * id 안에 "해마다 달라지는 것"이 하나라도 있으면 안전하다.
 *
 * 🔴 **`Date.now()` 는 여기서 뺐다** (2026-09-06). 해가 달라지긴 하지만
 *   **재현이 안 된다** — 같은 세이브를 다시 열면 다른 id 가 나고, 같은
 *   밀리초에 둘이 나면 그대로 겹친다(이 검사가 막으려던 바로 그 죽음).
 *   아래 두 번째 검사가 `Date.now()` 자체를 금지한다.
 * ⚠ `gameDate`("2026-04-15")도 연도를 들고 있지만 **여기 넣지 않는다** —
 *   그걸 허용하면 "연도가 있다"의 판정이 문자열 짐작이 된다. 연도가
 *   필요하면 `seasonYear` 를 인자로 받는다.
 */
const HAS_YEAR = /seasonYear|\$\{year\}|\$\{now\}|\$\{y\}|\bYear\b/;

/** 주차만으로 만든 id인가 — `w${week}` · `-${weekNum}` 류 */
const WEEK_ONLY = /\$\{week(Num|InYear)?\}/;

describe("소식 id에 주차만 넣지 않는다", () => {
  const files = walk(ROOT);

  it("소스를 실제로 훑었다 — 경로가 틀리면 0건이라 조용히 통과한다", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("`id: \\`msg-...\\`` 중 주차만 쓰는 것이 없다", () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      // `id: \`msg-...\`` 한 줄짜리 템플릿만 본다 (id 조립은 전부 이 형태다)
      for (const m of s.matchAll(/\bid:\s*`(msg-[^`]*)`/g)) {
        const idTpl = m[1];
        if (!WEEK_ONLY.test(idTpl)) continue; // 주차를 안 쓰면 대상 아님
        if (HAS_YEAR.test(idTpl)) continue; // 해가 들어 있으면 안전
        bad.push(`${f.slice(ROOT.length + 1)}  ${idTpl}`);
      }
    }
    expect(bad, `주차만 쓴 소식 id — 다음 시즌 같은 주차에 겹친다:\n  ${bad.join("\n  ")}`).toEqual(
      [],
    );
  });

  // ── 시계로 만든 id는 재현이 안 된다 ────────────────────────────
  //
  // `Date.now()` 를 쓰면 **같은 세이브를 다시 열 때마다 다른 id** 가 난다.
  // 두 가지가 따라온다:
  //   ① 계측·회귀가 소식을 id 로 못 짚는다 — `check:msgdupid` 가 잡을
  //      기회 자체가 없다(사본이 나도 id 가 달라 사본으로 안 보인다)
  //   ② 같은 밀리초에 둘이 나면 그대로 겹친다 — 위 검사가 막으려던 죽음이
  //      다른 문으로 들어온다
  //
  // 2026-09-06 에 소식 id 15자리를 연도·주차·대상으로 바꾸면서 이 검사를 걸었다.
  it("소식 id를 시계로 만들지 않는다 (`Date.now()`)", () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/\bid:\s*`((?:msg|evt)-[^`]*)`/g)) {
        if (m[1].includes("Date.now()")) bad.push(`${f.slice(ROOT.length + 1)}  ${m[1]}`);
      }
    }
    expect(
      bad,
      `시계로 만든 소식 id — 재현이 안 되고 같은 순간 둘이면 겹친다:\n  ${bad.join("\n  ")}`,
    ).toEqual([]);
  });
});
