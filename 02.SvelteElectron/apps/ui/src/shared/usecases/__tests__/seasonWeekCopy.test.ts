import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MILITARY_RESULT_WEEK,
  SPORTS_UNIT_CANDIDATES_WEEK,
  STOVE_LEAGUE_WEEK,
} from "../../utils/seasonWeeks";

/**
 * **사람이 읽는 문안에 주차를 글자로 적지 않는다.**
 *
 * 🔴 왜 생겼나 (2026-09-20 → 09-21). 주차 상수를 옛 값(W43·W50·W52)에서 한 번에
 *   옮겼는데 **소식 본문의 숫자는 같이 안 따라왔다.** 코드는 맞고 문안만 거짓말을
 *   한다 — 아무도 안 죽고 로그도 안 남는 형태다.
 *
 *   - 신청 모달이 「W52에 최종 선발 결과」라고 했다 → 09-20 에 고쳤다
 *   - 28세 입영 만료 경고가 「이번 시즌 W52 주차에 입영 절차」라고 했다.
 *     그 블록은 `MILITARY_RESULT_WEEK`(50)에서 돈다 → 여기서 고쳤다
 *   - 프로 시즌 종료 소식이 「W43부터 연봉협상 · W50 체육부대 신청」이라고 했다.
 *     각각 `STOVE_LEAGUE_WEEK`(39) · `SPORTS_UNIT_CANDIDATES_WEEK`(46)이다
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만. `advanceWeek.ts` 는 `.prettierignore`
 * 안이라 서식이 바뀌어 이 문자열이 흔들리지 않는다.
 */
const SRC = readFileSync(resolve(__dirname, "../advanceWeek.ts"), "utf8");

describe("소식 문안의 주차는 상수에서 읽는다", () => {
  it("옛 주차를 글자로 적은 자리가 없다", () => {
    for (const stale of ["W52 주차에 입영", "W52에 입영", "W43부터 연봉협상", "W50 체육부대 신청"])
      expect(SRC.includes(stale)).toBe(false);
  });

  it("셋 다 상수를 끼워 넣는다", () => {
    expect(SRC.includes("W${MILITARY_RESULT_WEEK} 주차에 입영 절차가 진행됩니다.")).toBe(true);
    expect(SRC.includes("W${STOVE_LEAGUE_WEEK}부터 연봉협상")).toBe(true);
    expect(SRC.includes("W${SPORTS_UNIT_CANDIDATES_WEEK} 체육부대 신청")).toBe(true);
  });

  /**
   * 🔴 **문안과 실제 블록이 같은 주를 말하는지**까지 본다. 위 검사만 있으면
   *   「상수를 끼워 넣긴 했는데 엉뚱한 상수」를 못 잡는다. 경고는
   *   `MILITARY_AGE_WARNING_WEEK` 에 뜨고 입영 pending 은
   *   `MILITARY_RESULT_WEEK` 에서 밀린다 — 문안이 가리켜야 할 건 뒤쪽이다.
   */
  it("입영 만료 경고가 가리키는 주가 pending 을 미는 주다", () => {
    const guard = "p.age >= 28 && p.militaryAskedYear !== s.seasonYear";
    const at = SRC.indexOf(guard);
    expect(at).toBeGreaterThan(-1);
    const line = SRC.slice(SRC.lastIndexOf("\n", at) + 1, SRC.indexOf("\n", at));
    expect(line.includes("weekInYear === MILITARY_RESULT_WEEK")).toBe(true);
  });

  it("상수 셋은 서로 다르다 — 같으면 이 검사가 아무것도 안 본다", () => {
    const three = [MILITARY_RESULT_WEEK, SPORTS_UNIT_CANDIDATES_WEEK, STOVE_LEAGUE_WEEK];
    expect(new Set(three).size).toBe(3);
  });
});
