"use strict";
/** 영구결번·명예의 전당의 전제 — 등번호 유일성 · 통산 기록 규모 (2단계) */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
const YEARS = Number(process.env.PF_YEARS || 3);

(async () => {
  const { app, tmp } = await headless.boot("hof");
  let why = "완주";
  try {
    await app.boot({ slotId: "HF", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log("[시작] " + JSON.stringify(await app.hofPrereqProbe()));
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
        console.log(`[${seen}] ` + JSON.stringify(await app.hofPrereqProbe()));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
