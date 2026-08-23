"use strict";
/** 목표 순위·압박 분포 — 편차 계수 곡선을 재려고 잰다.
 *  씨앗·시즌 수를 환경변수로 받는다. 같은 시즌 지수끼리만 비교해야 한다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PP_SEED || 20260731);
const YEARS = Number(process.env.PP_YEARS || 3);
const TAG = process.env.PP_TAG || "";
(async () => {
  const { app, tmp } = await headless.boot("pressure");
  let why = "완주";
  try {
    await app.boot({ slotId: "PP", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        const s = app.pressureSpread();
        console.log(`[RES] ${TAG} 시즌${s0 - start} ${JSON.stringify(s)}`);
        await app.seasonRollover();
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
    if (guard >= YEARS * 52 * 60) why = "가드";
  } catch (e) { why = `예외 ${e && e.message}`; }
  finally { console.log(`[END] ${TAG} ${why}`); await headless.cleanup(tmp); }
})();
