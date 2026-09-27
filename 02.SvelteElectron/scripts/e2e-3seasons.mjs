"use strict";
/**
 * `npm run e2e:3seasons` — `scripts/e2e-3seasons.txt` 를 `drive.mjs` 로 돌리고 시간을 잰다
 * (2026-09-27 · D · PLAN_103 Ⅲ).
 *
 * 🔴 **`DRIVE_USER_DATA` 를 고정 폴더로 만들어야 한다.** 그 값이 "1"이면
 * `drive.mjs`의 `launch`가 매번 **새** 임시 폴더를 판다(`fs.mkdtempSync`) —
 * 대본 안에서 `quit` 뒤 다시 `launch`(재시작 확인)를 하므로, 그러면 이어하기가
 * 방금 만든 세이브가 아니라 빈 폴더를 본다. 여기서 한 번 만들어 두 번째
 * `launch`도 같은 폴더를 보게 고정한다.
 *
 *   DRIVE_EXE=release/win-unpacked/OnePitch.exe npm run e2e:3seasons   # 패키지(기본값 — 있으면 이쪽)
 *   VITE_DEV_SERVER_URL=http://localhost:5174 npm run e2e:3seasons    # dev 서버가 이미 떠 있을 때
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIVE_MJS = path.join(APP_DIR, "scripts/drive.mjs");
const SCRIPT = process.argv[2] ?? path.join(APP_DIR, "scripts/e2e-3seasons.txt");

const udd = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-3seasons-"));

// `DRIVE_EXE`를 안 줬으면 `release/win-unpacked/OnePitch.exe`가 있는지 본다 —
// 있으면 패키지(더 안정적 · dev 서버 불필요), 없으면 dev 빌드(`VITE_DEV_SERVER_URL`
// 필요 · 호출부가 미리 `npm run dev:ui`를 띄워 둬야 한다).
const defaultExe = path.join(APP_DIR, "release/win-unpacked/OnePitch.exe");
const exeArg = process.env.DRIVE_EXE
  ? path.resolve(APP_DIR, process.env.DRIVE_EXE)
  : (fs.existsSync(defaultExe) ? defaultExe : null);

console.log(`[e2e:3seasons] user-data → ${udd}`);
console.log(`[e2e:3seasons] ${exeArg ? "packaged: " + path.relative(APP_DIR, exeArg) : "dev 빌드 — VITE_DEV_SERVER_URL 필요(기본 http://localhost:5174)"}`);
console.log(`[e2e:3seasons] 대본 → ${path.relative(APP_DIR, SCRIPT)}`);

const env = { ...process.env, DRIVE_USER_DATA: udd };
if (exeArg) env.DRIVE_EXE = path.relative(APP_DIR, exeArg);
delete env.ELECTRON_RUN_AS_NODE;

const t0 = Date.now();
const child = spawn(process.execPath, [DRIVE_MJS, SCRIPT], { cwd: APP_DIR, env, stdio: "inherit" });
child.on("close", (code, signal) => {
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n[e2e:3seasons] ${code === 0 ? "OK" : `FAIL(code=${code}${signal ? ",signal=" + signal : ""})`} · ${min}분 · user-data ${udd}`);
  process.exit(code ?? 1);
});
