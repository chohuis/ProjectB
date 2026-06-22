// ABL East 소속 팀 (_1 = 1군, _2 = 2군 모두 포함)
const ABL_EAST_IDS = new Set([
  "TEAM_ABL_EMPIRE_1",          "TEAM_ABL_EMPIRE_2",
  "TEAM_ABL_HARBORHAWKS_1",     "TEAM_ABL_HARBORHAWKS_2",
  "TEAM_ABL_WAVERIDERS_1",      "TEAM_ABL_WAVERIDERS_2",
  "TEAM_ABL_PEACHTREEFALCONS_1","TEAM_ABL_PEACHTREEFALCONS_2",
  "TEAM_ABL_MOTORWOLVES_1",     "TEAM_ABL_MOTORWOLVES_2",
  "TEAM_ABL_LAKESPIRITS_1",     "TEAM_ABL_LAKESPIRITS_2",
  "TEAM_ABL_WINDBEARS_1",       "TEAM_ABL_WINDBEARS_2",
  "TEAM_ABL_RIVERCARDINALS_1",  "TEAM_ABL_RIVERCARDINALS_2",
]);

export function ablConference(teamId: string): "East" | "West" | null {
  if (!teamId.startsWith("TEAM_ABL_")) return null;
  return ABL_EAST_IDS.has(teamId) ? "East" : "West";
}

export function jblConference(teamId: string): "CL" | "PL" | null {
  if (!teamId.startsWith("TEAM_JBL_")) return null;
  return teamId.includes("_CL_") ? "CL" : "PL";
}
