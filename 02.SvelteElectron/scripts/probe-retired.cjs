"use strict";
/** 은퇴자가 로드에 얼마나 실리는가 — D7 재현.
 *  ⚠ 백로그의 "10시즌 npc +10,431행"은 문서만이다. 직접 잰다.
 *  `getAllNpcs`가 `SELECT * FROM npc`라 은퇴자까지 전부 온다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 5);
(async () => {
  const { app, tmp } = await headless.boot("ret");
  try {
    await app.boot({ slotId: "RT", worldSeed: SEED, seasonYear: 2026 });
    const snap = () => {
      const p = app.ageServiceProbe();
      return p;
    };
    const count = () => {
      const d = app.dupIdProbe();
      return d["전체"];
    };
    console.log(`[시작] npcs ${count()}명 · 씨앗 ${SEED}`);
    const start = app.currentSeason();
    let guard = 0;
    let lastYear = start;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentSeason() > lastYear) {
        lastYear = app.currentSeason();
        console.log(`[${lastYear}] npcs ${count()}명`);
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    const p = app.retiredProbe();
    console.log(`[끝] ${JSON.stringify(p)}`);
  } catch (e) { console.log(`[예외] ${e && e.message}`); }
  // 로드 경로의 무게를 **DB에서 직접** 잰다 — 스토어는 boot 때 한 번만 로드를 탄다
  try {
    const fs2 = require("node:fs");
    const hit = [];
    const walk = (d) => { for (const f of fs2.readdirSync(d, { withFileTypes: true })) {
      const fp = require("node:path").join(d, f.name);
      if (f.isDirectory()) walk(fp); else if (f.name.endsWith(".db")) hit.push(fp); } };
    walk(tmp);
    const Database = require(require("node:path").join(process.cwd(), "node_modules/better-sqlite3"));
    for (const f of hit) {
      const db = new Database(f, { readonly: true });
      let n = 0;
      try { n = db.prepare("SELECT COUNT(*) c FROM npc").get().c; } catch { db.close(); continue; }
      if (n === 0) { db.close(); continue; }
      const kb = (x) => Math.round(JSON.stringify(x).length / 1024);
      const all = db.prepare("SELECT * FROM npc").all();
      const act = db.prepare("SELECT * FROM npc WHERE career_status != 'retired'").all();
      const ret = db.prepare("SELECT npc_id, name, name_en, is_named, player_type, position, handedness, jersey_number, age, grade, school_id, graduation_year, nationality, career_status, current_league, current_team, pro_service_years FROM npc WHERE career_status = 'retired'").all();
      console.log("[로드무게] npc " + n + "명 · 전 " + kb(all) + "KB → 후 " + (kb(act) + kb(ret))
        + "KB (현역 " + kb(act) + " + 은퇴 " + kb(ret) + ") · 절감 "
        + (100 - (kb(act) + kb(ret)) / kb(all) * 100).toFixed(1) + "%");
      db.close();
    }
  } catch (e) { console.log("[로드무게] 못 쟀다: " + (e && e.message)); }
  await headless.cleanup(tmp);
})();
