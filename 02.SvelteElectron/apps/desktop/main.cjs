const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");
const Database = require("better-sqlite3");

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
  } else {
    win.loadFile(path.resolve(__dirname, "../../dist/ui/index.html"));
  }
  return win;
}

// ── 콘텐츠 파일 와처 (개발 환경 전용) ────────────────────────
let _watchDebounceTimer = null;
let _mainWindow = null;

function startContentWatcher(resourceBase, rootDir) {
  const watchDirs = ["events", "achievements", "characters", "entities/players"];
  let activeWatchers = [];

  function regenerateAndNotify(filename) {
    clearTimeout(_watchDebounceTimer);
    _watchDebounceTimer = setTimeout(() => {
      const scriptPath = path.resolve(rootDir, "scripts/gen-manifest.mjs");
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, [scriptPath], { cwd: rootDir, stdio: "inherit" });
      child.on("close", (code) => {
        if (code === 0 && _mainWindow && !_mainWindow.isDestroyed()) {
          _mainWindow.webContents.send("master:content-changed", { filename: filename ?? "" });
        }
      });
    }, 200);
  }

  for (const dir of watchDirs) {
    const fullDir = path.join(resourceBase, dir);
    try {
      const w = fs.watch(fullDir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.endsWith(".json") || filename.startsWith("_")) return;
        console.log(`[content-watcher] 변경 감지: ${dir}/${filename}`);
        regenerateAndNotify(`${dir}/${filename}`);
      });
      activeWatchers.push(w);
    } catch {
      // 디렉토리가 아직 없으면 무시
    }
  }

  return activeWatchers;
}

const SLOT_SCHEMA_VERSION = 1;
const DEFAULT_SLOT_ID = "A";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFileOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── SQLite DB 초기화 ─────────────────────────────────────────
function openDatabase(dbPath) {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS save_slots (
      slot_id      TEXT PRIMARY KEY,
      name         TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL,
      career_stage TEXT,
      season_year  INTEGER,
      current_week INTEGER,
      team_id      TEXT,
      game_json    TEXT NOT NULL DEFAULT '{}',
      season_json  TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS npc_career_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id   TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id    TEXT    NOT NULL,
      npc_name  TEXT    NOT NULL DEFAULT '',
      year      INTEGER NOT NULL,
      league_id TEXT    NOT NULL DEFAULT '',
      team_id   TEXT    NOT NULL DEFAULT '',
      stat_line TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_nch_slot_npc ON npc_career_history(slot_id, npc_id);
    CREATE INDEX IF NOT EXISTS idx_nch_year     ON npc_career_history(slot_id, year);
  `);
  return db;
}

// ── DB 기반 슬롯 CRUD ────────────────────────────────────────
function dbListSlots(db) {
  return db.prepare(
    "SELECT slot_id, name, updated_at, career_stage, season_year, current_week, team_id FROM save_slots ORDER BY updated_at DESC"
  ).all().map((r) => ({
    slotId:    r.slot_id,
    name:      r.name,
    updatedAt: r.updated_at,
    preview: {
      careerStage: r.career_stage,
      seasonYear:  r.season_year,
      currentWeek: r.current_week,
      teamId:      r.team_id,
    },
  }));
}

function dbLoadSlot(db, slotId) {
  const r = db.prepare("SELECT * FROM save_slots WHERE slot_id = ?").get(slotId);
  if (!r) return null;
  return {
    version:  SLOT_SCHEMA_VERSION,
    slotMeta: {
      slotId:    r.slot_id,
      name:      r.name,
      updatedAt: r.updated_at,
      preview: {
        careerStage: r.career_stage,
        seasonYear:  r.season_year,
        currentWeek: r.current_week,
        teamId:      r.team_id,
      },
    },
    game:   r.game_json   ? JSON.parse(r.game_json)   : null,
    season: r.season_json ? JSON.parse(r.season_json) : null,
  };
}

function dbSaveSlot(db, slotId, game, season) {
  const protagonist = game?.protagonist ?? {};
  const name      = protagonist.name ?? `Slot ${slotId}`;
  const updatedAt = new Date().toISOString();
  const careerStage  = protagonist.careerStage  ?? null;
  const seasonYear   = season?.seasonYear  ?? null;
  const currentWeek  = season?.currentWeek ?? null;
  const teamId       = protagonist.teamId  ?? null;

  const upsertSlot = db.prepare(`
    INSERT INTO save_slots
      (slot_id, name, updated_at, career_stage, season_year, current_week, team_id, game_json, season_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slot_id) DO UPDATE SET
      name         = excluded.name,
      updated_at   = excluded.updated_at,
      career_stage = excluded.career_stage,
      season_year  = excluded.season_year,
      current_week = excluded.current_week,
      team_id      = excluded.team_id,
      game_json    = excluded.game_json,
      season_json  = excluded.season_json
  `);

  const deleteHistory = db.prepare("DELETE FROM npc_career_history WHERE slot_id = ?");
  const insertHistory = db.prepare(`
    INSERT INTO npc_career_history (slot_id, npc_id, npc_name, year, league_id, team_id, stat_line)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    upsertSlot.run(
      slotId, name, updatedAt,
      careerStage, seasonYear, currentWeek, teamId,
      JSON.stringify(game ?? {}), JSON.stringify(season ?? {}),
    );
    if (Array.isArray(game?.npcs)) {
      deleteHistory.run(slotId);
      for (const npc of game.npcs) {
        for (const entry of (npc.careerHistory ?? [])) {
          insertHistory.run(
            slotId, npc.npcId, npc.name ?? "",
            entry.year, entry.leagueId ?? "",
            entry.teamId ?? "", entry.statLine ?? "",
          );
        }
      }
    }
  })();

  return {
    version:  SLOT_SCHEMA_VERSION,
    slotMeta: { slotId, name, updatedAt, preview: { careerStage, seasonYear, currentWeek, teamId } },
    game,
    season,
  };
}

