import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { seasonStore } from "../stores/season";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { calcGameGrowth } from "../utils/growthEngine";
import { simulateGame } from "../utils/gameSimulator";
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

async function syncHighschoolNpcForProtagonistGame(scheduleId: string, leagueId: string): Promise<void> {
  if (leagueId !== "LEAGUE_HIGHSCHOOL") return;

  const s = get(seasonStore);
  const pivot = s.schedule.find((e) => e.id === scheduleId);
  if (!pivot) return;

  const npcLeagueId = "LEAGUE_HIGHSCHOOL_NPC";
  const npcSchedule = s.leagueSchedules[npcLeagueId] ?? [];
  const pending = npcSchedule.filter((e) => !e.result && e.week === pivot.week && e.gameDate <= pivot.gameDate);
  if (pending.length === 0) return;

  let entities = get(masterStore).entities;
  if (entities.length === 0) {
    await masterStore.loadEntities("");
    entities = get(masterStore).entities;
  }

  for (const game of pending.sort((a, b) => a.gameDate.localeCompare(b.gameDate))) {
    if (entities.length === 0) break;
    const latest = get(seasonStore);
    const npcState = (latest.leagueState ?? {})[npcLeagueId];
    const homeRotIdx = npcState?.teamRotationIndex?.[game.homeTeamId] ?? 0;
    const awayRotIdx = npcState?.teamRotationIndex?.[game.awayTeamId] ?? 0;
    const conditions = npcState?.playerConditions ?? {};

    const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
      conditions,
      homeRotIdx,
      awayRotIdx,
      week: game.week,
    });

    seasonStore.applyBackgroundLeagueResult(
      npcLeagueId,
      game.id,
      game.homeTeamId,
      game.awayTeamId,
      sim.result,
      sim.nextHomeRotIdx,
      sim.nextAwayRotIdx,
      sim.pitcherConditions,
    );
  }
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
  let playerLines = Array.isArray(outcome.playerLines) && outcome.playerLines.length > 0
    ? outcome.playerLines
    : [pitcherLine, ...(outcome.batterLines ?? [])];
  if (!(Array.isArray(outcome.playerLines) && outcome.playerLines.length > 0)) {
    const entities = get(masterStore).entities;
    if (entities.length > 0) {
      try {
        const sim = await simulateGame(outcome.homeTeamId, outcome.awayTeamId, entities, { week: outcome.week });
        const merged = sim.result.playerLines.filter((l) => l.playerId !== protagonist.id);
        playerLines = [pitcherLine, ...merged];
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
  await syncHighschoolNpcForProtagonistGame(outcome.scheduleId, protagonist.leagueId);
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

  await gameStore.save();
  await seasonStore.save();
}
