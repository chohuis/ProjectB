import { describe, it, expect } from "vitest";
import { buildPastPlayerStats, type PastStatsInput } from "../seedPastPlayerStats";
import type { PitcherSeasonStats, BatterSeasonStats } from "../../types/save";

/**
 * 과거 5년 개인 성적 — **지어낸 값이 야구다워야 한다.**
 *
 * 🔴 A5 때는 팀 순위만 만들어 선수 상세의 연도별 성적이 늘 비어 있었다.
 *   세계가 어제 시작한 것처럼 보인다(2026-08-26 실플).
 *
 * ⚠ **틀린 값이 적혀 있는 것은 없는 것보다 나쁘다.** OVR 90이 ERA 7점대인
 *   과거를 가지면 세계가 첫날부터 자기모순이다.
 */

const YEAR = 2026;
const SEED = 20260826;

function mk(over: Partial<PastStatsInput> = {}): PastStatsInput {
  return {
    npcId: "PLY_TEST_001",
    leagueId: "LEAGUE_KBL",
    teamId: "TEAM_KBL_A_1",
    age: 28,
    ovr: 68,
    playerType: "pitcher",
    ...over,
  };
}

describe("과거 5년 개인 성적", () => {
  it("프로 1·2군만 만든다 — 고교·대학·독립은 안 만든다", () => {
    for (const lg of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"]) {
      expect(buildPastPlayerStats([mk({ leagueId: lg })], SEED, YEAR)).toEqual([]);
    }
    expect(buildPastPlayerStats([mk()], SEED, YEAR).length).toBe(5);
    expect(buildPastPlayerStats([mk({ leagueId: "LEAGUE_KBL_FARM" })], SEED, YEAR).length).toBe(5);
  });

  // 🔴 스물셋이면 5년 전엔 열여덟 — 프로에 없었다
  it("어린 선수는 프로에 없던 해를 안 만든다", () => {
    const rows = buildPastPlayerStats([mk({ age: 21 })], SEED, YEAR);
    expect(rows.length).toBe(2); // 스무 살·열아홉 두 해만
    for (const r of rows) expect(r.year).toBeGreaterThanOrEqual(YEAR - 2);
  });

  it("같은 씨앗이면 같은 과거다", () => {
    const a = buildPastPlayerStats([mk()], SEED, YEAR);
    const b = buildPastPlayerStats([mk()], SEED, YEAR);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("씨앗이 다르면 다른 과거다", () => {
    const a = buildPastPlayerStats([mk()], SEED, YEAR);
    const b = buildPastPlayerStats([mk()], SEED + 1, YEAR);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  // 🔴 같은 값 5줄이면 표가 복사본처럼 보인다
  it("해마다 흔들린다", () => {
    const rows = buildPastPlayerStats([mk()], SEED, YEAR);
    const eras = rows.map((r) => (r.stats as PitcherSeasonStats).era);
    expect(new Set(eras).size).toBeGreaterThan(3);
  });

  it("잘하는 투수가 못하는 투수보다 ERA가 낮다", () => {
    const good = buildPastPlayerStats([mk({ ovr: 90, npcId: "A" })], SEED, YEAR);
    const bad = buildPastPlayerStats([mk({ ovr: 55, npcId: "A" })], SEED, YEAR);
    const mean = (rs: typeof good) =>
      rs.reduce((s, r) => s + (r.stats as PitcherSeasonStats).era, 0) / rs.length;
    expect(mean(good)).toBeLessThan(mean(bad));
  });

  it("잘하는 타자가 못하는 타자보다 타율이 높다", () => {
    const good = buildPastPlayerStats(
      [mk({ ovr: 90, playerType: "batter", npcId: "A" })],
      SEED,
      YEAR,
    );
    const bad = buildPastPlayerStats(
      [mk({ ovr: 55, playerType: "batter", npcId: "A" })],
      SEED,
      YEAR,
    );
    const mean = (rs: typeof good) =>
      rs.reduce((s, r) => s + (r.stats as BatterSeasonStats).avg, 0) / rs.length;
    expect(mean(good)).toBeGreaterThan(mean(bad));
  });

  // ⚠ 2군은 기회가 적다 — 1군과 같은 경기 수면 층을 나눈 뜻이 없다
  it("2군은 1군보다 덜 뛴다", () => {
    const one = buildPastPlayerStats([mk({ playerType: "batter", npcId: "A" })], SEED, YEAR);
    const farm = buildPastPlayerStats(
      [mk({ playerType: "batter", leagueId: "LEAGUE_KBL_FARM", npcId: "A" })],
      SEED,
      YEAR,
    );
    const g = (rs: typeof one) => rs.reduce((s, r) => s + (r.stats as BatterSeasonStats).g, 0);
    expect(g(farm)).toBeLessThan(g(one));
  });

  describe("값이 야구다운가", () => {
    const many: PastStatsInput[] = [];
    for (let i = 0; i < 200; i++) {
      many.push(
        mk({
          npcId: `PLY_${i}`,
          ovr: 45 + (i % 50),
          age: 20 + (i % 16),
          playerType: i % 2 ? "batter" : "pitcher",
          leagueId: i % 3 === 0 ? "LEAGUE_KBL_FARM" : "LEAGUE_KBL",
        }),
      );
    }
    const rows = buildPastPlayerStats(many, SEED, YEAR);

    it("표본이 실제로 만들어졌다", () => {
      expect(rows.length).toBeGreaterThan(300);
    });

    it("투수 기록이 눈금 안이다", () => {
      for (const r of rows) {
        if (r.stats.type !== "pitcher") continue;
        const s = r.stats;
        expect(s.era, r.npcId).toBeGreaterThan(0);
        expect(s.era, r.npcId).toBeLessThan(10);
        expect(s.ip, r.npcId).toBeGreaterThan(0);
        expect(s.w + s.l, r.npcId).toBeLessThanOrEqual(s.g + 2);
        expect(s.er, r.npcId).toBeGreaterThanOrEqual(0);
        expect(s.whip, r.npcId).toBeGreaterThan(0);
      }
    });

    it("타자 기록이 눈금 안이다", () => {
      for (const r of rows) {
        if (r.stats.type !== "batter") continue;
        const s = r.stats;
        expect(s.avg, r.npcId).toBeGreaterThan(0.1);
        expect(s.avg, r.npcId).toBeLessThan(0.45);
        expect(s.h, r.npcId).toBeLessThanOrEqual(s.ab);
        expect(s.ab, r.npcId).toBeLessThanOrEqual(s.pa);
        expect(s.hr, r.npcId).toBeLessThanOrEqual(s.h);
        expect(s.obp, r.npcId).toBeGreaterThanOrEqual(s.avg - 0.001);
        expect(s.ops, r.npcId).toBeGreaterThan(s.obp);
      }
    });

    it("요약 문장이 비어 있지 않다", () => {
      for (const r of rows) expect(r.statLine.length, r.npcId).toBeGreaterThan(5);
    });
  });
});
