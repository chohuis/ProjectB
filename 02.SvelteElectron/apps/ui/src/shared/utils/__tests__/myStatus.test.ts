import { describe, it, expect } from "vitest";
import { nextProtagonistGame, teamRank, gaugeTone, recentResults } from "../myStatus";
import { playerYearLabel } from "../playerYearLabel";
import type { ScheduleEntry, Standing } from "../../types/season";

function game(id: string, date: string, week: number, home: string, away: string,
              done = false): ScheduleEntry {
  return {
    id, week, gameDate: date, homeTeamId: home, awayTeamId: away,
    isProtagonistGame: true, phase: "season",
    ...(done ? { result: { homeScore: 1, awayScore: 0 } as ScheduleEntry["result"] } : {}),
  };
}

function standing(teamId: string, w: number, l: number, d = 0, streak = ""): Standing {
  return {
    teamId, wins: w, losses: l, draws: d,
    winPct: w + l === 0 ? 0 : w / (w + l),
    runsFor: 0, runsAgainst: 0, streak, last10: "",
  };
}

describe("nextProtagonistGame", () => {
  const ME = "TEAM_A";

  it("치른 경기는 건너뛰고 가장 이른 미경기를 고른다", () => {
    const s = [
      game("g1", "2031-04-10", 1, ME, "TEAM_B", true),
      game("g3", "2031-04-20", 3, "TEAM_C", ME),
      game("g2", "2031-04-14", 2, ME, "TEAM_D"),
    ];
    const n = nextProtagonistGame(s, ME, "2031-04-12");
    expect(n?.entry.id).toBe("g2");
    expect(n?.opponentId).toBe("TEAM_D");
    expect(n?.isHome).toBe(true);
  });

  it("원정이면 isHome이 false이고 상대는 홈팀이다", () => {
    const n = nextProtagonistGame([game("g", "2031-05-01", 5, "TEAM_C", ME)], ME, "2031-05-01");
    expect(n?.isHome).toBe(false);
    expect(n?.opponentId).toBe("TEAM_C");
  });

  it("남은 날짜를 센다 — 달을 넘어도 맞아야 한다", () => {
    const n = nextProtagonistGame([game("g", "2031-05-02", 6, "TEAM_A", "TEAM_B")], "TEAM_A", "2031-04-28");
    expect(n?.daysAway).toBe(4);
  });

  it("오늘 경기는 0일이다", () => {
    const n = nextProtagonistGame([game("g", "2031-05-02", 6, "TEAM_A", "TEAM_B")], "TEAM_A", "2031-05-02");
    expect(n?.daysAway).toBe(0);
  });

  it("현재 날짜가 없으면 daysAway는 null이지만 경기는 찾는다", () => {
    const n = nextProtagonistGame([game("g", "2031-05-02", 6, "TEAM_A", "TEAM_B")], "TEAM_A");
    expect(n?.entry.id).toBe("g");
    expect(n?.daysAway).toBeNull();
  });

  it("남의 팀 경기만 있으면 null", () => {
    expect(nextProtagonistGame([game("g", "2031-05-02", 6, "X", "Y")], "TEAM_A", "2031-05-01")).toBeNull();
  });

  it("소속팀이 없으면(상무 등) null", () => {
    expect(nextProtagonistGame([game("g", "2031-05-02", 6, "TEAM_A", "TEAM_B")], "", "2031-05-01")).toBeNull();
  });
});

