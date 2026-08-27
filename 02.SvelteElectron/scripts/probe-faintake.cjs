"use strict";
/** **한 구단이 한 해에 선수를 어느 길로 데려오는가** — 드래프트·FA·용병·트레이드
 *
 *  🔴 `probe-faoffers.cjs`와 **방향이 반대다.** 그쪽은 "주인공 한 명에게 몇
 *    팀이 제안했나"(선수 1명당 구단 수)다. 여기는 "한 구단이 몇 명을
 *    데려왔나"다. 두 값을 섞어 읽으면 FA 규모를 자릿수째로 잘못 본다.
 *
 *  ⚠ **승격(육성)은 안 잡힌다.** `NpcCareerEventType`에 승격이 없어서
 *    2군↔1군 이동은 경력 사건으로 안 남는다 — 이 표는 **밖에서 들어오는
 *    길**만 센다.
 *
 *  ⚠ 용병은 `foreign_signing`이라 FA와 따로 센다. 외국인은 연차로 자격을
 *    쌓는 신분이 아니다(`market.ts`가 `isForeignInQuotaLeague`로 먼저 뺀다). */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260826);
const YEARS = Number(process.env.PF_YEARS || 12);
(async () => {
  const { app, tmp } = await headless.boot("faintake");
  let why = "완주";
  try {
    await app.boot({ slotId: "PI", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  // 경력 사건은 누적이라 **끝에 한 번**만 훑으면 전체 기간이 나온다
  console.log(`[영입경로] ${JSON.stringify(app.faIntakeTally())}`);
  console.log(`[END] ${why} · 씨앗 ${SEED} · 시즌 ${app.currentSeason()}`);
  await headless.cleanup(tmp);
})();
