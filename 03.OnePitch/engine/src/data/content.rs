use rusqlite::{Connection, Transaction};

use super::migration::{apply_migrations, Migration};

const V1_DDL: &str = r#"
CREATE TABLE events (
  id TEXT PRIMARY KEY, stage TEXT, week INTEGER, type TEXT,
  urgency TEXT,
  trigger TEXT, body TEXT
);
CREATE TABLE pitch_types (
  id TEXT PRIMARY KEY, family TEXT,
  name TEXT, meta TEXT
);
CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT, role TEXT, arcs TEXT);
CREATE TABLE personality_rules (context TEXT PRIMARY KEY, trait_weights TEXT);
CREATE TABLE narrative_templates (id TEXT PRIMARY KEY, category TEXT, template TEXT, variants TEXT);
CREATE TABLE achievements (id TEXT PRIMARY KEY, category TEXT, condition TEXT, meta TEXT);
CREATE TABLE name_pools (id TEXT PRIMARY KEY, locale TEXT, kind TEXT, names TEXT);
CREATE TABLE generation_rules (league_id TEXT PRIMARY KEY REFERENCES leagues(id), rules TEXT);
CREATE TABLE world_config (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE leagues (id TEXT PRIMARY KEY, meta TEXT);
CREATE TABLE teams   (id TEXT PRIMARY KEY, league_id TEXT REFERENCES leagues(id),
                      color TEXT, meta TEXT);
CREATE TABLE schools (id TEXT PRIMARY KEY, region TEXT, meta TEXT);
CREATE TABLE team_traits  (team_id TEXT PRIMARY KEY REFERENCES teams(id),
                           philosophy TEXT, resource TEXT, status TEXT);
CREATE TABLE team_history (team_id TEXT PRIMARY KEY REFERENCES teams(id),
                           founded_year INTEGER, budget INTEGER,
                           rivals TEXT, season_ranks TEXT, titles TEXT);

CREATE TABLE balance_open (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE strings (string_id TEXT, locale TEXT, text TEXT, PRIMARY KEY(string_id, locale));
"#;

fn migration_v1(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V1_DDL)?;
    Ok(())
}

const V2_DDL: &str = r#"
CREATE TABLE stadiums (id TEXT PRIMARY KEY, name TEXT, park_factor TEXT, meta TEXT);
ALTER TABLE teams ADD COLUMN stadium_id TEXT REFERENCES stadiums(id);
"#;

fn migration_v2(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V2_DDL)?;
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
    fn fresh_db_migrates_to_v2() {
        let conn = open_in_memory().unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);

        let table_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='events'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);
    }

    #[test]
    fn v2_adds_stadiums_and_team_stadium_link() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO stadiums (id, name, park_factor, meta) VALUES ('stadium:x', 'X구장', '중립', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO teams (id, league_id, color, meta, stadium_id) VALUES ('team:x', 'league:x', NULL, NULL, 'stadium:x')",
            [],
        )
        .unwrap();

        let stadium_id: String = conn
            .query_row(
                "SELECT stadium_id FROM teams WHERE id = 'team:x'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stadium_id, "stadium:x");
    }

    #[test]
    fn foreign_key_violation_is_blocked() {
        let conn = open_in_memory().unwrap();
        let result = conn.execute(
            "INSERT INTO teams (id, league_id, color, meta) VALUES ('team:x', 'league:missing', NULL, NULL)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn reopening_does_not_duplicate_schema() {
        let path = std::env::temp_dir().join(format!(
            "onepitch_content_test_{}.db",
            std::process::id()
        ));
        let path_str = path.to_str().unwrap();
        let _ = std::fs::remove_file(&path);

        open(path_str).unwrap();
        open(path_str).unwrap();

        std::fs::remove_file(&path).unwrap();
    }
}