// ── 기존 JSON 슬롯 파일 → SQLite 마이그레이션 ───────────────
function migrateJsonSlotsToDb(db, savesDir) {
  let files;
  try { files = fs.readdirSync(savesDir); } catch { return; }
  for (const f of files) {
    const m = f.match(/^slot_(.+)\.json$/);
    if (!m) continue;
    const slotId = m[1];
    if (db.prepare("SELECT 1 FROM save_slots WHERE slot_id = ?").get(slotId)) continue;
    try {
      const env = readJsonFileOrNull(path.join(savesDir, f));
      if (!env) continue;
      dbSaveSlot(db, slotId, env.game ?? null, env.season ?? null);
      console.log(`[db-migrate] slot ${slotId} → SQLite`);
    } catch (e) {
      console.warn(`[db-migrate] slot ${slotId} failed:`, e);
    }
  }
}

app.whenReady().then(() => {
  const resourceBase = path.resolve(__dirname, "../../resource/data/master");
  const rootDir      = path.resolve(__dirname, "../../");
  const tuningSchema = loadTuningSchema(resourceBase);
  const userDataDir  = app.getPath("userData");
  const savesDir     = path.join(userDataDir, "saves");
  const dbPath       = path.join(savesDir, "projectb.db");

  // ── SQLite DB 열기 + 기존 JSON 슬롯 마이그레이션 ─────────────
  const db = openDatabase(dbPath);
  migrateJsonSlotsToDb(db, savesDir);

  // ── 레거시 save.json / save_season.json 마이그레이션 ─────────
  const legacyGamePath   = path.join(userDataDir, "save.json");
  const legacySeasonPath = path.join(userDataDir, "save_season.json");
  if (!db.prepare("SELECT 1 FROM save_slots WHERE slot_id = ?").get(DEFAULT_SLOT_ID)) {
    const legacyGame   = readJsonFileOrNull(legacyGamePath);
    const legacySeason = readJsonFileOrNull(legacySeasonPath);
    if (legacyGame || legacySeason) {
      dbSaveSlot(db, DEFAULT_SLOT_ID, legacyGame, legacySeason);
      console.log("[db-migrate] legacy save.json → SQLite");
    }
  }

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

  ipcMain.handle("game:load", () => {
    return dbLoadSlot(db, DEFAULT_SLOT_ID)?.game ?? null;
  });

  ipcMain.handle("game:save", (_event, data) => {
    try {
      const cur = dbLoadSlot(db, DEFAULT_SLOT_ID);
      dbSaveSlot(db, DEFAULT_SLOT_ID, data, cur?.season ?? null);
    } catch (e) {
      console.error("[game:save] 저장 실패:", e);
    }
  });

  ipcMain.handle("season:load", () => {
    return dbLoadSlot(db, DEFAULT_SLOT_ID)?.season ?? null;
  });

  ipcMain.handle("season:save", (_event, data) => {
    try {
      const cur = dbLoadSlot(db, DEFAULT_SLOT_ID);
      dbSaveSlot(db, DEFAULT_SLOT_ID, cur?.game ?? null, data);
    } catch (e) {
      console.error("[season:save] 저장 실패:", e);
    }
  });

  ipcMain.handle("save:listSlots", () => dbListSlots(db));

  ipcMain.handle("save:loadSlot", (_event, slotId) => {
    if (typeof slotId !== "string" || !slotId.trim()) return null;
    return dbLoadSlot(db, slotId.trim());
  });

  ipcMain.handle("save:saveSlot", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? DEFAULT_SLOT_ID).trim();
      if (!slotId) throw new Error("slotId is required");
      return { ok: true, slot: dbSaveSlot(db, slotId, payload?.game ?? null, payload?.season ?? null) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("save:deleteSlot", (_event, slotId) => {
    try {
      const id = String(slotId ?? "").trim();
      if (!id) throw new Error("slotId is required");
      db.prepare("DELETE FROM save_slots WHERE slot_id = ?").run(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("save:renameSlot", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? "").trim();
      const name   = String(payload?.name   ?? "").trim();
      if (!slotId) throw new Error("slotId is required");
      if (!name)   throw new Error("name is required");
      const r = db.prepare("UPDATE save_slots SET name = ?, updated_at = ? WHERE slot_id = ?")
        .run(name, new Date().toISOString(), slotId);
      if (r.changes === 0) throw new Error("slot not found");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  // ── 커리어 히스토리 조회 (신규) ──────────────────────────────
  ipcMain.handle("stats:queryCareerHistory", (_event, payload) => {
    try {
      const slotId  = String(payload?.slotId  ?? DEFAULT_SLOT_ID);
      const npcId   = payload?.npcId   ?? null;
      const year    = payload?.year    ?? null;
      const limit   = Math.min(500, Math.max(1, Number(payload?.limit ?? 200)));

      let sql = "SELECT npc_id, npc_name, year, league_id, team_id, stat_line FROM npc_career_history WHERE slot_id = ?";
      const params = [slotId];
      if (npcId)  { sql += " AND npc_id = ?";  params.push(npcId); }
      if (year)   { sql += " AND year = ?";     params.push(year); }
      sql += " ORDER BY year DESC LIMIT ?";
      params.push(limit);

      return db.prepare(sql).all(...params).map((r) => ({
        npcId:    r.npc_id,
        name:     r.npc_name,
        year:     r.year,
        leagueId: r.league_id,
        teamId:   r.team_id,
        statLine: r.stat_line,
      }));
    } catch (e) {
      console.error("[stats:queryCareerHistory] 오류:", e);
      return [];
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

  _mainWindow = createWindow();

  // 개발 환경에서만 콘텐츠 파일 와처 활성화
  if (process.env.VITE_DEV_SERVER_URL) {
    startContentWatcher(resourceBase, rootDir);
    console.log("[content-watcher] 활성화 (events / achievements / characters / entities/players)");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      _mainWindow = createWindow();
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
    lineupIndex: state.lineupIndex,
    weather: state.weather,
    park: state.park,
    isFinished: state.isFinished,
    recentLogs: state.logs.slice(-30),
    fielders: state.fielders ?? [],
    defenseStat: state.defenseStat ?? { errors: 0, assists: 0, throwOuts: 0, throwSafes: 0 },
  };
}
