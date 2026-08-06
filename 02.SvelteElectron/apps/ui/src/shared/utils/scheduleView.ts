import type { ScheduleEntry } from "../types/season";

/**
 * 그 시즌의 **모든** 경기 — 주인공 리그와 나머지를 합친다.
 *
 * ⚠ **대회 경기는 두 군데로 나뉜다.**
 *
 *     주인공 리그   → `season.schedule`
 *     그 밖의 리그  → `season.leagueSchedules[리그]`   (`injectTournamentEntries`)
 *
 * 대회 진행 코드가 `schedule`만 읽고 있어서, **주인공이 고교면 대학 대회가
 * 통째로 멎었다** — 경기는 치러지는데 결과가 브래킷에 닿지 않는다.
 * 실측(2026-08-06, 주인공=고교):
 *
 *     왕중왕전       1라운드 4경기 소화, 승자 0
 *     은하기·여명기  예선 24·30경기 소화, 본선 브래킷 0
 *     고교 5개       전부 우승까지 정상  ← 주인공이 고교였기 때문
 *
 * **리그가 바뀌면 멎는 쪽도 바뀐다.** 주인공이 대학에 가면 이번엔 고교 대회가
 * 멎는다. 그래서 두 군데를 합치는 규칙을 **여기 하나**에 둔다 — 부르는 쪽마다
 * 각자 합치면 한 곳을 고쳐도 다른 곳이 남는다.
 */
export interface ScheduleSource {
  schedule?: readonly ScheduleEntry[];
  leagueSchedules?: Record<string, readonly ScheduleEntry[]>;
}

export function allScheduleEntries(season: ScheduleSource): ScheduleEntry[] {
  const own = Array.isArray(season.schedule) ? season.schedule : [];
  const others = Object.values(season.leagueSchedules ?? {});
  // ⚠ 배열이 아닌 값이 섞일 수 있다 — 세이브가 손상되면 `.flat()`이 터진다
  return [...own, ...others.filter(Array.isArray).flat()];
}

/** 경기 id → 승자. 결과가 있는 경기만 */
export function winnerById(season: ScheduleSource): Map<string, string> {
  return new Map(
    allScheduleEntries(season)
      .filter((e) => e.result)
      .map((e) => [e.id, e.result!.winnerId]),
  );
}

/** 경기 id 전체 — "이 라운드가 일정에 있나"를 물을 때 */
export function scheduledIdSet(season: ScheduleSource): Set<string> {
  return new Set(allScheduleEntries(season).map((e) => e.id));
}
