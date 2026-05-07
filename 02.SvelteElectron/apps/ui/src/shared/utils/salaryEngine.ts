import type { PitcherSeasonStats, ProtagonistSave } from "../types/save";

const LEAGUE_SALARY_MULTIPLIER: Record<string, number> = {
  LEAGUE_KBL: 1.0,
  LEAGUE_ABL: 3.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calcSeasonRating(stats: PitcherSeasonStats | null): number {
  if (!stats || stats.ip <= 0) return 50;

  const eraScore = clamp(100 - (stats.era - 2.0) * 18, 20, 100);
  const whipScore = clamp(100 - (stats.whip - 1.0) * 55, 20, 100);
  const k9 = stats.ip > 0 ? (stats.k / stats.ip) * 9 : 0;
  const kScore = clamp(40 + k9 * 6, 20, 100);

  return Math.round(eraScore * 0.45 + whipScore * 0.3 + kScore * 0.25);
}

export function calcMarketSalary(ovr: number, fame: number, leagueId: string): number {
  const base = 1800 + Math.max(0, ovr - 50) * 220 + fame * 28;
  const mult = LEAGUE_SALARY_MULTIPLIER[leagueId] ?? 1.0;
  return Math.round(base * mult);
}

export function calcOfferedSalary(currentSalary: number, rating: number, marketSalary: number): number {
  const perfAdj = (rating - 50) * 0.012;
  const blended = currentSalary * (1 + perfAdj) * 0.6 + marketSalary * 0.4;
  return Math.max(1500, Math.round(blended));
}

export function calcOfferedSalaryForProtagonist(
  protagonist: ProtagonistSave,
  seasonStats: PitcherSeasonStats | null,
): number {
  const rating = calcSeasonRating(seasonStats);
  const market = calcMarketSalary(protagonist.pitching.ovr, protagonist.fame, protagonist.leagueId);
  const current = protagonist.contract?.salary ?? market;
  return calcOfferedSalary(current, rating, market);
}

