"use strict";
/**
 * **좁게 읽고 넓게 되쓰지 않는가** — 저장 칼럼 계약 전수 검사.
 * `npm run check:savecolumns`
 *
 * 🔴 이 저장소가 실제로 겪은 사고 (실사용자 세이브 · 2026-09-05):
 *
 *   `getAllNpcs` 가 은퇴자를 **칼럼을 골라** 읽었다(36%가 은퇴자라 블롭이
 *   무겁다). 그 목록에 `military_status` 가 없었다. `syncNpcs` 는 스토어
 *   전체를 **넓게 되쓰므로**, 안 읽은 칼럼이 삽입 폴백으로 덮였다:
 *
 *       military_status  은퇴자 869명 전원 '미필' (36세 KBL 은퇴자까지)
 *       development_rate 869명 전원 50 · potential_hidden 869명 전원 75
 *       salary           869명 전원 0 · abilities_json 869명 전원 14바이트
 *
 *   그리고 Rust `NpcSaveState.military_status` 는 `String`(옵션 아님)이라
 *   드래프트 수락에서 `missing field` 로 게임이 죽었다.
 *
 * 여기서 막는 것 셋:
 *
 *   R2  좁은 읽기 목록이 **표를 다 덮는가** — 칼럼이 새로 생기면 걸린다.
 *       손 목록끼리 대조하지 않는다. **진짜 DB 에 `PRAGMA` 로 물어본다.**
 *   R1  npc 한 명을 심고 → 좁게 읽고 → 되쓰고 → 다시 읽으면 **처음과 같은가**
 *       (세계 전체 왕복은 `check:roundtrip` 이 본다. 여기는 그 단위판이다)
 *   R3  좁게 읽은 결과에 **`undefined` 가 없는가** — `JSON.stringify` 가
 *       키째 빼고, Rust 의 옵션 아닌 필드가 그걸 `missing field` 로 거부한다
 *
 * ⚠ **vitest 에 못 넣는다.** `better-sqlite3` 는 electron ABI 로 빌드돼 있어
 *   노드에서 열리지 않는다(`NODE_MODULE_VERSION` 불일치). 그래서 다른
 *   슬롯 검사들처럼 electron 아래서 돈다.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const assert = require("node:assert");

const ROOT = process.cwd();
const slotdb = require(path.join(ROOT, "apps/desktop/ipc/slotdb.cjs"));

/**
 * **일부러 안 읽는 칸** — 무겁고, 은퇴자에게는 쓸 데가 없다.
 *
 * ⚠ 이 목록에 뭘 더할 때는 `syncNpcs` 의 `*Lite` 갈래도 같이 봐야 한다.
 *   안 읽은 블롭을 되쓰면 **빈 값이 기존 값을 지운다** — 그게 이번 사고의
 *   두 번째 절반이었다.
 */
const BLOB_COLUMNS = new Set([
  "abilities_json", "xp_json", "form_json", "personality_json",
  "injury_json", "extra_json",
  "emotion_json",   // 폐기됨 (Phase 6C) — 아무도 안 쓴다
]);

/**
 * Rust 가 **반드시 요구하는** npc 필드 (`NpcSaveState` 에서 옵션이 아닌 것).
 * 하나라도 `undefined` 로 오면 `JSON.stringify` 가 키째 빼고 Rust 가 거부한다.
 */
const REQUIRED = [
  "npcId", "name", "playerType", "position", "handedness", "jerseyNumber",
  "age", "schoolId", "graduationYear", "nationality", "careerStatus",
  "currentLeague", "currentTeam", "salary", "contractYears", "proServiceYears",
  "militaryStatus", "developmentRate", "potentialHidden",
];

