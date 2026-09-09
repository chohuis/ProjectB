"use strict";
/** 동시 실행 한계 계측의 일감 한 판 — 부팅 + N시즌. `probe-a-concurrency.cjs` 가 띄운다 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const SEASONS = Number(process.env.PB_SEASONS || 1);

(async () => {
  // 🔴 **단계를 갈라 잰다** — 「병목이 CPU 가 아니다」를 가리려면 어느 단계가
  //   동시 수에 따라 늘어나는지를 봐야 한다:
  //     bundle  esbuild 번들 (CPU + 디스크)
  //     boot    마스터 로드 · sqlite 열기 · 세계 생성 (디스크 + CPU)
  //     sim     주간 루프 (CPU + `.node` 호출)
  const t0 = Date.now();
  const { app, tmp, bundleMs } = await headless.boot(`conc-${SEED}`);
  const tBundle = Date.now() - t0;
  try {
    const tb0 = Date.now();
    await app.boot({ slotId: "CC" + SEED, worldSeed: SEED, seasonYear: 2026 });
    const bootMs = Date.now() - tb0;
    const ts0 = Date.now();
    const start = app.currentSeason();
    const guard = makeStallGuard();
    let n = 0;
    while (n++ < SEASONS * 52 * 40 && app.currentSeason() - start < SEASONS) {
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { guard.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { guard.hit(true); continue; }
      if (await app.pushPendingForward()) { guard.hit(true); continue; }
      if (app.isSeasonEnded()) { guard.hit(true); await app.seasonRollover(); continue; }
      await app.autoRun();
      if (guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }
    console.log("CONC_OK " + JSON.stringify({ seed: SEED, 시즌: app.currentSeason() - start,
      예외: app.exceptionProbe().예외,
      번들ms: bundleMs, 준비ms: tBundle, 세계ms: bootMs, 시뮬ms: Date.now() - ts0 }));
  } finally {
    await headless.cleanup(tmp);
  }
})();
