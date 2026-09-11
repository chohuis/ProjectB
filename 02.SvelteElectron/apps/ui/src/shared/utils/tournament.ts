import type { ScheduleEntry, Standing } from "../types/season";
import { GROUPS_BY_LEAGUE, HS_REGIONS, TOURNAMENTS } from "./leagueTeams.generated";
import type { TournamentDef, TournamentSeedSource } from "./leagueTeams.generated";

export type { TournamentDef, TournamentSeedSource };
export { TOURNAMENTS, GROUPS_BY_LEAGUE };

// ── Rust 반환 타입 ────────────────────────────────────────────

export interface BracketMatch {
  id: string;
  round: number;
  /** 라운드 내 순번(0-based). 다음 라운드 slot = slot / 2 */
  slot: number;
  week: number;
  gameDate: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** 부전승 — 경기를 치르지 않고 그대로 올라간다 */
  isBye: boolean;
  winnerTeamId: string | null;
  isProtagonistGame: boolean;
}

export interface TournamentBracket {
  tournamentId: string;
  leagueId: string;
  seasonYear: number;
  /** 2의 거듭제곱으로 올림된 대진 크기 (48팀 → 64) */
  bracketSize: number;
  totalRounds: number;
  byeCount: number;
  matches: BracketMatch[];
}

export interface SelectEntrantsResult {
  seededTeams: string[];
  regionQuota: Record<string, number>;
  wildcards: string[];
}

async function call<T>(fn: string, payload: unknown, fallback: T): Promise<T> {
  const raw = await window.projectB!.engine(fn, JSON.stringify(payload));
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed) {
    console.error(`[tournament] ${fn} Rust 오류:`, parsed.error);
    return fallback;
  }
  return parsed as T;
}

// ── 권역 순위 산출 ────────────────────────────────────────────

/**
 * 순위표를 권역별로 쪼개 순위순으로 정렬한다.
 *
 * 정렬 기준은 리그 순위표와 같아야 한다 — 승률 → 다득점 → 실점 적은 순 → 팀ID.
 * 마지막 팀ID까지 넣는 이유: 동률에서 순서가 흔들리면 같은 시드에서
 * 대진이 달라져 "결정적 세계"라는 전제가 깨진다.
 */
export function regionRankings(
  standings: Standing[],
  regions: Record<string, string[]> = HS_REGIONS,
): { regionId: string; rankedTeams: string[] }[] {
  const byTeam = new Map(standings.map((s) => [s.teamId, s]));
  const cmp = (a: string, b: string) => {
    const sa = byTeam.get(a),
      sb = byTeam.get(b);
    return (
      (sb?.winPct ?? 0) - (sa?.winPct ?? 0) ||
      (sb?.runsFor ?? 0) - (sa?.runsFor ?? 0) ||
      (sa?.runsAgainst ?? 0) - (sb?.runsAgainst ?? 0) ||
      a.localeCompare(b)
    );
  };
  return Object.entries(regions)
    .map(([regionId, teams]) => ({ regionId, rankedTeams: [...teams].sort(cmp) }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));
}

export function winPctMap(standings: Standing[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of standings) m[s.teamId] = s.winPct;
  return m;
}

// ── Rust 래퍼 ─────────────────────────────────────────────────

/** 권역 순위 → 참가팀 선발 (권역 크기 비례 배분 + 와일드카드) */
export async function selectEntrants(
  regions: { regionId: string; rankedTeams: string[] }[],
  def: Pick<
    TournamentDef,
    "totalSlots" | "wildcardSlots" | "perGroupSlots" | "wildcardMaxGroupRank" | "autoSeedsFirst"
  >,
  winPct: Record<string, number>,
): Promise<SelectEntrantsResult> {
  return call<SelectEntrantsResult>(
    "selectTournamentEntrantsNative",
    {
      regions,
      winPct,
      totalSlots: def.totalSlots,
      wildcardSlots: def.wildcardSlots,
      perGroupSlots: def.perGroupSlots ?? null,
      wildcardMaxGroupRank: def.wildcardMaxGroupRank ?? null,
      autoSeedsFirst: def.autoSeedsFirst ?? false,
    },
    { seededTeams: [], regionQuota: {}, wildcards: [] },
  );
}

/** 시드 순 참가팀 → 전 라운드 브래킷 뼈대 (부전승 자동 반영) */
export async function generateBracket(
  def: TournamentDef,
  seededTeams: string[],
  protagonistTeamId: string,
  seasonYear: number,
): Promise<TournamentBracket | null> {
  const b = await call<TournamentBracket | null>(
    "generateTournamentBracketNative",
    {
      tournamentId: def.id,
      leagueId: def.leagueId,
      seededTeams,
      startWeek: def.startWeek,
      endWeek: def.endWeek,
      protagonistTeamId,
      seasonYear,
    },
    null,
  );
  return b;
}

/** 한 라운드 결과 반영 → 다음 라운드 대진 확정 */
export async function advanceRound(
  bracket: TournamentBracket,
  round: number,
  results: { matchId: string; winnerTeamId: string }[],
  protagonistTeamId: string,
): Promise<TournamentBracket> {
  return call<TournamentBracket>(
    "advanceTournamentRoundNative",
    { bracket, round, results, protagonistTeamId },
    bracket,
  );
}

