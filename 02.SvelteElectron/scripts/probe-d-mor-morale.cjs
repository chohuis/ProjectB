"use strict";
/**
 * D 세션 계측 — MOR. 「고교 사기 분포」(1.0.1 단계 0 · 결정 ⑥ 문턱을 얼마로
 * 올릴지 · PLAN_101_2026-09-06.md). 씨앗 셋 × 고교 3년, 주별 사기 값의
 * 최소·5%·중앙·평균과 패배 주의 낙폭을 잰다.
 *
 * ⚠ "부진 주"는 못 쟀다 — 주 단위로 그 경기 실점/성적을 주는 프로브가 없다
 *   (`s.stats`는 시즌 누적). 패배 여부만 승패 델타로 가른다.
 *
 * 씨앗마다 새 프로세스(`probe-d-mor-worker.cjs`) — DR/LOC와 같은 이유.
 * 셋뿐이라 동시성 3(=전부 병렬)로 돈다.
 *
 *   npm run probe:d:mor
 *   PF_SEEDS=20260802,777,31337 npm run probe:d:mor
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 3);

function runOne(seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-mor-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PF_SEED: seed },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? JSON.parse(line.slice("RESULT ".length)) : { seed, why: "실패(RESULT 못 읽음)", weekly: [], raw: out.slice(-2000) });
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      process.stdout.write(`  [시작] 씨앗${items[i]}\n`);
      results[i] = await worker(items[i]);
      process.stdout.write(`  [끝]   씨앗${items[i]} → ${results[i].why} · 표본 ${results[i].weekly.length}주\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

const pctl = (arr, f) => {
  const v = [...arr].sort((a, b) => a - b);
  return v.length ? v[Math.max(0, Math.min(v.length - 1, Math.floor(v.length * f)))] : null;
};
const avg = (v) => v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;

(async () => {
  const all = await pool(SEEDS, CONCURRENCY, runOne);
  for (const r of all) if (r.raw) console.log(`    (진단 씨앗${r.seed}) ${r.raw}`);

  console.log("");
  console.log("── MOR 고교 사기 분포 (씨앗별) ──");
  console.log("씨앗       표본주   최소   p5    중앙   평균   패배주낙폭(n)   승리주(n)   없는주(n)");
  for (const r of all) {
    const m = r.weekly.map((w) => w.morale);
    const loss = r.weekly.filter((w) => w.isLoss).map((w) => w.delta);
    const win = r.weekly.filter((w) => w.isWin).map((w) => w.delta);
    const none = r.weekly.filter((w) => !w.isGame).map((w) => w.delta);
    console.log(
      `${String(r.seed).padEnd(11)}${String(m.length).padStart(6)}   ${String(pctl(m, 0)).padStart(4)}  ` +
      `${String(pctl(m, 0.05)).padStart(4)}  ${String(pctl(m, 0.5)).padStart(4)}  ${String(avg(m)).padStart(5)}   ` +
      `${String(avg(loss)).padStart(6)}(${loss.length})       ${String(avg(win)).padStart(6)}(${win.length})    ${String(avg(none)).padStart(6)}(${none.length})`,
    );
  }
  const mAll = all.flatMap((r) => r.weekly.map((w) => w.morale));
  const lossAll = all.flatMap((r) => r.weekly.filter((w) => w.isLoss).map((w) => w.delta));
  console.log("");
  console.log(`  [합산] 표본 ${mAll.length}주 · 최소 ${pctl(mAll, 0)} · p5 ${pctl(mAll, 0.05)} · 중앙 ${pctl(mAll, 0.5)} · 평균 ${avg(mAll)}` +
    ` · 패배주 낙폭 평균 ${avg(lossAll)}(n=${lossAll.length})`);
  console.log("");
  console.log("[END] MOR 완료");
})();
