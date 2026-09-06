"use strict";
/**
 * A 세션 계측 — **슬롯 배수**(결정 ⑤ · 1.0.1 단계 1).
 *
 * `growth_engine.rs SLOT_MULTS` 가 (XP배수, 피로배수) = 주 (2.5, 1.0) ·
 * 보조1 (1.5, 0.5) · 보조2 (1.0, 0.5) 였다. **피로 1당 XP** 는 프로그램 항이
 * 약분돼 슬롯항만 남는다 — `xp_mult / fat_mult` = 주 2.50 · 보조1 3.00 ·
 * 보조2 2.00 이라 **주 슬롯이 최적이 아니었다.** 코드 주석이 "의도인지
 * 미확정"이라 적어 두었다(`docs/design/training.md §3-7`).
 *
 * 재는 것 셋:
 *   A. **한 주 한계효율** — 같은 상태에서 슬롯만 바꿔 한 주. 이게 결정적이다
 *      (여러 주를 돌리면 피로가 0·100 에 붙어 궤적이 갈려 비교가 오염된다).
 *   B. **기본 훈련 3년** — 성장 총량이 얼마나 흔들리는지(전후 비교용).
 *   C. **주 몰빵 대 보조1 몰빵 3년** — 어느 쪽이 실제로 이득인가.
 *
 * ⚠ 엔진 `.node` 를 그대로 부른다(게임 부팅 없음) — electron 이 필요 없다.
 *
 *   node scripts/probe-a-slotmult.cjs
 */
const path = require("node:path");
const fs = require("node:fs");

const ROOT = process.cwd();
const engine = require(path.join(ROOT, "packages/engine-native"));
const PROGRAMS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "resource/data/master/training/programs.json"), "utf8")).programs;

const PITCH0 = {
  velocity: 55, command: 55, control: 55, movement: 45, stamina: 50,
  mentality: 50, recovery: 50, clutch: 45, holdRunners: 45, ovr: 0,
};
const BAT0 = {
  contact: 30, power: 30, eye: 30, discipline: 30, speed: 40, baseInstinct: 30,
  bunting: 30, platoon: 30, fielding: 35, arm: 40, battingClutch: 30, ovr: 0,
};
const STAT_KEYS = ["velocity", "command", "control", "movement", "stamina",
  "mentality", "recovery", "clutch", "holdRunners"];
const sumStats = (p) => STAT_KEYS.reduce((a, k) => a + (p[k] ?? 0), 0);

