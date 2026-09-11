import { describe, it, expect } from "vitest";
import { injectLeagueEntries } from "../postseason";
import type { SeasonStoreState } from "../season";
import type { ScheduleEntry } from "../../types/season";
import { makeEmptySeason } from "../../types/season";
import { makeStandings } from "../../utils/leagueScheduler";

/**
 * 주인공 리그 일정이 어디로 가야 하는가 — 그리고 순위표를 부분 집합으로
 * 갈아끼우면 무슨 일이 나는가.
 *
 * 🔴 **같은 결함이 두 번 났다** (2026-09-01). 형태가 하나다:
 *
 * ```
 *   s.schedule        주 경기 루프가 **전부** 돌린다
 *   leagueSchedules   배경 시뮬이 돌린다 — 단 `lid === 주인공리그` 면 **건너뛴다**
 * ```
 *
 * 주인공 리그 일정을 `leagueSchedules` 에 넣으면 **둘 다 안 돌린다.**
 * 아무도 안 죽고 로그도 안 남는다 — 순위표가 전원 0-0 이 되고 정렬이
 * 배열 순서를 주니 순위가 씨앗을 안 타고 85주 내내 고정된다.
 *
 * 그때 대증요법으로 순위표를 따로 만들어 얹었는데, 그게 두 번째 결함을
 * 낳았다 — 아래 `startNewSeason` 항목.
 */
describe("주인공 리그 일정과 순위표", () => {
  const base = (leagueId: string): SeasonStoreState =>
    ({
      leagueId,
      schedule: [],
      leagueSchedules: {},
    }) as unknown as SeasonStoreState;

  const entry = (id: string, leagueId: string): ScheduleEntry =>
    ({ id, leagueId, week: 3, homeTeamId: "A", awayTeamId: "B" }) as unknown as ScheduleEntry;

  it("주인공 리그 일정은 s.schedule 로 간다", () => {
    const s = base("LEAGUE_INDEPENDENT");
    const next = injectLeagueEntries(s, "LEAGUE_INDEPENDENT", [
      entry("INDS1_1", "LEAGUE_INDEPENDENT"),
      entry("INDS1_2", "LEAGUE_INDEPENDENT"),
    ]);
    expect(next.schedule.map((e) => e.id)).toEqual(["INDS1_1", "INDS1_2"]);
    // 🔴 여기 들어가면 아무도 안 돌린다
    expect(next.leagueSchedules["LEAGUE_INDEPENDENT"] ?? []).toHaveLength(0);
  });

  it("남의 리그 일정은 leagueSchedules 로 간다", () => {
    const s = base("LEAGUE_INDEPENDENT");
    const next = injectLeagueEntries(s, "LEAGUE_KBL", [entry("KBL_1", "LEAGUE_KBL")]);
    expect(next.leagueSchedules["LEAGUE_KBL"].map((e) => e.id)).toEqual(["KBL_1"]);
    expect(next.schedule).toHaveLength(0);
  });

  it("같은 주를 두 번 처리해도 주인공 일정이 중복되지 않는다", () => {
    const s = base("LEAGUE_INDEPENDENT");
    const once = injectLeagueEntries(s, "LEAGUE_INDEPENDENT", [
      entry("INDS1_1", "LEAGUE_INDEPENDENT"),
    ]);
    const twice = injectLeagueEntries(once, "LEAGUE_INDEPENDENT", [
      entry("INDS1_1", "LEAGUE_INDEPENDENT"),
    ]);
    expect(twice.schedule).toHaveLength(1);
    // 바뀐 게 없으면 같은 객체를 준다 — 화면이 헛돌지 않게
    expect(twice).toBe(once);
  });

  /**
   * ⚠ **`standings` 는 순위만이 아니라 멤버십이다.**
   *
   * `startNewSeason` 이 다음 시즌 팀 목록을 `s.standings` 에서 가져간다
   * (`season.ts`). 그래서 순위표를 부분 집합으로 갈아끼우면 리그가
   * **시즌마다 그만큼 쪼그라든다.**
   *
   * 실측(회귀): 생존리그 `stageStandings`(현재 단계의 `activeTeams` 만
   * 담는다)를 최상위에 얹었더니 **KBL 1군 발동 444 → 0**, 9시즌 448주를
   * 전부 독립에서 보냈다.
   */
  describe("startNewSeason 의 팀 목록", () => {
    const TEN = Array.from({ length: 10 }, (_, i) => `TEAM_${i}`);

    it("순위표 전체를 넘기면 팀 수가 유지된다", () => {
      const full = makeStandings(TEN);
      const next = makeEmptySeason(
        "LEAGUE_INDEPENDENT",
        2027,
        52,
        full.map((st) => st.teamId),
      );
      expect(next.standings).toHaveLength(10);
    });

    it("🔴 부분 집합을 넘기면 그만큼 준다 — 이게 회귀의 형태다", () => {
      // 생존리그 3단계: 10팀 중 4팀만 살아 있다
      const survivors = makeStandings(TEN.slice(0, 4));
      const next = makeEmptySeason(
        "LEAGUE_INDEPENDENT",
        2027,
        52,
        survivors.map((st) => st.teamId),
      );
      expect(next.standings).toHaveLength(4);
      // 다음 시즌에 또 얹으면 4 → 그보다 적게. 돌아올 길이 없다
    });
  });
});
