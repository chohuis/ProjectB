import { describe, it, expect } from "vitest";
import { careerSummaryOf, inningsToOuts } from "../careerSummary";
import type { CareerSeasonRecord } from "../../types/save";

const rec = (year: number, ip: number, er: number, w: number, l: number): CareerSeasonRecord => ({
  year, leagueId: "LEAGUE_KBL", teamId: "TEAM_KBL_DAEJEON_PHANTOMS_1",
  statLine: "", ovr: 80, awards: [],
  stats: {
    type: "pitcher", g: 20, gs: 20, w, l, sv: 0, hd: 0,
    ip, er, h: 0, k: 0, bb: 0, era: 0, whip: 0,
  },
});

describe("이닝 → 아웃", () => {
  it("소수부는 3분의 1이다", () => {
    expect(inningsToOuts(6)).toBe(18);
    expect(inningsToOuts(6.1)).toBe(19);
    expect(inningsToOuts(6.2)).toBe(20);
  });
  it("부동소수 오차를 흡수한다", () => {
    expect(inningsToOuts(92.19999999)).toBe(278);   // 92 + 2/3
  });
  it("소수부 3 이상은 무시한다 (야구 표기가 아니다)", () => {
    expect(inningsToOuts(6.5)).toBe(18);
  });
});

describe("통산 요약", () => {
  it("승·패·시즌을 합친다", () => {
    const s = careerSummaryOf([rec(2030, 150, 60, 11, 6), rec(2031, 168, 50, 14, 6)]);
    expect(s.w).toBe(25);
    expect(s.l).toBe(12);
    expect(s.seasons).toBe(2);
  });

  it("ERA는 시즌 평균이 아니라 자책·이닝 합으로 낸다", () => {
    // ⚠ 5이닝 9자책(ERA 16.20) + 180이닝 60자책(ERA 3.00)
    //   시즌 평균이면 9.60 — 데뷔 한 경기가 통산을 통째로 흔든다.
    //   합산이면 (69 × 9) / 185 = 3.36이 맞다.
    const s = careerSummaryOf([rec(2029, 5, 9, 0, 1), rec(2030, 180, 60, 14, 8)]);
    expect(s.era).toBe("3.36");
  });

  it("이닝 소수부를 야구식으로 더한다", () => {
    // 92.2 + 0.2 = 93.1 (아웃 278 + 2 = 280 = 93과 1/3)
    const s = careerSummaryOf([rec(2030, 92.2, 30, 8, 4), rec(2031, 0.2, 0, 0, 0)]);
    // 30자책 × 9 / (280/3) = 2.89
    expect(s.era).toBe("2.89");
  });

  it("기록이 없으면 ERA가 빈 문자열이다", () => {
    expect(careerSummaryOf([]).era).toBe("");
    expect(careerSummaryOf([]).seasons).toBe(0);
  });

  it("타자 기록은 세지 않는다", () => {
    const batter = {
      ...rec(2030, 0, 0, 0, 0),
      stats: { type: "batter", g: 1, pa: 4, ab: 4, h: 1, hr: 0, rbi: 0, sb: 0,
               bb: 0, k: 1, avg: 0.25, obp: 0.25, slg: 0.25, ops: 0.5 },
    } as unknown as CareerSeasonRecord;
    expect(careerSummaryOf([batter]).seasons).toBe(0);
  });
});
