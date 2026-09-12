import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rookieStartsInFarm } from "../draftSystem";
import { farmTeamId, firstTeamIdOf } from "../ids";

/**
 * 🔴 **주인공만 규칙 밖이었다** (2026-09-12 · 사용자 확정 「신인은 2군 출발」).
 *
 * NPC 는 `npc_sim.rs apply_draft` 가 `pick.round <= first_team_rounds` 로
 * 1군/2군을 갈라 왔는데(`market.ts` 주석: 「드래프트가 매년 110명을 2군에
 * 넣는데 아무도 안 올라왔다」), 주인공은 `acceptDraftOffer` 가 **늘 1군으로
 * 열었다.** 12판에서 2군 도달이 3/12 뿐이었던 이유다.
 *
 * 여기서 지키는 것은 셋이다:
 *   ① 판정이 **문턱 값 하나**만 본다 — 코드에 숫자를 안 적는다
 *   ② 문턱 값은 **데이터가 정본**이고 Rust 도 같은 칸을 읽는다
 *   ③ 팜 팀 id 를 만드는 규칙이 왕복한다(`_1` ↔ `_2`)
 */
const RULES = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../../../resource/data/master/players/generation_rules.json"),
    "utf8",
  ),
) as { draftRules?: { rounds?: number; firstTeamRounds?: number } };

describe("신인 2군 출발 — NPC 와 같은 규칙", () => {
  it("문턱 이하는 1군 · 넘으면 2군", () => {
    expect(rookieStartsInFarm(1, 2)).toBe(false);
    expect(rookieStartsInFarm(2, 2)).toBe(false);
    expect(rookieStartsInFarm(3, 2)).toBe(true);
    expect(rookieStartsInFarm(11, 2)).toBe(true);
  });

  it("문턱 0 이면 전원 2군 — 데이터 주석과 같은 뜻이다", () => {
    for (const r of [1, 2, 5, 11]) expect(rookieStartsInFarm(r, 0)).toBe(true);
  });

  it("라운드를 모르면 1군이다 — 조용히 2군으로 떨어뜨리지 않는다", () => {
    expect(rookieStartsInFarm(null, 2)).toBe(false);
    expect(rookieStartsInFarm(undefined, 2)).toBe(false);
  });

  it("🔴 문턱 값의 정본은 데이터다 — 코드에 숫자가 없다", () => {
    const n = RULES.draftRules?.firstTeamRounds;
    expect(n, "generation_rules.json draftRules.firstTeamRounds 가 없다").toBeTypeOf("number");
    // 라운드 수보다 크면 전원 1군이라 2군이 죽은 무대가 된다
    expect(n).toBeLessThan(RULES.draftRules?.rounds ?? 11);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("팜 팀 id 가 왕복한다 — 내려간 자리에서 되올라올 수 있다", () => {
    const first = "TEAM_KBL_SEOUL_1";
    const farm = farmTeamId(first);
    expect(farm).toBe("TEAM_KBL_SEOUL_2");
    expect(firstTeamIdOf(farm!)).toBe(first);
    // 1·2군이 없는 무대는 짝이 없다 — 고교·대학·독립
    expect(farmTeamId("TEAM_HS_AEWOL")).toBeNull();
  });
});
