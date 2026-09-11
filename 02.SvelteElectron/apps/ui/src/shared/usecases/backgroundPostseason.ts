// 배경 리그 포스트시즌 (Phase 5-7)
//
// `injectLeaguePostseason`은 **주인공이 속한 리그 하나만** 처리한다 — 주인공 경기를
// 일정에 주입하고 멈춰야 하기 때문이다. 주인공이 없는 리그는 그럴 필요가 없으니
// 여기서 브래킷을 만들고 통째로 자동 처리한다.
//
// 5-5a에서 대회를 전 리그 상시로 바꿨는데 포스트시즌만 주인공 리그에 매달아 두면
// "고교 시절엔 프로 한국시리즈 우승팀 기록이 없다"는 구멍이 생긴다.

import type { PostseasonSeries, SaveSeason, Standing } from "../types/season";
import {
  buildFarmBracket,
  buildKblBracket,
  resolveNonProtagonistSeries,
  postseasonSeed,
} from "../utils/postseasonEngine";
import { buildLadder, lastRegularStage } from "../utils/survivalLeague";

/** 국내 리그만. 해외(ABL·JBL)는 Lazy 정책대로 진출 전까지 돌리지 않는다 (DESIGN §2.2) */
const BACKGROUND_LEAGUES = ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_INDEPENDENT"] as const;

export interface BackgroundPostseasonResult {
  leagueId: string;
  bracket: PostseasonSeries[];
  champion: string | null;
}

/** 그 리그 정규시즌이 끝났는가 */
function regularSeasonDone(leagueId: string, season: SaveSeason): boolean {
  if (leagueId === "LEAGUE_INDEPENDENT") {
    // 독립은 일정이 아니라 단계로 끝난다 — 3차까지 마쳐야 4차 사다리다
    const sv = season.survival;
    return !!sv && sv.stage > lastRegularStage() && sv.finalRanking.length >= 4;
  }
  const sched = season.leagueSchedules?.[leagueId] ?? [];
  return sched.length > 0 && sched.every((e) => !!e.result);
}

/** 사다리 시드용 순위표 */
function seedStandings(leagueId: string, season: SaveSeason): Standing[] {
  if (leagueId === "LEAGUE_INDEPENDENT") {
    // 3차 Stage 최종 순위가 정본. 순위 자체가 시드라 승률은 자리표시용이다.
    const ranked = season.survival?.finalRanking ?? [];
    return ranked.map((teamId, i) => ({
      teamId,
      wins: ranked.length - i,
      losses: i,
      draws: 0,
      winPct: (ranked.length - i) / ranked.length,
      runsFor: 0,
      runsAgainst: 0,
      streak: "",
      last10: "",
    }));
  }
  return season.leagueState?.[leagueId]?.standings ?? [];
}

async function build(leagueId: string, standings: Standing[]): Promise<PostseasonSeries[]> {
  if (leagueId === "LEAGUE_KBL") return buildKblBracket(standings);
  if (leagueId === "LEAGUE_KBL_FARM") return buildFarmBracket(standings);
  if (leagueId === "LEAGUE_INDEPENDENT") return buildLadder(standings);
  return [];
}

/**
 * 주인공이 없는 국내 리그의 포스트시즌을 통째로 치른다.
 *
 * @param protagonistLeagueId 주인공 리그 — 여기는 건드리지 않는다
 *        (injectLeaguePostseason이 주인공 경기를 멈춰가며 진행한다)
 */
export async function runBackgroundPostseasons(
  season: SaveSeason,
  protagonistLeagueId: string,
  protagonistTeamId: string,
): Promise<BackgroundPostseasonResult[]> {
  const out: BackgroundPostseasonResult[] = [];

  for (const leagueId of BACKGROUND_LEAGUES) {
    if (leagueId === protagonistLeagueId) continue;
    if (season.postseasonBrackets?.[leagueId]?.length) continue; // 이미 치렀다
    if (!regularSeasonDone(leagueId, season)) continue;

    const standings = seedStandings(leagueId, season);
    const built = await build(leagueId, standings);
    if (built.length === 0) continue;

    // 주인공이 없는 리그라 전 시리즈가 한 번에 정리된다
    // 씨앗을 넘긴다 — 안 넘기면 Rust 가 `thread_rng` 라 판마다 다른 팀이 우승한다
    const resolved = await resolveNonProtagonistSeries(
      built,
      protagonistTeamId,
      postseasonSeed(season.worldSeed ?? 0, season.seasonYear, leagueId, built),
    );
    const final = resolved[resolved.length - 1];
    out.push({ leagueId, bracket: resolved, champion: final?.winner ?? null });
  }
  return out;
}
