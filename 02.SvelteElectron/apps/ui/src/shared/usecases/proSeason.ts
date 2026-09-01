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
  // 🔴 **배경 리그도 같이 채운다** (2026-09-02).
  //
  // `initSeason` 은 `set(next)` 로 **전부 갈아끼운다** — `leagueSchedules` 가
  // 빈다. 그래서 여기로 무대를 여는 해만 배경 리그가 통째로 없었다:
  //
  // ```
  //   2029 [pro_kbl]  KBL 630/630 · HIGHSCHOOL 233 · UNIVERSITY 85   ← 4개
  //   2030 [pro_kbl]  9개 리그 전부                                  ← 롤오버가 채운다
  // ```
  //
  // ⚠ 롤오버 쪽만 고쳤더니 **구멍이 여기로 옮겨왔다.** 시즌을 여는 자리가
  //   셋이다(여기 · 롤오버 프로 갈래 · 롤오버 꼬리) — 셋 다 채워야 한다.
  // ⚠ `keepOwnSchedule` — 바로 위·아래에서 세우는 `s.schedule` 을 덮으면 안 된다.
  // ⚠ **헬퍼로 묶지 않는다.** 한 번 그렇게 짰더니 변이 검증에서 호출을 지워도
  //   `seasonOpenRefill.test.ts` 가 **선언에 남은 이름**을 보고 통과했다.
  //   검사가 이름이 아니라 호출을 보게 하려면 부르는 자리에 그대로 적는다.
  if (leagueId === "LEAGUE_INDEPENDENT") {
    seasonStore.setSchedule([]);
    await seasonStore.reinitSeasonSchedules(leagueId, myTeamId, { keepOwnSchedule: true });
    return 0;
  }

  const schedule = await proSchedule(leagueId, teamIds, myTeamId);
  seasonStore.setSchedule(schedule);
  await seasonStore.reinitSeasonSchedules(leagueId, myTeamId, { keepOwnSchedule: true });
  return schedule.length;
}
