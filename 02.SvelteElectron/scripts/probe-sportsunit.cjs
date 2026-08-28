"use strict";
/** 상무 Phase 1이 도는가 — 페이로드와 재료를 같이 본다.
 *  ⚠ 배선만 켜고 "0건"이면 원인이 둘로 갈린다: 값이 안 갔나, 재료가 비었나. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const YEARS = Number(process.env.SU_YEARS || 6);
(async () => {
  let n = 0;
  headless.setInterceptor(async (channel, args, call) => {
    if (channel === "engine:call" && args[0] === "calcSportsUnitSelectionNative") {
      let p = {};
      try { p = JSON.parse(args[1]); } catch { /* 아래가 말해준다 */ }
      const apps = p.applicants || [];
      const withPos = apps.filter((a) => a.position && a.position !== "").length;
      const vac = p.vacatingPositions;
      n++;
      console.log(`[SU] ${n}회차 지원자 ${apps.length} · 포지션있음 ${withPos}`
        + ` · 전역자포지션 ${vac === undefined ? "없음(배선 끊김)" : `${vac.length}건 [${vac.slice(0,6).join(",")}]`}`
        + ` · 정원 ${p.maxTotal} · Phase1몫 ${p.phase1Max === undefined ? "없음(배선 끊김)" : p.phase1Max}`);
      const r = await call();
      try {
        const out = JSON.parse(r);
        const ids = new Set(out.selectedIds || []);
        const picked = apps.filter((a) => ids.has(a.id));
        // 🔴 **Phase 1과 2를 갈라 본다.** 선발 수만 보면 "13명" 하나뿐이라
        //   Phase 2가 한 번도 안 도는 걸 못 잡는다 — 실제로 못 잡고 있었다.
        //   전역자 포지션 목록을 소비해 보면 몇 자리를 Phase 1이 먹었는지 나온다.
        const vacLeft = (vac || []).slice();
        let ph1 = 0;
        for (const a of picked.slice().sort((x, y) => y.ovr - x.ovr)) {
          const i = vacLeft.indexOf(a.position);
          if (i >= 0 && ph1 < (p.phase1Max ?? p.maxTotal)) { vacLeft.splice(i, 1); ph1++; }
        }
        // 팀 쏠림 — `maxPerTeam` 가드는 Phase 2에만 있다
        const byTeam = {};
        for (const a of picked) byTeam[a.teamId] = (byTeam[a.teamId] || 0) + 1;
        const maxTeam = Math.max(0, ...Object.values(byTeam));
        const pos = {};
        for (const a of picked) pos[a.position] = (pos[a.position] || 0) + 1;
        console.log(`[SU]   → 선발 ${picked.length}명 · Phase1 ${ph1} / Phase2 ${picked.length - ph1}`
          + ` · 한 팀 최다 ${maxTeam}(상한 ${p.maxPerTeam})`
          + ` · 포지션 ${Object.entries(pos).map(([k, v]) => k + v).join(" ")}`);
      } catch { /* 무시 */ }
      return r;
    }
    return call();
  });
  const { app, tmp } = await headless.boot("su");
  try {
    await app.boot({ slotId: "SU", worldSeed: 20260731, seasonYear: 2026 });
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
    if (n === 0) console.log("[SU] 호출 0회 — 체육부대 선발 자체가 안 돈다");
  } finally { await headless.cleanup(tmp); }
})();
