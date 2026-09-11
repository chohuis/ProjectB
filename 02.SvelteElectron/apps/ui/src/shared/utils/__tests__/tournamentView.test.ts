import { describe, it, expect } from "vitest";
import {
  tournamentsOfLeague,
  roundLabel,
  bracketRounds,
  tournamentPhase,
  championOf,
  teamRun,
  runSummary,
  PHASE_LABEL,
} from "../tournamentView";
import type { TournamentBracket, BracketMatch, GroupStage } from "../tournament";
import { TOURNAMENTS } from "../tournament";

const m = (
  round: number,
  slot: number,
  home: string | null,
  away: string | null,
  winner: string | null = null,
  isBye = false,
): BracketMatch => ({
  id: `M${round}-${slot}`,
  round,
  slot,
  week: 2,
  gameDate: "2026-03-10",
  homeTeamId: home,
  awayTeamId: away,
  isBye,
  winnerTeamId: winner,
  isProtagonistGame: false,
});

/** 4팀 대회 — 4강 2경기 + 결승 1경기 (totalRounds 2) */
function bracket4(
  opts: { semiWinners?: [string, string]; finalWinner?: string } = {},
): TournamentBracket {
  const [w1, w2] = opts.semiWinners ?? [null as unknown as string, null as unknown as string];
  return {
    tournamentId: "TOUR_TEST",
    leagueId: "LEAGUE_HIGHSCHOOL",
    seasonYear: 2026,
    bracketSize: 4,
    totalRounds: 2,
    byeCount: 0,
    matches: [
      m(0, 0, "A", "B", w1 ?? null),
      m(0, 1, "C", "D", w2 ?? null),
      m(1, 0, w1 ?? null, w2 ?? null, opts.finalWinner ?? null),
    ],
  };
}

describe("대회 목록", () => {
  it("리그별로 주차 순이다", () => {
    const hs = tournamentsOfLeague("LEAGUE_HIGHSCHOOL");
    expect(hs.length).toBeGreaterThan(0);
    for (let i = 1; i < hs.length; i++) {
      expect(hs[i].startWeek).toBeGreaterThanOrEqual(hs[i - 1].startWeek);
    }
  });

  it("고교와 대학이 섞이지 않는다", () => {
    for (const t of tournamentsOfLeague("LEAGUE_HIGHSCHOOL")) {
      expect(t.leagueId).toBe("LEAGUE_HIGHSCHOOL");
    }
    expect(
      tournamentsOfLeague("LEAGUE_UNIVERSITY").every((t) => t.leagueId === "LEAGUE_UNIVERSITY"),
    ).toBe(true);
  });

  it("대회가 없는 리그는 빈 목록 — 프로엔 이 대회가 없다", () => {
    expect(tournamentsOfLeague("LEAGUE_KBL")).toEqual([]);
    expect(tournamentsOfLeague("없는리그")).toEqual([]);
  });

  it("시드 데이터가 실제로 8개다", () => {
    expect(TOURNAMENTS.length).toBe(8);
  });
});

