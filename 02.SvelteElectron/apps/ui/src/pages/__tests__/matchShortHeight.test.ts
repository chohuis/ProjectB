import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 경기 화면 720p — **선수 카드가 이름만 남았다.** (2026-09-01 · 실측)
 *
 * 🔴 오른쪽 열은 `auto auto minmax(0, 1fr)` 이라 앞 두 행이 먹고 남는 것을
 *    카드가 갖는다. 1280×720 에서 남는 것이 46px, 머리글이 21px 이라
 *    목록에 **0px** 이 남았다 — 투구를 고르라고 띄운 상대 타자 능력치다.
 *
 *        열 558 = 상황 203 + 가운데 285 + 간격 24 + 카드 46
 *
 * ## ⚠ 존 캔버스를 줄이는 길은 한 픽셀도 안 내준다
 *
 *    주입해서 쟀다 — `max-width` 를 176→110 으로 줄여도 가운데 행은 285 그대로다.
 *    존은 `flex: 1 1 auto` 라 행 높이를 안 정한다. **옆 칸(구종 선택)이 정한다.**
 *    줄이면 조준 정밀도만 잃는다. 이 검사가 그걸 지킨다.
 *
 * ## 고친 뒤 실측
 *
 *        해상도       카드 행      보이는 줄 (타자·투수)
 *        1280×720     46 → 104     0·0 → 5/5 · 4/4
 *        1366×768     94 → 152     2·2 → 5/5 · 4/4
 *        1536×864       190 (그대로)      5/5 · 4/4
 *        1920×1080      406 (그대로)      5/5 · 4/4
 */
const SRC = readFileSync(resolve(__dirname, "../match/MatchPage.svelte"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "");

const HEAD = CODE.indexOf("@media (max-height: 800px)");
const BLOCK = HEAD < 0 ? "" : CODE.slice(HEAD, CODE.indexOf("\n  }", HEAD));

describe("짧은 높이에서 카드가 살아 있다", () => {
  it("짧은 높이 블록이 있다", () => {
    expect(HEAD, "720p 대응 블록이 사라졌다 — 카드가 다시 이름만 남는다")
      .toBeGreaterThan(-1);
  });

  it("목록을 두 열로 눕힌다", () => {
    expect(BLOCK, "세로로 쌓으면 1280×720 에 안 들어간다")
      .toMatch(/\.bar-list, \.line-list \{[^}]*grid-template-columns:\s*1fr 1fr/);
  });

  it("상황 패널이 자리를 내준다", () => {
    expect(BLOCK, "내주는 데가 없으면 카드 행이 46px 에 머문다")
      .toMatch(/\.diamond \{[^}]*width:\s*88px/);
    expect(BLOCK).toMatch(/\.sbo-label \{[^}]*font-size/);
  });

  /**
   * 🔴 **A 가 조건을 걸었다** — 존을 줄이면 조준 정밀도가 바뀌므로 숫자를
   *    사용자가 보고 정해야 한다. 재 보니 **줄여도 얻는 게 없어서** 안 줄였다.
   *    이 검사는 나중에 누가 "높이가 모자라니 존을 줄이자"로 되돌리는 걸 막는다.
   */
  it("존 캔버스는 안 건드린다", () => {
    expect(BLOCK, "존을 줄여도 행 높이는 안 준다 — 조준 정밀도만 잃는다")
      .not.toMatch(/\.zone-canvas/);
    expect(BLOCK).not.toMatch(/\.sz-inner-box/);
  });
});

/**
 * 🔴 베이스 좌표가 px 로 박혀 있어 다이아몬드를 줄이면 **네 베이스가
 *    제자리를 벗어났다** (실제로 그렇게 찍혔다). 비율로 옮겼다.
 *
 * ⚠ 이미 한 번 틀렸던 자리다 — 원래 주석이 "중앙 52에서 절반 8을 빼 44" 라고
 *   적어 놨다. `calc(50% - 8px)` 이 그 계산을 그대로 옮긴 것이라
 *   **104px 에서 값이 한 픽셀도 안 바뀐다.**
 *   실측: 88px 에서 네 거리 [22,22,22,22] · 104px 에서 [27,27,27,27].
 */
describe("다이아몬드가 줄어도 베이스가 제자리다", () => {
  // ⚠ **템플릿 문자열이 한 겹 벗긴다** — `\.` 은 정규식에 `.` 으로 들어간다.
  //   탈출이 아무 일도 안 하고 있었으니 지운다(찾는 값은 그대로다).
  const R = (n: string) => CODE.match(new RegExp(`.${n} {[^}]*}`))?.[0] ?? "";

  it("네 베이스가 다 있다", () => {
    for (const n of ["b1", "b2", "b3", "home"]) expect(R(n), `${n} 이 없다`).not.toBe("");
  });

  it("px 로 박아 두지 않았다", () => {
    for (const n of ["b1", "b2", "b3", "home"]) {
      expect(R(n), `${n} 이 px 고정이라 다이아몬드가 줄면 자리를 벗어난다`)
        .not.toMatch(/:\s*\d+px[;\s]/);
    }
  });

  it("가운데 축은 절반에서 베이스 절반을 뺀다", () => {
    for (const n of ["b1", "b2", "b3", "home"]) {
      expect(R(n), `${n} 의 가운데 축이 어긋난다 — 홈과 1루만 붙어 보인 적이 있다`)
        .toMatch(/calc\(50% - 8px\)/);
    }
  });
});
