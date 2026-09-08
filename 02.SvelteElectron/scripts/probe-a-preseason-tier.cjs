"use strict";
/**
 * **개막 전에 등급 추첨이 도는가** — 고교 1~7주만 짧게 본다 (2026-09-08 · A · B 제보 ②).
 *
 * 🔴 B 실측: 고교 **1~7주에 폴백 11건**(레어 1~4주 · 유니크 1~7주). 개막 전이라
 *   레어·유니크에 후보가 하나도 없어서 추첨이 매번 한 등급 아래로 내려간 것이다.
 *   `tier.fallback` 은 **데이터 부족 신호**인데 거짓 경보를 내고 있었다.
 *
 * 고친 자리: `gradeWeights` 가 `ctx.seasonOpened === false` 면 노말만 남긴다.
 * 신호는 `EventContext.seasonOpened`(「내 일정에 이번 주까지 온 경기가 있나」)다.
 *
 * ⚠ `check:tiercoverage` 로는 **주차별로 못 가른다**(무대/등급으로만 센다).
 *   그래서 개막 전 구간만 따로 돌려 본다 — 몇 분이면 끝난다.
 *
 *   npm run probe:a:preseason
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const WEEKS = Number(process.env.PB_WEEKS || 7);
const SEED = Number(process.env.PF_SEED || 20260803);

(async () => {
  const { app, tmp } = await headless.boot(`pretier-${SEED}`);
  try {
    await app.boot({ slotId: "PT", worldSeed: SEED, seasonYear: 2026 });
    app.resetEventFunnel();
    const rows = [];
    for (let i = 0; i < WEEKS; i++) {
      const w0 = app.currentWeek();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (await app.pushPendingForward()) continue;
      if (app.isSeasonEnded()) break;
      await app.runOneWeek();
      const f = app.eventFunnelProbe();
      rows.push({ w: w0, 폴백: f.tier.fallback, 뽑힘: { ...f.tier.drawn } });
      if (app.currentWeek() === w0) break;
    }
    const f = app.eventFunnelProbe();
    console.log(`[개막 전 등급] 씨앗 ${SEED} · 고교 1~${WEEKS}주`);
    for (const r of rows) {
      console.log(`  W${String(r.w).padStart(2)}  누적폴백 ${r.폴백}  뽑힌등급 ${JSON.stringify(r.뽑힘)}`);
    }
    console.log("");
    console.log(`  폴백 총 ${f.tier.fallback}건 · 자리별 ${JSON.stringify(f.tier.fallbackBy)}`);
    console.log(`  뽑힌 등급 ${JSON.stringify(f.tier.drawn)}`);
    console.log(`  발동 등급 ${JSON.stringify(f.tier.emitted)}`);
    console.log("");
    // 🔴 **재는 것은 폴백이다.** 「노말만 뽑혔나」로는 못 잰다 — 개막 주는
    //   씨앗·무대마다 다르고(고교는 W5 안팎이다), 개막한 뒤에 레어가 뽑히는
    //   것은 **정상**이다. 고쳐야 했던 것은 「후보가 0 인데 뽑아 놓고 내려가는」
    //   자리이고 그 자국이 폴백이다.
    // ⚠ 아래 표의 「뽑힌등급」이 노말에서 다른 등급으로 갈리는 주가 곧 개막 주다 —
    //   그 앞이 노말뿐이면 이 갈래가 실제로 도는 것이다.
    const ok = f.tier.fallback === 0;
    console.log(ok
      ? "  ok  개막 전 구간에서 폴백이 0 이다 (고치기 전 고교 1~7주 11건)"
      : `  FAIL  폴백 ${f.tier.fallback}건 — ${JSON.stringify(f.tier.fallbackBy)}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await headless.cleanup(tmp);
  }
})();
