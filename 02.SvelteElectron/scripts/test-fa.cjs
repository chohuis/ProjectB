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

// ── 5. 방출 2단계 ─────────────────────────────────────────────
console.log("\n방출 2단계");
{
  const R = FA.release;
  check("방출 규칙이 규칙 파일에 있다", !!R);
  check("임계값·팀당 상한이 있다",
    typeof R.scoreThreshold === "number" && typeof R.maxPerTeam === "number");
  check("팀당 상한이 로스터를 통째로 갈지 않는다", R.maxPerTeam <= 5, String(R.maxPerTeam));
  check("구단주 관계 가중치가 임계값을 통째로 지우지 않는다",
    R.ownerRelationWeight * 100 <= R.scoreThreshold,
    `관계 100이면 -${R.ownerRelationWeight * 100}점 vs 임계 ${R.scoreThreshold}`);

  // 구단주 관계가 방출 점수를 실제로 움직이는가 (주인공 전용 경로)
  const base = {
    teamProfile: {
      ownerSpendingWillingness: 50, stability: 50, developmentFocus: 50, discipline: 50,
      ownerPatience: 50, winNowPressure: 50, scoutingQuality: 50, prestige: 50,
      marketAppeal: 50, clubhouseCulture: 50, medicalQuality: 50, farmInvestment: 50,
    },
    player: {
      id: "P1", position: "SP", age: 33, ovr: 55, salary: 50000,
      remainingYears: 1, proServiceYears: 10, isProspect: false, personality: null, fame: 0,
    },
    recentPerformanceRating: 30, rosterDepthAtPosition: 5,
    currentSalary: 50000, marketValue: 20000,
  };
  const cold = call("evalReleasePriorityNative", {
    ...base, ownerRelation: -80, ownerRelationWeight: R.ownerRelationWeight });
  const warm = call("evalReleasePriorityNative", {
    ...base, ownerRelation: 80, ownerRelationWeight: R.ownerRelationWeight });
  const none = call("evalReleasePriorityNative", base);
  console.log(`    방출 점수 — 관계 나쁨 ${cold.releaseScore.toFixed(0)} · ` +
    `없음 ${none.releaseScore.toFixed(0)} · 좋음 ${warm.releaseScore.toFixed(0)}`);
  check("구단주 관계가 좋으면 방출 점수가 내려간다", warm.releaseScore < none.releaseScore);
  check("관계가 나쁘면 올라간다", cold.releaseScore > none.releaseScore);
  check("관계를 안 넘기면 점수가 안 변한다 (NPC 경로)",
    Math.abs(none.releaseScore - (cold.releaseScore + warm.releaseScore) / 2) < 0.01);
}

