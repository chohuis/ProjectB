"use strict";
/** 로스터 자리 실태 (3단계 전제) — 부상자가 자리를 차지하는가 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
const YEARS = Number(process.env.PF_YEARS || 2);
(async () => {
  const { app, tmp } = await headless.boot("rs");
  let why = "완주";
  try {
    await app.boot({ slotId: "RS", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log("[시작] " + JSON.stringify(app.rosterSlotProbe()));
    let guard = 0, last = "";
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      const p = app.rosterSlotProbe();
      const key = `${p.인원}/${p.부상자_시즌표}/${p.부상자_상태값}/${p.프로_전체부상}`;
      if (key !== last) {
        last = key;
        console.log(`[${app.currentSeason()}W${String(app.currentWeek()).padStart(2,"0")}] ` + JSON.stringify(p));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
