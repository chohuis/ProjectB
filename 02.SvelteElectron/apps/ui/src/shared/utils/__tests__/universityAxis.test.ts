import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  universityGradeOf,
  universityWeekOnEnroll,
  UNIVERSITY_FINAL_GRADE,
} from "../careerTransition";
import { WEEKS_PER_SEASON, CAREER_RESULT_WEEK, UNIV_CAREER_HUB_WEEK } from "../seasonWeeks";

/**
 * 🔴 **대학 학년 계수기의 축이 시즌 경계와 맞는가** (2026-09-01).
 *
 * 진학은 시즌 도중(W32)에 확정된다. 예전엔 `universityWeek`을 안 세워서
 * 초기값 0에서 시작했고, 그러면 계수기가 **진학한 주부터** 세므로 학년이
 * 매 시즌 W33에 올랐다 — 야구 시즌과 20주 어긋났다.
 *
 * ⚠ **이 결함은 조용하다.** 학년이 어긋나도 게임은 돌고, 이벤트만 사라진다.
 * 이벤트가 `week_eq`와 `school.universityWeek` 창을 **같이** 걸기 때문이다 —
 * 주차는 맞는데 창이 밀려서 후보에 한 번도 못 오른다.
 *
 * 그래서 이 파일은 둘을 본다:
 *   ① 축 자체 — 진학 주차가 어디든 다음 시즌 W1에 `uw = 1`인가
 *   ② **데이터** — 대학 이벤트의 (주차 × 창) 조합이 실제로 도달 가능한가
 *
 * ②가 핵심이다. ①만 보면 축을 옮겨 놓고 이벤트가 여전히 죽어 있어도 초록이다.
 */

// ── 축 모델 ───────────────────────────────────────────────────
//
// 진학 주 `e`에 `uw = e - 52`로 세우고 매주 +1 하면, 그 뒤로는
// **진학 주차와 무관하게** `uw = 절대주 - 52`가 된다. 아래 함수가 그 계산을
// 코드의 정본(`universityWeekOnEnroll`)에서 시작해 실제로 주를 세어 확인한다.
//
// ⚠ **닫힌 식으로 적지 않는다.** `uw = 절대주 - 52`라고 검사에 써 버리면
// 코드가 아니라 검사가 축을 정하는 꼴이 되어, 코드를 되돌려도 초록이 난다.
/** 진학 주차 `e`에서 출발해 `weeks`주 뒤의 `universityWeek` */
function uwAfter(enrollWeekInYear: number, weeks: number): number {
  let uw = universityWeekOnEnroll(enrollWeekInYear);
  for (let i = 0; i < weeks; i++) uw += 1; // advanceWeek이 매주 +1 한다
  return uw;
}

/** 진학한 시즌의 `e`주차에서 그 뒤 `n`번째 시즌 `w`주차까지의 주 수 */
const weeksTo = (e: number, n: number, w: number) =>
  WEEKS_PER_SEASON - e + (n - 1) * WEEKS_PER_SEASON + w;

describe("축 — 진학 주차가 어디든 다음 시즌 W1이 1학년 1주차다", () => {
  // 진로 결과는 W32이고 대학 진로허브는 W29다. 캘린더가 바뀌어도 버티도록
  // 그 둘을 포함해 넓게 본다
  const ENROLL = [1, 10, UNIV_CAREER_HUB_WEEK, CAREER_RESULT_WEEK, 40, 52];

  it.each(ENROLL)("진학 W%i → 다음 시즌 W1에 uw 1", (e) => {
    expect(uwAfter(e, weeksTo(e, 1, 1))).toBe(1);
  });

  it.each(ENROLL)("진학 W%i → 다음 시즌 W52에 uw 52 (아직 1학년)", (e) => {
    expect(uwAfter(e, weeksTo(e, 1, WEEKS_PER_SEASON))).toBe(WEEKS_PER_SEASON);
    expect(universityGradeOf(undefined, uwAfter(e, weeksTo(e, 1, WEEKS_PER_SEASON)))).toBe(1);
  });

  it.each(ENROLL)("진학 W%i → 2년째 W1에 2학년", (e) => {
    expect(universityGradeOf(undefined, uwAfter(e, weeksTo(e, 2, 1)))).toBe(2);
  });

  /**
   * 🔴 **여기가 결함이었다.** 예전 축에서는 각 시즌 W33부터 다음 학년이
   * 열려서, 시즌 마지막 20주가 통째로 다음 학년으로 넘어갔다.
   */
  it.each(ENROLL)("진학 W%i → 1년째 W50이 아직 1학년이다", (e) => {
    expect(universityGradeOf(undefined, uwAfter(e, weeksTo(e, 1, 50)))).toBe(1);
  });

  it("입학 전(진학한 시즌의 남은 주)은 계수기가 1 미만이다", () => {
    const e = CAREER_RESULT_WEEK;
    // 진학 당일부터 그 시즌 마지막 주까지
    for (let w = e; w <= WEEKS_PER_SEASON; w++) {
      expect(uwAfter(e, w - e)).toBeLessThan(1);
    }
  });

  it("4학년까지 간다 — 4년째가 마지막이다", () => {
    const e = CAREER_RESULT_WEEK;
    expect(universityGradeOf(undefined, uwAfter(e, weeksTo(e, 4, 1)))).toBe(UNIVERSITY_FINAL_GRADE);
  });
});

