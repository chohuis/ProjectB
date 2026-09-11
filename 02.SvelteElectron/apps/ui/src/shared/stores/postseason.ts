import type { PostseasonSeries, ScheduleEntry } from "../types/season";
import type { SeasonStoreState } from "./season";
import { gameStore } from "./game";
import { get } from "svelte/store";

export function injectPostseasonEntries(
  s: SeasonStoreState,
  entries: ScheduleEntry[],
): SeasonStoreState {
  if (entries.length === 0) return s;
  return { ...s, schedule: [...s.schedule, ...entries] };
}

export function initPostseasonBracket(
  s: SeasonStoreState,
  leagueId: string,
  series: PostseasonSeries[],
): SeasonStoreState {
  return { ...s, postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: series } };
}

export function updatePostseasonBracket(
  s: SeasonStoreState,
  leagueId: string,
  updatedSeries: PostseasonSeries[],
): SeasonStoreState {
  return { ...s, postseasonBrackets: { ...s.postseasonBrackets, [leagueId]: updatedSeries } };
}

// ── 전국대회 (Phase 5-4) ──────────────────────────────────────

export function setTournamentBracket(
  s: SeasonStoreState,
  bracket: import("../utils/tournament").TournamentBracket,
): SeasonStoreState {
  return { ...s, tournaments: { ...(s.tournaments ?? {}), [bracket.tournamentId]: bracket } };
}

/**
 * 순위표를 한 벌 떠 둔다.
 *
 * 🔴 **`leagueState` 에는 내 리그가 없다.** 주인공이 뛰는 리그의 순위표는
 *   시즌 상태 최상위(`s.standings`)에 따로 있다 — `digest.ts` 의
 *   `myStandings` 주석이 같은 함정을 적어 뒀다. 그래서 `ownLeagueId` 를
 *   받은 자리만 내 리그도 같이 뜬다.
 *
 * ⚠ **대회 시드 셋(`prev_season`·`first_half`·`second_half_base`)은 안 건드린다.**
 *   그쪽에 내 리그를 더하면 지금까지 「현재 순위」로 떨어지던 시드가 바뀐다 —
 *   밸런스가 움직이는 변경이라 여기서 같이 하지 않는다(A·사용자 몫).
 */
export function captureStandingsSnapshot(
  s: SeasonStoreState,
  key: import("../utils/standingsSnapshot").SnapshotKey,
  ownLeagueId?: string,
): SeasonStoreState {
  const snapshots = { ...(s.standingsSnapshots ?? {}) };
  const put = (leagueId: string, rows: import("../types/season").Standing[]) => {
    if (rows.length === 0) return;
    snapshots[leagueId] = { ...(snapshots[leagueId] ?? {}), [key]: rows.map((x) => ({ ...x })) };
  };
  for (const [leagueId, st] of Object.entries(s.leagueState)) {
    if (!st?.standings) continue;
    put(leagueId, st.standings);
  }
  if (ownLeagueId) put(ownLeagueId, s.standings ?? []);
  return { ...s, standingsSnapshots: snapshots };
}

export function setSurvivalState(
  s: SeasonStoreState,
  survival: import("../utils/survivalLeague").SurvivalState,
): SeasonStoreState {
  return { ...s, survival };
}

/** 독립 단계 일정은 leagueSchedules에 쌓인다 — 단계마다 새 경기가 붙는다 */
/**
 * 리그 일정을 넣는다.
 *
 * 🔴 **주인공 리그면 `s.schedule` 에 넣는다** (2026-09-01).
 *
 * 이 저장소의 규칙은 **"주인공 리그는 `schedule`, 나머지는
 * `leagueSchedules`"** 다(`leagueSummary` 주석). 경기를 돌리는 자리가
 * 그 둘로 갈려 있다:
 *
 * ```
 *   s.schedule          주 경기 루프가 **전부** 돌린다 (advanceWeek)
 *   leagueSchedules     배경 시뮬이 돌린다 — 단 `lid === 주인공리그` 면 **건너뛴다**
 * ```
 *
 * 그런데 생존리그(독립)만 **주인공이 거기 있어도 `leagueSchedules` 에**
 * 넣고 있었다. 그러면 **둘 다 안 돌린다:**
 *
 * ```
 *   [일정끝:highschool]   INDEPENDENT 102/102   ← 배경이 돌린다 (주인공은 고교)
 *   [일정끝:independent]  INDEPENDENT 188/ 13   ← 주인공이 가면 **멈춘다**
 * ```
 *
 * 경기가 안 치러지니 `stageStandings` 에 넣을 결과가 없고, 순위표가 전원
 * 0-0 이 되고, 정렬이 **배열 순서**를 준다 — 순위가 **씨앗을 안 타고
 * 85주 내내 8** 이었다(트랙 B 실측).
 *
 * ⚠ 고교·프로가 멀쩡했던 건 그쪽 일정이 처음부터 `s.schedule` 에 있어서다.
 */
