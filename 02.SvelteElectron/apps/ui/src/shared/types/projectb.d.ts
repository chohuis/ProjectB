import type { SaveGame } from "./save";
import type { SaveSeason } from "./season";

export {};

export interface SaveSlotPreview {
  careerStage: string | null;
  seasonYear: number | null;
  currentWeek: number | null;
  teamId: string | null;
}

export interface SaveSlotMeta {
  slotId: string;
  name: string;
  updatedAt: string;
  preview: SaveSlotPreview;
}

export interface SaveSlotEnvelope {
  version: number;
  slotMeta: SaveSlotMeta;
  game: SaveGame | null;
  season: SaveSeason | null;
}

declare global {
  interface Window {
    projectB?: {
      version: string;

      // ── R2: Rust 엔진 범용 호출 (engine:call 단일 채널) ─────
      // 새 Rust 함수는 개별 브릿지 등록 없이 이것으로 호출한다.
      // fnName = engine-native index.d.ts의 export 함수명 (camelCase)
      engine: (fnName: string, payload?: string | number) => Promise<string>;

      // ── R3a: 슬롯 DB v3 커맨드 (repo:call 단일 채널) ────────
      // 직접 호출 금지 — shared/repo/* 모듈만 사용한다 (DESIGN.md §8.2 원칙 3)
      repo: (cmd: string, payload?: unknown) => Promise<string>;

      // ── 경기 엔진 ──────────────────────────────────────────
      matchStart: (request?: {
        matchId?: string;
        inningLimit?: number;
        initialStamina?: number;
        initialMental?: number;
        protagonistSide?: "home" | "away";
        role?: "SP" | "RP" | "CP";
        entryTrigger?: { type: "inning_start"; inning: number }
          | { type: "mid_inning"; inning: number; maxOuts: number }
          | { type: "close_game"; inningThreshold: number; maxLeadDiff: number };
        pitcher?: {
          name?: string; command?: number; velocity?: number; staminaCap?: number;
          mentalResil?: number; control?: number; movement?: number;
          clutch?: number; holdRunners?: number;
        };
        opponentPitcher?: {
          name?: string; command?: number; velocity?: number; staminaCap?: number;
          mentalResil?: number; control?: number; movement?: number;
          clutch?: number; holdRunners?: number;
        };
        npcStarterPitcher?: {
          name?: string; command?: number; velocity?: number; staminaCap?: number;
          mentalResil?: number; control?: number; movement?: number;
          clutch?: number; holdRunners?: number;
        };
        batterMean?: number;
        opponentLineup?: MatchBatterStats[];
        myTeamLineup?: MatchBatterStats[];
        homeLineup?: MatchBatterStats[];
        awayLineup?: MatchBatterStats[];
        myManager?: { tacticalIQ?: number; bullpenRead?: number; offenseMind?: number; motivator?: number; clutchDecision?: number };
        opponentManager?: { tacticalIQ?: number; bullpenRead?: number; offenseMind?: number; motivator?: number; clutchDecision?: number };
        weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
        park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
        fielders?: MatchFielderStats[];
      }) => Promise<{ snapshot: MatchSnapshot }>;
      matchStep: (decision: PitchDecision) => Promise<{
        snapshot: MatchSnapshot;
        outcome: {
          resultCode: string;
          quality: number;
          comment: string;
          animationCues: MatchAnimationCue[];
          landingTarget: { x: number; y: number };
        } | null;
        midGameInjury?: { injuryType: string; severity: string } | null;
        error?: string;
      }>;
      matchFinish: () => Promise<{ snapshot: MatchSnapshot; summary: string; batterLines?: unknown[]; playerLines?: unknown[] }>;
      matchMoundVisit: () => Promise<{ snapshot: MatchSnapshot } | null>;
      matchNextInning: () => Promise<{ snapshot: MatchSnapshot; logs: string[]; batchStats: { hits: number; walks: number; errors: number; isTop: boolean } | null; protagonistJustExited: boolean; exitReason: string | null }>;
      matchRunSimpleGame: (paramsJson: string) => Promise<string>;
      matchSimulateToEntry: (request?: {
        pitcher?: { name?: string; command?: number; velocity?: number; staminaCap?: number; mentalResil?: number; };
        batterMean?: number;
        role?: "SP" | "RP" | "CP";
        protagonistSide?: "home" | "away";
        opponentLineup?: MatchBatterStats[];
        myTeamLineup?: MatchBatterStats[];
        opponentPitcher?: { name?: string; command?: number; velocity?: number; staminaCap?: number; mentalResil?: number; control?: number; movement?: number; clutch?: number; holdRunners?: number; };
        npcStarterPitcher?: { name?: string; command?: number; velocity?: number; staminaCap?: number; mentalResil?: number; control?: number; movement?: number; clutch?: number; holdRunners?: number; };
      }) => Promise<string>;
      matchAutoFinishFromEntry: () => Promise<string>;
      // ── 게임 저장/불러오기 ──────────────────────────────────
      gameLoad:   () => Promise<SaveGame | null>;
      gameSave:   (data: SaveGame) => Promise<{ ok: boolean; error?: string }>;
      seasonLoad: () => Promise<SaveSeason | null>;
      seasonSave: (data: SaveSeason) => Promise<{ ok: boolean; error?: string }>;
      listSlots: () => Promise<SaveSlotMeta[]>;
      loadSlot: (slotId: string) => Promise<SaveSlotEnvelope | null>;
      saveSlot: (payload: { slotId: string; game: SaveGame | null; season: SaveSeason | null }) => Promise<{
        ok: boolean;
        slot?: SaveSlotEnvelope;
        error?: string;
      }>;
      deleteSlot: (slotId: string) => Promise<{ ok: boolean; error?: string }>;
      renameSlot: (payload: { slotId: string; name: string }) => Promise<{ ok: boolean; error?: string }>;
      // ── 주 진행 ────────────────────────────────────────────
      dayAdvance: (state: CoreGameState) => Promise<DayAdvanceResult>;
      // ── NPC 시뮬 ───────────────────────────────────────────
      npcSimGame:                   (p: string) => Promise<string>;
      npcRunOffseason:              (p: string) => Promise<string>;
      npcAdvanceGrades:             (p: string) => Promise<string>;
      npcGenerateFreshmen:          (p: string) => Promise<string>;
      npcRunDraft:                  (p: string) => Promise<string>;
      npcApplyDraft:                (p: string) => Promise<string>;
      npcBgHsGraduateDraft:        (p: string) => Promise<string>;
      npcDetermineProtagonistDraft: (p: string) => Promise<string>;
      npcAdvanceProtagonistGrade:   (p: string) => Promise<string>;
      npcAdvanceAllGrades:          (p: string) => Promise<string>;
      npcAdvanceAllAges:            (p: string) => Promise<string>;
      npcCalcWeeklyGrowth:          (p: string) => Promise<string>;
      // ── NPC 경기 기록 ──────────────────────────────────────────
      npcBulkInsertGameLogs:        (p: string) => Promise<string>;
      npcTrimGameLogs:              (p: string) => Promise<string>;
      npcGetRecentGames:            (p: string) => Promise<string>;
      npcFlushSeasonStats:          (p: string) => Promise<string>;
      npcGetCareerStats:            (p: string) => Promise<string>;
      npcGetByLeague:               (p: string) => Promise<string>;
      npcSwapTeams:                 (p: string) => Promise<string>;
      leagueAddTransactions:        (p: string) => Promise<string>;
      leagueGetTransactions:        (p: string) => Promise<string>;
      seasonSaveHistoryStandings:   (p: string) => Promise<string>;
      seasonSaveHistoryLbStats:     (p: string) => Promise<string>;
      seasonGetHistoryYears:        (p: string) => Promise<string>;
      seasonGetHistoryStandings:    (p: string) => Promise<string>;
      seasonGetHistoryLbStats:      (p: string) => Promise<string>;
      seasonSaveHistoryPostseason:  (p: string) => Promise<string>;
      seasonGetHistoryPostseason:   (p: string) => Promise<string>;
      // ── 성장 엔진 ───────────────────────────────────────────
      growthCalcTraining:          (p: string) => Promise<string>;
      growthCalcGame:              (p: string) => Promise<string>;
      growthCalcProtagonistAging:  (p: string) => Promise<string>;
      // ── 플레이어 엔진 ──────────────────────────────────────
      careerResolveChoice:                   (p: string) => Promise<string>;
      pitcherAssignHighschoolPosition:       (p: string) => Promise<string>;
      pitcherAssignRole:                     (p: string) => Promise<string>;
      pitcherRelieverWouldPitch:             (p: string) => Promise<string>;
      salaryCalcSeasonRating:                (p: string) => Promise<string>;
      salaryCalcMarketSalary:                (p: string) => Promise<string>;
      salaryCalcOfferedSalary:               (p: string) => Promise<string>;
      salaryCalcOfferedSalaryForProtagonist: (p: string) => Promise<string>;
      calcNpcRenewalSalaryNative:            (p: string) => Promise<string>;
      calcNpcContractYearsNative:            (p: string) => Promise<string>;
      npcUpdateContracts:                    (p: string) => Promise<string>;
      npcArchiveRetired:                     (p: string) => Promise<string>;
      npcQueryRetiredArchive:                (p: string) => Promise<string>;
      faGenerateOffers:                      (p: string) => Promise<string>;
      draftCalcDraftRank:                    (p: string) => Promise<string>;
      draftRunBoard:                         (p: string) => Promise<string>;
      militaryCalcCandidates:                (p: string) => Promise<string>;
      militaryCalcSelection:                 (p: string) => Promise<string>;
      militaryPickGeneral:                   (p: string) => Promise<string>;
      militaryEarlyEnlistDecisions:          (p: string) => Promise<string>;
      indieCalcScoutOffer:                   (p: string) => Promise<string>;
      // ── 스케줄 엔진 ────────────────────────────────────────
      scheduleGeneric:           (p: string) => Promise<string>;
      scheduleKbl:               (p: string) => Promise<string>;
      scheduleAbl:               (p: string) => Promise<string>;
      scheduleJbl:               (p: string) => Promise<string>;
      scheduleLeague:            (p: string) => Promise<string>;
      scheduleAllLeagues:        (p: string) => Promise<string>;
      // ── 포스트시즌 엔진 ────────────────────────────────────
      postseasonBuildKbl:   (p: string) => Promise<string>;
      postseasonBuildAbl:   (p: string) => Promise<string>;
      postseasonBuildUniv:  (p: string) => Promise<string>;
      postseasonBuildInd:   (p: string) => Promise<string>;
      postseasonBuildJbl:   (p: string) => Promise<string>;
      postseasonApplyGame:  (p: string) => Promise<string>;
      postseasonFillNext:   (p: string) => Promise<string>;
      postseasonResolveNpc: (p: string) => Promise<string>;
      postseasonMakeGame:   (p: string) => Promise<string>;
      postseasonShuffleAbl: (p: string) => Promise<string>;
      // ── 주간 엔진 ──────────────────────────────────────────
      weekCalcFacilityEff:  (p: string) => Promise<string>;
      weekCalcWeeklyNet:    (p: string) => Promise<string>;
      weekCalcInjury:       (p: string) => Promise<string>;
      weekCalcHsAdmissions: (p: string) => Promise<string>;
      weekCalcTradeRumor:   (p: string) => Promise<string>;
      weekCalcExamResult:   (p: string) => Promise<string>;
      weekCalcMilitary:     (p: string) => Promise<string>;
      weekCalcNpcFallback:  (p: string) => Promise<string>;
      weekCalcNpcInjuries:  (p: string) => Promise<string>;
      weekRollRandomBatch:  (count: number) => Promise<string>;
      // ── scouting_engine ────────────────────────────────────
      applyScoutingNoiseNative(p: string): Promise<string>;
      // ── team_engine ────────────────────────────────────────
      evalCallupCandidatesNative(p: string): Promise<string>;
      evalCalldownCandidatesNative(p: string): Promise<string>;
      evalReleasePriorityNative(p: string): Promise<string>;
      evalFaBidNative(p: string): Promise<string>;
      evalRenewalOfferNative(p: string): Promise<string>;
      evalNewContractNative(p: string): Promise<string>;
      evalRetirementSuggestionNative(p: string): Promise<string>;
      generateTradeProposalsNative(p: string): Promise<string>;
      evalTradeValueNative(p: string): Promise<string>;
      evalMedicalTestNative(p: string): Promise<string>;
      calcWinNowPressureUpdateNative(p: string): Promise<string>;
      calcScoutingImprovementNative(p: string): Promise<string>;
      // ── player_agent ───────────────────────────────────────
      playerEvalFaDecisionNative(p: string): Promise<string>;
      playerEvalTradeResponseNative(p: string): Promise<string>;
      playerEvalContractOfferNative(p: string): Promise<string>;
      playerEvalRetirementResponseNative(p: string): Promise<string>;
      playerRankFaOffersNative(p: string): Promise<string>;
      updatePlayerLoyaltyNative(p: string): Promise<string>;
      // ── 마스터 데이터 (Electron 패키징 환경용 fallback) ──────
      masterFetch: (relPath: string) => Promise<unknown>;
      masterLoadEntities: (leagueId: string, seasonYear?: number, slotId?: string) => Promise<unknown[]>;
      masterUpsertEntity:       (entity: unknown) => Promise<{ ok: boolean; error?: string }>;
      masterBulkUpsertEntities: (p: { slotId: string; entities: unknown[] }) => Promise<string>;
      masterDeleteEntity: (payload: { id: string; leagueId?: string; slotId?: string }) => Promise<{ ok: boolean; error?: string }>;
      masterSave: (payload: { relPath: string; data: unknown; backup?: boolean }) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      tuningLoad: () => Promise<{
        ok: boolean;
        data?: MatchEngineTuningPayload;
        error?: string;
        details?: string[];
      }>;
      tuningValidate: (payload: MatchEngineTuningPayload | { tuning: MatchEngineTuningPayload }) => Promise<{
        ok: boolean;
        errors: string[];
      }>;
      tuningApply: (payload: MatchEngineTuningPayload | { tuning: MatchEngineTuningPayload }) => Promise<{
        ok: boolean;
        error?: string;
        details?: string[];
        smoke?: MatchEngineSimMetrics;
        smokeGate?: { ok: boolean; failures: string[] };
      }>;
      tuningSave: (payload: MatchEngineTuningPayload | { tuning: MatchEngineTuningPayload; forceSave?: boolean }) => Promise<{
        ok: boolean;
        data?: MatchEngineTuningPayload;
        error?: string;
        details?: string[];
        gateFailed?: boolean;
        smoke?: MatchEngineSimMetrics;
        thresholds?: MatchEngineSmokeThresholds;
        gateBypassed?: boolean;
      }>;
      tuningSmoke: (payload?: { tuning?: MatchEngineTuningPayload; games?: number }) => Promise<{
        ok: boolean;
        error?: string;
        details?: string[];
        smoke?: MatchEngineSimMetrics;
        smokeGate?: { ok: boolean; failures: string[] };
        thresholds?: MatchEngineSmokeThresholds;
      }>;
      onContentChanged?: (cb: (data: unknown) => void) => void;
      logWrite?: (payload: string) => Promise<string>;
    };
  }
}

