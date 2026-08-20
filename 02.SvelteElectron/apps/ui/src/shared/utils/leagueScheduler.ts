import type { ScheduleEntry, Standing } from "../types/season";
import { isLeagueInScope } from "../config/releaseScope";

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
 * 고교 주말리그 기간 (CALENDAR_V2.md).
 *
 * 🔴 **예전엔 W2~45였다** — 호출부(`season.ts`)에 숫자로 박혀 있었고,
 * W45는 **12월 말**이다. 실제 고교 주말리그는 4/17~7/18이고 9월엔 드래프트다.
 *
 * W7~26이면 4월 중순~8월 말이다. 3학년은 W26에 시즌이 끝나고 **W31 드래프트**를
 * 맞는다 — 5주 간격이라 스카우트 평가·진로 상담이 들어갈 자리가 생긴다.
 */
export const HS_START_WEEK = 7;
export const HS_END_WEEK = 26;

/**
 * 대학 정규리그 팀당 목표 경기 수 (03_대학.md §4-1).
 *
 * 조당 10팀. **2026-08-20에 9 → 27로 늘렸다**(사용자 확정) — 실제 대학야구가
 * 춘계·하계·추계 리그전을 치르므로 단일 라운드로빈(9)을 세 바퀴 돈다.
 *
 * ⚠ **설계 의도는 그대로다**: 정규리그는 생존 무대이고 승부는 은하기·여명기에서
 * 난다. 경기가 늘어도 대회가 승부처인 건 안 바뀐다.
 */
export const UNIV_TARGET_GAMES = 27;

/**
 * 대학 정규리그 기간 — 프로와 같은 W5~28.
 *
 * 🔴 **예전엔 W1~10이었다.** 27경기를 10주에 넣으면 주 2.7경기가 되고,
 * 대회(왕중왕전 W11~12 · 은하기 · 여명기)와 정규가 완전히 갈린다.
 * 실제 대학야구는 **리그전과 전국대회가 번갈아** 온다.
 */
export const UNIV_REGULAR_START_WEEK = 5;
export const UNIV_REGULAR_END_WEEK = 28;

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
/**
 * 1차 출시 범위 밖(해외)은 **일정 자체를 만들지 않는다.**
 * 만들어두고 시뮬만 안 하면 영영 결과 없는 경기가 세이브에 쌓인다.
 * 확장팩에서 releaseScope.ts의 Set을 비우면 아래 항목이 그대로 살아난다.
 */
/**
 * 프로 정규시즌 기간 (CALENDAR_V2.md).
 *
 * 🔴 **예전엔 W1~50이었다** — `W1 = 3월 1일`이라 3월부터 이듬해 2월까지
 * 리그가 돌았고, 팀당 144경기를 50주에 펼쳐 **주 2.9경기**가 됐다.
 * 실제 KBO는 144경기를 약 23주에 치러 주 6.3경기다.
 *
 * W5부터인 이유: 실제 KBO 개막이 3월 말이다. W1~4는 시범경기·로스터 확정
 * 기간이다. 24주에 144경기면 **주 6.0**으로 실제와 같은 밀도가 된다.
 */
export const PRO_START_WEEK = 5;
export const PRO_END_WEEK = 28;

