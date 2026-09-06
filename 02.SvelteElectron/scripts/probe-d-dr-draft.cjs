"use strict";
/**
 * D 세션 계측 — DR. 「드래프트 결과 분포 기준선」(1.0.1 단계 0 · 결정 ⑭ 전후
 * 비교용 · PLAN_101_2026-09-06.md). 시작 프리셋 넷(균형·파워·제구·체력) ×
 * 씨앗 셋 = 12판, 고교 3년 뒤 지명 순위(라운드·픽)·미지명이면 어디로
 * (대학/독립/포기)·3년차 OVR·구속을 잰다.
 *
 * ⚠ **결정 ⑭ 자체(프리셋 OVR 58~62로 내리기)는 아직 안 했다.** 이 기준선은
 *   "내리기 전"이다 — 내린 뒤 같은 명령으로 다시 재면 전후가 갈린다.
 *
 * 판마다 **새 electron 프로세스**를 띄운다(`probe-d-dr-worker.cjs`) — 프리셋이
 * `perfEntry.ts`를 다시 번들해야 하는데, `headless.boot()`가 여는
 * `apps/desktop/main.cjs`는 require 캐시를 타서 같은 프로세스 두 번째 호출이
 * 첫 판 상태를 그대로 들고 있다(확인 근거: 씨앗만 바꾼 두 연속 boot()에서
 * 로스터 체크섬이 똑같이 나왔다 — `headless.cjs` 머리말이 이유를 적어 뒀다).
 * 12판을 **동시성 3**으로 병렬 실행한다(전부 순차면 12판 × 판당 수분 = 너무 길다).
 *
 * 구속(km/h) = 100 + velocity × 0.65 (`MatchPage.svelte:725`와 같은 식).
 *
 *   npm run probe:d:dr
 *   PF_SEEDS=20260802,777,31337 npm run probe:d:dr
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
const PRESETS = ["balanced", "power", "control", "stamina"];
// ⚠ **기본값을 1로 낮췄다(2026-09-06)** — 동시성 3(다른 오케스트레이터와
//   겹치면 실질 8병렬)으로 돌렸다가 CPU 경합으로 12판 전부 타임아웃났다.
//   한 번에 하나 · 다른 판(LOC 등)과 동시에 띄우지 않는다.
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 1);

function runOne(preset, seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-dr-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PB_START_PRESET: preset, PF_SEED: seed },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 1200000); // 코치 지시: 1200초 안에 안 끝나면 억지로 안 돈다
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      if (!line) {
        resolve({ preset, seed, why: "실패(RESULT 못 읽음)", 지명: null, 대학합격: null, 독립합격: null, 병역: null, ovr: null, velocity: null, velKmh: null, raw: out.slice(-2000) });
      } else resolve(JSON.parse(line.slice("RESULT ".length)));
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      process.stdout.write(`  [시작] ${items[i].preset} 씨앗${items[i].seed}\n`);
      results[i] = await worker(items[i]);
      process.stdout.write(`  [끝]   ${items[i].preset} 씨앗${items[i].seed} → ${results[i].why}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

(async () => {
  const jobs = [];
  for (const preset of PRESETS) for (const seed of SEEDS) jobs.push({ preset, seed });
  const rows = await pool(jobs, CONCURRENCY, (j) => runOne(j.preset, j.seed));

  console.log("");
  console.log("── DR 드래프트 결과 분포 기준선 (고교 3년 뒤) ──");
  console.log("프리셋     씨앗       결과                              3년차OVR  구속(raw/km)   진행상태");
  for (const r of rows) {
    // ⚠ `careerProbe().지명`은 미지명이어도 문자열 "미지명"이라 `??`로는 안 걸러진다
    const outcome = (r.지명 && r.지명 !== "미지명") ? r.지명
      : (r.대학합격 ? `대학합격${r.대학합격}` : (r.독립합격 ? `독립합격${r.독립합격}` : (r.병역 && r.병역 !== "미필" ? "포기(현역)" : "미지명(진로없음)")));
    console.log(
      `${r.preset.padEnd(9)}${String(r.seed).padEnd(11)}${String(outcome).padEnd(34)}` +
      `${String(r.ovr).padStart(8)}  ${String(r.velocity).padStart(3)}/${r.velKmh}      ${r.why}`,
    );
    if (r.raw) console.log(`    (진단) ${r.raw}`);
  }
  console.log("");
  console.log("[END] DR 12판 완료");
})();
