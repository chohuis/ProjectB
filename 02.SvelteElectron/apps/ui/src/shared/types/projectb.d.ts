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
      }) => Promise<{ snapshot: MatchSnapshot }>;
      matchStep: (decision: PitchDecision) => Promise<{
        snapshot: MatchSnapshot;
        outcome: { resultCode: string; quality: number; comment: string };
      }>;
      matchFinish: () => Promise<{ snapshot: MatchSnapshot; summary: string }>;
      // ── 게임 저장/불러오기 ──────────────────────────────────
      gameLoad: () => Promise<GameSaveData | null>;
      gameSave: (data: GameSaveData) => Promise<void>;
      // ── 날짜 진행 ──────────────────────────────────────────
      dayAdvance: (state: CoreGameState) => Promise<DayAdvanceResult>;
      // ── 마스터 데이터 (Electron 패키징 환경용 fallback) ──────
      masterFetch: (relPath: string) => Promise<unknown>;
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
  isFinished: boolean;
  recentLogs: string[];
}
