const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");

let activeMatchState = null;
let coreModulePromise = null;
const tuningRelPath = "balance/match_engine_tuning.json";
const tuningSchemaRelPath = "balance/match_engine_tuning.schema.json";

const SMOKE_GAMES = 20;
const SMOKE_THRESHOLDS = {
  avgTotalScore: { min: 4.0, max: 18.0 },
  bbRate: { min: 1.0, max: 25.0 },
  kRate: { min: 5.0, max: 45.0 },
  hrRate: { min: 0.2, max: 12.0 },
  avgPitches: { min: 20, max: 260 },
};

function loadCoreModule() {
  if (!coreModulePromise) {
    const coreDistPath = path.resolve(__dirname, "../../packages/core/dist/index.js");
    coreModulePromise = import(pathToFileURL(coreDistPath).href);
  }
  return coreModulePromise;
}

function isPathInside(target, base) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function loadTuningSchema(resourceBase) {
  const fullPath = path.resolve(resourceBase, tuningSchemaRelPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw);
}

function validateBySchema(value, schema, pathLabel = "root", errors = []) {
  if (!schema || typeof schema !== "object") return errors;

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${pathLabel} must be object`);
      return errors;
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
      errors.push(`${pathLabel} must be number`);
      return errors;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${pathLabel} < minimum(${schema.minimum})`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${pathLabel} > maximum(${schema.maximum})`);
    }
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
  let totalAway = 0;
  let totalHome = 0;
  let totalPitches = 0;
  const pitchCounts = [];
  const resultCounts = {};

  for (let i = 0; i < games; i += 1) {
    let state = core.startMatch({ inningLimit: 9, initialStamina: 82, initialMental: 74, batterMean: 50, weather: "sunny", park: "neutral" });
    let guard = 0;
    while (!state.isFinished && guard < 500) {
      const stepped = core.stepPitch(state, randomDecision());
      state = stepped.nextState;
      const code = stepped.outcome.resultCode;
      resultCounts[code] = (resultCounts[code] ?? 0) + 1;
      guard += 1;
    }
    if (!state.isFinished) state = core.finishMatch(state).nextState;

    totalAway += state.score.away;
    totalHome += state.score.home;
    totalPitches += state.pitchCount;
    pitchCounts.push(state.pitchCount);
  }

  const totalResults = Object.values(resultCounts).reduce((a, b) => a + b, 0);
  const walk = resultCounts.WALK ?? 0;
  const hr = resultCounts.HOME_RUN ?? 0;
  const k = (resultCounts.STRIKE_LOOK ?? 0) + (resultCounts.STRIKE_SWING ?? 0);

  const metrics = {
    games,
    avgAway: Number((totalAway / games).toFixed(2)),
    avgHome: Number((totalHome / games).toFixed(2)),
    avgTotalScore: Number(((totalAway + totalHome) / games).toFixed(2)),
    avgPitches: Number((totalPitches / games).toFixed(2)),
    bbRate: totalResults > 0 ? Number(((walk / totalResults) * 100).toFixed(2)) : 0,
    kRate: totalResults > 0 ? Number(((k / totalResults) * 100).toFixed(2)) : 0,
    hrRate: totalResults > 0 ? Number(((hr / totalResults) * 100).toFixed(2)) : 0,
    p50Pitches: percentile(pitchCounts, 50),
    p90Pitches: percentile(pitchCounts, 90),
    resultRates: Object.fromEntries(
      Object.entries(resultCounts).map(([key, val]) => [key, totalResults > 0 ? Number(((val / totalResults) * 100).toFixed(2)) : 0])
    ),
  };

  return metrics;
}

function evaluateSmokeGate(metrics) {
  const failures = [];
  const check = (key, value) => {
    const range = SMOKE_THRESHOLDS[key];
    if (value < range.min || value > range.max) {
      failures.push(`${key} out of range (${range.min}..${range.max}) actual=${value}`);
    }
  };
  check("avgTotalScore", metrics.avgTotalScore);
  check("bbRate", metrics.bbRate);
  check("kRate", metrics.kRate);
  check("hrRate", metrics.hrRate);
  check("avgPitches", metrics.avgPitches);
  return { ok: failures.length === 0, failures };
}

async function applyTuningFromFile(resourceBase, tuningSchema) {
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  win.loadFile(path.resolve(__dirname, "../../dist/ui/index.html"));
}

app.whenReady().then(() => {
  const resourceBase = path.resolve(__dirname, "../../resource/data/master");
  const tuningSchema = loadTuningSchema(resourceBase);

  applyTuningFromFile(resourceBase, tuningSchema).then((res) => {
    if (!res.ok) console.warn("[tuning] invalid tuning file. fallback to defaults.", res.errors);
  }).catch((e) => {
    console.warn("[tuning] failed to load tuning file. fallback to defaults.", e);
  });

  ipcMain.handle("match:start", async (_event, request = {}) => {
    const core = await loadCoreModule();
    activeMatchState = core.startMatch(request);
    return {
      snapshot: toSnapshotDto(activeMatchState)
    };
  });

  ipcMain.handle("match:step", async (_event, decision) => {
    const core = await loadCoreModule();
    if (!activeMatchState) {
      activeMatchState = core.startMatch({});
    }

    const result = core.stepPitch(activeMatchState, decision);
    activeMatchState = result.nextState;

    return {
      snapshot: toSnapshotDto(activeMatchState),
      outcome: result.outcome
    };
  });

  ipcMain.handle("match:finish", async () => {
    const core = await loadCoreModule();
    if (!activeMatchState) {
      activeMatchState = core.startMatch({});
    }

    const result = core.finishMatch(activeMatchState);
    activeMatchState = result.nextState;

    return {
      snapshot: toSnapshotDto(activeMatchState),
      summary: result.summary
    };
  });

  // ── 게임 저장/불러오기 ────────────────────────────────────────────────────
  const savePath = () => path.join(app.getPath("userData"), "save.json");

  ipcMain.handle("game:load", () => {
    try {
      const raw = fs.readFileSync(savePath(), "utf8");
      return JSON.parse(raw);
    } catch {
      return null; // 파일 없음 → 첫 실행
    }
  });

  ipcMain.handle("game:save", (_event, data) => {
    try {
      fs.writeFileSync(savePath(), JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.error("[game:save] 저장 실패:", e);
    }
  });

  // ── 날짜 진행 ─────────────────────────────────────────────────────────────
  ipcMain.handle("day:advance", async (_event, coreState) => {
    const core = await loadCoreModule();
    const result = core.advanceDay(coreState);
    return {
      snapshot: result.nextState,
      logs: result.logs
    };
  });

  // ── 마스터 데이터 (패키징 환경 fallback) ──────────────────────────────────

  ipcMain.handle("master:fetch", (_event, relPath) => {
    try {
      const fullPath = path.resolve(resourceBase, relPath);
      if (!isPathInside(fullPath, resourceBase)) {
        throw new Error(`invalid master path: ${relPath}`);
      }
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      console.error("[master:fetch] 로드 실패:", relPath, e);
      return null;
    }
  });

  ipcMain.handle("master:save", (_event, payload) => {
    try {
      const relPath = payload?.relPath;
      const data = payload?.data;
      const backup = payload?.backup !== false;
      if (typeof relPath !== "string" || !relPath.trim()) {
        throw new Error("relPath is required");
      }
      const fullPath = path.resolve(resourceBase, relPath);
      if (!isPathInside(fullPath, resourceBase)) {
        throw new Error(`invalid master path: ${relPath}`);
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      if (backup && fs.existsSync(fullPath)) {
        const stamp = new Date().toISOString().replace(/[.:]/g, "-");
        fs.copyFileSync(fullPath, `${fullPath}.${stamp}.bak`);
      }

      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf8");
      return { ok: true };
    } catch (e) {
      console.error("[master:save] save failed:", e);
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:load", async () => {
    try {
      const core = await loadCoreModule();
      const fullPath = path.resolve(resourceBase, tuningRelPath);
      if (!fs.existsSync(fullPath)) return { ok: true, data: core.DEFAULT_MATCH_ENGINE_TUNING };
      const raw = fs.readFileSync(fullPath, "utf8");
      const data = JSON.parse(raw);
      const validate = validateMatchEngineTuning(data, tuningSchema);
      if (!validate.ok) return { ok: false, error: "invalid tuning file", details: validate.errors };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:validate", async (_event, payload) => {
    const tuning = payload?.tuning ?? payload;
    const validate = validateMatchEngineTuning(tuning, tuningSchema);
    return { ok: validate.ok, errors: validate.errors };
  });

  ipcMain.handle("tuning:save", async (_event, payload) => {
    try {
      const core = await loadCoreModule();
      const tuning = payload?.tuning ?? payload;
      const forceSave = payload?.forceSave === true;
      const validate = validateMatchEngineTuning(tuning, tuningSchema);
      if (!validate.ok) {
        return { ok: false, error: "validation failed", details: validate.errors };
      }

      core.setMatchEngineTuning(tuning);
      const smokeMetrics = simulateGames(core, SMOKE_GAMES);
      const gate = evaluateSmokeGate(smokeMetrics);
      if (!gate.ok && !forceSave) {
        return {
          ok: false,
          gateFailed: true,
          error: "smoke gate failed",
          details: gate.failures,
          smoke: smokeMetrics,
          thresholds: SMOKE_THRESHOLDS,
        };
      }

      const fullPath = path.resolve(resourceBase, tuningRelPath);
      if (!isPathInside(fullPath, resourceBase)) {
        throw new Error(`invalid tuning path: ${tuningRelPath}`);
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      if (fs.existsSync(fullPath)) {
        const stamp = new Date().toISOString().replace(/[.:]/g, "-");
        fs.copyFileSync(fullPath, `${fullPath}.${stamp}.bak`);
      }
      const next = {
        ...tuning,
        version: typeof tuning?.version === "number" ? tuning.version : 1,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf8");
      core.setMatchEngineTuning(next);
      return { ok: true, data: next, smoke: smokeMetrics, gateBypassed: !gate.ok && forceSave };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:apply", async (_event, payload) => {
    try {
      const core = await loadCoreModule();
      const tuning = payload?.tuning ?? payload;
      const validate = validateMatchEngineTuning(tuning, tuningSchema);
      if (!validate.ok) return { ok: false, error: "validation failed", details: validate.errors };
      core.setMatchEngineTuning(tuning);
      const smoke = simulateGames(core, SMOKE_GAMES);
      const gate = evaluateSmokeGate(smoke);
      return { ok: true, smoke, smokeGate: gate };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("tuning:smoke", async (_event, payload) => {
    try {
      const core = await loadCoreModule();
      const games = Math.max(1, Math.min(500, Number(payload?.games ?? SMOKE_GAMES)));
      const tuning = payload?.tuning;
      if (tuning) {
        const validate = validateMatchEngineTuning(tuning, tuningSchema);
        if (!validate.ok) return { ok: false, error: "validation failed", details: validate.errors };
        core.setMatchEngineTuning(tuning);
      }
      const smoke = simulateGames(core, games);
      const gate = evaluateSmokeGate(smoke);
      return { ok: true, smoke, smokeGate: gate, thresholds: SMOKE_THRESHOLDS };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function toSnapshotDto(state) {
  return {
    matchId: state.matchId,
    inning: state.inning,
    inningLimit: state.inningLimit,
    half: state.half,
    outs: state.outs,
    count: state.count,
    score: state.score,
    runners: {
      first: !!state.runners.first,
      second: !!state.runners.second,
      third: !!state.runners.third
    },
    pitchCount: state.pitchCount,
    stamina: state.stamina,
    mental: state.mental,
    batter: state.batter,
    weather: state.weather,
    park: state.park,
    isFinished: state.isFinished,
    recentLogs: state.logs.slice(-30)
  };
}
