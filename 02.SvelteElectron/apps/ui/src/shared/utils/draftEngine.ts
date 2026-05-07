export interface DraftRankResult {
  drafted: boolean;
  round: number | null;
  pick: number | null;
  teamId: string | null;
  signingBonus: number;
}

const KBL_TEAM_IDS = [
  "TEAM_KBL_SEOUL_TWINWOLVES",
  "TEAM_KBL_SEOUL_BEARGUARDIANS",
  "TEAM_KBL_INCHEON_SKYGULLS",
  "TEAM_KBL_DAEJEON_SOARINGEAGLES",
  "TEAM_KBL_DAEGU_ROYALLIONS",
  "TEAM_KBL_GWANGJU_EMBERTIGERS",
  "TEAM_KBL_CHANGWON_STEELDINOS",
  "TEAM_KBL_BUSAN_GIANTWHALES",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTeamId(): string {
  return KBL_TEAM_IDS[randInt(0, KBL_TEAM_IDS.length - 1)];
}

export function calcDraftRank(scoutScore: number): DraftRankResult {
  if (scoutScore >= 90) {
    return {
      drafted: true,
      round: 1,
      pick: randInt(1, 5),
      teamId: randomTeamId(),
      signingBonus: randInt(50000, 90000),
    };
  }
  if (scoutScore >= 70) {
    return {
      drafted: true,
      round: 1,
      pick: randInt(6, 30),
      teamId: randomTeamId(),
      signingBonus: randInt(10000, 50000),
    };
  }
  if (scoutScore >= 50) {
    return {
      drafted: true,
      round: randInt(2, 3),
      pick: randInt(1, 30),
      teamId: randomTeamId(),
      signingBonus: randInt(3000, 10000),
    };
  }
  return {
    drafted: false,
    round: null,
    pick: null,
    teamId: null,
    signingBonus: 0,
  };
}

