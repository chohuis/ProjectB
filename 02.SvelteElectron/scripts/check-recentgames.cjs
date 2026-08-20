"use strict";
/**
 * 최근 경기 화면에 **실제로 데이터가 뜨는가** — `npm run check:recentgames`
 *
 * 🔴 `npc_game_log`은 쌓기만 하고 읽는 곳이 없었다. 화면을 붙였으니
 * **정말 보이는지**를 확인한다 — 안 그러면 "기록 없음"만 뜨는 죽은 탭이 된다.
 *
 * 보는 것:
 *   ① 행이 쌓이는가 · 몇 명분인가
 *   ② `stat_json`이 화면이 기대하는 모양인가 (PlayerGameLine)
 *   ③ **주인공에게도 붙는가** — 주인공 경기는 배경 시뮬이 아니라
 *      경기 엔진을 타므로 안 쌓일 수 있다
 *   ④ 보관 한도(선수당 40)가 실제로 걸리는가
 */
const fs = require("node:fs");
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEED = arg("seed", 20260731);

let bad = 0;
const ok  = (m) => console.log(`  ok  ${m}`);
const err = (m) => { bad++; console.log(`  FAIL ${m}`); };

async function main() {
  const { app, tmp } = await headless.boot("recentgames");
  try {
    await app.boot({ slotId: "RG", worldSeed: SEED, seasonYear: 2026 });


    // 한 시즌 돌린다 — 배경 리그가 경기를 치러야 로그가 쌓인다
    await app.autoRun();

    const dir = path.join(tmp, "saves");
    const v2 = path.join(dir, "projectb_v2.db");
    if (!fs.existsSync(v2)) { err("projectb_v2.db가 없다"); return; }

    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const db = new Database(v2, { readonly: true });
    // 주인공 id는 slot.db에 있다 — `protagonistState()`는 id를 안 준다
    let pid = null;
    try {
      const slotFile = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
      const sdb = new Database(path.join(dir, slotFile), { readonly: true });
      const row = sdb.prepare("SELECT json FROM protagonist WHERE id = 1").get();
      const pj = row ? JSON.parse(row.json) : null;
      pid = ((pj || {}).protagonist || {}).id || null;
      sdb.close();
    } catch (e) { console.log("  --  주인공 id 조회 실패:", e.message); }

    // ① 행
    const total = db.prepare("SELECT COUNT(*) c FROM npc_game_log").get().c;
    const people = db.prepare("SELECT COUNT(DISTINCT npc_id) c FROM npc_game_log").get().c;
    total > 0 ? ok(`행 ${total}건 · 선수 ${people}명`) : err("행이 0이다 — 화면이 항상 비어 있다");

    // ② 모양 — 화면은 role로 투수/타자를 가른다
    const rows = db.prepare(
      "SELECT npc_id, season, week, role, stat_json FROM npc_game_log LIMIT 200"
    ).all();
    let parsed = 0, pitcher = 0, batter = 0, noRole = 0;
    for (const r of rows) {
      let v = null;
      try { v = JSON.parse(r.stat_json); } catch { /* 아래서 센다 */ }
      if (!v || typeof v !== "object") continue;
      parsed++;
      if (v.role === "pitcher") pitcher++;
      else if (v.role === "batter") batter++;
      else noRole++;
    }
    parsed === rows.length
      ? ok(`stat_json ${parsed}/${rows.length}건 파싱`)
      : err(`stat_json 파싱 실패 ${rows.length - parsed}건`);
    noRole === 0
      ? ok(`role이 전부 있다 (투수 ${pitcher} · 타자 ${batter})`)
      : err(`role 없는 행 ${noRole}건 — 화면이 타자 표로 잘못 그린다`);
    (pitcher > 0 && batter > 0)
      ? ok("투수·타자 둘 다 쌓인다")
      : err(`한쪽만 쌓인다 (투수 ${pitcher} · 타자 ${batter})`);

    // ③ 주인공
    if (pid) {
      const mine = db.prepare("SELECT COUNT(*) c FROM npc_game_log WHERE npc_id = ?").get(pid).c;
      mine > 0
        ? ok(`주인공(${pid}) ${mine}건`)
        : console.log(`  --  주인공(${pid}) 0건 — 주인공 경기는 경기 엔진을 타므로 여기 안 쌓인다.\n      화면은 "경기 기록 없음"을 띄운다. 연도별 성적 탭이 그 자리를 맡는다`);
    } else {
      console.log("  --  주인공 id를 못 얻었다 (perfEntry에 probe 없음)");
    }

    // ③-2 리그별 — **어느 리그 선수에게 화면이 뜨는가.** 로그가 배경 시뮬
    //      경로에서만 나오므로, 그 경로를 안 타는 리그는 탭이 늘 비어 있다
    try {
      const slotFile2 = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
      const sdb2 = new Database(path.join(dir, slotFile2), { readonly: true });
      const leagueOf = new Map(
        sdb2.prepare("SELECT npc_id, current_league FROM npc").all()
          .map((r) => [r.npc_id, r.current_league || "(없음)"]),
      );
      const total2 = new Map();
      for (const l of leagueOf.values()) total2.set(l, (total2.get(l) || 0) + 1);
      const withLog = new Map();
      for (const r of db.prepare("SELECT DISTINCT npc_id FROM npc_game_log").all()) {
        const l = leagueOf.get(r.npc_id) || "(모름)";
        withLog.set(l, (withLog.get(l) || 0) + 1);
      }
      console.log("");
      console.log("  리그별 — 기록이 있는 선수 / 전체");
      for (const [l, n] of [...total2].sort()) {
        const w = withLog.get(l) || 0;
        const pct = ((w / n) * 100).toFixed(0);
        console.log(`    ${l.padEnd(20)} ${String(w).padStart(5)} / ${String(n).padStart(5)}  ${pct}%` +
          (w === 0 ? "   ← 이 리그는 탭이 항상 비어 있다" : ""));
      }
      sdb2.close();
    } catch (e) { console.log("  --  리그별 집계 실패:", e.message); }

    // ④ 보관 한도
    const max = db.prepare(
      "SELECT MAX(c) m FROM (SELECT COUNT(*) c FROM npc_game_log GROUP BY npc_id)"
    ).get().m ?? 0;
    max <= 40
      ? ok(`선수당 최대 ${max}건 — 한도(40) 안이다`)
      : err(`선수당 ${max}건 — 한도(40)를 넘었다. trim이 안 돈다`);

    // 화면이 뽑는 그대로 한 명 찍어 본다
    const sample = db.prepare(
      "SELECT npc_id FROM npc_game_log GROUP BY npc_id ORDER BY COUNT(*) DESC LIMIT 1"
    ).get();
    if (sample) {
      const g = db.prepare(
        "SELECT season, week, role, stat_json FROM npc_game_log WHERE npc_id = ? ORDER BY season DESC, week DESC, id DESC LIMIT 5"
      ).all(sample.npc_id);
      console.log(`\n  표본 ${sample.npc_id} (화면이 뽑는 순서 그대로)`);
      for (const r of g) {
        const v = JSON.parse(r.stat_json);
        const line = v.role === "pitcher"
          ? `${v.ip}이닝 ${v.er}자책 ${v.k}K ${v.bb}BB ${v.decision ?? ""}`
          : `${v.ab}타수 ${v.h}안타 ${v.hr}홈런 ${v.rbi}타점`;
        console.log(`    ${r.season} W${r.week}  ${line}`);
      }
    }
    db.close();
  } finally {
    await headless.cleanup(tmp);
  }
  console.log(bad === 0 ? "\n  전부 통과" : `\n  ${bad}건 실패`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[check-recentgames] 실패:", e); process.exit(1); });
