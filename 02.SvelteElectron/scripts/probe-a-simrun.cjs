"use strict";
/**
 * **판 보고서를 만든다** — `runs/#NN.json` + `runs/summary.md`
 * (2026-09-09 · 계측 2-4 · 서식 정본 `docs/PLAN_SIM_REPORT_2026-09-09.md`).
 *
 * 🔴 **데이터는 이미 다 있었다 — 꺼내는 자리만 없었다.** 새로 만드는 게 아니라
 *   이어 붙이는 일이다(서식 문서 마지막 표).
 *
 * 한 판 = 한 프로세스다(`headless.boot` 이 require 캐시를 타서 같은 프로세스
 * 두 번째 부팅이 첫 판 상태를 들고 있다 · `probe-d-dr-worker` 머리말).
 *
 *   PB_RUNS=3 PB_SEASONS=8 npm run probe:a:simrun
 *   PB_PERSONA=safe PB_PRESET=power npm run probe:a:simrun
 *
 * ⚠ **성향을 바꾸면 다른 판이 나와야 한다**(계측 2-3). 셋을 나란히 돌려
 *   같은 답이 나오면 성향을 나눈 뜻이 없다.
 */
const path = require("node:path");
const { SAFE_CONCURRENCY, timeoutFor, runPool } = require(path.join(process.cwd(), "scripts/perf/concurrency.cjs"));
const CONC = Number(process.env.PB_CONC || SAFE_CONCURRENCY);
/** 한 판 기본 상한 — 12시즌이 20분 안팎이라 넉넉히 잡는다 */
const BASE_TIMEOUT = Number(process.env.PB_RUN_TIMEOUT_MS || 90 * 60 * 1000);
const fs = require("node:fs");
const { spawn } = require("node:child_process");

/**
 * **판 구성 — 30판** (사용자 확정 2026-09-09).
 *
 * ```
 *   성장 우선  20판 (프리셋 4 × 씨앗 5)   ← 밸런스의 기준
 *   안전         5판
 *   대충         5판                      ← 폭 확인용
 * ```
 *
 * ⚠ **성장 우선만 프리셋을 다 돈다.** 안전·대충은 「폭」을 보는 것이라 기준
 *   프리셋(균형형) 하나로 씨앗만 흩는다 — 그쪽까지 4×5 로 돌리면 60판이 된다.
 * ⚠ `PB_PLAN=quick` 이면 성향 셋 × 씨앗 하나(3판)다 — 배선 확인용.
 *
 * 🔴 **`PB_PLAN=pair` — 9판** (사용자 확정 2026-09-10). 씨앗·프리셋을 고정하고
 *   **성향만 바꾼다**.
 *
 * ```
 *   씨앗 20260802 × balanced × { growth, safe, lazy }
 *   씨앗 777      × balanced × { growth, safe, lazy }
 *   씨앗 31337    × balanced × { growth, safe, lazy }
 * ```
 *
 *   왜 짝인가 — 답할 물음이 「성향 셋이 갈리는가」 하나다. **씨앗이 다르면
 *   성향 차이인지 씨앗 운인지 못 가린다.** 같은 세계·같은 선수로 셋을 돌려야
 *   차이가 순수하게 성향 것이다. 30판에서 안전형이 이긴 것이 진짜인지가
 *   여기서 갈린다.
 *
 *   ⚠ 프리셋이 균형형 하나뿐이라 **프리셋별 비교는 못 한다** — 그건 30판 옛
 *   표(`SIM_REPORT_2026-09-10_30run.md`)에 있다.
 */
const SEASONS = Number(process.env.PB_SEASONS || 12);
const PRESETS_ALL = ["balanced", "power", "control", "stamina"];
const SEEDS_ALL = String(process.env.PB_SEEDS || "20260802,777,31337,4242,20260803")
  .split(",").map(Number);

