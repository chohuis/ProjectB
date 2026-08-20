import { describe, it, expect } from "vitest";
import {
  PRESEASON_GAMES, PRESEASON_START_WEEK, PRESEASON_END_WEEK, PRESEASON_LEAGUES,
  PRO_START_WEEK, ALL_TEAMS_BY_LEAGUE,
} from "../leagueScheduler";

/**
 * 시범경기 설정이 성립하는가 (CALENDAR_V2.md).
 *
 * ⚠ **`preseason` phase는 타입과 화면에 이미 있었는데 경기를 만드는 쪽이
 * 없었다.** `SchedulePage`가 "프리시즌"·"스프링 캠프" 라벨을 그릴 준비를
 * 해 두고 기다리고 있었다 — 만들기만 하면 되는 자리였다.
 */

describe("시범경기 설정", () => {
  it("정규 개막(W5) 앞의 4주다", () => {
    expect(PRESEASON_START_WEEK).toBe(1);
    expect(PRESEASON_END_WEEK).toBe(PRO_START_WEEK - 1);
  });

  it("팀당 12경기 — 실제 KBO 시범경기도 10경기 안팎이다", () => {
    expect(PRESEASON_GAMES).toBe(12);
  });

  it("4주에 담긴다 — 주 3경기", () => {
    const weeks = PRESEASON_END_WEEK - PRESEASON_START_WEEK + 1;
    expect(PRESEASON_GAMES / weeks).toBeLessThanOrEqual(6); // 월요일은 쉰다
    expect(PRESEASON_GAMES / weeks).toBe(3);
  });

  it("1군 셋만 치른다", () => {
    expect([...PRESEASON_LEAGUES]).toEqual(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
    // 2군은 없다 — 있으면 오르내리기 판단이 시범경기에 휘둘린다
    for (const lid of PRESEASON_LEAGUES) {
      expect(lid.endsWith("_FARM"), lid).toBe(false);
    }
  });

  it("치르는 리그가 전부 실재한다", () => {
    for (const lid of PRESEASON_LEAGUES) {
      expect((ALL_TEAMS_BY_LEAGUE[lid] ?? []).length, lid).toBeGreaterThan(1);
    }
  });

  it("정규와 안 겹친다", () => {
    expect(PRESEASON_END_WEEK).toBeLessThan(PRO_START_WEEK);
  });
});
