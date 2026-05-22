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
  matchMoundVisit:        ()    => ipcRenderer.invoke("match:mound-visit"),
  matchNextInning:        ()    => ipcRenderer.invoke("match:next-inning"),
  matchRunSimpleGame:     (p)   => ipcRenderer.invoke("match:runSimpleGame", p),
  matchSimulateToEntry:   (req) => ipcRenderer.invoke("match:simulateToEntry", req),
  matchAutoFinishFromEntry: ()  => ipcRenderer.invoke("match:autoFinishFromEntry"),

  // ── NPC 시뮬 (Phase 3) ──────────────────────────────────────────────────────
  npcSimGame:                   (p) => ipcRenderer.invoke("npc:simGame",                   p),
  npcRunOffseason:              (p) => ipcRenderer.invoke("npc:runOffseason",              p),
  npcAdvanceGrades:             (p) => ipcRenderer.invoke("npc:advanceGrades",             p),
  npcGenerateFreshmen:          (p) => ipcRenderer.invoke("npc:generateFreshmen",          p),
  npcRunDraft:                  (p) => ipcRenderer.invoke("npc:runDraft",                  p),
  npcApplyDraft:                (p) => ipcRenderer.invoke("npc:applyDraft",                p),
  npcDetermineProtagonistDraft: (p) => ipcRenderer.invoke("npc:determineProtagonistDraft", p),
  npcAdvanceProtagonistGrade:   (p) => ipcRenderer.invoke("npc:advanceProtagonistGrade",   p),
  npcBulkInsertGameLogs:        (p) => ipcRenderer.invoke("npc:bulkInsertGameLogs",        p),
  npcTrimGameLogs:              (p) => ipcRenderer.invoke("npc:trimGameLogs",              p),
  npcGetRecentGames:            (p) => ipcRenderer.invoke("npc:getRecentGames",            p),
  npcFlushSeasonStats:          (p) => ipcRenderer.invoke("npc:flushSeasonStats",          p),
  npcGetCareerStats:            (p) => ipcRenderer.invoke("npc:getCareerStats",            p),

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

  // ── 스케줄 엔진 (Phase 5) ────────────────────────────────────────────────
  scheduleGeneric:           (p) => ipcRenderer.invoke("schedule:generic",           p),
  scheduleKbl:               (p) => ipcRenderer.invoke("schedule:kbl",               p),
  scheduleAbl:               (p) => ipcRenderer.invoke("schedule:abl",               p),
  scheduleHs:                (p) => ipcRenderer.invoke("schedule:hs",                p),
  scheduleLeague:            (p) => ipcRenderer.invoke("schedule:league",            p),
  scheduleAllLeagues:        (p) => ipcRenderer.invoke("schedule:allLeagues",        p),
  scheduleHsPostseasonSemis: (p) => ipcRenderer.invoke("schedule:hsPostseasonSemis", p),
  scheduleHsPostseasonFinal: (p) => ipcRenderer.invoke("schedule:hsPostseasonFinal", p),
  scheduleShuffleHsGroups:   (p) => ipcRenderer.invoke("schedule:shuffleHsGroups",   p),

  // ── 포스트시즌 엔진 (Phase 5) ──────────────────────────────────────────────
  postseasonBuildKbl:   (p) => ipcRenderer.invoke("postseason:buildKbl",   p),
  postseasonBuildAbl:   (p) => ipcRenderer.invoke("postseason:buildAbl",   p),
  postseasonBuildUniv:  (p) => ipcRenderer.invoke("postseason:buildUniv",  p),
  postseasonBuildInd:   (p) => ipcRenderer.invoke("postseason:buildInd",   p),
  postseasonApplyGame:  (p) => ipcRenderer.invoke("postseason:applyGame",  p),
  postseasonFillNext:   (p) => ipcRenderer.invoke("postseason:fillNext",   p),
  postseasonResolveNpc: (p) => ipcRenderer.invoke("postseason:resolveNpc", p),
  postseasonMakeGame:   (p) => ipcRenderer.invoke("postseason:makeGame",   p),
  postseasonShuffleAbl: (p) => ipcRenderer.invoke("postseason:shuffleAbl", p),
  weekCalcFacilityEff:   (p) => ipcRenderer.invoke("week:calcFacilityEff",   p),
  weekCalcWeeklyNet:     (p) => ipcRenderer.invoke("week:calcWeeklyNet",     p),
  weekCalcInjury:        (p) => ipcRenderer.invoke("week:calcInjury",        p),
  weekCalcHsAdmissions:  (p) => ipcRenderer.invoke("week:calcHsAdmissions",  p),
  weekCalcTradeRumor:    (p) => ipcRenderer.invoke("week:calcTradeRumor",    p),
  weekCalcExamResult:    (p) => ipcRenderer.invoke("week:calcExamResult",    p),
  weekCalcMilitary:      (p) => ipcRenderer.invoke("week:calcMilitary",      p),
  weekCalcNpcFallback:   (p) => ipcRenderer.invoke("week:calcNpcFallback",   p),
  weekRollRandomBatch:   (count) => ipcRenderer.invoke("week:rollRandomBatch", count),

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
