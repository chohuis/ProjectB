import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * 🔴 **동적 `import()` 를 검사 안에서 하지 않는다** (2026-09-04).
 *
 * 예전엔 「신호는 한 번만 참이다」 검사가 본문에서 `await import(…)` 를 했다.
 * 그러면 **모듈 적재가 검사 시간으로 잡힌다** — `retirement.ts` 는
 * `gameStore` → 저장소 → 패키지까지 딸려 와 혼자 돌 때 **703ms**, 전체
 * 실행에서 **1,544~1,759ms** 다(실측). 기본 제한이 5초라 기계가 바쁜 순간
 * 넘어가고, **전체 실행에서만 3회 중 1회 깨졌다.**
 *
 * 정적으로 올리면 적재가 수집(collect) 단계로 가고 검사 본문은 값만 본다.
 */
import { careerEndPending, takeCareerEndPending } from "../../../shared/usecases/retirement";

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
const SRC = readFileSync(join(__dirname, "../ui/CareerEndScreen.svelte"), "utf8");

describe("커리어 결산 — 아래로 이은 세 절", () => {
  it("연도별 펼치기가 있다", () => {
    expect(SRC).toMatch(/showYears/);
    expect(SRC, "연도 오름차순 정렬이 없다 — 데뷔부터 읽혀야 한다").toMatch(/a\.year - b\.year/);
  });

  it("순위와 포스트시즌을 읽는다", () => {
    expect(SRC, "rank를 안 읽는다").toMatch(/r\.rank/);
    expect(SRC, "psResult를 안 읽는다").toMatch(/r\.psResult/);
  });

  it("사람(관계)을 읽는다", () => {
    expect(SRC).toMatch(/getRelationships/);
    /**
     * ⚠ **여기 있던 `personId` 단언을 바꿨다** (2026-09-01 눈확인).
     *   원래 "personId 로 이름을 찾아야 한다"였는데, 그게 코치·감독을
     *   원문 id 로 찍던 원인이었다 — 스태프는 `npcs` 에 없다.
     *   `Relationship` 이 person VIEW 에서 `name` 을 이미 받아 온다.
     *   아래 "이름이 원문 id 로 새지 않는다"가 그걸 못박는다.
     */
    expect(SRC, "관계 목록을 안 그린다").toMatch(/relTop/);
  });
});

