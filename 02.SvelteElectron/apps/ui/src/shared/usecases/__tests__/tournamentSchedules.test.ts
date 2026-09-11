import { describe, it, expect } from "vitest";
import { allScheduleEntries, winnerById, scheduledIdSet } from "../../utils/scheduleView";
import type { ScheduleEntry } from "../../types/season";

/**
 * ⚠ **대회 경기는 두 군데로 나뉜다.**
 *
 *   주인공 리그   → `season.schedule`
 *   그 밖의 리그  → `season.leagueSchedules[리그]`   (`injectTournamentEntries`)
 *
 * 진행 코드가 `schedule`만 읽어서 **주인공이 고교면 대학 대회가 통째로 멎었다** —
 * 경기는 치러지는데 결과가 브래킷에 닿지 않는다. 실측(2026-08-06):
 *
 *   왕중왕전       1라운드 4경기 소화, 승자 0
 *   은하기·여명기  예선 24·30경기 소화, 본선 브래킷 0
 *   고교 5개       전부 우승까지 정상  ← 주인공이 고교였기 때문
 *
 * **리그가 바뀌면 멎는 쪽도 바뀐다.**
 *
 * ⚠ 처음엔 `promoteFinishedGroupStages`를 직접 불러 검사하려 했는데, **결함을
 * 넣어도 통과했다** — 결함이 있으면 "예선 미완"으로 조용히 넘어가고 없어도
 * 엔진이 없어 빈 배열이라, 반환값이 양쪽 다 `[]`였다. 그래서 합치는 규칙을
 * `scheduleView`로 빼내 **그걸 직접** 검사한다.
 */

const entry = (id: string, won?: string): ScheduleEntry =>
  ({
    id,
    week: 14,
    gameDate: "2026-05-01",
    homeTeamId: "T_A",
    awayTeamId: "T_B",
    phase: "season",
    isFriendly: false,
    result: won ? { winnerId: won, loserId: "T_B", homeScore: 3, awayScore: 1 } : undefined,
  }) as unknown as ScheduleEntry;

describe("모든 경기 모으기", () => {
  it("⚠ 내 리그 밖의 경기도 들어온다 — 이게 빠져서 대학 대회가 멎었다", () => {
    const ids = allScheduleEntries({
      schedule: [entry("HS_1")],
      leagueSchedules: {
        LEAGUE_UNIVERSITY: [entry("UNIV_1"), entry("UNIV_2")],
        LEAGUE_KBL: [entry("KBL_1")],
      },
    }).map((e) => e.id);
    expect(ids).toEqual(["HS_1", "UNIV_1", "UNIV_2", "KBL_1"]);
  });

  it("한쪽이 비어도 된다", () => {
    expect(allScheduleEntries({ schedule: [entry("A")] }).map((e) => e.id)).toEqual(["A"]);
    expect(allScheduleEntries({ leagueSchedules: { L: [entry("B")] } }).map((e) => e.id)).toEqual([
      "B",
    ]);
    expect(allScheduleEntries({})).toEqual([]);
  });

  it("⚠ 배열이 아닌 값이 섞여도 안 터진다 — 세이브가 손상될 수 있다", () => {
    const bad = {
      schedule: undefined as never,
      leagueSchedules: { L1: [entry("A")], L2: null as never, L3: "oops" as never },
    };
    expect(allScheduleEntries(bad).map((e) => e.id)).toEqual(["A"]);
  });
});

describe("승자 표", () => {
  it("⚠ 내 리그 밖 경기의 승자도 읽는다", () => {
    const w = winnerById({
      schedule: [entry("HS_1", "T_A")],
      leagueSchedules: { LEAGUE_UNIVERSITY: [entry("UNIV_1", "T_B")] },
    });
    expect(w.get("UNIV_1")).toBe("T_B");
    expect(w.size).toBe(2);
  });

  it("결과 없는 경기는 안 들어간다 — 아직 안 치른 것이다", () => {
    const w = winnerById({ leagueSchedules: { L: [entry("A"), entry("B", "T_A")] } });
    expect([...w.keys()]).toEqual(["B"]);
  });
});

describe("일정 id 집합", () => {
  it('결과 여부와 무관하게 전부 — "이 라운드가 일정에 있나"를 묻는 자리다', () => {
    const s = scheduledIdSet({
      schedule: [entry("A")],
      leagueSchedules: { L: [entry("B", "T_A")] },
    });
    expect(s.has("A")).toBe(true);
    expect(s.has("B")).toBe(true);
    expect(s.size).toBe(2);
  });
});