/** 값이 서로 다르게 채워진 은퇴자 — 폴백값(50·75·0·'미필')을 전부 피한다 */
const RETIRED = {
  npcId: "PLY_CT_001", name: "왕복", nameEn: "Roundtrip", isNamed: true,
  playerType: "pitcher", position: "SP", handedness: "L", jerseyNumber: 71,
  age: 36, grade: null, schoolId: "SCH_CT", graduationYear: 2011,
  nationality: "JPN", careerStatus: "retired",
  currentLeague: "LEAGUE_RETIRED", currentTeam: "TEAM_CT",
  salary: 31500, contractYears: 3, proServiceYears: 14,
  militaryStatus: "완료",
  military: { kind: "sangmu", year: 2015 },
  developmentRate: 61, potentialHidden: 88,
  abilities: { pitching: { ovr: 71, velocity: 70 } },
  xp: { pitchingXp: { velocity: 120 } },
  form: { hot: 3 }, personality: { loyalty: 44 },
  injury: { type: "ARM_FATIGUE" }, extra: { note: "왕복" },
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message.split("\n")[0]}`); }
}

function withDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savecols-"));
  const db = slotdb.openSlot(dir, "CT");
  try { return fn(db); }
  finally {
    try { db.close(); } catch { /* 임시 폴더다 */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* OS 가 치운다 */ }
  }
}

const npcColumns = (db) => db.prepare("PRAGMA table_info(npc)").all().map((c) => c.name);
const ship = (x) => JSON.parse(JSON.stringify(x));   // 스토어 → IPC 가 지나는 그 지점
const readNarrow = (db, id) =>
  slotdb._commands.getAllNpcs(db, {}).find((n) => n.npcId === id);

console.log("[저장 칼럼 계약]");

// ── R2 ───────────────────────────────────────────────────────────
//
// 🔴 **손 목록은 반드시 뒤처진다.** `RETIRED_NPC_COLUMNS` 가
//   `military_status` 를 빠뜨린 것이 그 형태였다. 그러니 목록을 **표와**
//   맞춰 본다 — 칼럼이 새로 생기면 여기서 걸리고, 그때 "읽을 것인가"를
//   **결정하게 된다.** 결정이 강제되는 것이 이 검사의 값이다.
check("R2 좁은 읽기 목록이 블롭 말고 하나도 안 빠뜨린다", () => withDb((db) => {
  const cols = npcColumns(db);
  const should = cols.filter((c) => !BLOB_COLUMNS.has(c)).sort();
  const have = [...slotdb.RETIRED_NPC_COLUMNS].sort();
  const missing = should.filter((c) => !have.includes(c));
  const extra = have.filter((c) => !should.includes(c));
  assert.deepStrictEqual(
    { missing, extra }, { missing: [], extra: [] },
    `목록이 표와 어긋난다 — 빠진 칸 [${missing}] · 표에 없는 칸 [${extra}]`);
}));

check("R2 블롭 목록이 표에 실제로 있는 칼럼만 가리킨다", () => withDb((db) => {
  const cols = new Set(npcColumns(db));
  for (const b of BLOB_COLUMNS) assert.ok(cols.has(b), `${b} 가 표에 없다`);
}));

// ── R1 ───────────────────────────────────────────────────────────
check("R1 은퇴자 한 명이 왕복해도 값이 안 지워진다", () => withDb((db) => {
  slotdb._commands.insertNpcs(db, { npcs: [RETIRED] });
  const read = readNarrow(db, RETIRED.npcId);
  assert.ok(read, "은퇴자가 목록에서 사라졌다");
  slotdb._commands.syncNpcs(db, { npcs: [ship(read)] });
  const row = db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(RETIRED.npcId);
  const want = {
    military_status: "완료", development_rate: 61, potential_hidden: 88,
    salary: 31500, contract_years: 3, pro_service_years: 14,
    nationality: "JPN", jersey_number: 71, graduation_year: 2011,
    name_en: "Roundtrip", handedness: "L", position: "SP",
  };
  for (const [k, v] of Object.entries(want)) {
    assert.strictEqual(row[k], v, `${k}: ${row[k]} (기대 ${v})`);
  }
  // 안 읽고 온 블롭은 **기존 값이 남아야 한다** — 빈 값으로 덮이면 안 된다
  assert.strictEqual(JSON.parse(row.abilities_json).pitching.ovr, 71, "abilities 가 지워졌다");
  assert.strictEqual(JSON.parse(row.xp_json).pitchingXp.velocity, 120, "xp 가 지워졌다");
  assert.strictEqual(JSON.parse(row.form_json).hot, 3, "form 이 지워졌다");
  assert.strictEqual(JSON.parse(row.personality_json).loyalty, 44, "personality 가 지워졌다");
  assert.strictEqual(JSON.parse(row.injury_json).type, "ARM_FATIGUE", "injury 가 지워졌다");
  assert.strictEqual(JSON.parse(row.extra_json).note, "왕복", "extra 가 지워졌다");
}));

check("R1 현역은 블롭까지 그대로 왕복한다", () => withDb((db) => {
  const active = { ...RETIRED, npcId: "PLY_CT_002", careerStatus: "active", age: 22 };
  slotdb._commands.insertNpcs(db, { npcs: [active] });
  slotdb._commands.syncNpcs(db, { npcs: [ship(readNarrow(db, active.npcId))] });
  const row = db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(active.npcId);
  assert.strictEqual(row.military_status, "완료");
  assert.strictEqual(JSON.parse(row.abilities_json).pitching.velocity, 70);
  assert.strictEqual(JSON.parse(row.personality_json).loyalty, 44);
}));

// 한 번만 보면 **서서히 깎이는 것**을 놓친다
check("R1 두 번 왕복해도 같다", () => withDb((db) => {
  slotdb._commands.insertNpcs(db, { npcs: [RETIRED] });
  let snap = "";
  for (let i = 0; i < 2; i++) {
    slotdb._commands.syncNpcs(db, { npcs: [ship(readNarrow(db, RETIRED.npcId))] });
    const now = JSON.stringify(db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(RETIRED.npcId));
    if (i === 0) snap = now;
    else assert.strictEqual(now, snap, "두 번째 왕복에서 또 달라졌다");
  }
}));

// ── R3 ───────────────────────────────────────────────────────────
//
// 🔴 **`undefined` 는 조용히 사라진다.** `JSON.stringify` 가 그 키를 통째로
//   빼고, Rust 쪽 옵션 아닌 필드(`pub military_status: String`)가 그걸
//   `missing field` 로 거부한다 — 값이 있고 타입도 맞아 보이는데 IPC 를
//   건너는 순간 없어지는 형태다.
//
// ⚠ **`null` 과 다르다.** `null` 은 살아서 건너가 Rust 에서 기본값이 된다.
//   여기서 보는 것은 `undefined` 뿐이다.
check("R3 은퇴자(좁은 읽기)에 undefined 가 없다", () => withDb((db) => {
  slotdb._commands.insertNpcs(db, { npcs: [RETIRED] });
  const read = readNarrow(db, RETIRED.npcId);
  const holes = REQUIRED.filter((k) => read[k] === undefined);
  assert.deepStrictEqual(holes, [], `IPC 를 건너면 사라질 키: ${holes.join(", ")}`);
}));

// 값이 없는 행(전부 기본값)으로도 본다 — 「값이 있어서 안 걸렸다」를 막는다
check("R3 기본값뿐인 은퇴자도 undefined 가 없다", () => withDb((db) => {
  slotdb._commands.insertNpcs(db, { npcs: [{
    npcId: "PLY_CT_003", name: "빈값", age: 30, careerStatus: "retired",
  }] });
  const read = readNarrow(db, "PLY_CT_003");
  const holes = REQUIRED.filter((k) => read[k] === undefined);
  assert.deepStrictEqual(holes, [], `사라질 키: ${holes.join(", ")}`);
}));

// 두 갈래가 갈리면 **은퇴하는 순간 값이 바뀐다**
check("R3 좁게 읽은 것과 넓게 읽은 것이 스칼라에서 같다", () => withDb((db) => {
  slotdb._commands.insertNpcs(db, { npcs: [RETIRED] });
  const narrow = readNarrow(db, RETIRED.npcId);
  const wide = slotdb._commands.getNpc(db, { npcId: RETIRED.npcId });
  for (const k of REQUIRED) {
    assert.strictEqual(narrow[k], wide[k], `${k}: 좁게 ${narrow[k]} · 넓게 ${wide[k]}`);
  }
}));

console.log(failed === 0 ? "\n  ok  저장 칼럼 계약 전부 통과" : `\n  FAIL  ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
