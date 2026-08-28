import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **야구 표기 함수를 만들어 놓고 한 화면에만 붙인 자리들.**
 *
 * 🔴 세 번 같은 형태로 나왔다(2026-08-28 실제 플레이):
 *   · `seasonLabel` — `TeamDetailModal`은 쓰는데 **팀 선택 화면**은 `S-1`을 그대로 찍었다
 *   · `ipLabel`     — `PlayerDetailModal`은 쓰는데 **"나" 탭**은 `2.6666`을 그대로 찍었다
 *
 * 만든 다음 **붙이는 걸 잊는 게 진짜 결함**이다. 화면을 하나씩 세지 않고
 * "그 값을 찍는 화면이 함수를 거치는가"로 본다.
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const UI = resolve(ROOT, "apps/ui/src");

/** `.svelte` 전부 — 새 화면이 생겨도 자동으로 걸린다 */
function svelteFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) svelteFiles(p, out);
    else if (name.endsWith(".svelte")) out.push(p);
  }
  return out;
}
const FILES = svelteFiles(UI).map((p) => ({ path: p, src: readFileSync(p, "utf8") }));
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

describe("야구 표기 함수 채택", () => {
  /**
   * 🔴 **`S-1`을 그대로 찍는 화면이 없어야 한다.** 플레이어는 `S-3`이 몇 년인지
   *   모른다. 세계 생성이 과거 5시즌을 상대 표기로 적어 둔 것이지 표시용이 아니다.
   */
  it("상대 시즌 표기를 그대로 찍는 화면이 없다", () => {
    const bad = FILES.filter((f) =>
      f.src.includes("{sr.season}") || f.src.includes("{r.season}") || f.src.includes("{s.season}"));
    expect(bad.map((f) => rel(f.path))).toEqual([]);
  });

  /**
   * 🔴 **IP를 소수로 찍으면 안 된다.** 야구에서 `.1`은 1/3이닝이고 `.3`은 없는 값이다.
   *   `ipLabel`이 그 변환의 정본이다.
   */
  it("이닝을 함수 없이 찍는 화면이 없다", () => {
    const bad = FILES.filter((f) => {
      // `<td>{...ip...}</td>` 꼴로 그대로 찍는 자리
      return f.src.includes("{g.ip ?? ") || f.src.includes("{st.ip}")
          || f.src.includes("{line.ip}") || f.src.includes("{stats.ip}");
    });
    expect(bad.map((f) => rel(f.path))).toEqual([]);
  });

  /**
   * ⚠ **함수를 쓰는 화면이 실제로 있어야 한다.** 위 둘은 "없다"만 보므로,
   *   화면이 통째로 사라져도 통과한다. 쓰는 쪽도 같이 못박는다.
   */
  it("두 함수가 실제로 화면에 붙어 있다", () => {
    const users = (name: string) =>
      FILES.filter((f) => f.src.includes(name + "(")).map((f) => rel(f.path));
    // 팀 상세 + 팀 선택(새 게임)
    expect(users("seasonLabel").length).toBeGreaterThanOrEqual(2);
    // 선수 상세 + "나" 탭
    expect(users("ipLabel").length).toBeGreaterThanOrEqual(2);
  });

  /**
   * ⚠ **배경 토큰을 글자색에 쓰지 않는다.** `--panel-sunk`는 `#EEF2F8`(표 머리·
   *   입력 배경)이라 흰 패널 위에서 글자가 안 보인다 — 새 게임 확인 화면의
   *   생년월일이 그랬다.
   */
  it("배경 토큰을 글자색에 쓰지 않는다", () => {
    // ⚠ **`border-color`·`background-color`를 먼저 걷어낸다.** 그냥 찾으면
    //   그 둘도 `color: var(--panel-sunk)`를 품고 있어 **거짓 실패한다** —
    //   테두리에 배경 톤을 쓰는 건 정당하다. 실제로 두 자리가 걸렸다.
    const bad = FILES.filter((f) =>
      f.src
        .split("border-color: var(--panel-sunk)").join("")
        .split("background-color: var(--panel-sunk)").join("")
        .includes("color: var(--panel-sunk)"));
    expect(bad.map((f) => rel(f.path))).toEqual([]);
  });
});