function buildPlan() {
  if (process.env.PB_PLAN === "quick") {
    return ["growth", "safe", "lazy"]
      .map((persona, i) => ({ n: i + 1, persona, preset: "balanced", seed: SEEDS_ALL[0] }));
  }
  if (process.env.PB_PLAN === "pair") {
    // 씨앗을 바깥에 둔다 — 표에서 **같은 씨앗 셋이 붙어 있어야** 읽힌다
    const jobs = [];
    for (const seed of SEEDS_ALL.slice(0, 3)) {
      for (const persona of ["growth", "safe", "lazy"]) jobs.push({ persona, preset: "balanced", seed });
    }
    return jobs.map((j, i) => ({ n: i + 1, ...j }));
  }
  const jobs = [];
  for (const preset of PRESETS_ALL) for (const seed of SEEDS_ALL) jobs.push({ persona: "growth", preset, seed });
  for (const seed of SEEDS_ALL) jobs.push({ persona: "safe",  preset: "balanced", seed });
  for (const seed of SEEDS_ALL) jobs.push({ persona: "lazy",  preset: "balanced", seed });
  // 🔴 **번호는 계획 안에서 정해진다** — 골라 돌려도 `#NN` 이 안 밀린다.
  //   예전엔 `runPool` 의 인덱스를 썼는데, 그러면 6판만 돌릴 때 그 여섯이
  //   `#01~06` 으로 나가 **먼저 돈 24판을 덮어쓴다**(다시 돌리면 다섯 시간이다).
  return jobs.map((j, i) => ({ n: i + 1, ...j }));
}

/**
 * 골라 돌리기 — `PB_ONLY=25-30` · `PB_ONLY=3,7,9`.
 *
 * ⚠ 안 주면 전부다. 이미 있는 판을 다시 안 돌리려고 쓴다 —
 *   12시즌 한 판이 80분이라 서른 판이면 일곱 시간이다.
 */
function pickJobs(plan) {
  const only = process.env.PB_ONLY;
  if (!only) return plan;
  const want = new Set();
  for (const part of only.split(",")) {
    const m = part.trim().match(/^([0-9]+)(?:-([0-9]+))?$/);
    if (!m) throw new Error(`[simrun] PB_ONLY 를 못 읽었다: ${part}`);
    const lo = Number(m[1]), hi = Number(m[2] ?? m[1]);
    for (let i = lo; i <= hi; i++) want.add(i);
  }
  const got = plan.filter((j) => want.has(j.n));
  if (got.length === 0) throw new Error(`[simrun] PB_ONLY=${only} 가 아무 판도 안 고른다`);
  return got;
}
const OUT = path.join(process.cwd(), "resource/logs/runs");
const MARK = "SIMRUN_JSON ";

/** 자식이 왜 죽었는지 그대로 낸다 — stdout 만 찍어 진짜 오류를 버린 적이 있다(2026-09-08) */
function failReport(r) {
  return [
    `    종료코드 ${r.code ?? "없음"}${r.signal ? ` · 시그널 ${r.signal}` : ""}`,
    `    ── stderr (${r.err.length}자)${r.err ? "" : " — 비었다"}`,
    r.err ? r.err.slice(-1200) : "",
    `    ── stdout (${r.out.length}자)${r.out ? "" : " — 비었다"}`,
    r.out ? r.out.slice(-800) : "",
  ].filter(Boolean).join("\n");
}

