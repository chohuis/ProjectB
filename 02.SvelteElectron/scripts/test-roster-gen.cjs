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
  // 🔴 예전엔 국내(depth: true)만 백업 2명을 못 박았다. 해외 1군은 정원 28이라
  //   **RF가 1명뿐이고 전 팀이 그랬다** (2026-09-06 실측 · ABL 16/16 · JBL 12/12) —
  //   야수 8자리를 두 바퀴 돌려면 16이 필요한데 `pitcherRatio` 0.45 × 28 = 12.6 →
  //   투수 13이 먼저 잘려 야수에 15자리만 남았다.
  //   **2026-09-07 정원을 30으로 올려 풀었다**(`BALANCE_BACKLOG §8` · 결정 ⑬).
  //   그래서 이제 **해외도 depth: true** 다 — 다시 얇아지면 여기서 잡힌다.
  const PLAN = [
    ["LEAGUE_HIGHSCHOOL",  byL.LEAGUE_HIGHSCHOOL ?? [],                              true],
    ["LEAGUE_UNIVERSITY",  byL.LEAGUE_UNIVERSITY ?? [],                              true],
    ["LEAGUE_INDEPENDENT", byL.LEAGUE_INDEPENDENT ?? [],                             true],
    ["LEAGUE_KBL",         (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_1")),   true],
    ["LEAGUE_KBL_FARM",    (byL.LEAGUE_KBL ?? []).filter((i) => i.endsWith("_2")),   true],
    ["LEAGUE_ABL",         (byL.LEAGUE_ABL ?? []).filter((i) => !i.endsWith("_2")),  true],
    ["LEAGUE_ABL_FARM",    (byL.LEAGUE_ABL ?? []).filter((i) => i.endsWith("_2")),   true],
    ["LEAGUE_JBL",         (byL.LEAGUE_JBL ?? []).filter((i) => !i.endsWith("_2")),  true],
    ["LEAGUE_JBL_FARM",    (byL.LEAGUE_JBL ?? []).filter((i) => i.endsWith("_2")),   true],
  ];
  let teams = 0, thin = [], totalNpcs = 0;
  const genSize = {};                       // lid → 실제로 생성된 팀당 인원 집합
  for (const [lid, ids, depth] of PLAN) {
    const rule = rulesFile.rosterRules[lid];
    if (!rule || ids.length === 0) { check(`${lid} 규칙·팀 존재`, false, "없음"); continue; }
    const out = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify({
      leagueId: lid, seasonYear: 2029, worldSeed: 4242,
      teams: ids.map((id) => ({ teamId: id, schoolId: "" })), rules: rule,
    })));
    const byTeam = {};
    for (const n of out.npcs) (byTeam[n.currentTeam] ??= []).push(n);
    genSize[lid] = new Set(Object.values(byTeam).map((r) => r.length));
    if (depth) {
      totalNpcs += out.npcs.length;
      for (const [tid, roster] of Object.entries(byTeam)) {
        teams++;
        const cnt = {};
        for (const r of roster) cnt[r.position] = (cnt[r.position] ?? 0) + 1;
        const min = Math.min(...FIELD.map((f) => cnt[f] ?? 0));
        if (min < 2) thin.push(`${tid}(최소 ${min})`);
      }
    }
    const sample = byTeam[ids[0]];
    const cnt = {};
    for (const r of sample) cnt[r.position] = (cnt[r.position] ?? 0) + 1;
    // ⚠ CP(마무리)까지 적는다. 예전 줄은 SP·RP만 적어 **합이 정원보다 1 적었고**
    //   "31명인데 포지션 합이 30"으로 읽혔다
    console.log(`    ${lid.padEnd(20)} ${String(sample.length).padStart(2)}명 · ` +
      FIELD.map((f) => `${f}${cnt[f] ?? 0}`).join(" ") +
      ` SP${cnt.SP ?? 0} CP${cnt.CP ?? 0} RP${cnt.RP ?? 0}`);
  }
  console.log(`    국내+해외 ${totalNpcs}명 / ${teams}팀`);

  check(`${teams}팀 전부 야수 8포지션에 백업까지 있다`, thin.length === 0,
    thin.slice(0, 5).join(" "));

  // ── 정원 — **규칙 파일이 정본이다. 여기에 숫자를 또 적지 않는다** ──────
  //
  // 🔴 2026-09-06: 여기 `{HIGHSCHOOL:30, UNIVERSITY:32, ...}` 표가 박혀 있었고
  //   고교만 빨강이 났다. `rosterRules.LEAGUE_HIGHSCHOOL.rosterSize`는 2026-08-31
  //   사용자 확정으로 **30 → 31**(포수 3명)이 됐는데 **검사의 사본만 안 고쳐졌다.**
  //   `hsCatcherSupply.test.ts`는 31로 이미 고쳐져 있었다 — 같은 숫자가 세 군데
  //   있었고 한 군데만 남았던 것이다.
  //
  //   숫자를 두 벌 적으면 한쪽만 고쳐진 채 남는다. 표를 지우고 **불변식**을 잰다:
  //     ① 규칙 ↔ 생성기가 같은가 — 생성기가 규칙을 안 따르면 여기서 잡힌다
  //     ② rosterMin ≤ rosterSize ≤ rosterMax — 만들자마자 유지 상한을 넘지 않는다
  //     ③ 정원이 줄어 백업이 깨지는 건 위 `thin` 검사가 이미 잡는다
  //        (예전 표가 지키려던 것이 그거다)
  for (const [lid, ids] of PLAN.map(([l, i]) => [l, i])) {
    const rule = rulesFile.rosterRules[lid];
    if (!rule || ids.length === 0) continue;
    const sizes = [...(genSize[lid] ?? [])];
    check(`  ${lid} 규칙 ${rule.rosterSize}명 = 생성 ${sizes.join("/")}`,
      sizes.length === 1 && sizes[0] === rule.rosterSize,
      `rules=${rule.rosterSize} gen=${sizes.join("/")}`);
    check(`  ${lid} 정원이 유지 상하한 안에 있다 (${rule.rosterMin}~${rule.rosterMax})`,
      rule.rosterSize >= rule.rosterMin && rule.rosterSize <= rule.rosterMax,
      `rosterSize=${rule.rosterSize}`);
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

// ── 외국인 선수 (F-2a) ────────────────────────────────────────
//
// KBL은 **진행 중인 리그**다. 새 게임 시작 시점에 이미 외국인이 있어야 하고,
// 그 수는 KBO와 같은 보유 3명·투수 최대 2명이다.
//
// ⚠ 검사는 "무엇을 하는가"를 본다 — 규칙 파일의 숫자를 읽어 그대로 대조한다.
// 여기 3/2를 다시 적으면 규칙을 바꿨을 때 이 파일이 거짓말을 한다.
console.log("\n외국인 선수");
{
  const fs = require("node:fs");
  const path = require("node:path");
  const rf = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/players/generation_rules.json"), "utf8"));
  const refs3 = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
  const F = rf.foreignRules;
  check("foreignRules 존재", !!F);

  const first = refs3.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const farm  = refs3.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_2"));

  const mk = (lid, teams, foreign) => gen({
    leagueId: lid, seasonYear: 2029, worldSeed: 4242,
    teams: teams.map((t) => ({ teamId: t.id, schoolId: "" })),
    rules: rf.rosterRules[lid],
    ...(foreign ? { foreign: F } : {}),
  }).npcs;

  const one = mk("LEAGUE_KBL", first, true);
  const byTeam = {};
  for (const n of one) (byTeam[n.currentTeam] ??= []).push(n);

  const bad = [];
  for (const [tid, roster] of Object.entries(byTeam)) {
    const f = roster.filter((n) => n.nationality === F.nationality);
    const fp = f.filter((n) => n.playerType === "pitcher");
    if (f.length !== F.perTeam || fp.length > F.maxPitchers) {
      bad.push(`${tid}(외국인 ${f.length}/투수 ${fp.length})`);
    }
  }
  check(`1군 전 팀이 외국인 ${F.perTeam}명·투수 ${F.maxPitchers}명 이하`,
    bad.length === 0, bad.join(" "));

  const fgn = one.filter((n) => n.nationality === F.nationality);
  check("정원은 그대로 (외국인이 자리를 늘리지 않는다)",
    one.length === first.length * rf.rosterRules.LEAGUE_KBL.rosterSize,
    `${one.length}`);
  check("외국인은 병역 대상이 아니다", fgn.every((n) => n.militaryStatus === "면제"));
  check("외국인은 단년 계약", fgn.every((n) => n.contractYears === 1));
  check("외국인 이름이 서양식 (공백 포함)", fgn.every((n) => n.name.includes(" ")));
  check("내국인 이름에는 공백이 없다",
    one.filter((n) => n.nationality !== F.nationality).every((n) => !n.name.includes(" ")));

  const ages = fgn.map((n) => n.age);
  check(`외국인 나이가 ${F.ageMin}~${F.ageMax}`,
    ages.every((a) => a >= F.ageMin && a <= F.ageMax),
    `${Math.min(...ages)}~${Math.max(...ages)}`);

  const ovrOf = (n) => n.playerType === "pitcher"
    ? (n.abilities.pitching?.ovr ?? 0) : (n.abilities.batting?.ovr ?? 0);
  const ovrs = fgn.map(ovrOf);
  const lo = Math.min(...ovrs), hi = Math.max(...ovrs);
  const avg = ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
  console.log(`    외국인 ${fgn.length}명 · OVR ${lo}~${hi} (평균 ${avg.toFixed(1)})`);
  // 대박/쪽박 편차가 의도다 — 전원이 비슷하면 추첨이 아니라 배급이다
  check("외국인 OVR 편차가 존재한다", hi - lo >= 15, `폭 ${hi - lo}`);

  const dom = one.filter((n) => n.nationality !== F.nationality).map(ovrOf);
  const domAvg = dom.reduce((a, b) => a + b, 0) / dom.length;
  console.log(`    내국인 ${dom.length}명 · 평균 OVR ${domAvg.toFixed(1)}`);
  check("외국인 평균이 내국인보다 높다", avg > domAvg, `${avg.toFixed(1)} vs ${domAvg.toFixed(1)}`);

  // 2군에는 넣지 않는다 — 보유 한도 계산이 흐려진다
  check("foreignRules.leagues에 2군이 없다", !F.leagues.includes("LEAGUE_KBL_FARM"));
  const farmNpcs = mk("LEAGUE_KBL_FARM", farm, false);
  check("2군에는 외국인이 없다",
    farmNpcs.every((n) => n.nationality !== F.nationality));

  // foreign 미전달 시 기존 동작과 동일해야 한다 (rng 순서 포함)
  const noF = mk("LEAGUE_KBL", first, false);
  check("foreign 없이 생성하면 전원 내국인",
    noF.every((n) => n.nationality !== F.nationality));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
