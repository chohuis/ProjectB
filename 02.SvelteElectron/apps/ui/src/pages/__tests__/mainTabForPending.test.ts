import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PENDING_ACTION_TYPES } from "../../shared/types/season";

/**
 * `tabForPending` 이 **`PendingAction` 을 다 덮는가.** (2026-09-01, 트랙 C)
 *
 * 🔴 유니온은 17종인데 `case` 는 15개였다. `injuryTreatment` ·
 *    `conditionWarning` 이 다음 순번이면 함수가 `undefined` 를 냈고, 그 값이
 *    두 군데로 흘렀다 —
 *      · `pendingByTab[undefined]` → 내비 **배지가 안 뜬다**
 *      · `openPendingFromNext` 가 `currentTab = undefined` 를 박는다
 *    `svelte-check` 는 "Function lacks ending return statement" 한 줄로만
 *    말했다. 타입 오류처럼 보이지만 **동작이 이미 어긋나 있었다.**
 *
 * ⚠ 목록을 손으로 적지 않는다 — `PENDING_ACTION_TYPES` 를 그대로 쓴다.
 *   적으면 유형이 늘 때 이 검사가 검사를 안 하게 된다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../main/MainPage.svelte"), "utf8");

const FN = SRC.slice(
  SRC.indexOf("function tabForPending"),
  SRC.indexOf("$: navTabs"));

describe("tabForPending — 모든 pendingAction 유형을 덮는다", () => {
  it("함수를 찾았다", () => {
    expect(FN.length, "tabForPending 을 못 잘랐다 — 검사가 헛돈다")
      .toBeGreaterThan(200);
  });

  it.each([...PENDING_ACTION_TYPES])("`%s` 를 처리한다", (t) => {
    expect(FN, `case "${t}" 가 없다 — 이 유형이 오면 currentTab 이 undefined 가 된다`)
      .toContain(`case "${t}":`);
  });

  /**
   * 🔴 컴파일 단계에서도 잡히게 해 둔다. 위 `switch` 가 유니온을 다 덮으면
   *    `action` 은 `never` 이므로 이 대입이 성립한다 — 한 종이라도 빠지면
   *    `svelte-check` 가 깨진다.
   */
  it("소진 검사가 있다", () => {
    expect(FN, "never 대입 가드가 사라졌다 — 다음에 유형이 늘면 조용히 샌다")
      .toMatch(/const _exhaustive: never = action;/);
  });

  /**
   * `switch` 안의 반환 하나로는 부족하다 — 유니온이 늘면 그 길로는 안 간다.
   * **밖에도 반환이 있어야** 어떤 값이 와도 `undefined` 가 안 나온다.
   */
  it("switch 바깥에도 반환이 있다 — undefined 를 낼 수 없다", () => {
    const returns = FN.match(/return "news";/g) ?? [];
    expect(returns.length,
      "반환이 하나뿐이다 — switch 를 비껴가면 undefined 가 흐른다")
      .toBeGreaterThanOrEqual(2);
  });
});
