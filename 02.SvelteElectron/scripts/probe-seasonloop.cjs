"use strict";
/** 계측 루프가 시즌 종료를 왜 놓치는가 — 매 반복의 상태를 찍는다.
 *  ⚠ 추측하지 않는다. 주·연도·종료플래그·정지사유를 그대로 본다. */
const path = require("node:path");
const Y = Number(process.env.SL_YEARS || 3);
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("sl");
  try {
    await app.boot({ slotId: "SL", worldSeed: Number(process.env.SL_SEED || 20260731), seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0, last = "";
    while (guard++ < Y * 52 * 60 && app.currentSeason() < start + Y) {
      const s0 = app.currentSeason(), w0 = app.currentWeek();
      const ended = app.isSeasonEnded(), pk = app.pendingKind();
      const line = `S${s0} W${w0} ended=${ended} pending=${pk ?? "-"}`;
      if (line !== last) { console.log(`[LOOP] ${line}`); last = line; }
      if (app.retired()) { console.log("[LOOP] 은퇴"); break; }
      if (pk === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { console.log(`[LOOP]   ↑ pushCareerForward → S${app.currentSeason()} W${app.currentWeek()}`); continue; }
      if (ended) {
        await app.seasonRollover();
        console.log(`[LOOP]   ↑ rollover → S${app.currentSeason()} W${app.currentWeek()}`);
        continue;
      }
      await app.autoRun();
      console.log(`[LOOP]   ↑ autoRun → S${app.currentSeason()} W${app.currentWeek()}`
        + ` ended=${app.isSeasonEnded()} stop=${app.stopReason() ?? "-"}`);
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { console.log("[LOOP] 정지"); break; }
    }
    console.log(`[LOOP] 끝 S${app.currentSeason()} (start ${start}, 목표 ${start + 3})`);
  } finally { await headless.cleanup(tmp); }
})();
