import type { PitcherSeasonStats, ProtagonistSave } from "../types/save";

export async function calcSeasonRating(stats: PitcherSeasonStats | null): Promise<number> {
  const raw = await (window as any).projectB.salaryCalcSeasonRating(
    JSON.stringify({ stats: stats ?? null })
  );
  return JSON.parse(raw) as number;
}

export async function calcMarketSalary(ovr: number, fame: number, leagueId: string): Promise<number> {
  const raw = await (window as any).projectB.salaryCalcMarketSalary(
    JSON.stringify({ ovr, fame, leagueId })
  );
  return JSON.parse(raw) as number;
}

export async function calcOfferedSalary(
  currentSalary: number,
  rating: number,
  marketSalary: number,
): Promise<number> {
  const raw = await (window as any).projectB.salaryCalcOfferedSalary(
    JSON.stringify({ currentSalary, rating, marketSalary })
  );
  return JSON.parse(raw) as number;
}

export async function calcOfferedSalaryForProtagonist(
  protagonist: ProtagonistSave,
  seasonStats: PitcherSeasonStats | null,
): Promise<number> {
  const params = {
    pitchingOvr:   protagonist.pitching.ovr,
    fame:          protagonist.fame,
    leagueId:      protagonist.leagueId,
    currentSalary: protagonist.contract?.salary ?? null,
    stats:         seasonStats ?? null,
  };
  const raw = await (window as any).projectB.salaryCalcOfferedSalaryForProtagonist(
    JSON.stringify(params)
  );
  return JSON.parse(raw) as number;
}
