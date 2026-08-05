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

// ── 은퇴 결산 (U9-d) ──────────────────────────────────────────────

import {
  careerTotalsOf, careerHighsOf, teamStintsOf, awardTallyOf, titleCountOf, outsToInnings,
} from "../careerSummary";
import type { CareerAward } from "../../types/save";

/** 투수 시즌 한 줄 */
const P = (
  year: number,
  o: Partial<{ ip: number; er: number; w: number; l: number; sv: number; hd: number;
               k: number; bb: number; h: number; g: number; gs: number; era: number;
               ovr: number; teamId: string; awards: CareerAward[];
               psResult: CareerSeasonRecord["psResult"] }> = {},
): CareerSeasonRecord => ({
  year, leagueId: "LEAGUE_KBL", teamId: o.teamId ?? "TEAM_KBL_A_1",
  statLine: "", ovr: o.ovr ?? 80, awards: o.awards ?? [],
  ...(o.psResult ? { psResult: o.psResult } : {}),
  stats: {
    type: "pitcher", g: o.g ?? 25, gs: o.gs ?? 25, w: o.w ?? 0, l: o.l ?? 0,
    sv: o.sv ?? 0, hd: o.hd ?? 0, ip: o.ip ?? 0, er: o.er ?? 0,
    h: o.h ?? 0, k: o.k ?? 0, bb: o.bb ?? 0, era: o.era ?? 0, whip: 0,
  },
});

/** 타자 시즌 한 줄 */
const B = (
  year: number,
  o: Partial<{ ab: number; h: number; hr: number; rbi: number; pa: number;
               bb: number; slg: number; avg: number; teamId: string }> = {},
): CareerSeasonRecord => ({
  year, leagueId: "LEAGUE_KBL", teamId: o.teamId ?? "TEAM_KBL_A_1",
  statLine: "", ovr: 80, awards: [],
  stats: {
    type: "batter", g: 100, pa: o.pa ?? 0, ab: o.ab ?? 0, h: o.h ?? 0,
    hr: o.hr ?? 0, rbi: o.rbi ?? 0, sb: 0, bb: o.bb ?? 0, k: 0,
    avg: o.avg ?? 0, obp: 0, slg: o.slg ?? 0, ops: 0,
  },
});

describe("아웃 → 이닝", () => {
  it("이닝 표기로 되돌린다", () => {
    expect(outsToInnings(280)).toBeCloseTo(93.1, 5);
    expect(outsToInnings(18)).toBe(6);
    expect(outsToInnings(20)).toBeCloseTo(6.2, 5);
  });
  it("왕복해도 그대로다", () => {
    for (const ip of [0, 5, 6.1, 6.2, 92.2, 180.1]) {
      expect(outsToInnings(inningsToOuts(ip))).toBeCloseTo(ip, 5);
    }
  });
});

describe("통산 합산", () => {
  it("이닝을 아웃으로 더한다 — 92.2 + 0.2는 92.4가 아니라 93.1이다", () => {
    const t = careerTotalsOf([P(2030, { ip: 92.2 }), P(2031, { ip: 0.2 })]);
    expect(t.pitching!.ip).toBeCloseTo(93.1, 5);
  });

  it("ERA는 시즌 ERA의 평균이 아니라 합의 비율이다", () => {
    // 5이닝 9자책(ERA 16.20)과 180이닝 40자책(ERA 2.00).
    // 평균으로 내면 9.10이지만 실제 통산은 49*9/185 = 2.38이다
    const t = careerTotalsOf([
      P(2030, { ip: 5, er: 9, era: 16.2 }),
      P(2031, { ip: 180, er: 40, era: 2.0 }),
    ]);
    expect(t.pitching!.era).toBe("2.38");
  });

  it("WHIP도 같은 방식이다", () => {
    const t = careerTotalsOf([P(2030, { ip: 100, h: 90, bb: 30 })]);
    expect(t.pitching!.whip).toBe("1.20");
  });

  it("장타율은 타수로 가중된다 — 시즌 SLG의 평균이 아니다", () => {
    // 400타수 .500(200루타) + 20타수 1.000(20루타) = 220/420 = .524.
    // 단순 평균이면 .750이 된다
    const t = careerTotalsOf([
      B(2030, { ab: 400, slg: 0.5 }),
      B(2031, { ab: 20,  slg: 1.0 }),
    ]);
    expect(t.batting!.slg).toBe(".524");
  });

  it("투수 커리어엔 타격 블록이 없다", () => {
    const t = careerTotalsOf([P(2030, { ip: 100 })]);
    expect(t.batting).toBeNull();
    expect(t.pitching).not.toBeNull();
  });

  it("이도류는 양쪽 다 나온다", () => {
    const t = careerTotalsOf([P(2030, { ip: 100 }), B(2030, { ab: 300, h: 90 })]);
    expect(t.pitching).not.toBeNull();
    expect(t.batting).not.toBeNull();
  });

  it("첫 해·마지막 해는 입력 순서와 무관하다", () => {
    const t = careerTotalsOf([P(2035), P(2030), P(2033)]);
    expect(t.firstYear).toBe(2030);
    expect(t.lastYear).toBe(2035);
  });

  it("기록이 없으면 조용히 빈다 — 0으로 채우지 않는다", () => {
    const t = careerTotalsOf([]);
    expect(t.pitching).toBeNull();
    expect(t.batting).toBeNull();
    expect(t.firstYear).toBeNull();
    expect(t.seasons).toBe(0);
  });

  it("이닝이 0이면 ERA를 만들어내지 않는다", () => {
    const t = careerTotalsOf([P(2030, { ip: 0, er: 0 })]);
    expect(t.pitching!.era).toBe("-");
  });
});

