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
  const market = [];
  try {
    await app.boot({ slotId: "PF", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        await app.seasonRollover();
        // 🔴 **여기서 걷는다.** summary는 한 시즌분만 들고 있다
        market.push({ y: app.currentSeason(), ...app.faMarketProbe() });
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  for (const m of market) {
    console.log(`[시장] ${m.y} FA전환 ${m.FA전환} · 계약 ${m.계약} · 미계약 ${m.미계약}`
      + (m.미계약률 === null ? " · (엔진이 안 셌다)" : ` · 미계약률 ${m.미계약률}%`));
  }
  const tally = app.careerEventTally();
  for (const y of Object.keys(tally).sort()) {
    const t = tally[y];
    const got = t.fa_signed ?? 0, un = t.fa_unsigned ?? 0;
    if (!got && !t.trade && !t.release) continue;
    // ⚠ `fa_signed`는 **자격 취득**이지 계약 성사가 아니다(detail: "FA 취득 N년차").
    //   계약 성사는 사건을 안 남긴다 — 미계약(`fa_unsigned`)만 남는다.
    // 🔴 **`fa_contract`가 두 경로를 가른다.** 입찰 경로만 그 사건을 남긴다
    //    (`signed_salary.is_some()`). 없으면 `fa_bid_interest_min`이 0으로
    //    도착해 **예전 경로(아무 팀에나 배정)**를 탄 것이다 — 그 경로엔
    //    미계약이라는 갈래 자체가 없다.
    const ct = t.fa_contract ?? 0;
    console.log(`[FA] ${y} 시장에나옴 ${got} · 계약성사 ${ct} · 미계약 ${un}`
      + (got ? ` · 미계약률 ${Math.round(un / got * 100)}%` : "")
      + ` | 트레이드 ${t.trade ?? 0} · 방출 ${t.release ?? 0}`);
  }
  const all = Object.values(tally).reduce((a2, t) => {
    a2.c += t.fa_contract ?? 0; a2.u += t.fa_unsigned ?? 0; return a2;
  }, { c: 0, u: 0 });
  console.log(`[경로] fa_contract ${all.c} · fa_unsigned ${all.u} — `
    + (all.c || all.u ? "입찰 경로를 탄다" : "🔴 **예전 경로다(입찰 안 함)**"));
  console.log(`[모수] ${JSON.stringify(app.faTradeProbe())}`);
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
