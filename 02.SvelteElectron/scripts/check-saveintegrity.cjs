"use strict";
/**
 * **깨진 세이브는 어느 칸이 왜 못 여는지 말한다** — `npm run check:saveintegrity`
 *   (정본 `docs/PLAN_103_2026-09-27.md §4` 세이브 무결성 줄)
 *
 * 무결성 검사는 **읽는 쪽**(`apps/desktop/ipc/slotdb.cjs` 의 `verifySlot`)에
 * 하나만 있다. 여기서는 그 함수가 실제로 **거부하는가**를 픽스처로 센다.
 *
 * ## 픽스처 셋 — 깨는 방식마다 하나
 *
 *   ① 칸 빠짐     `npc.military_status` 칼럼을 지운다
 *   ② 칸 빠짐     주인공 JSON 에서 `careerStage` 를 뺀다
 *   ③ 주인공 없음  `protagonist` 행을 지운다
 *   ④ 팀 id 없음   `npc.current_team` 에 refs 밖 id 를 넣는다
 *   ⑤ 리그 id 없음 `npc.current_league` 에 refs 밖 id 를 넣는다
 *   ⑥ 버전 미래    `user_version` 을 최신 + 1 로 올린다
 *   ⑦ 표 빠짐     `standings` 표를 지운다
 *
 * 🔴 **대조군이 둘 있다.** 깨는 검사만 있으면 「전부 거부한다」로도 초록이 된다:
 *   ⓐ 갓 만든 슬롯(마이그레이션만 돈 빈 슬롯)은 **그대로 열린다**
 *   ⓑ 테스터 세이브 **사본**이 그대로 열린다(원본은 읽기만 · `SAVE_FIXTURE` 로 가리킨다)
 *
 * ⚠ **원본을 절대 안 건드린다.** 픽스처는 임시 폴더에 새로 만들거나 사본을 뜬다.
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`).
 *
 * 쓰는 법:
 *   npm run check:saveintegrity
 *   SAVE_FIXTURE=C:\...\slot3_slot_1.db npm run check:saveintegrity   ← ⓑ 까지 본다
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const slotdb = require("../apps/desktop/ipc/slotdb.cjs");

let bad = 0;
const log = (s) => process.stdout.write(s + "\n");
const ok = (name, extra) => log(`  ok  ${name}${extra ? " — " + extra : ""}`);
const fail = (name, why) => {
  bad++;
  log(`  🔴 ${name} — ${why}`);
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "saveint-"));
const slotPath = (dir, id) => path.join(dir, `slot3_${id}.db`);

/** 갓 만든 빈 슬롯 하나 — 픽스처의 원본이 된다 */
function freshSlot(id) {
  const dir = path.join(TMP, id);
  fs.mkdirSync(dir, { recursive: true });
  const db = slotdb.openSlot(dir, id);
  db.close();
  return dir;
}

/** 빈 슬롯에 **열 수 있는 최소 세이브**를 적는다 — 여기서부터 하나씩 깬다 */
function seedSlot(dir, id) {
  const db = new Database(slotPath(dir, id));
  const saved = {
    version: 1,
    savedAt: new Date().toISOString(),
    protagonist: {
      id: "PLY_HERO",
      name: "검사용",
      careerStage: "highschool",
      age: 16,
      pitching: { velocity: 50, control: 50, command: 50, stamina: 50, recovery: 50, ovr: 50 },
    },
    schoolState: {},
  };
  db.prepare("INSERT OR REPLACE INTO protagonist (id, json) VALUES (1, ?)").run(
    JSON.stringify(saved),
  );
  db.prepare(
    "INSERT OR REPLACE INTO npc (npc_id, name, age, career_status, current_league, current_team, military_status, abilities_json)" +
      " VALUES (?,?,?,?,?,?,?,?)",
  ).run("NPC_1", "가상", 17, "active", "LEAGUE_HIGHSCHOOL", "TEAM_HS_AEWOL", "미필", "{}");
  db.close();
}

