import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateCondition } from "../conditionEvaluator";
import type { EventContext } from "../../types/event";

/**
 * 관계도 조건이 값을 **받는가**.
 *
 * 🔴 조건(`relation_gte`/`relation_lte`)과 평가기는 트랙 B가 만들어 뒀는데
 *    `EventContext.relations`를 채우는 코드가 없어 **항상 false**였다.
 *    이벤트가 안 떠도 로그 한 줄 안 남는 종류다.
 *
 * ⚠ 이 프로젝트가 반복해 밟는 형태다 — *한쪽은 넘기는데 한쪽이 안 받는다.*
 *   결정성 여덟 자리 중 넷이 그랬고, 상무 Phase 1도 `&[]`가 박혀 있었다.
 */
const ADVANCE = readFileSync(join(__dirname, "../../usecases/advanceWeek.ts"), "utf8");

const ctx = (relations: unknown[]): EventContext => ({ relations }) as unknown as EventContext;

describe("관계도 조건 배선", () => {
  it("advanceWeek가 relations를 조회한다", () => {
    expect(ADVANCE, "getRelationships 호출이 없다 — 조건이 항상 false가 된다").toMatch(
      /getRelationships\(/,
    );
  });

  it("조회한 값을 EventContext에 싣는다", () => {
    expect(ADVANCE, "relations를 컨텍스트에 안 실으면 조회해도 소용이 없다").toMatch(
      /relations:\s*relRows/,
    );
  });
});

describe("evaluateCondition — relation", () => {
  const cond = { type: "relation_gte", kind: "coach", value: 50 } as const;

  it("relations가 비면 false다 (배선이 없던 때의 동작)", () => {
    expect(evaluateCondition(cond, ctx([]))).toBe(false);
  });

  it("값이 실리면 실제로 판정한다", () => {
    expect(evaluateCondition(cond, ctx([{ kind: "coach", value: 60 }]))).toBe(true);
    expect(evaluateCondition(cond, ctx([{ kind: "coach", value: 40 }]))).toBe(false);
  });

  it("여러 명이면 **가장 높은** 값을 본다", () => {
    expect(
      evaluateCondition(
        cond,
        ctx([
          { kind: "coach", value: 10 },
          { kind: "coach", value: 70 },
        ]),
      ),
    ).toBe(true);
  });

  it("다른 kind는 안 센다", () => {
    expect(evaluateCondition(cond, ctx([{ kind: "manager", value: 99 }]))).toBe(false);
  });

  it("relation_lte는 **가장 낮은** 값을 본다", () => {
    const lte = { type: "relation_lte", kind: "coach", value: 20 } as const;
    expect(
      evaluateCondition(
        lte,
        ctx([
          { kind: "coach", value: 90 },
          { kind: "coach", value: 10 },
        ]),
      ),
    ).toBe(true);
  });
});
