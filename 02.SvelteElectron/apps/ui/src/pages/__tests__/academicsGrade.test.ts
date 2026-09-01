import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { universityGradeOf } from "../../shared/utils/careerTransition";

/**
 * 대학 학년 표시 — **정본이 둘이면 안 된다.** (2026-09-01)
 *
 * 🔴 `AcademicsPage` 가 `universityWeek / 52` 로 학년을 따로 셌다. 정본
 *    (`careerTransition.universityGradeOf`)은 `(universityWeek - 1) / 52` 라
 *    **한 주 어긋난다** — 52주차에 이 화면만 2학년으로 먼저 넘어갔다.
 *
 *    `CareerResultModal` 이 같은 실수를 걷어내며 *"정본이 둘이었다"* 고
 *    적어 뒀는데 이 화면은 남아 있었다.
 *
 * ⚠ A 가 `universityWeek` 의 원점을 옮기는 중이다(대학 이벤트 도달률 26%).
 *   축을 옮기면 따로 세던 자리가 조용히 어긋난다 — 정본만 남긴다.
 */
/**
 * ⚠ **주석을 걷고 본다.** 왜 고쳤는지를 주석에 적으면 그 안의 옛 식이
 *   검사에 걸린다 — 저장소의 다른 검사도 같은 `strip` 을 쓴다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../academics/AcademicsPage.svelte"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("대학 학년은 정본에서 읽는다", () => {
  it("학년을 직접 세지 않는다", () => {
    expect(SRC, "universityWeek 를 52 로 나눠 학년을 따로 세고 있다")
      .not.toMatch(/universityWeek\s*\/\s*52/);
  });

  it("`universityGradeOf` 를 쓴다", () => {
    expect(SRC).toMatch(/universityGradeOf\(/);
  });

  /** 학기도 같은 축이다 — `-1` 이 빠지면 26주차에 2학기가 된다 */
  it("학기도 같은 축을 쓴다", () => {
    expect(SRC, "학기가 -1 없이 26 으로 나뉜다 — 학년과 한 주 어긋난다")
      .not.toMatch(/universityWeek\s*\/\s*26/);
  });
});

/**
 * 경계값 — 정본이 한 주 늦게 올린다는 것을 못박는다.
 * 이 표가 깨지면 화면과 판정 중 하나가 옮겨간 것이다.
 */
describe("학년 경계", () => {
  it.each([
    [1, 1], [51, 1], [52, 1], [53, 2],
    [104, 2], [105, 3], [157, 4], [300, 4],
  ])("universityWeek %i → %i학년", (w, grade) => {
    expect(universityGradeOf(undefined, w)).toBe(grade);
  });
});