/** 픽스처 하나 — `mutate(db)` 로 깨고, 거부 이유에 `want` 가 들어야 한다 */
function fixture(name, mutate, want) {
  const id = "fx" + String(Math.abs(hash(name)) % 100000);
  const dir = freshSlot(id);
  seedSlot(dir, id);
  const db = new Database(slotPath(dir, id));
  try {
    mutate(db);
  } finally {
    db.close();
  }
  let err = null;
  try {
    const opened = slotdb.openSlot(dir, id);
    opened.close();
  } catch (e) {
    err = e;
  }
  if (!err) {
    fail(name, "거부하지 않았다 — 깨진 세이브가 그대로 열린다");
    return;
  }
  if (err.name !== "SaveIntegrityError") {
    fail(name, `다른 오류로 죽었다: ${err.name} ${err.message.slice(0, 80)}`);
    return;
  }
  const msg = err.message;
  if (!msg.includes(want)) {
    fail(name, `이유가 그 칸을 안 말한다 (기대 "${want}")\n        ${msg.split("\n").join("\n        ")}`);
    return;
  }
  // 원본이 그대로 있나 + 사본을 떴나
  if (!fs.existsSync(slotPath(dir, id))) {
    fail(name, "원본이 사라졌다 — 못 여는 세이브를 지우면 안 된다");
    return;
  }
  if (err.backups.length === 0) {
    fail(name, "사본을 안 떴다");
    return;
  }
  ok(name, `${want} · 사본 ${err.backups.length}`);
}

/** 이름 → 안정된 수 (슬롯 폴더를 겹치지 않게) · 정규식·해시 라이브러리 없이 */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

log("");
log("── check:saveintegrity (읽는 쪽 정본 = slotdb.verifySlot) ──");
log("");
log(`[깨진 세이브 픽스처] 스키마 버전 ${slotdb.SCHEMA_VERSION}`);

// ① 칼럼 빠짐 — SQLite 는 DROP COLUMN 을 지원한다(3.35+)
fixture(
  "① npc.military_status 칼럼이 없다",
  (db) => db.exec("ALTER TABLE npc DROP COLUMN military_status"),
  "npc.military_status",
);

// ② 주인공 JSON 의 필수 칸 빠짐
fixture(
  "② 주인공 JSON 에 careerStage 가 없다",
  (db) => {
    const row = db.prepare("SELECT json FROM protagonist WHERE id = 1").get();
    const saved = JSON.parse(row.json);
    delete saved.protagonist.careerStage;
    db.prepare("UPDATE protagonist SET json = ? WHERE id = 1").run(JSON.stringify(saved));
  },
  "protagonist.json.protagonist.careerStage",
);

// ③ JSON 자체가 깨짐
fixture(
  "③ 주인공 JSON 이 깨졌다",
  (db) => db.prepare("UPDATE protagonist SET json = ? WHERE id = 1").run('{"version":1,'),
  "protagonist.json",
);

// ④ 팀 id 가 refs 에 없다
fixture(
  "④ npc.current_team 이 refs 에 없다",
  (db) => db.prepare("UPDATE npc SET current_team = ? WHERE npc_id = ?").run("TEAM_NOPE", "NPC_1"),
  "npc.current_team",
);

// ⑤ 리그 id 가 refs 에 없다
fixture(
  "⑤ npc.current_league 이 refs 에 없다",
  (db) =>
    db.prepare("UPDATE npc SET current_league = ? WHERE npc_id = ?").run("LEAGUE_NOPE", "NPC_1"),
  "npc.current_league",
);

// ⑥ 버전이 미래다 — 마이그레이션 **전에** 막아야 한다
fixture(
  "⑥ user_version 이 미래다",
  (db) => db.pragma(`user_version = ${slotdb.SCHEMA_VERSION + 1}`),
  "PRAGMA user_version",
);

// ⑦ 표가 없다
fixture("⑦ standings 표가 없다", (db) => db.exec("DROP TABLE standings"), "표 standings");

log("");
log("[목록·사본] 막힌 슬롯이 사라지지 않는다 · 사본이 불어나지 않는다");

// ⑧ 슬롯 목록에서 **사라지지 않는다** — 예전엔 손상 슬롯을 통째로 뺐다.
//    사용자가 보기엔 「세이브가 그냥 없어졌다」가 된다(2026-08-06 과 같은 꼴).
{
  const id = "listbrk";
  const dir = freshSlot(id);
  seedSlot(dir, id);
  {
    const db = new Database(slotPath(dir, id));
    db.prepare("UPDATE npc SET current_team = ? WHERE npc_id = ?").run("TEAM_NOPE", "NPC_1");
    db.close();
  }
  const mgr = slotdb.createManager(dir);
  const rows = slotdb.dispatch(mgr, "listSlots", {});
  mgr.closeAll();
  const row = Array.isArray(rows) ? rows.find((r) => r.slotId === id) : null;
  if (!row) fail("⑧ 막힌 슬롯이 목록에 남는다", "목록에서 사라졌다 — 왜 못 여는지 말할 자리가 없다");
  else if (!row.broken || !Array.isArray(row.broken.problems) || row.broken.problems.length === 0) {
    fail("⑧ 막힌 슬롯이 목록에 남는다", "broken.problems 가 비었다 — 화면이 이유를 못 그린다");
  } else {
    ok("⑧ 막힌 슬롯이 목록에 남는다", `broken.problems ${row.broken.problems.length}건`);
  }
}

