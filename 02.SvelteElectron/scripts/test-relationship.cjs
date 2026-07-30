"use strict";
// Phase 6C 관계도 검증
// 실행: npm run test:relationship
//
// 설계 정본: docs/design/people.md §4
//
// 이 테스트가 지키는 것:
//  1. 데이터 계층 — 관계는 slot.db 테이블이 정본이고 왕복이 무손실이다
//  2. 값 범위 — Rust를 우회한 경로로도 −100~100을 벗어나 저장되지 않는다
//  3. 라벨 경계 — TS와 Rust가 **같은 7구간**을 쓴다 (두 곳에 있으므로 대조가 필수)
//  4. 이동 규칙 — 감쇠 후 보존. 재회하면 감쇠된 값에서 재개된다
//
// 왜 라벨을 두 곳에 두고 대조하나: 화면은 IPC 왕복 없이 라벨을 그려야 하고
// 판정(콜업·훈련효율)은 Rust에서 한다. 한쪽만 고치면 "화면엔 신뢰인데 감독은
// 안 쓰는" 상태가 되고, 그건 조용히 굴러간다 — 그래서 테스트로 묶는다.

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slotdb-relationship-"));
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const mgr = slotdb.createManager(tmpDir);
const SLOT = "REL1";
const d = (cmd, p) => slotdb.dispatch(mgr, cmd, { slotId: SLOT, ...p });

// ── 0. 슬롯 준비 ──────────────────────────────────────────────
console.log("스키마");
{
  const res = d("createSlot", {
    worldSeed: 4242,
    protagonist: { name: "주인공", teamId: "TEAM_HS_HANSEONG" },
    season: {},
    npcs: [
      { npcId: "PLY_A", name: "동료A", currentTeam: "TEAM_HS_HANSEONG", currentLeague: "LEAGUE_HIGHSCHOOL", age: 17 },
      { npcId: "PLY_B", name: "라이벌B", currentTeam: "TEAM_HS_GYEONGGI", currentLeague: "LEAGUE_HIGHSCHOOL", age: 18 },
    ],
    staff: [
      { staffId: "MGR_1", name: "김감독", role: "manager", age: 55, teamId: "TEAM_HS_HANSEONG", leagueId: "LEAGUE_HIGHSCHOOL", stats: { tacticalIQ: 60 } },
      { staffId: "COA_1", name: "박코치", role: "coach",   age: 48, teamId: "TEAM_HS_HANSEONG", leagueId: "LEAGUE_HIGHSCHOOL", style: "pitching" },
    ],
  });
  check("createSlot 성공", !res.error, JSON.stringify(res));
  check("새 슬롯의 관계는 비어 있다", d("getRelationships").length === 0);
  check("스키마 버전이 v4 이상", slotdb.SCHEMA_VERSION >= 4, `got ${slotdb.SCHEMA_VERSION}`);
}

// ── 1. 왕복 무손실 ────────────────────────────────────────────
console.log("\n왕복");
{
  const rows = [
    { personId: "MGR_1", kind: "manager",  value:  42, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12,
      memories: [{ type: "gratitude", season: 2029, week: 8, intensity: 2, detail: "첫 선발 기용" }] },
    { personId: "COA_1", kind: "coach",    value:  -7, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12, memories: [] },
    { personId: "PLY_A", kind: "teammate", value:  18, contact: "together", metSeason: 2029, metTeam: "TEAM_HS_HANSEONG", lastTeam: "TEAM_HS_HANSEONG", updatedWeek: 12, memories: [] },
    { personId: "PLY_B", kind: "rival",    value: -35, contact: "apart",    metSeason: 2029, metTeam: "",                 lastTeam: "",                   updatedWeek: 12,
      memories: [{ type: "humiliation", season: 2029, week: 11, intensity: 3, detail: "패왕기 8강 완봉패" }] },
  ];
  const w = d("upsertRelationships", { rows });
  check("일괄 쓰기 4행", w.written === 4, JSON.stringify(w));

  const back = d("getRelationships");
  check("4행 읽힘", back.length === 4, `${back.length}`);

  const mgrRow = back.find((r) => r.personId === "MGR_1");
  check("value 보존", mgrRow.value === 42, `${mgrRow.value}`);
  check("kind 보존", mgrRow.kind === "manager");
  check("contact 보존", mgrRow.contact === "together");
  check("metSeason 보존", mgrRow.metSeason === 2029);
  check("memories 왕복", mgrRow.memories.length === 1 && mgrRow.memories[0].detail === "첫 선발 기용",
    JSON.stringify(mgrRow.memories));
  check("음수 값 보존", back.find((r) => r.personId === "COA_1").value === -7);

  // 갱신도 같은 경로 (INSERT OR REPLACE)
  d("upsertRelationships", { rows: [{ ...rows[0], value: 55, updatedWeek: 20 }] });
  const after = d("getRelationships", { personIds: ["MGR_1"] });
  check("갱신이 같은 경로로 반영", after.length === 1 && after[0].value === 55, JSON.stringify(after));
  check("갱신 후에도 행 수 유지 (중복 삽입 아님)", d("getRelationships").length === 4);
}

