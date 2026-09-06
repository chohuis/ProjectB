"use strict";
/**
 * REU 워커 — 재회 12종 무대별 도달, 경로 하나(프로/독립) × 씨앗 하나만
 * 돈다. `probe-d-reu-reunion.cjs`가 자식 프로세스로 띄운다(DR/LOC/MOR와
 * 같은 이유).
 *
 * ⚠ **1200초 상한(코치 지시 2026-09-06)** — 고교 3~4시즌(➜ 175주 안팎)을
 *   다 걸으면 복무 100주 + 전역 후 관찰까지 합쳐 실측 40~65분이 걸려 못
 *   맞춘다(실측: 60분·80분 타임아웃 둘 다 걸림 — 벽시계 CPU 비가 거의 1:1
 *   이라 진짜 그만큼 걸린다). **고교를 건너뛴다** — 부팅 직후 바로
 *   입대시킨다(`forceEnlist`). 복무 100주(규정·불변)만으로도 실측 약 900초
 *   가까이 걸리므로, 전역 뒤는 **남은 시간만큼만** 본다(벽시계 자체 컷오프).
 *   그래도 못 맞추면 부분 결과 + `못본전역후주` 로 정직하게 남긴다.
 *
 * 병영생활 주간 선택은 `PB_MIL_CHOICE=ball`(관계가 쌓여야 `relation_gte
 * unitmate 20` 문턱을 넘는다).
 *
 * 전역 뒤에는 프로/독립 정책으로 계속 진행한다. 재회 12종 각각의 발동
 * 여부·최초 발동 주(전역 후 경과 주)를 `eventRuleProbe`로 매주 폴링해 잡는다.
 */
const path = require("node:path");
globalThis.__PB_MIL_CHOICE = process.env.PB_MIL_CHOICE || "ball";
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const PATH_KEY = process.env.PB_PATH || "pro"; // pro | indie
const DEADLINE_MS = Number(process.env.PB_REU_DEADLINE_MS || 1080000); // 1200초 상한 - 여유 120초
const T0 = Date.now();
const POST_POLICY = PATH_KEY === "pro"
  ? { draft: true, university: false, independent: true }
  : { draft: false, university: false, independent: true };

const REUNION_IDS = [
  "EVT_MILREUNION_UNIT_LETTER", "EVT_MILREUNION_JUNIOR_ASK", "EVT_MILREUNION_TICKETS",
  "EVT_MILREUNION_PARCEL", "EVT_MILREUNION_BULLPEN_CATCH", "EVT_MILREUNION_FIRST_CALL",
  "EVT_MILREUNION_BALL_PARTNER_NEWS", "EVT_MILREUNION_INDIE_FIELD", "EVT_MILREUNION_WEDDING",
  "EVT_MILREUNION_SAME_CLUB", "EVT_MILREUNION_OPP_MOUND", "EVT_MILREUNION_UNIT_INVITE",
];

(async () => {
  const { app, tmp } = await headless.boot(`reu-${PATH_KEY}-${SEED}`);
  let why = "완주";
  let dischargeWeekTag = null;
  let 못본전역후주 = 0;
  const fireOrder = []; // {id, weeksSinceDischarge}
  try {
    await app.boot({ slotId: "REU" + SEED, worldSeed: SEED, seasonYear: 2026 });
    // 고교를 건너뛴다 — 부팅 직후 바로 입대(1200초 안에 맞추려면 175주를 아낀다)
    await app.forceEnlist("general");
    app.setCareerPolicy(POST_POLICY);
    app.resetEventFunnel();
    let guard = 0;
    while (guard++ < 3 * 52 * 40) {
      if (Date.now() - T0 > DEADLINE_MS) { why = "시간초과(복무중)"; break; }
      if ((app.pathSignals().military ?? "") === "군필") break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      await app.autoRun();
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지(복무중) ${s0}W${w0}`; break; }
    }
    if ((app.pathSignals().military ?? "") !== "군필") {
      why = why === "완주" ? "전역 못 함" : why;
    } else {
      dischargeWeekTag = `${app.currentSeason()}W${app.currentWeek()}`;
      // 전역 뒤 — 남은 시간만큼만 한 주씩 밀며 12종 발동을 잡는다
      const fired = new Set();
      let weeksSince = 0;
      guard = 0;
      while (guard++ < 130 && weeksSince < 110) {
        if (Date.now() - T0 > DEADLINE_MS) { 못본전역후주 = 110 - weeksSince; why = "시간초과(전역후)"; break; }
        for (const id of REUNION_IDS) {
          if (fired.has(id)) continue;
          const p = app.eventRuleProbe(id);
          if (p.발동 > 0) { fired.add(id); fireOrder.push({ id, weeksSince }); }
        }
        if (fired.size === REUNION_IDS.length) break;
        if (app.retired()) { why = "은퇴(전역 후)"; break; }
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        if (await app.pushCareerForward()) continue;
        if (await app.pushPendingForward()) continue;
        if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
        await app.runOneWeek();
        weeksSince++;
        if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지(전역후) ${s0}W${w0}`; break; }
      }
      for (const id of REUNION_IDS) {
        if (fired.has(id)) continue;
        const p = app.eventRuleProbe(id);
        if (p.발동 > 0) { fired.add(id); fireOrder.push({ id, weeksSince }); }
      }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  const elapsedMs = Date.now() - T0;
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify({ path: PATH_KEY, seed: SEED, why, dischargeWeekTag, fireOrder, 못본전역후주, elapsedMs }));
})();
