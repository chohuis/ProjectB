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

/**
 * 심층 비교 — 객체 키 순서는 무시한다.
 * readSeason은 메타를 펼친 뒤 컬렉션을 붙이므로 키 순서가 원본과 다르다.
 * JS에서 키 순서에 의존하는 코드는 없고(HMAC 미구현), 순서를 보존하려면
 * 키 목록을 따로 저장해야 해서 과설계다 — 내용만 같으면 된다.
 */
function deepEq(a, b, pathStr = "$") {
  if (a === b) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${pathStr}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${pathStr}: 배열/객체 불일치`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${pathStr}: 길이 ${a.length} !== ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = deepEq(a[i], b[i], `${pathStr}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) {
    const only = (x, y) => x.filter((k) => !y.includes(k));
    return `${pathStr}: 키 불일치 (좌측만: ${only(ka, kb)} / 우측만: ${only(kb, ka)})`;
  }
  for (const k of ka) {
    const d = deepEq(a[k], b[k], `${pathStr}.${k}`);
    if (d) return d;
  }
  return null;
}
function checkEq(name, got, want) {
  const d = deepEq(want, got);
  check(name, d === null, d ? `\n      ${d}` : "");
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

// ── 7. v2: season 왕복이 정확한가 (메모리 형태 무변경 보장) ───────
function makeSeasonFixture() {
  return {
    version: 1, savedAt: "2026-07-29T00:00:00.000Z",
    leagueId: "LEAGUE_HIGHSCHOOL", seasonYear: 2026,
    currentWeek: 12, currentDate: "2026-06-01", totalWeeks: 52,
    pendingActions: [{ kind: "game", scheduleId: "SCH_W12_G1" }],
    triggeredEvents: { EVT_A: 3 },
    // 주인공 리그 미러 (top-level)
    schedule: [
      { id: "SCH_W01_G1", week: 1, gameDate: "2026-03-07", leagueId: "LEAGUE_HIGHSCHOOL",
        homeTeamId: "T_A", awayTeamId: "T_B", isProtagonistGame: true, phase: "season",
        result: { homeScore: 3, awayScore: 2, winnerId: "T_A", loserId: "T_B", playerLines: [], events: [] } },
      { id: "SCH_W12_G1", week: 12, gameDate: "2026-06-01", leagueId: "LEAGUE_HIGHSCHOOL",
        homeTeamId: "T_A", awayTeamId: "T_C", isProtagonistGame: true, phase: "season" },
    ],
    standings: [
      { teamId: "T_A", wins: 8, losses: 2, draws: 0, winPct: 0.8, runsFor: 44, runsAgainst: 21, streak: "W3", last10: "8W2L0D" },
      { teamId: "T_B", wins: 5, losses: 5, draws: 0, winPct: 0.5, runsFor: 30, runsAgainst: 30, streak: "L1", last10: "5W5L0D" },
    ],
    stats: { "PLY_1": { type: "pitcher", w: 4, l: 1, era: 2.31 } },
    // 나머지 리그 (disjoint)
    leagueSchedules: {
      LEAGUE_KBL: [
        { id: "KBL_W01_G1", week: 1, gameDate: "2026-03-07", leagueId: "LEAGUE_KBL",
          homeTeamId: "K_A", awayTeamId: "K_B", isProtagonistGame: false, phase: "season" },
      ],
      LEAGUE_ABL: [],   // 빈 배열도 복원돼야 한다
    },
    leagueState: {
      LEAGUE_HIGHSCHOOL: {
        standings: [{ teamId: "T_A", wins: 8, losses: 2, draws: 0, winPct: 0.8, runsFor: 44, runsAgainst: 21, streak: "W3", last10: "8W2L0D" }],
        stats: { "PLY_1": { type: "pitcher", w: 4, l: 1, era: 2.31 } },
        playerConditions: { "PLY_1": { fatigue: 72, lastPitchedWeek: 11, pitchOutsLast: 18 } },
        teamRotationIndex: { T_A: 2 },
      },
      LEAGUE_JBL: { standings: [], stats: {}, playerConditions: {}, teamRotationIndex: {} },  // 전부 비어도 키는 남아야
    },
    postseasonBrackets: {}, ablEastTeams: ["K_A"], ablWestTeams: ["K_B"],
    npcInjuries: {}, npcRetired: [], npcLiveStats: {},
    prevSeasonKblStandings: [],
  };
}

{
  const mgr = slotdb.createManager(tmpDir);
  const fx = makeSeasonFixture();
  slotdb.dispatch(mgr, "createSlot", { slotId: "S1", worldSeed: 1, protagonist: {}, season: fx, npcs: [] });
  const back = slotdb.dispatch(mgr, "getSeason", { slotId: "S1" });

  checkEq("season 왕복: 내용 완전 일치", back, fx);

  // 개별 확인 (실패 시 어디가 깨졌는지 바로 보이게)
  check("  · 주인공 리그 schedule 2건", back.schedule.length === 2);
  check("  · schedule 순서 보존", back.schedule[0].id === "SCH_W01_G1");
  check("  · result 보존", back.schedule[0].result?.homeScore === 3);
  check("  · top-level standings 2건", back.standings.length === 2);
  check("  · leagueSchedules 분리 유지", back.leagueSchedules.LEAGUE_KBL.length === 1);
  check("  · 빈 배열 리그 키 보존", Array.isArray(back.leagueSchedules.LEAGUE_ABL) && back.leagueSchedules.LEAGUE_ABL.length === 0);
  check("  · playerConditions 보존", back.leagueState.LEAGUE_HIGHSCHOOL.playerConditions.PLY_1.fatigue === 72);
  check("  · teamRotationIndex 보존", back.leagueState.LEAGUE_HIGHSCHOOL.teamRotationIndex.T_A === 2);
  check("  · 전부 빈 leagueState 키 보존", !!back.leagueState.LEAGUE_JBL);
  check("  · 스칼라 메타 보존", back.currentWeek === 12 && back.leagueId === "LEAGUE_HIGHSCHOOL");

  // 재저장 후에도 동일 (setSeason 경로)
  slotdb.dispatch(mgr, "setSeason", { slotId: "S1", data: back });
  const twice = slotdb.dispatch(mgr, "getSeason", { slotId: "S1" });
  checkEq("season 재저장 후에도 동일", twice, fx);

  // 행 단위로 실제 쪼개졌는가
  const db = mgr.get("S1");
  check("schedule 테이블에 3행", db.prepare("SELECT COUNT(*) n FROM schedule").get().n === 3);
  check("season_stats 테이블에 2행", db.prepare("SELECT COUNT(*) n FROM season_stats").get().n === 2);
  check("has_result 인덱스 컬럼 채워짐",
    db.prepare("SELECT COUNT(*) n FROM schedule WHERE has_result = 1").get().n === 1);
  check("구 season 테이블 제거됨",
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='season'").get());
  mgr.closeAll();
}

// ── 8. v2: 레거시 블롭이 실제로 옮겨지는가 ────────────────────────
{
  const p = path.join(tmpDir, "slot3_v1blob.db");
  const raw = new Database(p);
  raw.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE season (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);`);
  raw.pragma("user_version = 1");   // v1까지만 적용된 슬롯
  raw.prepare("INSERT INTO season (id, json) VALUES (1, ?)").run(JSON.stringify(makeSeasonFixture()));
  raw.close();

  const mgr = slotdb.createManager(tmpDir);
  const back = slotdb.dispatch(mgr, "getSeason", { slotId: "v1blob" });
  checkEq("레거시 블롭 → 테이블 이관 성공", back, makeSeasonFixture());
  check("레거시 슬롯도 최신 버전", slotdb.currentVersion(mgr.get("v1blob")) === slotdb.SCHEMA_VERSION);
  mgr.closeAll();
}

// ── 9. 지금 스키마로 만든 슬롯이 목록에 뜨는가 ────────────────────
//
// ⚠ **불러오기가 통째로 죽어 있었다** (2026-08-06). `listSlotsV3`가
// `schema_version === "3"`으로 못 박혀 있어서, 스키마가 v4로 오른 뒤
// **만들어진 모든 슬롯이 목록에서 사라졌다** — 세이브 파일은 21MB로 멀쩡한데
// 게임은 "저장된 기록이 없습니다"라고 했다.
//
// 한 숫자를 두 뜻으로 쓴 게 원인이다. 파일명의 "3"은 세이브 **구조 세대**고
// `schema_version`은 마이그레이션이 늘 때마다 오르는 **번호**다.
{
  const src = fs.readFileSync(
    path.join(process.cwd(), "apps/ui/src/shared/repo/slotLifecycleV3.ts"), "utf8");
  const min = Number(/MIN_SLOT_SCHEMA = (\d+)/.exec(src)?.[1]);
  check("목록 하한을 코드에서 읽었다", Number.isFinite(min));
  check(`지금 스키마(v${slotdb.SCHEMA_VERSION})로 만든 슬롯이 목록에 뜬다 (하한 v${min})`,
    slotdb.SCHEMA_VERSION >= min);
  // 등호로 되돌아가면 다음 마이그레이션에서 또 사라진다.
  // ⚠ **목록과 로드 두 군데다.** 목록만 고쳤을 때 슬롯은 보이는데 누르면
  // "저장 파일을 불러오지 못했습니다"가 떴다
  const sites = src.match(/schema_version\) >= MIN_SLOT_SCHEMA/g) ?? [];
  check(`하한 비교가 목록·로드 두 곳 다 숫자다 (${sites.length}곳)`, sites.length === 2);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
