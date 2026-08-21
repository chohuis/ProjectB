"use strict";
/**
 * 주마다 **실제로 몇 명이 바뀌는가** — `npm run measure:dirty`
 *
 * ## 왜 먼저 재는가
 *
 * `repo:syncNpcs`가 회당 13MB로 전송량 1위다. "변경분만 보내자"가 답처럼
 * 보이지만, **주마다 대부분이 바뀐다면 아무것도 못 줄인다.** 고치기 전에
 * 천장부터 잰다 — 이 프로젝트는 추정으로 목표를 잡았다가 여러 번 틀렸다.
 *
 * 재는 것:
 *   · 주마다 보내는 NPC 수 · 그중 **직전 주와 달라진 수**
 *   · 필드별 변경 빈도 — 무엇 때문에 더티가 되는지
 *   · 더티만 보냈을 때의 바이트 (실제 페이로드로 계산한다)
 *
 * ⚠ **게임 경로를 그대로 탄다.** `repo:syncNpcs` 호출을 가로채 실제 페이로드를
 * 본다 — 스토어를 직접 읽으면 배선을 안 보게 된다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEED = arg("seed", 20260731);

const MB = (b) => (b / 1048576).toFixed(2);
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");

/** 직전 스냅샷 — npcId → 직렬화 문자열 */
let prev = new Map();
const rounds = [];
/** 필드별 변경 횟수. 무엇이 더티를 만드는지 봐야 줄일 자리가 보인다 */
const fieldHits = new Map();
const fieldBytes = new Map();
let fieldRounds = 0;

function onSync(npcs) {
  const cur = new Map();
  let changed = 0, dirtyBytes = 0, total = 0;
  for (const n of npcs) {
    const id = n && (n.npcId ?? n.npc_id);
    if (!id) continue;
    const s = JSON.stringify(n);
    total += Buffer.byteLength(s, "utf8");
    cur.set(id, s);
    const before = prev.get(id);
    if (before === undefined || before !== s) {
      changed++;
      dirtyBytes += Buffer.byteLength(s, "utf8");
      // 무엇이 달라졌나 (첫 주는 전원 신규라 건너뛴다)
      if (before !== undefined) {
        let a = null, b = null;
        try { a = JSON.parse(before); b = n; } catch { /* 무시 */ }
        if (a && b) {
          for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
              fieldHits.set(k, (fieldHits.get(k) ?? 0) + 1);
            }
          }
        }
      }
    }
  }
  // 필드별 무게 — 무엇을 빼야 페이로드가 주는지
  if (npcs.length) {
    for (const n of npcs) {
      for (const k of Object.keys(n)) {
        const v = JSON.stringify(n[k]);
        fieldBytes.set(k, (fieldBytes.get(k) ?? 0) + (v ? Buffer.byteLength(v, "utf8") : 0));
      }
    }
    fieldRounds++;
  }
  rounds.push({ n: npcs.length, changed, total, dirtyBytes, first: prev.size === 0 });
  prev = cur;
}

// ── setSeason: 어느 조각이 매주 바뀌나 ────────────────────────
//
// 전송량 1위(전체 32.5% · 회당 17.7MB)인데 **무엇이 바뀌어서 그런지** 모른다.
// slot.db는 이미 다섯 표로 쪼개 저장하는데(`writeSeason`) IPC로는 한 덩어리다.
// "바뀐 것만 보내기"가 통하려면 **안 바뀌는 조각이 있어야** 한다 —
// personality는 통했고 xp는 안 통했다. 재고 정한다.
let prevSeason = new Map();
let prevEntry = new Map();
const entryRounds = [];
const seasonBytes = new Map();
const seasonHits = new Map();
let seasonRounds = 0;

function onSeason(season) {
  if (!season || typeof season !== "object") return;
  const cur = new Map();
  for (const k of Object.keys(season)) {
    const v = JSON.stringify(season[k]);
    const b = v ? Buffer.byteLength(v, "utf8") : 0;
    seasonBytes.set(k, (seasonBytes.get(k) ?? 0) + b);
    cur.set(k, v ?? "");
    if (seasonRounds > 0 && prevSeason.get(k) !== (v ?? "")) {
      seasonHits.set(k, (seasonHits.get(k) ?? 0) + 1);
    }
  }
  prevSeason = cur;

  // ── 일정 항목 단위 — **천장을 잰다** ─────────────────────────
  //
  // `leagueSchedules`가 setSeason의 76%인데 거의 매주 바뀐다. 다만 바뀌는 건
  // **결과가 붙은 몇 경기**일 것이다 — 시즌 전체를 통째로 다시 보내는 셈이다.
  //
  // ⚠ **NPC 때 95%가 바뀌어 더티 셋이 -4.5%뿐이었다.** 같은 함정인지
  //   먼저 잰다. 항목의 몇 %가 실제로 달라지는가가 감축의 천장이다.
  {
    const cur2 = new Map();
    let total = 0, changed = 0, totalB = 0, changedB = 0;
    for (const bucket of ["leagueSchedules", "schedule"]) {
      const v = season[bucket];
      if (!v) continue;
      const lists = Array.isArray(v) ? { _: v } : v;
      for (const [lid, list] of Object.entries(lists)) {
        if (!Array.isArray(list)) continue;
        for (const e of list) {
          if (!e || typeof e.id !== "string") continue;
          const key = bucket + "|" + lid + "|" + e.id;
          const j = JSON.stringify(e);
          const b = Buffer.byteLength(j, "utf8");
          total++; totalB += b;
          cur2.set(key, j);
          if (seasonRounds > 0 && prevEntry.get(key) !== j) { changed++; changedB += b; }
        }
      }
    }
    if (seasonRounds > 0 && total > 0) {
      entryRounds.push({ total, changed, totalB, changedB });
    }
    prevEntry = cur2;
  }

  seasonRounds++;
}

