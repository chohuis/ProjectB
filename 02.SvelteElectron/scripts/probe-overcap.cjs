"use strict";
/** 상한 초과가 **언제** 생기나 — 오프시즌인가 시즌 중인가 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("oc");
  try {
    await app.boot({ slotId: "OC", worldSeed: 111, seasonYear: 2026 });
    console.log("[생성직후] " + JSON.stringify(app.overCapProbe()));
    let guard = 0, last = "";
    while (guard++ < 3000 && app.currentSeason() < 2028) {
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        console.log(`[롤오버전 ${app.currentSeason()}] ` + JSON.stringify(app.overCapProbe()));
        await app.seasonRollover();
        console.log(`[롤오버후 ${app.currentSeason()}] ` + JSON.stringify(app.overCapProbe()));
        continue;
      }
      await app.autoRun();
      const p = app.overCapProbe();
      if (String(p.초과팀수) !== last) {
        last = String(p.초과팀수);
        console.log(`[${app.currentSeason()}W${String(app.currentWeek()).padStart(2,"0")}] ` + JSON.stringify(p));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } catch (e) { console.log("예외:", e && e.message); }
  await headless.cleanup(tmp);
})();
