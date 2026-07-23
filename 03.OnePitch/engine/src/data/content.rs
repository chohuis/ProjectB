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

const V3_DDL: &str = r#"
ALTER TABLE events ADD COLUMN choices TEXT;
"#;

/// I8 1차분(콘텐츠 저작 파이프라인) — [02_이벤트](../../../02_기획/콘텐츠/02_이벤트.md)
/// §2 선택지 구조. `choices`는 `[{"id","label","effects":[...]}]` 형태(빈
/// 배열/NULL = 선택지 없음 = [03_메시지_알림](../../../02_기획/콘텐츠/03_메시지_알림.md)
/// §7 판별기준의 "메시지"). `trigger`(기존 컬럼)는 폴링형 조건만 채우고
/// 콜백형은 계속 NULL — 호출부(`data::repository`)가 조건을 이미 다
/// 체크했으므로.
fn migration_v3(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V3_DDL)?;
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

/// A team as needed by roster generation — just the bits generation_rules/
/// personality_rules need (id + the two trait slots used as personality
/// context keys). Not the full `teams` row.
pub struct TeamForRoster {
    pub id: String,
    pub philosophy: String,
    pub resource: String,
    pub status: String,
}

/// Teams in a league, ordered by id — the fixed iteration order the
/// deterministic RNG stream in sim::roster relies on.
pub fn load_teams_for_league(conn: &Connection, league_id: &str) -> anyhow::Result<Vec<TeamForRoster>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, tt.philosophy, tt.resource, tt.status
         FROM teams t JOIN team_traits tt ON tt.team_id = t.id
         WHERE t.league_id = ?1
         ORDER BY t.id",
    )?;
    let rows = stmt.query_map([league_id], |row| {
        Ok(TeamForRoster {
            id: row.get(0)?,
            philosophy: row.get(1)?,
            resource: row.get(2)?,
            status: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Just the team ids in a league — no team_traits JOIN, so callers that only
/// need ids (schedule/postseason orchestration) don't silently get an empty
/// list if traits haven't been seeded for some reason. `load_teams_for_league`
/// stays JOIN-based because sim::roster genuinely needs philosophy/status.
pub fn load_team_ids_for_league(conn: &Connection, league_id: &str) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT id FROM teams WHERE league_id = ?1 ORDER BY id")?;
    let rows = stmt.query_map([league_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Groups a league's teams for round-robin schedule generation. 프로/프로2군은
/// 팀별 전용구장이라 그룹핑에 못 쓰므로 리그 전체를 단일 그룹으로; 대학·고교는
/// I2에서 이미 확정된 stadium_id(대학 5조·고교 8권역, 각각 거점구장 공유)를
/// 그대로 그룹 경계로 재사용 — 새로운 조편성 결정을 안 지어냄.
pub fn load_team_groups_for_schedule(conn: &Connection, league_id: &str) -> anyhow::Result<Vec<Vec<String>>> {
    let mut stmt = conn.prepare("SELECT id, stadium_id FROM teams WHERE league_id = ?1 ORDER BY id")?;
    let rows: Vec<(String, Option<String>)> =
        stmt.query_map([league_id], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<Vec<_>, _>>()?;

    if league_id == "league:pro" || league_id == "league:pro_farm" {
        return Ok(vec![rows.into_iter().map(|(id, _)| id).collect()]);
    }

    let mut groups: std::collections::BTreeMap<String, Vec<String>> = std::collections::BTreeMap::new();
    for (team_id, stadium_id) in rows {
        let key = stadium_id.unwrap_or_else(|| "ungrouped".to_string());
        groups.entry(key).or_default().push(team_id);
    }
    Ok(groups.into_values().collect())
}

pub fn load_generation_rule(conn: &Connection, league_id: &str) -> anyhow::Result<serde_json::Value> {
    let raw: String = conn.query_row(
        "SELECT rules FROM generation_rules WHERE league_id = ?1",
        [league_id],
        |row| row.get(0),
    )?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn load_name_pool(conn: &Connection, locale: &str, kind: &str) -> anyhow::Result<Vec<String>> {
    let id = format!("namepool:{locale}_{kind}");
    let raw: String = conn.query_row("SELECT names FROM name_pools WHERE id = ?1", [id], |row| row.get(0))?;
    Ok(serde_json::from_str(&raw)?)
}

/// Merges the philosophy/status/role personality_rules contexts relevant to a
/// generated player. Missing contexts (not yet seeded) are silently skipped —
/// callers get whatever weight is available rather than an error.
pub fn load_personality_rule(conn: &Connection, context: &str) -> anyhow::Result<Option<serde_json::Value>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT trait_weights FROM personality_rules WHERE context = ?1",
            [context],
            |row| row.get(0),
        )
        .ok();
    Ok(raw.map(|r| serde_json::from_str(&r)).transpose()?)
}

/// All pitch names besides 포심 패스트볼 (fastball is every pitcher's fixed
/// starting pitch per 07_주인공_생성.md §6 — this pool is for the 0~1 extra).
pub fn load_secondary_pitch_names(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT name FROM pitch_types WHERE name != '포심 패스트볼' ORDER BY id")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_db_migrates_to_v3() {
        let conn = open_in_memory().unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);

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
    fn v3_adds_choices_column_to_events() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO events (id, stage, week, type, urgency, trigger, body, choices)
             VALUES ('event:x', NULL, NULL, 'personal', 'normal', NULL, '본문', '[{\"id\":\"a\",\"label\":\"A\"}]')",
            [],
        )
        .unwrap();
        let choices: String = conn.query_row("SELECT choices FROM events WHERE id = 'event:x'", [], |r| r.get(0)).unwrap();
        assert!(choices.contains("\"id\":\"a\""));
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