// ══ FA 시장 오프시즌 배선 (§7-5 F-4 — 7-4 이월) ═══════════════
//
// 7-4는 엔진만 만들고 호출부가 없었다. 그동안 FA 신청자는 LEAGUE_FREE_AGENT로만
// 바뀌고 Rust run_offseason이 **무작위 재배치**했다 — 등급도 보상선수도 안 걸렸다.
{
  console.log("\n[F-4] FA 시장 오프시즌 배선");

  const src = fs.readFileSync(
    path.join(ROOT, "apps/ui/src/shared/usecases/weekPhases/market.ts"), "utf-8");
  check("오프시즌이 resolveFaMarketNative를 실제로 부른다",
    /resolveFaMarketNative/.test(src));
  check("계약 결과를 updatedNpcs에 반영한다",
    /careerStatus: "active"[\s\S]{0,200}currentTeam: sg\.toTeamId/.test(src));
  check("보상선수를 원소속으로 보낸다",
    /compensationNpcId[\s\S]{0,400}currentTeam: sg\.fromTeamId/.test(src));
  check("FA 계약을 transactions에 남긴다 (리그 기록 탭이 읽는다)",
    /category: "fa"/.test(src));
  check("상무는 영입 팀에서 제외한다 (군 복무팀이 FA를 안 뽑는다)",
    /SANGMU_TEAM_IDS\.has/.test(src));
  check("로스터 상한을 규칙 파일에서 읽는다 (코드에 두 번 적지 않는다)",
    /rosterRules\["LEAGUE_KBL"\]\?\.rosterMax/.test(src));
  check("시장이 죽어도 오프시즌은 멈추지 않는다",
    /catch \(e\)[\s\S]{0,200}FA시장오류/.test(src));

  // 실제로 정산이 도는가 — 등급·보상선수가 나오는지 실데이터로 확인
  const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
  const teams = refs.teams
    .filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"))
    .slice(0, 6);
  const market = call("resolveFaMarketNative", {
    players: [
      { npcId: "FA_TOP",  name: "특급FA",  fromTeamId: teams[0].id, position: "SP", ovr: 88, age: 30, salary: 60000, form: 0 },
      { npcId: "FA_MID",  name: "중급FA",  fromTeamId: teams[1].id, position: "1B", ovr: 74, age: 32, salary: 20000, form: 0 },
      { npcId: "FA_LOW",  name: "하위FA",  fromTeamId: teams[2].id, position: "RP", ovr: 62, age: 35, salary: 6000,  form: 0 },
    ],
    teams: teams.map((t, i) => ({
      teamId: t.id, budgetIndex: 1.0 + (i - 2) * 0.1, winNowPressure: 50,
      openSlots: 3,
      roster: Array.from({ length: 30 }, (_, k) => ({ npcId: `${t.id}_R${k}`, ovr: 50 + (k % 30) })),
    })),
    rules: FA,
    leagueSalaries: [60000, 40000, 25000, 20000, 12000, 8000, 6000, 4000, 3000, 3000],
    seasonYear: 2030, worldSeed: 4242,
  });
  check("정산이 돈다", !market.error, market.error);
  check("특급 FA가 계약한다", market.signings.some((x) => x.npcId === "FA_TOP"));

  const graded = market.signings.filter((x) => x.grade);
  check("계약마다 등급이 붙는다", graded.length === market.signings.length);

  const moved = market.signings.filter((x) => x.toTeamId !== x.fromTeamId);
  const stayed = market.signings.filter((x) => x.toTeamId === x.fromTeamId);
  console.log(`    계약 ${market.signings.length}건 (이적 ${moved.length} · 잔류 ${stayed.length}) · 미계약 ${market.unsigned.length}`);
  check("원소속 잔류에는 보상이 없다",
    stayed.every((x) => !x.compensationNpcId && x.compensationMoney === 0));

  // 보호선수 밖에서만 보상선수를 뽑는가 — 팀의 최고 OVR을 데려가면 안 된다
  for (const sg of moved) {
    if (!sg.compensationNpcId) continue;
    const g = FA.grades.find((x) => x.grade === sg.grade);
    if (!g || g.protectedCount <= 0) continue;
    check(`${sg.grade}등급 보상선수가 보호선수 밖에서 나온다`,
      !sg.compensationNpcId.endsWith("_R29"));
  }
}

// ══ 구단주 관계가 재계약에도 걸린다 (§7-5 F-4) ═════════════════
//
// 7-4에서 구단주 관계는 **방출**에만 쓰였다. 나를 싫어하는 구단주가 자르기만
// 하고 계약엔 무관하면 그 축이 절반만 사는 셈이다.
{
  console.log("\n[F-4] 구단주 관계 — 재계약 쪽 소비처");

  const relRules = require(path.join(ROOT, "resource/data/master/players/relationship_rules.json"));
  check("규칙에 owner_contract_per_step이 있다",
    typeof relRules.effect.owner_contract_per_step === "number"
      && relRules.effect.owner_contract_per_step > 0);

  const eff = (ownerValue) => call("relationEffectsNative", {
    rules: relRules, managerValue: 0, coachValue: 0, ownerValue });
  const cold = eff(-80), mid = eff(0), warm = eff(80);
  console.log(`    재계약 배율 — 나쁨 ${(cold.contractBonus * 100).toFixed(0)}% · ` +
    `중립 ${(mid.contractBonus * 100).toFixed(0)}% · 좋음 ${(warm.contractBonus * 100).toFixed(0)}%`);
  check("관계가 좋으면 오퍼가 오른다", warm.contractBonus > 0);
  check("나쁘면 내려간다", cold.contractBonus < 0);
  check("중립이면 보정 없음", mid.contractBonus === 0);
  check("라벨이 같이 온다 (화면이 값을 안 보여준다)",
    typeof warm.ownerLabel === "string" && warm.ownerLabel.length > 0);

  const modal = fs.readFileSync(
    path.join(ROOT, "apps/ui/src/features/contract/ui/ContractNegotiationModal.svelte"), "utf-8");
  check("협상 화면이 구단주 관계를 읽는다", /contractBonus|ownerBonus/.test(modal));
  check("구단주 예산도 같이 본다 (관계와 다른 축이다)", /staffModsOf[\s\S]{0,120}budget/.test(modal));
  check("임계값도 같은 배수를 탄다 — 오퍼만 올리면 '더 주는데 더 짜다'가 된다",
    /let base = effectiveOffer \* 1\.15/.test(modal));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
