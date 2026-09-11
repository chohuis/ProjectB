/**
 * **조건 타입의 표 넷이 어긋나면 게임이 안 뜬다** (2026-09-08 · A · L4 실사고).
 *
 * 🔴 무슨 일이 있었나. 통지 조건 넷(`outcome_within`·`season_games_gte`·
 *   `season_games_lte`·`season_starts_gte`)이 **평가기에도 타입 유니온에도
 *   있는데 `master.ts` 의 `CONDITION_FIELDS` 표에만 없었다.** 그 조건을 쓴
 *   이벤트가 데이터에 들어오자 `assertConditions` 가 던지고 **마스터 로드가
 *   통째로 죽었다.** 증상은
 *
 *       Error: [perfEntry] 고교 팀이 없다 — refs.json 로드 실패
 *
 *   라 원인과 한참 떨어져 보인다. 그런데 **검사 셋이 다 통과했다**:
 *     · `npm test` 2,642 — **마스터 로드를 실제로 도는 검사가 없다**
 *     · `check:eventconditions` — **평가기 목록만** 본다
 *     · `check:lanes` — 갈래만 본다
 *   **표 넷 중 하나씩만 보는 검사가 셋**이었던 것이다.
 *
 * 그래서 여기서 **넷을 한 번에** 본다:
 *
 *   ① 타입 유니온 (`types/event.ts` 의 `Condition`)
 *   ② `CONDITION_FIELDS` (`stores/master.ts`)
 *   ③ 평가기 (`utils/conditionEvaluator.ts`)
 *   ④ **데이터가 실제로 쓰는 것** (`resource/data/master/events/**`)
 *
 * ⚠ ①↔② 는 이제 **컴파일러가 본다** — 표를 `Record<Condition["type"], …>` 로
 *   좁혔다. 이 파일은 나머지 방향과 데이터를 맡는다.
 * ⚠ **소스를 정규식으로 긁지 않는다.** 평가기는 **불러서** 확인하고(모르는
 *   타입이면 던지게 돼 있다), 유니온은 컴파일러가 보증한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { CONDITION_FIELDS_FOR_TEST } from "../master";
import { evaluateCondition } from "../../utils/conditionEvaluator";
import type { Condition, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

const MASTER = resolve(process.cwd(), "resource/data/master");

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );

/** 데이터가 실제로 쓰는 조건 — 숨은 조건·선택지 조건까지 전부 */
function conditionsInData(): { type: string; ruleId: string; raw: unknown }[] {
  const out: { type: string; ruleId: string; raw: unknown }[] = [];
  for (const lane of ["mandatory", "conditional", "random"]) {
    for (const f of walk(join(MASTER, "events", lane)).filter((x) => x.endsWith(".json"))) {
      const r = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
      const id = String(r.id ?? f);
      const lists = [r.conditions, r.hiddenCondition].filter(Array.isArray) as unknown[][];
      for (const list of lists) {
        for (const c of list)
          out.push({ type: String((c as { type?: unknown })?.type), ruleId: id, raw: c });
      }
    }
  }
  return out;
}

/** 조건 하나를 **실제로 평가해 본다** — 모르는 타입이면 평가기가 던지게 돼 있다 */
function evaluatorKnows(type: string): boolean {
  const ctx = {
    protagonist: {
      id: "P",
      tags: [],
      pitches: [],
      pitching: {},
      batting: {},
    } as unknown as ProtagonistSave,
    currentWeek: 1,
    seasonPhase: "season",
    standings: [],
    stats: {},
    triggeredEvents: {},
  } as unknown as EventContext;
  try {
    evaluateCondition({ type } as unknown as Condition, ctx);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 모르는 타입만 실패로 본다 — 필드가 없어 터지는 것은 「안다」는 뜻이다
    return !msg.includes("모르는 조건 타입");
  }
}

describe("조건 타입 — 표 넷 대조", () => {
  const tableTypes = Object.keys(CONDITION_FIELDS_FOR_TEST).sort();
  const used = conditionsInData();

  it("표가 비어 있지 않다 — 못 읽고 초록을 내는 검사가 제일 나쁘다", () => {
    expect(tableTypes.length).toBeGreaterThan(40);
    expect(used.length).toBeGreaterThan(100);
  });

  it("② → ③  표에 있는 타입을 평가기가 전부 안다", () => {
    const unknown = tableTypes.filter((t) => !evaluatorKnows(t));
    expect(unknown, `표엔 있는데 평가기가 모른다 — 그 조건은 늘 false 다`).toEqual([]);
  });

  it("🔴 ④ → ②  데이터가 쓰는 타입이 표에 전부 있다 — 없으면 **로드가 죽어 게임이 안 뜬다**", () => {
    const missing = [
      ...new Set(
        used
          .filter((u) => !(u.type in CONDITION_FIELDS_FOR_TEST))
          .map((u) => `${u.type} (${u.ruleId})`),
      ),
    ];
    expect(missing).toEqual([]);
  });

  it("④ → ③  데이터가 쓰는 타입을 평가기가 전부 안다", () => {
    const types = [...new Set(used.map((u) => u.type))];
    expect(types.filter((t) => !evaluatorKnows(t))).toEqual([]);
  });

  it("④ 의 필드가 표와 맞는다 — 타입이 맞아도 필드가 틀리면 영원히 false 다", () => {
    const bad: string[] = [];
    for (const u of used) {
      const want = CONDITION_FIELDS_FOR_TEST[u.type as keyof typeof CONDITION_FIELDS_FOR_TEST];
      if (!want || want.length === 0) continue; // 빈 배열은 `assertConditions` 가 따로 본다
      const c = u.raw as Record<string, unknown>;
      if (!want.some((k) => c[k] !== undefined)) bad.push(`${u.ruleId}: ${JSON.stringify(c)}`);
    }
    expect(bad).toEqual([]);
  });

  it("② 에 있는데 아무 데이터도 안 쓰는 타입은 그냥 알려만 준다 — 결함이 아니다", () => {
    const usedSet = new Set(used.map((u) => u.type));
    const unused = tableTypes.filter((t) => !usedSet.has(t));
    // 값을 못박지 않는다: 새 조건을 만들고 데이터가 아직 안 쓰는 것은 정상이다
    expect(Array.isArray(unused)).toBe(true);
  });
});
