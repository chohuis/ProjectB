const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");

let activeMatchState = null;
let coreModulePromise = null;

function loadCoreModule() {
  if (!coreModulePromise) {
    const coreDistPath = path.resolve(__dirname, "../../packages/core/dist/index.js");
    coreModulePromise = import(pathToFileURL(coreDistPath).href);
  }
  return coreModulePromise;
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
  const resourceBase = path.resolve(__dirname, "../../resource/data/master");

  ipcMain.handle("master:fetch", (_event, relPath) => {
    try {
      const fullPath = path.resolve(resourceBase, relPath);
      const raw = fs.readFileSync(fullPath, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      console.error("[master:fetch] 로드 실패:", relPath, e);
      return null;
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
