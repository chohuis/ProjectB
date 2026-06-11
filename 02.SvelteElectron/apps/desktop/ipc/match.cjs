"use strict";

let activeMatchState = null;
let matchReadyState = null;

const AUTO_SIM_AB_LABEL = {
  STRIKE_SWING: "삼진", STRIKE_LOOK: "삼진(루킹)",
  WALK: "볼넷", INPLAY_OUT: "아웃", FIELDING_ERROR: "실책",
  HIT_SINGLE: "안타", HIT_DOUBLE: "2루타",
  HIT_TRIPLE: "3루타", HOME_RUN: "홈런",
};

function toSnapshotDto(state, autoSimLogs, core) {
  const currentLineup = state.half === "top" ? state.awayLineup : state.homeLineup;
  const currentIdx    = state.half === "top" ? state.awayLineupIndex : state.homeLineupIndex;
  const currentBatter = currentLineup?.[currentIdx % Math.max(1, currentLineup?.length ?? 1)];

  const ourTeamFielding =
    (state.half === "top"    && state.protagonistSide === "home") ||
    (state.half === "bottom" && state.protagonistSide === "away");
  const isProtagonistPitching = ourTeamFielding && state.protagonistHasEntered && !state.protagonistExited;
  const phase = state.isFinished
    ? "game_over"
    : isProtagonistPitching
    ? "protagonist_pitch"
    : "auto_inning";

  return {
    matchId: state.matchId,
    inning: state.inning,
    inningLimit: state.inningLimit,
    half: state.half,
    outs: state.outs,
    count: state.count,
    score: state.score,
    inningScores: state.inningScores,
    runners: { first: !!state.runners.first, second: !!state.runners.second, third: !!state.runners.third },
    pitchCount: state.pitchCount,
    protagonistStamina: state.protagonistStamina,
    protagonistMental: state.protagonistMental,
    protagonistHasEntered: state.protagonistHasEntered,
    protagonistExited: state.protagonistExited,
    protagonistSide: state.protagonistSide,
    role: state.role,
    pitchCountSinceEntry: state.pitchCountSinceEntry,
    moundVisitsLeft: state.moundVisitsLeft,
    isProtagonistPitching,
    phase,
    currentBatter,
    weather: state.weather,
    park: state.park,
    isFinished: state.isFinished,
    recentLogs: state.logs.slice(-30),
    autoSimLogs: autoSimLogs ?? [],
    fielders: state.fielders ?? [],
    defenseStat: state.defenseStat ?? { errors: 0, assists: 0, throwOuts: 0, throwSafes: 0 },
  };
}

