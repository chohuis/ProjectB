"use strict";
/**
 * 두 실행이 **어디서** 갈리는가 — `npm run check:determinism`
 *
 * 🔴 엔진에 `thread_rng`이 남아 있어 같은 씨앗도 실행마다 결과가 다르다.
 * 그 상태에서는 계측을 한 번 돌려 전후를 비교할 수 없고, 간헐 실패를
 * 회귀와 구분할 수 없다(`test:foreign`이 3회 중 1회 빨간불이었다).
 *
 * 최종 숫자만 비교하면 "다르다"만 알고 **어디서** 갈렸는지는 모른다.
 * 여기서는 같은 씨앗으로 두 번 돌리며 주마다 세계 요약을 찍어,
 * **처음 갈린 주와 계통**을 잡는다.
 *
 * ⚠ 계통을 나눠 본다 — 로스터·계약·부상·성적. 어느 쪽이 먼저 갈렸는지가
 * 원인을 가른다. 성적이 먼저면 경기, 부상이 먼저면 주간 판정이다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const WEEKS = arg("weeks", 60);
const SEED = arg("seed", 20260731);

async function runOnce(label) {
  const { app, tmp } = await headless.boot(`det-${label}`);
  const trail = [];
  try {
    // ⚠ **슬롯 ID를 같게 준다.** 다르게 주면 그게 씨앗에 섞여
        // 같은 세계도 다르게 나온다 — 저장소는 서로 다른 임시 폴더라 안 걹친다
        await app.boot({ slotId: "DET", worldSeed: SEED, seasonYear: 2026 });
    // ⚠ **생성 직후를 먼저 찍는다.** 첫 칸이 autoRun 뒤면 세계 생성이 갈린
    // 것인지 첫 주 처리가 갈린 것인지 구분이 안 된다
    trail.push({ tag: "생성직후", sum: app.worldChecksum(), rows: app.contractRows() });
    let guard = 0;
    const stallGuard = makeStallGuard();
    while (guard++ < WEEKS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        await app.seasonRollover();
        trail.push({ tag: `${s0} 롤오버`, sum: app.worldChecksum() });
        continue;
      }
      await app.autoRun();
      trail.push({ tag: `${s0} W${w0}`, sum: app.worldChecksum(), rows: app.contractRows(), rrows: app.rosterRows(), srows: app.standingsSnapshot() });
      // 한 바퀴 안 움직인 것은 정지 pending 을 민 정상 경로일 수 있다 — `perf/weekLoop.cjs` 머리말
      if (stallGuard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }
  } finally {
    await headless.cleanup(tmp);
  }
  return trail;
}

async function main() {
  const a = await runOnce("A");
  const b = await runOnce("B");

  console.log(`[결정성] 씨앗 ${SEED} · ${WEEKS}주 · A ${a.length}칸 / B ${b.length}칸\n`);
  const keys = ["roster", "contract", "injury", "standings", "staff", "n", "ns"];
  const n = Math.min(a.length, b.length);
  let firstBad = -1;
  for (let i = 0; i < n; i++) {
    const diff = keys.filter((k) => a[i].sum[k] !== b[i].sum[k]);
    if (diff.length) { firstBad = i; break; }
  }

  if (firstBad === -1 && a.length === b.length) {
    console.log(`  ok  ${n}칸이 전부 같다 — 재현된다`);
    process.exit(0);
  }
  if (firstBad === -1) {
    console.log(`  FAIL  값은 같은데 길이가 다르다 (A ${a.length} · B ${b.length})`);
    process.exit(1);
  }

  const i = firstBad;
  const diff = keys.filter((k) => a[i].sum[k] !== b[i].sum[k]);
  console.log(`  FAIL  처음 갈린 곳: ${a[i].tag} (${i + 1}번째 칸)`);
  console.log(`        갈린 계통: ${diff.join(" · ")}`);
  for (const k of keys) {
    const mark = diff.includes(k) ? " ←" : "";
    console.log(`          ${k.padEnd(10)} A ${a[i].sum[k]}  B ${b[i].sum[k]}${mark}`);
  }
  // 직전 칸까지는 같았다 — 그 사이에 도는 처리가 범인이다
  // 계약이 갈렸으면 **누가** 다른지 직접 본다 — 체크섬만으론 못 짚는다
  if (diff.includes("contract") && a[i].rows && b[i].rows) {
    const bad = [];
    for (let k = 0; k < Math.min(a[i].rows.length, b[i].rows.length); k++) {
      if (a[i].rows[k] !== b[i].rows[k]) bad.push([a[i].rows[k], b[i].rows[k]]);
      if (bad.length >= 5) break;
    }
    console.log("        다른 사람 (npcId|리그|연봉|계약연수|나이):");
    for (const [x, y] of bad) { console.log("          A " + x); console.log("          B " + y); }
    const lgs = {};
    for (let k = 0; k < Math.min(a[i].rows.length, b[i].rows.length); k++) {
      if (a[i].rows[k] === b[i].rows[k]) continue;
      const lg = a[i].rows[k].split("|")[1];
      lgs[lg] = (lgs[lg] ?? 0) + 1;
    }
    console.log("        리그별 차이 수: " + JSON.stringify(lgs));
  }
  if (diff.includes("roster") && a[i].rrows && b[i].rrows) {
    const bad = [];
    for (let k = 0; k < Math.min(a[i].rrows.length, b[i].rrows.length); k++) {
      if (a[i].rrows[k] !== b[i].rrows[k]) bad.push([a[i].rrows[k], b[i].rrows[k]]);
      if (bad.length >= 6) break;
    }
    console.log("        소속이 다른 사람 (npcId|팀|리그|상태):");
    for (const [x, y] of bad) { console.log("          A " + x); console.log("          B " + y); }
    let n2 = 0;
    for (let k = 0; k < Math.min(a[i].rrows.length, b[i].rrows.length); k++) if (a[i].rrows[k] !== b[i].rrows[k]) n2++;
    console.log("        소속 차이 총 " + n2 + "명");
  }
  if (diff.includes("standings") && a[i].srows && b[i].srows) {
    console.log("        순위 차이:");
    const mx = Math.max(a[i].srows.length, b[i].srows.length);
    let shown = 0;
    for (let k = 0; k < mx && shown < 8; k++) {
      const x = a[i].srows[k] ?? "(없음)", y = b[i].srows[k] ?? "(없음)";
      if (x !== y) { console.log("          A " + x); console.log("          B " + y); shown++; }
    }
    if (shown === 0) console.log("          (줄 단위로는 같다 — 순서만 다르다)");
  }
  if (i > 0) console.log(`        직전(${a[i - 1].tag})까지는 같았다`);
  else console.log(`        **첫 칸부터 다르다** — 세계 생성이나 첫 주 처리다`);
  process.exit(1);
}

main().catch((e) => { console.error("[check-determinism] 실패:", e); process.exit(1); });
