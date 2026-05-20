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
  groupA?: string[];
  groupB?: string[];
}

// ── Rust IPC 래퍼 ────────────────────────────────────────────────
export async function generateHsSchedule(
  groupA: string[],
  groupB: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await (window as any).projectB.scheduleHs(
    JSON.stringify({ groupA, groupB, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateLeagueSchedule(
  leagueId: string,
  teams: string[],
  startWeek: number,
  endWeek: number,
  cycles: number,
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<ScheduleEntry[]> {
  const raw = await (window as any).projectB.scheduleLeague(
    JSON.stringify({ leagueId, teams, startWeek, endWeek, cycles, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function generateAllLeagueSchedules(
  configs: LeagueConfig[],
  protagonistTeamId: string,
  seasonYear = 2026,
): Promise<Record<string, ScheduleEntry[]>> {
  const raw = await (window as any).projectB.scheduleAllLeagues(
    JSON.stringify({ configs, protagonistTeamId, seasonYear })
  );
  return JSON.parse(raw);
}

export async function shuffleHsGroups(
  allTeams: string[] = HS_ALL_TEAMS,
): Promise<{ groupA: string[]; groupB: string[] }> {
  const raw = await (window as any).projectB.scheduleShuffleHsGroups(
    JSON.stringify({ allTeams })
  );
  return JSON.parse(raw);
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

export const HS_GROUP_A = HS_ALL_TEAMS.slice(0, 8);
export const HS_GROUP_B = HS_ALL_TEAMS.slice(8);

export const UNIV_TEAMS = [
  "TEAM_UNIV_KNSU", "TEAM_UNIV_KNU", "TEAM_UNIV_YONSEI",
  "TEAM_UNIV_KOREA", "TEAM_UNIV_HANYANG", "TEAM_UNIV_CHUNGBUK", "TEAM_UNIV_DONGGUK",
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

export const ALL_TEAMS_BY_LEAGUE: Record<string, string[]> = {
  LEAGUE_HIGHSCHOOL: HS_ALL_TEAMS,
  LEAGUE_UNIVERSITY: UNIV_TEAMS,
  LEAGUE_INDEPENDENT: IND_TEAMS,
  LEAGUE_KBL: KBL_TEAMS,
  LEAGUE_ABL: ABL_TEAMS,
  LEAGUE_JBL: JBL_TEAMS,
};

export const DEFAULT_LEAGUE_CONFIGS: Omit<LeagueConfig, "groupA" | "groupB">[] = [
  { leagueId: "LEAGUE_UNIVERSITY",  teams: UNIV_TEAMS,  startWeek: 8,  endWeek: 40, cycles: 5 },
  { leagueId: "LEAGUE_INDEPENDENT", teams: IND_TEAMS,   startWeek: 6,  endWeek: 38, cycles: 8 },
  { leagueId: "LEAGUE_KBL",         teams: KBL_TEAMS,   startWeek: 1,  endWeek: 50, cycles: 16 },
  { leagueId: "LEAGUE_ABL",         teams: ABL_TEAMS,   startWeek: 1,  endWeek: 50, cycles: 9 },
  { leagueId: "LEAGUE_JBL",         teams: JBL_TEAMS,   startWeek: 1,  endWeek: 50, cycles: 10 },
];
