"use strict";
/**
 * 잠재력·성격 분포 실측 — U9 선수 상세의 등급·태그 임계값 근거.
 *
 * 실행: npm run measure:traits
 *
 * ⚠ **눈대중으로 임계값을 정하면 안 된다.**
 * `gen_personality`는 축마다 생성 범위가 다르다. 예를 들어 해외지향은
 * 5~50이라 "75 이상이면 해외 지향" 같은 고정 임계값을 쓰면 그 태그가
 * **영원히 안 나온다.** 프로의식은 반대로 50~80이라 "25 이하면 낮음"이
 * 영원히 안 나온다. 축마다 제 분포에서 재야 한다.
 *
 * 잠재력도 마찬가지다. `potential = (pot_cap * pot_mult).clamp(ovr, 99)`이라
 * 리그 티어가 그대로 들어간다 — 고정 A~E 경계를 쓰면 고교는 전원 E,
 * KBL은 전원 A가 된다.
 */
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../packages/engine-native");

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const rulesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));

const byL = {};
for (const t of refs.teams) (byL[t.leagueId] ??= []).push(t.id);

const PLAN = [
  ["LEAGUE_HIGHSCHOOL",  byL.LEAGUE_HIGHSCHOOL ?? []],
  ["LEAGUE_UNIVERSITY",  byL.LEAGUE_UNIVERSITY ?? []],
  ["LEAGUE_INDEPENDENT", byL.LEAGUE_INDEPENDENT ?? []],
  ["LEAGUE_KBL",         (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_1"))],
  ["LEAGUE_KBL_FARM",    (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_2"))],
];

/** 시드를 여러 개 돌린다 — 한 시드는 표본이지 분포가 아니다 */
const SEEDS = [4242, 777, 20260805, 31337, 99];

const all = [];
const byLeague = {};
for (const seed of SEEDS) {
  for (const [lid, ids] of PLAN) {
    const rule = rulesFile.rosterRules[lid];
    if (!rule || ids.length === 0) continue;
    // 외국인 슬롯을 안 넘기면 **국적이 전부 KOR로 나온다.**
    // 정본은 `foreignRules.leagues`이고 KBL 1군만 들어 있다 (newGameV3.foreignSlotsFor).
    const fgn = rulesFile.foreignRules?.leagues?.includes(lid) ? rulesFile.foreignRules : undefined;
    const out = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify({
      leagueId: lid, seasonYear: 2029, worldSeed: seed,
      teams: ids.map((id) => ({ teamId: id, schoolId: "" })), rules: rule,
      ...(fgn ? { foreign: fgn } : {}),
    })));
    for (const n of out.npcs) {
      all.push(n);
      (byLeague[lid] ??= []).push(n);
    }
  }
}

function q(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const f1 = (v) => v.toFixed(1);

console.log(`표본 ${all.length}명 (시드 ${SEEDS.length}개 × 국내 전 리그)\n`);

// ── 1. 잠재력 ──────────────────────────────────────────────
console.log("잠재력 potentialHidden — 리그별");
console.log("  리그                  n     min   p10   p25   p50   p75   p90   max");
const potRows = [];
for (const [lid, list] of Object.entries(byLeague)) {
  const v = list.map((n) => n.potentialHidden);
  potRows.push([lid, v]);
  console.log(`  ${lid.padEnd(20)} ${String(v.length).padStart(5)} ` +
    [Math.min(...v), q(v, 0.1), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 0.9), Math.max(...v)]
      .map((x) => f1(x).padStart(5)).join(" "));
}
{
  const v = all.map((n) => n.potentialHidden);
  console.log(`  ${"전체".padEnd(20)} ${String(v.length).padStart(5)} ` +
    [Math.min(...v), q(v, 0.1), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 0.9), Math.max(...v)]
      .map((x) => f1(x).padStart(5)).join(" "));
}

// 고정 절대경계를 쓰면 어떻게 되는지 — 실제로 재서 보여준다
console.log("\n  고정 절대경계(A>=90 B>=82 C>=74 D>=66 E<66)를 썼을 때 리그별 등급 분포");
console.log("  리그                     A%    B%    C%    D%    E%");
const ABS = [90, 82, 74, 66];
const gradeOfAbs = (v) => (v >= ABS[0] ? 0 : v >= ABS[1] ? 1 : v >= ABS[2] ? 2 : v >= ABS[3] ? 3 : 4);
let absBroken = 0;
for (const [lid, v] of potRows) {
  const c = [0, 0, 0, 0, 0];
  for (const x of v) c[gradeOfAbs(x)]++;
  const pct = c.map((n) => (n / v.length) * 100);
  if (Math.max(...pct) > 70) absBroken++;
  console.log(`  ${lid.padEnd(20)} ` + pct.map((p) => f1(p).padStart(5)).join(" ") +
    (Math.max(...pct) > 70 ? "   ← 한 등급에 70% 이상 쏠림" : ""));
}
console.log(`  → 고정 경계로는 ${absBroken}개 리그가 한 등급에 뭉친다`);

// ── 1b. 성장 여지 = potentialHidden - 현재 OVR ─────────────
//
// 원수치는 `clamp(ovr, 99)`라 **현재 OVR이 바닥을 밀어올린다.** 그래서
// KBL 베테랑은 전원 90+가 되고 고교는 전원 70대가 된다 — 등급을 매기면
// 리그 이름을 다시 말하는 꼴이다. 실제로 알고 싶은 건 "앞으로 얼마나 더
// 크나"이므로 남은 여지를 같이 잰다.
const ovrOf = (n) => (n.playerType === "pitcher"
  ? n.abilities?.pitching?.ovr : n.abilities?.batting?.ovr) ?? 0;

console.log("\n성장 여지 (potentialHidden - 현재 OVR) — 리그별");
console.log("  리그                  n     min   p10   p25   p50   p75   p90   max");
const roomRows = [];
for (const [lid, list] of Object.entries(byLeague)) {
  const v = list.map((n) => n.potentialHidden - ovrOf(n));
  roomRows.push([lid, v]);
  console.log(`  ${lid.padEnd(20)} ${String(v.length).padStart(5)} ` +
    [Math.min(...v), q(v, 0.1), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 0.9), Math.max(...v)]
      .map((x) => f1(x).padStart(5)).join(" "));
}
{
  const v = all.map((n) => n.potentialHidden - ovrOf(n));
  console.log(`  ${"전체".padEnd(20)} ${String(v.length).padStart(5)} ` +
    [Math.min(...v), q(v, 0.1), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 0.9), Math.max(...v)]
      .map((x) => f1(x).padStart(5)).join(" "));

  console.log("\n  성장 여지에 고정 절대경계를 썼을 때 리그별 등급 분포");
  console.log("  (A>=28 B>=20 C>=13 D>=7 E<7)");
  console.log("  리그                     A%    B%    C%    D%    E%");
  const RC = [28, 20, 13, 7];
  const gr = (x) => (x >= RC[0] ? 0 : x >= RC[1] ? 1 : x >= RC[2] ? 2 : x >= RC[3] ? 3 : 4);
  let ok = 0;
  for (const [lid, vv] of roomRows) {
    const c = [0, 0, 0, 0, 0];
    for (const x of vv) c[gr(x)]++;
    const pct = c.map((n) => (n / vv.length) * 100);
    const skew = Math.max(...pct) > 70;
    if (!skew) ok++;
    console.log(`  ${lid.padEnd(20)} ` + pct.map((p) => f1(p).padStart(5)).join(" ") +
      (skew ? "   ← 쏠림" : ""));
  }
  console.log(`  → ${ok}/${roomRows.length}개 리그가 다섯 등급에 퍼진다`);
}

