"use strict";
/** 팀마다 로스터 OVR이 얼마나 다른가 — 해외 진출 문턱을 팀 상대로 잡을지 정한다 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("teamovr");
  try {
    await app.boot({ slotId: "PT", worldSeed: 20260826, seasonYear: 2026 });
    for (const lg of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL",
                      "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]) {
      console.log(`[${lg.replace("LEAGUE_", "").padEnd(9)}] ${JSON.stringify(app.teamOvrSpreadProbe(lg))}`);
    }
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
