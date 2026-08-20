import { get } from "svelte/store";
import { masterStore } from "../../stores/master";
import { seasonStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { npcLiveStatsStore } from "../../stores/npcLiveStats";
import { autoLog } from "../../stores/autoAdvance";
import { simulateGame } from "../../utils/gameSimulator";
import { rotationSizeForLeague } from "../../utils/rosterEngine";
import { recordGameLogs } from "../../repo/gameLogRepo";
import type { MatchResult, PlayerCondition } from "../../types/season";

export interface NpcGameSim {
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, PlayerCondition>;
}

/**
 * 주인공 팀 경기를 주인공 없이 시뮬한다 (부상·학사경고·컨디션 회피).
 *
 * ⚠ **예전엔 옵션을 하나도 안 넘겼다.** `simulateGame(home, away, entities)`만
 * 부르면 기본값이 전부 들어간다 — 그리고 그 기본값들이 조용히 다른 게임을
 * 만든다:
 *
 *   conditions {}     피로가 없다 → 등판 간격·휴식 규칙이 걸릴 근거가 없다
 *   rotIdx 0          로테이션이 안 돈다
 *   rotationSize 5    고교는 3이다
 *   leagueId ""       `FULL_ENGINE_LEAGUES`에 안 걸려 **통합 엔진을 안 탄다**
 *   npcLiveStats 없음 생성값 OVR을 읽는다 — 3년을 지나도 안 자란 값이다
 *
 * 같은 리그의 다른 팀 경기는 `advanceWeek`에서 이걸 전부 넘긴다. 주인공
 * 팀 경기만 옛 경로로 돌고 있었고, 값이 있고 타입도 맞아 조용했다.
 *
 * 반환도 결과만 주던 것을 전체로 바꿨다 — 호출부가 로테이션 인덱스와
 * 피로를 스토어에 얹어야 다음 경기가 이어진다.
 */
export async function simulateNpcGame(
  homeTeamId: string,
  awayTeamId: string,
): Promise<NpcGameSim> {
  const entities = get(masterStore).entities;
  const s = get(seasonStore);
  const leagueId = get(gameStore).protagonist.leagueId;
  const lState = s.leagueState[leagueId];
  const homeRotIdx = lState?.teamRotationIndex?.[homeTeamId] ?? 0;
  const awayRotIdx = lState?.teamRotationIndex?.[awayTeamId] ?? 0;

  if (entities.length > 0) {
    const sim = await simulateGame(homeTeamId, awayTeamId, entities, {
      conditions: lState?.playerConditions ?? {},
      homeRotIdx, awayRotIdx,
      week: s.currentWeek,
      npcInjuries: s.npcInjuries,
      rotationSize: rotationSizeForLeague(leagueId),
      npcLiveStats: get(npcLiveStatsStore),
      leagueId,
      // 씨앗 — 같은 세이브·같은 주면 같은 경기가 나온다
      worldSeed: s.worldSeed,
    });
    // 🔴 **주인공 리그는 경기 로그가 통째로 안 쌓였다.** 배경 리그는
    // 시뮬 직후 쌓는데(`season.ts`) 이 경로엔 그게 없었다 — 실측에서
    // 내 리그 3,060명이 전부 0건, 다른 리그는 64~80%였다.
    //
    // ⚠ **호출부가 아니라 여기서 부른다.** `simulateNpcGame`을 부르는 데가
    // 여덟이라 각자 부르게 하면 반드시 빠뜨린다.
    await recordGameLogs(
      get(gameStore).currentSlotId ?? "",
      s.seasonYear, s.currentWeek, sim.result.playerLines,
    );

    return {
      result: sim.result,
      nextHomeRotIdx: sim.nextHomeRotIdx,
      nextAwayRotIdx: sim.nextAwayRotIdx,
      pitcherConditions: sim.pitcherConditions,
    };
  }

  autoLog(`[폴백SIM] 주인공리그 엔티티없음: ${homeTeamId} vs ${awayTeamId}`);
  const fb = JSON.parse(await window.projectB!.weekCalcNpcFallback(
    JSON.stringify({ homeTeamId, awayTeamId })
  )) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
  return {
    result: { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] },
    // 폴백엔 투수 개념이 없다 — 인덱스를 밀면 아무도 안 던졌는데 로테이션이 돈다
    nextHomeRotIdx: homeRotIdx,
    nextAwayRotIdx: awayRotIdx,
    pitcherConditions: {},
  };
}

export async function simulateProtagonistGame(
  homeTeamId: string,
  awayTeamId: string,
): Promise<NpcGameSim> {
  return simulateNpcGame(homeTeamId, awayTeamId);
}
