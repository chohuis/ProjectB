import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { seasonStore } from "../stores/season";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { calcGameGrowth } from "../utils/growthEngine";
import { recordGameLogs } from "../repo/gameLogRepo";
import { recordGameResult } from "./recordGameResult";
import { staffModsOf } from "../utils/staffEffects";
import { simulateGame } from "../utils/gameSimulator";
import type { MatchResult, PitcherGameLine, PlayerCondition, UnifiedGameOutcome } from "../types/season";
import { buildFriendlyResultMessage, buildOfficialResultMessage, ratePerformance, type PitcherRole } from "../utils/friendlyMatchEngine";
import { getTeamRotation, getTeamBullpen, rotationSizeForLeague, starterOfRotation } from "../utils/rosterEngine";

/**
 * 투수 승패 판정 — **규칙은 Rust `decide_pitcher`가 정본이다.**
 *
 * 🔴 **여기 사본이 있었고 이미 갈라져 있었다** (2026-08-28에 합쳤다):
 *   · 세이브에 `outs >= 1`이 붙어 있었다 — Rust엔 없다
 *   · 여유 점수가 `3`으로 박혀 있었다 — Rust는 `SAVE_MAX_MARGIN`을 본다
 *   그래서 **주인공만 다른 승패 규칙**을 썼다. 그 값이 다승왕 집계·경력
 *   기록·계약 평가로 그대로 들어간다.
 *
 * ⚠ 예전엔 `won ? "W" : "L"`이라 **0.6이닝 던진 불펜이 매 경기 승패를
 *   기록했다**(실측 12경기 6승 6패). 그건 이미 고쳐졌었는데, 고치면서
 *   **규칙을 옮겨 적은 것**이 이번 결함의 씨앗이었다.
 *
 * ⚠ Rust를 못 부르는 환경(Vite 단독)에서는 `"ND"`다 — **규칙을 여기 다시
 *   적지 않는다.** 적으면 또 갈린다.
 */
async function pitcherDecision(
  role: PitcherRole,
  won: boolean,
  isDraw: boolean,
  outs: number,
  margin: number,
): Promise<PitcherGameLine["decision"]> {
  if (isDraw) return "ND";
  const api = window.projectB?.engine;
  if (!api) return "ND";
  try {
    const r = JSON.parse(await api("calcPitcherDecisionNative", JSON.stringify({
      isStarter: role === "SP",
      isCloser:  role === "CP",
      outs,
      teamWon:   won,
      margin,
    }))) as { decision?: string; error?: string };
    return (r.decision ?? "ND") as PitcherGameLine["decision"];
  } catch {
    return "ND";
  }
}

/** 아웃 수 — 숫자가 아니면 0. 두 갈래가 같은 방식으로 읽어야 한다 */
function safeOutsOf(o: UnifiedGameOutcome): number {
  return (typeof o.outsRecorded === "number" && !isNaN(o.outsRecorded))
    ? Math.max(0, o.outsRecorded) : 0;
}

function buildTeamMatchResult(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): MatchResult {
  const isDraw = homeScore === awayScore;
  return {
    homeScore,
    awayScore,
    // Keep winnerId populated for backward compatibility in existing code paths.
    winnerId: isDraw ? homeTeamId : homeScore > awayScore ? homeTeamId : awayTeamId,
    loserId: isDraw ? null : homeScore > awayScore ? awayTeamId : homeTeamId,
    playerLines: [],
    events: [],
  };
}