describe("recentResults", () => {
  const ME = "TEAM_A";

  function played(id: string, date: string, week: number, home: string, away: string,
                  hs: number, as: number): ScheduleEntry {
    return {
      id, week, gameDate: date, homeTeamId: home, awayTeamId: away,
      isProtagonistGame: true, phase: "season",
      result: { homeScore: hs, awayScore: as } as ScheduleEntry["result"],
    };
  }

  it("최신순이다 — 배열 순서가 아니라 날짜로 센다", () => {
    // ⚠ 예전 대시보드는 `.slice(-3)`으로 배열 끝을 집었다. 친선·전국대회가
    // 뒤에 붙으면 끝이 최신이 아니다
    const s = [
      played("g3", "2031-05-20", 8, ME, "B", 5, 3),
      played("g1", "2031-04-01", 1, ME, "C", 1, 2),
      played("g2", "2031-05-01", 5, "D", ME, 0, 4),
    ];
    expect(recentResults(s, ME).map((r) => r.scheduleId)).toEqual(["g3", "g2", "g1"]);
  });

  it("원정 경기의 내 점수는 away다", () => {
    const r = recentResults([played("g", "2031-05-01", 5, "D", ME, 0, 4)], ME)[0];
    expect(r.my).toBe(4);
    expect(r.opp).toBe(0);
    expect(r.won).toBe(true);
    expect(r.opponentId).toBe("D");
  });

  it("무승부는 승도 패도 아니다", () => {
    const r = recentResults([played("g", "2031-05-01", 5, ME, "D", 2, 2)], ME)[0];
    expect(r.drew).toBe(true);
    expect(r.won).toBe(false);
  });

  it("안 치른 경기는 안 센다", () => {
    const s = [game("g", "2031-05-01", 5, ME, "B"), played("h", "2031-04-01", 1, ME, "C", 3, 1)];
    expect(recentResults(s, ME).map((r) => r.scheduleId)).toEqual(["h"]);
  });

  it("limit만큼만 준다", () => {
    const s = Array.from({ length: 9 }, (_, i) =>
      played(`g${i}`, `2031-05-0${i + 1}`, i + 1, ME, "B", i, 0));
    expect(recentResults(s, ME, 5)).toHaveLength(5);
  });
});

describe("teamRank", () => {
  it("정렬 안 된 순위표를 받아도 자리를 센다", () => {
    const st = [standing("A", 10, 20), standing("B", 30, 10), standing("C", 20, 15)];
    expect(teamRank(st, "B")?.rank).toBe(1);
    expect(teamRank(st, "C")?.rank).toBe(2);
    expect(teamRank(st, "A")?.rank).toBe(3);
    expect(teamRank(st, "A")?.of).toBe(3);
  });

  it("승률은 앞의 0을 뗀 야구 표기다", () => {
    expect(teamRank([standing("A", 22, 15)], "A")?.winPctText).toBe(".595");
  });

  it("전승도 1.000으로 남는다 — 앞의 0을 떼는 규칙에 걸리면 안 된다", () => {
    expect(teamRank([standing("A", 5, 0)], "A")?.winPctText).toBe("1.000");
  });

  it("없는 팀·빈 표는 null", () => {
    expect(teamRank([standing("A", 1, 1)], "Z")).toBeNull();
    expect(teamRank([], "A")).toBeNull();
  });
});

describe("gaugeTone", () => {
  it("컨디션·사기는 높을수록 좋다", () => {
    expect(gaugeTone(85)).toBe("ok");
    expect(gaugeTone(55)).toBe("warn");
    expect(gaugeTone(20)).toBe("bad");
  });

  it("피로는 방향이 반대다 — 높으면 나쁘다", () => {
    expect(gaugeTone(85, true)).toBe("bad");
    expect(gaugeTone(20, true)).toBe("ok");
  });
});

describe("playerYearLabel", () => {
  const base = { grade: undefined, proServiceYears: 0 } as const;

  it("재학 중은 학년", () => {
    expect(playerYearLabel({ ...base, careerStage: "highschool", grade: 3 })).toBe("3학년");
    expect(playerYearLabel({ ...base, careerStage: "university", grade: 4 })).toBe("4학년");
  });

  it("신인은 0년차가 아니라 1년차다", () => {
    expect(playerYearLabel({ ...base, careerStage: "pro_kbl", proServiceYears: 0 })).toBe("프로 1년차");
    expect(playerYearLabel({ ...base, careerStage: "pro_kbl", proServiceYears: 3 })).toBe("프로 4년차");
  });

  it("프로 리그가 뭐든 연차로 센다 — 예전엔 프로에서 '-'만 나왔다", () => {
    for (const stage of ["pro", "pro_kbl", "pro_abl", "pro_jbl"] as const) {
      expect(playerYearLabel({ ...base, careerStage: stage, proServiceYears: 1 })).toBe("프로 2년차");
    }
  });

  it("상무·독립리그", () => {
    expect(playerYearLabel({ ...base, careerStage: "military" })).toBe("복무 중");
    expect(playerYearLabel({ ...base, careerStage: "independent" })).toBe("");
  });
});
