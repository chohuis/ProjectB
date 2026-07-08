const { contextBridge, ipcRenderer } = require("electron");

const isDev = !!process.env.VITE_DEV_SERVER_URL;

contextBridge.exposeInMainWorld("projectB", {
  version: "0.1.0",

  // ── R2: Rust 엔진 범용 호출 — 새 Rust 함수는 등록 없이 이걸로 호출 ──────
  engine: (fnName, payload) => ipcRenderer.invoke("engine:call", fnName, payload),

  // ── R3a: 슬롯 DB v3 커맨드 — 상태 변이/조회의 유일 경로 (repo 계층 전용) ──
  repo: (cmd, payload) =>
    ipcRenderer.invoke("repo:call", cmd, payload === undefined ? undefined : JSON.stringify(payload)),

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
  masterLoadEntities: (leagueId, seasonYear, slotId) => ipcRenderer.invoke("master:loadEntities", leagueId, seasonYear, slotId),
  masterUpsertEntity:      (entity)  => ipcRenderer.invoke("master:upsertEntity",       entity),
  masterBulkUpsertEntities: (p)      => ipcRenderer.invoke("master:bulkUpsertEntities", p),
  masterDeleteEntity: (payload) => ipcRenderer.invoke("master:deleteEntity",        payload),

  // ── 마운드 방문 ─────────────────────────────────────────────────────────
  matchMoundVisit:        ()    => ipcRenderer.invoke("match:mound-visit"),
  matchNextInning:        ()    => ipcRenderer.invoke("match:next-inning"),
  matchRunSimpleGame:     (p)   => ipcRenderer.invoke("match:runSimpleGame", p),
  matchSimulateToEntry:   (req) => ipcRenderer.invoke("match:simulateToEntry", req),
  matchAutoFinishFromEntry: ()  => ipcRenderer.invoke("match:autoFinishFromEntry"),

  // ── NPC 시뮬 (Phase 3) ──────────────────────────────────────────────────────
  npcSimGame:                   (p) => ipcRenderer.invoke("engine:call", "simGameNative",                   p),
  npcCalcWeeklyGrowth:          (p) => ipcRenderer.invoke("engine:call", "npcCalcWeeklyGrowth",          p),
  npcRunOffseason:              (p) => ipcRenderer.invoke("engine:call", "runOffseasonNative",              p),
  npcAdvanceGrades:             (p) => ipcRenderer.invoke("engine:call", "advanceGradesNative",             p),
  npcGenerateFreshmen:          (p) => ipcRenderer.invoke("engine:call", "generateFreshmenNative",          p),
  npcRunDraft:                  (p) => ipcRenderer.invoke("engine:call", "runDraftNative",                  p),
  npcApplyDraft:                (p) => ipcRenderer.invoke("engine:call", "applyDraftNative",                p),
  npcBgHsGraduateDraft:        (p) => ipcRenderer.invoke("engine:call", "bgHsGraduateDraftNative",        p),
  npcDetermineProtagonistDraft: (p) => ipcRenderer.invoke("engine:call", "determineProtagonistDraftNative", p),
  npcAdvanceProtagonistGrade:   (p) => ipcRenderer.invoke("engine:call", "advanceProtagonistGradeNative",   p),
  npcAdvanceAllGrades:          (p) => ipcRenderer.invoke("engine:call", "advanceAllGradesNative",          p),
  npcAdvanceAllAges:            (p) => ipcRenderer.invoke("engine:call", "advanceAllAgesNative",            p),
  npcBulkInsertGameLogs:        (p) => ipcRenderer.invoke("npc:bulkInsertGameLogs",        p),
  npcTrimGameLogs:              (p) => ipcRenderer.invoke("npc:trimGameLogs",              p),
  npcGetRecentGames:            (p) => ipcRenderer.invoke("npc:getRecentGames",            p),
  npcFlushSeasonStats:          (p) => ipcRenderer.invoke("npc:flushSeasonStats",          p),
  npcGetCareerStats:            (p) => ipcRenderer.invoke("npc:getCareerStats",            p),
  npcGetByLeague:               (p) => ipcRenderer.invoke("npc:getByLeague",               p),
  npcSwapTeams:                 (p) => ipcRenderer.invoke("npc:swapTeams",                 p),
  npcUpdateContracts:           (p) => ipcRenderer.invoke("npc:updateContracts",           p),
  npcArchiveRetired:            (p) => ipcRenderer.invoke("npc:archiveRetired",            p),
  npcQueryRetiredArchive:       (p) => ipcRenderer.invoke("npc:queryRetiredArchive",       p),
  leagueAddTransactions:        (p) => ipcRenderer.invoke("league:addTransactions",        p),
  leagueGetTransactions:        (p) => ipcRenderer.invoke("league:getTransactions",        p),
  seasonSaveHistoryStandings:   (p) => ipcRenderer.invoke("season:saveHistoryStandings",   p),
  seasonSaveHistoryLbStats:     (p) => ipcRenderer.invoke("season:saveHistoryLbStats",     p),
  seasonGetHistoryYears:        (p) => ipcRenderer.invoke("season:getHistoryYears",        p),
  seasonGetHistoryStandings:    (p) => ipcRenderer.invoke("season:getHistoryStandings",    p),
  seasonGetHistoryLbStats:      (p) => ipcRenderer.invoke("season:getHistoryLbStats",      p),
  seasonSaveHistoryPostseason:  (p) => ipcRenderer.invoke("season:saveHistoryPostseason",  p),
  seasonGetHistoryPostseason:   (p) => ipcRenderer.invoke("season:getHistoryPostseason",   p),

  // ── 성장 엔진 (Phase 4) ──────────────────────────────────────────────────
  growthCalcTraining:                    (p) => ipcRenderer.invoke("engine:call", "calcTrainingGrowthNative",                         p),
  growthCalcGame:                        (p) => ipcRenderer.invoke("engine:call", "calcGameGrowthNative",                             p),
  growthCalcProtagonistAging:            (p) => ipcRenderer.invoke("engine:call", "calcProtagonistAgingNative",                 p),

  // ── 플레이어 엔진 (Phase 4) ──────────────────────────────────────────────
  careerResolveChoice:                   (p) => ipcRenderer.invoke("engine:call", "resolveCareerChoiceNative",                        p),
  pitcherAssignHighschoolPosition:       (p) => ipcRenderer.invoke("engine:call", "assignHighschoolPositionNative",            p),
  pitcherAssignRole:                     (p) => ipcRenderer.invoke("engine:call", "assignProtagonistRoleNative",                          p),
  pitcherRelieverWouldPitch:             (p) => ipcRenderer.invoke("engine:call", "relieverWouldPitchNative",                  p),
  salaryCalcSeasonRating:                (p) => ipcRenderer.invoke("engine:call", "calcSeasonRatingNative",                     p),
  salaryCalcMarketSalary:                (p) => ipcRenderer.invoke("engine:call", "calcMarketSalaryNative",                     p),
  salaryCalcOfferedSalary:               (p) => ipcRenderer.invoke("engine:call", "calcOfferedSalaryNative",                    p),
  salaryCalcOfferedSalaryForProtagonist: (p) => ipcRenderer.invoke("engine:call", "calcOfferedSalaryForProtagonistNative",      p),
  faGenerateOffers:                      (p) => ipcRenderer.invoke("engine:call", "generateFaOffersNative",                           p),
  draftCalcDraftRank:                    (p) => ipcRenderer.invoke("engine:call", "calcDraftRankNative",                         p),
  draftRunBoard:                         (p) => ipcRenderer.invoke("engine:call", "runDraftBoardNative",                              p),
  militaryCalcCandidates:                (p) => ipcRenderer.invoke("engine:call", "calcSportsUnitCandidatesNative",                     p),
  militaryCalcSelection:                 (p) => ipcRenderer.invoke("engine:call", "calcSportsUnitSelectionNative",                      p),
  militaryPickGeneral:                   (p) => ipcRenderer.invoke("engine:call", "pickGeneralEnlisteesNative",                        p),
  militaryEarlyEnlistDecisions:          (p) => ipcRenderer.invoke("engine:call", "calcEarlyEnlistDecisionsNative",              p),
  calcNpcRenewalSalaryNative:            (p) => ipcRenderer.invoke("engine:call", "calcNpcRenewalSalaryNative",                       p),
  calcNpcContractYearsNative:            (p) => ipcRenderer.invoke("engine:call", "calcNpcContractYearsNative",                       p),
  indieCalcScoutOffer:                   (p) => ipcRenderer.invoke("engine:call", "calcIndieScoutOfferNative",                         p),

  // ── 스케줄 엔진 (Phase 5) ────────────────────────────────────────────────
  scheduleGeneric:           (p) => ipcRenderer.invoke("engine:call", "generateScheduleNative",           p),
  scheduleKbl:               (p) => ipcRenderer.invoke("engine:call", "generateKblScheduleNative",               p),
  scheduleAbl:               (p) => ipcRenderer.invoke("engine:call", "generateAblScheduleNative",               p),
  scheduleJbl:               (p) => ipcRenderer.invoke("engine:call", "generateJblScheduleNative",               p),
  scheduleLeague:            (p) => ipcRenderer.invoke("engine:call", "generateLeagueScheduleNative",            p),
  scheduleAllLeagues:        (p) => ipcRenderer.invoke("engine:call", "generateAllLeagueSchedulesNative",        p),

  // ── 포스트시즌 엔진 (Phase 5) ──────────────────────────────────────────────
  postseasonBuildKbl:   (p) => ipcRenderer.invoke("engine:call", "buildKblBracketNative",   p),
  postseasonBuildAbl:   (p) => ipcRenderer.invoke("engine:call", "buildAblBracketNative",   p),
  postseasonBuildUniv:  (p) => ipcRenderer.invoke("engine:call", "buildUnivBracketNative",  p),
  postseasonBuildInd:   (p) => ipcRenderer.invoke("engine:call", "buildIndBracketNative",   p),
  postseasonBuildJbl:   (p) => ipcRenderer.invoke("engine:call", "buildJblBracketNative",   p),
  postseasonApplyGame:  (p) => ipcRenderer.invoke("engine:call", "applyGameToSeriesNative",  p),
  postseasonFillNext:   (p) => ipcRenderer.invoke("engine:call", "fillNextSeriesNative",   p),
  postseasonResolveNpc: (p) => ipcRenderer.invoke("engine:call", "resolveNonProtagonistSeriesNative", p),
  postseasonMakeGame:   (p) => ipcRenderer.invoke("engine:call", "makeSeriesGameNative",   p),
  postseasonShuffleAbl: (p) => ipcRenderer.invoke("engine:call", "shuffleAblConferencesNative", p),
  weekCalcFacilityEff:   (p) => ipcRenderer.invoke("engine:call", "weekCalcFacilityEffNative",   p),
  weekCalcWeeklyNet:     (p) => ipcRenderer.invoke("engine:call", "weekCalcWeeklyNetNative",     p),
  weekCalcInjury:        (p) => ipcRenderer.invoke("engine:call", "weekCalcInjuryNative",        p),
  weekCalcHsAdmissions:  (p) => ipcRenderer.invoke("engine:call", "weekCalcHsAdmissionsNative",  p),
  weekCalcTradeRumor:    (p) => ipcRenderer.invoke("engine:call", "weekCalcTradeRumorNative",    p),
  weekCalcExamResult:    (p) => ipcRenderer.invoke("engine:call", "weekCalcExamResultNative",    p),
  weekCalcMilitary:      (p) => ipcRenderer.invoke("engine:call", "weekCalcMilitaryNative",      p),
  weekCalcNpcFallback:   (p) => ipcRenderer.invoke("engine:call", "weekCalcNpcFallbackNative",   p),
  weekCalcNpcInjuries:   (p) => ipcRenderer.invoke("engine:call", "weekCalcNpcInjuriesNative",   p),
  weekRollRandomBatch:   (count) => ipcRenderer.invoke("week:rollRandomBatch", count),

  // ── scouting_engine ──────────────────────────────────────────────────────────
  applyScoutingNoiseNative:        (p) => ipcRenderer.invoke("engine:call", "applyScoutingNoiseNative", p),

  // ── team_engine ──────────────────────────────────────────────────────────────
  evalCallupCandidatesNative:      (p) => ipcRenderer.invoke("engine:call", "evalCallupCandidatesNative", p),
  evalCalldownCandidatesNative:    (p) => ipcRenderer.invoke("engine:call", "evalCalldownCandidatesNative", p),
  evalReleasePriorityNative:       (p) => ipcRenderer.invoke("engine:call", "evalReleasePriorityNative", p),
  evalFaBidNative:                 (p) => ipcRenderer.invoke("engine:call", "evalFaBidNative", p),
  evalRenewalOfferNative:          (p) => ipcRenderer.invoke("engine:call", "evalRenewalOfferNative", p),
  evalNewContractNative:           (p) => ipcRenderer.invoke("engine:call", "evalNewContractNative", p),
  evalRetirementSuggestionNative:  (p) => ipcRenderer.invoke("engine:call", "evalRetirementSuggestionNative", p),
  generateTradeProposalsNative:    (p) => ipcRenderer.invoke("engine:call", "generateTradeProposalsNative", p),
  evalTradeValueNative:            (p) => ipcRenderer.invoke("engine:call", "evalTradeValueNative", p),
  evalMedicalTestNative:           (p) => ipcRenderer.invoke("engine:call", "evalMedicalTestNative",    p),
  calcWinNowPressureUpdateNative:  (p) => ipcRenderer.invoke("engine:call", "calcWinNowPressureUpdateNative", p),
  calcScoutingImprovementNative:   (p) => ipcRenderer.invoke("engine:call", "calcScoutingImprovementNative", p),

  // ── player_agent ─────────────────────────────────────────────────────────────
  playerEvalFaDecisionNative:         (p) => ipcRenderer.invoke("engine:call", "playerEvalFaDecisionNative", p),
  playerEvalTradeResponseNative:      (p) => ipcRenderer.invoke("engine:call", "playerEvalTradeResponseNative", p),
  playerEvalContractOfferNative:      (p) => ipcRenderer.invoke("engine:call", "playerEvalContractOfferNative", p),
  playerEvalRetirementResponseNative: (p) => ipcRenderer.invoke("engine:call", "playerEvalRetirementResponseNative", p),
  playerRankFaOffersNative:           (p) => ipcRenderer.invoke("engine:call", "playerRankFaOffersNative", p),
  updatePlayerLoyaltyNative:          (p) => ipcRenderer.invoke("engine:call", "updatePlayerLoyaltyNative", p),

  // ── dev 전용 (프로덕션 빌드에서 미노출) ────────────────────────────────
  ...(isDev && {
    logWrite: (p)                => ipcRenderer.invoke("log:write",         p),
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
