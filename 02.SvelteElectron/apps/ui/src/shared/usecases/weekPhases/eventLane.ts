/**
 * **이벤트 뽑기 · 통지 · 월간 TOP 10** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「시간을 세는 조건 넷의 입력」부터
 *   「고교 월간 유망주 TOP 10」까지가 그대로 나왔다. 블록 경계는 옮기기 전
 *   파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **자리에 뜻이 있다.** 훈련·부상 계산 **뒤**(그래서 `afterP` 를 받는다),
 *   주차 결과 배치 적용 **앞**이다. 뒤로 옮기면 이번 주 성장이 이벤트 조건에
 *   안 잡히고, 앞으로 옮기면 지난주 값으로 이벤트가 돈다.
 *
 * ⚠ **인자 묶음 하나로 받는다.** 옮기기 전 이 절이 읽던 지역 변수가 열하나라
 *   이름을 그대로 두는 것이 본문을 한 글자도 안 고치는 유일한 길이다.
 *   `growth` 는 **참조로** 받아 같은 객체의 `protagonistPatch`·`logs` 에 쌓인다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore, type GameStoreState } from "../../stores/game";
import { seasonStore, type SeasonStoreState } from "../../stores/season";
import type { MasterState } from "../../stores/master";
import { collectStreakKeys, tickStreaks, lastGameOf } from "../../utils/eventCounters";
import { storyNpcIdOf } from "../../utils/storyNpcRegistry";
import { runEventEngine } from "./events";
import { stageGroupOf } from "../../utils/tierRules";
import { generateTop10, buildTop10Message, rankEffect } from "../../utils/top10Engine";
import type { EventContext } from "../../types/event";
import type { EventEngineResult } from "../../utils/eventEngine";
import type { GrowthResult } from "../../utils/growthEngine";
import type { MessageItem } from "../../types/main";
import type { ProtagonistSave } from "../../types/save";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface EventLaneArgs {
  weekNum: number;
  weekInYear: number;
  careerStageYear: number;
  /** 함수 머리의 스냅샷 셋 — 옮기기 전과 같은 값을 봐야 한다 */
  g: GameStoreState;
  s: SeasonStoreState;
  m: MasterState;
  /** 훈련·부상 반영 **뒤** 주인공 — 이벤트 조건이 이걸 본다 */
  afterP: ProtagonistSave;
  /** 관계도 행 — 안 실으면 `relation_gte`/`relation_lte` 가 늘 false 다 */
  relRows: NonNullable<EventContext["relations"]>;
  /** 성장 결과 — **참조로 받는다.** 연속 주 수·지속 보정이 여기에 쌓인다 */
  growth: GrowthResult;
  /** 훈련 효율 보정의 남은 주 (§5 `trainEffBoost`) */
  teb: ProtagonistSave["trainEffBoost"];
  /** 부상 위험 보정의 남은 주 (§5 `injuryRiskMod`) */
  irm: ProtagonistSave["injuryRiskMod"];
  /** 난수 꼬리 — 이벤트 등급 추첨과 문장 뱅크가 같이 먹는다 */
  eventRands: number[];
}

/** 아래 「주차 결과 배치 적용」이 그대로 쓰는 여섯 */
export interface EventLaneResult {
  evResult: EventEngineResult;
  top10Snap: import("../../types/save").Top10Snapshot | undefined;
  top10Msg: MessageItem | undefined;
  rankPopularityDelta: number;
  rankScoutScoreDelta: number;
  rankMoraleDelta: number;
}

