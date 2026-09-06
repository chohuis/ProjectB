"use strict";
/**
 * REU 워커 — 재회 12종 무대별 도달, 경로 하나(프로/독립) × 씨앗 하나만
 * 돈다. `probe-d-reu-reunion.cjs`가 자식 프로세스로 띄운다(DR/LOC/MOR와
 * 같은 이유).
 *
 * 고교 졸업 직후 **강제로 입대시킨다**(`app.forceEnlist("general")` —
 * `MilitaryEnlistAskModal`이 부르는 함수와 같다). 화면 흐름을 기다리면
 * 입대 시점이 씨앗마다 흔들려 "전역 뒤 몇 주"를 가늠하기 어려워진다 —
 * 여기서는 입대 시점 자체를 고정하고 **전역 뒤 창(최대 2년)**만 본다.
 *
 * 병영생활 주간 선택은 `PB_MIL_CHOICE=ball`(관계가 쌓여야 `relation_gte
 * unitmate 20` 문턱을 넘는다 — `measure-slotreach.cjs` 머리말과 같은 함정).
 *
 * 전역 뒤에는 프로/독립 정책으로 계속 진행한다. 재회 12종 각각의 발동
 * 여부·최초 발동 주(전역 후 경과 주)를 `eventRuleProbe`로 매주 폴링해 잡는다.
 */
const path = require("node:path");
globalThis.__PB_MIL_CHOICE = process.env.PB_MIL_CHOICE || "ball";
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const PATH_KEY = process.env.PB_PATH || "pro"; // pro | indie
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
  const fireOrder = []; // {id, weeksSinceDischarge}
  try {
    await app.boot({ slotId: "REU" + SEED, worldSeed: SEED, seasonYear: 2026 });
    // 고교만 — 진로를 안 열어 3학년 말에 자연히 갈 곳이 없어지는 걸 막으려고
    // 입대를 강제한다. 정책은 아직 안 씀(입대까지는 진로 선택이 안 뜬다).
    app.setCareerPolicy({ draft: false, university: false, independent: false });
    let guard = 0;
    // 1) 고교 졸업까지 (또는 자연 입대) — 최대 4시즌
    const start0 = app.currentSeason();
    while (guard++ < 4 * 52 * 40) {
      if (app.protagonistState().stage !== "highschool") break;
      if ((app.pathSignals().military ?? "미필") !== "미필") break;
      if (app.currentSeason() - start0 >= 4) { why = "고교 4시즌 넘김(졸업 못 함)"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      await app.autoRun();
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지(고교) ${s0}W${w0}`; break; }
    }
    // 2) 아직 미필이면 강제 입대
    if ((app.pathSignals().military ?? "미필") === "미필" && why === "완주") {
      await app.forceEnlist("general");
    }
    // 3) 전역까지 — 전역 뒤 진로 정책을 미리 심어 둔다(careerChoiceHub가
    //    전역과 함께 다시 뜬다 — `pushCareerForward`가 그 정책을 쓴다)
    app.setCareerPolicy(POST_POLICY);
    app.resetEventFunnel();
    guard = 0;
    while (guard++ < 3 * 52 * 40) {
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
      // 4) 전역 뒤 — 최대 2년(104주)을 한 주씩 밀며 12종 발동을 잡는다
      const fired = new Set();
      let weeksSince = 0;
      guard = 0;
      while (guard++ < 130 && weeksSince < 110) {
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
      // 마지막 한 번 더 — 루프 탈출 직전 값 반영
      for (const id of REUNION_IDS) {
        if (fired.has(id)) continue;
        const p = app.eventRuleProbe(id);
        if (p.발동 > 0) { fired.add(id); fireOrder.push({ id, weeksSince }); }
      }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify({ path: PATH_KEY, seed: SEED, why, dischargeWeekTag, fireOrder }));
})();
