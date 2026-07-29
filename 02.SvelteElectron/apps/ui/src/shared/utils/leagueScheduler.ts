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

/**
 * 고교 주말리그 팀당 목표 경기 수 (DESIGN.md §7).
 *
 * 권역이 6~20팀으로 갈려도 이 값으로 균등하게 맞춘다 — 팀 적은 권역은
 * 라운드로빈 바퀴가 늘어 같은 팀을 여러 번 만난다(기획서 02_고교.md §4-1).
 * v1은 리그 전체에 cycles 4를 줘서 팀당 경기가 권역 크기에 휘둘렸다.
 */
export const HS_TARGET_GAMES = 20;

/**
 * 대학 정규리그 팀당 목표 경기 수 (03_대학.md §4-1).
 *
 * 조당 10팀 단일 라운드로빈 = 9경기. 조 45경기 × 5조 = **총 225경기**.
 * 고교(20경기)보다 가벼운 건 의도다 — 정규리그는 생존 무대이고
 * 승부는 은하기·여명기에서 난다.
 */
export const UNIV_TARGET_GAMES = 9;

/** 대학 정규리그 기간 — 3월~5월 초 10주 (§4-6 캘린더) */
export const UNIV_REGULAR_START_WEEK = 1;
export const UNIV_REGULAR_END_WEEK = 10;

/**
 * 권역 주말리그 (Phase 5-3).
 *
 * v1은 리그에 `cycles`(바퀴 수)를 줬다 — 권역이 6~20팀으로 갈리는 고교에서는
 * 팀당 경기가 5~19로 들쭉날쭉해진다. v2는 **목표 경기 수**를 주고 바퀴를 역산해,
 * 권역 크기와 무관하게 팀마다 같은 경기 수를 보장한다.
 */
export async function generateRegionalSchedule(
  leagueId: string,
  regions: Record<string, readonly string[]>,
  targetGames: number,
  startWeek: number,
  endWeek: number,
  protagonistTeamId: string,
  seasonYear = 2026,
  opts: { idPrefix?: string; defaultDayOffsets?: number[] } = {},
): Promise<ScheduleEntry[]> {
  // 조별 요일 — 대학은 조마다 다르다 (league_groups.csv). 없으면 상위 기본값.
  const dayOf = new Map(
    LEAGUE_GROUP_META.filter((g) => g.leagueId === leagueId).map((g) => [g.stadiumId, g.dayOffsets]),
  );
  const raw = await window.projectB!.engine(
    "generateRegionalScheduleNative",
    JSON.stringify({
      leagueId,
      regions: Object.entries(regions).map(([regionId, teams]) => ({
        regionId, teams: [...teams], dayOffsets: dayOf.get(regionId) ?? [],
      })),
      targetGames, startWeek, endWeek, protagonistTeamId, seasonYear,
      idPrefix: opts.idPrefix, defaultDayOffsets: opts.defaultDayOffsets ?? [],
    }),
  );
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    console.error("[leagueScheduler] generateRegionalSchedule Rust 오류:", parsed.error);
    return [];
  }
  return parsed as ScheduleEntry[];
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

// ── 팀 목록 ───────────────────────────────────────────────────
// refs.json에서 생성된다 (scripts/build_refs_from_seeds.py) — 손으로 박으면 refs와
// 드리프트하고, 그걸 잡으려고 부팅 검사(validateTeamRefs)가 생겼다. 이제 같은 소스다.
export {
  HS_ALL_TEAMS, HS_SELECTABLE_TEAMS, HS_REGIONS, UNIV_GROUPS,
  GROUPS_BY_LEAGUE, LEAGUE_GROUP_META,
  UNIV_TEAMS, IND_TEAMS,
  KBL_TEAMS, KBL_FARM_TEAMS,
  ABL_TEAMS, ABL_FARM_TEAMS,
  JBL_TEAMS, JBL_FARM_TEAMS,
} from "./leagueTeams.generated";

import { LEAGUE_GROUP_META } from "./leagueTeams.generated";
import {
  HS_ALL_TEAMS as _HS, UNIV_TEAMS as _UNIV, IND_TEAMS as _IND,
  KBL_TEAMS as _KBL, KBL_FARM_TEAMS as _KBLF,
  ABL_TEAMS as _ABL, ABL_FARM_TEAMS as _ABLF,
  JBL_TEAMS as _JBL, JBL_FARM_TEAMS as _JBLF,
} from "./leagueTeams.generated";

/**
 * v2: 고교는 102팀 전부가 상시 존재한다 (Lazy 없음 — DESIGN.md §2.1).
 * 구 HS_ACTIVE_TEAMS_V3(10팀 축소본)는 v2에서 의미가 없어져 전체 목록의 별칭으로 남긴다.
 * 호출부를 한 번에 갈아엎지 않기 위한 전환기 별칭 — 5-3 이후 정리 대상.
 */
export const HS_ACTIVE_TEAMS_V3: string[] = _HS;

export const ALL_TEAMS_BY_LEAGUE: Record<string, string[]> = {
  LEAGUE_HIGHSCHOOL:  [..._HS],
  LEAGUE_UNIVERSITY:  [..._UNIV],
  LEAGUE_INDEPENDENT: [..._IND],
  LEAGUE_KBL:         [..._KBL],
  LEAGUE_ABL:         [..._ABL],
  LEAGUE_JBL:         [..._JBL],
  LEAGUE_KBL_FARM:    [..._KBLF],
  LEAGUE_ABL_FARM:    [..._ABLF],
  LEAGUE_JBL_FARM:    [..._JBLF],
};

/**
 * v2 스케줄 설정.
 *
 * ⚠ 미완 (Phase 5 진행 중):
 *  - 고교(102팀 8권역 주말리그)는 cycles 모델로 표현 불가 → 5-3에서 권역 스케줄러 신설
 *  - 대학(50팀 5조)·독립(10팀 4단계 생존리그)도 마찬가지 → 5-5 / 5-6
 *    그때까지 여기서 **일부러 뺀다**. 50팀 라운드로빈을 그대로 돌리면
 *    6,000경기가 생겨 아무도 원치 않는 결과가 나온다.
 *  - 프로만 현 모델로 정확히 표현된다 (팀당 경기수 = (n-1) × cycles)
 */
export const DEFAULT_LEAGUE_CONFIGS: LeagueConfig[] = [
  // 프로 1군 10팀 × 16차전 = 팀당 144경기 (DESIGN.md §7)
  { leagueId: "LEAGUE_KBL",      teams: [..._KBL],  startWeek: 1, endWeek: 50, cycles: 16 },
  // 프로 2군 10팀 × 11차전 = 팀당 99경기 — R5에서 제거했던 팜 리그 시뮬 복원 (DESIGN.md §5)
  { leagueId: "LEAGUE_KBL_FARM", teams: [..._KBLF], startWeek: 1, endWeek: 50, cycles: 11 },
  // 해외 — 현행 유지 (진출 전까지 드리프트만)
  { leagueId: "LEAGUE_ABL",      teams: [..._ABL],  startWeek: 1, endWeek: 50, cycles: 9  },
  { leagueId: "LEAGUE_JBL",      teams: [..._JBL],  startWeek: 1, endWeek: 50, cycles: 10 },
];
