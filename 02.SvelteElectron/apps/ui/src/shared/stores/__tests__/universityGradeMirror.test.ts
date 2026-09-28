import { describe, it, expect } from "vitest";
import { gamePathSrc } from "./gamePathSrc";
import { get } from "svelte/store";
import { gameStore } from "../game";
import { universityGradeOf, UNIVERSITY_FINAL_GRADE } from "../../utils/careerTransition";
import { WEEKS_PER_SEASON } from "../../utils/seasonWeeks";
import { evaluateCondition } from "../../utils/conditionEvaluator";
import type { Condition, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

/**
 * 🔴 **`protagonist.grade` 가 대학에서 한 해 뒤처졌다** — 고친 것의 검사
 *   (2026-09-27 · `BALANCE_BACKLOG` 「게임 로직 — `protagonist.grade` …」 ·
 *   제안 ㉯ 를 골랐다).
 *
 * 무엇이 틀렸나. `grade` 를 `processSeasonEnd` 가 적었다. 그 블록은 시즌
 * **끝**에 도는데 그때 `universityWeek` 은 정확히 52 이고
 * `universityGradeOf(52)` 는 1 이다 — 블록의 뜻은 「다음 시즌 학년으로
 * 올린다」인데 **직전 시즌 학년**을 적었다. 판 #6·#12 의 `[진로점수]` 줄이
 * 2029·2030 둘 다 `grade=1` 이었고 2030 의 진짜 학년은 2 다.
 *
 * ⚠ **정본은 `schoolState.universityWeek` 하나다**(`universityGradeOf` 머리말).
 *   `grade` 는 그걸 비추는 거울이다. 그래서 「+1 을 더해 다음 주 학년을
 *   적는」 쪽(제안 ㉮)을 안 골랐다 — 왜 +1 인지가 또 하나의 축이 된다.
 *   거울은 **계수기가 움직이는 자리**에서만 닦는다.
 *
 * ⚠ 읽는 데가 0 이라 새는 곳은 없었다. 그래도 고친 까닭:
 *   `conditionEvaluator` 의 `case "grade"` 가 그 거울을 그대로 봤고, B 가
 *   대학 학년 조건을 하나라도 쓰면 **그날 한 해 어긋난다.**
 */

const uw = () => get(gameStore).schoolState.universityWeek;
const grade = () => get(gameStore).protagonist.grade;

describe("대학 학년 거울 — 계수기가 움직일 때 같이 닦는다", () => {
  it("🔴 4년을 주마다 돌려도 거울이 계수기와 한 주도 안 어긋난다", () => {
    // 진학 W52 는 `universityWeekOnEnroll(52) = 0` 이라 기본값에서 바로 출발한다
    expect(uw()).toBe(0);
    for (let w = 1; w <= UNIVERSITY_FINAL_GRADE * WEEKS_PER_SEASON; w++) {
      gameStore.incrementUniversityWeek();
      expect(uw(), `주 ${w}`).toBe(w);
      // 정본 함수와 견준다 — 닫힌 식을 검사에 적으면 검사가 축을 정하는 꼴이다
      expect(grade(), `주 ${w}`).toBe(universityGradeOf(undefined, w));
    }
  });

  it("🔴 시즌 경계가 결함이 났던 자리다 — uw 52 는 1학년 · uw 53 은 2학년", () => {
    // 위 검사가 4년을 다 돌려 놓은 상태라 계수기 값을 직접 되짚는다
    expect(uw()).toBe(UNIVERSITY_FINAL_GRADE * WEEKS_PER_SEASON);
    expect(universityGradeOf(undefined, WEEKS_PER_SEASON)).toBe(1);
    expect(universityGradeOf(undefined, WEEKS_PER_SEASON + 1)).toBe(2);
  });

  it("4학년에서 멈춘다 — 5년째를 다녀도 학년은 4 다", () => {
    for (let i = 0; i < WEEKS_PER_SEASON; i++) gameStore.incrementUniversityWeek();
    expect(grade()).toBe(UNIVERSITY_FINAL_GRADE);
  });
});

/**
 * 🔴 **대조군** — 거울을 **두 곳**에서 닦으면 한쪽만 닦인 채 남는다. 이
 *   저장소가 제일 많이 밟은 형태(`CLAUDE.md` 「정본을 둘 만들기」)이고, 이
 *   결함이 바로 그것이었다. 시즌 끝 블록에 그 문장이 **없어야** 한다.
 */
describe("🔴 대조군 — 적는 자리는 하나다", () => {
  const SRC = gamePathSrc();

  it("시즌 끝 블록이 대학 학년을 안 적는다 — 옛 문장이 돌아오면 잡는다", () => {
    expect(SRC).not.toContain(
      "grade: universityGradeOf(undefined, s.schoolState.universityWeek) as 1 | 2 | 3 | 4,",
    );
  });

  it("계수기가 움직이는 자리에서만 적는다", () => {
    expect(SRC).toContain("const universityWeek = s.schoolState.universityWeek + 1;");
    expect(SRC).toContain(
      "const grade = universityGradeOf(undefined, universityWeek) as 1 | 2 | 3 | 4;",
    );
  });

  it("고교 갈래는 그대로다 — 계수기가 없어 +1 이 맞다", () => {
    expect(SRC).toContain('if (proto.grade != null && proto.careerStage === "highschool") {');
  });
});

/**
 * **읽는 자리도 계수기에서 센다** — 옛 세이브(고치기 전에 저장된 대학 세이브)의
 * `grade` 에는 직전 시즌 학년이 들어 있다. 거울만 보면 그 판정이 한 해 어긋난다.
 */
describe("조건 판정 — 대학 학년은 계수기에서 센다", () => {
  const proto = (over: Record<string, unknown> = {}) =>
    ({
      id: "P1",
      careerStage: "university",
      leagueId: "LEAGUE_UNIVERSITY",
      playerType: "pitcher",
      grade: 1,
      ...over,
    }) as unknown as ProtagonistSave;

  const ctx = (over: Partial<EventContext> = {}): EventContext =>
    ({
      protagonist: proto(),
      currentWeek: 10,
      seasonPhase: "season",
      standings: [],
      stats: {},
      triggeredEvents: {},
      ...over,
    }) as EventContext;

  const gradeIs = (value: number): Condition => ({ type: "grade", value }) as Condition;

  it("🔴 거울이 뒤처진 옛 세이브에서도 계수기가 답을 낸다", () => {
    // 옛 세이브 모양: 2학년인데 `grade` 에 1 이 남아 있다 (uw 84)
    const c = ctx({
      protagonist: proto({ grade: 1 }),
      schoolState: { universityWeek: 84 } as EventContext["schoolState"],
    });
    expect(evaluateCondition(gradeIs(2), c)).toBe(true);
    expect(evaluateCondition(gradeIs(1), c)).toBe(false);
  });

  it("계수기가 없으면 거울로 떨어진다 — 옛 세이브를 못 열게 만들지 않는다", () => {
    const c = ctx({ protagonist: proto({ grade: 3 }) });
    expect(evaluateCondition(gradeIs(3), c)).toBe(true);
  });

  it("고교는 거울이 곧 정본이다 — 계수기를 안 본다", () => {
    const c = ctx({
      protagonist: proto({ careerStage: "highschool", grade: 3 }),
      // 대학 계수기가 남아 있어도 고교 판정을 흔들지 않는다
      schoolState: { universityWeek: 84 } as EventContext["schoolState"],
    });
    expect(evaluateCondition(gradeIs(3), c)).toBe(true);
    expect(evaluateCondition(gradeIs(2), c)).toBe(false);
  });
});
