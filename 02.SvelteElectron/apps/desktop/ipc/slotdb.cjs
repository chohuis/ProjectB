"use strict";
// ── R3a: 슬롯 DB v3 — 파일 1개 = 세이브 1개 (DESIGN.md §8.2/§8.4) ──────────
// 원칙:
//  - npc 테이블 1행 = 선수 1명의 전부 (정체성+팀+계약+능력치+XP 동거)
//  - 상태 변이는 이 모듈의 커맨드만 사용 (각 커맨드 = SQLite 트랜잭션 1개)
//  - transactions 테이블이 리그 거래기록과 선수 경력 이벤트를 겸한다 (이중 기록 금지)
//  - electron API를 require하지 않는다 (플레인 노드로 테스트 가능해야 함)

const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

// ── 마이그레이션 (Phase 4-1) ──────────────────────────────────────
// 정본 = `PRAGMA user_version`. meta.schema_version은 사람이 읽는 사본일 뿐이다.
//
// 이전 구현의 결함: 스키마를 `CREATE TABLE IF NOT EXISTS`로만 깔고 schema_version을
// "쓰기만 하고 읽지 않아", 기존 슬롯에 컬럼을 추가하면 조용히 반영되지 않았다
// (docs/AUDIT_2026-07.md B3). 이제 버전이 낮으면 실제로 up()을 돌린다.
//
// 새 마이그레이션 추가법: MIGRATIONS 끝에 { v: 다음번호, name, up(db) } 를 붙인다.
//  - up()은 반드시 **재실행해도 안전**해야 한다 (addColumn 헬퍼가 존재 여부를 검사).
//  - user_version 갱신은 러너가 한다 — up() 안에서 건드리지 말 것.

const BASELINE_SQL = `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 주인공/시즌은 단일행 JSON (구조화는 R4에서 필요 시)
  CREATE TABLE IF NOT EXISTS protagonist (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS season (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );

  -- ── 선수 1명 = 1행 (능력치·XP JSON 동거 — "능력치 없는 선수" 불가) ──
  CREATE TABLE IF NOT EXISTS npc (
    npc_id            TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    name_en           TEXT,
    is_named          INTEGER NOT NULL DEFAULT 0,
    player_type       TEXT NOT NULL DEFAULT 'pitcher',
    position          TEXT NOT NULL DEFAULT '',
    handedness        TEXT NOT NULL DEFAULT 'R',
    jersey_number     INTEGER NOT NULL DEFAULT 0,
    age               INTEGER NOT NULL,
    grade             INTEGER,
    school_id         TEXT NOT NULL DEFAULT '',
    graduation_year   INTEGER NOT NULL DEFAULT 0,
    nationality       TEXT NOT NULL DEFAULT 'KOR',
    career_status     TEXT NOT NULL DEFAULT 'active',
    current_league    TEXT NOT NULL DEFAULT '',
    current_team      TEXT NOT NULL DEFAULT '',
    salary            INTEGER NOT NULL DEFAULT 0,
    contract_years    INTEGER NOT NULL DEFAULT 0,
    pro_service_years INTEGER NOT NULL DEFAULT 0,
    military_status   TEXT NOT NULL DEFAULT '미필',
    military_json     TEXT,
    development_rate  INTEGER NOT NULL DEFAULT 50,
    potential_hidden  INTEGER NOT NULL DEFAULT 75,
    abilities_json    TEXT NOT NULL DEFAULT '{}',
    xp_json           TEXT NOT NULL DEFAULT '{}',
    form_json         TEXT,
    personality_json  TEXT,
    -- ⚠ 폐기됨 (Phase 6C). 구 감정 9축이 여기 있었다. **아무도 쓰지 않는다** —
    -- 컬럼만 남긴 이유는 DROP에 마이그레이션이 필요하고 구 슬롯을 열 때 무해하기
    -- 때문이다. 관계는 relationship 테이블이 정본이다. 여기 새로 쓰지 말 것.
    emotion_json      TEXT,
    injury_json       TEXT,
    extra_json        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_npc_team   ON npc(current_team);
  CREATE INDEX IF NOT EXISTS idx_npc_league ON npc(current_league);
  CREATE INDEX IF NOT EXISTS idx_npc_named  ON npc(is_named) WHERE is_named = 1;

  -- ── 거래/경력 이벤트 통합 (append-only) ─────────────────────────
  CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    season_year    INTEGER NOT NULL,
    week           INTEGER,
    category       TEXT NOT NULL,       -- trade|fa|draft|military|retirement|callup|release
    npc_id         TEXT NOT NULL,
    npc_name       TEXT NOT NULL DEFAULT '',
    from_team_id   TEXT, from_league_id TEXT,
    to_team_id     TEXT, to_league_id   TEXT,
    detail         TEXT,
    group_id       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tx_npc    ON transactions(npc_id);
  CREATE INDEX IF NOT EXISTS idx_tx_season ON transactions(season_year, category);

  -- ── 시즌 종료 확정 라인 (append-only) ───────────────────────────
  CREATE TABLE IF NOT EXISTS career_history (
    npc_id     TEXT NOT NULL,
    year       INTEGER NOT NULL,
    league_id  TEXT NOT NULL,
    team_id    TEXT NOT NULL,
    stat_line  TEXT NOT NULL DEFAULT '',
    stats_json TEXT,
    highlights_json TEXT,
    PRIMARY KEY (npc_id, year, league_id)
  );

  -- ── 리그 히스토리 (연감: 순위/리더/포스트시즌) ───────────────────
  CREATE TABLE IF NOT EXISTS history_league (
    year      INTEGER NOT NULL,
    league_id TEXT NOT NULL,
    kind      TEXT NOT NULL,   -- standings|leaders|postseason
    json      TEXT NOT NULL,
    PRIMARY KEY (year, league_id, kind)
  );
`;

