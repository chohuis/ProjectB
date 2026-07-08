import type { ScheduleEntry, Standing } from "../types/season";

// ── 빈 순위표 생성 (pure TS) ──────────────────────────────────
export function makeStandings(teamIds: string[]): Standing[] {
  return teamIds.map((teamId) => ({
    teamId, wins: 0, losses: 0, draws: 0, winPct: 0,
    runsFor: 0, runsAgainst: 0, streak: "", last10: "",
  }));
}

// ── 리그별 스케줄 설정 타입 ───────────────────────────────────
export interface LeagueConfig {
  leagueId: string;
  teams: string[];
  startWeek: number;
  endWeek: number;
  cycles: number;
  seriesGames?: number;
}

// ── Rust IPC 래퍼 ────────────────────────────────────────────────
export async function generateLeagueSchedule(
  leagueId: string,
  teams: string[],
  startWeek: number,
  endWeek: number,
  cycles: number,
  protagonistTeamId: string,
  seasonYear = 2026,
  seriesGames?: number,
): Promise<ScheduleEntry[]> {
  const raw = await window.projectB!.scheduleLeague(
    JSON.stringify({ leagueId, teams, startWeek, endWeek, cycles, protagonistTeamId, seasonYear, seriesGames })
  );
  return JSON.parse(raw);
}