function runOne(n, seed, persona, preset) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-simrun-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1",
        PF_SEED: String(seed), PB_SEASONS: String(SEASONS),
        PB_PERSONA: persona, PB_START_PRESET: preset, PB_RUN_NO: String(n) },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    // 🔴 **상한을 건다** — 없으면 한 판이 멈췄을 때 서른 판이 통째로 안 끝난다.
    //   동시 수만큼 늘려 잡는다(`timeoutFor`) — 순차 기준 상한을 그대로 쓰면
    //   **동시에 돌린다는 이유만으로** 죽는다(2026-09-09 실측으로 밝힌 자리)
    const timer = setTimeout(() => child.kill(), timeoutFor(BASE_TIMEOUT, CONC));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      resolve(line
        ? { ok: true, report: JSON.parse(line.slice(MARK.length)) }
        : { ok: false, out, err, code, signal });
    });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const plan = pickJobs(buildPlan());
  const t0 = Date.now();
  // 🔴 **덮어쓰기 가드.** 이미 있는 판을 다시 돌리면 다섯 시간이 날아간다 —
  //   `PB_FORCE=1` 을 줘야 덮는다.
  const 있는것 = plan.filter((j) => fs.existsSync(path.join(OUT, `#${String(j.n).padStart(2, "0")}.json`)));
  if (있는것.length && process.env.PB_FORCE !== "1") {
    console.log(`  🔴 이미 있는 판 ${있는것.length}개를 덮으려 한다: ${있는것.map((j) => "#" + j.n).join(" ")}`);
    console.log("     `PB_ONLY` 로 없는 것만 고르거나, 정말 덮으려면 `PB_FORCE=1` 을 줘라");
    process.exit(1);
  }
  console.log(`  판 ${plan.length}(${plan.map((j) => "#" + j.n).join(" ")}) · 각 ${SEASONS}시즌`
    + ` · 동시 ${CONC}판 (실측 안전선 ${SAFE_CONCURRENCY})`);
  const out = await runPool(plan, CONC, async (j) => {
    const n = j.n;
    const r = await runOne(n, j.seed, j.persona, j.preset);
    if (!r.ok) {
      console.log(`  🔴 #${n} ${j.persona}/${j.preset}/${j.seed} 실패`);
      console.log(failReport(r));
      return null;
    }
    fs.writeFileSync(path.join(OUT, `#${String(n).padStart(2, "0")}.json`), JSON.stringify(r.report, null, 1));
    const h = r.report.머리, t = r.report.꼬리;
    // 🔴 **끊긴 판을 「[끝]」이라고 적으면 안 된다** (2026-09-10 실측). 6판이
    //   2시즌에서 막혔는데 이 줄은 「예외 0 · 폴백 2」라고만 말했고, 표를 낼
    //   때까지 아무도 몰랐다 — 다섯 시간을 버릴 뻔했다. 여기서 바로 말한다.
    const 연도폭 = (() => {
      const ys = r.report.해마다 ?? [];
      if (!ys.length) return 0;
      return ys[ys.length - 1].연도 - ys[0].연도 + 1;
    })();
    const 끊김 = 연도폭 < SEASONS && h.은퇴나이 == null;
    console.log(`  ${끊김 ? "🔴 [끊김]" : "  [끝]"} #${String(n).padStart(2)} ${j.persona}/${j.preset}/${j.seed}`
      + ` ${t.진로갈래} · ${연도폭}/${SEASONS}시즌 · 최고OVR ${h.최고OVR} · 통산 ${h.통산승}승`
      + ` · 예외 ${t.예외} · 폴백 ${t.폴백}`);
    return r.report;
  });
  const reports = out.filter(Boolean);
  const 벽시계분 = Math.round((Date.now() - t0) / 60000);

  // ── 통합 (서식 문서 「통합 summary.md」) ──────────────────────
  const rows = reports.map((r, i) => ({
    "#": i + 1, 씨앗: r.머리.씨앗, 프리셋: r.머리.프리셋, 성향: r.머리.성향,
    진로: r.꼬리.진로갈래,
    프로시즌: r.해마다.filter((y) => String(y.무대).startsWith("pro_")).length,
    통산승: r.머리.통산승, 최고OVR: r.머리.최고OVR, 최고연봉: r.꼬리.최고연봉,
    히든: r.해마다.reduce((a, y) => a + y.히든, 0),
    예외: r.꼬리.예외, 폴백: r.꼬리.폴백,
  }));
  const 예외판 = rows.filter((x) => x.예외 > 0).length;
  const 프로도달 = rows.filter((x) => x.프로시즌 > 0).length;
  const md = [
    `# 계측 통합 (${new Date().toISOString().slice(0, 10)})`,
    "",
    `- 판 ${rows.length}/${plan.length} · 각 ${SEASONS}시즌 · 동시 ${CONC}판 · 총 ${벽시계분}분`,
    `- 프로 도달 ${프로도달}/${rows.length}`,
    `- 🔴 **삼킨 예외가 난 판 ${예외판}** ${예외판 ? "— 그 판의 숫자는 믿으면 안 된다" : "(없다)"}`,
    `- 폴백 총 ${rows.reduce((a, x) => a + x.폴백, 0)} (목표 0)`,
    "",
    "| # | 씨앗 | 프리셋 | 성향 | 진로 | 프로시즌 | 통산승 | 최고OVR | 최고연봉 | 히든 | 예외 | 폴백 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((x) => `| ${x["#"]} | ${x.씨앗} | ${x.프리셋} | ${x.성향} | ${x.진로} | ${x.프로시즌} | ${x.통산승} | ${x.최고OVR} | ${x.최고연봉} | ${x.히든} | ${x.예외 ? `🔴 ${x.예외}` : 0} | ${x.폴백} |`),
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "summary.md"), md + "\n");
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(rows, null, 1));
  console.log("");
  console.log(md);
  console.log("");
  console.log(`  → ${path.relative(process.cwd(), OUT)}`);
})();
