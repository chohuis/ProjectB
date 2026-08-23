"use strict";
/** FA 계약이 성적을 따라 몸값을 움직이는가 — 성적 구간별 배수를 본다.
 *  ⚠ 리그 전체 분포로는 못 본다. 계약자 개인의 전후를 봐야 한다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PC_SEED || 20260731);
const YEARS = Number(process.env.PC_YEARS || 4);
const rows = [];
(async () => {
  headless.setInterceptor(async (channel, args, call) => {
    const isOff = channel === "engine:call" && args[0] === "runOffseasonNative";
    const r = await call();
    if (isOff) {
      let out = {};
      try { out = typeof r === "string" ? JSON.parse(r) : r; } catch { /* 아래가 말해준다 */ }
      for (const e of (out.events || [])) {
        if (e.kind !== "fa_contract" || !e.detail) continue;
        // "전 → 후 · 팀 · 성적 N"
        const m = /^(\d+) → (\d+) · \S+ · 성적 (\S+)$/.exec(e.detail);
        if (!m) continue;
        rows.push({ before: +m[1], after: +m[2], score: m[3] === "없음" ? null : +m[3] });
      }
    }
    return r;
  });
  const { app, tmp } = await headless.boot("fac");
  try {
    await app.boot({ slotId: "FC", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
  } finally { await headless.cleanup(tmp); }

  const floor = rows.filter((r) => r.after === 1500).length;
  console.log(`[하한] 최저연봉(1500)으로 떨어진 계약 ${floor}건 / ${rows.length} (${Math.round(floor/Math.max(rows.length,1)*100)}%)`);
  const drop = rows.filter((r) => r.after < r.before).length;
  console.log(`[방향] 깎인 계약 ${drop} · 오른 계약 ${rows.length-drop}`);
  const withScore = rows.filter((r) => r.score !== null);
  console.log(`[표본] 계약 ${rows.length}건 · 성적 있음 ${withScore.length} · 없음 ${rows.length - withScore.length}`);
  const buckets = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 101]];
  for (const [lo, hi] of buckets) {
    const b = withScore.filter((r) => r.score >= lo && r.score < hi);
    if (!b.length) { console.log(`[성적 ${lo}~${hi}] 0건`); continue; }
    const mult = b.map((r) => r.after / Math.max(r.before, 1)).sort((a, b2) => a - b2);
    const med = mult[Math.floor(mult.length / 2)];
    const up = b.filter((r) => r.after > r.before).length;
    console.log(`[성적 ${lo}~${hi}] ${b.length}건 · 배수 중앙 ${med.toFixed(2)}`
      + ` · 최소 ${mult[0].toFixed(2)} · 최대 ${mult[mult.length - 1].toFixed(2)}`
      + ` · 오른 사람 ${Math.round(up / b.length * 100)}%`);
  }
})();
