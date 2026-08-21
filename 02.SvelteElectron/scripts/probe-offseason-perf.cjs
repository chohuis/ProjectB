"use strict";
/**
 * 오프시즌에 **실제로 넘어가는** 성적 평점을 연다.
 *
 * 독립리그를 방출 목록에 넣었는데 31세 초과가 18→37→50으로 계속 늘었다.
 * 성적이 안 붙는 것인지, 붙어도 임계값(55)을 못 넘는 것인지 갈라야 한다 —
 * 추측하면 또 틀린다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEASONS = 3, SEED = 20260731;
const rows = [];

headless.setInterceptor(async (channel, args, call) => {
  // ⚠ **args[0]는 Rust export 이름이다** — TS 래퍼 이름(npcRunOffseason)으로
  // 걸렀더니 한 건도 안 잡혔다. preload.cjs가 둘을 이어 준다:
  //   npcRunOffseason: (p) => invoke("engine:call", "runOffseasonNative", p)
  if (channel === "engine:call" && args[0] === "runOffseasonNative") {
    try {
      const p = JSON.parse(args[1]);
      const perf = p.perfScores ?? {};
      const prof = p.teamProfiles ?? {};
      const byLeague = {};
      for (const n of p.npcs ?? []) {
        const lg = n.currentLeague || "?";
        byLeague[lg] ??= { n: 0, withPerf: 0, scores: [], sal: [], zero: 0 };
        byLeague[lg].n++;
        const v = perf[n.npcId];
        if (v != null) { byLeague[lg].withPerf++; byLeague[lg].scores.push(v); }
        const sal = n.currentSalary ?? 0;
        byLeague[lg].sal.push(sal);
        if (!sal) byLeague[lg].zero++;
      }
      rows.push({ year: p.seasonYear, perfN: Object.keys(perf).length,
                  profN: Object.keys(prof).length, byLeague });
    } catch (e) { rows.push({ err: String(e).slice(0, 120) }); }
  }
  return await call();
});

async function main() {
  const { app, tmp } = await headless.boot("perfprobe");
  try {
    await app.boot({ slotId: "PP", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log("\n[오프시즌 페이로드] 실제로 넘어가는 성적·성향\n");
    for (const r of rows) {
      if (r.err) { console.log("  파싱 실패:", r.err); continue; }
      console.log(`  ${r.year}  성적 ${r.perfN}건 · 성향 ${r.profN}팀`);
      for (const [lg, v] of Object.entries(r.byLeague)) {
        if (!/KBL|ABL|JBL|INDEPENDENT/.test(lg)) continue;
        const s = v.scores.sort((a, b) => a - b);
        const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0);
        console.log(`    ${lg.padEnd(22)} ${String(v.n).padStart(4)}명 · 성적있음 ${String(v.withPerf).padStart(4)}명` +
          ` · 연봉 p10/중앙/p90 ${(()=>{const t=v.sal.sort((a,b)=>a-b);const q=(f)=>t[Math.min(t.length-1,Math.floor(t.length*f))]??0;return `${q(0.1)}/${q(0.5)}/${q(0.9)}`;})()}` +
          ` · 평점 하위10% ${String(q(0.1)).padStart(3)} 중앙 ${String(q(0.5)).padStart(3)}`);
      }
    }
  } finally { await headless.cleanup(tmp); }
}
main().catch((e) => { console.error("실패:", e); process.exit(1); });
