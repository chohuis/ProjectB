import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { moraleAfterWeek } from "../../usecases/advanceWeek";

/**
 * 🔴 **사기가 100 에 고정돼 있었다.**
 *
 * 실측(`probe:traits --path univ` · 8시즌 · 씨앗 20260803):
 *
 * ```
 *   대학  최소 100 · 최대 100 · 평균 100   표본 56주 — **한 번도 안 움직인다**
 *   고교  최소  70 · 최대 100 · 평균  99
 *   사기 ≤60 에 닿은 주   0
 * ```
 *
 * 그래서 사기를 조건으로 쓰는 **대학 이벤트 아홉이 전멸**했다(트랙 B).
 * 문턱은 40·48·50·50·55·55·55·58·60 이고 다른 무대는 같은 대가 뜬다 —
 * **문턱이 아니라 축이 죽어 있었다.**
 *
 * ## 2026-09-01 — 평균 회귀를 넣었다 (사용자 확정)
 *
 * 성실은 **습관**이라 단방향 감쇠가 맞다. 사기는 **기분**이라 좋을 때도
 * 나쁠 때도 중립으로 돌아온다 — 바닥에 붙어 영영 못 올라오면 그것도
 * 죽은 축이다.
 *
 * ⚠ 이 파일은 **산식의 성질**을 못박는다. 실제 궤적은 `probe:traits` 로
 * 재고 그 값은 `BALANCE_BASELINE` 에 남긴다.
 */

const SRC = readFileSync(
  resolve(__dirname, "../../usecases/advanceWeek.ts"), "utf8");

/** 소스에서 상수를 읽는다 — 검사에 값을 적으면 코드와 어긋나도 초록이다 */
function constOf(name: string): number {
  const i = SRC.indexOf(`const ${name} = Number(`);
  if (i < 0) throw new Error(`${name} 을 못 읽었다 — 소스와 어긋났다`);
  const tail = SRC.slice(i, i + 400);
  const m = tail.indexOf("||");
  const end = tail.indexOf(")", m);
  const v = Number(tail.slice(m + 2, end).trim());
  if (!Number.isFinite(v)) throw new Error(`${name} 기본값을 못 읽었다`);
  return v;
}

const PIVOT = constOf("MORALE_PIVOT");
const PULL = constOf("MORALE_WEEKLY_PULL");

/**
 * 🔴 **코드의 함수를 그대로 부른다.** 식을 검사에 다시 적으면 검사가 자기
 * 사본을 보게 되고, 그러면 **코드를 되돌려도 초록**이다 — 실제로 처음에
 * 그렇게 짰다가 변이 검증에서 1건만 잡혀 드러났다.
 */
const step = moraleAfterWeek;

describe("사기 평균 회귀 — 산식의 성질", () => {
  it("기준값과 회귀율을 소스에서 읽는다", () => {
    expect(PIVOT).toBeGreaterThan(30);
    expect(PIVOT).toBeLessThan(80);
    expect(PULL).toBeGreaterThan(0);
    expect(PULL).toBeLessThan(1);
  });

  /** 🔴 **여기가 결함이었다** — 100 에서 아무 일도 안 일어났다 */
  it("100 에서 내려온다", () => {
    expect(step(100)).toBeLessThan(100);
  });

  /** ⚠ 단방향 감쇠와 갈리는 지점 — 바닥에서는 **올라와야** 한다 */
  it("바닥에서 올라온다", () => {
    expect(step(20)).toBeGreaterThan(20);
    expect(step(0)).toBeGreaterThan(0);
  });

  it("기준값에서는 안 움직인다", () => {
    expect(step(PIVOT)).toBeCloseTo(PIVOT, 9);
  });

  /** 가까울수록 느려진다 — 그게 회귀다 */
  it("멀수록 크게 움직인다", () => {
    expect(Math.abs(step(100) - 100)).toBeGreaterThan(Math.abs(step(70) - 70));
  });

  it("범위를 안 벗어난다", () => {
    for (const v of [0, 1, 50, 99, 100]) {
      expect(step(v)).toBeGreaterThanOrEqual(0);
      expect(step(v)).toBeLessThanOrEqual(100);
    }
  });

  /**
   * 🔴 **정수로 반올림하면 죽는다.** 회귀량이 1 미만일 때 매주 0이 되어
   * 아무 일도 안 일어난다 — 성실에서 겪은 함정이다.
   */
  it("소수를 유지한다 — 사기 70 근처에서도 움직인다", () => {
    const near = step(70);
    expect(near).not.toBe(70);
    expect(Math.abs(near - 70)).toBeLessThan(1);   // 1 미만이라 반올림하면 사라진다
  });

  /**
   * ⚠ **TOP10 보상과 평형점이 생겨야 한다.** `rankEffect` 가 매주 최대 +5 를
   * 준다(음수 없음). 회귀가 그걸 못 이기면 다시 100 에 붙는다.
   */
  it("100 에서의 회귀량이 TOP10 최대 보상과 같은 자릿수다", () => {
    const pullAt100 = Math.abs(step(100) - 100);
    expect(pullAt100, "회귀가 너무 약하면 TOP10 보상에 밀려 다시 천장에 붙는다")
      .toBeGreaterThan(0.5);
    expect(pullAt100, "회귀가 너무 세면 사기가 늘 기준값에 눌린다")
      .toBeLessThan(5);
  });
});

describe("코드가 회귀를 실제로 적용한다", () => {
  /** 주석을 걷고 본다 — 왜 고쳤는지를 적으면 그 안의 옛 식이 걸린다 */
  const BODY = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("주간 패치에 morale 을 넣는다", () => {
    expect(BODY).toMatch(/protagonistPatch\.morale\s*=/);
  });

  it("기준값 쪽으로 끌어당기는 식을 쓴다", () => {
    expect(BODY, "MORALE_PIVOT 을 안 쓰면 회귀가 아니다")
      .toMatch(/MORALE_PIVOT\s*-\s*cur/);
    expect(BODY).toMatch(/MORALE_WEEKLY_PULL/);
  });
});