export const DEFAULT_LEAGUE_CONFIGS: LeagueConfig[] = ([
  // 프로 1군 10팀 × 16차전 = 팀당 144경기 (DESIGN.md §7)
  { leagueId: "LEAGUE_KBL",      teams: [..._KBL],  startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 16 },
  // 프로 2군 10팀 × 11차전 = 팀당 99경기 — R5에서 제거했던 팜 리그 시뮬 복원 (DESIGN.md §5)
  { leagueId: "LEAGUE_KBL_FARM", teams: [..._KBLF], startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 11 },
  // 해외 — **2026-08-20부터 국내와 같이 풀 시뮬한다.** 경기 수도 실제 리그에
  // 맞췄다(CALENDAR_V2.md):
  //
  // ABL은 **MLB를 축소한 가상 리그**다(사용자 확정). MLB가 30팀 162경기인데
  // 16팀이면 상대가 15명이라 162를 채우려면 10.8차전이 된다 — 10차전 150이
  // 가장 가깝고, 정규 24주에 넣으면 주 6.25로 MLB(6.2)와 거의 같다.
  { leagueId: "LEAGUE_ABL",      teams: [..._ABL],  startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 10 },
  // JBL은 NPB다 — 12팀 143경기. 13차전이면 정확히 143이 된다
  { leagueId: "LEAGUE_JBL",      teams: [..._JBL],  startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 13 },
  // ⚠ 해외 팜은 **항목 자체가 없었다.** 확장팩 게이트를 열어도 1군 일정만
  // 깔리고 팜은 0경기였다 — 승강할 곳이 없으면 로스터가 고인다.
  //
  // 🔴 **차수를 11로 통일했더니 ABL 2군이 1군보다 많아졌다**(16팀 × 11 = 165
  // vs 1군 150). 2군은 1군보다 적게 뛰는 게 맞다 — 8차전 120으로 내린다.
  // 1군 대비 0.8인데, KBL 2군은 0.69(99/144) · JBL 2군은 0.85(121/143)라
  // 그 사이다.
  { leagueId: "LEAGUE_ABL_FARM", teams: [..._ABLF], startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 8  },
  { leagueId: "LEAGUE_JBL_FARM", teams: [..._JBLF], startWeek: PRO_START_WEEK, endWeek: PRO_END_WEEK, cycles: 11 },
] as LeagueConfig[]).filter((c) => isLeagueInScope(c.leagueId));

// ── 시범경기 (CALENDAR_V2.md) ─────────────────────────────────

/**
 * 시범경기 팀당 경기 수. 실제 KBO도 팀당 10경기 안팎이다.
 */
export const PRESEASON_GAMES = 12;

/** 시범경기 기간 — 정규 개막(W5) 앞의 4주 */
export const PRESEASON_START_WEEK = 1;
export const PRESEASON_END_WEEK = 4;

/** 시범경기를 치르는 리그 — **1군 셋만**이다 (사용자 확정) */
export const PRESEASON_LEAGUES = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"] as const;

/**
 * 시범경기 일정을 만든다.
 *
 * ⚠ **`cycles` 모델로는 12경기를 못 만든다.** 10팀이면 상대가 9명이라
 * 차수의 배수(9·18·27…)만 나온다. 그래서 목표 경기 수를 주고 바퀴를 역산하는
 * `generateRegionalSchedule`을 쓴다 — 리그 전체를 권역 하나로 넘긴다.
 *
 * ⚠ **`isFriendly: true`로 만든다.** 공식 기록에는 안 들어가고 개인 성적만
 * `friendlyStats`에 남는다(사용자 확정: "기록에도 남긴다"). 그 장치가 이미
 * 있어서 새로 만들지 않았다.
 */
export async function generatePreseasonSchedules(
  protagonistTeamId: string,
  seasonYear: number,
): Promise<Record<string, ScheduleEntry[]>> {
  const out: Record<string, ScheduleEntry[]> = {};
  for (const lid of PRESEASON_LEAGUES) {
    if (!isLeagueInScope(lid)) continue;
    const teams = ALL_TEAMS_BY_LEAGUE[lid] ?? [];
    if (teams.length < 2) continue;
    const entries = await generateRegionalSchedule(
      lid, { ALL: teams }, PRESEASON_GAMES,
      PRESEASON_START_WEEK, PRESEASON_END_WEEK, protagonistTeamId, seasonYear,
      { idPrefix: `PRE_${lid.replace("LEAGUE_", "")}` },
    );
    out[lid] = entries.map((e) => ({
      ...e, leagueId: lid, phase: "preseason" as const, isFriendly: true,
    }));
  }
  return out;
}