headless.setInterceptor(async (channel, args, call) => {
  if (channel === "repo:call" && args[0] === "setSeason") {
    try {
      const q = typeof args[1] === "string" ? JSON.parse(args[1]) : args[1];
      onSeason(q && (q.season ?? q.data ?? q));
    } catch { /* 계측이 진행을 막지 않는다 */ }
  }
  if (channel === "repo:call" && args[0] === "syncNpcs") {
    try {
      const p = typeof args[1] === "string" ? JSON.parse(args[1]) : args[1];
      if (p && Array.isArray(p.npcs)) onSync(p.npcs);
    } catch { /* 계측이 진행을 막지 않는다 */ }
  }
  return await call();
});

async function main() {
  const { app, tmp } = await headless.boot("dirty");
  try {
    await app.boot({ slotId: "DIRTY", worldSeed: SEED, seasonYear: 2026 });
    await app.autoRun();

    const real = rounds.filter((r) => !r.first);
    if (real.length === 0) { console.log("[더티] syncNpcs 호출을 못 잡았다"); return; }

    const sum = (f) => real.reduce((a, r) => a + f(r), 0);
    const avgN = sum((r) => r.n) / real.length;
    const avgCh = sum((r) => r.changed) / real.length;
    const totalB = sum((r) => r.total);
    const dirtyB = sum((r) => r.dirtyBytes);

    console.log(`[더티] 씨앗 ${SEED} · syncNpcs ${rounds.length}회 (첫 회 제외 ${real.length})\n`);
    console.log(`  회당 보내는 NPC   ${avgN.toFixed(0)}명`);
    console.log(`  그중 달라진 NPC   ${avgCh.toFixed(1)}명  (${((avgCh / avgN) * 100).toFixed(1)}%)`);
    console.log(`  회당 전량         ${MB(totalB / real.length)} MB`);
    console.log(`  회당 더티만       ${MB(dirtyB / real.length)} MB`);
    console.log(`  → 줄어드는 비율   ${(100 - (dirtyB / totalB) * 100).toFixed(1)}%`);

    console.log("");
    console.log("  필드별 무게 (회당, 상위)");
    const fbTotal = [...fieldBytes.values()].reduce((x, y) => x + y, 0);
    for (const [k, v] of [...fieldBytes].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
      console.log("    " + k.padEnd(20) + MB(v / fieldRounds).padStart(7) + " MB  " +
        ((v / fbTotal) * 100).toFixed(1) + "%");
    }
    console.log("\n  무엇이 더티를 만드나 (변경 횟수 상위)");
    const top = [...fieldHits].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [k, v] of top) console.log(`    ${k.padEnd(20)} ${v}`);

    if (seasonRounds > 1) {
      console.log("");
      console.log("[setSeason] " + seasonRounds + "회 · 조각별 무게와 변경 빈도");
      const tot = [...seasonBytes.values()].reduce((a, b) => a + b, 0) || 1;
      const cmp = seasonRounds - 1;
      for (const [k, b] of [...seasonBytes].sort((x, y) => y[1] - x[1]).slice(0, 10)) {
        const hits = seasonHits.get(k) ?? 0;
        console.log("  " + k.padEnd(20) + MB(b / seasonRounds).padStart(7) + " MB/회  " +
          ((b / tot) * 100).toFixed(1).padStart(5) + "%   변경 " +
          String(hits).padStart(3) + "/" + cmp +
          (hits === 0 ? "   ← 한 번도 안 바뀐다" : ""));
      }
    }

    if (entryRounds.length) {
      const sum = (f) => entryRounds.reduce((a, r) => a + f(r), 0);
      const t = sum((r) => r.total), c = sum((r) => r.changed);
      const tb = sum((r) => r.totalB), cb = sum((r) => r.changedB);
      console.log("");
      console.log("[일정 항목] " + entryRounds.length + "회 · **천장**");
      console.log("  회당 항목      " + (t / entryRounds.length).toFixed(0) + "건");
      console.log("  그중 달라진 것 " + (c / entryRounds.length).toFixed(1) + "건  (" +
        ((c / Math.max(1, t)) * 100).toFixed(1) + "%)");
      console.log("  회당 전량      " + MB(tb / entryRounds.length) + " MB");
      console.log("  회당 바뀐 것만 " + MB(cb / entryRounds.length) + " MB");
      console.log("  → 줄어드는 비율 " + (100 - (cb / Math.max(1, tb)) * 100).toFixed(1) + "%");
    }

    // 주별 추이 — 한 주에 몰리는지 고르게 퍼지는지
    console.log("\n  회차별 달라진 수 (앞 12회)");
    console.log("    " + real.slice(0, 12).map((r) => r.changed).join(" · "));
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[measure-dirty] 실패:", e); process.exit(1); });
