// ── 프로 시즌 열기 ───────────────────────────────────────────────
//
// "계약이 성립했으니 다음 시즌을 프로 리그로 연다"가 **세 곳에 복제**돼 있었다:
//   · `seasonRollover` (재계약 대기분 적용)
//   · `careerDecision.acceptDraftOffer` (드래프트 지명 수락)
//   · `ContractNegotiationModal` (즉시 계약 — 입단·전역 복귀)
//
// 셋 다 `initSeason` + 리그별 일정 생성인데 리그 분기를 각자 적고 있었다.
// 한쪽만 고쳐지면 "그 경로로 들어간 시즌만 일정이 빈다" — 실제로 그 계열
// 결함이 있었다(#21: 계약 기간 중이면 일정이 통째로 비었다).

import { get } from "svelte/store";
import { masterStore } from "../stores/master";
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { seasonStore } from "../stores/season";
import type { ScheduleEntry } from "../types/season";

/** 리그별 일정 생성기 선택 — **여기 한 곳에만 둔다** */
export async function proSchedule(
  leagueId: string, teamIds: string[], myTeamId: string,
): Promise<ScheduleEntry[]> {
  const { generateKblSchedule, generateAblSchedule, generateJblSchedule } =
    await import("../utils/scheduleGen");
  if (leagueId === "LEAGUE_ABL") return generateAblSchedule(teamIds, myTeamId);
  if (leagueId === "LEAGUE_JBL") return generateJblSchedule(teamIds, myTeamId);
  return generateKblSchedule(teamIds, myTeamId);
}

/**
 * 다음 시즌을 프로 리그로 연다 — 시즌 초기화 + 일정 생성.
 *
 * @param seasonYear 열 시즌. 생략하면 현재 시즌 +1
 * @returns 넣은 경기 수. 0이면 팀 목록을 못 찾은 것이다
 */
export async function openProSeason(
  leagueId: string, myTeamId: string, seasonYear?: number,
): Promise<number> {
  // ⚠ `masterStore.teams`를 리그로 거르면 **1군과 2군이 같이 딸려온다.**
  // refs에서 KBL은 `_1`(1군 10팀)과 `_2`(2군 10팀)가 **같은 leagueId**를 쓴다.
  // 그대로 쓰면 20팀짜리 시즌이 열리고 순위표에 2군이 섞인다(실측 standings 20).
  // 정본은 `ALL_TEAMS_BY_LEAGUE` — refs에서 생성되고 1군/2군을 나눠 담는다.
  const teamIds = ALL_TEAMS_BY_LEAGUE[leagueId]
    ?? get(masterStore).teams.filter((t) => t.leagueId === leagueId).map((t) => t.id);
  if (teamIds.length === 0) return 0;

  const year = seasonYear ?? (get(seasonStore).seasonYear || 2026) + 1;
  seasonStore.initSeason(leagueId, year, 52, teamIds);

  // ⚠ **독립리그는 여기서 일정을 만들지 않는다.** 생존리그라 4단계로 나뉘고
  // 단계마다 탈락이 있어서, 일정은 `progressSurvival`이 단계가 열릴 때마다
  // `injectLeagueEntries`로 넣는다. 여기서 KBL식 통짜 일정(144경기)을 얹으면
  // 10팀짜리 리그에 있지도 않은 경기가 깔린다.
  // (예전엔 리그 분기의 기본값이 KBL이라 독립도 그리로 흘렀다)
  if (leagueId === "LEAGUE_INDEPENDENT") {
    seasonStore.setSchedule([]);
    return 0;
  }

  const schedule = await proSchedule(leagueId, teamIds, myTeamId);
  seasonStore.setSchedule(schedule);
  return schedule.length;
}
