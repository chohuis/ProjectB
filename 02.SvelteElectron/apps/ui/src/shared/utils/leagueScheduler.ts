import type { ScheduleEntry, Standing } from "../types/season";

// ── 라운드 로빈 생성 (Berger Table) ─────────────────────────────
// 반환: rounds[r] = [{home, away}, ...]
function buildRoundRobin(teams: string[]): Array<Array<{ home: string; away: string }>> {
  const n = teams.length;
  const hasOdd = n % 2 !== 0;
  const list = hasOdd ? [...teams, "BYE"] : [...teams];
  const N = list.length;
  const rounds: Array<Array<{ home: string; away: string }>> = [];

  const fixed = list[N - 1];
  const rotating = list.slice(0, N - 1);

  for (let r = 0; r < N - 1; r++) {
    const matches: Array<{ home: string; away: string }> = [];
    const home0 = r % 2 === 0 ? fixed : rotating[r % (N - 1)];
    const away0 = r % 2 === 0 ? rotating[r % (N - 1)] : fixed;
    if (home0 !== "BYE" && away0 !== "BYE") matches.push({ home: home0, away: away0 });

    for (let i = 1; i < N / 2; i++) {
      const h = rotating[(r + i) % (N - 1)];
      const a = rotating[(r - i + (N - 1)) % (N - 1)];
      if (h !== "BYE" && a !== "BYE") matches.push({ home: h, away: a });
    }
    rounds.push(matches);
  }
  return rounds;
}

// 단일 라운드 로빈 (home/away 각 1회) → 2× 사이클
function buildDoubleRoundRobin(teams: string[]): Array<Array<{ home: string; away: string }>> {
  const half = buildRoundRobin(teams);
  const reversed = half.map((round) =>
    round.map(({ home, away }) => ({ home: away, away: home }))
  );
  return [...half, ...reversed];
}

// ── 주차 목록에 라운드를 균등 배분 ────────────────────────────
function assignRoundsToWeeks(
  rounds: Array<Array<{ home: string; away: string }>>,
  startWeek: number,
  endWeek: number,
  leagueId: string,
  idPrefix: string,
  protagonistTeamId: string,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  const available = endWeek - startWeek + 1;
  const step = available / rounds.length;

  rounds.forEach((round, ri) => {
    const week = Math.min(endWeek, startWeek + Math.round(ri * step));
    round.forEach((m, gi) => {
      const id = `${idPrefix}_R${String(ri + 1).padStart(2, "0")}_G${gi + 1}`;
      entries.push({
        id,
        week,
        homeTeamId: m.home,
        awayTeamId: m.away,
        leagueId,
        isProtagonistGame: m.home === protagonistTeamId || m.away === protagonistTeamId,
        phase: "season",
      });
    });
  });
  return entries;
}

// ── 빈 순위표 생성 ────────────────────────────────────────────
export function makeStandings(teamIds: string[]): Standing[] {
  return teamIds.map((teamId) => ({
    teamId, wins: 0, losses: 0, draws: 0, winPct: 0,
    runsFor: 0, runsAgainst: 0, streak: "", last10: "",
  }));
}

// ── HS 리그 스케줄 (그룹 A+B 합산) ───────────────────────────
export function generateHsSchedule(
  groupA: string[],
  groupB: string[],
  protagonistTeamId: string,
): ScheduleEntry[] {
  const roundsA = buildDoubleRoundRobin(groupA);
  const roundsB = buildDoubleRoundRobin(groupB);
  return [
    ...assignRoundsToWeeks(roundsA, 10, 42, "LEAGUE_HIGHSCHOOL", "HS_A", protagonistTeamId),
    ...assignRoundsToWeeks(roundsB, 10, 42, "LEAGUE_HIGHSCHOOL", "HS_B", protagonistTeamId),
  ];
}

