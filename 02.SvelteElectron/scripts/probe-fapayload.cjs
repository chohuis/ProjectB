"use strict";
/** FA 입찰 파라미터가 Rust까지 실제로 가는가 — 페이로드를 가로채서 본다.
 *  ⚠ args[0]은 Rust export 이름이다(runOffseasonNative). TS 래퍼 이름이 아니다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  headless.setInterceptor(async (channel, args, call) => {
    if (channel === "engine:call" && args[0] === "runOffseasonNative") {
      let p = {};
      try { p = JSON.parse(args[1]); } catch { /* 모양이 다르면 아래가 말해준다 */ }
      const keys = Object.keys(p);
      console.log(`[PAYLOAD] npcs=${(p.npcs || []).length}`
        + ` faBidInterestMin=${JSON.stringify(p.faBidInterestMin)}`
        + ` teamPayrollCap=${p.teamPayrollCap ? Object.keys(p.teamPayrollCap).length + "팀" : "없음"}`
        + ` faPerfSpan=${JSON.stringify(p.faPerfSpan)}`
        + ` worldSeed=${p.worldSeed}`
        + ` teamProfiles=${p.teamProfiles ? Object.keys(p.teamProfiles).length : "없음"}`);
      if (p.faBidInterestMin === undefined) console.log(`[PAYLOAD] 키 목록: ${keys.join(",")}`);
    }
    return call();
  });
  const { app, tmp } = await headless.boot("fap");
  try {
    await app.boot({ slotId: "FP", worldSeed: 20260731, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 2 * 52 * 60 && app.currentSeason() < start + 2) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } finally { await headless.cleanup(tmp); }
})();
