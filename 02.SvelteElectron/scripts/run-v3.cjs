"use strict";
/**
 * `test:v3` 실행기 — **전부 돌리고 나서 실패를 모아 보고한다.**
 *
 * 🔴 예전엔 `npm run a && npm run b && ...` 29단계였다. `&&` 는 첫 실패에서
 *   멈추므로 **한 건이 빨강이면 뒤 24개가 아예 안 돌았다.** 2026-09-05 D 회귀가
 *   그 상태였다 — `test:rostergen` 하나가 나자 그 뒤 검사들의 상태를 아무도
 *   몰랐고, 다음 판에서 또 가려질 자리였다.
 *
 * 여기서는 **전부 돌린다.** 실패해도 다음으로 넘어가고, 끝에 실패 목록과
 * 단계별 소요를 표로 낸다. 종료 코드는 하나라도 실패하면 1이다.
 *
 * 실행:
 *   npm run test:v3                 전부
 *   npm run test:v3 -- --only rostergen,campus     이름에 걸리는 것만
 *   npm run test:v3 -- --bail       옛 동작 (첫 실패에서 멈춘다)
 *
 * ⚠ 단계 목록의 정본은 **여기**다. package.json 의 `test:v3` 는 이 파일을
 *   부르기만 한다 — 두 군데에 적으면 한쪽만 고쳐진 채 남는다.
 */
const { spawnSync } = require("node:child_process");

/** 순서가 의미를 갖는다 — 세이브 스키마 → 생성 → 시즌 → 시즌 밖 순이다 */
const STEPS = [
  "check:savecolumns", "test:migration", "test:slotdb", "test:rostergen",
  "test:newgame", "test:draftpool", "test:regional", "test:tournament",
  "test:groupstage", "test:survival", "test:propo", "test:pitchrules",
  "test:staffgen", "test:stafflife", "test:career", "test:teamhistory",
  "test:relationship", "test:releasescope", "test:draft", "test:promotion",
  "test:military", "test:fa", "test:staff", "test:injury", "test:finance",
  "test:sentencebank", "test:campus", "test:savebatch", "test:growth",
];

const argv = process.argv.slice(2);
const bail = argv.includes("--bail");
const onlyArg = argv[argv.indexOf("--only") + 1];
const only = argv.includes("--only") && onlyArg
  ? onlyArg.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

const steps = only
  ? STEPS.filter((s) => only.some((o) => s.includes(o)))
  : STEPS;

if (steps.length === 0) {
  console.error(`[test:v3] --only ${onlyArg} 에 걸리는 단계가 없다`);
  process.exit(2);
}

// ⚠ 윈도우에서 `npm.cmd` 는 **`shell: true` 없이는 안 뜬다** — Node 20 이
//   `.cmd` 직접 실행을 막아 `EINVAL` 이 난다(실측). 단계 이름은 우리가 쥔
//   상수라 셸에 넘겨도 끼어들 문자가 없다
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";
const results = [];

console.log(`\n[test:v3] ${steps.length}단계 — 전부 돌린 뒤 실패를 모아 보고한다` +
  `${bail ? " (--bail: 첫 실패에서 멈춘다)" : ""}\n`);

for (let i = 0; i < steps.length; i++) {
  const name = steps[i];
  const head = `[${String(i + 1).padStart(2)}/${steps.length}] ${name}`;
  console.log(`\n${"─".repeat(66)}\n${head}\n${"─".repeat(66)}`);
  const t0 = Date.now();
  // ⚠ stdio: "inherit" — 각 단계의 출력을 그대로 흘린다. 삼키면 어느 검사가
  //   왜 났는지 다시 돌려야 한다
  const r = spawnSync(npm, ["run", name], { stdio: "inherit", shell: isWin });
  const ms = Date.now() - t0;
  const code = r.status ?? (r.error ? -1 : 0);
  results.push({ name, code, ms, err: r.error?.message ?? null });
  if (code !== 0 && bail) break;
}

const failed = results.filter((r) => r.code !== 0);
const total = results.reduce((a, r) => a + r.ms, 0);

console.log(`\n${"═".repeat(66)}`);
console.log(`[test:v3] ${results.length}단계 · ${(total / 1000).toFixed(1)}초 · ` +
  `초록 ${results.length - failed.length} · 빨강 ${failed.length}`);
console.log("═".repeat(66));
for (const r of results) {
  console.log(`  ${r.code === 0 ? "ok  " : "FAIL"} ${r.name.padEnd(22)} ` +
    `${String((r.ms / 1000).toFixed(1)).padStart(6)}s` +
    `${r.code === 0 ? "" : `  (exit ${r.code}${r.err ? ` · ${r.err}` : ""})`}`);
}
if (only) console.log(`\n⚠ --only ${onlyArg} — ${STEPS.length}단계 중 ${steps.length}개만 돌렸다`);
if (bail && failed.length > 0 && results.length < steps.length) {
  console.log(`\n⚠ --bail 로 멈췄다 — ${steps.length - results.length}단계가 안 돌았다`);
}
if (failed.length > 0) {
  console.log(`\n빨강 ${failed.length}건: ${failed.map((f) => f.name).join(" · ")}`);
}
process.exit(failed.length > 0 ? 1 : 0);