export async function generateAllLeagueSchedules(
  configs: LeagueConfig[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<Record<string, ScheduleEntry[]>> {
  const raw = await window.projectB!.scheduleAllLeagues(
    JSON.stringify({ configs, protagonistTeamId, seasonYear })
  );
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    console.error("[leagueScheduler] generateAllLeagueSchedules Rust 오류:", parsed.error);
    return {};
  }
  return parsed;
}

// ── 고교 팀 목록 ──────────────────────────────────────────────
export const HS_SELECTABLE_TEAMS = [
  "TEAM_HS_SEOUL_INNOVATION",
  "TEAM_HS_BUSAN_WAVE",
  "TEAM_HS_DAEGU_HEAT",
  "TEAM_HS_GWANGJU_VISION",
  "TEAM_HS_DAEJEON_RISE",
  "TEAM_HS_INCHEON_HARBOR",
  "TEAM_HS_ULSAN_CHARGE",
  "TEAM_HS_SUWON_EDGE",
];

export const HS_ALL_TEAMS = [
  ...HS_SELECTABLE_TEAMS,
  "TEAM_HS_YEOSU_SHORE",
  "TEAM_HS_CHUNCHEON_HIGHLAND",
  "TEAM_HS_JEJU_WIND",
  "TEAM_HS_GANGWON_PEAK",
  "TEAM_HS_MASAN_HARBOR",
  "TEAM_HS_JECHEON_RIDGE",
  "TEAM_HS_GOYANG_ARROW",
  "TEAM_HS_SUNCHEON_BAY",
];

// ── R4: 고교 10팀 단일리그 — 선택 8교 + 배경 2교 (DESIGN.md §7) ──
export const HS_ACTIVE_TEAMS_V3 = [
  ...HS_SELECTABLE_TEAMS,
  "TEAM_HS_YEOSU_SHORE",
  "TEAM_HS_CHUNCHEON_HIGHLAND",
];

export const UNIV_TEAMS = [
  "TEAM_UNIV_HANBBIT", "TEAM_UNIV_DONGMYUNG", "TEAM_UNIV_SEOHAE",
  "TEAM_UNIV_NAMGANG", "TEAM_UNIV_CHEONGUN", "TEAM_UNIV_MIRAE", "TEAM_UNIV_GAON",
  "TEAM_SPORTS_UNIT",
];

export const IND_TEAMS = [
  "TEAM_IND_SEOUL_PIONEERS", "TEAM_IND_BUSAN_TEMPEST",
  "TEAM_IND_DAEGU_FALCONS", "TEAM_IND_GWANGJU_STORM",
  "TEAM_IND_DAEJEON_HUNTERS", "TEAM_IND_INCHEON_ORCAS",
  "TEAM_IND_SUWON_BLAZE", "TEAM_IND_ULSAN_PHOENIX",
];

export const KBL_TEAMS = [
  "TEAM_KBL_TWINWOLVES_1", "TEAM_KBL_BEARGUARDIANS_1",
  "TEAM_KBL_SKYGULLS_1", "TEAM_KBL_SOARINGEAGLES_1",
  "TEAM_KBL_EMBERTIGERS_1", "TEAM_KBL_ROYALLIONS_1",
  "TEAM_KBL_STEELDINOS_1", "TEAM_KBL_GIANTWHALES_1",
];

export const ABL_TEAMS = [
  "TEAM_ABL_EMPIRE_1", "TEAM_ABL_HARBORHAWKS_1",
  "TEAM_ABL_SUNDRAGONS_1", "TEAM_ABL_WINDBEARS_1",
  "TEAM_ABL_SPACECOMETS_1", "TEAM_ABL_PEACHTREEFALCONS_1",
  "TEAM_ABL_LONESTARS_1", "TEAM_ABL_RAINARROWS_1",
  "TEAM_ABL_BAYSEALS_1", "TEAM_ABL_WAVERIDERS_1",
  "TEAM_ABL_MOTORWOLVES_1", "TEAM_ABL_MOUNTAINPEAKS_1",
  "TEAM_ABL_LAKESPIRITS_1", "TEAM_ABL_COASTALRAYS_1",
  "TEAM_ABL_DESERTSERPENTS_1", "TEAM_ABL_RIVERCARDINALS_1",
];

export const JBL_TEAMS = [
  "TEAM_JBL_CL_NEONCRANES_1",    "TEAM_JBL_CL_TEMPOSTINGS_1",
  "TEAM_JBL_CL_IRONDRAKES_1",    "TEAM_JBL_CL_TIDERAVES_1",
  "TEAM_JBL_CL_SILVERWOLVES_1",  "TEAM_JBL_CL_IRONSTORMS_1",
  "TEAM_JBL_PL_THUNDERFALCONS_1","TEAM_JBL_PL_POLARBEARS_1",
  "TEAM_JBL_PL_SPIRITBUFFALOS_1","TEAM_JBL_PL_MARINESOLDIERS_1",
  "TEAM_JBL_PL_SEAGULLS_1",      "TEAM_JBL_PL_SUNS_1",
];

// ── 2군(팜) 팀 목록 ───────────────────────────────────────────
export const KBL_FARM_TEAMS = [
  "TEAM_KBL_TWINWOLVES_2", "TEAM_KBL_BEARGUARDIANS_2",
  "TEAM_KBL_SKYGULLS_2", "TEAM_KBL_SOARINGEAGLES_2",
  "TEAM_KBL_EMBERTIGERS_2", "TEAM_KBL_ROYALLIONS_2",
  "TEAM_KBL_STEELDINOS_2", "TEAM_KBL_GIANTWHALES_2",
];

export const ABL_FARM_TEAMS = [
  "TEAM_ABL_EMPIRE_2", "TEAM_ABL_HARBORHAWKS_2",
  "TEAM_ABL_SUNDRAGONS_2", "TEAM_ABL_WINDBEARS_2",
  "TEAM_ABL_SPACECOMETS_2", "TEAM_ABL_PEACHTREEFALCONS_2",
  "TEAM_ABL_LONESTARS_2", "TEAM_ABL_RAINARROWS_2",
  "TEAM_ABL_BAYSEALS_2", "TEAM_ABL_WAVERIDERS_2",
  "TEAM_ABL_MOTORWOLVES_2", "TEAM_ABL_MOUNTAINPEAKS_2",
  "TEAM_ABL_LAKESPIRITS_2", "TEAM_ABL_COASTALRAYS_2",
  "TEAM_ABL_DESERTSERPENTS_2", "TEAM_ABL_RIVERCARDINALS_2",
];

export const JBL_FARM_TEAMS = [
  "TEAM_JBL_CL_NEONCRANES_2",    "TEAM_JBL_CL_TEMPOSTINGS_2",
  "TEAM_JBL_CL_IRONDRAKES_2",    "TEAM_JBL_CL_TIDERAVES_2",
  "TEAM_JBL_CL_SILVERWOLVES_2",  "TEAM_JBL_CL_IRONSTORMS_2",
  "TEAM_JBL_PL_THUNDERFALCONS_2","TEAM_JBL_PL_POLARBEARS_2",
  "TEAM_JBL_PL_SPIRITBUFFALOS_2","TEAM_JBL_PL_MARINESOLDIERS_2",
  "TEAM_JBL_PL_SEAGULLS_2",      "TEAM_JBL_PL_SUNS_2",
];

export const ALL_TEAMS_BY_LEAGUE: Record<string, string[]> = {
  LEAGUE_HIGHSCHOOL: HS_ALL_TEAMS,
  LEAGUE_UNIVERSITY: UNIV_TEAMS,
  LEAGUE_INDEPENDENT: IND_TEAMS,
  LEAGUE_KBL: KBL_TEAMS,
  LEAGUE_ABL: ABL_TEAMS,
  LEAGUE_JBL: JBL_TEAMS,
  LEAGUE_KBL_FARM: KBL_FARM_TEAMS,
  LEAGUE_ABL_FARM: ABL_FARM_TEAMS,
  LEAGUE_JBL_FARM: JBL_FARM_TEAMS,
};

export const DEFAULT_LEAGUE_CONFIGS: LeagueConfig[] = [
  { leagueId: "LEAGUE_UNIVERSITY",  teams: UNIV_TEAMS,      startWeek: 8, endWeek: 40, cycles: 5,  seriesGames: 2 },
  { leagueId: "LEAGUE_INDEPENDENT", teams: IND_TEAMS,       startWeek: 6, endWeek: 38, cycles: 8,  seriesGames: 2 },
  { leagueId: "LEAGUE_KBL",         teams: KBL_TEAMS,       startWeek: 1, endWeek: 50, cycles: 16 },
  { leagueId: "LEAGUE_ABL",         teams: ABL_TEAMS,       startWeek: 1, endWeek: 50, cycles: 9  },
  { leagueId: "LEAGUE_JBL",         teams: JBL_TEAMS,       startWeek: 1, endWeek: 50, cycles: 10 },
  // 2군: 포스트시즌 기간 활용, 플레이오프 없이 정규리그만 진행
  { leagueId: "LEAGUE_KBL_FARM",    teams: KBL_FARM_TEAMS,  startWeek: 7, endWeek: 30, cycles: 18 },
  { leagueId: "LEAGUE_ABL_FARM",    teams: ABL_FARM_TEAMS,  startWeek: 7, endWeek: 34, cycles: 10 },
  { leagueId: "LEAGUE_JBL_FARM",    teams: JBL_FARM_TEAMS,  startWeek: 7, endWeek: 32, cycles: 13 },
];
