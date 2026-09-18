import { describe, it, expect } from "vitest";
import { postseasonResultOf } from "../seasonCareerRecord";
import type { ScheduleEntry } from "../../types/season";
import type { TournamentBracket, BracketMatch } from "../../utils/tournament";

/**
 * **학교 시즌 성적은 대회에서 나온다** (2026-09-18 · 배선 결함 수정).
 *
 * 🔴 `postseasonResultOf` 가 `phase === "postseason"` 일정만 보는 동안
 *   학교 기록의 `psResult` 는 **한 번도 안 붙었다** — 그 일정을 만드는
 *   `injectLeaguePostseason` 이 고교·대학을 명시적으로 제외하기 때문이다.
 *   그 결과 `calcHsBaseballScore` 의 팀 성적 항(우승 100·준우승 60·4강 30·
 *   미진출 10)이 늘 0 이고 수상 항만 남았다(실측 0/15/30).
 *
 * ⚠ **대조군을 같이 둔다** — 대회를 안 넘기면 미진출이어야 하고, 프로 리그는
 *   예전대로 포스트시즌 일정을 봐야 한다. 배선을 빼면 이 검사가 빨강이다.
 */
const m = (
  round: number,
  slot: number,
  home: string | null,
  away: string | null,
  winner: string | null = null,
): BracketMatch => ({
  id: `M${round}-${slot}`,
  round,
  slot,
  week: 10,
  gameDate: "2026-05-10",
  homeTeamId: home,
  awayTeamId: away,
  isBye: false,
  winnerTeamId: winner,
  isProtagonistGame: false,
});

/** 4팀 대회 — 엔진이 내는 1-based 라운드 그대로. MY 는 늘 결승에 오른다 */
const tour = (id: string, leagueId: string, finalWinner: string): TournamentBracket => ({
  tournamentId: id,
  leagueId,
  seasonYear: 2026,
  bracketSize: 4,
  totalRounds: 2,
  byeCount: 0,
  matches: [m(1, 0, "MY", "B", "MY"), m(1, 1, "C", "D", "C"), m(2, 0, "MY", "C", finalWinner)],
});

const psEntry = (id: string, home: string, away: string, winnerId?: string): ScheduleEntry =>
  ({
    id,
    week: 45,
    gameDate: "2026-11-01",
    homeTeamId: home,
    awayTeamId: away,
    phase: "postseason",
    ...(winnerId
      ? {
          result: {
            homeScore: 3,
            awayScore: 1,
            winnerId,
            loserId: winnerId === home ? away : home,
            playerLines: [],
          },
        }
      : {}),
  }) as unknown as ScheduleEntry;

describe("학교 — 대회로 결산한다", () => {
  it("🔴 고교 우승이 기록에 남는다 (예전엔 undefined 였다)", () => {
    const s = {
      schedule: [],
      tournaments: { T: tour("TOUR_HS_GAENARI", "LEAGUE_HIGHSCHOOL", "MY") },
    };
    expect(postseasonResultOf(s, "MY", "LEAGUE_HIGHSCHOOL")).toBe("champion");
  });

  it("그 해 제일 멀리 간 대회를 쓴다 — 마지막 대회가 아니다", () => {
    const s = {
      schedule: [],
      tournaments: {
        A: tour("TOUR_HS_GAENARI", "LEAGUE_HIGHSCHOOL", "MY"),
        B: tour("TOUR_HS_PAEWANG", "LEAGUE_HIGHSCHOOL", "C"),
      },
    };
    expect(postseasonResultOf(s, "MY", "LEAGUE_HIGHSCHOOL")).toBe("champion");
  });

  it("대학도 같은 자리다", () => {
    const s = {
      schedule: [],
      tournaments: { T: tour("TOUR_UNIV_WANGJUNGWANG", "LEAGUE_UNIVERSITY", "C") },
    };
    expect(postseasonResultOf(s, "MY", "LEAGUE_UNIVERSITY")).toBe("runnerUp");
  });

  it("⚠ 대조군 — 대회가 없으면 미진출이다 (null 이 아니다)", () => {
    expect(postseasonResultOf({ schedule: [], tournaments: {} }, "MY", "LEAGUE_HIGHSCHOOL")).toBe(
      "notQualified",
    );
  });

  it("⚠ 대조군 — 학교는 포스트시즌 일정을 안 본다", () => {
    // 학교에 포스트시즌 일정이 섞여 들어도 대회 쪽 답이 나와야 한다.
    // 두 정본이 갈리면 화면과 진학 점수가 어긋난다
    const s = {
      schedule: [psEntry("PS_FINAL_X", "MY", "C", "MY")],
      tournaments: { T: tour("TOUR_HS_GAENARI", "LEAGUE_HIGHSCHOOL", "C") },
    };
    expect(postseasonResultOf(s, "MY", "LEAGUE_HIGHSCHOOL")).toBe("runnerUp");
  });
});

describe("프로·독립 — 포스트시즌 그대로다", () => {
  it("우승·준우승", () => {
    const s = { schedule: [psEntry("PS_FINAL_KBL", "MY", "C", "MY")] };
    expect(postseasonResultOf(s, "MY", "LEAGUE_KBL")).toBe("champion");
    expect(postseasonResultOf(s, "C", "LEAGUE_KBL")).toBe("runnerUp");
  });

  it("4강에서 진 팀", () => {
    const s = {
      schedule: [psEntry("PS_SEMI_1", "ME2", "C"), psEntry("PS_FINAL_KBL", "MY", "C", "MY")],
    };
    expect(postseasonResultOf(s, "ME2", "LEAGUE_KBL")).toBe("semiFinal");
  });

  it("못 올라갔으면 미진출 · 결승 결과가 없으면 아직 모른다(null)", () => {
    expect(
      postseasonResultOf(
        { schedule: [psEntry("PS_FINAL_KBL", "MY", "C", "MY")] },
        "남",
        "LEAGUE_KBL",
      ),
    ).toBe("notQualified");
    expect(
      postseasonResultOf({ schedule: [psEntry("PS_FINAL_KBL", "MY", "C")] }, "MY", "LEAGUE_KBL"),
    ).toBeNull();
    expect(postseasonResultOf({ schedule: [] }, "MY", "LEAGUE_KBL")).toBeNull();
  });
});
