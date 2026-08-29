"use strict";
/** 구단 예산이 시즌마다 어떻게 움직이는가 (4단계 · 4-B/4-C 실측)
 *
 *  ⚠ **발산을 본다.** 중앙값만 보면 놓친다 — 최대/최소 비율이 벌어지는지 본다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260829);
const YEARS = Number(process.env.PF_YEARS || 5);
const LG = process.env.PF_LEAGUE || "LEAGUE_KBL";
(async () => {
  const { app, tmp } = await headless.boot("cbud");
  let why = "완주";
  try {
    await app.boot({ slotId: "CB", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    const p0 = app.clubBudgetProbe(LG);
    console.log(`[시작 ${start}] 팀 ${p0.n} · 중앙 ${Math.round(p0.medBudget / 10000)}억`);
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
        const p = app.clubBudgetProbe(LG);
        console.log(`[${seen}] 중앙 ${Math.round(p.medBudget / 10000)}억`
          + ` · 배수 최소 ${p.minRatio} 중앙 ${p.medRatio} 최대 ${p.maxRatio}`);
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
    const pN = app.clubBudgetProbe(LG);
    console.log(`[팀별] ${pN.rows.join(" · ")}`);
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
