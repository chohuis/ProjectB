const path = require("node:path");
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
    runners: state.runners,
    pitchCount: state.pitchCount,
    stamina: state.stamina,
    mental: state.mental,
    isFinished: state.isFinished,
    recentLogs: state.logs.slice(-30)
  };
}
