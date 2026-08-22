import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * **조건이 평가기와 어긋나면 그 이벤트는 영원히 안 뜬다.**
 *
 * `evaluateCondition`은 `cond.stage`를 읽는데 데이터가 `cond.value`를 쓰면
 * `undefined`와 비교하게 되고, `evaluateConditions`의 `every`가 그걸 false로
 * 만든다. **로그도 예외도 없다** — 게임은 멀쩡히 돌고 콘텐츠만 사라진다.
 *
 * 실측(2026-08-22): `career_stage`에 `value`를 쓴 게 21건, `season_phase`에
 * 쓴 게 23건. 규칙 **35종**이 6시즌 내내 후보에조차 못 올랐다 —
 * 밀린 목록에도 안 나타나서 "콘텐츠가 부족하다"로 읽혔다.
 *
 * ⚠ **타입만 보면 절반만 잡는다.** 그때 쓰인 타입 28종은 **전부 엔진이 아는
 * 것**이었다. 틀린 건 필드 이름이다. 그래서 필드까지 본다.
 *
 * ⚠ **정본은 `conditionEvaluator.ts` 소스다.** 아는 타입·필드를 여기 또 적으면
 * 두 벌이 되고, 엔진이 늘어나도 검사만 옛 목록으로 돈다.
 *
 * ⚠ **못 읽으면 실패한다.** 정규식이 어긋나 0건을 읽고도 "이상 없음"을 찍은
 * 적이 있다(같은 날). 조용히 통과하는 검사가 제일 나쁘다.
 *
 * `scripts/check-eventconditions.cjs`가 같은 일을 CLI로 한다 — 이쪽은
 * `npm test`에 묶여 자동으로 돈다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const MASTER = join(ROOT, "resource/data/master");
const EVALUATOR = join(ROOT, "apps/ui/src/shared/utils/conditionEvaluator.ts");

const CASE_RE = /case\s+"([a-z0-9_]+)"\s*:/g;
const FIELD_RE = /\bcond\.([a-zA-Z0-9_]+)/g;

/** 타입 → 그 case 본문이 읽는 `cond.X` 필드들. 소스에서 뽑는다 */
function knownFields(): Map<string, Set<string>> {
  const src = readFileSync(EVALUATOR, "utf8");
  const from = src.indexOf("switch (cond.type)");
  expect(from, "evaluateCondition의 switch를 못 찾았다").toBeGreaterThan(-1);
  const body = src.slice(from);
  const end = body.indexOf("export function evaluateConditions");
  const scope = end === -1 ? body : body.slice(0, end);

  const marks = [...scope.matchAll(CASE_RE)];
  expect(marks.length, "case를 하나도 못 읽었다 — 검사가 눈이 멀었다").toBeGreaterThan(0);

  const out = new Map<string, Set<string>>();
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index! + marks[i][0].length;
    const stop = i + 1 < marks.length ? marks[i + 1].index! : scope.length;
    const fields = new Set([...scope.slice(start, stop).matchAll(FIELD_RE)].map((m) => m[1]));
    fields.delete("type");
    out.set(marks[i][1], fields);
  }
  // 연속 case(`team_rank_lte:` `team_rank_gte:`)는 본문이 비어 있다 — 뒤를 물려받는다
  const keys = [...out.keys()];
  for (let i = keys.length - 2; i >= 0; i--) {
    if (out.get(keys[i])!.size === 0) out.set(keys[i], out.get(keys[i + 1])!);
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".json") ? [p] : [];
  });
}

type Rule = { id?: string; conditions?: Record<string, unknown>[] };

function allRules(): Rule[] {
  const out: Rule[] = [];
  for (const lane of ["mandatory", "conditional", "random"]) {
    for (const p of walk(join(MASTER, "events", lane))) {
      out.push(JSON.parse(readFileSync(p, "utf8")) as Rule);
    }
    // 레거시 스텁도 본다 — 지금은 로드에서 던지지만 데이터가 남아 있는 한 검사한다
    const stub = join(MASTER, "events/rules", `${lane}.json`);
    if (existsSync(stub)) {
      out.push(...((JSON.parse(readFileSync(stub, "utf8")).events ?? []) as Rule[]));
    }
  }
  return out;
}

describe("이벤트 조건 ↔ 평가기", () => {
  it("규칙을 실제로 읽는다", () => {
    expect(allRules().length).toBeGreaterThan(100);
  });

  it("모든 조건 타입을 평가기가 안다", () => {
    const known = knownFields();
    const bad = allRules().flatMap((r) =>
      (r.conditions ?? [])
        .filter((c) => !known.has(String(c?.type)))
        .map((c) => `${r.id}: ${JSON.stringify(c)}`),
    );
    expect(bad).toEqual([]);
  });

  it("모든 조건이 평가기가 읽는 필드를 갖고 있다", () => {
    const known = knownFields();
    const bad = allRules().flatMap((r) =>
      (r.conditions ?? []).flatMap((c) => {
        const want = known.get(String(c?.type));
        if (!want || want.size === 0) return [];
        if ([...want].some((k) => c[k] !== undefined)) return [];
        return [`${r.id}: ${JSON.stringify(c)} — 평가기는 cond.${[...want].join("|")}를 읽는다`];
      }),
    );
    expect(bad).toEqual([]);
  });
});
