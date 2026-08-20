"use strict";
const fs   = require("node:fs");
const path = require("node:path");

const SMOKE_GAMES = 20;
const SMOKE_THRESHOLDS = {
  avgTotalScore: { min: 4.0, max: 18.0 },
  bbRate: { min: 1.0, max: 25.0 },
  kRate: { min: 5.0, max: 45.0 },
  hrRate: { min: 0.2, max: 12.0 },
  avgPitches: { min: 20, max: 260 },
};
const tuningRelPath = "balance/match_engine_tuning.json";

function percentile(nums, p) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function randomDecision() {
  const pitchTypes = ["fastball", "slider", "curve", "changeup"];
  const strategies = ["aggressive", "balanced", "safe"];
  const powers = ["low", "normal", "high"];
  const zones = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return {
    pitchType: pitchTypes[Math.floor(Math.random() * pitchTypes.length)],
    strategy: strategies[Math.floor(Math.random() * strategies.length)],
    power: powers[Math.floor(Math.random() * powers.length)],
    location: zones[Math.floor(Math.random() * zones.length)],
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
        if (code === "WALK") totalWalks++;
        if (code === "HOME_RUN") totalHR++;
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
    avgAway: Number((totalAway / games).toFixed(2)),
    avgHome: Number((totalHome / games).toFixed(2)),
    avgTotalScore: Number(((totalAway + totalHome) / games).toFixed(2)),
    avgPitches: Number((totalPitches / games).toFixed(2)),
    bbRate: totalResults > 0 ? Number(((totalWalks / totalResults) * 100).toFixed(2)) : 0,
    kRate: totalResults > 0 ? Number(((totalK / totalResults) * 100).toFixed(2)) : 0,
    hrRate: totalResults > 0 ? Number(((totalHR / totalResults) * 100).toFixed(2)) : 0,
    p50Pitches: percentile(pitchCounts, 50),
    p90Pitches: percentile(pitchCounts, 90),
    resultRates: {},
  };
}

function evaluateSmokeGate(metrics) {
  const failures = [];
  const check = (key, value) => {
    const range = SMOKE_THRESHOLDS[key];
    if (value < range.min || value > range.max)
      failures.push(`${key} out of range (${range.min}..${range.max}) actual=${value}`);
  };
  check("avgTotalScore", metrics.avgTotalScore);
  check("bbRate", metrics.bbRate);
  check("kRate", metrics.kRate);
  check("hrRate", metrics.hrRate);
  check("avgPitches", metrics.avgPitches);
  return { ok: failures.length === 0, failures };
}

function validateBySchema(value, schema, pathLabel = "root", errors = []) {
  if (!schema || typeof schema !== "object") return errors;
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${pathLabel} must be object`); return errors;
    }
    const props = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const reqKey of required) {
      if (!(reqKey in value)) errors.push(`${pathLabel}.${reqKey} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${pathLabel}.${key} is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(props)) {
      if (key in value) validateBySchema(value[key], childSchema, `${pathLabel}.${key}`, errors);
    }
    return errors;
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${pathLabel} must be number`); return errors;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum)
      errors.push(`${pathLabel} < minimum(${schema.minimum})`);
    if (typeof schema.maximum === "number" && value > schema.maximum)
      errors.push(`${pathLabel} > maximum(${schema.maximum})`);
    return errors;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${pathLabel} must be string`);
    return errors;
  }
  return errors;
}

function validateMatchEngineTuning(input, tuningSchema) {
  const errors = validateBySchema(input, tuningSchema, "tuning", []);
  return { ok: errors.length === 0, errors };
}

async function applyTuningFromFile(resourceBase, tuningSchema, loadCoreModule) {
  const core = await loadCoreModule();
  const fullPath = path.resolve(resourceBase, tuningRelPath);
  if (!fs.existsSync(fullPath)) {
    core.setMatchEngineTuning(core.DEFAULT_MATCH_ENGINE_TUNING);
    return { ok: true, source: "default" };
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  const validate = validateMatchEngineTuning(parsed, tuningSchema);
  if (!validate.ok) {
    core.setMatchEngineTuning(core.DEFAULT_MATCH_ENGINE_TUNING);
    return { ok: false, source: "default", errors: validate.errors };
  }
  core.setMatchEngineTuning(parsed);
  return { ok: true, source: "file" };
}

// ⚠ **랩 전용 IPC 다섯을 2026-08-20에 지웠다** — 매치 엔진 랩(Ctrl+Q)을
// 없애면서 tuning:load/validate/apply/save/smoke가 쓰는 곳 0이 됐다.
// **시작 시 튜닝 파일을 먹이는 applyTuningFromFile은 그대로 산다** —
// main.cjs가 부르는 게임 경로다. 수치는 파일을 직접 고치고, 배치 시뮬은
// npm run smoke가 한다(scripts/smoke-test.mjs는 자체 구현이라 안 겹친다)

module.exports = {
  applyTuningFromFile,
  validateMatchEngineTuning,
  simulateGames,
  evaluateSmokeGate,
  SMOKE_GAMES,
  SMOKE_THRESHOLDS,
};
