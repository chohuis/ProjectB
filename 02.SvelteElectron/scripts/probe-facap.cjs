"use strict";
/** FA 입찰 상한이 누구를 막는가 — 팀별 cap·flex·상한과 시장가치를 나란히 본다.
 *  ⚠ 상한은 `잔여예산 × 0.35`다. cap 자체가 `총연봉 × 지수 × 1.25`라
 *    flex는 팀마다 다르지 않고 **지수만으로 정해진다**(1 - 1/(idx*1.25)).
 *    그게 맞는지 실측으로 확인한다 — 계산이 아니라. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 3);
const rows = [];
(async () => {
  headless.setInterceptor(async (channel, args, call) => {
    if (channel === "engine:call" && args[0] === "runOffseasonNative") {
      let p = {};
      try { p = JSON.parse(args[1]); } catch { return call(); }
      if (process.env.PF_FLOOR !== undefined) {
        p.faBidFloorRatio = Number(process.env.PF_FLOOR);
        args = [args[0], JSON.stringify(p), ...args.slice(2)];
      }
      const cap = p.teamPayrollCap || {};
      if (Object.keys(cap).length) {
        const payroll = {};
        const vets = { total: 0, y7: 0, y10: 0 };
        for (const n of (p.npcs || [])) {
          if (n.careerStatus !== "active" || !n.currentTeam) continue;
          if (!String(n.currentTeam).endsWith("_1")) continue;
          payroll[n.currentTeam] = (payroll[n.currentTeam] || 0) + (n.currentSalary || 0);
          vets.total++;
          const y = n.proServiceYears || 0;
          if (y >= 7) vets.y7++;
          if (y >= 10) vets.y10++;
        }
        const teams = Object.keys(cap).filter(t => t.endsWith("_1") && payroll[t] > 0);
        const byYr = {};
        vets.byLeague = {};
        for (const n of (p.npcs || [])) {
          if (n.careerStatus !== "active" || !String(n.currentTeam || "").endsWith("_1")) continue;
          const y = Math.min(n.proServiceYears || 0, 15);
          byYr[y] = (byYr[y] || 0) + 1;
          const lg = String(n.currentTeam).split("_")[1];
          const b = (vets.byLeague[lg] = vets.byLeague[lg] || { n: 0, y7: 0, ages: [], svc: [] });
          b.n++; if ((n.proServiceYears || 0) >= 7) b.y7++;
          b.ages.push(n.age || 0); b.svc.push(n.proServiceYears || 0);
        }
        vets.byYr = byYr;
        const per = teams.map(t => {
          const c = cap[t], pr = payroll[t];
          const flex = (c - pr) / c;
          const floor = pr * (p.faBidFloorRatio || 0);
          return { t, cap: c, payroll: pr, flex, raw: flex * c * 0.35,
                   limit: Math.max(flex * c * 0.35, floor) };
        }).sort((a, b) => b.cap - a.cap);
        const where = {};
        for (const n of (p.npcs || [])) {
          if (n.careerStatus === "active" && n.currentTeam) where[n.npcId || n.id] = n.currentTeam;
        }
        rows.push({ year: p.seasonYear, per, vets, where, floorRatio: p.faBidFloorRatio || 0 });
      }
    }
    return call();
  });
  const TAG = process.env.PF_TAG || "fac";
  const { app, tmp } = await headless.boot(TAG);
  try {
    await app.boot({ slotId: (process.env.PF_SLOT || "FC"), worldSeed: SEED, seasonYear: 2026 });
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
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  const M = (v) => (v / 10000).toFixed(1) + "억";
  console.log("[설정] 하한 " + (process.env.PF_FLOOR ?? "규칙파일") + " · 씨앗 " + SEED);
  for (const r of rows) {
    console.log(`\n=== ${r.year} · 1군 ${r.per.length}팀 ===`);
    console.log(`  1군 현역 ${r.vets.total}명 · 7년차+ ${r.vets.y7} (${(r.vets.y7 / r.vets.total * 100).toFixed(1)}%)`
      + ` · 10년차+ ${r.vets.y10} (${(r.vets.y10 / r.vets.total * 100).toFixed(1)}%)`);
    const show = [...r.per.slice(0, 3), ...r.per.slice(-3)];
    for (const x of show) {
      console.log(`  ${x.t.padEnd(22)} cap ${M(x.cap).padStart(8)} 총연봉 ${M(x.payroll).padStart(8)}`
        + ` flex ${x.flex.toFixed(3)} 상한 ${M(x.limit).padStart(8)}`);
    }
    const lgPay = {};
    for (const x of r.per) { const lg = x.t.split("_")[1]; (lgPay[lg] = lgPay[lg] || []).push(x.payroll); }
    console.log("  리그별 총연봉(억): " + Object.entries(lgPay).map(([k, v]) =>
      k + " " + v.length + "팀 중앙 " + (v.sort((a, b) => a - b)[v.length >> 1] / 10000).toFixed(0)).join(" · "));
    const neg = r.per.filter(x => x.raw < 0);
    const bound = r.per.filter(x => x.limit > x.raw);
    console.log("  하한 " + (r.floorRatio * 100).toFixed(1) + "% · 하한이 실제로 든 팀 " + bound.length
      + " · 원상한 음수 " + neg.length + "팀");
    const flexes = [...new Set(r.per.map(x => x.flex.toFixed(3)))].sort();
    console.log("  flex 종류 " + flexes.length + "가지: " + flexes.join(" "));
    for (const x of neg) {
      console.log("    " + x.t.replace(/^TEAM_/, "").padEnd(24)
        + " 원상한 " + M(x.raw).padStart(8) + " → 실상한 " + M(x.limit).padStart(8));
    }
    const med = (arr) => { const z = [...arr].sort((x, y) => x - y); return z[z.length >> 1]; };
    const mx = (arr) => Math.max(...arr);
    for (const [k, v] of Object.entries(r.vets.byLeague)) {
      // 나이 구간별 연차 중앙 — "서른 넘어 신인"이 있는지 본다
      const band = {};
      for (let i = 0; i < v.n; i++) {
        const A = v.ages[i], key = A < 24 ? "~23" : A < 27 ? "24-26" : A < 30 ? "27-29" : A < 33 ? "30-32" : "33+";
        (band[key] = band[key] || []).push(v.svc[i]);
      }
      const bs = ["~23", "24-26", "27-29", "30-32", "33+"].filter(x => band[x]).map(x => {
        const z = [...band[x]].sort((m, n2) => m - n2);
        const zero = z.filter(y => y === 0).length;
        return x + ":" + z.length + "명 연차중앙" + z[z.length >> 1] + " 0년차" + zero;
      });
      console.log("    [" + k + "] " + bs.join(" | "));
      console.log("  " + k.padEnd(4) + " " + String(v.n).padStart(4) + "명"
        + " · 나이 중앙 " + med(v.ages) + " 최대 " + mx(v.ages)
        + " · 연차 중앙 " + med(v.svc) + " 최대 " + mx(v.svc)
        + " · 7년차+ " + v.y7 + "(" + (v.y7 / v.n * 100).toFixed(0) + "%)"
        + " · 30세+ " + v.ages.filter(x => x >= 30).length
        + "(" + (v.ages.filter(x => x >= 30).length / v.n * 100).toFixed(0) + "%)");
    }
    console.log("  연차분포: " + Object.keys(r.vets.byYr).sort((a, b) => a - b).map(y => y + "y:" + r.vets.byYr[y]).join(" "));
    const lim = r.per.map(x => x.limit);
    lim.sort((a, b) => a - b);
    console.log(`  상한 최소 ${M(lim[0])} 중앙 ${M(lim[lim.length >> 1])} 최대 ${M(lim[lim.length - 1])}`
      + ` · 최대/최소 ${(lim[lim.length - 1] / lim[0]).toFixed(1)}배`);
  }
  // 소속이 바뀐 사람 — 트레이드도 섞이지만 팀별 유입은 FA가 지배적이다
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].where, b = rows[i].where;
    const inflow = {};
    let moved = 0;
    for (const id of Object.keys(b)) {
      if (!a[id] || a[id] === b[id]) continue;
      moved++;
      inflow[b[id]] = (inflow[b[id]] || 0) + 1;
    }
    const poor = rows[i - 1].per.filter(x => x.raw < 0).map(x => x.t);
    console.log(String.fromCharCode(10) + "[이적] " + rows[i - 1].year + "→" + rows[i].year + " 총 " + moved + "명"
      + " · 원상한 음수 팀 유입 " + poor.map(t => t.replace(/^TEAM_/, "") + "=" + (inflow[t] || 0)).join(" "));
  }
  await headless.cleanup(tmp);
})();