// ── 단일 리그 스케줄 생성 ─────────────────────────────────────
export function generateLeagueSchedule(
  leagueId: string,
  teams: string[],
  startWeek: number,
  endWeek: number,
  cycles: number,
  protagonistTeamId: string,
): ScheduleEntry[] {
  let allRounds: Array<Array<{ home: string; away: string }>> = [];
  const base = buildRoundRobin(teams);
  for (let c = 0; c < cycles; c++) {
    if (c % 2 === 0) {
      allRounds = [...allRounds, ...base];
    } else {
      allRounds = [...allRounds, ...base.map((r) => r.map(({ home, away }) => ({ home: away, away: home })))];
    }
  }
  const prefix = leagueId.replace("LEAGUE_", "");
  return assignRoundsToWeeks(allRounds, startWeek, endWeek, leagueId, prefix, protagonistTeamId);
}

// ── 리그별 스케줄 일괄 생성 ──────────────────────────────────
export interface LeagueConfig {
  leagueId: string;
  teams: string[];
  startWeek: number;
  endWeek: number;
  cycles: number;
  // HS group play override
  groupA?: string[];
  groupB?: string[];
}

export function generateAllLeagueSchedules(
  configs: LeagueConfig[],
  protagonistTeamId: string,
): Record<string, ScheduleEntry[]> {
  const result: Record<string, ScheduleEntry[]> = {};
  for (const cfg of configs) {
    if (cfg.groupA && cfg.groupB) {
      result[cfg.leagueId] = generateHsSchedule(cfg.groupA, cfg.groupB, protagonistTeamId);
    } else {
      result[cfg.leagueId] = generateLeagueSchedule(
        cfg.leagueId, cfg.teams,
        cfg.startWeek, cfg.endWeek, cfg.cycles,
        protagonistTeamId,
      );
    }
  }
  return result;
}

// ── 정적 리그 설정 ────────────────────────────────────────────
export const HS_GROUP_A = [
  "TEAM_HS_SEOUL_INNOVATION",
  "TEAM_HS_DAEGU_HEAT",
  "TEAM_HS_INCHEON_HARBOR",
  "TEAM_HS_SUWON_EDGE",
  "TEAM_HS_YEOSU_SHORE",
  "TEAM_HS_JEJU_WIND",
  "TEAM_HS_MASAN_HARBOR",
  "TEAM_HS_GOYANG_ARROW",
];

export const HS_GROUP_B = [
  "TEAM_HS_BUSAN_WAVE",
  "TEAM_HS_GWANGJU_VISION",
  "TEAM_HS_DAEJEON_RISE",
  "TEAM_HS_ULSAN_CHARGE",
  "TEAM_HS_CHUNCHEON_HIGHLAND",
  "TEAM_HS_GANGWON_PEAK",
  "TEAM_HS_JECHEON_RIDGE",
  "TEAM_HS_SUNCHEON_BAY",
];

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

export const ALL_TEAMS_BY_LEAGUE: Record<string, string[]> = {
  LEAGUE_HIGHSCHOOL: [...HS_GROUP_A, ...HS_GROUP_B],
  LEAGUE_UNIVERSITY: UNIV_TEAMS,
  LEAGUE_INDEPENDENT: IND_TEAMS,
  LEAGUE_KBL: KBL_TEAMS,
  LEAGUE_ABL: ABL_TEAMS,
};

// 리그별 기본 스케줄 설정값
export const DEFAULT_LEAGUE_CONFIGS: Omit<LeagueConfig, "groupA" | "groupB">[] = [
  { leagueId: "LEAGUE_UNIVERSITY",  teams: UNIV_TEAMS,  startWeek: 8,  endWeek: 40, cycles: 5 },
  { leagueId: "LEAGUE_INDEPENDENT", teams: IND_TEAMS,   startWeek: 6,  endWeek: 38, cycles: 8 },
  { leagueId: "LEAGUE_KBL",         teams: KBL_TEAMS,   startWeek: 1,  endWeek: 50, cycles: 16 },
  { leagueId: "LEAGUE_ABL",         teams: ABL_TEAMS,   startWeek: 1,  endWeek: 50, cycles: 9 },
];
