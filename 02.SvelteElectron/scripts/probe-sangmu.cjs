"use strict";
/** 상무 인원이 왜 11명인가 — 시즌마다 본다. `node scripts/probe-sangmu.cjs`
 *
 * ⚠ 세계 생성 직후는 30명이다(독립 10팀 × 30 · 공백 0 · 실측 2026-08-31).
 *   줄어드는 건 시즌이 돌면서다. **총원만 세면 원인을 못 가른다.**
 * ⚠ 다른 독립 9팀을 나란히 찍는다 — 상무만인지 리그 전체인지 가른다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const YEARS = Number(process.env.SM_YEARS || 4);
const SEED = Number(process.env.SM_SEED || 20260803);
(async () => {
  const { app, tmp } = await headless.boot("sm");
  try {
    await app.boot({ slotId: "SM", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log(`[상무] 씨앗 ${SEED} · ${YEARS}시즌`);
    console.log(`  ${start} 시작  ${JSON.stringify(app.sangmuProbe())}`);
    let guard = 0, lastSeason = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // 🔴 롤오버 **앞**에서 잰다 — 뒤는 성적이 비어 있다(이 저장소에서 반복된 함정)
        console.log(`  ${app.currentSeason()} 종료  ${JSON.stringify(app.sangmuProbe())}`);
        await app.seasonRollover();
        lastSeason = app.currentSeason();
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log(`  ${lastSeason} 끝    ${JSON.stringify(app.sangmuProbe())}`);
  } finally { await headless.cleanup(tmp); }
})();
