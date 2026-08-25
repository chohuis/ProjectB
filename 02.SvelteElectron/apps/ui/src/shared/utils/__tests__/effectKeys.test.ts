import { describe, it, expect } from "vitest";
import { parseEffectsArray } from "../../stores/master";

/**
 * **문자열형 보상이 돈·관계·사치품을 못 실었다.**
 *
 * 선택지 597개 중 **571개는 객체형**이라 `{ moneyDelta: -120 }`을 그대로 쓴다.
 * 문자열형 **26개**만 못 썼다 — 파서가 `condition`·`fatigue`·`morale`·`fame`·
 * `popularity`·`diligence`·`addTag`·`xp.*`·`stat.*`만 알았다.
 *
 * ⚠ **그래서 이건 막힘이 아니었다.** `moneyDelta`·`relationDelta`·`luxurySpend`가
 * 데이터에서 0건인 건 쓸 수단이 없어서가 아니라 아무도 안 썼기 때문이다.
 *
 * ⚠ **모르는 키는 조용히 버려진다.** 조건 쪽엔 `assertConditions`가 있어
 * 로드에서 던지는데 보상 쪽엔 그게 없다 — 게이트는 `check:effectkeys`다.
 */
describe("문자열형 보상 키", () => {
  it("예전부터 되던 것", () => {
    expect(parseEffectsArray(["condition:-4", "fatigue:+5", "morale:+8"]))
      .toEqual({ conditionDelta: -4, fatigueDelta: 5, moraleDelta: 8 });
    expect(parseEffectsArray(["xp.command:+2"])).toEqual({ xp: { command: 2 } });
  });

  it("타격 XP — 접두사가 대상을 가른다", () => {
    expect(parseEffectsArray(["xp.batting.contact:+2"]))
      .toEqual({ xp: { "batting.contact": 2 } });
  });

  it("돈 — 단위는 만원이다", () => {
    expect(parseEffectsArray(["money:-120"])).toEqual({ moneyDelta: -120 });
    expect(parseEffectsArray(["money:+25"])).toEqual({ moneyDelta: 25 });
  });

  it("관계 — 다섯 종류만 받는다", () => {
    expect(parseEffectsArray(["relation.manager:+8"]))
      .toEqual({ relationDelta: { kind: "manager", delta: 8 } });
    expect(parseEffectsArray(["relation.teammate:-3"]))
      .toEqual({ relationDelta: { kind: "teammate", delta: -3 } });
  });

  /** 🔴 오타 하나면 관계가 **조용히** 안 움직인다. 아는 종류만 받는다 */
  it("🔴 모르는 관계 종류는 안 받는다", () => {
    expect(parseEffectsArray(["relation.manger:+8"])).toEqual({});
    expect(parseEffectsArray(["relation.friend:+8"])).toEqual({});
  });

  it("사치품 — 자기 소비와 동료 소비가 갈린다", () => {
    expect(parseEffectsArray(["luxury:400"]))
      .toEqual({ luxurySpend: { cost: 400, onTeammate: false } });
    expect(parseEffectsArray(["luxury.teammate:150"]))
      .toEqual({ luxurySpend: { cost: 150, onTeammate: true } });
  });

  /**
   * ⚠ `luxurySpend`는 **금액을 스스로 뺀다**(`decisions.ts`). `money`를 같이
   * 적으면 두 번 빠진다. 파서는 둘 다 실어주므로 **저작 규칙으로 막는다**
   */
  it("사치품과 돈을 같이 적으면 둘 다 실린다 — 저작에서 막을 것", () => {
    const fx = parseEffectsArray(["luxury:400", "money:-400"]);
    expect(fx.luxurySpend).toBeDefined();
    expect(fx.moneyDelta).toBe(-400);   // 이러면 800이 빠진다
  });

  it("모르는 키는 조용히 버린다 — 그래서 check:effectkeys가 있다", () => {
    expect(parseEffectsArray(["없는키:+5"])).toEqual({});
    expect(parseEffectsArray(["콜론없음"])).toEqual({});
  });
});
