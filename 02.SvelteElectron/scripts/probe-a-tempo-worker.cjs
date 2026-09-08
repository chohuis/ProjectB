"use strict";
/**
 * 완급(⑧)·코스(⑨) 커리어 워커 — 한 판(모드 하나 × 씨앗 하나)만 돈다.
 *
 * `probe-d-loc-worker.cjs` 와 **같은 방법이다** — 기준선
 * `BALANCE_BASELINE_101.md` §3 과 나란히 읽으려면 재는 법이 같아야 한다.
 * 고교 → 드래프트 → 프로까지 자동 진행한 뒤 프로에서 꽉 찬 한 시즌을 더 돌려
 * 그 시즌 종료 시점 스탯을 `leagueRateProbe()` 로 찍는다.
 *
 * ⚠ `PB_TEMPO`·`PB_COURSE` 는 Rust 가 매 투구마다 `std::env::var` 로 읽는다
 *   (`tuning.rs tempo_mode`·`course_mode`) — 이 프로세스에 심겨 있으면 그대로
 *   반영된다. 별도 배선이 필요 없다(`PB_BATTER_READ`·`PB_PUTAWAY` 도 같다 —
 *   `PB_LOC_INTENT` 는 결정 ⑦ 이 닫히면서 2026-09-08 에 없앴다).
 *
 * ⚠ **동시성 1.** 겹쳐 돌리면 CPU 경합으로 타임아웃난다(§3 의 경고 그대로).
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const TEMPO = process.env.PB_TEMPO || "0";
const COURSE = process.env.PB_COURSE || "0";
const POLICY = { draft: true, university: false, independent: true };

(async () => {
  const { app, tmp } = await headless.boot(`tempo-${TEMPO}${COURSE}-${SEED}`);
  let why = "완주";
  let annualG = null, annualIp = null;
  try {
    await app.boot({ slotId: "TMP" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    let guard = 0;
    while (guard++ < 5 * 52 * 40) {
      if (/^pro/.test(app.protagonistState().stage)) break;
      if (app.retired()) { why = "은퇴(프로 도달 전)"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      await app.autoRun();
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지(프로 도달 전) ${s0}W${w0}`; break; }
    }
    if (/^pro/.test(app.protagonistState().stage)) {
      const first = await app.trainingProbe();
      if (first.계획 && first.계획[0]) app.setTrainingSlots([first.계획[0]]);
      guard = 0;
      while (guard++ < 60 * 40) {
        if (app.isSeasonEnded()) {
          const st = app.protagonistStatProbe();
          if (st && st.역할 === "투수") { annualG = st.경기; annualIp = st.ip; }
          break;
        }
        if (app.retired()) { why = "은퇴(프로 시즌 중)"; break; }
        const w0 = app.currentWeek();
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        if (await app.pushCareerForward()) continue;
        if (await app.pushPendingForward()) continue;
        await app.runOneWeek();
        if (app.currentWeek() === w0 && !app.isSeasonEnded()) { why = `정지(프로시즌) W${w0}`; break; }
      }
    } else {
      why = "프로 미도달";
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  const rate = app.leagueRateProbe();
  const result = { tempo: TEMPO, course: COURSE, seed: SEED, why, ...rate, 연간등판: annualG, 연간이닝: annualIp };
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify(result));
})();
