// 대회 시드용 순위 스냅샷 (Phase 5-5a)
//
// 대회마다 "어느 시점 순위로 시드를 매기나"가 다르다 (02_고교.md §4-2):
//   개나리기 = 전년 권역 순위 · 장미기/무궁화기 = 전반기 · 패왕기 = 후반기
// 그런데 주말리그는 W2~45로 통째라 전·후반기 경계가 데이터에 없다.
// → **무궁화기(여름방학 대회)를 경계로 삼는다.** 기획서 캘린더가
//   "4~6월 전반기 / 7~8월 무궁화기(방학) / 9~11월 후반기"라고 적었다.

import type { Standing } from "../types/season";
import { TOURNAMENTS, type TournamentSeedSource } from "./leagueTeams.generated";

/** 전반기 = 무궁화기 시작 직전까지 */
export const FIRST_HALF_END_WEEK =
  (TOURNAMENTS.find((t) => t.id === "TOUR_HS_MUGUNGHWA")?.startWeek ?? 20) - 1;

/** 후반기 = 무궁화기 종료 다음 주부터 */
export const SECOND_HALF_START_WEEK =
  (TOURNAMENTS.find((t) => t.id === "TOUR_HS_MUGUNGHWA")?.endWeek ?? 22) + 1;

export type SnapshotKey = "prev_season" | "first_half" | "second_half_base";

/** leagueId → 스냅샷 종류 → 그 시점의 순위표 */
export type StandingsSnapshots = Record<string, Partial<Record<SnapshotKey, Standing[]>>>;

/**
 * 두 순위표의 차분. 후반기 순위 = (현재 누적) − (후반기 시작 시점 누적).
 *
 * 패왕기가 "그해 최강전"이려면 시즌 전체가 아니라 **후반기 성적만** 봐야 한다.
 * 누적 순위를 그대로 쓰면 3월에 잘한 팀이 11월까지 상위권에 고정된다.
 */
export function diffStandings(current: Standing[], base: Standing[]): Standing[] {
  const baseOf = new Map(base.map((s) => [s.teamId, s]));
  return current.map((c) => {
    const b = baseOf.get(c.teamId);
    if (!b) return c;
    const wins = c.wins - b.wins;
    const losses = c.losses - b.losses;
    const draws = c.draws - b.draws;
    const played = wins + losses + draws;
    return {
      ...c,
      wins, losses, draws,
      winPct: played > 0 ? wins / played : 0,
      runsFor: c.runsFor - b.runsFor,
      runsAgainst: c.runsAgainst - b.runsAgainst,
    };
  });
}

/**
 * 전년 순위가 없는 **첫 시즌**용 합성 순위표.
 *
 * refs의 고정 세계관(전력★ + 과거 5시즌 순위)에서 만든다 — DESIGN §7.1이
 * 이걸 "모든 플레이에서 동일한 고정값"으로 정했으므로 첫 대회 시드의 근거로 쓸 수 있다.
 * "한성고 = 최고 명문"이 1학년 봄 개나리기부터 먹힌다.
 */
export function syntheticStandings(
  teams: { id: string; power?: number; history?: { seasonRanks?: { rank: number }[] } }[],
): Standing[] {
  return teams.map((t) => {
    const ranks = t.history?.seasonRanks ?? [];
    // 과거 순위는 낮을수록 강하다. 없으면 중위(6)로 둔다.
    const avgRank = ranks.length > 0
      ? ranks.reduce((a, r) => a + r.rank, 0) / ranks.length
      : 6;
    // 전력★ 1~5를 0~1로, 과거순위 1~12위를 1~0으로 정규화해 반반 섞는다.
    const powerScore = ((t.power ?? 3) - 1) / 4;
    const rankScore = Math.max(0, Math.min(1, (12 - avgRank) / 11));
    const winPct = 0.5 * powerScore + 0.5 * rankScore;
    return {
      teamId: t.id,
      wins: 0, losses: 0, draws: 0,
      winPct,
      runsFor: 0, runsAgainst: 0,
      streak: "", last10: "",
    };
  });
}

/**
 * 대회가 요구하는 시점의 순위표를 고른다.
 *
 * 스냅샷이 없으면 현재 순위표로 떨어진다 — 첫 시즌이거나 아직 그 시점을
 * 지나지 않은 경우다. 조용히 틀린 값을 쓰느니 현재값이 낫다.
 */
export function standingsForSeed(
  seedSource: TournamentSeedSource,
  leagueId: string,
  current: Standing[],
  snapshots: StandingsSnapshots,
  fallbackFirstSeason: Standing[] | null = null,
): Standing[] {
  const snap = snapshots[leagueId] ?? {};
  switch (seedSource) {
    case "prev_season":
      return snap.prev_season ?? fallbackFirstSeason ?? current;
    case "first_half":
      return snap.first_half ?? current;
    case "second_half":
      return snap.second_half_base ? diffStandings(current, snap.second_half_base) : current;
    case "open":
    default:
      return current;
  }
}

/** 이 주차에 찍어야 할 스냅샷 종류 (없으면 null) */
export function snapshotDueAt(week: number): SnapshotKey | null {
  if (week === FIRST_HALF_END_WEEK) return "first_half";
  if (week === SECOND_HALF_START_WEEK) return "second_half_base";
  return null;
}
