"use strict";
/** 리그 도루가 도는가 — A8 착수 전 확인. 한 시즌 돌리고 집계한다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
(async () => {
  const { app, tmp } = await headless.boot("stl");
  try {
    await app.boot({ slotId: "ST", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 52 * 60 && app.currentSeason() < start + 1) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        console.log(`[시즌종료 전] ${JSON.stringify(app.stealProbe())}`);
        await app.seasonRollover(); continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
