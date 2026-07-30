"use strict";
// R3a-2 로스터 생성 검증 — 결정성·포지션 커버리지·분포·slotdb 연동
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-roster-gen.cjs
const engine = require("../packages/engine-native");
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const gen = (p) => JSON.parse(engine.generateLeagueRosterNative(JSON.stringify(p)));

// ── 1. 고교 10팀 (학년제) ─────────────────────────────────────
const HS_TEAMS = Array.from({ length: 10 }, (_, i) => ({
  teamId: `TEAM_HS_T${i}`, schoolId: `SCHOOL_HS_T${i}`,
}));
const hsParams = {
  leagueId: "LEAGUE_HIGHSCHOOL", seasonYear: 2026, worldSeed: 42,
  teams: HS_TEAMS,
  rules: {
    rosterSize: 25,
    pitchingOvrMin: 40, pitchingOvrMax: 72, battingOvrMin: 40, battingOvrMax: 72,
    devRateMin: 45, devRateMax: 75,
    gradeMax: 3, ageBase: 16,   // 한국 나이 — 고1 = 17세
  },
};
const hs = gen(hsParams);
check("고교: 10팀 × 25 = 250명", hs.npcs.length === 250, `got ${hs.npcs.length}`);
check("고교: npcId 전체 유니크", new Set(hs.npcs.map(n => n.npcId)).size === 250);

const team0 = hs.npcs.filter(n => n.currentTeam === "TEAM_HS_T0");
const posSet = new Set(team0.map(n => n.position));
check("고교: 야수 8포지션 커버", ["C","1B","2B","3B","SS","LF","CF","RF"].every(p => posSet.has(p)));
check("고교: SP 3명 이상", team0.filter(n => n.position === "SP").length >= 3);

