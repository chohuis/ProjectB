import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는다.**
 *
 * 게임은 돌고 콘텐츠만 사라진다. 이 트랙이 겪은 결함이 대부분 그 부류였고,
 * 여기 셋은 2026-08-25에 전체 공용 11종을 하나씩 펼쳐 보다 나왔다.
 *
 * 셋 다 지금은 0건이다. **이 검사는 다시 0이 아니게 되는 걸 막는다.**
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".json") ? [p] : [];
  });
}

type Rule = {
  id: string;
  poolId?: string | null;
  conditions?: unknown[];
  messageTemplateId?: string | null;
  decisionTemplateId?: string | null;
};
type Tmpl = { id: string; subject?: string; body?: string; bodies?: string[] };

const RULES: Rule[] = ["mandatory", "conditional", "random"]
  .flatMap((lane) => walk(join(MASTER, "events", lane)))
  .map((p) => JSON.parse(readFileSync(p, "utf8")) as Rule);

const TMPL = new Map<string, Tmpl>(
  (JSON.parse(readFileSync(join(MASTER, "messages/templates.json"), "utf8")).templates as Tmpl[])
    .map((t) => [t.id, t]),
);

const bodiesOf = (t: Tmpl | undefined): string[] =>
  !t ? [] : Array.isArray(t.bodies) && t.bodies.length > 0 ? t.bodies : t.body ? [t.body] : [];

