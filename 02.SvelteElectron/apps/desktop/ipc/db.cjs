"use strict";
const path = require("node:path");
const fs   = require("node:fs");
const Database = require("better-sqlite3");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFileOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch { return null; }
}

function openDatabase(dbPath) {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS save_slots (
      slot_id      TEXT PRIMARY KEY,
      name         TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL,
      career_stage TEXT,
      season_year  INTEGER,
      current_week INTEGER,
      team_id      TEXT
    );

    CREATE TABLE IF NOT EXISTS protagonist (
      slot_id                        TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      p_id                           TEXT NOT NULL DEFAULT 'PLY_HERO',
      name                           TEXT NOT NULL DEFAULT '',
      name_en                        TEXT,
      career_stage                   TEXT NOT NULL DEFAULT 'highschool',
      league_id                      TEXT NOT NULL DEFAULT '',
      team_id                        TEXT NOT NULL DEFAULT '',
      school_id                      TEXT,
      grade                          INTEGER,
      age                            INTEGER NOT NULL DEFAULT 18,
      player_type                    TEXT NOT NULL DEFAULT 'pitcher',
      position                       TEXT NOT NULL DEFAULT '',
      handedness                     TEXT NOT NULL DEFAULT 'R',
      pitching_form                  TEXT,
      jersey_number                  INTEGER NOT NULL DEFAULT 18,
      condition                      INTEGER NOT NULL DEFAULT 80,
      fatigue                        INTEGER NOT NULL DEFAULT 20,
      morale                         INTEGER NOT NULL DEFAULT 65,
      pitch_ovr INTEGER, pitch_stamina INTEGER, pitch_velocity INTEGER,
      pitch_command INTEGER, pitch_control INTEGER, pitch_movement INTEGER,
      pitch_mentality INTEGER, pitch_recovery INTEGER, pitch_clutch INTEGER,
      pitch_hold_runners INTEGER,
      bat_ovr INTEGER, bat_contact INTEGER, bat_power INTEGER,
      bat_eye INTEGER, bat_discipline INTEGER, bat_speed INTEGER,
      bat_base_instinct INTEGER, bat_bunting INTEGER, bat_platoon INTEGER,
      bat_fielding INTEGER, bat_arm INTEGER, bat_batting_clutch INTEGER,
      primary_position               TEXT,
      position_ratings_json          TEXT,
      diligence                      INTEGER NOT NULL DEFAULT 60,
      popularity                     INTEGER NOT NULL DEFAULT 10,
      development_rate               INTEGER NOT NULL DEFAULT 62,
      potential_hidden               INTEGER NOT NULL DEFAULT 88,
      growth_points                  INTEGER NOT NULL DEFAULT 0,
      training_pitch_id              TEXT,
      training_pitch_progress        REAL,
      training_primary               TEXT,
      training_secondary             TEXT,
      training_recovery              TEXT,
      money                          INTEGER NOT NULL DEFAULT 0,
      fame                           INTEGER NOT NULL DEFAULT 0,
      scout_score                    INTEGER NOT NULL DEFAULT 0,
      pro_service_years              INTEGER NOT NULL DEFAULT 0,
      military_unit                  TEXT,
      military_service_weeks         INTEGER NOT NULL DEFAULT 0,
      military_recovery_weeks        INTEGER NOT NULL DEFAULT 0,
      military_status                TEXT NOT NULL DEFAULT '미필',
      military_enlist_year           INTEGER,
      military_discharge_year        INTEGER,
      military_enlist_week           INTEGER,
      sports_unit_selected           INTEGER NOT NULL DEFAULT 0,
      military_hiatus_stage          TEXT,
      military_hiatus_university_week INTEGER,
      military_defer_penalty         INTEGER NOT NULL DEFAULT 0,
      trade_adaptation_weeks         INTEGER NOT NULL DEFAULT 0,
      fa_negotiation_round           INTEGER NOT NULL DEFAULT 0,
      fa_unsigned_weeks              INTEGER NOT NULL DEFAULT 0,
      consecutive_low_morale_weeks   INTEGER NOT NULL DEFAULT 0,
      consecutive_high_fatigue_weeks INTEGER NOT NULL DEFAULT 0,
      injury_type                    TEXT,
      injury_recovery_weeks          INTEGER,
      game_version                   INTEGER NOT NULL DEFAULT 2,
      saved_at                       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS protagonist_contract (
      slot_id             TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      team_id             TEXT NOT NULL,
      league_id           TEXT NOT NULL DEFAULT '',
      salary              INTEGER NOT NULL DEFAULT 0,
      duration_years      INTEGER NOT NULL DEFAULT 1,
      remaining_years     INTEGER NOT NULL DEFAULT 1,
      signing_bonus       INTEGER NOT NULL DEFAULT 0,
      team_option_years   INTEGER NOT NULL DEFAULT 0,
      player_option_years INTEGER NOT NULL DEFAULT 0,
      no_trade            INTEGER NOT NULL DEFAULT 0,
      incentives_json     TEXT,
      status              TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS protagonist_pitches (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      pitch_id   TEXT NOT NULL,
      grade      INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, pitch_id)
    );

    CREATE TABLE IF NOT EXISTS protagonist_tags (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      tag        TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, tag)
    );

    CREATE TABLE IF NOT EXISTS protagonist_xp (
      slot_id   TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      stat_type TEXT    NOT NULL,
      stat_key  TEXT    NOT NULL,
      xp_value  REAL    NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, stat_type, stat_key)
    );

    CREATE TABLE IF NOT EXISTS protagonist_school (
      slot_id                            TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      attends_university                 INTEGER NOT NULL DEFAULT 0,
      university_major                   TEXT,
      planned_university_majors_json     TEXT,
      weekly_study_mode                  TEXT NOT NULL DEFAULT 'normal',
      exam_accum_score                   REAL NOT NULL DEFAULT 0,
      last_grade                         TEXT,
      last_grade_risk                    TEXT NOT NULL DEFAULT 'ok',
      eligibility_blocked                INTEGER NOT NULL DEFAULT 0,
      warning_count                      INTEGER NOT NULL DEFAULT 0,
      career_choice_triggered            INTEGER NOT NULL DEFAULT 0,
      draft_triggered                    INTEGER NOT NULL DEFAULT 0,
      draft_intent                       INTEGER NOT NULL DEFAULT 0,
      career_applications_submitted      INTEGER NOT NULL DEFAULT 0,
      fallback_selection_pending         INTEGER NOT NULL DEFAULT 0,
      fallback_university_choices_json   TEXT,
      fallback_independent_choices_json  TEXT,
      fallback_university_passed_json    TEXT,
      fallback_independent_passed_json   TEXT,
      fallback_sports_military_passed    INTEGER NOT NULL DEFAULT 0,
      fallback_draft_passed              INTEGER NOT NULL DEFAULT 0,
      fallback_draft_team_id             TEXT,
      fallback_draft_round               INTEGER,
      fallback_draft_pick                INTEGER,
      fallback_draft_signing_bonus       INTEGER NOT NULL DEFAULT 0,
      career_choice_popup_opened         INTEGER NOT NULL DEFAULT 0,
      career_choice_mode                 TEXT NOT NULL DEFAULT 'none',
      career_choice_confirmed            INTEGER NOT NULL DEFAULT 0,
      career_choice_univ_apps_json       TEXT,
      career_choice_ind_apps_json        TEXT,
      career_draft_pick_log_json         TEXT,
      career_final_choice                TEXT NOT NULL DEFAULT 'none',
      university_week                    INTEGER NOT NULL DEFAULT 0,
      major_selected                     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subject_scores (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL,
      percentile REAL NOT NULL DEFAULT 50,
      attendance REAL NOT NULL DEFAULT 100,
      assignment REAL NOT NULL DEFAULT 100,
      PRIMARY KEY (slot_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      slot_id        TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      achievement_id TEXT    NOT NULL,
      progress       INTEGER NOT NULL DEFAULT 0,
      unlocked_at    TEXT,
      claimed_at     TEXT,
      tracked        INTEGER,
      PRIMARY KEY (slot_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS achievement_metrics (
      slot_id               TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      strikeout_total       INTEGER NOT NULL DEFAULT 0,
      save_total            INTEGER NOT NULL DEFAULT 0,
      kakao_first_contact   INTEGER NOT NULL DEFAULT 0,
      training_weeks_total  INTEGER NOT NULL DEFAULT 0,
      games_won_total       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mailbox (
      slot_id       TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      msg_id        TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'system',
      sender        TEXT NOT NULL DEFAULT '',
      subject       TEXT NOT NULL DEFAULT '',
      preview       TEXT NOT NULL DEFAULT '',
      body          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT '',
      read_at       TEXT,
      decision_json TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, msg_id)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      slot_id           TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      contact_id        TEXT NOT NULL,
      name              TEXT NOT NULL DEFAULT '',
      category          TEXT NOT NULL DEFAULT 'misc',
      relation          TEXT NOT NULL DEFAULT 'acquaintance',
      unlocked          INTEGER NOT NULL DEFAULT 0,
      affinity          INTEGER NOT NULL DEFAULT 0,
      last_action_week  INTEGER NOT NULL DEFAULT 0,
      chat_history_json TEXT,
      flags_json        TEXT,
      PRIMARY KEY (slot_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS recent_logs (
      slot_id    TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      log_text   TEXT NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS recent_upcoming (
      slot_id       TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      upcoming_text TEXT NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS npc_runtime (
      slot_id                  TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id                   TEXT NOT NULL,
      name                     TEXT NOT NULL DEFAULT '',
      name_en                  TEXT,
      player_type              TEXT NOT NULL DEFAULT 'pitcher',
      position                 TEXT NOT NULL DEFAULT '',
      handedness               TEXT NOT NULL DEFAULT 'R',
      jersey_number            INTEGER NOT NULL DEFAULT 0,
      position_ratings_json    TEXT,
      age                      INTEGER NOT NULL DEFAULT 18,
      grade                    INTEGER,
      school_id                TEXT NOT NULL DEFAULT '',
      graduation_year          INTEGER NOT NULL DEFAULT 0,
      career_status            TEXT NOT NULL DEFAULT 'active',
      current_league           TEXT NOT NULL DEFAULT '',
      current_team             TEXT NOT NULL DEFAULT '',
      military_status          TEXT NOT NULL DEFAULT '미필',
      military_enlist_year     INTEGER,
      military_discharge_year  INTEGER,
      current_salary           INTEGER NOT NULL DEFAULT 0,
      contract_years           INTEGER NOT NULL DEFAULT 1,
      sports_unit_selected     INTEGER NOT NULL DEFAULT 0,
      pro_service_years        INTEGER NOT NULL DEFAULT 0,
      development_rate         INTEGER NOT NULL DEFAULT 60,
      pitch_ovr INTEGER, pitch_stamina INTEGER, pitch_velocity INTEGER,
      pitch_command INTEGER, pitch_control INTEGER, pitch_movement INTEGER,
      pitch_mentality INTEGER, pitch_recovery INTEGER, pitch_clutch INTEGER,
      pitch_hold_runners INTEGER,
      bat_ovr INTEGER, bat_contact INTEGER, bat_power INTEGER,
      bat_eye INTEGER, bat_discipline INTEGER, bat_speed INTEGER,
      bat_base_instinct INTEGER, bat_bunting INTEGER, bat_platoon INTEGER,
      bat_fielding INTEGER, bat_arm INTEGER, bat_batting_clutch INTEGER,
      PRIMARY KEY (slot_id, npc_id)
    );

    CREATE TABLE IF NOT EXISTS npc_career_history (
      slot_id        TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id         TEXT    NOT NULL,
      year           INTEGER NOT NULL,
      league_id      TEXT    NOT NULL DEFAULT '',
      team_id        TEXT    NOT NULL DEFAULT '',
      stat_line      TEXT    NOT NULL DEFAULT '',
      highlights_json TEXT,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, npc_id, year, sort_order)
    );

    CREATE TABLE IF NOT EXISTS npc_achievements (
      slot_id          TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      npc_id           TEXT    NOT NULL,
      achievement_text TEXT    NOT NULL,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, npc_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS npc_game_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id   TEXT    NOT NULL,
      npc_id    TEXT    NOT NULL,
      season    INTEGER NOT NULL,
      week      INTEGER NOT NULL,
      role      TEXT    NOT NULL,
      stat_json TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ngl_lookup ON npc_game_log(slot_id, npc_id, season DESC, week DESC);

    CREATE TABLE IF NOT EXISTS league_transactions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id         TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      season_year     INTEGER NOT NULL,
      week            INTEGER,
      category        TEXT    NOT NULL,
      player_id       TEXT    NOT NULL DEFAULT '',
      player_name     TEXT    NOT NULL DEFAULT '',
      from_team_id    TEXT,
      from_league_id  TEXT,
      to_team_id      TEXT,
      to_league_id    TEXT,
      detail          TEXT,
      group_id        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lt_lookup ON league_transactions(slot_id, season_year DESC, id DESC);

    CREATE TABLE IF NOT EXISTS npc_season_stats (
      slot_id        TEXT    NOT NULL,
      npc_id         TEXT    NOT NULL,
      season         INTEGER NOT NULL,
      league_id      TEXT    NOT NULL DEFAULT '',
      role           TEXT    NOT NULL,
      games          INTEGER NOT NULL DEFAULT 0,
      wins           INTEGER NOT NULL DEFAULT 0,
      losses         INTEGER NOT NULL DEFAULT 0,
      saves          INTEGER NOT NULL DEFAULT 0,
      holds          INTEGER NOT NULL DEFAULT 0,
      ip             REAL    NOT NULL DEFAULT 0,
      er             INTEGER NOT NULL DEFAULT 0,
      hits_allowed   INTEGER NOT NULL DEFAULT 0,
      strikeouts     INTEGER NOT NULL DEFAULT 0,
      walks          INTEGER NOT NULL DEFAULT 0,
      pitch_count    INTEGER NOT NULL DEFAULT 0,
      at_bats        INTEGER NOT NULL DEFAULT 0,
      hits           INTEGER NOT NULL DEFAULT 0,
      home_runs      INTEGER NOT NULL DEFAULT 0,
      rbi            INTEGER NOT NULL DEFAULT 0,
      walks_bat      INTEGER NOT NULL DEFAULT 0,
      strikeouts_bat INTEGER NOT NULL DEFAULT 0,
      stolen_bases   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, npc_id, season, league_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nss_player ON npc_season_stats(slot_id, npc_id);

    CREATE TABLE IF NOT EXISTS npc_career_arc (
      slot_id       TEXT    NOT NULL,
      npc_id        TEXT    NOT NULL,
      retired_season INTEGER NOT NULL,
      peak_ovr      INTEGER NOT NULL DEFAULT 0,
      career_war    REAL    NOT NULL DEFAULT 0,
      stat_json     TEXT    NOT NULL DEFAULT '{}',
      PRIMARY KEY (slot_id, npc_id)
    );

    CREATE TABLE IF NOT EXISTS season_meta (
      slot_id      TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      version      INTEGER NOT NULL DEFAULT 1,
      saved_at     TEXT NOT NULL DEFAULT '',
      league_id    TEXT NOT NULL DEFAULT '',
      season_year  INTEGER NOT NULL DEFAULT 2026,
      current_week INTEGER NOT NULL DEFAULT 0,
      total_weeks  INTEGER NOT NULL DEFAULT 52
    );

    CREATE TABLE IF NOT EXISTS season_schedule (
      slot_id             TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      schedule_id         TEXT    NOT NULL,
      week                INTEGER NOT NULL,
      league_id           TEXT,
      home_team_id        TEXT    NOT NULL,
      away_team_id        TEXT    NOT NULL,
      is_protagonist_game INTEGER NOT NULL DEFAULT 0,
      phase               TEXT,
      result_json         TEXT,
      PRIMARY KEY (slot_id, schedule_id)
    );

    CREATE TABLE IF NOT EXISTS season_standings (
      slot_id      TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      team_id      TEXT    NOT NULL,
      wins         INTEGER NOT NULL DEFAULT 0,
      losses       INTEGER NOT NULL DEFAULT 0,
      draws        INTEGER NOT NULL DEFAULT 0,
      win_pct      REAL    NOT NULL DEFAULT 0,
      runs_for     INTEGER NOT NULL DEFAULT 0,
      runs_against INTEGER NOT NULL DEFAULT 0,
      streak       TEXT    NOT NULL DEFAULT '',
      last10       TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (slot_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS season_stats (
      slot_id   TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      g INTEGER NOT NULL DEFAULT 0,
      gs INTEGER, w INTEGER, l INTEGER, sv INTEGER, hd INTEGER,
      ip REAL, er INTEGER, h_p INTEGER, k_p INTEGER, bb_p INTEGER,
      era REAL, whip REAL,
      pa INTEGER, ab INTEGER, h_b INTEGER, hr INTEGER, rbi INTEGER,
      sb INTEGER, bb_b INTEGER, k_b INTEGER,
      avg_v REAL, obp REAL, slg REAL, ops REAL,
      PRIMARY KEY (slot_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS triggered_events (
      slot_id  TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      event_id TEXT    NOT NULL,
      last_week INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (slot_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      slot_id     TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      action_json TEXT    NOT NULL,
      PRIMARY KEY (slot_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS season_league_schedule (
      slot_id             TEXT    NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id           TEXT    NOT NULL,
      schedule_id         TEXT    NOT NULL,
      week                INTEGER NOT NULL,
      home_team_id        TEXT    NOT NULL,
      away_team_id        TEXT    NOT NULL,
      is_protagonist_game INTEGER NOT NULL DEFAULT 0,
      phase               TEXT,
      result_json         TEXT,
      PRIMARY KEY (slot_id, league_id, schedule_id)
    );

    CREATE TABLE IF NOT EXISTS season_league_standings (
      slot_id      TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id    TEXT NOT NULL,
      team_id      TEXT NOT NULL,
      wins         INTEGER NOT NULL DEFAULT 0,
      losses       INTEGER NOT NULL DEFAULT 0,
      draws        INTEGER NOT NULL DEFAULT 0,
      win_pct      REAL NOT NULL DEFAULT 0,
      runs_for     INTEGER NOT NULL DEFAULT 0,
      runs_against INTEGER NOT NULL DEFAULT 0,
      streak       TEXT NOT NULL DEFAULT '',
      last10       TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (slot_id, league_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS season_league_stats (
      slot_id   TEXT NOT NULL REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      league_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      g INTEGER NOT NULL DEFAULT 0,
      gs INTEGER, w INTEGER, l INTEGER, sv INTEGER, hd INTEGER,
      ip REAL, er INTEGER, h_p INTEGER, k_p INTEGER, bb_p INTEGER,
      era REAL, whip REAL,
      pa INTEGER, ab INTEGER, h_b INTEGER, hr INTEGER, rbi INTEGER,
      sb INTEGER, bb_b INTEGER, k_b INTEGER,
      avg_v REAL, obp REAL, slg REAL, ops REAL,
      PRIMARY KEY (slot_id, league_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS save_integrity (
      slot_id    TEXT PRIMARY KEY REFERENCES save_slots(slot_id) ON DELETE CASCADE,
      snapshot   TEXT NOT NULL,
      sig        TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function applySchemaPatches(db) {
  const currentVersion = db.pragma("user_version", { simple: true });

  if (currentVersion < 1) {
    db.transaction(() => {
      const hasOldPk = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='npc_season_stats'"
      ).get()?.sql?.includes("PRIMARY KEY (slot_id, npc_id, season)") ?? false;

      if (hasOldPk) {
        db.exec(`
          ALTER TABLE npc_season_stats RENAME TO npc_season_stats_v0;
          CREATE TABLE npc_season_stats (
            slot_id        TEXT    NOT NULL,
            npc_id         TEXT    NOT NULL,
            season         INTEGER NOT NULL,
            league_id      TEXT    NOT NULL DEFAULT '',
            role           TEXT    NOT NULL,
            games          INTEGER NOT NULL DEFAULT 0,
            wins           INTEGER NOT NULL DEFAULT 0,
            losses         INTEGER NOT NULL DEFAULT 0,
            saves          INTEGER NOT NULL DEFAULT 0,
            holds          INTEGER NOT NULL DEFAULT 0,
            ip             REAL    NOT NULL DEFAULT 0,
            er             INTEGER NOT NULL DEFAULT 0,
            hits_allowed   INTEGER NOT NULL DEFAULT 0,
            strikeouts     INTEGER NOT NULL DEFAULT 0,
            walks          INTEGER NOT NULL DEFAULT 0,
            pitch_count    INTEGER NOT NULL DEFAULT 0,
            at_bats        INTEGER NOT NULL DEFAULT 0,
            hits           INTEGER NOT NULL DEFAULT 0,
            home_runs      INTEGER NOT NULL DEFAULT 0,
            rbi            INTEGER NOT NULL DEFAULT 0,
            walks_bat      INTEGER NOT NULL DEFAULT 0,
            strikeouts_bat INTEGER NOT NULL DEFAULT 0,
            stolen_bases   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (slot_id, npc_id, season, league_id)
          );
          INSERT OR IGNORE INTO npc_season_stats SELECT * FROM npc_season_stats_v0;
          DROP TABLE npc_season_stats_v0;
          CREATE INDEX IF NOT EXISTS idx_nss_player ON npc_season_stats(slot_id, npc_id);
        `);
        console.log("[db-patch] v1: npc_season_stats PK → (slot_id, npc_id, season, league_id)");
      }
      db.pragma("user_version = 1");
    })();
  }

  if (currentVersion < 2) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS npc_career_arc (
          slot_id        TEXT    NOT NULL,
          npc_id         TEXT    NOT NULL,
          retired_season INTEGER NOT NULL,
          peak_ovr       INTEGER NOT NULL DEFAULT 0,
          career_war     REAL    NOT NULL DEFAULT 0,
          stat_json      TEXT    NOT NULL DEFAULT '{}',
          PRIMARY KEY (slot_id, npc_id)
        );
        CREATE INDEX IF NOT EXISTS idx_nca_slot ON npc_career_arc(slot_id, retired_season DESC);
      `);
      db.pragma("user_version = 2");
      console.log("[db-patch] v2: npc_career_arc table + index");
    })();
  }

  if (currentVersion < 3) {
    db.transaction(() => {
      const hasSalaryCol = db.prepare(
        "SELECT name FROM pragma_table_info('npc_runtime') WHERE name='current_salary'"
      ).get();
      if (!hasSalaryCol) {
        db.exec("ALTER TABLE npc_runtime ADD COLUMN current_salary INTEGER NOT NULL DEFAULT 0");
        console.log("[db-patch] v3: npc_runtime.current_salary 컬럼 추가");
      }
      const hasContractCol = db.prepare(
        "SELECT name FROM pragma_table_info('npc_runtime') WHERE name='contract_years'"
      ).get();
      if (!hasContractCol) {
        db.exec("ALTER TABLE npc_runtime ADD COLUMN contract_years INTEGER NOT NULL DEFAULT 1");
        console.log("[db-patch] v3: npc_runtime.contract_years 컬럼 추가");
      }
      const hasProServiceCol = db.prepare(
        "SELECT name FROM pragma_table_info('npc_runtime') WHERE name='pro_service_years'"
      ).get();
      if (!hasProServiceCol) {
        db.exec("ALTER TABLE npc_runtime ADD COLUMN pro_service_years INTEGER NOT NULL DEFAULT 0");
        console.log("[db-patch] v3: npc_runtime.pro_service_years 컬럼 추가");
      }
      db.pragma("user_version = 3");
    })();
  }

  if (currentVersion < 4) {
    db.transaction(() => {
      const protagonistCols = [
        ["military_unit",                   "TEXT"],
        ["military_service_weeks",          "INTEGER NOT NULL DEFAULT 0"],
        ["military_recovery_weeks",         "INTEGER NOT NULL DEFAULT 0"],
        ["military_status",                 "TEXT NOT NULL DEFAULT '미필'"],
        ["military_enlist_year",            "INTEGER"],
        ["military_discharge_year",         "INTEGER"],
        ["military_enlist_week",            "INTEGER"],
        ["sports_unit_selected",            "INTEGER NOT NULL DEFAULT 0"],
        ["military_hiatus_stage",           "TEXT"],
        ["military_hiatus_university_week", "INTEGER"],
        ["military_defer_penalty",          "INTEGER NOT NULL DEFAULT 0"],
        ["trade_adaptation_weeks",          "INTEGER NOT NULL DEFAULT 0"],
        ["fa_negotiation_round",            "INTEGER NOT NULL DEFAULT 0"],
        ["fa_unsigned_weeks",               "INTEGER NOT NULL DEFAULT 0"],
        ["consecutive_low_morale_weeks",    "INTEGER NOT NULL DEFAULT 0"],
        ["consecutive_high_fatigue_weeks",  "INTEGER NOT NULL DEFAULT 0"],
        ["injury_type",                     "TEXT"],
        ["injury_recovery_weeks",           "INTEGER"],
        ["primary_position",                "TEXT"],
        ["position_ratings_json",           "TEXT"],
        ["scout_score",                     "INTEGER NOT NULL DEFAULT 0"],
        ["pro_service_years",               "INTEGER NOT NULL DEFAULT 0"],
        ["growth_points",                   "INTEGER NOT NULL DEFAULT 0"],
      ];
      for (const [col, def] of protagonistCols) {
        const exists = db.prepare(
          `SELECT name FROM pragma_table_info('protagonist') WHERE name=?`
        ).get(col);
        if (!exists) {
          db.exec(`ALTER TABLE protagonist ADD COLUMN ${col} ${def}`);
          console.log(`[db-patch] v4: protagonist.${col} 컬럼 추가`);
        }
      }
      db.pragma("user_version = 4");
      console.log("[db-patch] v4: protagonist 누락 컬럼 보완 완료");
    })();
  }

  if (currentVersion < 5) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_lt_player
      ON league_transactions(slot_id, player_id, id DESC)`);
    db.pragma("user_version = 5");
    console.log("[db-patch] v5: league_transactions player_id 인덱스 추가");
  }

  if (currentVersion < 6) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS history_standings (
          slot_id      TEXT    NOT NULL,
          season_year  INTEGER NOT NULL,
          league_id    TEXT    NOT NULL,
          team_id      TEXT    NOT NULL,
          wins         INTEGER NOT NULL DEFAULT 0,
          losses       INTEGER NOT NULL DEFAULT 0,
          draws        INTEGER NOT NULL DEFAULT 0,
          win_pct      REAL    NOT NULL DEFAULT 0,
          runs_for     INTEGER NOT NULL DEFAULT 0,
          runs_against INTEGER NOT NULL DEFAULT 0,
          streak       TEXT    NOT NULL DEFAULT '',
          last10       TEXT    NOT NULL DEFAULT '',
          PRIMARY KEY (slot_id, season_year, league_id, team_id)
        );
        CREATE TABLE IF NOT EXISTS history_lb_stats (
          slot_id     TEXT    NOT NULL,
          season_year INTEGER NOT NULL,
          league_id   TEXT    NOT NULL,
          player_id   TEXT    NOT NULL,
          stat_type   TEXT    NOT NULL,
          g INTEGER NOT NULL DEFAULT 0,
          gs INTEGER, w INTEGER, l INTEGER, sv INTEGER, hd INTEGER,
          ip REAL, er INTEGER, h_p INTEGER, k_p INTEGER, bb_p INTEGER,
          era REAL, whip REAL,
          pa INTEGER, ab INTEGER, h_b INTEGER, hr INTEGER, rbi INTEGER,
          sb INTEGER, bb_b INTEGER, k_b INTEGER,
          avg_v REAL, obp REAL, slg REAL, ops REAL,
          PRIMARY KEY (slot_id, season_year, league_id, player_id)
        );
        CREATE INDEX IF NOT EXISTS idx_hs_lookup  ON history_standings(slot_id, season_year DESC);
        CREATE INDEX IF NOT EXISTS idx_hls_lookup ON history_lb_stats(slot_id, season_year DESC);
      `);
      db.pragma("user_version = 6");
      console.log("[db-patch] v6: history_standings, history_lb_stats 테이블 추가");
    })();
  }

  if (currentVersion < 7) {
    db.transaction(() => {
      try { db.exec(`ALTER TABLE history_standings ADD COLUMN group_label TEXT NOT NULL DEFAULT ''`); } catch {}
      db.exec(`
        CREATE TABLE IF NOT EXISTS history_postseason (
          slot_id       TEXT    NOT NULL,
          season_year   INTEGER NOT NULL,
          league_id     TEXT    NOT NULL,
          champion_id   TEXT    NOT NULL DEFAULT '',
          runner_up_id  TEXT    NOT NULL DEFAULT '',
          playoff_teams TEXT    NOT NULL DEFAULT '[]',
          PRIMARY KEY (slot_id, season_year, league_id)
        );
        CREATE INDEX IF NOT EXISTS idx_hps_lookup ON history_postseason(slot_id, season_year DESC);
      `);
      db.pragma("user_version = 7");
      console.log("[db-patch] v7: history_standings group_label, history_postseason 추가");
    })();
  }

  if (currentVersion < 8) {
    db.transaction(() => {
      for (const [col, def] of [
        ["handedness",            "TEXT NOT NULL DEFAULT 'R'"],
        ["jersey_number",         "INTEGER NOT NULL DEFAULT 0"],
        ["position_ratings_json", "TEXT"],
      ]) {
        const has = db.prepare(`SELECT name FROM pragma_table_info('npc_runtime') WHERE name='${col}'`).get();
        if (!has) {
          db.exec(`ALTER TABLE npc_runtime ADD COLUMN ${col} ${def}`);
          console.log(`[db-patch] v8: npc_runtime.${col} 컬럼 추가`);
        }
      }
      db.pragma("user_version = 8");
      console.log("[db-patch] v8: npc_runtime handedness/jersey_number/position_ratings_json 추가");
    })();
  }
}

// R3a-4d: dbListSlots/dbSaveSlot/dbLoadSlot(v2 game/season 블롭 세이브) 폐기
// — slot.db(repo:call)이 유일 정본. 아래 masterRowToEntityRow는 master.db(read-only) 전용으로 계속 사용.


function masterRowToEntityRow(r) {
  const normalizedPlayerType =
    r.player_type === "pitcher" || r.player_type === "batter" || r.player_type === "twoWay"
      ? r.player_type
      : "pitcher";
  const player = {
    playerType:      normalizedPlayerType,
    handedness:      r.handedness     ?? "R",
    position:        r.position       ?? "",
    jerseyNumber:    r.jersey_number  ?? 18,
    primaryPosition: r.primary_position ?? undefined,
    positionRatings: r.position_ratings_json ? JSON.parse(r.position_ratings_json) : undefined,
    pitches:         r.pitches_json ? JSON.parse(r.pitches_json) : undefined,
    diligence:       r.diligence      ?? undefined,
    popularity:      r.popularity     ?? undefined,
    developmentRate: r.development_rate ?? 60,
    potentialHidden: r.potential_hidden ?? 60,
    proServiceYears: r.pro_service_years ?? undefined,
    contract: r.contract_json ? JSON.parse(r.contract_json) : undefined,
    militaryEnlistYear: r.military_enlist_year ?? undefined,
    // 현역 엔티티에 한해 origin 정보로 originalLeagueId/TeamId 파생 (Phase 4-1 전역 복귀용)
    originalLeagueId: r.military_status === "현역" ? (r.origin_league_id || undefined) : undefined,
    originalTeamId:   r.military_status === "현역" && r.club_id
      ? r.club_id.replace(/^CLUB_/, "TEAM_") + "_1"
      : undefined,
    pitching: r.pitch_ovr != null ? {
      ovr: r.pitch_ovr, stamina: r.pitch_stamina, velocity: r.pitch_velocity,
      command: r.pitch_command, control: r.pitch_control, movement: r.pitch_movement,
      mentality: r.pitch_mentality, recovery: r.pitch_recovery,
      clutch:      r.pitch_clutch      ?? r.pitch_ovr,
      holdRunners: r.pitch_hold_runners ?? r.pitch_ovr,
    } : null,
    batting: r.bat_ovr != null ? {
      ovr: r.bat_ovr, contact: r.bat_contact, power: r.bat_power, eye: r.bat_eye,
      discipline: r.bat_discipline, speed: r.bat_speed,
      baseInstinct: r.bat_base_instinct ?? r.bat_ovr,
      bunting:      r.bat_bunting       ?? r.bat_ovr,
      platoon:      r.bat_platoon       ?? 50,
      fielding: r.bat_fielding,
      arm: r.bat_arm, battingClutch: r.bat_batting_clutch ?? r.bat_ovr,
    } : null,
  };
  const staffData = r.staff_json ? JSON.parse(r.staff_json) : {};
  return {
    id: r.id, name: r.name, nameEn: r.name_en ?? undefined,
    role: r.role ?? "player", age: r.age ?? 18,
    status: r.status ?? "active",
    originLeagueId: r.origin_league_id ?? "",
    leagueId: r.league_id ?? "", clubId: r.club_id ?? "",
    teamId: r.team_id ?? "", schoolId: r.school_id ?? "",
    grade: r.grade ?? undefined, notes: r.notes ?? "",
    militaryStatus: r.military_status ?? undefined,
    personality: r.personality_json ? JSON.parse(r.personality_json) : undefined,
    entryYear:   r.entry_year   ?? undefined,
    entryLeague: r.entry_league ?? undefined,
    entryTeam:   r.entry_team   ?? undefined,
    entryAge:    r.entry_age    ?? undefined,
    details: {
      player,
      coach:   staffData.coach   ?? null,
      manager: staffData.manager ?? null,
      owner:   staffData.owner   ?? null,
    },
  };
}

function migrateOldDb(newDb, oldDbPath) {
  if (!fs.existsSync(oldDbPath)) return;
  let oldDb;
  try {
    oldDb = new Database(oldDbPath, { readonly: true });
    const hasSaveSlots = oldDb.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='save_slots'").get().c > 0;
    if (!hasSaveSlots) { oldDb.close(); return; }
    const hasGameJson = oldDb.prepare("SELECT COUNT(*) as c FROM pragma_table_info('save_slots') WHERE name='game_json'").get().c > 0;
    if (!hasGameJson) { oldDb.close(); return; }
    const slots = oldDb.prepare("SELECT * FROM save_slots").all();
    for (const slot of slots) {
      if (newDb.prepare("SELECT 1 FROM save_slots WHERE slot_id = ?").get(slot.slot_id)) continue;
      try {
        const game   = slot.game_json   ? JSON.parse(slot.game_json)   : null;
        const season = slot.season_json ? JSON.parse(slot.season_json) : null;
        dbSaveSlot(newDb, slot.slot_id, game, season);
        if (slot.name) newDb.prepare("UPDATE save_slots SET name = ? WHERE slot_id = ?").run(slot.name, slot.slot_id);
        console.log(`[db-migrate] slot ${slot.slot_id} 이전 완료`);
      } catch (e) {
        console.warn(`[db-migrate] slot ${slot.slot_id} 실패:`, e.message);
      }
    }
    oldDb.close();
  } catch (e) {
    console.warn("[db-migrate] 구 DB 마이그레이션 오류:", e.message);
    try { oldDb?.close(); } catch { /* ignore */ }
  }
}

module.exports = {
  openDatabase,
  applySchemaPatches,
  masterRowToEntityRow,
  migrateOldDb,
};
