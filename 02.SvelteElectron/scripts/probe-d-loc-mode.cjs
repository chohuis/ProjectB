"use strict";
/**
 * 🔴 **이 계측은 끝났다 — 지금 돌리면 두 줄이 같은 값을 낸다** (2026-09-08).
 *
 *   결정 ⑦ 이 **착탄 기준으로 닫혔고**, 그때 `PB_LOC_INTENT` 환경변수와
 *   의도 기준 갈래를 **코드에서 지웠다**(`tuning.rs` 「로케이션 품질」 절에
 *   산식과 근거가 남아 있다). 그래서 아래가 모드 0/1 을 나눠 돌려도 Rust 는
 *   이제 그 변수를 안 읽는다 — 두 줄의 차이는 실행 편차뿐이다.
 *
 *   닫은 근거(⑧⑨ 를 켠 위에서 씨앗 셋):
 *     착탄 기준(0)  리그 ERA 5.24 / — / 5.25   리그 타율 .277 / — / .278
 *     의도 기준(1)  리그 ERA 5.75 / 5.83 / 5.55  리그 타율 .290 / .291 / .286
 *   제구 응답성은 두 모드 다 정상이었다(그게 의도 기준을 만든 이유였는데
 *   사라졌다) — 지키는 자리는 이제 `npm run probe:a:cmd` 다.
 *
 *   **지우지 않고 남긴다.** 결정을 다시 열면 `tuning.rs` 의 산식을 되살린 뒤
 *   이 스크립트가 그대로 다시 쓰인다.
 *
 * ── 아래는 그때의 원문이다 ────────────────────────────────────────────
 *
 * D 세션 계측 — LOC. 「코스 정확도 모드 전후」(1.0.1 단계 0 · 결정 ⑦ ·
 * PLAN_101_2026-09-06.md). `PB_LOC_INTENT=1`(의도 기준) 켠 판 / 안 켠 판(0 ·
 * 착탄 기준 · 현재 기본값) × 씨앗 셋. 고교 → 드래프트 → 프로까지 자동 진행한
 * 뒤 프로 한 시즌을 더 돌려 리그 타율·ERA·삼진율(K9)·볼넷률(BB9)과 주인공
 * ERA·BB/9를 잰다.
 *
 * ⚠ **"리그" 수치는 그 시즌에 뛴 전 무대(고교·대학·독립·프로 1·2군) 합산이다**
 *   — `s.stats`(주인공 리그)와 `s.leagueState.*.stats`를 전부 더한다
 *   (`leagueRateProbe`). 프로만 뽑으려면 리그별로 갈라야 하는데 이번 계측은
 *   "모드가 게임 전체에 어떻게 듣나"를 보는 것이라 합산으로 뒀다.
 *
 * 판마다 새 프로세스(`probe-d-loc-worker.cjs`) — DR과 같은 이유. 6판을
 * 동시성 3으로 병렬 실행한다.
 *
 *   npm run probe:d:loc
 *   PF_SEEDS=20260802,777,31337 npm run probe:d:loc
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => s.trim());
const MODES = ["0", "1"];
// ⚠ 기본값 1(2026-09-06) — 동시성으로 겹쳐 돌리면 CPU 경합으로 타임아웃난다
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 1);

function runOne(mode, seed) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-loc-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PB_LOC_INTENT: mode, PF_SEED: seed },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 1200000); // 코치 지시: 1200초 상한
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      resolve(line ? JSON.parse(line.slice("RESULT ".length)) : { mode, seed, why: "실패(RESULT 못 읽음)", raw: out.slice(-2000) });
    });
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      process.stdout.write(`  [시작] LOC_INTENT=${items[i].mode} 씨앗${items[i].seed}\n`);
      results[i] = await worker(items[i]);
      process.stdout.write(`  [끝]   LOC_INTENT=${items[i].mode} 씨앗${items[i].seed} → ${results[i].why}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

(async () => {
  const jobs = [];
  for (const mode of MODES) for (const seed of SEEDS) jobs.push({ mode, seed });
  const rows = await pool(jobs, CONCURRENCY, (j) => runOne(j.mode, j.seed));

  console.log("");
  console.log("── LOC 코스 정확도 모드 전후 (고교→드래프트→프로 · 프로 1시즌) ──");
  console.log("모드         씨앗       리그ERA  리그K9  리그BB9  리그타율  주인공ERA  주인공BB9  주인공IP  진행상태");
  for (const r of rows) {
    console.log(
      `${(r.mode === "1" ? "의도기준(1)" : "착탄기준(0)").padEnd(13)}${String(r.seed).padEnd(11)}` +
      `${String(r.리그_ERA).padStart(7)}  ${String(r.리그_K9).padStart(6)}  ${String(r.리그_BB9).padStart(7)}  ` +
      `${String(r.리그_타율).padStart(8)}  ${String(r.주인공_ERA).padStart(9)}  ${String(r.주인공_BB9).padStart(9)}  ` +
      `${String(r.주인공_IP).padStart(8)}  ${r.why}`,
    );
    if (r.raw) console.log(`    (진단) ${r.raw}`);
  }
  console.log("");
  console.log("[END] LOC 6판 완료");
})();
