"use strict";
/** 주인공 FA 제안이 어느 리그에서 오는가 — 해외 진출 1단계 재현·검증
 *
 *  🔴 두 가지를 같이 본다:
 *    · 해외(ABL·JBL)가 섞이는가 — 열려는 것
 *    · **2군이 섞이는가** — `faEngine`이 막고 있던 것 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260826);
const YEARS = Number(process.env.PF_YEARS || 8);
(async () => {
  const { app, tmp } = await headless.boot("faoffer");
  let why = "완주", shown = 0;
  // 🔴 **시즌당 한 번만 잰다** (2026-08-27). 예전엔 주 루프가 돌 때마다 셌다 —
  //   같은 해를 수십 번 찍고 `shown < YEARS`가 먼저 차서 **FA 자격 연차(KBL 5년)에
  //   닿기 전에 계측이 끝났다.** 그래서 표본이 전부 "자격 없음"이었다.
  let lastSeason = -1;
  try {
    await app.boot({ slotId: "PF", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      // 프로에 들어가면 매 시즌 한 번 잰다
      const st = app.protagonistState?.() ?? {};
      if (/^pro/.test(st.stage ?? "") && app.currentSeason() !== lastSeason) {
        lastSeason = app.currentSeason();
        const r = await app.faOfferProbe();
        console.log(`[FA제안] ${lastSeason} ${JSON.stringify(r)}`);
        shown++;
      }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  const st2 = app.protagonistState?.() ?? {};
  console.log(`[END] ${why} · 씨앗 ${SEED} · 최종무대 ${st2.stage ?? "?"} · 표본 ${shown}`);
  await headless.cleanup(tmp);
})();
