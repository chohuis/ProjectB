use std::env;
use std::fs;

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};
use serde::Deserialize;

use engine::data::content;

#[derive(Deserialize)]
struct League {
    id: String,
    meta: serde_json::Value,
}

#[derive(Deserialize)]
struct School {
    id: String,
    region: String,
    meta: serde_json::Value,
}

#[derive(Deserialize)]
struct Stadium {
    id: String,
    name: String,
    park_factor: String,
    meta: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct Team {
    id: String,
    league_id: String,
    stadium_id: Option<String>,
    color: Option<String>,
    meta: serde_json::Value,
}

#[derive(Deserialize)]
struct TeamTraits {
    team_id: String,
    philosophy: String,
    resource: String,
    status: String,
}

#[derive(Deserialize)]
struct TeamHistory {
    team_id: String,
    founded_year: Option<i64>,
    budget: Option<i64>,
    rivals: serde_json::Value,
    season_ranks: serde_json::Value,
    titles: serde_json::Value,
}

#[derive(Deserialize)]
struct PitchType {
    id: String,
    family: String,
    name: String,
}

#[derive(Deserialize)]
struct NamePool {
    id: String,
    locale: String,
    kind: String,
    names: serde_json::Value,
}

#[derive(Deserialize)]
struct GenerationRule {
    league_id: String,
    rules: serde_json::Value,
}

#[derive(Deserialize)]
struct PersonalityRule {
    context: String,
    trait_weights: serde_json::Value,
}

#[derive(Deserialize)]
struct WorldConfigEntry {
    key: String,
    value: String,
}

#[derive(Deserialize, Default)]
struct SeedPayload {
    #[serde(default)]
    leagues: Vec<League>,
    #[serde(default)]
    schools: Vec<School>,
    #[serde(default)]
    stadiums: Vec<Stadium>,
    #[serde(default)]
    teams: Vec<Team>,
    #[serde(default)]
    team_traits: Vec<TeamTraits>,
    #[serde(default)]
    team_history: Vec<TeamHistory>,
    #[serde(default)]
    pitch_types: Vec<PitchType>,
    #[serde(default)]
    name_pools: Vec<NamePool>,
    #[serde(default)]
    generation_rules: Vec<GenerationRule>,
    #[serde(default)]
    personality_rules: Vec<PersonalityRule>,
    #[serde(default)]
    world_config: Vec<WorldConfigEntry>,
}

fn foreign_key_violations(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("PRAGMA foreign_key_check")?;
    let rows = stmt.query_map([], |row| {
        let table: String = row.get(0)?;
        let rowid: Option<i64> = row.get(1)?;
        let parent: String = row.get(2)?;
        Ok(format!("FK violation: table={table} rowid={rowid:?} parent={parent}"))
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

// upserts run inside one transaction; commits only if there are no FK
// violations and this isn't a --dry-run, otherwise rolls back.
fn seed(conn: &mut Connection, payload: &SeedPayload, dry_run: bool) -> Result<Vec<String>> {
    let tx = conn.transaction()?;

    for l in &payload.leagues {
        tx.execute(
            "INSERT INTO leagues (id, meta) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET meta = excluded.meta",
            params![l.id, l.meta.to_string()],
        )?;
    }
    for s in &payload.schools {
        tx.execute(
            "INSERT INTO schools (id, region, meta) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET region = excluded.region, meta = excluded.meta",
            params![s.id, s.region, s.meta.to_string()],
        )?;
    }
    for st in &payload.stadiums {
        tx.execute(
            "INSERT INTO stadiums (id, name, park_factor, meta) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, park_factor = excluded.park_factor, meta = excluded.meta",
            params![
                st.id,
                st.name,
                st.park_factor,
                st.meta.as_ref().map(|v| v.to_string())
            ],
        )?;
    }
    for t in &payload.teams {
        tx.execute(
            "INSERT INTO teams (id, league_id, color, meta, stadium_id) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET league_id = excluded.league_id, color = excluded.color, meta = excluded.meta, stadium_id = excluded.stadium_id",
            params![t.id, t.league_id, t.color, t.meta.to_string(), t.stadium_id],
        )?;
    }
    for tt in &payload.team_traits {
        tx.execute(
            "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(team_id) DO UPDATE SET philosophy = excluded.philosophy, resource = excluded.resource, status = excluded.status",
            params![tt.team_id, tt.philosophy, tt.resource, tt.status],
        )?;
    }
    for th in &payload.team_history {
        tx.execute(
            "INSERT INTO team_history (team_id, founded_year, budget, rivals, season_ranks, titles) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(team_id) DO UPDATE SET founded_year = excluded.founded_year, budget = excluded.budget, rivals = excluded.rivals, season_ranks = excluded.season_ranks, titles = excluded.titles",
            params![
                th.team_id,
                th.founded_year,
                th.budget,
                th.rivals.to_string(),
                th.season_ranks.to_string(),
                th.titles.to_string()
            ],
        )?;
    }

    for pt in &payload.pitch_types {
        tx.execute(
            "INSERT INTO pitch_types (id, family, name) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET family = excluded.family, name = excluded.name",
            params![pt.id, pt.family, pt.name],
        )?;
    }
    for np in &payload.name_pools {
        tx.execute(
            "INSERT INTO name_pools (id, locale, kind, names) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET locale = excluded.locale, kind = excluded.kind, names = excluded.names",
            params![np.id, np.locale, np.kind, np.names.to_string()],
        )?;
    }
    // generation_rules.league_id references leagues(id) — leagues are already inserted above.
    for gr in &payload.generation_rules {
        tx.execute(
            "INSERT INTO generation_rules (league_id, rules) VALUES (?1, ?2)
             ON CONFLICT(league_id) DO UPDATE SET rules = excluded.rules",
            params![gr.league_id, gr.rules.to_string()],
        )?;
    }
    for pr in &payload.personality_rules {
        tx.execute(
            "INSERT INTO personality_rules (context, trait_weights) VALUES (?1, ?2)
             ON CONFLICT(context) DO UPDATE SET trait_weights = excluded.trait_weights",
            params![pr.context, pr.trait_weights.to_string()],
        )?;
    }
    for wc in &payload.world_config {
        tx.execute(
            "INSERT INTO world_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![wc.key, wc.value],
        )?;
    }

    let violations = foreign_key_violations(&tx)?;

    if dry_run || !violations.is_empty() {
        tx.rollback()?;
    } else {
        tx.commit()?;
    }
    Ok(violations)
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        bail!("usage: seed_content <db_path> <json_path> [--dry-run]  |  seed_content <db_path> --validate");
    }
    let db_path = &args[1];
    let mode = &args[2];

    if mode == "--validate" {
        let conn = content::open(db_path).context("opening content.db")?;
        let violations = foreign_key_violations(&conn)?;
        if violations.is_empty() {
            println!("OK: no foreign key violations");
            return Ok(());
        }
        for v in &violations {
            println!("{v}");
        }
        bail!("{} foreign key violation(s) found", violations.len());
    }

    let json_path = mode;
    let dry_run = args.iter().any(|a| a == "--dry-run");
    let raw = fs::read_to_string(json_path).with_context(|| format!("reading {json_path}"))?;
    let payload: SeedPayload = serde_json::from_str(&raw).context("parsing seed JSON")?;

    let mut conn = content::open(db_path).context("opening content.db")?;
    let violations = seed(&mut conn, &payload, dry_run)?;

    if !violations.is_empty() {
        for v in &violations {
            println!("{v}");
        }
        bail!("{} foreign key violation(s) found, rolled back", violations.len());
    }

    let summary = format!(
        "leagues={} schools={} stadiums={} teams={} team_traits={} team_history={} pitch_types={} name_pools={} generation_rules={} personality_rules={} world_config={}",
        payload.leagues.len(),
        payload.schools.len(),
        payload.stadiums.len(),
        payload.teams.len(),
        payload.team_traits.len(),
        payload.team_history.len(),
        payload.pitch_types.len(),
        payload.name_pools.len(),
        payload.generation_rules.len(),
        payload.personality_rules.len(),
        payload.world_config.len()
    );
    if dry_run {
        println!("OK (dry-run, no changes committed): {summary}");
    } else {
        println!("OK: {summary} committed to {db_path}");
    }
    Ok(())
}
