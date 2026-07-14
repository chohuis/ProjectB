use rusqlite::Connection;

use super::slot;

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

pub fn generate_league_roster(_conn: &Connection, _world_seed: i64, _league_id: &str) -> anyhow::Result<()> {
    todo!()
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