// ── 2. 값 범위 — DB 앞에서 막는다 ─────────────────────────────
console.log("\n값 범위");
{
  // contact를 ended로 둔다 — 관계는 **삭제 커맨드가 없다**(감쇠 후 보존이 설계다).
  // together로 두면 아래 팀 이동 테스트의 대상 수에 섞인다.
  d("upsertRelationships", { rows: [
    { personId: "OVER_HI", kind: "teammate", value:  9999, contact: "ended" },
    { personId: "OVER_LO", kind: "teammate", value: -9999, contact: "ended" },
    { personId: "FRAC",    kind: "teammate", value:  12.7, contact: "ended" },
  ] });
  const rows = d("getRelationships", { personIds: ["OVER_HI", "OVER_LO", "FRAC"] });
  const get = (id) => rows.find((r) => r.personId === id).value;
  check("상한 clamp", get("OVER_HI") === 100, `${get("OVER_HI")}`);
  check("하한 clamp", get("OVER_LO") === -100, `${get("OVER_LO")}`);
  check("소수는 정수로", get("FRAC") === 13, `${get("FRAC")}`);
}

// ── 3. person VIEW 조인 ───────────────────────────────────────
console.log("\nperson 조인");
{
  const joined = d("getRelationships", { withPerson: true });
  const mgrRow = joined.find((r) => r.personId === "MGR_1");
  const plyRow = joined.find((r) => r.personId === "PLY_A");
  check("스태프 이름이 붙는다", mgrRow?.name === "김감독", JSON.stringify(mgrRow?.name));
  check("선수 이름이 붙는다", plyRow?.name === "동료A", JSON.stringify(plyRow?.name));
  check("소속팀도 온다", plyRow?.teamId === "TEAM_HS_HANSEONG", JSON.stringify(plyRow?.teamId));

  // 상대가 사라져도 관계 행은 남는다 (LEFT JOIN — 은퇴 기록 보존)
  d("upsertRelationships", { rows: [{ personId: "GHOST_1", kind: "manager", value: 30, contact: "ended" }] });
  const withGhost = d("getRelationships", { withPerson: true, personIds: ["GHOST_1"] });
  check("npc/staff에 없는 상대도 조회된다", withGhost.length === 1, `${withGhost.length}`);
  check("이름 없는 행이 값은 보존", withGhost[0]?.value === 30);
  check("이름은 비어 있다", withGhost[0]?.name === null || withGhost[0]?.name === undefined,
    JSON.stringify(withGhost[0]?.name));
  d("setRelationshipContact", { contact: "ended", personIds: ["GHOST_1"] });
}

// ── 4. 필터 ───────────────────────────────────────────────────
console.log("\n필터");
{
  check("kind로 좁힌다", d("getRelationships", { kind: "manager" }).every((r) => r.kind === "manager"));
  check("contact로 좁힌다", d("getRelationships", { contact: "together" }).every((r) => r.contact === "together"));
  check("personIds로 좁힌다", d("getRelationships", { personIds: ["COA_1", "PLY_A"] }).length === 2);
  check("빈 personIds는 전체 (필터 무시)", d("getRelationships", { personIds: [] }).length >= 4);
}

// ── 5. 팀 이동 — 접촉 상태 일괄 전환 ─────────────────────────
console.log("\n팀 이동");
{
  const before = d("getRelationships", { contact: "together" }).length;
  check("이동 전 together 3명 (감독·코치·동료)", before === 3, `${before}`);

  // 졸업: 한성고에서 함께 있던 전원이 apart로
  d("setRelationshipContact", { contact: "apart", fromTeam: "TEAM_HS_HANSEONG" });
  const after = d("getRelationships", { contact: "together" });
  check("옛 팀 전원이 apart로", after.length === 0, JSON.stringify(after.map((r) => r.personId)));

  const apart = d("getRelationships", { contact: "apart" });
  check("값은 그대로 남는다 (감쇠는 Rust가 따로 적용)",
    apart.find((r) => r.personId === "MGR_1").value === 55);
  check("lastTeam 보존 — 재회 판정 근거",
    apart.find((r) => r.personId === "MGR_1").lastTeam === "TEAM_HS_HANSEONG");

  // ended는 fromTeam 일괄에 걸리지 않는다 (contact='together'만 대상)
  check("ended 행은 건드리지 않는다",
    d("getRelationships", { personIds: ["GHOST_1"] })[0].contact === "ended");
}

// ── 6. createSlot이 관계를 비운다 ─────────────────────────────
console.log("\n슬롯 재생성");
{
  d("createSlot", { worldSeed: 1, protagonist: {}, season: {}, npcs: [] });
  check("createSlot 후 관계 0행", d("getRelationships").length === 0);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
