"use strict";
// R3b 합성 주간 성적 생성기 검증 — 결정성·결장 비율·10시즌 분포 안정성
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-synthetic-trajectory.cjs
const engine = require("../packages/engine-native");
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const call = (p) => JSON.parse(engine.syntheticWeeklyPerfNative(JSON.stringify(p)));

// 샘플 NPC: OVR 40~90, 투수/타자 섞어서
const OVRS = [40, 50, 60, 70, 80, 90];
const npcs = [];
for (const ovr of OVRS) {
  npcs.push({ npcId: `PLY_P_${ovr}`, ovr, playerType: "pitcher" });
  npcs.push({ npcId: `PLY_B_${ovr}`, ovr, playerType: "batter" });
}

// ── 1. 결정성 ─────────────────────────────────────────────────
const r1 = call({ worldSeed: 42, seasonYear: 2026, week: 10, npcs });
const r2 = call({ worldSeed: 42, seasonYear: 2026, week: 10, npcs });
check("결정성: 동일 입력 = 동일 출력", JSON.stringify(r1) === JSON.stringify(r2));

const r3 = call({ worldSeed: 43, seasonYear: 2026, week: 10, npcs });
check("결정성: 다른 worldSeed = 다른 결과", JSON.stringify(r1) !== JSON.stringify(r3));

const r4 = call({ worldSeed: 42, seasonYear: 2027, week: 10, npcs });
check("결정성: 다른 seasonYear = 다른 결과", JSON.stringify(r1) !== JSON.stringify(r4));

// ── 2. 출력 형태 ──────────────────────────────────────────────
check("결과 개수 일치", r1.results.length === npcs.length, `got ${r1.results.length}`);
check("투수는 era만, 타자는 battingAvg만 (결장 아닐 때)", r1.results.every((res) => {
  if (res.missed) return res.era === undefined && res.battingAvg === undefined;
  const isPitcher = res.npcId.startsWith("PLY_P_");
  return isPitcher ? (res.era !== undefined && res.battingAvg === undefined)
                    : (res.battingAvg !== undefined && res.era === undefined);
}));

// ── 3. OVR과 성적의 상관관계 (여러 주 평균으로 노이즈 상쇄) ──────
function seasonAvg(npcId, ovr, playerType, seasonYear) {
  const key = playerType === "pitcher" ? "era" : "battingAvg";
  let sum = 0, n = 0;
  for (let week = 1; week <= 52; week++) {
    const res = call({ worldSeed: 42, seasonYear, week, npcs: [{ npcId, ovr, playerType }] }).results[0];
    if (res.missed) continue;
    sum += res[key];
    n++;
  }
  return { avg: n > 0 ? sum / n : null, gamesPlayed: n };
}

const pitcherAvgs = OVRS.map((ovr) => seasonAvg(`PLY_P_${ovr}`, ovr, "pitcher", 2026));
check(
  "투수: OVR 높을수록 시즌 평균 ERA 낮음(단조 감소)",
  pitcherAvgs.every((v, i) => i === 0 || v.avg <= pitcherAvgs[i - 1].avg),
  JSON.stringify(pitcherAvgs.map(v => v.avg?.toFixed(2))),
);

const batterAvgs = OVRS.map((ovr) => seasonAvg(`PLY_B_${ovr}`, ovr, "batter", 2026));
check(
  "타자: OVR 높을수록 시즌 평균 AVG 높음(단조 증가)",
  batterAvgs.every((v, i) => i === 0 || v.avg >= batterAvgs[i - 1].avg),
  JSON.stringify(batterAvgs.map(v => v.avg?.toFixed(3))),
);

// ── 4. 결장 비율 — 70~100% 출전(즉 결장 0~30%) ───────────────────
const gpRatio = pitcherAvgs.concat(batterAvgs).map(v => v.gamesPlayed / 52);
check(
  "결장 비율 합리적 범위 (출전 70~100%)",
  gpRatio.every(r => r >= 0.70 && r <= 1.0),
  JSON.stringify(gpRatio.map(r => (r * 100).toFixed(0) + "%")),
);

// ── 5. 10시즌 분포 안정성 — OVR 60 투수/타자의 시즌 평균이 10시즌에 걸쳐 크게 안 흔들리는지 ──
const tenSeasonPitcher = [];
const tenSeasonBatter = [];
for (let y = 2026; y < 2036; y++) {
  tenSeasonPitcher.push(seasonAvg("PLY_P_60", 60, "pitcher", y).avg);
  tenSeasonBatter.push(seasonAvg("PLY_B_60", 60, "batter", y).avg);
}
function stddev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return { mean, sd: Math.sqrt(variance) };
}
const pStat = stddev(tenSeasonPitcher);
const bStat = stddev(tenSeasonBatter);
check(
  "10시즌 분포 안정성 — 투수 ERA 표준편차 < 0.5",
  pStat.sd < 0.5,
  `mean=${pStat.mean.toFixed(2)} sd=${pStat.sd.toFixed(3)}`,
);
check(
  "10시즌 분포 안정성 — 타자 AVG 표준편차 < 0.03",
  bStat.sd < 0.03,
  `mean=${bStat.mean.toFixed(3)} sd=${bStat.sd.toFixed(4)}`,
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
