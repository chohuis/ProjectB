import { describe, it, expect } from "vitest";
import { overseasFarmCutOfPower, passesOverseasFarm, indieCutOfPower } from "../universityUtils";

/**
 * 아마추어 → 해외 2군 직행 (실플 ②, 사용자 확정 2026-08-27).
 *
 * 🔴 문턱은 **OVR 78 + 대회 성적**이다. 고교 졸업 시 주인공 OVR은 보통
 *   68~75라 **잘 키워야 닿는다.**
 *
 * ⚠ 해외 2군 실측(2026-08-27): ABL 2군 팀 평균 **66** · JBL 2군 **63**.
 *   OVR 78이면 압도적이다 — 빨리 올라가라고 여는 문이다.
 */

describe("해외 2군 직행", () => {
  it("사용자 확정선이 평범한 팀(★3) 기준 78이다", () => {
    expect(overseasFarmCutOfPower(3)).toBe(78);
  });

  // ⚠ `indieCutOfPower`와 같은 축이라야 두 자리가 같게 읽힌다
  it("★이 셀수록 어렵다 — 독립리그와 같은 방향이다", () => {
    const cuts = [1, 2, 3, 4, 5].map(overseasFarmCutOfPower);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i], `★${i + 1}`).toBeGreaterThanOrEqual(cuts[i - 1]);
    }
    const indie = [1, 2, 3, 4, 5].map(indieCutOfPower);
    for (let i = 1; i < indie.length; i++) {
      expect(indie[i]).toBeGreaterThanOrEqual(indie[i - 1]);
    }
  });

  // 🔴 해외가 독립보다 쉬우면 아무도 독립에 안 간다
  it("어느 ★에서도 독립리그보다 어렵다", () => {
    for (const p of [1, 2, 3, 4, 5]) {
      expect(overseasFarmCutOfPower(p), `★${p}`).toBeGreaterThan(indieCutOfPower(p));
    }
  });

  it("문턱 미달이면 대회를 아무리 잘해도 못 간다", () => {
    expect(passesOverseasFarm(70, 500, 3)).toBe(false);
  });

  it("문턱을 넘고 대회 성적이 있으면 간다", () => {
    expect(passesOverseasFarm(78, 40, 3)).toBe(true);
  });

  // ⚠ 약팀에서 대회를 못 나간 좋은 투수를 통째로 묻으면 안 된다
  it("실력이 충분히 위면 대회 성적을 면제한다", () => {
    expect(passesOverseasFarm(78, 0, 3)).toBe(false);
    expect(passesOverseasFarm(82, 0, 3)).toBe(true);
  });

  it("★5 팀은 더 어렵다", () => {
    expect(passesOverseasFarm(79, 100, 5)).toBe(false);
    expect(passesOverseasFarm(79, 100, 3)).toBe(true);
  });

  // `isOverseasFarmTeam` 검사는 2026-09-02 에 지웠다 — refs 의 2군은 leagueId 가 1군 리그라 그 함수가 틀린 잣대였다.
  // 2군 소속의 정본은 ALL_TEAMS_BY_LEAGUE[…_FARM] · overseasWiring.test 가 그 배선을 본다.

  /**
   * 🔴 **드래프트를 대체하면 안 된다.** 고교 졸업 OVR이 보통 68~75인데
   *   문턱이 그 아래면 잘 키운 선수가 전부 해외로 샌다.
   */
  it("고교 졸업 평균(68~75)으로는 못 간다", () => {
    for (const ovr of [68, 71, 75]) {
      expect(passesOverseasFarm(ovr, 200, 3), `OVR ${ovr}`).toBe(false);
    }
  });
});
