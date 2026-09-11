import { describe, it, expect } from "vitest";
import * as W from "../seasonWeeks";
import { PRO_START_WEEK, PRO_END_WEEK, HS_END_WEEK } from "../leagueScheduler";
import { TOURNAMENTS } from "../leagueTeams.generated";

/**
 * 시즌 이벤트 주차가 **서로 어긋나지 않는가** (CALENDAR_V2.md).
 *
 * 🔴 오프시즌은 앞뒤가 얽혀 있다 — 드래프트가 진로 결과보다 뒤에 오거나
 * FA 재트리거가 스토브리그보다 먼저 시작하면 **그 이벤트가 영영 안 일어난다.**
 * 오류도 안 난다. 그래서 순서를 검사로 못박는다.
 */

describe("순서가 맞는가", () => {
  it("진로허브가 진로 결과보다 앞선다", () => {
    // 🔴 **드래프트는 별도 주차가 없다** — 진로 결과와 같은 주에 돈다
    // (`advanceWeek.ts`의 "배경 고교 졸업생 드래프트"). 상수를 만들었다가
    // 코드를 따라가 보고 지웠다
    const hubs = [W.HS_CAREER_HUB_WEEK, W.UNIV_CAREER_HUB_WEEK, W.INDIE_CAREER_HUB_WEEK];
    for (const h of hubs) {
      expect(h, `허브 W${h}`).toBeLessThan(W.CAREER_RESULT_WEEK);
    }
  });

  it("오프시즌 시작 → 스토브리그 → FA 재트리거", () => {
    expect(W.OFFSEASON_START_WEEK).toBeLessThan(W.STOVE_LEAGUE_WEEK);
    expect(W.STOVE_LEAGUE_WEEK).toBeLessThanOrEqual(W.FA_RETRY_START_WEEK);
    expect(W.FA_RETRY_START_WEEK).toBeLessThan(W.FA_RETRY_END_WEEK);
  });

  it("체육부대 후보 공개 → 선발 결과", () => {
    expect(W.SPORTS_UNIT_CANDIDATES_WEEK).toBeLessThan(W.MILITARY_RESULT_WEEK);
  });

  it("진로 결과가 오프시즌 시작보다 앞선다 — 계약이 그 뒤에 온다", () => {
    expect(W.CAREER_RESULT_WEEK).toBeLessThanOrEqual(W.OFFSEASON_START_WEEK);
  });
});

describe("리그 기간과 어긋나지 않는가", () => {
  it("트레이드 데드라인이 정규 안에 있다", () => {
    expect(W.TRADE_DEADLINE_WEEK).toBeGreaterThan(PRO_START_WEEK);
    expect(W.TRADE_DEADLINE_WEEK).toBeLessThan(PRO_END_WEEK);
  });

  it("오프시즌 시작이 정규 종료 뒤다", () => {
    expect(W.OFFSEASON_START_WEEK).toBeGreaterThan(PRO_END_WEEK);
  });

  it("진로허브가 각 무대 종료 뒤다", () => {
    // 고교 — 주말리그(W26)와 마지막 대회가 다 끝나야 진로를 정한다
    const hsLast = TOURNAMENTS.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL").reduce((a, b) =>
      a.endWeek > b.endWeek ? a : b,
    );
    expect(W.HS_CAREER_HUB_WEEK, `고교 대회 종료 W${hsLast.endWeek}`).toBeGreaterThan(
      hsLast.endWeek,
    );
    expect(W.HS_CAREER_HUB_WEEK).toBeGreaterThan(HS_END_WEEK);

    // 대학 — 여명기가 마지막이다
    const univLast = TOURNAMENTS.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY").reduce((a, b) =>
      a.endWeek > b.endWeek ? a : b,
    );
    expect(W.UNIV_CAREER_HUB_WEEK, `대학 대회 종료 W${univLast.endWeek}`).toBeGreaterThan(
      univLast.endWeek,
    );
  });

  it("모든 이벤트가 1~52 안에 있다", () => {
    for (const [k, v] of Object.entries(W)) {
      if (typeof v !== "number") continue;
      expect(v, k).toBeGreaterThanOrEqual(1);
      expect(v, k).toBeLessThanOrEqual(52);
    }
  });
});

describe("겨울에 시즌 일이 남지 않는가", () => {
  it("병역·스토브리그를 뺀 이벤트가 W35 전에 끝난다", () => {
    // 오프시즌 전용 이벤트만 W35 이후여야 한다
    const inSeason = [
      W.TRADE_DEADLINE_WEEK,
      W.HS_CAREER_HUB_WEEK,
      W.UNIV_CAREER_HUB_WEEK,
      W.INDIE_CAREER_HUB_WEEK,
      W.INDIE_SEASON_REVIEW_WEEK,
      W.CAREER_RESULT_WEEK,
    ];
    for (const w of inSeason) expect(w).toBeLessThanOrEqual(W.OFFSEASON_START_WEEK);
  });
});
