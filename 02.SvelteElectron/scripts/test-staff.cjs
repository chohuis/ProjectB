// 스태프 15종 배선 회귀 (Phase 7-5 F-0·F-1)
//
// 이 테스트가 존재하는 이유: 15종 중 **14종이 아무 계산에도 닿지 않고 있었다.**
// staffGen이 쓰는 키와 소비처가 읽는 키가 달랐고, JSON.stringify가 undefined를
// 지워서 아무도 에러를 못 봤다. 조용히 기본값으로 도는 결함은 유닛테스트로
// 안 잡힌다 — **이름을 대조**해야 잡힌다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/test-staff.cjs

const path = require("node:path");
const fs = require("node:fs");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const staffRules = require(path.join(ROOT, "resource/data/master/players/staff_rules.json"));

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${msg}`);
  if (!cond) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

// 주석을 걷어낸 코드만 본다. "예전엔 handlePressure를 읽었다" 같은 설명 주석까지
// 결함으로 세면 왜 고쳤는지를 적을 수가 없어진다
//
// ⚠ **줄바꿈을 먼저 정규화한다.** 예전엔 `split("\n")` 뒤에 `/\/\/.*$/`를
// 썼는데, JS에서 `.`는 `\r`를 line terminator로 보고 안 넘어가고 `$`는
// (m 플래그가 없으면) 문자열 끝에만 붙는다 — **CRLF 파일에서는 줄 주석이
// 하나도 안 걷혔다.** 그래서 "예전엔 handlePersonnel을 읽었다"고 적어둔
// 설명 주석이 결함으로 잡혔다. 이 검사가 막으려던 바로 그 상황이다.
const readCode = (rel) => read(rel)
  .replace(/\r\n?/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

const RULES = staffRules.rules;

// ══ 1. 정본 이름 대조 ═══════════════════════════════════════════
console.log("\n[1] staff_rules.json ↔ 코드의 능력치 이름이 같다");

const MANAGER = RULES.manager.stats;
const COACH   = RULES.coach.stats;
const OWNER   = RULES.owner.stats;
ok(MANAGER.length === 5 && COACH.length === 5 && OWNER.length === 5,
   `규칙 파일이 5+5+5종을 정의한다 (${MANAGER.length}/${COACH.length}/${OWNER.length})`);

const effects = read("apps/ui/src/shared/utils/staffEffects.ts");
for (const [label, names] of [["감독", MANAGER], ["코치", COACH], ["구단주", OWNER]]) {
  const missing = names.filter((n) => !new RegExp(`"${n}"`).test(effects));
  ok(missing.length === 0, `${label} 5종이 staffEffects.ts에 있다${missing.length ? ` — 누락 ${missing}` : ""}`);
}

// staffGen이 규칙 파일 이름 그대로 내보내는가 (별칭을 만들면 다시 드리프트다)
const gen = read("apps/ui/src/shared/repo/staffGen.ts");
for (const [label, names] of [["감독", MANAGER], ["코치", COACH], ["구단주", OWNER]]) {
  const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(gen));
  ok(missing.length === 0, `${label} 5종이 staffRowToEntityRow를 통과한다${missing.length ? ` — 버려짐 ${missing}` : ""}`);
}

// ══ 2. 옛 키가 코드에 남아 있지 않다 ═════════════════════════════
console.log("\n[2] 옛 능력치 이름이 코드에 남아 있지 않다");

// 이 이름들이 살아 있으면 값이 조용히 undefined가 된다
const DEAD_KEYS = [
  "handlePressure", "handlePersonnel",
  "stats?.injuryMgmt", "stats.injuryMgmt",
  "stats?.strategy", "stats.strategy",
  "stats?.motivation", "stats.motivation",
  "stats?.development", "stats.development",
  "stats?.analytics", "stats.analytics",
];
// ⚠ **파일 목록을 손으로 적지 않는다.** 처음엔 8개를 하드코딩했는데,
// 목록에 없던 `stores/backgroundLeague.ts`가 `manager.stats.handlePersonnel`을
// 계속 읽고 있었다 — 배경 리그 전 경기(주 ~56경기)가 감독 능력치 50 고정으로
// 돌고 있었고 테스트는 조용히 통과했다.
//
// 이제 **소스 전체를 훑어 소비처를 찾아낸다.** 새 파일이 옛 키를 읽기 시작하면
// 목록을 갱신하지 않아도 걸린다.
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|svelte)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

const SCAN_FILES = walk("apps/ui/src");
console.log(`    소스 ${SCAN_FILES.length}개 파일을 훑는다 (목록 하드코딩 안 함)`);

const offenders = [];
for (const f of SCAN_FILES) {
  const src = readCode(f);
  const hits = DEAD_KEYS.filter((k) => src.includes(k));
  if (hits.length > 0) offenders.push(`${f} (${hits.join(", ")})`);
}
ok(offenders.length === 0,
   offenders.length === 0
     ? `옛 키를 읽는 파일 없음`
     : `옛 키 사용:\n      ${offenders.join("\n      ")}`);

// 스태프 stats를 **staffEffects를 안 거치고** 직접 파는 곳이 있나.
// 하나라도 있으면 그게 다음 드리프트의 씨앗이다
const rawReaders = [];
for (const f of SCAN_FILES) {
  if (f.endsWith("utils/staffEffects.ts") || f.endsWith("repo/staffGen.ts")) continue;
  if (f.endsWith("stores/master.ts")) continue;              // 타입 정의
  if (f.endsWith("features/player/ui/PlayerDetailModal.svelte")) continue;  // 표시 전용
  if (f.endsWith("pages/roster/RosterPage.svelte")) continue;              // 표시 전용(고아)
  if (f.endsWith("pages/match/MatchPage.svelte")) continue;                // stats 통째 전달
  const src = readCode(f);
  if (/\.(manager|coach|owner)\?\.stats\?\.\w+|\.(manager|coach|owner)\.stats\.\w+/.test(src)) {
    rawReaders.push(f);
  }
}
ok(rawReaders.length === 0,
   rawReaders.length === 0
     ? "계산 경로는 전부 staffEffects를 거친다"
     : `staffEffects를 안 거치고 직접 읽는 곳:\n      ${rawReaders.join("\n      ")}`);

// ══ 3. 15종 전부 소비처가 있다 ═══════════════════════════════════
console.log("\n[3] 15종 전부 실제 계산에 닿는다");

// 능력치 → 그걸 실제로 쓰는 파일. 하나라도 비면 "생성만 하고 안 쓰는 값"이다
const CONSUMERS = {
  tacticalIQ:     ["apps/ui/src/pages/match/MatchPage.svelte"],
  bullpenRead:    ["apps/ui/src/pages/match/MatchPage.svelte"],
  offenseMind:    ["apps/ui/src/pages/match/MatchPage.svelte"],
  motivator:      ["apps/ui/src/shared/usecases/weekPhases/growth.ts", "packages/engine-native/src/growth_engine.rs"],
  clutchDecision: ["packages/engine-native/src/team_engine.rs"],
  teaching:       ["apps/ui/src/shared/usecases/weekPhases/growth.ts"],
  analysis:       ["apps/ui/src/shared/utils/growthEngine.ts"],
  communication:  ["packages/engine-native/src/relationship.rs"],
  discipline:     ["apps/ui/src/shared/usecases/weekPhases/injuries.ts"],
  leadership:     ["apps/ui/src/shared/usecases/advanceWeek.ts"],
  budgetSupport:  ["packages/engine-native/src/player_engine.rs"],
  patience:       ["packages/engine-native/src/staff_lifecycle.rs"],
  prInfluence:    ["packages/engine-native/src/growth_engine.rs"],
  facilityInvestment: ["packages/engine-native/src/week_engine.rs"],
  staffTrust:     ["apps/ui/src/shared/utils/staffEffects.ts"],
};

// MatchPage는 스프레드로 넘기므로 이름이 직접 안 나온다 — 배선 경로를 확인한다
const matchPage = read("apps/ui/src/pages/match/MatchPage.svelte");
const spreadsManagerStats = /\.\.\.\s*myManagerEntity\??\.details\.manager\.stats/.test(matchPage);
ok(spreadsManagerStats, "MatchPage가 감독 stats를 통째로 넘긴다 (별칭 매핑 없음)");

// 계수 표에 있는 항목은 amounts에도 있어야 한다 (매치엔진 3종은 제외)
const MATCH_ONLY = new Set(["tacticalIQ", "bullpenRead", "offenseMind"]);
const amounts = RULES.effects.amounts;
for (const name of [...MANAGER, ...COACH, ...OWNER]) {
  if (MATCH_ONLY.has(name)) {
    ok(!(name in amounts), `${name} — 매치엔진이 원값을 쓰므로 계수 없음 (이중 적용 방지)`);
    continue;
  }
  ok(typeof amounts[name] === "number" && amounts[name] > 0,
     `${name} — [effects.amounts]에 계수가 있다 (${amounts[name]})`);
  // staffEffects가 그 능력치를 실제로 배수로 바꾸는가.
  // patience만 예외 — Rust staff_lifecycle이 원값을 구간표로 직접 읽는다
  ok(name === "patience" || new RegExp(`factorOf\\("${name}"`).test(effects),
     `${name} — staffEffects가 배수로 변환한다`);

  // 능력치 이름 → StaffMods 키. 소비처는 능력치 이름이 아니라 이 이름으로 받는다
  const MOD_KEY = {
    motivator: "morale", clutchDecision: "callup", teaching: "training",
    analysis: "devRate", communication: "relation", discipline: "injuryPrevention",
    leadership: "slump", budgetSupport: "budget", prInfluence: "fame",
    facilityInvestment: "facility", staffTrust: "staffTrust", patience: "patience",
  };
  // Rust는 배수를 파라미터 이름으로 받는다 — 능력치 이름이 그대로 안 나온다
  const RUST_PARAM = {
    motivator: "morale_mod", prInfluence: "fame_mod", budgetSupport: "budget_mod",
    communication: "relation_mod", clutchDecision: "callup_mod",
    facilityInvestment: "facility_investment",
  };
  const snake = RUST_PARAM[name] ?? name.replace(/([A-Z])/g, "_$1").toLowerCase();
  const modKey = MOD_KEY[name];
  const found = CONSUMERS[name].some((f) => {
    const src = readCode(f);
    return new RegExp(`\\b${name}\\b`).test(src)
        || new RegExp(`\\b${snake}\\b`).test(src)
        || (!!modKey && new RegExp(`\\.${modKey}\\b`).test(src));
  });
  ok(found, `${name} — 소비처가 실제로 읽는다 (${CONSUMERS[name].map((f) => path.basename(f)).join(", ")})`);
}

// ══ 4. 계수가 실제로 결과를 바꾼다 (Rust 왕복) ═══════════════════
console.log("\n[4] 계수가 Rust 결과를 실제로 바꾼다");

const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

// 4-1. 시설 — 리그에서 파생한 tier가 먹히는가
const facPro = JSON.parse(native.weekCalcFacilityEffNative(JSON.stringify({
  careerStage: "pro", teamTier: "1군", facilityInvestment: 1.0,
})));
const facFarm = JSON.parse(native.weekCalcFacilityEffNative(JSON.stringify({
  careerStage: "pro", teamTier: "2군", facilityInvestment: 1.0,
})));
ok(facPro > facFarm, `1군 시설이 2군보다 낫다 (${facPro} > ${facFarm})`);

const facRich = JSON.parse(native.weekCalcFacilityEffNative(JSON.stringify({
  careerStage: "pro", teamTier: "1군", facilityInvestment: 1.08,
})));
ok(facRich > facPro, `시설 투자하는 구단주가 더 낫다 (${facRich.toFixed(4)} > ${facPro.toFixed(4)})`);

// 4-2. 구단주 예산 — 오퍼 연봉
const offerBase = JSON.parse(native.calcOfferedSalaryForProtagonistNative(JSON.stringify({
  pitchingOvr: 72, fame: 40, leagueId: "LEAGUE_KBL", currentSalary: 8000, stats: null,
})));
const offerRich = JSON.parse(native.calcOfferedSalaryForProtagonistNative(JSON.stringify({
  pitchingOvr: 72, fame: 40, leagueId: "LEAGUE_KBL", currentSalary: 8000, stats: null,
  budgetMod: 1.06,
})));
ok(offerRich > offerBase, `예산 지원하는 구단주가 더 준다 (${offerRich} > ${offerBase})`);
// **현재 연봉 쪽에는 안 곱한다** — 이미 계약된 값이라 구단주가 못 바꾼다
ok((offerRich - offerBase) / offerBase < 0.06,
   `시장가에만 곱한다 — 인상폭이 계수보다 작다 (${(((offerRich - offerBase) / offerBase) * 100).toFixed(2)}%)`);

// 4-3. 감독 동기부여 — 사기 변동폭
// 능력치는 **실제 생성기가 만든 값**을 쓴다. 손으로 적으면 필드가 빠지고
// (실제로 clutch가 빠져 역직렬화가 죽었다) 스키마가 바뀌어도 안 깨진다
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));
const refs2 = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const sampleTeam = refs2.teams.find((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
const sampleGen = JSON.parse(native.generateLeagueRosterNative(JSON.stringify({
  leagueId: "LEAGUE_KBL", seasonYear: 2026, worldSeed: 7777,
  teams: [{ teamId: sampleTeam.id, schoolId: "", power: sampleTeam.power }],
  rules: gr.rosterRules.LEAGUE_KBL, salaryRules: gr.salaryRules,
  powerRules: gr.powerRules, entryRules: gr.careerHistoryRules.entry,
})));
const samplePitcher = sampleGen.npcs.find((n) => n.abilities?.pitching?.ovr > 0);
ok(!!samplePitcher, "실데이터 투수 표본을 얻었다");

const growthIn = {
  age: samplePitcher.age, condition: 70, fatigue: 30,
  developmentRate: samplePitcher.developmentRate ?? 62,
  diligence: 70, potentialHidden: samplePitcher.potentialHidden ?? 80,
  pitching: samplePitcher.abilities.pitching,
  batting: samplePitcher.abilities.batting,
  pitchingXP: {}, battingXP: {}, playerType: "pitcher", morale: 60,
};
const lossBase = call("calcGameGrowthNative", { protagonist: growthIn, won: false, scoreDiff: 2, strikeouts: 5 });
const lossGood = call("calcGameGrowthNative", { protagonist: growthIn, won: false, scoreDiff: 2, strikeouts: 5, moraleMod: 1.075 });
ok(lossGood.protagonistPatch.morale > lossBase.protagonistPatch.morale,
   `좋은 감독이면 패배 후 사기가 덜 깎인다 (${lossGood.protagonistPatch.morale} > ${lossBase.protagonistPatch.morale})`);

const winBase = call("calcGameGrowthNative", { protagonist: growthIn, won: true, scoreDiff: 3, strikeouts: 8 });
const winGood = call("calcGameGrowthNative", { protagonist: growthIn, won: true, scoreDiff: 3, strikeouts: 8, moraleMod: 1.075 });
ok(winGood.protagonistPatch.morale >= winBase.protagonistPatch.morale,
   `승리 사기는 반대로 커진다 (${winGood.protagonistPatch.morale} ≥ ${winBase.protagonistPatch.morale})`);

// 4-4. 구단주 홍보력 — 명성
const fameBase = call("calcGameGrowthNative", { protagonist: growthIn, won: true, scoreDiff: 3, strikeouts: 10 });
const fameHigh = call("calcGameGrowthNative", { protagonist: growthIn, won: true, scoreDiff: 3, strikeouts: 10, fameMod: 1.125 });
ok(fameHigh.fameDelta > fameBase.fameDelta,
   `홍보력 있는 구단이면 같은 활약이 더 알려진다 (${fameHigh.fameDelta} > ${fameBase.fameDelta})`);

// 4-5. 코치 소통 — 관계도는 **양수에만** 곱한다
const relRules = require(path.join(ROOT, "resource/data/master/players/relationship_rules.json"));
const relBase = call("weeklyRelationsNative", {
  worldSeed: 42, week: 5, rules: relRules,
  rows: [{ personId: "MGR_1", kind: "manager", value: 40, contact: "together", specialty: "" }],
  ctx: { pitched: true, won: true, era: 1.5, teamPlayed: true, teamWon: true, facedRivals: [] },
});
const relHigh = call("weeklyRelationsNative", {
  worldSeed: 42, week: 5, rules: relRules,
  rows: [{ personId: "MGR_1", kind: "manager", value: 40, contact: "together", specialty: "" }],
  ctx: { pitched: true, won: true, era: 1.5, teamPlayed: true, teamWon: true, facedRivals: [] },
  relationMod: 1.15,
});
if (relBase.deltas.length > 0) {
  ok(relHigh.deltas[0].value >= relBase.deltas[0].value,
     `소통 좋은 코치진이면 관계가 빨리 쌓인다 (${relHigh.deltas[0].value} ≥ ${relBase.deltas[0].value})`);
} else {
  ok(false, "관계 델타가 안 나왔다 — 픽스처 확인 필요");
}

// 나쁜 주(패배 + 난타)는 음수 — 여기에 곱하면 방향이 뒤집힌다
const badBase = call("weeklyRelationsNative", {
  worldSeed: 42, week: 5, rules: relRules,
  rows: [{ personId: "MGR_2", kind: "manager", value: 40, contact: "together", specialty: "" }],
  ctx: { pitched: true, won: false, era: 9.0, teamPlayed: true, teamWon: false, facedRivals: [] },
});
const badHigh = call("weeklyRelationsNative", {
  worldSeed: 42, week: 5, rules: relRules,
  rows: [{ personId: "MGR_2", kind: "manager", value: 40, contact: "together", specialty: "" }],
  ctx: { pitched: true, won: false, era: 9.0, teamPlayed: true, teamWon: false, facedRivals: [] },
  relationMod: 1.15,
});
if (badBase.deltas.length > 0 && badBase.deltas[0].delta < 0) {
  ok(badHigh.deltas[0].value === badBase.deltas[0].value,
     `나쁜 주는 계수를 안 탄다 — 미움까지 빨리 쌓이면 방향이 뒤집힌다 (${badHigh.deltas[0].value} = ${badBase.deltas[0].value})`);
} else {
  ok(true, "나쁜 주 픽스처가 음수를 안 만듦 — 건너뜀");
}

// ══ 5. 시설 tier 유령 재발 방지 ══════════════════════════════════
console.log("\n[5] 시설 등급을 refs의 tier로 되돌리지 않았다");

const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const domesticNoTier = refs.teams.filter(
  (t) => !["LEAGUE_ABL", "LEAGUE_JBL"].includes(t.leagueId) && t.tier == null,
).length;
const domesticTotal = refs.teams.filter((t) => !["LEAGUE_ABL", "LEAGUE_JBL"].includes(t.leagueId)).length;
ok(domesticNoTier === domesticTotal,
   `국내 ${domesticTotal}팀에 tier 필드가 없다 — 이걸 시설 등급으로 쓰면 전부 "독립"이 된다`);

const ids = read("apps/ui/src/shared/utils/ids.ts");
ok(/export function facilityTierOf/.test(ids), "facilityTierOf가 ids.ts에 있다 (ID 파생 규칙 정본)");

for (const f of ["apps/ui/src/shared/usecases/weekPhases/growth.ts", "apps/ui/src/shared/usecases/advanceWeek.ts"]) {
  const src = read(f);
  ok(!/\bt\.tier\s*\?\?|teamRef\?\.tier\b/.test(src),
     `${path.basename(f)} — TeamRef.tier 폴백이 없다`);
}

// ══ 6. 치료비 단위 ═══════════════════════════════════════════════
console.log("\n[6] 치료비가 만원 단위다 (money와 같은 단위)");

const aw = read("apps/ui/src/shared/usecases/advanceWeek.ts");
const costBlock = aw.slice(aw.indexOf("weeklyTreatmentCost"), aw.indexOf("weeklyTreatmentCost") + 400);
const nums = [...costBlock.matchAll(/:\s*(\d[\d_]*)/g)].map((m) => Number(m[1].replace(/_/g, "")));
ok(nums.length > 0 && nums.every((n) => n < 1000),
   `치료비가 전부 1000만원 미만이다 (${nums.join(", ")}) — 원 단위면 자산이 한 주에 0이 된다`);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
