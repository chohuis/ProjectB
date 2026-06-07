/**
 * 독립 실행 스모크 테스트 — Electron 없이 매치 엔진 기본 동작 검증
 * Usage: node scripts/smoke-test.mjs [--games N]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const SMOKE_GAMES = (() => {
  const idx = process.argv.indexOf("--games");
  return idx !== -1 ? Math.max(1, parseInt(process.argv[idx + 1], 10) || 20) : 20;
})();

const SMOKE_THRESHOLDS = {
  avgTotalScore: { min: 4.0,  max: 18.0  },
  bbRate:        { min: 1.0,  max: 25.0  },
  kRate:         { min: 5.0,  max: 45.0  },
  hrRate:        { min: 0.2,  max: 12.0  },
  avgPitches:    { min: 20,   max: 260   },
};

function percentile(nums, p) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function randomDecision() {
  const pitchTypes = ["fastball", "slider", "curve", "changeup"];
  const strategies = ["aggressive", "balanced", "safe"];
  const powers     = ["low", "normal", "high"];
  const zones      = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return {
    pitchType: pitchTypes[Math.floor(Math.random() * pitchTypes.length)],
    strategy:  strategies[Math.floor(Math.random() * strategies.length)],
    power:     powers[Math.floor(Math.random() * powers.length)],
    location:  zones[Math.floor(Math.random() * zones.length)],
  };
}

function simulateGames(core, games) {
  let totalAway = 0, totalHome = 0, totalPitches = 0;
  let totalWalks = 0, totalK = 0, totalHR = 0, totalResults = 0;
  const pitchCounts = [];

  for (let i = 0; i < games; i += 1) {
    let state = core.startMatch({
      role: "SP", protagonistSide: "home",
      inningLimit: 9, initialStamina: 82, initialMental: 74,
      batterMean: 50, weather: "sunny", park: "neutral",
    });
    let guard = 0;
    while (!state.isFinished && guard++ < 2000) {
      if (core.isProtagonistPitching(state)) {
        const stepped = core.stepPitch(state, randomDecision());
        state = stepped.nextState;
        const code = stepped.outcome.resultCode;
        totalResults++;
        if (code === "WALK")                                    totalWalks++;
        if (code === "HOME_RUN")                                totalHR++;
        if (code === "STRIKE_LOOK" || code === "STRIKE_SWING") totalK++;
      } else {
        const result = core.autoSimulateHalfInning(state);
        state = result.nextState;
      }
    }
    if (!state.isFinished) state = core.finishMatch(state).nextState;
    totalAway += state.score.away;
    totalHome += state.score.home;
    totalPitches += state.pitchCount;
    pitchCounts.push(state.pitchCount);
  }

  return {
    games,
    avgAway:       Number((totalAway  / games).toFixed(2)),
    avgHome:       Number((totalHome  / games).toFixed(2)),
    avgTotalScore: Number(((totalAway + totalHome) / games).toFixed(2)),
    avgPitches:    Number((totalPitches / games).toFixed(2)),
    bbRate:  totalResults > 0 ? Number(((totalWalks / totalResults) * 100).toFixed(2)) : 0,
    kRate:   totalResults > 0 ? Number(((totalK     / totalResults) * 100).toFixed(2)) : 0,
    hrRate:  totalResults > 0 ? Number(((totalHR    / totalResults) * 100).toFixed(2)) : 0,
    p50Pitches: percentile(pitchCounts, 50),
    p90Pitches: percentile(pitchCounts, 90),
  };
}

function evaluateSmokeGate(metrics) {
  const failures = [];
  for (const [key, range] of Object.entries(SMOKE_THRESHOLDS)) {
    const value = metrics[key];
    if (value < range.min || value > range.max) {
      failures.push(`${key} out of range (${range.min}..${range.max}) actual=${value}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

async function main() {
  const engineNative = require(path.resolve(__dirname, "../packages/engine-native"));
  const coreDistPath = path.resolve(__dirname, "../packages/core/dist/index.js");
  const core = await import(coreDistPath);

  if (typeof core.setNativeEngine === "function") core.setNativeEngine(engineNative);
  if (typeof core.setNpcSimEngine  === "function") core.setNpcSimEngine(engineNative);

  console.log(`[smoke] simulating ${SMOKE_GAMES} games…`);
  const metrics = simulateGames(core, SMOKE_GAMES);
  const gate    = evaluateSmokeGate(metrics);

  console.log("[smoke] metrics:", metrics);

  if (gate.ok) {
    console.log("[smoke] PASSED");
    process.exit(0);
  } else {
    console.error("[smoke] FAILED:", gate.failures);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
