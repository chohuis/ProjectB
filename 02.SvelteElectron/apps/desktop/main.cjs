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
    width: 1440, height: 900, minWidth: 1200, minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

let _watchDebounceTimer = null;
let _mainWindow = null;

function startContentWatcher(resourceBase, rootDir) {
  const watchDirs = ["events", "achievements", "characters", "entities/players"];
  const activeWatchers = [];
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
    } catch { /* 디렉토리 없으면 무시 */ }
  }
  return activeWatchers;
}

// ── DB ─────────────────────────────────────────────────────────
const SLOT_SCHEMA_VERSION = 2;
const DEFAULT_SLOT_ID = "A";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFileOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch { return null; }
}

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
      team_id      TEXT
    );

    CREATE TABLE IF NOT EXISTS protagonist (
      slot_id                        TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      p_id                           TEXT NOT NULL DEFAULT 'PLY_HERO',
      name                           TEXT NOT NULL DEFAULT '',
      name_en                        TEXT,
      career_stage                   TEXT NOT NULL DEFAULT 'highschool',
      league_id                      TEXT NOT NULL DEFAULT '',
      team_id                        TEXT NOT NULL DEFAULT '',
      school_id                      TEXT,
      grade                          INTEGER,
      age                            INTEGER NOT NULL DEFAULT 18,
      player_type                    TEXT NOT NULL DEFAULT 'pitcher',
      position                       TEXT NOT NULL DEFAULT '',
      handedness                     TEXT NOT NULL DEFAULT 'R',
      pitching_form                  TEXT,
      jersey_number                  INTEGER NOT NULL DEFAULT 18,
      condition                      INTEGER NOT NULL DEFAULT 80,
      fatigue                        INTEGER NOT NULL DEFAULT 20,
      morale                         INTEGER NOT NULL DEFAULT 65,
      pitch_ovr INTEGER, pitch_stamina INTEGER, pitch_velocity INTEGER,
      pitch_command INTEGER, pitch_control INTEGER, pitch_movement INTEGER,
      pitch_mentality INTEGER, pitch_recovery INTEGER, pitch_clutch INTEGER,
      pitch_hold_runners INTEGER,
      bat_ovr INTEGER, bat_contact INTEGER, bat_power INTEGER,
      bat_eye INTEGER, bat_discipline INTEGER, bat_speed INTEGER,
      bat_base_instinct INTEGER, bat_bunting INTEGER, bat_platoon INTEGER,
      bat_fielding INTEGER, bat_arm INTEGER, bat_batting_clutch INTEGER,
      primary_position               TEXT,
      position_ratings_json          TEXT,
      diligence                      INTEGER NOT NULL DEFAULT 60,
      popularity                     INTEGER NOT NULL DEFAULT 10,
      development_rate               INTEGER NOT NULL DEFAULT 62,
      potential_hidden               INTEGER NOT NULL DEFAULT 88,
      growth_points                  INTEGER NOT NULL DEFAULT 0,
      training_pitch_id              TEXT,
      training_pitch_progress        INTEGER,
      training_primary               TEXT,
      training_secondary             TEXT,
      training_recovery              TEXT,
      money                          INTEGER NOT NULL DEFAULT 0,
      fame                           INTEGER NOT NULL DEFAULT 0,
      scout_score                    INTEGER NOT NULL DEFAULT 0,
      pro_service_years              INTEGER NOT NULL DEFAULT 0,
      military_unit                  TEXT,
      military_service_weeks         INTEGER NOT NULL DEFAULT 0,
      military_recovery_weeks        INTEGER NOT NULL DEFAULT 0,
      trade_adaptation_weeks         INTEGER NOT NULL DEFAULT 0,
      fa_negotiation_round           INTEGER NOT NULL DEFAULT 0,
      fa_unsigned_weeks              INTEGER NOT NULL DEFAULT 0,
      consecutive_low_morale_weeks   INTEGER NOT NULL DEFAULT 0,
      consecutive_high_fatigue_weeks INTEGER NOT NULL DEFAULT 0,
      injury_type                    TEXT,
      injury_recovery_weeks          INTEGER,
      game_version                   INTEGER NOT NULL DEFAULT 2,
      saved_at                       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS protagonist_contract (
      slot_id             TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      team_id             TEXT NOT NULL,
      league_id           TEXT NOT NULL,
      salary              INTEGER NOT NULL DEFAULT 0,
      duration_years      INTEGER NOT NULL DEFAULT 1,
      remaining_years     INTEGER NOT NULL DEFAULT 1,
      signing_bonus       INTEGER NOT NULL DEFAULT 0,
      team_option_years   INTEGER NOT NULL DEFAULT 0,
      player_option_years INTEGER NOT NULL DEFAULT 0,
      no_trade            INTEGER NOT NULL DEFAULT 0,
      incentives_json     TEXT,
      status              TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS protagonist_pitches (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      pitch_id   TEXT NOT NULL,
      grade      INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, pitch_id)
    );

    CREATE TABLE IF NOT EXISTS protagonist_tags (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      tag        TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, tag)
    );

    CREATE TABLE IF NOT EXISTS protagonist_xp (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      stat_type  TEXT NOT NULL,
      stat_key   TEXT NOT NULL,
      xp_value   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, stat_type, stat_key)
    );

    CREATE TABLE IF NOT EXISTS protagonist_school (
      slot_id                           TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      attends_university                INTEGER NOT NULL DEFAULT 0,
      university_major                  TEXT NOT NULL DEFAULT '',
      planned_university_majors_json    TEXT,
      weekly_study_mode                 TEXT NOT NULL DEFAULT 'normal',
      exam_accum_score                  INTEGER NOT NULL DEFAULT 0,
      last_grade                        INTEGER,
      last_grade_risk                   TEXT NOT NULL DEFAULT 'ok',
      eligibility_blocked               INTEGER NOT NULL DEFAULT 0,
      warning_count                     INTEGER NOT NULL DEFAULT 0,
      career_choice_triggered           INTEGER NOT NULL DEFAULT 0,
      draft_triggered                   INTEGER NOT NULL DEFAULT 0,
      draft_intent                      INTEGER NOT NULL DEFAULT 0,
      career_applications_submitted     INTEGER NOT NULL DEFAULT 0,
      fallback_selection_pending        INTEGER NOT NULL DEFAULT 0,
      fallback_university_choices_json  TEXT,
      fallback_independent_choices_json TEXT,
      fallback_university_passed_json   TEXT,
      fallback_independent_passed_json  TEXT,
      fallback_sports_military_passed   INTEGER NOT NULL DEFAULT 0,
      fallback_draft_passed             INTEGER NOT NULL DEFAULT 0,
      fallback_draft_team_id            TEXT,
      fallback_draft_round              INTEGER,
      fallback_draft_pick               INTEGER,
      fallback_draft_signing_bonus      INTEGER NOT NULL DEFAULT 0,
      career_choice_popup_opened        INTEGER NOT NULL DEFAULT 0,
      career_choice_mode                TEXT NOT NULL DEFAULT 'none',
      career_choice_confirmed           INTEGER NOT NULL DEFAULT 0,
      career_choice_univ_apps_json      TEXT,
      career_choice_ind_apps_json       TEXT,
      career_draft_pick_log_json        TEXT,
      career_final_choice               TEXT NOT NULL DEFAULT 'none',
      university_week                   INTEGER NOT NULL DEFAULT 0,
      major_selected                    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subject_scores (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL,
      percentile INTEGER NOT NULL DEFAULT 50,
      attendance INTEGER NOT NULL DEFAULT 90,
      assignment INTEGER NOT NULL DEFAULT 85,
      PRIMARY KEY (slot_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      slot_id        TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      progress       INTEGER NOT NULL DEFAULT 0,
      unlocked_at    TEXT,
      claimed_at     TEXT,
      tracked        INTEGER,
      PRIMARY KEY (slot_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS achievement_metrics (
      slot_id              TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      strikeout_total      INTEGER NOT NULL DEFAULT 0,
      save_total           INTEGER NOT NULL DEFAULT 0,
      kakao_first_contact  INTEGER NOT NULL DEFAULT 0,
      training_weeks_total INTEGER NOT NULL DEFAULT 0,
      games_won_total      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mailbox (
      slot_id       TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      msg_id        TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT '',
      sender        TEXT NOT NULL DEFAULT '',
      subject       TEXT NOT NULL DEFAULT '',
      preview       TEXT NOT NULL DEFAULT '',
      body          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT '',
      read_at       TEXT,
      decision_json TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, msg_id)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      slot_id           TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      contact_id        TEXT NOT NULL,
      name              TEXT NOT NULL DEFAULT '',
      category          TEXT NOT NULL DEFAULT '',
      relation          TEXT NOT NULL DEFAULT '',
      unlocked          INTEGER NOT NULL DEFAULT 0,
      affinity          INTEGER NOT NULL DEFAULT 0,
      last_action_week  INTEGER NOT NULL DEFAULT 0,
      chat_history_json TEXT,
      flags_json        TEXT,
      PRIMARY KEY (slot_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS recent_logs (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      log_text   TEXT NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS recent_upcoming (
      slot_id       TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order    INTEGER NOT NULL,
      upcoming_text TEXT NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS npc_runtime (
      slot_id                TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id                 TEXT NOT NULL,
      name                   TEXT NOT NULL DEFAULT '',
      name_en                TEXT,
      player_type            TEXT NOT NULL DEFAULT 'pitcher',
      position               TEXT NOT NULL DEFAULT '',
      age                    INTEGER NOT NULL DEFAULT 18,
      grade                  INTEGER,
      school_id              TEXT NOT NULL DEFAULT '',
      graduation_year        INTEGER NOT NULL DEFAULT 0,
      career_status          TEXT NOT NULL DEFAULT 'active',
      current_league         TEXT NOT NULL DEFAULT '',
      current_team           TEXT NOT NULL DEFAULT '',
      military_status        TEXT NOT NULL DEFAULT '미필',
      military_enlist_year   INTEGER,
      military_discharge_year INTEGER,
      pro_service_years      INTEGER NOT NULL DEFAULT 0,
      development_rate       INTEGER NOT NULL DEFAULT 60,
      pitch_ovr INTEGER, pitch_stamina INTEGER, pitch_velocity INTEGER,
      pitch_command INTEGER, pitch_control INTEGER, pitch_movement INTEGER,
      pitch_mentality INTEGER, pitch_recovery INTEGER, pitch_clutch INTEGER,
      pitch_hold_runners INTEGER,
      bat_ovr INTEGER, bat_contact INTEGER, bat_power INTEGER,
      bat_eye INTEGER, bat_discipline INTEGER, bat_speed INTEGER,
      bat_base_instinct INTEGER, bat_bunting INTEGER, bat_platoon INTEGER,
      bat_fielding INTEGER, bat_arm INTEGER, bat_batting_clutch INTEGER,
      PRIMARY KEY (slot_id, npc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_npc_runtime_league ON npc_runtime(slot_id, current_league);
    CREATE INDEX IF NOT EXISTS idx_npc_runtime_team   ON npc_runtime(slot_id, current_team);

    CREATE TABLE IF NOT EXISTS npc_career_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id        TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id         TEXT NOT NULL,
      year           INTEGER NOT NULL,
      league_id      TEXT NOT NULL DEFAULT '',
      team_id        TEXT NOT NULL DEFAULT '',
      stat_line      TEXT NOT NULL DEFAULT '',
      highlights_json TEXT,
      sort_order     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_nch_slot_npc ON npc_career_history(slot_id, npc_id);

    CREATE TABLE IF NOT EXISTS npc_achievements (
      slot_id          TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id           TEXT NOT NULL,
      achievement_text TEXT NOT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, npc_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS season_meta (
      slot_id      TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      version      INTEGER NOT NULL DEFAULT 1,
      saved_at     TEXT NOT NULL DEFAULT '',
      league_id    TEXT NOT NULL DEFAULT '',
      season_year  INTEGER NOT NULL DEFAULT 2026,
      current_week INTEGER NOT NULL DEFAULT 0,
      total_weeks  INTEGER NOT NULL DEFAULT 52
    );

    CREATE TABLE IF NOT EXISTS season_schedule (
      slot_id             TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      schedule_id         TEXT NOT NULL,
      week                INTEGER NOT NULL,
      league_id           TEXT,
      home_team_id        TEXT NOT NULL,
      away_team_id        TEXT NOT NULL,
      is_protagonist_game INTEGER NOT NULL DEFAULT 0,
      phase               TEXT NOT NULL DEFAULT 'season',
      result_json         TEXT,
      PRIMARY KEY (slot_id, schedule_id)
    );

    CREATE TABLE IF NOT EXISTS season_standings (
      slot_id      TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      team_id      TEXT NOT NULL,
      wins         INTEGER NOT NULL DEFAULT 0,
      losses       INTEGER NOT NULL DEFAULT 0,
      draws        INTEGER NOT NULL DEFAULT 0,
      win_pct      REAL NOT NULL DEFAULT 0,
      runs_for     INTEGER NOT NULL DEFAULT 0,
      runs_against INTEGER NOT NULL DEFAULT 0,
      streak       TEXT NOT NULL DEFAULT '',
      last10       TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (slot_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS season_stats (
      slot_id   TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      g INTEGER NOT NULL DEFAULT 0,
      gs INTEGER, w INTEGER, l INTEGER, sv INTEGER, hd INTEGER,
      ip REAL, er INTEGER, h_p INTEGER, k_p INTEGER, bb_p INTEGER,
      era REAL, whip REAL,
      pa INTEGER, ab INTEGER, h_b INTEGER, hr INTEGER, rbi INTEGER,
      sb INTEGER, bb_b INTEGER, k_b INTEGER,
      avg_v REAL, obp REAL, slg REAL, ops REAL,
      PRIMARY KEY (slot_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS triggered_events (
      slot_id   TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      event_id  TEXT NOT NULL,
      last_week INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      slot_id     TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL,
      action_json TEXT NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS season_league_schedule (
      slot_id             TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id           TEXT NOT NULL,
      schedule_id         TEXT NOT NULL,
      week                INTEGER NOT NULL,
      home_team_id        TEXT NOT NULL,
      away_team_id        TEXT NOT NULL,
      is_protagonist_game INTEGER NOT NULL DEFAULT 0,
      phase               TEXT NOT NULL DEFAULT 'season',
      result_json         TEXT,
      PRIMARY KEY (slot_id, league_id, schedule_id)
    );

    CREATE TABLE IF NOT EXISTS season_league_standings (
      slot_id      TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id    TEXT NOT NULL,
      team_id      TEXT NOT NULL,
      wins         INTEGER NOT NULL DEFAULT 0,
      losses       INTEGER NOT NULL DEFAULT 0,
      draws        INTEGER NOT NULL DEFAULT 0,
      win_pct      REAL NOT NULL DEFAULT 0,
      runs_for     INTEGER NOT NULL DEFAULT 0,
      runs_against INTEGER NOT NULL DEFAULT 0,
      streak       TEXT NOT NULL DEFAULT '',
      last10       TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (slot_id, league_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS season_league_stats (
      slot_id   TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      g INTEGER NOT NULL DEFAULT 0,
      gs INTEGER, w INTEGER, l INTEGER, sv INTEGER, hd INTEGER,
      ip REAL, er INTEGER, h_p INTEGER, k_p INTEGER, bb_p INTEGER,
      era REAL, whip REAL,
      pa INTEGER, ab INTEGER, h_b INTEGER, hr INTEGER, rbi INTEGER,
      sb INTEGER, bb_b INTEGER, k_b INTEGER,
      avg_v REAL, obp REAL, slg REAL, ops REAL,
      PRIMARY KEY (slot_id, league_id, player_id)
    );
  `);
  return db;
}

function dbListSlots(db) {
  return db.prepare(
    "SELECT slot_id, name, updated_at, career_stage, season_year, current_week, team_id FROM save_slots ORDER BY updated_at DESC"
  ).all().map((r) => ({
    slotId: r.slot_id, name: r.name, updatedAt: r.updated_at,
    preview: { careerStage: r.career_stage, seasonYear: r.season_year, currentWeek: r.current_week, teamId: r.team_id },
  }));
}

function _statsToRow(stat) {
  if (!stat) return null;
  if (stat.type === "pitcher") {
    return { stat_type: "pitcher", g: stat.g, gs: stat.gs, w: stat.w, l: stat.l, sv: stat.sv, hd: stat.hd,
      ip: stat.ip, er: stat.er, h_p: stat.h, k_p: stat.k, bb_p: stat.bb, era: stat.era, whip: stat.whip,
      pa: null, ab: null, h_b: null, hr: null, rbi: null, sb: null, bb_b: null, k_b: null,
      avg_v: null, obp: null, slg: null, ops: null };
  }
  return { stat_type: "batter", g: stat.g, gs: null, w: null, l: null, sv: null, hd: null,
    ip: null, er: null, h_p: null, k_p: null, bb_p: null, era: null, whip: null,
    pa: stat.pa, ab: stat.ab, h_b: stat.h, hr: stat.hr, rbi: stat.rbi,
    sb: stat.sb, bb_b: stat.bb, k_b: stat.k, avg_v: stat.avg, obp: stat.obp, slg: stat.slg, ops: stat.ops };
}

function _rowToStats(r) {
  if (!r) return null;
  if (r.stat_type === "pitcher") {
    return { type: "pitcher", g: r.g, gs: r.gs, w: r.w, l: r.l, sv: r.sv, hd: r.hd,
      ip: r.ip, er: r.er, h: r.h_p, k: r.k_p, bb: r.bb_p, era: r.era, whip: r.whip };
  }
  return { type: "batter", g: r.g, pa: r.pa, ab: r.ab, h: r.h_b, hr: r.hr, rbi: r.rbi,
    sb: r.sb, bb: r.bb_b, k: r.k_b, avg: r.avg_v, obp: r.obp, slg: r.slg, ops: r.ops };
}

function dbSaveSlot(db, slotId, game, season) {
  const protagonist = game?.protagonist ?? {};
  const name      = protagonist.name ?? `Slot ${slotId}`;
  const updatedAt = new Date().toISOString();
  const careerStage = protagonist.careerStage ?? null;
  const seasonYear  = season?.seasonYear  ?? null;
  const currentWeek = season?.currentWeek ?? null;
  const teamId      = protagonist.teamId  ?? null;

  const clr = (tbl) => db.prepare(`DELETE FROM ${tbl} WHERE slot_id = ?`).run(slotId);

  db.transaction(() => {
    // save_slots
    db.prepare(`
      INSERT INTO save_slots (slot_id, name, updated_at, career_stage, season_year, current_week, team_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET
        name=excluded.name, updated_at=excluded.updated_at,
        career_stage=excluded.career_stage, season_year=excluded.season_year,
        current_week=excluded.current_week, team_id=excluded.team_id
    `).run(slotId, name, updatedAt, careerStage, seasonYear, currentWeek, teamId);

    // protagonist
    clr("protagonist");
    if (game?.protagonist) {
      const p  = game.protagonist;
      const pi = p.pitching ?? {};
      const ba = p.batting  ?? {};
      const tp = game.trainingPlan ?? {};
      db.prepare(`INSERT INTO protagonist (
        slot_id, p_id, name, name_en, career_stage, league_id, team_id, school_id, grade, age,
        player_type, position, handedness, pitching_form, jersey_number,
        condition, fatigue, morale,
        pitch_ovr, pitch_stamina, pitch_velocity, pitch_command, pitch_control, pitch_movement,
        pitch_mentality, pitch_recovery, pitch_clutch, pitch_hold_runners,
        bat_ovr, bat_contact, bat_power, bat_eye, bat_discipline, bat_speed,
        bat_base_instinct, bat_bunting, bat_platoon, bat_fielding, bat_arm, bat_batting_clutch,
        primary_position, position_ratings_json,
        diligence, popularity, development_rate, potential_hidden, growth_points,
        training_pitch_id, training_pitch_progress,
        training_primary, training_secondary, training_recovery,
        money, fame, scout_score, pro_service_years,
        military_unit, military_service_weeks, military_recovery_weeks,
        trade_adaptation_weeks, fa_negotiation_round, fa_unsigned_weeks,
        consecutive_low_morale_weeks, consecutive_high_fatigue_weeks,
        injury_type, injury_recovery_weeks, game_version, saved_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )`).run(
        slotId, p.id ?? "PLY_HERO", p.name, p.nameEn ?? null,
        p.careerStage, p.leagueId, p.teamId, p.schoolId ?? null, p.grade ?? null, p.age,
        p.playerType, p.position, p.handedness, p.pitchingForm ?? null, p.jerseyNumber,
        p.condition, p.fatigue, p.morale,
        pi.ovr ?? null, pi.stamina ?? null, pi.velocity ?? null, pi.command ?? null,
        pi.control ?? null, pi.movement ?? null, pi.mentality ?? null,
        pi.recovery ?? null, pi.clutch ?? null, pi.holdRunners ?? null,
        ba.ovr ?? null, ba.contact ?? null, ba.power ?? null, ba.eye ?? null,
        ba.discipline ?? null, ba.speed ?? null, ba.baseInstinct ?? null,
        ba.bunting ?? null, ba.platoon ?? null, ba.fielding ?? null,
        ba.arm ?? null, ba.battingClutch ?? null,
        p.primaryPosition ?? null,
        p.positionRatings ? JSON.stringify(p.positionRatings) : null,
        p.diligence ?? 60, p.popularity ?? 10,
        p.developmentRate ?? 62, p.potentialHidden ?? 88, p.growthPoints ?? 0,
        p.trainingPitchState?.id ?? null, p.trainingPitchState?.progress ?? null,
        tp.primaryProgramId ?? null, tp.secondaryProgramId ?? null, tp.recoveryProgramId ?? null,
        p.money ?? 0, p.fame ?? 0, p.scoutScore ?? 0, p.proServiceYears ?? 0,
        p.militaryUnit ?? null, p.militaryServiceWeeks ?? 0, p.militaryRecoveryWeeks ?? 0,
        p.tradeAdaptationWeeks ?? 0, p.faNegotiationRound ?? 0, p.faUnsignedWeeks ?? 0,
        p.consecutiveLowMoraleWeeks ?? 0, p.consecutiveHighFatigueWeeks ?? 0,
        p.injury?.type ?? null, p.injury?.recoveryWeeksLeft ?? null,
        game.version ?? 2, game.savedAt ?? updatedAt,
      );

      // contract
      clr("protagonist_contract");
      if (p.contract) {
        const c = p.contract;
        db.prepare(`INSERT INTO protagonist_contract
          (slot_id,team_id,league_id,salary,duration_years,remaining_years,
           signing_bonus,team_option_years,player_option_years,no_trade,incentives_json,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          slotId, c.teamId, c.leagueId, c.salary, c.durationYears, c.remainingYears,
          c.signingBonus, c.teamOptionYears, c.playerOptionYears, c.noTrade ? 1 : 0,
          c.incentives ? JSON.stringify(c.incentives) : null, c.status);
      }

      // pitches
      clr("protagonist_pitches");
      const pitchStmt = db.prepare(`INSERT INTO protagonist_pitches (slot_id,pitch_id,grade,sort_order) VALUES (?,?,?,?)`);
      for (let i = 0; i < (p.pitches ?? []).length; i++)
        pitchStmt.run(slotId, p.pitches[i].id, p.pitches[i].grade, i);

      // tags
      clr("protagonist_tags");
      const tagStmt = db.prepare(`INSERT INTO protagonist_tags (slot_id,tag,sort_order) VALUES (?,?,?)`);
      for (let i = 0; i < (p.tags ?? []).length; i++)
        tagStmt.run(slotId, p.tags[i], i);

      // XP
      clr("protagonist_xp");
      const xpStmt = db.prepare(`INSERT INTO protagonist_xp (slot_id,stat_type,stat_key,xp_value) VALUES (?,?,?,?)`);
      for (const [k, v] of Object.entries(p.pitchingXP ?? {})) xpStmt.run(slotId, "pitching", k, v ?? 0);
      for (const [k, v] of Object.entries(p.battingXP  ?? {})) xpStmt.run(slotId, "batting",  k, v ?? 0);
    }

    // school
    clr("protagonist_school");
    clr("subject_scores");
    if (game?.schoolState) {
      const s = game.schoolState;
      db.prepare(`INSERT INTO protagonist_school (
        slot_id, attends_university, university_major, planned_university_majors_json,
        weekly_study_mode, exam_accum_score, last_grade, last_grade_risk,
        eligibility_blocked, warning_count, career_choice_triggered, draft_triggered,
        draft_intent, career_applications_submitted, fallback_selection_pending,
        fallback_university_choices_json, fallback_independent_choices_json,
        fallback_university_passed_json, fallback_independent_passed_json,
        fallback_sports_military_passed, fallback_draft_passed,
        fallback_draft_team_id, fallback_draft_round, fallback_draft_pick, fallback_draft_signing_bonus,
        career_choice_popup_opened, career_choice_mode, career_choice_confirmed,
        career_choice_univ_apps_json, career_choice_ind_apps_json, career_draft_pick_log_json,
        career_final_choice, university_week, major_selected
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        slotId, s.attendsUniversity ? 1 : 0, s.universityMajor,
        JSON.stringify(s.plannedUniversityMajors ?? []),
        s.weeklyStudyMode, s.examAccumScore, s.lastGrade ?? null, s.lastGradeRisk ?? "ok",
        s.eligibilityBlocked ? 1 : 0, s.warningCount ?? 0,
        s.careerChoiceTriggered ? 1 : 0, s.draftTriggered ? 1 : 0,
        s.draftIntent ? 1 : 0, s.careerApplicationsSubmitted ? 1 : 0,
        s.fallbackSelectionPending ? 1 : 0,
        JSON.stringify(s.fallbackUniversityChoices ?? []),
        JSON.stringify(s.fallbackIndependentChoices ?? []),
        JSON.stringify(s.fallbackUniversityPassed ?? []),
        JSON.stringify(s.fallbackIndependentPassed ?? []),
        s.fallbackSportsMilitaryPassed ? 1 : 0, s.fallbackDraftPassed ? 1 : 0,
        s.fallbackDraftTeamId ?? null, s.fallbackDraftRound ?? null, s.fallbackDraftPick ?? null,
        s.fallbackDraftSigningBonus ?? 0,
        s.careerChoicePopupOpened ? 1 : 0, s.careerChoiceMode ?? "none",
        s.careerChoiceConfirmed ? 1 : 0,
        JSON.stringify(s.careerChoiceUniversityApplications ?? []),
        JSON.stringify(s.careerChoiceIndependentApplications ?? []),
        JSON.stringify(s.careerDraftPickLog ?? []),
        s.careerFinalChoice ?? "none", s.universityWeek ?? 0, s.majorSelected ? 1 : 0,
      );
      const ssStmt = db.prepare(`INSERT INTO subject_scores (slot_id,subject_id,percentile,attendance,assignment) VALUES (?,?,?,?,?)`);
      for (const [sid, sc] of Object.entries(s.subjectScores ?? {}))
        ssStmt.run(slotId, sid, sc.percentile, sc.attendance, sc.assignment);
    }

    // achievements
    clr("achievements");
    const achStmt = db.prepare(`INSERT INTO achievements (slot_id,achievement_id,progress,unlocked_at,claimed_at,tracked) VALUES (?,?,?,?,?,?)`);
    for (const a of (game?.achievements ?? []))
      achStmt.run(slotId, a.id, a.progress, a.unlockedAt ?? null, a.claimedAt ?? null, a.tracked != null ? (a.tracked ? 1 : 0) : null);

    clr("achievement_metrics");
    if (game?.achievementMetrics) {
      const m = game.achievementMetrics;
      db.prepare(`INSERT INTO achievement_metrics (slot_id,strikeout_total,save_total,kakao_first_contact,training_weeks_total,games_won_total) VALUES (?,?,?,?,?,?)`).run(
        slotId, m.strikeoutTotal ?? 0, m.saveTotal ?? 0, m.kakaoFirstContact ? 1 : 0,
        m.trainingWeeksTotal ?? 0, m.gamesWonTotal ?? 0);
    }

    // mailbox
    clr("mailbox");
    const mbStmt = db.prepare(`INSERT INTO mailbox (slot_id,msg_id,category,sender,subject,preview,body,created_at,read_at,decision_json,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    for (let i = 0; i < (game?.mailbox ?? []).length; i++) {
      const m = game.mailbox[i];
      mbStmt.run(slotId, m.id, m.category, m.sender, m.subject, m.preview, m.body ?? "",
        m.createdAt, m.readAt ?? null, m.decision ? JSON.stringify(m.decision) : null, i);
    }

    // contacts
    clr("contacts");
    const ctStmt = db.prepare(`INSERT INTO contacts (slot_id,contact_id,name,category,relation,unlocked,affinity,last_action_week,chat_history_json,flags_json) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const c of (game?.contacts ?? []))
      ctStmt.run(slotId, c.id, c.name, c.category, c.relation, c.unlocked ? 1 : 0, c.affinity,
        c.lastActionWeek ?? 0, JSON.stringify(c.chatHistory ?? []), JSON.stringify(c.flags ?? []));

    // recent logs/upcoming
    clr("recent_logs"); clr("recent_upcoming");
    const logStmt = db.prepare(`INSERT INTO recent_logs (slot_id,sort_order,log_text) VALUES (?,?,?)`);
    for (let i = 0; i < (game?.recentLogs ?? []).length; i++) logStmt.run(slotId, i, game.recentLogs[i]);
    const upStmt  = db.prepare(`INSERT INTO recent_upcoming (slot_id,sort_order,upcoming_text) VALUES (?,?,?)`);
    for (let i = 0; i < (game?.recentUpcoming ?? []).length; i++) upStmt.run(slotId, i, game.recentUpcoming[i]);

    // NPCs
    clr("npc_runtime"); clr("npc_career_history"); clr("npc_achievements");
    const npcStmt = db.prepare(`INSERT INTO npc_runtime (
      slot_id,npc_id,name,name_en,player_type,position,age,grade,school_id,graduation_year,
      career_status,current_league,current_team,military_status,military_enlist_year,military_discharge_year,
      pro_service_years,development_rate,
      pitch_ovr,pitch_stamina,pitch_velocity,pitch_command,pitch_control,pitch_movement,
      pitch_mentality,pitch_recovery,pitch_clutch,pitch_hold_runners,
      bat_ovr,bat_contact,bat_power,bat_eye,bat_discipline,bat_speed,
      bat_base_instinct,bat_bunting,bat_platoon,bat_fielding,bat_arm,bat_batting_clutch
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const npcHistStmt = db.prepare(`INSERT INTO npc_career_history (slot_id,npc_id,year,league_id,team_id,stat_line,highlights_json,sort_order) VALUES (?,?,?,?,?,?,?,?)`);
    const npcAchStmt  = db.prepare(`INSERT INTO npc_achievements (slot_id,npc_id,achievement_text,sort_order) VALUES (?,?,?,?)`);
    for (const npc of (game?.npcs ?? [])) {
      const pi = npc.pitching ?? {};
      const ba = npc.batting  ?? {};
      npcStmt.run(
        slotId, npc.npcId, npc.name, npc.nameEn ?? null,
        npc.playerType, npc.position, npc.age, npc.grade ?? null,
        npc.schoolId ?? "", npc.graduationYear ?? 0,
        npc.careerStatus, npc.currentLeague, npc.currentTeam,
        npc.militaryStatus ?? "미필",
        npc.militaryEnlistYear ?? null, npc.militaryDischargeYear ?? null,
        npc.proServiceYears ?? 0,
        npc.developmentRate ?? 60,
        pi.ovr ?? null, pi.stamina ?? null, pi.velocity ?? null, pi.command ?? null,
        pi.control ?? null, pi.movement ?? null, pi.mentality ?? null,
        pi.recovery ?? null, pi.clutch ?? null, pi.holdRunners ?? null,
        ba.ovr ?? null, ba.contact ?? null, ba.power ?? null, ba.eye ?? null,
        ba.discipline ?? null, ba.speed ?? null, ba.baseInstinct ?? null,
        ba.bunting ?? null, ba.platoon ?? null, ba.fielding ?? null,
        ba.arm ?? null, ba.battingClutch ?? null,
      );
      for (let i = 0; i < (npc.careerHistory ?? []).length; i++) {
        const h = npc.careerHistory[i];
        npcHistStmt.run(slotId, npc.npcId, h.year, h.leagueId ?? "", h.teamId ?? "",
          h.statLine ?? "", JSON.stringify(h.highlights ?? []), i);
      }
      for (let i = 0; i < (npc.achievements ?? []).length; i++)
        npcAchStmt.run(slotId, npc.npcId, npc.achievements[i], i);
    }

    // season
    clr("season_meta"); clr("season_schedule"); clr("season_standings"); clr("season_stats");
    clr("triggered_events"); clr("pending_actions");
    clr("season_league_schedule"); clr("season_league_standings"); clr("season_league_stats");
    if (season) {
      db.prepare(`INSERT INTO season_meta (slot_id,version,saved_at,league_id,season_year,current_week,total_weeks) VALUES (?,?,?,?,?,?,?)`).run(
        slotId, season.version ?? 1, season.savedAt ?? updatedAt,
        season.leagueId ?? "", season.seasonYear ?? 2026, season.currentWeek ?? 0, season.totalWeeks ?? 52);

      const schStmt = db.prepare(`INSERT INTO season_schedule (slot_id,schedule_id,week,league_id,home_team_id,away_team_id,is_protagonist_game,phase,result_json) VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const e of (season.schedule ?? []))
        schStmt.run(slotId, e.id, e.week, e.leagueId ?? null, e.homeTeamId, e.awayTeamId,
          e.isProtagonistGame ? 1 : 0, e.phase, e.result ? JSON.stringify(e.result) : null);

      const standStmt = db.prepare(`INSERT INTO season_standings (slot_id,team_id,wins,losses,draws,win_pct,runs_for,runs_against,streak,last10) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for (const st of (season.standings ?? []))
        standStmt.run(slotId, st.teamId, st.wins, st.losses, st.draws, st.winPct,
          st.runsFor, st.runsAgainst, st.streak ?? "", st.last10 ?? "");

      const statsStmt = db.prepare(`INSERT INTO season_stats (slot_id,player_id,stat_type,g,gs,w,l,sv,hd,ip,er,h_p,k_p,bb_p,era,whip,pa,ab,h_b,hr,rbi,sb,bb_b,k_b,avg_v,obp,slg,ops) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const [pid, stat] of Object.entries(season.stats ?? {})) {
        const r = _statsToRow(stat);
        if (r) statsStmt.run(slotId, pid, r.stat_type, r.g, r.gs, r.w, r.l, r.sv, r.hd,
          r.ip, r.er, r.h_p, r.k_p, r.bb_p, r.era, r.whip,
          r.pa, r.ab, r.h_b, r.hr, r.rbi, r.sb, r.bb_b, r.k_b, r.avg_v, r.obp, r.slg, r.ops);
      }

      const tevStmt = db.prepare(`INSERT INTO triggered_events (slot_id,event_id,last_week) VALUES (?,?,?)`);
      for (const [eid, lw] of Object.entries(season.triggeredEvents ?? {})) tevStmt.run(slotId, eid, lw);

      const paStmt = db.prepare(`INSERT INTO pending_actions (slot_id,sort_order,action_json) VALUES (?,?,?)`);
      for (let i = 0; i < (season.pendingActions ?? []).length; i++)
        paStmt.run(slotId, i, JSON.stringify(season.pendingActions[i]));

      const lschStmt = db.prepare(`INSERT INTO season_league_schedule (slot_id,league_id,schedule_id,week,home_team_id,away_team_id,is_protagonist_game,phase,result_json) VALUES (?,?,?,?,?,?,?,?,?)`);
      const lstandStmt = db.prepare(`INSERT INTO season_league_standings (slot_id,league_id,team_id,wins,losses,draws,win_pct,runs_for,runs_against,streak,last10) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const lstatsStmt = db.prepare(`INSERT INTO season_league_stats (slot_id,league_id,player_id,stat_type,g,gs,w,l,sv,hd,ip,er,h_p,k_p,bb_p,era,whip,pa,ab,h_b,hr,rbi,sb,bb_b,k_b,avg_v,obp,slg,ops) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

      for (const [lid, lsch] of Object.entries(season.leagueSchedules ?? {})) {
        for (const e of (lsch ?? []))
          lschStmt.run(slotId, lid, e.id, e.week, e.homeTeamId, e.awayTeamId,
            e.isProtagonistGame ? 1 : 0, e.phase, e.result ? JSON.stringify(e.result) : null);
      }
      for (const [lid, lst] of Object.entries(season.leagueState ?? {})) {
        for (const st of (lst.standings ?? []))
          lstandStmt.run(slotId, lid, st.teamId, st.wins, st.losses, st.draws, st.winPct,
            st.runsFor, st.runsAgainst, st.streak ?? "", st.last10 ?? "");
        for (const [pid, stat] of Object.entries(lst.stats ?? {})) {
          const r = _statsToRow(stat);
          if (r) lstatsStmt.run(slotId, lid, pid, r.stat_type, r.g, r.gs, r.w, r.l, r.sv, r.hd,
            r.ip, r.er, r.h_p, r.k_p, r.bb_p, r.era, r.whip,
            r.pa, r.ab, r.h_b, r.hr, r.rbi, r.sb, r.bb_b, r.k_b, r.avg_v, r.obp, r.slg, r.ops);
        }
      }
    }
  })();

  return {
    version: SLOT_SCHEMA_VERSION,
    slotMeta: { slotId, name, updatedAt, preview: { careerStage, seasonYear, currentWeek, teamId } },
    game, season,
  };
}

function dbLoadSlot(db, slotId) {
  const r = db.prepare("SELECT * FROM save_slots WHERE slot_id = ?").get(slotId);
  if (!r) return null;

  // protagonist
  const p = db.prepare("SELECT * FROM protagonist WHERE slot_id = ?").get(slotId);
  let game = null;
  if (p) {
    const contract   = db.prepare("SELECT * FROM protagonist_contract WHERE slot_id = ?").get(slotId);
    const pitches    = db.prepare("SELECT pitch_id,grade FROM protagonist_pitches WHERE slot_id = ? ORDER BY sort_order").all(slotId);
    const tags       = db.prepare("SELECT tag FROM protagonist_tags WHERE slot_id = ? ORDER BY sort_order").all(slotId).map((t) => t.tag);
    const xpRows     = db.prepare("SELECT stat_type,stat_key,xp_value FROM protagonist_xp WHERE slot_id = ?").all(slotId);
    const pitchingXP = {};
    const battingXP  = {};
    for (const x of xpRows) {
      if (x.stat_type === "pitching") pitchingXP[x.stat_key] = x.xp_value;
      else battingXP[x.stat_key] = x.xp_value;
    }
    const school     = db.prepare("SELECT * FROM protagonist_school WHERE slot_id = ?").get(slotId);
    const subjectRows = db.prepare("SELECT * FROM subject_scores WHERE slot_id = ?").all(slotId);
    const subjectScores = {};
    for (const ss of subjectRows)
      subjectScores[ss.subject_id] = { percentile: ss.percentile, attendance: ss.attendance, assignment: ss.assignment };

    const achievements = db.prepare("SELECT * FROM achievements WHERE slot_id = ?").all(slotId).map((a) => ({
      id: a.achievement_id, progress: a.progress,
      unlockedAt: a.unlocked_at ?? null, claimedAt: a.claimed_at ?? null,
      tracked: a.tracked != null ? Boolean(a.tracked) : undefined,
    }));
    const ametrics = db.prepare("SELECT * FROM achievement_metrics WHERE slot_id = ?").get(slotId);
    const mailbox  = db.prepare("SELECT * FROM mailbox WHERE slot_id = ? ORDER BY sort_order").all(slotId).map((m) => ({
      id: m.msg_id, category: m.category, sender: m.sender, subject: m.subject,
      preview: m.preview, body: m.body, createdAt: m.created_at, readAt: m.read_at ?? null,
      decision: m.decision_json ? JSON.parse(m.decision_json) : undefined,
    }));
    const contacts = db.prepare("SELECT * FROM contacts WHERE slot_id = ?").all(slotId).map((c) => ({
      id: c.contact_id, name: c.name, category: c.category, relation: c.relation,
      unlocked: Boolean(c.unlocked), affinity: c.affinity, lastActionWeek: c.last_action_week,
      chatHistory: c.chat_history_json ? JSON.parse(c.chat_history_json) : [],
      flags: c.flags_json ? JSON.parse(c.flags_json) : [],
    }));
    const recentLogs     = db.prepare("SELECT log_text FROM recent_logs WHERE slot_id = ? ORDER BY sort_order").all(slotId).map((l) => l.log_text);
    const recentUpcoming = db.prepare("SELECT upcoming_text FROM recent_upcoming WHERE slot_id = ? ORDER BY sort_order").all(slotId).map((u) => u.upcoming_text);

    // NPCs
    const npcRows    = db.prepare("SELECT * FROM npc_runtime WHERE slot_id = ?").all(slotId);
    const npcHistRows = db.prepare("SELECT * FROM npc_career_history WHERE slot_id = ? ORDER BY npc_id, sort_order").all(slotId);
    const npcAchRows  = db.prepare("SELECT * FROM npc_achievements WHERE slot_id = ? ORDER BY npc_id, sort_order").all(slotId);
    const npcHistMap  = {};
    const npcAchMap   = {};
    for (const h of npcHistRows) {
      if (!npcHistMap[h.npc_id]) npcHistMap[h.npc_id] = [];
      npcHistMap[h.npc_id].push({
        year: h.year, leagueId: h.league_id, teamId: h.team_id, statLine: h.stat_line,
        highlights: h.highlights_json ? JSON.parse(h.highlights_json) : [],
      });
    }
    for (const a of npcAchRows) {
      if (!npcAchMap[a.npc_id]) npcAchMap[a.npc_id] = [];
      npcAchMap[a.npc_id].push(a.achievement_text);
    }
    const npcs = npcRows.map((n) => ({
      npcId: n.npc_id, name: n.name, nameEn: n.name_en ?? undefined,
      playerType: n.player_type, position: n.position, age: n.age, grade: n.grade ?? undefined,
      schoolId: n.school_id, graduationYear: n.graduation_year,
      careerStatus: n.career_status, currentLeague: n.current_league, currentTeam: n.current_team,
      militaryStatus: n.military_status,
      militaryEnlistYear: n.military_enlist_year ?? undefined,
      militaryDischargeYear: n.military_discharge_year ?? undefined,
      proServiceYears: n.pro_service_years ?? 0,
      developmentRate: n.development_rate,
      pitching: n.pitch_ovr != null ? {
        ovr: n.pitch_ovr, stamina: n.pitch_stamina, velocity: n.pitch_velocity,
        command: n.pitch_command, control: n.pitch_control, movement: n.pitch_movement,
        mentality: n.pitch_mentality, recovery: n.pitch_recovery, clutch: n.pitch_clutch,
        holdRunners: n.pitch_hold_runners,
      } : undefined,
      batting: n.bat_ovr != null ? {
        ovr: n.bat_ovr, contact: n.bat_contact, power: n.bat_power, eye: n.bat_eye,
        discipline: n.bat_discipline, speed: n.bat_speed, baseInstinct: n.bat_base_instinct,
        bunting: n.bat_bunting, platoon: n.bat_platoon, fielding: n.bat_fielding,
        arm: n.bat_arm, battingClutch: n.bat_batting_clutch,
      } : undefined,
      careerHistory: npcHistMap[n.npc_id] ?? [],
      achievements:  npcAchMap[n.npc_id]  ?? [],
    }));

    const protagonist = {
      id: p.p_id, name: p.name, nameEn: p.name_en ?? undefined,
      careerStage: p.career_stage, leagueId: p.league_id, teamId: p.team_id,
      schoolId: p.school_id ?? undefined, grade: p.grade ?? undefined, age: p.age,
      playerType: p.player_type, position: p.position, handedness: p.handedness,
      pitchingForm: p.pitching_form ?? undefined, jerseyNumber: p.jersey_number,
      condition: p.condition, fatigue: p.fatigue, morale: p.morale,
      pitching: {
        ovr: p.pitch_ovr, stamina: p.pitch_stamina, velocity: p.pitch_velocity,
        command: p.pitch_command, control: p.pitch_control, movement: p.pitch_movement,
        mentality: p.pitch_mentality, recovery: p.pitch_recovery, clutch: p.pitch_clutch,
        holdRunners: p.pitch_hold_runners,
      },
      batting: {
        ovr: p.bat_ovr, contact: p.bat_contact, power: p.bat_power, eye: p.bat_eye,
        discipline: p.bat_discipline, speed: p.bat_speed, baseInstinct: p.bat_base_instinct,
        bunting: p.bat_bunting, platoon: p.bat_platoon, fielding: p.bat_fielding,
        arm: p.bat_arm, battingClutch: p.bat_batting_clutch,
      },
      primaryPosition: p.primary_position,
      positionRatings: p.position_ratings_json ? JSON.parse(p.position_ratings_json) : {},
      diligence: p.diligence, popularity: p.popularity,
      developmentRate: p.development_rate, potentialHidden: p.potential_hidden, growthPoints: p.growth_points,
      tags, pitchingXP, battingXP,
      pitches: pitches.map((e) => ({ id: e.pitch_id, grade: e.grade })),
      trainingPitchState: p.training_pitch_id ? { id: p.training_pitch_id, progress: p.training_pitch_progress } : undefined,
      money: p.money, fame: p.fame, scoutScore: p.scout_score, proServiceYears: p.pro_service_years,
      militaryUnit: p.military_unit ?? null,
      militaryServiceWeeks: p.military_service_weeks, militaryRecoveryWeeks: p.military_recovery_weeks,
      tradeAdaptationWeeks: p.trade_adaptation_weeks,
      faNegotiationRound: p.fa_negotiation_round, faUnsignedWeeks: p.fa_unsigned_weeks,
      consecutiveLowMoraleWeeks: p.consecutive_low_morale_weeks,
      consecutiveHighFatigueWeeks: p.consecutive_high_fatigue_weeks,
      injury: p.injury_type ? { type: p.injury_type, recoveryWeeksLeft: p.injury_recovery_weeks } : undefined,
      contract: contract ? {
        teamId: contract.team_id, leagueId: contract.league_id, salary: contract.salary,
        durationYears: contract.duration_years, remainingYears: contract.remaining_years,
        signingBonus: contract.signing_bonus, teamOptionYears: contract.team_option_years,
        playerOptionYears: contract.player_option_years, noTrade: Boolean(contract.no_trade),
        incentives: contract.incentives_json ? JSON.parse(contract.incentives_json) : undefined,
        status: contract.status,
      } : undefined,
    };

    const trainingPlan = {
      primaryProgramId:   p.training_primary   ?? null,
      secondaryProgramId: p.training_secondary ?? null,
      recoveryProgramId:  p.training_recovery  ?? null,
    };

    const schoolState = school ? {
      attendsUniversity: Boolean(school.attends_university),
      universityMajor: school.university_major,
      plannedUniversityMajors: school.planned_university_majors_json ? JSON.parse(school.planned_university_majors_json) : [],
      weeklyStudyMode: school.weekly_study_mode,
      examAccumScore: school.exam_accum_score, lastGrade: school.last_grade ?? null,
      lastGradeRisk: school.last_grade_risk,
      eligibilityBlocked: Boolean(school.eligibility_blocked),
      warningCount: school.warning_count,
      careerChoiceTriggered: Boolean(school.career_choice_triggered),
      draftTriggered: Boolean(school.draft_triggered),
      draftIntent: Boolean(school.draft_intent),
      careerApplicationsSubmitted: Boolean(school.career_applications_submitted),
      fallbackSelectionPending: Boolean(school.fallback_selection_pending),
      fallbackUniversityChoices: school.fallback_university_choices_json ? JSON.parse(school.fallback_university_choices_json) : [],
      fallbackIndependentChoices: school.fallback_independent_choices_json ? JSON.parse(school.fallback_independent_choices_json) : [],
      fallbackUniversityPassed: school.fallback_university_passed_json ? JSON.parse(school.fallback_university_passed_json) : [],
      fallbackIndependentPassed: school.fallback_independent_passed_json ? JSON.parse(school.fallback_independent_passed_json) : [],
      fallbackSportsMilitaryPassed: Boolean(school.fallback_sports_military_passed),
      fallbackDraftPassed: Boolean(school.fallback_draft_passed),
      fallbackDraftTeamId: school.fallback_draft_team_id ?? null,
      fallbackDraftRound: school.fallback_draft_round ?? null,
      fallbackDraftPick: school.fallback_draft_pick ?? null,
      fallbackDraftSigningBonus: school.fallback_draft_signing_bonus ?? 0,
      careerChoicePopupOpened: Boolean(school.career_choice_popup_opened),
      careerChoiceMode: school.career_choice_mode,
      careerChoiceConfirmed: Boolean(school.career_choice_confirmed),
      careerChoiceUniversityApplications: school.career_choice_univ_apps_json ? JSON.parse(school.career_choice_univ_apps_json) : [],
      careerChoiceIndependentApplications: school.career_choice_ind_apps_json ? JSON.parse(school.career_choice_ind_apps_json) : [],
      careerDraftPickLog: school.career_draft_pick_log_json ? JSON.parse(school.career_draft_pick_log_json) : [],
      careerFinalChoice: school.career_final_choice,
      universityWeek: school.university_week, majorSelected: Boolean(school.major_selected),
      subjectScores,
    } : null;

    game = {
      version: p.game_version, savedAt: p.saved_at,
      protagonist, mailbox, trainingPlan, schoolState,
      achievements,
      achievementMetrics: ametrics ? {
        strikeoutTotal: ametrics.strikeout_total, saveTotal: ametrics.save_total,
        kakaoFirstContact: Boolean(ametrics.kakao_first_contact),
        trainingWeeksTotal: ametrics.training_weeks_total, gamesWonTotal: ametrics.games_won_total,
      } : null,
      contacts, recentLogs, recentUpcoming, npcs,
    };
  }

  // season
  const sm = db.prepare("SELECT * FROM season_meta WHERE slot_id = ?").get(slotId);
  let season = null;
  if (sm) {
    const schedule  = db.prepare("SELECT * FROM season_schedule WHERE slot_id = ? ORDER BY week, schedule_id").all(slotId).map((e) => ({
      id: e.schedule_id, week: e.week, leagueId: e.league_id ?? undefined,
      homeTeamId: e.home_team_id, awayTeamId: e.away_team_id,
      isProtagonistGame: Boolean(e.is_protagonist_game), phase: e.phase,
      result: e.result_json ? JSON.parse(e.result_json) : undefined,
    }));
    const standings = db.prepare("SELECT * FROM season_standings WHERE slot_id = ?").all(slotId).map((s) => ({
      teamId: s.team_id, wins: s.wins, losses: s.losses, draws: s.draws, winPct: s.win_pct,
      runsFor: s.runs_for, runsAgainst: s.runs_against, streak: s.streak, last10: s.last10,
    }));
    const stats = {};
    for (const row of db.prepare("SELECT * FROM season_stats WHERE slot_id = ?").all(slotId))
      stats[row.player_id] = _rowToStats(row);

    const triggeredEvents = {};
    for (const e of db.prepare("SELECT * FROM triggered_events WHERE slot_id = ?").all(slotId))
      triggeredEvents[e.event_id] = e.last_week;

    const pendingActions = db.prepare("SELECT action_json FROM pending_actions WHERE slot_id = ? ORDER BY sort_order").all(slotId).map((p) => JSON.parse(p.action_json));

    const leagueSchedules = {};
    for (const e of db.prepare("SELECT * FROM season_league_schedule WHERE slot_id = ? ORDER BY league_id, week, schedule_id").all(slotId)) {
      if (!leagueSchedules[e.league_id]) leagueSchedules[e.league_id] = [];
      leagueSchedules[e.league_id].push({
        id: e.schedule_id, week: e.week, homeTeamId: e.home_team_id, awayTeamId: e.away_team_id,
        isProtagonistGame: Boolean(e.is_protagonist_game), phase: e.phase,
        result: e.result_json ? JSON.parse(e.result_json) : undefined,
      });
    }
    const leagueState = {};
    for (const s of db.prepare("SELECT * FROM season_league_standings WHERE slot_id = ?").all(slotId)) {
      if (!leagueState[s.league_id]) leagueState[s.league_id] = { standings: [], stats: {} };
      leagueState[s.league_id].standings.push({
        teamId: s.team_id, wins: s.wins, losses: s.losses, draws: s.draws, winPct: s.win_pct,
        runsFor: s.runs_for, runsAgainst: s.runs_against, streak: s.streak, last10: s.last10,
      });
    }
    for (const row of db.prepare("SELECT * FROM season_league_stats WHERE slot_id = ?").all(slotId)) {
      if (!leagueState[row.league_id]) leagueState[row.league_id] = { standings: [], stats: {} };
      leagueState[row.league_id].stats[row.player_id] = _rowToStats(row);
    }

    season = {
      version: sm.version, savedAt: sm.saved_at,
      leagueId: sm.league_id, seasonYear: sm.season_year,
      currentWeek: sm.current_week, totalWeeks: sm.total_weeks,
      pendingActions, schedule, standings, stats, triggeredEvents, leagueSchedules, leagueState,
    };
  }

  return {
    version: SLOT_SCHEMA_VERSION,
    slotMeta: {
      slotId: r.slot_id, name: r.name, updatedAt: r.updated_at,
      preview: { careerStage: r.career_stage, seasonYear: r.season_year, currentWeek: r.current_week, teamId: r.team_id },
    },
    game, season,
  };
}

function masterRowToEntityRow(r) {
  const player = {
    playerType:      r.player_type    ?? "player",
    handedness:      r.handedness     ?? "R",
    position:        r.position       ?? "",
    jerseyNumber:    r.jersey_number  ?? 18,
    primaryPosition: r.primary_position ?? undefined,
    positionRatings: r.position_ratings_json ? JSON.parse(r.position_ratings_json) : undefined,
    diligence:       r.diligence      ?? undefined,
    popularity:      r.popularity     ?? undefined,
    developmentRate: r.development_rate ?? 60,
    potentialHidden: r.potential_hidden ?? 60,
    pitching: r.pitch_ovr != null ? {
      ovr: r.pitch_ovr, stamina: r.pitch_stamina, velocity: r.pitch_velocity,
      command: r.pitch_command, control: r.pitch_control, movement: r.pitch_movement,
      mentality: r.pitch_mentality, recovery: r.pitch_recovery, clutch: r.pitch_clutch,
      holdRunners: r.pitch_hold_runners,
    } : null,
    batting: r.bat_ovr != null ? {
      ovr: r.bat_ovr, contact: r.bat_contact, power: r.bat_power, eye: r.bat_eye,
      discipline: r.bat_discipline, speed: r.bat_speed, baseInstinct: r.bat_base_instinct,
      bunting: r.bat_bunting, platoon: r.bat_platoon, fielding: r.bat_fielding,
      arm: r.bat_arm, battingClutch: r.bat_clutch,
    } : null,
  };
  const staffData = r.staff_json ? JSON.parse(r.staff_json) : {};
  return {
    id: r.id, name: r.name, nameEn: r.name_en ?? undefined,
    role: r.role ?? "player", age: r.age ?? 18,
    status: r.status ?? "active",
    originLeagueId: r.origin_league_id ?? "",
    leagueId: r.league_id ?? "", clubId: r.club_id ?? "",
    teamId: r.team_id ?? "", schoolId: r.school_id ?? "",
    grade: r.grade ?? undefined, notes: r.notes ?? "",
    details: {
      player,
      coach:   staffData.coach   ?? null,
      manager: staffData.manager ?? null,
      owner:   staffData.owner   ?? null,
    },
  };
}

function migrateOldDb(newDb, oldDbPath) {
  if (!fs.existsSync(oldDbPath)) return;
  let oldDb;
  try {
    oldDb = new Database(oldDbPath, { readonly: true });
    const hasSaveSlots = oldDb.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='save_slots'").get().c > 0;
    if (!hasSaveSlots) { oldDb.close(); return; }
    const hasGameJson = oldDb.prepare("SELECT COUNT(*) as c FROM pragma_table_info('save_slots') WHERE name='game_json'").get().c > 0;
    if (!hasGameJson) { oldDb.close(); return; }
    const slots = oldDb.prepare("SELECT * FROM save_slots").all();
    for (const slot of slots) {
      if (newDb.prepare("SELECT 1 FROM save_slots WHERE slot_id = ?").get(slot.slot_id)) continue;
      try {
        const game   = slot.game_json   ? JSON.parse(slot.game_json)   : null;
        const season = slot.season_json ? JSON.parse(slot.season_json) : null;
        dbSaveSlot(newDb, slot.slot_id, game, season);
        if (slot.name) newDb.prepare("UPDATE save_slots SET name = ? WHERE slot_id = ?").run(slot.name, slot.slot_id);
        console.log(`[db-migrate] slot ${slot.slot_id} 이전 완료`);
      } catch (e) {
        console.warn(`[db-migrate] slot ${slot.slot_id} 실패:`, e.message);
      }
    }
    oldDb.close();
  } catch (e) {
    console.warn("[db-migrate] 구 DB 마이그레이션 오류:", e.message);
    try { oldDb?.close(); } catch { /* ignore */ }
  }
}

app.whenReady().then(() => {
  const resourceBase = path.resolve(__dirname, "../../resource/data/master");
  const masterDbPath = path.resolve(__dirname, "../../resource/master.db");
  const rootDir      = path.resolve(__dirname, "../../");
  const tuningSchema = loadTuningSchema(resourceBase);
  const userDataDir  = app.getPath("userData");
  const savesDir     = path.join(userDataDir, "saves");
  const dbPath       = path.join(savesDir, "projectb_v2.db");
  const oldDbPath    = path.join(savesDir, "projectb.db");

  const db = openDatabase(dbPath);
  migrateOldDb(db, oldDbPath);

  // master.db (read-only)
  let masterDb = null;
  try {
    if (fs.existsSync(masterDbPath)) {
      masterDb = new Database(masterDbPath, { readonly: true });
      masterDb.pragma("journal_mode = WAL");
    }
  } catch (e) {
    console.warn("[master.db] 열기 실패:", e.message);
  }

  applyTuningFromFile(resourceBase, tuningSchema).then((res) => {
    if (!res.ok) console.warn("[tuning] invalid tuning file. fallback to defaults.", res.errors);
  }).catch((e) => {
    console.warn("[tuning] failed to load tuning file. fallback to defaults.", e);
  });

  ipcMain.handle("match:start", async (_event, request = {}) => {
    const core = await loadCoreModule();
    let state = core.startMatch(request);

    // RP/CP: 등판 트리거 충족 시점까지 자동 시뮬
    if (!state.protagonistHasEntered) {
      state = core.autoSimulateUntilEntry(state);
    }

    // protagonist_pitch 시점까지 자동 진행 (SP AWAY 등 첫 이닝이 타격 half인 경우 처리)
    let guard = 0;
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
      } else if (phase.phase === "post_exit_sim") {
        state = core.autoSimulateToGameEnd(state);
        break;
      } else {
        break;
      }
    }

    activeMatchState = state;
    return { snapshot: toSnapshotDto(activeMatchState, [], core) };
  });

  ipcMain.handle("match:step", async (_event, decision) => {
    const core = await loadCoreModule();
    if (!activeMatchState) activeMatchState = core.startMatch({});
    if (!core.isProtagonistPitching(activeMatchState)) {
      return { snapshot: toSnapshotDto(activeMatchState, [], core), outcome: null };
    }
    const result = core.stepPitch(activeMatchState, decision);
    activeMatchState = result.nextState;
    // 강판 조건이 충족됐으면 즉시 적용 (mid-inning 강판 시 state 일관성 유지)
    const nextPhase = core.advanceGamePhase(activeMatchState);
    if (nextPhase.phase === "protagonist_exit") {
      activeMatchState = nextPhase.state;
    }
    // 감독 자동 마운드 방문 체크
    if (!activeMatchState.isFinished && !activeMatchState.protagonistExited) {
      activeMatchState = core.autoMoundVisitIfNeeded(activeMatchState);
    }
    return { snapshot: toSnapshotDto(activeMatchState, [], core), outcome: result.outcome };
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
    // protagonist_pitch / game_over: 상태 변경 없음

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
    return { snapshot: toSnapshotDto(activeMatchState, [], core), summary: result.summary };
  });

  ipcMain.handle("match:mound-visit", async () => {
    const core = await loadCoreModule();
    if (!activeMatchState) return null;
    activeMatchState = core.requestMoundVisit(activeMatchState);
    return { snapshot: toSnapshotDto(activeMatchState, [], core) };
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
      const result = db.prepare("UPDATE save_slots SET name = ?, updated_at = ? WHERE slot_id = ?")
        .run(name, new Date().toISOString(), slotId);
      if (result.changes === 0) throw new Error("slot not found");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("stats:queryCareerHistory", (_event, payload) => {
    try {
      const slotId = String(payload?.slotId ?? DEFAULT_SLOT_ID);
      const npcId  = payload?.npcId ?? null;
      const year   = payload?.year  ?? null;
      const limit  = Math.min(500, Math.max(1, Number(payload?.limit ?? 200)));
      let sql = "SELECT npc_id, npc_name_ref.name as npc_name, year, league_id, team_id, stat_line FROM npc_career_history LEFT JOIN (SELECT npc_id as ref_npc, name as npc_name_ref FROM npc_runtime WHERE slot_id = ?) npc_name_ref ON npc_career_history.npc_id = npc_name_ref.ref_npc WHERE npc_career_history.slot_id = ?";
      let sql2 = `SELECT h.npc_id, r.name as npc_name, h.year, h.league_id, h.team_id, h.stat_line FROM npc_career_history h LEFT JOIN npc_runtime r ON h.slot_id = r.slot_id AND h.npc_id = r.npc_id WHERE h.slot_id = ?`;
      const params = [slotId];
      if (npcId) { sql2 += " AND h.npc_id = ?"; params.push(npcId); }
      if (year)  { sql2 += " AND h.year = ?";   params.push(year); }
      sql2 += " ORDER BY h.year DESC LIMIT ?";
      params.push(limit);
      return db.prepare(sql2).all(...params).map((r) => ({
        npcId: r.npc_id, name: r.npc_name ?? "",
        year: r.year, leagueId: r.league_id, teamId: r.team_id, statLine: r.stat_line,
      }));
    } catch (e) {
      console.error("[stats:queryCareerHistory] 오류:", e);
      return [];
    }
  });

  ipcMain.handle("day:advance", async (_event, coreState) => {
    const core = await loadCoreModule();
    const result = core.advanceDay(coreState);
    return { snapshot: result.nextState, logs: result.logs };
  });

  ipcMain.handle("master:fetch", (_event, relPath) => {
    try {
      const fullPath = path.resolve(resourceBase, relPath);
      if (!isPathInside(fullPath, resourceBase)) throw new Error(`invalid master path: ${relPath}`);
      return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (e) {
      console.error("[master:fetch] 로드 실패:", relPath, e);
      return null;
    }
  });

  ipcMain.handle("master:save", (_event, payload) => {
    try {
      const relPath = payload?.relPath;
      const data    = payload?.data;
      const backup  = payload?.backup !== false;
      if (typeof relPath !== "string" || !relPath.trim()) throw new Error("relPath is required");
      const fullPath = path.resolve(resourceBase, relPath);
      if (!isPathInside(fullPath, resourceBase)) throw new Error(`invalid master path: ${relPath}`);
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

  // master.db에서 leagueId로 entity 일괄 조회
  ipcMain.handle("master:loadEntities", (_event, leagueId) => {
    if (!masterDb) return [];
    try {
      const rows = typeof leagueId === "string" && leagueId
        ? masterDb.prepare("SELECT * FROM npc_master WHERE league_id = ?").all(leagueId)
        : masterDb.prepare("SELECT * FROM npc_master").all();
      return rows.map(masterRowToEntityRow);
    } catch (e) {
      console.error("[master:loadEntities] 오류:", e);
      return [];
    }
  });

  ipcMain.handle("tuning:load", async () => {
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
    const tuning = payload?.tuning ?? payload;
    const validate = validateMatchEngineTuning(tuning, tuningSchema);
    return { ok: validate.ok, errors: validate.errors };
  });

  ipcMain.handle("tuning:save", async (_event, payload) => {
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

  _mainWindow = createWindow();

  if (process.env.VITE_DEV_SERVER_URL) {
    startContentWatcher(resourceBase, rootDir);
    console.log("[content-watcher] 활성화 (events / achievements / characters / entities/players)");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) _mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

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
