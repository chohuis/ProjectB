import { describe, it, expect } from "vitest";
import { updateStreak, updateLast10, updateStandings, accumulateStats, migrateLeagueState } from "../season-helpers";
import type { Standing, MatchResult } from "../../types/season";

// ── updateStreak ──────────────────────────────────────────────

describe("updateStreak", () => {
  it("새 연승 시작", () => {
    expect(updateStreak("", "W")).toBe("W1");
    expect(updateStreak("", "L")).toBe("L1");
  });

  it("연속 같은 결과 → 카운트 증가", () => {
    expect(updateStreak("W3", "W")).toBe("W4");
    expect(updateStreak("L2", "L")).toBe("L3");
  });

  it("결과 바뀌면 초기화", () => {
    expect(updateStreak("W3", "L")).toBe("L1");
    expect(updateStreak("L5", "W")).toBe("W1");
    expect(updateStreak("W2", "D")).toBe("D1");
  });
});

// ── updateLast10 ──────────────────────────────────────────────

describe("updateLast10", () => {
  it("빈 문자열에 추가", () => {
    expect(updateLast10("", "W")).toBe("W");
  });

  it("10개 미만일 때 그냥 추가", () => {
    expect(updateLast10("WWWWW", "L")).toBe("WWWWWL");
  });

  it("10개 초과 시 오래된 것 제거", () => {
    const base = "WWWWWWWWWW"; // 10개
    expect(updateLast10(base, "L")).toBe("WWWWWWWWWL");
  });

  it("구형 압축 포맷 '3W2L' 파싱", () => {
    // "W3L2" → "WWWLL" → + "W" → "WWWLLW"
    expect(updateLast10("W3L2", "W")).toBe("WWWLLW");
  });
});

// ── accumulateStats ───────────────────────────────────────────

describe("accumulateStats", () => {
  it("투수 첫 등판 기록", () => {
    const result = accumulateStats({}, [
      { role: "pitcher", playerId: "P1", ip: 6, er: 2, h: 5, k: 7, bb: 2, decision: "W" },
    ]);
    const s = result["P1"] as { type: string; g: number; w: number; ip: number; era: number };
    expect(s.type).toBe("pitcher");
    expect(s.g).toBe(1);
    expect(s.w).toBe(1);
    expect(s.ip).toBe(6);
    expect(s.era).toBe(3.0);
  });

  it("투수 누적 — ERA 재계산", () => {
    const after1 = accumulateStats({}, [
      { role: "pitcher", playerId: "P1", ip: 9, er: 3, h: 7, k: 9, bb: 2, decision: "W" },
    ]);
    const after2 = accumulateStats(after1, [
      { role: "pitcher", playerId: "P1", ip: 9, er: 3, h: 7, k: 9, bb: 2, decision: "L" },
    ]);
    const s = after2["P1"] as { type: string; g: number; w: number; l: number; ip: number; era: number };
    expect(s.g).toBe(2);
    expect(s.w).toBe(1);
    expect(s.l).toBe(1);
    expect(s.ip).toBe(18);
    expect(s.era).toBe(3.0);
  });

  it("타자 첫 경기 기록", () => {
    const result = accumulateStats({}, [
      { role: "batter", playerId: "B1", ab: 4, h: 2, hr: 1, rbi: 2, bb: 1, k: 1, sb: 0 },
    ]);
    const s = result["B1"] as { type: string; g: number; avg: number; hr: number };
    expect(s.type).toBe("batter");
    expect(s.g).toBe(1);
    expect(s.avg).toBe(0.5);
    expect(s.hr).toBe(1);
  });

  it("타자 누적 AVG 재계산", () => {
    const after1 = accumulateStats({}, [
      { role: "batter", playerId: "B1", ab: 4, h: 1, hr: 0, rbi: 0, bb: 0, k: 1, sb: 0 },
    ]);
    const after2 = accumulateStats(after1, [
      { role: "batter", playerId: "B1", ab: 4, h: 3, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0 },
    ]);
    const s = after2["B1"] as { ab: number; h: number; avg: number };
    expect(s.ab).toBe(8);
    expect(s.h).toBe(4);
    expect(s.avg).toBe(0.5);
  });
});

