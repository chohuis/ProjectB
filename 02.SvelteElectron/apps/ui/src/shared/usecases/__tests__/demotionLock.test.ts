import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 등록말소 10일 — 2군에 내린 선수를 바로 못 올린다 (3단계 · 3).
 *
 * ⚠ **주 단위 게임이라 10일은 2주로 둔다.** 값은 규칙 파일이 정본이다.
 *
 * 🔴 두 결함을 실측으로 잡았다:
 *   ① `weekNum` 이 시즌마다 리셋된다 — 작년 W48 을 올해 W32 와 비교하면
 *      `-16` 이라 **영원히 락**이었다(실측 위반 92명).
 *   ② IL 예외가 너무 넓었다 — "부상자가 있으면 락 무시"는 팀당 부상 2~3명인
 *      실측에서 **거의 항상 참**이라 락이 없는 것과 같았다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rules = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
  promotionRules?: { demotionLockWeeks?: number };
};

describe("등록말소 기간", () => {
  const market = strip(read("apps/ui/src/shared/usecases/weekPhases/market.ts"));
  const store = strip(read("apps/ui/src/shared/stores/game.ts"));
  const rollover = strip(read("apps/ui/src/shared/usecases/seasonRollover.ts"));

  it("값이 규칙 파일에 있다", () => {
    expect(rules.promotionRules?.demotionLockWeeks, "demotionLockWeeks").toBeGreaterThan(0);
  });

  it("코드에 숫자를 안 박는다", () => {
    // 규칙 파일과 코드가 갈리면 값을 바꿔도 안 바뀐다
    expect(market.includes("demotionLockWeeks")).toBe(true);
    expect(market.includes("const lockWeeks = "), "규칙에서 읽는다").toBe(true);
  });

  it("락 걸린 선수를 **후보에서** 뺀다", () => {
    // 엔진이 뽑은 뒤에 거르면 "뽑았는데 못 올림"이 되어 그 주 콜업이 빈다
    expect(market.includes("const farmOk = ")).toBe(true);
    expect(market.includes("farmPlayers: farmOk"), "엔진에 거른 목록을 준다").toBe(true);
  });

  it("내려간 주차를 기록하고 세이브에 싣는다", () => {
    expect(market.includes("gameStore.markDemotions(_demotedIds, weekNum)")).toBe(true);
    expect(store.includes("demotionWeek: s.demotionWeek"), "저장").toBe(true);
    expect(store.includes("saved.demotionWeek"), "복원").toBe(true);
  });

  it("🔴 시즌이 바뀌면 기록을 비운다", () => {
    // `weekNum` 이 리셋되므로 작년 기록을 두면 영원히 락이다
    expect(store.includes("clearDemotions()"), "패처").toBe(true);
    expect(rollover.includes("gameStore.clearDemotions()"), "롤오버가 부른다").toBe(true);
  });

  it("⚠ IL 예외를 넣지 않는다", () => {
    // "부상자가 있으면 락 무시"는 팀당 부상 2~3명인 실측에서 거의 항상 참이라
    // 락이 사실상 사라진다. 부상 대체는 순증 콜업이 감당한다.
    expect(market.includes("lockWeeks > 0 && ilCount === 0"), "IL 예외가 남아 있으면 안 된다").toBe(
      false,
    );
    expect(market.includes("if (lockWeeks > 0) {")).toBe(true);
  });
});
