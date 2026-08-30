#!/usr/bin/env node
// ── 타자 지표 실측 (Phase 1) ──────────────────────────────────────
//
// 테스트가 아니라 **숫자를 보는 도구**다. 수상 자격선(`minPa`)을 조정하기
// 전에 실제 타석 분포를 본다 — 감으로 옮기면 또 틀린다.
//
// ⚠ 예전엔 `pa`가 경기 수의 제곱으로 늘었다(`prev.pa + ab + bb`인데
// `ab`·`bb`가 이미 누적 합계였다). 그래서 `minPa` 200이 실질 4~5타석이었고
// 12타수 7안타(.583)가 타격왕이 됐다. `pa ≠ ab+bb`가 0이어야 정상이다.
//
//   npm run measure:batting
//   node scripts/measure-batting.cjs --seasons 2

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const SEED = arg("seed", 20260802);
const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 타자 지표 실측 ────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("batting");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "BAT", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    // 시즌 **중** 스냅샷도 남긴다 — 롤오버는 기록을 정산해 넘기므로
    // 거기서만 재면 시즌 중 누적이 어떻게 자라는지 못 본다
    let midSeason = null;
    let proSnap = null;
    const proSnaps = [];

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;

      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) {
        if (!midSeason && app.currentWeek() >= 30) midSeason = app.batterSampleProbe();
        continue;
      }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        const y = app.currentSeason();
        // ⚠ **롤오버 전에 찍는다.** 롤오버는 시즌 기록을 정산하고 비우므로
        // 뒤에서 읽으면 주인공 기록이 통째로 `없음`으로 나온다(실측 week 0).
        // 리그 프로브도 같은 이유로 여기 있다.
        proSnap = app.protagonistStatProbe();
        // 시즌마다 남긴다 — 한 시즌 표본(11이닝)으로는 모델 문제인지
        // 소표본인지 못 가른다
        proSnaps.push(`${y} 주인공 ${JSON.stringify(proSnap)}`);
        // ⚠ 리그 평균과 비교하면 "주인공이 약해서"와 "모델이 달라서"를 못 가른다.
        // 같은 리그·비슷한 OVR의 NPC를 대조군으로 둔다
        proSnaps.push(`${y} 대조군 ${JSON.stringify(app.peerPitcherProbe())}`);
        // 리그 합산이 맞아도 전원이 평균이면 능력치가 안 먹는 것이다
        proSnaps.push(`${y} 편차 ${JSON.stringify(app.abilitySpreadProbe())}`);
        proSnaps.push(`${y} 라인업 ${JSON.stringify(app.lineupDepthProbe())}`);
        // 전 리그 로스터 구성 — 생성 시점엔 보장돼도 시즌이 돌면 무너진다
        for (const [lg, v] of Object.entries(app.rosterCompositionProbe())) {
          proSnaps.push(`${y} 구성 ${lg} ${JSON.stringify(v)}`);
        }
        const probe = app.batterSampleProbe();
        log("");
        log(`[${y} 시즌종료]`);
        for (const [lg, v] of Object.entries(probe)) {
          log(`  ${lg}  ${JSON.stringify(v)}`);
        }
        // ⚠ **롤오버 앞이어야 한다.** `seasonRollover()` 가 시즌 성적을
        //   비우므로 뒤에서 세면 전부 0이다(실제로 그렇게 나왔다).
        for (const lg of ["LEAGUE_KBL", "LEAGUE_HIGHSCHOOL"]) {
          log(`  신규사건 ${JSON.stringify(app.newEventProbe(lg))}`);
        }
        await app.seasonRollover();
        continue;
      }
      break;
    }

    if (midSeason) {
      log("");
      log("[시즌 중 W30 스냅샷]");
      for (const [lg, v] of Object.entries(midSeason)) log(`  ${lg}  ${JSON.stringify(v)}`);
    }

    // ── 주인공 경기 모델 (1-c) ─────────────────────────────────
    //
    // ⚠ 리그와 **다른 코드**가 만든 숫자다(`match_engine.rs`). 리그만 KBO
    // 수준으로 맞춰두면 주인공만 다른 야구를 하게 되고, 같은 수상·승강
    // 규칙을 공유하므로 그대로 평가가 어긋난다.
    log("");
    log("[주인공]");
    for (const l of proSnaps) log("  " + l);
    if (proSnaps.length === 0) log("  " + JSON.stringify(app.protagonistStatProbe()));
    log("  " + JSON.stringify(app.protagonistState()));

    log("");
    log("[수상]");
    const aw = app.awardTally();
    log(`  수상선수 ${aw.수상선수}명`);
    log(`  부문별 ${JSON.stringify(aw.부문별)}`);
    log(`  리그별 ${JSON.stringify(aw.리그별)}`);
    for (const [lg, t] of Object.entries(aw.리그별부문 ?? {})) {
      log(`    ${lg} ${JSON.stringify(t)}`);
    }
    for (const e of aw.표본 ?? []) log(`    ${e}`);
  } catch (e) {
    log("ERR " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
  log("");
})();
