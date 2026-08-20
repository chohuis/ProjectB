"use strict";
/**
 * 세이브 크기 누적 계측 — `npm run measure:savesize`
 *
 * ## 왜 필요한가
 *
 * `measure:perf`는 **한 시즌**만 잰다. 그래서 slot.db 42.6MB가
 * "정상 상태"인지 "시즌마다 불어나는 값"인지 못 가린다. 인생 시뮬은
 * 20시즌을 가므로 그 차이가 42MB와 800MB를 가른다.
 *
 * 스키마를 읽어 보면 갈래가 둘이다:
 *   · `writeSeason`이 **매 저장마다 DELETE 후 전량 재삽입**하는 다섯 —
 *     schedule · standings · season_stats · player_condition · team_rotation
 *     → 시즌이 넘어가면 갈아치워지므로 **안 쌓인다**
 *   · 해마다 행이 붙는 것 — career_history(선수×연도) · history_league ·
 *     transactions → **쌓인다**
 *
 * 읽어서 짐작하지 말고 잰다. 시즌 경계마다 파일 크기와 테이블별 행 수를
 * 찍어 어느 쪽이 지배하는지 본다.
 *
 * ⚠ **자동 진행 경로를 쓴다** — `study-careers.cjs`와 같은 루프다.
 */
const fs = require("node:fs");
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 5);
const SEED = arg("seed", 20260731);
const SLOT = "SIZE";

const MB = (b) => (b / 1048576).toFixed(2);

/** saves/ 아래 **모든** .db를 센다 — 하나만 집으면 어느 게 진짜인지 못 가린다 */
function dbFilesOf(tmp) {
  const out = [];
  for (const dir of [path.join(tmp, "saves"), tmp]) {
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) if (n.endsWith(".db")) out.push(path.join(dir, n));
  }
  return out;
}

/** 파일 크기 + 테이블별 행 수·바이트. WAL이 따로 붙으므로 같이 센다 */
function snapOne(dbFile) {
  if (!dbFile || !fs.existsSync(dbFile)) return null;
  let bytes = fs.statSync(dbFile).size;
  for (const ext of ["-wal", "-shm"]) {
    if (fs.existsSync(dbFile + ext)) bytes += fs.statSync(dbFile + ext).size;
  }
  const out = { bytes, tables: {} };
  try {
    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    // 빈 페이지를 센다 — DELETE는 파일을 안 줄인다(VACUUM만 줄인다).
    // 행 수만 보면 "가벼운데 파일이 크다"의 원인을 못 가린다
    const pg = db.pragma("page_size", { simple: true });
    out.pages = db.pragma("page_count", { simple: true });
    out.freePages = db.pragma("freelist_count", { simple: true });
    out.freeBytes = out.freePages * pg;
    const names = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r) => r.name);
    for (const t of names) {
      const n = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
      if (n === 0) continue;
      // json 컬럼이 있는 표는 실제 무게를 같이 잰다 — 행 수만으론 못 가린다
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
      const textCols = cols.filter((c) => /json|stat_line|highlights/.test(c));
      let load = 0;
      if (textCols.length) {
        const expr = textCols.map((c) => `COALESCE(LENGTH("${c}"),0)`).join("+");
        load = db.prepare(`SELECT SUM(${expr}) s FROM "${t}"`).get().s || 0;
      }
      out.tables[t] = { rows: n, bytes: load };
    }
    db.close();
  } catch (e) {
    out.error = String(e && e.message);
  }
  return out;
}

/** 파일별로 재고 합친다 — 어느 파일이 무거운지 가려야 한다 */
function snapshot(files) {
  const per = {};
  const free = {};
  let bytes = 0;
  const tables = {};
  for (const f of files) {
    const one = snapOne(f);
    if (!one) continue;
    const base = path.basename(f);
    per[base] = one.bytes;
    free[base] = one.freeBytes || 0;
    bytes += one.bytes;
    for (const [t, v] of Object.entries(one.tables)) tables[base + ":" + t] = v;
  }
  return { bytes, per, free, tables };
}

async function main() {
  const { app, tmp } = await headless.boot("savesize");
  const rows = [];
  try {
    await app.boot({ slotId: SLOT, worldSeed: SEED, seasonYear: 2026 });
    console.log("[세이브] 씨앗 " + SEED + " · " + SEASONS + "시즌");

    const record = (label) => {
      const one = snapshot(dbFilesOf(tmp));
      if (!one) return;
      rows.push(Object.assign({ label }, one));
      const per = Object.entries(one.per).map((e) => e[0] + " " + MB(e[1]) + (one.free[e[0]] ? "(빈 " + MB(one.free[e[0]]) + ")" : "")).join(" · ");
      console.log("  " + label.padEnd(16) + MB(one.bytes).padStart(8) + " MB   [" + per + "]");
    };
    record(`시작 ${app.currentSeason()}`);

    const startSeason = app.currentSeason();
    let guard = 0;
    let seen = startSeason;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < startSeason + SEASONS) {
      if (app.retired()) { console.log("  (은퇴로 종료)"); break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { /* 진로 처리 */ }
      else if (app.isSeasonEnded()) { await app.seasonRollover(); }
      else {
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        await app.autoRun();
        if (app.currentWeek() === w0 && app.currentSeason() === s0) break; // 못 나아가면 멈춘다
      }
      if (app.currentSeason() > seen) { seen = app.currentSeason(); record(`시즌 ${seen} 진입`); }
    }

    // 마지막 표: 무엇이 무거운지
    const last = rows[rows.length - 1];
    const first = rows[0];
    if (last && last.tables) {
      console.log("\n  테이블            행수      json바이트   시작대비");
      const ents = Object.entries(last.tables).sort((a, b) => b[1].bytes - a[1].bytes);
      for (const [t, v] of ents) {
        const f = (first.tables || {})[t] || { rows: 0, bytes: 0 };
        const d = v.rows - f.rows;
        console.log(
          `  ${t.padEnd(16)} ${String(v.rows).padStart(7)} ${MB(v.bytes).padStart(10)} MB` +
          `   ${(d >= 0 ? "+" : "") + d}행`
        );
      }
    }
    // ⚠ **평균 기울기를 쓰면 안 된다.** 첫 시즌이 크게 뛰고(빈 파일 → 정상 상태)
    //   그 뒤로 완만해지므로, 전 구간 평균은 후반을 과대평가한다.
    //   **뒤쪽 세 시즌의 기울기**가 장기 추세다.
    if (rows.length >= 3) {
      const tail = rows.slice(-3);
      const slope = (tail[tail.length - 1].bytes - tail[0].bytes) / (tail.length - 1);
      const last = rows[rows.length - 1];
      const seasonsRun = rows.length - 1;
      const avg = (last.bytes - rows[0].bytes) / Math.max(1, seasonsRun);
      console.log("");
      console.log("  전 구간 평균 " + MB(avg) + " MB/시즌  (첫 시즌 급증이 섞여 과대평가된다)");
      console.log("  뒤 3시즌     " + MB(slope) + " MB/시즌  ← 장기 추세");
      const at = (n) => MB(last.bytes + slope * Math.max(0, n - seasonsRun));
      console.log("  추정  20시즌 " + at(20) + " MB · 40시즌 " + at(40) + " MB");
    }
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[measure-savesize] 실패:", e); process.exit(1); });