export function injectLeagueEntries(
  s: SeasonStoreState,
  leagueId: string,
  entries: ScheduleEntry[],
): SeasonStoreState {
  if (entries.length === 0) return s;
  if (leagueId === s.leagueId) {
    // 주인공 리그 — 주 경기 루프가 보는 곳에 넣는다
    const have = new Set(s.schedule.map((e) => e.id));
    const fresh = entries.filter((e) => !have.has(e.id));
    if (fresh.length === 0) return s;
    return { ...s, schedule: [...s.schedule, ...fresh] };
  }
  const cur = s.leagueSchedules[leagueId] ?? [];
  const have = new Set(cur.map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (fresh.length === 0) return s;
  return { ...s, leagueSchedules: { ...s.leagueSchedules, [leagueId]: [...cur, ...fresh] } };
}

export function setGroupStage(
  s: SeasonStoreState,
  stage: import("../utils/tournament").GroupStage,
): SeasonStoreState {
  return { ...s, groupStages: { ...(s.groupStages ?? {}), [stage.tournamentId]: stage } };
}

/** 이미 있는 id는 넣지 않는다 — 같은 주를 두 번 처리해도 경기가 중복되지 않게 */
export function injectTournamentEntries(
  s: SeasonStoreState,
  entries: ScheduleEntry[],
): SeasonStoreState {
  const have = new Set(s.schedule.map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (fresh.length === 0) return s;
  return { ...s, schedule: [...s.schedule, ...fresh] };
}

/**
 * 주차가 지났는데 아직 안 치러진 **대회 경기를 이번 주로 당긴다.**
 *
 * ⚠ 이게 없으면 대회가 1라운드에서 영영 멈춘다. 경기 처리 루프는
 * `e.week === 이번주`만 보는데(배경 리그는 `<= 이번주`라 다르다), 대회 다음
 * 라운드는 앞 라운드 결과가 나온 **뒤에** 일정에 들어간다. 그 사이 주차가
 * 넘어가면 그 경기는 아무도 안 보는 상태로 남는다.
 * 실측: 개나리기 R2 8경기가 `week 2`인 채 W40까지 미처리로 남았다.
 *
 * 실제 대회도 앞 라운드가 밀리면 다음 라운드가 곧바로 붙는다 — 날짜를
 * 당기는 게 규칙에 어긋나지 않는다.
 */
export function pullOverdueTournamentGames(
  s: SeasonStoreState,
  week: number,
  gameDate: string,
): SeasonStoreState {
  let changed = false;
  const schedule = s.schedule.map((e) => {
    if (!e.isTournament || e.result || e.week >= week) return e;
    changed = true;
    return { ...e, week, gameDate };
  });
  return changed ? { ...s, schedule } : s;
}

export function setAblConferences(
  s: SeasonStoreState,
  east: string[],
  west: string[],
): SeasonStoreState {
  return { ...s, ablEastTeams: east, ablWestTeams: west };
}

export async function flushAllLeagueStatsToDb(
  s: SeasonStoreState,
  seasonYear: number,
): Promise<void> {
  if (!window.projectB?.npcFlushSeasonStats) return;
  const slotId = get(gameStore).currentSlotId ?? "default";
  for (const [leagueId, ls] of Object.entries(s.leagueState)) {
    if (!ls.stats || Object.keys(ls.stats).length === 0) continue;
    const statsByPlayer: Record<string, object> = {};
    for (const [npcId, stat] of Object.entries(ls.stats)) {
      if (stat.type === "pitcher") {
        statsByPlayer[npcId] = {
          role: "pitcher",
          games: stat.g,
          wins: stat.w,
          losses: stat.l,
          saves: stat.sv,
          holds: stat.hd,
          ip: stat.ip,
          er: stat.er,
          hitsAllowed: stat.h,
          strikeouts: stat.k,
          walks: stat.bb,
          pitchCount: 0,
          atBats: 0,
          hits: 0,
          homeRuns: 0,
          rbi: 0,
          walksBat: 0,
          strikeoutsBat: 0,
          stolenBases: 0,
        };
      } else {
        statsByPlayer[npcId] = {
          role: "batter",
          games: stat.g,
          wins: 0,
          losses: 0,
          saves: 0,
          holds: 0,
          ip: 0,
          er: 0,
          hitsAllowed: 0,
          strikeouts: 0,
          walks: 0,
          pitchCount: 0,
          atBats: stat.ab,
          hits: stat.h,
          homeRuns: stat.hr,
          rbi: stat.rbi,
          walksBat: stat.bb,
          strikeoutsBat: stat.k,
          stolenBases: stat.sb,
        };
      }
    }
    await window.projectB.npcFlushSeasonStats(
      JSON.stringify({ slotId, season: seasonYear, leagueId, statsByPlayer }),
    );
  }
}
