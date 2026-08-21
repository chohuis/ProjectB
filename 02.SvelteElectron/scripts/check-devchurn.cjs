"use strict";
/**
 * 육성선수 회전 — **실제 게임 경로로** 잰다.
 *
 * ⚠ `measure:draft`로는 못 잰다. 거긴 Rust만 호출해서 **성장 시스템이 아예
 * 없다** — OVR이 안 자라니 "성장했으면 재계약"이 항상 거짓이 되고, 그게
 * 배선 결함인지 계측 한계인지 구분이 안 된다.
 *
 * 여기서는 `repo:syncNpcs`를 가로채 **실제로 저장되는 명단**을 본다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d; };
const SEASONS = arg("seasons", 4);
const SEED = arg("seed", 20260731);

const snaps = [];
let tag = "?";
/**
 * ⚠ **저장소 행은 `NpcSaveState`가 아니다.** 육성선수 신분은 `extra` 안에
 * 들어간다(`npcAdapter`: `if (n.developmentSince) extra.developmentSince = ...`).
 * 최상위에서 읽었더니 4시즌 내내 **육성선수 0명**으로 나왔다 — 없는 결함을
 * 팔 뻔했다. `currentLeague`는 최상위라 2군 총원은 맞게 세고 있었다.
 */
function extraOf(n) {
  const e = n.extra;
  if (!e) return {};
  if (typeof e === "string") { try { return JSON.parse(e); } catch { return {}; } }
  return e;
}
function onSync(npcs) {
  let dev = 0, farm = 0, withBase = 0;
  let ind = 0, indOver = 0;
  const indAges = [];
  const ovrs = [];
  for (const n of npcs) {
    if (n.careerStatus !== "active") continue;
    if (n.currentLeague === "LEAGUE_INDEPENDENT" && n.currentTeam) {
      ind++; indAges.push(n.age ?? 0);
      if ((n.age ?? 0) > 31) indOver++;
    }
    if (n.currentLeague !== "LEAGUE_KBL_FARM") continue;
    farm++;
    const ex = extraOf(n);
    const since = n.developmentSince ?? ex.developmentSince;
    const dovr  = n.developmentOvr   ?? ex.developmentOvr;
    if (since == null) continue;
    dev++;
    if (dovr != null) { withBase++; ovrs.push(dovr); }
  }
  indAges.sort((a,b)=>a-b);
  snaps.push({ tag, dev, farm, withBase,
    ovrMid: ovrs.sort((a,b)=>a-b)[Math.floor(ovrs.length/2)] ?? 0,
    ind, indOver, indAgeMid: indAges[Math.floor(indAges.length/2)] ?? 0,
    indAgeMax: indAges[indAges.length-1] ?? 0 });
}
/** 방출 사건 — 리그별. 이번 회차에 방출 판정에 넷(live OVR·성적·성향·연봉)을
 *  붙였으므로 **프로가 폭증하지 않는지**를 같이 본다. 독립만 보면 못 잡는다 */
const rel = {};
headless.setInterceptor(async (channel, args, call) => {
  if (channel === "engine:call" && args[0] === "runOffseasonNative") {
    const out = await call();
    try {
      const r = JSON.parse(typeof out === "string" ? out : "{}");
      const lgOf = new Map();
      try { for (const n of JSON.parse(args[1]).npcs ?? []) lgOf.set(n.npcId, n.currentLeague); } catch {}
      for (const e of r.events ?? []) {
        if (!/release|expired/.test(e.kind ?? "")) continue;
        const lg = lgOf.get(e.npcId) ?? "?";
        rel[lg] ??= {}; rel[lg][e.kind] = (rel[lg][e.kind] ?? 0) + 1;
      }
    } catch {}
    return out;
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
  const { app, tmp } = await headless.boot("devchurn");
  try {
    await app.boot({ slotId: "DC", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      tag = `${s0} W${w0}`;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        tag = `${s0} 시즌종료`; await app.seasonRollover();
        tag = `${app.currentSeason()} 롤오버직후`; continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log(`[육성선수 회전] 씨앗 ${SEED} · ${SEASONS}시즌 (실게임 경로)\n`);
    console.log("  시점              2군총원  육성선수  기준값보유  기준값중앙 | 독립총원 나이중앙 나이최대 31초과");
    const seen = new Set();
    for (const r of snaps) {
      if (!/롤오버직후|시즌종료/.test(r.tag) || seen.has(r.tag)) continue;
      seen.add(r.tag);
      console.log(`  ${String(r.tag).padEnd(16)}${String(r.farm).padStart(6)}` +
        `${String(r.dev).padStart(9)}${String(r.withBase).padStart(11)}${String(r.ovrMid).padStart(11)}` +
        ` | ${String(r.ind).padStart(7)}${String(r.indAgeMid).padStart(9)}${String(r.indAgeMax).padStart(9)}${String(r.indOver).padStart(7)}`);
    }
    const last = snaps[snaps.length - 1];
    console.log("");
    console.log(`  마지막: 2군 ${last.farm}명 중 육성선수 ${last.dev}명 · 기준값 있는 사람 ${last.withBase}명`);
    if (last.dev > 0 && last.withBase === 0) {
      console.log("  🔴 기준값이 하나도 없다 — developmentOvr이 저장 왕복에서 사라진다");
    }
    console.log("");
    console.log("  [방출 사건] 4시즌 누적 · 리그별");
    for (const [lg, kinds] of Object.entries(rel)) {
      const parts = Object.entries(kinds).map((kv) => kv[0] + " " + kv[1]).join(" · ");
      console.log("    " + lg.padEnd(22) + " " + parts);
    }
  } finally { await headless.cleanup(tmp); }
}
main().catch((e) => { console.error("[devchurn] 실패:", e); process.exit(1); });
