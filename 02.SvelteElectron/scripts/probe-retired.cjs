"use strict";
/** 은퇴자가 로드에 얼마나 실리는가 — D7 재현.
 *  ⚠ 백로그의 "10시즌 npc +10,431행"은 문서만이다. 직접 잰다.
 *  `getAllNpcs`가 `SELECT * FROM npc`라 은퇴자까지 전부 온다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 5);
(async () => {
  const { app, tmp } = await headless.boot("ret");
  try {
    await app.boot({ slotId: "RT", worldSeed: SEED, seasonYear: 2026 });
    const snap = () => {
      const p = app.ageServiceProbe();
      return p;
    };
    const count = () => {
      const d = app.dupIdProbe();
      return d["전체"];
    };
    console.log(`[시작] npcs ${count()}명 · 씨앗 ${SEED}`);
    const start = app.currentSeason();
    let guard = 0;
    let lastYear = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentSeason() > lastYear) {
        lastYear = app.currentSeason();
        console.log(`[${lastYear}] npcs ${count()}명`);
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    const p = app.retiredProbe();
    console.log(`[끝] ${JSON.stringify(p)}`);
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
