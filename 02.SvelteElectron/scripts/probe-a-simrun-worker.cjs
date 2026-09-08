"use strict";
/** 판 하나 — 해마다 한 줄을 모아 `SIMRUN_JSON` 으로 낸다. `probe-a-simrun.cjs` 가 띄운다 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const SEASONS = Number(process.env.PB_SEASONS || 6);
const PERSONA = process.env.PB_PERSONA || "growth";
const PRESET = process.env.PB_START_PRESET || "balanced";
const RUN_NO = Number(process.env.PB_RUN_NO || 1);

(async () => {
  const { app, tmp } = await headless.boot(`simrun-${SEED}-${PERSONA}`);
  const years = [];
  try {
    app.setPersona(PERSONA);
    await app.boot({ slotId: "SR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    app.resetEventFunnel();

    let prev = app.tierCounters();
    const start = app.currentSeason();
    // 🔴 **그 해 시작 시점의 무대·소속을 든다.** 진로 결정이 시즌 끝 무렵에
    //   처리돼서, 접는 시점에는 이미 다음 무대의 소속이다 — 그대로 적으면
    //   성적과 소속이 서로 다른 해를 가리킨다(실측으로 잡았다)
    const snap = () => {
      const st = app.protagonistState();
      return { 무대: String(st.stage), 소속: String(st.team ?? ""), 나이: Number(st.age ?? 0) };
    };
    let yearAt = snap();
    const guard = makeStallGuard();
    let n = 0;
    while (n++ < SEASONS * 52 * 40 && app.currentSeason() - start < SEASONS) {
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { guard.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { guard.hit(true); continue; }
      if (await app.pushPendingForward()) { guard.hit(true); continue; }
      if (app.isSeasonEnded()) {
        // ⚠ **롤오버 전에 접는다** — 뒤에 부르면 나이·소속이 이미 다음 해 것이다
        const now = app.tierCounters();
        const d = {};
        for (const k of ["normal", "rare", "unique", "hidden"]) d[k] = (now.등급[k] ?? 0) - (prev.등급[k] ?? 0);
        years.push(app.simYearRow(d, now.통지 - prev.통지, yearAt));
        prev = now;
        guard.hit(true);
        await app.seasonRollover();
        yearAt = snap();   // 다음 해의 시작 시점
        continue;
      }
      await app.autoRun();
      if (guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }
  } catch (e) {
    console.error("[simrun] 예외", e && e.stack || e);
  }
  const report = app.simRunReport({ 번호: RUN_NO, 씨앗: SEED, 프리셋: PRESET }, years);
  await headless.cleanup(tmp);
  console.log("SIMRUN_JSON " + JSON.stringify(report));
})();
