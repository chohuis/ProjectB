"use strict";
/** 과거 5년 개인 성적이 실제로 심기는가 · 생성이 얼마나 느려지는가 (실플 ⑪) */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
(async () => {
  const { app, tmp } = await headless.boot("past");
  try {
    const t0 = Date.now();
    await app.boot({ slotId: "PS", worldSeed: 20260826, seasonYear: 2026 });
    console.log(`[생성] ${Date.now() - t0}ms`);
    console.log(`[과거] ${JSON.stringify(app.pastStatsProbe())}`);
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
