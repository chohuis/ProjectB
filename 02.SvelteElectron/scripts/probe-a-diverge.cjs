"use strict";
/**
 * 계측 모드 재현 — **두 판이 어느 주에서 갈리는지** 찾는다.
 *
 * `check-measure-repro.cjs` 가 "안 같다"고 하면 여기서 자리를 좁힌다.
 * 워커를 두 번(새 프로세스로) 띄워 주 단위 줄을 받고 **첫 번째로 어긋나는
 * 줄**을 낸다 — 그 주의 어느 항이 갈렸는지가 곧 남은 난수의 정체다.
 *
 *   npm run probe:a:diverge
 *   PB_DIVERGE_WEEKS=120 npm run probe:a:diverge
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");

const WEEKS = process.env.PB_DIVERGE_WEEKS || "60";
const SEED = process.env.PF_SEED || "20260802";

function runOne(i) {
  const out = path.join(os.tmpdir(), `diverge-${process.pid}-${i}.txt`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-diverge-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PF_SEED: SEED, PB_DIVERGE_WEEKS: WEEKS, PB_DIVERGE_OUT: out },
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", () => {
      if (!fs.existsSync(out)) { console.log(log.slice(-2000)); resolve(null); return; }
      resolve({
        lines: fs.readFileSync(out, "utf8").trim().split("\n"),
        reqs: fs.existsSync(out + ".reqs")
          ? fs.readFileSync(out + ".reqs", "utf8").trim().split("\n") : [],
        live: fs.existsSync(out + ".live")
          ? fs.readFileSync(out + ".live", "utf8").split("\n===\n") : [],
      });
    });
  });
}

/** 두 값이 어느 경로에서 갈리는지 — 경로만 모은다(값은 짧게) */
function deepDiff(x, y, path = "", out = []) {
  if (out.length > 20) return out;
  if (x === y) return out;
  const bothObj = x && y && typeof x === "object" && typeof y === "object";
  if (!bothObj) { out.push(`${path || "(root)"}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`); return out; }
  if (Array.isArray(x) !== Array.isArray(y) || (Array.isArray(x) && x.length !== y.length)) {
    out.push(`${path}: 배열 길이 ${x.length ?? "-"} vs ${y.length ?? "-"}`); return out;
  }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    deepDiff(x[k], y[k], path ? `${path}.${k}` : k, out);
  }
  return out;
}

(async () => {
  console.log(`두 판을 ${WEEKS}주씩 돌린다 (씨앗 ${SEED})`);
  const ra = await runOne(1);
  console.log("  1판 완료");
  const rb = await runOne(2);
  console.log("  2판 완료");
  if (!ra || !rb) { console.log("❌ 판이 안 끝났다"); process.exit(1); }
  const a = ra.lines, b = rb.lines;

  // NPC 능력치가 먼저 갈렸으면 **누가** 갈렸는지 낸다 — 주간 성장 쪽 문제다
  const ln = Math.min(ra.live.length, rb.live.length);
  for (let i = 0; i < ln; i++) {
    if (ra.live[i] === rb.live[i]) continue;
    const A = ra.live[i].split("\n"), B = rb.live[i].split("\n");
    const mb = new Map(B.map((l) => [l.split(":")[0], l]));
    const bad = A.filter((l) => mb.get(l.split(":")[0]) !== l);
    console.log(`\n❗ ${i + 1}번째 주의 **NPC 능력치**가 다르다 — ${bad.length}명`);
    for (const l of bad.slice(0, 10)) console.log(`   1판 ${l}   2판 ${mb.get(l.split(":")[0])}`);
    break;
  }

  // 주인공 경기 **요청 원문**이 먼저 갈렸는지부터 본다 — 갈렸으면 원인은
  // 엔진이 아니라 「경기에 넘기는 재료」다(로테이션·컨디션·부상 …)
  const rn = Math.min(ra.reqs.length, rb.reqs.length);
  for (let i = 0; i < rn; i++) {
    if (ra.reqs[i] !== rb.reqs[i]) {
      console.log(`\n❗ ${i + 1}번째 주인공 경기 **요청**이 이미 다르다 — 갈리는 칸:`);
      for (const d of deepDiff(JSON.parse(ra.reqs[i]), JSON.parse(rb.reqs[i]))) console.log(`   ${d}`);
      break;
    }
  }

  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.log(`\n❌ ${i + 1}번째 줄에서 갈린다`);
      for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 2); k++) {
        console.log(`  ${k === i ? "→" : " "} 1판  ${a[k]}`);
        console.log(`  ${k === i ? "→" : " "} 2판  ${b[k]}`);
      }
      process.exit(1);
    }
  }
  if (a.length !== b.length) {
    console.log(`\n❌ 줄 수가 다르다 (${a.length} vs ${b.length}) — 진행 자체가 갈렸다`);
    process.exit(1);
  }
  console.log(`\n✅ ${n}줄 전부 같다`);
})();
