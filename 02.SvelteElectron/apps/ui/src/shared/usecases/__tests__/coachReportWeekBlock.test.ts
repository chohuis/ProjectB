import { describe, it, expect } from "vitest";
import { weekPathFlat } from "./weekPathSrc";

/**
 * **코치 리포트 블록의 갈림길을 못박는다** (2026-09-30 · Ⅱ-1 안전망).
 *
 * 🔴 왜 안전망이 필요한가. 이 절은 **주간 진행의 마지막**이고, 위에서 누가
 *   먼저 `return logs` 하면 통째로 안 돈다. 안 돌아도 아무 신호가 없다 —
 *   소식 한 통이 안 오는 것뿐이라 「그 주엔 점검이 없었나 보다」로 보인다.
 *
 * 🔴 값을 보여 줄 때만 자릿수를 맞춘다. 사기만 실수라(`moraleAfterWeek`)
 *   그대로 찍으면 「사기 63.42857142857143」이 난다(사용자 U4). 반올림해
 *   **저장하면** 그게 값을 바꾸는 것이다 — 여기서만 반올림한다.
 *
 * ⚠ 주간 진행 경로 전체를 **한 덩이로** 읽는다(`weekPathFlat`) — 쪼개기 전후에
 *   검사 문장이 한 글자도 안 바뀐다.
 *
 * 검사에 정규식을 쓰지 않는다 — 문자열 비교만.
 */
const WEEK_PATH = weekPathFlat();

/** 겹치지 않는 부분 문자열의 등장 횟수 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe("코치 리포트 — 도는 주차", () => {
  it("3주마다다 · 군 복무는 제외다 · 시즌이 열려 있어야 한다", () => {
    expect(WEEK_PATH).toContain(
      'weekInYear % 3 === 0 && gFinal.protagonist.careerStage !== "military" && isSeasonActive',
    );
  });

  it("🔴 친선경기는 시즌으로 안 센다 — 오프시즌에 친선만 있으면 안 열린 것이다", () => {
    expect(WEEK_PATH).toContain("!e.result && !e.isFriendly &&");
    expect(WEEK_PATH).toContain('(e.phase === "season" || e.phase === "postseason")');
  });
});

describe("코치 리포트 — 권고 갈래 넷", () => {
  it("피로가 제일 먼저다 — 65 이상이면 회복 권고", () => {
    expect(WEEK_PATH).toContain("if (p.fatigue >= 65) {");
    expect(WEEK_PATH).toContain('{ id: "rest", label: "회복 집중"');
  });

  it("컨디션·사기가 둘 다 좋을 때만 집중 훈련을 권한다", () => {
    expect(WEEK_PATH).toContain("} else if (p.condition >= 82 && p.morale >= 68) {");
    expect(WEEK_PATH).toContain('id: "intensive",');
  });

  it("사기 40 이하면 멘탈 케어다", () => {
    expect(WEEK_PATH).toContain("} else if (p.morale <= 40) {");
    expect(WEEK_PATH).toContain('id: "mental",');
  });

  it("나머지는 루틴 유지다 — 갈래가 넷이고 모든 상태가 하나에 든다", () => {
    expect(WEEK_PATH).toContain('{ id: "balance", label: "현재 루틴 유지"');
    expect(WEEK_PATH).toContain('label: "회복 세션 추가"');
  });

  it("어느 갈래든 선택지가 둘이고 선택 전이다", () => {
    expect(WEEK_PATH).toContain("selectedOptionId: null,");
  });
});

describe("코치 리포트 — 보여 주는 값", () => {
  it("🔴 사기는 보여 줄 때만 반올림한다 — 저장값은 실수로 남는다", () => {
    expect(WEEK_PATH).toContain("사기 ${Math.round(p.morale)}");
    expect(WEEK_PATH).toContain('{ key: "morale", value: Math.round(p.morale) }');
  });

  it("ERA 는 없으면 그 줄을 아예 안 그린다 — 0 을 채우면 「모른다」가 「좋다」가 된다", () => {
    expect(WEEK_PATH).toContain("const era = myStats?.era ?? null;");
    expect(WEEK_PATH).toContain("...(eraLine ? [eraLine] : []),");
  });

  it("시즌 시작 대비 변화는 스냅샷이 있을 때만이다 — 없으면 undefined 다", () => {
    expect(WEEK_PATH).toContain("const startPit = p.seasonStartPitching;");
    expect(WEEK_PATH).toContain('return typeof before === "number" ? (pit[k] as number) - before');
  });

  it("표에는 키만 싣는다 — 지표 이름은 화면 문안이 붙인다", () => {
    expect(WEEK_PATH).toContain('{ key: "velocity", value: pit.velocity,');
    expect(WEEK_PATH).toContain('{ key: "condition", value: p.condition }');
    expect(WEEK_PATH).not.toContain('{ key: "velocity", label:');
  });

  it("소식 id 에 연도와 주차가 둘 다 든다 — 겹치면 세이브가 안 열린다", () => {
    expect(WEEK_PATH).toContain("`msg-coach-report-${sFinal.seasonYear}-w${weekNum}`");
  });
});

/**
 * 🔴 **배선 대조군** — 부르는 자리가 하나이고, 스냅샷을 **다시 읽지 않는다.**
 *   안에서 `get(gameStore)` 로 다시 읽으면 관계도·배경 시뮬이 바꾼 뒤 값을
 *   보게 되어 리포트가 이번 주가 아닌 것을 말한다.
 */
describe("🔴 배선 대조군 — 부르는 자리와 넘기는 값", () => {
  it("주 경계 처리에서 딱 한 번 불린다", () => {
    expect(
      countOf(WEEK_PATH, "runCoachReport({ weekNum, weekInYear, gFinal, sFinal, mFinal });"),
    ).toBe(1);
  });

  it("투수 코치 이름은 정본 함수에서 온다 — 여기서 엔티티를 직접 파지 않는다", () => {
    expect(WEEK_PATH).toContain("getPitchCoachName(p.teamId, mFinal.entities)");
  });

  it("스냅샷 셋을 그대로 쓴다 — 블록 안에서 store 를 다시 읽지 않는다", () => {
    expect(WEEK_PATH).toContain("}: CoachReportArgs): void {");
    expect(WEEK_PATH).toContain("const p = gFinal.protagonist;");
    expect(WEEK_PATH).toContain("const myStats = (sFinal.stats[p.id]");
  });
});