describe("커리어 하이", () => {
  const key = (hs: ReturnType<typeof careerHighsOf>, k: string) => hs.find((h) => h.key === k);

  it("최고 시즌과 그 해를 집는다", () => {
    const hs = careerHighsOf([P(2030, { w: 8 }), P(2031, { w: 17 }), P(2032, { w: 12 })]);
    expect(key(hs, "w")!.value).toBe("17승");
    expect(key(hs, "w")!.year).toBe(2031);
  });

  it("동률이면 먼저 한 해를 남긴다", () => {
    const hs = careerHighsOf([P(2030, { w: 15 }), P(2033, { w: 15 })]);
    expect(key(hs, "w")!.year).toBe(2030);
  });

  it("ERA는 이닝이 충분한 시즌만 본다 — 3이닝 무실점이 커리어 하이가 되면 안 된다", () => {
    const hs = careerHighsOf([
      P(2030, { ip: 3,   er: 0,  era: 0.0 }),
      P(2031, { ip: 180, er: 44, era: 2.20 }),
    ]);
    expect(key(hs, "era")!.value).toBe("2.20");
    expect(key(hs, "era")!.year).toBe(2031);
  });

  it("타율도 타수가 충분한 시즌만 본다", () => {
    const hs = careerHighsOf([
      B(2030, { ab: 10,  avg: 0.600 }),
      B(2031, { ab: 500, avg: 0.312 }),
    ]);
    expect(key(hs, "avg")!.value).toBe(".312");
  });

  it("0인 항목은 자랑거리로 안 내건다", () => {
    const hs = careerHighsOf([P(2030, { w: 5, sv: 0 })]);
    expect(key(hs, "sv")).toBeUndefined();
    expect(key(hs, "w")).toBeDefined();
  });

  it("투수는 타격 항목이 안 나온다", () => {
    const hs = careerHighsOf([P(2030, { w: 10 })]);
    expect(key(hs, "hr")).toBeUndefined();
    expect(key(hs, "rbi")).toBeUndefined();
  });

  it("OVR은 stats 밖에 있는데도 잡힌다", () => {
    const hs = careerHighsOf([P(2030, { ovr: 71 }), P(2031, { ovr: 88 })]);
    expect(key(hs, "ovr")!.value).toBe("88");
    expect(key(hs, "ovr")!.year).toBe(2031);
  });

  it("빈 커리어면 빈 목록", () => {
    expect(careerHighsOf([])).toEqual([]);
  });
});

describe("팀 이력", () => {
  it("연속으로 뛴 해를 한 구간으로 묶는다", () => {
    const s = teamStintsOf([
      P(2030, { teamId: "TEAM_A" }), P(2031, { teamId: "TEAM_A" }), P(2032, { teamId: "TEAM_A" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ teamId: "TEAM_A", fromYear: 2030, toYear: 2032, seasons: 3 });
  });

  it("같은 팀에 두 번 갔다 오면 구간이 둘이다 — 합치면 그 사이 이적이 사라진다", () => {
    const s = teamStintsOf([
      P(2030, { teamId: "TEAM_A" }), P(2031, { teamId: "TEAM_B" }), P(2032, { teamId: "TEAM_A" }),
    ]);
    expect(s.map((x) => x.teamId)).toEqual(["TEAM_A", "TEAM_B", "TEAM_A"]);
  });

  it("입력 순서가 뒤죽박죽이어도 연도순으로 묶는다", () => {
    const s = teamStintsOf([
      P(2032, { teamId: "TEAM_B" }), P(2030, { teamId: "TEAM_A" }), P(2031, { teamId: "TEAM_A" }),
    ]);
    expect(s.map((x) => x.teamId)).toEqual(["TEAM_A", "TEAM_B"]);
    expect(s[0].seasons).toBe(2);
  });

  it("공백기(군 복무 등)가 있으면 구간을 나눈다", () => {
    const s = teamStintsOf([P(2030, { teamId: "TEAM_A" }), P(2033, { teamId: "TEAM_A" })]);
    expect(s).toHaveLength(2);
  });
});

describe("수상 · 우승", () => {
  const mvp: CareerAward = { id: "MVP", label: "MVP" };
  const gg: CareerAward = { id: "GG", label: "골든글러브" };

  it("같은 상은 묶고 횟수를 센다", () => {
    const t = awardTallyOf([
      P(2030, { awards: [mvp] }), P(2031, { awards: [mvp, gg] }), P(2032, { awards: [mvp] }),
    ]);
    expect(t[0]).toMatchObject({ id: "MVP", count: 3 });
    expect(t[0].years).toEqual([2030, 2031, 2032]);
  });

  it("많이 받은 상이 앞에 온다", () => {
    const t = awardTallyOf([P(2030, { awards: [mvp, gg] }), P(2031, { awards: [gg] })]);
    expect(t[0].id).toBe("GG");
  });

  it("우승·준우승을 센다", () => {
    const t = titleCountOf([
      P(2030, { psResult: "champion" }),
      P(2031, { psResult: "runnerUp" }),
      P(2032, { psResult: "champion" }),
      P(2033, { psResult: "notQualified" }),
    ]);
    expect(t.champion).toBe(2);
    expect(t.runnerUp).toBe(1);
    expect(t.championYears).toEqual([2030, 2032]);
  });

  it("수상도 우승도 없으면 빈 상태다", () => {
    expect(awardTallyOf([P(2030)])).toEqual([]);
    expect(titleCountOf([P(2030)])).toMatchObject({ champion: 0, runnerUp: 0 });
  });
});
