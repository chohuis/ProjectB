"use strict";
/** 구종 수가 ERA를 얼마나 바꾸는가 — **프리셋 주석의 값을 다시 잰다.**
 *
 *  🔴 `NewGamePage` 주석: "하나면 ERA 9.07, 둘이면 4.52"(60경기).
 *    그 사이 엔진이 여러 번 바뀌었다. 지금도 그런지 확인한다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const GAMES = Number(process.env.PF_GAMES || 60);
const BM = Number(process.env.PF_BATTER || 62);   // 고교 평균 타자
(async () => {
  const { app, tmp } = await headless.boot("arsenal");
  try {
    await app.boot({ slotId: "PA", worldSeed: 20260731, seasonYear: 2026 });
    const r = await app.arsenalEraCurve(GAMES, BM);
    for (const [k, v] of Object.entries(r)) {
      console.log(`[구종] ${k.padEnd(18)} ${JSON.stringify(v)}`);
    }
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
