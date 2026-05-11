import { determineProtagonistDraft, KBL_TEAM_IDS } from "./draftSystem";

export interface DraftRankResult {
  drafted: boolean;
  round: number | null;
  pick: number | null;
  teamId: string | null;
  signingBonus: number;
}

function calcSigningBonus(round: number, scoutScore: number): number {
  if (round === 1) return Math.round(30000 + Math.max(0, scoutScore - 70) * 1500);
  if (round === 2) return Math.round(10000 + Math.max(0, scoutScore - 55) * 600);
  if (round <= 4)  return Math.round(4000  + Math.max(0, scoutScore - 40) * 200);
  return 2000;
}

export function calcDraftRank(
  scoutScore: number,
  pitchingOvr: number = scoutScore,
  year: number = 2000,
): DraftRankResult {
  const outcome = determineProtagonistDraft(scoutScore, pitchingOvr, year, KBL_TEAM_IDS);
  if (!outcome.drafted) {
    return { drafted: false, round: null, pick: null, teamId: null, signingBonus: 0 };
  }
  return {
    drafted:     true,
    round:       outcome.round ?? null,
    pick:        outcome.pick ?? null,
    teamId:      outcome.teamId ?? null,
    signingBonus: calcSigningBonus(outcome.round ?? 10, scoutScore),
  };
}
