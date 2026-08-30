import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tournamentAwards, pitcherScore, batterScore } from "../tournamentAwards";

/**
 * 대회 개인 수상 (2026-08-30).
 *
 * 🔴 **대회 5종이 도는데 우승해도 개인에게 남는 게 없었다.**
 *
 * ⚠ MVP는 우승팀 안에서, 부문상은 참가팀 전체에서(사용자 확정).
 * ⚠ 대회별 성적은 따로 안 쌓인다 — 그 주차의 대회 경기 `playerLines`를
 *   직접 모은다. 새 저장 구조를 만들지 않는다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

type Row = Parameters<typeof pitcherScore>[0];
const P = (o: Partial<Row> & { playerId: string; teamId: string }): Row => ({
  outs: 0, er: 0, k: 0, w: 0, sv: 0, hd: 0,
  ab: 0, h: 0, hr: 0, rbi: 0, tb: 0, ...o,
});
const mapOf = (...rows: Row[]) => new Map(rows.map((r) => [r.playerId, r]));

describe("대회 수상", () => {
  const teamOf = (pid: string): string | null =>
    pid.startsWith("C") ? "TEAM_CHAMP" : pid.startsWith("X") ? null : "TEAM_OTHER";

  it("MVP는 우승팀 안에서만 나온다", () => {
    // 진 팀 에이스가 더 잘 던져도 MVP는 우승팀 것이다
    const aw = tournamentAwards(mapOf(
      P({ playerId: "C1", teamId: "", outs: 27, er: 2, k: 12, w: 2 }),
      P({ playerId: "O1", teamId: "", outs: 36, er: 0, k: 30, w: 3 }),
    ), "TEAM_CHAMP", teamOf);
    expect(aw.find((a) => a.id === "tour_mvp")?.playerId).toBe("C1");
  });

  it("부문상은 참가팀 전체에서 나온다", () => {
    // 8강에서 져도 우수투수상은 받을 수 있다
    const aw = tournamentAwards(mapOf(
      P({ playerId: "C1", teamId: "", outs: 27, er: 5, k: 8, w: 2 }),
      P({ playerId: "O1", teamId: "", outs: 36, er: 0, k: 30, w: 3 }),
    ), "TEAM_CHAMP", teamOf);
    expect(aw.find((a) => a.id === "tour_pitcher")?.playerId).toBe("O1");
  });

  it("🔴 소속을 못 찾으면 후보에서 뺀다", () => {
    // 폴백으로 흡수하면 호출부의 리그 게이트가 무력해진다
    const aw = tournamentAwards(mapOf(
      P({ playerId: "X1", teamId: "TEAM_CHAMP", outs: 99, er: 0, k: 99, w: 9 }),
    ), "TEAM_CHAMP", teamOf);
    expect(aw.length).toBe(0);
  });

  it("이닝이 얕으면 투수 후보가 아니다", () => {
    // 넉아웃이라 한 경기 완봉이 전부인 선수가 나온다
    expect(pitcherScore(P({ playerId: "a", teamId: "t", outs: 15, er: 0 }))).toBe(-1);
    expect(pitcherScore(P({ playerId: "a", teamId: "t", outs: 18, er: 0 })))
      .toBeGreaterThan(0);
  });

  it("타수가 얕으면 타자 후보가 아니다", () => {
    // 하한이 없으면 1타수 1안타(1.000)가 타격상을 받는다
    expect(batterScore(P({ playerId: "a", teamId: "t", ab: 1, h: 1 }))).toBe(-1);
    expect(batterScore(P({ playerId: "a", teamId: "t", ab: 8, h: 4 })))
      .toBeGreaterThan(0);
  });

  it("아무도 자격이 없으면 상을 안 준다", () => {
    const aw = tournamentAwards(mapOf(
      P({ playerId: "C1", teamId: "", outs: 3, ab: 2, h: 1 }),
    ), "TEAM_CHAMP", teamOf);
    expect(aw.length).toBe(0);
  });

  it("총루타가 장타를 센다", () => {
    // 장타를 단타로 뭉개면 근사가 된다
    const single = batterScore(P({ playerId: "a", teamId: "t", ab: 10, h: 4, tb: 4 }));
    const extra  = batterScore(P({ playerId: "a", teamId: "t", ab: 10, h: 4, tb: 10 }));
    expect(extra).toBeGreaterThan(single);
  });
});

describe("배선", () => {
  const src = read("apps/ui/src/shared/usecases/advanceWeek.ts");

  it("결승이 끝나면 수상을 준다", () => {
    expect(src.includes("tournamentAwards(")).toBe(true);
    expect(src.includes("collectTournamentLines(")).toBe(true);
  });

  it("🔴 리그 게이트가 있다 — 없으면 대회가 섞인다", () => {
    // 일정은 주인공 것 하나라, 대학 대회 주차로 고교 경기를 모으면
    // **대학 대회 이름으로 고교 선수가 상을 받는다**(실측으로 났다)
    expect(src.includes("return lg === def.leagueId ? tid : null;")).toBe(true);
  });

  it("시즌 수상과 같은 자리에 남긴다", () => {
    // 명예의 전당·진학 점수가 `careerHistory.highlights`를 본다
    expect(src.includes("gameStore.addSeasonHighlights(next.seasonYear, byPlayer)")).toBe(true);
  });

  it("소식은 우리 팀 것만 보낸다", () => {
    // 5대회 × 3상이면 한 해 15통이다
    expect(src.includes("awards.filter((a) => a.teamId === protagonistTeamId)")).toBe(true);
  });
});
