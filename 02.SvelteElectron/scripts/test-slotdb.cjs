"use strict";
// R3a slotdb 검증 — 커맨드 실행 후 npc 행/거래기록/조회 3자 일치 확인
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-slotdb.cjs
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slotdb-test-"));
const mgr = slotdb.createManager(tmpDir);
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { console.log(`  ok  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const call = (cmd, payload) => slotdb.dispatch(mgr, cmd, payload);

function mkNpc(id, team, league, over = {}) {
  return {
    npcId: id, name: `선수${id}`, age: 22,
    currentTeam: team, currentLeague: league,
    abilities: { pitching: { ovr: 70, velocity: 72, control: 68 } },
    xp: { pitchingXp: { velocity: 3 } },
    salary: 3000, contractYears: 2, proServiceYears: 1,
    ...over,
  };
}

// ── 1. 슬롯 생성 ──────────────────────────────────────────────
const r1 = call("createSlot", {
  slotId: "T1", worldSeed: 12345, name: "테스트",
  protagonist: { id: "PLY_HERO", name: "주인공" },
  season: { seasonYear: 2026, currentWeek: 1 },
  npcs: [
    mkNpc("P1", "TEAM_KBL_TWINWOLVES_1", "LEAGUE_KBL", { isNamed: true }),
    mkNpc("P2", "TEAM_KBL_TWINWOLVES_1", "LEAGUE_KBL"),
    mkNpc("P3", "TEAM_KBL_SKYGULLS_1", "LEAGUE_KBL"),
    mkNpc("P4", "TEAM_HS_SEOUL_INNOVATION", "LEAGUE_HIGHSCHOOL", { grade: 3, schoolId: "SCHOOL_HS_SEOUL" }),
  ],
});
check("createSlot", r1.ok === true && r1.npcCount === 4);
check("meta.worldSeed", call("getMeta", { slotId: "T1" }).world_seed === "12345");
check("protagonist 왕복", call("getProtagonist", { slotId: "T1" }).name === "주인공");
check("능력치 동거 (JSON 컬럼)", call("getNpc", { slotId: "T1", npcId: "P1" }).abilities.pitching.ovr === 70);

// ── 2. FA 이적 — 3자 일치 ────────────────────────────────────
call("transfer", {
  slotId: "T1", npcId: "P3", toTeamId: "TEAM_KBL_TWINWOLVES_1",
  seasonYear: 2026, week: 10, category: "fa", detail: "FA 계약", salary: 8000, contractYears: 4,
});
const p3 = call("getNpc", { slotId: "T1", npcId: "P3" });
check("이적: npc 행 반영", p3.currentTeam === "TEAM_KBL_TWINWOLVES_1" && p3.salary === 8000 && p3.contractYears === 4);
const twRoster = call("getByTeam", { slotId: "T1", teamId: "TEAM_KBL_TWINWOLVES_1" });
check("이적: 로스터 조회 반영", twRoster.length === 3);
const faTx = call("getTransactions", { slotId: "T1", seasonYear: 2026, category: "fa" });
check("이적: 거래기록 반영", faTx.length === 1 && faTx[0].from_team_id === "TEAM_KBL_SKYGULLS_1" && faTx[0].to_team_id === "TEAM_KBL_TWINWOLVES_1");

// ── 3. 트레이드 (swap) — 원자성 ──────────────────────────────
const r3 = call("swapTeams", {
  slotId: "T1", seasonYear: 2026, week: 20, detail: "포지션 보강",
  a: { npcId: "P1", toTeamId: "TEAM_KBL_SKYGULLS_1" },
  b: { npcId: "P3", toTeamId: "TEAM_KBL_TWINWOLVES_1" },
});
check("트레이드: 양방향 반영",
  call("getNpc", { slotId: "T1", npcId: "P1" }).currentTeam === "TEAM_KBL_SKYGULLS_1");
const tradeTx = call("getTransactions", { slotId: "T1", category: "trade" });
check("트레이드: groupId 묶음 2건", tradeTx.length === 2 && tradeTx[0].group_id === tradeTx[1].group_id && tradeTx[0].group_id === r3.groupId);

// 트레이드 원자성: 존재하지 않는 npc 포함 시 전체 롤백
const before = call("getNpc", { slotId: "T1", npcId: "P2" }).currentTeam;
const rFail = call("swapTeams", {
  slotId: "T1", seasonYear: 2026, week: 21,
  a: { npcId: "P2", toTeamId: "TEAM_KBL_SKYGULLS_1" },
  b: { npcId: "NOPE", toTeamId: "TEAM_KBL_TWINWOLVES_1" },
});
check("트레이드: 실패 시 전체 롤백",
  rFail.error !== undefined || call("getNpc", { slotId: "T1", npcId: "P2" }).currentTeam === before,
  `error=${JSON.stringify(rFail)}`);
check("롤백: P2 팀 불변", call("getNpc", { slotId: "T1", npcId: "P2" }).currentTeam === before);
check("롤백: 거래기록 오염 없음", call("getTransactions", { slotId: "T1", category: "trade" }).length === 2);

// ── 4. 드래프트 ───────────────────────────────────────────────
call("assignDraft", {
  slotId: "T1", seasonYear: 2026, week: 51,
  picks: [{ npcId: "P4", teamId: "TEAM_KBL_SKYGULLS_1", leagueId: "LEAGUE_KBL", round: 1, pickNo: 3, salary: 5000, contractYears: 3 }],
});
const p4 = call("getNpc", { slotId: "T1", npcId: "P4" });
check("드래프트: 팀/리그/학적 정리", p4.currentTeam === "TEAM_KBL_SKYGULLS_1" && p4.currentLeague === "LEAGUE_KBL" && p4.grade === undefined && p4.proServiceYears === 0);
check("드래프트: 거래기록", call("getTransactions", { slotId: "T1", category: "draft" })[0].detail === "R1 P3");

// ── 5. 군입대/전역 — 원소속 복귀 ─────────────────────────────
call("enlist", { slotId: "T1", npcId: "P2", unit: "sports", enlistYear: 2026, dischargeYear: 2028, seasonYear: 2026, week: 52 });
const p2m = call("getNpc", { slotId: "T1", npcId: "P2" });
check("입대: 상태/원소속 기록", p2m.careerStatus === "military" && p2m.militaryStatus === "현역" && p2m.military.originalTeamId === "TEAM_KBL_TWINWOLVES_1");
call("discharge", { slotId: "T1", npcId: "P2", seasonYear: 2028 });
const p2d = call("getNpc", { slotId: "T1", npcId: "P2" });
check("전역: 원소속 복귀 + 군필", p2d.currentTeam === "TEAM_KBL_TWINWOLVES_1" && p2d.militaryStatus === "군필" && p2d.careerStatus === "active");

// ── 6. 주간 갱신 (성장 결과 저장 + 부상 set/clear) ────────────
call("updateWeekly", { slotId: "T1", updates: [
  { npcId: "P1", abilities: { pitching: { ovr: 72, velocity: 74, control: 68 } }, injury: { type: "ELBOW_INFLAM", weeksLeft: 3 } },
]});
const p1w = call("getNpc", { slotId: "T1", npcId: "P1" });
check("주간갱신: 능력치+부상", p1w.abilities.pitching.ovr === 72 && p1w.injury.weeksLeft === 3);
call("updateWeekly", { slotId: "T1", updates: [{ npcId: "P1", clearInjury: true }] });
check("주간갱신: 부상 해제", call("getNpc", { slotId: "T1", npcId: "P1" }).injury === undefined);

// ── 7. 은퇴 + 커리어 라인 ─────────────────────────────────────
call("retire", { slotId: "T1", npcId: "P1", seasonYear: 2030, detail: "노쇠" });
check("은퇴: 상태 전환", call("getNpc", { slotId: "T1", npcId: "P1" }).careerStatus === "retired");
call("appendCareerHistory", { slotId: "T1", rows: [
  { npcId: "P1", year: 2026, leagueId: "LEAGUE_KBL", teamId: "TEAM_KBL_SKYGULLS_1", statLine: "10승 5패 ERA 3.20", stats: { type: "pitcher", w: 10, l: 5 } },
]});
check("커리어 라인 왕복", call("getCareerHistory", { slotId: "T1", npcId: "P1" })[0].stats.w === 10);
check("경력 이벤트 조회 (transactions 겸용)",
  call("getTransactions", { slotId: "T1", npcId: "P1" }).map((t) => t.category).sort().join(",") === "retirement,trade");

// ── 7.5 getAllNpcs / syncNpcs (시즌 경계 벌크) ────────────────
check("getAllNpcs: 전원 조회", call("getAllNpcs", { slotId: "T1" }).length === 4);
call("syncNpcs", { slotId: "T1", npcs: [
  mkNpc("P2", "TEAM_KBL_TWINWOLVES_1", "LEAGUE_KBL", {
    age: 25, abilities: { pitching: { ovr: 80 } }, extra: { fame: 42 },
  }),
  mkNpc("P9", "TEAM_KBL_SKYGULLS_1", "LEAGUE_KBL"),  // 신규 upsert
]});
const p2s = call("getNpc", { slotId: "T1", npcId: "P2" });
check("syncNpcs: 기존 행 교체", p2s.age === 25 && p2s.abilities.pitching.ovr === 80 && p2s.extra.fame === 42);
check("syncNpcs: 신규 행 삽입", call("getNpc", { slotId: "T1", npcId: "P9" }) !== null);
check("syncNpcs: 거래기록 미오염 (벌크는 tx 기록 없음)",
  call("getTransactions", { slotId: "T1", npcId: "P9" }).length === 0);

// ── 8. 슬롯 목록/삭제 (파일=슬롯) ─────────────────────────────
call("createSlot", { slotId: "T2", worldSeed: 999, protagonist: {}, season: {}, npcs: [] });
check("listSlots 2개", call("listSlots").length === 2);
call("deleteSlot", { slotId: "T2" });
check("deleteSlot → 파일 제거", call("listSlots").length === 1 && !fs.existsSync(path.join(tmpDir, "slot3_T2.db")));

// ── 정리 ─────────────────────────────────────────────────────
mgr.closeAll();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
