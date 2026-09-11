import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 구장 잘림 (2026-08-30).
 *
 * 🔴 **실사용 해상도 10 중 8에서 아래가 잘려 홈플레이트·포수·타자가
 *   통째로 안 보였다.** 1920x1080 에서 139px, 2560x1440 에서 216px.
 *
 * ⚠ **08-28 에 같은 증상을 고쳤는데 그 고침이 반대쪽으로 넘쳤다.**
 *   폭에서 높이를 뽑으니 **화면이 넓을수록 심해졌다** — 그래서 좁은
 *   창에서 보던 사람은 멀쩡하다고 느낀다(1280x720 이 유일한 예외였다).
 *
 * 🔴 그때 `.wrapper` 의 `height: 100%` 를 빼면서 `.viewport` 의
 *   `max-height: 100%` 가 **기댈 데를 잃고 조용히 안 먹었다.**
 *   같은 주석이 "max-height 가 없으면 넘친다"고 스스로 적어 둔
 *   그 안전망이다 — **고침이 제 안전망을 껐다.**
 *
 * 계측 560건: `node scripts/parkclip/measure.mjs`
 */
const ROOT = resolve(__dirname, "../../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

describe("구장이 칸 안에 들어간다", () => {
  const field = strip(read("apps/ui/src/features/match-view/ui/BaseballField.svelte"));
  const page = strip(read("apps/ui/src/pages/match/MatchPage.svelte"));

  it("🔴 높이에서 폭을 뽑는다 — 폭에서 높이가 아니다", () => {
    // 폭 기준이면 넓은 화면에서 높이가 칸을 넘고 아래가 잘린다
    expect(field.includes("height: 100%;\n    width: auto;")).toBe(true);
    expect(field.includes("max-width: 100%;")).toBe(true);
  });

  it("🔴 `.wrapper`가 높이를 넘겨준다 — 안 그러면 max-height가 안 먹는다", () => {
    // 이게 빠져서 08-28 고침이 제 안전망을 껐다
    expect(field.includes("height: 100%;\n    min-height: 0;")).toBe(true);
  });

  it("`max-height: 100%`가 남아 있다", () => {
    expect(field.includes("max-height: 100%;")).toBe(true);
  });

  it("🔴 `min-height: 280px`를 두지 않는다 — 낮은 창에서 다시 잘린다", () => {
    // 실측(verify-fix): 1600x520 에서 68px, 1280x420 에서 142px 잘렸다
    expect(field.includes("min-height: 280px")).toBe(false);
  });

  it("부모 칸이 높이를 준다", () => {
    // `align-items: start` 면 높이가 내용 기준이라 `100%` 가 풀린다
    // ⚠ **같은 파일에 `align-items: stretch` 가 둘이다** — 파일 전체에서
    //   문자열만 찾으면 **다른 규칙의 것으로 통과한다**(변이로 확인).
    //   블록 안을 본다.
    const at = page.indexOf(".field-stage-wrap {");
    expect(at, ".field-stage-wrap 규칙이 있다").toBeGreaterThan(-1);
    const blk = page.slice(at, at + page.slice(at).indexOf("}"));
    expect(blk.includes("align-items: stretch;"), "그 블록 안에 있어야 한다").toBe(true);
  });

  it("비율이 viewBox와 같다 — 틀이 구장을 감싼다", () => {
    // 폭만 늘리는 해법(후보 ②)은 안 잘리지만 틀 비율이 1.33~1.38 로 벌어진다
    expect(field.includes("aspect-ratio: 1000 / 920;")).toBe(true);
    expect(field.includes('viewBox="0 0 1000 920"')).toBe(true);
  });
});
