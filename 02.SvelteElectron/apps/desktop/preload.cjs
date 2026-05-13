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
  seasonLoad: ()   => ipcRenderer.invoke("season:load"),
  seasonSave: (data) => ipcRenderer.invoke("season:save", data),
  listSlots: () => ipcRenderer.invoke("save:listSlots"),
  loadSlot: (slotId) => ipcRenderer.invoke("save:loadSlot", slotId),
  saveSlot: (payload) => ipcRenderer.invoke("save:saveSlot", payload),
  deleteSlot: (slotId) => ipcRenderer.invoke("save:deleteSlot", slotId),
  renameSlot: (payload) => ipcRenderer.invoke("save:renameSlot", payload),

  // ── 날짜 진행 ───────────────────────────────────────────────────────────
  dayAdvance: (state) => ipcRenderer.invoke("day:advance", state),

  // ── 마스터 데이터 (패키징 환경 fallback) ────────────────────────────────
  masterFetch: (relPath) => ipcRenderer.invoke("master:fetch", relPath),
  masterSave: (payload) => ipcRenderer.invoke("master:save", payload),

  // ── 매치 엔진 튜닝 (관리자 도구) ───────────────────────────────────────
  tuningLoad: () => ipcRenderer.invoke("tuning:load"),
  tuningValidate: (payload) => ipcRenderer.invoke("tuning:validate", payload),
  tuningApply: (payload) => ipcRenderer.invoke("tuning:apply", payload),
  tuningSave: (payload) => ipcRenderer.invoke("tuning:save", payload),
  tuningSmoke: (payload) => ipcRenderer.invoke("tuning:smoke", payload),

  // ── 콘텐츠 파일 변경 알림 (개발 환경 핫리로드) ──────────────────────
  onContentChanged: (cb) =>
    ipcRenderer.on("master:content-changed", (_event, data) => cb(data)),
});
