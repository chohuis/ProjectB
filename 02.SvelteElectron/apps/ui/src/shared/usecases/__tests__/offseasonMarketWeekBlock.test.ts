import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **계약·시장 주간 블록의 갈림길을 못박는다** (2026-09-30 · Ⅱ-1 안전망).
 *
 * 🔴 왜 이 블록에 안전망이 필요한가. 여기가 **커리어를 끝낼 수 있는 유일한
 *   자리**다. 실측으로 두 번 났다:
 *   ① 은퇴 압박 판정이 `remainingYears <= 0` 가지에만 있었고, 바로 위
 *      `=== 1` 가지가 나이·성적과 무관하게 매번 재계약 오퍼를 만들어서
 *      **25시즌(42세)을 완주하고도 은퇴 0건**이었다.
 *   ② 프로 트레이드가 주인공 리그에서만 돌아, 주인공이 학생인 동안
 *      최대 7년간 **트레이드가 한 건도 안 났다**(같은 기간 FA 115건).
 *   둘 다 예외도 로그도 안 났다 — 「안 일어난다」는 조용하다.
 *
 * ⚠ 주간 진행 경로 전체를 **한 덩이로** 읽는다(`weekPathFlat`) — 쪼개기 전후에
 *   검사 문장이 한 글자도 안 바뀐다.
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();

