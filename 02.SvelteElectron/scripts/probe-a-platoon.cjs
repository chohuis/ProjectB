"use strict";
/**
 * A 계측 — **좌우 상성(플래툰 · 결정 ⑫) 전후.**
 * (2026-09-28 · 정본 `docs/SIM_103_CLUTCH_PLATOON_2026-09-28.md §2`)
 *
 *   node scripts/probe-a-platoon.cjs            (= npm run probe:a:platoon)
 *   node scripts/probe-a-platoon.cjs --games 300
 *
 * 🔴 **한 프로세스에서 전후가 다 돈다.** Rust 가 매 투구마다
 *   `std::env::var("PB_PLATOON")` 을 읽는다(`tuning.rs platoon_mode` ·
 *   `PB_TEMPO`·`PB_COURSE`·`PB_BATTER_READ` 와 같은 자리).
 *
 *     끔(전)  PB_PLATOON=0  ← 결정 ⑫ 이전과 **완전히 같다**(계수만 0 이 된다)
 *     켬(후)  PB_PLATOON=1
 *
 * ── 표 둘 ────────────────────────────────────────────────────────────────
 *
 *   ① **조합별** — 좌/우 투수 × 좌/우 타자 아홉. 「좌투 vs 좌타」가 타자에게
 *      제일 가혹해야 하고 반대 손 조합이 타자에게 유리해야 한다.
 *   ② 🔴 **리그 혼합 — 이게 관문이다.** 인구 비율(`lefty_ratio` · 투수 30% 좌 ·
 *      타자 35% 좌)대로 섞으면 **전후 피안타율이 안 움직여야** 한다. 움직이면
 *      계수의 평균이 0 이 아니라는 뜻이고, 그러면 「좌우 상성」을 넣는 것이
 *      **리그 난이도까지 같이 움직이는** 두 변수가 된다.
 *
 * ⚠ **라인업에 `id` 를 넣는다** — 없으면 주자 신원이 없어 기록이 안 쌓인다
 *   (`probe-a-clutchhold.cjs` 머리말 함정 ①).
 * ⚠ 표 ①의 타자 아홉은 **손이 전부 같다**(순수한 조합을 보려고). 표 ②만
 *   인구 비율대로 섞는다.
 * ⚠ **`ELECTRON_RUN_AS_NODE` 가 필요 없다** — 맨 node 가 엔진을 바로 읽는다.
 */