// ── 마이그레이션 헬퍼 ─────────────────────────────────────────────
function hasColumn(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

/** 컬럼이 없을 때만 추가 — up()을 재실행해도 안전하게 만드는 유일한 수단 */
function addColumn(db, table, col, decl) {
  if (!hasColumn(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

// ── v2: season 단일 블롭 분해 ─────────────────────────────────────
// 172팀 세계에서 season 블롭은 시즌당 ~2,635경기 + 4,400선수 성적을 담게 되어
// 매 주 저장마다 통째로 직렬화하는 구조가 한계에 부딪힌다 (DESIGN.md §10 R6a).
//
// **메모리 형태(SaveSeason)는 바꾸지 않는다** — 저장소만 쪼갠다.
// getSeason/setSeason이 유일한 경계이므로(호출부 2곳) 소비자 코드는 무변경.
//
// `bucket` 컬럼: 같은 데이터가 두 자리에 사는 구조를 정확히 복원하기 위한 출처 표시.
//   'primary' → SaveSeason.schedule / .standings / .stats   (주인공 리그 미러)
//   'league'  → .leagueSchedules[id] / .leagueState[id].*
// 둘의 의미론(주인공 리그가 어디로 가는가)에 의존하지 않고 그대로 되돌린다.
const SEASON_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS season_meta (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule (
    bucket     TEXT    NOT NULL,
    league_id  TEXT    NOT NULL DEFAULT '',
    entry_id   TEXT    NOT NULL,
    ord        INTEGER NOT NULL DEFAULT 0,
    week       INTEGER,
    has_result INTEGER NOT NULL DEFAULT 0,
    json       TEXT    NOT NULL,
    PRIMARY KEY (bucket, league_id, entry_id)
  );
  CREATE INDEX IF NOT EXISTS idx_schedule_week    ON schedule(league_id, week);
  CREATE INDEX IF NOT EXISTS idx_schedule_pending ON schedule(has_result) WHERE has_result = 0;

  CREATE TABLE IF NOT EXISTS standings (
    bucket    TEXT    NOT NULL,
    league_id TEXT    NOT NULL DEFAULT '',
    team_id   TEXT    NOT NULL,
    ord       INTEGER NOT NULL DEFAULT 0,
    json      TEXT    NOT NULL,
    PRIMARY KEY (bucket, league_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS season_stats (
    bucket    TEXT NOT NULL,
    league_id TEXT NOT NULL DEFAULT '',
    player_id TEXT NOT NULL,
    json      TEXT NOT NULL,
    PRIMARY KEY (bucket, league_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS idx_season_stats_player ON season_stats(player_id);

  CREATE TABLE IF NOT EXISTS player_condition (
    league_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    json      TEXT NOT NULL,
    PRIMARY KEY (league_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS team_rotation (
    league_id TEXT    NOT NULL,
    team_id   TEXT    NOT NULL,
    idx       INTEGER NOT NULL,
    PRIMARY KEY (league_id, team_id)
  );
`;


const STAFF_TABLES_SQL = `
  -- ── 스태프 1명 = 1행 (Phase 6A) ─────────────────────────────────
  -- 선수(npc)와 **테이블을 나눈다**. OnePitch는 한 테이블에 동거시키고 position으로
  -- 걸렀는데 그 필터가 7곳에 필요했고 5회 이상 누락 버그가 났다 —
  -- 감독이 타순에 서고, 피로도가 쌓이고, 트레이드 후보에 올랐다.
  -- 나누면 SELECT * FROM npc 가 **구조적으로** 스태프를 못 집는다.
  CREATE TABLE IF NOT EXISTS staff (
    staff_id      TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    name_en       TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL,              -- manager | coach | owner
    age           INTEGER NOT NULL,
    team_id       TEXT NOT NULL DEFAULT '',
    league_id     TEXT NOT NULL DEFAULT '',
    school_id     TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    years         INTEGER NOT NULL DEFAULT 0, -- 감독·코치 경력 / 구단주 재임
    style         TEXT NOT NULL DEFAULT '',   -- 스타일 또는 코치 전문 영역
    stats_json    TEXT NOT NULL DEFAULT '{}',
    risk_tolerance INTEGER NOT NULL DEFAULT 50,
    training_buff TEXT NOT NULL DEFAULT '',
    joined_season INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_staff_team ON staff (team_id);
  CREATE INDEX IF NOT EXISTS idx_staff_role ON staff (role);
  CREATE INDEX IF NOT EXISTS idx_staff_league ON staff (league_id);

  -- 공통 조회용 (관계도·이름 표시·거래 기록) — people.md §1-2
  CREATE VIEW IF NOT EXISTS person AS
    SELECT npc_id AS person_id, name, 'player' AS kind, current_team AS team_id,
           current_league AS league_id, age
      FROM npc
    UNION ALL
    SELECT staff_id, name, role, team_id, league_id, age
      FROM staff;
`;

const RELATIONSHIP_TABLES_SQL = `
  -- ── 관계도 (Phase 6C) — people.md §4 ────────────────────────────
  -- **주인공 기준 1:N만** 추적한다. NPC끼리의 관계는 만들지 않는다.
  -- 그래서 상대 person_id가 곧 PRIMARY KEY다 (주인공 컬럼이 없다).
  --
  -- 왜 테이블인가: 구 감정 시스템은 값을 npc 배열 블롭에 얹었다. 한 명의 신뢰도가
  -- 1 올라도 npcs 전체를 다시 써야 했고, 스태프는 npc 배열에 없으니 감독·코치
  -- 관계는 **저장할 자리 자체가 없었다**(emotionRole "manager"/"coach"가 죽은
  -- 분기였던 이유). 대상이 스태프+동료 전원이면 수백 행이라 테이블이 맞다.
  CREATE TABLE IF NOT EXISTS relationship (
    person_id     TEXT PRIMARY KEY,
    kind          TEXT    NOT NULL,                  -- manager|coach|owner|teammate|rival
    value         INTEGER NOT NULL DEFAULT 0,        -- -100 ~ +100 (7단계 라벨은 표시 시 파생)
    -- together = 지금 같은 팀 · apart = 헤어짐(감쇠 대상) · ended = 은퇴/종료(값 동결)
    contact       TEXT    NOT NULL DEFAULT 'together',
    met_season    INTEGER NOT NULL DEFAULT 0,
    met_team      TEXT    NOT NULL DEFAULT '',       -- 처음 만난 팀
    last_team     TEXT    NOT NULL DEFAULT '',       -- 마지막으로 함께 있던 팀 (재회 판정)
    memories_json TEXT    NOT NULL DEFAULT '[]',
    updated_week  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_rel_kind    ON relationship (kind);
  CREATE INDEX IF NOT EXISTS idx_rel_contact ON relationship (contact);
`;

const MIGRATIONS = [
  {
    v: 1,
    name: "baseline — slot.db v3 스키마",
    // 전부 IF NOT EXISTS라 기존 슬롯(user_version=0)에 적용해도 무해하다.
    up(db) { db.exec(BASELINE_SQL); },
  },
  {
    v: 2,
    name: "season 블롭 → schedule/standings/season_stats/player_condition/team_rotation 분해",
    up(db) {
      db.exec(SEASON_TABLES_SQL);
      // 기존 슬롯의 블롭을 실제로 옮긴다 (빈 슬롯이면 no-op)
      const legacy = db.prepare("SELECT json FROM season WHERE id = 1").get();
      if (legacy) {
        let parsed = null;
        try { parsed = JSON.parse(legacy.json); } catch { parsed = null; }
        if (parsed && typeof parsed === "object") writeSeason(db, parsed);
      }
      db.exec("DROP TABLE IF EXISTS season");
    },
  },
  {
    v: 3,
    name: "staff 테이블 + person VIEW (Phase 6A — 스태프를 master.db에서 slot.db로)",
    // 기존 슬롯에는 스태프가 없다. people.md §5가 정한 대로 세이브를 클린 브레이크
    // 하지 않고도 열리게만 해둔다 — 스태프가 빈 슬롯은 화면에 스태프가 안 보일 뿐
    // 크래시하지 않는다. 새 게임부터 채워진다.
    up(db) { db.exec(STAFF_TABLES_SQL); },
  },
  {
    v: 4,
    name: "relationship 테이블 (Phase 6C — 관계도)",
    // 구 감정값(npc.extra_json 의 emotion 9축)은 **옮기지 않는다.** 축이 9→1로
    // 줄어드는데 어느 축을 관계값으로 볼지는 자의적이고, 그 자의적 환산이
    // 세이브에 굳으면 나중에 되돌릴 수 없다. 기존 슬롯은 관계가 빈 상태로
    // 열리고 만나는 사람부터 다시 쌓인다 (세이브 폐기는 사용자 확정).
    up(db) { db.exec(RELATIONSHIP_TABLES_SQL); },
  },
];

const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].v;

function currentVersion(db) {
  return db.pragma("user_version", { simple: true });
}

/**
 * 버전 확인과 적용을 **하나의 IMMEDIATE 트랜잭션**으로 묶는다.
 * 나눠두면 두 커넥션이 동시에 낮은 버전을 읽고 같은 ALTER를 두 번 실행한다
 * (OnePitch가 실제로 겪은 "duplicate column name" 경합).
 */
function migrate(db) {
  const run = db.transaction(() => {
    const from = currentVersion(db);
    const applied = [];
    for (const m of MIGRATIONS) {
      if (m.v <= from) continue;
      m.up(db);
      db.pragma(`user_version = ${m.v}`);
      applied.push(m.v);
    }
    if (applied.length > 0) {
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(String(SCHEMA_VERSION));
    }
    return { from, to: currentVersion(db), applied };
  });
  return run.immediate();
}

// ── season 분해 / 복원 (유일한 변환 지점) ─────────────────────────
// SaveSeason에서 행 단위로 쪼갤 5개 컬렉션. 나머지 필드는 season_meta JSON에 남는다.
const SEASON_ROW_FIELDS = ["schedule", "standings", "stats", "leagueSchedules", "leagueState"];

/** SaveSeason → 테이블들 (전체 교체). 호출자가 트랜잭션을 연다. */
function writeSeason(db, season) {
  for (const t of ["schedule", "standings", "season_stats", "player_condition", "team_rotation"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }

  const insSchedule = db.prepare(
    "INSERT OR REPLACE INTO schedule (bucket, league_id, entry_id, ord, week, has_result, json) VALUES (?,?,?,?,?,?,?)"
  );
  const insStanding = db.prepare(
    "INSERT OR REPLACE INTO standings (bucket, league_id, team_id, ord, json) VALUES (?,?,?,?,?)"
  );
  const insStat = db.prepare(
    "INSERT OR REPLACE INTO season_stats (bucket, league_id, player_id, json) VALUES (?,?,?,?)"
  );
  const insCond = db.prepare(
    "INSERT OR REPLACE INTO player_condition (league_id, player_id, json) VALUES (?,?,?)"
  );
  const insRot = db.prepare(
    "INSERT OR REPLACE INTO team_rotation (league_id, team_id, idx) VALUES (?,?,?)"
  );

  const putSchedule = (bucket, leagueId, list) => {
    if (!Array.isArray(list)) return;
    list.forEach((e, i) => {
      if (!e || typeof e.id !== "string") return;
      insSchedule.run(bucket, leagueId, e.id, i, e.week ?? null, e.result ? 1 : 0, JSON.stringify(e));
    });
  };
  const putStandings = (bucket, leagueId, list) => {
    if (!Array.isArray(list)) return;
    list.forEach((s, i) => {
      if (!s || typeof s.teamId !== "string") return;
      insStanding.run(bucket, leagueId, s.teamId, i, JSON.stringify(s));
    });
  };
  const putStats = (bucket, leagueId, map) => {
    if (!map || typeof map !== "object") return;
    for (const [pid, v] of Object.entries(map)) insStat.run(bucket, leagueId, pid, JSON.stringify(v));
  };

  putSchedule("primary", "", season.schedule);
  putStandings("primary", "", season.standings);
  putStats("primary", "", season.stats);

  for (const [lid, list] of Object.entries(season.leagueSchedules ?? {})) putSchedule("league", lid, list);
  for (const [lid, st] of Object.entries(season.leagueState ?? {})) {
    putStandings("league", lid, st?.standings);
    putStats("league", lid, st?.stats);
    for (const [pid, c] of Object.entries(st?.playerConditions ?? {})) insCond.run(lid, pid, JSON.stringify(c));
    for (const [tid, idx] of Object.entries(st?.teamRotationIndex ?? {})) insRot.run(lid, tid, Number(idx) || 0);
  }

  // 나머지 스칼라·작은 맵 + 빈 컬렉션도 복원해야 하므로 키 목록을 남긴다
  const meta = {};
  for (const [k, v] of Object.entries(season)) {
    if (!SEASON_ROW_FIELDS.includes(k)) meta[k] = v;
  }
  meta.__leagueScheduleIds = Object.keys(season.leagueSchedules ?? {});
  meta.__leagueStateIds = Object.keys(season.leagueState ?? {});
  db.prepare("INSERT OR REPLACE INTO season_meta (id, json) VALUES (1, ?)").run(JSON.stringify(meta));
}

/** 테이블들 → SaveSeason (분해 전과 동일한 형태). 없으면 null. */
function readSeason(db) {
  const metaRow = db.prepare("SELECT json FROM season_meta WHERE id = 1").get();
  if (!metaRow) return null;
  const meta = JSON.parse(metaRow.json);

  const leagueScheduleIds = meta.__leagueScheduleIds ?? [];
  const leagueStateIds = meta.__leagueStateIds ?? [];
  delete meta.__leagueScheduleIds;
  delete meta.__leagueStateIds;

  const season = { ...meta };
  season.schedule = [];
  season.standings = [];
  season.stats = {};
  season.leagueSchedules = Object.fromEntries(leagueScheduleIds.map((id) => [id, []]));
  season.leagueState = Object.fromEntries(leagueStateIds.map((id) => [id, {
    standings: [], stats: {}, playerConditions: {}, teamRotationIndex: {},
  }]));

  const ensureState = (lid) => {
    if (!season.leagueState[lid]) {
      season.leagueState[lid] = { standings: [], stats: {}, playerConditions: {}, teamRotationIndex: {} };
    }
    return season.leagueState[lid];
  };

  for (const r of db.prepare("SELECT bucket, league_id, json FROM schedule ORDER BY bucket, league_id, ord").all()) {
    const e = JSON.parse(r.json);
    if (r.bucket === "primary") season.schedule.push(e);
    else (season.leagueSchedules[r.league_id] ??= []).push(e);
  }
  for (const r of db.prepare("SELECT bucket, league_id, json FROM standings ORDER BY bucket, league_id, ord").all()) {
    const s = JSON.parse(r.json);
    if (r.bucket === "primary") season.standings.push(s);
    else ensureState(r.league_id).standings.push(s);
  }
  for (const r of db.prepare("SELECT bucket, league_id, player_id, json FROM season_stats").all()) {
    const v = JSON.parse(r.json);
    if (r.bucket === "primary") season.stats[r.player_id] = v;
    else ensureState(r.league_id).stats[r.player_id] = v;
  }
  for (const r of db.prepare("SELECT league_id, player_id, json FROM player_condition").all()) {
    ensureState(r.league_id).playerConditions[r.player_id] = JSON.parse(r.json);
  }
  for (const r of db.prepare("SELECT league_id, team_id, idx FROM team_rotation").all()) {
    ensureState(r.league_id).teamRotationIndex[r.team_id] = r.idx;
  }
  return season;
}

// ── 슬롯 파일 관리 ────────────────────────────────────────────────
const SLOT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

function slotFilePath(savesDir, slotId) {
  if (!SLOT_ID_RE.test(slotId)) throw new Error(`invalid slotId: ${slotId}`);
  return path.join(savesDir, `slot3_${slotId}.db`);
}

function openSlot(savesDir, slotId) {
  fs.mkdirSync(savesDir, { recursive: true });
  const db = new Database(slotFilePath(savesDir, slotId));
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

/**
 * @param {object} [hooks]
 * @param {(slotId: string) => void} [hooks.onSlotReset]
 *   그 슬롯의 세계가 새로 시작되거나 사라질 때. **slot.db 밖에 있는 그 슬롯의
 *   흔적**을 지우라는 신호다 — 시즌 기록 세 테이블(`history_*`)이 공용
 *   `projectb_v2.db`에 `slot_id`로만 구분돼 들어 있어서, 여기서 안 지우면
 *   새 게임이 **옛 세계의 순위표를 자기 것으로 읽는다.**
 *   실제로 그렇게 됐다 — 지금 없는 팀 47종이 순위표에 떠 있었다.
 */
function createManager(savesDir, hooks = {}) {
  const open = new Map(); // slotId → db
  return {
    savesDir,
    hooks,
    get(slotId) {
      let db = open.get(slotId);
      if (!db) { db = openSlot(savesDir, slotId); open.set(slotId, db); }
      return db;
    },
    close(slotId) {
      const db = open.get(slotId);
      if (db) { db.close(); open.delete(slotId); }
    },
    closeAll() { for (const [id, db] of open) { db.close(); } open.clear(); },
  };
}

// ── row ↔ JS 매핑 (유일한 매핑 지점) ─────────────────────────────
function mapNpcRow(r) {
  if (!r) return null;
  return {
    npcId: r.npc_id, name: r.name, nameEn: r.name_en ?? undefined,
    isNamed: !!r.is_named,
    playerType: r.player_type, position: r.position, handedness: r.handedness,
    jerseyNumber: r.jersey_number, age: r.age, grade: r.grade ?? undefined,
    schoolId: r.school_id, graduationYear: r.graduation_year,
    nationality: r.nationality, careerStatus: r.career_status,
    currentLeague: r.current_league, currentTeam: r.current_team,
    salary: r.salary, contractYears: r.contract_years, proServiceYears: r.pro_service_years,
    militaryStatus: r.military_status,
    military: r.military_json ? JSON.parse(r.military_json) : undefined,
    developmentRate: r.development_rate, potentialHidden: r.potential_hidden,
    abilities: JSON.parse(r.abilities_json || "{}"),
    xp: JSON.parse(r.xp_json || "{}"),
    form: r.form_json ? JSON.parse(r.form_json) : undefined,
    personality: r.personality_json ? JSON.parse(r.personality_json) : undefined,
    injury: r.injury_json ? JSON.parse(r.injury_json) : undefined,
    extra: r.extra_json ? JSON.parse(r.extra_json) : undefined,
  };
}

// ── 스태프 (Phase 6A) ────────────────────────────────────────────
const INSERT_STAFF_SQL = `
  INSERT OR REPLACE INTO staff (
    staff_id, name, name_en, role, age, team_id, league_id, school_id,
    status, years, style, stats_json, risk_tolerance, training_buff, joined_season
  ) VALUES (
    @staffId, @name, @nameEn, @role, @age, @teamId, @leagueId, @schoolId,
    @status, @years, @style, @statsJson, @riskTolerance, @trainingBuff, @joinedSeason
  )`;

function staffToInsertParams(st) {
  return {
    staffId: st.staffId,
    name: st.name,
    nameEn: st.nameEn ?? "",
    role: st.role,
    age: st.age ?? 45,
    teamId: st.teamId ?? "",
    leagueId: st.leagueId ?? "",
    schoolId: st.schoolId ?? "",
    status: st.status ?? "active",
    years: st.years ?? 0,
    style: st.style ?? "",
    statsJson: JSON.stringify(st.stats ?? {}),
    riskTolerance: st.riskTolerance ?? 50,
    trainingBuff: st.trainingBuff ?? "",
    joinedSeason: st.joinedSeason ?? 0,
  };
}

function staffRowToObject(r) {
  return {
    staffId: r.staff_id,
    name: r.name,
    nameEn: r.name_en,
    role: r.role,
    age: r.age,
    teamId: r.team_id,
    leagueId: r.league_id,
    schoolId: r.school_id,
    status: r.status,
    years: r.years,
    style: r.style,
    stats: r.stats_json ? JSON.parse(r.stats_json) : {},
    riskTolerance: r.risk_tolerance,
    trainingBuff: r.training_buff,
    joinedSeason: r.joined_season,
  };
}

// ── 관계도 (Phase 6C) ──────────────────────────────────────────
const UPSERT_REL_SQL = `
  INSERT OR REPLACE INTO relationship (
    person_id, kind, value, contact, met_season, met_team, last_team,
    memories_json, updated_week
  ) VALUES (
    @personId, @kind, @value, @contact, @metSeason, @metTeam, @lastTeam,
    @memoriesJson, @updatedWeek
  )`;

function relToInsertParams(r) {
  return {
    personId: r.personId,
    kind: r.kind,
    // 저장 시점에도 clamp한다 — Rust를 우회한 호출이 범위를 깨는 걸 DB 앞에서 막는다
    value: Math.max(-100, Math.min(100, Math.round(r.value ?? 0))),
    contact: r.contact ?? "together",
    metSeason: r.metSeason ?? 0,
    metTeam: r.metTeam ?? "",
    lastTeam: r.lastTeam ?? "",
    memoriesJson: JSON.stringify(r.memories ?? []),
    updatedWeek: r.updatedWeek ?? 0,
  };
}

function relRowToObject(r) {
  return {
    personId: r.person_id,
    kind: r.kind,
    value: r.value,
    contact: r.contact,
    metSeason: r.met_season,
    metTeam: r.met_team,
    lastTeam: r.last_team,
    memories: r.memories_json ? JSON.parse(r.memories_json) : [],
    updatedWeek: r.updated_week,
    // person VIEW 조인 시에만 채워진다 (화면용)
    ...(r.name !== undefined ? { name: r.name, teamId: r.team_id, leagueId: r.league_id, age: r.age } : {}),
  };
}

const INSERT_NPC_SQL = `
  INSERT INTO npc (
    npc_id, name, name_en, is_named, player_type, position, handedness,
    jersey_number, age, grade, school_id, graduation_year, nationality,
    career_status, current_league, current_team,
    salary, contract_years, pro_service_years,
    military_status, military_json, development_rate, potential_hidden,
    abilities_json, xp_json, form_json, personality_json, emotion_json, injury_json, extra_json
  ) VALUES (
    @npcId, @name, @nameEn, @isNamed, @playerType, @position, @handedness,
    @jerseyNumber, @age, @grade, @schoolId, @graduationYear, @nationality,
    @careerStatus, @currentLeague, @currentTeam,
    @salary, @contractYears, @proServiceYears,
    @militaryStatus, @militaryJson, @developmentRate, @potentialHidden,
    @abilitiesJson, @xpJson, @formJson, @personalityJson, @emotionJson, @injuryJson, @extraJson
  )`;

function npcToInsertParams(n) {
  return {
    npcId: n.npcId, name: n.name, nameEn: n.nameEn ?? null,
    isNamed: n.isNamed ? 1 : 0,
    playerType: n.playerType ?? "pitcher", position: n.position ?? "",
    handedness: n.handedness ?? "R", jerseyNumber: n.jerseyNumber ?? 0,
    age: n.age, grade: n.grade ?? null,
    schoolId: n.schoolId ?? "", graduationYear: n.graduationYear ?? 0,
    nationality: n.nationality ?? "KOR",
    careerStatus: n.careerStatus ?? "active",
    currentLeague: n.currentLeague ?? "", currentTeam: n.currentTeam ?? "",
    salary: n.salary ?? 0, contractYears: n.contractYears ?? 0,
    proServiceYears: n.proServiceYears ?? 0,
    militaryStatus: n.militaryStatus ?? "미필",
    militaryJson: n.military ? JSON.stringify(n.military) : null,
    developmentRate: n.developmentRate ?? 50, potentialHidden: n.potentialHidden ?? 75,
    abilitiesJson: JSON.stringify(n.abilities ?? {}),
    xpJson: JSON.stringify(n.xp ?? {}),
    formJson: n.form ? JSON.stringify(n.form) : null,
    personalityJson: n.personality ? JSON.stringify(n.personality) : null,
    emotionJson: null,   // 폐기됨 (Phase 6C) — 위 스키마 주석 참고
    injuryJson: n.injury ? JSON.stringify(n.injury) : null,
    extraJson: n.extra ? JSON.stringify(n.extra) : null,
  };
}

// 이적류 커맨드 공통 — npc 행 갱신 + transactions 기록 (호출측은 이미 트랜잭션 내부)
function applyMove(db, npcId, to, tx) {
  const cur = db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(npcId);
  if (!cur) throw new Error(`npc not found: ${npcId}`);
  db.prepare(`
    UPDATE npc SET
      current_team    = @toTeamId,
      current_league  = COALESCE(@toLeagueId, current_league),
      salary          = COALESCE(@salary, salary),
      contract_years  = COALESCE(@contractYears, contract_years),
      career_status   = COALESCE(@careerStatus, career_status)
    WHERE npc_id = @npcId
  `).run({
    npcId,
    toTeamId: to.toTeamId,
    toLeagueId: to.toLeagueId ?? null,
    salary: to.salary ?? null,
    contractYears: to.contractYears ?? null,
    careerStatus: to.careerStatus ?? null,
  });
  db.prepare(`
    INSERT INTO transactions (season_year, week, category, npc_id, npc_name,
      from_team_id, from_league_id, to_team_id, to_league_id, detail, group_id)
    VALUES (@seasonYear, @week, @category, @npcId, @npcName,
      @fromTeamId, @fromLeagueId, @toTeamId, @toLeagueId, @detail, @groupId)
  `).run({
    seasonYear: tx.seasonYear, week: tx.week ?? null, category: tx.category,
    npcId, npcName: cur.name,
    fromTeamId: cur.current_team, fromLeagueId: cur.current_league,
    toTeamId: to.toTeamId, toLeagueId: to.toLeagueId ?? cur.current_league,
    detail: tx.detail ?? null, groupId: tx.groupId ?? null,
  });
}

// ── 커맨드 정의 (repo:call 화이트리스트) ─────────────────────────
// 각 커맨드: (db, payload) → 결과 객체. 쓰기 커맨드는 전부 db.transaction으로 감싼다.
const commands = {
  // ---- 슬롯 수명 ----
  // 새 게임 = 슬롯 초기화 의미론: 기존 데이터(이전 시도 잔재 포함)를 전부 비우고 새로 쓴다
  createSlot(db, p) {
    const t = db.transaction(() => {
      for (const tbl of [
        "npc", "staff", "relationship", "transactions", "career_history", "history_league", "protagonist", "meta",
        "season_meta", "schedule", "standings", "season_stats", "player_condition", "team_rotation",
      ]) {
        db.prepare(`DELETE FROM ${tbl}`).run();
      }
      const now = new Date().toISOString();
      const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
      setMeta.run("schema_version", String(SCHEMA_VERSION));
      setMeta.run("world_seed", String(p.worldSeed ?? Date.now()));
      setMeta.run("created_at", now);
      setMeta.run("updated_at", now);
      setMeta.run("slot_name", p.name ?? "");
      db.prepare("INSERT OR REPLACE INTO protagonist (id, json) VALUES (1, ?)").run(JSON.stringify(p.protagonist ?? {}));
      writeSeason(db, p.season ?? {});
      if (Array.isArray(p.npcs) && p.npcs.length > 0) {
        const ins = db.prepare(INSERT_NPC_SQL);
        for (const n of p.npcs) ins.run(npcToInsertParams(n));
      }
      // 스태프 ~1,090명 (Phase 6A). 같은 트랜잭션 안이라 INSERT 루프가 느려지지 않는다 —
      // OnePitch는 이걸 안 감싸서 41.4초 → 1.46초(28배) 차이를 겪었다 (people.md §2-1)
      if (Array.isArray(p.staff) && p.staff.length > 0) {
        const insS = db.prepare(INSERT_STAFF_SQL);
        for (const st of p.staff) insS.run(staffToInsertParams(st));
      }
    });
    t();
    return { ok: true, npcCount: p.npcs?.length ?? 0, staffCount: p.staff?.length ?? 0 };
  },

  insertStaff(db, p) {
    const t = db.transaction(() => {
      const ins = db.prepare(INSERT_STAFF_SQL);
      for (const st of p.staff) ins.run(staffToInsertParams(st));
    });
    t();
    return { ok: true, inserted: p.staff.length };
  },

  /** 스태프 조회. teamId/role/leagueId로 좁힐 수 있다 */
  getStaff(db, p = {}) {
    const where = [];
    const args = [];
    if (p.teamId)   { where.push("team_id = ?");   args.push(p.teamId); }
    if (p.role)     { where.push("role = ?");      args.push(p.role); }
    if (p.leagueId) { where.push("league_id = ?"); args.push(p.leagueId); }
    if (p.status)   { where.push("status = ?");    args.push(p.status); }
    const sql = `SELECT * FROM staff${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY staff_id`;
    return db.prepare(sql).all(...args).map(staffRowToObject);
  },

  /** 스태프 상태 변경 (6B 생멸에서 쓴다 — 나이·은퇴·이적) */
  updateStaff(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare(
        "UPDATE staff SET age = ?, status = ?, years = ?, team_id = ?, league_id = ?, stats_json = ? WHERE staff_id = ?"
      );
      for (const u of p.updates) {
        stmt.run(
          u.age, u.status, u.years, u.teamId, u.leagueId,
          JSON.stringify(u.stats ?? {}), u.staffId,
        );
      }
    });
    t();
    return { ok: true, updated: p.updates.length };
  },

  // ── 관계도 (Phase 6C) ────────────────────────────────────────
  /**
   * 관계 조회. `withPerson: true`면 person VIEW를 조인해 이름·소속을 함께 준다 —
   * 화면이 npcs 배열과 스태프 목록을 각각 로드해서 이름을 찾지 않아도 되도록.
   * LEFT JOIN인 이유: 상대가 은퇴로 npc/staff에서 사라져도 관계 행은 남는다(기록).
   */
  getRelationships(db, p = {}) {
    const where = [];
    const args = [];
    if (p.kind)     { where.push("r.kind = ?");     args.push(p.kind); }
    if (p.contact)  { where.push("r.contact = ?");  args.push(p.contact); }
    if (Array.isArray(p.personIds) && p.personIds.length > 0) {
      where.push(`r.person_id IN (${p.personIds.map(() => "?").join(",")})`);
      args.push(...p.personIds);
    }
    const cond = where.length ? " WHERE " + where.join(" AND ") : "";
    const sql = p.withPerson
      ? `SELECT r.*, pv.name, pv.team_id, pv.league_id, pv.age
           FROM relationship r LEFT JOIN person pv ON pv.person_id = r.person_id
          ${cond} ORDER BY r.value DESC, r.person_id`
      : `SELECT r.* FROM relationship r${cond} ORDER BY r.person_id`;
    return db.prepare(sql).all(...args).map(relRowToObject);
  },

  /** 관계 일괄 쓰기 (신규 생성 + 갱신 동일 경로). 1 트랜잭션 */
  upsertRelationships(db, p) {
    const t = db.transaction(() => {
      const ins = db.prepare(UPSERT_REL_SQL);
      for (const r of p.rows) ins.run(relToInsertParams(r));
    });
    t();
    return { ok: true, written: p.rows.length };
  },

  /**
   * 접촉 상태 일괄 변경 — 팀 이동·은퇴 시 쓴다.
   * `fromTeam`을 주면 그 팀에서 함께 있던 전원을 한 번에 바꾼다 (ID 목록 없이).
   * 값 감쇠는 여기서 하지 않는다 — 감쇠 계수는 게임 규칙이라 Rust가 정한다.
   */
  setRelationshipContact(db, p) {
    const t = db.transaction(() => {
      if (Array.isArray(p.personIds) && p.personIds.length > 0) {
        const stmt = db.prepare("UPDATE relationship SET contact = ? WHERE person_id = ?");
        for (const id of p.personIds) stmt.run(p.contact, id);
      }
      if (p.fromTeam) {
        db.prepare("UPDATE relationship SET contact = ? WHERE last_team = ? AND contact = 'together'")
          .run(p.contact, p.fromTeam);
      }
    });
    t();
    return { ok: true };
  },

  insertNpcs(db, p) {
    const t = db.transaction(() => {
      const ins = db.prepare(INSERT_NPC_SQL);
      for (const n of p.npcs) ins.run(npcToInsertParams(n));
    });
    t();
    return { ok: true, inserted: p.npcs.length };
  },

  getMeta(db) {
    const rows = db.prepare("SELECT key, value FROM meta").all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  setMeta(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
      for (const [k, v] of Object.entries(p.entries)) stmt.run(k, String(v));
      stmt.run("updated_at", new Date().toISOString());
    });
    t();
    return { ok: true };
  },

  getProtagonist(db) {
    const r = db.prepare("SELECT json FROM protagonist WHERE id = 1").get();
    return r ? JSON.parse(r.json) : null;
  },
  setProtagonist(db, p) {
    db.prepare("INSERT OR REPLACE INTO protagonist (id, json) VALUES (1, ?)").run(JSON.stringify(p.data));
    return { ok: true };
  },
  // season은 5개 테이블로 분해 저장되지만, 경계에서 SaveSeason 형태로 왕복한다
  // (메모리 형태 무변경 — DATA_POLICY.md §3-2 / migration v2 주석 참고)
  getSeason(db) {
    return readSeason(db);
  },
  setSeason(db, p) {
    const t = db.transaction(() => writeSeason(db, p.data ?? {}));
    t();
    return { ok: true };
  },

  // ---- 상태 변이 커맨드 (각 1 트랜잭션) ----
  transfer(db, p) {
    const t = db.transaction(() => {
      applyMove(db, p.npcId,
        { toTeamId: p.toTeamId, toLeagueId: p.toLeagueId, salary: p.salary, contractYears: p.contractYears },
        { seasonYear: p.seasonYear, week: p.week, category: p.category ?? "fa", detail: p.detail, groupId: p.groupId });
    });
    t();
    return { ok: true };
  },

  swapTeams(db, p) {
    const groupId = p.groupId ?? `trade-${p.a.npcId}-${p.b.npcId}-${p.seasonYear}-${p.week ?? 0}`;
    const t = db.transaction(() => {
      applyMove(db, p.a.npcId, { toTeamId: p.a.toTeamId, toLeagueId: p.a.toLeagueId },
        { seasonYear: p.seasonYear, week: p.week, category: "trade", detail: p.detail, groupId });
      applyMove(db, p.b.npcId, { toTeamId: p.b.toTeamId, toLeagueId: p.b.toLeagueId },
        { seasonYear: p.seasonYear, week: p.week, category: "trade", detail: p.detail, groupId });
    });
    t();
    return { ok: true, groupId };
  },

  assignDraft(db, p) {
    const t = db.transaction(() => {
      for (const pick of p.picks) {
        applyMove(db, pick.npcId,
          { toTeamId: pick.teamId, toLeagueId: pick.leagueId, salary: pick.salary, contractYears: pick.contractYears, careerStatus: "active" },
          { seasonYear: p.seasonYear, week: p.week, category: "draft",
            detail: pick.detail ?? `R${pick.round} P${pick.pickNo}`, groupId: `draft-${p.seasonYear}` });
        db.prepare("UPDATE npc SET pro_service_years = 0, grade = NULL, school_id = '' WHERE npc_id = ?").run(pick.npcId);
      }
    });
    t();
    return { ok: true, assigned: p.picks.length };
  },

  enlist(db, p) {
    const t = db.transaction(() => {
      const cur = db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(p.npcId);
      if (!cur) throw new Error(`npc not found: ${p.npcId}`);
      const military = {
        unit: p.unit, enlistYear: p.enlistYear, dischargeYear: p.dischargeYear,
        originalLeagueId: cur.current_league, originalTeamId: cur.current_team,
      };
      applyMove(db, p.npcId,
        { toTeamId: p.toTeamId ?? "TEAM_SPORTS_UNIT", toLeagueId: p.toLeagueId ?? "LEAGUE_MILITARY", careerStatus: "military" },
        { seasonYear: p.seasonYear, week: p.week, category: "military", detail: p.unit === "sports" ? "상무 입대" : "일반 입대" });
      db.prepare("UPDATE npc SET military_status = '현역', military_json = ? WHERE npc_id = ?")
        .run(JSON.stringify(military), p.npcId);
    });
    t();
    return { ok: true };
  },

  discharge(db, p) {
    const t = db.transaction(() => {
      const cur = db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(p.npcId);
      if (!cur) throw new Error(`npc not found: ${p.npcId}`);
      const mil = cur.military_json ? JSON.parse(cur.military_json) : {};
      const toTeam = p.toTeamId ?? mil.originalTeamId ?? "";
      const toLeague = p.toLeagueId ?? mil.originalLeagueId ?? "LEAGUE_INDEPENDENT";
      applyMove(db, p.npcId,
        { toTeamId: toTeam, toLeagueId: toLeague, careerStatus: "active" },
        { seasonYear: p.seasonYear, week: p.week, category: "military", detail: "전역" });
      db.prepare("UPDATE npc SET military_status = '군필' WHERE npc_id = ?").run(p.npcId);
    });
    t();
    return { ok: true };
  },

  retire(db, p) {
    const t = db.transaction(() => {
      applyMove(db, p.npcId,
        { toTeamId: "", toLeagueId: "LEAGUE_RETIRED", careerStatus: "retired" },
        { seasonYear: p.seasonYear, week: p.week, category: "retirement", detail: p.detail });
    });
    t();
    return { ok: true };
  },

  // 주간 성장/부상 일괄 반영 (성장 계산은 Rust — 여기는 결과 저장만)
  updateWeekly(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare(`
        UPDATE npc SET
          abilities_json = COALESCE(@abilitiesJson, abilities_json),
          xp_json        = COALESCE(@xpJson, xp_json),
          form_json      = COALESCE(@formJson, form_json),
          injury_json    = @injuryJsonKeep,
          extra_json     = COALESCE(@extraJson, extra_json),
          age            = COALESCE(@age, age),
          career_status  = COALESCE(@careerStatus, career_status)
        WHERE npc_id = @npcId
      `);
      for (const u of p.updates) {
        const cur = db.prepare("SELECT injury_json FROM npc WHERE npc_id = ?").get(u.npcId);
        if (!cur) continue;
        stmt.run({
          npcId: u.npcId,
          abilitiesJson: u.abilities ? JSON.stringify(u.abilities) : null,
          xpJson: u.xp ? JSON.stringify(u.xp) : null,
          formJson: u.form ? JSON.stringify(u.form) : null,
          // injury는 명시적 갱신/해제 (clearInjury: true → NULL)
          injuryJsonKeep: u.clearInjury ? null : (u.injury ? JSON.stringify(u.injury) : cur.injury_json),
          extraJson: u.extra ? JSON.stringify(u.extra) : null,
          age: u.age ?? null,
          careerStatus: u.careerStatus ?? null,
        });
      }
    });
    t();
    return { ok: true, updated: p.updates.length };
  },

  appendCareerHistory(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO career_history (npc_id, year, league_id, team_id, stat_line, stats_json, highlights_json)
        VALUES (@npcId, @year, @leagueId, @teamId, @statLine, @statsJson, @highlightsJson)
      `);
      for (const r of p.rows) {
        stmt.run({
          npcId: r.npcId, year: r.year, leagueId: r.leagueId, teamId: r.teamId,
          statLine: r.statLine ?? "",
          statsJson: r.stats ? JSON.stringify(r.stats) : null,
          highlightsJson: r.highlights ? JSON.stringify(r.highlights) : null,
        });
      }
    });
    t();
    return { ok: true, rows: p.rows.length };
  },

  saveHistoryLeague(db, p) {
    db.prepare("INSERT OR REPLACE INTO history_league (year, league_id, kind, json) VALUES (?, ?, ?, ?)")
      .run(p.year, p.leagueId, p.kind, JSON.stringify(p.data));
    return { ok: true };
  },

  // 시즌 경계 벌크 동기화 (오프시즌 일괄 처리 결과 반영 전용 — 주간 변이는 개별 커맨드 사용)
  syncNpcs(db, p) {
    const t = db.transaction(() => {
      const up = db.prepare(INSERT_NPC_SQL.replace("INSERT INTO npc", "INSERT OR REPLACE INTO npc"));
      for (const n of p.npcs) up.run(npcToInsertParams(n));
    });
    t();
    return { ok: true, synced: p.npcs.length };
  },

  // ---- 조회 ----
  getNpc(db, p) { return mapNpcRow(db.prepare("SELECT * FROM npc WHERE npc_id = ?").get(p.npcId)); },
  getAllNpcs(db) { return db.prepare("SELECT * FROM npc").all().map(mapNpcRow); },
  getByLeague(db, p) {
    const sql = p.activeOnly
      ? "SELECT * FROM npc WHERE current_league = ? AND career_status = 'active'"
      : "SELECT * FROM npc WHERE current_league = ?";
    return db.prepare(sql).all(p.leagueId).map(mapNpcRow);
  },
  getByTeam(db, p) { return db.prepare("SELECT * FROM npc WHERE current_team = ?").all(p.teamId).map(mapNpcRow); },
  getNamed(db) { return db.prepare("SELECT * FROM npc WHERE is_named = 1").all().map(mapNpcRow); },
  countByTeam(db) {
    return db.prepare("SELECT current_team AS teamId, COUNT(*) AS n FROM npc WHERE career_status = 'active' GROUP BY current_team").all();
  },
  getTransactions(db, p) {
    const cond = ["1=1"]; const args = [];
    if (p.seasonYear != null) { cond.push("season_year = ?"); args.push(p.seasonYear); }
    if (p.category)   { cond.push("category = ?");   args.push(p.category); }
    if (p.leagueId)   { cond.push("(from_league_id = ? OR to_league_id = ?)"); args.push(p.leagueId, p.leagueId); }
    if (p.npcId)      { cond.push("npc_id = ?");     args.push(p.npcId); }
    const limit = Math.min(1000, Math.max(1, p.limit ?? 200));
    return db.prepare(
      `SELECT * FROM transactions WHERE ${cond.join(" AND ")} ORDER BY id DESC LIMIT ${limit}`
    ).all(...args);
  },
  getCareerHistory(db, p) {
    return db.prepare("SELECT * FROM career_history WHERE npc_id = ? ORDER BY year").all(p.npcId)
      .map((r) => ({
        npcId: r.npc_id, year: r.year, leagueId: r.league_id, teamId: r.team_id,
        statLine: r.stat_line,
        stats: r.stats_json ? JSON.parse(r.stats_json) : undefined,
        highlights: r.highlights_json ? JSON.parse(r.highlights_json) : undefined,
      }));
  },
  getHistoryLeague(db, p) {
    const rows = p.year != null
      ? db.prepare("SELECT * FROM history_league WHERE year = ? AND (? = '' OR league_id = ?)").all(p.year, p.leagueId ?? "", p.leagueId ?? "")
      : db.prepare("SELECT * FROM history_league WHERE league_id = ?").all(p.leagueId);
    return rows.map((r) => ({ year: r.year, leagueId: r.league_id, kind: r.kind, data: JSON.parse(r.json) }));
  },
};

// ── R3a-4c: 레거시 채널 호환 커맨드 ──────────────────────────────
// 구 npc:*/league:* 채널의 payload/return shape를 그대로 유지하면서 v3 npc 테이블로 라우팅.
// 렌더러 콜사이트 무수정 전환용 — 4d에서 콜사이트가 slotRepo로 이관되면 제거한다.
const compatCommands = {
  // npc:getByLeague — NpcTradeRow[] shape (능력치는 abilities JSON에서 — NULL 컬럼 클래스 소멸)
  compatGetByLeague(db, p) {
    return db.prepare(
      "SELECT * FROM npc WHERE current_league = ? AND career_status = 'active'"
    ).all(p.leagueId).map((r) => {
      const ab = JSON.parse(r.abilities_json || "{}");
      return {
        npcId: r.npc_id, position: r.position,
        currentTeam: r.current_team, currentLeague: r.current_league,
        currentSalary: r.salary, contractYears: Math.max(1, r.contract_years),
        proServiceYears: r.pro_service_years,
        pitchOvr: ab.pitching?.ovr ?? null, batOvr: ab.batting?.ovr ?? null,
        age: r.age,
        // ⚠ **이게 빠져 있어서 트레이드가 외국인을 걸러내지 못했다.**
        // 호출측은 `nationality ?? "KOR"`로 폴백하므로 컬럼이 없으면
        // 전원이 내국인으로 읽힌다 — 오류도 경고도 없이 필터만 무력해진다.
        // 실측: 8시즌 뒤 한 팀 4명·다른 팀 2명(사건 기록은 빈 채로).
        nationality: r.nationality,
      };
    });
  },
  // npc:swapTeams — 팀만 갱신 (tx 기록은 레거시 콜사이트가 addTransactions로 따로 보냄)
  compatMoveTeams(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare("UPDATE npc SET current_team = ? WHERE npc_id = ?");
      for (const m of p.moves) stmt.run(m.toTeamId, m.npcId);
    });
    t();
    return { ok: true };
  },
  // npc:updateContracts
  compatUpdateContracts(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare(
        "UPDATE npc SET salary = ?, contract_years = ?, pro_service_years = ? WHERE npc_id = ?"
      );
      for (const u of p.updates) stmt.run(u.currentSalary ?? 0, u.contractYears ?? 0, u.proServiceYears ?? 0, u.npcId);
    });
    t();
    return { ok: true };
  },
  // league:addTransactions — 레거시 row shape → v3 transactions
  addTransactions(db, p) {
    const t = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO transactions (season_year, week, category, npc_id, npc_name,
          from_team_id, from_league_id, to_team_id, to_league_id, detail, group_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const r of p.rows) {
        stmt.run(r.seasonYear, r.week ?? null, r.category, r.playerId ?? "", r.playerName ?? "",
          r.fromTeamId ?? null, r.fromLeagueId ?? null, r.toTeamId ?? null, r.toLeagueId ?? null,
          r.detail ?? null, r.groupId ?? null);
      }
    });
    t();
    return { ok: true };
  },
  // league:getTransactions — 레거시 camelCase shape
  compatGetTransactions(db, p) {
    const rows = commands.getTransactions(db, {
      slotId: p.slotId, seasonYear: p.seasonYear, category: p.category,
      leagueId: p.leagueId, npcId: p.playerId, limit: p.limit,
    });
    return rows.map((r) => ({
      id: r.id, seasonYear: r.season_year, week: r.week, category: r.category,
      playerId: r.npc_id, playerName: r.npc_name,
      fromTeamId: r.from_team_id, fromLeagueId: r.from_league_id,
      toTeamId: r.to_team_id, toLeagueId: r.to_league_id,
      detail: r.detail, groupId: r.group_id,
    }));
  },
};
Object.assign(commands, compatCommands);

// ── 슬롯 목록/삭제 (manager 수준 — db 핸들 밖) ───────────────────
function listSlots(manager) {
  const out = [];
  if (!fs.existsSync(manager.savesDir)) return out;
  for (const f of fs.readdirSync(manager.savesDir)) {
    const m = /^slot3_([A-Za-z0-9_-]+)\.db$/.exec(f);
    if (!m) continue;
    try {
      const db = manager.get(m[1]);
      const meta = commands.getMeta(db);
      out.push({ slotId: m[1], ...meta });
    } catch { /* 손상 슬롯은 목록에서 제외 */ }
  }
  return out;
}

function deleteSlot(manager, slotId) {
  manager.close(slotId);
  const base = slotFilePath(manager.savesDir, slotId);
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.rmSync(base + suffix, { force: true }); } catch { /* ignore */ }
  }
  // slot.db 파일만 지우면 **공용 DB의 시즌 기록이 남는다**
  try { manager.hooks?.onSlotReset?.(slotId); } catch { /* 정리 실패가 삭제를 막지 않는다 */ }
  return { ok: true };
}

// ── 디스패처 (repo:call 진입점) ──────────────────────────────────
// 계약: 절대 throw하지 않는다 — 실패는 { error } 반환 (트랜잭션은 이미 롤백됨)
function dispatch(manager, cmd, payload) {
  try {
    if (cmd === "listSlots") return listSlots(manager);
    if (cmd === "deleteSlot") return deleteSlot(manager, payload.slotId);
    const fn = commands[cmd];
    if (!fn) return { error: `[repo:call] unknown cmd: ${String(cmd)}` };
    if (!payload || typeof payload.slotId !== "string") return { error: `[repo:call] slotId required for ${cmd}` };
    const db = manager.get(payload.slotId);
    const out = fn(db, payload);
    // ⚠ `createSlot`은 그 슬롯의 세계를 **새로 시작**한다. slot.db 안은 스스로
    // 비우지만 공용 DB의 시즌 기록은 그대로 남아, 새 게임이 옛 세계의 순위표를
    // 자기 것으로 읽는다. 삭제만 훅에 걸면 "지우지 않고 덮어쓰는" 이 경로가 샌다.
    if (cmd === "createSlot" && !out?.error) {
      try { manager.hooks?.onSlotReset?.(payload.slotId); } catch { /* 정리 실패가 생성을 막지 않는다 */ }
    }
    return out;
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

module.exports = {
  createManager, dispatch, openSlot, SCHEMA_VERSION, _commands: commands,
  // 마이그레이션 (테스트·진단용)
  migrate, currentVersion, hasColumn, addColumn, MIGRATIONS,
};
