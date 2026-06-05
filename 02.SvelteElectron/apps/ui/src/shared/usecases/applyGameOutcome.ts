import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { seasonStore } from "../stores/season";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { calcGameGrowth } from "../utils/growthEngine";
import { simulateGame } from "../utils/gameSimulator";
import type { MatchResult, PitcherGameLine, PlayerCondition, UnifiedGameOutcome } from "../types/season";
import { buildFriendlyResultMessage, ratePerformance } from "../utils/friendlyMatchEngine";
import { getTeamRotation, rotationSizeForLeague } from "../utils/rosterEngine";

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

  // ── 친선경기 분기 ─────────────────────────────────────────
  const scheduleEntry = sBefore.schedule.find((e) => e.id === outcome.scheduleId);
  if (scheduleEntry?.isFriendly) {
    const teamResult = buildTeamMatchResult(
      outcome.homeTeamId, outcome.awayTeamId, outcome.homeScore, outcome.awayScore,
    );
    const protagonist = gBefore.protagonist;
    const safeOuts    = typeof outcome.outsRecorded === "number" ? outcome.outsRecorded : 0;
    const ip          = Number((Math.max(0, safeOuts) / 3).toFixed(1));
    const leagueId = protagonist.leagueId;
    const lState   = sBefore.leagueState[leagueId];
    const homeRot  = lState?.teamRotationIndex?.[outcome.homeTeamId] ?? 0;
    const awayRot  = lState?.teamRotationIndex?.[outcome.awayTeamId] ?? 0;

    // 투구 기록이 전혀 없으면 log/메시지 생략 (등판 없음)
    const didNotPitch = safeOuts === 0
      && Math.max(0, outcome.strikeouts) === 0
      && Math.max(0, outcome.walksAllowed) === 0
      && Math.max(0, outcome.hitsAllowed) === 0
      && (outcome.pitchCount ?? 0) === 0;
    if (didNotPitch) {
      seasonStore.applyFriendlyResult(
        outcome.scheduleId, teamResult, leagueId,
        outcome.homeTeamId, outcome.awayTeamId,
        homeRot + 1, awayRot + 1,
        null, {},
      );
      seasonStore.resolvePendingAction("game", outcome.scheduleId);
      await gameStore.save();
      await seasonStore.save();
      return;
    }

    const er     = Math.max(0, outcome.hitsAllowed > 0 ? Math.round(outcome.hitsAllowed * 0.35) : 0);
    const rating = ratePerformance(ip, ip > 0 ? (er / ip) * 9 : 99);
    const log = {
      scheduleId:     outcome.scheduleId,
      week:           outcome.week,
      opponentTeamId: outcome.homeTeamId === protagonist.teamId ? outcome.awayTeamId : outcome.homeTeamId,
      ip, er,
      k:  Math.max(0, outcome.strikeouts),
      bb: Math.max(0, outcome.walksAllowed),
      rating,
    };

    // ── 주인공 피로/컨디션 패치 (공식경기의 50% 강도) ──────────
    const fatigueDelta   = Math.ceil(ip * 2);
    const conditionDelta = -Math.ceil(ip * 0.8);
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
    const oppPitcherId = oppRotation[oppRotIdx % Math.max(1, oppRotation.length)];
    const pitcherConditions: Record<string, PlayerCondition> = {};
    if (oppPitcherId) {
      const prev = lState?.playerConditions?.[oppPitcherId];
      pitcherConditions[oppPitcherId] = {
        fatigue:          Math.min(100, (prev?.fatigue ?? 50) + 15),
        lastPitchedWeek:  outcome.week,
        pitchOutsLast:    safeOuts,
      };
    }

    seasonStore.applyFriendlyResult(
      outcome.scheduleId, teamResult, leagueId,
      outcome.homeTeamId, outcome.awayTeamId,
      homeRot + 1, awayRot + 1,
      log, pitcherConditions,
    );
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
    );
    gameStore.addMessage(message);
    await gameStore.save();
    await seasonStore.save();
    return;
  }
  // ────────────────────────────────────────────────────────
  const protagonist = gBefore.protagonist;
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
  const runsAllowed = outcome.homeTeamId === myTeamId ? outcome.awayScore : outcome.homeScore;
  const safeOuts = (typeof outcome.outsRecorded === "number" && !isNaN(outcome.outsRecorded)) ? outcome.outsRecorded : 0;
  const inningsPitched = Number((Math.max(0, safeOuts) / 3).toFixed(1));
  const pitcherLine: PitcherGameLine | null = didEnter ? {
    role: "pitcher",
    playerId: protagonist.id,
    ip: inningsPitched,
    er: runsAllowed,
    h: Math.max(0, outcome.hitsAllowed),
    k: Math.max(0, outcome.strikeouts),
    bb: Math.max(0, outcome.walksAllowed),
    decision: won ? "W" : isDraw ? "ND" : "L",
    pitchCount: outcome.pitchCount > 0 ? outcome.pitchCount : undefined,
  } : null;
  let playerLines = Array.isArray(outcome.playerLines) && outcome.playerLines.length > 0
    ? outcome.playerLines
    : [...(pitcherLine ? [pitcherLine] : []), ...(outcome.batterLines ?? [])];
  if (!(Array.isArray(outcome.playerLines) && outcome.playerLines.length > 0)) {
    const entities = get(masterStore).entities;
    if (entities.length > 0) {
      try {
        const sim = await simulateGame(outcome.homeTeamId, outcome.awayTeamId, entities, { week: outcome.week });
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

  seasonStore.applyMatchResult(outcome.scheduleId, matchResult);
  seasonStore.syncProtagonistLeagueResult(protagonist.leagueId, matchResult, outcome.homeTeamId);
  seasonStore.resolvePendingAction("game", outcome.scheduleId);

  const myScore = outcome.homeTeamId === myTeamId ? outcome.homeScore : outcome.awayScore;
  const oppScore = outcome.homeTeamId === myTeamId ? outcome.awayScore : outcome.homeScore;
  const diff = Math.abs(myScore - oppScore);
  const growth = await calcGameGrowth(protagonist, won, diff, outcome.strikeouts);
  const teamById = new Map(get(masterStore).teams.map((t) => [t.id, t.name]));
  const awayTeamName = teamById.get(outcome.awayTeamId) ?? outcome.awayTeamId;
  const homeTeamName = teamById.get(outcome.homeTeamId) ?? outcome.homeTeamId;

  gameStore.applyWeekResult(
    growth.protagonistPatch,
    [`W${outcome.week} ${awayTeamName} ${outcome.awayScore}:${outcome.homeScore} ${homeTeamName}`, ...(growth.logs ?? [])],
    [],
    sBefore.currentWeek,
  );
  if (growth.fameDelta !== 0) gameStore.updateFame(growth.fameDelta);

  const gotSave = won && outcome.week > 3 && diff <= 3 ? 1 : 0;
  gameStore.recordBaseballAchievementMetric({
    strikeouts: Math.max(0, outcome.strikeouts),
    save: gotSave,
    won,
  });
  gameStore.addMessage({
    id: `msg-game-w${outcome.week}-${Date.now()}`,
    category: "system",
    sender: "Game System",
    subject: `W${outcome.week} game result`,
    preview: `${outcome.awayScore}:${outcome.homeScore} ${won ? "win" : isDraw ? "draw" : "loss"} / ${outcome.strikeouts}K / ${outcome.hitsAllowed}H / ${outcome.walksAllowed}BB`,
    body:
      outcome.summary ||
      `W${outcome.week} ${awayTeamName} ${outcome.awayScore}:${outcome.homeScore} ${homeTeamName}\n` +
        `Line: ${outcome.strikeouts}K / ${outcome.hitsAllowed}H / ${outcome.walksAllowed}BB / ${outcome.errors}E`,
    createdAt: `W${outcome.week}`,
    readAt: null,
  });

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
        severity: severity as "moderate" | "severe",
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
