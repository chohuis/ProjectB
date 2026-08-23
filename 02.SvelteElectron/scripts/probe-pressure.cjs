"use strict";
/** 압박·목표 — **시즌 종료 훅으로** 잡는다.
 *  🔴 하네스 루프(`isSeasonEnded()`)로는 시즌을 놓친다. 주인공이 진로를 정하는
 *     해가 통째로 빠진다(실측 S2028 W32 → S2029 W0). */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.P2_SEED || 20260731);
const YEARS = Number(process.env.P2_YEARS || 6);
(async () => {
  const { app, tmp } = await headless.boot("p2");
  try {
    await app.boot({ slotId: "P2", worldSeed: SEED, seasonYear: 2026 });
    app.armAfterSeasonSnapshot({ 압박: () => app.pressureSpread() });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    for (const r of app.drainAfterSeasonSnapshots()) {
      console.log(`[SNAP] ${r.연도} ${JSON.stringify(r.압박)}`);
    }
  } finally { await headless.cleanup(tmp); }
})();
