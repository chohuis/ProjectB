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

function createManager(savesDir) {
  const open = new Map(); // slotId → db
  return {
    savesDir,
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
    emotion: r.emotion_json ? JSON.parse(r.emotion_json) : undefined,
    injury: r.injury_json ? JSON.parse(r.injury_json) : undefined,
    extra: r.extra_json ? JSON.parse(r.extra_json) : undefined,
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
    emotionJson: n.emotion ? JSON.stringify(n.emotion) : null,
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
        "npc", "transactions", "career_history", "history_league", "protagonist", "meta",
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
    });
    t();
    return { ok: true, npcCount: p.npcs?.length ?? 0 };
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
    return fn(db, payload);
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

module.exports = {
  createManager, dispatch, openSlot, SCHEMA_VERSION, _commands: commands,
  // 마이그레이션 (테스트·진단용)
  migrate, currentVersion, hasColumn, addColumn, MIGRATIONS,
};
