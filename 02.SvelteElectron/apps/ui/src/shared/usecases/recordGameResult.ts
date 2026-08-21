// ── 경기 결과를 받는 유일한 문 ──────────────────────────────────────────────
//
// 🔴 **경기 결과를 처리하는 자리가 흩어져 있었다.** `seasonStore`의
// `apply*Result` 넷을 호출부 **20곳**이 제각기 부르는데, 경기 로그를 남기는
// 자리는 **10곳뿐**이었다. 절반이 비어서 기록이 샜다:
//
//     대학 W25/27/28 [대회]  23건
//     독립 W24 [정규]         4건
//     주인공 리그 [친선]       2건
//
// 더 나쁜 건 **세 번에 나눠 막았는데 매번 "다 됐다"고 읽었다**는 것이다
// (5% → 84% → 100%로 보였다가 또 샜다). 낱개로 쫓는 방식이 네 번 실패했다.
//
// 그래서 문을 하나로 만든다. **호출부는 여기만 부른다** — 어느 갈래든
// 로그·순위·기록이 같은 자리에서 처리되고, 새 갈래가 생겨도 이 함수를
// 부를 수밖에 없다.
//
// ⚠ **로직을 옮기지 않는다.** 이 함수는 **분기만** 한다 — 순위·기록·로테이션·
// 피로 계산은 전부 기존 `apply*Result` 안에 그대로 둔다. 넷이 서로 다른 일을
// 하기 때문에(친선은 순위 미반영, 대회는 개인 기록만) 여기서 합치려 들면
// 그 차이가 뭉개진다. 합치는 건 별도 작업이다.
//
// ⚠ **검사가 막는다** — `gameResultFunnel.test.ts`가 `apply*Result`를 이 파일
// 밖에서 부르면 실패한다. 그게 없으면 다음에 다섯 번째 갈래가 또 샌다.

import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { recordGameLogs } from "../repo/gameLogRepo";
import type { MatchResult, PlayerCondition, FriendlyPerformanceLog } from "../types/season";

/**
 * 경기 갈래. **넷이 하는 일이 다르다** — 뭉뚱그리면 안 된다.
 *
 *   league     정규 리그전. 순위 + 개인 기록
 *   group      주인공 리그의 NPC끼리 경기. 순위 + 개인 기록
 *   tournament 전국대회. **개인 기록만** — 순위표에 섞이면 다음 대회 시드가 오염된다
 *   friendly   친선/시범. **순위·기록 미반영**, 로테이션만 갱신
 */
export type GameKind = "league" | "group" | "tournament" | "friendly";

export interface GameResultInput {
  kind: GameKind;
  scheduleId: string;
  result: MatchResult;
  /** 친선·대회·group은 필수. league는 주인공 리그면 생략 가능(스토어가 처리) */
  leagueId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  nextHomeRotIdx?: number;
  nextAwayRotIdx?: number;
  pitcherConditions?: Record<string, PlayerCondition>;
  /** 친선 전용 — 주인공 개인 성적 요약 */
  friendlyLog?: FriendlyPerformanceLog | null;
  /** 일정에서 온 경기 날짜. 없으면 로그가 주차로 되돌아간다 */
  gameDate?: string;
}

/** 선수 → 소속팀. `entities`가 정본이라 한 번만 만든다 */
function teamLookup() {
  const m = new Map(get(masterStore).entities.map((e) => [e.id, e.teamId ?? ""]));
  const heroId = get(gameStore).protagonist.id;
  const heroTeam = get(gameStore).protagonist.teamId ?? "";
  // ⚠ 주인공은 entities에 없을 수 있다 — gameStore가 정본이다
  return (pid: string) => (pid === heroId ? heroTeam : (m.get(pid) ?? ""));
}

/**
 * 경기 결과를 반영하고 기록을 남긴다.
 *
 * **순서가 중요하다** — 로그를 먼저 남긴다. `apply*Result`가 스토어를 갱신하면
 * 그 주의 상태가 바뀌므로, 뒤에 남기면 날짜·주차가 한 칸 밀릴 수 있다.
 */
export async function recordGameResult(input: GameResultInput): Promise<void> {
  const s = get(seasonStore);
  const {
    kind, scheduleId, result, leagueId, homeTeamId, awayTeamId,
    nextHomeRotIdx = 0, nextAwayRotIdx = 0, pitcherConditions = {},
  } = input;

  await recordGameLogs(
    get(gameStore).currentSlotId ?? "",
    s.seasonYear, s.currentWeek, result.playerLines,
    {
      gameDate: input.gameDate ?? dateOf(scheduleId),
      homeTeamId, awayTeamId, teamOf: teamLookup(),
    },
  );

  switch (kind) {
    case "friendly":
      seasonStore.applyFriendlyResult(
        scheduleId, result, leagueId ?? "", homeTeamId ?? "", awayTeamId ?? "",
        nextHomeRotIdx, nextAwayRotIdx, input.friendlyLog ?? null, pitcherConditions,
      );
      return;
    case "tournament":
      seasonStore.applyTournamentResult(
        scheduleId, result, leagueId ?? "", homeTeamId ?? "", awayTeamId ?? "",
        nextHomeRotIdx, nextAwayRotIdx, pitcherConditions,
      );
      return;
    case "group":
      seasonStore.applyProtagonistGroupNpcResult(
        scheduleId, result, leagueId ?? "", homeTeamId ?? "", awayTeamId ?? "",
        nextHomeRotIdx, nextAwayRotIdx, pitcherConditions,
      );
      return;
    case "league":
      seasonStore.applyMatchResult(
        scheduleId, result, leagueId,
        { nextHomeRotIdx, nextAwayRotIdx, pitcherConditions },
      );
      return;
  }
}

/** 일정에서 날짜를 찾는다. 못 찾으면 빈 문자열 — 화면이 주차로 되돌아간다 */
function dateOf(scheduleId: string): string {
  const s = get(seasonStore);
  const hit = s.schedule.find((e) => e.id === scheduleId)
    ?? Object.values(s.leagueSchedules ?? {}).flat().find((e) => e.id === scheduleId);
  return hit?.gameDate ?? "";
}
