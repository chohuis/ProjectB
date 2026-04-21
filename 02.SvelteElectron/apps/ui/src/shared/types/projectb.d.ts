export {};

declare global {
  interface Window {
    projectB?: {
      version: string;
      matchStart: (request?: {
        matchId?: string;
        inningLimit?: number;
        initialStamina?: number;
        initialMental?: number;
      }) => Promise<{ snapshot: MatchSnapshot }>;
      matchStep: (decision: PitchDecision) => Promise<{
        snapshot: MatchSnapshot;
        outcome: {
          resultCode: string;
          quality: number;
          comment: string;
        };
      }>;
      matchFinish: () => Promise<{
        snapshot: MatchSnapshot;
        summary: string;
      }>;
    };
  }
}

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
