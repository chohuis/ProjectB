/**
 * **갈래 셋** — 주사위가 부른 것은 상태를 못 바꾼다 (`PLAN_MESSAGE_LANES_2026-09-08.md`).
 *
 * 🔴 발단은 테스터 증언이다 — 「2군으로 가라는 메시지가 왔고 **가겠다고 했는데도
 *   안 내려갔다**」. 무대 이동을 말하는 이벤트 23건 중 상태를 바꾸는 것이 0건이었다.
 *   여기서 못박는 것은 그 반대쪽이다: **이제는 바꿀 수 있게 됐으니, 아무나 못 바꾸게.**
 */
import { describe, it, expect } from "vitest";
import { noticeOf, gradeOf } from "../eventEngine";
import { STATE_EFFECT_KEYS, stateEffectsOf, hasStateEffect } from "../stateEffects";
import { evaluateCondition } from "../conditionEvaluator";
import type { EventRule, EventContext } from "../../types/event";
import type { ProtagonistSave } from "../../types/save";

const rule = (tier: string): EventRule =>
  ({
    id: "EVT_X",
    title: "t",
    type: "conditional",
    category: "c",
    priority: 1,
    tier: tier as EventRule["tier"],
    oncePolicy: "repeatable",
  }) as EventRule;

describe("갈래 판정", () => {
  it("`notice` 는 통지다", () => {
    expect(noticeOf(rule("notice"))).toBe(true);
  });

  it("🔴 `urgent` 도 통지다 — 통지의 옛 이름이고 하는 일이 같다", () => {
    // 둘을 다른 갈래로 두면 정본이 둘이 되어 한쪽만 고쳐진 채 남는다.
    // B 가 데이터를 `notice` 로 옮기는 중에도 동작이 같아야 구멍이 안 난다
    expect(noticeOf(rule("urgent"))).toBe(true);
  });

  it("등급 넷은 통지가 아니다 — 주사위가 부른다", () => {
    for (const g of ["normal", "rare", "unique", "hidden"]) {
      expect(noticeOf(rule(g))).toBe(false);
    }
  });

  it("통지는 등급 추첨에 안 든다 — 둘은 배타다", () => {
    expect(gradeOf(rule("notice"))).toBeNull();
    expect(gradeOf(rule("urgent"))).toBeNull();
  });
});

describe("상태 효과 — 세계를 바꾸는 열쇠", () => {
  it("목록이 둘이다 (`rosterMove` · `startGuarantee`)", () => {
    expect([...STATE_EFFECT_KEYS].sort()).toEqual(["rosterMove", "startGuarantee"]);
  });

  it("승강·선발보장을 상태 효과로 본다", () => {
    expect(stateEffectsOf({ rosterMove: "demote" })).toEqual(["rosterMove"]);
    expect(stateEffectsOf({ startGuarantee: { games: 3 } })).toEqual(["startGuarantee"]);
    expect(hasStateEffect({ rosterMove: "callup", startGuarantee: { games: 1 } })).toBe(true);
  });

  it("성장·사기·관계는 상태 효과가 아니다 — 이벤트가 줘도 되는 것들이다", () => {
    expect(
      hasStateEffect({
        moraleDelta: 5,
        xp: { command: 8 },
        relationDelta: { kind: "manager", delta: 6 },
      }),
    ).toBe(false);
    expect(hasStateEffect({})).toBe(false);
    expect(hasStateEffect(undefined)).toBe(false);
  });
});

// ── 결과 조건 ────────────────────────────────────────────────
const ctxWith = (
  outcomes: ProtagonistSave["recentOutcomes"],
  week: number,
  year: number | undefined,
): EventContext =>
  ({
    protagonist: { id: "P", recentOutcomes: outcomes } as unknown as ProtagonistSave,
    currentWeek: week,
    seasonYear: year,
    seasonPhase: "season",
    standings: [],
    stats: {},
    triggeredEvents: {},
  }) as unknown as EventContext;

describe("`outcome_within` — 「방금 그 일이 일어났나」", () => {
  const demoted = [{ kind: "demote" as const, year: 2028, week: 10 }];

  it("이번 주에 일어났으면 `weeks: 0` 으로 잡힌다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 0 },
        ctxWith(demoted, 10, 2028),
      ),
    ).toBe(true);
  });

  it("창 밖이면 거짓 — 「방금」이 아니다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 2 },
        ctxWith(demoted, 15, 2028),
      ),
    ).toBe(false);
  });

  it("🔴 시즌을 넘어도 센다 — 주차만 보면 W51 → W2 가 51주 전으로 보인다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 6 },
        ctxWith([{ kind: "demote", year: 2028, week: 50 }], 4, 2029),
      ),
    ).toBe(true);
  });

  it("다른 종류는 안 잡는다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "callup", weeks: 4 },
        ctxWith(demoted, 12, 2028),
      ),
    ).toBe(false);
  });

  it("기록이 없으면 거짓 — 구 세이브가 그렇고, 그게 맞다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 4 },
        ctxWith(undefined, 12, 2028),
      ),
    ).toBe(false);
  });

  it("⚠ 미래 기록은 안 잡는다 — 아직 안 일어난 일로 통지를 띄우면 안 된다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 8 },
        ctxWith([{ kind: "demote", year: 2029, week: 3 }], 40, 2028),
      ),
    ).toBe(false);
  });

  it("연도를 모르는 옛 경로에서는 같은 시즌만 본다 — 모르는 해를 지어내지 않는다", () => {
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 4 },
        ctxWith(demoted, 12, undefined),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { type: "outcome_within", outcome: "demote", weeks: 1 },
        ctxWith(demoted, 12, undefined),
      ),
    ).toBe(false);
  });
});

// ── 등판·출전 수 ─────────────────────────────────────────────
const statCtx = (g: number | undefined, gs = 0): EventContext =>
  ({
    protagonist: { id: "P" } as unknown as ProtagonistSave,
    currentWeek: 20,
    seasonPhase: "season",
    standings: [],
    stats:
      g === undefined
        ? {}
        : {
            P: {
              type: "pitcher",
              g,
              gs,
              ip: 0,
              er: 0,
              h: 0,
              k: 0,
              bb: 0,
              w: 0,
              l: 0,
              sv: 0,
              hd: 0,
              era: 0,
              whip: 0,
            },
          },
    triggeredEvents: {},
  }) as unknown as EventContext;

describe("`season_games_gte` — 「시즌에 몇 경기 뛰었나」", () => {
  it("등판 수를 그대로 본다", () => {
    expect(evaluateCondition({ type: "season_games_gte", value: 10 }, statCtx(12))).toBe(true);
    expect(evaluateCondition({ type: "season_games_gte", value: 10 }, statCtx(9))).toBe(false);
  });

  it("기록이 아예 없으면 거짓", () => {
    expect(evaluateCondition({ type: "season_games_gte", value: 1 }, statCtx(undefined))).toBe(
      false,
    );
  });

  it("`lte` 는 0 등판을 안 잡는다 — 안 뛴 것과 적게 뛴 것은 다르다", () => {
    expect(evaluateCondition({ type: "season_games_lte", value: 3 }, statCtx(0))).toBe(false);
    expect(evaluateCondition({ type: "season_games_lte", value: 3 }, statCtx(2))).toBe(true);
  });

  it("선발 등판은 `gs` 를 본다", () => {
    expect(evaluateCondition({ type: "season_starts_gte", value: 5 }, statCtx(20, 6))).toBe(true);
    expect(evaluateCondition({ type: "season_starts_gte", value: 5 }, statCtx(20, 2))).toBe(false);
  });
});
