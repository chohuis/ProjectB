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
 *   ③ 마스터 데이터     resource/data/master/_manifest.json 이 asar 밖에 있다
 *   ④ 새지 않는다       scripts/ · docs/ · resource/data/staging · balance 가 없다
 *   ⑤ 크기·파일 수      기록해 두고 다음 빌드와 비교한다
 *
 * ⚠ ③ 은 2026-09-04 까지 `resource/master.db` 였다. 그 파일을 접으면서
 *   **같은 자리에서 같은 것을 지키도록** 대상을 목록 파일로 옮겼다 —
 *   `_manifest.json` 이 없으면 이벤트가 통째로 안 실린다(실제로 났던 결함).
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
ok(
  fs.existsSync(path.join(unpacked, "resource", "data", "master", "_manifest.json")),
  "resource/data/master/_manifest.json 이 asar 밖에 없다 — 이벤트·업적이 통째로 안 실린다",
);

// ④ 새지 않는다 — 있으면 안 되는 것
for (const rel of ["scripts", "docs", "resource/data/staging", "resource/data/balance", "resource/data/master/entities/players"]) {
  const p = path.join(unpacked, rel);
  ok(!fs.existsSync(p), `디포에 새면 안 되는 폴더가 있다: ${rel}`);
}

// ⑤ 크기·파일 수
let files = 0, bytes = 0;
// ── 메인 프로세스 상대 require 가 asar 안에 있는가 ─────────────────────────
// 🔴 2026-09-02: main.cjs:9 가 `../../dev-server.config.cjs` 를 요구하는데 build.files 에
//    저장소 루트 파일이 없어 asar 에 안 실렸다. 패키지 앱은 MODULE_NOT_FOUND 로
//    "Error" 대화상자만 띄운 채 서 있었고 stderr 는 비어 있었다 — 포트 정본을 한
//    파일로 모은 뒤(dev-server.config.cjs) 패키지 빌드가 한 번도 못 뜬 것이다.
//    파일 수·용량·누출로는 안 보인다. 실제 경로를 asar 목록과 대조한다.
{
  const asar = require("@electron/asar");
  const listed = new Set(asar.listPackage(path.join(OUT, "resources", "app.asar"))
    .map((e) => String(e).split("\\").join("/")));
  const has = (rel) => listed.has(rel) || fs.existsSync(path.join(unpacked, rel));
  const resolves = (rel) => [rel, rel + ".js", rel + ".cjs", rel + "/index.js", rel + "/package.json"].some(has);
  const srcRoot = path.join(process.cwd(), "apps", "desktop");
  const cjsFiles = [];
  const collect = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) collect(q); else if (e.name.endsWith(".cjs")) cjsFiles.push(q); } };
  collect(srcRoot);
  let checked = 0;
  for (const f of cjsFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const piece of src.split('require("').slice(1)) {
      const target = piece.slice(0, piece.indexOf('"'));
      if (!target.startsWith(".")) continue;
      checked++;
      const abs = path.resolve(path.dirname(f), target);
      const rel = "/" + path.relative(process.cwd(), abs).split("\\").join("/");
      ok(resolves(rel), `메인 프로세스 require 가 asar 에 없다: ${path.relative(process.cwd(), f)} → ${target} (${rel}) — build.files 를 본다`);
    }
  }
  console.log(`  require   상대 경로 ${checked}건 대조`);
}

const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; } } };
walk(OUT);
const mb = (bytes / 1048576).toFixed(1);

console.log(`\n── Steam 디포 검증 (${OUT}) ──`);
console.log(`  실행파일  ${exe.join(", ")}`);
console.log(`  .node     ${nodes.join(", ") || "(없음)"}`);
console.log(`  파일 ${files.toLocaleString()} · ${mb} MB`);
if (fail.length) { console.log(`\n🔴 ${fail.length}건`); for (const f of fail) console.log(`  · ${f}`); process.exit(1); }
console.log("\nOK — 이 폴더를 그대로 디포로 올린다 (실행 경로 OnePitch.exe · Cloud 루트 WinAppDataRoaming/OnePitch/saves)");
