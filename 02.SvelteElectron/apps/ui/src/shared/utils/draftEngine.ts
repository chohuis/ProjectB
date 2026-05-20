import { KBL_TEAM_IDS } from "./draftSystem";

export interface DraftRankResult {
  drafted: boolean;
  round: number | null;
  pick: number | null;
  teamId: string | null;
  signingBonus: number;
}

export async function calcDraftRank(
  scoutScore: number,
  pitchingOvr: number = scoutScore,
  year: number = 2000,
): Promise<DraftRankResult> {
  const params = { scoutScore, pitchingOvr, year, kblTeamIds: KBL_TEAM_IDS };
  return JSON.parse(
    await window.projectB!.draftCalcDraftRank(JSON.stringify(params))
  ) as DraftRankResult;
}
