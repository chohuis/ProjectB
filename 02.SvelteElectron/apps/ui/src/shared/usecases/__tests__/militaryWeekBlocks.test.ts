import { describe, it, expect } from "vitest";
import { weekPathSrc, weekPathFlat } from "./weekPathSrc";

/**
 * **군 주간 갈래의 갈림길을 못박는다** (2026-09-21 · A-4 쪼개기의 안전망).
 *
 * 🔴 왜 쪼개기 **전에** 쓰나. `advanceWeek.ts` 에서 블록을 옮길 때 제일 잘
 *   나는 사고는 「조건 하나를 흘리는 것」이다 — 게임은 그대로 돌고 그 갈래만
 *   조용히 사라진다. 이 저장소가 반복해 겪은 형태다.
 *
 * ⚠ **파일 하나를 안 본다.** 주간 진행 경로 전체(`advanceWeek.ts` +
 *   `weekPhases/**`)를 한 덩이로 읽는다. 그래야 **쪼개기 전과 후에 검사 문장이
 *   한 글자도 안 바뀐다** — 파일 이름을 적으면 옮기는 순간 검사도 같이 고쳐야
 *   하고, 그러면 「옮기기 전후가 같다」를 증명하는 힘이 사라진다.
 *
 * ⚠ **띄어쓰기를 눌러서 본다**(`weekPathFlat`). prettier 가 긴 식을 여러 줄로
 *   접어도 안 깨진다 — `.prettierignore` 를 늘리지 않으려는 쪽(A-6)이다.
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();
/** 문안을 글자 그대로 봐야 할 때 */
const WEEK_RAW = weekPathSrc();

describe("군 주간 블록 — 갈림길", () => {
  it("복무 중인 주에만 이 갈래로 온다", () => {
    expect(WEEK_PATH).toContain('careerStage === "military"');
  });

  it("체육부대와 일반병이 갈린다 — 둘은 아예 다른 갈래다", () => {
    expect(WEEK_PATH).toContain('const isSportsUnit = g.protagonist.militaryUnit === "sports";');
    // 🔴 상무는 병영생활 경로로 안 온다. 이 조건을 흘리면 체육부대가
    //   일반병 이벤트를 받고, 반대로 `militaryLife` 를 안 보면 옛 세이브가 죽는다
    expect(WEEK_PATH).toContain("if (!isSportsUnit && g.protagonist.militaryLife) {");
  });

  it("계급 띠 셋(8/34/60)이 후보를 가른다 — 훈련소 이벤트가 병장에게 뜨지 않게", () => {
    expect(WEEK_PATH).toContain(
      "serviceWeeks <= 8 ? 0 : serviceWeeks <= 34 ? 1 : serviceWeeks <= 60 ? 2 : 3",
    );
    // minRank·maxRank·once 셋을 같이 본다 — 하나만 빠져도 한 번 열린 이벤트가 안 닫힌다
    expect(WEEK_PATH).toContain("(e.minRank ?? 0) <= rankIndex");
    expect(WEEK_PATH).toContain("rankIndex <= (e.maxRank ?? Number.POSITIVE_INFINITY)");
    expect(WEEK_PATH).toContain("!(e.once && fired[e.id] !== undefined)");
    // `once` 는 **커리어 통**이다 — 시즌 통이면 복무 100주가 시즌 경계에서 되살아난다
    expect(WEEK_PATH).toContain("get(gameStore).protagonist.careerTriggeredEvents ?? {}");
  });

  it("🔴 엔진 오류를 삼키지 않는다 — 삼키면 피로가 조용히 NaN 이 된다", () => {
    expect(WEEK_PATH).toContain(
      'if (!milCalcRaw || milCalcRaw.error || typeof milCalcRaw.fatigue !== "number") {',
    );
  });

  it("🔴 정수로 반올림해서 넘긴다 — Rust 가 u32 라 소수면 호출 전체가 에러다", () => {
    for (const f of ["stamina", "recovery", "command", "control", "velocity"])
      expect(WEEK_PATH).toContain(`Math.round(g.protagonist.pitching.${f})`);
    expect(WEEK_PATH).toContain("Math.round(g.protagonist.morale)");
    expect(WEEK_PATH).toContain("Math.round(g.protagonist.fatigue)");
  });

  it("씨앗을 넘긴다 — 안 넘기면 복무 100주가 통째로 재현 밖이다", () => {
    expect(WEEK_PATH).toContain('"military-week", serviceWeeks');
  });

  it("군 이벤트 소식 id 에 연도와 주차가 둘 다 들어간다 — 겹치면 세이브가 안 열린다", () => {
    expect(WEEK_RAW).toContain("`msg-mil-${evt.id}-${s.seasonYear}-w${nextWeek}`");
  });

  it("뜬 자리에서 커리어 통에 적는다 — 선택을 기다리면 `once` 가 안 먹는다", () => {
    expect(WEEK_PATH).toContain("if (evt.once) gameStore.recordCareerTriggeredEvents(");
  });
});

describe("군 트리거 블록 — 갈림길", () => {
  it("미필·비복무·비고교일 때만 묻는다", () => {
    expect(WEEK_PATH).toContain('const isMilUnresolved = p.militaryStatus === "미필"');
    expect(WEEK_PATH).toContain('&& p.careerStage !== "military"');
    expect(WEEK_PATH).toContain('&& p.careerStage !== "highschool"');
  });

  it("이미 군 pending 이 떠 있으면 또 안 민다", () => {
    expect(WEEK_PATH).toContain(
      'a.type === "sportsUnitApplication" || a.type === "militaryEnlistAsk"',
    );
    expect(WEEK_PATH).toContain("if (isMilUnresolved && !hasAnyMilPending) {");
  });

  /**
   * 🔴 **가드 셋이 이 블록의 전부다.** 셋 다 「주를 안 넘기고 pending 만 미는」
   *   자리이고, 가드가 빠지면 그 주에서 게임이 **영영 안 나간다**(세 번 다 실측).
   */
  it("🔴 한 해 한 번 가드 셋", () => {
    expect(WEEK_PATH).toContain("p.sportsUnitPromptedYear !== s.seasonYear");
    expect(WEEK_PATH).toContain("p.militaryAskedYear !== s.seasonYear");
    // 셋째는 가드가 아니라 **플래그 소진**이다 — 가드로 막으면 이듬해에
    // 신청도 안 했는데 선발 판정이 돈다
    expect(WEEK_PATH).toContain("gameStore.setSportsUnitApplied(false);");
  });

  it("주차 셋이 상수에서 온다", () => {
    expect(WEEK_PATH).toContain("weekInYear === SPORTS_UNIT_CANDIDATES_WEEK && p.age <= 27");
    expect(WEEK_PATH).toContain("weekInYear === MILITARY_RESULT_WEEK && p.sportsUnitApplied");
    expect(WEEK_PATH).toContain(
      "weekInYear === MILITARY_RESULT_WEEK && p.age >= 28 && p.militaryAskedYear !== s.seasonYear",
    );
    expect(WEEK_PATH).toContain("p.age === 28 && weekInYear === MILITARY_AGE_WARNING_WEEK");
  });

  it("26~27세 연기 패널티는 W1 에 쌓인다", () => {
    expect(WEEK_PATH).toContain("if (weekInYear === 1 && p.age >= 26) {");
    expect(WEEK_PATH).toContain("const penalty = p.age === 26 ? 3 : 5;");
  });

  it("체육부대 후보·선발 둘 다 병역 자격을 거른다", () => {
    const hits = WEEK_PATH.split("isKoreanMilitaryEligible(e, npcSave)").length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});
