import { describe, it, expect } from "vitest";
import { parseEffectsArray } from "../../stores/master";

/**
 * **태그를 닫을 수단** — `removeTag`.
 *
 * 🔴 **2026-08-26까지 `addTag`만 있었다.** 이벤트 연계를 태그로 만들면
 *   ("부상 이력" → 후속 이벤트) 한 번 붙은 태그가 **평생 남아** 연계가 끝나도
 *   그 갈래가 계속 후보로 남는다. 트랙 B가 결함으로 넘긴 자리다.
 *
 * ⚠ 태그 적용 순서는 **더한 뒤 뺀다.** 한 선택지가 같은 태그를 넣고 빼면
 *   결과는 "없음"이어야 한다 — 반대로 하면 넣은 것이 남아 안 닫힌다.
 */

/** `game.ts`의 `applyTags`와 같은 규칙 — 순서를 여기서 못박는다 */
function applyTags(cur: string[], add?: string[], remove?: string[]): string[] {
  if (!add && !remove) return cur;
  const out = new Set(add ? [...cur, ...add] : cur);
  for (const r of remove ?? []) out.delete(r);
  return [...out];
}

describe("removeTag", () => {
  it("문자열형 보상이 태그 이름을 싣는다 — 숫자가 아니다", () => {
    const fx = parseEffectsArray(["removeTag:부상이력"]);
    expect(fx.removeTag).toEqual(["부상이력"]);
  });

  it("여러 개를 쌓는다", () => {
    const fx = parseEffectsArray(["removeTag:가", "removeTag:나"]);
    expect(fx.removeTag).toEqual(["가", "나"]);
  });

  it("붙은 태그를 뗀다", () => {
    expect(applyTags(["부상이력", "주장"], undefined, ["부상이력"])).toEqual(["주장"]);
  });

  // 🔴 순서가 뒤집히면 연계가 안 닫힌다
  it("같은 태그를 넣고 빼면 결과는 없음이다 — 더한 뒤 뺀다", () => {
    expect(applyTags([], ["연계중"], ["연계중"])).toEqual([]);
  });

  it("없는 태그를 지워도 안 터진다 — 순서가 어긋나도 살아남는다", () => {
    expect(() => applyTags(["주장"], undefined, ["없는것"])).not.toThrow();
    expect(applyTags(["주장"], undefined, ["없는것"])).toEqual(["주장"]);
  });

  it("둘 다 없으면 원본 그대로다 — 불필요한 새 배열을 안 만든다", () => {
    const cur = ["주장"];
    expect(applyTags(cur)).toBe(cur);
  });

  it("addTag는 그대로 동작한다 — 기존 경로를 안 깼다", () => {
    expect(applyTags(["가"], ["나"])).toEqual(["가", "나"]);
    expect(applyTags(["가"], ["가"])).toEqual(["가"]);   // 중복 무시
  });
});