export async function runEventLaneWeek({
  weekNum,
  weekInYear,
  careerStageYear,
  g,
  s,
  m,
  afterP,
  relRows,
  growth,
  teb,
  irm,
  eventRands,
}: EventLaneArgs): Promise<EventLaneResult> {
  // ── 시간을 세는 조건 넷의 입력 (2026-09-08 · §12) ──────────────
  //
  // ⚠ **데이터가 실제로 쓰는 것만 준비한다.** 「쓸지도 모르니 다 세자」로 두면
  //   세이브가 축마다 커지고 어느 칸이 읽히는지도 모르게 된다.
  const streakKeys = collectStreakKeys(m.eventRules);
  /**
   * `compare` 가 가리키는 NPC 들의 비교값. 데이터에 적힌 id 만 훑는다.
   *
   * ⚠ **이름표(`role`)도 여기서 편다** (2026-09-21 · 죽은 칸 5). 데이터가 적는 건
   *   `rival`·`mentee` 같은 이름표이고, 그게 가리키는 npcId 는 등록부
   *   (`protagonist.storyNpcs`)에만 있다. 여기서 안 풀면 아래 `storyNpcs` 에
   *   그 사람의 스탯이 안 실려 **조건이 조용히 false** 가 된다.
   */
  const storyNpcRoles = afterP.storyNpcs;
  const compareNpcStats: Record<string, Record<string, number>> = {};
  {
    const wanted = new Set<string>();
    for (const r of m.eventRules) {
      for (const c of [...(r.conditions ?? []), ...(r.hiddenCondition ?? [])]) {
        if (c.type !== "compare") continue;
        const id = storyNpcIdOf(storyNpcRoles, c);
        if (id) wanted.add(id);
      }
    }
    if (wanted.size > 0) {
      for (const e of m.entities) {
        if (!wanted.has(e.id)) continue;
        const d = e.details?.player;
        if (!d) continue;
        compareNpcStats[e.id] = {
          // 「나와 그의 스탯」이라 주인공 경로와 **같은 이름**이어야 한다
          "pitching.ovr": d.pitching?.ovr ?? 0,
          "batting.ovr": d.batting?.ovr ?? 0,
        };
      }
    }
  }

  const eventCtx: EventContext = {
    protagonist: afterP,
    currentWeek: weekNum,
    // 전역 뒤 경과(`weeksSinceDischarge`)가 시즌을 넘어 세려면 연도가 있어야 한다 (B-20 재회)
    seasonYear: s.seasonYear,
    seasonPhase: s.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    // 🔴 **주인공 리그를 명시해 읽는다** (2026-09-01).
    //
    // `s.standings`는 "지금 열려 있는 시즌"의 순위표인데, **진로가 바뀌고
    // 새 시즌이 열리기 전까지 옛 리그 것**이다. `applyDraftDecision`이
    // `careerStage`·`leagueId`를 먼저 바꾸고, `openProSeason`(→`initSeason`)은
    // 계약 수락 뒤에야 불린다 — 그 사이 주가 흐르면 **주인공이 독립인데
    // 순위표는 고교 102팀**이다.
    //
    // 실측(트랙 B · `rankCtxProbe`): 독립 주인공의 `s.standings`가 102팀이고
    // **그 안에 주인공 팀이 없었다**(`top_순위 = 0`). `team_rank` 조건은
    // 팀을 못 찾으면 **조용히 false**다 — 오류도 로그도 없다.
    //
    // ⚠ `leagueState`는 `initAllLeaguesV3`가 전 리그를 미리 채우므로
    // 그 창에서도 옳다. 없을 때만 `s.standings`로 떨어진다(구 세이브).
    standings: s.leagueState?.[afterP.leagueId]?.standings ?? s.standings,
    stats: s.stats,
    triggeredEvents: s.triggeredEvents,
    sentenceMemory: s.sentenceMemory ?? {},
    // 대학 이벤트가 학점·경고를 조건으로 읽는다 (Phase 9-C).
    // **`get(gameStore)`로 최신을 읽는다** — 이번 주 학점 누적이 반영돼야 한다
    schoolState: get(gameStore).schoolState,
    // 관계도 조건이 읽는다 — 안 실으면 `relation_gte`/`relation_lte`가 항상 false다
    relations: relRows,

    // ── 등급 줄기가 읽는 것 (2026-09-08 · §1·§3) ──────────────────
    tierCounts: s.tierCounts,
    tierLastWeek: s.tierLastWeek,
    eventStarve: s.eventStarve,
    // 개막했나 — **내 일정에 이번 주까지 온 경기가 있나**로 본다 (B 제보 ②).
    // ⚠ 경기 **결과** 유무로 보지 않는다: 개막 주에 결과가 아직 없는 경우가
    //   있고, 그때 「아직 안 열렸다」로 읽으면 그 주가 통째로 빈다
    seasonOpened: s.schedule.some((e) => e.week <= weekNum),
    // 직전 등판 — `last_game` 조건(§12). 못 찾으면 `undefined` 고 그 조건은 false 다
    lastGame: lastGameOf(s.schedule, afterP.id, afterP.teamId),
    // `compare` 조건(§12)이 볼 NPC 들. **미리 실어 준다** — 평가기는 동기다.
    // ⚠ 데이터가 가리키는 id 만 싣는다. 엔티티 전부를 접으면 매주 수천 명을 훑는다
    storyNpcs: compareNpcStats,
    // 이름표 → npcId. 평가기가 `role` 을 풀 때 본다 (죽은 칸 5)
    storyNpcRoles,
  };
  // 🔴 **연속 주 수는 이벤트를 돌리기 전에 갱신한다** (§12). 나중에 하면
  //    「이번 주도 성실 90 이었다」가 이번 주 이벤트에 안 잡혀 한 주씩 밀린다.
  //    `tickStreaks` 가 유일한 갱신 자리다.
  const nextStreaks = tickStreaks(afterP.streaks, streakKeys, eventCtx);
  eventCtx.protagonist = { ...afterP, streaks: nextStreaks };
  const evResult = runEventEngine(
    m.eventRules,
    m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx,
    s.seasonYear,
    careerStageYear,
    eventRands,
    m.tierRules!,
    stageGroupOf(m.tierRules!, afterP),
  );
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);
  seasonStore.recordSentencePicks(evResult.sentencePicks);
  gameStore.recordCareerTriggeredEvents(evResult.careerUpdatedTriggers);
  // 등급 줄기의 시즌 상태 — 상한·마른 시즌·밀린 주. 안 쓰면 상한이 안 걸리고
  // 밀린 이야기가 매주 처음부터 다시 밀린다
  seasonStore.recordTierState({
    gradeFired: evResult.gradeFired,
    week: weekNum,
    starveUpdates: evResult.starveUpdates,
  });
  // 업적 셋(첫 유니크 · 히든 3 · 한 시즌 레어 6)의 입력 — **커리어 통**이다
  // (C 4-5). 시즌 통은 위가, 커리어 통은 아래가 든다. 소식함을 세면 상한에
  // 밀려 지워진 옛 소식이 안 세진다
  gameStore.recordEventGrade({
    grade: evResult.gradeFired,
    rareThisSeason: (s.tierCounts?.rare ?? 0) + (evResult.gradeFired === "rare" ? 1 : 0),
  });
  growth.protagonistPatch.streaks = nextStreaks;

  // ── 지속 보정의 남은 주를 줄인다 (2026-09-08 · §5) ─────────────
  //
  // 🔴 **안 줄이면 한 번 받은 보정이 커리어 내내 남는다.** 「4주 동안」이
  //    영구가 되면 레어 하나가 유니크보다 세진다. 0 이 되면 지운다 —
  //    `{ pct, weeksLeft: 0 }` 을 남겨 두면 계측이 「걸려 있다」로 읽는다.
  if (teb && teb.weeksLeft > 0) {
    const left = teb.weeksLeft - 1;
    growth.protagonistPatch.trainEffBoost = left > 0 ? { ...teb, weeksLeft: left } : undefined;
    if (left === 0) growth.logs.push(`[보상] 훈련 효율 +${teb.pct}% 가 끝났다`);
  }
  if (irm && irm.weeksLeft > 0) {
    const left = irm.weeksLeft - 1;
    growth.protagonistPatch.injuryRiskMod = left > 0 ? { ...irm, weeksLeft: left } : undefined;
    if (left === 0)
      growth.logs.push(`[보상] 부상 위험 ${irm.pct > 0 ? "+" : ""}${irm.pct}% 가 끝났다`);
  }

  // 고교 월간 유망주 TOP 10 (4주마다)
  let top10Snap: import("../../types/save").Top10Snapshot | undefined;
  let top10Msg: MessageItem | undefined;
  let rankPopularityDelta = 0;
  let rankScoutScoreDelta = 0;
  let rankMoraleDelta = 0;
  if (g.protagonist.careerStage === "highschool" && weekInYear % 4 === 0 && weekInYear >= 4) {
    const heroStats = s.stats[afterP.id] ?? null;
    const last = afterP.playerType === "pitcher" ? g.lastTop10Pitcher : g.lastTop10Batter;

    // 팀 이름은 `refs.json`이 정본이다 — 예전엔 top10Engine 안에 옛 16팀 표가
    // 박혀 있어 나머지 팀은 ID가 그대로 문구에 찍혔다
    const teamNameOf = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;
    top10Snap = await generateTop10(
      afterP,
      heroStats as
        | import("../../types/save").PitcherSeasonStats
        | import("../../types/save").BatterSeasonStats
        | null,
      m.entities,
      weekNum,
      afterP.grade ?? 1,
      s.seasonYear,
      teamNameOf,
    );
    top10Msg = await buildTop10Message(
      afterP,
      heroStats as
        | import("../../types/save").PitcherSeasonStats
        | import("../../types/save").BatterSeasonStats
        | null,
      m.entities,
      top10Snap,
      last,
      weekNum,
      s.seasonYear,
      teamNameOf,
    );
    const heroEntry = top10Snap.entries.find((e) => e.id === "PLY_HERO");
    if (heroEntry) {
      const ef = rankEffect(heroEntry.rank);
      rankPopularityDelta = ef.popularity;
      rankScoutScoreDelta = ef.scoutScore;
      rankMoraleDelta = ef.morale;
    }
  }

  return {
    evResult,
    top10Snap,
    top10Msg,
    rankPopularityDelta,
    rankScoutScoreDelta,
    rankMoraleDelta,
  };
}