// ── 2. 성격 ────────────────────────────────────────────────
const AXES = ["loyalty", "ambition", "greed", "competitiveDrive",
              "stabilityPreference", "professionalism", "overseasAmbition", "marketPreference"];
console.log("\n성격 축별 분포 (전체)");
console.log("  축                       min   p06   p50   p94   max");
const axisStats = {};
for (const a of AXES) {
  const v = all.map((n) => n.personality[a]).filter((x) => typeof x === "number");
  const s = { min: Math.min(...v), p06: q(v, 0.06), p50: q(v, 0.5), p94: q(v, 0.94), max: Math.max(...v) };
  axisStats[a] = s;
  console.log(`  ${a.padEnd(22)} ` +
    [s.min, s.p06, s.p50, s.p94, s.max].map((x) => f1(x).padStart(5)).join(" "));
}

console.log("\n  고정 임계값(>=75 높음 / <=25 낮음)을 썼을 때 태그가 나오는 비율");
console.log("  축                     높음%   낮음%");
const dead = [];
for (const a of AXES) {
  const v = all.map((n) => n.personality[a]);
  const hi = (v.filter((x) => x >= 75).length / v.length) * 100;
  const lo = (v.filter((x) => x <= 25).length / v.length) * 100;
  const mark = hi === 0 || lo === 0 ? "   ← 한쪽이 영원히 안 나온다" : "";
  if (hi === 0) dead.push(`${a} 높음`);
  if (lo === 0) dead.push(`${a} 낮음`);
  console.log(`  ${a.padEnd(22)} ${f1(hi).padStart(5)} ${f1(lo).padStart(6)}${mark}`);
}
console.log(`  → 고정 임계값으로는 태그 ${dead.length}종이 死문구: ${dead.join(", ")}`);

