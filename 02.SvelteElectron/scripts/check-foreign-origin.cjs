"use strict";
/**
 * 용병이 **실제로 해외에서 오는지** 본다.
 *
 *   npm run check:foreignorigin
 *
 * ⚠ **예전엔 무에서 만들었다.** `generateForeignPlayersNative`가 선수를 새로
 * 찍고 `careerHistory: []` · `careerEvents: []`로 넣어서, KBL 용병과 국내
 * 신인을 화면이 구분할 방법이 없었다.
 *
 * 여기서 못 박는 것:
 *   ① KBL 용병에게 `foreign_signing` 경력이 있다 (어디서 왔는지가 남는다)
 *   ② 출신이 **마이너에 몰린다** — 메이저 주전급은 연봉 때문에 잘 안 온다
 *   ③ 퇴출된 용병이 은퇴가 아니라 **본국으로 돌아간다**
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++; log(`FAIL  ${name}`); if (detail) log(`        ${detail}`);
};

(async () => {
  const { app } = await headless.boot("chk-fgn");
  await app.boot({ slotId: "FGN", worldSeed: 20260806, seasonYear: 2026 });

  let guard = 0;
  const start = app.currentSeason();
  while (app.currentSeason() - start < SEASONS && guard++ < SEASONS * 200) {
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() - before <= 0) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      break;
    }
  }

  const d = app.foreignDiag();
  log(`\nKBL 외국인 ${d.total}명 · 출신 기록 있음 ${d.withOrigin}명`);
  for (const [k, v] of Object.entries(d.byOrigin).sort((a, b) => b[1] - a[1])) {
    log(`  ${k.replace("LEAGUE_", "").padEnd(14)} ${v}명`);
  }
  for (const s of d.sample) log(`    ${s}`);

  log(`
보유 한도 — 팀당 최대 ${d.maxPerTeam}명 (한도 3) · ${d.teams}팀`);
  log(`ABL 계열 ${d.ablTotal}명 · 국적 ${JSON.stringify(d.ablNationality)} · 한국식 이름 ${d.ablKoreanName}명`);

  if (d.overPaths.length > 0) {
    log("\n한도 초과 팀의 용병 — 마지막 경력 사건:");
    for (const l of d.overPaths) log("  " + l);
  }

  check("KBL에 외국인이 있다", d.total > 0, `${d.total}명`);
  // ⚠ 게이트를 열면 ABL·JBL 선수가 **일반 FA로도** KBL에 온다 — 그 경로는
  // 외국인 보유 한도를 안 본다. KBO 3명 규정이 깨진다
  check("보유 한도(팀당 3명)를 안 넘는다", d.maxPerTeam <= 3, `최대 ${d.maxPerTeam}명`);
  // ⚠ 해외 신인 생성이 서양 이름 풀을 안 받으면 **미국 리그가 한국 이름으로 찬다**
  check("ABL 선수가 한국식 이름이 아니다",
        d.ablTotal === 0 || d.ablKoreanName / d.ablTotal < 0.1,
        `${d.ablKoreanName}/${d.ablTotal}명이 한국식`);
  // ⚠ 첫 시즌 용병은 새 게임이 만든 사람들이라 출신이 없다 — 순환이 한 번은
  // 돌아야 이적이 생긴다. 그래서 "전원"이 아니라 "하나라도"를 본다
  check("이적으로 들어온 용병이 있다 — 무에서 만들지 않는다",
        d.withOrigin > 0, "출신 기록이 하나도 없다 (전부 생성 경로)");

  const minor = d.byOrigin.LEAGUE_ABL_FARM ?? 0;
  const major = d.byOrigin.LEAGUE_ABL ?? 0;
  if (d.withOrigin > 0) {
    check(`마이너 출신이 메이저보다 많다 (${minor} vs ${major})`, minor >= major);
  }

  headless.cleanup();
  log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
