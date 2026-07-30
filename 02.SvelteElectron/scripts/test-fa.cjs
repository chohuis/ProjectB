"use strict";
// FA · 방출 회귀 검증 (Phase 7-4)
// 실행: npm run test:fa
//
// 설계 정본은 `docs/design/fa.md`, 수치는 `generation_rules.json`의 `faRules`.
//
// **핵심은 폴백 일치다.** FA 자격 연수는 규칙 파일 말고도 Rust·TS에 폴백 표가
// 있다 (규칙을 못 들고 오는 동기 경로용). 값이 갈라지는 순간
// "어디서 읽었느냐에 따라 FA 자격이 다른" 상태가 되므로 여기서 소리내게 한다.

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

const FA = gr.faRules;

// ── 1. 규칙 정본 ──────────────────────────────────────────────
console.log("규칙 정본");
{
  check("faRules가 있다", !!FA);
  check("자격 연수가 리그별로 있다",
    FA.eligibleYears && typeof FA.eligibleYears.default === "number");
  check("등급이 정의돼 있다", Array.isArray(FA.grades) && FA.grades.length > 0);

  // 등급 구간에 구멍이 없어야 한다
  const sorted = [...FA.grades].sort((a, b) => a.untilPercent - b.untilPercent);
  check("등급 구간이 오름차순이다",
    JSON.stringify(sorted) === JSON.stringify(FA.grades),
    FA.grades.map((g) => `${g.grade}:${g.untilPercent}`).join(" "));
  check("최저 등급이 100%까지 덮는다",
    FA.grades[FA.grades.length - 1].untilPercent >= 100,
    String(FA.grades[FA.grades.length - 1].untilPercent));
  check("보상선수가 있는 등급이 하나 이상이다",
    FA.grades.some((g) => g.protectedCount > 0));
}

// ── 2. 폴백 일치 (드리프트 방지) ──────────────────────────────
console.log("\n폴백 일치");
{
  // Rust team_engine::fa_eligibility_years
  const rust = read("packages/engine-native/src/team_engine.rs");
  const block = rust.match(/pub fn fa_eligibility_years[\s\S]*?\n\}/)?.[0] ?? "";
  const rustTable = {};
  for (const m of block.matchAll(/"(LEAGUE_[A-Z_]+)"\s*=>\s*(\d+)/g)) rustTable[m[1]] = Number(m[2]);
  const rustDefault = Number(block.match(/_\s*=>\s*(\d+)/)?.[1] ?? NaN);

  // TS FA_THRESHOLD
  const ts = read("apps/ui/src/shared/utils/faEngine.ts");
  const tsBlock = ts.match(/FA_THRESHOLD[^=]*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const tsTable = {};
  for (const m of tsBlock.matchAll(/(LEAGUE_[A-Z_]+):\s*(\d+)/g)) tsTable[m[1]] = Number(m[2]);

  const mismatch = [];
  for (const [lid, years] of Object.entries(FA.eligibleYears)) {
    if (lid === "default") continue;
    if (rustTable[lid] !== years) mismatch.push(`Rust ${lid}=${rustTable[lid]}≠${years}`);
    if (tsTable[lid] !== years) mismatch.push(`TS ${lid}=${tsTable[lid]}≠${years}`);
  }
  check("Rust·TS 폴백이 규칙 파일과 같다", mismatch.length === 0, mismatch.join(" · "));
  check("Rust 폴백 default가 규칙 파일과 같다",
    rustDefault === FA.eligibleYears.default, `${rustDefault} vs ${FA.eligibleYears.default}`);

  // Rust 안에서 같은 표가 두 번 정의되면 안 된다
  let defs = 0;
  for (const f of fs.readdirSync(path.join(ROOT, "packages/engine-native/src"))) {
    if (!f.endsWith(".rs")) continue;
    if (/fn fa_eligibility_years/.test(read(`packages/engine-native/src/${f}`))) defs++;
  }
  check("Rust에 자격 연수 정의가 하나뿐이다", defs === 1, `${defs}곳`);
}

