use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::{content, slot};
use crate::sim::match_sim;
use crate::sim::roster::{self, PersonalityWeights};
use crate::sim::schedule;

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

/// 정적 라운드로빈으로 만들 수 있는 리그만(독립은 4단계 생존리그라 이전
/// 단계 결과에 대진이 달려있어 여기 못 들어감 — I5 후속 스코프).
const SCHEDULED_LEAGUE_IDS: [&str; 4] = ["league:hs", "league:univ", "league:pro", "league:pro_farm"];

/// 리그별 라운드로빈 바퀴수 — 프로/2군은 실제 "N차전" 총 경기수와 일치하게
/// 역산(9팀 상대×N차전=팀당 총경기), 대학·고교는 조/권역 내 1바퀴만(정확한
/// A/B 세부 조편성이 미확정이라 권역 전체를 한 그룹으로 뭉쳐 단순화한
/// placeholder — 실제 "18~22경기" 같은 목표 경기수와는 안 맞을 수 있음).
fn regular_season_laps(league_id: &str) -> u32 {
    match league_id {
        "league:pro" => 16,
        "league:pro_farm" => 11,
        _ => 1,
    }
}

/// 한 리그의 정규시즌 일정을 결정적으로 생성해 slot.db `schedule`에 삽입.
/// 독립리그·전 리그 포스트시즌/전국대회는 스코프 밖(플랜 문서 참고).
pub fn generate_schedule(
    slot_conn: &mut Connection,
    content_conn: &Connection,
    world_seed: i64,
    league_id: &str,
    start_day: i64,
) -> anyhow::Result<()> {
    let groups = content::load_team_groups_for_schedule(content_conn, league_id)?;
    let laps = regular_season_laps(league_id);
    let league_slug = league_id.strip_prefix("league:").unwrap_or(league_id);
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("schedule:{league_id}")));

    let entries = schedule::generate_regular_season(league_slug, &groups, laps, start_day, &mut rng);

    let tx = slot_conn.transaction()?;
    for e in &entries {
        tx.execute(
            "INSERT INTO schedule (game_id, day, home, away, result) VALUES (?1, ?2, ?3, ?4, NULL)",
            params![e.game_id, e.day, e.home, e.away],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// 새 게임 시작 시 진입점(07_데이터관리.md §2-1의 "generateInitialWorld") —
/// 5개 리그를 고정 순서로 순회해 172팀 전체 로스터를 생성하고, 정적
/// 라운드로빈이 가능한 4개 리그의 정규시즌 일정도 함께 만든다.
/// canonical_seed는 content.db `world_config` 테이블에서 호출자가 읽어
/// 전달한다.
pub fn generate_initial_world(slot_conn: &mut Connection, content_conn: &Connection, canonical_seed: i64) -> anyhow::Result<()> {
    for league_id in LEAGUE_IDS {
        generate_league_roster(slot_conn, content_conn, canonical_seed, league_id)?;
    }
    for league_id in SCHEDULED_LEAGUE_IDS {
        generate_schedule(slot_conn, content_conn, canonical_seed, league_id, 1)?;
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

fn load_batting_lineup(slot_conn: &Connection, team_id: &str) -> anyhow::Result<Vec<match_sim::BatterStats>> {
    let mut stmt = slot_conn.prepare(
        "SELECT stats FROM npc WHERE team_id = ?1 AND position NOT IN ('선발투수', '구원투수') ORDER BY id",
    )?;
    let rows: Vec<String> = stmt.query_map([team_id], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
    let mut lineup = Vec::with_capacity(rows.len());
    for raw in rows {
        let v: serde_json::Value = serde_json::from_str(&raw)?;
        lineup.push(match_sim::BatterStats {
            contact: v.get("컨택").and_then(|x| x.as_f64()).unwrap_or(50.0),
            eye: v.get("선구안").and_then(|x| x.as_f64()).unwrap_or(50.0),
            power: v.get("파워").and_then(|x| x.as_f64()).unwrap_or(50.0),
        });
    }
    Ok(lineup)
}

/// 오늘의 선발투수 — 감독의 로테이션·불펜 운용은 스태프 시스템이 생기는
/// 후속 Phase 스코프라, 지금은 그 팀의 (id 기준) 첫 선발투수가 매번 완투.
fn load_starting_pitcher(slot_conn: &Connection, team_id: &str) -> anyhow::Result<match_sim::PitcherStats> {
    let raw: Option<String> = slot_conn
        .query_row(
            "SELECT stats FROM npc WHERE team_id = ?1 AND position = '선발투수' ORDER BY id LIMIT 1",
            [team_id],
            |row| row.get(0),
        )
        .optional()?;
    let raw = raw.ok_or_else(|| anyhow::anyhow!("no starting pitcher on roster for team {team_id}"))?;
    let v: serde_json::Value = serde_json::from_str(&raw)?;
    Ok(match_sim::PitcherStats {
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
    })
}

fn ensure_standings_row(conn: &Connection, team_id: &str) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO standings (team_id, w, l, t, rank) VALUES (?1, 0, 0, 0, 0)
         ON CONFLICT(team_id) DO NOTHING",
        params![team_id],
    )?;
    Ok(())
}

fn update_standings(conn: &Connection, home: &str, away: &str, home_runs: u32, away_runs: u32) -> anyhow::Result<()> {
    ensure_standings_row(conn, home)?;
    ensure_standings_row(conn, away)?;
    use std::cmp::Ordering;
    match home_runs.cmp(&away_runs) {
        Ordering::Greater => {
            conn.execute("UPDATE standings SET w = w + 1 WHERE team_id = ?1", params![home])?;
            conn.execute("UPDATE standings SET l = l + 1 WHERE team_id = ?1", params![away])?;
        }
        Ordering::Less => {
            conn.execute("UPDATE standings SET w = w + 1 WHERE team_id = ?1", params![away])?;
            conn.execute("UPDATE standings SET l = l + 1 WHERE team_id = ?1", params![home])?;
        }
        Ordering::Equal => {
            conn.execute("UPDATE standings SET t = t + 1 WHERE team_id = ?1", params![home])?;
            conn.execute("UPDATE standings SET t = t + 1 WHERE team_id = ?1", params![away])?;
        }
    }
    Ok(())
}

/// 오늘 예정된 배경 경기(주인공 경기는 advance()가 이미 가로채 여기 안 옴)를
/// 전부 sim::match_sim으로 돌려 schedule.result·standings를 갱신한다.
/// sim/injury·콜백형 이벤트 등 나머지 "매일 경계" 항목은 여전히 스코프 밖
/// (플랜 문서 참고) — 여기는 배경 경기 시뮬만.
fn process_day(slot_conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let mut stmt = slot_conn.prepare("SELECT game_id, home, away FROM schedule WHERE day = ?1 AND result IS NULL")?;
    let games: Vec<(String, String, String)> =
        stmt.query_map([day], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for (game_id, home, away) in games {
        let league_id: String = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [&home], |row| row.get(0))?;

        let home_lineup = load_batting_lineup(slot_conn, &home)?;
        let home_pitcher = load_starting_pitcher(slot_conn, &home)?;
        let away_lineup = load_batting_lineup(slot_conn, &away)?;
        let away_pitcher = load_starting_pitcher(slot_conn, &away)?;

        let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("match:{game_id}")));
        let result = match_sim::simulate_game(&mut rng, &league_id, &home_lineup, &home_pitcher, &away_lineup, &away_pitcher);

        let result_json = serde_json::json!({"home": result.home_runs, "away": result.away_runs}).to_string();
        slot_conn.execute("UPDATE schedule SET result = ?1 WHERE game_id = ?2", params![result_json, game_id])?;
        update_standings(slot_conn, &home, &away, result.home_runs, result.away_runs)?;
    }
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
/// (04_게임루프.md §1), standings를 history_standings로 압축 후 다음 시즌을
/// 위해 standings·schedule·season_stats 초기화(I5에서 추가). 시즌 평가·
/// 주목도 확정·방출판정·재계약/FA/드래프트·로스터 세대교체·투자정산은
/// sim/eval·sim/market·generate_freshmen이 생긴 뒤 여기 채울 것 — 지금
/// 호출하면 todo!() 패닉이라 안 부름.
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

    // standings 압축 — rank는 승률 기준 전체(리그 구분 없이) 순위 placeholder,
    // 리그별 정확한 순위는 content.db 조회가 필요해 이번 스코프 밖.
    let mut stmt = conn.prepare("SELECT team_id, w, l FROM standings")?;
    let mut rows: Vec<(String, i64, i64)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    rows.sort_by(|a, b| {
        let pct_a = a.1 as f64 / (a.1 + a.2).max(1) as f64;
        let pct_b = b.1 as f64 / (b.1 + b.2).max(1) as f64;
        pct_b.partial_cmp(&pct_a).unwrap_or(std::cmp::Ordering::Equal)
    });
    for (i, (team_id, _, _)) in rows.iter().enumerate() {
        conn.execute(
            "INSERT INTO history_standings (season, team_id, rank) VALUES (?1, ?2, ?3)
             ON CONFLICT(season, team_id) DO UPDATE SET rank = excluded.rank",
            params![current, team_id, i as i64 + 1],
        )?;
    }

    conn.execute("DELETE FROM standings", [])?;
    conn.execute("DELETE FROM schedule", [])?;
    conn.execute("DELETE FROM season_stats", [])?;
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
/// content_conn은 I5에서 추가 — 배경 경기(process_day)가 리그 규칙·로스터를
/// 읽으려면 content.db가 필요해짐.
pub fn advance(slot_conn: &mut Connection, content_conn: &Connection) -> anyhow::Result<Vec<PendingActionRow>> {
    let world_seed: i64 = slot_conn.query_row("SELECT world_seed FROM meta", [], |row| row.get(0))?;

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

        process_day(&tx, content_conn, world_seed, today)?;
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
        let content_conn = content::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO inbox (id, kind, urgency, read, day, body) VALUES ('inbox:1', 'info', 'low', 0, 1, 'test')",
                [],
            )
            .unwrap();

        let pending = advance(&mut slot_conn, &content_conn).unwrap();

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
        let content_conn = content::open_in_memory().unwrap();
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

        let pending = advance(&mut slot_conn, &content_conn).unwrap();

        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "game");
        assert_eq!(pending[0].created_day, 5);
        assert_eq!(current_day(&slot_conn), 5, "must stop exactly on game day, not run past it");

        resolve_choice(&slot_conn, &pending[0].id, "ack").unwrap();
        let remaining: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0);

        // no more scheduled games — next advance() runs forward again (bounded by the safety cap).
        let pending2 = advance(&mut slot_conn, &content_conn).unwrap();
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

        let content_conn = content::open_in_memory().unwrap();
        let mut a = build();
        let mut b = build();
        advance(&mut a, &content_conn).unwrap();
        advance(&mut b, &content_conn).unwrap();

        assert_eq!(integrity_sig(&a), integrity_sig(&b));
        assert_eq!(current_day(&a), current_day(&b));
    }

    fn insert_test_player(conn: &Connection, id: &str, team_id: &str, position: &str, stats: serde_json::Value) {
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches)
             VALUES (?1, ?2, ?3, ?4, 20, 1, 0, 50.0, '{}', ?5, '{}', '{}', NULL)",
            params![id, format!("선수{id}"), team_id, position, stats.to_string()],
        )
        .unwrap();
    }

    fn insert_minimal_roster(conn: &Connection, team_id: &str) {
        insert_test_player(
            conn,
            &format!("{team_id}_sp"),
            team_id,
            "선발투수",
            serde_json::json!({"제구": 50.0, "구위": 50.0}),
        );
        for i in 0..8 {
            insert_test_player(
                conn,
                &format!("{team_id}_b{i}"),
                team_id,
                "타자",
                serde_json::json!({"컨택": 50.0, "선구안": 50.0, "파워": 50.0}),
            );
        }
    }

    #[test]
    fn generate_schedule_creates_expected_game_count_for_grouped_league() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:univ', NULL)", []).unwrap();
        content_conn
            .execute("INSERT INTO stadiums (id, name, park_factor, meta) VALUES ('stadium:a', 'A', '중립', NULL)", [])
            .unwrap();
        for i in 0..6 {
            content_conn
                .execute(
                    "INSERT INTO teams (id, league_id, color, meta, stadium_id) VALUES (?1, 'league:univ', NULL, NULL, 'stadium:a')",
                    params![format!("team:u{i}")],
                )
                .unwrap();
        }

        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_schedule(&mut slot_conn, &content_conn, 42, "league:univ", 1).unwrap();

        let count: i64 = slot_conn.query_row("SELECT count(*) FROM schedule", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 6 * 5 / 2); // single round robin, 6 teams -> 15 unique pairs
    }

    #[test]
    fn process_day_simulates_scheduled_games_and_updates_standings() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)", [])
            .unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)", [])
            .unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        insert_minimal_roster(&slot_conn, "team:b");
        slot_conn
            .execute(
                "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 10, 'team:a', 'team:b', NULL)",
                [],
            )
            .unwrap();

        process_day(&slot_conn, &content_conn, 777, 10).unwrap();

        let result: Option<String> =
            slot_conn.query_row("SELECT result FROM schedule WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        assert!(result.is_some());

        let (w_a, l_a, t_a): (i64, i64, i64) = slot_conn
            .query_row("SELECT w, l, t FROM standings WHERE team_id = 'team:a'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        assert_eq!(w_a + l_a + t_a, 1);
    }

    #[test]
    fn advance_simulates_background_games_via_process_day() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)", [])
            .unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)", [])
            .unwrap();

        let mut slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        insert_minimal_roster(&slot_conn, "team:b");
        slot_conn
            .execute(
                "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 3, 'team:a', 'team:b', NULL)",
                [],
            )
            .unwrap();

        // no protagonist -> advance() runs the full safety-cap loop (= one full
        // season, 364 days), simulating the day-3 background game along the
        // way and then hitting season_rollover at day 364. `schedule` is the
        // "시즌(휘발)" group (06_스키마.md §4) so it gets wiped by rollover —
        // the game's effect should still show up in the archived standings.
        advance(&mut slot_conn, &content_conn).unwrap();

        let schedule_count: i64 = slot_conn.query_row("SELECT count(*) FROM schedule", [], |r| r.get(0)).unwrap();
        assert_eq!(schedule_count, 0, "schedule is season-scoped and should be cleared by season_rollover");

        let history_count: i64 = slot_conn
            .query_row("SELECT count(*) FROM history_standings WHERE season = 0", [], |r| r.get(0))
            .unwrap();
        assert_eq!(history_count, 2, "both teams' day-3 result should have been folded into the archived standings");
    }

    #[test]
    fn season_rollover_archives_standings_and_resets_season_tables() {
        let conn = slot::open_in_memory().unwrap();
        conn.execute("INSERT INTO standings (team_id, w, l, t, rank) VALUES ('team:a', 10, 5, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO standings (team_id, w, l, t, rank) VALUES ('team:b', 3, 12, 0, 0)", []).unwrap();
        conn.execute(
            "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 1, 'team:a', 'team:b', NULL)",
            [],
        )
        .unwrap();

        season_rollover(&conn).unwrap();

        let standings_count: i64 = conn.query_row("SELECT count(*) FROM standings", [], |r| r.get(0)).unwrap();
        assert_eq!(standings_count, 0);
        let schedule_count: i64 = conn.query_row("SELECT count(*) FROM schedule", [], |r| r.get(0)).unwrap();
        assert_eq!(schedule_count, 0);

        let rank_a: i64 = conn
            .query_row("SELECT rank FROM history_standings WHERE season = 0 AND team_id = 'team:a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rank_a, 1, "team:a has the better win% and should rank 1st");
    }
}