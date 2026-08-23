"use strict";
/** FA 미계약이 실제로 있는가 — 오프시즌 **응답**의 events를 센다.
 *  ⚠ `careerEventTally`로는 안 잡힌다. `ev()`가 만드는 건 OffseasonEvent(화면용
 *    소식)이고 npc.careerEvents와 다른 배열이다. 이걸 몰라 미계약률을 0%로 읽었다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const YEARS = Number(process.env.PE_YEARS || 3);
const SEED = Number(process.env.PE_SEED || 20260731);
(async () => {
  let round = 0;
  headless.setInterceptor(async (channel, args, call) => {
    const isOff = channel === "engine:call" && args[0] === "runOffseasonNative";
    const r = await call();
    if (isOff) {
      round++;
      let out = {};
      try { out = typeof r === "string" ? JSON.parse(r) : (r && r.ok ? JSON.parse(r.value ?? r.data ?? "{}") : r); }
      catch { /* 모양이 다르면 아래가 말해준다 */ }
      const evs = out.events || (out.result && out.result.events);
      if (!Array.isArray(evs)) {
        console.log(`[EV] ${round}회차 events를 못 찾음 — 최상위 키: ${Object.keys(out || {}).join(",")}`);
      } else {
        const tally = {};
        for (const e of evs) tally[e.kind] = (tally[e.kind] ?? 0) + 1;
        const un = tally.fa_unsigned ?? 0;
        console.log(`[EV] ${round}회차 총 ${evs.length}건 · 미계약 ${un}`
          + ` | ${Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`${k} ${v}`).join(" · ")}`);
      }
    }
    return r;
  });
  const { app, tmp } = await headless.boot("fev");
  try {
    await app.boot({ slotId: "FE", worldSeed: SEED, seasonYear: 2026 });
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
    // 미계약자는 독립리그로 떨어진다 — 리그가 마르는지 같이 본다
    console.log(`[리그] ${JSON.stringify(app.faTradeProbe())}`);
    console.log(`[연봉] ${JSON.stringify(app.salarySpread())}`);
  } finally { await headless.cleanup(tmp); }
})();
