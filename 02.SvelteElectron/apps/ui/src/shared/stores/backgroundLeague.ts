import { parkDimsForHomeTeam } from "../utils/parkDims";
import type { LeagueSeasonState, MatchResult, PlayerCondition, ScheduleEntry } from "../types/season";
import type { NpcInjuryEntry, CareerStage } from "../types/save";
import type { EntityRow, TeamRef } from "./master";
import type { SimWorkerRequest, SimWorkerResultItem } from "../workers/simWorker";
import type { SeasonStoreState } from "./season";
import { accumulateStats, migrateLeagueState, updateStandings } from "../utils/season-helpers";
import { makeStandings, ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { simulateGame } from "../utils/gameSimulator";
import { staffStatsOf } from "../utils/staffEffects";
import { rotationSizeForLeague } from "../utils/rosterEngine";
import { autoLog } from "./autoAdvance";
import { seedOf } from "../utils/seedOf";
import { getLeagueRadius, RADIUS_GATED_LEAGUES } from "../utils/radiusGate";

/**
 * 로테이션 운용 감각 — 감독 `bullpenRead`.
 *
 * ⚠ 여기가 **`manager.stats.handlePersonnel`을 읽고 있었다.** 그 키는 7-5 F-0에서
 * 사라졌는데(구 5종 → 새 5종) 이 파일은 목록에 없어 살아남았다. 그래서 배경 리그
 * 전 경기(주 ~56경기 × 52주)가 **감독 능력치 50 고정**으로 돌고 있었다 —
 * 로테이션 선택 축이 세계 전체에서 죽어 있었던 셈이다.
 *
 * 회귀(`test:staff`)가 **하드코딩 파일 목록**을 쓰고 있어서 못 잡았다.
 * 그래서 그 테스트를 "소비처를 찾아내는" 방식으로 바꿨다.
 */
function getManagerRotationSense(teamId: string, entities: EntityRow[]): number {
  return staffStatsOf(teamId, entities).bullpenRead;
}

const WEEKLY_FATIGUE_RECOVERY = 28;
const SIM_CHUNK_SIZE = 8;

export async function runSimBatch(
  games: SimWorkerRequest["games"],
  entities: EntityRow[],
  npcInjuries?: Record<string, NpcInjuryEntry>,
  npcLiveStats?: Record<string, import("../types/season").NpcLiveStat>,
  // 씨앗 — 같은 세이브·같은 주면 같은 경기가 나온다(재현성).
  // ⚠ 안 넘기면 씨앗 없이 돈다 — `matchSeedWiring.test.ts`가 호출부를 본다
  worldSeed?: number,
  /**
   * 팀·구장 — **담장을 고르는 데 쓴다.**
   *
   * ⚠ 안 넘기면 리그 전체가 중립 구장이 된다. 27개를 채워 놓고도
   *   같은 야구를 하는 셈이다.
   */
  parkRefs?: {
    teams: readonly { id: string; stadium?: string }[];
    stadiums: readonly import("./master").StadiumRef[];
  },
): Promise<SimWorkerResultItem[]> {
  const results: SimWorkerResultItem[] = [];
  for (let i = 0; i < games.length; i += SIM_CHUNK_SIZE) {
    const chunk = games.slice(i, i + SIM_CHUNK_SIZE);
    const chunkResults = await Promise.all(chunk.map(async (g) => {
      const rotSize = g.leagueId ? rotationSizeForLeague(g.leagueId) : 5;
      const sim = await simulateGame(g.homeTeamId, g.awayTeamId, entities, {
        // 🔴 **담장을 넘긴다.** 안 넘기면 리그 전체가 중립 구장이 된다
        parkDims:             parkRefs
          ? parkDimsForHomeTeam(g.homeTeamId, parkRefs.teams, parkRefs.stadiums)
          : undefined,
        conditions:           g.conditions,
        homeRotIdx:           g.homeRotIdx ?? 0,
        awayRotIdx:           g.awayRotIdx ?? 0,
        phase:                g.phase,
        week:                 g.week ?? 0,
        npcInjuries,
        npcLiveStats,
        rotationSize:         rotSize,
        leagueId:             g.leagueId ?? "",
        homeHandlePersonnel:  getManagerRotationSense(g.homeTeamId, entities),
        awayHandlePersonnel:  getManagerRotationSense(g.awayTeamId, entities),
        worldSeed,
        scheduleId:           g.id,
      });

      // 엔티티 없어서 시뮬 실패(winner_id="") 시 폴백으로 랜덤 결과 생성
      let result = sim.result;
      if (!result.winnerId) {
        // ⚠ **"엔티티없음"이라 단정하지 않는다.** `winnerId`가 빈 이유는
        // 여럿일 수 있다 — 로스터가 비었을 수도, 라인업을 못 짰을 수도,
        // 엔진이 다른 이유로 실패했을 수도 있다. **세어서 찍는다.**
        const homeN = entities.filter((e) => e.teamId === g.homeTeamId && e.role === "player").length;
        const awayN = entities.filter((e) => e.teamId === g.awayTeamId && e.role === "player").length;
        autoLog(`[폴백SIM] ${g.leagueId} ${g.homeTeamId}(${homeN}명) vs ${g.awayTeamId}(${awayN}명)`);
        const api = (window as unknown as { projectB: Record<string, (p: string) => Promise<string>> }).projectB;
        const fb = JSON.parse(
          await api.weekCalcNpcFallback(JSON.stringify({
            homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
            // ⚠ 경기마다 다른 씨앗 — 리그·팀·주차를 섞는다
            seed: seedOf(worldSeed ?? 0, g.week ?? 0, g.leagueId, g.homeTeamId, g.awayTeamId, "fallback"),
          }))
        ) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
        result = { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] };
      }

      return {
        id:                g.id,
        result,
        nextHomeRotIdx:    sim.nextHomeRotIdx,
        nextAwayRotIdx:    sim.nextAwayRotIdx,
        pitcherConditions: sim.pitcherConditions,
      };
    }));
    results.push(...chunkResults);
    if (i + SIM_CHUNK_SIZE < games.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return results;
}

export type SimBatchResult = {
  nextSchedules:   Record<string, ScheduleEntry[]>;
  nextLeagueState: Record<string, LeagueSeasonState>;
  gameLogs:        { npcId: string; role: string; statJson: string }[];
};

export async function simulateBackgroundLeagues(
  s: SeasonStoreState,
  week: number,
  protagonistLeagueId: string,
  entities: EntityRow[],
  npcLiveStats?: Record<string, import("../types/season").NpcLiveStat>,
  careerStage?: CareerStage,
  /** 팀·구장 — **담장을 고르는 데 쓴다.** 안 넘기면 리그가 중립 구장이 된다 */
  parkRefs?: {
    teams: readonly { id: string; stadium?: string }[];
    stadiums: readonly import("./master").StadiumRef[];
  },
): Promise<SimBatchResult | null> {
  const batch: SimWorkerRequest["games"] = [];
  if (Object.keys(s.leagueSchedules).length === 0) {
    autoLog("[배경리그] leagueSchedules 비어있음 — 배경 리그 시뮬 스킵");
  }
  for (const [lid, schedule] of Object.entries(s.leagueSchedules)) {
    if (lid === protagonistLeagueId) continue;
    if (!Array.isArray(schedule)) {
      autoLog(`[배경리그오류] leagueSchedules 오염 — 배열 아님: ${lid}`);
      continue;
    }
    // 반경 게이트: 비활성(3)은 시뮬을 건너뛴다.
    // ⚠ 예전엔 `radius === 2`(드리프트)도 같이 봤는데 **그 값은 없다** —
    //   `LeagueRadius`는 `1 | 3`이고 `getLeagueRadius`는 둘 중 하나만 돌려준다.
    //   옆에 "드리프트(2)는 별도로 처리"라고 적힌 것은 옷 설계의 잔재다.
    if (careerStage && RADIUS_GATED_LEAGUES.has(lid)) {
      const radius = getLeagueRadius(careerStage, lid);
      if (radius === 3) continue;
    }
    const lState = migrateLeagueState(s.leagueState[lid] ?? {});
    for (const e of schedule) {
      if (e.week <= week && !e.result) {
        batch.push({
          leagueId:   lid,
          id:         e.id,
          homeTeamId: e.homeTeamId,
          awayTeamId: e.awayTeamId,
          homeRotIdx:  lState.teamRotationIndex[e.homeTeamId] ?? 0,
          awayRotIdx:  lState.teamRotationIndex[e.awayTeamId] ?? 0,
          conditions:  lState.playerConditions,
          week,
          // 로그에 "7/14 vs 청람고"를 쓰려면 여기서 들고 가야 한다.
          // 나중에 시즌·주차로 되짚으면 한 주에 여럿이라 경기를 못 고른다
          gameDate: e.gameDate ?? "",
          // ⚠ 안 실으면 연장 상한이 안 걸려 무승부가 안 난다
          phase: e.phase,
        });
      }
    }
  }
  if (batch.length === 0) return null;

  const simmed = await runSimBatch(batch, entities, s.npcInjuries, npcLiveStats, s.worldSeed, parkRefs);
  const simMap = new Map(simmed.map((r) => [r.id, r]));

  // 🔴 **날짜·상대를 안 실으면 화면이 "W19"만 쓴다.** 게다가 경기 단위
  // 적재율 검사가 팀으로 짝을 맞추므로, 비워 두면 **전부 미적재로 잡힌다**
  // (실측에서 배경 리그 아홉이 0%로 나왔다).
  const teamOfPlayer = new Map(entities.map((e) => [e.id, e.teamId ?? ""]));
  const gameById = new Map(batch.map((b) => [b.id, b]));
  const gameLogs: {
    npcId: string; role: string; statJson: string;
    gameDate: string; teamId: string; opponentTeamId: string;
  }[] = [];
  for (const sim of simmed) {
    const g = gameById.get(sim.id);
    for (const line of sim.result.playerLines) {
      const mine = teamOfPlayer.get(line.playerId) ?? "";
      // 소속을 못 찾으면 상대도 안 적는다 — 틀린 상대는 없는 것보다 나쁘다
      const known = !!g && (mine === g.homeTeamId || mine === g.awayTeamId);
      gameLogs.push({
        npcId: line.playerId, role: line.role, statJson: JSON.stringify(line),
        gameDate: g?.gameDate ?? "",
        teamId: known ? mine : "",
        opponentTeamId: known
          ? (mine === g.homeTeamId ? g.awayTeamId : g.homeTeamId) : "",
      });
    }
  }

  const nextSchedules   = { ...s.leagueSchedules };
  const nextLeagueState = { ...s.leagueState };

  for (const item of batch) {
    const sim = simMap.get(item.id);
    if (!sim) continue;
    const lid = item.leagueId;

    nextSchedules[lid] = (nextSchedules[lid] ?? []).map((e) =>
      e.id === item.id ? { ...e, result: sim.result } : e,
    );

    const cur = migrateLeagueState(nextLeagueState[lid] ?? { standings: makeStandings(ALL_TEAMS_BY_LEAGUE[lid] ?? []) });
    nextLeagueState[lid] = {
      standings: updateStandings(cur.standings, sim.result, item.homeTeamId, item.awayTeamId),
      stats:     accumulateStats(cur.stats, sim.result.playerLines),
      playerConditions:  { ...cur.playerConditions,  ...sim.pitcherConditions },
      teamRotationIndex: {
        ...cur.teamRotationIndex,
        [item.homeTeamId]: sim.nextHomeRotIdx,
        [item.awayTeamId]: sim.nextAwayRotIdx,
      },
    };
  }

  return { nextSchedules, nextLeagueState, gameLogs };
}

export function syncProtagonistLeagueUpdate(
  s: SeasonStoreState,
  leagueId: string,
  result: MatchResult,
  homeTeamId: string,
  awayTeamId: string,
): SeasonStoreState {
  const cur = migrateLeagueState(s.leagueState[leagueId] ?? {});
  return {
    ...s,
    leagueState: {
      ...s.leagueState,
      [leagueId]: {
        ...cur,
        standings: updateStandings(cur.standings, result, homeTeamId, awayTeamId),
        stats:     accumulateStats(cur.stats, result.playerLines),
        // 🔴 **로테이션을 여기서 올린다** (2026-09-01 · 트랙 C 가 찾았다).
        //
        //   예전엔 안 올렸다. 그래서 **배경 팀은 선발이 돌고 주인공 팀만
        //   같은 투수가 계속 나왔다.** 같은 파일 위쪽 `simulateBackgroundWeek`
        //   은 `nextHomeRotIdx`·`nextAwayRotIdx` 를 넣고, 친선경기
        //   (`applyFriendlyResult`)도 `(idx ?? 0) + 1` 을 명시로 넘긴다 —
        //   **정규 경기만 빠져 있었다.**
        //
        // ⚠ **여기여야 한다.** `applyMatchResult` 도 `rot` 인자를 받지만,
        //   그걸 쓰려면 `leagueId` 를 같이 넘겨야 하고 그러면 바로 다음 줄의
        //   이 함수와 **리그 순위·기록을 두 번 누적**한다(호출부
        //   `applyGameOutcome` 이 둘을 잇달아 부른다).
        // ⚠ 이중 적용 위험은 없다 — `syncProtagonistLeagueResult` 의 호출부는
        //   `applyGameOutcome` 한 곳뿐이고, 그 경로는 `applyMatchResult` 에
        //   `leagueId` 를 안 넘긴다(`if (!leagueId) return`).
        teamRotationIndex: {
          ...cur.teamRotationIndex,
          [homeTeamId]: (cur.teamRotationIndex?.[homeTeamId] ?? 0) + 1,
          [awayTeamId]: (cur.teamRotationIndex?.[awayTeamId] ?? 0) + 1,
        },
      },
    },
  };
}

export function applyWeeklyConditionRecovery(
  s: SeasonStoreState,
  entities: EntityRow[],
  /**
   * 전지훈련 가산 — 선수 id → 추가 회복량. **시즌 초에만 온다.**
   *
   * 🔴 `operations.camp`(구단 규모의 6%)가 **나가기만 하고 아무 효과가
   *   없었다** — 4-B 에서 만든 죽은 갈래다. 구장비는 수용인원에, 2군비는
   *   2군 존재 여부에 물리는데 전훈만 어디에도 안 물렸다.
   * ⚠ **의료팀과 다른 축이다.** 둘 다 부상에 물리면 어느 쪽이 효과인지
   *   못 가린다 — 전훈은 컨디션, 의료는 회복 속도다.
   */
  campBonus?: Record<string, number>,
): SeasonStoreState {
  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const nextState = { ...s.leagueState };
  for (const [lid, ls] of Object.entries(nextState)) {
    const nextConditions = { ...ls.playerConditions };
    for (const [pid, cond] of Object.entries(nextConditions)) {
      const rec = (entityMap.get(pid)?.details?.player as import("./master").EntityPlayerDetails | undefined)?.pitching?.recovery ?? 50;
      const recoveryMod = 0.6 + rec * 0.008;
      const gain = Math.round(WEEKLY_FATIGUE_RECOVERY * recoveryMod)
        + (campBonus?.[pid] ?? 0);
      nextConditions[pid] = { ...cond, fatigue: Math.min(100, cond.fatigue + gain) };
    }
    nextState[lid] = { ...ls, playerConditions: nextConditions };
  }
  return { ...s, leagueState: nextState };
}
