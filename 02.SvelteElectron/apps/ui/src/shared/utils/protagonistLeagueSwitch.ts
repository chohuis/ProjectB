/**
 * 시즌 중에 주인공의 리그가 바뀔 때(승강 · 2026-09-02) — `s.schedule` 과 `leagueSchedules` 를 맞바꾼다.
 *
 * 🔴 배경: "주인공 리그는 `s.schedule`, 나머지는 `leagueSchedules`" (CLAUDE.md). 강등이
 *   `setProtagonistTeam(_2, KBL_FARM)` 으로 소속만 옮기고 일정을 안 옮겨서, 일정 탭 상대가 전부
 *   옛 팀이고 우측 패널이 "예정된 경기 없음" 이었다(C 눈확인 09-02). 예전 주석 "leagueId 만 맞으면
 *   그대로 뛴다" 는 순위표에만 맞았다.
 *
 * 하는 일 (순수 함수 · store 는 update 로 감싼다):
 *   ① 지금 `s.schedule` 은 옛 리그로 돌려보낸다 — `leagueSchedules[from]` (주인공 표시는 지운다) →
 *      배경 시뮬이 옛 리그를 이어서 돌린다 (배경 시뮬은 `lid === 주인공 리그` 만 건너뛴다)
 *   ② 새 리그의 일정 `leagueSchedules[to]` 를 `s.schedule` 로 가져온다 — 주인공 팀 경기에 표시를 켠다
 *   ③ 순위·스탯도 같이 — 옛 것은 `leagueState[from]` 으로, 새 것은 `leagueState[to]` 에서
 *   ④ 같은 리그 안에서 팀만 바뀌면(트레이드) 일정은 그대로 두고 표시만 다시 켠다
 *
 * ⚠ 새 리그 일정이 없으면(비시즌 · 배경에 없는 리그) 아무것도 안 바꾼다 — 시즌 여는 자리가 맡는다.
 */
import type { SaveSeason, ScheduleEntry, LeagueSeasonState } from "../types/season";

type SwitchableSeason = Pick<SaveSeason, "leagueId" | "schedule" | "standings" | "stats" | "leagueSchedules" | "leagueState">;

const EMPTY_LEAGUE: LeagueSeasonState = { standings: [], stats: {}, playerConditions: {}, teamRotationIndex: {} };

function flagFor(teamId: string) {
  return (e: ScheduleEntry): ScheduleEntry => {
    const mine = e.homeTeamId === teamId || e.awayTeamId === teamId;
    return e.isProtagonistGame === mine ? e : { ...e, isProtagonistGame: mine };
  };
}

export function switchProtagonistLeague<T extends SwitchableSeason>(s: T, toLeagueId: string, teamId: string): T {
  const fromLeagueId = s.leagueId;
  if (fromLeagueId === toLeagueId) {
    // 같은 리그 · 팀만 바뀜 — 표시만 다시
    return { ...s, schedule: s.schedule.map(flagFor(teamId)) };
  }
  const incoming = s.leagueSchedules[toLeagueId];
  if (!incoming) return s;

  const leagueSchedules: Record<string, ScheduleEntry[]> = { ...s.leagueSchedules };
  delete leagueSchedules[toLeagueId];
  leagueSchedules[fromLeagueId] = s.schedule.map((e) => (e.isProtagonistGame ? { ...e, isProtagonistGame: false } : e));

  const fromState = s.leagueState[fromLeagueId] ?? EMPTY_LEAGUE;
  const toState = s.leagueState[toLeagueId] ?? EMPTY_LEAGUE;
  const leagueState: Record<string, LeagueSeasonState> = {
    ...s.leagueState,
    [fromLeagueId]: { ...fromState, standings: s.standings, stats: s.stats },
  };

  return {
    ...s,
    leagueId: toLeagueId,
    schedule: incoming.map(flagFor(teamId)),
    standings: toState.standings,
    stats: toState.stats,
    leagueSchedules,
    leagueState,
  };
}
