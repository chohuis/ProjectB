import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 커리어 결산에 연도별·순위·사람이 실제로 붙어 있는가.
 *
 * 🔴 백로그가 A1을 "미구현"으로 적었지만 **화면은 이미 있었다**(299줄).
 *    없던 건 연도별 펼치기·순위/포스트시즌·관계 셋뿐이었다.
 *    이 세션에 "이미 닫혀 있던 것"을 다섯 번 만났다 — 손대기 전에 재현부터.
 *
 * ⚠ **관계 값을 숫자로 노출하면 안 된다.** `Relationship.value` 주석이
 *   "−100~+100. 플레이어에게 숫자로 노출하지 않는다 — 라벨만 보여준다"고
 *   못박아 뒀다. 처음에 `{r.value}`를 그대로 쓸 뻔했다.
 */
const SRC = readFileSync(
  join(__dirname, "../ui/CareerEndScreen.svelte"), "utf8");

describe("커리어 결산 — 아래로 이은 세 절", () => {
  it("연도별 펼치기가 있다", () => {
    expect(SRC).toMatch(/showYears/);
    expect(SRC, "연도 오름차순 정렬이 없다 — 데뷔부터 읽혀야 한다")
      .toMatch(/a\.year - b\.year/);
  });

  it("순위와 포스트시즌을 읽는다", () => {
    expect(SRC, "rank를 안 읽는다").toMatch(/r\.rank/);
    expect(SRC, "psResult를 안 읽는다").toMatch(/r\.psResult/);
  });

  it("사람(관계)을 읽는다", () => {
    expect(SRC).toMatch(/getRelationships/);
    expect(SRC, "personId로 이름을 찾아야 한다 (people.md §4)")
      .toMatch(/personId/);
  });
});

describe("규칙 — 관계 값은 라벨로만", () => {
  it("`relationLabel`을 쓴다", () => {
    expect(SRC).toMatch(/relationLabel\(/);
  });

  it("관계 값을 숫자 그대로 찍지 않는다", () => {
    expect(SRC, "{r.value}를 그대로 노출하고 있다 — 타입 주석이 금지한다")
      .not.toMatch(/\{r\.value\}/);
  });
});

describe("실제 필드 이름을 쓴다", () => {
  it("수상은 `label`이다 (`name`이 아니다)", () => {
    expect(SRC).not.toMatch(/a\.name/);
    expect(SRC).toMatch(/a\.label/);
  });

  it("관계 대상은 `personId`다 (`targetId`가 아니다)", () => {
    expect(SRC).not.toMatch(/targetId/);
  });
});

describe("있던 것을 안 지웠다", () => {
  it("한 장 요약이 그대로 있다", () => {
    for (const fn of ["careerTotalsOf", "careerHighsOf", "teamStintsOf",
                      "awardTallyOf", "titleCountOf"]) {
      expect(SRC, `${fn}가 사라졌다 — 아래로 잇기로 했지 갈아엎기로 하지 않았다`)
        .toMatch(new RegExp(fn));
    }
  });
});

/**
 * 세 덩어리 중 셋째 — **주요 사건.** (2026-09-01, 트랙 C)
 *
 * 🔴 화면은 `careerRecords`(시즌 성적)만 읽고 `careerEvents`(사건)는 한 번도
 *    안 읽었다. 드래프트·트레이드·입대·전역·졸업·병역 면제가 전부 저장돼
 *    있는데 결산 어디에도 안 나왔다.
 */
describe("주요 사건", () => {
  it("`careerEvents`를 읽는다", () => {
    expect(SRC, "careerEvents를 안 읽는다 — 사건이 저장만 되고 안 보인다")
      .toMatch(/careerEvents/);
  });

  it("연도 오름차순이다", () => {
    expect(SRC).toMatch(/events = \[\.\.\.\(p\.careerEvents \?\? \[\]\)\]\.sort\(/);
  });

  /**
   * 🔴 **이게 이 절의 핵심이다.** 통산 표는 `records.length === 0`이면
   *    "기록을 남기지 못했습니다" 한 문장으로 대체된다. 사건 절을 그 `{:else}`
   *    안에 두면 **아마추어에서 그만둔 커리어의 결산이 통째로 사라진다** —
   *    졸업·중단 사건은 남아 있는데도.
   *
   * 분기를 닫는 `{/if}` 바로 뒤에 오는지를 본다.
   */
  it("통산 기록 분기 **바깥**에 있다", () => {
    const outside = /^ {6}\{\/if\}\r?\n\r?\n {6}<!-- 주요 사건/m;
    expect(SRC, "사건 절이 records 분기 안에 들어갔다 — 기록 없는 커리어에서 사라진다")
      .toMatch(outside);
  });

  it("유형 이름은 공용 표에서 읽는다", () => {
    expect(SRC, "화면에 번역표를 또 만들면 안 된다 (careerEventLabel.ts 머리말)")
      .toMatch(/careerEventLabel\(/);
    expect(SRC, "eventType을 그대로 찍고 있다 — 코드가 화면에 샌다")
      .not.toMatch(/\{e\.eventType\}/);
  });

  it("팀 이름은 `teamName`으로 읽는다", () => {
    expect(SRC, "teamId를 그대로 찍으면 그 화면만 영문 id가 뜬다")
      .not.toMatch(/\{e\.fromTeamId\}|\{e\.toTeamId\}/);
  });
});
