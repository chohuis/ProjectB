#!/usr/bin/env node
// ── 로스터 포지션 균형 다시즌 회귀 (Phase 2-a) ────────────────────
//
// 생성 시점은 `test-roster-gen`이 이미 본다 — 8포지션을 두 바퀴 돌아 백업까지
// 보장하고 국내 전 팀을 검사한다. **그건 새 게임 시점뿐이다.**
//
// 여기서 보는 건 **시즌이 돌아도 유지되는가**다. 은퇴·부상·승강·FA·드래프트가
// 매년 로스터를 갈아엎고, 충원 경로가 "몇 명"만 보고 "어느 자리"를 안 보면
// 포지션이 조용히 무너진다.
//
// ⚠ 실측(수정 전, 2029): 고교 102팀 중 **93팀**이 어느 포지션인가 공백,
// 포수 0명인 팀이 **22팀**. KBL 1군은 야수 8명/투수 29명인 팀이 나왔다.
// 아무 오류도 안 난다 — 라인업 구성기가 남는 야수로 메우고 넘어간다.
//
// ⚠ **포수를 따로 본다.** 다른 자리는 대체가 되지만 포수는 전문 요원이라
// 0명이면 경기가 성립하지 않는다.
//
//   npm run test:rosterbalance
//   node scripts/test-roster-balance.cjs --seasons 6 --verbose

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 4);
const SEED = arg("seed", 20260803);
const verbose = process.argv.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) log(`  ok  ${name}`);
  else { failed++; log(`FAIL  ${name} ${extra}`); }
}

// 리그별 하한. **정본은 생성 규칙이다** —
// `rosterSize` × `pitcherRatio`(0.45)에서 나오는 구성이 기준선이고,
// 여기 값은 부상·강등 여유를 뺀 선이다. 아마추어는 로스터가 작아 더 낮다.
const FLOOR = {
  HIGHSCHOOL:  { bat: 11, pit: 5 },
  UNIVERSITY:  { bat: 11, pit: 6 },
  INDEPENDENT: { bat: 11, pit: 6 },
  "KBL_1군":   { bat: 14, pit: 9 },
  "KBL_2군":   { bat: 12, pit: 8 },
};

(async () => {
  log("");
  log("── 로스터 포지션 균형 회귀 ───────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("rosterbal");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "RBAL", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    // 마지막 시즌 관측값. **시즌마다 최악을 누적**한다 — 마지막 한 시점만 보면
    // 중간에 무너졌다가 회복된 구간을 놓친다
    const worst = {};

    // 시점별로 따로 모은다
    const byPhase = { "시즌종료": {}, "오프시즌직후": {} };
    const absorb = (phase = "시즌종료") => {
      const comp = app.rosterCompositionProbe();
      const bucket = byPhase[phase];
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;
        const b = bucket[lg] ?? { 최소야수: 999, 최소투수: 999 };
        b.최소야수 = Math.min(b.최소야수, v.최소야수);
        b.최소투수 = Math.min(b.최소투수, v.최소투수);
        bucket[lg] = b;
      }
      for (const [lg, v] of Object.entries(comp)) {
        if (v.로스터없음 === v.팀) continue;   // 비활성 리그(ABL·JBL)
        const w = worst[lg] ?? { 포수없는팀: 0, 포지션공백팀: 0, 최소야수: 999, 최소투수: 999, 상세: [] };
        w.포수없는팀   = Math.max(w.포수없는팀, v.포수없는팀);
        w.포지션공백팀 = Math.max(w.포지션공백팀, v.포지션공백팀);
        w.최소야수     = Math.min(w.최소야수, v.최소야수);
        w.최소투수     = Math.min(w.최소투수, v.최소투수);
        if (w.상세.length === 0 && v.상세.length > 0) w.상세 = v.상세;
        worst[lg] = w;
      }
    };

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // ⚠ **두 시점을 각각 잰다.** 야수 7명인 팀이 왜 남는지는
        //   · 오프시즌 직후에 이미 7명  → 충원(`fill_first_teams`)에 안 걸린다
        //   · 직후엔 14명인데 시즌 말 7명 → 시즌 중 유출(트레이드·부상)
        // 로 갈리고, 고칠 곳이 완전히 다르다. 한 시점만 재면 구분이 안 된다.
        absorb("시즌종료");
        await app.seasonRollover();
        absorb("오프시즌직후");
        continue;
      }
      break;
    }
    absorb("시즌종료");

    log(`      ${start}~${app.currentSeason()} · 시즌마다 최악값 누적`);
    // 시점 대조 — 어느 쪽에서 무너지는지 한눈에 본다
    for (const lg of Object.keys(byPhase["시즌종료"])) {
      const a1 = byPhase["오프시즌직후"][lg];
      const b1 = byPhase["시즌종료"][lg];
      if (!a1 || !b1) continue;
      log(`      [시점] ${lg.padEnd(12)} 오프시즌직후 야수${a1.최소야수}/투수${a1.최소투수}` +
          `  →  시즌종료 야수${b1.최소야수}/투수${b1.최소투수}`);
    }
    for (const [lg, w] of Object.entries(worst)) {
      if (verbose) log(`      ${lg} ${JSON.stringify(w)}`);
      const floor = FLOOR[lg];

      // ⚠ 포수 0명은 **경기가 성립하지 않는다.** 절대 허용하지 않는다
      check(`${lg}: 포수 없는 팀 0`, w.포수없는팀 === 0, `${w.포수없는팀}팀`);
      check(`${lg}: 포지션 공백 팀 0`, w.포지션공백팀 === 0,
        `${w.포지션공백팀}팀 ${w.상세.slice(0, 2).join(" / ")}`);
      if (floor) {
        check(`${lg}: 야수 ${floor.bat}명 이상`, w.최소야수 >= floor.bat, `최소 ${w.최소야수}`);
        check(`${lg}: 투수 ${floor.pit}명 이상`, w.최소투수 >= floor.pit, `최소 ${w.최소투수}`);
      }
    }
  } catch (e) {
    failed++;
    log(`FAIL  ${String((e && e.message) || e).split("\n").slice(0, 6).join("\n      ")}`);
  } finally {
    if (tmp) headless.cleanup(tmp);
  }

  log("");
  log(failed === 0 ? "로스터 균형 회귀 통과" : `로스터 균형 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
