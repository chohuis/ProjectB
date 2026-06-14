// scripts/generate_master_db.cjs
// 빌드 타임: entity JSON 2,085개 → resource/master.db

const path = require("node:path");
const fs   = require("node:fs");
const Database = require("better-sqlite3");

const ROOT         = path.resolve(__dirname, "..");
const ENTITIES_DIR = path.join(ROOT, "resource/data/master/entities/players");
const OUT_DB       = path.join(ROOT, "resource/master.db");

// ── master.db 생성 ─────────────────────────────────────────────
function openMasterDb(dbPath) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE npc_master (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL DEFAULT '',
      name_en            TEXT,
      role               TEXT NOT NULL DEFAULT 'player',
      age                INTEGER NOT NULL DEFAULT 18,
      status             TEXT NOT NULL DEFAULT 'active',
      origin_league_id   TEXT NOT NULL DEFAULT '',
      league_id          TEXT NOT NULL DEFAULT '',
      club_id            TEXT NOT NULL DEFAULT '',
      team_id            TEXT NOT NULL DEFAULT '',
      school_id          TEXT NOT NULL DEFAULT '',
      grade              INTEGER,
      notes              TEXT NOT NULL DEFAULT '',
      diligence          INTEGER NOT NULL DEFAULT 60,
      popularity         INTEGER NOT NULL DEFAULT 30,

      -- 플레이어 기본 정보
      player_type        TEXT,
      handedness         TEXT,
      position           TEXT,
      jersey_number      INTEGER,
      primary_position   TEXT,
      development_rate   INTEGER,
      potential_hidden   INTEGER,
      position_ratings_json TEXT,
      pitches_json       TEXT,

      -- 투수 능력치
      pitch_ovr          INTEGER,
      pitch_stamina      INTEGER,
      pitch_velocity     INTEGER,
      pitch_command      INTEGER,
      pitch_control      INTEGER,
      pitch_movement     INTEGER,
      pitch_mentality    INTEGER,
      pitch_recovery     INTEGER,
      pitch_clutch       INTEGER,
      pitch_hold_runners INTEGER,

      -- 타자 능력치
      bat_ovr            INTEGER,
      bat_contact        INTEGER,
      bat_power          INTEGER,
      bat_eye            INTEGER,
      bat_discipline     INTEGER,
      bat_speed          INTEGER,
      bat_base_instinct  INTEGER,
      bat_bunting        INTEGER,
      bat_platoon        INTEGER,
      bat_fielding       INTEGER,
      bat_arm            INTEGER,
      bat_clutch         INTEGER,

      -- 병역 상태 (마스터 데이터 기준 초기값)
      military_status    TEXT,

      -- 프로 계약 정보
      pro_service_years  INTEGER,
      contract_json      TEXT,

      -- 코치/감독/구단주 능력치 (역할별 구조 상이 → JSON)
      staff_json         TEXT,

      -- 플레이어 성격 (결정론적 생성)
      personality_json   TEXT
    );

    CREATE INDEX idx_npc_master_league ON npc_master(league_id);
    CREATE INDEX idx_npc_master_team   ON npc_master(team_id);
    CREATE INDEX idx_npc_master_role   ON npc_master(role);
  `);
  return db;
}

// ── 결정론적 LCG ──────────────────────────────────────────────
function makeLcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function clampInt(v, lo, hi) {
  return Math.round(Math.min(hi, Math.max(lo, v)));
}

function generatePersonality(e) {
  const pl      = e.details?.player ?? {};
  const diligence  = e.diligence  ?? 60;
  const popularity = e.popularity ?? 30;
  const devRate    = pl.developmentRate  ?? 65;
  const potential  = pl.potentialHidden  ?? 75;
  const age        = e.age ?? 18;

  const idNum = parseInt((e.id ?? "1").replace(/\D/g, ""), 10) || 1;
  const lcg = makeLcg(idNum);

  const bases = {
    loyalty:             50,
    ambition:            40 + popularity * 0.25 + (age <= 20 ? 10 : 0),
    greed:               30 + (100 - diligence) * 0.15,
    competitiveDrive:    45 + devRate   * 0.15,
    stabilityPreference: 30 + age       * 0.80,
    professionalism:     35 + diligence * 0.40,
    overseasAmbition:    20 + potential * 0.15,
    marketPreference:    40 + popularity* 0.20,
  };

  return JSON.stringify({
    loyalty:             clampInt(bases.loyalty             + (lcg()-0.5)*40, 10, 90),
    ambition:            clampInt(bases.ambition            + (lcg()-0.5)*40, 10, 95),
    greed:               clampInt(bases.greed               + (lcg()-0.5)*40,  5, 95),
    competitiveDrive:    clampInt(bases.competitiveDrive    + (lcg()-0.5)*40, 10, 95),
    stabilityPreference: clampInt(bases.stabilityPreference + (lcg()-0.5)*35,  5, 95),
    professionalism:     clampInt(bases.professionalism     + (lcg()-0.5)*30, 10, 95),
    overseasAmbition:    clampInt(bases.overseasAmbition    + (lcg()-0.5)*30,  0, 90),
    marketPreference:    clampInt(bases.marketPreference    + (lcg()-0.5)*40, 10, 90),
    homeTeamId:          null,
  });
}

// ── JSON → INSERT 행 변환 ──────────────────────────────────────
function entityToRow(e) {
  const pl = e.details?.player ?? {};
  const p  = pl.pitching ?? {};
  const b  = pl.batting  ?? {};

  const staffData = {};
  if (e.details?.coach?.stats)   staffData.coach   = e.details.coach;
  if (e.details?.manager?.stats) staffData.manager = e.details.manager;
  if (e.details?.owner?.stats)   staffData.owner   = e.details.owner;

  return {
    id:                 e.id,
    name:               e.name ?? "",
    name_en:            e.nameEn ?? null,
    role:               e.role ?? "player",
    age:                e.age ?? 18,
    status:             e.status ?? "active",
    origin_league_id:   e.originLeagueId ?? "",
    league_id:          e.leagueId ?? "",
    club_id:            e.clubId ?? "",
    team_id:            e.teamId ?? "",
    school_id:          e.schoolId ?? "",
    grade:              e.grade ?? null,
    notes:              e.notes ?? "",
    diligence:          e.diligence ?? 60,
    popularity:         e.popularity ?? 30,

    player_type:        pl.playerType ?? null,
    handedness:         pl.handedness ?? null,
    position:           pl.position ?? null,
    jersey_number:      pl.jerseyNumber ?? null,
    primary_position:   pl.primaryPosition ?? null,
    development_rate:   pl.developmentRate ?? null,
    potential_hidden:   pl.potentialHidden ?? null,
    position_ratings_json: pl.positionRatings ? JSON.stringify(pl.positionRatings) : null,
    pitches_json:       pl.pitches ? JSON.stringify(pl.pitches) : null,

    pitch_ovr:          p.ovr          ?? null,
    pitch_stamina:      p.stamina      ?? null,
    pitch_velocity:     p.velocity     ?? null,
    pitch_command:      p.command      ?? null,
    pitch_control:      p.control      ?? null,
    pitch_movement:     p.movement     ?? null,
    pitch_mentality:    p.mentality    ?? null,
    pitch_recovery:     p.recovery     ?? null,
    pitch_clutch:       p.clutch       ?? null,
    pitch_hold_runners: p.holdRunners  ?? null,

    bat_ovr:            b.ovr          ?? null,
    bat_contact:        b.contact      ?? null,
    bat_power:          b.power        ?? null,
    bat_eye:            b.eye          ?? null,
    bat_discipline:     b.discipline   ?? null,
    bat_speed:          b.speed        ?? null,
    bat_base_instinct:  b.baseInstinct ?? null,
    bat_bunting:        b.bunting      ?? null,
    bat_platoon:        b.platoon      ?? null,
    bat_fielding:       b.fielding     ?? null,
    bat_arm:            b.arm          ?? null,
    bat_clutch:         b.battingClutch ?? null,

    military_status:    e.militaryStatus ?? null,

    pro_service_years:  pl.proServiceYears ?? null,
    contract_json:      pl.contract ? JSON.stringify(pl.contract) : null,

    staff_json: Object.keys(staffData).length > 0 ? JSON.stringify(staffData) : null,
    personality_json: e.role === "player" ? generatePersonality(e) : null,
  };
}

// ── 메인 ──────────────────────────────────────────────────────
function main() {
  const files = fs.readdirSync(ENTITIES_DIR)
    .filter(f => f.endsWith(".json") && f !== "_index.json");

  console.log(`[generate_master_db] ${files.length}개 entity 파일 처리 중...`);

  const db   = openMasterDb(OUT_DB);
  const stmt = db.prepare(`
    INSERT INTO npc_master VALUES (
      @id, @name, @name_en, @role, @age, @status,
      @origin_league_id, @league_id, @club_id, @team_id,
      @school_id, @grade, @notes, @diligence, @popularity,
      @player_type, @handedness, @position, @jersey_number,
      @primary_position, @development_rate, @potential_hidden,
      @position_ratings_json, @pitches_json,
      @pitch_ovr, @pitch_stamina, @pitch_velocity, @pitch_command,
      @pitch_control, @pitch_movement, @pitch_mentality,
      @pitch_recovery, @pitch_clutch, @pitch_hold_runners,
      @bat_ovr, @bat_contact, @bat_power, @bat_eye,
      @bat_discipline, @bat_speed, @bat_base_instinct,
      @bat_bunting, @bat_platoon, @bat_fielding, @bat_arm, @bat_clutch,
      @military_status,
      @pro_service_years, @contract_json,
      @staff_json,
      @personality_json
    )
  `);

  const insertAll = db.transaction((rows) => {
    for (const row of rows) stmt.run(row);
  });

  const rows = [];
  let errors = 0;
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(ENTITIES_DIR, file), "utf8").replace(/^﻿/, "");
      const entity = JSON.parse(raw);
      rows.push(entityToRow(entity));
    } catch (e) {
      console.warn(`  [skip] ${file}: ${e.message}`);
      errors++;
    }
  }

  insertAll(rows);
  db.close();

  console.log(`[generate_master_db] 완료: ${rows.length}개 삽입, ${errors}개 오류`);
  console.log(`[generate_master_db] → ${OUT_DB}`);
}

main();
