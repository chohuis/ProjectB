import { describe, it, expect } from "vitest";
import { buildPastStandings } from "../seedPastStandings";
import type { TeamRef } from "../../stores/master";

/**
 * 과거 5년 순위가 **팀 전력★과 어긋나지 않는가** (A5).
 *
 * 🔴 ★5 구단이 5년 내내 꼴찌인 과거를 가지면 세계가 첫날부터 자기모순이다.
 *    실측(씨앗 20260731): ★2 .453 · ★3 .502 · ★4 .550 · ★5 .613 — 단조다.
 *
 * ⚠ 팀 순위만 만든다. 선수 개인은 NPC 7,300명 × 5년 = 36,500행이라 안 만든다.
 */
const mk = (id: string, leagueId: string, power?: number): TeamRef =>
  ({ id, leagueId, name: id, power }) as unknown as TeamRef;

const TEAMS = [
  mk("TEAM_KBL_A_1", "LEAGUE_KBL", 5),
  mk("TEAM_KBL_B_1", "LEAGUE_KBL", 3),
  mk("TEAM_KBL_C_1", "LEAGUE_KBL", 1),
  mk("TEAM_KBL_A_2", "LEAGUE_KBL", 5), // 2군 — 순위표를 안 쓴다
  mk("TEAM_HS_X", "LEAGUE_HIGHSCHOOL"), // 아마 — 안 만든다
];

describe("과거 순위 생성", () => {
  it("5년치를 만든다", () => {
    const out = buildPastStandings(TEAMS, 20260731, 2026);
    expect([...out.keys()].sort()).toEqual([2021, 2022, 2023, 2024, 2025]);
  });

  it("프로 1군만 만든다 — 2군·아마추어는 뺀다", () => {
    const rows = buildPastStandings(TEAMS, 20260731, 2026).get(2025)!;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.teamId.endsWith("_1"))).toBe(true);
    expect(rows.some((r) => r.leagueId === "LEAGUE_HIGHSCHOOL")).toBe(false);
  });

  it("★이 높을수록 승률이 높다 (5년 평균)", () => {
    const out = buildPastStandings(TEAMS, 20260731, 2026);
    const avg: Record<string, number[]> = {};
    for (const rows of out.values()) {
      for (const r of rows) (avg[r.teamId] = avg[r.teamId] ?? []).push(r.winPct);
    }
    const m = (id: string) => avg[id].reduce((a, b) => a + b, 0) / avg[id].length;
    expect(m("TEAM_KBL_A_1"), "★5가 ★3보다 낮다").toBeGreaterThan(m("TEAM_KBL_B_1"));
    expect(m("TEAM_KBL_B_1"), "★3이 ★1보다 낮다").toBeGreaterThan(m("TEAM_KBL_C_1"));
  });

  it("승·패·무 합이 경기 수와 맞는다", () => {
    for (const rows of buildPastStandings(TEAMS, 20260731, 2026).values()) {
      for (const r of rows) {
        expect(r.wins + r.losses + r.draws, `${r.teamId} 합이 144가 아니다`).toBe(144);
      }
    }
  });

  it("같은 씨앗은 같은 과거를 만든다", () => {
    const a = buildPastStandings(TEAMS, 20260731, 2026).get(2023)!;
    const b = buildPastStandings(TEAMS, 20260731, 2026).get(2023)!;
    expect(a).toEqual(b);
  });

  it("씨앗이 다르면 과거도 다르다", () => {
    const a = buildPastStandings(TEAMS, 20260731, 2026).get(2023)!;
    const b = buildPastStandings(TEAMS, 99999999, 2026).get(2023)!;
    expect(a).not.toEqual(b);
  });

  it("★이 같아도 해마다 흔들린다 — 5년치 복사본이 아니다", () => {
    const out = buildPastStandings(TEAMS, 20260731, 2026);
    const pcts = [...out.values()].map(
      (rows) => rows.find((r) => r.teamId === "TEAM_KBL_B_1")!.winPct,
    );
    expect(new Set(pcts).size, "5년 승률이 전부 같다").toBeGreaterThan(1);
  });

  it("득실이 승률과 같은 방향이다", () => {
    const rows = buildPastStandings(TEAMS, 20260731, 2026).get(2025)!;
    for (const r of rows) {
      if (r.winPct > 0.5)
        expect(r.runsFor, `${r.teamId} 이겼는데 득점이 적다`).toBeGreaterThan(r.runsAgainst);
      if (r.winPct < 0.5) expect(r.runsFor).toBeLessThan(r.runsAgainst);
    }
  });
});
