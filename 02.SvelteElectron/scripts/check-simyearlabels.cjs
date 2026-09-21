#!/usr/bin/env node
// 워커(`probe-a-simrun-worker.cjs`)의 연도 라벨 — **한 해 한 줄**을 실제
// 엔진으로 다진다.
//
//   npm run check:simyearlabels
//
// 🔴 왜 있나 (2026-09-21). 24판(2026-09-20)에서 「못 접은 해」51건·「같은
// 해가 두 줄」5건이 실측됐다 — 값은 진짜인데 라벨이 어긋났다. 원인은
// `probe-a-simrun-worker.cjs` 가 연도 라벨로 엔진의 `seasonYear` 를 그대로
// 찍은 것이었다: 드래프트·진학·독립·입대는 `isSeasonEnded()` 를 안 거치고
// 시즌을 직접 열어 그 해가 통째로 안 접혔고(①), 군 전역은 `isSeasonEnded()`
// 가 두 번 참이 되는데 그 사이 `seasonYear` 가 안 늘어 같은 라벨이 두 번
// 찍혔다(②). 고친 뒤에는 라벨이 엔진 값이 아니라 "우리가 접은 줄 수"다 —
// 이 검사는 그 불변식을 씨앗 하나로 다진다.
//
// 못 박는 것:
//   ① 씨앗 777 · safe · power · 6시즌은 실측(2026-09-20 24판 #17)으로 확인된
//     「군 전역 직후 같은 해 두 번」 재현 씨앗이다 — 이 판이 실제로 무대
//     갈림(「A→B」로 적히는 줄)을 하나 이상 낸다(안 나면 이 검사 자체가
//     아무것도 못 본 것이다 — 안 잰 것은 초록이 아니다).
//   ② `불완전` 플래그가 붙은 줄이 하나도 없다(예전 필러가 다시 안 생긴다).
//   ③ `연도` 값에 중복이 없다(예전엔 전역 뒤 같은 해가 두 번 찍혔다).
//   ④ `연도` 값이 첫 줄부터 빈틈없이 1씩 늘어난다(줄이 통째로 빠지지 않는다
//     — 예전 필러가 메우던 그 갭).
//
// 판 하나가 실제 엔진으로 몇 분 걸린다 — `test:v3` 밖에 둔다(다른 계측
// 검사와 같다).

const path = require("node:path");
const { spawn } = require("node:child_process");

const SEED = 777, PERSONA = "safe", PRESET = "power", SEASONS = 6;
const MARK = "SIMRUN_JSON ";
const TIMEOUT_MS = Number(process.env.PB_CHECK_TIMEOUT_MS || 20 * 60 * 1000);

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name}`);
  if (detail) log(`        ${detail}`);
}

function runWorker() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-a-simrun-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DRIVE_USER_DATA: "1",
        PF_SEED: String(SEED), PB_SEASONS: String(SEASONS),
        PB_PERSONA: PERSONA, PB_START_PRESET: PRESET, PB_RUN_NO: "1" },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      if (!line) return reject(new Error(`SIMRUN_JSON 을 못 받았다\n-- stderr --\n${err.slice(-1500)}\n-- stdout --\n${out.slice(-800)}`));
      resolve(JSON.parse(line.slice(MARK.length)));
    });
  });
}

(async () => {
  log(`씨앗 ${SEED} · ${PERSONA}/${PRESET} · ${SEASONS}시즌 — 실제 엔진으로 돌린다(몇 분 걸린다)`);
  const report = await runWorker();
  const ys = report.해마다 ?? [];

  check("해마다 줄이 있다", ys.length > 0, `줄 수 ${ys.length}`);

  const 무대갈림 = ys.filter((y) => String(y.무대).includes("→"));
  check("무대 갈림 해가 「A→B」 한 줄로 났다(픽스처가 실제로 걸렸다)", 무대갈림.length > 0,
    `무대: ${ys.map((y) => y.무대).join(" / ")}`);

  const 불완전 = ys.filter((y) => y.불완전);
  check("`불완전` 필러가 없다", 불완전.length === 0,
    `불완전 줄 ${불완전.length}개 — 연도 ${불완전.map((y) => y.연도).join(",")}`);

  const 연도들 = ys.map((y) => y.연도);
  const 중복 = 연도들.length - new Set(연도들).size;
  check("같은 연도가 두 줄로 안 찍힌다", 중복 === 0, `중복 ${중복}건 — 연도 ${연도들.join(",")}`);

  const 빈틈없음 = ys.every((y, i) => i === 0 || y.연도 === ys[i - 1].연도 + 1);
  check("연도가 첫 줄부터 빈틈없이 1씩 늘어난다", 빈틈없음, `연도 ${연도들.join(",")}`);

  log("");
  if (failed) { log(`🔴 ${failed}건 실패`); process.exit(1); }
  log("전부 통과");
})().catch((e) => { console.error("[check-simyearlabels] 예외", e && e.stack || e); process.exit(1); });
