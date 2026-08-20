import { describe, it, expect } from "vitest";
import { DEFAULT_LEAGUE_CONFIGS, ALL_TEAMS_BY_LEAGUE } from "../leagueScheduler";

/**
 * 리그별 팀당 경기 수가 **실제 리그와 맞는가** (CALENDAR_V2.md).
 *
 * 🔴 차수(`cycles`)만 보면 팀당 경기가 안 보인다 — 팀 수에 따라 달라지기
 * 때문이다. 실제로 `cycles`를 11로 통일했더니 **ABL 2군이 1군보다 많아졌다**
 * (16팀 × 11 = 165 vs 1군 150). 여기서 팀당 경기로 환산해 못박는다.
 *
 * ⚠ **숫자를 여기 베껴 적는 게 아니라 근거를 같이 둔다.** 근거가 없으면
 * 나중에 값을 바꿀 때 검사도 같이 바꿔서 아무것도 못 잡는다.
 */

/** 팀당 경기 = (팀 수 − 1) × 차수 */
function perTeam(leagueId: string): number {
  const cfg = DEFAULT_LEAGUE_CONFIGS.find((c) => c.leagueId === leagueId);
  if (!cfg) throw new Error(`${leagueId} 설정이 없다`);
  return (cfg.teams.length - 1) * cfg.cycles;
}

describe("1군 경기 수가 실제 리그와 같다", () => {
  it("KBL 144 — KBO와 같다", () => {
    expect(perTeam("LEAGUE_KBL")).toBe(144);
  });

  it("JBL 143 — NPB와 같다", () => {
    expect(perTeam("LEAGUE_JBL")).toBe(143);
  });

  it("ABL 150 — MLB(30팀 162)를 16팀으로 축소한 값", () => {
    // 16팀이면 상대가 15명이라 162를 채우려면 10.8차전이다. 10차전이 가장 가깝다
    expect(perTeam("LEAGUE_ABL")).toBe(150);
    // 실제 MLB 162와의 차이가 10% 안이어야 "축소판"이라 부를 수 있다
    expect(Math.abs(150 - 162) / 162).toBeLessThan(0.1);
  });
});

describe("2군은 1군보다 적게 뛴다", () => {
  const PAIRS: Array<[string, string]> = [
    ["LEAGUE_KBL", "LEAGUE_KBL_FARM"],
    ["LEAGUE_ABL", "LEAGUE_ABL_FARM"],
    ["LEAGUE_JBL", "LEAGUE_JBL_FARM"],
  ];

  it.each(PAIRS)("%s 2군이 1군보다 적다", (first, farm) => {
    const a = perTeam(first), b = perTeam(farm);
    expect(b, `1군 ${a} · 2군 ${b}`).toBeLessThan(a);
  });

  it("2군 비율이 1군의 0.6~0.9 사이다", () => {
    // 너무 적으면 승강할 자리가 없고, 너무 많으면 2군이 더 혹사당한다
    for (const [first, farm] of PAIRS) {
      const r = perTeam(farm) / perTeam(first);
      expect(r, `${farm} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(0.6);
      expect(r, `${farm} = ${r.toFixed(2)}`).toBeLessThanOrEqual(0.9);
    }
  });
});

describe("설정이 팀 목록과 어긋나지 않는다", () => {
  it.each(DEFAULT_LEAGUE_CONFIGS.map((c) => c.leagueId))(
      "%s 설정의 팀이 ALL_TEAMS_BY_LEAGUE와 같다", (lid) => {
    const cfg = DEFAULT_LEAGUE_CONFIGS.find((c) => c.leagueId === lid)!;
    expect(cfg.teams.length).toBe((ALL_TEAMS_BY_LEAGUE[lid] ?? []).length);
  });

  it("팀 수가 짝수다 — 홀수면 매 경기일에 한 팀이 논다", () => {
    for (const c of DEFAULT_LEAGUE_CONFIGS) {
      expect(c.teams.length % 2, `${c.leagueId} ${c.teams.length}팀`).toBe(0);
    }
  });
});
