"use strict";
/**
 * **주가 안 넘어간 그 순간을 그대로 찍는다** — 「정지 SSSSWnn」이 나오면 여기부터 본다.
 *
 * `probe-d-dr-worker.cjs` 와 **같은 바깥 루프**를 돌되, 주·시즌이 안 움직인
 * 바로 그 자리에서 멈추고 `stopReason` · `pendingKind` · `seasonState` ·
 * `pathSignals` · `probeWeek()` 두 번 · `autoAdvance` 로그를 찍는다.
 *
 * ── 이걸로 무엇을 잡았나 (2026-09-08 · A) ──────────────────────
 * 씨앗 20260802 의 「정지 2026W32」:
 *
 *     stopReason  = 정지: 진로 최종 선택
 *     pendingKind = draftObserve
 *     로그        = 자동 진행 시작 / 처리: injuryTreatment / [정지] 진로 최종 선택
 *
 * 그 주 pending 이 `[injuryTreatment, draftObserve]` 둘이었고 엔진은 설계대로
 * 멈춘 것이었다. **엔진이 아니라 계측 루프가 틀렸다** — 자세한 것은
 * `check-measure-repro.cjs` 머리말.
 *
 * ⚠ **`stopReason` 없이 「정지」만 보면 이걸 못 가린다.** 설계대로 멈춘 것과
 *   헛도는 것이 같은 글자로 나온다. 그래서 이 계기가 있다.
 *
 *   PF_SEED=20260802 PB_START_PRESET=balanced npm run probe:a:stall
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const PRESET = process.env.PB_START_PRESET || "balanced";

(async () => {
  const { app, tmp } = await headless.boot(`stall-${PRESET}-${SEED}`);
  try {
    await app.boot({ slotId: "ST" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });
    const first = await app.trainingProbe();
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 4 * 52 * 40) {
      const stage = app.protagonistState().stage;
      const mil = app.pathSignals().military;
      if (stage !== "highschool" || mil === "현역" || mil === "군필") { console.log("완주"); break; }
      if (app.currentSeason() - start >= 4) { console.log("4시즌 넘김"); break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.runOneWeek();
      const w1 = app.currentWeek(), s1 = app.currentSeason();
      if (w1 === w0 && s1 === s0) {
        console.log(`\n=== 정지 ${s0}W${w0} ===`);
        console.log("stopReason  :", app.stopReason());
        console.log("pendingKind :", app.pendingKind());
        console.log("seasonState :", JSON.stringify(app.seasonState()));
        console.log("pathSignals :", JSON.stringify(app.pathSignals()));
        console.log("--- probeWeek 한 번 더 ---");
        console.log(JSON.stringify(await app.probeWeek(), null, 1));
        console.log("--- probeWeek 두 번째 ---");
        console.log(JSON.stringify(await app.probeWeek(), null, 1));
        console.log("--- autoAdvance 로그 ---");
        try { console.log((app.autoLogs ? app.autoLogs() : []).slice(-60).join("\n")); } catch (e) { console.log("(autoLogs 없음)"); }
        break;
      }
      if (w0 % 8 === 0) process.stdout.write(`  W${w0}\n`);
    }
  } catch (e) { console.log("예외", e && e.stack || e); }
  await headless.cleanup(tmp);
})();
