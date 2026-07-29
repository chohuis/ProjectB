"use strict";
// Phase 6A 스태프 절차 생성 검증
// 실행: npm run test:staffgen
//
// 지키려는 것:
//  1) 국내 182팀 전원에 감독 1 · 구단주 1 · 코치는 자원 등급별로 생긴다
//  2) worldSeed 결정적 — 같은 시드면 같은 스태프, 다른 시드면 다른 스태프
//  3) 감독 능력치가 **Rust ManagerStats 키**로 나온다
//     (구 JSON은 tactics/... 였고 MatchPage는 handlePressure/... 를 읽어 값이 전달되지 않았다)
//  4) 리그 수준·전력★·자원 등급 보정이 실제로 반영된다

const path = require("node:path");
const fs = require("node:fs");
const engine = require("../packages/engine-native");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const rulesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/players/staff_rules.json"), "utf8"));

const DOMESTIC = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL"];
const teams = refs.teams
  .filter((t) => DOMESTIC.includes(t.leagueId))
  .map((t) => ({
    teamId: t.id, leagueId: t.leagueId, schoolId: t.schoolId ?? "",
    power: t.power ?? 3, resource: t.traits?.resource ?? "안정",
  }));

const SEED = 20260730;

function gen(seed = SEED, year = 2026, teamList = teams) {
  const raw = engine.generateStaffNative(JSON.stringify({
    worldSeed: seed, seasonYear: year,
    rules: rulesFile.rules,
    surnames: rulesFile.namePools.krSurnames,
    givenNames: rulesFile.namePools.krGiven,
    surnamesEn: rulesFile.namePools.enSurnames,
    givenNamesEn: rulesFile.namePools.enGiven,
    teams: teamList,
  }));
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`생성 실패: ${parsed.error}`);
  return parsed;
}

// ── 1. 규모 ───────────────────────────────────────────────────
const staff = gen();
const byRole = {};
for (const s of staff) byRole[s.role] = (byRole[s.role] ?? 0) + 1;

