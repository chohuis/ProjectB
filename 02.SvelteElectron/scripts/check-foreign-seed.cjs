"use strict";
/**
 * 시작 시점 용병에게 **출신이 남아 있는지** 본다 (새 게임만, 시즌 진행 없음).
 *
 *   npm run check:foreignseed
 *
 * ⚠ **용병이 한국 독립리그 출신으로 기록돼 있었다.** `seedCareerHistory`가
 * KBL 전체에 과거 이력을 심으면서 외국인을 안 가려서, Rust `entry_route`가
 * 입단 나이 23~34를 전부 "독립"으로 매겼다:
 *
 *     2024  Martinez  육성선수 입단 (독립)
 *
 * 출신이 없는 것보다 나쁘다 — **틀린 값이 적혀 있는 것**이다.
 *
 * 세계는 2026년에 진행 중이므로 시작 시점에 이미 재작년·작년·올해 영입이
 * 섞여 있고, 작년에 성적이 안 돼 돌아간 사람의 기록도 남아 있어야 한다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++; log(`FAIL  ${name}`); if (detail) log(`        ${detail}`);
};

(async () => {
  const { app } = await headless.boot("chk-seed");
  // 새 게임만 만든다 — 시즌을 안 돌려도 시드는 이미 있어야 한다
  await app.boot({ slotId: "SEED", worldSeed: 20260806, seasonYear: 2026 });

  const d = await app.foreignSeedDiag("SEED");
  log(`\n용병 관련 기록 ${d.rows}건 · 연도 ${d.years.join(", ") || "(없음)"}`);
  for (const [k, v] of Object.entries(d.byCategory)) log(`  ${k.padEnd(18)} ${v}건`);
  for (const s of d.sample) log(`    ${s}`);

  check("시작 시점에 용병 기록이 있다 — 세계는 진행 중이다", d.rows > 0, `${d.rows}건`);
  // ⚠ 국내 입단 경로 문구가 남아 있으면 `seedCareerHistory`가 아직 용병을 잡고 있다
  // ⚠ **기록이 0건이면 이 검사는 아무것도 안 본다.** 모의 결함에서 실제로
  // 통과했다 — 볼 게 없어서 통과한 것을 통과라고 하면 안 된다
  check("용병에게 국내 입단 경로(고졸·대졸·독립)가 안 붙는다",
        d.rows > 0 && d.domesticRouteOnForeigner === 0,
        d.rows === 0 ? "볼 기록이 없다" : `${d.domesticRouteOnForeigner}건`);
  check("영입 기록이 있다", (d.byCategory.foreign_signing ?? 0) > 0);
  // ⚠ 전원 같은 해면 "올해 우르르 들어온" 세계가 된다
  // ⚠ **영입 연도만 본다.** 떠난 기록(작년 고정)이 섞이면 영입이 전부 올해여도
  // 두 해가 되어 통과한다 — 모의 결함에서 실제로 그랬다
  check("영입 연도가 한 해에 몰리지 않는다",
        d.signYears.length >= 2, `영입 연도 ${d.signYears.join(",")}`);
  check("떠난 용병 기록이 있다 — 작년에 성적이 안 돼 돌아갔다",
        (d.byCategory.release ?? 0) > 0);

  headless.cleanup();
  log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
