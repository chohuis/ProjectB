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

/**
 * **넉아웃(대회 본선) 경기 id** — 무승부로 끝나면 안 되는 경기들.
 *
 * 🔴 **`isTournament` 로는 못 가른다.** 조별예선(은하기·여명기)도 그 깃발을
 *   달고 있는데 예선은 리그전이라 무승부가 정상이다. 넉아웃인지는 **브래킷에
 *   그 경기가 있는지**가 정한다 — 일정 id 와 `BracketMatch.id` 가 같은 값이다
 *   (`bracket_to_schedule` 이 `m.id` 를 그대로 쓴다).
 *
 * 🔴 **왜 필요한가**: 넉아웃이 무승부면 `result.winnerId` 가 빈 문자열이고,
 *   `advanceTournamentRoundNative` 는 참가팀이 아닌 승자를 무시하므로 그
 *   경기에 승자가 안 찍힌다. 그 라운드는 `live.every(winnerTeamId)` 를 영영
 *   못 채워 **매 주 다시 확정되고 같은 소식 id 가 다시 난다** — 실사용자
 *   세이브의 `msg-tour-my-TOUR_HS_JANGMI-r1-2028`(장미기 R1 M02 · 동래 4:4
 *   거제 · 2026-09-06 실측)이 그것이고, Svelte 가 키 중복으로 던져 화면이
 *   통째로 굳었다. 대회는 그 라운드에서 죽는다(R2 는 7경기를 치르고도
 *   반영이 안 됐다).
 */
export function knockoutMatchIds(
  season: { tournaments?: Record<string, { matches?: readonly { id: string }[] }> | null },
): Set<string> {
  const out = new Set<string>();
  for (const b of Object.values(season.tournaments ?? {})) {
    for (const m of b?.matches ?? []) out.add(m.id);
  }
  return out;
}
