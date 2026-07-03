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
    gradeMax: 3, ageBase: 16,
  },
};
const hs = gen(hsParams);
check("고교: 10팀 × 25 = 250명", hs.npcs.length === 250, `got ${hs.npcs.length}`);
check("고교: npcId 전체 유니크", new Set(hs.npcs.map(n => n.npcId)).size === 250);

const team0 = hs.npcs.filter(n => n.currentTeam === "TEAM_HS_T0");
const posSet = new Set(team0.map(n => n.position));
check("고교: 야수 8포지션 커버", ["C","1B","2B","3B","SS","LF","CF","RF"].every(p => posSet.has(p)));
check("고교: SP 3명 이상", team0.filter(n => n.position === "SP").length >= 3);
const grades = [1, 2, 3].map(g => team0.filter(n => n.grade === g).length);
check("고교: 학년 분포 균등(±2)", Math.max(...grades) - Math.min(...grades) <= 2, JSON.stringify(grades));
check("고교: 나이 = 16+학년", team0.every(n => n.age === 16 + n.grade));
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

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
