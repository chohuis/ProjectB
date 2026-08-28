"use strict";
/** 새로 세기 시작한 기록이 실제로 쌓이는가 — 그리고 SLG가 얼마나 움직이는가.
 *
 *  🔴 SLG를 근사(`(h + hr*3)/ab`)에서 루타로 고쳤다. 그 값이 **OPS를 통해
 *    승강 판정(`batterOpsBaseline`)·국가대표 form·트레이드 가치에 물려 있다** —
 *    얼마나 움직이는지 재지 않고 넘기면 밸런스를 눈감고 바꾸는 것이다.
 *
 *  ⚠ 옛 식과 새 식을 **같은 표본에서** 비교한다. 세이브를 두 벌 돌리면
 *    경기 자체가 달라져 차이가 어디서 왔는지 못 가린다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260826);
const YEARS = Number(process.env.PF_YEARS || 2);
(async () => {
  const { app, tmp } = await headless.boot("stats");
  let why = "완주";
  try {
    await app.boot({ slotId: "PS", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // 🔴 시즌이 넘어가기 **전에** 잰다 — 롤오버가 누적을 비운다
        console.log(`[기록] ${app.currentSeason()} ${JSON.stringify(app.statCoverageProbe())}`);
        await app.seasonRollover();
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