function register(ipcMain, { loadCoreModule, engineNative }) {
  ipcMain.handle("match:start", async (_event, request = {}) => {
    if (request === null || typeof request !== "object" || Array.isArray(request)) request = {};
    try {
      const core = await loadCoreModule();

      if (matchReadyState && matchReadyState.protagonistHasEntered && !matchReadyState.isFinished) {
        activeMatchState = matchReadyState;
        matchReadyState = null;
        return { snapshot: toSnapshotDto(activeMatchState, [], core) };
      }
      matchReadyState = null;

      let state = core.startMatch(request);

      if (!state.protagonistHasEntered) {
        state = core.autoSimulateUntilEntry(state);
      }

      let guard = 0;
      let prevStateKey = "";
      while (!state.isFinished && guard++ < 50) {
        const phase = core.advanceGamePhase(state);
        if (phase.phase === "protagonist_pitch" || phase.phase === "game_over") break;
        if (phase.phase === "auto_batting") {
          state = phase.result.nextState;
        } else if (phase.phase === "protagonist_entry") {
          state = phase.state;
        } else if (phase.phase === "pre_entry_sim") {
          state = core.autoSimulateUntilEntry(state);
        } else if (phase.phase === "protagonist_exit") {
          state = phase.state;
          state = core.autoSimulateToGameEnd(state);
          break;
        } else {
          break;
        }
        const newStateKey = `${state.inning}-${state.half}-${state.outs}-${state.score.home}-${state.score.away}`;
        if (newStateKey === prevStateKey) {
          console.error("[match:start] 상태 변화 없음, 강제 종료 (guard:", guard, ")");
          state = core.autoSimulateToGameEnd(state);
          break;
        }
        prevStateKey = newStateKey;
      }
      if (guard >= 50 && !state.isFinished) {
        console.error("[match:start] guard 한계(50) 도달, 강제 종료");
        state = core.autoSimulateToGameEnd(state);
      }

      activeMatchState = state;
      return { snapshot: toSnapshotDto(activeMatchState, [], core) };
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("match:step", async (_event, decision) => {
    try {
      const core = await loadCoreModule();
      if (!activeMatchState) activeMatchState = core.startMatch({});
      if (!core.isProtagonistPitching(activeMatchState)) {
        return { snapshot: toSnapshotDto(activeMatchState, [], core), outcome: null };
      }
      if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
        return { snapshot: toSnapshotDto(activeMatchState, [], core), outcome: null };
      }
      const result = core.stepPitch(activeMatchState, decision);
      activeMatchState = result.nextState;

      let midGameInjury = null;
      if (result.outcome?.resultCode === "WALK" || result.outcome?.resultCode?.startsWith("HIT_")) {
        const injuryCheck = core.checkMidGameInjury?.(activeMatchState);
        if (injuryCheck?.injured) {
          midGameInjury = injuryCheck;
          activeMatchState = injuryCheck.nextState ?? activeMatchState;
        }
      }

      return { snapshot: toSnapshotDto(activeMatchState, [], core), outcome: result.outcome, midGameInjury };
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("match:next-inning", async () => {
    const core = await loadCoreModule();
    if (!activeMatchState || activeMatchState.isFinished) {
      return { snapshot: toSnapshotDto(activeMatchState ?? core.startMatch({}), [], core), logs: [] };
    }

    const prevInning = activeMatchState.inning;
    const prevHalf   = activeMatchState.half;
    const phase = core.advanceGamePhase(activeMatchState);
    const allLogs = [];
    let batchStats = null;
    let protagonistJustExited = false;
    let exitReason = null;

    const AB_RESULT_LABEL = {
      STRIKE_SWING: "삼진", STRIKE_LOOK: "삼진(루킹)",
      WALK: "볼넷", INPLAY_OUT: "아웃", FIELDING_ERROR: "실책",
      HIT_SINGLE: "안타", HIT_DOUBLE: "2루타",
      HIT_TRIPLE: "3루타", HOME_RUN: "홈런",
      FOUL: "파울", BALL: "볼",
    };

    function pushHalfInningLogs(halfResult, inning, half) {
      const halfLabel = half === "top" ? "초" : "말";
      allLogs.push(`── ${inning}회${halfLabel} (${halfResult.runs}득점 ${halfResult.hits}안타) ──`);
      for (const ab of halfResult.atBats) {
        const label = AB_RESULT_LABEL[ab.resultCode] ?? ab.resultCode;
        const runMark = ab.runsScored > 0 ? ` ★${ab.runsScored}득점` : "";
        allLogs.push(`투수: ${ab.pitcherName} / 타자: ${ab.batterName} → ${label} (${ab.pitchCount}구)${runMark}`);
      }
    }

    if (phase.phase === "auto_batting") {
      activeMatchState = phase.result.nextState;
      const errors = phase.result.atBats.filter(ab => ab.resultCode === "FIELDING_ERROR").length;
      batchStats = { hits: phase.result.hits, walks: phase.result.walks, errors, isTop: prevHalf === "top" };
      pushHalfInningLogs(phase.result, prevInning, prevHalf);
    } else if (phase.phase === "protagonist_entry") {
      activeMatchState = phase.state;
    } else if (phase.phase === "pre_entry_sim") {
      const prevCount = activeMatchState.preEntryLogs?.length ?? 0;
      activeMatchState = core.autoSimulateUntilEntry(activeMatchState);
      allLogs.push(...(activeMatchState.preEntryLogs ?? []).slice(prevCount).slice(-4));
    } else if (phase.phase === "protagonist_exit") {
      activeMatchState = phase.state;
      const exitReasonMap = {
        pitch_limit: "투구수 제한으로 교체됩니다",
        stamina:     "체력 부족으로 교체됩니다",
        performance: "성적 부진으로 교체됩니다",
        tactical:    "전술적 교체를 합니다",
      };
      exitReason = exitReasonMap[phase.reason] ?? "교체됩니다";
      const lastLog = phase.state.logs[phase.state.logs.length - 1];
      if (lastLog) allLogs.push(lastLog);
      protagonistJustExited = true;
    } else if (phase.phase === "post_exit_sim") {
      const halfResult = core.autoSimulateHalfInning(activeMatchState);
      activeMatchState = halfResult.nextState;
      const errors = halfResult.atBats.filter(ab => ab.resultCode === "FIELDING_ERROR").length;
      batchStats = { hits: halfResult.hits, walks: halfResult.walks, errors, isTop: prevHalf === "top" };
      pushHalfInningLogs(halfResult, prevInning, prevHalf);
    }

    return { snapshot: toSnapshotDto(activeMatchState, [], core), logs: allLogs, batchStats, protagonistJustExited, exitReason };
  });

  ipcMain.handle("match:finish", async () => {
    const core = await loadCoreModule();
    if (!activeMatchState) activeMatchState = core.startMatch({});
    if (!activeMatchState.isFinished) {
      activeMatchState = core.autoSimulateToGameEnd(activeMatchState);
    }
    const result = core.finishMatch(activeMatchState);
    activeMatchState = result.nextState;
    return {
      snapshot: toSnapshotDto(activeMatchState, [], core),
      summary: result.summary,
      batterLines: result.batterLines ?? [],
      playerLines: result.playerLines ?? [],
    };
  });

  ipcMain.handle("match:mound-visit", async () => {
    const core = await loadCoreModule();
    if (!activeMatchState) return null;
    activeMatchState = core.requestMoundVisit(activeMatchState);
    return { snapshot: toSnapshotDto(activeMatchState, [], core) };
  });

  function buildMatchSummary(state) {
    return {
      inningScores:         state.inningScores         ?? { home: [], away: [] },
      batterAccum:          state.batterAccum           ?? {},
      homeLineup:           (state.homeLineup  ?? []).map(b => ({ id: b.id ?? "", name: b.name ?? "" })),
      awayLineup:           (state.awayLineup  ?? []).map(b => ({ id: b.id ?? "", name: b.name ?? "" })),
      oppPitcherName:       state.opponentNpcPitcher?.name  ?? null,
      oppPitcherPitchCount: state.npcPitcherPitchCount?.opponent ?? 0,
      oppPitcherStamina:    state.npcPitcherStamina?.opponent    ?? 100,
      myPitcherName:        state.myNpcPitcher?.name        ?? null,
      myPitcherPitchCount:  state.npcPitcherPitchCount?.my  ?? 0,
      myPitcherStamina:     state.npcPitcherStamina?.my     ?? 100,
      preEntryLogs:         state.preEntryLogs ?? [],
      currentOuts:          state.outs ?? 0,
      runners: {
        first:  !!(state.runners?.first),
        second: !!(state.runners?.second),
        third:  !!(state.runners?.third),
      },
    };
  }

  ipcMain.handle("match:simulateToEntry", async (_event, request = {}) => {
    if (!request || typeof request !== "object" || Array.isArray(request)) request = {};
    try {
      const core = await loadCoreModule();
      let state = core.startMatch(request);
      if (!state.protagonistHasEntered) {
        state = core.autoSimulateUntilEntry(state);
      }
      activeMatchState = state;
      if (state.isFinished) {
        matchReadyState = null;
        const final = core.finishMatch(state);
        activeMatchState = final.nextState;
        return JSON.stringify({
          entryReached: false,
          homeScore: state.score.home,
          awayScore: state.score.away,
          batterLines: final.batterLines ?? [],
          playerLines: final.playerLines ?? [],
          ...buildMatchSummary(state),
        });
      }
      matchReadyState = state;
      return JSON.stringify({
        entryReached: true,
        inning: state.inning, half: state.half,
        homeScore: state.score.home, awayScore: state.score.away,
        ...buildMatchSummary(state),
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  });

  ipcMain.handle("match:autoFinishFromEntry", async () => {
    try {
      const core = await loadCoreModule();
      if (!activeMatchState) return JSON.stringify({ error: "no active match state" });
      let state = core.autoSimulateToGameEnd(activeMatchState);
      const strikeouts   = state.kSinceEntry    ?? 0;
      const hitsAllowed  = state.hSinceEntry    ?? 0;
      const walksAllowed = state.bbSinceEntry   ?? 0;
      const outsRecorded = state.outsSinceEntry ?? 0;
      const pitchCount   = state.pitchCountSinceEntry ?? 0;
      const result = core.finishMatch(state);
      activeMatchState = result.nextState;
      matchReadyState = null;
      const ns = result.nextState;
      return JSON.stringify({
        homeScore: ns.score.home,
        awayScore: ns.score.away,
        summary: result.summary ?? "",
        strikeouts, hitsAllowed, walksAllowed, outsRecorded, pitchCount,
        batterLines: result.batterLines ?? [],
        playerLines: result.playerLines ?? [],
      });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  });

  ipcMain.handle("match:runSimpleGame", (_event, paramsJson) => {
    try {
      const raw = engineNative.runSimpleGame(paramsJson);
      const result = JSON.parse(raw);
      const logs = (result.atBatLogs ?? []).map((ab) => {
        const label = AUTO_SIM_AB_LABEL[ab.resultCode] ?? ab.resultCode;
        const runMark = ab.runsScored > 0 ? ` ★${ab.runsScored}득점` : "";
        return `투수: ${ab.pitcherName} / 타자: ${ab.batterName} → ${label} (${ab.pitchCount}구)${runMark}`;
      });
      return JSON.stringify({ ...result, logs });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  });
}

module.exports = { register };
