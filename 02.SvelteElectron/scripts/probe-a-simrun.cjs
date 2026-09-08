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
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const RUNS = Number(process.env.PB_RUNS || 3);
const SEASONS = Number(process.env.PB_SEASONS || 6);
const SEEDS = String(process.env.PB_SEEDS || "20260802,777,31337").split(",").map(Number);
const PERSONAS = String(process.env.PB_PERSONAS || process.env.PB_PERSONA || "growth").split(",");
const PRESET = process.env.PB_PRESET || "balanced";
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

function runOne(n, seed, persona) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-simrun-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1",
        PF_SEED: String(seed), PB_SEASONS: String(SEASONS),
        PB_PERSONA: persona, PB_START_PRESET: PRESET, PB_RUN_NO: String(n) },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code, signal) => {
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      resolve(line
        ? { ok: true, report: JSON.parse(line.slice(MARK.length)) }
        : { ok: false, out, err, code, signal });
    });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const reports = [];
  let n = 0;
  for (const persona of PERSONAS) {
    for (const seed of SEEDS.slice(0, RUNS)) {
      n++;
      process.stdout.write(`  [시작] #${n} 씨앗${seed} ${persona} ${PRESET} ${SEASONS}시즌\n`);
      const r = await runOne(n, seed, persona);
      if (!r.ok) { console.log(`  🔴 #${n} 실패`); console.log(failReport(r)); continue; }
      const file = path.join(OUT, `#${String(n).padStart(2, "0")}.json`);
      fs.writeFileSync(file, JSON.stringify(r.report, null, 1));
      reports.push(r.report);
      const h = r.report.머리, t = r.report.꼬리;
      process.stdout.write(`  [끝]   #${n} ${t.진로갈래} · 최고OVR ${h.최고OVR} · 통산 ${h.통산승}승`
        + ` · 예외 ${t.예외} · 폴백 ${t.폴백}\n`);
    }
  }

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
    `- 판 ${rows.length} · 프리셋 ${PRESET} · 성향 ${PERSONAS.join("·")} · 각 ${SEASONS}시즌`,
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
