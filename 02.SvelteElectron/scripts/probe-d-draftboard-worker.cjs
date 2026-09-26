"use strict";
/**
 * 드래프트 총량 계측 전용 — 한 번의 드래프트(고졸 시점)까지만 진행하고
 * `draftBoardState()`(후보/지명/미지명)를 찍는다 (2026-09-26 · D · γ 전후 계측).
 * `probe-a-simrun-worker.cjs`의 주 루프를 그대로 옮겼다 — 다르게 짜지 않는다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 31337);
const PERSONA = process.env.PB_PERSONA || "growth";
const PRESET = process.env.PB_START_PRESET || "balanced";

(async () => {
  const { app, tmp } = await headless.boot(`draftboard-${SEED}-${PERSONA}`);
  try {
    app.setPersona(PERSONA);
    await app.boot({ slotId: "DB" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });

    const guard = makeStallGuard();
    let n = 0;
    let seenDraft = false;
    while (n++ < 6 * 52 * 40) {
      if (app.pendingKind() === "draftObserve") {
        guard.hit(true);
        await app.skipDraftObserve();
        seenDraft = true;
        break; // 첫 드래프트 직후 — 더 진행하지 않는다
      } else if (await app.pushCareerForward()) {
        guard.hit(true);
      } else if (await app.pushPendingForward()) {
        guard.hit(true);
      } else if (app.isSeasonEnded()) {
        guard.hit(true);
        await app.seasonRollover();
      } else {
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        await app.autoRun();
        const stalled = guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0);
        if (stalled) break;
      }
    }
    const board = seenDraft ? app.draftBoardState() : { 오류: "draftObserve 를 못 만났다" };
    console.log("DRAFTBOARD_JSON " + JSON.stringify({ 씨앗: SEED, 프리셋: PRESET, 성향: PERSONA, ...board }));
  } catch (e) {
    console.error("[draftboard] 예외", (e && e.stack) || e);
  } finally {
    await headless.cleanup(tmp);
  }
})();
