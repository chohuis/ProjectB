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

const V4_DDL: &str = r#"
CREATE TABLE match_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  game_id TEXT NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, league_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  inning INTEGER NOT NULL, top_of_inning INTEGER NOT NULL, outs INTEGER NOT NULL,
  bases TEXT NOT NULL,
  home_runs INTEGER NOT NULL, away_runs INTEGER NOT NULL,
  home_batter_idx INTEGER NOT NULL, away_batter_idx INTEGER NOT NULL,
  balls INTEGER NOT NULL, strikes INTEGER NOT NULL,
  current_batter_id TEXT,
  pitch_seq INTEGER NOT NULL DEFAULT 0
);
"#;

/// I6 3차분(주인공 등판 매치 세션) — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §12 "경기는 시작~종료가 하나의 단위... 경기 중 저장 불가"대로 이 테이블은
/// 진행 중인 경기 하나(단일 행, `id=1` 고정)만 담는 휘발성 상태 — 시즌
/// 경계 그룹(`schedule` 등)과 달리 season_rollover가 안 건드리고, 경기가
/// 끝나거나(정상 종료) 중단되면(재접속 등) 그때그때 지워진다.
fn migration_v4(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V4_DDL)?;
    tx.execute("UPDATE meta SET save_version = 4", [])?;
    Ok(())
}

const V5_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN training TEXT;
"#;

/// I6 잔여(훈련 슬롯) — [06_훈련_시스템](../../../02_기획/육성코어/06_훈련_시스템.md).
/// `training`은 `{"primary_stat","secondary_stats","intensity","new_pitch","pitch_weeks"}`
/// 형태 — 다른 protagonist JSON 컬럼(live_state 등)과 같은 관례로 nullable
/// TEXT. NULL = "아직 훈련 설정을 한 번도 안 함"(플레이어가 최소 1회는
/// `set_protagonist_training`을 호출해야 주간 성장이 시작됨).
fn migration_v5(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V5_DDL)?;
    tx.execute("UPDATE meta SET save_version = 5", [])?;
    Ok(())
}

const V6_DDL: &str = r#"
ALTER TABLE protagonist ADD COLUMN age INTEGER;
ALTER TABLE protagonist ADD COLUMN military_return_day INTEGER;
"#;

/// I7 6차분(진로 갈림길, 01_커리어_구조.md §5) — `age`는 `create_protagonist`
/// 가 17세(고교 1학년, 02_아마_고교.md §A-1)로 채우고 매 시즌 경계마다
/// +1. NULL이면(구세이브·합성 테스트) "나이 트래킹 대상 아님"으로 갈림길
/// 판정 자체를 스킵 — 이번 서브분 전까지 존재하던 모든 protagonist 행이
/// 이 값을 몰라도 깨지지 않게 하는 방어적 설계. `military_return_day`는
/// `npc` 테이블의 동명 컬럼과 같은 관례(NULL=복무 안 함) — 갈림길 A에서
/// "입대"를 고르면 채워지고, 복무 만료 시 독립리그 재도전으로 자동 전환.
fn migration_v6(tx: &Transaction) -> anyhow::Result<()> {
    tx.execute_batch(V6_DDL)?;
    tx.execute("UPDATE meta SET save_version = 6", [])?;
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
    Migration {
        version: 4,
        up: migration_v4,
    },
    Migration {
        version: 5,
        up: migration_v5,
    },
    Migration {
        version: 6,
        up: migration_v6,
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
        assert_eq!(save_version, 6);
    }

    #[test]
    fn v5_adds_training_column_to_protagonist() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, training)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', ?1)",
            [serde_json::json!({"primary_stat": "구속", "secondary_stats": ["구위", "제구"], "intensity": "보통", "new_pitch": null, "pitch_weeks": 0}).to_string()],
        )
        .unwrap();
        let training: String = conn.query_row("SELECT training FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&training).unwrap();
        assert_eq!(v.get("primary_stat").unwrap().as_str().unwrap(), "구속");
    }

    #[test]
    fn v6_adds_age_and_military_return_day_columns_to_protagonist() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, age, military_return_day)
             VALUES ('proto:1', 'X', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', 17, NULL)",
            [],
        )
        .unwrap();
        let (age, military_return_day): (i64, Option<i64>) = conn
            .query_row("SELECT age, military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(age, 17);
        assert!(military_return_day.is_none());
    }

    #[test]
    fn v4_adds_match_session_table() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (1, 'game:1', 'team:a', 'team:b', 'league:hs', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        )
        .unwrap();
        let game_id: String = conn.query_row("SELECT game_id FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(game_id, "game:1");

        // singleton constraint
        let result = conn.execute(
            "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id)
             VALUES (2, 'game:2', 'team:a', 'team:b', 'league:hs', '자동', 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL)",
            [],
        );
        assert!(result.is_err(), "match_session must stay a single row (id=1 CHECK constraint)");
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