use rusqlite::{Connection, Transaction};

pub struct Migration {
    pub version: i64,
    pub up: fn(&Transaction) -> anyhow::Result<()>,
}

pub fn apply_migrations(conn: &mut Connection, migrations: &[Migration]) -> anyhow::Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let mut ordered = migrations.iter().collect::<Vec<_>>();
    ordered.sort_by_key(|m| m.version);

    let tx = conn.transaction()?;
    let mut latest = current;
    for m in ordered.into_iter().filter(|m| m.version > current) {
        (m.up)(&tx)?;
        latest = m.version;
    }
    if latest != current {
        tx.pragma_update(None, "user_version", latest)?;
    }
    tx.commit()?;
    Ok(())
}