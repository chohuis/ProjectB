"use strict";
/**
 * A 계측 — 완급(⑧)·코스(⑨)의 **커리어 층** 전후.
 *
 *   npm run probe:a:tempo:career
 *   PF_SEEDS=20260802,777,31337 npm run probe:a:tempo:career
 *
 * `probe:a:tempo`(엔진 직접 호출)가 못 보는 것을 본다 — 리그 ERA·타율,
 * 주인공 ERA·IP. 방법은 `probe:d:loc` 과 **똑같이** 맞췄다: 고교 →
 * 드래프트 → 프로까지 자동 진행 뒤 프로 한 시즌. 기준선
 * `BALANCE_BASELINE_101.md` §3 과 나란히 읽으려면 재는 법이 같아야 한다.
 *
 * ⚠ **표본이 얇다.** §3 이 적어 둔 그대로다 — 주인공 IP 가 10~47이닝뿐이라
 *   개인 성적은 노이즈가 크고, 진로가 갈리면 「프로 미도달」이 섞인다.
 *   **리그 지표(전 무대 합산)를 먼저 본다.**
 * ⚠ **동시성 1** (§3 의 경고). 겹쳐 돌리면 전부 타임아웃난다.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
/**
 * ⚠ **판 하나가 몇 분씩 걸린다** — 넷 × 씨앗 셋이면 열두 판이다. 급하면
 *   `PB_MODES=00,11` 로 「끔/둘 다」만 돌린다(각 결정을 따로 가르는 것은
 *   `probe:a:tempo` 가 훨씬 큰 표본으로 한다 — 여긴 커리어 층만 본다).
 */
const ALL_MODES = [
  { id: "00", key: "끔(전)",    tempo: "0", course: "0" },
  { id: "10", key: "완급만(⑧)", tempo: "1", course: "0" },
  { id: "01", key: "코스만(⑨)", tempo: "0", course: "1" },
  { id: "11", key: "둘 다(후)", tempo: "1", course: "1" },
];
const WANT = (process.env.PB_MODES || "00,10,01,11").split(",").map((s) => s.trim());
const MODES = ALL_MODES.filter((m) => WANT.includes(m.id));
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 1);

function runOne(m, seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-tempo-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PB_TEMPO: m.tempo, PB_COURSE: m.course, PF_SEED: seed },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 1200000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? { key: m.key, ...JSON.parse(line.slice("RESULT ".length)) }
                   : { key: m.key, seed, why: "실패(RESULT 못 읽음)", raw: out.slice(-1500) });
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      process.stdout.write(`  [시작] ${items[i].m.key} 씨앗${items[i].seed}\n`);
      results[i] = await worker(items[i]);
      process.stdout.write(`  [끝]   ${items[i].m.key} 씨앗${items[i].seed} → ${results[i].why}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

const n = (v, d = 2) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));

(async () => {
  const jobs = [];
  for (const m of MODES) for (const seed of SEEDS) jobs.push({ m, seed });
  const rows = await pool(jobs, CONCURRENCY, (j) => runOne(j.m, j.seed));

  console.log("");
  console.log("── 완급(⑧)·코스(⑨) 커리어 층 (고교→드래프트→프로 · 프로 1시즌) ──");
  console.log("모드          씨앗        리그ERA  리그K9  리그BB9  리그타율  주인공ERA  주인공IP  진행상태");
  for (const r of rows) {
    console.log(
      `${String(r.key).padEnd(12)} ${String(r.seed).padStart(9)}   ${n(r["리그_ERA"]).padStart(6)}` +
      `  ${n(r["리그_K9"]).padStart(6)}  ${n(r["리그_BB9"]).padStart(7)}   ${n(r["리그_타율"], 3).padStart(6)}` +
      `   ${n(r["주인공_ERA"]).padStart(8)}  ${n(r["주인공_IP"], 1).padStart(8)}  ${r.why}`
    );
  }
  console.log("");
  console.log("⚠ 주인공 열은 표본이 얇다(§3) — 리그 열을 먼저 본다.");
  console.log("");
})();
