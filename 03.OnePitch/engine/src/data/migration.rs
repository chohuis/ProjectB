use rusqlite::{Connection, Transaction};

pub struct Migration {
    pub version: i64,
    pub up: fn(&Transaction) -> anyhow::Result<()>,
}

pub fn apply_migrations(conn: &mut Connection, migrations: &[Migration]) -> anyhow::Result<()> {
    let mut ordered = migrations.iter().collect::<Vec<_>>();
    ordered.sort_by_key(|m| m.version);

    // IMMEDIATE로 시작해 "현재 버전 읽기"와 "마이그레이션 적용"을 하나의
    // 락 구간으로 묶는다 — 기존엔 버전을 트랜잭션 밖에서 먼저 읽어, 같은
    // 파일을 동시에 여는 두 커넥션이 둘 다 옛 버전을 보고 같은 ALTER를
    // 두 번 실행하는 경합이 있었다(engine/content.db를 공유하는
    // `api::game` 테스트들이 병렬 실행되며 "duplicate column name"으로
    // 드러남, I8 1차분에서 발견).
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let current: i64 = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
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