// ── 3. FA 시장 ────────────────────────────────────────────────
console.log("\nFA 시장");
const player = (id, from, ovr, salary, age = 27) => ({
  npcId: id, name: id, fromTeamId: from, position: "SP", ovr, age, salary, form: 0,
});
const team = (id, slots, n = 30) => ({
  teamId: id, budgetIndex: 1.0, winNowPressure: 50, openSlots: slots,
  roster: Array.from({ length: n }, (_, i) => ({ npcId: `${id}_R${i}`, ovr: 80 - i })),
});
{
  // 재계약이면 보상이 없다
  const reSign = call("resolveFaMarketNative", {
    players: [player("FA1", "TEAM_A", 80, 30000)],
    teams: [team("TEAM_A", 1)],
    rules: FA, leagueSalaries: [50000, 30000, 10000], seasonYear: 2030, worldSeed: 1,
  });
  check("재계약이면 보상이 안 나간다",
    reSign.signings[0]?.toTeamId === "TEAM_A"
    && !reSign.signings[0]?.compensationNpcId
    && reSign.signings[0]?.compensationMoney === 0);

  // 상위 등급이 팀을 옮기면 보상선수가 실제로 간다
  const moved = call("resolveFaMarketNative", {
    players: [player("FA1", "TEAM_A", 90, 100000)],
    teams: [team("TEAM_A", 0), team("TEAM_B", 1)],
    rules: FA, leagueSalaries: [100000, 50000, 30000, 10000], seasonYear: 2030, worldSeed: 7,
  });
  const s = moved.signings[0];
  check("이적하면 보상선수가 실제로 간다", !!s?.compensationNpcId, s?.grade ?? "-");
  check("보상금도 나간다", (s?.compensationMoney ?? 0) > 0);

  const topGrade = FA.grades.find((g) => g.protectedCount > 0);
  check("보상선수가 보호명단 밖에서 나온다",
    s?.compensationNpcId === `TEAM_B_R${topGrade.protectedCount}`,
    s?.compensationNpcId ?? "-");

  // 자리가 없으면 미계약 → 7-1의 진로 배정으로 넘어간다
  const none = call("resolveFaMarketNative", {
    players: [player("FA1", "TEAM_A", 90, 50000)],
    teams: [team("TEAM_A", 0)],
    rules: FA, leagueSalaries: [50000], seasonYear: 2030, worldSeed: 1,
  });
  check("자리가 없으면 미계약으로 남는다",
    none.signings.length === 0 && none.unsigned.length === 1);

  // 같은 선수가 두 번 보상으로 가면 로스터가 어긋난다
  const two = call("resolveFaMarketNative", {
    players: [player("FA1", "TEAM_A", 92, 100000), player("FA2", "TEAM_C", 91, 99000)],
    teams: [team("TEAM_A", 0), team("TEAM_B", 2), team("TEAM_C", 0)],
    rules: FA, leagueSalaries: [100000, 99000, 10000], seasonYear: 2030, worldSeed: 3,
  });
  const comps = two.signings.map((x) => x.compensationNpcId).filter(Boolean);
  check("같은 선수가 두 번 보상으로 가지 않는다",
    new Set(comps).size === comps.length, comps.join(","));
}

// ── 4. 등급 분포 (실규모) ─────────────────────────────────────
console.log("\n등급 분포");
{
  // 연봉을 골고루 준 100명이 등급별로 갈리는지
  const salaries = Array.from({ length: 300 }, (_, i) => 100000 - i * 300);
  const players = Array.from({ length: 60 }, (_, i) =>
    player(`FA${i}`, `TEAM_${i % 10}`, 80, salaries[i * 5]));
  const teams = Array.from({ length: 10 }, (_, i) => team(`TEAM_${i}`, 6));
  const res = call("resolveFaMarketNative", {
    players, teams, rules: FA, leagueSalaries: salaries, seasonYear: 2030, worldSeed: 11,
  });
  const dist = {};
  for (const s of res.signings) dist[s.grade] = (dist[s.grade] ?? 0) + 1;
  console.log(`    계약 ${res.signings.length}명 · 미계약 ${res.unsigned.length}명 · ` +
    `등급 ${Object.entries(dist).map(([g, n]) => `${g}:${n}`).join(" ")}`);
  check("등급이 한 종류로 쏠리지 않는다", Object.keys(dist).length >= 2,
    JSON.stringify(dist));

  const moved = res.signings.filter((s) => s.toTeamId !== s.fromTeamId);
  const withComp = moved.filter((s) => s.compensationNpcId);
  console.log(`    이적 ${moved.length}명 중 보상선수 발생 ${withComp.length}명`);
  check("이적이 실제로 일어난다", moved.length > 0);
  check("보상선수 이동이 실제로 일어난다", withComp.length > 0);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
