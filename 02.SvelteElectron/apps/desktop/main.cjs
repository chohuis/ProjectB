const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const engineNative  = require("../../packages/engine-native");
const { app, BrowserWindow, ipcMain, session, protocol, net } = require("electron");
const Database = require("better-sqlite3");

const {
  SLOT_SCHEMA_VERSION, DEFAULT_SLOT_ID,
  openDatabase, applySchemaPatches,
  dbListSlots, dbSaveSlot, dbLoadSlot,
  masterRowToEntityRow, migrateOldDb,
} = require("./ipc/db.cjs");
const matchIpc   = require("./ipc/match.cjs");
const saveIpc    = require("./ipc/save.cjs");
const tuningIpc  = require("./ipc/tuning.cjs");

// ── asarUnpack 경로 헬퍼 ─────────────────────────────────────────
function unpackedPath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
  }
  return path.resolve(__dirname, "../..", ...segments);
}

let coreModulePromise = null;
const tuningSchemaRelPath = "balance/match_engine_tuning.schema.json";

function loadCoreModule() {
  if (!coreModulePromise) {
    const coreDistPath = unpackedPath("packages", "core", "dist", "index.js");
    coreModulePromise = Promise.resolve().then(() => {
      const core = require(coreDistPath);
      if (typeof core.setNativeEngine === "function") {
        core.setNativeEngine(engineNative);
      }
      if (typeof core.setNpcSimEngine === "function") {
        core.setNpcSimEngine(engineNative);
      }
      return core;
    });
  }
  return coreModulePromise;
}

function isPathInside(target, base) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

// ── 세이브 무결성 + 암호화 (Rust 바이너리 내부 키) ──────────────────────────
function computeSig(data) {
  return engineNative.computeSaveSig(data);
}

function signSlot(db, slotId, game, season) {
  const plaintext = JSON.stringify({ game: game ?? null, season: season ?? null });
  const encrypted = engineNative.encryptSaveNative(plaintext);
  const sig = computeSig(encrypted);
  db.prepare(`
    INSERT INTO save_integrity (slot_id, snapshot, sig, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slot_id) DO UPDATE SET
      snapshot=excluded.snapshot, sig=excluded.sig, updated_at=excluded.updated_at
  `).run(slotId, encrypted, sig, new Date().toISOString());
}

function verifySlot(db, slotId) {
  const row = db.prepare("SELECT snapshot, sig FROM save_integrity WHERE slot_id = ?").get(slotId);
  if (!row) return { ok: true, missing: true };
  if (computeSig(row.snapshot) !== row.sig) return { ok: false, reason: "sig_mismatch" };
  const plaintext = engineNative.decryptSaveNative(row.snapshot);
  if (!plaintext) return { ok: false, reason: "decrypt_failed" };
  return { ok: true, plaintext };
}

// ── 마스터 데이터 체크섬 (SHA-256) ──────────────────────────────────────────
async function checkMasterIntegrity(masterDbPath, userDataDir) {
  const checksumFile = path.join(userDataDir, "master_checksum.json");
  try {
    if (!fs.existsSync(masterDbPath)) return;
    const buf = await fs.promises.readFile(masterDbPath);
    const currentHash = createHash("sha256").update(buf).digest("hex");
    if (fs.existsSync(checksumFile)) {
      const stored = JSON.parse(await fs.promises.readFile(checksumFile, "utf8"));
      if (stored.hash !== currentHash) {
        console.warn("[integrity] master.db 체크섬 불일치 — 파일이 변경되었습니다.");
        console.warn(`  이전: ${stored.hash}`);
        console.warn(`  현재: ${currentHash}`);
      }
    }
    await fs.promises.writeFile(
      checksumFile,
      JSON.stringify({ hash: currentHash, updatedAt: new Date().toISOString() }),
      "utf8",
    );
  } catch (e) {
    console.warn("[integrity] 마스터 체크섬 처리 실패:", e.message);
  }
}

function loadTuningSchema(resourceBase) {
  const fullPath = path.resolve(resourceBase, tuningSchemaRelPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw);
}

function createWindow() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1200, minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? /^http:\/\/localhost:5173/ : /^app:\/\/bundle\//;
    if (!allowed.test(url)) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (!isDev) {
    win.webContents.on("devtools-opened", () => win.webContents.closeDevTools());
  }

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL("app://bundle/index.html");
  }
  return win;
}

let _watchDebounceTimer = null;
let _mainWindow = null;

function startContentWatcher(resourceBase, rootDir) {
  const watchDirs = ["events", "achievements", "characters"];
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

// app.ready 이전에 호출 필수
protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
}]);