console.log("스태프 생성");
console.log(`    국내 ${teams.length}팀 → 스태프 ${staff.length}명`);
console.log(`    감독 ${byRole.manager} · 구단주 ${byRole.owner} · 코치 ${byRole.coach}`);
const resCount = {};
for (const t of teams) resCount[t.resource] = (resCount[t.resource] ?? 0) + 1;
console.log(`    자원 등급: ${Object.entries(resCount).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log("");

check("국내 182팀", teams.length === 182, `got ${teams.length}`);
check("감독 = 팀 수", byRole.manager === teams.length, `got ${byRole.manager}`);
check("구단주 = 팀 수", byRole.owner === teams.length, `got ${byRole.owner}`);
check("코치가 존재", byRole.coach > 0);
check("staffId 유일", new Set(staff.map((s) => s.staffId)).size === staff.length,
  `${staff.length}명 중 고유 ${new Set(staff.map((s) => s.staffId)).size}`);
check("전원 status=active", staff.every((s) => s.status === "active"));
check("전원 이름 있음", staff.every((s) => s.name && s.name.length >= 2));
check("전원 joinedSeason=2026", staff.every((s) => s.joinedSeason === 2026));

// ── 2. 코치 인원 = 자원 등급 (people.md §2-2) ─────────────────
console.log("자원 등급별 코치 인원");
const CC = rulesFile.rules.coach_count;
const byTeam = {};
for (const s of staff) (byTeam[s.teamId] ??= []).push(s);
const resOf = Object.fromEntries(teams.map((t) => [t.teamId, t.resource]));

let coachRangeOk = true;
const perRes = {};
for (const [tid, list] of Object.entries(byTeam)) {
  const n = list.filter((s) => s.role === "coach").length;
  const res = resOf[tid];
  (perRes[res] ??= []).push(n);
  const rule = CC[res];
  if (rule && (n < rule.min || n > rule.max)) {
    coachRangeOk = false;
    console.error(`      ${tid} (${res}) 코치 ${n}명 — 규칙 ${rule.min}~${rule.max}`);
  }
}
for (const [res, arr] of Object.entries(perRes)) {
  const rule = CC[res];
  console.log(`    ${res.padEnd(4)} ${String(arr.length).padStart(3)}팀  코치 ${Math.min(...arr)}~${Math.max(...arr)}명 (규칙 ${rule.min}~${rule.max})`);
}
check("전 팀 코치 수가 자원 등급 범위 안", coachRangeOk);
check("부유 > 궁핍 (팀 선택의 실질적 격차)", (() => {
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return !perRes["부유"] || !perRes["궁핍"] || avg(perRes["부유"]) > avg(perRes["궁핍"]);
})());
check("궁핍 팀은 코치 0명도 가능", CC["궁핍"].min === 0);

check("팀마다 감독 정확히 1명",
  Object.values(byTeam).every((l) => l.filter((s) => s.role === "manager").length === 1));
check("팀마다 구단주 정확히 1명",
  Object.values(byTeam).every((l) => l.filter((s) => s.role === "owner").length === 1));

// ── 3. 감독 능력치 스키마 = Rust ManagerStats ─────────────────
console.log("\n능력치 스키마");
const MGR_KEYS = ["tacticalIQ", "bullpenRead", "offenseMind", "motivator", "clutchDecision"];
const managers = staff.filter((s) => s.role === "manager");
check("감독 스탯 = Rust ManagerStats 5종",
  managers.every((m) => MGR_KEYS.every((k) => typeof m.stats[k] === "number")),
  Object.keys(managers[0].stats).join(","));
check("구 키(tactics/decision/handlePressure) 없음",
  managers.every((m) => !("tactics" in m.stats) && !("handlePressure" in m.stats)));
check("감독 riskTolerance 30~75",
  managers.every((m) => m.riskTolerance >= 30 && m.riskTolerance <= 75));
check("감독 나이 38~66", managers.every((m) => m.age >= 38 && m.age <= 66));
check("감독 스타일이 규칙 목록에서 나옴",
  managers.every((m) => rulesFile.rules.manager.styles.includes(m.style)));

const COACH_KEYS = ["teaching", "analysis", "communication", "discipline", "leadership"];
const coaches = staff.filter((s) => s.role === "coach");
check("코치 스탯 5종", coaches.every((c) => COACH_KEYS.every((k) => typeof c.stats[k] === "number")));
check("코치 전문 영역이 6종 중 하나", (() => {
  const names = rulesFile.rules.coach.specialties.map((s) => s.name);
  return coaches.every((c) => names.includes(c.style));
})());
check("코치 훈련 버프 문구 채워짐",
  coaches.every((c) => c.trainingBuff.length > 0 && !c.trainingBuff.includes("{v}")));
check("한 팀에 같은 전문이 몰리지 않음 (6종 순환)", (() => {
  for (const list of Object.values(byTeam)) {
    const cs = list.filter((s) => s.role === "coach");
    if (cs.length <= 6 && new Set(cs.map((c) => c.style)).size !== cs.length) return false;
  }
  return true;
})());

const OWNER_KEYS = ["budgetSupport", "patience", "prInfluence", "facilityInvestment", "staffTrust"];
const owners = staff.filter((s) => s.role === "owner");
check("구단주 스탯 5종", owners.every((o) => OWNER_KEYS.every((k) => typeof o.stats[k] === "number")));
check("전 능력치 20~95 범위",
  staff.every((s) => Object.values(s.stats).every((v) => v >= 20 && v <= 95)));

// ── 4. 보정이 실제로 반영되는가 ───────────────────────────────
console.log("\n보정 반영");
const avgStat = (list, key) => list.reduce((a, s) => a + (s.stats[key] ?? 0), 0) / Math.max(1, list.length);
const mgrByLeague = {};
for (const m of managers) (mgrByLeague[m.leagueId] ??= []).push(m);
for (const [lid, arr] of Object.entries(mgrByLeague)) {
  console.log(`    ${lid.replace("LEAGUE_", "").padEnd(12)} 감독 ${String(arr.length).padStart(3)}명  평균 tacticalIQ ${avgStat(arr, "tacticalIQ").toFixed(1)}`);
}
check("프로 감독 > 고교 감독 (리그 보정)",
  avgStat(mgrByLeague.LEAGUE_KBL, "tacticalIQ") > avgStat(mgrByLeague.LEAGUE_HIGHSCHOOL, "tacticalIQ"),
  `KBL ${avgStat(mgrByLeague.LEAGUE_KBL, "tacticalIQ").toFixed(1)} vs HS ${avgStat(mgrByLeague.LEAGUE_HIGHSCHOOL, "tacticalIQ").toFixed(1)}`);

// 전력★ 보정 — 고교 안에서 ★4~5팀 vs ★1~2팀
{
  const powerOf = Object.fromEntries(teams.map((t) => [t.teamId, t.power]));
  const hs = managers.filter((m) => m.leagueId === "LEAGUE_HIGHSCHOOL");
  const strong = hs.filter((m) => powerOf[m.teamId] >= 4);
  const weak = hs.filter((m) => powerOf[m.teamId] <= 2);
  console.log(`    고교 ★4+ ${strong.length}팀 평균 ${avgStat(strong, "tacticalIQ").toFixed(1)} · ★2- ${weak.length}팀 평균 ${avgStat(weak, "tacticalIQ").toFixed(1)}`);
  check("명문 팀 감독 > 약팀 감독 (전력★ 보정)",
    strong.length > 0 && weak.length > 0 && avgStat(strong, "tacticalIQ") > avgStat(weak, "tacticalIQ"));
}

// 자원 등급 → 구단주 예산 성향
{
  const rich = owners.filter((o) => resOf[o.teamId] === "부유");
  const poor = owners.filter((o) => resOf[o.teamId] === "궁핍");
  console.log(`    부유 구단주 ${rich.length}명 budgetSupport ${avgStat(rich, "budgetSupport").toFixed(1)} · 궁핍 ${poor.length}명 ${avgStat(poor, "budgetSupport").toFixed(1)}`);
  check("부유 구단주가 예산을 더 푼다 (자원 보정)",
    rich.length > 0 && poor.length > 0 && avgStat(rich, "budgetSupport") > avgStat(poor, "budgetSupport"));
}

// ── 5. 결정성 ─────────────────────────────────────────────────
console.log("\n결정성");
check("같은 worldSeed → 같은 스태프", JSON.stringify(gen()) === JSON.stringify(staff));
check("다른 worldSeed → 다른 스태프", JSON.stringify(gen(SEED + 1)) !== JSON.stringify(staff));
check("팀 입력 순서가 바뀌어도 같은 결과",
  JSON.stringify(gen(SEED, 2026, [...teams].reverse())) === JSON.stringify(staff));
check("팀 목록이 줄어도 남은 팀 스태프는 동일", (() => {
  const subset = teams.slice(0, 20);
  const sub = gen(SEED, 2026, subset);
  const ids = new Set(subset.map((t) => t.teamId));
  const fromFull = staff.filter((s) => ids.has(s.teamId));
  return JSON.stringify(sub) === JSON.stringify(fromFull);
})(), "팀별 독립 스트림이 깨졌다");

// ── 6. ID 규약 ────────────────────────────────────────────────
console.log("\nID 규약");
check("감독 ID = staff:<team>_MGR",
  managers.every((m) => m.staffId === `staff:${m.teamId}_MGR`));
check("구단주 ID = staff:<team>_OWN",
  owners.every((o) => o.staffId === `staff:${o.teamId}_OWN`));
check("코치 ID = staff:<team>_COA<n>",
  coaches.every((c) => /^staff:.+_COA\d+$/.test(c.staffId)));
check("레거시 접두사(COA_/MNG_/OWN_) 없음",
  staff.every((s) => !/^(COA|MNG|OWN)_/.test(s.staffId)));

console.log(`\n총 ${staff.length}명 (감독 ${byRole.manager} · 구단주 ${byRole.owner} · 코치 ${byRole.coach})`);
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
