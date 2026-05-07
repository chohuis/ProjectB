import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";
import { calcMarketSalary } from "./salaryEngine";

export interface FaOffer {
  teamId: string;
  leagueId: string;
  salary: number;
  durationYears: number;
  signingBonus: number;
  teamOptionYears: number;
  playerOptionYears: number;
  noTrade: boolean;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateFaOffers(
  protagonist: ProtagonistSave,
  teams: TeamRef[],
): FaOffer[] {
  const sameLeague = teams.filter(
    (t) => t.leagueId === protagonist.leagueId && t.id !== protagonist.teamId,
  );
  if (sameLeague.length === 0) return [];

  const market = calcMarketSalary(
    protagonist.pitching.ovr,
    protagonist.fame,
    protagonist.leagueId,
  );
  const unsignedWeeks = protagonist.faUnsignedWeeks ?? 0;
  const marketDrop = Math.max(0.72, 1 - unsignedWeeks * 0.04);
  const picks = [...sameLeague].sort(() => Math.random() - 0.5).slice(0, randInt(3, 5));
  return picks.map((team) => {
    const mult = 0.85 + Math.random() * 0.35;
    const salary = Math.round(market * mult * marketDrop);
    return {
      teamId: team.id,
      leagueId: team.leagueId,
      salary,
      durationYears: randInt(1, 4),
      signingBonus: Math.round(salary * (0.12 + Math.random() * 0.16)),
      teamOptionYears: Math.random() < 0.35 ? 1 : 0,
      playerOptionYears: Math.random() < 0.25 ? 1 : 0,
      noTrade: Math.random() < 0.2,
    };
  });
}

export function isFaEligible(protagonist: ProtagonistSave, attendsUniversity: boolean): boolean {
  const requiredYears = attendsUniversity ? 8 : 9;
  const byServiceYears = protagonist.proServiceYears >= requiredYears;
  const byContractExpiry = protagonist.contract?.remainingYears === 0;
  return byServiceYears || byContractExpiry;
}

export function toContract(offer: FaOffer): ProContract {
  return {
    teamId: offer.teamId,
    leagueId: offer.leagueId,
    salary: offer.salary,
    durationYears: offer.durationYears,
    remainingYears: offer.durationYears,
    signingBonus: offer.signingBonus,
    teamOptionYears: offer.teamOptionYears,
    playerOptionYears: offer.playerOptionYears,
    noTrade: offer.noTrade,
    status: "active",
  };
}
