use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};
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

pub struct PendingActionRow {
    pub id: String,
    pub kind: String,
    pub urgency: String,
    pub created_day: i64,
    pub payload: String,
}

fn list_pending_actions(conn: &Connection) -> anyhow::Result<Vec<PendingActionRow>> {
    let mut stmt = conn.prepare("SELECT id, type, urgency, created_day, payload FROM pending_actions ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok(PendingActionRow {
            id: row.get(0)?,
            kind: row.get(1)?,
            urgency: row.get(2)?,
            created_day: row.get(3)?,
            payload: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// protagonist.contract(JSON)의 team_id로 그날 `schedule`에 그 팀 경기가
/// 있는지 찾는다. 주인공이 아직 없으면(I6 이전) 항상 None — 정상 동작.
fn find_protagonist_game_today(conn: &Connection, day: i64) -> anyhow::Result<Option<(String, String, String)>> {
    let contract: Option<String> = conn
        .query_row("SELECT contract FROM protagonist LIMIT 1", [], |row| row.get(0))
        .optional()?;
    let Some(contract) = contract else {
        return Ok(None);
    };
    let contract_json: serde_json::Value = serde_json::from_str(&contract).unwrap_or(serde_json::Value::Null);
    let Some(team_id) = contract_json.get("team_id").and_then(|v| v.as_str()) else {
        return Ok(None);
    };

    let game = conn
        .query_row(
            "SELECT game_id, home, away FROM schedule WHERE day = ?1 AND (home = ?2 OR away = ?2)",
            params![day, team_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    Ok(game)
}

/// I5(sim/match·sim/injury 등)가 채울 자리 — 매일 경계(경기 결과 반영, 콜백형
/// 이벤트, 급성 부상). `game` PendingAction으로 이미 멈춘 날에는 호출되지 않음
/// (advance()가 그 전에 리턴) — 여기는 "경기 없는 날"의 매일 배치용.
fn process_day(_conn: &Connection, _day: i64) -> anyhow::Result<()> {
    Ok(())
}

/// I5가 채울 자리 — 주간 경계(훈련 XP→스탯, 누적형 부상체크, 라이브상태 갱신,
/// 폴링형 이벤트 평가, 개인 트레이너 과금).
fn process_week(_conn: &Connection, _day: i64) -> anyhow::Result<()> {
    Ok(())
}

/// I5가 채울 자리 — 월간 경계("이달의 페이스" 평가).
fn process_month(_conn: &Connection, _day: i64) -> anyhow::Result<()> {
    Ok(())
}

/// 시즌 경계 — 지금 실제로 할 수 있는 것만: 시즌 카운터 증가, 인박스 비움
/// (04_게임루프.md §1). 시즌 평가·주목도 확정·방출판정·재계약/FA/드래프트·
/// 순위기록압축·로스터 세대교체·투자정산은 sim/eval·sim/market·
/// generate_freshmen이 생긴 뒤 여기 채울 것 — 지금 호출하면 todo!() 패닉이라
/// 안 부름.
pub fn season_rollover(conn: &Connection) -> anyhow::Result<()> {
    let current: i64 = conn
        .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |row| row.get::<_, String>(0))
        .optional()?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO season_meta (key, value) VALUES ('season', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![(current + 1).to_string()],
    )?;
    conn.execute("DELETE FROM inbox", [])?;
    Ok(())
}

/// 정지 조건(새 PendingAction, 주인공 경기)이 한 번도 안 걸리면 advance()가
/// 무한 루프에 빠진다 — 지금(I5 이전)은 process_day/week/month가 전부
/// no-op이고 주인공도 없어서 실제로 이 경로를 탄다. 안전장치로 한 시즌
/// (364일)만큼만 내부 전진하고, 그래도 안 멈추면 빈 목록을 반환해 호출자에게
/// 제어를 돌려준다. 실제 콘텐츠(I5 일정·이벤트)가 들어오면 정지점이 훨씬
/// 자주 걸려 이 캡은 사실상 발동 안 함 — 순수 방어용.
const MAX_DAYS_PER_CALL: i64 = 364;

/// 04_게임루프.md §2의 `advance()` — 프로토의 advanceWeek를 대체하는 단일
/// 진행 커맨드(설계 문서가 그 이름을 의도적으로 버렸다는 점이 이름 자체가
/// 근거: "프로토의 advanceWeek를 대체하는"). 하루씩 전진하며 정지 지점(새
/// PendingAction 발생 또는 주인공 등판 경기)에서 멈춘다. 정지할 때마다
/// meta.integrity_sig를 재서명(I3에서 미뤄둔 sign_core_state를 여기서 사용).
pub fn advance(slot_conn: &mut Connection) -> anyhow::Result<Vec<PendingActionRow>> {
    for _ in 0..MAX_DAYS_PER_CALL {
        let current_day: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |row| row.get(0))?;
        let today = current_day + 1;

        let tx = slot_conn.transaction()?;

        if let Some((game_id, home, away)) = find_protagonist_game_today(&tx, today)? {
            let payload = serde_json::json!({"game_id": game_id, "home": home, "away": away}).to_string();
            tx.execute(
                "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'game', 'urgent', ?2, ?3)",
                params![format!("pending:{game_id}"), today, payload],
            )?;
            tx.execute("UPDATE meta SET current_day = ?1", params![today])?;
            let sig = crate::integrity::sign_core_state(&tx)?;
            tx.execute("UPDATE meta SET integrity_sig = ?1", params![sig])?;
            tx.commit()?;
            return list_pending_actions(slot_conn);
        }

        process_day(&tx, today)?;
        tx.execute("UPDATE meta SET current_day = ?1", params![today])?;

        // 경계 겹침 처리 순서 = 경기(위에서 이미 처리) → 주간 → 월간 → 시즌
        // (04_게임루프.md §2). 월=4주(28일)는 문서에 정확한 일수가 없어 잡은
        // placeholder — 1시즌=52주=364일은 §1에 명시.
        if today % 7 == 0 {
            process_week(&tx, today)?;
        }
        if today % 28 == 0 {
            process_month(&tx, today)?;
        }
        if today % 364 == 0 {
            season_rollover(&tx)?;
        }

        let pending_count: i64 = tx.query_row("SELECT count(*) FROM pending_actions", [], |row| row.get(0))?;

        let sig = crate::integrity::sign_core_state(&tx)?;
        tx.execute("UPDATE meta SET integrity_sig = ?1", params![sig])?;
        tx.commit()?;

        if pending_count > 0 {
            return list_pending_actions(slot_conn);
        }
        // 새 PendingAction도, 경기도 없으면 다음 날로 계속.
    }
    // MAX_DAYS_PER_CALL만큼 돌았는데도 정지점을 못 찾음 — 안전장치 발동,
    // 호출자에게 제어를 돌려준다(보통 빈 목록; 실제로는 I5 콘텐츠가 있으면
    // 이 경로를 거의 안 탐).
    list_pending_actions(slot_conn)
}

/// pending_actions에서 해당 행을 제거해 다음 advance()가 진행되게 한다.
/// 타입별 실제 효과(트레이드 성사, 계약 체결 등)는 그 효과를 낼 시스템
/// (sim/market 등)이 생겼을 때 여기서 분기 — 지금은 제네릭 처리뿐.
pub fn resolve_choice(conn: &Connection, action_id: &str, _choice_id: &str) -> anyhow::Result<()> {
    conn.execute("DELETE FROM pending_actions WHERE id = ?1", params![action_id])?;
    Ok(())
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

    fn current_day(conn: &Connection) -> i64 {
        conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0)).unwrap()
    }

    fn integrity_sig(conn: &Connection) -> Option<String> {
        conn.query_row("SELECT integrity_sig FROM meta", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn advance_without_protagonist_runs_full_season_and_rolls_over() {
        let mut slot_conn = slot::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO inbox (id, kind, urgency, read, day, body) VALUES ('inbox:1', 'info', 'low', 0, 1, 'test')",
                [],
            )
            .unwrap();

        let pending = advance(&mut slot_conn).unwrap();

        assert!(pending.is_empty(), "no stop condition exists yet without I5 content");
        assert_eq!(current_day(&slot_conn), 364);
        let inbox_count: i64 = slot_conn.query_row("SELECT count(*) FROM inbox", [], |r| r.get(0)).unwrap();
        assert_eq!(inbox_count, 0, "season boundary should clear inbox");
        let season: String = slot_conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(season, "1");
        assert!(integrity_sig(&slot_conn).is_some());
    }

    #[test]
    fn advance_stops_at_protagonist_game_day_and_resolve_unblocks_it() {
        let mut slot_conn = slot::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                 VALUES ('proto:1', '주인공', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{\"team_id\":\"team:x\"}', '{}')",
                [],
            )
            .unwrap();
        slot_conn
            .execute(
                "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 5, 'team:x', 'team:y', NULL)",
                [],
            )
            .unwrap();

        let pending = advance(&mut slot_conn).unwrap();

        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "game");
        assert_eq!(pending[0].created_day, 5);
        assert_eq!(current_day(&slot_conn), 5, "must stop exactly on game day, not run past it");

        resolve_choice(&slot_conn, &pending[0].id, "ack").unwrap();
        let remaining: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0);

        // no more scheduled games — next advance() runs forward again (bounded by the safety cap).
        let pending2 = advance(&mut slot_conn).unwrap();
        assert!(pending2.is_empty());
        assert!(current_day(&slot_conn) > 5);
    }

    #[test]
    fn identical_starting_state_signs_identically() {
        let build = || {
            let conn = slot::open_in_memory().unwrap();
            conn.execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                 VALUES ('proto:1', '주인공', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{\"team_id\":\"team:x\"}', '{}')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 3, 'team:x', 'team:y', NULL)",
                [],
            )
            .unwrap();
            conn
        };

        let mut a = build();
        let mut b = build();
        advance(&mut a).unwrap();
        advance(&mut b).unwrap();

        assert_eq!(integrity_sig(&a), integrity_sig(&b));
        assert_eq!(current_day(&a), current_day(&b));
    }
}