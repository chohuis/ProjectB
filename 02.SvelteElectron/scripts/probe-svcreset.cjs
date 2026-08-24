"use strict";
/** 연차가 어느 주에 리셋되는가 — 매주 스냅샷을 떠서 감소 시점을 잡는다.
 *  ⚠ 전후만 보면 "무엇이" 줄였는지 못 가른다. 시점이 곧 범인이다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
(async () => {
  const { app, tmp } = await headless.boot("svc");
  try {
    await app.boot({ slotId: "SV", worldSeed: SEED, seasonYear: 2026 });
    let prev = app.svcSnapshot();
    const start = app.currentSeason();
    let guard = 0;
    const mark = (tag) => {
      const now = app.svcSnapshot();
      let down = 0; const ex = [];
      for (const id of Object.keys(prev)) {
        const A = prev[id], B = now[id];
        if (!B || B[0] >= A[0]) continue;
        down++;
        if (ex.length < 4) ex.push(id + " " + A[0] + "→" + B[0] + " " + A[2].split("|")[1] + "→" + B[2].split("|")[1]);
      }
      if (down > 0) {
        const d = app.dupIdProbe();
        console.log("  [중복] 전체 " + d["전체"] + " 고유 " + d["고유"] + " 중복ID " + d["중복ID수"]);
        for (const x of d["예시"]) console.log("      " + x);
        console.log("[" + tag + "] 연차 감소 " + down + "명");
        for (const e of ex) console.log("      " + e);
        for (const line of app.svcEventProbe(ex.map(function(z){return z.split(" ")[0];}))) console.log("      * " + line);
      }
      prev = now;
    };
    while (guard++ < 52 * 60 && app.currentSeason() < start + 1) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); mark("draftObserve"); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) { mark("push " + s0 + "W" + w0 + " → " + app.currentSeason() + "W" + app.currentWeek()); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); mark("seasonRollover " + s0); continue; }
      await app.autoRun();
      mark("autoRun " + s0 + "W" + w0);
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } catch (e) { console.log("[예외] " + (e && e.message)); }
  await headless.cleanup(tmp);
})();
