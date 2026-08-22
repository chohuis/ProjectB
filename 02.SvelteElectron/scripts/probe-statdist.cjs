"use strict";
/** 성적 원값 분포 — `form_score` 눈금을 맞추려고 잰다 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("statdist");
  try {
    await app.boot({ slotId: "SD", worldSeed: 20260731, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 3 * 52 * 60 && app.currentSeason() < start + 3) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        console.log(`[${s0} 시즌종료] ${JSON.stringify(app.statDistribution())}`);
        await app.seasonRollover();
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } finally { await headless.cleanup(tmp); }
})();
