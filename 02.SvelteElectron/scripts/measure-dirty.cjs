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

headless.setInterceptor(async (channel, args, call) => {
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

    // 주별 추이 — 한 주에 몰리는지 고르게 퍼지는지
    console.log("\n  회차별 달라진 수 (앞 12회)");
    console.log("    " + real.slice(0, 12).map((r) => r.changed).join(" · "));
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[measure-dirty] 실패:", e); process.exit(1); });
