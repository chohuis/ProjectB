"use strict";
/**
 * 대학 로스터가 **어느 경로로** 비는가 — `npm run probe:univleak`
 *
 * 정원 32로 생성되는데 테스터 세이브 3시즌 뒤 평균 23.1(최소 19 · 50팀)이다.
 * 생성은 정확하니 유지 쪽인데, "졸업이 많아서"인지 "유입이 모자라서"인지
 * 갈리지 않으면 고칠 자리를 못 정한다.
 *
 * 그래서 **떠난 사람 하나하나를 센다.** `repo:syncNpcs`를 가로채 대학 명단을
 * 스냅샷으로 잡고, 직전 스냅샷에 있다가 사라진 사람의 **행선지**와 **그해
 * careerEvents 마지막 항목**을 붙여 경로별로 모은다. 들어온 사람도 같이 센다.
 *
 * ⚠ 계기다. 통과/실패는 `check:rostertrend`가 건다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260802);
const argS = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (process.argv[i + 1] || d) : d;
};
/** 같은 계기로 고교도 본다 — 두 리그의 유지 코드가 어디서 갈리는지 보려면 나란히 재야 한다 */
const UNIV = argS("league", "LEAGUE_UNIVERSITY");

/** 직전 스냅샷: npcId → { team, grade } */
let prev = null;
let tag = "?";
/** 경로별 인원 — `${시점}|${경로}` → 수 */
const flows = new Map();
const sizes = [];   // { tag, teams, total, avg, min, max }

function bump(key) { flows.set(key, (flows.get(key) ?? 0) + 1); }

function onSync(npcs) {
  const cur = new Map();
  const byTeam = new Map();
  const byId = new Map();
  for (const n of npcs) {
    if (!n) continue;
    byId.set(n.npcId, n);
    if (n.careerStatus === "retired") continue;
    if (n.currentLeague !== UNIV || !n.currentTeam) continue;
    cur.set(n.npcId, { team: n.currentTeam, grade: n.grade });
    byTeam.set(n.currentTeam, (byTeam.get(n.currentTeam) ?? 0) + 1);
  }
  const counts = [...byTeam.values()].sort((a, b) => a - b);
  if (counts.length) {
    sizes.push({
      tag, teams: counts.length,
      total: counts.reduce((a, b) => a + b, 0),
      avg: +(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1),
      min: counts[0], max: counts[counts.length - 1],
    });
  }

  if (prev) {
    // ── 나간 사람 ────────────────────────────────────────────────
    for (const [id, was] of prev) {
      if (cur.has(id)) continue;
      const n = byId.get(id);
      let where;
      if (!n) where = "명단에서 사라짐";
      else if (n.careerStatus === "retired") where = `은퇴/포기(${n.currentLeague})`;
      else where = n.currentLeague || "(소속없음)";
      // 그해 마지막 careerEvent 종류를 붙인다 — 경로 이름이 여기서 나온다
      const evs = (n && n.extra && n.extra.careerEvents) || [];
      const last = evs.length ? evs[evs.length - 1].eventType || evs[evs.length - 1].event_type : "";
      bump(`${tag}|OUT ${where}${last ? ` · ${last}` : ""}${was.grade ? ` (${was.grade}학년)` : ""}`);
    }
    // ── 들어온 사람 ──────────────────────────────────────────────
    for (const [id, now] of cur) {
      if (prev.has(id)) continue;
      const n = byId.get(id);
      const evs = (n && n.extra && n.extra.careerEvents) || [];
      const last = evs.length ? evs[evs.length - 1].eventType || evs[evs.length - 1].event_type : "";
      bump(`${tag}|IN ${last || "(이벤트없음)"}${now.grade ? ` (${now.grade}학년)` : ""}`);
    }
  }
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
  const { app, tmp } = await headless.boot("univleak");
  try {
    await app.boot({ slotId: "UL", worldSeed: SEED, seasonYear: 2026 });
    tag = `${app.currentSeason()} 생성직후`;

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      tag = `${s0} W${String(w0).padStart(2, "0")}`;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        tag = `${s0} 시즌종료`;
        await app.seasonRollover();
        tag = `${app.currentSeason()} 롤오버직후`;
        continue;
      }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }

    console.log(`\n[대학 누수] 씨앗 ${SEED} · ${SEASONS}시즌 · 정원 32 · 50팀\n`);
    console.log("  시점              팀수  총원   평균  최소  최대");
    let last = null;
    for (const r of sizes) {
      if (last && last.total === r.total && last.tag.split(" ")[0] === r.tag.split(" ")[0]
          && !/시즌종료|롤오버|생성직후/.test(r.tag)) continue;   // 안 변한 주는 접는다
      console.log(`  ${String(r.tag).padEnd(16)}${String(r.teams).padStart(4)}` +
        `${String(r.total).padStart(7)}${String(r.avg).padStart(7)}` +
        `${String(r.min).padStart(6)}${String(r.max).padStart(6)}`);
      last = r;
    }

    console.log("\n  경로별 인원 (10명 이상만)");
    const rows = [...flows.entries()].filter(([, v]) => v >= 10)
      .sort((a, b) => b[1] - a[1]);
    for (const [k, v] of rows) {
      const [at, what] = k.split("|");
      console.log(`    ${String(at).padEnd(16)} ${String(v).padStart(5)}  ${what}`);
    }

    // 합계 — IN/OUT 총량이 답의 절반이다
    let tin = 0, tout = 0;
    for (const [k, v] of flows) { if (k.includes("|IN ")) tin += v; else tout += v; }
    console.log(`\n  총 유입 ${tin} · 총 유출 ${tout} · 차 ${tin - tout}`);
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[probe-univleak] 실패:", e); process.exit(1); });
