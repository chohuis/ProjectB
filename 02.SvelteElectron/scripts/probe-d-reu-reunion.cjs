"use strict";
/**
 * D 세션 계측 — REU. 「재회 12종 무대별 도달 분포」(1.0.1 단계 0 ·
 * 백로그 §3 · PLAN_101_2026-09-06.md). 프로 전역 판 · 독립 전역 판 각각
 * 씨앗 셋. 12종 각각 도달 여부와, 닿은 종의 순위(전역 후 도달한 순서)·
 * 전역 후 경과 주차를 잰다.
 *
 * 입대 시점은 고교 졸업 직후로 고정한다(`probe-d-reu-worker.cjs`가
 * `forceEnlist`/자연 낙방 경로로 강제한다) — 그래야 씨앗 간 "전역 후 몇 주"를
 * 서로 비교할 수 있다. 실제 플레이는 입대 시점이 훨씬 늦을 수 있으니
 * **이 숫자는 "가능한 가장 이른 조건"에 가깝다**.
 *
 * 판마다 새 프로세스, 동시성 3.
 *
 *   npm run probe:d:reu
 *   PF_SEEDS=20260802,777,31337 npm run probe:d:reu
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
const PATHS = ["pro", "indie"];
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 3);

const REUNION_IDS = [
  "EVT_MILREUNION_UNIT_LETTER", "EVT_MILREUNION_JUNIOR_ASK", "EVT_MILREUNION_TICKETS",
  "EVT_MILREUNION_PARCEL", "EVT_MILREUNION_BULLPEN_CATCH", "EVT_MILREUNION_FIRST_CALL",
  "EVT_MILREUNION_BALL_PARTNER_NEWS", "EVT_MILREUNION_INDIE_FIELD", "EVT_MILREUNION_WEDDING",
  "EVT_MILREUNION_SAME_CLUB", "EVT_MILREUNION_OPP_MOUND", "EVT_MILREUNION_UNIT_INVITE",
];

function runOne(pathKey, seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-reu-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PB_PATH: pathKey, PF_SEED: seed },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    // ⚠ **실측(2026-09-06)**: 고교 3~4시즌 + 복무 100주 + 전역 후 최대 110주를
    //   한 판에 다 담으면 실제로 40~50분이 걸린다(스모크에서 한 판이 죽기
    //   직전까지 41분·8회 롤오버를 지나고 있었다). 예전 값(1,100,000ms ≈
    //   18분)은 그 절반도 안 돼 **RESULT 를 못 보고 전부 죽였다** — 도달
    //   0/12 로 나온 표는 게임이 그런 게 아니라 타임아웃이었다.
    // ⚠ 60분도 빠듯했다(2차 시도 — 두 판 다 3,600~3,700초 선에서 시간 끝. 벽시계와
    //   CPU 시간이 거의 같아서 "다 됐는데 못 넘었다"였다). 80분으로 더 늘린다.
    const timer = setTimeout(() => child.kill(), 4800000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? JSON.parse(line.slice("RESULT ".length)) : { path: pathKey, seed, why: "실패(RESULT 못 읽음)", fireOrder: [], raw: out.slice(-2000) });
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
      process.stdout.write(`  [끝]   ${items[i].p} 씨앗${items[i].seed} → ${results[i].why} · 도달 ${results[i].fireOrder.length}/12\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

(async () => {
  const jobs = [];
  for (const p of PATHS) for (const seed of SEEDS) jobs.push({ p, seed });
  const rows = await pool(jobs, CONCURRENCY, (j) => runOne(j.p, j.seed));
  for (const r of rows) if (r.raw) console.log(`    (진단 ${r.path}/씨앗${r.seed}) ${r.raw}`);

  console.log("");
  console.log("── REU 재회 12종 도달 분포 ──");
  for (const p of PATHS) {
    console.log("");
    console.log(`  [경로 ${p}]`);
    for (const r of rows.filter((x) => x.path === p)) {
      console.log(`    씨앗${r.seed} · ${r.why} · 전역 ${r.dischargeWeekTag ?? "-"} · 도달 ${r.fireOrder.length}/12`);
      r.fireOrder.forEach((f, i) => console.log(`      ${i + 1}순위  +${f.weeksSince}주  ${f.id.replace("EVT_MILREUNION_", "")}`));
    }
  }
  console.log("");
  console.log("  [12종 × 경로별 도달 판수]");
  console.log("  이벤트                     프로전역   독립전역");
  for (const id of REUNION_IDS) {
    const cnt = (p) => rows.filter((r) => r.path === p && r.fireOrder.some((f) => f.id === id)).length;
    console.log(`  ${id.replace("EVT_MILREUNION_", "").padEnd(24)}${String(cnt("pro")).padStart(6)}/${SEEDS.length}    ${String(cnt("indie")).padStart(6)}/${SEEDS.length}`);
  }
  console.log("");
  console.log("[END] REU 완료");
})();
