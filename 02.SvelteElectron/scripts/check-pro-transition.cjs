#!/usr/bin/env node
// 프로 전환 직후 **연도와 연차가 맞는가**.
//
//   npm run check:protransition
//
// 2026-08-08 UI에서 프로가 된 직후 헤더가 `프로 2년차 · 2026년`으로 보였다 —
// 그 직전이 2028년이었고 신인이면 1년차여야 한다. 다만 그때 세이브는
// **시즌종료 가드가 세이브에 없던 시절 롤오버를 3번 돌린 오염 상태**였다.
// 그래서 결함인지 여파인지 갈리지 않았다.
//
// 여기서는 **깨끗한 새 게임**으로 고교 3년을 밀어 드래프트를 거친 뒤,
// 전환 시점의 연도·연차·나이를 찍는다. 판정 기준은 셋뿐이다:
//
//   ① 연도가 뒤로 가지 않는다        (2028 → 2026 같은 역행)
//   ② 프로 첫 시즌은 1년차다          (proServiceYears 0 또는 1)
//   ③ 나이가 시즌당 1살씩만 는다      (가드 소실이면 2살씩 뛴다)

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 5);
// ⚠ 기본 씨앗을 20260803 → 20260802 로 (2026-09-02). 보크 상수·일정(144경기)·부상 창이 바뀐 세상에서
//   03 은 고교 미지명 → 군 → 독립(재지명은 2034 · 9시즌째)이라 "5시즌 안에 프로" 를 못 밟는다.
//   02 는 2029 고교 지명 → KBL 이다(probe:paths 실측). 이 검사는 배선(연도·나이·전환)을 보는 것이지
//   지명 확률을 보는 게 아니라, 프로에 닿는 씨앗이어야 한다.
const SEED = arg("seed", 20260802);

const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 프로 전환 · 연도/연차 ─────────────────────────────────");

  let tmp = null;
  let failed = 0;
  try {
    const boot = await headless.boot("protrans");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "PTR", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    const marks = [];
    let curSeason = start;
    let guard = 0;

    const mark = () => marks.push(app.protagonistState());
    mark();

    while (guard++ < 12000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      if (app.currentSeason() !== curSeason) { curSeason = app.currentSeason(); mark(); }
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      break;
    }
    mark();

    log("    연도  단계          학년/연차  나이");
    for (const m of marks) {
      const gr = m.grade != null ? `${m.grade}학년` : `${m.proServiceYears ?? 0}년차`;
      log(`    ${m.year}  ${String(m.stage).padEnd(12)}${gr.padEnd(10)}${m.age}`);
    }
    log("");

    const ok = (name, cond, detail) => {
      log(`  ${cond ? " ok " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
      if (!cond) failed++;
    };

    // ① 연도 역행
    let backward = null;
    for (let i = 1; i < marks.length; i++) {
      if (marks[i].year < marks[i - 1].year) { backward = `${marks[i - 1].year} → ${marks[i].year}`; break; }
    }
    ok("연도가 뒤로 가지 않는다", backward === null, backward ?? "");

    // ② 프로 첫 시즌 연차
    const firstPro = marks.find((m) => String(m.stage).startsWith("pro"));
    if (!firstPro) {
      ok(`${SEASONS}시즌 안에 프로가 된다`, false, "프로 도달 못 함 — 표본을 늘리거나 정책을 볼 것");
    } else {
      const y = firstPro.proServiceYears ?? 0;
      ok("프로 첫 시즌이 1년차다", y <= 1, `proServiceYears=${y} (${firstPro.year}년)`);
    }

    // ③ 나이가 시즌당 1살
    let jump = null;
    for (let i = 1; i < marks.length; i++) {
      const d = marks[i].age - marks[i - 1].age;
      const dy = marks[i].year - marks[i - 1].year;
      if (dy >= 1 && d > dy) { jump = `${marks[i - 1].year}→${marks[i].year} 나이 +${d}`; break; }
    }
    ok("나이가 시즌당 1살씩만 는다", jump === null, jump ?? "");

    log("");
    log("  읽는 법");
    log("    · ③이 실패하면 시즌종료가 두 번 돈 것이다 → check:seasonendguard 도 같이 본다");
    log("    · 깨끗한 새 게임이므로 여기서 통과하면 UI에서 본 건 오염 세이브의 여파다");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
  process.exit(failed > 0 ? 1 : 0);
})();