// ⑨ 사본이 **한 번만** 뜬다 — 목록을 새로 고칠 때마다 79MB 를 복사하면 안 된다
{
  const id = "bkonce";
  const dir = freshSlot(id);
  seedSlot(dir, id);
  {
    const db = new Database(slotPath(dir, id));
    db.prepare("UPDATE npc SET current_league = ? WHERE npc_id = ?").run("LEAGUE_NOPE", "NPC_1");
    db.close();
  }
  const tryOpen = () => {
    try {
      slotdb.openSlot(dir, id).close();
    } catch {
      /* 거부가 정상이다 */
    }
  };
  tryOpen();
  tryOpen();
  tryOpen();
  const prefix = `slot3_${id}.db.broken-`;
  const copies = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && !f.endsWith("-wal") && !f.endsWith("-shm"));
  if (copies.length === 1) ok("⑨ 세 번 열어도 사본은 하나다");
  else fail("⑨ 사본이 불어난다", `세 번 열었더니 사본 ${copies.length}개`);
}

log("");
log("[🔴 대조군] 멀쩡한 세이브는 그대로 열린다");

// ⓐ 갓 만든 빈 슬롯 — 주인공이 없다. 「깨졌다」로 읽으면 새 게임이 막힌다
{
  const id = "freshok";
  const dir = freshSlot(id);
  try {
    const db = slotdb.openSlot(dir, id);
    db.close();
    ok("ⓐ 갓 만든 빈 슬롯이 열린다 (주인공이 아직 없다)");
  } catch (e) {
    fail("ⓐ 갓 만든 빈 슬롯", `열리지 않았다: ${e.message.split("\n")[0]}`);
  }
}

// ⓑ 씨를 심은 슬롯 — 픽스처의 출발점이 통과해야 ①~⑦ 이 뜻을 가진다
{
  const id = "seedok";
  const dir = freshSlot(id);
  seedSlot(dir, id);
  try {
    const db = slotdb.openSlot(dir, id);
    db.close();
    ok("ⓑ 픽스처의 출발점이 열린다 — 깨기 전에는 초록이다");
  } catch (e) {
    fail("ⓑ 픽스처 출발점", `열리지 않았다: ${e.message.split("\n")[0]}`);
  }
}

// ⓒ 테스터 세이브 **사본** — 진짜 세이브가 그대로 열리나
{
  const src = process.env.SAVE_FIXTURE;
  if (!src) {
    log("  ⏸  ⓒ 테스터 세이브 — SAVE_FIXTURE 가 없어 건너뛴다 (원본은 읽기만 한다)");
  } else if (!fs.existsSync(src)) {
    fail("ⓒ 테스터 세이브", `SAVE_FIXTURE 가 가리키는 파일이 없다: ${src}`);
  } else {
    const id = "tester";
    const dir = path.join(TMP, id);
    fs.mkdirSync(dir, { recursive: true });
    // **사본만 만진다** — 원본은 한 바이트도 안 건드린다
    fs.copyFileSync(src, slotPath(dir, id));
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(src + suffix)) fs.copyFileSync(src + suffix, slotPath(dir, id) + suffix);
    }
    try {
      const db = slotdb.openSlot(dir, id);
      const n = db.prepare("SELECT COUNT(*) AS n FROM npc").get().n;
      db.close();
      ok("ⓒ 테스터 세이브 사본이 그대로 열린다", `NPC ${n}명`);
    } catch (e) {
      fail("ⓒ 테스터 세이브 사본", `열리지 않았다\n        ${e.message.split("\n").join("\n        ")}`);
    }
  }
}

log("");
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  // 임시 폴더를 못 지워도 검사 결과는 그대로다
}
if (bad > 0) {
  log(`  🔴 어긴 항목 ${bad}개`);
  log("");
  process.exitCode = 1;
}