export interface CoreGameState {
  day: number;
  seasonYear: number;
  stage: string;
  playerName: string;
  teamName: string;
  morale: number;
}

export interface DayAdvanceResult {
  snapshot: CoreGameState;
  logs: string[];
}

/** @deprecated SaveGame / SaveSeason 타입으로 교체됨 */
export type GameSaveData = Record<string, unknown>;

export interface PitchDecision {
  pitchType: "fastball" | "sinker" | "cutter" | "slider" | "curve" | "changeup" | "splitter" | "forkball" | "screwball" | "knuckleball";
  location: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** 연속 좌표 타겟. 스트라이크존 밖이면 의도적 볼 */
  target?: { x: number; y: number };
  strategy: "aggressive" | "balanced" | "safe";
  power: "low" | "normal" | "high";
}

export interface MatchBatterStats {
  id?: string;
  name?: string;
  contact: number;
  power: number;
  eye: number;
  discipline: number;
  battingClutch: number;
  platoon: number;
  speed: number;
  baseInstinct: number;
  fielding: number;
  arm: number;
}

export interface MatchFielderStats {
  position: "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
  name: string;
  fielding: number;
  arm: number;
  speed: number;
  x: number;
  y: number;
}

export interface MatchDefenseStat {
  errors: number;
  assists: number;
  throwOuts: number;
  throwSafes: number;
}

