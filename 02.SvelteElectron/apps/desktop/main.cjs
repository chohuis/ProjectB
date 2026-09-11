const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const engineNative  = require("../../packages/engine-native");
const { app, BrowserWindow, ipcMain, session, protocol, net } = require("electron");
// 포트 정본 — CSP와 will-navigate가 같은 값을 봐야 한다
const { DEV_ORIGIN } = require("../../dev-server.config.cjs");

const {
  openDatabase, applySchemaPatches,
} = require("./ipc/db.cjs");
const matchIpc   = require("./ipc/match.cjs");
const tuningIpc  = require("./ipc/tuning.cjs");
const windowIpc  = require("./ipc/window.cjs");

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

// ⚠ `checkMasterIntegrity`(master.db SHA-256 대조)는 2026-09-04에 지웠다 —
// `master.db` 자체를 접으면서 지킬 파일이 없어졌다. 콘텐츠 무결성은
// `resource/data/master/**` 쪽 문제이고, 지금은 `_manifest.json` 양방향 검사
// (`eventManifest.test.ts`)가 그 자리를 본다.

function loadTuningSchema(resourceBase) {
  const fullPath = path.resolve(resourceBase, tuningSchemaRelPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw);
}

function createWindow() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  const win = new BrowserWindow({
    // 처음 뜰 때는 전체화면이다 (사용자 확정 2026-08-28).
    // 1280x800·1440x900을 없앤 것과 같은 이유 - 그 폭에서 표가 깨진다.
    width: 1600, height: 900, minWidth: 1600, minHeight: 900,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    // dev 오리진을 정규식에 두 번째로 적지 않는다 — 포트가 바뀌면 조용히 막힌다
    const allowed = isDev
      ? (u) => u.startsWith(process.env.VITE_DEV_SERVER_URL)
      : (u) => u.startsWith("app://bundle/");
    if (!allowed(url)) event.preventDefault();
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
  const rootDir      = path.resolve(__dirname, "../../");
  const tuningSchema = loadTuningSchema(resourceBase);
  const userDataDir  = app.getPath("userData");
  const savesDir     = path.join(userDataDir, "saves");
  const dbPath       = path.join(savesDir, "projectb_v2.db");

  const db = openDatabase(dbPath);
  applySchemaPatches(db);

  // ── R3a: 슬롯 DB v3 (파일=슬롯) — repo:call 단일 채널 ──────────────────────
  const slotdb = require("./ipc/slotdb.cjs");
  // ⚠ 시즌 기록 세 테이블은 **slot.db가 아니라 이 공용 DB**에 `slot_id`로만
  // 구분돼 들어 있다. 슬롯을 지우거나 새로 시작할 때 여기도 같이 비우지 않으면
  // **새 게임이 옛 세계의 순위표를 자기 것으로 읽는다** — 실제로 지금 없는 팀
  // 47종이 순위표에 떠 있었다.
  const purgeSlotHistory = (slotId) => {
    for (const t of ["history_standings", "history_lb_stats", "history_postseason",
                     "history_tournaments"]) {
      try { db.prepare(`DELETE FROM ${t} WHERE slot_id = ?`).run(slotId); } catch { /* 테이블이 아직 없을 수 있다 */ }
    }
  };
  // 🔴 **엔진을 넘긴다** — 세이브 서명(HMAC)이 Rust에 있다.
  //   키가 Rust 바이너리 안에 XOR 분산 저장돼 있어 **Electron에 두면 안 된다**
  //   (CLAUDE.md 절대 금지). 여기서는 함수만 빌려 쓴다.
  const slotManager = slotdb.createManager(savesDir, {
    onSlotReset: purgeSlotHistory,
    engine: engineNative,
  });
  // 레거시 채널(npc:*/league:*)을 slotdb 커맨드로 라우팅 — 콜사이트 무수정 전환
  const v3Compat = (cmd, payload) => JSON.stringify(slotdb.dispatch(slotManager, cmd, payload));
  ipcMain.handle("repo:call", (_event, cmd, payloadJson) => {
    try {
      const payload = payloadJson ? JSON.parse(payloadJson) : {};
      return JSON.stringify(slotdb.dispatch(slotManager, cmd, payload));
    } catch (e) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  });
  app.on("before-quit", () => slotManager.closeAll());

  tuningIpc.applyTuningFromFile(resourceBase, tuningSchema, loadCoreModule).then((res) => {
    if (!res.ok) console.warn("[tuning] invalid tuning file. fallback to defaults.", res.errors);
  }).catch((e) => {
    console.warn("[tuning] failed to load tuning file. fallback to defaults.", e);
  });

  // ── domain IPC 등록 ──────────────────────────────────────────────────────────
  // R3a-4d: save.cjs(v2 game/season 블롭 세이브) 폐기 — repo:call(slot.db)이 유일 경로
  matchIpc.register(ipcMain, { loadCoreModule, engineNative });
  // ⚠ `tuningIpc.register`는 2026-08-20에 지웠다 — 매치 엔진 랩(Ctrl+Q)을
  // 없애면서 `tuning:load/validate/apply/save/smoke` 다섯이 쓰는 곳 0이 됐다.
  // **시작 시 튜닝 파일을 먹이는 `applyTuningFromFile`은 그대로 산다**(위쪽).
  // 수치는 파일을 직접 고치고, 배치 시뮬은 `npm run smoke`가 한다
  // 창은 만들어진 뒤에 잡아야 한다 — 등록 시점엔 아직 없다
  windowIpc.register(ipcMain, { getWindow: () => _mainWindow });

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

  // ⚠ `master:save`는 2026-08-20에 지웠다 — 이벤트·업적 에디터(Ctrl+Q)를
  // 없애면서 부르는 곳이 0이 됐다. 콘텐츠는 `resource/data/master/` 아래
  // 파일을 직접 고친다. 읽기(`master:fetch`)는 게임 경로라 그대로 산다

  // ⚠ `master:loadEntities`는 2026-09-04에 지웠다 — **`master.db`를 접었다.**
  //
  //   그 채널이 읽던 표는 `npc_master` 하나였고 Phase 6A 이후로 **0행**이다
  //   (선수는 slot.db `npc`, 스태프는 slot.db `staff`가 정본 · 둘 다 런타임
  //   절차 생성). 그런데 없으면 `masterDb = null`로 조용히 `[]`를 주는 바람에
  //   **「빈 게 정상」과 「빌드가 빠졌다」가 같아 보였다** — 그 모호함이
  //   지우는 이유다. 다시 쓸 일이 생기면 그때 되살린다.
  //
  //   같이 지운 것: `build:masterdb` · `scripts/generate_master_db.cjs` ·
  //   `masterRowToEntityRow`(db.cjs) · preload 두 줄 · `checkMasterIntegrity`.
  //
  //   `master:upsertEntity`/`deleteEntity`/`bulkUpsertEntities`(overlay 기반)는
  //   그 전(R3a-4d)에 이미 지웠다 — DESIGN.md §8.2 원칙 1(slot.db 단일 정본).

  // ── NPC 시뮬 IPC ─────────────────────────────────────────────────────────────
  // ── R2: Rust 엔진 호출 단일 채널 (DESIGN.md §8.2 원칙 5) ──────────────────
  // 화이트리스트 = engine-native가 실제 export한 함수 목록 그 자체
  const engineFns = new Set(
    Object.keys(engineNative).filter((k) => typeof engineNative[k] === "function")
  );
  ipcMain.handle("engine:call", (_event, fnName, payload) => {
    if (typeof fnName !== "string" || !engineFns.has(fnName)) {
      return JSON.stringify({ error: `[engine:call] unknown fn: ${String(fnName)}` });
    }
    try { return engineNative[fnName](payload); }
    catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });


  // ── NPC 경기 기록 IPC ─────────────────────────────────────────────────────────
  ipcMain.handle("npc:bulkInsertGameLogs", (_event, p) => {
    try {
      const { slotId, season, week, logs } = JSON.parse(p);
      if (!slotId || !Array.isArray(logs) || logs.length === 0)
        return JSON.stringify({ ok: true, inserted: 0 });
      // 날짜·상대는 **쓸 때 받는다.** 읽을 때는 그 경기를 특정할 수 없다 —
      // 한 주에 경기가 여럿인데 로그에 경기 id가 없다
      const stmt = db.prepare(
        "INSERT INTO npc_game_log(slot_id, npc_id, season, week, role, stat_json," +
        " game_date, team_id, opponent_team_id) VALUES(?,?,?,?,?,?,?,?,?)"
      );
      const insertMany = db.transaction((rows) => {
        for (const r of rows)
          stmt.run(slotId, r.npcId, season, week, r.role, r.statJson,
            r.gameDate ?? "", r.teamId ?? "", r.opponentTeamId ?? "");
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
        SELECT season, week, role, stat_json, game_date, team_id, opponent_team_id
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

  // ── 트레이드 전용 NPC 쿼리 / 리그 거래기록 ──────────────────────────────────
  // R3a-4d: v2 npc_runtime/league_transactions 폴백 제거 — 슬롯은 이제 전부 v3
  // (slot.db)이므로 항상 slotdb로 라우팅한다. 채널명·payload/return shape는
  // 렌더러 콜사이트(advanceWeek.ts 등 12파일) 무수정을 위해 그대로 유지.
  ipcMain.handle("npc:getByLeague", (_event, p) => {
    const { slotId, leagueId } = JSON.parse(p);
    return v3Compat("compatGetByLeague", { slotId, leagueId });
  });

  ipcMain.handle("npc:swapTeams", (_event, p) => {
    const { slotId, npcId1, teamId1, npcId2, teamId2 } = JSON.parse(p);
    return v3Compat("compatMoveTeams", {
      slotId,
      moves: [{ npcId: npcId1, toTeamId: teamId1 }, { npcId: npcId2, toTeamId: teamId2 }],
    });
  });

  ipcMain.handle("npc:updateContracts", (_event, p) => {
    const { slotId, updates } = JSON.parse(p);
    return v3Compat("compatUpdateContracts", { slotId, updates });
  });

  ipcMain.handle("league:addTransactions", (_event, p) => {
    const { slotId, rows } = JSON.parse(p);
    return v3Compat("addTransactions", { slotId, rows });
  });

  ipcMain.handle("league:getTransactions", (_event, p) => {
    const { slotId, seasonYear, category, leagueId, playerId, limit = 200 } = JSON.parse(p);
    return v3Compat("compatGetTransactions", { slotId, seasonYear, category, leagueId, playerId, limit });
  });

  // ── 히스토리 순위/스탯 ────────────────────────────────────────────────────────
  ipcMain.handle("season:saveHistoryStandings", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_standings
          (slot_id, season_year, league_id, team_id, wins, losses, draws, win_pct, runs_for, runs_against, streak, last10, group_label, team_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // 🔴 **실제로 쓴 행 수를 돌려준다** (2026-09-01).
      //   예전엔 `{ok:true}` 뿐이라, 호출부가 로그를 남겨도 "보낸 행"밖에
      //   못 적었다 — 보낸 것과 쓴 것이 다를 때 그걸 못 가린다.
      let _saved = 0;
      // ⚠ `stmt.run()` 은 객체(`{changes}`)를 돌려준다 — 그대로 더하면 NaN 이다
      const run1 = (...a) => { _saved += stmt.run(...a).changes; };
      db.transaction(() => {
        for (const r of rows) {
          run1(slotId, seasonYear, r.leagueId, r.teamId,
            r.wins ?? 0, r.losses ?? 0, r.draws ?? 0, r.winPct ?? 0,
            r.runsFor ?? 0, r.runsAgainst ?? 0, r.streak ?? "", r.last10 ?? "",
            r.groupLabel ?? "", r.teamName ?? "");
        }
      })();
      return JSON.stringify({ ok: true, saved: _saved });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:saveHistoryLbStats", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_lb_stats
          (slot_id, season_year, league_id, player_id, stat_type,
           g, gs, w, l, sv, hd, ip, er, h_p, k_p, bb_p, era, whip,
           pa, ab, h_b, hr, rbi, sb, bb_b, k_b, avg_v, obp, slg, ops,
           player_name, team_name,
           -- ⚠ 여기가 안 넓으면 시즌이 넘어가는 순간 새 칸이 사라진다 (v12)
           hr_p, hbp_p, risp_ab_p, risp_h_p,
           b2, b3, r_b, hbp_b, sac, sf, risp_ab_b, risp_h_b,
           -- 수비 기록 (v13) — 골든글러브의 근거다
           def_e, def_a, def_po, fpct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?)
      `);
      // 🔴 **실제로 쓴 행 수를 돌려준다** (2026-09-01).
      //   예전엔 `{ok:true}` 뿐이라, 호출부가 로그를 남겨도 "보낸 행"밖에
      //   못 적었다 — 보낸 것과 쓴 것이 다를 때 그걸 못 가린다.
      let _saved = 0;
      // ⚠ `stmt.run()` 은 객체(`{changes}`)를 돌려준다 — 그대로 더하면 NaN 이다
      const run1 = (...a) => { _saved += stmt.run(...a).changes; };
      db.transaction(() => {
        for (const r of rows) {
          run1(
            slotId, seasonYear, r.leagueId, r.playerId, r.statType,
            r.g ?? 0, r.gs ?? null, r.w ?? null, r.l ?? null, r.sv ?? null, r.hd ?? null,
            r.ip ?? null, r.er ?? null, r.hP ?? null, r.kP ?? null, r.bbP ?? null,
            r.era ?? null, r.whip ?? null,
            r.pa ?? null, r.ab ?? null, r.hB ?? null, r.hr ?? null, r.rbi ?? null,
            r.sb ?? null, r.bbB ?? null, r.kB ?? null,
            r.avgV ?? null, r.obp ?? null, r.slg ?? null, r.ops ?? null,
            r.playerName ?? "", r.teamName ?? "",
            r.hrP ?? null, r.hbpP ?? null, r.rispAbP ?? null, r.rispHP ?? null,
            r.b2 ?? null, r.b3 ?? null, r.rB ?? null, r.hbpB ?? null,
            r.sac ?? null, r.sf ?? null, r.rispAbB ?? null, r.rispHB ?? null,
            r.defE ?? null, r.defA ?? null, r.defPo ?? null, r.fpct ?? null
          );
        }
      })();
      return JSON.stringify({ ok: true, saved: _saved });
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

  // 팀 하나의 **전 시즌** 성적 — 구단 연표(팀 상세)가 쓴다.
  //
  // ⚠ **순위는 저장돼 있지 않다.** `history_standings` 에는 승·패·승률만
  //   있어서 같은 해 같은 리그 안에서 세어야 한다.
  // 🔴 **같은 종류끼리 센다.** `refs` 는 1군·팜을 **같은 `leagueId`** 로 담고
  //   `_1`/`_2` 접미사로만 갈린다 — 안 거르면 ABL 순위가 16팀이 아니라
  //   32팀 중에서 매겨진다. 리그 화면이 같은 이유로 같은 필터를 쓴다.
  //   ⚠ 처음엔 2군을 **통째로 뺐다가** 2군 자신도 빠져 `1위 / 0팀` 이
  //     나왔다(실측). 빼는 게 아니라 **접미사가 같은 팀끼리** 세야 한다.
  //   ⚠ **`LIKE ... ESCAPE` 를 쓰지 않는다.** 이 SQL 은 백틱 템플릿 안이라
  //     `ESCAPE '\\'` 의 백슬래시가 JS 에 먹혀 빈 문자열이 된다
  //     ("ESCAPE expression must be a single character"). `substr(id, -2)` 는
  //     이스케이프가 없어 그 함정을 아예 피한다.
  //   ⚠ KBL 은 `LEAGUE_KBL`/`LEAGUE_KBL_FARM` 으로 갈려 있어 안 걸린다 —
  //     **해외만 같은 id 를 쓴다.** 그래서 이 함정은 늦게 드러난다.
  ipcMain.handle("season:getTeamHistory", (_event, p) => {
    try {
      const { slotId, teamId } = JSON.parse(p);
      const rows = db.prepare(
        `SELECT h1.season_year, h1.league_id, h1.wins, h1.losses, h1.draws,
                h1.win_pct, h1.runs_for, h1.runs_against,
                (SELECT COUNT(*) + 1 FROM history_standings h2
                  WHERE h2.slot_id = h1.slot_id
                    AND h2.season_year = h1.season_year
                    AND h2.league_id = h1.league_id
                    AND substr(h2.team_id, -2) = substr(h1.team_id, -2)
                    AND (h2.win_pct > h1.win_pct
                         OR (h2.win_pct = h1.win_pct AND h2.wins > h1.wins))
                ) AS rank,
                (SELECT COUNT(*) FROM history_standings h3
                  WHERE h3.slot_id = h1.slot_id
                    AND h3.season_year = h1.season_year
                    AND h3.league_id = h1.league_id
                    AND substr(h3.team_id, -2) = substr(h1.team_id, -2)
                ) AS teams
           FROM history_standings h1
          WHERE h1.slot_id = ? AND h1.team_id = ?
          ORDER BY h1.season_year`,
      ).all(slotId, teamId);
      return JSON.stringify(rows);
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
          (slot_id, season_year, league_id, champion_id, runner_up_id, playoff_teams,
           champion_name, runner_up_name, bracket_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // 🔴 **실제로 쓴 행 수를 돌려준다** (2026-09-01).
      //   예전엔 `{ok:true}` 뿐이라, 호출부가 로그를 남겨도 "보낸 행"밖에
      //   못 적었다 — 보낸 것과 쓴 것이 다를 때 그걸 못 가린다.
      let _saved = 0;
      // ⚠ `stmt.run()` 은 객체(`{changes}`)를 돌려준다 — 그대로 더하면 NaN 이다
      const run1 = (...a) => { _saved += stmt.run(...a).changes; };
      db.transaction(() => {
        for (const r of rows) {
          run1(slotId, seasonYear, r.leagueId, r.championId ?? "", r.runnerUpId ?? "",
            JSON.stringify(r.playoffTeams ?? []),
            r.championName ?? "", r.runnerUpName ?? "",
            // 포스트시즌이 없는 리그(고교 등)는 빈 문자열. "[]"로 두면
            // 화면이 빈 대진표를 그린다
            r.bracket ? JSON.stringify(r.bracket) : "");
        }
      })();
      return JSON.stringify({ ok: true, saved: _saved });
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

  // ── 대회 기록 ─────────────────────────────────────────────────────────────────
  //
  // ⚠ **대회만 과거 기록이 없었다.** 순위·개인기록·포스트시즌은 남기는데
  // 대회는 `$seasonStore.tournaments`(현재 시즌)뿐이라 시즌이 넘어가면
  // 지난해 우승팀이 통째로 사라졌다.

  ipcMain.handle("season:saveHistoryTournaments", (_event, p) => {
    try {
      const { slotId, seasonYear, rows } = JSON.parse(p);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_tournaments
          (slot_id, season_year, tour_id, league_id, tour_name,
           champion_id, champion_name, runner_up_id, runner_up_name,
           bracket_json, group_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // 🔴 **실제로 쓴 행 수를 돌려준다** (2026-09-01).
      //   예전엔 `{ok:true}` 뿐이라, 호출부가 로그를 남겨도 "보낸 행"밖에
      //   못 적었다 — 보낸 것과 쓴 것이 다를 때 그걸 못 가린다.
      let _saved = 0;
      // ⚠ `stmt.run()` 은 객체(`{changes}`)를 돌려준다 — 그대로 더하면 NaN 이다
      const run1 = (...a) => { _saved += stmt.run(...a).changes; };
      db.transaction(() => {
        for (const r of rows) {
          run1(slotId, seasonYear, r.tourId, r.leagueId ?? '', r.tourName ?? '',
            r.championId ?? '', r.championName ?? '',
            r.runnerUpId ?? '', r.runnerUpName ?? '',
            // 안 열린 대회는 빈 문자열. '[]'로 두면 화면이 빈 대진표를 그린다
            r.bracket ? JSON.stringify(r.bracket) : '',
            r.group   ? JSON.stringify(r.group)   : '');
        }
      })();
      return JSON.stringify({ ok: true, saved: _saved });
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  ipcMain.handle("season:getHistoryTournaments", (_event, p) => {
    try {
      const { slotId, seasonYear } = JSON.parse(p);
      return JSON.stringify(db.prepare(
        `SELECT * FROM history_tournaments WHERE slot_id = ? AND season_year = ?`
      ).all(slotId, seasonYear));
    } catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }
  });

  // ── 성장 엔진 ─────────────────────────────────────────────────────────────────

  // ── 플레이어 엔진 ─────────────────────────────────────────────────────────────

  // ── 스케줄 엔진 ──────────────────────────────────────────────────────────────

  // ── 포스트시즌 엔진 ───────────────────────────────────────────────────────────

  // ── 주간 계산 엔진 ────────────────────────────────────────────────────────────
  ipcMain.handle("week:rollRandomBatch", (_event, count, seed) => {
    try {
      const safe = Math.min(Math.max(0, Number(count) || 0), 10000);
      // 씨앗이 0이면 엔진이 thread_rng로 떨어진다 — 예전 동작 그대로다
      return engineNative.weekRollRandomBatchNative(safe, (Number(seed) || 0) >>> 0);
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

  // scouting_engine / team_engine / player_agent 순수 포워딩은 engine:call 단일 채널로 이관됨 (R2)

  // ── CSP 헤더 주입 ────────────────────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self' 'unsafe-eval'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          `connect-src 'self' ${DEV_ORIGIN} ${DEV_ORIGIN.replace("http://", "ws://")}`,
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
