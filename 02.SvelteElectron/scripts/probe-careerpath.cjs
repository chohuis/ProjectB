"use strict";
/** 진로가 어디로 갈리는가 — **해외 직행이 드래프트를 밀어내지 않는가.**
 *
 *  🔴 1~4단계에서 못 잰 것이다. 하네스가 해외 지원을 안 넣어서
 *    도달률·선택률을 영영 못 쟀다(2026-08-27에 넣었다).
 *
 *  ⚠ 문턱이 높아(★3 = OVR 78) 대부분 떨어진다 — **0이 나와도 결함이 아니다.**
 *    확인할 것은 "해외가 대학·드래프트를 통째로 대체하지 않는가"다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260826);
const YEARS = Number(process.env.PF_YEARS || 8);
(async () => {
  const { app, tmp } = await headless.boot("cpath");
  let why = "완주";
  const picks = [];
  try {
    await app.boot({ slotId: "PC", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const moved = await app.pushCareerForward();
      if (moved) {
        // 진로가 갈린 자리만 남긴다 — 매주 찍으면 로그가 묻힌다
        if (String(moved).startsWith("careerChoice(")) picks.push(String(moved));
        continue;
      }
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  const st = app.protagonistState ? app.protagonistState() : {};
  console.log(`[진로선택] ${picks.join(" → ") || "(없음)"}`);
  console.log(`[END] ${why} · 씨앗 ${SEED} · 최종무대 ${st.stage ?? "?"}`);
  await headless.cleanup(tmp);
})();
