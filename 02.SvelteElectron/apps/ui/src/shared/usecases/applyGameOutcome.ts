import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { seasonStore } from "../stores/season";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { calcGameGrowth } from "../utils/growthEngine";
import type { MatchResult, PitcherGameLine, UnifiedGameOutcome } from "../types/season";

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

  const runsAllowed = outcome.homeTeamId === myTeamId ? outcome.awayScore : outcome.homeScore;
  const safeOuts = (typeof outcome.outsRecorded === "number" && !isNaN(outcome.outsRecorded)) ? outcome.outsRecorded : 0;
  const inningsPitched = Number((Math.max(0, safeOuts) / 3).toFixed(1));
  const pitcherLine: PitcherGameLine = {
    role: "pitcher",
    playerId: protagonist.id,
    ip: inningsPitched,
    er: runsAllowed,
    h: Math.max(0, outcome.hitsAllowed),
    k: Math.max(0, outcome.strikeouts),
    bb: Math.max(0, outcome.walksAllowed),
    decision: won ? "W" : isDraw ? "ND" : "L",
    pitchCount: outcome.pitchCount > 0 ? outcome.pitchCount : undefined,
  };
  const matchResult: MatchResult = { ...teamResult, playerLines: [pitcherLine] };

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
    [`W${outcome.week} ${awayTeamName} ${outcome.awayScore}:${outcome.homeScore} ${homeTeamName}`, ...growth.logs],
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

  await gameStore.save();
  await seasonStore.save();
}