/** 겹치지 않는 부분 문자열의 등장 횟수 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("프로 트레이드 윈도우 — 갈림길", () => {
  it("연 2회다 — 시즌 중 데드라인과 스토브리그", () => {
    expect(WEEK_PATH).toContain(
      "if (weekInYear === TRADE_DEADLINE_WEEK || weekInYear === STOVE_LEAGUE_WEEK) {",
    );
  });

  it("🔴 리그를 손으로 적지 않는다 — `activeProLeagues()` 가 정본이다", () => {
    expect(WEEK_PATH).toContain("for (const lid of activeProLeagues()) {");
    expect(WEEK_PATH).toContain("await processTradeWindow(weekInYear, lid);");
    // ⚠ 옛 형태(`proLeagueIds.includes(myLeague)`)를 `not.toContain` 으로 못박지
    //   않는다 — 그 글자가 **왜 그렇게 고쳤나** 주석에 그대로 들어 있어서
    //   잣대가 주석을 잡는다. 「지금 무엇을 도는가」를 위 두 줄이 본다
  });

  it("리그마다 순차로 돈다 — 동시에 돌리면 gameStore 를 서로 덮는다", () => {
    expect(countOf(WEEK_PATH, "await processTradeWindow(weekInYear, lid);")).toBe(1);
  });
});

describe("오프시즌 총평 — 무대마다 다른 주차", () => {
  it("독립은 시즌 종료 총평 주차가 따로다", () => {
    expect(WEEK_PATH).toContain(
      'gOff.protagonist.careerStage === "independent" && weekInYear === INDIE_SEASON_REVIEW_WEEK',
    );
  });

  it("프로 총평·Win-Now 압박은 오프시즌 시작 주다", () => {
    expect(WEEK_PATH).toContain("if (isProStage && weekInYear === OFFSEASON_START_WEEK) {");
  });

  it("🔴 총평 문안의 주차는 상수에서 온다 — 글자로 적으면 상수가 옮겨진 뒤 거짓말이 된다", () => {
    expect(WEEK_PATH).toContain("`W${STOVE_LEAGUE_WEEK}부터 연봉협상 및 FA 시장이 열립니다.`");
    expect(WEEK_PATH).toContain("W${SPORTS_UNIT_CANDIDATES_WEEK} 체육부대 신청");
  });

  it("Win-Now 압박이 실패해도 주 진행은 안 막는다", () => {
    expect(WEEK_PATH).toContain("[WinNow압박오류]");
  });

  it("NPC 은퇴·FA 는 주인공 단계와 무관하다 — 배경 프로리그는 계속 돈다", () => {
    expect(WEEK_PATH).toContain("if (weekInYear === STOVE_LEAGUE_WEEK) {");
    expect(WEEK_PATH).toContain(
      "const offseasonLogs = await processOffseasonNpcDecisions(weekNum);",
    );
  });
});

describe("🔴 은퇴 압박 판정 — 계약이 끝나는 해마다 지난다", () => {
  it("`remainingYears <= 1` 에서 돈다 — `<= 0` 에만 두면 도달할 일이 없다", () => {
    expect(WEEK_PATH).toContain("if (contract.remainingYears <= 1) {");
  });

  it("NPC 와 같은 엔진이다 — 주인공 전용 기준을 만들지 않는다", () => {
    expect(WEEK_PATH).toContain("const pressure = await evalRetirementPressure(trend, mv);");
    expect(WEEK_PATH).toContain("const trend = ovrTrendOf(gOff.protagonist);");
  });

  it("권고면 그 주에서 멈춘다 — 재계약 오퍼를 만들기 전이다", () => {
    expect(WEEK_PATH).toContain(
      'type: "retirementAsk", urgency: pressure.urgency, reason: "decline",',
    );
    expect(WEEK_PATH).toContain("은퇴 권고 — 계약이 끝났고 구단이 다시 부르지 않는다");
  });

  it("계측 창이 남아 있다 — 값을 봐야 증상과 원인이 갈린다", () => {
    expect(WEEK_PATH).toContain("[은퇴판정]");
  });
});

describe("계약 갈래 — 옵션 · FA · 재계약", () => {
  it("이미 물음이 떠 있으면 새로 만들지 않는다 — pending 가드 셋", () => {
    expect(WEEK_PATH).toContain(
      '(a) => a.type === "salaryNegotiation" || a.type === "faMarket" || a.type === "optionClause"',
    );
    expect(WEEK_PATH).toContain("const hasPendingNext = !!gOff.protagonist.pendingNextContract;");
  });

  it("팀 옵션이 선수 옵션보다 먼저다 — 둘 다 있으면 팀이 먼저 고른다", () => {
    expect(WEEK_PATH).toContain("if (contract.teamOptionYears > 0) {");
    expect(WEEK_PATH).toContain("} else if (contract.playerOptionYears > 0) {");
  });

  it("팀 옵션 문턱은 Win-Now 압박이 민다 — 공격적 팀은 낮은 기준에도 행사한다", () => {
    expect(WEEK_PATH).toContain(
      "const threshold = 75 - Math.round((profile.winNowPressure / 100) * 25);",
    );
    expect(WEEK_PATH).toContain("const exercised = seasonRating >= threshold;");
  });

  it("FA 자격은 정본 함수가 본다 — 대학 재학 여부까지 같이 넘긴다", () => {
    expect(WEEK_PATH).toContain(
      "isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)",
    );
  });

  it("계약 기간 중(>1)이면 아무것도 안 한다", () => {
    expect(WEEK_PATH).toContain("// remainingYears > 1: 계약 기간 중 — 아무것도 하지 않음");
  });

  it("계약이 이미 끝나 있는 이례 갈래와 계약 자체가 없는 이례 갈래가 둘 다 있다", () => {
    expect(WEEK_PATH).toContain("} else if (contract.remainingYears <= 0) {");
    expect(WEEK_PATH).toContain("} else if (!contract && !hasPending && !hasPendingNext) {");
  });

  it("지갑을 여는 구단주면 오퍼가 후하다 — 보정은 스태프 정본에서 온다", () => {
    expect(WEEK_PATH).toContain('staffModsOf(gOff.protagonist.teamId ?? "", m.entities).budget;');
  });
});

describe("FA 미계약자 — 매주 재트리거", () => {
  it("창이 상수 둘로 열린다", () => {
    expect(WEEK_PATH).toContain(
      "if (isProStage && weekInYear >= FA_RETRY_START_WEEK && weekInYear <= FA_RETRY_END_WEEK) {",
    );
  });

  it("주 수를 센다 — 안 세면 「몇 주째 미계약」을 아무도 모른다", () => {
    expect(WEEK_PATH).toContain("gameStore.incrementFaUnsignedWeek();");
  });

  it("이미 떠 있는 FA 물음 위에 또 밀지 않는다", () => {
    expect(WEEK_PATH).toContain(
      'const hasFaPending = sOff.pendingActions.some((a) => a.type === "faMarket");',
    );
  });
});

/**
 * 🔴 **배선 대조군** — 이 블록은 안에서 `return logs` 로 주간 진행을 끝낸다.
 *   부르는 자리에서 그 신호를 **안 받으면** 은퇴 권고가 떠도 주가 그대로
 *   흘러간다. 부르는 자리 수와 신호 처리를 못박는다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 끝내는 신호", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(countOf(WEEK_PATH, "await runOffseasonMarketWeek({")).toBe(1);
  });

  it("🔴 끝내는 신호를 받아 그 자리에서 돌려준다", () => {
    expect(WEEK_PATH).toContain(
      "if (await runOffseasonMarketWeek({ weekNum, weekInYear, m, logs })) return logs;",
    );
  });

  it("블록 안의 끝내는 자리는 하나다 — 은퇴 권고뿐이다", () => {
    expect(countOf(WEEK_PATH, "return 은퇴권고로_주간진행을_끝낸다;")).toBe(0);
    expect(countOf(WEEK_PATH, "}: OffseasonMarketArgs): Promise<boolean> {")).toBe(1);
  });
});