const path = require("node:path");
const engine = require(path.join(process.cwd(), "packages/engine-native"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const GAMES = arg("games", 300);
const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => Number(s.trim()));
const OVR = arg("ovr", 60);

/** 좌타 비율 — Rust `tuning::lefty_ratio(false)` 와 같은 값이어야 한다 */
const LEFTY_BAT = 0.35;

function pitcherOf(hand) {
  return {
    velocity: OVR, movement: OVR, command: OVR, control: OVR,
    staminaCap: 100, mentalResil: OVR, clutch: 50, holdRunners: 50,
    handedness: hand,
    arsenal: [
      { type: "fastball", grade: 3 }, { type: "slider", grade: 3 },
      { type: "curve", grade: 2 }, { type: "changeup", grade: 2 },
    ],
  };
}

/**
 * `hands` 가 문자열 하나면 아홉 명 다 그 손, 배열이면 그 순서대로.
 * ⚠ 능력치는 전부 같다 — 손만 바꾼다.
 */
function lineupOf(prefix, hands) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`,
    contact: OVR, power: OVR, eye: OVR, discipline: OVR,
    battingClutch: OVR, platoon: 50,
    handedness: Array.isArray(hands) ? hands[i] : hands,
    speed: OVR, baseInstinct: OVR, bunting: OVR,
    fielding: OVR, arm: OVR,
  }));
}

/** 인구 비율대로 섞은 아홉 — 35% 면 아홉 중 셋(1·4·7번)이 좌타다 */
const MIXED = Array.from({ length: 9 }, (_, i) => (i % 3 === 1 ? "L" : "R"));

function runArm(pitcherHand, batHands) {
  const t = { ab: 0, h: 0, k: 0, bb: 0, outs: 0, runs: 0, games: 0 };
  for (const seed of SEEDS) {
    for (let i = 0; i < GAMES; i++) {
      const st = JSON.parse(engine.startMatchNative(JSON.stringify({
        leagueId: "LEAGUE_KBL", protagonistSide: "home", role: "SP",
        inningLimit: 9, extraInningLimit: 9, batterMean: OVR,
        homeLineup: lineupOf("HM", "R"), awayLineup: lineupOf("AW", batHands),
        initialStamina: 100, initialMental: 100, pitchLimitOverride: 400,
        weather: "sunny", park: "neutral",
        protagonistPitcher: pitcherOf(pitcherHand), seed: seed + i,
      })));
      if (st.error) throw new Error(`startMatch: ${st.error}`);
      const fin = JSON.parse(engine.simToGameEnd(JSON.stringify(st)));
      if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);
      for (const b of fin.awayBatLines ?? []) { t.ab += b.ab ?? 0; t.h += b.h ?? 0; }
      t.k += fin.kSinceEntry ?? 0; t.bb += fin.bbSinceEntry ?? 0;
      t.outs += fin.outsSinceEntry ?? 0;
      t.runs += fin.score?.away ?? 0;
      t.games++;
    }
  }
  const ip = t.outs / 3;
  return {
    피안타율: t.ab > 0 ? t.h / t.ab : null,
    실점9: t.games ? t.runs / t.games : null,
    삼진9: ip > 0 ? (t.k * 9) / ip : null,
    볼넷9: ip > 0 ? (t.bb * 9) / ip : null,
    타수: t.ab,
  };
}

const f2 = (v) => (v === null ? "  —  " : v.toFixed(2));
const f3 = (v) => (v === null ? "  —  " : v.toFixed(3));
const d3 = (a, b) => (a === null || b === null ? "—" : (a - b >= 0 ? "+" : "") + (a - b).toFixed(3));

const COMBOS = [
  { key: "우투 vs 우타", p: "R", b: "R" },
  { key: "우투 vs 좌타", p: "R", b: "L" },
  { key: "좌투 vs 우타", p: "L", b: "R" },
  { key: "좌투 vs 좌타", p: "L", b: "L" },
];

(() => {
  const N = SEEDS.length * GAMES;
  console.log("");
  console.log(`── ⑫ 좌우 상성 전후 — 리그 경기 경로 · 씨앗 ${SEEDS.join("/")} × ${GAMES} = ${N}경기/칸 ──`);
  console.log(`   투수·타자 전부 OVR ${OVR} · 9이닝 · 중립 구장 · 손만 바꾼다`);
  console.log("");

  // ① 조합별
  const rows = [];
  for (const c of COMBOS) {
    process.env.PB_PLATOON = "0";
    const off = runArm(c.p, c.b);
    process.env.PB_PLATOON = "1";
    const on = runArm(c.p, c.b);
    rows.push({ ...c, off, on });
  }
  console.log("[① 조합별]  (+ 면 타자에게 나빠졌다 = 투수 유리)");
  console.log("  조합            피안타율 전 → 후      차      실점9 전 → 후     차      삼진9 후");
  for (const r of rows) {
    console.log(`  ${r.key}     ${f3(r.off.피안타율)} → ${f3(r.on.피안타율)}   ${d3(r.on.피안타율, r.off.피안타율).padStart(7)}` +
      `   ${f2(r.off.실점9)} → ${f2(r.on.실점9)}   ${d3(r.on.실점9, r.off.실점9).padStart(7)}   ${f2(r.on.삼진9).padStart(6)}`);
  }
  console.log("");

  // ② 리그 혼합 — 관문
  const mix = [];
  for (const ph of ["R", "L"]) {
    process.env.PB_PLATOON = "0";
    const off = runArm(ph, MIXED);
    process.env.PB_PLATOON = "1";
    const on = runArm(ph, MIXED);
    mix.push({ ph, off, on });
  }
  console.log("[② 리그 혼합 — 🔴 관문]  타자 아홉을 인구 비율(좌 3/9)대로 섞는다");
  console.log("  투수손   피안타율 전 → 후      차      실점9 전 → 후     차");
  for (const m of mix) {
    console.log(`  ${m.ph === "L" ? "좌투" : "우투"}      ${f3(m.off.피안타율)} → ${f3(m.on.피안타율)}   ${d3(m.on.피안타율, m.off.피안타율).padStart(7)}` +
      `   ${f2(m.off.실점9)} → ${f2(m.on.실점9)}   ${d3(m.on.실점9, m.off.실점9).padStart(7)}`);
  }
  // 투수까지 인구 비율(좌 30%)로 가중한 리그 평균
  const w = (sel) => 0.70 * sel(mix[0]) + 0.30 * sel(mix[1]);
  const offAvg = w((m) => m.off.피안타율), onAvg = w((m) => m.on.피안타율);
  const offRun = w((m) => m.off.실점9),   onRun = w((m) => m.on.실점9);
  console.log("");
  console.log(`  🔴 **투수 손까지 인구 가중(좌 30%)한 리그 평균**`);
  console.log(`     피안타율 ${f3(offAvg)} → ${f3(onAvg)}   차 ${d3(onAvg, offAvg)}`);
  console.log(`     실점9    ${f2(offRun)} → ${f2(onRun)}   차 ${d3(onRun, offRun)}`);
  console.log("");
  console.log("  ⚠ 이 차가 잡음(±.010) 밖이면 계수의 평균이 0 이 아니다 — 머리말 ②.");
  console.log("");
})();
