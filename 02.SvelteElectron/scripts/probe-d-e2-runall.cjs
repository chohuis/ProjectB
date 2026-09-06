"use strict";
/**
 * D 세션 계측 — E2 오케스트레이터. `probe-d-e2-growth.cjs`(경로 하나·씨앗
 * 하나)를 경로 셋(univ/indie/pro) × 씨앗 셋 = 9판 돌려 무대별로 합친다.
 *
 * ⚠ **연수를 짧게 잡았다** — 실측(2026-09-06 · 씨앗 20260802 · univ · 3년)
 *   3시즌에 약 550초가 걸렸다(연당 ~180초). 검사 상한 1200초 안에 있으려면
 *   6년이 안전선이다. **pro 경로가 6년 안에 1군에 못 닿으면 그 칸은
 *   표본 0으로 남는다** — 추측으로 채우지 않는다.
 *
 * 판마다 새 프로세스, 동시성 3(프로세스당 메모리 ~1GB 실측).
 *
 *   npm run probe:d:e2
 *   PF_SEEDS=20260802,777,31337 PF_YEARS=6 npm run probe:d:e2
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
const PATHS = ["univ", "indie", "pro"];
const YEARS = process.env.PF_YEARS || "6";
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 3);

function runOne(pathKey, seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-e2-growth.cjs"), "--path", pathKey], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PF_SEED: seed, PF_YEARS: YEARS },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 1150000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? JSON.parse(line.slice("RESULT ".length)) : { path: pathKey, seed, why: "실패(RESULT 못 읽음)", summary: {}, raw: out.slice(-3000) });
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      process.stdout.write(`  [시작] ${items[i].p} 씨앗${items[i].seed}\n`);
      results[i] = await worker(items[i]);
      process.stdout.write(`  [끝]   ${items[i].p} 씨앗${items[i].seed} → ${results[i].why}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

const avg = (v) => v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;

(async () => {
  const jobs = [];
  for (const p of PATHS) for (const seed of SEEDS) jobs.push({ p, seed });
  const rows = await pool(jobs, CONCURRENCY, (j) => runOne(j.p, j.seed));
  for (const r of rows) if (r.raw) console.log(`    (진단 ${r.path}/씨앗${r.seed}) ${r.raw}`);

  // 무대 키(고교/대학/독립/1군/2군)별로 전 판을 모은다
  const merged = {};
  for (const r of rows) {
    for (const [key, s] of Object.entries(r.summary || {})) {
      const m = (merged[key] ??= { gAvgs: [], ipAvgs: [], noGames: [], games: [], gamesPerWeek: [], seasons: 0, noGameN: 0, gameN: 0 });
      if (s.gAvg != null) m.gAvgs.push(s.gAvg);
      if (s.ipAvg != null) m.ipAvgs.push(s.ipAvg);
      if (s.noGame != null) m.noGames.push(s.noGame);
      if (s.game != null) m.games.push(s.game);
      if (s.gamesPerWeek != null) m.gamesPerWeek.push(s.gamesPerWeek);
      m.seasons += s.seasons; m.noGameN += s.noGameN; m.gameN += s.gameN;
    }
  }

  console.log("");
  console.log("── E2 경기 출전 vs 훈련 XP — 무대별 합산 (경로·씨앗 전체 평균) ──");
  console.log("무대   연간등판   연간이닝   표본시즌   없는주Δ(주표본)   등판주Δ(주표본)   주당게임   경기당증분(추정)");
  for (const [key, m] of Object.entries(merged)) {
    const gAvg = avg(m.gAvgs), ipAvg = avg(m.ipAvgs), noGame = avg(m.noGames), game = avg(m.games), gpw = avg(m.gamesPerWeek);
    const perGame = (noGame != null && game != null && gpw) ? Math.round(((game - noGame) / gpw) * 1000) / 1000 : null;
    console.log(`${key.padEnd(6)} ${String(gAvg).padStart(8)}   ${String(ipAvg).padStart(8)}   ${String(m.seasons).padStart(6)}     ` +
      `${String(noGame).padStart(10)}(n=${m.noGameN})   ${String(game).padStart(10)}(n=${m.gameN})   ${String(gpw).padStart(6)}   ${perGame}`);
  }
  console.log("");
  console.log("[END] E2 9판 완료");
})();
