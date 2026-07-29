// 독립 4단계 생존리그 (Phase 5-6)
//
// 리그도 대회도 아닌 제3의 형식. 매 단계 하위권이 통째로 탈락하며 좁혀진다
// (04_독립.md §3). 각 단계는 이전 대진을 이어받지 않고 생존팀끼리 새로 돈다 —
// 그래서 **단계마다 순위표도 리셋**된다.

import type { PostseasonSeries, ScheduleEntry, Standing } from "../types/season";
import { IND_TEAMS, SURVIVAL_STAGES } from "./leagueTeams.generated";
import type { SurvivalStageDef } from "./leagueTeams.generated";

export type { SurvivalStageDef };
export { SURVIVAL_STAGES };

export const IND_LEAGUE_ID = "LEAGUE_INDEPENDENT";

/** 독립 단계 진행 상태 — 세이브에 남는다 */
export interface SurvivalState {
  leagueId: string;
  /** 지금 진행 중인 단계 (1~3). 0 = 아직 시작 전, 4 = 포스트시즌 */
  stage: number;
  /** 이 단계에 참가 중인 팀 (순위 순 아님) */
  activeTeams: string[];
  /** 단계별 탈락팀 — stage → 탈락한 팀 (그 시즌 종료) */
  eliminated: Record<number, string[]>;
  /** 3차 종료 시점의 최종 정규 순위 (4차 사다리 시드) */
  finalRanking: string[];
}

export interface SurvivalCutoffResult {
  survivors: string[];
  eliminated: string[];
  ranked: string[];
}

async function call<T>(fn: string, payload: unknown, fallback: T): Promise<T> {
  const raw = await window.projectB!.engine(fn, JSON.stringify(payload));
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed) {
    console.error(`[survival] ${fn} Rust 오류:`, parsed.error);
    return fallback;
  }
  return parsed as T;
}

export function stagesOf(leagueId = IND_LEAGUE_ID): SurvivalStageDef[] {
  return SURVIVAL_STAGES.filter((s) => s.leagueId === leagueId).sort((a, b) => a.stage - b.stage);
}

export function stageDef(stage: number, leagueId = IND_LEAGUE_ID): SurvivalStageDef | null {
  return stagesOf(leagueId).find((s) => s.stage === stage) ?? null;
}

/** 마지막 정규 단계 번호 (독립 = 3) */
export function lastRegularStage(leagueId = IND_LEAGUE_ID): number {
  const st = stagesOf(leagueId);
  return st.length > 0 ? st[st.length - 1].stage : 0;
}

export function emptySurvivalState(leagueId = IND_LEAGUE_ID): SurvivalState {
  return { leagueId, stage: 0, activeTeams: [...IND_TEAMS], eliminated: {}, finalRanking: [] };
}

/** 한 단계 일정 — 생존팀끼리 새 라운드로빈 */
export async function generateStageSchedule(
  def: SurvivalStageDef,
  teams: string[],
  protagonistTeamId: string,
  seasonYear: number,
): Promise<ScheduleEntry[]> {
  return call<ScheduleEntry[]>(
    "generateSurvivalStageNative",
    {
      leagueId: def.leagueId, teams, stage: def.stage,
      targetGames: def.targetGames,
      startWeek: def.startWeek, endWeek: def.endWeek,
      protagonistTeamId, seasonYear, dayOffsets: [],
    },
    [],
  );
}

/** 단계 종료 → 생존·탈락 판정 */
export async function cutoff(
  standings: Standing[],
  advanceCount: number,
): Promise<SurvivalCutoffResult> {
  return call<SurvivalCutoffResult>(
    "survivalCutoffNative",
    { standings, advanceCount },
    { survivors: [], eliminated: [], ranked: [] },
  );
}

/** 4차 Stage 사다리 — 준PO(단판) → PO(단판) → 챔피언결정전(3전2승) */
export async function buildLadder(standings: Standing[]): Promise<PostseasonSeries[]> {
  return call<PostseasonSeries[]>("buildIndLadderNative", { standings }, []);
}

/** 이 주차에 시작하는 단계 (없으면 null) */
export function stageStartingAt(week: number, leagueId = IND_LEAGUE_ID): SurvivalStageDef | null {
  return stagesOf(leagueId).find((s) => s.startWeek === week) ?? null;
}

/** 이 단계의 경기가 전부 끝났는가 */
export function stageComplete(stage: number, schedule: ScheduleEntry[]): boolean {
  const mine = schedule.filter((e) => e.id.startsWith(`INDS${stage}_`));
  return mine.length > 0 && mine.every((e) => !!e.result);
}

/**
 * 단계 순위표 — 그 단계 경기만으로 집계한다.
 *
 * 단계마다 리셋하는 이유는 기획서 §3 "각 단계는 이전 단계 대진을 이어받지 않고
 * 생존팀끼리 새로 라운드로빈 — 매 스테이지가 사실상 새 시즌처럼 리셋". 누적을 쓰면
 * 1차에서 벌어놓은 승수로 3차 순위가 정해져 "매 단계 새 승부"가 무의미해진다.
 */
export function stageStandings(stage: number, teams: string[], schedule: ScheduleEntry[]): Standing[] {
  const acc = new Map<string, Standing>(
    teams.map((t) => [t, {
      teamId: t, wins: 0, losses: 0, draws: 0, winPct: 0,
      runsFor: 0, runsAgainst: 0, streak: "", last10: "",
    }]),
  );
  for (const e of schedule) {
    if (!e.result || !e.id.startsWith(`INDS${stage}_`)) continue;
    const h = acc.get(e.homeTeamId), a = acc.get(e.awayTeamId);
    if (!h || !a) continue;
    const { homeScore, awayScore } = e.result;
    h.runsFor += homeScore; h.runsAgainst += awayScore;
    a.runsFor += awayScore; a.runsAgainst += homeScore;
    if (homeScore > awayScore) { h.wins++; a.losses++; }
    else if (homeScore < awayScore) { a.wins++; h.losses++; }
    else { h.draws++; a.draws++; }
  }
  for (const s of acc.values()) {
    const played = s.wins + s.losses + s.draws;
    s.winPct = played > 0 ? s.wins / played : 0;
  }
  return [...acc.values()];
}
