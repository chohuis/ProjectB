"use strict";
/** 명예의 전당이 실제로 채워지는가 (2단계)
 *  ⚠ 은퇴자가 나와야 헌액이 생긴다 — 짧게 돌리면 0이 정상이다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
const YEARS = Number(process.env.PF_YEARS || 6);
(async () => {
  const { app, tmp } = await headless.boot("hof2");
  let why = "완주";
  try {
    await app.boot({ slotId: "H2", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0, seen = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentSeason() > seen) {
        seen = app.currentSeason();
        console.log(`[${seen}] ` + JSON.stringify(app.hofProbe()));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
