import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 경기 화면의 **탈삼진** — 세는 법과 보이는 자리. (2026-09-01)
 *
 * 🔴 삼진이 한 번도 안 잡히는 결함이 **한 시즌을 통째로 지나가도록**
 *    아무 눈에도 안 띄었다. 이유가 화면에 있었다 —
 *
 *      · 경기 중 탈삼진을 **어디에도 안 띄웠다**
 *      · 종료 화면에만 있어서, 0 이어도 눈이 그냥 지나갔다
 *
 *    그래서 던지는 동안 보이는 자리(투수 카드)에 세워 둔다.
 *    다음에 같은 종류가 생기면 그 줄이 0 에서 안 움직여 바로 드러난다.
 *
 * 🔴 세는 법도 **간접 판정**이었다 — `isStrike(코드) && 아웃이 늘었나`.
 *    스트라이크와 아웃이 겹치기만 하면 셌으므로, 그 투구에 **도루 저지**처럼
 *    다른 이유로 아웃이 늘면 삼진이 아닌데도 하나 올라갔다.
 *
 *    엔진이 3스트라이크째에 코드를 좁혀 준다(`STRIKEOUT_SWING/LOOK`).
 *    그걸 그대로 가르는 `isStrikeout` 이 정확하다.
 */
const SRC = readFileSync(resolve(__dirname, "../match/MatchPage.svelte"), "utf8");

/** 주석 안의 글자가 검사에 걸리면 시험이 거짓으로 통과한다. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");

const COUNT = CODE.slice(
  CODE.indexOf("totalStrikeouts++") - 400,
  CODE.indexOf("totalStrikeouts++") + 40,
);

describe("탈삼진을 정확히 센다", () => {
  it("셈하는 자리를 찾았다", () => {
    expect(CODE, "`totalStrikeouts++` 가 사라졌다 — 검사가 헛돈다")
      .toContain("totalStrikeouts++");
  });

  it("`isStrikeout` 으로 가른다", () => {
    expect(COUNT, "삼진을 직접 가르는 술어를 안 쓴다").toMatch(/isStrikeout\(/);
  });

  /** ⚠ 이것이 옛 간접 판정이다. 되돌리면 이 줄이 잡는다. */
  it("아웃 수 증가로 짐작하지 않는다", () => {
    expect(COUNT, "간접 판정으로 돌아갔다 — 도루 저지가 삼진으로 셈된다")
      .not.toMatch(/isStrike\([\s\S]{0,60}count\.out\s*>\s*prevOuts/);
  });

  it("`isStrikeout` 을 실제로 들여온다", () => {
    expect(CODE).toMatch(/import[\s\S]{0,400}\bisStrikeout\b[\s\S]{0,400}matchResult/);
  });
});

describe("경기 중에 탈삼진이 보인다", () => {
  it("투수 카드에 탈삼진 줄이 있다", () => {
    expect(CODE, "던지는 동안 탈삼진이 안 보인다 — 0 이어도 눈에 안 띈다")
      .toMatch(/탈삼진<\/span><strong class="bv">/);
  });

  /**
   * 🔴 `gameResult.strikeouts` 는 **경기가 끝날 때 한 번** 채워진다.
   *    카드에 그걸 붙이면 경기 내내 0 이라, 있으나 마나다.
   */
  it("경기 중에도 늘어나는 값을 쓴다", () => {
    const CARD = CODE.slice(
      CODE.indexOf('탈삼진</span><strong class="bv">') - 20,
      CODE.indexOf('탈삼진</span><strong class="bv">') + 120,
    );
    expect(CARD, "종료 때만 채워지는 값이라 경기 내내 0 이다")
      .not.toMatch(/gameResult\.strikeouts/);
    expect(CARD).toMatch(/\{totalStrikeouts\}/);
  });
});
