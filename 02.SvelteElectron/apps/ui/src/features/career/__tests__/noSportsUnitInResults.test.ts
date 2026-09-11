import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 진로 결과 화면에 **체육부대가 있으면 안 된다.** (2026-09-01)
 *
 * 🔴 C 가 `svelte-check` 오류 4건을 보고 "`sportsMilitaryPassed` 를 만드는
 *    코드가 없다 → 타입을 늘려달라"고 A 에게 넘겼다. 진단은 맞았는데
 *    **처방이 틀렸다.** A 가 재 보니 그 위쪽이 통째로 죽어 있었다 —
 *
 *      `sportsMilitaryApplied` 를 true 로 만드는 코드가 **0건**.
 *      리터럴 `false` 둘과 읽는 곳 하나뿐이었다.
 *
 *    `hasSports` 가 영영 false 라 그 블록은 **뜬 적이 없다.**
 *    "눌러도 늘 불합격"이 아니라 누를 수가 없었다.
 *
 * ⚠ **시점도 대상도 다르다.**
 *      진로 허브   고2 W28 · 대학 W29     아마추어 진로
 *      체육부대    W46 후보공개 → W50 결과  **프로 선수** 대상
 *
 *    진짜 경로는 `advanceWeek` 이 `protagonist.sportsUnitApplied` 로 이미
 *    제대로 돈다. 여기 되살리면 죽은 갈래가 둘이 된다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const MODAL = read("apps/ui/src/features/career/ui/CareerResultsModal.svelte");

describe("진로 결과 — 체육부대 갈래는 없다", () => {
  it("`sportsMilitaryPassed` 를 읽지 않는다", () => {
    // 주석에는 남는다 — 왜 지웠는지가 사라지면 다음 사람이 또 넣는다
    const code = MODAL.replace(/\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
    expect(code, "죽은 필드를 다시 읽고 있다").not.toMatch(/sportsMilitaryPassed/);
  });

  it("`hasSports` 갈래가 없다", () => {
    const code = MODAL.replace(/\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
    expect(code).not.toMatch(/hasSports/);
    expect(code).not.toMatch(/sportsRevealed/);
  });
});

/**
 * 🔴 **진짜 경로는 살아 있어야 한다.** 위를 지우면서 이쪽까지 지우면
 *    체육부대가 게임에서 통째로 사라진다.
 */
describe("진짜 체육부대 경로는 그대로다", () => {
  const ADVANCE = read("apps/ui/src/shared/usecases/advanceWeek.ts");

  it("`sportsUnitApplied` 로 W50 결과를 처리한다", () => {
    expect(ADVANCE, "체육부대 결과 처리가 사라졌다").toMatch(
      /MILITARY_RESULT_WEEK && p\.sportsUnitApplied/,
    );
  });

  it("후보 공개(W46)가 살아 있다", () => {
    expect(ADVANCE).toMatch(/SPORTS_UNIT_CANDIDATES_WEEK/);
  });

  /**
   * ⚠ 주인공 저장본의 `sportsUnitApplied` 는 **새 게임이 넣어야 한다.**
   *   C 가 2주차에 빠진 걸 찾아 채웠다 — 없으면 위 W50 갈래가 안 돈다.
   */
  it("새 게임이 `sportsUnitApplied` 를 넣는다", () => {
    expect(read("apps/ui/src/pages/new-game/NewGamePage.svelte")).toMatch(
      /sportsUnitApplied: false/,
    );
  });
});
