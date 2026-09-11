import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * 🔴 **주차는 시즌 안 주차다. 누적이 아니다.**
 *
 * 2026-08-25 실측: 고교 2·3학년 달력 **19종이 통째로 안 떴다.**
 * 조건이 이랬다:
 *
 *     EVT_HS_Y2_W01_NEW_TERM_RESET   week_eq  53
 *     EVT_HS_Y3_W52_DRAFT_GATE       week_eq 156
 *
 * 2학년 1주차를 "누적 53주차"로 매긴 것이다. 그런데 `EventContext.currentWeek`는
 * **1~52**다 — 시즌 롤오버가 리셋한다(`CLAUDE.md`에도 적힌 함정이다).
 * 그래서 그 값은 **영원히 안 나온다.**
 *
 * 게다가 1학년 달력엔 `grade` 조건이 아예 없어서, 누적 주차 하나로 학년을
 * 구분하려던 설계가 무너지자 **1학년 것이 3년 내내 떴다.**
 *
 * 고친 방식: `grade` + 시즌 안 주차. 학년은 학년 조건이 말한다.
 *
 * ⚠ `week_lte`가 52를 넘는 건 무해하다 — 상한이 항상 참이 될 뿐이다
 *   (`EVT_HS_LIFE_FATIGUE_ALERT`의 `lte 156`이 그렇다).
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}
type Cond = { type: string; value?: number };
type Rule = { id: string; conditions?: Cond[] };
const RULES: Rule[] = ["mandatory", "conditional", "random"]
  .flatMap((lane) => walk(join(MASTER, "events", lane)))
  .map((p) => JSON.parse(readFileSync(p, "utf8")) as Rule);

const SEASON_WEEKS = 52;
/**
 * 🔴 **고교 3학년은 52주가 아니다.** 진로 허브가 W28에 뜨고
 * (`HS_CAREER_HUB_WEEK`) 그 주에 `careerStage`가 바뀐다. W28 이후의
 * 3학년 이벤트는 **주인공이 이미 고교를 떠난 뒤**라 못 뜬다.
 *
 * 2026-08-25 실측: 16종이 52주 달력으로 쓰여 있었다. 그중
 * `EVT_HS_Y3_W50_CAREER_CHOICE_GATE`는 **진로 선택 관문인데 실제 허브보다
 * 22주 늦었다.**
 */
const HS_CAREER_HUB_WEEK = 28;

describe("주차 조건", () => {
  it("🔴 week_eq / week_gte가 52를 넘지 않는다 — 넘으면 영원히 false다", () => {
    const bad = RULES.flatMap((r) =>
      (r.conditions ?? [])
        .filter(
          (c) => (c.type === "week_eq" || c.type === "week_gte") && (c.value ?? 0) > SEASON_WEEKS,
        )
        .map((c) => `${r.id} ${c.type} ${c.value}`),
    );
    expect(bad).toEqual([]);
  });

  /**
   * 학년별 규칙(`EVT_HS_Y1_*` 등)은 **학년을 스스로 말해야 한다.**
   * 주차로 학년을 구분하려던 게 위 결함의 원인이다.
   */
  it("학년 규칙은 grade 조건을 갖는다", () => {
    const missing = RULES.filter((r) => /^EVT_HS_Y[123]_/.test(r.id))
      .filter((r) => !(r.conditions ?? []).some((c) => c.type === "grade"))
      .map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it("🔴 고교 3학년 주차가 진로 허브(W28)를 안 넘는다", () => {
    const late = RULES.filter((r) =>
      (r.conditions ?? []).some((c) => c.type === "grade" && c.value === 3),
    )
      .filter((r) =>
        (r.conditions ?? []).some(
          (c) =>
            (c.type === "week_eq" || c.type === "week_gte") && (c.value ?? 0) >= HS_CAREER_HUB_WEEK,
        ),
      )
      .map((r) => r.id);
    expect(late).toEqual([]);
  });

  /** grade 값이 id가 말하는 학년과 같다 — 복붙 오류를 막는다 */
  it("grade 값이 규칙 id의 학년과 일치한다", () => {
    const wrong = RULES.flatMap((r) => {
      const m = /^EVT_HS_Y([123])_/.exec(r.id);
      if (!m) return [];
      const g = (r.conditions ?? []).find((c) => c.type === "grade");
      return g && g.value !== Number(m[1]) ? [`${r.id} → grade ${g.value}`] : [];
    });
    expect(wrong).toEqual([]);
  });
});
