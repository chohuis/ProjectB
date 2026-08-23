"use strict";
/** FA 시장이 도는가 — 연도별 계약·미계약과 자격자 모수를 같이 본다.
 *  ⚠ 미계약률만 보면 안 된다. 시장에 사람이 원래 적은 것과
 *    입찰이 사람을 안 뽑는 것은 다른 문제다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 5);
(async () => {
  const { app, tmp } = await headless.boot("fa");
  let why = "완주";
  try {
    await app.boot({ slotId: "PF", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  const tally = app.careerEventTally();
  for (const y of Object.keys(tally).sort()) {
    const t = tally[y];
    const got = t.fa_signed ?? 0, un = t.fa_unsigned ?? 0;
    if (!got && !t.trade && !t.release) continue;
    // ⚠ `fa_signed`는 **자격 취득**이지 계약 성사가 아니다(detail: "FA 취득 N년차").
    //   계약 성사는 사건을 안 남긴다 — 미계약(`fa_unsigned`)만 남는다.
    console.log(`[FA] ${y} 시장에나옴 ${got} · 미계약 ${un}`
      + (got ? ` · 미계약률 ${Math.round(un / got * 100)}%` : "")
      + ` | 트레이드 ${t.trade ?? 0} · 방출 ${t.release ?? 0}`);
  }
  console.log(`[모수] ${JSON.stringify(app.faTradeProbe())}`);
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
