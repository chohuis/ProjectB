use rusqlite::{Connection, Transaction};

use super::migration::{apply_migrations, Migration};

const V1_DDL: &str = r#"
CREATE TABLE meta (
  save_version INTEGER, content_version INTEGER, world_seed INTEGER,
  stage TEXT, playtime INTEGER, current_day INTEGER, integrity_sig TEXT
);

CREATE TABLE protagonist (
  id TEXT PRIMARY KEY, name TEXT, handedness TEXT, archetype TEXT,
  stats TEXT, xp TEXT, live_state TEXT, finance TEXT,
  pitches TEXT, contract TEXT, injury TEXT
);

CREATE TABLE npc (
  id TEXT PRIMARY KEY, name TEXT, team_id TEXT, position TEXT, age INTEGER,
  is_named INTEGER, retired INTEGER, form REAL, personality TEXT,
  stats TEXT, xp TEXT, live_state TEXT, pitches TEXT
);

CREATE TABLE relationships (
  npc_id TEXT PRIMARY KEY REFERENCES npc(id),
  value INTEGER, arc_stage INTEGER
);

CREATE TABLE season_meta   (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE schedule      (game_id TEXT PRIMARY KEY, day INTEGER, home TEXT, away TEXT, result TEXT);
CREATE TABLE standings     (team_id TEXT PRIMARY KEY, w INTEGER, l INTEGER, t INTEGER, rank INTEGER);
CREATE TABLE season_stats  (player_id TEXT, week INTEGER, line TEXT, PRIMARY KEY(player_id, week));
CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY, type TEXT, urgency TEXT, created_day INTEGER, payload TEXT
);
CREATE TABLE inbox (id TEXT PRIMARY KEY, kind TEXT, urgency TEXT, read INTEGER, day INTEGER, body TEXT);

CREATE TABLE career_history (season INTEGER PRIMARY KEY, line TEXT);
CREATE TABLE game_log       (game_id TEXT PRIMARY KEY, season INTEGER, detail TEXT);
CREATE TABLE league_transactions (id TEXT PRIMARY KEY, day INTEGER, kind TEXT, detail TEXT);
CREATE TABLE history_standings   (season INTEGER, team_id TEXT, rank INTEGER, PRIMARY KEY(season, team_id));
CREATE TABLE history_leaders     (season INTEGER, category TEXT, player_id TEXT, PRIMARY KEY(season, category));
CREATE TABLE achievement_progress (ach_id TEXT PRIMARY KEY, counter INTEGER, achieved_day INTEGER);
"#;

// each migration must set meta.save_version itself — apply_migrations only tracks
// PRAGMA user_version internally, it does not touch application tables.
fn migration_v1(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V1_DDL)?;
    tx.execute(
        "INSERT INTO meta (save_version, content_version, world_seed, stage, playtime, current_day, integrity_sig)
         VALUES (1, 0, 0, 'new', 0, 0, NULL)",
        [],
    )?;
    Ok(())
}

const V2_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN injury TEXT;
"#;

/// I5 5차분(부상 시스템) — npc.injury는 `{"current": null|{...}, "history": [...]}`
/// 형태(08_부상_시스템.md). 신규 생성되는 NPC는 항상 값을 채워 넣지만
/// (repository::generate_league_roster), 컬럼 자체엔 NOT NULL을 안 걸어
/// 기존 스키마 관례(다른 npc 컬럼도 전부 nullable TEXT)를 따름.
fn migration_v2(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V2_DDL)?;
    tx.execute("UPDATE meta SET save_version = 2", [])?;
    Ok(())
}

const V3_DDL: &str = r#"
ALTER TABLE npc ADD COLUMN military_return_day INTEGER;
ALTER TABLE npc ADD COLUMN military_served INTEGER NOT NULL DEFAULT 0;
"#;

/// I5 8차분(병역) — [03_병역](../../../02_기획/03_병역.md). NPC는 §1 "타이밍
/// = 플레이어 유연 선택"을 할 수 없어 §9의 강제편입 기본 경로(현역)만 재현
/// — 다른 JSON blob 컬럼(injury 등)과 달리 단순 플래그라 plain 컬럼 2개로
/// 충분: `military_return_day`(NULL=복무 중 아님, non-NULL=그 날 전역
/// 예정) · `military_served`(평생 1회만 — 재입대 없음, 0/1).
fn migration_v3(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V3_DDL)?;
    tx.execute("UPDATE meta SET save_version = 3", [])?;
    Ok(())
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        up: migration_v1,
    },
    Migration {
        version: 2,
        up: migration_v2,
    },
    Migration {
        version: 3,
        up: migration_v3,
    },
];

fn init(mut conn: Connection) -> anyhow::Result<Connection> {
    conn.pragma_update(None, "foreign_keys", true)?;
    apply_migrations(&mut conn, MIGRATIONS)?;
    Ok(conn)
}

pub fn open(path: &str) -> anyhow::Result<Connection> {
    init(Connection::open(path)?)
}

pub fn open_in_memory() -> anyhow::Result<Connection> {
    init(Connection::open_in_memory()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_db_migrates_to_v1_with_seeded_meta_row() {
        let conn = open_in_memory().unwrap();
        let save_version: i64 = conn
            .query_row("SELECT save_version FROM meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(save_version, 3);
    }

    #[test]
    fn v3_adds_military_columns_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury, military_return_day, military_served)
             VALUES ('npc:x', 'X', 'team:x', '타자', 28, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{}', 700, 1)",
            [],
        )
        .unwrap();
        let (return_day, served): (i64, i64) = conn
            .query_row("SELECT military_return_day, military_served FROM npc WHERE id = 'npc:x'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(return_day, 700);
        assert_eq!(served, 1);
    }

    #[test]
    fn v2_adds_injury_column_to_npc() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES ('npc:x', 'X', 'team:x', '타자', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL, '{\"current\":null,\"history\":[]}')",
            [],
        )
        .unwrap();
        let injury: String = conn.query_row("SELECT injury FROM npc WHERE id = 'npc:x'", [], |r| r.get(0)).unwrap();
        assert_eq!(injury, "{\"current\":null,\"history\":[]}");
    }

    #[test]
    fn foreign_key_violation_is_blocked() {
        let conn = open_in_memory().unwrap();
        let result = conn.execute(
            "INSERT INTO relationships (npc_id, value, arc_stage) VALUES ('npc:missing', 0, 0)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn reopening_does_not_duplicate_meta_row() {
        let path = std::env::temp_dir().join(format!("onepitch_slot_test_{}.db", std::process::id()));
        let path_str = path.to_str().unwrap();
        let _ = std::fs::remove_file(&path);

        open(path_str).unwrap();
        let conn = open(path_str).unwrap();

        let row_count: i64 = conn
            .query_row("SELECT count(*) FROM meta", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 1);

        drop(conn);
        std::fs::remove_file(&path).unwrap();
    }
}