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

function register(ipcMain, { isDev, resourceBase, tuningSchema, loadCoreModule, isPathInside }) {
  ipcMain.handle("tuning:load", async () => {
    if (!isDev) return { ok: false, error: "unauthorized" };
    try {
      const core = await loadCoreModule();
      const fullPath = path.resolve(resourceBase, tuningRelPath);
      if (!fs.existsSync(fullPath)) return { ok: true, data: core.DEFAULT_MATCH_ENGINE_TUNING };
      const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const validate = validateMatchEngineTuning(data, tuningSchema);
      if (!validate.ok) return { ok: false, error: "invalid tuning file", details: validate.errors };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:validate", async (_event, payload) => {
    if (!isDev) return { ok: false, error: "unauthorized" };
    const tuning = payload?.tuning ?? payload;
    const validate = validateMatchEngineTuning(tuning, tuningSchema);
    return { ok: validate.ok, errors: validate.errors };
  });

  ipcMain.handle("tuning:save", async (_event, payload) => {
    if (!isDev) return { ok: false, error: "unauthorized" };
    try {
      const core = await loadCoreModule();
      const tuning    = payload?.tuning ?? payload;
      const forceSave = payload?.forceSave === true;
      const validate  = validateMatchEngineTuning(tuning, tuningSchema);
      if (!validate.ok) return { ok: false, error: "validation failed", details: validate.errors };
      core.setMatchEngineTuning(tuning);
      const smokeMetrics = simulateGames(core, SMOKE_GAMES);
      const gate = evaluateSmokeGate(smokeMetrics);
      if (!gate.ok && !forceSave) {
        return { ok: false, gateFailed: true, error: "smoke gate failed", details: gate.failures, smoke: smokeMetrics, thresholds: SMOKE_THRESHOLDS };
      }
      const fullPath = path.resolve(resourceBase, tuningRelPath);
      if (!isPathInside(fullPath, resourceBase)) throw new Error(`invalid tuning path: ${tuningRelPath}`);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      if (fs.existsSync(fullPath)) {
        const stamp = new Date().toISOString().replace(/[.:]/g, "-");
        fs.copyFileSync(fullPath, `${fullPath}.${stamp}.bak`);
      }
      const next = { ...tuning, version: typeof tuning?.version === "number" ? tuning.version : 1, updatedAt: new Date().toISOString() };
      fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf8");
      core.setMatchEngineTuning(next);
      return { ok: true, data: next, smoke: smokeMetrics, gateBypassed: !gate.ok && forceSave };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:apply", async (_event, payload) => {
    if (!isDev) return { ok: false, error: "unauthorized" };
    try {
      const core = await loadCoreModule();
      const tuning = payload?.tuning ?? payload;
      const validate = validateMatchEngineTuning(tuning, tuningSchema);
      if (!validate.ok) return { ok: false, error: "validation failed", details: validate.errors };
      core.setMatchEngineTuning(tuning);
      const smoke = simulateGames(core, SMOKE_GAMES);
      const gate  = evaluateSmokeGate(smoke);
      return { ok: true, smoke, smokeGate: gate };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:smoke", async (_event, payload) => {
    if (!isDev) return { ok: false, error: "unauthorized" };
    try {
      const core  = await loadCoreModule();
      const games = Math.max(1, Math.min(500, Number(payload?.games ?? SMOKE_GAMES)));
      const tuning = payload?.tuning;
      if (tuning) {
        const validate = validateMatchEngineTuning(tuning, tuningSchema);
        if (!validate.ok) return { ok: false, error: "validation failed", details: validate.errors };
        core.setMatchEngineTuning(tuning);
      }
      const smoke = simulateGames(core, games);
      const gate  = evaluateSmokeGate(smoke);
      return { ok: true, smoke, smokeGate: gate, thresholds: SMOKE_THRESHOLDS };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
}

module.exports = {
  register,
  applyTuningFromFile,
  validateMatchEngineTuning,
  simulateGames,
  evaluateSmokeGate,
  SMOKE_GAMES,
  SMOKE_THRESHOLDS,
};
