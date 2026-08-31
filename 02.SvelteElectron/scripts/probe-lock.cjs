"use strict";
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("lk");
  try {
    await app.boot({ slotId: "LK", worldSeed: 111, seasonYear: 2026 });
    let guard = 0, last = "";
    while (guard++ < 3000 && app.currentSeason() < 2028) {
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      const p = app.demotionLockProbe();
      const k = `${p.기록된인원}/${p.현재락}/${p.위반}`;
      if (k !== last) {
        last = k;
        console.log(`[${app.currentSeason()}W${String(app.currentWeek()).padStart(2,"0")}] ` + JSON.stringify(p));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } catch (e) { console.log("예외:", e && e.message); }
  console.log("[END]");
  await headless.cleanup(tmp);
})();