export interface MatchSnapshot {
  matchId: string;
  inning: number;
  inningLimit: number;
  half: "top" | "bottom";
  outs: number;
  count: { balls: number; strikes: number };
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };
  runners: { first: boolean; second: boolean; third: boolean };
  pitchCount: number;
  protagonistStamina: number;
  protagonistMental: number;
  protagonistHasEntered: boolean;
  protagonistExited: boolean;
  protagonistSide: "home" | "away";
  role: "SP" | "RP" | "CP";
  pitchCountSinceEntry: number;
  moundVisitsLeft: number;
  isProtagonistPitching: boolean;
  currentBatter?: MatchBatterStats;
  weather: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  park: "neutral" | "pitcher_park" | "hitter_park" | "dome";
  isFinished: boolean;
  recentLogs: string[];
  autoSimLogs?: string[];
  fielders: MatchFielderStats[];
  defenseStat: MatchDefenseStat;
}

export type MatchFieldPos = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
export type MatchBallHitType = "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt";

export type MatchAnimationCue =
  | { type: "ball_pitch";   from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
  | { type: "ball_batted";  from: { x: number; y: number }; to: { x: number; y: number }; arc: number; hitType: MatchBallHitType; duration: number }
  | { type: "fielder_move"; position: MatchFieldPos; to: { x: number; y: number }; duration: number }
  | { type: "ball_throw";   from: { x: number; y: number }; to: { x: number; y: number }; duration: number }
  | { type: "runner_advance"; runnerId: "first" | "second" | "third" | "batter"; toBase: "1B" | "2B" | "3B" | "home"; duration: number }
  | { type: "show_result";  text: string; tone: "good" | "bad" | "neutral"; x: number; y: number };

export interface MatchEngineTuningPayload {
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  pitchBase: { fastball: number; slider: number; curve: number; changeup: number };
  strategyBonus: { aggressive: number; balanced: number; safe: number };
  powerBonus: { low: number; normal: number; high: number };
  locationBonus: Record<string, number>;
  staminaBase: number;
  staminaAggressiveBonus: number;
  staminaFastballBonus: number;
  staminaPowerCost: { low: number; normal: number; high: number };
  mentalRecoveryOnInningEnd: number;
  hitUpgradeSingleToDoubleBase: number;
  hitUpgradeDoubleToHomeRunBase: number;
  weatherPowerModifier: { sunny: number; cloudy: number; rainy: number; windy_in: number; windy_out: number };
  weatherQualityModifier: { rainyFastball: number; rainyBreaking: number; windyOut: number; windyIn: number; cloudy: number };
  parkQualityModifier: { neutral: number; pitcher_park: number; hitter_park: number; dome: number };
  doublePlayBaseProb: number;
}

export interface MatchEngineSimMetrics {
  games: number;
  avgAway: number;
  avgHome: number;
  avgTotalScore: number;
  avgPitches: number;
  bbRate: number;
  kRate: number;
  hrRate: number;
  p50Pitches: number;
  p90Pitches: number;
  resultRates: Record<string, number>;
}

export interface MatchEngineSmokeThresholds {
  avgTotalScore: { min: number; max: number };
  bbRate: { min: number; max: number };
  kRate: { min: number; max: number };
  hrRate: { min: number; max: number };
  avgPitches: { min: number; max: number };
}