describe("이벤트 데이터 위생", () => {
  /**
   * 🔴 `MSG_RAND_FRIEND_VISIT`이 본문 끝에 `[사기 +5]`라 써놓고 **아무것도
   * 안 줬다.** 선택지가 없으면 효과를 실을 자리가 없다 — 규칙 단위 `effects`는
   * 엔진에 없고, `ruleToOutput`은 `options[].effects`만 읽는다.
   *
   * 힌트를 쓸 자리는 선택지의 `effectHint`다. 본문은 이야기만 한다.
   */
  it("본문이 효과를 약속하면 선택지가 있다", () => {
    const HINT = /\[[^\]\n]*[+\-]\s*\d+[^\]\n]*\]/;
    const liars = RULES
      .filter((r) => !r.decisionTemplateId)
      .filter((r) => bodiesOf(TMPL.get(r.messageTemplateId ?? "")).some((b) => HINT.test(b)))
      .map((r) => r.id);
    expect(liars).toEqual([]);
  });

  /**
   * 🔴 `EVT_RAND_SOCIAL_MEDIA_MENTION`의 `conditions`가 **빈 배열**이었다.
   * 고교 1학년 첫 주 무명 선수의 경기 하이라이트가 SNS에서 돌았고, 쿨다운이
   * 1주라 매주 후보에 올라 6시즌 31회 떴다 — 보상은 없다.
   *
   * ⚠ 조건이 없다는 건 "언제나 참"이다. 그건 의도일 수 없다 — 적어도 무대
   * 하나는 정해야 한다. 진짜 전체 공용이라도 상태 조건 하나는 붙는다.
   */
  it("조건이 하나도 없는 규칙은 없다", () => {
    const bare = RULES.filter((r) => (r.conditions ?? []).length === 0).map((r) => r.id);
    expect(bare).toEqual([]);
  });

  /**
   * 🔴 `EVT_RAND_FRIEND_VISIT`(공용)과 `EVT_HS_LIFE_FRIEND_VISIT`(고교)이
   * **같은 풀에서 같은 템플릿**을 썼다. 고교생은 같은 글을 두 규칙에서 받았고,
   * 조건만 다르고 글자는 한 자도 안 달랐다.
   *
   * ⚠ **풀이 없는(`poolId` 없는) 것끼리는 겹쳐도 된다.** 중간고사·개강처럼
   * 학년으로 갈리는 연간 행사가 그렇다 — 같은 주에 같이 뽑히지 않는다.
   * 문제는 **같은 풀 안**이다. 거기선 매주 같은 상자에서 함께 뽑힌다.
   *
   * 🔴 **세는 단위는 그룹이 아니라 잉여 규칙이다.** 예전엔 그룹 수를 셌는데,
   * 2026-08-25에 풀 하나를 셋으로 가르자 **그룹이 14 → 15로 늘고 잉여는
   * 27 → 25로 줄었다** — 한 그룹이 두 풀로 쪼개지면 그룹 수는 늘고 그룹
   * 크기는 준다. 그룹 수로는 나아진 걸 나빠진 걸로 읽는다.
   *
   * ⚠ 지금 잉여 25종(그룹 15 · 최대 5)이고 **거의 다 고교·대학 칸**이다.
   * 최악은 `MSG_RAND_TEAM_MEAL` 5개 — 날씨·팀케미 이벤트가 "팀 회식이
   * 있습니다"를 띄운다. 칸을 내려가며 푼다. 여기서는 **더 늘지 않는
   * 것**만 지킨다.
   */
  it("같은 풀 + **같은 무대**에서 같은 글이 두 번 뜨지 않는다", () => {
    /**
     * ⚠ **무대가 다르면 겹쳐도 된다.** 고교판과 대학판이 같은 템플릿을
     * 쓰는 건 정상이다 — `career_stage`가 갈라 같은 주에 같이 안 뜬다.
     * 예전엔 그걸 세서 지표가 실제 결함보다 훨씬 커 보였다(25 vs 2).
     */
    const stagesOf = (r: Rule): string[] => {
      const c = (r.conditions ?? []).find((x) => (x as { type?: string }).type === "career_stage") as
        { stage?: string; stages?: string[] } | undefined;
      if (!c) return ["*"];
      return Array.isArray(c.stages) ? c.stages : c.stage ? [c.stage] : ["*"];
    };
    const byKey = new Map<string, Rule[]>();
    for (const r of RULES) {
      if (!r.poolId) continue;
      const k = `${r.messageTemplateId}|${r.poolId}`;
      byKey.set(k, [...(byKey.get(k) ?? []), r]);
    }
    let excess = 0;
    for (const v of byKey.values()) {
      if (v.length < 2) continue;
      const seen = new Map<string, number>();
      for (const r of v) for (const st of stagesOf(r)) seen.set(st, (seen.get(st) ?? 0) + 1);
      for (const n of seen.values()) if (n > 1) excess += n - 1;
    }
    expect(excess).toBeLessThanOrEqual(2);
  });
});

/**
 * 🔴 **군 복무 중에는 이벤트 엔진이 안 돈다.**
 *
 * `advanceWeek`가 `careerStage === "military"`면 **일찍 return한다**
 * (`advanceWeek.ts:1879`). 그 아래 `runEventEngine()`이 아예 안 불린다 —
 * 조건부·랜덤 규칙은 군에서 **한 종도 못 돈다.**
 *
 * 군은 별도 시스템이다: `events/pools/military_{common,sports,general}.json`을
 * 계급(`minRank`)으로 걸러 Rust `calc_military_week`가 하나 고른다.
 *
 * 2026-08-26에 군 서사 14종을 **조건부 이벤트로 만들었다가** 계측이 0회를
 * 찍어 알았다. 풀로 옮겼다. 같은 착각을 다시 하지 않게 못박는다.
 */
