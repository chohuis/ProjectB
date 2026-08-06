"use strict";
/**
 * B-4 — 대학 대회 3개가 왜 미완인가 (진단 전용, 고치지 않는다)
 *
 *   npm run diag:univtour -- [--weeks 22]
 *
 * ⚠ 한 시즌 실측(2026-08-06):
 *
 *     TOUR_HS_GAENARI        라운드 5 · 완료 31 · 우승 있음    ← 고교 5개 정상
 *     TOUR_UNIV_WANGJUNGWANG 라운드 3 · 완료  0 · 우승 없음
 *     TOUR_UNIV_EUNHA        (브래킷 자체가 없음)
 *     TOUR_UNIV_YEOMYEONG    (브래킷 자체가 없음)
 *
 * 왕중왕전은 **일정 4건을 전부 치렀는데 라운드 완료가 0**이다 — 결과가 브래킷에
 * 반영되지 않는다. 은하기·여명기는 조별예선(24·30경기)을 다 치르고도 본선
 * 브래킷이 안 생긴다.
 *
 * ## 원인 (해결 2026-08-06)
 *
 * 왕중왕전이 **주인공 일정(`s.schedule`)에 0건**인데 `tourScheduleState`로는
 * 4건이 치러져 있었다 — 대회 경기는 리그에 따라 두 군데로 나뉜다.
 * 주인공 리그면 `schedule`, 아니면 `leagueSchedules[리그]`.
 *
 * 그런데 `progressTournaments`와 `promoteFinishedGroupStages`가 **`schedule`만**
 * 읽었다. 그래서 주인공이 고교면 대학 대회가 통째로 멎었다 — 경기는 치러지는데
 * 결과가 브래킷에 닿지 않는다. 고교 대회가 되던 건 주인공이 고교였기 때문이다.
 *
 * ⚠ **주인공이 대학에 가면 이번엔 고교 대회가 멎었을 것이다.** 리그가 바뀌면
 * 멎는 쪽도 바뀐다.
 */

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const WEEKS = arg("weeks", 22);   // 여명기 startWeek 18 + 여유
const SEED = arg("seed", 20260806);

const log = (s) => process.stdout.write(s + "\n");
const TOURS = ["TOUR_UNIV_WANGJUNGWANG", "TOUR_UNIV_EUNHA", "TOUR_UNIV_YEOMYEONG",
               "TOUR_HS_GAENARI"];

(async () => {
  const { app } = await headless.boot("diag-ut");
  await app.boot({ slotId: "DIAGUT", worldSeed: SEED, seasonYear: 2026 });

  let guard = 0;
  while (app.currentWeek() < WEEKS && guard++ < WEEKS * 4) {
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() - before <= 0) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      break;
    }
  }

  log(`\n── W${app.currentWeek()} 시점 ──`);
  for (const t of TOURS) {
    log(`\n[${t}]`);
    // 고교 대회는 정상이므로 **대조군**이다. 같이 찍어야 어디가 다른지 보인다
    for (const line of app.tourDetail(t)) log(line);
  }

  log("\n── 조별예선 ──");
  for (const [id, v] of Object.entries(app.tourScheduleState())) {
    if (!id.startsWith("TOUR_UNIV")) continue;
    log(`  ${id.padEnd(26)} 일정 ${v.entries} · 치름 ${v.played}`);
  }

  headless.cleanup();
  process.exit(0);
})().catch((e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
