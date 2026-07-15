use hmac::{Hmac, Mac};
use rusqlite::{Connection, OptionalExtension};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;
type ProtagonistRow = (String, String, String, String, String, String, String, String, String, String, String);
type MetaCoreFields = (Option<i64>, Option<i64>, Option<i64>, Option<String>, Option<i64>, Option<i64>);

const SIGNING_KEY: &[u8] = b"onepitch-dev-placeholder-key";

pub fn sign(data: &[u8]) -> anyhow::Result<String> {
    let mut mac = HmacSha256::new_from_slice(SIGNING_KEY)?;
    mac.update(data);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub fn verify(data: &[u8], sig: &str) -> anyhow::Result<bool> {
    Ok(sign(data)? == sig)
}

/// Hashes the core mutable state(protagonist·npc·meta — history is
/// append-only so tampering there is a different concern) into one HMAC.
/// npc rows are read in `id` order so the signature is stable across
/// re-signs regardless of SQLite's physical row order.
pub fn sign_core_state(conn: &Connection) -> anyhow::Result<String> {
    let mut buf = String::new();

    let protagonist: Option<ProtagonistRow> =
        conn.query_row(
            "SELECT id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury FROM protagonist",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                ))
            },
        )
        .optional()?;
    if let Some(p) = protagonist {
        buf.push_str(&format!("{p:?}"));
    }

    let mut stmt = conn.prepare(
        "SELECT id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches
         FROM npc ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(format!(
            "{}{}{}{}{}{}{}{}{}{}{}{}{}",
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, f64>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        ))
    })?;
    for r in rows {
        buf.push_str(&r?);
    }

    let (save_version, content_version, world_seed, stage, playtime, current_day): MetaCoreFields = conn.query_row(
        "SELECT save_version, content_version, world_seed, stage, playtime, current_day FROM meta",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    )?;
    buf.push_str(&format!(
        "{}{}{}{}{}{}",
        save_version.unwrap_or(0),
        content_version.unwrap_or(0),
        world_seed.unwrap_or(0),
        stage.unwrap_or_default(),
        playtime.unwrap_or(0),
        current_day.unwrap_or(0)
    ));

    sign(buf.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_is_deterministic() {
        assert_eq!(sign(b"hello").unwrap(), sign(b"hello").unwrap());
    }

    #[test]
    fn sign_differs_by_input() {
        assert_ne!(sign(b"hello").unwrap(), sign(b"world").unwrap());
    }

    #[test]
    fn verify_roundtrip() {
        let sig = sign(b"hello").unwrap();
        assert!(verify(b"hello", &sig).unwrap());
        assert!(!verify(b"tampered", &sig).unwrap());
    }

    #[test]
    fn sign_core_state_works_on_freshly_migrated_slot() {
        let conn = crate::data::slot::open_in_memory().unwrap();
        // no protagonist, no npc rows yet — should still sign successfully.
        let sig = sign_core_state(&conn).unwrap();
        assert_eq!(sig, sign_core_state(&conn).unwrap());
    }

    #[test]
    fn sign_core_state_changes_when_npc_data_changes() {
        let conn = crate::data::slot::open_in_memory().unwrap();
        let before = sign_core_state(&conn).unwrap();

        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches)
             VALUES ('npc:1', '홍길동', 'team:x', '선발투수', 20, 1, 0, 50.0, '{}', '{}', '{}', '{}', NULL)",
            [],
        )
        .unwrap();

        let after = sign_core_state(&conn).unwrap();
        assert_ne!(before, after);
    }
}