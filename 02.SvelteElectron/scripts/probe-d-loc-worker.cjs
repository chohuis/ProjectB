"use strict";
/**
 * LOC 워커 — 코스 정확도 모드 한 판(켬/끔 × 씨앗 하나)만 돈다.
 * `probe-d-loc-mode.cjs`가 자식 프로세스로 띄운다(DR과 같은 이유 —
 * `headless.boot()`를 한 프로세스에서 두 번 부르면 첫 판 상태가 남는다).
 *
 * 고교 → 드래프트 → 프로까지 자동 진행한 뒤, 프로에서 **꽉 찬 한 시즌**을
 * 더 돌려 그 시즌 종료 시점(롤오버 직전) 스탯을 찍는다.
 *
 * 🔴 **`PB_LOC_INTENT` 는 이제 없다** (2026-09-08 · 결정 ⑦ 확정). Rust 가 그
 *   변수를 안 읽으므로 모드를 나눠 넘겨도 같은 판이 돈다 — 오케스트레이터
 *   `probe-d-loc-mode.cjs` 머리말에 경위와 그때 값이 있다.
 *
 * ⚠ (원문) `PB_LOC_INTENT`는 Rust가 매 투구마다 `std::env::var`로 즉시 읽었다
 *   (`tuning.rs location_intent_mode()`) — 이 프로세스에 그 값이 심겨 있으면
 *   그대로 반영됐다. 별도 배선이 필요 없었다.
 *
 * ⚠ **동시성 경고(2026-09-06)** — 다른 오케스트레이터와 겹쳐 돌리면 CPU
 *   경합으로 전부 타임아웃난다. 한 번에 하나씩.
 *
 * 이 판이 프로 1시즌을 도므로, 같은 판에서 E2절의 "1군/2군" 행도 뽑는다
 * (코치 지시 2026-09-06). 「주인공 IP 0」 진단을 위해 매주 position·farm도
 * 같이 찍는다 — 등판이 아예 없던 건지, 보직·콜업 문제인지 가른다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const MODE = process.env.PB_LOC_INTENT || "0";
const POLICY = { draft: true, university: false, independent: true };
const stat3 = (a) => (a.velocity ?? 0) + (a.command ?? 0) + (a.control ?? 0);
const avg = (v) => v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;

(async () => {
  const { app, tmp } = await headless.boot(`loc-${MODE}-${SEED}`);
  let why = "완주";
  const e2 = { "1군": { 등판주: [], 없는주: [], 게임수: [] }, "2군": { 등판주: [], 없는주: [], 게임수: [] } };
  const posSeen = new Set(); const farmWeeks = { true: 0, false: 0 };
  let annualG = null, annualIp = null;
  try {
    await app.boot({ slotId: "LOC" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    let guard = 0;
    // 1) 프로 도달까지
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
    // 2) 프로에서 꽉 찬 시즌 하나 — 한 주씩(E2 델타를 재려면 autoRun으론 안 된다)
    if (/^pro/.test(app.protagonistState().stage)) {
      // 훈련 — 주 슬롯 몰빵(E2와 같은 기준)
      const first = await app.trainingProbe();
      if (first.계획 && first.계획[0]) app.setTrainingSlots([first.계획[0]]);
      let prevStat = stat3(app.protagonistAbilities());
      let prevG = 0;
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
        const sig = app.pathSignals();
        posSeen.add(sig.position ?? "null");
        farmWeeks[String(!!sig.farm)] = (farmWeeks[String(!!sig.farm)] ?? 0) + 1;
        const stAfter = app.protagonistStatProbe();
        const gNow = (stAfter && stAfter.역할 === "투수") ? (stAfter.경기 ?? 0) : 0;
        const gDelta = gNow - prevG; prevG = gNow;
        const curStat = stat3(app.protagonistAbilities());
        const delta = curStat - prevStat; prevStat = curStat;
        const bucket = e2[sig.farm ? "2군" : "1군"];
        if (gDelta > 0) { bucket.등판주.push(delta); bucket.게임수.push(gDelta); } else bucket.없는주.push(delta);
        if (app.currentWeek() === w0 && !app.isSeasonEnded()) { why = `정지(프로시즌) W${w0}`; break; }
      }
    } else {
      why = "프로 미도달";
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  const rate = app.leagueRateProbe();
  const e2out = {};
  for (const [k, b] of Object.entries(e2)) {
    e2out[k] = { 없는주: avg(b.없는주), 없는주n: b.없는주.length, 등판주: avg(b.등판주), 등판주n: b.등판주.length, 주당게임: avg(b.게임수) };
  }
  const result = {
    mode: MODE, seed: SEED, why, ...rate,
    연간등판: annualG, 연간이닝: annualIp,
    진단_보직: [...posSeen], 진단_2군주수: farmWeeks.true ?? 0, 진단_1군주수: farmWeeks.false ?? 0,
    e2프로: e2out,
  };
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify(result));
})();
