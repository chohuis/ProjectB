"use strict";
/**
 * **야수 OVR 0 의 파급** — 한 번 돌려 필요한 값을 다 뽑는다. (1단계 · 2026-08-31)
 *
 * ⚠ 계측을 따로 돌리면 **서로 다른 세계를 보게 된다** — 이 계측은 같은
 *   씨앗도 실행마다 흔들린다. 한 실행에서 전부 뽑아야 견줄 수 있다.
 * ⚠ 롤오버 **앞**에서 잰다 — 뒤는 성적이 비어 있다.
 *
 *   SEED=20260803 YEARS=4 npm run probe:ovrimpact
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const YEARS = Number(process.env.YEARS || 4);
const SEED = Number(process.env.SEED || 20260803);
const J = (o) => JSON.stringify(o);
(async () => {
  const { app, tmp } = await headless.boot("oi");
  try {
    await app.boot({ slotId: "OI", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log(`[OVR파급] 씨앗 ${SEED} · ${YEARS}시즌`);
    let guard = 0, last = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { last = app.currentSeason(); await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log(`  [파급]  ${J(app.ovrImpactProbe())}`);
    console.log(`  [대학]  ${J(app.univFlowProbe())}`);
    console.log(`  [전향]  ${J(app.positionChangeProbe())}`);
    console.log(`  [예산]  ${J(app.payrollVsBudgetProbe())}`);
    console.log(`  [독립]  ${J(app.indTeamDetailProbe())}`);
    console.log(`  [연봉]  ${J(app.indSalarySourceProbe())}`);
    console.log(`  [연령]  ${J(app.ageServiceProbe())}`);
    console.log(`  [상무]  ${J(app.sangmuProbe())}`);
    console.log(`  [구성]  ${J(app.rosterCompositionProbe())}`);
    console.log(`  마지막시즌 ${last}`);
  } finally { await headless.cleanup(tmp); }
})();
