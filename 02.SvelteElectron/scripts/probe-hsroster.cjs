"use strict";
/** 고교 로스터가 어디서 새는가 — **생성 직후부터 시즌마다 찍는다.**
 *
 *  정원은 30인데(`rosterSize`) 실측이 18 언저리다. 생성부터 그런지,
 *  시즌을 돌면서 빠지는지 **갈라야 고칠 자리를 안다.** */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260803);
const YEARS = Number(process.env.PF_YEARS || 4);

const line = (tag, p) => {
  const s = p.size, b = p.batters, t = p.pitchers;
  console.log(`[${tag}] 팀 ${p.teams} · 총 ${p.total}`
    + ` · 인원 ${s.min}/${s.med}/${s.max}`
    + ` · 야수 ${b.min}/${b.med}/${b.max}`
    + ` · 투수 ${t.min}/${t.med}/${t.max}`
    + ` · 야수9미만 ${p.under9}팀 · 포수0 ${p.noCatcher}팀`
    + ` · 학년 ${JSON.stringify(p.byGrade)}`
    + ` · 상태 ${JSON.stringify(p.byStatus)}`);
};

(async () => {
  const { app, tmp } = await headless.boot("hsr");
  let why = "완주";
  try {
    await app.boot({ slotId: "HS", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log("  (min/중앙/max)");
    line(`생성직후 ${start}`, app.hsRosterProbe());

    let guard = 0, seen = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentSeason() > seen) {
        seen = app.currentSeason();
        line(String(seen), app.hsRosterProbe());
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
