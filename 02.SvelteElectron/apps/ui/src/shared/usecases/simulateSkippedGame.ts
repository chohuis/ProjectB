// ── 주인공이 등판을 회피한 경기 ───────────────────────────────
//
// 🔴 **회피한 경기는 선수 기록이 통째로 없었다** (2026-09-01 · 트랙 C 가 잡았다).
//
// `MainPage` 의 "회피" 갈래가 `weekCalcNpcFallback` 을 부르고 그 반환을
// `playerLines: []` 로 감싸 넘겼다. 그런데 그 엔진 함수는 **점수 넷만**
// 돌려준다(`home_score` · `away_score` · `winner_id` · `loser_id`) —
// 이름 그대로 **폴백**이고, 로스터가 없어 시뮬이 실패했을 때 쓰라고 있는
// 것이다(`backgroundLeague.ts` 는 `sim.result.winnerId` 가 비었을 때만 쓴다).
//
// 결과: 점수는 나오고 순위도 오르는데 **그 경기의 선수 기록만 없다.**
// 순위표로는 안 보이고, 회피를 자주 쓰면 시즌 성적이 조용히 비어 간다.
//
// ## 왜 화면에서 못 고치나
//
// 진짜 시뮬(`runSimBatch`)은 엔티티·컨디션·로테이션·부상·라이브스탯·
// 구장·씨앗을 다 모아야 부를 수 있다. 그건 화면이 할 일이 아니고,
// `pages/` 는 C 소유·`stores/` 는 A 소유라 **화면에서 모으면 경계도 넘는다.**
// 그래서 여기 usecase 로 감싼다 — 화면은 한 줄만 부른다.
//
// ⚠ **폴백을 지우지 않는다.** 로스터가 비면 시뮬이 여전히 실패하고,
//   그때는 점수라도 나와야 일정이 안 막힌다. 실패했을 때만 그리로 간다.
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { npcLiveStatsStore } from "../stores/npcLiveStats";
import { runSimBatch } from "../stores/backgroundLeague";
import type { MatchResult } from "../types/season";

/**
 * 주인공 팀 경기 하나를 **배경 리그와 같은 방식으로** 시뮬한다.
 *
 * 성공하면 선수 기록이 들어 있는 결과를, 못 하면 `null` 을 돌려준다.
 * `null` 이면 호출부가 예전 폴백(점수만)으로 가면 된다.
 *
 * ⚠ 주인공은 이 경기에 **안 나온다.** 회피란 그런 뜻이고, 시뮬은 팀
 *   로스터로 라인업을 짜므로 주인공이 빠져도 나머지 기록은 남는다.
 */
export async function simulateSkippedGame(
  scheduleId: string,
): Promise<{
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, import("../types/season").PlayerCondition>;
} | null> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);

  const entry = s.schedule.find((e) => e.id === scheduleId);
  if (!entry) return null;

  const leagueId = g.protagonist.leagueId;
  const lState = s.leagueState?.[leagueId];

  const batch = [{
    leagueId,
    id: entry.id,
    homeTeamId: entry.homeTeamId,
    awayTeamId: entry.awayTeamId,
    homeRotIdx: lState?.teamRotationIndex?.[entry.homeTeamId] ?? 0,
    awayRotIdx: lState?.teamRotationIndex?.[entry.awayTeamId] ?? 0,
    conditions: lState?.playerConditions ?? {},
    week: s.currentWeek,
    // ⚠ 안 실으면 화면 로그가 주차만 쓴다 — 배경 경기와 같은 이유다
    gameDate: entry.gameDate ?? "",
    // ⚠ 안 실으면 연장 상한이 안 걸려 무승부가 안 난다
    phase: entry.phase,
  }];

  const parkRefs = { teams: m.teams ?? [], stadiums: m.stadiums ?? [] };
  const simmed = await runSimBatch(
    batch as Parameters<typeof runSimBatch>[0],
    m.entities ?? [],
    s.npcInjuries,
    get(npcLiveStatsStore),
    s.worldSeed,
    parkRefs,
  );

  const hit = simmed[0];
  // 🔴 **시뮬이 실패하면 `runSimBatch` 가 스스로 폴백을 태운다.**
  //   그때 `playerLines` 가 비므로, 그건 성공으로 치지 않는다 —
  //   호출부가 예전 경로로 가는 것과 같은 결과이고 여기서 거짓말을 하면
  //   "고쳤는데 여전히 빈다"를 못 가린다.
  if (!hit || !hit.result?.winnerId || hit.result.playerLines.length === 0) return null;

  return {
    result: hit.result,
    nextHomeRotIdx: hit.nextHomeRotIdx,
    nextAwayRotIdx: hit.nextAwayRotIdx,
    pitcherConditions: hit.pitcherConditions,
  };
}
