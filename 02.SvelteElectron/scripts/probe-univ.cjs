"use strict";
/** 대학이 몇 년 도는가 — ⑦ 재현. `universityWeek`과 진로 선택을 같이 본다.
 *  ⚠ `UNIVERSITY_FINAL_GRADE`는 이미 4다. 막는 게 진급 판정이 아닐 수 있다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260803);
(async () => {
  const { app, tmp } = await headless.boot(process.env.PF_TAG || "unv");
  try {
    await app.boot({ slotId: (process.env.PF_SLOT || "UV"), worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0, maxUw = 0, lastStage = "";
    const path2 = [];
    while (guard++ < 6 * 52 * 60 && app.currentSeason() < start + 6) {
      if (app.retired()) { path2.push("retired"); break; }
      const st = app.protagonistState();
      const stage = String(st.stage ?? "?");
      const uw = Number(st.universityWeek ?? 0);
      if (uw > maxUw) maxUw = uw;
      if (stage !== lastStage) {
        path2.push(`${stage}@${app.currentSeason()}W${app.currentWeek()}(uw${uw})`);
        lastStage = stage;
      }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const k = app.pendingKind();
      if (k && k !== "draftObserve") {
        // 진로 선택이 뜨면 무엇이 떴는지 남긴다
        if (stage === "university") console.log(`  [선택] ${app.currentSeason()}W${app.currentWeek()} uw${uw} · ${k}`);
      }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log(`[경로] ${path2.join(" → ")}`);
    console.log(`[대학] universityWeek 최대 ${maxUw} (= ${(maxUw / 52).toFixed(1)}년) · 씨앗 ${SEED}`);
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