// ── 포지션 깊이 — 국내 전 리그 전 팀 (Phase 6 이후 보강) ─────────
//
// 커버리지(1명씩)만 보면 부족하다. 한 바퀴만 돌던 시절엔 나머지가 전부 랜덤이라
// **프로 28명 로스터에서 2루·좌익·중견이 1명씩** 남았다. 그 1명이 다치면 자리가
// 통째로 빈다. 지금은 8포지션을 두 바퀴 돌아 백업 1명까지 구조로 보장한다.
console.log("\n포지션 깊이 (국내 전 팀)");
{
  // 이 절은 **실데이터**로 본다 — 위 절들은 인라인 규칙이라 실제 새 게임과
  // 다를 수 있다. 로스터 규모가 바뀌면 여기서 잡혀야 한다.
  const fs = require("node:fs");
  const path = require("node:path");
  const refs = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
  const rulesFile = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));

  const FIELD = ["C","1B","2B","3B","SS","LF","CF","RF"];
  const byL = {};
  for (const t of refs.teams) (byL[t.leagueId] ??= []).push(t.id);
  const PLAN = [
    ["LEAGUE_HIGHSCHOOL",  byL.LEAGUE_HIGHSCHOOL ?? []],
    ["LEAGUE_UNIVERSITY",  byL.LEAGUE_UNIVERSITY ?? []],
    ["LEAGUE_INDEPENDENT", byL.LEAGUE_INDEPENDENT ?? []],
    ["LEAGUE_KBL",         (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_1"))],
    ["LEAGUE_KBL_FARM",    (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_2"))],
  ];
  let teams = 0, thin = [], totalNpcs = 0;
  for (const [lid, ids] of PLAN) {
    const rule = rulesFile.rosterRules[lid];
    if (!rule || ids.length === 0) { check(`${lid} 규칙·팀 존재`, false, "없음"); continue; }
    const out = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify({
      leagueId: lid, seasonYear: 2029, worldSeed: 4242,
      teams: ids.map((id) => ({ teamId: id, schoolId: "" })), rules: rule,
    })));
    totalNpcs += out.npcs.length;
    const byTeam = {};
    for (const n of out.npcs) (byTeam[n.currentTeam] ??= []).push(n);
    for (const [tid, roster] of Object.entries(byTeam)) {
      teams++;
      const cnt = {};
      for (const r of roster) cnt[r.position] = (cnt[r.position] ?? 0) + 1;
      const min = Math.min(...FIELD.map((f) => cnt[f] ?? 0));
      if (min < 2) thin.push(`${tid}(최소 ${min})`);
    }
    const sample = byTeam[ids[0]];
    const cnt = {};
    for (const r of sample) cnt[r.position] = (cnt[r.position] ?? 0) + 1;
    console.log(`    ${lid.padEnd(20)} ${String(sample.length).padStart(2)}명 · ` +
      FIELD.map((f) => `${f}${cnt[f] ?? 0}`).join(" ") + ` SP${cnt.SP ?? 0} RP${cnt.RP ?? 0}`);
  }
  console.log(`    국내 ${totalNpcs}명 / ${teams}팀`);

  check(`국내 ${teams}팀 전부 야수 8포지션에 백업까지 있다`, thin.length === 0,
    thin.slice(0, 5).join(" "));
  // 로스터 규모가 사용자 확정("현실 기준")대로인가 — 줄어들면 백업 보장이 깨진다
  for (const [lid, want] of Object.entries({
    LEAGUE_HIGHSCHOOL: 30, LEAGUE_UNIVERSITY: 32, LEAGUE_INDEPENDENT: 30,
    LEAGUE_KBL: 30, LEAGUE_KBL_FARM: 34,
  })) {
    check(`  ${lid} 로스터 ${want}명`, rulesFile.rosterRules[lid]?.rosterSize === want,
      `got ${rulesFile.rosterRules[lid]?.rosterSize}`);
  }
}
const grades = [1, 2, 3].map(g => team0.filter(n => n.grade === g).length);
check("고교: 학년 분포 균등(±2)", Math.max(...grades) - Math.min(...grades) <= 2, JSON.stringify(grades));
check("고교: 나이 = ageBase+학년 (고1 = 17세)", team0.every(n => n.age === 16 + n.grade));
check("고교: 졸업연도 정합", team0.every(n => n.graduationYear === 2026 + (3 - n.grade)));

const pOvrs = hs.npcs.filter(n => n.playerType === "pitcher").map(n => n.abilities.pitching.ovr);
check("고교: 투수 OVR 범위 40~72", pOvrs.every(v => v >= 40 && v <= 72), `min=${Math.min(...pOvrs)} max=${Math.max(...pOvrs)}`);
check("고교: 투수도 타격치 보유", hs.npcs.filter(n => n.playerType === "pitcher").every(n => n.abilities.batting));
check("고교: personality 생성 시점 확정", hs.npcs.every(n => n.personality && typeof n.personality.loyalty === "number"));
check("고교: 무계약", hs.npcs.every(n => n.salary === 0 && n.contractYears === 0));
const lefties = hs.npcs.filter(n => n.handedness === "L").length / hs.npcs.length;
check("좌투좌타 비율 20~50%", lefties > 0.2 && lefties < 0.5, `${(lefties*100).toFixed(1)}%`);

// ── 2. 결정성 ─────────────────────────────────────────────────
const hs2 = gen(hsParams);
check("결정성: 같은 시드 = 동일 JSON", JSON.stringify(hs) === JSON.stringify(hs2));
const hs3 = gen({ ...hsParams, worldSeed: 43 });
check("결정성: 다른 시드 = 다른 로스터", JSON.stringify(hs) !== JSON.stringify(hs3));
// 팀별 독립 시드: 팀 목록 축소해도 남은 팀 로스터 불변
const hsSub = gen({ ...hsParams, teams: HS_TEAMS.slice(0, 3) });
const t1Full = hs.npcs.filter(n => n.currentTeam === "TEAM_HS_T1");
const t1Sub  = hsSub.npcs.filter(n => n.currentTeam === "TEAM_HS_T1");
check("팀별 독립 시드: 팀 구성 변화에 불변", JSON.stringify(t1Full) === JSON.stringify(t1Sub));

// ── 3. KBL (프로: 계약·무학년) ────────────────────────────────
const kbl = gen({
  leagueId: "LEAGUE_KBL", seasonYear: 2026, worldSeed: 42,
  teams: [{ teamId: "TEAM_KBL_TWINWOLVES_1" }, { teamId: "TEAM_KBL_SKYGULLS_1" }],
  rules: {
    rosterSize: 28,
    pitchingOvrMin: 55, pitchingOvrMax: 85, battingOvrMin: 55, battingOvrMax: 85,
    devRateMin: 40, devRateMax: 70,
    ageMin: 20, ageMax: 34, withContract: true,
  },
});
check("KBL: 2팀 × 28 = 56명", kbl.npcs.length === 56);
check("KBL: 무학년", kbl.npcs.every(n => n.grade === undefined));
check("KBL: 나이 20~34", kbl.npcs.every(n => n.age >= 20 && n.age <= 34));
check("KBL: 연봉/계약 생성", kbl.npcs.every(n => n.salary > 0 && n.contractYears >= 1));
check("KBL: 경력연차 ≤ 나이-19", kbl.npcs.every(n => n.proServiceYears <= Math.max(0, n.age - 19)));

// ── 4. ABL (국적/이름풀) ──────────────────────────────────────
const abl = gen({
  leagueId: "LEAGUE_ABL", seasonYear: 2026, worldSeed: 42,
  teams: [{ teamId: "TEAM_ABL_EMPIRE_1" }],
  rules: {
    rosterSize: 28,
    pitchingOvrMin: 60, pitchingOvrMax: 90, battingOvrMin: 60, battingOvrMax: 90,
    devRateMin: 40, devRateMax: 70,
    ageMin: 21, ageMax: 36, withContract: true, nationality: "USA",
  },
  namePool: {
    surnames: ["Miller", "Johnson", "Davis", "Garcia", "Rodriguez"],
    givenA: ["Jake", "Tyler", "Chris", "Alex", "Ryan"],
    givenB: [],
    western: true,
  },
});
check("ABL: 국적 USA + 병역 면제", abl.npcs.every(n => n.nationality === "USA" && n.militaryStatus === "면제"));
check("ABL: 서양식 이름", abl.npcs.every(n => / /.test(n.name) && !/[가-힣]/.test(n.name)));

// ── 5. slotdb 연동 — 생성 → INSERT → 조회 왕복 ────────────────
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "roster-slot-"));
const mgr = slotdb.createManager(tmp);
const r = slotdb.dispatch(mgr, "createSlot", {
  slotId: "G1", worldSeed: 42, protagonist: {}, season: {}, npcs: hs.npcs,
});
check("slotdb 연동: 250명 INSERT", r.ok === true && r.npcCount === 250);
const loaded = slotdb.dispatch(mgr, "getByTeam", { slotId: "G1", teamId: "TEAM_HS_T0" });
check("slotdb 연동: 조회 왕복 (능력치 보존)",
  loaded.length === 25 && loaded.every(n => (n.abilities.pitching?.ovr ?? n.abilities.batting?.ovr) > 0));
