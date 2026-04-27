const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("projectB", {
  version: "0.1.0",

  // ── 경기 엔진 ───────────────────────────────────────────────────────────
  matchStart:  (request)  => ipcRenderer.invoke("match:start",  request),
  matchStep:   (decision) => ipcRenderer.invoke("match:step",   decision),
  matchFinish: ()         => ipcRenderer.invoke("match:finish"),

  // ── 게임 저장/불러오기 ──────────────────────────────────────────────────
  gameLoad: ()     => ipcRenderer.invoke("game:load"),
  gameSave: (data) => ipcRenderer.invoke("game:save", data),

  // ── 날짜 진행 ───────────────────────────────────────────────────────────
  dayAdvance: (state) => ipcRenderer.invoke("day:advance", state),

  // ── 마스터 데이터 (패키징 환경 fallback) ────────────────────────────────
  masterFetch: (relPath) => ipcRenderer.invoke("master:fetch", relPath),
  masterSave: (payload) => ipcRenderer.invoke("master:save", payload),
});
