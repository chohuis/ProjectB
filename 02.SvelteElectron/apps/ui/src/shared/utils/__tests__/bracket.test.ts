import { describe, it, expect } from "vitest";
import { toRounds, seriesState, winsNeeded, bestOfLabel, bracketChampion } from "../bracket";
import type { PostseasonSeries } from "../../types/season";

function sr(o: Partial<PostseasonSeries> & { id: string }): PostseasonSeries {
  return {
    leagueId: "LEAGUE_KBL", round: "라운드", homeTeamId: "H", awayTeamId: "A",
    bestOf: 5, homeWins: 0, awayWins: 0, winner: null,
    homeFrom: null, awayFrom: null, nextSeriesId: null, nextSeriesSlot: null,
    ...o,
  };
}

/** KBL식 4단계: 와일드카드 → 준PO → PO → 한국시리즈 */
const KBL: PostseasonSeries[] = [
  sr({ id: "KS",   round: "한국시리즈", bestOf: 7, nextSeriesId: null }),
  sr({ id: "PO",   round: "플레이오프", bestOf: 5, nextSeriesId: "KS",  nextSeriesSlot: "away" }),
  sr({ id: "SPO",  round: "준플레이오프", bestOf: 3, nextSeriesId: "PO", nextSeriesSlot: "away" }),
  sr({ id: "WC",   round: "와일드카드", bestOf: 1, nextSeriesId: "SPO", nextSeriesSlot: "away" }),
];

describe("라운드 풀기", () => {
  it("먼저 하는 경기가 왼쪽, 결승이 오른쪽", () => {
    expect(toRounds(KBL).map((r) => r.label))
      .toEqual(["와일드카드", "준플레이오프", "플레이오프", "한국시리즈"]);
  });

  it("깊이는 결승이 0이다", () => {
    const rounds = toRounds(KBL);
    expect(rounds.at(-1)!.depth).toBe(0);
    expect(rounds[0].depth).toBe(3);
  });

  it("⚠ 라운드 이름으로 정렬하지 않는다 — 리그마다 이름이 다르다", () => {
    // ABL식: 같은 구조인데 이름만 다름. 이름 정렬이면 순서가 뒤집힌다
    const abl = [
      sr({ id: "F",  round: "월드시리즈", nextSeriesId: null }),
      sr({ id: "CS", round: "챔피언십",   nextSeriesId: "F" }),
      sr({ id: "DS", round: "디비전",     nextSeriesId: "CS" }),
    ];
    expect(toRounds(abl).map((r) => r.label)).toEqual(["디비전", "챔피언십", "월드시리즈"]);
  });

  it("같은 깊이의 시리즈는 한 라운드로 묶인다", () => {
    const two = [
      sr({ id: "F",   nextSeriesId: null, round: "결승" }),
      sr({ id: "S1",  nextSeriesId: "F",  round: "4강" }),
      sr({ id: "S2",  nextSeriesId: "F",  round: "4강" }),
    ];
    const rounds = toRounds(two);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].series.map((s) => s.id)).toEqual(["S1", "S2"]);
  });

  it("빈 대진은 빈 배열", () => {
    expect(toRounds([])).toEqual([]);
  });

  it("순환 참조가 있어도 멈춘다 — 데이터가 깨져도 화면은 살아야 한다", () => {
    const loop = [
      sr({ id: "A", nextSeriesId: "B" }),
      sr({ id: "B", nextSeriesId: "A" }),
    ];
    expect(() => toRounds(loop)).not.toThrow();
    expect(toRounds(loop).length).toBeGreaterThan(0);
  });
});

describe("시리즈 상태", () => {
  it("양쪽이 다 정해지고 승자가 없으면 진행 중", () => {
    expect(seriesState(sr({ id: "x", homeWins: 1, awayWins: 1 }))).toBe("live");
  });

  it("한쪽이 비면 앞 시리즈 대기다", () => {
    expect(seriesState(sr({ id: "x", awayTeamId: "" }))).toBe("waiting");
    expect(seriesState(sr({ id: "x", homeTeamId: "" }))).toBe("waiting");
  });

  it("승자가 있으면 끝", () => {
    expect(seriesState(sr({ id: "x", winner: "H" }))).toBe("done");
  });
});

describe("시리즈 형식", () => {
  it("몇 승이 필요한가", () => {
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
    expect(winsNeeded(7)).toBe(4);
  });

  it("표기", () => {
    expect(bestOfLabel(1)).toBe("단판");
    expect(bestOfLabel(5)).toBe("5전 3선승");
    expect(bestOfLabel(7)).toBe("7전 4선승");
  });
});

describe("우승팀", () => {
  it("결승 승자를 준다", () => {
    const done = KBL.map((s) => (s.id === "KS" ? { ...s, winner: "TEAM_X" } : s));
    expect(bracketChampion(done)).toBe("TEAM_X");
  });

  it("아직 안 끝났으면 null", () => {
    expect(bracketChampion(KBL)).toBeNull();
    expect(bracketChampion([])).toBeNull();
  });
});