check("slotdb 연동: personality 보존", loaded.every(n => n.personality?.loyalty >= 40));
mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });

// ── 구종 — Rust 상수 ↔ pitch_catalog.json 대조 ────────────────
//
// Rust는 카탈로그 JSON을 읽지 않는다(콘텐츠라서). 그래서 구종 ID가 코드에 상수로
// 박혀 있고, 카탈로그가 바뀌면 **조용히 어긋난다** — 화면이 구종 이름을 못 찾는다.
// 이 코드베이스의 1번 버그 유형(어휘 드리프트)이라 대조를 테스트로 묶는다.
console.log("\n구종 (Rust ↔ 카탈로그)");
{
  const fs = require("node:fs");
  const path = require("node:path");
  const catRaw = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/training/pitch_catalog.json"), "utf8"));
  const catArr = Array.isArray(catRaw) ? catRaw : (catRaw.pitches ?? Object.values(catRaw).find(Array.isArray));
  const catIds = new Set(catArr.map((p) => p.id));

  const rustSrc = fs.readFileSync(
    path.join(__dirname, "../packages/engine-native/src/roster_gen.rs"), "utf8");
  const rustIds = new Set([...rustSrc.matchAll(/"(PITCH_[A-Z_]+)"/g)].map((m) => m[1]));
  console.log(`    카탈로그 ${catIds.size}종 · Rust 상수 ${rustIds.size}종`);

  const notInCatalog = [...rustIds].filter((id) => !catIds.has(id));
  check("Rust가 쓰는 구종이 전부 카탈로그에 있다", notInCatalog.length === 0,
    notInCatalog.join(","));

  const rulesFile2 = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));
  const refs2 = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
  const kbl = refs2.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const npcs = gen({
    leagueId: "LEAGUE_KBL", seasonYear: 2029, worldSeed: 4242,
    teams: kbl.map((t) => ({ teamId: t.id, schoolId: "" })),
    rules: rulesFile2.rosterRules.LEAGUE_KBL,
  }).npcs;
  const P = npcs.filter((n) => n.playerType === "pitcher");
  const B = npcs.filter((n) => n.playerType !== "pitcher");

  check("투수 전원이 구종을 갖는다", P.every((n) => (n.abilities.pitches ?? []).length > 0));
  check("투수 전원이 패스트볼을 갖는다",
    P.every((n) => (n.abilities.pitches ?? []).some((x) => x.id === "PITCH_FASTBALL")));
  check("야수에는 구종이 없다", B.every((n) => !n.abilities.pitches));

  const unknown = new Set();
  for (const n of P) for (const x of n.abilities.pitches ?? []) if (!catIds.has(x.id)) unknown.add(x.id);
  check("생성된 구종이 전부 카탈로그에 있다", unknown.size === 0, [...unknown].join(","));

  const dist = {};
  for (const n of P) {
    const k = (n.abilities.pitches ?? []).length;
    dist[k] = (dist[k] ?? 0) + 1;
  }
  console.log(`    구종 수 분포: ${Object.entries(dist).sort().map(([k, v]) => `${k}종 ${v}명`).join(" ")}`);
  // 전원이 같은 개수면 성숙도가 안 먹은 것이다
  check("구종 수가 선수마다 다르다 (성숙도 반영)", Object.keys(dist).length >= 2,
    Object.keys(dist).join(","));

  // 카탈로그에 있는데 아무도 안 쓰는 구종이 너무 많으면 풀이 좁다는 뜻
  const used = new Set(P.flatMap((n) => (n.abilities.pitches ?? []).map((x) => x.id)));
  console.log(`    실제 등장 구종 ${used.size}/${catIds.size}종`);
  check("카탈로그 구종 대부분이 실제로 등장한다", used.size >= catIds.size - 1,
    `미등장: ${[...catIds].filter((i) => !used.has(i)).join(",")}`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
