const TEAM_MULTIPLIER: Record<string, number> = {
  TEAM_KBL_ROYALLIONS_1:    1.12,
  TEAM_KBL_TWINWOLVES_1:    1.10,
  TEAM_KBL_BEARGUARDIANS_1: 1.08,
  TEAM_KBL_SKYGULLS_1:      1.05,
  TEAM_KBL_SOARINGEAGLES_1: 1.00,
  TEAM_KBL_EMBERTIGERS_1:   0.97,
  TEAM_KBL_STEELDINOS_1:    0.93,
  TEAM_KBL_GIANTWHALES_1:   0.90,
};

function baseSalary(pickNo: number): number {
  if (pickNo === 1)  return 9000;
  if (pickNo <= 4)   return 7500;
  if (pickNo <= 8)   return 6000;
  if (pickNo <= 16)  return 4500;
  if (pickNo <= 32)  return 3500;
  if (pickNo <= 48)  return 2800;
  if (pickNo <= 64)  return 2200;
  return 1500;
}

function baseBonus(pickNo: number): number {
  if (pickNo === 1)  return 6000;
  if (pickNo <= 4)   return 4000;
  if (pickNo <= 8)   return 2500;
  if (pickNo <= 16)  return 1500;
  if (pickNo <= 32)  return 800;
  if (pickNo <= 48)  return 300;
  return 0;
}

export function calcKblDraftContract(pickNo: number, teamId: string): {
  salary: number;
  durationYears: 3;
  signingBonus: number;
} {
  const mult = TEAM_MULTIPLIER[teamId] ?? 1.0;
  const salary      = Math.round(baseSalary(pickNo) * mult / 100) * 100;
  const signingBonus = Math.round(baseBonus(pickNo) * mult / 100) * 100;
  return { salary, durationYears: 3, signingBonus };
}
