"use strict";
// Phase 4-1 마이그레이션 러너 검증
// 실행: ELECTRON_RUN_AS_NODE=1 npx electron scripts/test-migration.cjs
//
// 이 테스트가 지키는 것: "컬럼을 추가하면 기존 슬롯에도 실제로 반영된다"
// (docs/AUDIT_2026-07.md B3 — schema_version을 쓰기만 하고 읽지 않던 결함의 회귀 방지)

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const Database = require("better-sqlite3");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slotdb-migration-"));
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

// ── 1. 새 슬롯은 최신 버전으로 생성된다 ───────────────────────────
{
  const db = slotdb.openSlot(tmpDir, "fresh");
  check("새 슬롯: user_version = SCHEMA_VERSION",
    slotdb.currentVersion(db) === slotdb.SCHEMA_VERSION,
    `got ${slotdb.currentVersion(db)}, want ${slotdb.SCHEMA_VERSION}`);
  check("새 슬롯: meta.schema_version 사본 일치",
    db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value
      === String(slotdb.SCHEMA_VERSION));
  check("새 슬롯: npc 테이블 존재",
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='npc'").get());
  db.close();
}

// ── 2. 재오픈은 멱등 (마이그레이션이 다시 안 돈다) ────────────────
{
  const db1 = slotdb.openSlot(tmpDir, "idem");
  db1.prepare("INSERT INTO meta (key,value) VALUES ('canary','1')").run();
  db1.close();

  const db2 = slotdb.openSlot(tmpDir, "idem");
  check("재오픈: 기존 데이터 보존",
    db2.prepare("SELECT value FROM meta WHERE key='canary'").get()?.value === "1");
  check("재오픈: 버전 불변", slotdb.currentVersion(db2) === slotdb.SCHEMA_VERSION);
  const r = slotdb.migrate(db2);
  check("migrate() 재호출: applied 비어있음", r.applied.length === 0, JSON.stringify(r));
  db2.close();
}

// ── 3. 레거시 슬롯(user_version=0, 스키마는 이미 있음) 흡수 ───────
// 구버전은 CREATE TABLE IF NOT EXISTS로만 깔고 user_version을 안 세웠다.
{
  const p = path.join(tmpDir, "slot3_legacy.db");
  const raw = new Database(p);
  raw.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  raw.prepare("INSERT INTO meta (key,value) VALUES ('schema_version','3')").run();
  raw.prepare("INSERT INTO meta (key,value) VALUES ('world_seed','777')").run();
  check("레거시 픽스처: user_version = 0", raw.pragma("user_version", { simple: true }) === 0);
  raw.close();

  const db = slotdb.openSlot(tmpDir, "legacy");
  check("레거시: 마이그레이션 후 최신 버전",
    slotdb.currentVersion(db) === slotdb.SCHEMA_VERSION);
  check("레거시: 기존 meta 보존",
    db.prepare("SELECT value FROM meta WHERE key='world_seed'").get()?.value === "777");
  check("레거시: 누락 테이블 생성됨",
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='npc'").get());
  db.close();
}

// ── 4. 컬럼 추가가 기존 슬롯에 실제로 반영된다 (B3 회귀 방지) ─────
// 러너에 임시 마이그레이션을 끼워 넣어 "다음 버전이 생기면 어떻게 되는지"를 검증한다.
{
  const db = slotdb.openSlot(tmpDir, "addcol");
  check("사전: 컬럼 없음", !slotdb.hasColumn(db, "npc", "test_added_col"));

  const NEXT = slotdb.SCHEMA_VERSION + 1;
  slotdb.MIGRATIONS.push({
    v: NEXT,
    name: "test — npc.test_added_col",
    up(d) { slotdb.addColumn(d, "npc", "test_added_col", "TEXT"); },
  });

  const r = slotdb.migrate(db);
  check("컬럼 추가 마이그레이션 적용됨", r.applied.includes(NEXT), JSON.stringify(r));
  check("실제로 컬럼이 생겼다", slotdb.hasColumn(db, "npc", "test_added_col"));
  check("user_version 전진", slotdb.currentVersion(db) === NEXT);

  // 같은 마이그레이션 재실행이 안전한가 (addColumn이 존재 검사를 하는가)
  db.pragma(`user_version = ${slotdb.SCHEMA_VERSION}`);
  let threw = null;
  try { slotdb.migrate(db); } catch (e) { threw = e; }
  check("up() 재실행 안전 (duplicate column 없음)", threw === null, String(threw));

  slotdb.MIGRATIONS.pop();
  db.close();
}

// ── 5. 실패한 마이그레이션은 롤백된다 ─────────────────────────────
{
  const db = slotdb.openSlot(tmpDir, "rollback");
  const before = slotdb.currentVersion(db);
  const NEXT = slotdb.SCHEMA_VERSION + 1;
  slotdb.MIGRATIONS.push({
    v: NEXT,
    name: "test — 중간에 실패",
    up(d) {
      slotdb.addColumn(d, "npc", "doomed_col", "TEXT");
      throw new Error("의도적 실패");
    },
  });

  let threw = null;
  try { slotdb.migrate(db); } catch (e) { threw = e; }
  check("실패 시 throw", threw !== null);
  check("실패 시 버전 롤백", slotdb.currentVersion(db) === before,
    `got ${slotdb.currentVersion(db)}, want ${before}`);
  check("실패 시 컬럼도 롤백", !slotdb.hasColumn(db, "npc", "doomed_col"));

  slotdb.MIGRATIONS.pop();
  db.close();
}

// ── 6. 매니저 경유 정상 동작 (회귀) ───────────────────────────────
{
  const mgr = slotdb.createManager(tmpDir);
  const res = slotdb.dispatch(mgr, "createSlot", {
    slotId: "M1", worldSeed: 42, protagonist: { name: "테스트" }, season: {}, npcs: [],
  });
  check("매니저 경유 createSlot", !res.error, JSON.stringify(res));
  check("매니저 경유 getMeta", slotdb.dispatch(mgr, "getMeta", { slotId: "M1" }).world_seed === "42");
  mgr.closeAll();
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
