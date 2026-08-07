#!/usr/bin/env node
// 육성선수 제도 실측 — **공급을 열었더니 드래프트가 무의미해졌는가.**
//
//   npm run measure:devplayer
//   node scripts/measure-devplayer.cjs --seasons 3 --seed 20260807
//
// `check:devplayer`는 경로가 **열렸는지**를 본다(엔진 1회 호출). 여기서는
// 시즌을 실제로 돌려 **열린 결과가 어떻게 되는지**를 본다. 둘은 다른 질문이다.
//
// 보는 것:
//   ① 진로 분포   — 갈 곳이 생겼는가 (예전엔 시즌당 1,135명이 그만뒀다)
//   ② 2군 구성    — 육성선수가 정식 로스터를 밀어냈는가
//   ③ 드래프트 가치 — 지명자와 육성선수가 실제로 다른 대우를 받는가
//
// ⚠ ③이 핵심이다. ①만 좋아지고 ③이 무너지면 "미지명이 나은 선택"이 되어
// 드래프트라는 갈림길 자체가 사라진다.
//
// ⚠ **판정이 아니라 계측이다.** 기준선이 없는 채로 실패/통과를 매기면
// 숫자를 추측으로 만지게 된다 — 이 세션에서 이미 그렇게 하한을 올렸다가
// 1군을 굶긴 적이 있다. 여기서는 숫자를 찍고, 판정은 사람이 한다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const SEED = arg("seed", 20260803);

const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 육성선수 실측 ─────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("devplayer");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "DEVP", worldSeed: SEED, seasonYear: 2026 });
    // 드래프트가 돌아야 미지명자가 생긴다 — 이 계측의 전제다
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    const snaps = [];
    let guard = 0;

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        await app.seasonRollover();
        // ⚠ **오프시즌 직후에 잰다.** 미지명자 배정은 시즌 넘김에서 돌므로
        // 시즌 종료 시점에 재면 그 해 배정이 아직 안 들어가 있다
        snaps.push(app.devPlayerProbe());
        continue;
      }
      break;
    }
    snaps.push(app.devPlayerProbe());

    const last = snaps[snaps.length - 1];
    log(`      ${start}~${app.currentSeason()} · ${snaps.length}회 관측`);
    log("");

    // ── ① 진로 분포 ────────────────────────────────────────
    log("  ① 진로 분포 — 미지명자가 어디로 갔나");
    const route = last["① 진로 분포"] ?? {};
    const years = Object.keys(route).sort();
    if (years.length === 0) {
      log("      (배정이 한 번도 안 돌았다 — 드래프트가 안 열렸을 수 있다)");
    }
    for (const y of years) {
      const r = route[y];
      const tot = Object.values(r).reduce((a, b) => a + b, 0);
      const parts = Object.entries(r).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k.replace(/^LEAGUE_/, "")} ${v}`);
      log(`      ${y}  합계 ${String(tot).padStart(5)}  |  ${parts.join(" · ")}`);
    }
    log("");
    log("  ①b 경로별 — Placer를 타는 경로가 둘이다 (오프시즌 / 드래프트)");
    for (const [k, v] of Object.entries(last["①b 경로별"] ?? {})) {
      const parts = Object.entries(v).sort((a, b) => b[1] - a[1])
        .map(([d, c]) => `${d.replace(/^LEAGUE_/, "")} ${c}`);
      log(`      ${k.padEnd(18)} ${parts.join(" · ")}`);
    }
    log("");
    log("  ①c 2군 자리 — '왜 0명인가'는 자리이거나 배선이다");
    log(`      KBL 2군 ${last["①c KBL 2군 팀수"]}팀 · 여유자리 ${last["①c KBL 2군 여유자리"]} (정원 34)`);
    log(`      팀별 인원 ${JSON.stringify(last["①c KBL 2군 인원"])}`);
    log("");

    // ── ② 2군 구성 ─────────────────────────────────────────
    log("  ② 2군 구성 — 육성선수가 정식 로스터를 밀어냈나");
    log(`      2군 ${last["② 2군 팀수"]}팀 · 인원 ${last["② 2군 인원"]}명 (육성 ${last["② 육성선수"]}명)`);
    log(`      팀당 인원 중앙 ${last["② 팀당 인원 중앙"]} · 최대 ${last["② 팀당 인원 최대"]}`);
    log(`      육성 비중 중앙 ${last["② 육성 비중 중앙"]} · 최대 ${last["② 육성 비중 최대"]}`);
    log("");

    // ── ③ 드래프트 가치 ────────────────────────────────────
    log("  ③ 드래프트 가치 — 지명과 육성이 실제로 갈리나");
    log(`      지명자   ${String(last["③ 지명자 수"]).padStart(5)}명 · 1군 도달률 ${last["③ 지명자 1군 도달률"]} · 연봉 중앙 ${last["③ 지명자 연봉 중앙"]}`);
    log(`      육성선수 ${String(last["③ 육성선수 수"]).padStart(5)}명 · 1군 도달률 ${last["③ 육성 1군 도달률"]} · 연봉 중앙 ${last["③ 육성 연봉 중앙"]}`);
    log("");

    // ── 읽는 법 ────────────────────────────────────────────
    log("  읽는 법");
    log("    ① '그만둠'이 여전히 1,000명대면 배선이 또 죽은 것이다");
    log("    ② 팀당 인원이 정원(34)을 크게 넘으면 정원 밖 인원이 폭주한 것이다");
    log("    ③ 육성 1군 도달률이 지명자와 비슷하면 드래프트가 무의미해진 것이다");
    log("");
    log("  ⚠ 판정하지 않는다. 기준선이 없는 채로 통과/실패를 매기면");
    log("     숫자를 추측으로 만지게 된다 — 이 프로젝트에서 이미 그렇게");
    log("     하한을 올렸다가 1군을 굶긴 적이 있다.");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
})();
