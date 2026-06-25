import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";

// 리그별 FA 자격 기준 연수 (고졸/대졸 구분 없음, 프로 입단 후 연수)
export const FA_THRESHOLD: Record<string, number> = {
  LEAGUE_KBL: 5,
  LEAGUE_ABL: 6,
  LEAGUE_JBL: 4,
};
export function getFaThreshold(leagueId: string): number {
  return FA_THRESHOLD[leagueId] ?? 5;
}

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
    await window.projectB!.faGenerateOffers(JSON.stringify(params))
  ) as FaOffer[];
}

// ── TS 유지 ───────────────────────────────────────────────────

export function isFaEligible(protagonist: ProtagonistSave, _attendsUniversity: boolean): boolean {
  const requiredYears = getFaThreshold(protagonist.leagueId);
  return protagonist.proServiceYears >= requiredYears;
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
