import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOURNAMENTS } from "../leagueTeams.generated";
import { HS_START_WEEK, HS_END_WEEK, PRO_END_WEEK } from "../leagueScheduler";

/**
 * 대회가 **시즌 안에 있는가** (CALENDAR_V2.md).
 *
 * 🔴 **2026-08-20까지 국화기가 10월 · 패왕기가 12월에 열렸다.**
 * `W1 = 3월 1일`이라 W31은 10월, W40은 12월이다. 실제 고교야구는
 * 주말리그 4/17~7/18 · 대통령배 7월 말 · 봉황대기 8월이고 **9월엔 드래프트**다.
 *
 * ⚠ **CSV가 정본이다**(`resource/data/seeds/onepitch/tournaments.csv`).
 * `leagueTeams.generated.ts`는 생성물이라 둘이 갈릴 수 있어 **여기서 대조**한다 —
 * 생성 스크립트가 파이썬이라 이 환경에서 못 돌리므로 더 그렇다.
 */

const CSV = join(__dirname, "../../../../../../resource/data/seeds/onepitch/tournaments.csv");

function csvRows(): Array<Record<string, string>> {
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const c = l.split(","); const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
}

describe("대회 주차가 CSV(정본)와 같다", () => {
  it("생성물이 CSV와 안 갈렸다", () => {
    const byId = new Map(TOURNAMENTS.map((t) => [t.id, t]));
    for (const r of csvRows()) {
      const t = byId.get(r.id);
      expect(t, `${r.id}가 생성물에 없다`).toBeDefined();
      expect(t!.startWeek, `${r.name} 시작`).toBe(Number(r.startWeek));
      expect(t!.endWeek, `${r.name} 끝`).toBe(Number(r.endWeek));
    }
  });
});

describe("대회가 실제 시기에 있다", () => {
  it("고교 대회가 전부 드래프트(W31) 전에 끝난다", () => {
    // 3학년이 대회를 다 치르고 지명을 받아야 한다
    for (const t of TOURNAMENTS.filter((x) => x.leagueId === "LEAGUE_HIGHSCHOOL")) {
      expect(t.endWeek, `${t.name} W${t.endWeek}`).toBeLessThan(31);
    }
  });

  it("고교 대회가 주말리그 시작(W7) 뒤에 열린다", () => {
    // 리그도 안 했는데 대회부터 하면 시드(직전 성적)를 뽑을 수 없다
    for (const t of TOURNAMENTS.filter((x) => x.leagueId === "LEAGUE_HIGHSCHOOL")) {
      expect(t.startWeek, `${t.name} W${t.startWeek}`).toBeGreaterThanOrEqual(HS_START_WEEK);
    }
  });

  it("대학 대회가 정규 기간(~W28) 안에서 끝난다", () => {
    for (const t of TOURNAMENTS.filter((x) => x.leagueId === "LEAGUE_UNIVERSITY")) {
      expect(t.endWeek, `${t.name} W${t.endWeek}`).toBeLessThanOrEqual(PRO_END_WEEK);
    }
  });

  it("겨울(W36~52)에 열리는 대회가 없다", () => {
    // 🔴 이게 옛 결함이다 — 패왕기가 W40~41(12월)이었다
    for (const t of TOURNAMENTS) {
      expect(t.startWeek, `${t.name} W${t.startWeek}`).toBeLessThan(36);
    }
  });

  it("같은 리그 대회끼리 안 겹친다", () => {
    for (const lid of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]) {
      const ts = TOURNAMENTS.filter((t) => t.leagueId === lid)
        .sort((a, b) => a.startWeek - b.startWeek);
      for (let i = 1; i < ts.length; i++) {
        expect(ts[i].startWeek, `${ts[i - 1].name} → ${ts[i].name}`)
          .toBeGreaterThan(ts[i - 1].endWeek);
      }
    }
  });

  it("고교 마지막 대회가 주말리그 종료(W26) 언저리다", () => {
    // 패왕기는 시즌 최종 왕중왕이라 리그가 끝난 뒤여야 뜻이 산다
    const last = TOURNAMENTS.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL")
      .reduce((a, b) => (a.endWeek > b.endWeek ? a : b));
    expect(last.startWeek).toBeGreaterThanOrEqual(HS_END_WEEK);
  });
});
