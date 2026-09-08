"use strict";
/**
 * **강등 통지가 진짜로 내려보내는가** — 테스터가 겪은 자리 (2026-09-08 · A).
 *
 * 🔴 신고: 「2군으로 가라는 메시지가 왔고 **가겠다고 했는데도 안 내려갔다**」.
 *   L2 에서 문(`rosterMove`)을 뚫고 L4 에서 데이터를 붙였는데, **아무도 실제로
 *   내려가는지 못 쟀다** — 그 이벤트가 뜨려면 「2년차 이하 · 방어율 5.5+ ·
 *   8경기+ · W14+」인 판이 필요한데 자동 진행으로 그 자리가 안 나온다.
 *
 * 그래서 **판은 진짜로 만들고 성적만 심는다**:
 *   ① 드래프트로 프로까지 실제로 간다(고교 3년 · 몇 분)
 *   ② 2군이면 콜업 경로로 1군에 올린다 — **그 경로도 같이 재는 셈이다**
 *   ③ W14 를 넘긴다
 *   ④ 성적을 심고(`plantSeasonStats`) 한 주를 돌린다 → 통지가 뜬다
 *   ⑤ **화면이 부르는 그 함수**(`applyDecision`)로 「받아들인다」
 *   ⑥ 소속·리그·**일정**이 2군으로 갔는지 본다
 *
 * ⚠ ⑥ 에 일정이 들어가는 것이 핵심이다 — 소속만 바뀌고 일정이 안 바뀌면
 *   순위표만 맞고 상대가 전부 옛 리그 팀이 된다.
 *
 *   npm run probe:a:demote
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);

(async () => {
  const { app, tmp } = await headless.boot(`demote-${SEED}`);
  try {
    await app.boot({ slotId: "DM", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true, overseas: false });

    // ① 프로까지 간다
    const guard = makeStallGuard();
    let n = 0;
    while (n++ < 6 * 52 * 40) {
      const st = app.protagonistState().stage;
      if (String(st).startsWith("pro_")) break;
      if (app.retired()) break;
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { guard.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { guard.hit(true); continue; }
      if (await app.pushPendingForward()) { guard.hit(true); continue; }
      if (app.isSeasonEnded()) { guard.hit(true); await app.seasonRollover(); continue; }
      await app.runOneWeek();
      if (guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }
    const st0 = app.protagonistState();
    console.log(`[강등 통지] 씨앗 ${SEED}`);
    console.log(`  프로 도달 — 무대 ${st0.stage} · 팀 ${st0.team} · 리그 ${st0.league} · ${app.currentSeason()}시즌 W${app.currentWeek()}`);
    if (!String(st0.stage).startsWith("pro_")) {
      console.log("  FAIL  프로에 못 갔다 — 씨앗을 바꿔라");
      process.exitCode = 1; return;
    }

    // ② 2군이면 1군으로 — **콜업 경로도 여기서 같이 재진다**
    if (String(st0.team).endsWith("_2")) {
      const up = app.callupProtagonistProbe();
      console.log(`  콜업 ${JSON.stringify(up)}`);
    }

    // ③ W14 를 넘긴다
    let g2 = 0;
    const guard2 = makeStallGuard();
    while (app.currentWeek() < 15 && g2++ < 200) {
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { guard2.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { guard2.hit(true); continue; }
      if (await app.pushPendingForward()) { guard2.hit(true); continue; }
      if (app.isSeasonEnded()) { guard2.hit(true); await app.seasonRollover(); continue; }
      await app.runOneWeek();
      if (guard2.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }

    // ④⑤⑥
    const r = await app.demotionNoticeProbe();
    console.log("");
    console.log(JSON.stringify(r, null, 1));
    console.log("");
    if (r.ok) {
      console.log("  ok  「받아들인다」를 고르니 소속·리그·일정이 전부 2군으로 갔다");
    } else {
      console.log(`  FAIL  ${r.이유 ?? JSON.stringify(r.판정)}`);
    }
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await headless.cleanup(tmp);
  }
})();