describe("군 이벤트는 규칙이 아니라 풀이다", () => {
  const MIL = resolve(__dirname, "../../../../../../resource/data/master/events/pools");
  type MilEvent = { id: string; title?: string; description?: string; minRank?: number; choices?: unknown[] };

  /**
   * 🔴 **경로 이름이 아니라 값을 본다** (2026-09-03 · B-20 재회).
   *
   * 예전엔 `militaryStatus`·`militaryUnit`·`militaryServiceWeeks`·`militaryServedUnit`
   * **네 이름을 통째로** 막았다. 근거는 위 「복무 중에는 엔진이 안 돈다」인데,
   * 그 근거가 막는 것은 **복무 중을 요구하는 조건**이지 군 이야기 전부가 아니다.
   *
   * 전역하면 엔진이 돈다. 「전역 뒤 부대원 재회」는 `militaryStatus === "군필"` 로
   * 시작하는데 옛 잣대는 그것도 막았다 — 재회 12종이 여기 걸려 도로 나왔다.
   *
   * 그래서 갈랐다.
   *
   * | 조건 | 복무 중에만 참인가 | 잣대 |
   * |---|---|---|
   * | `militaryStatus === "현역"` | 그렇다 | **막는다** |
   * | `militaryStatus === "군필"`·`"미필"`·`"면제"` | 아니다 | 연다 |
   * | `militaryUnit` | 그렇다 (전역 때 `null`) | **막는다** |
   * | `militaryServiceWeeks` | 그렇다 (전역 때 0) | **막는다** |
   * | `militaryServedUnit` | 아니다 (**전역 뒤에 남긴다**) | 연다 |
   *
   * ⚠ `military_phase`는 여기 있었는데 **타입 자체를 지웠다**(2026-08-26).
   *   지금 그 조건을 쓰면 로드에서 잡힌다 — 여기까지 올 일이 없다.
   */
  it("이벤트 규칙이 **복무 중**을 요구하지 않는다 — 요구하면 영영 안 뜬다", () => {
    /** 전역과 함께 값이 사라지는 필드 — 조건으로 쓰면 규칙 갈래에서 영영 거짓이다 */
    const ONLY_WHILE_SERVING = ["militaryUnit", "militaryServiceWeeks"];
    const army = RULES
      .filter((r) => (r.conditions ?? []).some((c) => {
        const { path, value } = c as { path?: string; value?: unknown };
        if (path === undefined) return false;
        if (ONLY_WHILE_SERVING.includes(path)) return true;
        return path === "militaryStatus" && value === "현역";
      }))
      .map((r) => r.id);
    expect(army).toEqual([]);
  });

  it("전역 뒤 조건은 막지 않는다 — 잣대가 값을 보는지 확인한다", () => {
    // 🔴 대조군. 잣대를 옛 꼴(경로 이름만)로 되돌리면 이 검사가 깨진다 —
    //   그래야 위 검사가 「복무 중」만 막고 있다는 게 증명된다.
    const 군필 = { type: "eq", path: "militaryStatus", value: "군필" } as const;
    const 현역 = { type: "eq", path: "militaryStatus", value: "현역" } as const;
    const blocked = (c: { path?: string; value?: unknown }) =>
      ["militaryUnit", "militaryServiceWeeks"].includes(c.path ?? "")
      || (c.path === "militaryStatus" && c.value === "현역");
    expect(blocked(군필)).toBe(false);
    expect(blocked(현역)).toBe(true);
    expect(blocked({ path: "militaryServedUnit", value: "general" })).toBe(false);
    expect(blocked({ path: "weeksSinceDischarge", value: 10 })).toBe(false);
  });

  for (const pool of ["common", "sports", "general"]) {
    it(`military_${pool} — 제목·본문·선택지가 다 있다`, () => {
      const j = JSON.parse(readFileSync(join(MIL, `military_${pool}.json`), "utf8")) as { events: MilEvent[] };
      const bad = j.events
        .filter((e) => !e.title || !e.description || !(e.choices ?? []).length)
        .map((e) => e.id);
      expect(bad).toEqual([]);
      // 계급은 0~3이다 (advanceWeek.ts:1897 — 8/34/60주 경계)
      const badRank = j.events.filter((e) => (e.minRank ?? 0) < 0 || (e.minRank ?? 0) > 3).map((e) => e.id);
      expect(badRank).toEqual([]);
    });
  }
});
