import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";

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

export async function generateFaOffers(
  protagonist: ProtagonistSave,
  teams: TeamRef[],
): Promise<FaOffer[]> {
  const params = {
    pitchingOvr:     protagonist.pitching.ovr,
    fame:            protagonist.fame,
    leagueId:        protagonist.leagueId,
    teamId:          protagonist.teamId,
    faUnsignedWeeks: protagonist.faUnsignedWeeks ?? 0,
    teams:           teams.map((t) => ({ id: t.id, leagueId: t.leagueId })),
  };
  return JSON.parse(
    await (window as any).projectB.faGenerateOffers(JSON.stringify(params))
  ) as FaOffer[];
}

// ── TS 유지 ───────────────────────────────────────────────────

export function isFaEligible(protagonist: ProtagonistSave, attendsUniversity: boolean): boolean {
  const requiredYears = attendsUniversity ? 8 : 9;
  return protagonist.proServiceYears >= requiredYears || protagonist.contract?.remainingYears === 0;
}

export function toContract(offer: FaOffer): ProContract {
  return {
    teamId:             offer.teamId,
    leagueId:           offer.leagueId,
    salary:             offer.salary,
    durationYears:      offer.durationYears,
    remainingYears:     offer.durationYears,
    signingBonus:       offer.signingBonus,
    teamOptionYears:    offer.teamOptionYears,
    playerOptionYears:  offer.playerOptionYears,
    noTrade:            offer.noTrade,
    status:             "active",
  };
}
