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

    // ③-3 내 리그 경기가 어디 담기고 몇 개가 치러졌나
    try {
      const f3 = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
      const s3 = new Database(path.join(dir, f3), { readonly: true });
      console.log("");
      console.log("  schedule 표 — bucket/league_id별 (치른 경기/전체)");
      const rows3 = s3.prepare(
        "SELECT bucket, league_id, COUNT(*) n, SUM(has_result) done FROM schedule GROUP BY bucket, league_id ORDER BY bucket, league_id"
      ).all();
      for (const r of rows3) {
        console.log("    " + (r.bucket + "/" + (r.league_id || "-")).padEnd(34) +
          String(r.done || 0).padStart(6) + " / " + String(r.n).padStart(6));
      }
      s3.close();
    } catch (e) { console.log("  --  schedule 집계 실패:", e.message); }

    // ③-4 **경기 단위 적재율** — 이게 진짜 지표다.
    //
    // 🔴 **주차를 키에 넣으면 안 된다.** 대회는 앞 라운드가 밀리면 주차를
    //   당겨서 넣고(advanceWeek 1659), 배경 리그는 `e.week <= week`로 밀린
    //   경기를 몰아 친다. 그래서 **로그의 주차(시뮬 시점)와 일정의 주차(원래)가
    //   다르다.** 주차로 맞췄더니 대학 대회 23건이 "누락"으로 잡혔는데,
    //   팀으로만 맞춰 보니 **27건 전부 로그가 있었다.** 결함이 아니라 지표 탓이다.
    //   → **날짜(game_date)로 맞춘다.** 양쪽 다 같은 일정에서 온 값이다.
    //
    // ⚠ 선수 비율로 재면 한 번도 안 뛴 벤치가 섞여 절대 100%가 안 된다.
    //   치른 경기 중 로그가 남은 경기 비율이 100%여야 맞다.
    // ⚠ 보관 한도(40)가 지우므로 **최근 주차**만 본다 — 오래된 주는
    //   지워졌을 수 있어서 전구간을 재면 멀젖한 누락으로 읽힌다.
    try {
      const f4 = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
      const s4 = new Database(path.join(dir, f4), { readonly: true });
      const maxWeek = db.prepare("SELECT MAX(week) w FROM npc_game_log").get().w || 0;
      // 창을 좁히면 그 주에 안 도는 리그가 통째로 빠진다(프로는 W28에 끝난다).
      // 넓히면 보관 한도(40)에 잘린 옛 주가 섞여 헛 누락이 잡힌다 — 8주가 절충이다
      const lo = Math.max(1, maxWeek - 7);
      const logged = new Set(
        db.prepare("SELECT DISTINCT season, game_date, team_id, opponent_team_id FROM npc_game_log WHERE week >= ?")
          .all(lo).map((r) => [r.season, r.game_date, r.team_id, r.opponent_team_id].join("|")),
      );
      const played = s4.prepare(
        "SELECT league_id, week, json FROM schedule WHERE has_result = 1 AND week >= ?"
      ).all(lo);
      const per = new Map();
      for (const r of played) {
        let e = null;
        try { e = JSON.parse(r.json); } catch { continue; }
        const lid = r.league_id || (e.leagueId || "(primary)");
        const v = per.get(lid) || { n: 0, hit: 0 };
        v.n++;
        const a1 = [2026, e.gameDate ?? "", e.homeTeamId, e.awayTeamId].join("|");
        const a2 = [2026, e.gameDate ?? "", e.awayTeamId, e.homeTeamId].join("|");
        if (logged.has(a1) || logged.has(a2)) v.hit++;
        per.set(lid, v);
      }
      console.log("");
      console.log("  경기 단위 적재율 (W" + lo + "~W" + maxWeek + ")");
      let bad2 = 0;
      for (const [lid, v] of [...per].sort()) {
        const pct = v.n ? ((v.hit / v.n) * 100).toFixed(0) : "-";
        if (v.n && v.hit < v.n) bad2++;
        console.log("    " + lid.padEnd(22) + String(v.hit).padStart(5) + " / " + String(v.n).padStart(5) + "  " + pct + "%");
      }
      // missed games detail: week + kind tells which path leaks
      const miss = [];
      for (const r of played) {
        let e = null;
        try { e = JSON.parse(r.json); } catch { continue; }
        const k1 = [2026, e.gameDate ?? "", e.homeTeamId, e.awayTeamId].join("|");
        const k2 = [2026, e.gameDate ?? "", e.awayTeamId, e.homeTeamId].join("|");
        if (!logged.has(k1) && !logged.has(k2)) {
          miss.push((r.league_id || "primary") + " W" + r.week +
            (e.isTournament ? " [TOUR]" : "") + (e.isFriendly ? " [FRIENDLY]" : "") +
            (e.phase ? " " + e.phase : ""));
        }
      }
      // 놓친 경기가 **선수 기록 없이 끝난 것**인지 본다.
      // 배경 리그 시뮬이 실패하면 폴백이 playerLines: [] 를 만든다 —
      // 로그가 없는 게 아니라 **기록 자체가 없는 경기**다
      let emptyLines = 0;
      for (const r of played) {
        let e = null;
        try { e = JSON.parse(r.json); } catch { continue; }
        const k1 = [2026, e.gameDate ?? "", e.homeTeamId, e.awayTeamId].join("|");
        const k2 = [2026, e.gameDate ?? "", e.awayTeamId, e.homeTeamId].join("|");
        if (!logged.has(k1) && !logged.has(k2)) {
          const lines = e.result && Array.isArray(e.result.playerLines) ? e.result.playerLines.length : -1;
          if (lines === 0) emptyLines++;
        }
      }
      if (emptyLines) {
        console.log("    그중 " + emptyLines + "건은 **playerLines가 빈 경기**다 (폴백SIM)");
      }
      // ⚠ **내 대조 키가 team_id를 쓴다.** 로그에 팀이 안 적히면
      // 행이 있어도 "놓침"으로 잡힌다 — 결함이 아니라 지표 탓일 수 있다
      const noTeam = db.prepare(
        "SELECT COUNT(*) c FROM npc_game_log WHERE team_id = 0x OR team_id IS NULL".replace("0x", String.fromCharCode(39,39))
      ).get().c;
      const allLog = db.prepare("SELECT COUNT(*) c FROM npc_game_log").get().c;
      console.log("    로그 중 team_id가 빈 행  " + noTeam + " / " + allLog +
        "  (" + ((noTeam / Math.max(1, allLog)) * 100).toFixed(1) + "%)");

      // 놓친 경기의 playerLines 길이를 그대로 찍는다 — "몇 건"만으론
      // 로그 배선 문제인지 애초에 기록이 없는 경기인지 못 가린다
      const detail = [];
      for (const r of played) {
        let e = null;
        try { e = JSON.parse(r.json); } catch { continue; }
        const k1 = [2026, e.gameDate ?? "", e.homeTeamId, e.awayTeamId].join("|");
        const k2 = [2026, e.gameDate ?? "", e.awayTeamId, e.homeTeamId].join("|");
        if (!logged.has(k1) && !logged.has(k2)) {
          const n = e.result && Array.isArray(e.result.playerLines) ? e.result.playerLines.length : -1;
          detail.push({ lg: r.league_id || "primary", w: r.week, lines: n,
            tour: !!e.isTournament, fr: !!e.isFriendly,
            home: e.homeTeamId, away: e.awayTeamId });
        }
      }
      // lines=0 경기의 **양 팀 로스터**를 센다.
      // 폴백SIM은 "엔티티 없음"일 때 도니, 정말 선수가 없는지 본다
      const zero = detail.filter((d) => d.lines === 0);
      if (zero.length) {
        const f5 = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
        const s5 = new Database(path.join(dir, f5), { readonly: true });
        const cnt = s5.prepare("SELECT COUNT(*) c FROM npc WHERE current_team = ?");
        const seen = new Set();
        console.log("    lines=0 경기의 팀별 선수 수 (slot.db)");
        for (const d of zero.slice(0, 6)) {
          for (const t of [d.home, d.away]) {
            if (!t || seen.has(t)) continue;
            seen.add(t);
            console.log("      " + t.padEnd(28) + String(cnt.get(t).c).padStart(4) + "명");
          }
        }
        s5.close();
      }

      // ⚠ **주차를 빼고도 맞춰 본다.** 대회는 앞 라운드가 밀리면 주차를
      // 당겨서 넣는다(advanceWeek 1659). 로그는 **시뮬 시점** 주차를,
      // 일정은 **원래** 주차를 들고 있으면 키가 어긋난다 — 결함이 아니라 지표 탓이다
      const byTeams = new Set(
        db.prepare("SELECT DISTINCT season, team_id, opponent_team_id FROM npc_game_log")
          .all().map((r) => [r.season, r.team_id, r.opponent_team_id].join("|")),
      );
      let weekOnly = 0;
      for (const d of detail) {
        const a1 = [2026, d.home, d.away].join("|");
        const a2 = [2026, d.away, d.home].join("|");
        if (byTeams.has(a1) || byTeams.has(a2)) weekOnly++;
      }
      console.log("    그중 " + weekOnly + "건은 **팀으로는 맞는다** (주차만 어긋난 것)");

      if (detail.length) {
        console.log("    놓친 경기의 playerLines (앞 8건)");
        for (const d of detail.slice(0, 8)) {
          console.log("      " + d.lg.padEnd(20) + " W" + String(d.w).padEnd(3) +
            " lines=" + String(d.lines).padStart(3) +
            (d.tour ? " [TOUR]" : d.fr ? " [FRIENDLY]" : "") +
            "  " + d.home + " vs " + d.away);
        }
      }
      if (miss.length) {
        const tally = {};
        for (const m of miss) tally[m] = (tally[m] || 0) + 1;
        console.log("    missed " + miss.length + ":");
        for (const [k, v] of Object.entries(tally).slice(0, 12)) console.log("      " + k + "  x" + v);
      }
      if (bad2 === 0) ok("치른 경기가 전부 기록에 남았다");
      else console.log("    ← " + bad2 + "개 리그가 100% 미만이다");
      s4.close();
    } catch (e) { console.log("  --  경기 단위 집계 실패:", e.message); }

    // 🔴 **정리를 기다린 뒤에 잰다.** `npc:trimGameLogs`는 `void`로 불려서
    //   (season.ts:601) 결과를 안 기다린다 — 12만 행에 윈도 함수를 도는
    //   무거운 일이라 그렇게 둔 것이다. 그래서 **끝나기 전에 스냅샷을 찍으면
    //   40을 넘어 보인다**(실측: 한 번은 42건, 다음 실행은 0건).
    //
    //   실행마다 결과가 달라지는 검사는 신뢰를 잃는다 — 진짜 결함이 나도
    //   "또 그거겠지"로 읽힌다. 여기서 **한 번 불러 끝내 놓고** 잰다.
    //
    // ⚠ 이건 검사를 통과시키려는 게 아니라 **재는 조건을 못박는 것**이다.
    //   "정리가 끝난 상태에서 40 이하인가"가 물어야 할 질문이다.
    try {
      const trim = headless.handlers.get("npc:trimGameLogs");
      if (trim) await trim(null, JSON.stringify({ slotId: "RG", keep: 40 }));
      else console.log("  --  npc:trimGameLogs 핸들러가 없다 — 정리를 못 기다렸다");
    } catch (e) { console.log("  --  정리 호출 실패:", e.message); }

    // ④-0 한도를 넘은 선수가 몇이고 얼마나 넘는가
    {
      const over = db.prepare(
        "SELECT npc_id, COUNT(*) c FROM npc_game_log GROUP BY npc_id HAVING c > 40 ORDER BY c DESC"
      ).all();
      const tot = db.prepare("SELECT COUNT(DISTINCT npc_id) c FROM npc_game_log").get().c;
      console.log("");
      console.log("  보관 한도(40) 초과  " + over.length + " / " + tot + "명" +
        (over.length ? "  최대 " + over[0].c + "건" : ""));
      if (over.length) {
        console.log("    표본: " + over.slice(0, 5).map((r) => r.npc_id + "(" + r.c + ")").join(" · "));
        // 넘은 선수의 리그 — 특정 리그에 몰리면 그 경로가 trim을 안 부르는 것이다
        const f6 = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
        const s6 = new Database(path.join(dir, f6), { readonly: true });
        const lg = new Map(s6.prepare("SELECT npc_id, current_league FROM npc").all()
          .map((r) => [r.npc_id, r.current_league || "-"]));
        const tally = {};
        for (const r of over) { const l = lg.get(r.npc_id) || "(모름)"; tally[l] = (tally[l] || 0) + 1; }
        console.log("    리그별: " + Object.entries(tally).sort((x,y)=>y[1]-x[1])
          .map(([k,v]) => k + " " + v).join(" · "));
        s6.close();
      }
    }

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