// ── 3. 국적 ────────────────────────────────────────────────
console.log("\n국적");
const nat = {};
for (const n of all) nat[n.nationality ?? "(없음)"] = (nat[n.nationality ?? "(없음)"] ?? 0) + 1;
for (const [k, c] of Object.entries(nat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(8)} ${String(c).padStart(6)}  ${f1((c / all.length) * 100)}%`);
}

// ── 4. 권고 경계 ───────────────────────────────────────────
console.log("\n" + "─".repeat(64));
console.log("권고 — 리그별 분위수 경계 (A 상위15% / B ~35% / C ~65% / D ~85% / E 나머지)");
console.log("  리그                  A>=   B>=   C>=   D>=");
const rec = {};
for (const [lid, v] of potRows) {
  const cut = [q(v, 0.85), q(v, 0.65), q(v, 0.35), q(v, 0.15)].map((x) => Math.round(x));
  rec[lid] = cut;
  console.log(`  ${lid.padEnd(20)} ` + cut.map((x) => String(x).padStart(5)).join(" "));
}
console.log("\n성격 — 축별 p85 이상이면 높음 태그, p15 이하면 낮음 태그");
const recAxis = {};
for (const a of AXES) recAxis[a] = { hi: Math.round(axisStats[a].p85), lo: Math.round(axisStats[a].p15) };
console.log("  " + JSON.stringify(recAxis));

const outPath = path.join(__dirname, "../resource/data/master/players/_measured_traits.json");
fs.writeFileSync(outPath, JSON.stringify({
  sampleSize: all.length, seeds: SEEDS,
  potentialCuts: rec, personalityCuts: recAxis,
}, null, 2) + "\n", "utf8");
console.log(`\n측정치 → ${path.relative(process.cwd(), outPath)}`);

// ── 5. 게이트 — 지금 규칙이 이 분포에서 실제로 작동하나 ──────────
//
// vitest는 순수 로직만 본다(경계 포함 여부·해시 결정성). "이 태그가 실제
// 선수한테 붙느냐"는 **진짜 분포로만 답할 수 있다.** 표본 몇 개로 통과시킨
// 검사는 검사가 아니다 — 이 프로젝트에서 이미 세 번 밟았다.
console.log("\n" + "═".repeat(64));
console.log("게이트 — generation_rules.json traitDisplay가 이 분포에서 작동하나");

const td = rulesFile.traitDisplay;
let failed = 0;
const gate = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};

if (!td) {
  gate("traitDisplay 블록 존재", false, "generation_rules.json에 없음");
} else {
  // ① 성장여지 등급이 다섯 개 다 나오고, 어느 리그도 한 등급에 뭉치지 않는다
  const GC = td.growthRoomCuts;
  const gradeOf = (x) => (x >= GC.A ? 0 : x >= GC.B ? 1 : x >= GC.C ? 2 : x >= GC.D ? 3 : 4);
  const seenGrade = new Set();
  let skewed = [];
  for (const [lid, v] of roomRows) {
    const c = [0, 0, 0, 0, 0];
    for (const x of v) { const g = gradeOf(x); c[g]++; seenGrade.add(g); }
    const pct = c.map((n) => (n / v.length) * 100);
    if (Math.max(...pct) > 60) skewed.push(`${lid}(최대 ${f1(Math.max(...pct))}%)`);
  }
  gate("성장여지 A~E 다섯 등급이 전부 나온다", seenGrade.size === 5,
    `나온 등급 ${seenGrade.size}개`);
  gate("어느 리그도 한 등급에 60% 넘게 뭉치지 않는다", skewed.length === 0, skewed.join(" "));

  // ② 성격 태그가 死문구 없이 전부 도달한다
  const PC = td.personalityCuts;
  const deadTags = [];
  for (const [axis, cut] of Object.entries(PC)) {
    const v = all.map((n) => n.personality[axis]).filter((x) => typeof x === "number");
    if (v.length === 0) { deadTags.push(`${axis}(값 없음)`); continue; }
    const hiPct = (v.filter((x) => x >= cut.hi).length / v.length) * 100;
    const loPct = (v.filter((x) => x <= cut.lo).length / v.length) * 100;
    // 프로의식 낮음처럼 문구를 일부러 안 만든 방향이 있으므로 "양쪽 다"는 요구하지 않는다.
    // 다만 **어느 한쪽도 안 나오는 축**은 그 축이 통째로 死문구다.
    if (hiPct === 0 && loPct === 0) deadTags.push(`${axis}(양방향 0%)`);
    else if (hiPct > 0 && hiPct < 0.5) deadTags.push(`${axis} 높음(${f1(hiPct)}% — 사실상 안 나옴)`);
    else if (loPct > 0 && loPct < 0.5) deadTags.push(`${axis} 낮음(${f1(loPct)}% — 사실상 안 나옴)`);
  }
  gate("성격 태그에 死문구가 없다", deadTags.length === 0, deadTags.join(" "));

  // ③ 태그가 아무한테나 붙지도 않는다 — 특징이 흔하면 특징이 아니다
  const tagCounts = all.map((n) => {
    let c = 0;
    for (const [axis, cut] of Object.entries(PC)) {
      const v = n.personality[axis];
      if (typeof v === "number" && (v >= cut.hi || v <= cut.lo)) c++;
    }
    return c;
  });
  const noTag = (tagCounts.filter((c) => c === 0).length / tagCounts.length) * 100;
  console.log(`  · 태그 0개인 평범한 선수 ${f1(noTag)}% · 평균 태그 ` +
    f1(tagCounts.reduce((a, b) => a + b, 0) / tagCounts.length) + "개");
  gate("태그 없는 선수가 10% 이상 있다 (특징이 흔하면 특징이 아니다)", noTag >= 10,
    `${f1(noTag)}%`);

  // ④ 외국인이 실제로 생성된다 — 국적 배지가 나올 자리가 있나
  const fgnCount = all.filter((n) => (n.nationality ?? "KOR") !== "KOR").length;
  gate("외국인 선수가 생성된다 (국적 배지가 쓰일 자리가 있다)", fgnCount > 0,
    `${fgnCount}명`);
}

if (failed > 0) {
  console.error(`\n실패 ${failed}건`);
  process.exit(1);
}
console.log("\n전부 통과");
