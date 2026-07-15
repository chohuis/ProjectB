use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use super::{content, slot};
use crate::sim::roster::{self, PersonalityWeights};

pub fn create_slot(path: &str) -> anyhow::Result<Connection> {
    slot::open(path)
}

pub fn load_slot(path: &str) -> anyhow::Result<Connection> {
    slot::open(path)
}

pub fn migrate_slot(_conn: &mut Connection) -> anyhow::Result<()> {
    todo!()
}

pub fn rolling_backup(_slot_path: &str) -> anyhow::Result<()> {
    todo!()
}

/// The 5 leagues content.db carries teams for (07_데이터관리.md §2-1) —
/// fixed iteration order so generate_initial_world is itself deterministic.
const LEAGUE_IDS: [&str; 5] = [
    "league:hs",
    "league:univ",
    "league:independent",
    "league:pro",
    "league:pro_farm",
];

/// Derives a per-league RNG sub-seed from world_seed so leagues don't share
/// (and therefore don't correlate) RNG state, while staying fully
/// reproducible for a given (world_seed, league_id) pair.
fn league_sub_seed(world_seed: i64, league_id: &str) -> u64 {
    let mut hasher = Sha256::new();
    hasher.update(world_seed.to_le_bytes());
    hasher.update(league_id.as_bytes());
    let digest = hasher.finalize();
    u64::from_le_bytes(digest[0..8].try_into().unwrap())
}

