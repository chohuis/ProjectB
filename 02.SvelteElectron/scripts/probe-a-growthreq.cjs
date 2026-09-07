"use strict";
/**
 * 계측 재현 — **주간 성장 요청/응답이 어디서 갈리는지** 집는다.
 *
 * 두 판을 새 프로세스로 띄워 `npcCalcWeeklyGrowth` 등의 인자·결과를 파일로
 * 받고, **같은 순번끼리** 깊게 비교해 첫 번째로 어긋나는 경로를 낸다.
 * 요청이 갈리면 원인은 그 앞(경기·성적 집계)이고, 요청이 같은데 결과가
 * 갈리면 원인은 엔진 안(HashMap 순회 · 씨앗 없는 난수)이다.
 *
 *   npm run probe:a:growthreq
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");

const WEEKS = process.env.PB_GR_WEEKS || "8";
const SEED = process.env.PF_SEED || "20260802";
const MAXDIFF = Number(process.env.PB_GR_MAXDIFF || 25);

function runOne(i) {
  const out = path.join(os.tmpdir(), `growthreq-${process.pid}-${i}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-growthreq-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PF_SEED: SEED, PB_GR_WEEKS: WEEKS, PB_GR_OUT: out },
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", () => {
      if (!fs.existsSync(path.join(out, "index.txt"))) { console.log(log.slice(-3000)); resolve(null); return; }
      resolve(out);
    });
  });
}

function deepDiff(x, y, p = "", out = []) {
  if (out.length > MAXDIFF) return out;
  if (x === y) return out;
  const bothObj = x && y && typeof x === "object" && typeof y === "object";
  if (!bothObj) { out.push(`${p || "(root)"}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`); return out; }
  if (Array.isArray(x) !== Array.isArray(y)) { out.push(`${p}: 형이 다르다`); return out; }
  if (Array.isArray(x)) {
    if (x.length !== y.length) { out.push(`${p}: 배열 길이 ${x.length} vs ${y.length}`); return out; }
    for (let i = 0; i < x.length && out.length <= MAXDIFF; i++) deepDiff(x[i], y[i], `${p}[${i}]`, out);
    return out;
  }
  const ka = Object.keys(x), kb = Object.keys(y);
  // 키 **순서**도 본다 — Rust 가 순서에 안 걸려도, 순서가 다르면 그 앞이 갈렸다는 표시다
  if (ka.length === kb.length && ka.join("") !== kb.join("")) {
    let at = -1;
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) { at = i; break; }
    out.push(`${p}: 키 순서가 다르다 (${at}번째: ${ka[at]} vs ${kb[at]})`);
  }
  for (const k of new Set([...ka, ...kb])) {
    if (out.length > MAXDIFF) break;
    deepDiff(x[k], y[k], p ? `${p}.${k}` : k, out);
  }
  return out;
}

(async () => {
  console.log(`두 판을 ${WEEKS}주씩 돌린다 (씨앗 ${SEED})`);
  const a = await runOne(1); console.log("  1판 완료");
  const b = await runOne(2); console.log("  2판 완료");
  if (!a || !b) { console.log("❌ 판이 안 끝났다"); process.exit(1); }
  const ia = fs.readFileSync(path.join(a, "index.txt"), "utf8").trim().split("\n");
  const ib = fs.readFileSync(path.join(b, "index.txt"), "utf8").trim().split("\n");
  const n = Math.min(ia.length, ib.length);
  console.log(`호출 ${ia.length} vs ${ib.length}건`);
  // 키 순서만 다른 것은 **값이 아니다** — 표시만 하고 지나간다(그 자체도
  // 결함이지만, 값이 갈리는 자리를 가리면 진짜 원인을 못 찾는다)
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o; }
    return v;
  };
  const orderOnly = [];
  for (let i = 0; i < n; i++) {
    if (ia[i] !== ib[i]) { console.log(`❌ ${i + 1}번째 호출 이름부터 다르다: ${ia[i]} vs ${ib[i]}`); process.exit(1); }
    for (const kind of ["req", "res"]) {
      const fa = path.join(a, `${ia[i]}.${kind}.json`);
      const fb = path.join(b, `${ib[i]}.${kind}.json`);
      const sa = fs.readFileSync(fa, "utf8"), sb = fs.readFileSync(fb, "utf8");
      if (sa === sb) continue;
      let pa, pb;
      try { pa = JSON.parse(sa); pb = JSON.parse(sb); } catch { console.log(`❌ ${ia[i]}.${kind} JSON 파싱 실패 (${sa.length} vs ${sb.length})`); process.exit(1); }
      if (JSON.stringify(norm(pa)) === JSON.stringify(norm(pb))) {
        orderOnly.push(`${ia[i]}.${kind}`);
        continue;
      }
      console.log(`\n❌ ${ia[i]} 의 **${kind === "req" ? "요청" : "응답"}**이 다르다 (값)`);
      for (const d of deepDiff(pa, pb)) console.log(`   ${d}`);
      console.log(`\n   1판 파일 ${fa}\n   2판 파일 ${fb}`);
      if (orderOnly.length) console.log(`\n⚠ 그 앞에 **키 순서만** 다른 것 ${orderOnly.length}건: ${orderOnly.slice(0, 6).join(", ")}`);
      process.exit(1);
    }
  }
  if (orderOnly.length) console.log(`\n⚠ **키 순서만** 다른 것 ${orderOnly.length}건: ${orderOnly.slice(0, 10).join(", ")}`);
  if (ia.length !== ib.length) { console.log(`❌ 호출 수가 다르다`); process.exit(1); }
  console.log(`\n✅ ${n}건 전부 같다`);
})();