app.whenReady().then(() => {
  const isDev        = !!process.env.VITE_DEV_SERVER_URL;
  const resourceBase = unpackedPath("resource", "data", "master");
  const masterDbPath = unpackedPath("resource", "master.db");
  const rootDir      = path.resolve(__dirname, "../../");
  const tuningSchema = loadTuningSchema(resourceBase);
  const userDataDir  = app.getPath("userData");
  const savesDir     = path.join(userDataDir, "saves");
  const dbPath       = path.join(savesDir, "projectb_v2.db");
  const oldDbPath    = path.join(savesDir, "projectb.db");

  const db = openDatabase(dbPath);
  applySchemaPatches(db);
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

  const masterOverlayDbPath = path.join(savesDir, "master_overlay.db");
  const masterOverlayDb = new Database(masterOverlayDbPath);
  masterOverlayDb.pragma("journal_mode = WAL");

  // ── entity_overlay 스키마 설정 + 멀티슬롯 마이그레이션 ──────────────────────
  {
    const overlayTableExists = masterOverlayDb.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='entity_overlay'"
    ).get()?.c > 0;

    if (!overlayTableExists) {
      masterOverlayDb.exec(`
        CREATE TABLE entity_overlay (
          slot_id      TEXT NOT NULL,
          id           TEXT NOT NULL,
          league_id    TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at   TEXT NOT NULL,
          PRIMARY KEY (slot_id, id)
        );
        CREATE INDEX idx_entity_overlay_slot_league ON entity_overlay(slot_id, league_id);
        CREATE TABLE entity_overlay_deleted (
          slot_id    TEXT NOT NULL,
          id         TEXT NOT NULL,
          league_id  TEXT,
          deleted_at TEXT NOT NULL,
          PRIMARY KEY (slot_id, id)
        );
        CREATE INDEX idx_entity_overlay_deleted_slot ON entity_overlay_deleted(slot_id);
      `);
    } else {
      const hasSlotId = masterOverlayDb.prepare(
        "SELECT COUNT(*) as c FROM pragma_table_info('entity_overlay') WHERE name='slot_id'"
      ).get()?.c > 0;

      if (!hasSlotId) {
        // 기존 설치: slot_id 없는 테이블 → 기본 슬롯 'A'로 마이그레이션
        masterOverlayDb.transaction(() => {
          masterOverlayDb.exec(`
            ALTER TABLE entity_overlay RENAME TO _entity_overlay_old;
            ALTER TABLE entity_overlay_deleted RENAME TO _entity_overlay_deleted_old;

            CREATE TABLE entity_overlay (
              slot_id TEXT NOT NULL, id TEXT NOT NULL, league_id TEXT NOT NULL,
              payload_json TEXT NOT NULL, updated_at TEXT NOT NULL,
              PRIMARY KEY (slot_id, id)
            );
            CREATE INDEX idx_entity_overlay_slot_league ON entity_overlay(slot_id, league_id);

            CREATE TABLE entity_overlay_deleted (
              slot_id TEXT NOT NULL, id TEXT NOT NULL,
              league_id TEXT, deleted_at TEXT NOT NULL,
              PRIMARY KEY (slot_id, id)
            );
            CREATE INDEX idx_entity_overlay_deleted_slot ON entity_overlay_deleted(slot_id);

            INSERT OR IGNORE INTO entity_overlay (slot_id, id, league_id, payload_json, updated_at)
              SELECT 'A', id, league_id, payload_json, updated_at FROM _entity_overlay_old;
            INSERT OR IGNORE INTO entity_overlay_deleted (slot_id, id, league_id, deleted_at)
              SELECT 'A', id, league_id, deleted_at FROM _entity_overlay_deleted_old;

            DROP TABLE _entity_overlay_old;
            DROP TABLE _entity_overlay_deleted_old;
          `);
        })();
        console.log("[master_overlay] slot_id 마이그레이션 완료 (기본 슬롯 A)");
      }
    }
  }

  if (!isDev) checkMasterIntegrity(masterDbPath, userDataDir).catch((e) => {
    console.warn("[integrity] 체크섬 비동기 처리 실패:", e);
  });

  tuningIpc.applyTuningFromFile(resourceBase, tuningSchema, loadCoreModule).then((res) => {
    if (!res.ok) console.warn("[tuning] invalid tuning file. fallback to defaults.", res.errors);
  }).catch((e) => {
    console.warn("[tuning] failed to load tuning file. fallback to defaults.", e);
  });

  // ── domain IPC 등록 ──────────────────────────────────────────────────────────
  matchIpc.register(ipcMain, { loadCoreModule, engineNative });
  saveIpc.register(ipcMain, { db, dbListSlots, dbLoadSlot, dbSaveSlot, signSlot, verifySlot, DEFAULT_SLOT_ID, loadCoreModule, masterOverlayDb });
  tuningIpc.register(ipcMain, { isDev, resourceBase, tuningSchema, loadCoreModule, isPathInside });

  // ── master:* ─────────────────────────────────────────────────────────────────
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

  ipcMain.handle("master:loadEntities", (_event, leagueId, seasonYear) => {
    try {
      // NPC 런타임 상태는 npc_runtime(projectb_v2.db)에서 관리; master.db는 read-only 마스터 데이터
      const sy = typeof seasonYear === "number" ? seasonYear : 9999;
      const baseRows = masterDb
        ? (typeof leagueId === "string" && leagueId
            ? masterDb.prepare(`SELECT * FROM npc_master WHERE league_id = ? AND (entry_year IS NULL OR entry_year <= ?)`).all(leagueId, sy)
            : masterDb.prepare(`SELECT * FROM npc_master WHERE entry_year IS NULL OR entry_year <= ?`).all(sy))
        : [];
      return baseRows.map(masterRowToEntityRow);
    } catch (e) {
      console.error("[master:loadEntities] error:", e);
      return [];
    }
  });

  ipcMain.handle("master:upsertEntity", (_event, payload) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload is required");
      const slotId   = String(payload.slotId   ?? DEFAULT_SLOT_ID).trim();
      const id       = String(payload.id       ?? "").trim();
      const leagueId = String(payload.leagueId ?? "").trim();
      if (!id)       throw new Error("id is required");
      if (!leagueId) throw new Error("leagueId is required");
      const now = new Date().toISOString();
      const { slotId: _sid, ...entityData } = payload;
      masterOverlayDb.prepare(`
        INSERT INTO entity_overlay (slot_id, id, league_id, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(slot_id, id) DO UPDATE SET
          league_id=excluded.league_id,
          payload_json=excluded.payload_json,
          updated_at=excluded.updated_at
      `).run(slotId, id, leagueId, JSON.stringify(entityData), now);
      masterOverlayDb.prepare(
        "DELETE FROM entity_overlay_deleted WHERE slot_id = ? AND id = ?"
      ).run(slotId, id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("master:deleteEntity", (_event, payload) => {
    try {
      const slotId   = String(payload?.slotId   ?? DEFAULT_SLOT_ID).trim();
      const id       = String(payload?.id       ?? "").trim();
      const leagueId = payload?.leagueId ? String(payload.leagueId).trim() : null;
      if (!id) throw new Error("id is required");
      masterOverlayDb.prepare(
        "DELETE FROM entity_overlay WHERE slot_id = ? AND id = ?"
      ).run(slotId, id);
      masterOverlayDb.prepare(`
        INSERT INTO entity_overlay_deleted (slot_id, id, league_id, deleted_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slot_id, id) DO UPDATE SET
          league_id=excluded.league_id,
          deleted_at=excluded.deleted_at
      `).run(slotId, id, leagueId, new Date().toISOString());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("master:bulkUpsertEntities", (_event, payload) => {
    try {
      if (!payload || typeof payload !== "object") throw new Error("payload is required");
      const slotId   = String(payload.slotId ?? DEFAULT_SLOT_ID).trim();
      const entities = Array.isArray(payload.entities) ? payload.entities : [];
      if (entities.length === 0) return JSON.stringify({ ok: true, count: 0 });
      const now = new Date().toISOString();
      const upsert = masterOverlayDb.prepare(`
        INSERT INTO entity_overlay (slot_id, id, league_id, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(slot_id, id) DO UPDATE SET
          league_id=excluded.league_id,
          payload_json=excluded.payload_json,
          updated_at=excluded.updated_at
      `);
      const undelete = masterOverlayDb.prepare(
        "DELETE FROM entity_overlay_deleted WHERE slot_id = ? AND id = ?"
      );
      const runBulk = masterOverlayDb.transaction((rows) => {
        for (const e of rows) {
          const id       = String(e.id       ?? "").trim();
          const leagueId = String(e.leagueId ?? "").trim();
          if (!id || !leagueId) continue;
          upsert.run(slotId, id, leagueId, JSON.stringify(e), now);
          undelete.run(slotId, id);
        }
      });
      runBulk(entities);
      return JSON.stringify({ ok: true, count: entities.length });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // ── NPC 시뮬 IPC ─────────────────────────────────────────────────────────────
  ipcMain.handle("npc:simGame", (_event, paramsJson) => {
    try { return engineNative.simGameNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:calcWeeklyGrowth", (_event, p) => {
    try { return engineNative.npcCalcWeeklyGrowth(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:runOffseason", (_event, paramsJson) => {
    try { return engineNative.runOffseasonNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:advanceGrades", (_event, paramsJson) => {
    try { return engineNative.advanceGradesNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:generateFreshmen", (_event, paramsJson) => {
    try { return engineNative.generateFreshmenNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:runDraft", (_event, paramsJson) => {
    try { return engineNative.runDraftNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:applyDraft", (_event, paramsJson) => {
    try { return engineNative.applyDraftNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:bgHsGraduateDraft", (_event, paramsJson) => {
    try { return engineNative.bgHsGraduateDraftNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:determineProtagonistDraft", (_event, paramsJson) => {
    try { return engineNative.determineProtagonistDraftNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:advanceProtagonistGrade", (_event, paramsJson) => {
    try { return engineNative.advanceProtagonistGradeNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:advanceAllGrades", (_event, paramsJson) => {
    try { return engineNative.advanceAllGradesNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:advanceAllAges", (_event, paramsJson) => {
    try { return engineNative.advanceAllAgesNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── NPC 경기 기록 IPC ─────────────────────────────────────────────────────────
  ipcMain.handle("npc:bulkInsertGameLogs", (_event, p) => {
    try {
      const { slotId, season, week, logs } = JSON.parse(p);
      if (!slotId || !Array.isArray(logs) || logs.length === 0)
        return JSON.stringify({ ok: true, inserted: 0 });
      const stmt = db.prepare(
        "INSERT INTO npc_game_log(slot_id, npc_id, season, week, role, stat_json) VALUES(?,?,?,?,?,?)"
      );
      const insertMany = db.transaction((rows) => {
        for (const r of rows)
          stmt.run(slotId, r.npcId, season, week, r.role, r.statJson);
      });
      insertMany(logs);
      return JSON.stringify({ ok: true, inserted: logs.length });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:trimGameLogs", (_event, p) => {
    try {
      const { slotId, keep = 5 } = JSON.parse(p);
      db.prepare(`
        DELETE FROM npc_game_log
        WHERE slot_id = ? AND id NOT IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY slot_id, npc_id
                ORDER BY season DESC, week DESC, id DESC
              ) AS rn
            FROM npc_game_log WHERE slot_id = ?
          ) WHERE rn <= ?
        )
      `).run(slotId, slotId, keep);
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:getRecentGames", (_event, p) => {
    try {
      const { slotId, npcId, limit = 5 } = JSON.parse(p);
      const rows = db.prepare(`
        SELECT season, week, role, stat_json
        FROM npc_game_log
        WHERE slot_id = ? AND npc_id = ?
        ORDER BY season DESC, week DESC, id DESC
        LIMIT ?
      `).all(slotId, npcId, limit);
      return JSON.stringify(rows);
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:flushSeasonStats", (_event, p) => {
    try {
      const { slotId, season, leagueId, statsByPlayer } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT INTO npc_season_stats
          (slot_id, npc_id, season, league_id, role,
           games, wins, losses, saves, holds,
           ip, er, hits_allowed, strikeouts, walks, pitch_count,
           at_bats, hits, home_runs, rbi, walks_bat, strikeouts_bat, stolen_bases)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(slot_id, npc_id, season, league_id) DO UPDATE SET
          games=excluded.games, wins=excluded.wins, losses=excluded.losses,
          saves=excluded.saves, holds=excluded.holds,
          ip=excluded.ip, er=excluded.er, hits_allowed=excluded.hits_allowed,
          strikeouts=excluded.strikeouts, walks=excluded.walks, pitch_count=excluded.pitch_count,
          at_bats=excluded.at_bats, hits=excluded.hits, home_runs=excluded.home_runs,
          rbi=excluded.rbi, walks_bat=excluded.walks_bat,
          strikeouts_bat=excluded.strikeouts_bat, stolen_bases=excluded.stolen_bases
      `);
      const flush = db.transaction((entries) => {
        for (const [npcId, s] of entries) {
          stmt.run(
            slotId, npcId, season, leagueId, s.role,
            s.games ?? 0, s.wins ?? 0, s.losses ?? 0, s.saves ?? 0, s.holds ?? 0,
            s.ip ?? 0, s.er ?? 0, s.hitsAllowed ?? 0, s.strikeouts ?? 0, s.walks ?? 0, s.pitchCount ?? 0,
            s.atBats ?? 0, s.hits ?? 0, s.homeRuns ?? 0, s.rbi ?? 0,
            s.walksBat ?? 0, s.strikeoutsBat ?? 0, s.stolenBases ?? 0,
          );
        }
      });
      flush(Object.entries(statsByPlayer));
      return JSON.stringify({ ok: true, flushed: Object.keys(statsByPlayer).length });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:getCareerStats", (_event, p) => {
    try {
      const { slotId, npcId } = JSON.parse(p);
      const seasons = db.prepare(`
        SELECT season, league_id, role,
               games, wins, losses, saves, holds,
               ip, er, hits_allowed, strikeouts, walks, pitch_count,
               at_bats, hits, home_runs, rbi, walks_bat, strikeouts_bat, stolen_bases
        FROM npc_season_stats
        WHERE slot_id = ? AND npc_id = ?
        ORDER BY season ASC
      `).all(slotId, npcId);
      const totals = db.prepare(`
        SELECT role,
               SUM(games) AS games, SUM(wins) AS wins, SUM(losses) AS losses,
               SUM(saves) AS saves, SUM(holds) AS holds,
               SUM(ip) AS ip, SUM(er) AS er, SUM(hits_allowed) AS hits_allowed,
               SUM(strikeouts) AS strikeouts, SUM(walks) AS walks, SUM(pitch_count) AS pitch_count,
               SUM(at_bats) AS at_bats, SUM(hits) AS hits, SUM(home_runs) AS home_runs,
               SUM(rbi) AS rbi, SUM(walks_bat) AS walks_bat,
               SUM(strikeouts_bat) AS strikeouts_bat, SUM(stolen_bases) AS stolen_bases
        FROM npc_season_stats
        WHERE slot_id = ? AND npc_id = ?
        GROUP BY role
      `).all(slotId, npcId);
      return JSON.stringify({ seasons, totals });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:archiveRetired", (_event, p) => {
    try {
      const { slotId, npcId, retiredSeason, peakOvr, careerWar, statJson } = JSON.parse(p);
      if (!slotId || !npcId || typeof retiredSeason !== "number")
        return JSON.stringify({ ok: false, error: "missing params" });
      db.prepare(`
        INSERT INTO npc_career_arc (slot_id, npc_id, retired_season, peak_ovr, career_war, stat_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(slot_id, npc_id) DO UPDATE SET
          retired_season=excluded.retired_season,
          peak_ovr=excluded.peak_ovr,
          career_war=excluded.career_war,
          stat_json=excluded.stat_json
      `).run(slotId, npcId, retiredSeason, peakOvr ?? 0, careerWar ?? 0.0, statJson ?? "{}");
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:queryRetiredArchive", (_event, p) => {
    try {
      const { slotId, npcId, retiredSeason, limit = 50 } = JSON.parse(p);
      let sql = `
        SELECT a.npc_id, r.name, a.retired_season, a.peak_ovr, a.career_war, a.stat_json
        FROM npc_career_arc a
        LEFT JOIN npc_runtime r ON a.slot_id = r.slot_id AND a.npc_id = r.npc_id
        WHERE a.slot_id = ?
      `;
      const params = [slotId];
      if (npcId)         { sql += " AND a.npc_id = ?";         params.push(npcId); }
      if (retiredSeason) { sql += " AND a.retired_season = ?"; params.push(retiredSeason); }
      sql += " ORDER BY a.retired_season DESC, a.peak_ovr DESC LIMIT ?";
      params.push(Math.min(500, Math.max(1, Number(limit))));
      return JSON.stringify(
        db.prepare(sql).all(...params).map((r) => ({
          npcId:         r.npc_id,
          name:          r.name ?? "",
          retiredSeason: r.retired_season,
          peakOvr:       r.peak_ovr,
          careerWar:     r.career_war,
          stat:          JSON.parse(r.stat_json ?? "{}"),
        }))
      );
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 트레이드 전용 NPC 쿼리 ──────────────────────────────────────────────────
  ipcMain.handle("npc:getByLeague", (_event, p) => {
    try {
      const { slotId, leagueId } = JSON.parse(p);
      const rows = db.prepare(`
        SELECT npc_id, position, current_team, current_league,
               current_salary, contract_years, pro_service_years,
               pitch_ovr, bat_ovr, age, career_status
        FROM npc_runtime
        WHERE slot_id = ? AND current_league = ? AND career_status = 'active'
      `).all(slotId, leagueId);
      return JSON.stringify(rows.map((r) => ({
        npcId:          r.npc_id,
        position:       r.position,
        currentTeam:    r.current_team,
        currentLeague:  r.current_league,
        currentSalary:  r.current_salary,
        contractYears:  (() => {
          const raw = r.contract_years ?? 1;
          if (raw > 1) return raw;
          const svc = r.pro_service_years ?? 0;
          const h = r.npc_id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
          if (svc <= 1) return 3;
          if (svc <= 4) return 2 + (h % 2);
          if (svc <= 7) return 1 + (h % 2);
          return 1;
        })(),
        proServiceYears: r.pro_service_years ?? 0,
        pitchOvr:       r.pitch_ovr ?? null,
        batOvr:         r.bat_ovr ?? null,
        age:            r.age,
      })));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:swapTeams", (_event, p) => {
    try {
      const { slotId, npcId1, teamId1, npcId2, teamId2 } = JSON.parse(p);
      const stmt = db.prepare(
        "UPDATE npc_runtime SET current_team = ? WHERE slot_id = ? AND npc_id = ?"
      );
      db.transaction(() => {
        stmt.run(teamId1, slotId, npcId1);
        stmt.run(teamId2, slotId, npcId2);
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("npc:updateContracts", (_event, p) => {
    try {
      const { slotId, updates } = JSON.parse(p);
      // updates: Array<{ npcId, currentSalary, contractYears, proServiceYears }>
      const stmt = db.prepare(`
        UPDATE npc_runtime
        SET current_salary = ?, contract_years = ?, pro_service_years = ?
        WHERE slot_id = ? AND npc_id = ?
      `);
      db.transaction(() => {
        for (const u of updates)
          stmt.run(u.currentSalary, u.contractYears, u.proServiceYears, slotId, u.npcId);
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 리그 거래 기록 ───────────────────────────────────────────────────────────
  ipcMain.handle("league:addTransactions", (_event, p) => {
    try {
      const { slotId, rows } = JSON.parse(p);
      // save_slots에 슬롯이 없으면 placeholder 삽입 (FK 보장)
      db.prepare(
        "INSERT OR IGNORE INTO save_slots (slot_id, name, updated_at) VALUES (?, ?, ?)"
      ).run(slotId, `Slot ${slotId}`, new Date().toISOString());
      const stmt = db.prepare(`
        INSERT INTO league_transactions
          (slot_id, season_year, week, category, player_id, player_name,
           from_team_id, from_league_id, to_team_id, to_league_id, detail, group_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      db.transaction(() => {
        for (const r of rows) {
          stmt.run(
            slotId, r.seasonYear, r.week ?? null, r.category,
            r.playerId ?? '', r.playerName ?? '',
            r.fromTeamId ?? null, r.fromLeagueId ?? null,
            r.toTeamId ?? null, r.toLeagueId ?? null,
            r.detail ?? null, r.groupId ?? null,
          );
        }
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("league:getTransactions", (_event, p) => {
    try {
      const { slotId, seasonYear, category, leagueId, playerId, limit = 200 } = JSON.parse(p);
      let sql = `
        SELECT id, season_year, week, category, player_id, player_name,
               from_team_id, from_league_id, to_team_id, to_league_id, detail, group_id
        FROM league_transactions
        WHERE slot_id = ?
      `;
      const params = [slotId];
      if (seasonYear != null) { sql += " AND season_year = ?"; params.push(seasonYear); }
      if (category)           { sql += " AND category = ?";    params.push(category); }
      if (leagueId)           { sql += " AND (from_league_id = ? OR to_league_id = ?)"; params.push(leagueId, leagueId); }
      if (playerId)           { sql += " AND player_id = ?";   params.push(playerId); }
      sql += " ORDER BY id DESC LIMIT ?";
      params.push(Math.min(500, Math.max(1, Number(limit))));
      const rows = db.prepare(sql).all(...params);
      return JSON.stringify(rows.map(r => ({
        id:           r.id,
        seasonYear:   r.season_year,
        week:         r.week,
        category:     r.category,
        playerId:     r.player_id,
        playerName:   r.player_name,
        fromTeamId:   r.from_team_id,
        fromLeagueId: r.from_league_id,
        toTeamId:     r.to_team_id,
        toLeagueId:   r.to_league_id,
        detail:       r.detail,
        groupId:      r.group_id,
      })));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 히스토리 순위/스탯 ────────────────────────────────────────────────────────
  ipcMain.handle("season:saveHistoryStandings", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_standings
          (slot_id, season_year, league_id, team_id, wins, losses, draws, win_pct, runs_for, runs_against, streak, last10, group_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of rows) {
          stmt.run(slotId, seasonYear, r.leagueId, r.teamId,
            r.wins ?? 0, r.losses ?? 0, r.draws ?? 0, r.winPct ?? 0,
            r.runsFor ?? 0, r.runsAgainst ?? 0, r.streak ?? "", r.last10 ?? "",
            r.groupLabel ?? "");
        }
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:saveHistoryLbStats", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_lb_stats
          (slot_id, season_year, league_id, player_id, stat_type,
           g, gs, w, l, sv, hd, ip, er, h_p, k_p, bb_p, era, whip,
           pa, ab, h_b, hr, rbi, sb, bb_b, k_b, avg_v, obp, slg, ops)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of rows) {
          stmt.run(
            slotId, seasonYear, r.leagueId, r.playerId, r.statType,
            r.g ?? 0, r.gs ?? null, r.w ?? null, r.l ?? null, r.sv ?? null, r.hd ?? null,
            r.ip ?? null, r.er ?? null, r.hP ?? null, r.kP ?? null, r.bbP ?? null,
            r.era ?? null, r.whip ?? null,
            r.pa ?? null, r.ab ?? null, r.hB ?? null, r.hr ?? null, r.rbi ?? null,
            r.sb ?? null, r.bbB ?? null, r.kB ?? null,
            r.avgV ?? null, r.obp ?? null, r.slg ?? null, r.ops ?? null
          );
        }
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:getHistoryYears", (_event, p) => {
    try {
      const { slotId } = JSON.parse(p);
      const rows = db.prepare(
        `SELECT DISTINCT season_year FROM history_standings WHERE slot_id = ? ORDER BY season_year DESC`
      ).all(slotId);
      return JSON.stringify(rows.map(r => r.season_year));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:getHistoryStandings", (_event, p) => {
    try {
      const { slotId, seasonYear, leagueId } = JSON.parse(p);
      let sql = `SELECT * FROM history_standings WHERE slot_id = ? AND season_year = ?`;
      const params = [slotId, seasonYear];
      if (leagueId) { sql += ` AND league_id = ?`; params.push(leagueId); }
      sql += ` ORDER BY win_pct DESC, wins DESC`;
      return JSON.stringify(db.prepare(sql).all(...params));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:getHistoryLbStats", (_event, p) => {
    try {
      const { slotId, seasonYear, leagueId } = JSON.parse(p);
      let sql = `SELECT * FROM history_lb_stats WHERE slot_id = ? AND season_year = ?`;
      const params = [slotId, seasonYear];
      if (leagueId) { sql += ` AND league_id = ?`; params.push(leagueId); }
      return JSON.stringify(db.prepare(sql).all(...params));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:saveHistoryPostseason", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_postseason
          (slot_id, season_year, league_id, champion_id, runner_up_id, playoff_teams)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const r of rows) {
          stmt.run(slotId, seasonYear, r.leagueId, r.championId ?? "", r.runnerUpId ?? "",
            JSON.stringify(r.playoffTeams ?? []));
        }
      })();
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:getHistoryPostseason", (_event, p) => {
    try {
      const { slotId, seasonYear } = JSON.parse(p);
      const rows = db.prepare(
        `SELECT * FROM history_postseason WHERE slot_id = ? AND season_year = ?`
      ).all(slotId, seasonYear);
      return JSON.stringify(rows.map(r => ({ ...r, playoff_teams: JSON.parse(r.playoff_teams ?? "[]") })));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 성장 엔진 ─────────────────────────────────────────────────────────────────
  ipcMain.handle("growth:calcTraining", (_event, paramsJson) => {
    try { return engineNative.calcTrainingGrowthNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("growth:calcGame", (_event, paramsJson) => {
    try { return engineNative.calcGameGrowthNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("growth:calcProtagonistAging", (_event, paramsJson) => {
    try { return engineNative.calcProtagonistAgingNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 플레이어 엔진 ─────────────────────────────────────────────────────────────
  ipcMain.handle("career:resolveChoice", (_event, paramsJson) => {
    try { return engineNative.resolveCareerChoiceNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("pitcher:assignHighschoolPosition", (_event, paramsJson) => {
    try { return engineNative.assignHighschoolPositionNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("pitcher:assignRole", (_event, paramsJson) => {
    try { return engineNative.assignProtagonistRoleNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("pitcher:relieverWouldPitch", (_event, paramsJson) => {
    try { return engineNative.relieverWouldPitchNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("salary:calcSeasonRating", (_event, paramsJson) => {
    try { return engineNative.calcSeasonRatingNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("salary:calcMarketSalary", (_event, paramsJson) => {
    try { return engineNative.calcMarketSalaryNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("salary:calcOfferedSalary", (_event, paramsJson) => {
    try { return engineNative.calcOfferedSalaryNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("salary:calcOfferedSalaryForProtagonist", (_event, paramsJson) => {
    try { return engineNative.calcOfferedSalaryForProtagonistNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("fa:generateOffers", (_event, paramsJson) => {
    try { return engineNative.generateFaOffersNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("draft:calcDraftRank", (_event, paramsJson) => {
    try { return engineNative.calcDraftRankNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("draft:runBoard", (_event, paramsJson) => {
    try { return engineNative.runDraftBoardNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("military:calcCandidates", (_event, paramsJson) => {
    try { return engineNative.calcSportsUnitCandidatesNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("military:calcSelection", (_event, paramsJson) => {
    try { return engineNative.calcSportsUnitSelectionNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("military:pickGeneral", (_event, paramsJson) => {
    try { return engineNative.pickGeneralEnlisteesNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("military:earlyEnlistDecisions", (_event, paramsJson) => {
    try { return engineNative.calcEarlyEnlistDecisionsNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:calcRenewalSalary", (_event, paramsJson) => {
    try { return engineNative.calcNpcRenewalSalaryNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("npc:calcContractYears", (_event, paramsJson) => {
    try { return engineNative.calcNpcContractYearsNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("indie:calcScoutOffer", (_event, paramsJson) => {
    try { return engineNative.calcIndieScoutOfferNative(paramsJson); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 스케줄 엔진 ──────────────────────────────────────────────────────────────
  ipcMain.handle("schedule:generic", (_event, p) => {
    try { return engineNative.generateScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:kbl", (_event, p) => {
    try { return engineNative.generateKblScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:abl", (_event, p) => {
    try { return engineNative.generateAblScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:jbl", (_event, p) => {
    try { return engineNative.generateJblScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:hs", (_event, p) => {
    try { return engineNative.generateHsScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:league", (_event, p) => {
    try { return engineNative.generateLeagueScheduleNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:allLeagues", (_event, p) => {
    try { return engineNative.generateAllLeagueSchedulesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:hsPostseasonSemis", (_event, p) => {
    try { return engineNative.generateHsPostseasonSemisNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:hsPostseasonFinal", (_event, p) => {
    try { return engineNative.generateHsPostseasonFinalNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("schedule:shuffleHsGroups", (_event, p) => {
    try { return engineNative.shuffleHsGroupsNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 포스트시즌 엔진 ───────────────────────────────────────────────────────────
  ipcMain.handle("postseason:buildKbl", (_event, p) => {
    try { return engineNative.buildKblBracketNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:buildAbl", (_event, p) => {
    try { return engineNative.buildAblBracketNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:buildUniv", (_event, p) => {
    try { return engineNative.buildUnivBracketNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:buildInd", (_event, p) => {
    try { return engineNative.buildIndBracketNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:buildJbl", (_event, p) => {
    try { return engineNative.buildJblBracketNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:applyGame", (_event, p) => {
    try { return engineNative.applyGameToSeriesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:fillNext", (_event, p) => {
    try { return engineNative.fillNextSeriesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:resolveNpc", (_event, p) => {
    try { return engineNative.resolveNonProtagonistSeriesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:makeGame", (_event, p) => {
    try { return engineNative.makeSeriesGameNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("postseason:shuffleAbl", (_event, p) => {
    try { return engineNative.shuffleAblConferencesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 주간 계산 엔진 ────────────────────────────────────────────────────────────
  ipcMain.handle("week:calcFacilityEff", (_event, p) => {
    try { return engineNative.weekCalcFacilityEffNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcWeeklyNet", (_event, p) => {
    try { return engineNative.weekCalcWeeklyNetNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcInjury", (_event, p) => {
    try { return engineNative.weekCalcInjuryNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcHsAdmissions", (_event, p) => {
    try { return engineNative.weekCalcHsAdmissionsNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcTradeRumor", (_event, p) => {
    try { return engineNative.weekCalcTradeRumorNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcExamResult", (_event, p) => {
    try { return engineNative.weekCalcExamResultNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcMilitary", (_event, p) => {
    try { return engineNative.weekCalcMilitaryNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcNpcFallback", (_event, p) => {
    try { return engineNative.weekCalcNpcFallbackNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:calcNpcInjuries", (_event, p) => {
    try { return engineNative.weekCalcNpcInjuriesNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });
  ipcMain.handle("week:rollRandomBatch", (_event, count) => {
    try {
      const safe = Math.min(Math.max(0, Number(count) || 0), 10000);
      return engineNative.weekRollRandomBatchNative(safe);
    }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── dev: 자동 진행 로그 파일 기록 ────────────────────────────────────────────
  const logsDir = isDev
    ? path.join(rootDir, "resource", "logs")
    : path.join(userDataDir, "logs");
  ipcMain.handle("log:write", (_event, p) => {
    try {
      const { filename, content } = JSON.parse(p);
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
      fs.appendFileSync(path.join(logsDir, filename), content + "\n", "utf-8");
      return JSON.stringify({ ok: true });
    } catch (e) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  });

  // ── scouting_engine ──────────────────────────────────────────────────────────
  ipcMain.handle("scouting:applyNoise", (_e, p) => {
    try { return engineNative.applyScoutingNoiseNative(p); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── team_engine ──────────────────────────────────────────────────────────────
  const teamHandles = [
    ["team:evalCallup",          "evalCallupCandidatesNative"],
    ["team:evalCalldown",        "evalCalldownCandidatesNative"],
    ["team:evalRelease",         "evalReleasePriorityNative"],
    ["team:evalFaBid",           "evalFaBidNative"],
    ["team:evalRenewal",         "evalRenewalOfferNative"],
    ["team:evalNewContract",     "evalNewContractNative"],
    ["team:evalRetirement",      "evalRetirementSuggestionNative"],
    ["team:generateTrade",       "generateTradeProposalsNative"],
    ["team:evalTradeValue",      "evalTradeValueNative"],
    ["team:evalMedical",         "evalMedicalTestNative"],
    ["team:winNowUpdate",        "calcWinNowPressureUpdateNative"],
    ["team:scoutingImprovement", "calcScoutingImprovementNative"],
  ];
  for (const [channel, fn] of teamHandles) {
    ipcMain.handle(channel, (_e, p) => {
      try { return engineNative[fn](p); }
      catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
    });
  }

  // ── player_agent ─────────────────────────────────────────────────────────────
  const playerHandles = [
    ["player:evalFaDecision",      "playerEvalFaDecisionNative"],
    ["player:evalTradeResponse",   "playerEvalTradeResponseNative"],
    ["player:evalContractOffer",   "playerEvalContractOfferNative"],
    ["player:evalRetirementResp",  "playerEvalRetirementResponseNative"],
    ["player:rankFaOffers",        "playerRankFaOffersNative"],
    ["player:updateLoyalty",       "updatePlayerLoyaltyNative"],
  ];
  for (const [channel, fn] of playerHandles) {
    ipcMain.handle(channel, (_e, p) => {
      try { return engineNative[fn](p); }
      catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
    });
  }

  // ── CSP 헤더 주입 ────────────────────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self' 'unsafe-eval'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "connect-src 'self' ws://localhost:5173 http://localhost:5173",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
        ].join("; ")
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self' data:",
        ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // ── app:// 커스텀 프로토콜 (프로덕션) ────────────────────────────────────────
  if (!isDev) {
    const uiRoot = path.resolve(__dirname, "../../dist/ui");
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      const relPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.join(uiRoot, relPath);
      if (!filePath.startsWith(uiRoot + path.sep) && filePath !== uiRoot) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(`file://${filePath}`);
    });
  }

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