export async function applyGameOutcome(outcome: UnifiedGameOutcome): Promise<void> {
  const sBefore = get(seasonStore);
  const gBefore = get(gameStore);

  // 의무 휴식이 일 단위라 날짜가 필요하다 (Phase 5-8). 호출부가 안 넘겼으면 일정에서.
  const gameDate = outcome.gameDate
    ?? sBefore.schedule.find((e) => e.id === outcome.scheduleId)?.gameDate
    ?? Object.values(sBefore.leagueSchedules ?? {})
        .flat().find((e) => e.id === outcome.scheduleId)?.gameDate
    ?? "";

  // ── 친선경기 분기 ─────────────────────────────────────────
  const scheduleEntry = sBefore.schedule.find((e) => e.id === outcome.scheduleId);
  if (scheduleEntry?.isFriendly) {
    const teamResult = buildTeamMatchResult(
      outcome.homeTeamId, outcome.awayTeamId, outcome.homeScore, outcome.awayScore,
    );
    const protagonist = gBefore.protagonist;
    const role        = (protagonist.position as PitcherRole) ?? "SP";
    const safeOuts    = typeof outcome.outsRecorded === "number" ? outcome.outsRecorded : 0;
    // 🔴 **`toFixed(1)`로 저장하고 있었다** — `5.6666`이 `5.7`이 된다.
    //   저장에서 반올림하면 **누적 합계에 오차가 쌓인다**(ERA·WHIP이 그 값으로 나뉜다).
    //   표기는 화면에서 만든다(`baseballFormat.ipLabel`).
    const ip          = Math.max(0, safeOuts) / 3;
    const leagueId = protagonist.leagueId;
    const lState   = sBefore.leagueState[leagueId];
    const homeRot  = lState?.teamRotationIndex?.[outcome.homeTeamId] ?? 0;
    const awayRot  = lState?.teamRotationIndex?.[outcome.awayTeamId] ?? 0;

    // protagonistEntered: true면 통계가 0이어도 등판한 것으로 간주
    const didNotPitch = outcome.protagonistEntered !== true
      && safeOuts === 0
      && Math.max(0, outcome.strikeouts) === 0
      && Math.max(0, outcome.walksAllowed) === 0
      && Math.max(0, outcome.hitsAllowed) === 0
      && (outcome.pitchCount ?? 0) === 0;
    if (didNotPitch) {
      await recordGameResult({
        kind: "friendly",
        scheduleId: outcome.scheduleId,
        result: teamResult,
        leagueId: leagueId,
        homeTeamId: outcome.homeTeamId,
        awayTeamId: outcome.awayTeamId,
        nextHomeRotIdx: homeRot + 1,
        nextAwayRotIdx: awayRot + 1,
        pitcherConditions: {},
      });
      seasonStore.resolvePendingAction("game", outcome.scheduleId);
      await gameStore.save();
      await seasonStore.save();
      return;
    }

    // 🔴 **자책점은 엔진이 준다** (2026-08-28). 여기만 `피안타 × 0.35`로
    //   역산하고 있었다 — **값을 지어내는 자리**다. 피안타가 부풀면 ERA가
    //   자동으로 따라 올라간다(정식 경기 쪽 주석이 실측 ERA 14.78을 적어 뒀다).
    //
    // ⚠ **같은 결함이 둘이었는데 하나만 고쳐져 있었다.** 아래 정식 경기
    //   갈래는 진작 `outcome.earnedRuns`를 쓰고 있었고 연습경기만 남았다.
    //   이 저장소에서 되풀이되는 형태다 — 고칠 곳이 둘이면 둘 다 본다.
    // ⚠ 구 경로 호환으로 값이 없을 때만 역산으로 떨어진다.
    const er     = typeof outcome.earnedRuns === "number"
      ? Math.max(0, Math.round(outcome.earnedRuns))
      : Math.round(Math.max(0, outcome.hitsAllowed) * 0.35);
    const rating = ratePerformance(ip, er, role);
    const log = {
      scheduleId:     outcome.scheduleId,
      week:           outcome.week,
      opponentTeamId: outcome.homeTeamId === protagonist.teamId ? outcome.awayTeamId : outcome.homeTeamId,
      ip, er,
      k:  Math.max(0, outcome.strikeouts),
      bb: Math.max(0, outcome.walksAllowed),
      rating,
    };

    // 🔴 **주인공 친선경기는 아무의 기록도 안 남았다.**
    // `buildTeamMatchResult`가 `playerLines: []`를 넣어서, 주인공이 시범경기를
    // 던져도 "최근 경기"에 한 줄도 안 떴다(실측: lines=0인 경기 넷이 전부
    // 주인공 팀 친선이었다).
    //
    // ⚠ **순위·시즌 기록은 그대로 안 건드린다** — `applyFriendlyResult`가
    // 친선을 집계에서 빼는 건 설계다. 여기서 채우는 건 **경기별 기록**이고,
    // 그건 "시범경기도 기록에 남긴다"는 확정 사항이다.
    //
    // ⚠ **주인공 것만 채운다.** 같이 뛴 동료·상대는 친선 경로가 애초에
    // 시뮬을 안 돌려서 성적 자체가 없다 — 지어내지 않는다.
    const heroLine: import("../types/season").PitcherGameLine = {
      role: "pitcher",
      playerId: protagonist.id,
      ip, er,
      h:  Math.max(0, outcome.hitsAllowed),
      k:  Math.max(0, outcome.strikeouts),
      bb: Math.max(0, outcome.walksAllowed),
      // 친선엔 승패를 안 매긴다 — 순위에 안 들어가므로 기록만 남긴다
      decision: "ND",
      ...(outcome.pitchCount ? { pitchCount: outcome.pitchCount } : {}),
    };
    teamResult.playerLines = [heroLine];

    // ── 주인공 피로/컨디션 패치 (공식경기의 50% 강도) ──────────
    const fatigueDelta   = Math.ceil(ip * 2);
    const conditionDelta = -Math.ceil(ip * 0.5);  // 0.8 → 0.5 완화
    gameStore.applyWeekResult(
      {
        fatigue:   Math.min(100, protagonist.fatigue   + fatigueDelta),
        condition: Math.max(0,   protagonist.condition + conditionDelta),
      },
      [], [], sBefore.currentWeek,
    );

    // ── 상대 선발 투수 컨디션 패치 ────────────────────────────
    const oppTeamId   = outcome.homeTeamId === protagonist.teamId ? outcome.awayTeamId : outcome.homeTeamId;
    const oppRotIdx   = (oppTeamId === outcome.homeTeamId ? homeRot : awayRot);
    const rotSize     = rotationSizeForLeague(leagueId);
    const entities    = get(masterStore).entities;
    const oppRotation = getTeamRotation(oppTeamId, entities, undefined, rotSize);
    const oppPitcherId = starterOfRotation(oppRotation, oppRotIdx);
    const pitcherConditions: Record<string, PlayerCondition> = {};
    if (oppPitcherId) {
      const prev = lState?.playerConditions?.[oppPitcherId];
      pitcherConditions[oppPitcherId] = {
        fatigue:            Math.min(100, (prev?.fatigue ?? 50) + 15),
        lastPitchedWeek:    outcome.week,
        lastPitchedDate:    gameDate,
        lastPitchCount:     outcome.pitchCount,
        pitchOutsLast:      safeOuts,
        lastStartGameCount: oppRotIdx,
        consecutiveAppearances: 0,
      };
    }

    // ── 상대 불펜/마무리 연속 출전 카운터 리셋 ────────────────
    const oppBullpenIds = getTeamBullpen(oppTeamId, entities, oppRotation).bullpen;
    for (const rpId of oppBullpenIds) {
      if (rpId === oppPitcherId) continue;
      const prev = lState?.playerConditions?.[rpId];
      if (prev) {
        pitcherConditions[rpId] = { ...prev, consecutiveAppearances: 0 };
      }
    }

    await recordGameResult({
      kind: "friendly",
      scheduleId: outcome.scheduleId,
      result: teamResult,
      leagueId: leagueId,
      homeTeamId: outcome.homeTeamId,
      awayTeamId: outcome.awayTeamId,
      nextHomeRotIdx: homeRot + 1,
      nextAwayRotIdx: awayRot + 1,
      friendlyLog: log,
      pitcherConditions: pitcherConditions,
    });
    seasonStore.resolvePendingAction("game", outcome.scheduleId);

    const teamMap = new Map(get(masterStore).teams.map((t) => [t.id, t.name]));
    const { message } = buildFriendlyResultMessage(
      scheduleEntry,
      outcome.homeScore, outcome.awayScore,
      ip, er,
      Math.max(0, outcome.strikeouts),
      Math.max(0, outcome.walksAllowed),
      Math.max(0, outcome.hitsAllowed),
      teamMap,
      role,
    );
    gameStore.addMessage(message);
    await gameStore.save();
    await seasonStore.save();
    return;
  }
  // ────────────────────────────────────────────────────────
  const protagonist = gBefore.protagonist;
  const role        = (protagonist.position as PitcherRole) ?? "SP";
  const myTeamId = outcome.protagonistTeamId;

  const teamResult = buildTeamMatchResult(
    outcome.homeTeamId,
    outcome.awayTeamId,
    outcome.homeScore,
    outcome.awayScore,
  );
  const isDraw = teamResult.loserId === null;
  const won = !isDraw && teamResult.winnerId === myTeamId;

  const didEnter = outcome.protagonistEntered !== false;
  // ⚠ **판정은 Rust가 한다** — IPC라 객체 리터럴 안에서 못 부른다. 먼저 받는다
  const decision = await pitcherDecision(
    role, won, isDraw, safeOutsOf(outcome),
    Math.abs(outcome.homeScore - outcome.awayScore),
  );
  // ⚠ **자책점은 엔진이 준다.** 예전엔 `피안타 × 0.35`로 역산했고, 그래서
  // 피안타가 부풀면 ERA가 자동으로 따라 올라갔다(실측 ERA 14.78 — 시뮬이 아니라
  // 이 곱셈이 만든 숫자다). 구 경로 호환으로 값이 없을 때만 역산으로 떨어진다.
  const er = typeof outcome.earnedRuns === "number"
    ? Math.max(0, Math.round(outcome.earnedRuns))
    : Math.round(Math.max(0, outcome.hitsAllowed) * 0.35);
  const safeOuts = (typeof outcome.outsRecorded === "number" && !isNaN(outcome.outsRecorded)) ? outcome.outsRecorded : 0;
  const inningsPitched = Number((Math.max(0, safeOuts) / 3).toFixed(1));
  const pitcherLine: PitcherGameLine | null = didEnter ? {
    role: "pitcher",
    playerId: protagonist.id,
    ip: inningsPitched,
    er,
    h: Math.max(0, outcome.hitsAllowed),
    k: Math.max(0, outcome.strikeouts),
    bb: Math.max(0, outcome.walksAllowed),
    decision,
    // ⚠ 안 실으면 주인공만 선발 등판이 0으로 남는다
    gs: role === "SP",
    pitchCount: outcome.pitchCount > 0 ? outcome.pitchCount : undefined,
  } : null;
  // 🔴 **주인공 줄을 엔진 줄로 갈아치우면 안 된다** (2026-08-28).
  //   엔진은 등판 중인 주인공을 큐 누적에서 건너뛰고 `*_since_entry`에 따로
  //   쌓는다 — 그래서 `outcome.playerLines`엔 **주인공이 없다.** 예전엔 그
  //   배열이 늘 비어서 이 갈래가 안 돌았고, 엔진이 채우기 시작하자
  //   **주인공 기록이 통째로 사라질 뻔했다.** 합친다.
  const engineLines = Array.isArray(outcome.playerLines) ? outcome.playerLines : [];
  const hasEngineLines = engineLines.length > 0;
  let playerLines = hasEngineLines
    ? [
        ...(pitcherLine ? [pitcherLine] : []),
        ...engineLines.filter((l) => l.playerId !== protagonist.id),
      ]
    : [...(pitcherLine ? [pitcherLine] : []), ...(outcome.batterLines ?? [])];
  if (!hasEngineLines) {
    const entities = get(masterStore).entities;
    if (entities.length > 0) {
      try {
        const sim = await simulateGame(outcome.homeTeamId, outcome.awayTeamId, entities, {
          week: outcome.week,
          worldSeed: get(seasonStore).worldSeed,
        });
        const merged = sim.result.playerLines.filter((l) => l.playerId !== protagonist.id);
        playerLines = [...(pitcherLine ? [pitcherLine] : []), ...merged];
      } catch {
        // keep fallback lines when simulation enrichment fails
      }
    }
  }

  const matchResult: MatchResult = {
    ...teamResult,
    playerLines,
  };

  // 🔴 **주인공 경기도 로그를 안 남겼다.** 이 경로는 경기 엔진을 타서
  // 배경 시뮬(`season.ts`)도 `simulateNpcGame`도 안 거친다 — 그래서
  // 주인공만, 그리고 그날 같이 뛴 우리 팀 선수까지 "최근 경기"가 비었다.
  // `playerLines`엔 주인공과 양 팀 출전 선수가 다 들어 있다.
  await recordGameLogs(
    gBefore.currentSlotId ?? "",
    sBefore.seasonYear, sBefore.currentWeek, playerLines,
    {
      // 날짜는 위에서 이미 일정을 뒤져 뒀다 — 두 번 찾지 않는다
      gameDate,
      homeTeamId: outcome.homeTeamId,
      awayTeamId: outcome.awayTeamId,
      teamOf: (() => {
        const m = new Map(get(masterStore).entities.map((e) => [e.id, e.teamId ?? ""]));
        // ⚠ 주인공은 entities에 없을 수 있다 — gameStore가 정본이다
        return (pid: string) => (pid === protagonist.id
          ? (protagonist.teamId ?? "")
          : (m.get(pid) ?? ""));
      })(),
    },
  );

  seasonStore.applyMatchResult(outcome.scheduleId, matchResult);
  seasonStore.syncProtagonistLeagueResult(protagonist.leagueId, matchResult, outcome.homeTeamId, outcome.awayTeamId);
  seasonStore.resolvePendingAction("game", outcome.scheduleId);

  const myScore = outcome.homeTeamId === myTeamId ? outcome.homeScore : outcome.awayScore;
  const oppScore = outcome.homeTeamId === myTeamId ? outcome.awayScore : outcome.homeScore;
  const diff = Math.abs(myScore - oppScore);
  // 감독 동기부여가 사기 변동폭을, 구단주 홍보력이 명성 변동폭을 민다 (§7-5 F-1)
  const myMods = staffModsOf(myTeamId ?? "", get(masterStore).entities, { specialty: "투수" });
  const growth = await calcGameGrowth(protagonist, won, diff, outcome.strikeouts, myMods);
  const teamById = new Map(get(masterStore).teams.map((t) => [t.id, t.name]));
  const awayTeamName = teamById.get(outcome.awayTeamId) ?? outcome.awayTeamId;
  const homeTeamName = teamById.get(outcome.homeTeamId) ?? outcome.homeTeamId;

  gameStore.applyWeekResult(
    growth.protagonistPatch,
    [`W${outcome.week} ${awayTeamName} ${outcome.awayScore}:${outcome.homeScore} ${homeTeamName}`, ...(growth.logs ?? [])],
    [],
    sBefore.currentWeek,
  );
  // ⚠ 예전엔 `updateFame`이었다 — 같은 일을 하면서 상한만 100이라
  //   이벤트로 100을 넘긴 명성을 경기 한 번에 깎았다. 정본은 200이다
  if (growth.fameDelta !== 0) gameStore.applyFameChange(growth.fameDelta);

  const gotSave = won && outcome.week > 3 && diff <= 3 ? 1 : 0;
  gameStore.recordBaseballAchievementMetric({
    strikeouts: Math.max(0, outcome.strikeouts),
    save: gotSave,
    won,
  });
  if (didEnter) {
    const scheduleEntry = sBefore.schedule.find((e) => e.id === outcome.scheduleId);
    if (scheduleEntry) {
      const officialMsg = buildOfficialResultMessage(
        scheduleEntry,
        gBefore.protagonist.teamId,
        outcome.homeScore,
        outcome.awayScore,
        inningsPitched,
        er,
        Math.max(0, outcome.strikeouts),
        Math.max(0, outcome.walksAllowed),
        Math.max(0, outcome.hitsAllowed),
        outcome.pitchCount > 0 ? outcome.pitchCount : 0,
        won,
        isDraw,
        teamById,
        role,
      );
      gameStore.addMessage(officialMsg);
    }
  }

  const gAfter = get(gameStore);
  const sAfter = get(seasonStore);
  const mAfter = get(masterStore);
  const achMetrics = computeMetrics(
    gAfter.achievementMetrics,
    gAfter.mailbox,
    sAfter.standings,
    sAfter.schedule,
    myTeamId,
  );
  const achResult = checkAchievements(
    mAfter.achievements,
    gAfter.achievements,
    achMetrics,
    `W${outcome.week}`,
  );
  if (
    achResult.newlyUnlocked.length > 0 ||
    achResult.updatedRuntime.some((r, i) => r.progress !== gAfter.achievements[i]?.progress)
  ) {
    gameStore.applyAchievementCheck(achResult);
  }

  // ── 상대팀 SP/불펜 로테이션 컨디션 업데이트 ──────────────────
  {
    const entities2  = get(masterStore).entities;
    const sNow       = get(seasonStore);
    const oppTeamId2 = outcome.homeTeamId === myTeamId ? outcome.awayTeamId : outcome.homeTeamId;
    const oppIsHome  = oppTeamId2 === outcome.homeTeamId;
    const leagueId2  = protagonist.leagueId;
    const lState2    = sNow.leagueState[leagueId2];
    const oppRotIdx2 = oppIsHome
      ? (lState2?.teamRotationIndex?.[oppTeamId2] ?? 0)
      : (lState2?.teamRotationIndex?.[oppTeamId2] ?? 0);
    const rotSize2   = rotationSizeForLeague(leagueId2);
    const oppRot2    = getTeamRotation(oppTeamId2, entities2, undefined, rotSize2, lState2?.playerConditions, outcome.week, leagueId2);
    const oppSpId    = starterOfRotation(oppRot2, oppRotIdx2);
    const oppBullpen2 = getTeamBullpen(oppTeamId2, entities2, oppRot2, undefined, lState2?.playerConditions, oppRotIdx2).bullpen;

    const rotConditions: Record<string, PlayerCondition> = {};

    // SP 컨디션 업데이트
    if (oppSpId) {
      const prev = lState2?.playerConditions?.[oppSpId];
      rotConditions[oppSpId] = {
        fatigue:            Math.min(100, (prev?.fatigue ?? 50) + 15),
        lastPitchedWeek:    outcome.week,
        lastPitchedDate:    gameDate,
        lastPitchCount:     outcome.pitchCount,
        pitchOutsLast:      safeOuts,
        lastStartGameCount: oppRotIdx2,
        consecutiveAppearances: 0,
      };
    }

    // 불펜 연속 출전 카운터 리셋 (이 경기에 미출전)
    for (const rpId of oppBullpen2) {
      if (rpId === oppSpId) continue;
      const prev = lState2?.playerConditions?.[rpId];
      if (prev) {
        rotConditions[rpId] = { ...prev, consecutiveAppearances: 0 };
      }
    }

    if (Object.keys(rotConditions).length > 0) {
      seasonStore.patchLeagueConditions(leagueId2, rotConditions);
    }
  }

  // ── 경기 중 부상 처리 ─────────────────────────────────────────
  if (outcome.midGameInjury) {
    const { injuryType, severity } = outcome.midGameInjury;
    const recoveryWeeks: Record<string, number> = {
      ARM_FATIGUE: 2, MUSCLE_TIGHTNESS: 2, BLISTER: 2, BACK_STIFFNESS: 3,
      ELBOW_INFLAM: 5, SHOULDER_INFLAM: 5, OBLIQUE_STRAIN: 6,
      UCL_PARTIAL: 14,
    };
    const weeks = recoveryWeeks[injuryType] ?? 3;
    const newInjury: import("../types/save").InjuryState = {
      type: injuryType as import("../types/save").InjuryType,
      severity: severity as import("../types/save").InjurySeverity,
      recoveryWeeksLeft: weeks,
      totalRecoveryWeeks: weeks,
      permanentPenaltyApplied: false,
      source: "game",
    };
    gameStore.applyWeekResult({ injury: newInjury }, [], [], outcome.week);
    if (severity === "moderate" || severity === "severe") {
      seasonStore.pushPendingAction({
        type: "injuryTreatment",
        injuryType,
        severity,
      });
    }
    const { INJURY_LABEL } = await import("../types/save");
    gameStore.addMessage({
      id:        `msg-injury-game-w${outcome.week}-${Date.now()}`,
      category:  "system",
      sender:    "의무팀",
      subject:   `경기 중 부상 — ${INJURY_LABEL[injuryType as keyof typeof INJURY_LABEL] ?? injuryType}`,
      preview:   `${weeks}주 회복 필요`,
      body:      `경기 중 부상이 발생했습니다.\n\n부상: ${INJURY_LABEL[injuryType as keyof typeof INJURY_LABEL] ?? injuryType}\n등급: ${severity === "light" ? "경상" : severity === "moderate" ? "중상" : "중증"}\n예상 회복: ${weeks}주`,
      createdAt: `W${outcome.week}`,
      readAt:    null,
    });
  }

  await gameStore.save();
  await seasonStore.save();
}
