import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ── optional 필드를 무방비로 쓰지 않는다 ─────────────────────────
//
// `TeamProfile`은 필드가 **전부 optional**이다. 그런데 진로 신청 화면 둘이
// `selectedTeam.profile.strengths.join(" / ")`을 그대로 불렀다.
//
// `{#if selectedTeam.profile}` 가드가 있어서 안전해 보였는데, 실제 데이터는
// **profile은 238팀 전부 있고 strengths는 하나도 없다**(refs.json). 그래서
// 가드는 통과하고 `.join()`에서 터졌다 — **두 화면이 아무한테도 안 열렸다.**
// 콘솔에만 흔적이 남아서, UI 순회기가 열어보기 전까지 아무도 몰랐다.
//
//   [pageerror] Cannot read properties of undefined (reading 'join')
//     in IndependentApplyModal.svelte
//
// 눈으로 훑는 것으로는 "가드가 있다"와 "안전하다"를 못 가른다.

const SRC = resolve(__dirname, "../../../");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".svelte")) out.push(p);
  }
  return out;
}

/** `TeamProfile`에서 배열인 필드 — `.join`/`.map`/`.length`를 부르면 위험하다 */
const ARRAY_FIELDS = ["strengths", "tags"];

describe("optional 프로필 필드를 무방비로 쓰지 않는다", () => {
  const files = walk(SRC);

  it("화면 파일을 실제로 훑었다 — 경로가 틀리면 0건이라 조용히 통과한다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("profile의 배열 필드에 ?. 없이 .join/.map을 부르지 않는다", () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const field of ARRAY_FIELDS) {
        // `profile.strengths.join(` — 사이에 `?.`가 없는 형태만 잡는다
        const re = new RegExp(`profile\\.${field}\\.(join|map|forEach|filter)\\s*\\(`, "g");
        for (const m of s.matchAll(re)) {
          bad.push(`${f.slice(SRC.length + 1)}  ${m[0]}`);
        }
      }
    }
    expect(bad, `optional 배열을 무방비로 씁니다 — 값이 없으면 화면이 통째로 안 열립니다:\n  ${bad.join("\n  ")}`)
      .toEqual([]);
  });
});

describe("팀 ID 원문을 화면에 찍지 않는다", () => {
  // `TEAM_UNIV_…`가 그대로 보였다. 이 프로젝트는 ID→이름 변환 층이 여러 겹이라
  // 한 겹만 빠져도 원문이 샌다 — UI 순회기의 빈값 누출 검사와 같은 표적이다.
  const files = walk(SRC);

  it("진로 신청 화면이 selectedTeam.id를 본문에 찍지 않는다", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (!/ApplyModal\.svelte$/.test(f)) continue;
      const s = readFileSync(f, "utf8");
      // 속성(`teamId={...}`)이나 핸들러 인자는 정상이다. **텍스트 노드**만 본다
      for (const m of s.matchAll(/>\s*\{selectedTeam\.id\}\s*</g)) {
        bad.push(`${f.slice(SRC.length + 1)}  ${m[0].trim()}`);
      }
    }
    expect(bad, `팀 ID 원문이 화면에 노출됩니다:\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});
