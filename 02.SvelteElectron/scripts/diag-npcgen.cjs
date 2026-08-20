"use strict";
/**
 * NPC 생성 진단 — `npm run diag:npcgen`
 *
 * 새 게임 시점의 선수들이 **제대로 만들어졌는지**를 네 축으로 본다.
 *
 *   ① 팀 전력★이 로스터 수준에 닿는가   (powerRules.ovrShiftPerStar = 3.5)
 *   ② 과거 이적 이력이 생겼는가          (careerHistoryRules)
 *   ③ 국적 분포가 리그에 맞는가          (ABL/JBL은 외국 리그다)
 *   ④ 이름이 리그에 맞게 지어졌는가      (ABL/JBL은 영문 이름이어야 한다)
 *
 * ⚠ **실제 새 게임 경로를 쓴다.** `startNewGameV3`를 그대로 부르고 slot.db를
 * 읽는다. 생성 함수를 직접 부르면 **배선을 안 보게 된다** — `test-newgame-v3.cjs`가
 * 파이프라인을 재구현해서 로스터 결함을 놓친 적이 있다.
 */
const fs = require("node:fs");
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const refs = require(path.join(process.cwd(), "resource/data/master/entities/refs.json"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEED = arg("seed", 20260731);

const powerOf = new Map(refs.teams.map((t) => [t.id, t.power ?? null]));
const leagueOf = new Map(refs.teams.map((t) => [t.id, t.leagueId ?? ""]));

/** 능력치 평균 — 저장된 OVR이 없어서 쓰는 대용치.
 *  ⚠ 게임의 OVR 산식이 아니다. **팀 사이 비교**에만 쓴다(같은 잣대면 충분하다) */
function abilityMean(ab, isPitcher) {
  const src = isPitcher ? ab && ab.pitching : ab && ab.batting;
  if (!src || typeof src !== "object") return null;
  const vals = Object.values(src).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (n) => n.toFixed(1);

async function main() {
  const { app, tmp } = await headless.boot("npcgen");
  try {
    await app.boot({ slotId: "GEN", worldSeed: SEED, seasonYear: 2026 });

    const dir = path.join(tmp, "saves");
    const file = fs.readdirSync(dir).find((n) => n.startsWith("slot3"));
    const Database = require(path.join(process.cwd(), "node_modules/better-sqlite3"));
    const db = new Database(path.join(dir, file), { readonly: true });

    const npcs = db.prepare(
      "SELECT npc_id, name, name_en, nationality, player_type, age, grade, " +
      "current_league, current_team, pro_service_years, abilities_json FROM npc"
    ).all();
    console.log(`[생성진단] 씨앗 ${SEED} · 선수 ${npcs.length}명\n`);

    // ── ① 전력★ → 능력치 ────────────────────────────────────────
    console.log("① 팀 전력★이 로스터 수준에 닿는가");
    const byLeague = new Map();
    for (const n of npcs) {
      const lid = n.current_league || "(무소속)";
      if (!byLeague.has(lid)) byLeague.set(lid, []);
      byLeague.get(lid).push(n);
    }
    console.log("   리그                     선수   ★분포              ★별 능력치평균");
    for (const [lid, list] of [...byLeague].sort()) {
      const byStar = new Map();
      let noPower = 0;
      for (const n of list) {
        const pw = powerOf.get(n.current_team);
        if (pw == null) { noPower++; continue; }
        let ab = null;
        try { ab = JSON.parse(n.abilities_json || "{}"); } catch { /* 깨진 행은 건너뛴다 */ }
        const v = abilityMean(ab, n.player_type === "pitcher");
        if (v == null) continue;
        if (!byStar.has(pw)) byStar.set(pw, []);
        byStar.get(pw).push(v);
      }
      const stars = [...byStar.keys()].sort((a, b) => a - b);
      const dist = stars.map((s) => `★${s}:${byStar.get(s).length}`).join(" ");
      const vals = stars.map((s) => `★${s} ${f1(mean(byStar.get(s)))}`).join("  ");
      const gap = stars.length >= 2
        ? mean(byStar.get(stars[stars.length - 1])) - mean(byStar.get(stars[0])) : null;
      console.log(
        `   ${lid.padEnd(22)}${String(list.length).padStart(6)}   ` +
        (noPower === list.length ? "★없음 — 전원 같은 분포" : `${dist.padEnd(18)} ${vals}`) +
        (gap != null ? `   차 ${gap >= 0 ? "+" : ""}${f1(gap)}` : "")
      );
    }

    // ── ② 과거 이적 이력 ────────────────────────────────────────
    console.log("\n② 새 게임 시점의 과거 이적 이력");
    const tx = db.prepare(
      "SELECT category, season_year, from_league_id, to_league_id, npc_id FROM transactions"
    ).all();
    if (!tx.length) console.log("   없음");
    else {
      const byCat = {};
      const byLg = {};
      const perPlayer = new Map();
      for (const t of tx) {
        byCat[t.category] = (byCat[t.category] || 0) + 1;
        const lg = t.to_league_id || t.from_league_id || "(없음)";
        byLg[lg] = (byLg[lg] || 0) + 1;
        perPlayer.set(t.npc_id, (perPlayer.get(t.npc_id) || 0) + 1);
      }
      console.log(`   기록 ${tx.length}건 · 해당 선수 ${perPlayer.size}명`);
      console.log(`   종류별  ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
      console.log(`   리그별  ${Object.entries(byLg).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
      // 이력이 붙은 리그 vs 안 붙은 리그
      const covered = new Set(Object.keys(byLg));
      const missing = [...byLeague.keys()].filter((l) => l && l !== "(무소속)" && !covered.has(l));
      if (missing.length) console.log(`   ⚠ 이력이 하나도 없는 리그: ${missing.join(" · ")}`);
      const dist = {};
      for (const c of perPlayer.values()) dist[c] = (dist[c] || 0) + 1;
      console.log(`   1인당 이적 횟수  ${Object.entries(dist).sort((a,b)=>a[0]-b[0]).map(([k, v]) => `${k}회:${v}명`).join(" · ")}`);
    }

    // ── ③④ 국적·이름 ───────────────────────────────────────────
    console.log("\n③④ 국적 분포와 이름");
    const hangul = /[\uAC00-\uD7A3]/;
    for (const lid of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"]) {
      const list = byLeague.get(lid) || [];
      if (!list.length) { console.log(`   ${lid.padEnd(18)} (선수 없음)`); continue; }
      const nat = {};
      let krName = 0, noEn = 0;
      for (const n of list) {
        nat[n.nationality] = (nat[n.nationality] || 0) + 1;
        if (hangul.test(n.name || "")) krName++;
        if (!n.name_en) noEn++;
      }
      const top = Object.entries(nat).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, v]) => `${k} ${((v / list.length) * 100).toFixed(0)}%`).join(" · ");
      console.log(`   ${lid.padEnd(18)}${String(list.length).padStart(5)}명  ${top}`);
      console.log(`   ${" ".repeat(18)}     한글이름 ${krName}명(${((krName/list.length)*100).toFixed(0)}%) · nameEn없음 ${noEn}명`);
      console.log(`   ${" ".repeat(18)}     표본  ${list.slice(0, 3).map((n) => `${n.name}/${n.name_en || "―"}`).join(" · ")}`);
    }

    // ── 고교 학년 분포 (⑤⑥ 선행 확인) ──────────────────────────
    console.log("\n⑤ 고교 학년·나이 (과거 기록을 붙일 수 있는 바탕이 있는가)");
    const hs = byLeague.get("LEAGUE_HIGHSCHOOL") || [];
    const gr = {};
    for (const n of hs) gr[n.grade == null ? "(없음)" : n.grade] = (gr[n.grade == null ? "(없음)" : n.grade] || 0) + 1;
    console.log(`   학년  ${Object.entries(gr).sort().map(([k, v]) => `${k}학년 ${v}명`).join(" · ")}`);
    const pro = byLeague.get("LEAGUE_KBL") || [];
    const sv = {};
    for (const n of pro) { const b = Math.min(15, n.pro_service_years || 0); sv[b] = (sv[b] || 0) + 1; }
    console.log(`   프로 연차 분포  ${Object.entries(sv).sort((a,b)=>a[0]-b[0]).map(([k, v]) => `${k}년:${v}`).join(" ")}`);

    db.close();
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[diag-npcgen] 실패:", e); process.exit(1); });
