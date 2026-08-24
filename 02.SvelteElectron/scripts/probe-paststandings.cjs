"use strict";
/** 과거 5년 순위가 생기는가 · **팀 전력★과 어긋나지 않는가** (A5).
 *  ⚠ ★5가 5년 내내 꼴찌면 세계가 첫날부터 자기모순이다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
(async () => {
  const { app, tmp } = await headless.boot("pst");
  try {
    await app.boot({ slotId: "PS", worldSeed: SEED, seasonYear: 2026 });
    const fs = require("node:fs");
    const hit = [];
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, f.name);
      if (f.isDirectory()) walk(fp); else if (f.name.endsWith(".db")) hit.push(fp); } };
    walk(tmp);
    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const refs = JSON.parse(fs.readFileSync("resource/data/master/entities/refs.json", "utf8"));
    const powerOf = new Map((refs.teams || []).map((t) => [t.id, t.power]));
    for (const f of hit) {
      const db = new Database(f, { readonly: true });
      let rows;
      try { rows = db.prepare("SELECT * FROM history_standings").all(); }
      catch { db.close(); continue; }
      if (!rows.length) { db.close(); continue; }
      const years = [...new Set(rows.map((r) => r.season_year))].sort();
      console.log(`[연감] ${rows.length}행 · ${years.length}년치 (${years[0]}~${years[years.length - 1]})`);
      // ★별 평균 승률 — 단조여야 한다
      const byStar = {};
      for (const r of rows) {
        const st = powerOf.get(r.team_id);
        if (st == null) continue;
        (byStar[st] = byStar[st] || []).push(r.win_pct);
      }
      for (const st of Object.keys(byStar).sort()) {
        const v = byStar[st];
        const avg = v.reduce((a, b) => a + b, 0) / v.length;
        console.log(`  ★${st}  ${String(v.length).padStart(3)}행  평균 승률 ${avg.toFixed(3)}`);
      }
      // 리그별 · 한 해 표본
      const y = years[years.length - 1];
      const one = rows.filter((r) => r.season_year === y && r.league_id === "LEAGUE_KBL")
        .sort((a, b) => b.win_pct - a.win_pct);
      console.log(`  [${y} KBL]`);
      for (const r of one) {
        console.log(`    ★${powerOf.get(r.team_id) ?? "?"} ${String(r.team_name || r.team_id).padEnd(16)}`
          + ` ${r.wins}승 ${r.losses}패 ${r.draws}무 · ${r.win_pct.toFixed(3)}`);
      }
      db.close();
    }
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  await headless.cleanup(tmp);
})();
