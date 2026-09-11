import { describe, it, expect } from "vitest";
import { overseasOfferTeams, overseasFarmCutOfPower } from "../universityUtils";
import { firstTeamIdOf, farmTeamId } from "../ids";

/**
 * 해외 2군 직행 — 신청이 아니라 **구단 제안** (2026-09-02 · 사용자 확정).
 *
 * 문턱은 부모 1군 전력이다. refs 의 해외 `_2` 팀은 전부 ★3 이라 2군 전력으로
 * 보면 28팀이 문턱 78 하나에 몰려 0 아니면 28 이었다. 1군은 ★2~5 로 갈린다.
 */
describe("해외 2군 제안", () => {
  // 실측 분포 그대로 — ★2:2 · ★3:7 · ★4:12 · ★5:7
  const farms = [
    ...Array.from({ length: 2 }, (_, i) => ({ id: `TEAM_ABL_P2_${i}_2`, parentPower: 2 })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: `TEAM_ABL_P3_${i}_2`, parentPower: 3 })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `TEAM_JBL_P4_${i}_2`, parentPower: 4 })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: `TEAM_JBL_P5_${i}_2`, parentPower: 5 })),
  ];
  // 개인 점수를 넉넉히 줘서 OVR 축만 본다 (문턱 +4 면제 규칙과 무관하게)
  const SCORE = 100;

  it("문턱은 부모 전력에서 나온다 — ★2 75 · ★3 78 · ★4 81 · ★5 84", () => {
    expect(overseasFarmCutOfPower(2)).toBe(75);
    expect(overseasFarmCutOfPower(3)).toBe(78);
    expect(overseasFarmCutOfPower(4)).toBe(81);
    expect(overseasFarmCutOfPower(5)).toBe(84);
  });

  it("OVR 이 오를수록 제안 팀이 는다 — 실측 분포에서 2 · 9 · 21 · 28", () => {
    expect(overseasOfferTeams(75, SCORE, farms)).toHaveLength(2);
    expect(overseasOfferTeams(78, SCORE, farms)).toHaveLength(9);
    expect(overseasOfferTeams(81, SCORE, farms)).toHaveLength(21);
    expect(overseasOfferTeams(84, SCORE, farms)).toHaveLength(28);
    expect(overseasOfferTeams(74, SCORE, farms)).toHaveLength(0);
  });

  it("부모 전력을 모르면 가운데(★3) 로 본다 — 제안이 0 이 되지 않게", () => {
    const unknown = [{ id: "TEAM_X_2", parentPower: undefined }];
    expect(overseasOfferTeams(78, SCORE, unknown)).toEqual(["TEAM_X_2"]);
    expect(overseasOfferTeams(77, SCORE, unknown)).toEqual([]);
  });

  it("2군 → 1군 부모 id 는 farmTeamId 의 역이다", () => {
    expect(firstTeamIdOf("TEAM_ABL_X_2")).toBe("TEAM_ABL_X_1");
    expect(firstTeamIdOf("TEAM_ABL_X_1")).toBeNull();
    expect(farmTeamId(firstTeamIdOf("TEAM_ABL_X_2")!)).toBe("TEAM_ABL_X_2");
  });
});