// XP 문턱 — `growth_engine.rs xp_threshold` 와 같은 식. **레벨 단위로만 보면
// 해상도가 굵어서** 한 주 차이가 반올림에 묻힌다. 올린 레벨마다 들어간
// 문턱을 되짚어 **투입 XP 총량**으로 잰다.
const xpThreshold = (v) => 7.5 + v * 0.35;
function investedXp(p0, p1, xpMap) {
  let total = 0;
  for (const k of STAT_KEYS) {
    for (let v = p0[k]; v < p1[k]; v++) total += xpThreshold(v);
    total += xpMap[k] ?? 0;
  }
  return total;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

const planOf = (primary, s1, s2) => ({
  primaryProgramId: primary ?? null, secondaryProgramId: s1 ?? null,
  secondary2ProgramId: s2 ?? null, recoveryProgramId: null,
});

function week(state, plan) {
  const raw = engine.calcTrainingGrowthNative(JSON.stringify({
    protagonist: {
      // ⚠ `developmentRate` 는 62 가 기준선이다(`week_xp` 의 `dev_rate/62.0`).
      //   1.0 을 넣으면 XP 가 1/62 로 떨어져 52주에 스탯이 하나도 안 오른다
      condition: state.condition, fatigue: state.fatigue,
      developmentRate: 62, diligence: 60, age: 17, potentialHidden: 80,
      pitching: state.pitching, batting: state.batting,
      pitchingXP: state.pitchingXP, battingXP: state.battingXP,
      pitches: [{ id: "FASTBALL", grade: 2 }], playerType: "pitcher", morale: 60,
    },
    plan, efficiencyMod: 1.0, programs: PROGRAMS,
  }));
  const r = JSON.parse(raw);
  if (r.error) throw new Error(r.error);
  const q = r.protagonistPatch;
  return {
    pitching: q.pitching, batting: q.batting,
    pitchingXP: q.pitchingXP, battingXP: q.battingXP,
    fatigue: q.fatigue, condition: q.condition,
  };
}

const fresh = () => ({
  pitching: { ...PITCH0 }, batting: { ...BAT0 },
  pitchingXP: {}, battingXP: {}, fatigue: 20, condition: 80,
});

// ── A. 한 주 한계효율 ────────────────────────────────────────────
// 같은 상태에서 슬롯만 바꿔 한 주. 주간 자동 회복(−5)은 셋 다 같으므로
// 훈련이 얹은 순부하는 `Δ피로 + 5` 다. 피로 20 에서 시작하니 0·100 에
// 안 붙는다 — 궤적 오염이 없다.
console.log("── A. 한 주 한계효율 (피로 20 · 컨디션 80 에서 한 주) ──");
console.log("프로그램        슬롯     투입XP  피로부하  XP/피로  컨디션부하");
for (const prog of ["TRN_VEL", "TRN_CTRL_CMD", "TRN_STAMINA"]) {
  const rows = [];
  for (const [slot, plan] of [["주", planOf(prog)], ["보조1", planOf(null, prog)], ["보조2", planOf(null, null, prog)]]) {
    const s0 = fresh();
    const s1 = week(s0, plan);
    const xp = investedXp(s0.pitching, s1.pitching, s1.pitchingXP);
    const load = (s1.fatigue - s0.fatigue) + 5;
    const condLoad = s0.condition - s1.condition + 5;  // 자동 회복 +5 (피로<60)
    rows.push({ slot, xp: r1(xp), load: r1(load), per: r3(xp / load), condLoad: r1(condLoad) });
  }
  for (const r of rows) {
    console.log(`${prog.padEnd(16)}${r.slot.padEnd(8)}${String(r.xp).padStart(7)}`
      + `${String(r.load).padStart(10)}${String(r.per).padStart(9)}${String(r.condLoad).padStart(12)}`);
  }
  const best = rows.reduce((a, b) => (b.per > a.per ? b : a));
  console.log(`${" ".repeat(16)}→ 최적 ${best.slot} (${best.per})`
    + (best.slot === "주" ? "  ✅" : "  ❌ 주 슬롯이 최적이 아니다"));
  if (best.slot !== "주") process.exitCode = 1;
}

// ── B·C. 고교 3년(156주) ─────────────────────────────────────────
function runYears(plan, weeks = 156) {
  let s = fresh();
  for (let w = 0; w < weeks; w++) s = week(s, plan);
  return {
    ovr: s.pitching.ovr, statSum: sumStats(s.pitching) - sumStats(PITCH0),
    xp: r1(investedXp(PITCH0, s.pitching, s.pitchingXP)),
    fatigue: r1(s.fatigue), condition: r1(s.condition),
  };
}

console.log("");
console.log("── B·C. 고교 3년(156주) 성장 ──");
console.log("계획                                  OVR  스탯합  투입XP  끝피로  끝컨디션");
const PLANS = [
  ["기본 훈련(주 제구·보조1 구속·보조2 회복)", planOf("TRN_CTRL_CMD", "TRN_VEL", "TRN_RECOVERY")],
  ["주 몰빵(제구만)",                          planOf("TRN_CTRL_CMD")],
  ["보조1 몰빵(제구만)",                       planOf(null, "TRN_CTRL_CMD")],
  ["세 칸 다 채움(제구·구속·체력)",            planOf("TRN_CTRL_CMD", "TRN_VEL", "TRN_STAMINA")],
];
for (const [label, plan] of PLANS) {
  const r = runYears(plan);
  console.log(`${label.padEnd(38)}${String(r.ovr).padStart(5)}${String(r.statSum).padStart(8)}`
    + `${String(r.xp).padStart(8)}${String(r.fatigue).padStart(8)}${String(r.condition).padStart(10)}`);
}
