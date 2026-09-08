"use strict";
/**
 * **헤드리스를 몇 판까지 동시에 돌릴 수 있나** — 안전선을 잰다
 * (2026-09-09 · 계측 2-2).
 *
 * 🔴 왜 재나. 지금 커버리지 하네스는 `spawnSync` — **순차 하나**다. 12시즌 한
 *   판이 두 시간이라 스무 판이면 마흔 시간이고 그 그림이 안 돈다.
 *   기계는 12코어·69GB 다.
 *
 * ⚠ **예전에 D 가 8병렬로 돌려 전부 타임아웃 났다**(2026-09-06). 12코어에
 *   8병렬이면 CPU 로는 되어야 하니 **병목이 CPU 가 아니다** — electron
 *   인스턴스인지, 디스크인지, `.node` 잠금인지 **재서 가려야 한다.**
 *
 * 그래서 같은 일감을 1·2·4·6·8 동시로 돌려 **벽시계와 실패율**을 잰다.
 * 일감은 짧게 잡는다(1시즌) — 재는 것은 「한 판이 얼마나 걸리나」가 아니라
 * **「동시에 늘리면 판당 시간이 어떻게 되나」**다.
 *
 *   npm run probe:a:concurrency
 *   PB_LEVELS=1,2,4 PB_SEASONS=1 npm run probe:a:concurrency
 */
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");

const LEVELS = String(process.env.PB_LEVELS || "1,2,4,6,8").split(",").map(Number).filter(Boolean);
const SEASONS = Number(process.env.PB_SEASONS || 1);
/** 한 판 상한. 순차 판의 몇 배까지 봐줄지 — 넘으면 「실패」다 */
const TIMEOUT_MS = Number(process.env.PB_TIMEOUT_MS || 15 * 60 * 1000);
const WORKER = path.join(process.cwd(), "scripts/probe-a-conc-worker.cjs");

function runOne(seed) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [WORKER], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PF_SEED: String(seed), PB_SEASONS: String(SEASONS) },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { child.kill(); }, TIMEOUT_MS);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      const ok = out.includes("CONC_OK");
      resolve({ seed, ok, ms, code, signal, err: err.slice(-300) });
    });
  });
}

(async () => {
  console.log("");
  console.log("── 동시 실행 한계 ────────────────────────────────────────");
  console.log(`  코어 ${os.cpus().length} · 메모리 ${Math.round(os.totalmem() / 1024 ** 3)}GB`);
  console.log(`  일감 = 한 판 ${SEASONS}시즌 · 상한 ${Math.round(TIMEOUT_MS / 60000)}분`);
  console.log("");
  const rows = [];
  for (const n of LEVELS) {
    const t0 = Date.now();
    const seeds = Array.from({ length: n }, (_, i) => 20260900 + i);
    const rs = await Promise.all(seeds.map(runOne));
    const wall = Date.now() - t0;
    const okN = rs.filter((r) => r.ok).length;
    const per = rs.map((r) => r.ms);
    const row = {
      동시: n, 벽시계초: Math.round(wall / 1000),
      성공: okN, 실패: n - okN,
      판당초_중앙: Math.round(per.sort((a, b) => a - b)[Math.floor(per.length / 2)] / 1000),
      판당초_최대: Math.round(Math.max(...per) / 1000),
      처리량_판당분: +(wall / 60000 / Math.max(1, okN)).toFixed(2),
    };
    rows.push(row);
    console.log(`  동시 ${String(n).padStart(2)}  벽시계 ${String(row.벽시계초).padStart(4)}초`
      + `  성공 ${okN}/${n}`
      + `  판당 중앙 ${String(row.판당초_중앙).padStart(4)}초 · 최대 ${String(row.판당초_최대).padStart(4)}초`
      + `  처리량 ${row.처리량_판당분}분/판`);
    for (const r of rs.filter((x) => !x.ok)) {
      console.log(`      🔴 씨앗 ${r.seed} 실패 code=${r.code} signal=${r.signal ?? "-"} ${r.err.split("\n").slice(-2).join(" ")}`);
    }
  }
  console.log("");
  const base = rows[0];
  console.log("  판당 시간이 순차 대비 몇 배인가 (1.0 이면 완전 병렬 · 클수록 경합)");
  for (const r of rows) {
    const x = base ? (r.판당초_중앙 / Math.max(1, base.판당초_중앙)) : 1;
    console.log(`    동시 ${String(r.동시).padStart(2)}  ×${x.toFixed(2)}  ${r.실패 ? `🔴 실패 ${r.실패}` : "ok"}`);
  }
  console.log("");
  console.log("  CONC_RESULT " + JSON.stringify(rows));
})();
