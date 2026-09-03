import { describe, it, expect } from "vitest";
import { migrateContract, migrateProtagonist, DEFAULT_PROTAGONIST } from "../game";
import type { ProContract, ProtagonistSave } from "../../types/save";

/**
 * 옛 계약의 **죽은 인센티브를 비운다** (PLAN_CONTRACT_TERMS §4-1 · 1.1 C③).
 *
 * 예전 타입은 `{ condition: string; bonus: number }` 였다. 문자열이라 기계가
 * 판정할 수 없었고 **채우는 코드가 0건**이었다 — 타입에만 있고 값이 없는 필드였다.
 *
 * 🔴 **세이브를 지우거나 되돌리지 않는다.** 계약 자체는 그대로 두고
 * `incentives` 배열에서 새 모양이 아닌 항목만 뺀다.
 */

const NEW: ProContract["incentives"] = [{ kind: "games", threshold: 25, bonus: 1500 }];

function contract(over: Partial<ProContract> = {}): ProContract {
  return {
    teamId: "TEAM_KBL_1", leagueId: "LEAGUE_KBL",
    salary: 18000, durationYears: 2, remainingYears: 2, signingBonus: 0,
    teamOptionYears: 0, playerOptionYears: 0, noTrade: false,
    status: "active", ...over,
  };
}

describe("migrateContract", () => {
  it("옛 {condition} 인센티브는 필드째 사라진다", () => {
    const old = contract({
      incentives: [{ condition: "25등판", bonus: 1500 }] as unknown as ProContract["incentives"],
    });
    const out = migrateContract(old)!;
    expect("incentives" in out).toBe(false);
  });

  it("계약의 나머지는 그대로다 — 되돌리지 않는다", () => {
    const old = contract({
      salary: 21000, noTrade: true, teamOptionYears: 1,
      incentives: [{ condition: "10승", bonus: 2000 }] as unknown as ProContract["incentives"],
    });
    const out = migrateContract(old)!;
    expect(out.salary).toBe(21000);
    expect(out.noTrade).toBe(true);
    expect(out.teamOptionYears).toBe(1);
    expect(out.status).toBe("active");
  });

  it("새 모양은 그대로 남는다 — 대조군", () => {
    const out = migrateContract(contract({ incentives: NEW }))!;
    expect(out.incentives).toEqual(NEW);
  });

  it("섞여 있으면 새 모양만 남는다", () => {
    const mixed = [
      { condition: "25등판", bonus: 1500 },
      { kind: "era", threshold: 3, bonus: 3000 },
    ] as unknown as ProContract["incentives"];
    const out = migrateContract(contract({ incentives: mixed }))!;
    expect(out.incentives).toHaveLength(1);
    expect(out.incentives![0].kind).toBe("era");
  });

  it("인센티브가 없던 계약은 손대지 않는다", () => {
    const c = contract();
    expect(migrateContract(c)).toBe(c);
  });

  it("배열이 아닌 값(깨진 세이브)도 견딘다", () => {
    const broken = contract({ incentives: "25등판" as unknown as ProContract["incentives"] });
    const out = migrateContract(broken)!;
    expect("incentives" in out).toBe(false);
  });

  it("계약이 없으면 undefined 그대로다 — 빈 계약을 지어내지 않는다", () => {
    expect(migrateContract(undefined)).toBeUndefined();
  });
});

describe("migrateProtagonist 가 두 계약을 다 훑는다", () => {
  const oldInc = [{ condition: "150이닝", bonus: 2500 }] as unknown as ProContract["incentives"];

  function save(over: Partial<ProtagonistSave>): ProtagonistSave {
    return { ...DEFAULT_PROTAGONIST, ...over };
  }

  it("contract 를 비운다", () => {
    const p = migrateProtagonist(save({ contract: contract({ incentives: oldInc }) }));
    expect("incentives" in p.contract!).toBe(false);
  });

  it("pendingNextContract 도 비운다 — W52 에 적용될 계약이 그냥 지나가면 안 된다", () => {
    const p = migrateProtagonist(save({ pendingNextContract: contract({ incentives: oldInc }) }));
    expect("incentives" in p.pendingNextContract!).toBe(false);
  });

  it("계약이 없는 세이브(고교·대학)는 그대로다", () => {
    const p = migrateProtagonist(save({}));
    expect(p.contract).toBeUndefined();
    expect(p.pendingNextContract).toBeUndefined();
  });
});
