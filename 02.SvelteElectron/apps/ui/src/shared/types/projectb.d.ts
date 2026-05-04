import type { SaveGame } from "./save";
import type { SaveSeason } from "./season";

export {};

declare global {
  interface Window {
    projectB?: {
      version: string;
      // ── 경기 엔진 ──────────────────────────────────────────
      matchStart: (request?: {
        matchId?: string;
        inningLimit?: number;
        initialStamina?: number;
        initialMental?: number;
        pitcher?: {
          command?: number;
          velocity?: number;
          staminaCap?: number;
          mentalResil?: number;
        };
        batterMean?: number;
        weather?: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
        park?: "neutral" | "pitcher_park" | "hitter_park" | "dome";
      }) => Promise<{ snapshot: MatchSnapshot }>;
      matchStep: (decision: PitchDecision) => Promise<{
        snapshot: MatchSnapshot;
        outcome: { resultCode: string; quality: number; comment: string };
      }>;
      matchFinish: () => Promise<{ snapshot: MatchSnapshot; summary: string }>;
      // ── 게임 저장/불러오기 ──────────────────────────────────
      gameLoad:   () => Promise<SaveGame | null>;
      gameSave:   (data: SaveGame) => Promise<void>;
      seasonLoad: () => Promise<SaveSeason | null>;
      seasonSave: (data: SaveSeason) => Promise<void>;
      // ── 주 진행 ────────────────────────────────────────────
      dayAdvance: (state: CoreGameState) => Promise<DayAdvanceResult>;
      // ── 마스터 데이터 (Electron 패키징 환경용 fallback) ──────
      masterFetch: (relPath: string) => Promise<unknown>;
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
  pitchType: "fastball" | "slider" | "curve" | "changeup";
  location: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  strategy: "aggressive" | "balanced" | "safe";
  power: "low" | "normal" | "high";
}

export interface MatchSnapshot {
  matchId: string;
  inning: number;
  inningLimit: number;
  half: "top" | "bottom";
  outs: number;
  count: { balls: number; strikes: number };
  score: { home: number; away: number };
  runners: { first: boolean; second: boolean; third: boolean };
  pitchCount: number;
  stamina: number;
  mental: number;
  batter: { contact: number; power: number; eye: number };
  weather: "sunny" | "cloudy" | "rainy" | "windy_in" | "windy_out";
  park: "neutral" | "pitcher_park" | "hitter_park" | "dome";
  isFinished: boolean;
  recentLogs: string[];
}

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