// ── updateStandings ───────────────────────────────────────────

function makeStanding(teamId: string): Standing {
  return { teamId, wins: 0, losses: 0, draws: 0, winPct: 0, runsFor: 0, runsAgainst: 0, streak: "", last10: "" };
}

function makeResult(winnerId: string, loserId: string | null, home: number, away: number): MatchResult {
  return { homeScore: home, awayScore: away, winnerId, loserId, playerLines: [], events: [] };
}

describe("updateStandings", () => {
  it("홈팀 승리 — 승/득실 업데이트", () => {
    const standings = [makeStanding("HOME"), makeStanding("AWAY")];
    const result    = makeResult("HOME", "AWAY", 5, 2);
    const updated   = updateStandings(standings, result, "HOME", "AWAY");

    const home = updated.find(s => s.teamId === "HOME")!;
    const away = updated.find(s => s.teamId === "AWAY")!;

    expect(home.wins).toBe(1);
    expect(home.losses).toBe(0);
    expect(home.runsFor).toBe(5);
    expect(home.runsAgainst).toBe(2);
    expect(home.winPct).toBe(1.0);

    expect(away.wins).toBe(0);
    expect(away.losses).toBe(1);
    expect(away.runsFor).toBe(2);
    expect(away.runsAgainst).toBe(5);
    expect(away.winPct).toBe(0);
  });

  it("무승부 — 홈·어웨이 양팀 모두 draws 업데이트", () => {
    const standings = [makeStanding("A"), makeStanding("B")];
    const result    = makeResult("A", null, 3, 3);
    const updated   = updateStandings(standings, result, "A", "B");

    const a = updated.find(s => s.teamId === "A")!;
    const b = updated.find(s => s.teamId === "B")!;

    expect(a.draws).toBe(1);
    expect(a.wins).toBe(0);
    expect(a.streak).toBe("D1");
    expect(b.draws).toBe(1);
    expect(b.wins).toBe(0);
    expect(b.streak).toBe("D1");
  });

  it("관계없는 팀은 변경 없음", () => {
    const standings = [makeStanding("HOME"), makeStanding("AWAY"), makeStanding("OTHER")];
    const result    = makeResult("HOME", "AWAY", 5, 2);
    const updated   = updateStandings(standings, result, "HOME", "AWAY");
    const other     = updated.find(s => s.teamId === "OTHER")!;

    expect(other.wins).toBe(0);
    expect(other.losses).toBe(0);
    expect(other.runsFor).toBe(0);
  });
});

// ── migrateLeagueState ────────────────────────────────────────

describe("migrateLeagueState", () => {
  it("빈 객체 → 기본값 반환", () => {
    const result = migrateLeagueState({});
    expect(result.standings).toEqual([]);
    expect(result.stats).toEqual({});
    expect(result.playerConditions).toEqual({});
    expect(result.teamRotationIndex).toEqual({});
  });

  it("부분 입력 → 나머지 기본값으로 채움", () => {
    const standings = [{ teamId: "A", wins: 5, losses: 2, draws: 0, winPct: 0.714, runsFor: 30, runsAgainst: 20, streak: "W3", last10: "WWWWWLL" }];
    const result = migrateLeagueState({ standings });
    expect(result.standings).toBe(standings);
    expect(result.stats).toEqual({});
    expect(result.teamRotationIndex).toEqual({});
  });

  it("완전한 입력 → 그대로 반환", () => {
    const full = {
      standings: [],
      stats: { P1: { type: "pitcher" as const, g: 10, gs: 8, w: 5, l: 3, sv: 0, hd: 0, ip: 60, er: 20, h: 55, k: 70, bb: 15, era: 3.0, whip: 1.17 } },
      playerConditions: { P1: { fatigue: 40, stamina: 80 } },
      teamRotationIndex: { TEAM_A: 2 },
    };
    const result = migrateLeagueState(full);
    expect(result.stats["P1"]?.g).toBe(10);
    expect(result.playerConditions["P1"]?.fatigue).toBe(40);
    expect(result.teamRotationIndex["TEAM_A"]).toBe(2);
  });
});
