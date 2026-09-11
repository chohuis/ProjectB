// 독립 생존리그 진행 (Phase 5-6)
//
// store에 두지 않는 이유는 tournaments.ts와 같다 — 순위표를 읽고 Rust를 부르고
// 일정에 경기를 얹는 오케스트레이션이다. CLAUDE.md "절대 금지" 1항.

import type { SaveSeason, ScheduleEntry } from "../types/season";
import {
  IND_LEAGUE_ID,
  cutoff,
  generateStageSchedule,
  lastRegularStage,
  stageComplete,
  stageDef,
  stageStandings,
  stageStartingAt,
  type SurvivalState,
} from "../utils/survivalLeague";

export interface SurvivalProgress {
  state: SurvivalState;
  /** 일정에 새로 넣을 경기 */
  entries: ScheduleEntry[];
  /** 이번에 탈락한 팀 (알림용) */
  eliminated: string[];
  /** 3차가 끝나 최종 순위가 확정됐으면 그 순위 */
  finalRanking: string[] | null;
}

/**
 * 한 주 진행분을 계산한다.
 *
 * ① 이번 주에 시작하는 단계가 있으면 생존팀으로 일정을 짠다
 * ② 진행 중인 단계가 다 끝났으면 컷오프해서 다음 단계로 넘긴다
 *
 * 상태를 직접 쓰지 않고 돌려주기만 한다 — 호출부(advanceWeek)가 store에 반영한다.
 */
export async function progressSurvival(
  week: number,
  season: SaveSeason,
  state: SurvivalState,
  protagonistTeamId: string,
): Promise<SurvivalProgress | null> {
  const schedule = season.leagueSchedules?.[IND_LEAGUE_ID] ?? [];
  const withResults = [...schedule, ...season.schedule.filter((e) => e.leagueId === IND_LEAGUE_ID)];

  // ② 진행 중 단계 종료 판정이 먼저다 — 같은 주에 끝나고 다음이 시작될 수 있다
  if (state.stage >= 1 && stageComplete(state.stage, withResults)) {
    const def = stageDef(state.stage);
    if (def) {
      const st = stageStandings(state.stage, state.activeTeams, withResults);
      const cut = await cutoff(st, def.advanceCount);
      const isLast = state.stage >= lastRegularStage();
      const next: SurvivalState = {
        ...state,
        stage: state.stage + 1,
        activeTeams: cut.survivors,
        eliminated: { ...state.eliminated, [state.stage]: cut.eliminated },
        finalRanking: isLast ? cut.ranked : state.finalRanking,
      };
      // 다음 단계가 이번 주에 시작하면 일정까지 같이 짠다
      const nextDef = stageDef(next.stage);
      const entries =
        nextDef && nextDef.startWeek <= week
          ? await generateStageSchedule(
              nextDef,
              next.activeTeams,
              protagonistTeamId,
              season.seasonYear,
            )
          : [];
      return {
        state: next,
        entries,
        eliminated: cut.eliminated,
        finalRanking: isLast ? cut.ranked : null,
      };
    }
  }

  // ① 이번 주 개막 단계
  const due = stageStartingAt(week);
  if (due && state.stage < due.stage) {
    const teams = due.stage === 1 ? state.activeTeams : state.activeTeams;
    const entries = await generateStageSchedule(due, teams, protagonistTeamId, season.seasonYear);
    return {
      state: { ...state, stage: due.stage, activeTeams: teams },
      entries,
      eliminated: [],
      finalRanking: null,
    };
  }

  return null;
}

/** 정규 단계가 전부 끝났는가 (4차 포스트시즌으로 넘어갈 시점) */
export function regularStagesDone(state: SurvivalState): boolean {
  return state.stage > lastRegularStage() && state.finalRanking.length > 0;
}
