#!/usr/bin/env node
"use strict";
/**
 * Steam 디포 산출물 검증 — `npm run pack` 뒤에 돈다 (2026-09-02 · PLAN_RELEASE §8).
 *
 * electron-builder 의 `dir` 타깃(`release/win-unpacked/`)이 **그대로 디포**다.
 * 설치기는 Steam 이 맡는다. 여기서는 "올려도 되는 폴더인가"만 본다:
 *
 * ```
 *   ① 실행파일          OnePitch.exe 가 있다 (productName 이 6월엔 ProjectB 였다)
 *   ② 네이티브          engine-native/*.node 가 asar 밖(app.asar.unpacked)에 있다
 *   ③ 마스터 DB         resource/master.db 가 asar 밖에 있다
 *   ④ 새지 않는다       scripts/ · docs/ · resource/data/staging · balance 가 없다
 *   ⑤ 크기·파일 수      기록해 두고 다음 빌드와 비교한다
 * ```
 *
 * ⚠ `pack` 은 `npmRebuild` 로 네이티브를 다시 빌드한다 — **계측이 `.node` 를
 *   잡고 있으면 EPERM** 이다. 계측이 다 끝난 뒤에 돌린다.
 *
 *   npm run dist:steam          (pack → 이 검증)
 *   node scripts/dist-steam.cjs (검증만)
 */
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(process.cwd(), "release", "win-unpacked");
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };

if (!fs.existsSync(OUT)) {
  console.log(`🔴 산출물이 없다: ${OUT} — 먼저 npm run pack`);
  process.exit(1);
}

// ① 실행파일
const exe = fs.readdirSync(OUT).filter((f) => f.toLowerCase().endsWith(".exe"));
ok(exe.includes("OnePitch.exe"), `실행파일이 OnePitch.exe 가 아니다: ${exe.join(", ") || "(없음)"}`);

// ②③ asar 밖
const unpacked = path.join(OUT, "resources", "app.asar.unpacked");
ok(fs.existsSync(unpacked), "app.asar.unpacked 가 없다 — asarUnpack 설정을 봐라");
const nodeDir = path.join(unpacked, "packages", "engine-native");
const nodes = fs.existsSync(nodeDir) ? fs.readdirSync(nodeDir).filter((f) => f.endsWith(".node")) : [];
ok(nodes.length === 1, `.node 가 asar 밖에 정확히 하나여야 한다: ${nodes.join(", ") || "(없음)"}`);
ok(fs.existsSync(path.join(unpacked, "resource", "master.db")), "resource/master.db 가 asar 밖에 없다");

// ④ 새지 않는다 — 있으면 안 되는 것
for (const rel of ["scripts", "docs", "resource/data/staging", "resource/data/balance", "resource/data/master/entities/players"]) {
  const p = path.join(unpacked, rel);
  ok(!fs.existsSync(p), `디포에 새면 안 되는 폴더가 있다: ${rel}`);
}

// ⑤ 크기·파일 수
let files = 0, bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
walk(OUT);
const mb = (bytes / 1048576).toFixed(1);

console.log(`\n── Steam 디포 검증 (${OUT}) ──`);
console.log(`  실행파일  ${exe.join(", ")}`);
console.log(`  .node     ${nodes.join(", ") || "(없음)"}`);
console.log(`  파일 ${files.toLocaleString()} · ${mb} MB`);
if (fail.length) { console.log(`\n🔴 ${fail.length}건`); for (const f of fail) console.log(`  · ${f}`); process.exit(1); }
console.log("\nOK — 이 폴더를 그대로 디포로 올린다 (실행 경로 OnePitch.exe · Cloud 루트 WinAppDataRoaming/OnePitch/saves)");