describe("규칙 — 관계 값은 라벨로만", () => {
  it("`relationLabel`을 쓴다", () => {
    expect(SRC).toMatch(/relationLabel\(/);
  });

  it("관계 값을 숫자 그대로 찍지 않는다", () => {
    expect(SRC, "{r.value}를 그대로 노출하고 있다 — 타입 주석이 금지한다").not.toMatch(
      /\{r\.value\}/,
    );
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
    for (const fn of [
      "careerTotalsOf",
      "careerHighsOf",
      "teamStintsOf",
      "awardTallyOf",
      "titleCountOf",
    ]) {
      expect(SRC, `${fn}가 사라졌다 — 아래로 잇기로 했지 갈아엎기로 하지 않았다`).toMatch(
        new RegExp(fn),
      );
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
    expect(SRC, "careerEvents를 안 읽는다 — 사건이 저장만 되고 안 보인다").toMatch(/careerEvents/);
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
    expect(SRC, "사건 절이 records 분기 안에 들어갔다 — 기록 없는 커리어에서 사라진다").toMatch(
      outside,
    );
  });

  it("유형 이름은 공용 표에서 읽는다", () => {
    expect(SRC, "화면에 번역표를 또 만들면 안 된다 (careerEventLabel.ts 머리말)").toMatch(
      /careerEventLabel\(/,
    );
    expect(SRC, "eventType을 그대로 찍고 있다 — 코드가 화면에 샌다").not.toMatch(
      /\{e\.eventType\}/,
    );
  });

  it("팀 이름은 `teamName`으로 읽는다", () => {
    expect(SRC, "teamId를 그대로 찍으면 그 화면만 영문 id가 뜬다").not.toMatch(
      /\{e\.fromTeamId\}|\{e\.toTeamId\}/,
    );
  });
});

/**
 * 엔딩 뒤가 없었다 — **커리어 고리가 안 닫혔다.** (2026-09-01)
 *
 * 🔴 `App.svelte` 부터 `onSeasonEnd`(→ `phase = "intro"`)가 배선돼 있었는데
 *    `SeasonEndModal.onExit` 에서 끊겨 **아무도 안 불렀다.** 은퇴 결산을
 *    닫으면 은퇴한 주인공인 채로 메인 화면에 남았고, 게임 안에 타이틀로
 *    돌아가는 길이 하나도 없었다. 3주차 기준이 "고교 입학 → 은퇴 → 엔딩까지
 *    한 커리어 완주"인데 엔딩 뒤가 없으면 완주가 성립하지 않는다.
 *
 * 사용자 확정: **둘 다 준다** — 둘러보기(메인에 남는다) · 마치기(타이틀로).
 */
const ASK = readFileSync(join(__dirname, "../ui/RetirementAskModal.svelte"), "utf8");
const MAIN = readFileSync(join(__dirname, "../../../pages/main/MainPage.svelte"), "utf8");
const SEASON_END = readFileSync(
  join(__dirname, "../../season-end/ui/SeasonEndModal.svelte"),
  "utf8",
);

describe("엔딩 뒤 — 타이틀로 나가는 길", () => {
  it("결산 화면이 `onExit` 을 받는다", () => {
    expect(SRC).toMatch(/export let onExit: \(\(\) => void\) \| null/);
  });

  it("두 버튼을 다 준다 — 둘러보기 · 마치기", () => {
    expect(SRC, "마치기 버튼이 없다 — 나가는 길이 다시 사라졌다").toContain("마치기");
    expect(SRC).toContain("둘러보기");
  });

  /**
   * ⚠ `나 > 상태` 에서 다시 열 때는 `onExit` 을 안 넘긴다. 기록을 다시 보러
   *   온 것이라 거기서 타이틀로 튕기면 안 된다. 그래서 **없으면 안 그린다.**
   */
  it("`onExit` 이 없으면 마치기를 안 그린다", () => {
    expect(SRC).toMatch(/\{#if onExit\}/);
  });

  /**
   * 🔴 **결산을 은퇴 모달이 들면 안 된다** (2026-09-01 눈확인).
   *
   *   `retire()` 가 `resolvePendingAction("retirementAsk")` 를 부르면
   *   `MainPage` 의 `{#if pendingRetirementAsk}` 가 false 가 되어 그 모달이
   *   **통째로 언마운트된다.** 뒤이은 `showSummary = true` 는 죽은 상태를
   *   건드리는 것이라 **결산이 아예 안 떴다** — 은퇴하면 엔딩을 못 봤다.
   *   `나 > 상태 > 기록` 재관람만 살아 있어서 여태 안 드러났다.
   */
  it("은퇴 모달은 결산을 들지 않는다", () => {
    expect(ASK, "결산이 다시 은퇴 모달 안으로 들어갔다 — 언마운트되면 같이 죽는다").not.toMatch(
      /CareerEndScreen/,
    );
    expect(ASK, "끝났다고 알리지 않는다").toMatch(/onRetired\(\)/);
  });

  it("MainPage 가 결산을 형제로 든다", () => {
    expect(MAIN, "MainPage 가 CareerEndScreen 을 안 그린다").toMatch(
      /<CareerEndScreen[\s\S]{0,120}?onExit=\{onSeasonEnd\}/,
    );
    expect(MAIN, "은퇴 모달이 끝났다고 알릴 길이 없다").toMatch(
      /onRetired=\{\(\) => \(careerEndOpen = true\)\}/,
    );
  });

  /**
   * ⚠ 기록이 확정된 뒤에 알려야 한다 — 결산은 `careerRecords` 를 읽으므로
   *   저장 전에 알리면 마지막 시즌이 빠진 채로 나온다.
   */
  it("저장이 끝난 뒤에 알린다", () => {
    const fn = ASK.slice(
      ASK.indexOf("async function retire()"),
      ASK.indexOf("async function keepPlaying"),
    );
    expect(fn.indexOf("seasonStore.save()"), "save 를 안 부른다").toBeGreaterThan(0);
    expect(fn.indexOf("onRetired()"), "save 보다 먼저 알린다").toBeGreaterThan(
      fn.indexOf("seasonStore.save()"),
    );
  });

  /**
   * 🔴 **시즌 종료는 커리어 종료가 아니다.** 그 모달의 출구는 "새 시즌 시작"
   *    하나뿐이고, `onExit` 은 선언만 돼 있어 아무도 안 불렀다. 되살리면
   *    같은 죽은 배선이 다시 생긴다.
   */
  it("시즌 종료 모달에는 `onExit` 이 없다", () => {
    expect(SEASON_END, "SeasonEndModal 에 죽은 onExit 이 되살아났다").not.toMatch(
      /export let onExit/,
    );
    expect(MAIN, "MainPage 가 SeasonEndModal 에 다시 onExit 을 넘긴다").not.toMatch(
      /<SeasonEndModal[^>]*onExit/,
    );
  });
});

/**
 * 🔴 **눈확인에서만 나온 결함 둘.** (2026-09-01 · 실제로 띄워 보고 찾았다)
 *
 * 정적 검사는 "이름을 조회한다"까지만 본다. **못 찾았을 때 무엇을 찍는지**는
 * 띄워 봐야 안다. 둘 다 폴백이 원문 id 였다 —
 *
 *   사람   `staff:TEAM_HS_DOSEONG_COA1`  코치·감독은 `npcs` 에 없다
 *   사건   `TEAM_UNIV_HANYANG`           목록에 없는 팀
 *
 * `careerEventLabel.ts` 머리말이 "폴백이 원문이면 안 된다"고 이미 못박은
 * 결함 모양이고, 지시서의 이름 규칙에도 어긋난다.
 */
describe("이름이 원문 id 로 새지 않는다", () => {
  it("관계 이름은 `npcs` 를 안 뒤진다 — `Relationship.name` 을 쓴다", () => {
    expect(SRC, "npcs 에서 찾으면 코치·감독이 id 로 떨어진다").not.toMatch(
      /npcs \?\? \[\]\)\.find\(\(n\) => n\.npcId === id\)/,
    );
    expect(SRC, "person VIEW 가 채워 주는 name 을 안 쓴다").toMatch(/r\.name \|\|/);
  });

  it("이름이 없으면 역할명으로 대체한다 (`PeoplePage` 와 같게)", () => {
    expect(SRC).toMatch(/KIND\[r\.kind\] \?\? "인물"/);
  });

  it("팀 이름 폴백이 id 가 아니다", () => {
    expect(SRC, "못 찾은 팀을 id 로 찍고 있다").not.toMatch(
      /find\(\(t\) => t\.id === id\)\?\.name \?\? id/,
    );
    expect(SRC).toMatch(/const GONE = "\(기록 없음\)"/);
  });
});

/**
 * 🔴 **`--accent-weak` 는 정의된 적이 없는 토큰이다.** 하드코딩 폴백만 먹혀
 *    어두운 바탕이 됐고, 글자색을 안 정해서 **어두운 바탕에 어두운 글자**가
 *    됐다 — 태그가 안 읽혔다. 이 화면은 어두운 섬이라 토큰을 쓰면 안 되고
 *    색을 직접 정한다(머리말 규칙).
 */
describe("태그가 읽힌다", () => {
  it("없는 토큰에 기대지 않는다", () => {
    const css = SRC.slice(SRC.indexOf("<style>"));
    expect(css, "--accent-weak 는 정의된 적이 없다").not.toMatch(/background: var\(--accent-weak/);
  });

  it("연도별 수상·포스트시즌 태그가 글자색을 정한다", () => {
    for (const cls of ["yr-ps", "yr-aw"]) {
      const rule = SRC.slice(SRC.indexOf(`.${cls} {`), SRC.indexOf(`.${cls} {`) + 200);
      expect(rule, `${cls} 가 색을 안 정한다 — 지면이 어두워 안 읽힌다`).toMatch(/color: #/);
    }
  });
});

/**
 * 결산의 세 덩어리 순서 — **요약 · 통산 · 사건이 본문이고 사람은 덧붙이는 것**
 * (사용자 확정 2026-09-01). 처음엔 `사람` 이 `주요 사건` 앞에 있었다.
 */
describe("절 순서", () => {
  it("주요 사건이 사람보다 앞에 온다", () => {
    const ev = SRC.indexOf("<h3>주요 사건</h3>");
    const pp = SRC.indexOf("<h3>사람</h3>");
    expect(ev, "주요 사건 절이 없다").toBeGreaterThan(0);
    expect(pp, "사람 절이 없다").toBeGreaterThan(0);
    expect(ev, "사람이 주요 사건보다 앞에 있다").toBeLessThan(pp);
  });
});

/**
 * 은퇴 직후 결산 자동 열기 (1.1 C⑤-a · 사용자 확정 2026-09-02 "연다").
 *
 * 🔴 **은퇴 경로가 셋인데 결산이 자동으로 뜨는 건 하나뿐이었다.**
 *    `RetirementAskModal`(노쇠·부상)만 `onRetired()` 로 알렸고,
 *    `StatusPage` 의 **자발적 은퇴는 아무한테도 안 알렸다** — 카드가
 *    「커리어 결산 보기」 버튼으로 바뀔 뿐이라 **사용자가 직접 눌러야**
 *    15~20시즌의 결말을 봤다. 위 "엔딩 뒤" 절이 고친 것과 같은 모양의
 *    결함이 **한 경로에만 남아 있었다.**
 *
 * 신호는 `retireProtagonist` 하나가 올린다 — 화면마다 "은퇴시켰으니 결산도
 * 열어라"를 적으면 경로가 늘 때마다 한 자리씩 빠진다.
 */
const UC = readFileSync(join(__dirname, "../../../shared/usecases/retirement.ts"), "utf8");
const SAVE_T = readFileSync(join(__dirname, "../../../shared/types/save.ts"), "utf8");
const STATUS = readFileSync(join(__dirname, "../../../pages/status/StatusPage.svelte"), "utf8");

describe("은퇴 직후 결산이 저절로 열린다", () => {
  /**
   * ⚠ **모듈 스토어라 검사끼리 이어진다.** `careerEndPending` 은
   *   `writable(false)` 하나뿐이라 앞 검사가 올려 두면 다음 검사가 그걸 본다 —
   *   지금은 올리는 검사가 하나뿐이지만 늘면 조용히 깨진다. 매번 내려 둔다.
   */
  beforeEach(() => careerEndPending.set(false));

  it("`retireProtagonist` 가 저장을 끝낸 뒤에 신호를 올린다", () => {
    const fn = UC.slice(UC.indexOf("export async function retireProtagonist"));

    expect(
      fn.indexOf("careerEndPending.set(true)"),
      "은퇴가 신호를 안 올린다 — 자발적 은퇴에서 결산이 안 뜬다",
    ).toBeGreaterThan(0);
    /**
     * ⚠ 결산은 `careerRecords` 를 읽는다. 저장 전에 올리면 마지막 시즌이
     *   빠진 채로 나온다 — 은퇴 모달이 이미 같은 이유로 순서를 지킨다.
     */
    expect(fn.indexOf("careerEndPending.set(true)"), "저장보다 먼저 올린다").toBeGreaterThan(
      fn.indexOf("seasonStore.save()"),
    );
  });

  /**
   * ⚠ 꺼내는 행위와 내리는 행위를 갈라놓지 않는다. 화면이 `set(false)` 를
   *   따로 부르게 하면 그걸 빠뜨린 화면에서 결산을 닫는 순간 반응문이 다시
   *   돌아 **다시 열린다** — 닫을 수 없는 화면이 된다.
   */
  it("신호는 한 번만 참이다 — 읽으면서 내린다", () => {
    expect(takeCareerEndPending(), "아무 일도 없었는데 참이다").toBe(false);

    careerEndPending.set(true);
    expect(takeCareerEndPending(), "올렸는데 안 잡힌다").toBe(true);
    expect(takeCareerEndPending(), "두 번 잡힌다 — 결산이 닫히지 않는다").toBe(false);
  });

  it("신호를 읽으면서 내리는 함수가 하나로 있다", () => {
    const fn = UC.slice(UC.indexOf("export function takeCareerEndPending"));
    expect(
      fn.indexOf("careerEndPending.update("),
      "꺼내면서 내리지 않는다 — 결산이 닫히지 않는다",
    ).toBeGreaterThan(0);
    expect(fn.indexOf("return false;"), "내리는 자리가 없다").toBeGreaterThan(0);
  });

  it("MainPage 가 그 신호를 보고 결산을 연다", () => {
    expect(MAIN, "MainPage 가 신호를 안 읽는다 — 자발적 은퇴가 결산을 못 연다").toContain(
      "$careerEndPending && takeCareerEndPending()",
    );
    expect(MAIN, "결산을 여는 대입이 없다").toContain(
      "takeCareerEndPending()) careerEndOpen = true",
    );
    expect(MAIN, "신호를 import 하지 않는다").toContain(
      "import { careerEndPending, takeCareerEndPending }",
    );
  });

  /**
   * ⚠ **화면마다 여는 코드를 적지 않는다.** 그렇게 적으면 경로가 늘 때마다
   *   한 자리씩 빠진다 — 방금 `StatusPage` 가 그렇게 빠져 있었다.
   *   자발적 은퇴는 `retireProtagonist` 만 부르고 여는 건 `MainPage` 몫이다.
   */
  it("StatusPage 는 은퇴시키기만 하고 결산을 따로 안 연다", () => {
    const fn = STATUS.slice(
      STATUS.indexOf("async function doVoluntaryRetire"),
      STATUS.indexOf("// ── 레이더 차트"),
    );
    expect(fn.indexOf('retireProtagonist("voluntary")'), "자발적 은퇴가 사라졌다").toBeGreaterThan(
      0,
    );
    expect(
      fn.indexOf("showCareerEnd = true"),
      "화면이 스스로 결산을 연다 — 여는 자리가 둘이 됐다",
    ).toBe(-1);
  });

  /**
   * ⚠ **세이브에 안 넣는다.** 「결산을 봤는가」를 세이브에 적으면 그 필드가
   *   없는 구 세이브에서 슬롯을 열 때마다 결산이 뜬다.
   */
  it("세이브에 플래그를 새로 넣지 않았다", () => {
    expect(
      SAVE_T,
      "결산 관람 여부가 세이브 타입에 들어갔다 — 구 세이브에서 매번 뜬다",
    ).not.toContain("careerEndSeen");
    expect(SAVE_T).not.toContain("careerEndPending");
  });

  /**
   * ⚠ 헤드리스는 안 바뀐다 — `runAutoAdvance` 는 `retirementAsk` 에서 멈추고
   *   `retireProtagonist` 를 부르지 않는다.
   */
  it("자동 진행은 은퇴를 확정하지 않는다", () => {
    const AUTO = readFileSync(
      join(__dirname, "../../../shared/usecases/runAutoAdvance.ts"),
      "utf8",
    );
    expect(AUTO, "자동 진행이 은퇴를 확정한다 — 헤드리스가 결산 신호를 올린다").not.toContain(
      "retireProtagonist",
    );
  });
});
