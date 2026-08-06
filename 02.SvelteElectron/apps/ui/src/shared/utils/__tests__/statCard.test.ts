import { describe, it, expect } from "vitest";
import { batterBars, seasonLines, seasonStatsOf } from "../statCard";
import type { BatterSeasonStats, PitcherSeasonStats } from "../../types/save";

const bat = (o: Partial<BatterSeasonStats> = {}): BatterSeasonStats => ({
  type: "batter", g: 40, pa: 170, ab: 150, h: 45, hr: 6, rbi: 28, sb: 3, bb: 18, k: 30,
  avg: 0.3, obp: 0.38, slg: 0.48, ops: 0.86, ...o,
});

const pit = (o: Partial<PitcherSeasonStats> = {}): PitcherSeasonStats => ({
  type: "pitcher", g: 12, gs: 12, w: 6, l: 3, sv: 0, hd: 0,
  ip: 74.1, er: 21, h: 62, k: 71, bb: 20, era: 2.54, whip: 1.1, ...o,
});

describe("타자 능력치 막대", () => {
  it("엔진이 보내던 열 개 중 타석에서 의미 있는 다섯을 쓴다", () => {
    const bars = batterBars({
      contact: 65, power: 54, eye: 63, discipline: 58,
      battingClutch: 71, platoon: 50, speed: 44, baseInstinct: 52,
      fielding: 60, arm: 55,
    });
    expect(bars.map((b) => b.label)).toEqual(["컨택", "파워", "선구", "클러치", "주력"]);
    expect(bars.map((b) => b.value)).toEqual([65, 54, 63, 71, 44]);
  });

  it("⚠ 없는 항목은 빼고 넘긴다 — 50으로 채우면 화면이 값을 지어내는 것이다", () => {
    const bars = batterBars({ contact: 65, power: 54, eye: 63 });
    expect(bars.map((b) => b.label)).toEqual(["컨택", "파워", "선구"]);
  });

  it("숫자가 아니면 버린다", () => {
    const bars = batterBars({ contact: NaN, power: 54, eye: null, battingClutch: undefined });
    expect(bars.map((b) => b.label)).toEqual(["파워"]);
  });

  it("없으면 빈 배열", () => {
    expect(batterBars(null)).toEqual([]);
    expect(batterBars(undefined)).toEqual([]);
  });
});

describe("카드 뒷면 — 시즌 성적", () => {
  it("타자", () => {
    const l = seasonLines(bat());
    expect(l.map((x) => x.label)).toEqual(["타율", "OPS", "홈런", "타점", "경기"]);
    expect(l[0].value).toBe(".300");
    expect(l[1].value).toBe(".860");
  });

  it("투수", () => {
    const l = seasonLines(pit());
    expect(l.map((x) => x.label)).toEqual(["ERA", "WHIP", "이닝", "탈삼진", "경기"]);
    expect(l[0].value).toBe("2.54");
    expect(l[2].value).toBe("74.1");
  });

  it("⚠ 타석이 0이면 아무것도 안 준다 — 타율 .000은 거짓이다", () => {
    expect(seasonLines(bat({ pa: 0, ab: 0, h: 0, avg: 0, ops: 0, g: 0 }))).toEqual([]);
  });

  it("⚠ 등판이 0이면 아무것도 안 준다 — ERA 0.00은 거짓이다", () => {
    expect(seasonLines(pit({ g: 0, ip: 0, era: 0 }))).toEqual([]);
  });

  it("타석은 섰는데 타수가 0이면(볼넷만) 비율은 '-'", () => {
    const l = seasonLines(bat({ pa: 4, ab: 0, h: 0, avg: 0, ops: 0 }));
    expect(l[0]).toEqual({ label: "타율", value: "-" });
    expect(l[1]).toEqual({ label: "OPS", value: "-" });
  });

  it("기록 자체가 없으면 빈 배열", () => {
    expect(seasonLines(null)).toEqual([]);
    expect(seasonLines(undefined)).toEqual([]);
  });

  it("1.000을 넘는 OPS는 앞자리를 살린다", () => {
    expect(seasonLines(bat({ ops: 1.024 }))[1].value).toBe("1.024");
  });
});

describe("시즌 통계 찾기", () => {
  const primary = { P1: bat() };
  const byLeague = { LEAGUE_A: { stats: { P2: bat({ hr: 12 }) } }, LEAGUE_B: { stats: {} } };

  it("주인공 리그에서 먼저 찾는다", () => {
    expect(seasonStatsOf("P1", primary, byLeague)).toBe(primary.P1);
  });

  it("없으면 리그별에서 찾는다 — 상대 타자는 대개 이쪽이다", () => {
    expect(seasonStatsOf("P2", primary, byLeague)?.type).toBe("batter");
  });

  it("어디에도 없으면 null", () => {
    expect(seasonStatsOf("없는선수", primary, byLeague)).toBeNull();
    expect(seasonStatsOf("", primary, byLeague)).toBeNull();
    expect(seasonStatsOf(null, primary, byLeague)).toBeNull();
  });

  it("통계가 아예 비어 있어도 터지지 않는다", () => {
    expect(seasonStatsOf("P1", null, null)).toBeNull();
    expect(seasonStatsOf("P1", undefined, undefined)).toBeNull();
  });
});
