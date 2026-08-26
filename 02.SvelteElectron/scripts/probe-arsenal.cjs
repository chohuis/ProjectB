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
    // **프리셋 넷을 실제 스탯·구종으로 돌린다** — 유불리가 실제로 갈리는지 본다
    for (const before of [true, false]) {
      const r = await app.presetEraCurve(GAMES, BM, before);
      for (const [k, v] of Object.entries(r)) console.log(`[${before ? "전" : "후"}] ${k.padEnd(10)} ${JSON.stringify(v)}`);
    }
    const r = {};
    for (const [k, v] of Object.entries(r)) {
      console.log(`[구종] ${k.padEnd(18)} ${JSON.stringify(v)}`);
    }
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
