const { contextBridge, ipcRenderer } = require("electron");

const isDev = !!process.env.VITE_DEV_SERVER_URL;

contextBridge.exposeInMainWorld("projectB", {
  version: "0.1.0",

  // ── 경기 엔진 ───────────────────────────────────────────────────────────
  matchStart:  (request)  => ipcRenderer.invoke("match:start",  request),
  matchStep:   (decision) => ipcRenderer.invoke("match:step",   decision),
  matchFinish: ()         => ipcRenderer.invoke("match:finish"),

  // ── 게임 저장/불러오기 ──────────────────────────────────────────────────
  gameLoad: ()             => ipcRenderer.invoke("game:load"),
  gameSave: (data)         => ipcRenderer.invoke("game:save",   data),
  seasonLoad: ()           => ipcRenderer.invoke("season:load"),
  seasonSave: (data)       => ipcRenderer.invoke("season:save", data),
  listSlots: ()            => ipcRenderer.invoke("save:listSlots"),
  loadSlot: (slotId)       => ipcRenderer.invoke("save:loadSlot",  slotId),
  saveSlot: (payload)      => ipcRenderer.invoke("save:saveSlot",  payload),
  deleteSlot: (slotId)     => ipcRenderer.invoke("save:deleteSlot", slotId),
  renameSlot: (payload)    => ipcRenderer.invoke("save:renameSlot", payload),

  // ── 날짜 진행 ───────────────────────────────────────────────────────────
  dayAdvance: (state) => ipcRenderer.invoke("day:advance", state),

  // ── 마스터 데이터 ────────────────────────────────────────────────────────
  masterFetch: (relPath)       => ipcRenderer.invoke("master:fetch",        relPath),
  masterLoadEntities: (leagueId) => ipcRenderer.invoke("master:loadEntities", leagueId),

  // ── 마운드 방문 ─────────────────────────────────────────────────────────
  matchMoundVisit: () => ipcRenderer.invoke("match:mound-visit"),
  matchNextInning: () => ipcRenderer.invoke("match:next-inning"),

  // ── NPC 시뮬 (Phase 3) ──────────────────────────────────────────────────────
  npcSimGame:                   (p) => ipcRenderer.invoke("npc:simGame",                   p),
  npcRunOffseason:              (p) => ipcRenderer.invoke("npc:runOffseason",              p),
  npcAdvanceGrades:             (p) => ipcRenderer.invoke("npc:advanceGrades",             p),
  npcGenerateFreshmen:          (p) => ipcRenderer.invoke("npc:generateFreshmen",          p),
  npcRunDraft:                  (p) => ipcRenderer.invoke("npc:runDraft",                  p),
  npcApplyDraft:                (p) => ipcRenderer.invoke("npc:applyDraft",                p),
  npcDetermineProtagonistDraft: (p) => ipcRenderer.invoke("npc:determineProtagonistDraft", p),
  npcAdvanceProtagonistGrade:   (p) => ipcRenderer.invoke("npc:advanceProtagonistGrade",   p),

  // ── 성장 엔진 (Phase 4) ──────────────────────────────────────────────────
  growthCalcTraining:                    (p) => ipcRenderer.invoke("growth:calcTraining",                         p),
  growthCalcGame:                        (p) => ipcRenderer.invoke("growth:calcGame",                             p),

  // ── 플레이어 엔진 (Phase 4) ──────────────────────────────────────────────
  careerResolveChoice:                   (p) => ipcRenderer.invoke("career:resolveChoice",                        p),
  pitcherAssignHighschoolPosition:       (p) => ipcRenderer.invoke("pitcher:assignHighschoolPosition",            p),
  pitcherAssignRole:                     (p) => ipcRenderer.invoke("pitcher:assignRole",                          p),
  pitcherRelieverWouldPitch:             (p) => ipcRenderer.invoke("pitcher:relieverWouldPitch",                  p),
  salaryCalcSeasonRating:                (p) => ipcRenderer.invoke("salary:calcSeasonRating",                     p),
  salaryCalcMarketSalary:                (p) => ipcRenderer.invoke("salary:calcMarketSalary",                     p),
  salaryCalcOfferedSalary:               (p) => ipcRenderer.invoke("salary:calcOfferedSalary",                    p),
  salaryCalcOfferedSalaryForProtagonist: (p) => ipcRenderer.invoke("salary:calcOfferedSalaryForProtagonist",      p),
  faGenerateOffers:                      (p) => ipcRenderer.invoke("fa:generateOffers",                           p),
  draftCalcDraftRank:                    (p) => ipcRenderer.invoke("draft:calcDraftRank",                         p),

  // ── dev 전용 (프로덕션 빌드에서 미노출) ────────────────────────────────
  ...(isDev && {
    masterSave: (payload)        => ipcRenderer.invoke("master:save",       payload),
    tuningLoad: ()               => ipcRenderer.invoke("tuning:load"),
    tuningValidate: (payload)    => ipcRenderer.invoke("tuning:validate",   payload),
    tuningApply: (payload)       => ipcRenderer.invoke("tuning:apply",      payload),
    tuningSave: (payload)        => ipcRenderer.invoke("tuning:save",       payload),
    tuningSmoke: (payload)       => ipcRenderer.invoke("tuning:smoke",      payload),
    onContentChanged: (cb) =>
      ipcRenderer.on("master:content-changed", (_event, data) => cb(data)),
  }),
});