/** 해당 라운드에서 실제로 치를 경기만 (부전승·미확정 제외) */
export async function roundSchedule(
  bracket: TournamentBracket,
  round: number,
): Promise<ScheduleEntry[]> {
  return call<ScheduleEntry[]>("tournamentRoundScheduleNative", { bracket, round }, []);
}

/** 우승팀 (결승 미결이면 null) */
export async function champion(bracket: TournamentBracket): Promise<string | null> {
  return call<string | null>("tournamentChampionNative", bracket, null);
}

// ── 대회 개설 (선발 + 브래킷을 한 번에) ────────────────────────

/**
 * 대회 하나를 개설한다. 시드 산출용 순위표는 `seedSource`에 맞는 것을
 * 호출부가 골라 넘긴다 — 전반기 대회에 최종 순위표를 넘기면 미래를 보게 된다.
 */
export async function openTournament(
  def: TournamentDef,
  standings: Standing[],
  protagonistTeamId: string,
  seasonYear: number,
): Promise<{ bracket: TournamentBracket | null; entrants: SelectEntrantsResult }> {
  const groups = GROUPS_BY_LEAGUE[def.leagueId] ?? HS_REGIONS;
  const regions = regionRankings(standings, groups);
  const entrants = await selectEntrants(regions, def, winPctMap(standings));
  if (entrants.seededTeams.length === 0) {
    return { bracket: null, entrants };
  }
  const bracket = await generateBracket(def, entrants.seededTeams, protagonistTeamId, seasonYear);
  return { bracket, entrants };
}

/** 주차에 해당하는 대회 (겹치면 order 순으로 앞선 것) */
export function tournamentAtWeek(
  week: number,
  leagueId = "LEAGUE_HIGHSCHOOL",
): TournamentDef | null {
  return (
    TOURNAMENTS.filter(
      (t) => t.leagueId === leagueId && week >= t.startWeek && week <= t.endWeek,
    ).sort((a, b) => a.order - b.order)[0] ?? null
  );
}

// ── 조별예선 (Phase 5-5d) ─────────────────────────────────────
//
// 은하기·여명기는 "조별예선 → 본선 8강"이라 순수 넉아웃으로 표현이 안 된다.
// 예선을 먼저 돌리고, 통과팀으로 본선 브래킷을 새로 만든다.

export interface GroupStanding {
  teamId: string;
  wins: number;
  losses: number;
  draws: number;
  runsFor: number;
  runsAgainst: number;
}

export interface QualifyingGroup {
  label: string;
  teams: string[];
  standings: GroupStanding[];
}

export interface GroupStage {
  tournamentId: string;
  leagueId: string;
  seasonYear: number;
  groups: QualifyingGroup[];
  advancePerGroup: number;
  startWeek: number;
  endWeek: number;
  matches: ScheduleEntry[];
}

export interface QualifiersResult {
  /** 본선 진출팀 — 시드 순 (조 1위 블록 → 조 2위 블록) */
  qualified: string[];
  groupRanks: Record<string, string[]>;
}

/** 참가팀 → 조 추첨 + 예선 일정. 같은 worldSeed면 늘 같은 조가 나온다. */
export async function buildGroupStage(
  def: TournamentDef,
  seededTeams: string[],
  protagonistTeamId: string,
  seasonYear: number,
  worldSeed: number,
): Promise<GroupStage | null> {
  if (!def.groupCount || !def.advancePerGroup) return null;
  return call<GroupStage | null>(
    "buildGroupStageNative",
    {
      tournamentId: def.id,
      leagueId: def.leagueId,
      seededTeams,
      groupCount: def.groupCount,
      advancePerGroup: def.advancePerGroup,
      startWeek: def.startWeek,
      endWeek: def.startWeek + Math.max(0, def.qualifyWeeks - 1),
      protagonistTeamId,
      seasonYear,
      worldSeed,
      // 예선은 평일 포함 매일 — 대회 기간이 짧다
      dayOffsets: [],
    },
    null,
  );
}

/** 예선 결과 → 조 순위 반영 */
export async function applyGroupResults(
  stage: GroupStage,
  results: { matchId: string; homeScore: number; awayScore: number }[],
): Promise<GroupStage> {
  return call<GroupStage>("applyGroupResultsNative", { stage, results }, stage);
}

/** 예선 통과팀 (본선 시드 순) */
export async function groupQualifiers(stage: GroupStage): Promise<QualifiersResult> {
  return call<QualifiersResult>("groupStageQualifiersNative", stage, {
    qualified: [],
    groupRanks: {},
  });
}

/** 본선(8강) 브래킷 — 예선 통과팀으로 만든다. 예선이 끝난 다음 주부터. */
export async function buildFinalBracket(
  def: TournamentDef,
  qualified: string[],
  protagonistTeamId: string,
  seasonYear: number,
): Promise<TournamentBracket | null> {
  const finalStart = def.startWeek + def.qualifyWeeks;
  return call<TournamentBracket | null>(
    "generateTournamentBracketNative",
    {
      tournamentId: def.id,
      leagueId: def.leagueId,
      seededTeams: qualified,
      startWeek: finalStart,
      endWeek: def.endWeek,
      protagonistTeamId,
      seasonYear,
    },
    null,
  );
}

/** 조별예선이 있는 대회인가 */
export function hasGroupStage(def: TournamentDef): boolean {
  return def.groupCount != null && def.advancePerGroup != null && def.qualifyWeeks > 0;
}