/// Generates every team's roster in one league and inserts them into
/// slot.db's `npc` table in one transaction. `world_seed` is `canonical_seed`
/// for the initial world, or a save's own `meta.world_seed` for later
/// freshman intake (once generate_freshmen exists — I3 scope is initial gen).
pub fn generate_league_roster(
    slot_conn: &mut Connection,
    content_conn: &Connection,
    world_seed: i64,
    league_id: &str,
) -> anyhow::Result<()> {
    let rule = content::load_generation_rule(content_conn, league_id)?;
    let teams = content::load_teams_for_league(content_conn, league_id)?;
    let kr_surnames = content::load_name_pool(content_conn, "kr", "surname")?;
    let kr_given = content::load_name_pool(content_conn, "kr", "given")?;
    let secondary_pitches = content::load_secondary_pitch_names(content_conn)?;
    let role_ctx = content::load_personality_rule(content_conn, "role:선수")?;

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, league_id));
    // league_id folded into the id prefix so ids stay unique across leagues
    // even though each generate_league_roster call restarts its own seq
    // counter at 0 (a single world_seed spans 5 separate calls).
    let league_slug = league_id.strip_prefix("league:").unwrap_or(league_id);
    let id_prefix = format!("npc:{world_seed}_{league_slug}_");
    let mut seq: u64 = 0;

    let tx = slot_conn.transaction()?;
    for team in &teams {
        let philosophy_ctx = content::load_personality_rule(content_conn, &format!("philosophy:{}", team.philosophy))?;
        let status_ctx = content::load_personality_rule(content_conn, &format!("status:{}", team.status))?;
        let weights = PersonalityWeights::merge(&[philosophy_ctx, status_ctx, role_ctx.clone()]);

        let players = roster::generate_team(
            &mut rng,
            team,
            league_id,
            &rule,
            &kr_surnames,
            &kr_given,
            &secondary_pitches,
            &weights,
            &id_prefix,
            &mut seq,
        );

        for p in &players {
            tx.execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    p.id,
                    p.name,
                    p.team_id,
                    p.position,
                    p.age,
                    p.form,
                    p.personality.to_string(),
                    p.stats.to_string(),
                    p.xp.to_string(),
                    p.live_state.to_string(),
                    p.pitches.as_ref().map(|v| v.to_string()),
                ],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// 새 게임 시작 시 진입점(07_데이터관리.md §2-1의 "generateInitialWorld") —
/// 5개 리그를 고정 순서로 순회해 172팀 전체 로스터를 생성. canonical_seed는
/// content.db `world_config` 테이블에서 호출자가 읽어 전달한다.
pub fn generate_initial_world(slot_conn: &mut Connection, content_conn: &Connection, canonical_seed: i64) -> anyhow::Result<()> {
    for league_id in LEAGUE_IDS {
        generate_league_roster(slot_conn, content_conn, canonical_seed, league_id)?;
    }
    Ok(())
}

pub fn generate_freshmen(_conn: &Connection, _world_seed: i64) -> anyhow::Result<()> {
    todo!()
}

pub fn transfer(_conn: &Connection, _npc_id: &str, _to_team_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn swap_teams(_conn: &Connection, _npc_a: &str, _npc_b: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn assign_draft(_conn: &Connection, _npc_id: &str, _team_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn sign_fa(_conn: &Connection, _npc_id: &str, _team_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn enlist(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn discharge(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn retire(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn update_weekly(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn sign_contract(_conn: &Connection, _team_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn negotiate_salary(_conn: &Connection, _team_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn apply_injury(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn treat(_conn: &Connection, _npc_id: &str) -> anyhow::Result<()> {
    todo!()
}

pub fn advance_week(_conn: &Connection) -> anyhow::Result<()> {
    todo!()
}

pub fn season_rollover(_conn: &Connection) -> anyhow::Result<()> {
    todo!()
}

pub fn resolve_choice(_conn: &Connection, _evt_id: &str, _choice_id: &str) -> anyhow::Result<()> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_content_db() -> Connection {
        let conn = content::open_in_memory().unwrap();
        conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        conn.execute(
            "INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES ('team:a', '전통/정통', '안정', '중견')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES ('team:b', '스몰볼', '알뜰', '언더독')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO generation_rules (league_id, rules) VALUES ('league:x', '{\"roster_size\":8,\"pitcher_ratio\":0.5,\"sp_ratio\":0.5,\"stat_min\":20.0,\"stat_max\":80.0}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_surname', 'kr', 'surname', '[\"김\",\"이\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_given', 'kr', 'given', '[\"민준\",\"서준\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pitch_types (id, family, name, meta) VALUES ('pitch:four_seam', '패스트볼류', '포심 패스트볼', NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pitch_types (id, family, name, meta) VALUES ('pitch:slider', '브레이킹볼류', '슬라이더', NULL)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn generate_league_roster_inserts_expected_npc_count() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();

        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        let count: i64 = slot_conn.query_row("SELECT count(*) FROM npc", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 16); // 2 teams * roster_size 8
    }

    #[test]
    fn same_world_seed_yields_identical_npc_rows() {
        let content_conn = build_test_content_db();

        let mut slot_a = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_a, &content_conn, 999, "league:x").unwrap();
        let mut slot_b = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_b, &content_conn, 999, "league:x").unwrap();

        let read_rows = |c: &Connection| -> Vec<(String, String, String)> {
            c.prepare("SELECT id, name, stats FROM npc ORDER BY id")
                .unwrap()
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };

        assert_eq!(read_rows(&slot_a), read_rows(&slot_b));
    }

    #[test]
    fn generate_initial_world_covers_all_five_leagues() {
        let conn = content::open_in_memory().unwrap();
        for lg in LEAGUE_IDS {
            conn.execute("INSERT INTO leagues (id, meta) VALUES (?1, NULL)", [lg]).unwrap();
            conn.execute(
                "INSERT INTO teams (id, league_id, color, meta) VALUES (?1, ?2, NULL, NULL)",
                params![format!("team:{lg}"), lg],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES (?1, '전통/정통', '안정', '중견')",
                params![format!("team:{lg}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO generation_rules (league_id, rules) VALUES (?1, '{\"roster_size\":4,\"pitcher_ratio\":0.5,\"sp_ratio\":0.5,\"stat_min\":20.0,\"stat_max\":80.0}')",
                [lg],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_surname', 'kr', 'surname', '[\"김\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_given', 'kr', 'given', '[\"민준\"]')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO pitch_types (id, family, name, meta) VALUES ('pitch:four_seam', '패스트볼류', '포심 패스트볼', NULL)",
            [],
        )
        .unwrap();

        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_initial_world(&mut slot_conn, &conn, 555).unwrap();

        let count: i64 = slot_conn.query_row("SELECT count(*) FROM npc", [], |r| r.get(0)).unwrap();
        assert_eq!(count, (LEAGUE_IDS.len() as i64) * 4); // 1 team * roster_size 4 per league
    }
}