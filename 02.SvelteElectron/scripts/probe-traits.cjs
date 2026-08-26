"use strict";
/** 성실·사기가 실제로 도는 범위 — **조건선에 닿는 주가 있는가.**
 *
 *  🔴 데이터만 봐서는 모른다. `diligence_lte 30`도 `COND_SLUMP`(사기≤38)도
 *    "값이 거기까지 안 간다"가 원인이라 **궤적을 재야** 보인다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 6);
(async () => {
  const { app, tmp } = await headless.boot("traits");
  let why = "완주";
  try {
    await app.boot({ slotId: "PT", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    app.trajReset();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      // ⚠ **진행 전후로 둘 다 걷는다.** 한 번만 걷으니 6시즌 312주에서
      //   표본이 38~48개뿐이었다 — autoRun이 여러 주를 한 번에 넘긴다.
      app.trajTick();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      app.trajTick();   // 진행 뒤에도 걷는다
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  const t = app.trajProbe();
  console.log(`[성실] ${JSON.stringify(t.성실)}`);
  console.log(`[사기] ${JSON.stringify(t.사기)}`);
  console.log(`[닿음] ${JSON.stringify(t.닿음)}   ← 0이면 그 조건은 영원히 false다`);
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
