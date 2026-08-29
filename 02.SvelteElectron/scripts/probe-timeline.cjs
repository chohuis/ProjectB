"use strict";
/** 구단 연표가 실제로 채워지는가 (1단계)
 *
 *  ⚠ **시즌을 돌려야 값이 생긴다.** `history_standings` 는 시즌 종료에 쌓인다 —
 *    0시즌에서 빈 배열이 오는 건 결함이 아니다. 그래서 **전후를 같이 찍는다.** */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
const YEARS = Number(process.env.PF_YEARS || 3);
const TEAM = process.env.PF_TEAM || "TEAM_KBL_SEOUL_ROYALS_1";

(async () => {
  const { app, tmp } = await headless.boot("tl");
  let why = "완주";
  try {
    await app.boot({ slotId: "TL", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    console.log("[시작] " + JSON.stringify(await app.teamTimelineProbe(TEAM)));

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
        console.log(`[${seen}] ` + JSON.stringify(await app.teamTimelineProbe(TEAM)));
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
    // 2군도 본다 — **순위 계산에서 빠져야 하는 쪽**이다
    const farm = TEAM.replace(/_1$/, "_2");
    console.log("[2군] " + JSON.stringify(await app.teamTimelineProbe(farm)));
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
