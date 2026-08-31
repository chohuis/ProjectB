"use strict";
/** 드래프트 스카우팅 전후 — **순서가 바뀌는가** */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
(async () => {
  const { app, tmp } = await headless.boot("ds");
  try {
    await app.boot({ slotId: "DS", worldSeed: SEED, seasonYear: 2026 });
    let guard = 0, seen = 2026;
    while (guard++ < 3000 && app.currentSeason() < 2029) {
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentSeason() > seen) {
        seen = app.currentSeason();
        console.log(`[${seen}] ` + JSON.stringify(app.draftScoutProbe()));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } catch (e) { console.log("예외:", e && e.message); }
  await headless.cleanup(tmp);
})();