// ── 데이터 — (주차 × 창) 조합이 도달 가능한가 ──────────────────

const EVENT_ROOT = resolve(__dirname, "../../../../../../resource/data/master/events");

type Cond = { type: string; path?: string; value?: number; stage?: string; stages?: string[] };
type Rule = { id: string; conditions?: Cond[] };

function allRules(): Rule[] {
  const out: Rule[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(JSON.parse(readFileSync(p, "utf8")) as Rule);
    }
  };
  walk(EVENT_ROOT);
  return out;
}

/** `career_stage`가 대학이고 `week_eq`와 uw 창을 **둘 다** 거는 규칙 */
function universityWeekPinned() {
  return allRules().flatMap((r) => {
    const cs = (r.conditions ?? []).find((c) => c.type === "career_stage");
    const stages = cs?.stages ?? (cs?.stage ? [cs.stage] : []);
    if (!stages.includes("university")) return [];
    const wk = (r.conditions ?? []).find((c) => c.type === "week_eq");
    const uw = (r.conditions ?? []).filter((c) => c.path === "school.universityWeek");
    if (!wk || uw.length === 0) return [];
    const gte = uw.find((c) => c.type === "num_gte")?.value;
    const lte = uw.find((c) => c.type === "num_lte")?.value;
    return [{ id: r.id, week: wk.value as number, gte, lte }];
  });
}

describe("데이터 — 대학 이벤트의 주차 × 창 조합이 실제로 열린다", () => {
  const pinned = universityWeekPinned();

  it("그런 규칙이 실제로 있다", () => {
    // 0건이면 아래 검사가 전부 공회전한다 — 그걸 먼저 막는다
    expect(pinned.length).toBeGreaterThan(10);
  });

  /**
   * 각 규칙의 창(`gte`)이 몇 학년을 뜻하는지 정본에서 읽고, 그 학년 시즌의
   * 해당 주차에 `uw`가 창 안에 드는지 본다.
   *
   * ⚠ **창 자체를 학년으로 되읽는다** — 검사에 "Y1은 1~52"라고 적으면
   * 데이터가 바뀔 때 검사만 맞고 게임은 틀린다.
   */
  it.each(pinned.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    const e = CAREER_RESULT_WEEK;
    const grade = universityGradeOf(undefined, p.gte ?? 1);
    const uw = uwAfter(e, weeksTo(e, grade, p.week));
    expect(
      uw,
      `${_id}: ${grade}학년 W${p.week}에 uw ${uw} — 창 ${p.gte}~${p.lte ?? "∞"} 밖이다`,
    ).toBeGreaterThanOrEqual(p.gte ?? Number.NEGATIVE_INFINITY);
    if (p.lte != null) {
      expect(
        uw,
        `${_id}: ${grade}학년 W${p.week}에 uw ${uw} — 창 ${p.gte}~${p.lte} 밖이다`,
      ).toBeLessThanOrEqual(p.lte);
    }
  });

  /**
   * ⚠ **4학년 시즌은 W32에 끝난다** (`CAREER_RESULT_WEEK`에 드래프트가
   * 데려간다). 그 뒤 주차를 거는 4학년 이벤트는 축과 무관하게 못 뜬다.
   */
  it("4학년 이벤트가 시즌이 끝난 뒤 주차를 걸지 않는다", () => {
    const late = pinned.filter(
      (p) =>
        universityGradeOf(undefined, p.gte ?? 1) === UNIVERSITY_FINAL_GRADE &&
        p.week > CAREER_RESULT_WEEK,
    );
    expect(
      late.map((p) => `${p.id}(W${p.week})`),
      "4학년은 W32에 끝난다",
    ).toEqual([]);
  });
});
