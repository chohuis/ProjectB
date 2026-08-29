"use strict";
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("pl");
  try {
    await app.boot({ slotId: "PL", worldSeed: 111, seasonYear: 2026 });
    let guard = 0;
    // 시즌 중반까지만 — 경기가 쌓이면 된다
    while (guard++ < 2000 && app.currentWeek() < 30 && app.currentSeason() === 2026) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) break;
      await app.autoRun();
    }
    console.log("[W" + app.currentWeek() + "] " + JSON.stringify(app.playerLinesProbe(), null, 1));
  } catch (e) { console.log("예외:", e && e.message); }
  await headless.cleanup(tmp);
})();