describe("라운드 이름 — 경기 수로 정한다", () => {
  it("1경기면 결승", () => {
    expect(roundLabel(1)).toBe("결승");
  });

  it("N경기 라운드에는 2N팀이 있다", () => {
    expect(roundLabel(2)).toBe("4강");
    expect(roundLabel(4)).toBe("8강");
    expect(roundLabel(8)).toBe("16강");
    expect(roundLabel(16)).toBe("32강");
  });

  it("⚠ 실제 32팀 대진에서 결승이 두 번 나오지 않는다", () => {
    // 경기 수 16·8·4·2·1 — `totalRounds`로 역산하던 시절 마지막 둘이 다 "결승"이었다
    const labels = [16, 8, 4, 2, 1].map(roundLabel);
    expect(labels).toEqual(["32강", "16강", "8강", "4강", "결승"]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("라운드 묶기", () => {
  it("엔진이 준 round 번호를 그대로 쓴다", () => {
    const r = bracketRounds(bracket4());
    expect(r.map((x) => x.round)).toEqual([0, 1]);
    expect(r.map((x) => x.label)).toEqual(["4강", "결승"]);
  });

  it("라운드 안에서 slot 순으로 정렬한다 — 대진표 위아래가 뒤집히면 안 된다", () => {
    const b = bracket4();
    b.matches = [b.matches[1], b.matches[0], b.matches[2]]; // 일부러 뒤섞는다
    expect(bracketRounds(b)[0].matches.map((x) => x.slot)).toEqual([0, 1]);
  });

  it("빈 대진은 빈 배열", () => {
    expect(bracketRounds(null)).toEqual([]);
    expect(bracketRounds({ ...bracket4(), matches: [] })).toEqual([]);
  });
});

describe("단계 판정", () => {
  const def = TOURNAMENTS.find((t) => t.id === "TOUR_HS_GAENARI")!;

  it("대진이 없고 주차 전이면 예정", () => {
    expect(tournamentPhase(def, 1, null, null)).toBe("upcoming");
  });

  it("조별예선이 있으면 예선", () => {
    expect(tournamentPhase(def, 2, null, {} as GroupStage)).toBe("qualifying");
  });

  it("결승이 안 끝났으면 진행 중", () => {
    expect(tournamentPhase(def, 3, bracket4({ semiWinners: ["A", "C"] }), null)).toBe("live");
  });

  it("결승이 끝났으면 종료", () => {
    expect(
      tournamentPhase(def, 3, bracket4({ semiWinners: ["A", "C"], finalWinner: "A" }), null),
    ).toBe("done");
  });

  it("⚠ 주차가 지나도 대진이 있으면 상태가 우선이다", () => {
    // 참가팀 0이면 대회가 안 열려 브래킷이 없다. 그때만 주차로 판정한다
    expect(tournamentPhase(def, 99, bracket4({ semiWinners: ["A", "C"] }), null)).toBe("live");
    expect(tournamentPhase(def, 99, null, null)).toBe("done");
  });

  it("네 단계에 라벨이 다 있다", () => {
    for (const p of ["upcoming", "qualifying", "live", "done"] as const) {
      expect(PHASE_LABEL[p]).toBeTruthy();
    }
  });
});

describe("우승·성적", () => {
  it("결승 승자가 우승", () => {
    expect(championOf(bracket4({ semiWinners: ["A", "C"], finalWinner: "A" }))).toBe("A");
  });

  it("결승이 안 끝났으면 우승자가 없다", () => {
    expect(championOf(bracket4({ semiWinners: ["A", "C"] }))).toBeNull();
    expect(championOf(null)).toBeNull();
  });

  it("우승한 팀", () => {
    const r = teamRun(bracket4({ semiWinners: ["A", "C"], finalWinner: "A" }), "A")!;
    expect(r.champion).toBe(true);
    expect(r.lostAt).toBeNull();
    expect(runSummary(r, "done")).toBe("우승");
  });

  it("탈락한 팀은 어디서 졌는지 남는다", () => {
    const r = teamRun(bracket4({ semiWinners: ["A", "C"], finalWinner: "A" }), "C")!;
    expect(r.champion).toBe(false);
    expect(r.reached).toBe("결승");
    expect(r.lostAt?.round).toBe(1);
    expect(runSummary(r, "done")).toBe("결승 탈락");
  });

  it("1회전에서 진 팀", () => {
    const r = teamRun(bracket4({ semiWinners: ["A", "C"] }), "B")!;
    expect(r.reached).toBe("4강");
    expect(runSummary(r, "live")).toBe("4강 탈락");
  });

  it("아직 안 진 팀은 진행 중이다", () => {
    const r = teamRun(bracket4({ semiWinners: ["A", "C"] }), "A")!;
    expect(r.lostAt).toBeNull();
    expect(runSummary(r, "live")).toBe("결승 진행 중");
  });

  it("출전 안 한 팀은 null — 종료된 대회에선 '미출전'", () => {
    expect(teamRun(bracket4(), "없는팀")).toBeNull();
    expect(runSummary(null, "done")).toBe("미출전");
    // 아직 안 열린 대회에 "미출전"은 거짓말이다
    expect(runSummary(null, "upcoming")).toBe("");
  });

  it("⚠ 부전승은 이긴 게 아니다 — 경기를 안 치렀는데 승리로 세면 안 된다", () => {
    const b: TournamentBracket = {
      tournamentId: "T",
      leagueId: "L",
      seasonYear: 2026,
      bracketSize: 4,
      totalRounds: 2,
      byeCount: 1,
      matches: [
        m(0, 0, "A", null, "A", true), // 부전승
        m(0, 1, "C", "D", "C"),
        m(1, 0, "A", "C", null),
      ],
    };
    const r = teamRun(b, "A")!;
    expect(r.reached).toBe("결승");
    expect(r.lostAt).toBeNull();
  });
});
