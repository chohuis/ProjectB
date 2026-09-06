import type { SaveGame } from "./save";
import type { SaveSeason } from "./season";

export {};

export interface SaveSlotPreview {
  careerStage: string | null;
  seasonYear: number | null;
  currentWeek: number | null;
  teamId: string | null;
  /** 통산 요약 — 슬롯 목록이 전체 세이브를 열지 않고도 성적을 보여주기 위한 것 */
  careerW: number | null;
  careerL: number | null;
  /** 문자열이다. "3.36" 형태로 이미 반올림돼 있다 */
  careerEra: string | null;
  careerSeasons: number | null;
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
      /** 창 크기 — 받아들이는 값은 main 쪽 목록(`ipc/window.cjs`)이 정한다 */
      windowSetSize: (size: string) => Promise<{ ok: boolean; mode?: string; reason?: string; width?: number; height?: number }>;
      windowGetState: () => Promise<{ ok: boolean; width?: number; height?: number; fullscreen?: boolean }>;
      matchStart: (request?: {
        /** 🔴 **계측 모드에서만 넘긴다** — `utils/protagonistMatchSeed.ts` */
        seed?: number;
        leagueId?: string;
        /** 1.1 A② §6-1 — 리그가 정하는 것 한 벌 (`utils/matchLeagueOptions.ts`) */
        pitchLimitOverride?: number;
        starterOutsFactor?: number;
        closerGate?: { inningThreshold: number; maxLeadDiff: number; minLeadDiff: number };
        restGuard?: { lastPitchedDate: string; lastPitchCount: number; gameDate: string };
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
        // 벤치 — 대타 후보. **절대 좌표**다(홈/원정), 별칭이 없다
        homeBench?: MatchBatterStats[];
        awayBench?: MatchBatterStats[];
        awayLineup?: MatchBatterStats[];
        myManager?: { tacticalIQ?: number; bullpenRead?: number; offenseMind?: number; motivator?: number; clutchDecision?: number };
        opponentManager?: { tacticalIQ?: number; bullpenRead?: number; offenseMind?: number; motivator?: number; clutchDecision?: number };
        weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
        park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
        fielders?: MatchFielderStats[];
        /** 상대 수비진. ⚠ 안 넘기면 양 반 모두 `fielders`가 지킨다 */
        opponentFielders?: MatchFielderStats[];
      }) => Promise<{ snapshot: MatchSnapshot }>;
      matchStep: (decision: PitchDecision) => Promise<{
        snapshot: MatchSnapshot;
        outcome: {
          resultCode: string;
          quality: number;
          comment: string;
          animationCues: MatchAnimationCue[];
          landingTarget: { x: number; y: number };
          /**
           * 어떤 타구였나. **엔진은 처음부터 보내고 있었는데 여기 선언이 없어
           * 화면이 못 봤다** — 값이 없던 게 아니라 타입이 좁았다.
           */
          ballInPlay?: {
            hitType: "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt";
            zone: string;
            /** 타구 강도 1~5 */
            hardness: number;
          } | null;
          /** 누가 잡아 어디로 던졌나 */
          fieldingResult?: {
            fielder: { position: string; name?: string };
            isError: boolean;
            threwTo?: string | null;
            throwResult?: string | null;
            runnerExtraAdvance: number;
          } | null;
        } | null;
        midGameInjury?: { injuryType: string; severity: string } | null;
        /** 도루·주루·실책 — 사람이 읽는 문장만. 개발자용 한 줄은 안 섞인다 */
        narrativeLogs?: string[];
        error?: string;
      }>;
      /**
       * ⚠ **선언이 현실보다 뒤처져 있었다** (2026-08-28). `match.cjs`는
       * `protagonistEntered`도 함께 돌려주는데 여기 없어서 화면이
       * svelte-check 오류를 안고 있었다. `earnedRuns`를 붙이면서 같이 적는다.
       *
       * 🔴 `earnedRuns`는 **주인공 자책점**이다(`erSinceEntry`). 이걸 안 돌려줘서
       * 화면이 `피안타 × 0.35`로 값을 지어내고 있었다.
       * ⚠ 주인공 줄은 `playerLines`에 없다 — 엔진이 등판 중엔 큐 누적을
       * 건너뛰고 `*_since_entry`에 따로 쌓는다.
       */
      matchFinish: () => Promise<{
        snapshot: MatchSnapshot;
        summary: string;
        batterLines?: { playerId: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; k: number }[];
        playerLines?: unknown[];
        earnedRuns?: number;
        protagonistEntered?: boolean;
      }>;
      matchMoundVisit: () => Promise<{ snapshot: MatchSnapshot } | null>;
      matchNextInning: () => Promise<{ snapshot: MatchSnapshot; logs: string[]; batchStats: { hits: number; walks: number; errors: number; isTop: boolean } | null; protagonistJustExited: boolean; exitReason: string | null }>;
      matchRunSimpleGame: (paramsJson: string) => Promise<string>;
      matchSimulateToEntry: (request?: {
        /** 🔴 **계측 모드에서만 넘긴다** — 실제 플레이는 안 넘겨서 Rust 가
         *  `thread_rng` 로 돈다(`utils/protagonistMatchSeed.ts`). 0 은
         *  "씨앗 없음"이라 못 쓴다 */
        seed?: number;
        /** ⚠ **여덟 개를 다 받는다.** 넷만 선언해 두면 호출부가 control·movement를
         * 넘기려 해도 타입이 막고, 그대로 두면 OVR의 33%가 엔진에 안 간다 */
        pitcher?: { arsenal?: { type: string; grade: number }[]; developingDifficulty?: number; name?: string;
          command?: number; velocity?: number; staminaCap?: number; mentalResil?: number;
          control?: number; movement?: number; clutch?: number; holdRunners?: number; };
        batterMean?: number;
        role?: "SP" | "RP" | "CP";
        /** 🔴 이 경기의 리그 — Rust `MatchStartOptions.league_id`. 안 넘기면 투구수 상한이
         *  리그 기본(120)이라 고교 105구가 안 걸린다 (2026-09-03) */
        leagueId?: string;
        /** 1.1 A② §6-1 — 리그가 정하는 것 한 벌 (`utils/matchLeagueOptions.ts`). 규칙 파일이 정본 */
        pitchLimitOverride?: number;
        starterOutsFactor?: number;
        closerGate?: { inningThreshold: number; maxLeadDiff: number; minLeadDiff: number };
        restGuard?: { lastPitchedDate: string; lastPitchCount: number; gameDate: string };
        protagonistSide?: "home" | "away";
        opponentLineup?: MatchBatterStats[];
        myTeamLineup?: MatchBatterStats[];
        /** ⚠ **주인공 소속팀 야수.** 안 넘기면 엔진이 평균 50짜리 수비를 만든다
         * (`create_default_fielders(rng, 50.0)`). 리그 실제 수비는 66 수준이라
         * 주인공만 16점 약한 뒤를 두고 던졌다 — 120경기 실측에서 ERA 10.29 → 7.22 */
        fielders?: MatchFielderStats[];
        /** 🔴 **상대 수비진.** 안 넘기면 엔진이 양 반 모두 `fielders`를 쓴다 —
         *  **주인공 팀이 공격할 때도 주인공 팀 수비수가 잡는다** (2026-08-29) */
        opponentFielders?: MatchFielderStats[];
        opponentPitcher?: { arsenal?: { type: string; grade: number }[]; developingDifficulty?: number; name?: string; command?: number; velocity?: number; staminaCap?: number; mentalResil?: number; control?: number; movement?: number; clutch?: number; holdRunners?: number; };
        npcStarterPitcher?: { arsenal?: { type: string; grade: number }[]; developingDifficulty?: number; name?: string; command?: number; velocity?: number; staminaCap?: number; mentalResil?: number; control?: number; movement?: number; clutch?: number; holdRunners?: number; };
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
      seasonGetTeamHistory:         (p: string) => Promise<string>;
      seasonGetHistoryLbStats:      (p: string) => Promise<string>;
      seasonSaveHistoryPostseason:  (p: string) => Promise<string>;
      seasonGetHistoryPostseason:   (p: string) => Promise<string>;
      seasonSaveHistoryTournaments: (p: string) => Promise<string>;
      seasonGetHistoryTournaments:  (p: string) => Promise<string>;
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
      postseasonBuildJbl:   (p: string) => Promise<string>;
      postseasonApplyGame:  (p: string) => Promise<string>;
      postseasonFillNext:   (p: string) => Promise<string>;
      postseasonResolveNpc: (p: string) => Promise<string>;
      postseasonMakeGame:   (p: string) => Promise<string>;
      postseasonShuffleAbl: (p: string) => Promise<string>;
      // ── 주간 엔진 ──────────────────────────────────────────
      weekCalcFacilityEff:  (p: string) => Promise<string>;
      weekCalcInjury:       (p: string) => Promise<string>;
      weekCalcHsAdmissions: (p: string) => Promise<string>;
      weekCalcExamResult:   (p: string) => Promise<string>;
      weekCalcMilitary:     (p: string) => Promise<string>;
      weekCalcNpcFallback:  (p: string) => Promise<string>;
      weekCalcNpcInjuries:  (p: string) => Promise<string>;
      weekRollRandomBatch:  (count: number, seed?: number) => Promise<string>;
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
      // ⚠ `masterLoadEntities`·`masterBulkUpsertEntities` 둘은 2026-09-04에
      // 지웠다 — `master.db`를 접었다. 읽던 표(`npc_master`)가 0행이었고,
      // 선수·스태프는 slot.db가 정본이다.
      // ⚠ `masterSave`·`tuning*` 다섯은 2026-08-20에 지웠다 — Ctrl+Q의
      // 이벤트·업적 에디터와 매치 엔진 랩을 없애면서 부르는 곳이 0이 됐다.
      // 콘텐츠는 `resource/data/master/` 파일을 직접 고치고, 튜닝 수치도
      // 파일을 고친다(시작 시 `applyTuningFromFile`이 먹인다).
      // 배치 시뮬은 `npm run smoke`
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
