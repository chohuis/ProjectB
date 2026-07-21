use std::collections::HashMap;

use rand::seq::SliceRandom;
use rand::Rng;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::{content, match_session, slot};
use crate::sim::manager;
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
pub(crate) fn league_sub_seed(world_seed: i64, league_id: &str) -> u64 {
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
    let manager_role_ctx = content::load_personality_rule(content_conn, "role:감독")?;

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
        let weights = PersonalityWeights::merge(&[philosophy_ctx.clone(), status_ctx.clone(), role_ctx.clone()]);

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
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                    serde_json::json!({"current": null, "history": []}).to_string(),
                ],
            )?;
        }

        // 감독(§6-59) — 정식 스태프 시스템의 최소 조각. 팀당 1명, 코치·구단주는
        // 계속 이월(10_구현_Phase_계획.md §6-59 스코프 판단).
        let manager_weights = PersonalityWeights::merge(&[philosophy_ctx, status_ctx, manager_role_ctx.clone()]);
        let m = manager::generate_manager(&mut rng, &team.id, &kr_surnames, &kr_given, &manager_weights);
        tx.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?2, ?3, '감독', ?4, 0, 0, 50.0, ?5, ?6, '{}', '{}', NULL, ?7)",
            params![
                m.id,
                m.name,
                m.team_id,
                m.age,
                m.personality.to_string(),
                m.stats.to_string(),
                serde_json::json!({"current": null, "history": []}).to_string(),
            ],
        )?;
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
/// `&Connection`(트랜잭션 안 필요) — `season_rollover`가 이미 `advance()`의
/// 외부 트랜잭션 안에서 호출하므로(§6-36 버그 수정으로 새로 생긴 호출부),
/// 자체 트랜잭션을 열면 중첩이 돼 충돌한다. `generate_initial_world`(새
/// 게임, 트랜잭션 밖)에서도 `&mut Connection`을 그대로 넘기면 자동
/// reborrow돼 문제없다. `season`을 시드에 섞어(§6-36) 시즌마다 대진
/// 순서가 달라지게 함 — 이전엔 같은 리그면 매 시즌 똑같은 대진표가
/// 나왔었음(고정 시드).
pub fn generate_schedule(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    league_id: &str,
    season: i64,
    start_day: i64,
) -> anyhow::Result<()> {
    let groups = content::load_team_groups_for_schedule(content_conn, league_id)?;
    let laps = regular_season_laps(league_id);
    let league_slug = league_id.strip_prefix("league:").unwrap_or(league_id);
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("schedule:{league_id}:{season}")));

    let entries = schedule::generate_regular_season(league_slug, &groups, laps, start_day, &mut rng);

    for e in &entries {
        slot_conn.execute(
            "INSERT INTO schedule (game_id, day, home, away, result) VALUES (?1, ?2, ?3, ?4, NULL)",
            params![e.game_id, e.day, e.home, e.away],
        )?;
    }
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
    // generate_schedule은 (season_rollover의 기존 트랜잭션 안에서 중첩되지
    // 않도록) 자체 트랜잭션이 없다 — 여기서는 그런 바깥 트랜잭션이 없으므로
    // 안 감싸면 경기 하나하나가 실제 파일에 개별 autocommit(=매번 fsync)
    // 된다. 리그당 수백 경기 × 4개 리그가 그렇게 커밋되면 실제 디스크에서
    // 수십 초가 걸려(새 게임 시작 지연의 실측 주범) 여기서 한 트랜잭션으로
    // 묶는다.
    let tx = slot_conn.transaction()?;
    for league_id in SCHEDULED_LEAGUE_IDS {
        generate_schedule(&tx, content_conn, canonical_seed, league_id, 0, 1)?;
    }
    tx.commit()?;
    Ok(())
}

/// 지금 시즌 값 — `season_meta`에 아직 한 번도 안 쓰였으면(첫 시즌 도중)
/// 0. `season_rollover`가 이미 매번 이 패턴으로 읽던 걸 커리어 이벤트
/// 기록에도 그대로 재사용.
fn current_season_value(conn: &Connection) -> anyhow::Result<i64> {
    Ok(conn
        .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |row| row.get::<_, String>(0))
        .optional()?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0))
}

/// 내 정보 "커리어" 탭용 — 트레이드·계약처럼 이미 `league_transactions`에
/// 남던 것과 달리 지금까지 어디에도 안 남던 커리어 분기점(입학·갈림길A
/// 결과·병역 만료·은퇴)을 시간순으로 기록한다(대화 2026-07-21). `kind`는
/// "enrollment"|"career_choice"|"military_discharge"|"retirement".
fn log_career_event(conn: &Connection, day: i64, season: i64, kind: &str, detail: serde_json::Value) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO career_events (day, season, kind, detail) VALUES (?1, ?2, ?3, ?4)",
        params![day, season, kind, detail.to_string()],
    )?;
    Ok(())
}

/// 뉴게임 — 주인공 생성([07_주인공_생성](../../02_기획/07_주인공_생성.md)
/// §1의 7단계 플로우 중 실제로 데이터를 만드는 마지막 단계, 나머지는 화면
/// 흐름이라 I7(Flutter UI) 소관). `school_team_id`·`archetype`·
/// `second_pitch`는 전부 사용자가 직접 고르는 값이라 시스템 경계로 보고
/// content.db에 실제 존재·소속 리그가 맞는지, 그 타입의 2구종 후보 풀에
/// 속하는지 검증한다(다른 생성 로직들이 content.db·호출부를 무조건
/// 신뢰하는 것과 다른 지점).
#[allow(clippy::too_many_arguments)]
pub fn create_protagonist(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    name: &str,
    handedness: &str,
    school_team_id: &str,
    archetype: &str,
    second_pitch: Option<&str>,
) -> anyhow::Result<()> {
    let league_id: Option<String> = content_conn
        .query_row("SELECT league_id FROM teams WHERE id = ?1", [school_team_id], |r| r.get(0))
        .optional()?;
    if league_id.as_deref() != Some("league:hs") {
        anyhow::bail!("school_team_id {school_team_id} is not a league:hs team");
    }

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "protagonist"));
    let stats = crate::sim::protagonist::generate_starting_stats(&mut rng, archetype)?;

    let mut pitches = vec!["포심 패스트볼".to_string()];
    if let Some(second) = second_pitch {
        if !crate::sim::protagonist::is_valid_second_pitch(archetype, second)? {
            anyhow::bail!("{second} is not a valid second pitch for archetype {archetype}");
        }
        pitches.push(second.to_string());
    }

    let exposed = crate::sim::growth::exposed_stats_for("선발투수");
    let xp: serde_json::Map<String, serde_json::Value> = exposed.iter().map(|s| (s.to_string(), serde_json::json!(0))).collect();

    slot_conn.execute(
        "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, age)
         VALUES ('proto:1', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            name,
            handedness,
            archetype,
            serde_json::Value::Object(stats).to_string(),
            serde_json::Value::Object(xp).to_string(),
            serde_json::json!({"피로도": 0, "사기": 50, "폼": 50}).to_string(),
            serde_json::json!({}).to_string(),
            serde_json::json!(pitches).to_string(),
            serde_json::json!({"team_id": school_team_id}).to_string(),
            serde_json::json!({"current": null, "history": []}).to_string(),
            17, // 02_아마_고교.md §A-1 "고교 1학년, 17세"
        ],
    )?;
    log_career_event(slot_conn, 0, 0, "enrollment", serde_json::json!({"school_team_id": school_team_id}))?;
    Ok(())
}

/// 훈련 슬롯 설정([06_훈련_시스템](../../02_기획/육성코어/06_훈련_시스템.md)
/// §1 코어루프 "훈련·접근법은 지속 설정" — 매주 다시 안 짜고 계속 적용됨).
/// 사용자가 직접 고르는 값이라 시스템 경계로 보고 검증한다: 주슬롯·보조
/// 슬롯이 실제 투수 노출 스탯인지, 강도가 3단계 중 하나인지, 신규 구종이
/// 이미 아는 구종이 아닌지(§3 "신규 습득"과 "기존 다듬기"는 부담이
/// 달라 구분이 의미 있음 — 이미 아는 걸 "신규"로 잘못 설정하는 걸 막음).
/// 같은 구종을 계속 훈련 중이면 진행도(`pitch_weeks`)를 이어가고, 구종을
/// 바꾸면 0부터 다시 시작.
pub fn set_protagonist_training(
    slot_conn: &Connection,
    primary_stat: &str,
    secondary_stats: [&str; 2],
    intensity: &str,
    new_pitch: Option<&str>,
) -> anyhow::Result<()> {
    if !crate::sim::training::INTENSITIES.contains(&intensity) {
        anyhow::bail!("unknown training intensity: {intensity}");
    }
    if !crate::sim::growth::PITCHER_EXPOSED.contains(&primary_stat) {
        anyhow::bail!("unknown primary stat: {primary_stat}");
    }
    for s in secondary_stats {
        if !crate::sim::growth::PITCHER_EXPOSED.contains(&s) {
            anyhow::bail!("unknown secondary stat: {s}");
        }
    }

    let pitches_raw: String = slot_conn.query_row("SELECT pitches FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let pitches: Vec<String> = serde_json::from_str(&pitches_raw)?;
    if let Some(pitch) = new_pitch {
        if pitches.iter().any(|p| p == pitch) {
            anyhow::bail!("{pitch} is already known — new_pitch is for learning a pitch not yet in the repertoire");
        }
    }

    let existing_training: Option<String> = slot_conn
        .query_row("SELECT training FROM protagonist WHERE id = 'proto:1'", [], |r| r.get::<_, Option<String>>(0))
        .optional()?
        .flatten();
    let pitch_weeks = existing_training
        .as_deref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .filter(|v| v.get("new_pitch").and_then(|p| p.as_str()) == new_pitch)
        .and_then(|v| v.get("pitch_weeks").and_then(|w| w.as_u64()))
        .unwrap_or(0);

    let training = serde_json::json!({
        "primary_stat": primary_stat,
        "secondary_stats": secondary_stats,
        "intensity": intensity,
        "new_pitch": new_pitch,
        "pitch_weeks": pitch_weeks,
    });
    slot_conn.execute("UPDATE protagonist SET training = ?1 WHERE id = 'proto:1'", params![training.to_string()])?;
    Ok(())
}

/// 캐릭터 생성 "개인 신체" 페이지(대화 2026-07-20) — 4종 혈액형.
pub const BLOOD_TYPES: [&str; 4] = ["A", "B", "O", "AB"];

/// 출신지역 8권역 — [07_주인공_생성](../../../02_기획/07_주인공_생성.md)
/// §3-1이 학교 선택용으로 이미 확정해둔 8권역을 그대로 재사용(고향은
/// 진학 학교와 별개 선택이라 겹치는 지역이어도 됨).
pub const HOMETOWN_REGIONS: [&str; 8] =
    ["서울", "경기·인천", "강원", "충청", "호남", "대구·경북", "부산·경남·울산", "제주"];

/// 캐릭터 생성 "개인 신체" 페이지 — 이름·좌우완·학교·투수타입과 달리
/// 시뮬레이션에 쓰이지 않는 순수 표시용 데이터(생일·키·몸무게·혈액형·
/// 출신지역·등번호)라 `create_protagonist` 시그니처에 얹지 않고
/// `set_protagonist_training`과 같은 패턴으로 생성 직후 별도 호출한다.
/// 생년은 항상 2010년 고정(세계관 시작 시점에 17세, [01_커리어_구조]
/// (../../../02_기획/01_커리어_구조.md) §1) — UI는 월/일만 받는다.
#[allow(clippy::too_many_arguments)]
pub fn set_protagonist_profile(
    slot_conn: &Connection,
    birth_month: i64,
    birth_day: i64,
    height_cm: f64,
    weight_kg: f64,
    blood_type: &str,
    hometown: &str,
    jersey_number: i64,
) -> anyhow::Result<()> {
    if !(1..=12).contains(&birth_month) {
        anyhow::bail!("birth_month must be 1..=12, got {birth_month}");
    }
    let max_day = match birth_month {
        4 | 6 | 9 | 11 => 30,
        2 => 28, // 2010년은 윤년 아님(생년 고정) — §1 참고.
        _ => 31,
    };
    if !(1..=max_day).contains(&birth_day) {
        anyhow::bail!("birth_day {birth_day} is not valid for month {birth_month}");
    }
    if height_cm <= 0.0 || weight_kg <= 0.0 {
        anyhow::bail!("height_cm/weight_kg must be positive, got {height_cm}/{weight_kg}");
    }
    if !BLOOD_TYPES.contains(&blood_type) {
        anyhow::bail!("unknown blood type: {blood_type}");
    }
    if !HOMETOWN_REGIONS.contains(&hometown) {
        anyhow::bail!("unknown hometown region: {hometown}");
    }
    if !(1..=99).contains(&jersey_number) {
        anyhow::bail!("jersey_number must be 1..=99, got {jersey_number}");
    }

    let profile = serde_json::json!({
        "birth_year": 2010,
        "birth_month": birth_month,
        "birth_day": birth_day,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "blood_type": blood_type,
        "hometown": hometown,
        "jersey_number": jersey_number,
    });
    slot_conn.execute("UPDATE protagonist SET profile = ?1 WHERE id = 'proto:1'", params![profile.to_string()])?;
    Ok(())
}

/// 주인공 주간 훈련 적용 — `process_week`(NPC 전용)과 별도로 둔다(협/한
/// 주인공은 `npc` 테이블에 없어 그쪽 쿼리에 안 걸림). 부상 완치 처리·
/// 누적형(과사용) 부상 체크(08_부상_시스템.md §3 "체크 시점 = 매주")는
/// 훈련 설정 여부와 무관하게 항상 적용 — NPC(`process_week`)와 동일한
/// 무조건(ungated) 주간 롤이고, 이중 부상 방지는 `apply_injury` 내부
/// 가드가 담당한다. 그 아래 훈련 XP 적용은 훈련 설정을 한 번도 안 했으면
/// (`training IS NULL`) 조용히 건너뜀 — 플레이어가 최소 1회는 설정해야
/// 성장이 시작된다는 뜻이라 첫 세션엔 자연스러운 "아직 훈련 계획을 안
/// 짰다"는 상태.
#[allow(clippy::type_complexity)]
fn process_protagonist_week(slot_conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let row: Option<(String, String, String, Option<String>, String, String, String)> = slot_conn
        .query_row("SELECT stats, xp, live_state, training, pitches, contract, injury FROM protagonist WHERE id = 'proto:1'", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
        })
        .optional()?;
    let Some((stats_raw, xp_raw, live_state_raw, training_raw, pitches_raw, contract_raw, injury_raw)) = row else {
        return Ok(()); // 아직 캐릭터 생성 전
    };

    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
    let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let team_id = contract.get("team_id").and_then(|v| v.as_str()).map(str::to_string);

    let mut injury: serde_json::Value = serde_json::from_str(&injury_raw)?;
    clear_healed_injury(&mut injury, day);
    update_protagonist_injury(slot_conn, &injury)?;

    let philosophy = match &team_id {
        Some(t) => content_conn
            .query_row("SELECT philosophy FROM team_traits WHERE team_id = ?1", [t], |r| r.get::<_, String>(0))
            .optional()?
            .unwrap_or_default(),
        None => String::new(),
    };
    let fatigue_before_training = live_state.get("피로도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut injury_rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("injury:proto:{day}")));
    if let Some((part, severity)) = crate::sim::injury::check_overuse_injury(&mut injury_rng, fatigue_before_training, &philosophy) {
        apply_injury(slot_conn, part, severity, day)?;
    }

    let Some(training_raw) = training_raw else {
        return Ok(()); // 훈련 설정을 아직 한 번도 안 함
    };

    let mut stats: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&stats_raw)?;
    let mut xp: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&xp_raw)?;
    let mut training: serde_json::Value = serde_json::from_str(&training_raw)?;

    let genius = stats.get("천재성").and_then(|v| v.as_f64()).unwrap_or(50.0);

    let has_upcoming_start = match team_id.as_deref() {
        Some(team_id) => {
            slot_conn.query_row(
                "SELECT count(*) FROM schedule WHERE (home = ?1 OR away = ?1) AND day BETWEEN ?2 AND ?3",
                params![team_id, day, day + 6],
                |r| r.get::<_, i64>(0),
            )? > 0
        }
        None => false,
    };

    let requested_intensity = training.get("intensity").and_then(|v| v.as_str()).unwrap_or("보통").to_string();
    let intensity = crate::sim::training::effective_intensity(&requested_intensity, has_upcoming_start);
    let primary_stat = training.get("primary_stat").and_then(|v| v.as_str()).unwrap_or("구속").to_string();
    let secondary_stats: Vec<String> = training
        .get("secondary_stats")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let secondary_refs: [&str; 2] = [
        secondary_stats.first().map(String::as_str).unwrap_or(""),
        secondary_stats.get(1).map(String::as_str).unwrap_or(""),
    ];
    let new_pitch = training.get("new_pitch").and_then(|v| v.as_str()).map(str::to_string);

    let config = crate::sim::training::TrainingConfig {
        primary_stat: &primary_stat,
        secondary_stats: secondary_refs,
        intensity,
        new_pitch: new_pitch.as_deref(),
    };

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("training:{day}")));
    crate::sim::training::apply_weekly_training(&mut rng, &crate::sim::growth::PITCHER_EXPOSED, &mut stats, &mut xp, genius, &config);

    if let Some(pitch) = &new_pitch {
        let weeks = training.get("pitch_weeks").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
        let required = crate::sim::training::weeks_required_to_learn_pitch(intensity) as u64;
        if weeks >= required {
            let mut pitches: Vec<String> = serde_json::from_str(&pitches_raw)?;
            if !pitches.iter().any(|p| p == pitch) {
                pitches.push(pitch.clone());
            }
            slot_conn.execute("UPDATE protagonist SET pitches = ?1 WHERE id = 'proto:1'", params![serde_json::json!(pitches).to_string()])?;
            training["new_pitch"] = serde_json::Value::Null;
            training["pitch_weeks"] = serde_json::json!(0);
        } else {
            training["pitch_weeks"] = serde_json::json!(weeks);
        }
    }

    let fatigue = live_state.get("피로도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let fatigue_delta = match intensity {
        "강" => 8.0,
        "약" => -10.0,
        _ => 0.0,
    };
    live_state.insert("피로도".to_string(), serde_json::json!((fatigue + fatigue_delta).max(0.0)));

    slot_conn.execute(
        "UPDATE protagonist SET stats = ?1, xp = ?2, live_state = ?3, training = ?4 WHERE id = 'proto:1'",
        params![
            serde_json::Value::Object(stats).to_string(),
            serde_json::Value::Object(xp).to_string(),
            serde_json::Value::Object(live_state).to_string(),
            training.to_string(),
        ],
    )?;
    Ok(())
}

/// 팀별 활성(retired=0) 로스터가 `generation_rules.roster_size`보다 모자란
/// 만큼만 새 선수를 생성해 채운다 — `sim::roster::generate_team`을 그대로
/// 재사용하되 `roster_size`만 부족분으로 바꿔 호출(투수/타자 비율 등 나머지
/// 규칙은 그대로 적용). **고교→대학/독립/프로 드래프트 같은 리그간 실제
/// 진로 이동은 모델링하지 않음** — [01_커리어_구조](../../02_기획/01_커리어_구조.md)
/// §5의 갈림길은 근본적으로 주인공이 선택하는 서사 이벤트라 I6 이후 스코프
/// (10_구현_Phase_계획.md §6-11). NPC는 같은 팀 안에서 "은퇴 후 신인 충원"
/// 만 반복하는 제자리 순환 placeholder.
/// 이름풀·리그별 생성규칙이 없는 리그(content.db가 전부 안 채워진 합성
/// 테스트 픽스처 등)는 "생성할 게 없음"으로 조용히 건너뛴다 — 실제 시드된
/// content.db는 I2에서 5개 리그 전부 채워져 있어 이 분기를 실제로 안 탐,
/// season_rollover가 늘 이 함수를 호출하게 되면서(8차분) 이름풀조차 없는
/// 구식 테스트 픽스처들이 깨지는 걸 막기 위한 방어적 처리.
pub fn generate_freshmen(conn: &Connection, content_conn: &Connection, world_seed: i64, season: i64) -> anyhow::Result<()> {
    let Ok(kr_surnames) = content::load_name_pool(content_conn, "kr", "surname") else {
        return Ok(());
    };
    let Ok(kr_given) = content::load_name_pool(content_conn, "kr", "given") else {
        return Ok(());
    };
    let secondary_pitches = content::load_secondary_pitch_names(content_conn)?;
    let role_ctx = content::load_personality_rule(content_conn, "role:선수")?;

    for league_id in LEAGUE_IDS {
        let Ok(rule) = content::load_generation_rule(content_conn, league_id) else {
            continue;
        };
        let roster_size = rule.get("roster_size").and_then(|v| v.as_u64()).unwrap_or(25);
        let teams = content::load_teams_for_league(content_conn, league_id)?;

        let league_slug = league_id.strip_prefix("league:").unwrap_or(league_id);
        let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("freshmen:{league_id}:{season}")));
        let id_prefix = format!("npc:{world_seed}_{league_slug}_freshman_{season}_");
        let mut seq: u64 = 0;

        for team in &teams {
            let active: u64 = conn.query_row(
                "SELECT count(*) FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position != '감독'",
                [&team.id],
                |r| r.get::<_, i64>(0),
            )? as u64;
            let missing = roster_size.saturating_sub(active);
            if missing == 0 {
                continue;
            }

            let philosophy_ctx = content::load_personality_rule(content_conn, &format!("philosophy:{}", team.philosophy))?;
            let status_ctx = content::load_personality_rule(content_conn, &format!("status:{}", team.status))?;
            let weights = PersonalityWeights::merge(&[philosophy_ctx, status_ctx, role_ctx.clone()]);

            let mut topup_rule = rule.clone();
            topup_rule["roster_size"] = serde_json::json!(missing);

            let players = roster::generate_team(
                &mut rng,
                team,
                league_id,
                &topup_rule,
                &kr_surnames,
                &kr_given,
                &secondary_pitches,
                &weights,
                &id_prefix,
                &mut seq,
            );

            for p in &players {
                conn.execute(
                    "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                     VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                        serde_json::json!({"current": null, "history": []}).to_string(),
                    ],
                )?;
            }
        }
    }
    Ok(())
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

/// 입대 처리 — `military_return_day`를 `start_day + MILITARY_SERVICE_DAYS`로
/// 설정하고 `military_served`를 1로(평생 1회, 재입대 없음). 자동 판정은
/// `season_rollover`가 `sim::npc::MILITARY_MIN_AGE`로 호출. 복무 중인
/// 선수는 `load_batting_lineup`·`load_starting_pitcher`·`accumulate_game_fatigue`
/// 의 `military_return_day IS NULL` 필터에 걸려 경기에 등장하지 않는다.
pub fn enlist(conn: &Connection, npc_id: &str, start_day: i64) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE npc SET military_return_day = ?1, military_served = 1 WHERE id = ?2",
        params![start_day + crate::sim::npc::MILITARY_SERVICE_DAYS, npc_id],
    )?;
    Ok(())
}

/// 전역 처리 — `military_return_day`를 NULL로. 자동 판정은 `process_week`가
/// `현재 day >= military_return_day`일 때 호출.
pub fn discharge(conn: &Connection, npc_id: &str) -> anyhow::Result<()> {
    conn.execute("UPDATE npc SET military_return_day = NULL WHERE id = ?1", params![npc_id])?;
    Ok(())
}

/// 은퇴 처리 — `retired=1`만 설정(§자동 판정 로직은 `season_rollover`가
/// `sim::npc::check_retirement`으로 호출). 은퇴한 선수는 `load_batting_lineup`
/// ·`load_starting_pitcher`의 `WHERE retired = 0` 필터에 걸려 이후 경기에
/// 더 이상 등장하지 않는다.
pub fn retire(conn: &Connection, npc_id: &str) -> anyhow::Result<()> {
    conn.execute("UPDATE npc SET retired = 1 WHERE id = ?1", params![npc_id])?;
    Ok(())
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

pub(crate) fn load_batting_lineup(slot_conn: &Connection, team_id: &str) -> anyhow::Result<Vec<match_sim::BatterStats>> {
    let mut stmt = slot_conn.prepare(
        "SELECT id, stats, live_state FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position NOT IN ('선발투수', '구원투수') ORDER BY id",
    )?;
    let rows: Vec<(String, String, String)> =
        stmt.query_map([team_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
    let mut lineup = Vec::with_capacity(rows.len());
    for (id, stats_raw, live_state_raw) in rows {
        let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
        let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
        lineup.push(match_sim::BatterStats {
            id,
            contact: v.get("컨택").and_then(|x| x.as_f64()).unwrap_or(50.0),
            eye: v.get("선구안").and_then(|x| x.as_f64()).unwrap_or(50.0),
            power: v.get("파워").and_then(|x| x.as_f64()).unwrap_or(50.0),
            fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
        });
    }
    Ok(lineup)
}

/// 오늘의 선발투수 — 감독의 로테이션·불펜 운용은 스태프 시스템이 생기는
/// 후속 Phase 스코프라, 지금은 그 팀의 (id 기준) 첫 선발투수가 매번 완투.
pub(crate) fn load_starting_pitcher(slot_conn: &Connection, team_id: &str) -> anyhow::Result<match_sim::PitcherStats> {
    let row: Option<(String, String, String)> = slot_conn
        .query_row(
            "SELECT id, stats, live_state FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position = '선발투수' ORDER BY id LIMIT 1",
            [team_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let (id, stats_raw, live_state_raw) = row.ok_or_else(|| anyhow::anyhow!("no starting pitcher on roster for team {team_id}"))?;
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    Ok(match_sim::PitcherStats {
        id,
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
        fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
    })
}

/// 감독 개입(§8) — 주인공이 강판된 뒤 나머지 이닝을 던질 구원투수.
/// 로스터에 `position = '구원투수'`가 여럿이면 (id 기준) 첫 명 고정 —
/// 실제 불펜 로테이션·복수 교체는 스코프 밖(1차 축소안). 로스터에 구원
/// 투수가 아예 없으면 None(호출부가 방어적으로 강판 자체를 건너뜀).
pub(crate) fn load_relief_pitcher(slot_conn: &Connection, team_id: &str) -> anyhow::Result<Option<match_sim::PitcherStats>> {
    let row: Option<(String, String, String)> = slot_conn
        .query_row(
            "SELECT id, stats, live_state FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position = '구원투수' ORDER BY id LIMIT 1",
            [team_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((id, stats_raw, live_state_raw)) = row else {
        return Ok(None);
    };
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    Ok(Some(match_sim::PitcherStats {
        id,
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
        fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
    }))
}

/// 강판 이후 세션에 이미 정해진 불펜 투수를 id로 다시 불러온다(감독
/// 개입, §8) — `load_relief_pitcher`는 강판되는 그 순간 후보를 고르는
/// 용도고, 이후 하프이닝마다는 그 투수로 고정해서 계속 불러와야 하므로
/// 별도 함수로 분리.
pub(crate) fn load_pitcher_by_id(slot_conn: &Connection, npc_id: &str) -> anyhow::Result<match_sim::PitcherStats> {
    let (stats_raw, live_state_raw): (String, String) =
        slot_conn.query_row("SELECT stats, live_state FROM npc WHERE id = ?1", [npc_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    Ok(match_sim::PitcherStats {
        id: npc_id.to_string(),
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
        fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
    })
}

/// 감독 스탯(§6-59) — 실제로 생성된 감독 npc 행(`manager:{team_id}`)이
/// 있으면 그 값, 없으면(구버전 세이브·감독을 안 만드는 합성 테스트)
/// 기존 해시 근사(`sim::manager::manager_stats`)로 조용히 폴백한다 —
/// 이 폴백 덕분에 감독을 생성하지 않는 기존 테스트가 전부 그대로
/// 통과한다.
pub(crate) fn load_manager_stats(conn: &Connection, team_id: &str) -> anyhow::Result<manager::ManagerStats> {
    let stats_raw: Option<String> =
        conn.query_row("SELECT stats FROM npc WHERE id = ?1", [format!("manager:{team_id}")], |r| r.get(0)).optional()?;
    let Some(stats_raw) = stats_raw else {
        return Ok(manager::manager_stats(team_id));
    };
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    Ok(manager::ManagerStats {
        tactics: v.get("전술력").and_then(|x| x.as_f64()).unwrap_or(50.0),
        trust: v.get("신뢰형성력").and_then(|x| x.as_f64()).unwrap_or(50.0),
    })
}

/// 관계도(§6-59, `콘텐츠/01_캐릭터.md` §5) — 없으면 "신규 관계는 항상
/// 0에서 시작"(§5) 원칙대로 0.
pub(crate) fn relationship_value(conn: &Connection, npc_id: &str) -> anyhow::Result<i64> {
    Ok(conn.query_row("SELECT value FROM relationships WHERE npc_id = ?1", [npc_id], |r| r.get(0)).optional()?.unwrap_or(0))
}

/// 관계도 가감(upsert) — `-100..=100`으로 clamp(§5 "범위: -100~100").
/// `relationships.npc_id`는 `npc(id)`를 FK로 강제하므로(`slot.rs`가
/// `PRAGMA foreign_keys=ON`), 감독이 아직 생성 안 된 세이브(구버전·감독을
/// 안 만드는 합성 테스트)에서 호출되면 조용히 no-op — `load_manager_stats`
/// 의 해시 폴백과 같은 결로, 감독 관계 갱신이 실전에선 항상 성공하되
/// 감독 없는 상태를 에러로 만들지 않는다.
pub(crate) fn adjust_relationship(conn: &Connection, npc_id: &str, delta: i64) -> anyhow::Result<()> {
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM npc WHERE id = ?1)", [npc_id], |r| r.get(0))?;
    if !exists {
        return Ok(());
    }
    let current = relationship_value(conn, npc_id)?;
    let next = (current + delta).clamp(-100, 100);
    conn.execute(
        "INSERT INTO relationships (npc_id, value, arc_stage) VALUES (?1, ?2, 0)
         ON CONFLICT(npc_id) DO UPDATE SET value = excluded.value",
        params![npc_id, next],
    )?;
    Ok(())
}

fn ensure_standings_row(conn: &Connection, team_id: &str) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO standings (team_id, w, l, t, rank) VALUES (?1, 0, 0, 0, 0)
         ON CONFLICT(team_id) DO NOTHING",
        params![team_id],
    )?;
    Ok(())
}

pub(crate) fn update_standings(conn: &Connection, home: &str, away: &str, home_runs: u32, away_runs: u32) -> anyhow::Result<()> {
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
fn bump_fatigue(conn: &Connection, id: &str, live_state_raw: &str, amount: f64) -> anyhow::Result<()> {
    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(live_state_raw)?;
    let current = live_state.get("피로도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    live_state.insert("피로도".to_string(), serde_json::Value::from(current + amount));
    conn.execute("UPDATE npc SET live_state = ?1 WHERE id = ?2", params![serde_json::Value::Object(live_state).to_string(), id])?;
    Ok(())
}

/// 경기 참여로 인한 피로도 누적 — `sim::injury::check_overuse_injury`(누적형
/// 부상)이 매주 읽는 `live_state.피로도`의 유일한 증가 소스(process_week은
/// 감소만 시킴). 타자는 그 경기에 실제로 쓰인 라인업 풀 전체(`load_batting_lineup`
/// 과 동일 정의 — 선발투수 아닌 전원), 투수는 그날의 선발투수 1명만(완투
/// placeholder라 실제로 던지는 건 그 한 명뿐). 다전제·브래킷 경기
/// (`simulate_series`·`simulate_round_robin_stage`)는 건드리지 않음 — 그쪽은
/// 이미 "캘린더 없이 동기 시뮬"로 단순화돼 있어 날짜 단위 피로 누적 개념이
/// 안 맞음(10_구현_Phase_계획.md §6-6).
pub(crate) fn accumulate_game_fatigue(conn: &Connection, team_id: &str) -> anyhow::Result<()> {
    const BATTER_FATIGUE_PER_GAME: f64 = 4.0;
    const PITCHER_FATIGUE_PER_GAME: f64 = 12.0;

    let mut stmt =
        conn.prepare("SELECT id, live_state FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position NOT IN ('선발투수', '구원투수')")?;
    let batters: Vec<(String, String)> = stmt.query_map([team_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    drop(stmt);
    for (id, live_state_raw) in batters {
        bump_fatigue(conn, &id, &live_state_raw, BATTER_FATIGUE_PER_GAME)?;
    }

    let starter: Option<(String, String)> = conn
        .query_row(
            "SELECT id, live_state FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL AND position = '선발투수' ORDER BY id LIMIT 1",
            [team_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if let Some((id, live_state_raw)) = starter {
        bump_fatigue(conn, &id, &live_state_raw, PITCHER_FATIGUE_PER_GAME)?;
    }
    Ok(())
}

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
        accumulate_game_fatigue(slot_conn, &home)?;
        accumulate_game_fatigue(slot_conn, &away)?;
        apply_injury_events(slot_conn, &result.injuries, day)?;
    }
    Ok(())
}

/// 다전제 시리즈 — 매 경기 로스터를 다시 조회(향후 부상·로테이션 반영 여지를
/// 남김)하고 홈/원정을 경기마다 교대(2-3-2 같은 실제 포맷 아님 — 단순
/// placeholder). 과반수(best_of/2+1승)를 먼저 채우면 종료. 동점(프로 12회
/// 제한 무승부)이 나오면 그 경기는 무효로 치고 다시 진행 — safety_cap으로
/// 무한루프만 방지.
fn simulate_series(
    slot_conn: &Connection,
    rng: &mut ChaCha8Rng,
    league_id: &str,
    team_a: &str,
    team_b: &str,
    best_of: u32,
) -> anyhow::Result<(String, u32)> {
    let need = best_of / 2 + 1;
    let mut wins_a = 0u32;
    let mut wins_b = 0u32;
    let mut games = 0u32;
    let safety_cap = best_of * 3 + 5;
    while wins_a < need && wins_b < need && games < safety_cap {
        let a_home = games.is_multiple_of(2);
        let (home_id, away_id) = if a_home { (team_a, team_b) } else { (team_b, team_a) };
        let home_lineup = load_batting_lineup(slot_conn, home_id)?;
        let home_pitcher = load_starting_pitcher(slot_conn, home_id)?;
        let away_lineup = load_batting_lineup(slot_conn, away_id)?;
        let away_pitcher = load_starting_pitcher(slot_conn, away_id)?;
        let r = match_sim::simulate_game(rng, league_id, &home_lineup, &home_pitcher, &away_lineup, &away_pitcher);
        // 다전제는 캘린더 없이 동기 시뮬(2·3차분에서 이미 확정한 단순화)이라
        // 날짜 개념이 없음 — 챔피언 기록과 동일하게 day=0 placeholder를 씀.
        apply_injury_events(slot_conn, &r.injuries, 0)?;
        games += 1;
        if r.home_runs != r.away_runs {
            let winner_is_a = (r.home_runs > r.away_runs) == a_home;
            if winner_is_a {
                wins_a += 1;
            } else {
                wins_b += 1;
            }
        }
    }
    let winner = if wins_a >= need { team_a.to_string() } else { team_b.to_string() };
    Ok((winner, games))
}

/// 프로 WC전 — 표는 "단판"이라 적혀 있지만 실제 규칙은 "5위가 2연승해야
/// 진출, 4위는 1승만 해도 진출"이라 최대 2경기짜리 특수 시리즈([리그팀/01_프로](
/// ../../02_기획/리그팀/01_프로.md) §4).
fn simulate_wild_card(slot_conn: &Connection, rng: &mut ChaCha8Rng, league_id: &str, fourth: &str, fifth: &str) -> anyhow::Result<String> {
    let mut fifth_wins = 0u32;
    for _ in 0..2 {
        let home_lineup = load_batting_lineup(slot_conn, fourth)?;
        let home_pitcher = load_starting_pitcher(slot_conn, fourth)?;
        let away_lineup = load_batting_lineup(slot_conn, fifth)?;
        let away_pitcher = load_starting_pitcher(slot_conn, fifth)?;
        let r = match_sim::simulate_game(rng, league_id, &home_lineup, &home_pitcher, &away_lineup, &away_pitcher);
        apply_injury_events(slot_conn, &r.injuries, 0)?;
        if r.away_runs > r.home_runs {
            fifth_wins += 1;
            if fifth_wins >= 2 {
                return Ok(fifth.to_string());
            }
        } else if r.home_runs > r.away_runs {
            return Ok(fourth.to_string());
        }
        // 무승부면 그 경기는 안 세고 계속(2경기 한도 안에서는 사실상 안 일어남 — 아마추어 룰이 아니라 프로 룰이라 12회 제한 무승부 가능성은 남아 있음)
    }
    Ok(fourth.to_string()) // 5위가 2연승 못 하면(1승1패 등) 4위 진출
}

pub(crate) fn win_pct(w: i64, l: i64) -> f64 {
    w as f64 / (w + l).max(1) as f64
}

fn rank_by_win_pct(record: &HashMap<String, (u32, u32)>) -> Vec<String> {
    let mut v: Vec<(String, u32, u32)> = record.iter().map(|(k, (w, l))| (k.clone(), *w, *l)).collect();
    v.sort_by(|a, b| win_pct(b.1 as i64, b.2 as i64).partial_cmp(&win_pct(a.1 as i64, a.2 as i64)).unwrap_or(std::cmp::Ordering::Equal));
    v.into_iter().map(|(k, _, _)| k).collect()
}

/// 라운드로빈 한 스테이지를 전부 동기적으로 시뮬(하루씩 advance()를 기다리지
/// 않음 — 독립리그는 단계 전환이 이전 단계 결과에 의존해 정적 스케줄을 미리
/// 못 만들기 때문에 채택한 단순화, 10_구현_Phase_계획.md §6 참고). `schedule`
/// 테이블에 기록은 남기되(day는 start_day부터 라운드 수만큼), **`standings`
/// 전역 테이블은 건드리지 않는다** — 독립 4단계는 그 자체로 임시 순위라
/// 다른 리그의 정규시즌 순위와 섞이면 안 됨.
fn simulate_round_robin_stage(
    slot_conn: &Connection,
    rng: &mut ChaCha8Rng,
    league_id: &str,
    teams: &[String],
    laps: u32,
    start_day: i64,
    game_id_prefix: &str,
) -> anyhow::Result<HashMap<String, (u32, u32)>> {
    let rounds = schedule::generate_round_robin_rounds(teams, laps, rng);
    let mut record: HashMap<String, (u32, u32)> = teams.iter().map(|t| (t.clone(), (0, 0))).collect();
    let mut seq: u64 = 0;
    for (i, round) in rounds.into_iter().enumerate() {
        let day = start_day + i as i64;
        for (home, away) in round {
            let home_lineup = load_batting_lineup(slot_conn, &home)?;
            let home_pitcher = load_starting_pitcher(slot_conn, &home)?;
            let away_lineup = load_batting_lineup(slot_conn, &away)?;
            let away_pitcher = load_starting_pitcher(slot_conn, &away)?;
            let r = match_sim::simulate_game(rng, league_id, &home_lineup, &home_pitcher, &away_lineup, &away_pitcher);
            apply_injury_events(slot_conn, &r.injuries, day)?;

            let game_id = format!("{game_id_prefix}{seq}");
            seq += 1;
            let result_json = serde_json::json!({"home": r.home_runs, "away": r.away_runs}).to_string();
            slot_conn.execute(
                "INSERT INTO schedule (game_id, day, home, away, result) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![game_id, day, home, away, result_json],
            )?;

            if r.home_runs > r.away_runs {
                record.get_mut(&home).unwrap().0 += 1;
                record.get_mut(&away).unwrap().1 += 1;
            } else if r.away_runs > r.home_runs {
                record.get_mut(&away).unwrap().0 += 1;
                record.get_mut(&home).unwrap().1 += 1;
            }
        }
    }
    Ok(record)
}

/// 독립리그 전체(4단계)를 한 번에 동기적으로 시뮬 — 04_독립.md §3·§6. 1차
/// 10팀(더블라운드18경기)→하위2탈락, 2차 8팀(더블라운드14경기)→하위4탈락,
/// 3차 4팀(싱글라운드3경기)→최종순위, 4차 준PO(단판)→PO(단판)→
/// 챔피언결정전(3전2승). `generate_initial_world`엔 배선 안 함 — 캘린더
/// 동기화가 아직 없어 "새 게임 시작하자마자 시즌이 끝나있는" 어색함을 피함
/// (10_구현_Phase_계획.md §6 참고). 챔피언은 `league_transactions`에 기록.
pub fn run_independent_season(slot_conn: &Connection, content_conn: &Connection, world_seed: i64, start_day: i64) -> anyhow::Result<String> {
    let league_id = "league:independent";
    let teams = content::load_team_ids_for_league(content_conn, league_id)?;
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "independent_season"));

    let stage1 = simulate_round_robin_stage(slot_conn, &mut rng, league_id, &teams, 2, start_day, "game:indep_s1_")?;
    let mut survivors = rank_by_win_pct(&stage1);
    survivors.truncate(8);
    let stage2_start = start_day + 18; // laps=2 * (10-1)라운드 = 18일

    let stage2 = simulate_round_robin_stage(slot_conn, &mut rng, league_id, &survivors, 2, stage2_start, "game:indep_s2_")?;
    let mut finalists = rank_by_win_pct(&stage2);
    finalists.truncate(4);
    let stage3_start = stage2_start + 14; // laps=2 * (8-1)라운드 = 14일

    let stage3 = simulate_round_robin_stage(slot_conn, &mut rng, league_id, &finalists, 1, stage3_start, "game:indep_s3_")?;
    let final_rank = rank_by_win_pct(&stage3);
    let postseason_day = stage3_start + 3; // laps=1 * (4-1)라운드 = 3일

    let (semi_winner, _) = simulate_series(slot_conn, &mut rng, league_id, &final_rank[2], &final_rank[3], 1)?;
    let (po_winner, _) = simulate_series(slot_conn, &mut rng, league_id, &final_rank[1], &semi_winner, 1)?;
    let (champion, _) = simulate_series(slot_conn, &mut rng, league_id, &final_rank[0], &po_winner, 3)?;

    slot_conn.execute(
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, ?2, 'champion', ?3)",
        params![format!("txn:indep_champion_{world_seed}_{postseason_day}"), postseason_day, champion],
    )?;
    Ok(champion)
}

/// 프로 5강 와일드카드 사다리 — 01_프로.md §4. `standings`에 league:pro 팀이
/// 5개 미만이면(정규시즌이 아직 안 끝났거나 합성 테스트 데이터) None. 챔피언은
/// `league_transactions`에 기록 — id에 `day`를 반드시 섞어야 한다(§6-36에서
/// 발견한 버그: `world_seed`만 넣었더니 시즌마다 같은 id라 두 번째 시즌부터
/// UNIQUE 제약 위반으로 `season_rollover` 자체가 죽었음 — 밸런스 하네스로
/// 실제 여러 시즌을 처음 돌려보고서야 드러남).
pub fn run_pro_postseason(slot_conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<Option<String>> {
    let league_id = "league:pro";
    let pro_ids: std::collections::HashSet<String> =
        content::load_team_ids_for_league(content_conn, league_id)?.into_iter().collect();
    if pro_ids.is_empty() {
        return Ok(None);
    }

    let mut stmt = slot_conn.prepare("SELECT team_id, w, l FROM standings")?;
    let all: Vec<(String, i64, i64)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    let mut seeded: Vec<(String, i64, i64)> = all.into_iter().filter(|(id, _, _)| pro_ids.contains(id)).collect();
    if seeded.len() < 5 {
        return Ok(None);
    }
    seeded.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    let seeds: Vec<String> = seeded.into_iter().map(|(id, _, _)| id).collect();

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "pro_postseason"));
    let wc_winner = simulate_wild_card(slot_conn, &mut rng, league_id, &seeds[3], &seeds[4])?;
    let (jpo_winner, _) = simulate_series(slot_conn, &mut rng, league_id, &seeds[2], &wc_winner, 5)?;
    let (po_winner, _) = simulate_series(slot_conn, &mut rng, league_id, &seeds[1], &jpo_winner, 5)?;
    let (champion, _) = simulate_series(slot_conn, &mut rng, league_id, &seeds[0], &po_winner, 7)?;

    slot_conn.execute(
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, ?2, 'champion', ?3)",
        params![format!("txn:pro_champion_{world_seed}_{day}"), day, champion],
    )?;
    Ok(Some(champion))
}

fn record_champion(slot_conn: &Connection, kind_suffix: &str, world_seed: i64, champion: &str) -> anyhow::Result<()> {
    slot_conn.execute(
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, 0, 'champion', ?2)",
        params![format!("txn:{kind_suffix}_champion_{world_seed}"), champion],
    )?;
    Ok(())
}

/// 표준 시드 브래킷 순서 — 재귀적으로 절반씩 접어 상위 시드가 하위 시드와
/// 최대한 늦게 만나도록 배치(1v16·2v15… 관행). 반환값은 1-indexed 시드
/// 번호의 순열(브래킷 포지션 순서) — 길이는 항상 2의 거듭제곱.
fn standard_seed_order(n: usize) -> Vec<usize> {
    if n <= 1 {
        return vec![1];
    }
    let half = standard_seed_order(n / 2);
    let mut out = Vec::with_capacity(n);
    for s in half {
        out.push(s);
        out.push(n + 1 - s);
    }
    out
}

/// 시드 순서(0번=최상위 시드)로 정렬된 팀 목록을 받아 단판 넉아웃 브래킷을
/// 끝까지 시뮬 — 대학 3개 대회·고교 5개 전국대회가 전부 이 함수 하나로
/// 커버된다(참가 인원·시드/WC 산정 방식만 다르고 브래킷 진행 로직은 동일).
/// 브래킷 크기는 참가 인원보다 큰 최소 2의 거듭제곱이고, 남는 자리(부전승)는
/// standard_seed_order의 성질상 항상 상위 시드부터 채워진다 — "48강 상위16
/// 부전승", "국화기 128대진 26 부전승" 같은 문서 수치와 정확히 일치
/// (bracket_size - n_teams = 부전승 수, 절대 서로 만나지 않음).
fn simulate_knockout_bracket(
    slot_conn: &Connection,
    rng: &mut ChaCha8Rng,
    league_id: &str,
    seeded_teams: &[String],
) -> anyhow::Result<String> {
    let n = seeded_teams.len();
    anyhow::ensure!(n >= 2, "bracket needs at least 2 teams, got {n}");
    let mut bracket_size = 1usize;
    while bracket_size < n {
        bracket_size *= 2;
    }

    let order = standard_seed_order(bracket_size);
    let mut current: Vec<Option<String>> = order.iter().map(|&seed| seeded_teams.get(seed - 1).cloned()).collect();

    while current.len() > 1 {
        let mut next: Vec<Option<String>> = Vec::with_capacity(current.len() / 2);
        for pair in current.chunks(2) {
            let winner = match (&pair[0], &pair[1]) {
                (Some(a), Some(b)) => {
                    let (w, _) = simulate_series(slot_conn, rng, league_id, a, b, 1)?;
                    Some(w)
                }
                (Some(a), None) => Some(a.clone()),
                (None, Some(b)) => Some(b.clone()),
                (None, None) => None, // standard_seed_order의 성질상 실제로는 발생 안 함
            };
            next.push(winner);
        }
        current = next;
    }
    current.into_iter().next().flatten().ok_or_else(|| anyhow::anyhow!("bracket produced no champion"))
}

/// 조별 예선 라운드로빈을 그룹별로 동기 시뮬 후 조별 상위 N팀을 (team_id, w,
/// l)로 반환 — 그룹 경계를 넘어 순위를 매기지 않고 그룹 내 승률만 매긴다.
/// 호출부가 반환값을 다시 전체 승률로 재정렬해 본선 시드를 매긴다(은하기·
/// 여명기 둘 다 "예선 조 편성 = 완전 랜덤 추첨"이라 예선 조 배정 자체엔
/// 시드가 없음 — 03_대학.md §4-2).
fn run_group_stage_and_advance(
    slot_conn: &Connection,
    rng: &mut ChaCha8Rng,
    league_id: &str,
    groups: &[Vec<String>],
    advance_per_group: usize,
    start_day: i64,
    game_id_prefix: &str,
) -> anyhow::Result<Vec<(String, i64, i64)>> {
    let mut advancing = Vec::new();
    for (gi, group) in groups.iter().enumerate() {
        let record =
            simulate_round_robin_stage(slot_conn, rng, league_id, group, 1, start_day, &format!("{game_id_prefix}g{gi}_"))?;
        let mut ranked: Vec<(String, i64, i64)> = record.into_iter().map(|(id, (w, l))| (id, w as i64, l as i64)).collect();
        ranked.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
        advancing.extend(ranked.into_iter().take(advance_per_group));
    }
    Ok(advancing)
}

fn shuffle_and_split(rng: &mut ChaCha8Rng, mut teams: Vec<String>, group_count: usize) -> Vec<Vec<String>> {
    teams.shuffle(rng);
    let per_group = teams.len() / group_count;
    teams.chunks(per_group).map(|c| c.to_vec()).collect()
}

fn wildcards_from_remainder(remainder: Vec<(String, i64, i64)>, n: usize) -> Vec<String> {
    let mut r = remainder;
    r.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    r.into_iter().take(n).map(|(id, _, _)| id).collect()
}

/// 대학 정규리그 5조(content::load_team_groups_for_schedule의 stadium_id
/// 그룹) 각각을 승률 내림차순으로 정렬해 반환 — index 0 = 조1위. 왕중왕전·
/// 은하기·여명기가 필요한 인원수만 다르게 잘라 씀.
fn univ_group_ranked(slot_conn: &Connection, content_conn: &Connection) -> anyhow::Result<Vec<Vec<(String, i64, i64)>>> {
    let groups = content::load_team_groups_for_schedule(content_conn, "league:univ")?;
    let mut stmt = slot_conn.prepare("SELECT w, l FROM standings WHERE team_id = ?1")?;
    let mut result = Vec::new();
    for group in groups {
        let mut ranked: Vec<(String, i64, i64)> = group
            .into_iter()
            .map(|team_id| {
                let (w, l): (i64, i64) = stmt.query_row([&team_id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap_or((0, 0));
                (team_id, w, l)
            })
            .collect();
        ranked.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
        result.push(ranked);
    }
    Ok(result)
}

/// 대학 왕중왕전 — 03_대학.md §4-1. 조1위 5팀(자동, 상위시드) + 조2위 이하
/// 중 전체 승률 WC 3팀(하위시드) = 8팀, 8강 단판 토너먼트(부전승 없음 —
/// 8명이 정확히 8강을 채움).
pub fn run_univ_wangjungwang(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    let groups = univ_group_ranked(slot_conn, content_conn)?;
    let mut leaders: Vec<(String, i64, i64)> = groups.iter().filter_map(|g| g.first().cloned()).collect();
    let remainder: Vec<(String, i64, i64)> = groups.iter().flat_map(|g| g.iter().skip(1).cloned()).collect();
    leaders.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));

    let mut seeds: Vec<String> = leaders.into_iter().map(|(id, _, _)| id).collect();
    seeds.extend(wildcards_from_remainder(remainder, 3));

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "univ_wangjungwang"));
    let champion = simulate_knockout_bracket(slot_conn, &mut rng, "league:univ", &seeds)?;
    record_champion(slot_conn, "univ_wangjungwang", world_seed, &champion)?;
    Ok(champion)
}

/// 대학 은하기 — 03_대학.md §4-2. 조상위4×5조(20)+WC4=24명 → 8조×3팀
/// 완전 랜덤 추첨 예선 라운드로빈(조당 3경기) → 조1위만(8) 본선행, 예선
/// 승률로 재시드 → 8강 단판 토너먼트.
pub fn run_univ_eunhagi(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    prelim_start_day: i64,
) -> anyhow::Result<String> {
    let groups = univ_group_ranked(slot_conn, content_conn)?;
    let auto: Vec<(String, i64, i64)> = groups.iter().flat_map(|g| g.iter().take(4).cloned()).collect();
    let remainder: Vec<(String, i64, i64)> = groups.iter().flat_map(|g| g.iter().skip(4).cloned()).collect();
    let wc = wildcards_from_remainder(remainder, 4);

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "univ_eunhagi"));
    let mut pool: Vec<String> = auto.into_iter().map(|(id, _, _)| id).collect();
    pool.extend(wc);

    let prelim_groups = shuffle_and_split(&mut rng, pool, 8);
    let advancing =
        run_group_stage_and_advance(slot_conn, &mut rng, "league:univ", &prelim_groups, 1, prelim_start_day, "game:univ_eunhagi_prelim_")?;

    let mut ranked = advancing;
    ranked.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    let seeds: Vec<String> = ranked.into_iter().map(|(id, _, _)| id).collect();

    let champion = simulate_knockout_bracket(slot_conn, &mut rng, "league:univ", &seeds)?;
    record_champion(slot_conn, "univ_eunhagi", world_seed, &champion)?;
    Ok(champion)
}

/// 대학 여명기 — 03_대학.md §4-2. 조상위3×5조(15)+WC5=20명 → 4조×5팀 완전
/// 랜덤 추첨 예선 라운드로빈(조당 10경기) → 상위2×4조(8) 본선행, 예선
/// 승률로 재시드 → 8강 단판 토너먼트.
pub fn run_univ_yeongmyeonggi(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    prelim_start_day: i64,
) -> anyhow::Result<String> {
    let groups = univ_group_ranked(slot_conn, content_conn)?;
    let auto: Vec<(String, i64, i64)> = groups.iter().flat_map(|g| g.iter().take(3).cloned()).collect();
    let remainder: Vec<(String, i64, i64)> = groups.iter().flat_map(|g| g.iter().skip(3).cloned()).collect();
    let wc = wildcards_from_remainder(remainder, 5);

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "univ_yeongmyeonggi"));
    let mut pool: Vec<String> = auto.into_iter().map(|(id, _, _)| id).collect();
    pool.extend(wc);

    let prelim_groups = shuffle_and_split(&mut rng, pool, 4);
    let advancing =
        run_group_stage_and_advance(slot_conn, &mut rng, "league:univ", &prelim_groups, 2, prelim_start_day, "game:univ_yeongmyeonggi_prelim_")?;

    let mut ranked = advancing;
    ranked.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    let seeds: Vec<String> = ranked.into_iter().map(|(id, _, _)| id).collect();

    let champion = simulate_knockout_bracket(slot_conn, &mut rng, "league:univ", &seeds)?;
    record_champion(slot_conn, "univ_yeongmyeonggi", world_seed, &champion)?;
    Ok(champion)
}

/// 고교 8권역(=`load_team_groups_for_schedule`의 stadium_id 그룹, 02_고교.md
/// §4-1 정규시즌 스케줄이 이미 쓰는 그룹) 중 4개(서울·경기인천·호남·
/// 부산경남울산)는 원래 문서의 12권역 표(서울A/B, 경인A/B, 호남A/B, 영남A/B,
/// 충청·대구경북·강원·제주 단일권역)에서 소권역이 2개였던 대권역이다.
/// 실제 A/B 세부 팀 편성은 미확정(1차분과 동일 이유로 스코프 밖)이라 8권역
/// 그대로 시드를 매기되, "소권역당 N장" 원 공식을 정보 손실 없이 8권역에
/// 접어 재현한다: 대권역(소권역 2개)은 2N장, 단일권역은 N장.
const HS_SPLIT_REGION_STADIUMS: [&str; 4] = ["stadium:hangang", "stadium:mujigae", "stadium:yeongsan", "stadium:nakdong"];

fn hs_region_quota(stadium_id: &str, per_subregion: usize) -> usize {
    if HS_SPLIT_REGION_STADIUMS.contains(&stadium_id) {
        per_subregion * 2
    } else {
        per_subregion
    }
}

/// (team_id, w, l) 튜플 목록 — 어떤 그룹(대학 조/고교 권역)의 승률 정렬 결과.
type RankedTeams = Vec<(String, i64, i64)>;

fn hs_region_standings(slot_conn: &Connection, content_conn: &Connection) -> anyhow::Result<HashMap<String, RankedTeams>> {
    let mut stmt = content_conn.prepare("SELECT id, stadium_id FROM teams WHERE league_id = 'league:hs' ORDER BY id")?;
    let rows: Vec<(String, Option<String>)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    drop(stmt);

    let mut wl_stmt = slot_conn.prepare("SELECT w, l FROM standings WHERE team_id = ?1")?;
    let mut groups: HashMap<String, RankedTeams> = HashMap::new();
    for (team_id, stadium_id) in rows {
        let key = stadium_id.unwrap_or_else(|| "ungrouped".to_string());
        let (w, l): (i64, i64) = wl_stmt.query_row([&team_id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap_or((0, 0));
        groups.entry(key).or_default().push((team_id, w, l));
    }
    for v in groups.values_mut() {
        v.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    }
    Ok(groups)
}

/// 권역별 상위 per_subregion(×hs_region_quota 배율)장을 자동시드로, 나머지를
/// WC 후보 풀로 분리. 자동시드는 전체 승률로 재정렬(상위시드 우선).
fn hs_region_seeds(groups: &HashMap<String, RankedTeams>, per_subregion: usize) -> (Vec<String>, RankedTeams) {
    let mut autos: Vec<(String, i64, i64)> = Vec::new();
    let mut remainder: Vec<(String, i64, i64)> = Vec::new();
    for (stadium_id, ranked) in groups {
        let quota = hs_region_quota(stadium_id, per_subregion);
        for (i, entry) in ranked.iter().enumerate() {
            if i < quota {
                autos.push(entry.clone());
            } else {
                remainder.push(entry.clone());
            }
        }
    }
    autos.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    (autos.into_iter().map(|(id, _, _)| id).collect(), remainder)
}

/// 고교 지역시드+WC 브래킷 대회(개나리기·장미기·무궁화기·패왕기) 공통 골격 —
/// 4개 대회 전부 "권역 상위 N장 + 전체승률 WC M장 → 단판 넉아웃"이라 시드
/// 산정 파라미터(per_subregion, wc_count)만 다르고 나머지 로직은 동일
/// (02_고교.md §4-2). 개나리기(전년 권역순위)·장미기(전반기)·패왕기(후반기)의
/// 시점 구분은 캘린더 동기화가 아직 없어(I5 2차분에서 이미 채택한 단순화)
/// "호출 시점의 현재 standings"로 통일한다.
fn run_hs_region_seeded_bracket(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    purpose: &str,
    per_subregion: usize,
    wc_count: usize,
) -> anyhow::Result<String> {
    let groups = hs_region_standings(slot_conn, content_conn)?;
    let (autos, remainder) = hs_region_seeds(&groups, per_subregion);
    let mut seeds = autos;
    seeds.extend(wildcards_from_remainder(remainder, wc_count));

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, purpose));
    let champion = simulate_knockout_bracket(slot_conn, &mut rng, "league:hs", &seeds)?;
    record_champion(slot_conn, purpose, world_seed, &champion)?;
    Ok(champion)
}

/// 고교 개나리기 — 지역시드 2×8권역(=24, 12권역 표 기준 소권역당2) + WC8 =
/// 32명 → 32강 단판 토너먼트(부전승 없음).
pub fn run_hs_gaenari(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    run_hs_region_seeded_bracket(slot_conn, content_conn, world_seed, "hs_gaenari", 2, 8)
}

/// 고교 장미기 — 개나리기와 동일 산식(24+8=32, 32강 단판). 실제 문서는
/// "전반기 권역 상위" 기준이나 캘린더 시점 구분은 스코프 밖(위 주석 참고).
pub fn run_hs_jangmi(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    run_hs_region_seeded_bracket(slot_conn, content_conn, world_seed, "hs_jangmi", 2, 8)
}

/// 고교 무궁화기 — 지역시드 3×8권역(=36, 소권역당3) + WC12 = 48명 → 48강
/// 브래킷(bracket_size=64, 상위16 부전승 — 문서 수치와 정확히 일치).
pub fn run_hs_mugunghwa(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    run_hs_region_seeded_bracket(slot_conn, content_conn, world_seed, "hs_mugunghwa", 3, 12)
}

/// 고교 패왕기 — 지역시드 2×8권역(=24, 소권역당2) + WC 없음 = 24명 → 32대진
/// 브래킷(bracket_size=32, 상위8 부전승 — 문서 수치와 정확히 일치). 실제
/// 문서는 "후반기 권역 상위" 기준(캘린더 시점 구분은 스코프 밖).
pub fn run_hs_paewang(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    run_hs_region_seeded_bracket(slot_conn, content_conn, world_seed, "hs_paewang", 2, 0)
}

/// 고교 국화기 — 02_고교.md §4-2. 지역시드·WC 없이 102팀 전원 참가, 주말리그
/// 순위(=현재 standings 승률)로 전체 시드 → 128대진 브래킷(상위26 부전승,
/// 문서 수치와 정확히 일치) — "개방형" 취지대로 소규모 지역 팀도 전원 포함.
pub fn run_hs_gukhwa(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<String> {
    let ids = content::load_team_ids_for_league(content_conn, "league:hs")?;
    let mut stmt = slot_conn.prepare("SELECT w, l FROM standings WHERE team_id = ?1")?;
    let mut ranked: Vec<(String, i64, i64)> = ids
        .into_iter()
        .map(|id| {
            let (w, l): (i64, i64) = stmt.query_row([&id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap_or((0, 0));
            (id, w, l)
        })
        .collect();
    drop(stmt);
    ranked.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
    let seeds: Vec<String> = ranked.into_iter().map(|(id, _, _)| id).collect();

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, "hs_gukhwa"));
    let champion = simulate_knockout_bracket(slot_conn, &mut rng, "league:hs", &seeds)?;
    record_champion(slot_conn, "hs_gukhwa", world_seed, &champion)?;
    Ok(champion)
}

/// 주간 경계 — 은퇴하지 않은 전 NPC(172팀 균등원칙, 리그·팀 차별 없음)에
/// `sim::growth::apply_weekly_growth`를 적용해 노출 스탯 9종을 XP 누적→
/// 임계값 돌파 시 +1로 성장시킨다(04_성장_곡선.md §2 "상승기"). 노쇠(하락기)
/// ·누적형 부상체크·라이브상태 갱신·폴링형 이벤트 평가·개인 트레이너
/// 과금은 여전히 스코프 밖 — 노쇠는 부상 이력에 의존한다고 문서에 명시돼
/// (04_성장_곡선.md §5 "부상 이력이 어떻게 반영되는지 — 08_부상_시스템
/// 확정 후") 08_부상_시스템 구현과 함께 다음 서브분에서 묶어 처리.
/// injury JSON(`{"current": ..., "history": [...]}`)에 새 부상을 기록 —
/// 같은 부위 재발이면 심각도 자동 한 단계 상승(08_부상_시스템.md §5).
/// 치료법은 일단 항상 "재활"(중간 옵션)로 채워둔다 — NPC는 실제 의사결정
/// 주체가 없어 이 기본값 그대로 확정되지만(`apply_injury_events`), 주인공은
/// `apply_injury`가 이 함수 호출 직후 `치료`를 `null`로 되돌려 §4 세 옵션
/// 중 하나를 플레이어가 직접 고르게 한다(`injuryTreatment` PendingAction).
/// 예상 복귀일 = day + 심각도별 이탈기간(치료법 확정 시 `treat`가 재계산).
fn record_injury(injury: &mut serde_json::Value, part: &str, severity: &str, day: i64) {
    let obj = injury.as_object_mut().expect("injury must be a JSON object");
    if !obj.contains_key("history") {
        obj.insert("history".to_string(), serde_json::json!([]));
    }
    let history_arr = obj.get_mut("history").unwrap().as_array_mut().expect("history must be an array");

    let final_severity = match history_arr.iter().rev().find(|h| h.get("부위").and_then(|v| v.as_str()) == Some(part)) {
        Some(prev) => crate::sim::injury::escalate_severity(prev.get("심각도").and_then(|v| v.as_str()).unwrap_or(severity)),
        None => severity,
    };

    history_arr.push(serde_json::json!({"부위": part, "심각도": final_severity, "day": day}));
    obj.insert(
        "current".to_string(),
        serde_json::json!({
            "부위": part,
            "심각도": final_severity,
            "치료": "재활",
            "start_day": day,
            "return_day": day + crate::sim::injury::recovery_days(final_severity),
        }),
    );
}

fn injury_severity_weight_sum(injury: &serde_json::Value) -> f64 {
    injury
        .get("history")
        .and_then(|h| h.as_array())
        .map(|arr| {
            arr.iter()
                .map(|h| crate::sim::injury::severity_weight(h.get("심각도").and_then(|v| v.as_str()).unwrap_or("경미")))
                .sum()
        })
        .unwrap_or(0.0)
}

/// `match_sim::simulate_game`이 판정한 급성형 부상(`GameResult.injuries`)을
/// 해당 선수의 `npc.injury`에 기록 — `record_injury`를 그대로 재사용해
/// 누적형(process_week)과 동일한 재발 승격·복귀일 규칙을 따른다.
pub(crate) fn apply_injury_events(conn: &Connection, injuries: &[match_sim::InjuryEvent], day: i64) -> anyhow::Result<()> {
    for event in injuries {
        let injury_raw: Option<String> = conn
            .query_row("SELECT injury FROM npc WHERE id = ?1", [&event.player_id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten();
        let mut injury: serde_json::Value = injury_raw
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({"current": null, "history": []}));
        record_injury(&mut injury, event.part, event.severity, day);
        conn.execute("UPDATE npc SET injury = ?1 WHERE id = ?2", params![injury.to_string(), event.player_id])?;
    }
    Ok(())
}

/// 회복일이 지난 부상을 완치 처리 — `current`를 `null`로(사고 이력인
/// `history`는 그대로 유지). NPC(`process_week`, 치료 자동 "재활")·주인공
/// (`process_protagonist_week`, 치료 직접 선택) 양쪽 다 "복귀일이 되면
/// current가 비워진다"는 전제를 공유해 함수 하나로 처리한다.
fn clear_healed_injury(injury: &mut serde_json::Value, day: i64) {
    let healed = injury
        .get("current")
        .filter(|c| !c.is_null())
        .and_then(|c| c.get("return_day"))
        .and_then(|v| v.as_i64())
        .is_some_and(|return_day| day >= return_day);
    if healed {
        injury["current"] = serde_json::Value::Null;
    }
}

fn update_protagonist_injury(conn: &Connection, injury: &serde_json::Value) -> anyhow::Result<()> {
    conn.execute("UPDATE protagonist SET injury = ?1 WHERE id = 'proto:1'", params![injury.to_string()])?;
    Ok(())
}

/// 주인공 부상 발생 — [08_부상_시스템](../../02_기획/육성코어/08_부상_시스템.md)
/// §4. NPC용 `apply_injury_events`(항상 "재활" 자동 확정)와 달리 실제
/// 의사결정 주체(플레이어)가 있어 `치료`를 `null`로 남기고 `injuryTreatment`
/// PendingAction을 만들어 §4 세 옵션 중 하나를 직접 고르게 한다. 이미
/// 처리 중인 부상(`current`가 `null`이 아님 — 치료 미선택 또는 회복 중)이
/// 있으면 새 판정을 스킵 — 이중 부상과 PendingAction 중복 생성을 함께
/// 막는다.
pub fn apply_injury(conn: &Connection, part: &str, severity: &str, day: i64) -> anyhow::Result<()> {
    let injury_raw: String = conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut injury: serde_json::Value = serde_json::from_str(&injury_raw)?;
    if !injury.get("current").map(serde_json::Value::is_null).unwrap_or(true) {
        return Ok(());
    }

    record_injury(&mut injury, part, severity, day);
    injury["current"]["치료"] = serde_json::Value::Null;
    update_protagonist_injury(conn, &injury)?;

    // 부상으로 인한 강제 은퇴(§3) — 누적 심각도가 재기불가 기준을 넘기면
    // 치료 선택지 없이 곧장 은퇴로 확정한다.
    if crate::sim::retirement::is_forced_retirement_from_injury(injury_severity_weight_sum(&injury)) {
        return mark_protagonist_retired(conn, day, "injury");
    }

    let final_severity = injury["current"]["심각도"].as_str().unwrap_or(severity).to_string();
    let payload = serde_json::json!({"부위": part, "심각도": final_severity, "day": day}).to_string();
    conn.execute(
        "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'injuryTreatment', 'urgent', ?2, ?3)",
        params![format!("injury:{day}"), day, payload],
    )?;
    Ok(())
}

/// `injuryTreatment` PendingAction 응답 처리 — §4 세 치료 옵션의 트레이드
/// 오프(이탈기간·재발위험·완치도)를 실제 수치로 확정한다. 수술은 성공률
/// <100%(§4 "합병증 리스크") — 실패 시 심각도가 `escalate_severity`로 한
/// 단계 악화. 무리한 복귀는 "재발위험 매우 높음"을 즉시 악화 판정으로
/// 표현(`sim::injury::rushed_return_aggravates`). 재활은 기준점이라 추가
/// 판정 없음.
pub fn treat(conn: &Connection, world_seed: i64, treatment: &str, day: i64) -> anyhow::Result<()> {
    if !crate::sim::injury::TREATMENTS.contains(&treatment) {
        anyhow::bail!("unknown treatment: {treatment}");
    }
    let injury_raw: String = conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut injury: serde_json::Value = serde_json::from_str(&injury_raw)?;
    let current = injury
        .get_mut("current")
        .filter(|c| !c.is_null())
        .and_then(|c| c.as_object_mut())
        .ok_or_else(|| anyhow::anyhow!("no active injury to treat"))?;

    let mut severity = current.get("심각도").and_then(|v| v.as_str()).unwrap_or("경미").to_string();
    let start_day = current.get("start_day").and_then(|v| v.as_i64()).unwrap_or(day);

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("treat:{day}")));
    let worsens = match treatment {
        "수술" => !crate::sim::injury::surgery_succeeds(&mut rng, &severity),
        "무리한 복귀" => crate::sim::injury::rushed_return_aggravates(&mut rng, &severity),
        _ => false,
    };
    if worsens {
        severity = crate::sim::injury::escalate_severity(&severity).to_string();
    }

    let return_day = start_day + crate::sim::injury::treated_recovery_days(&severity, treatment);
    current.insert("치료".to_string(), serde_json::json!(treatment));
    current.insert("심각도".to_string(), serde_json::json!(severity));
    current.insert("return_day".to_string(), serde_json::json!(return_day));

    update_protagonist_injury(conn, &injury)?;
    Ok(())
}

/// 주간 경계 — 은퇴하지 않은 전 NPC(172팀 균등원칙, 리그·팀 차별 없음)에
/// 순서대로 ①`sim::growth::apply_weekly_growth`(상승기) ②피로도 회복(주간
/// 절반 감소 placeholder)+`sim::injury::check_overuse_injury`(누적형 부상
/// 체크) ③`sim::growth::apply_aging_decline`(하락기, 방금 갱신된 부상
/// 이력을 그대로 반영)를 적용한다 — 04_성장_곡선.md §1 "상승분과 하락분의
/// 순합이 그 해 변화"를 같은 주 안에서 순서대로 실행해 자연히 만족시킨다.
/// 급성형(경기 중 우발) 부상은 `sim::match_sim`을 건드려야 하는 별도
/// 스코프라 이번엔 제외(다음 서브분 후보, 10_구현_Phase_계획.md §6-9 참고).
struct WeeklyNpcRow {
    id: String,
    team_id: String,
    position: String,
    age: i64,
    stats_raw: String,
    xp_raw: String,
    live_state_raw: String,
    injury_raw: Option<String>,
    military_return_day: Option<i64>,
}

fn process_week(conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let mut philosophy_by_team: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = content_conn.prepare("SELECT team_id, philosophy FROM team_traits")?;
        let rows: Vec<(String, String)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
        philosophy_by_team.extend(rows);
    }

    let mut stmt = conn
        .prepare("SELECT id, team_id, position, age, stats, xp, live_state, injury, military_return_day FROM npc WHERE retired = 0 AND position != '감독'")?;
    let rows: Vec<WeeklyNpcRow> = stmt
        .query_map([], |r| {
            Ok(WeeklyNpcRow {
                id: r.get(0)?,
                team_id: r.get(1)?,
                position: r.get(2)?,
                age: r.get(3)?,
                stats_raw: r.get(4)?,
                xp_raw: r.get(5)?,
                live_state_raw: r.get(6)?,
                injury_raw: r.get(7)?,
                military_return_day: r.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    drop(stmt);

    for WeeklyNpcRow { id, team_id, position, age, stats_raw, xp_raw, live_state_raw, injury_raw, mut military_return_day } in rows {
        let mut stats: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&stats_raw)?;
        let mut xp: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&xp_raw)?;
        let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
        let mut injury: serde_json::Value =
            injury_raw.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| serde_json::json!({"current": null, "history": []}));
        clear_healed_injury(&mut injury, day);

        if let Some(return_day) = military_return_day {
            if day >= return_day {
                discharge(conn, &id)?;
                military_return_day = None;
            }
        }

        if military_return_day.is_some() {
            // 복무 중 — 03_병역.md §8 "피지컬만 소폭 하락, 기술·멘탈은 안
            // 늘지도 안 줄지도 않는다": 상승기(apply_weekly_growth)·노쇠
            // (apply_aging_decline) 둘 다 건너뛰고 물리 하락만 적용.
            crate::sim::growth::apply_military_decline(&position, &mut stats);
        } else {
            let genius = stats.get("천재성").and_then(|v| v.as_f64()).unwrap_or(50.0);
            let conscientiousness = stats.get("성실함").and_then(|v| v.as_f64()).unwrap_or(50.0);
            let exposed = crate::sim::growth::exposed_stats_for(&position);

            let mut growth_rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("growth:{id}:{day}")));
            crate::sim::growth::apply_weekly_growth(&mut growth_rng, exposed, &mut stats, &mut xp, genius);

            let injury_weight = injury_severity_weight_sum(&injury);
            crate::sim::growth::apply_aging_decline(&position, age, &mut stats, injury_weight, conscientiousness);
        }

        // 피로도 회복+과사용 부상 체크는 복무 여부와 무관하게 매주 적용 —
        // 복무 중엔 경기 자체가 없어(로스터 필터로 제외) 새로 안 쌓이므로
        // 자연 감쇠만 일어남.
        let fatigue = live_state.get("피로도").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let philosophy = philosophy_by_team.get(&team_id).cloned().unwrap_or_default();
        let mut injury_rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("injury:{id}:{day}")));
        if let Some((part, severity)) = crate::sim::injury::check_overuse_injury(&mut injury_rng, fatigue, &philosophy) {
            record_injury(&mut injury, part, severity, day);
        }
        live_state.insert("피로도".to_string(), serde_json::Value::from(fatigue * 0.5));

        conn.execute(
            "UPDATE npc SET stats = ?1, xp = ?2, live_state = ?3, injury = ?4 WHERE id = ?5",
            params![
                serde_json::Value::Object(stats).to_string(),
                serde_json::Value::Object(xp).to_string(),
                serde_json::Value::Object(live_state).to_string(),
                injury.to_string(),
                id,
            ],
        )?;
    }
    Ok(())
}

/// I5가 채울 자리 — 월간 경계("이달의 페이스" 평가).
/// 월 단위 평가(§5-1) — `advance()`가 28일마다 호출하는 자리(내부 처리
/// 주기, 실제 달력 월과 무관 — 위 주석 참고). 이번 28일 구간 주인공
/// 등판들의 평균 등급("이달의 페이스")으로 사기를 보정한다. 팬/미디어
/// 반응 이벤트(§5-1)는 I8 콘텐츠(뉴스·이벤트)가 아직 없어 생성할
/// 콘텐츠 자체가 없음 — 이번엔 사기 보정까지만(스코프 아웃).
fn process_month(conn: &Connection, day: i64) -> anyhow::Result<()> {
    let Some(avg_grade_score) = monthly_avg_grade_score(conn, day - 27, day)? else {
        return Ok(()); // 이번 달 등판 기록이 없으면 보정하지 않는다(§5-3과 같은 결).
    };
    let live_state_raw: Option<String> =
        conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).optional()?;
    let Some(live_state_raw) = live_state_raw else {
        return Ok(());
    };
    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
    let morale = live_state.get("사기").and_then(|v| v.as_f64()).unwrap_or(50.0);
    let adjustment = crate::sim::eval::monthly_morale_adjustment(avg_grade_score);
    live_state.insert("사기".to_string(), serde_json::json!((morale + adjustment).clamp(0.0, 100.0)));
    conn.execute("UPDATE protagonist SET live_state = ?1 WHERE id = 'proto:1'", params![serde_json::Value::Object(live_state).to_string()])?;
    Ok(())
}

/// 최근 28일(§process_month) 구간 주인공 등판들의 평균 등급 점수 —
/// `game_log`엔 day 컬럼이 없어 `schedule`과 `game_id`로 조인해 필터한다.
/// `season_avg_grade_score`와 달리 등판 기록이 없으면 중간값(2.0)이
/// 아니라 `None`을 반환 — "이번 달엔 안 던졌다"는 사기 보정 자체를
/// 스킵할 신호이지, 부진(C)으로 칠 근거가 아니기 때문이다.
fn monthly_avg_grade_score(conn: &Connection, from_day: i64, to_day: i64) -> anyhow::Result<Option<f64>> {
    let mut stmt = conn.prepare("SELECT gl.detail FROM game_log gl JOIN schedule s ON gl.game_id = s.game_id WHERE s.day BETWEEN ?1 AND ?2")?;
    let details: Vec<String> = stmt.query_map(params![from_day, to_day], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let scores: Vec<f64> = details
        .iter()
        .filter_map(|d| serde_json::from_str::<serde_json::Value>(d).ok())
        .filter_map(|v| v.get("grade").and_then(|g| g.as_str()).map(crate::sim::market::grade_score))
        .collect();
    if scores.is_empty() {
        return Ok(None);
    }
    Ok(Some(scores.iter().sum::<f64>() / scores.len() as f64))
}

/// 이번 시즌 game_log에 남은 등급들의 평균 점수 — 06_시장_계약.md §1
/// "종합지표"의 "평가등급 누적" 입력. 등판 기록이 없으면(FA 대기 중 등)
/// 중간값(C, 2.0)으로 취급 — 평가받을 기회 자체가 없었던 걸 F로 벌주지
/// 않기 위함.
fn season_avg_grade_score(conn: &Connection, season: i64) -> anyhow::Result<f64> {
    let mut stmt = conn.prepare("SELECT detail FROM game_log WHERE season = ?1")?;
    let details: Vec<String> = stmt.query_map([season], |r| r.get(0))?.collect::<Result<_, _>>()?;
    if details.is_empty() {
        return Ok(2.0);
    }
    let scores: Vec<f64> = details
        .iter()
        .filter_map(|d| serde_json::from_str::<serde_json::Value>(d).ok())
        .filter_map(|v| v.get("grade").and_then(|g| g.as_str()).map(crate::sim::market::grade_score))
        .collect();
    if scores.is_empty() {
        return Ok(2.0);
    }
    Ok(scores.iter().sum::<f64>() / scores.len() as f64)
}

/// 주인공 은퇴 확정 — [05_히스토리_엔딩](../../../02_기획/05_히스토리_엔딩.md)
/// §3 세 트리거(`voluntary`|`decline`|`injury`) 전부 이 함수 하나로
/// 수렴한다. 남은 진행형 협상(`game`/`pitch` 제외 — 진행 중인 매치는
/// 건드리지 않음)은 은퇴하는 마당에 더 이상 의미가 없어 전부 정리하고,
/// `retirement` PendingAction 하나로 대체해 UI가 은퇴 화면으로 안내한다.
fn mark_protagonist_retired(conn: &Connection, day: i64, reason: &str) -> anyhow::Result<()> {
    conn.execute("UPDATE protagonist SET retired = 1, retirement_reason = ?1 WHERE id = 'proto:1'", params![reason])?;
    conn.execute("DELETE FROM pending_actions WHERE type NOT IN ('game', 'pitch')", [])?;
    conn.execute(
        "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'retirement', 'urgent', ?2, ?3)",
        params![format!("retirement:{day}"), day, serde_json::json!({"reason": reason}).to_string()],
    )?;
    log_career_event(conn, day, current_season_value(conn)?, "retirement", serde_json::json!({"reason": reason}))?;
    Ok(())
}

/// 자발적 은퇴(§3 "플레이어가 원하는 시점에 언제든 직접 선택") — 다른 두
/// 트리거(노쇠·부상)와 달리 시즌 경계가 아니라 플레이어가 임의 시점에
/// 직접 호출한다. 이미 은퇴한 상태면 멱등하게 무시.
pub fn declare_protagonist_retirement(conn: &Connection, day: i64) -> anyhow::Result<()> {
    let retired: Option<i64> = conn.query_row("SELECT retired FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).optional()?;
    if retired == Some(1) {
        return Ok(());
    }
    mark_protagonist_retired(conn, day, "voluntary")
}

/// `game_log`를 통산 집계한 결과 — 은퇴 화면 "통산 기록 대시보드"
/// (05_히스토리_엔딩.md §4)와 커리어 타임라인(시즌별)의 공통 입력.
/// decision·strikeouts·innings_pitched는 이번 서브분에서 처음 기록되기
/// 시작한 필드라(구세이브·합성 테스트 game_log 행엔 없을 수 있음) 전부
/// `unwrap_or` 기본값으로 방어적으로 읽는다.
pub struct CareerLine {
    pub games: i64,
    pub wins: i64,
    pub losses: i64,
    pub no_decisions: i64,
    pub strikeouts: i64,
    pub innings_pitched: i64,
    pub runs_allowed: i64,
}

impl CareerLine {
    pub fn era(&self) -> f64 {
        if self.innings_pitched == 0 {
            0.0
        } else {
            self.runs_allowed as f64 * 9.0 / self.innings_pitched as f64
        }
    }
}

pub fn aggregate_game_log(conn: &Connection, season: Option<i64>) -> anyhow::Result<CareerLine> {
    let details: Vec<String> = match season {
        Some(s) => {
            let mut stmt = conn.prepare("SELECT detail FROM game_log WHERE season = ?1")?;
            let rows = stmt.query_map([s], |r| r.get(0))?.collect::<Result<_, _>>()?;
            rows
        }
        None => {
            let mut stmt = conn.prepare("SELECT detail FROM game_log")?;
            let rows = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            rows
        }
    };

    let mut line = CareerLine { games: 0, wins: 0, losses: 0, no_decisions: 0, strikeouts: 0, innings_pitched: 0, runs_allowed: 0 };
    for raw in details {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else { continue };
        line.games += 1;
        match v.get("decision").and_then(|d| d.as_str()) {
            Some("승") => line.wins += 1,
            Some("패") => line.losses += 1,
            _ => line.no_decisions += 1,
        }
        line.strikeouts += v.get("strikeouts").and_then(|x| x.as_i64()).unwrap_or(0);
        line.innings_pitched += v.get("innings_pitched").and_then(|x| x.as_i64()).unwrap_or(0);
        line.runs_allowed += v.get("runs_allowed").and_then(|x| x.as_i64()).unwrap_or(0);
    }
    Ok(line)
}

/// 시즌 경계 은퇴 판정(§3 "노쇠·방출 압박"·"부상으로 인한 강제 은퇴") —
/// 자발적 은퇴는 `declare_protagonist_retirement`가 별도로 처리한다.
/// 나이 트래킹이 없는 행(구세이브·합성 테스트)은 노쇠 판정을 스킵 —
/// `process_protagonist_career_path`(§6-26)와 같은 방어 원칙.
fn check_decline_retirement(conn: &Connection, rng: &mut ChaCha8Rng, day: i64, age: Option<i64>, avg_grade_score: f64) -> anyhow::Result<bool> {
    let Some(age) = age else { return Ok(false) };
    if crate::sim::retirement::is_forced_retirement_from_decline(rng, age, avg_grade_score) {
        mark_protagonist_retired(conn, day, "decline")?;
        return Ok(true);
    }
    Ok(false)
}

/// FA 오퍼 — 프로·독립 소속 팀(§1 "적용 범위") 중 `exclude_team`을 뺀
/// 후보에서 `sim::market::fa_offer_count`개를 랜덤 추첨해 팀별 자원 축으로
/// 초기 제안액을 계산한다(§3-3 "여러 구단이 오퍼 제시").
fn build_fa_offers(
    rng: &mut ChaCha8Rng,
    content_conn: &Connection,
    exclude_team: &str,
    previous_salary: i64,
    avg_grade_score: f64,
    attention: f64,
) -> anyhow::Result<Vec<(String, i64, i64)>> {
    let mut stmt = content_conn.prepare(
        "SELECT teams.id, team_traits.resource FROM teams JOIN team_traits ON teams.id = team_traits.team_id
         WHERE teams.league_id IN ('league:pro', 'league:independent') AND teams.id != ?1",
    )?;
    let candidates: Vec<(String, String)> = stmt.query_map([exclude_team], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    if candidates.is_empty() {
        return Ok(vec![]);
    }
    let count = crate::sim::market::fa_offer_count(rng).min(candidates.len());
    Ok(candidates
        .choose_multiple(rng, count)
        .map(|(team_id, resource)| {
            let salary = crate::sim::market::initial_offer(previous_salary, avg_grade_score, attention, resource);
            (team_id.clone(), salary, crate::sim::market::offer_years(rng))
        })
        .collect())
}

fn push_contract_nego(conn: &Connection, day: i64, kind: &str, offers: &[(String, i64, i64)]) -> anyhow::Result<()> {
    if offers.is_empty() {
        return Ok(()); // 후보 팀이 하나도 없는 경우(합성 테스트 등) — 실제 172팀 데이터에선 사실상 안 일어남
    }
    let offers_json: Vec<serde_json::Value> =
        offers.iter().map(|(team_id, salary, years)| serde_json::json!({"team_id": team_id, "salary": salary, "years": years})).collect();
    let payload = serde_json::json!({"kind": kind, "offers": offers_json}).to_string();
    conn.execute(
        "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'contractNego', 'urgent', ?2, ?3)",
        params![format!("contract:{day}"), day, payload],
    )?;
    Ok(())
}

/// 방출·재계약·FA 판정 — 06_시장_계약.md §1(방출)·§2(재계약)·§3(FA).
/// **적용 범위는 프로·독립 소속뿐**(§1) — 고교·대학 소속(아마추어)이거나
/// 아직 한 번도 프로에 진입한 적 없으면(`team_id`도 `status`도 없음)
/// 조용히 스킵한다. 실제 "고교→프로 진입"(드래프트 등) 경로는
/// 01_커리어_구조.md §5 진로 갈림길 스코프라 아직 없음 — 이 함수는 주인공이
/// **이미 프로/독립 계약 상태라고 가정**하고 그 이후의 방출·재계약·FA
/// 순환만 담당한다(10_구현_Phase_계획.md §6-19 스코프 판단 참고).
///
/// "경고"(§1-1, 7월말 트레이드데드라인) 단계는 캘린더에 그 지점이 아직
/// 없어 생략 — 시즌종료 시점의 최종판정만 구현. 방출되면 `team_id`를
/// `null`로 비우고 `status="FA"`를 남겨 이번 시즌 즉시 FA 오퍼를 띄운다
/// (§1-2 "다른 구단과 FA 계약"). 계약 만료(`years_remaining<=0`)면
/// 재계약 오퍼(현 소속팀 1개)를 띄운다. 이미 `status="FA"`인 채로
/// 남아있으면(전 시즌에 아무 오퍼도 안 받아들였음) 오퍼를 다시 생성해
/// 매 시즌 재도전 기회를 준다 — 그렇지 않으면 한 번 거절한 뒤 영원히
/// 시장에서 사라지는 막다른 상태가 된다.
fn process_protagonist_contract(conn: &Connection, content_conn: &Connection, world_seed: i64, season: i64, day: i64) -> anyhow::Result<()> {
    let row: Option<(String, String, Option<i64>)> = conn
        .query_row("SELECT contract, live_state, age FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?;
    let Some((contract_raw, live_state_raw, age)) = row else {
        return Ok(()); // 아직 캐릭터 생성 전
    };
    let mut contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let team_id_opt = contract.get("team_id").and_then(|v| v.as_str()).map(str::to_string);
    let status = contract.get("status").and_then(|v| v.as_str()).map(str::to_string);

    let avg_grade_score = season_avg_grade_score(conn, season)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    let attention = live_state.get("주목도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let salary = contract.get("salary").and_then(|v| v.as_i64()).unwrap_or(3000);
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("market:{day}")));

    let Some(team_id) = team_id_opt else {
        if status.as_deref() == Some("FA") {
            // 노쇠·방출 압박 은퇴(05_히스토리_엔딩.md §3) — FA 오퍼를 다시
            // 띄우기 직전에 먼저 판정한다: "구단들이 다음 시즌 계약을 안
            // 해주는 상황"을 오퍼 0개가 아니라 은퇴 트리거로 직접 표현.
            if check_decline_retirement(conn, &mut rng, day, age, avg_grade_score)? {
                return Ok(());
            }
            let offers = build_fa_offers(&mut rng, content_conn, "", salary, avg_grade_score, attention)?;
            push_contract_nego(conn, day, "FA", &offers)?;
        }
        return Ok(()); // status도 없으면 프로 진입 이력 자체가 없는 아마추어 — 스코프 밖
    };

    let league_id: Option<String> = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [&team_id], |r| r.get(0)).optional()?;
    if !matches!(league_id.as_deref(), Some("league:pro") | Some("league:independent")) {
        return Ok(()); // 아마추어(고교·대학) 소속 — §1 적용 범위 밖
    }

    let resource: String =
        content_conn.query_row("SELECT resource FROM team_traits WHERE team_id = ?1", [&team_id], |r| r.get(0)).optional()?.unwrap_or_default();

    if crate::sim::market::is_released(&mut rng, avg_grade_score, salary, &resource) {
        // 방출당하는 시점에도 노쇠 은퇴를 먼저 판정 — 나이 든 저성과자가
        // 방출되면 그대로 FA 시장을 떠도는 대신 은퇴로 이어지는 경우가
        // 서사적으로 자연스럽다(§3 "노쇠·방출 압박").
        if check_decline_retirement(conn, &mut rng, day, age, avg_grade_score)? {
            return Ok(());
        }

        contract["team_id"] = serde_json::Value::Null;
        contract["status"] = serde_json::json!("FA");
        conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;

        let detail = serde_json::json!({"event": "release", "team_id": team_id, "salary": salary}).to_string();
        conn.execute(
            "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, ?2, 'contract', ?3)",
            params![format!("txn:contract:{day}"), day, detail],
        )?;

        let offers = build_fa_offers(&mut rng, content_conn, &team_id, salary, avg_grade_score, attention)?;
        push_contract_nego(conn, day, "FA", &offers)?;
        return Ok(());
    }

    let years_remaining = contract.get("years_remaining").and_then(|v| v.as_i64()).unwrap_or(1);
    if years_remaining <= 0 {
        let offer_salary = crate::sim::market::initial_offer(salary, avg_grade_score, attention, &resource);
        push_contract_nego(conn, day, "재계약", &[(team_id, offer_salary, crate::sim::market::offer_years(&mut rng))])?;
        return Ok(());
    }

    contract["years_remaining"] = serde_json::json!(years_remaining - 1);
    conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;
    Ok(())
}

/// 협상 결렬 처리 — §2-1 "최종 타결 또는 결렬(결렬 시 FA)". 재계약이었든
/// (여전히 옛 팀 소속으로 남아있던 상태) FA였든(이미 `team_id: null`) 상관
/// 없이 `team_id`를 비우고 `status: "FA"`를 남긴다 — 다음 시즌
/// `process_protagonist_contract`가 이 상태를 보고 새 오퍼를 다시 띄운다.
/// 기존 `salary` 필드는 그대로 남겨 다음 오퍼 계산의 기준액으로 재사용.
fn mark_contract_unsigned(conn: &Connection) -> anyhow::Result<()> {
    let raw: String = conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut contract: serde_json::Value = serde_json::from_str(&raw)?;
    contract["team_id"] = serde_json::Value::Null;
    contract["status"] = serde_json::json!("FA");
    conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;
    Ok(())
}

/// `contractNego` PendingAction 응답 처리 — `choice_id`는
/// `"accept:team_id"` | `"counter:team_id:금액"` | `"reject"`. 역제안은
/// §2-1의 "반복(라운드 상한 있음)"을 라운드 상한 1회로 단순화해 그 자리에서
/// 바로 수락/거절이 확정된다(`sim::market::counter_offer_accepted`).
fn resolve_contract_nego(conn: &Connection, content_conn: &Connection, world_seed: i64, payload_raw: &str, choice_id: &str, day: i64) -> anyhow::Result<()> {
    if choice_id == "reject" {
        return mark_contract_unsigned(conn);
    }

    let payload: serde_json::Value = serde_json::from_str(payload_raw)?;
    let offers = payload.get("offers").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let (action, rest) = choice_id.split_once(':').ok_or_else(|| anyhow::anyhow!("expected 'accept:team_id' or 'counter:team_id:amount', got {choice_id}"))?;
    let (team_id, requested): (&str, Option<i64>) = match action {
        "accept" => (rest, None),
        "counter" => {
            // team_id 자체가 콜론을 포함하므로(예: "team:rich_a") 마지막 콜론을
            // 기준으로 잘라야 금액만 분리된다.
            let (team_id, amount) =
                rest.rsplit_once(':').ok_or_else(|| anyhow::anyhow!("expected 'counter:team_id:amount', got {choice_id}"))?;
            (team_id, Some(amount.parse()?))
        }
        _ => anyhow::bail!("unknown contractNego choice: {choice_id}"),
    };

    let offer = offers
        .iter()
        .find(|o| o.get("team_id").and_then(|v| v.as_str()) == Some(team_id))
        .ok_or_else(|| anyhow::anyhow!("no offer from team {team_id} in this negotiation"))?;
    let offer_salary = offer.get("salary").and_then(|v| v.as_i64()).unwrap_or(0);
    let years = offer.get("years").and_then(|v| v.as_i64()).unwrap_or(1);

    let final_salary = match requested {
        None => offer_salary,
        Some(requested) => {
            let resource: String =
                content_conn.query_row("SELECT resource FROM team_traits WHERE team_id = ?1", [team_id], |r| r.get(0)).optional()?.unwrap_or_default();
            let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("counter:{day}")));
            if crate::sim::market::counter_offer_accepted(&mut rng, offer_salary, requested, &resource) {
                requested
            } else {
                return mark_contract_unsigned(conn); // 역제안 거절 — 결렬(§2-1) → FA
            }
        }
    };

    let contract = serde_json::json!({"team_id": team_id, "salary": final_salary, "years_remaining": years});
    conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;

    let negotiation_kind = payload.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let detail = serde_json::json!({"event": "sign", "team_id": team_id, "salary": final_salary, "years": years, "negotiation_kind": negotiation_kind}).to_string();
    conn.execute(
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, ?2, 'contract', ?3)",
        params![format!("txn:contract:{day}"), day, detail],
    )?;
    Ok(())
}

/// 주인공 트레이드 판정 — 06_시장_계약.md §4-1(선수대선수)·§4-2(현금
/// 트레이드)·§4-3(노트레이드 조항). `process_protagonist_contract`가 이번
/// 시즌 `contractNego`를 하나도 안 띄운 경우(방출도 재계약만료도 아니고
/// 계약이 그대로 유지된 경우)에만 호출돼야 한다 — season_rollover가 그
/// 순서를 보장한다. 이미 협상 중(방출→FA, 재계약만료)인 선수를 같은
/// 시즌에 또 트레이드하면 안 되므로, 함수 자체도 `pending_actions`에
/// `contractNego`가 있으면 방어적으로 스킵한다.
///
/// **적용 범위는 §1과 동일하게 프로·독립 소속뿐.** "노쇠기"(§4-2 발생
/// 조건)는 주인공 나이 트래킹이 없어(01_커리어_구조.md §5 진로 갈림길과
/// 함께 후속 스코프, §6-19에서 이미 확정한 것과 같은 제약) 반영 못 함 —
/// 연봉 부담만으로 근사(`sim::market::cash_trade_probability`). "받는 쪽
/// NPC"(§4-1의 교환 상대)는 실제 로스터를 조작하지 않는다 — 문서가
/// 정확한 가치매칭 규칙을 정의하지 않았고, 주인공 1인칭 시점에서는
/// "누구와 트레이드됐다"는 결과가 중요하지 배경 로스터 균형은 크리티컬
/// 하지 않아 통보용 텍스트(`counterpart`)로만 남긴다. `no_trade_clause`
/// 필드는 지원하지만 그 조항을 **요청하는 협상 인터랙션은 이번 스코프에
/// 없음**(§2 계약 오퍼에 이 옵션이 없음) — 필드 존재·소비 로직만 갖추고
/// 실제로 채워 넣는 건 테스트·수동설정 전용.
fn process_protagonist_trade(conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let already_negotiating: i64 = conn.query_row("SELECT count(*) FROM pending_actions WHERE type = 'contractNego'", [], |r| r.get(0))?;
    if already_negotiating > 0 {
        return Ok(());
    }

    let row: Option<String> = conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).optional()?;
    let Some(contract_raw) = row else {
        return Ok(()); // 아직 캐릭터 생성 전
    };
    let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let Some(team_id) = contract.get("team_id").and_then(|v| v.as_str()).map(str::to_string) else {
        return Ok(()); // 무소속 — 트레이드 대상 아님
    };

    let league_id: Option<String> = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [&team_id], |r| r.get(0)).optional()?;
    if !matches!(league_id.as_deref(), Some("league:pro") | Some("league:independent")) {
        return Ok(()); // 아마추어 소속 — §1과 동일하게 적용 범위 밖
    }

    let resource: String =
        content_conn.query_row("SELECT resource FROM team_traits WHERE team_id = ?1", [&team_id], |r| r.get(0)).optional()?.unwrap_or_default();
    let salary = contract.get("salary").and_then(|v| v.as_i64()).unwrap_or(3000);

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("trade:{day}")));
    let is_cash = rng.gen_bool(crate::sim::market::cash_trade_probability(salary, &resource));
    let is_player = !is_cash && rng.gen_bool(crate::sim::market::trade_probability(&resource));
    if !is_cash && !is_player {
        return Ok(());
    }

    let mut stmt = content_conn.prepare("SELECT id FROM teams WHERE league_id IN ('league:pro', 'league:independent') AND id != ?1")?;
    let candidates: Vec<String> = stmt.query_map([&team_id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    drop(stmt);
    let Some(to_team) = candidates.choose(&mut rng) else {
        return Ok(()); // 갈 곳이 없음(합성 테스트 등) — 실제 172팀 데이터에선 사실상 안 일어남
    };

    let counterpart = if is_cash {
        None
    } else {
        let mut stmt = conn.prepare("SELECT id FROM npc WHERE team_id = ?1 AND retired = 0 AND position != '감독'")?;
        let npcs: Vec<String> = stmt.query_map([to_team], |r| r.get(0))?.collect::<Result<_, _>>()?;
        npcs.choose(&mut rng).cloned()
    };

    let no_trade_clause = contract.get("no_trade_clause").and_then(|v| v.as_bool()).unwrap_or(false);
    let payload = serde_json::json!({
        "from_team_id": team_id,
        "to_team_id": to_team,
        "kind": if is_cash { "현금" } else { "선수" },
        "counterpart": counterpart,
        "can_reject": no_trade_clause,
    })
    .to_string();
    conn.execute(
        "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'tradeDecision', 'urgent', ?2, ?3)",
        params![format!("trade:{day}"), day, payload],
    )?;
    Ok(())
}

/// `tradeDecision` PendingAction 응답 처리 — §4-3 "조항이 있으면 트레이드
/// 거부 가능, 없으면 구단 결정에 따름". `payload.can_reject`가 `false`인데
/// `"reject"`를 보내면 에러(거부권이 없다는 걸 UI가 먼저 걸러야 하는
/// 잘못된 상호작용). `"accept"`(노트레이드 조항이 있어 수락한 경우든,
/// 조항이 없어 사실상 강제인 경우든)면 계약의 `team_id`만 새 팀으로
/// 바꾼다(연봉·잔여연수는 그대로 승계 — 실제 트레이드도 계약은 대개
/// 그대로 넘어감) 후 `league_transactions`에 `'trade'`로 기록한다.
fn resolve_trade_decision(conn: &Connection, payload_raw: &str, choice_id: &str, day: i64) -> anyhow::Result<()> {
    let payload: serde_json::Value = serde_json::from_str(payload_raw)?;
    let can_reject = payload.get("can_reject").and_then(|v| v.as_bool()).unwrap_or(false);

    if choice_id == "reject" {
        if !can_reject {
            anyhow::bail!("no-trade clause not present — this trade cannot be rejected");
        }
        return Ok(()); // 노트레이드 조항으로 거부 — 계약 그대로 유지
    }
    if choice_id != "accept" {
        anyhow::bail!("unknown tradeDecision choice: {choice_id}");
    }

    let to_team = payload.get("to_team_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("trade payload missing to_team_id"))?;

    let contract_raw: String = conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let from_team = contract.get("team_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    contract["team_id"] = serde_json::json!(to_team);
    conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;

    let detail = serde_json::json!({"player": "proto:1", "from": from_team, "to": to_team}).to_string();
    conn.execute(
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, ?2, 'trade', ?3)",
        params![format!("txn:trade:{day}"), day, detail],
    )?;
    Ok(())
}

/// 후보 팀 중 무작위 하나(리그 필터) — 드래프트 지명팀·대학/독립 진학·
/// 병역 만료 후 독립 재도전 배정에 공용으로 쓴다.
fn pick_random_team_in_league(content_conn: &Connection, rng: &mut ChaCha8Rng, league_id: &str) -> anyhow::Result<Option<String>> {
    let mut stmt = content_conn.prepare("SELECT id FROM teams WHERE league_id = ?1")?;
    let teams: Vec<String> = stmt.query_map([league_id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(crate::sim::career::pick_team(rng, &teams).cloned())
}

/// 병역 복무 만료 체크 — [01_커리어_구조](../../02_기획/01_커리어_구조.md)
/// §5 "입대(병역) → ~2년 병역 조기 이행". 복무가 끝나면 독립리그
/// 재도전으로 자동 복귀시킨다(06_시장_계약.md §1-2 "독립리그 재도전"과
/// 같은 결 — 병역 조기 이행 후 다시 실전에 뛰어드는 경로가 자연스럽다는
/// 판단). `careerChoice`를 다시 띄우는 대신 자동 배정한 이유: 프로 지명
/// 창구(고교 3학년 드래프트)는 이미 지났고, 남은 선택지 중 "대학"은
/// 병역을 마친 나이대엔 서사적으로 안 맞아 굳이 다시 물을 필요가 없다고
/// 판단했다.
fn process_protagonist_military_discharge(conn: &Connection, content_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let return_day: Option<i64> = conn
        .query_row("SELECT military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| r.get::<_, Option<i64>>(0))
        .optional()?
        .flatten();
    let Some(return_day) = return_day else {
        return Ok(());
    };
    if day < return_day {
        return Ok(());
    }

    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("discharge:{day}")));
    let team = pick_random_team_in_league(content_conn, &mut rng, "league:independent")?;
    let contract = serde_json::json!({"team_id": team});
    conn.execute("UPDATE protagonist SET contract = ?1, military_return_day = NULL WHERE id = 'proto:1'", params![contract.to_string()])?;
    log_career_event(conn, day, current_season_value(conn)?, "military_discharge", serde_json::json!({"team_id": team}))?;
    Ok(())
}

/// 갈림길 A — [01_커리어_구조](../../02_기획/01_커리어_구조.md) §5,
/// [02_아마_고교](../../02_기획/02_아마_고교.md) §D·E. 고교 3학년 시즌이
/// 끝나는 시점(나이 `HS_GRADUATION_AGE`=20세 도달)에 드래프트 판정 —
/// 지명되면 자동으로 프로 계약까지 확정하고 `draft` PendingAction으로
/// 통보만(§D "지명 → 프로", 거부 개념 없음), 미지명이면 `careerChoice`
/// PendingAction으로 나머지 3경로(대학/독립/입대)를 플레이어가 직접
/// 고르게 한다. **`age`가 NULL이면(이 서브분 이전 세이브·나이 트래킹
/// 없는 합성 테스트) 전부 스킵** — 방어적 설계.
fn process_protagonist_career_path(conn: &Connection, content_conn: &Connection, world_seed: i64, season: i64, day: i64) -> anyhow::Result<()> {
    let row: Option<(Option<i64>, String, String)> = conn
        .query_row("SELECT age, contract, live_state FROM protagonist WHERE id = 'proto:1'", [], |r| {
            Ok((r.get::<_, Option<i64>>(0)?, r.get(1)?, r.get(2)?))
        })
        .optional()?;
    let Some((age, contract_raw, live_state_raw)) = row else {
        return Ok(());
    };
    let Some(age) = age else {
        return Ok(());
    };

    let new_age = age + 1;
    conn.execute("UPDATE protagonist SET age = ?1 WHERE id = 'proto:1'", params![new_age])?;

    if new_age != crate::sim::career::HS_GRADUATION_AGE {
        return Ok(());
    }

    let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let Some(team_id) = contract.get("team_id").and_then(|v| v.as_str()) else {
        return Ok(()); // 무소속(방출·병역 중 등) — 갈림길 A는 고교 재학 중에만 적용
    };
    let league_id: Option<String> = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [team_id], |r| r.get(0)).optional()?;
    if league_id.as_deref() != Some("league:hs") {
        return Ok(()); // 이미 다른 리그로 넘어간 상태(중복 트리거 방지)
    }

    let avg_grade_score = season_avg_grade_score(conn, season)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    let attention = live_state.get("주목도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("draft:{day}")));

    if crate::sim::career::is_drafted(&mut rng, avg_grade_score, attention) {
        let Some(drafted_team) = pick_random_team_in_league(content_conn, &mut rng, "league:pro")? else {
            return Ok(());
        };
        let salary = crate::sim::career::draft_initial_salary(avg_grade_score, attention);
        let new_contract = serde_json::json!({"team_id": drafted_team, "salary": salary, "years_remaining": 2});
        conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![new_contract.to_string()])?;

        let payload = serde_json::json!({"drafted": true, "team_id": drafted_team, "salary": salary}).to_string();
        conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'draft', 'urgent', ?2, ?3)",
            params![format!("draft:{day}"), day, payload],
        )?;
        log_career_event(conn, day, season, "career_choice", serde_json::json!({"choice": "프로", "team_id": drafted_team, "salary": salary}))?;
    } else {
        let payload = serde_json::json!({"drafted": false, "options": ["대학", "독립", "입대"]}).to_string();
        conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'careerChoice', 'urgent', ?2, ?3)",
            params![format!("career:{day}"), day, payload],
        )?;
    }
    Ok(())
}

/// 대학·독립 재적 중 매년 드래프트 신청 — [02_아마_고교](../../02_기획/02_아마_고교.md)
/// §D(2026-07-21 정정: "대학4년/독립 시점"이 아니라 재적 중 매 시즌
/// 신청 가능). 위 `process_protagonist_career_path`(고교 3학년 나이
/// 게이트)와 달리 나이가 아니라 **현재 소속 리그**로만 게이팅한다 —
/// 대학·독립 재적 중이면 몇 년째든 매 시즌 롤오버마다 지명 여부를
/// 판정한다. 판정식(주목도·평가등급→확률, 팀 배정)은 고교 드래프트와
/// 완전히 동일한 로직을 재사용 — "재도전"이라고 판정 방식이 다를 이유가
/// 없다. RNG 시드 접두사(`redraft:`)를 고교 드래프트(`draft:`)와
/// 분리해 pending_actions id 충돌을 원천 차단한다. 미지명이어도
/// `careerChoice`를 다시 띄우지 않는다 — 대학/독립 소속을 그대로
/// 유지하며 내년에 이 함수가 다시 자동으로 재도전을 판정하기 때문에
/// 새로 고를 경로 자체가 없다.
fn process_amateur_annual_redraft(conn: &Connection, content_conn: &Connection, world_seed: i64, season: i64, day: i64) -> anyhow::Result<()> {
    let row: Option<(String, String)> =
        conn.query_row("SELECT contract, live_state FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    let Some((contract_raw, live_state_raw)) = row else {
        return Ok(());
    };
    let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let Some(team_id) = contract.get("team_id").and_then(|v| v.as_str()) else {
        return Ok(());
    };
    let league_id: Option<String> = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [team_id], |r| r.get(0)).optional()?;
    if league_id.as_deref() != Some("league:univ") && league_id.as_deref() != Some("league:independent") {
        return Ok(());
    }

    let avg_grade_score = season_avg_grade_score(conn, season)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    let attention = live_state.get("주목도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("redraft:{day}")));

    if crate::sim::career::is_drafted(&mut rng, avg_grade_score, attention) {
        let Some(drafted_team) = pick_random_team_in_league(content_conn, &mut rng, "league:pro")? else {
            return Ok(());
        };
        let salary = crate::sim::career::draft_initial_salary(avg_grade_score, attention);
        let new_contract = serde_json::json!({"team_id": drafted_team, "salary": salary, "years_remaining": 2});
        conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![new_contract.to_string()])?;

        let payload = serde_json::json!({"drafted": true, "team_id": drafted_team, "salary": salary}).to_string();
        conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'draft', 'urgent', ?2, ?3)",
            params![format!("redraft:{day}"), day, payload],
        )?;
        log_career_event(conn, day, season, "career_choice", serde_json::json!({"choice": "프로", "team_id": drafted_team, "salary": salary, "from": league_id}))?;
    }
    Ok(())
}

/// `careerChoice` PendingAction 응답 처리 — `choice_id` ∈ {"대학","독립",
/// "입대"}(드래프트 미지명 시에만 뜨는 선택지, §E). 대학/독립은 그 리그
/// 팀 중 무작위 배정(§F "정확한 팀 선택 UI는 열린 세부" — 06_캐릭터생성
/// 처럼 지역/카드 브라우징은 후속, 이번엔 자동 배정), 입대는 병역
/// 복무를 시작시킨다(`sim::npc::MILITARY_SERVICE_DAYS` 재사용).
fn resolve_career_choice(conn: &Connection, content_conn: &Connection, world_seed: i64, choice_id: &str, day: i64) -> anyhow::Result<()> {
    let mut rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("career:{day}")));
    let season = current_season_value(conn)?;
    match choice_id {
        "대학" | "독립" => {
            let league_id = if choice_id == "대학" { "league:univ" } else { "league:independent" };
            let Some(team) = pick_random_team_in_league(content_conn, &mut rng, league_id)? else {
                anyhow::bail!("no teams found for league {league_id}");
            };
            let contract = serde_json::json!({"team_id": team});
            conn.execute("UPDATE protagonist SET contract = ?1 WHERE id = 'proto:1'", params![contract.to_string()])?;
            log_career_event(conn, day, season, "career_choice", serde_json::json!({"choice": choice_id, "team_id": team}))?;
        }
        "입대" => {
            let contract = serde_json::json!({"team_id": null, "status": "military"});
            conn.execute(
                "UPDATE protagonist SET contract = ?1, military_return_day = ?2 WHERE id = 'proto:1'",
                params![contract.to_string(), day + crate::sim::npc::MILITARY_SERVICE_DAYS],
            )?;
            log_career_event(conn, day, season, "career_choice", serde_json::json!({"choice": "입대"}))?;
        }
        _ => anyhow::bail!("unknown careerChoice: {choice_id}"),
    }
    Ok(())
}

/// 시즌 경계 — 시즌 카운터 증가, 인박스 비움(04_게임루프.md §1), **프로
/// 포스트시즌 실행**(I5 2차분 추가 — standings가 지워지기 전에 트리거),
/// **방출·재계약/FA 판정**(`process_protagonist_contract`, I6 7차분 추가),
/// **트레이드 판정**(`process_protagonist_trade`, I6 8차분 추가 — 계약
/// 처리 직후에 호출해 이미 협상 중인 선수를 또 건드리지 않게 함),
/// **병역 만료·갈림길 A 판정**(`process_protagonist_military_discharge`·
/// `process_protagonist_career_path`, I7 6차분 추가), standings를
/// **리그별로** history_standings에 압축(1차분의 "전체 뭉쳐서 순위"
/// placeholder를 이번에 리그별 정확한 순위로 개선) 후 다음 시즌을 위해
/// standings·schedule·season_stats 초기화. 로스터 세대교체·
/// 투자정산은 계속 이월.
pub fn season_rollover(conn: &Connection, content_conn: &Connection, day: i64) -> anyhow::Result<()> {
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

    let world_seed: i64 = conn.query_row("SELECT world_seed FROM meta", [], |row| row.get(0))?;
    run_pro_postseason(conn, content_conn, world_seed, day)?;

    // 방금 끝난 시즌(`current`)의 주인공 통산 집계를 커리어 타임라인에
    // 한 줄 남긴다(05_히스토리_엔딩.md §4 "커리어 타임라인 그래프") —
    // `career_history` 테이블은 I1부터 스키마만 있었고 이번에 처음 채움.
    let season_line = aggregate_game_log(conn, Some(current))?;
    let season_line_json = serde_json::json!({
        "games": season_line.games,
        "wins": season_line.wins,
        "losses": season_line.losses,
        "no_decisions": season_line.no_decisions,
        "strikeouts": season_line.strikeouts,
        "innings_pitched": season_line.innings_pitched,
        "era": season_line.era(),
    })
    .to_string();
    conn.execute(
        "INSERT INTO career_history (season, line) VALUES (?1, ?2)
         ON CONFLICT(season) DO UPDATE SET line = excluded.line",
        params![current, season_line_json],
    )?;

    process_protagonist_contract(conn, content_conn, world_seed, current, day)?;
    process_protagonist_trade(conn, content_conn, world_seed, day)?;
    process_protagonist_military_discharge(conn, content_conn, world_seed, day)?;
    process_protagonist_career_path(conn, content_conn, world_seed, current, day)?;
    process_amateur_annual_redraft(conn, content_conn, world_seed, current, day)?;

    // standings 압축 — 리그별로 묶어서(content.db team_id→league_id 조회) 순위 계산.
    let mut stmt = conn.prepare("SELECT team_id, w, l FROM standings")?;
    let rows: Vec<(String, i64, i64)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut league_by_team: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = content_conn.prepare("SELECT id, league_id FROM teams")?;
        let all: Vec<(String, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<Vec<_>, _>>()?;
        for (id, league_id) in all {
            league_by_team.insert(id, league_id);
        }
    }

    let mut by_league: HashMap<String, Vec<(String, i64, i64)>> = HashMap::new();
    for (team_id, w, l) in rows {
        let league = league_by_team.get(&team_id).cloned().unwrap_or_else(|| "unknown".to_string());
        by_league.entry(league).or_default().push((team_id, w, l));
    }

    for teams in by_league.values_mut() {
        teams.sort_by(|a, b| win_pct(b.1, b.2).partial_cmp(&win_pct(a.1, a.2)).unwrap_or(std::cmp::Ordering::Equal));
        for (i, (team_id, _, _)) in teams.iter().enumerate() {
            conn.execute(
                "INSERT INTO history_standings (season, team_id, rank) VALUES (?1, ?2, ?3)
                 ON CONFLICT(season, team_id) DO UPDATE SET rank = excluded.rank",
                params![current, team_id, i as i64 + 1],
            )?;
        }
    }

    conn.execute("DELETE FROM standings", [])?;
    conn.execute("DELETE FROM schedule", [])?;
    conn.execute("DELETE FROM season_stats", [])?;

    // NPC 세대교체(I5 8차분) — 나이 증가 → 리그별 적정연령대 기준 은퇴 판정
    // → 빈 자리 신인 충원. 01_커리어_구조.md §5의 실제 진로 갈림길(드래프트
    // 등)은 주인공 전용 서사라 스코프 밖(10_구현_Phase_계획.md §6-11) — 같은
    // 팀 안에서 은퇴→신인이 반복되는 placeholder. `league_by_team`은 위
    // standings 압축 단계에서 이미 만들어둔 걸 재사용.
    // 감독(§6-59)은 나이·은퇴·병역 생애주기 대상이 아니라 이 세대교체
    // 파이프라인 전체에서 제외한다 — position != '감독' 가드.
    conn.execute("UPDATE npc SET age = age + 1 WHERE retired = 0 AND position != '감독'", [])?;
    // 복무 중(military_return_day가 NULL이 아님)인 선수는 은퇴·입대 판정
    // 둘 다 대상에서 뺀다 — 이미 다른 생애주기 이벤트가 진행 중.
    let mut stmt =
        conn.prepare("SELECT id, team_id, age, military_served FROM npc WHERE retired = 0 AND military_return_day IS NULL AND position != '감독'")?;
    let candidates: Vec<(String, String, i64, i64)> =
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<Result<_, _>>()?;
    drop(stmt);
    for (id, team_id, age, military_served) in candidates {
        let league_id = league_by_team.get(&team_id).cloned().unwrap_or_default();
        let max_age = roster::age_range(&league_id).1;
        let mut retire_rng = ChaCha8Rng::seed_from_u64(league_sub_seed(world_seed, &format!("retire:{id}:{current}")));
        if crate::sim::npc::check_retirement(&mut retire_rng, age, max_age) {
            retire(conn, &id)?;
            continue;
        }
        // 병역(I5 8차분) — 03_병역.md §9의 강제편입 기본 경로(현역)만 재현.
        // 면제·상무는 국대 발탁·성적 상위 선발이 필요해 스코프 밖(§6-12).
        if military_served == 0 && age >= crate::sim::npc::MILITARY_MIN_AGE {
            enlist(conn, &id, day)?;
        }
    }
    generate_freshmen(conn, content_conn, world_seed, current + 1)?;

    // 시즌마다 새 정규시즌 일정을 다시 만들어야 한다 — 이 호출이 원래
    // 없어서(발견된 버그, 10_구현_Phase_계획.md §6-36 — 밸런스 하네스
    // 첫 실행에서 드러남) 첫 시즌 일정만 생기고 그 뒤로는 영원히 재생성이
    // 안 돼 시즌 2부터 어떤 경기도(배경 경기도 주인공 경기도) 안 열렸다.
    for league_id in SCHEDULED_LEAGUE_IDS {
        generate_schedule(conn, content_conn, world_seed, league_id, current + 1, day + 1)?;
    }

    Ok(())
}

/// 정지 조건(새 PendingAction, 주인공 경기)이 한 번도 안 걸리면 advance()가
/// 무한 루프에 빠진다 — 지금(I5 이전)은 process_day/week/month가 전부
/// no-op이고 주인공도 없어서 실제로 이 경로를 탄다. 안전장치로 한 시즌
/// 분량만큼만 내부 전진하고, 그래도 안 멈추면 빈 목록을 반환해 호출자에게
/// 제어를 돌려준다. 실제 콘텐츠(I5 일정·이벤트)가 들어오면 정지점이 훨씬
/// 자주 걸려 이 캡은 사실상 발동 안 함 — 순수 방어용. 366(윤년 포함 최대
/// 시즌 길이, `calendar::season_length`)으로 여유를 둠.
const MAX_DAYS_PER_CALL: i64 = 366;

/// 04_게임루프.md §2의 `advance()` — 프로토의 advanceWeek를 대체하는 단일
/// 진행 커맨드(설계 문서가 그 이름을 의도적으로 버렸다는 점이 이름 자체가
/// 근거: "프로토의 advanceWeek를 대체하는"). 하루씩 전진하며 정지 지점(새
/// PendingAction 발생 또는 주인공 등판 경기)에서 멈춘다. 정지할 때마다
/// meta.integrity_sig를 재서명(I3에서 미뤄둔 sign_core_state를 여기서 사용).
/// content_conn은 I5에서 추가 — 배경 경기(process_day)가 리그 규칙·로스터를
/// 읽으려면 content.db가 필요해짐.
pub fn advance(slot_conn: &mut Connection, content_conn: &Connection) -> anyhow::Result<Vec<PendingActionRow>> {
    let world_seed: i64 = slot_conn.query_row("SELECT world_seed FROM meta", [], |row| row.get(0))?;

    // 이미 은퇴한 주인공이면 더 이상 하루도 전진하지 않는다 — 은퇴 화면
    // 확인 후 Flutter가 메인 메뉴로 나가는 게 정상 흐름(§4-1)이지만, 혹시
    // advance()가 다시 호출돼도 경기 스케줄·시즌 롤오버가 계속 도는 걸
    // 막는 방어선.
    let retired: Option<i64> = slot_conn.query_row("SELECT retired FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).optional()?;
    if retired == Some(1) {
        return list_pending_actions(slot_conn);
    }

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
            tx.commit()?;
            resign_core_state(slot_conn)?;
            return list_pending_actions(slot_conn);
        }

        process_day(&tx, content_conn, world_seed, today)?;
        tx.execute("UPDATE meta SET current_day = ?1", params![today])?;

        // 경계 겹침 처리 순서 = 경기(위에서 이미 처리) → 주간 → 월간 → 시즌
        // (04_게임루프.md §2). 월=4주(28일)는 문서에 정확한 일수가 없어 잡은
        // placeholder(실제 달력 월과 무관한 내부 처리 주기) — 시즌 경계는
        // `calendar::is_season_boundary`로 실제 연도 길이(365/366일)를 반영.
        if today % 7 == 0 {
            process_week(&tx, content_conn, world_seed, today)?;
            process_protagonist_week(&tx, content_conn, world_seed, today)?;
        }
        if today % 28 == 0 {
            process_month(&tx, today)?;
        }
        if crate::calendar::is_season_boundary(today) {
            season_rollover(&tx, content_conn, today)?;
        }

        let pending_count: i64 = tx.query_row("SELECT count(*) FROM pending_actions", [], |row| row.get(0))?;
        tx.commit()?;

        if pending_count > 0 {
            resign_core_state(slot_conn)?;
            return list_pending_actions(slot_conn);
        }
        // 새 PendingAction도, 경기도 없으면 다음 날로 계속.
    }
    // MAX_DAYS_PER_CALL만큼 돌았는데도 정지점을 못 찾음 — 안전장치 발동,
    // 호출자에게 제어를 돌려준다(보통 빈 목록; 실제로는 I5 콘텐츠가 있으면
    // 이 경로를 거의 안 탐).
    resign_core_state(slot_conn)?;
    list_pending_actions(slot_conn)
}

/// `sign_core_state`는 전체 npc 테이블(수천 행)을 스캔·직렬화하는 O(n)
/// 연산이라 — advance()가 하루씩 조용히(pending 없이) 여러 날을 통과하는
/// 동안 매 날짜마다 다시 서명하면 그 스캔이 그대로 여러 번 중복된다.
/// `integrity_sig`는 지금 어디서도 로드 시 검증하지 않는(I3 이후 미뤄둔
/// placeholder) 값이라 중간 날짜의 서명이 최신일 필요가 없다 — advance()가
/// 실제로 호출자에게 제어를 돌려주는 시점에 한 번만 최종 상태를 서명한다.
fn resign_core_state(slot_conn: &Connection) -> anyhow::Result<()> {
    let sig = crate::integrity::sign_core_state(slot_conn)?;
    slot_conn.execute("UPDATE meta SET integrity_sig = ?1", params![sig])?;
    Ok(())
}

/// pending_actions에서 해당 행을 제거해 다음 advance()가 진행되게 한다.
/// 타입별 실제 효과(트레이드 성사, 계약 체결 등)는 그 효과를 낼 시스템
/// (sim/market 등)이 생겼을 때 여기서 분기 — 지금은 제네릭 처리뿐.
/// `pending_actions`에서 해당 행을 제거해 다음 진행이 가능하게 한다.
/// 타입별 실제 효과는 여기서 분기(I4에서 이미 이렇게 하기로 예정해둔
/// 자리) — `'game'`(§3 "경기 시작 전 1회 선택"의 그 모드 값이 `choice_id`
/// 로 들어옴) → `match_session::start_protagonist_match` 호출, `'pitch'`
/// (§5 1구 선택, `choice_id`는 `"구종:코스"` 형식) → `match_session::submit_pitch`
/// 호출. 그 결과가 `AwaitingPitch`면 다음 1구를 위한 `'pitch'` PendingAction
/// 을 새로 만들어 체인을 잇는다. 그 외 타입은 여전히 제네릭 처리(효과를
/// 낼 시스템이 아직 없음).
pub fn resolve_choice(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    action_id: &str,
    choice_id: &str,
) -> anyhow::Result<Option<match_session::MatchStepResult>> {
    let row: Option<(String, String)> =
        slot_conn.query_row("SELECT type, payload FROM pending_actions WHERE id = ?1", [action_id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    slot_conn.execute("DELETE FROM pending_actions WHERE id = ?1", params![action_id])?;

    let Some((kind, payload_raw)) = row else {
        return Ok(None);
    };

    let step = match kind.as_str() {
        "game" => {
            let payload: serde_json::Value = serde_json::from_str(&payload_raw)?;
            let game_id = payload.get("game_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("pending game action missing game_id"))?;
            let home = payload.get("home").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("pending game action missing home"))?;
            let away = payload.get("away").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("pending game action missing away"))?;
            Some(match_session::start_protagonist_match(slot_conn, content_conn, world_seed, game_id, home, away, choice_id)?)
        }
        "pitch" => {
            let (pitch_name, course_name) =
                choice_id.split_once(':').ok_or_else(|| anyhow::anyhow!("expected 'pitch_name:course' choice_id, got {choice_id}"))?;
            let course = crate::sim::pitch::Course::parse(course_name).ok_or_else(|| anyhow::anyhow!("unknown course: {course_name}"))?;
            Some(match_session::submit_pitch(slot_conn, world_seed, pitch_name, course)?)
        }
        "pitcherChange" => Some(match_session::submit_pitcher_change_decision(slot_conn, world_seed, choice_id)?),
        "injuryTreatment" => {
            let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
            treat(slot_conn, world_seed, choice_id, today)?;
            None
        }
        "contractNego" => {
            let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
            resolve_contract_nego(slot_conn, content_conn, world_seed, &payload_raw, choice_id, today)?;
            None
        }
        "tradeDecision" => {
            let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
            resolve_trade_decision(slot_conn, &payload_raw, choice_id, today)?;
            None
        }
        // 지명 통보뿐 — 계약은 `process_protagonist_career_path`가 이미
        // 확정해뒀다(§D "지명 → 프로", 거부 개념 없음). 확인만 하면 소비.
        "draft" => None,
        "careerChoice" => {
            let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
            resolve_career_choice(slot_conn, content_conn, world_seed, choice_id, today)?;
            None
        }
        // 은퇴 연출 확인뿐 — 은퇴 자체는 이미 `mark_protagonist_retired`가
        // 확정해뒀다(§4-1 "확인 후 메인 메뉴로 복귀"는 Flutter의 내비게이션
        // 관심사). 소비만 하면 됨.
        "retirement" => None,
        _ => None,
    };

    if let Some(match_session::MatchStepResult::AwaitingPitch { batter_id, balls, strikes, high_leverage, .. }) = &step {
        let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        // pitch_seq는 match_session이 이미 증가시켜둔 뒤라, 한 경기 안에서
        // 절대 안 겹치는 고유 접미사로 그대로 재사용.
        let pitch_seq: i64 = slot_conn.query_row("SELECT pitch_seq FROM match_session WHERE id = 1", [], |r| r.get(0))?;
        let payload = serde_json::json!({"batter_id": batter_id, "balls": balls, "strikes": strikes, "high_leverage": high_leverage}).to_string();
        slot_conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'pitch', 'urgent', ?2, ?3)",
            params![format!("pending:pitch:{pitch_seq}"), today, payload],
        )?;
    }

    if let Some(match_session::MatchStepResult::PitcherChangeDecision { inning, pitches_thrown, fatigue, manager_recommends_pull, .. }) = &step {
        let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        // pitches_thrown은 이 프롬프트가 뜰 때마다 더 커져 있어야 정상이라
        // (수동 모드가 소프트캡 이상에서만 묻고, 매 하프이닝 최소 1구는
        // 더 던진 뒤에야 다음 경계에 도달) 'pitch'와 같은 이유로 안전하게
        // 고유 접미사로 쓴다.
        let payload = serde_json::json!({"inning": inning, "pitches_thrown": pitches_thrown, "fatigue": fatigue, "manager_recommends_pull": manager_recommends_pull}).to_string();
        slot_conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'pitcherChange', 'urgent', ?2, ?3)",
            params![format!("pending:pitcherChange:{pitches_thrown}"), today, payload],
        )?;
    }

    Ok(step)
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

    fn build_hs_school_content_db() -> Connection {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:hanseong_hs', 'league:hs', NULL, NULL)", [])
            .unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:univ', NULL)", []).unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:some_univ', 'league:univ', NULL, NULL)", [])
            .unwrap();
        content_conn
    }

    #[test]
    fn create_protagonist_inserts_expected_row() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();

        create_protagonist(&slot_conn, &content_conn, 1, "테스트타자", "좌완", "team:hanseong_hs", "강속구형", Some("커터")).unwrap();

        let (name, handedness, archetype, pitches_raw, contract_raw): (String, String, String, String, String) = slot_conn
            .query_row("SELECT name, handedness, archetype, pitches, contract FROM protagonist WHERE id = 'proto:1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .unwrap();
        assert_eq!(name, "테스트타자");
        assert_eq!(handedness, "좌완");
        assert_eq!(archetype, "강속구형");

        let pitches: Vec<String> = serde_json::from_str(&pitches_raw).unwrap();
        assert_eq!(pitches, vec!["포심 패스트볼".to_string(), "커터".to_string()]);

        let contract: serde_json::Value = serde_json::from_str(&contract_raw).unwrap();
        assert_eq!(contract.get("team_id").unwrap().as_str().unwrap(), "team:hanseong_hs");
    }

    #[test]
    fn create_protagonist_without_second_pitch_starts_fastball_only() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();

        create_protagonist(&slot_conn, &content_conn, 1, "포심만", "우완", "team:hanseong_hs", "제구형", None).unwrap();

        let pitches_raw: String = slot_conn.query_row("SELECT pitches FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let pitches: Vec<String> = serde_json::from_str(&pitches_raw).unwrap();
        assert_eq!(pitches, vec!["포심 패스트볼".to_string()]);
    }

    #[test]
    fn create_protagonist_rejects_non_hs_school() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();

        let result = create_protagonist(&slot_conn, &content_conn, 1, "실수", "우완", "team:some_univ", "강속구형", None);
        assert!(result.is_err());
    }

    #[test]
    fn create_protagonist_rejects_second_pitch_outside_archetype_pool() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();

        // 슬라이더는 제구형 전용 후보 — 강속구형에게는 유효하지 않음.
        let result = create_protagonist(&slot_conn, &content_conn, 1, "잘못된선택", "우완", "team:hanseong_hs", "강속구형", Some("슬라이더"));
        assert!(result.is_err());
    }

    #[test]
    fn set_protagonist_training_rejects_unknown_stat() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "훈련테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        let result = set_protagonist_training(&slot_conn, "존재안함", ["구위", "제구"], "보통", None);
        assert!(result.is_err());
    }

    #[test]
    fn set_protagonist_training_rejects_already_known_pitch_as_new() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "훈련테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        // 강속구형은 포심 패스트볼로 시작 — 그걸 "신규"로 다시 설정하면 거부돼야 함.
        let result = set_protagonist_training(&slot_conn, "구속", ["구위", "제구"], "보통", Some("포심 패스트볼"));
        assert!(result.is_err());
    }

    #[test]
    fn set_protagonist_profile_round_trips_through_the_profile_column() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "신체테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        set_protagonist_profile(&slot_conn, 3, 15, 178.0, 70.0, "O", "서울", 18).unwrap();

        let raw: String = slot_conn.query_row("SELECT profile FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["birth_year"], 2010);
        assert_eq!(v["birth_month"], 3);
        assert_eq!(v["hometown"], "서울");
        assert_eq!(v["jersey_number"], 18);
    }

    #[test]
    fn set_protagonist_profile_rejects_invalid_day_for_month_and_unknown_enums() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "신체테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        assert!(set_protagonist_profile(&slot_conn, 2, 30, 178.0, 70.0, "O", "서울", 18).is_err(), "2월 30일은 없음");
        assert!(set_protagonist_profile(&slot_conn, 3, 15, 178.0, 70.0, "Z", "서울", 18).is_err(), "존재 안 하는 혈액형");
        assert!(set_protagonist_profile(&slot_conn, 3, 15, 178.0, 70.0, "O", "부산", 18).is_err(), "8권역 표기와 다른 지역명");
        assert!(set_protagonist_profile(&slot_conn, 3, 15, 178.0, 70.0, "O", "서울", 100).is_err(), "등번호 범위 밖(1~99)");
    }

    #[test]
    fn process_protagonist_week_does_nothing_without_training_config() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "미설정", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        let before: String = slot_conn.query_row("SELECT stats FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        for week in 0..10i64 {
            process_protagonist_week(&slot_conn, &content_conn, 1, week * 7).unwrap();
        }
        let after: String = slot_conn.query_row("SELECT stats FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after, "no training config set -> stats should never change");
    }

    #[test]
    fn process_protagonist_week_grows_the_primary_slot_over_many_weeks() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "훈련중", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        set_protagonist_training(&slot_conn, "구속", ["구위", "경기운영"], "보통", None).unwrap();

        for week in 0..30i64 {
            process_protagonist_week(&slot_conn, &content_conn, 1, week * 7).unwrap();
        }

        let stats_raw: String = slot_conn.query_row("SELECT stats FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let stats: serde_json::Value = serde_json::from_str(&stats_raw).unwrap();
        let primary = stats.get("구속").unwrap().as_f64().unwrap();
        let unfocused = stats.get("클러치").unwrap().as_f64().unwrap();
        assert!(primary > unfocused, "primary(구속)={primary} unfocused(클러치)={unfocused}");
    }

    #[test]
    fn process_protagonist_week_learns_a_new_pitch_after_enough_weeks() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "구종연마", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        set_protagonist_training(&slot_conn, "구속", ["구위", "경기운영"], "강", Some("커터")).unwrap();

        // "강" 강도는 sim::training::weeks_required_to_learn_pitch("강") == 8주.
        for week in 0..8i64 {
            process_protagonist_week(&slot_conn, &content_conn, 1, week * 7).unwrap();
        }

        let pitches_raw: String = slot_conn.query_row("SELECT pitches FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let pitches: Vec<String> = serde_json::from_str(&pitches_raw).unwrap();
        assert!(pitches.contains(&"커터".to_string()), "pitches={pitches:?}");

        let training_raw: String = slot_conn.query_row("SELECT training FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let training: serde_json::Value = serde_json::from_str(&training_raw).unwrap();
        assert!(training.get("new_pitch").unwrap().is_null(), "new_pitch should reset to null once learned");
    }

    #[test]
    fn process_protagonist_week_caps_intensity_to_normal_during_a_start_week() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "등판주간", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        set_protagonist_training(&slot_conn, "구속", ["구위", "경기운영"], "강", None).unwrap();
        slot_conn
            .execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 3, 'team:hanseong_hs', 'team:y', NULL)", [])
            .unwrap();

        process_protagonist_week(&slot_conn, &content_conn, 1, 0).unwrap();

        let live_state_raw: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let live_state: serde_json::Value = serde_json::from_str(&live_state_raw).unwrap();
        let fatigue = live_state.get("피로도").unwrap().as_f64().unwrap();
        // "강"이었다면 +8이어야 하지만, 등판 예정 주라 "보통"으로 캡돼 +0.
        assert_eq!(fatigue, 0.0, "requested 강 during a start week should be capped to 보통 (no fatigue increase)");
    }

    fn read_protagonist_injury(conn: &Connection) -> serde_json::Value {
        let raw: String = conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn apply_injury_creates_pending_treatment_action_and_leaves_treatment_unset() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "부상테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        apply_injury(&slot_conn, "어깨", "중등", 10).unwrap();

        let injury = read_protagonist_injury(&slot_conn);
        assert_eq!(injury["current"]["부위"], "어깨");
        assert_eq!(injury["current"]["심각도"], "중등");
        assert!(injury["current"]["치료"].is_null(), "치료법은 플레이어가 고를 때까지 미정이어야 함");

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "injuryTreatment");
        assert_eq!(pending[0].created_day, 10);
    }

    #[test]
    fn apply_injury_skips_if_protagonist_already_has_unresolved_injury() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "이중부상", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        apply_injury(&slot_conn, "어깨", "경미", 5).unwrap();
        apply_injury(&slot_conn, "팔꿈치", "중상", 6).unwrap();

        let injury = read_protagonist_injury(&slot_conn);
        assert_eq!(injury["current"]["부위"], "어깨", "이미 미해결 부상이 있으면 두 번째 판정은 무시돼야 함");

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1, "PendingAction도 중복 생성되면 안 됨");
    }

    #[test]
    fn apply_injury_forces_retirement_once_accumulated_severity_crosses_the_threshold() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "재기불가테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        // 과거에 이미 "중상" 부상 이력 1건(weight=8)이 있다고 세팅 —
        // 이번 두 번째 "중상"(다른 부위)까지 겹치면 임계값(16)을 넘긴다.
        let seeded = serde_json::json!({"current": null, "history": [{"부위": "어깨", "심각도": "중상", "day": 0}]});
        slot_conn.execute("UPDATE protagonist SET injury = ?1 WHERE id = 'proto:1'", params![seeded.to_string()]).unwrap();

        apply_injury(&slot_conn, "허리/코어", "중상", 30).unwrap();

        let (retired, reason): (i64, Option<String>) =
            slot_conn.query_row("SELECT retired, retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(retired, 1);
        assert_eq!(reason.as_deref(), Some("injury"));

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "retirement");
        assert!(pending.iter().all(|p| p.kind != "injuryTreatment"), "재기불가 은퇴는 치료 선택지를 만들지 않아야 함");
    }

    #[test]
    fn declare_protagonist_retirement_pushes_a_retirement_pending_action_and_clears_others() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "자진은퇴", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        slot_conn
            .execute(
                "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES ('pending:x', 'contractNego', 'urgent', 1, '{}')",
                [],
            )
            .unwrap();

        declare_protagonist_retirement(&slot_conn, 100).unwrap();

        let (retired, reason): (i64, Option<String>) =
            slot_conn.query_row("SELECT retired, retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(retired, 1);
        assert_eq!(reason.as_deref(), Some("voluntary"));

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "retirement");

        // 내 정보 "커리어" 탭용 — create_protagonist가 남긴 "enrollment"와
        // 이번 은퇴가 남긴 "retirement"가 시간순으로 둘 다 있어야 한다.
        assert_eq!(career_event_kinds(&slot_conn), vec!["enrollment", "retirement"]);
    }

    #[test]
    fn declare_protagonist_retirement_is_idempotent() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "중복은퇴", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        declare_protagonist_retirement(&slot_conn, 100).unwrap();
        declare_protagonist_retirement(&slot_conn, 200).unwrap();

        let reason: Option<String> = slot_conn.query_row("SELECT retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(reason.as_deref(), Some("voluntary"), "이미 은퇴한 상태에서 다시 불러도 최초 사유가 유지돼야 함");
        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1, "중복 호출이 pending_actions를 추가로 쌓으면 안 됨");
    }

    #[test]
    fn treat_rejects_unknown_treatment() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "치료테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        apply_injury(&slot_conn, "어깨", "경미", 1).unwrap();

        assert!(treat(&slot_conn, 1, "굿판", 1).is_err());
    }

    #[test]
    fn treat_errors_without_an_active_injury() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "무부상", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        assert!(treat(&slot_conn, 1, "재활", 1).is_err());
    }

    #[test]
    fn treat_rehab_uses_baseline_recovery_without_extra_rolls() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "재활테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        apply_injury(&slot_conn, "어깨", "중등", 10).unwrap();

        treat(&slot_conn, 1, "재활", 10).unwrap();

        let injury = read_protagonist_injury(&slot_conn);
        assert_eq!(injury["current"]["치료"], "재활");
        assert_eq!(injury["current"]["심각도"], "중등", "재활은 추가 악화 판정이 없어 심각도가 그대로 유지돼야 함");
        assert_eq!(injury["current"]["return_day"], 10 + crate::sim::injury::recovery_days("중등"));
    }

    #[test]
    fn treat_surgery_either_keeps_or_escalates_severity_and_recomputes_return_day() {
        let content_conn = build_hs_school_content_db();
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            create_protagonist(&slot_conn, &content_conn, 1, "수술테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
            apply_injury(&slot_conn, "팔꿈치", "경미", 0).unwrap();
            treat(&slot_conn, seed, "수술", 0).unwrap();

            let injury = read_protagonist_injury(&slot_conn);
            let severity = injury["current"]["심각도"].as_str().unwrap().to_string();
            assert!(severity == "경미" || severity == "중등", "수술은 경미를 유지하거나 중등으로 악화만 가능, got {severity}");
            let expected_return = crate::sim::injury::treated_recovery_days(&severity, "수술");
            assert_eq!(injury["current"]["return_day"].as_i64().unwrap(), expected_return);
        }
    }

    #[test]
    fn treat_rushed_return_has_a_shorter_average_recovery_window_than_rehab() {
        let content_conn = build_hs_school_content_db();
        let recovery_total = |treatment: &str| -> i64 {
            (0..30i64)
                .map(|seed| {
                    let slot_conn = slot::open_in_memory().unwrap();
                    create_protagonist(&slot_conn, &content_conn, 1, "비교", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
                    apply_injury(&slot_conn, "다리/무릎", "중등", 0).unwrap();
                    treat(&slot_conn, seed, treatment, 0).unwrap();
                    read_protagonist_injury(&slot_conn)["current"]["return_day"].as_i64().unwrap()
                })
                .sum()
        };
        let rushed_total = recovery_total("무리한 복귀");
        let rehab_total = recovery_total("재활");
        assert!(rushed_total < rehab_total, "rushed={rushed_total} rehab={rehab_total}");
    }

    #[test]
    fn resolve_choice_dispatches_injury_treatment_and_applies_it() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "치료선택", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        apply_injury(&slot_conn, "어깨", "경미", 3).unwrap();

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "injuryTreatment");

        let step = resolve_choice(&slot_conn, &content_conn, 1, &pending[0].id, "재활").unwrap();
        assert!(step.is_none());

        let remaining: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0);
        assert_eq!(read_protagonist_injury(&slot_conn)["current"]["치료"], "재활");
    }

    #[test]
    fn process_protagonist_week_clears_healed_injury_once_return_day_passes() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "완치테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
        apply_injury(&slot_conn, "어깨", "경미", 0).unwrap();
        treat(&slot_conn, 1, "재활", 0).unwrap(); // return_day = 0 + recovery_days(경미) = 7

        process_protagonist_week(&slot_conn, &content_conn, 1, 7).unwrap();

        let injury = read_protagonist_injury(&slot_conn);
        assert!(injury["current"].is_null(), "return_day가 지나면 current가 비워져야 함");
        assert_eq!(injury["history"].as_array().unwrap().len(), 1, "history는 그대로 유지돼야 함");
    }

    #[test]
    fn process_protagonist_week_can_trigger_overuse_injury_pending_action() {
        let content_conn = build_hs_school_content_db();
        let mut triggered = false;
        for seed in 0..50i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            create_protagonist(&slot_conn, &content_conn, 1, "과사용테스트", "우완", "team:hanseong_hs", "강속구형", None).unwrap();
            slot_conn
                .execute("UPDATE protagonist SET live_state = ?1 WHERE id = 'proto:1'", params![serde_json::json!({"피로도": 100.0}).to_string()])
                .unwrap();

            process_protagonist_week(&slot_conn, &content_conn, seed, 7).unwrap();

            if list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "injuryTreatment") {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to trigger an overuse injury at fatigue=100");
    }

    fn build_market_content_db() -> Connection {
        let conn = content::open_in_memory().unwrap();
        conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:pro', NULL)", []).unwrap();
        conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:independent', NULL)", []).unwrap();
        conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        for (team_id, league_id, resource) in [
            ("team:home", "league:pro", "안정"),
            ("team:rich_a", "league:pro", "부유"),
            ("team:rich_b", "league:pro", "부유"),
            ("team:poor_a", "league:pro", "궁핍"),
            ("team:indep_a", "league:independent", "안정"),
            ("team:hs_a", "league:hs", "안정"),
        ] {
            conn.execute(
                "INSERT INTO teams (id, league_id, color, meta) VALUES (?1, ?2, NULL, NULL)",
                params![team_id, league_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES (?1, '전통/정통', ?2, '중견')",
                params![team_id, resource],
            )
            .unwrap();
        }
        conn
    }

    fn insert_market_protagonist(slot_conn: &Connection, contract: &serde_json::Value, attention: f64) {
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                 VALUES ('proto:1', '시장테스트', '우완', '강속구형', '{}', '{}', ?1, '{}', '[\"포심 패스트볼\"]', ?2, '{\"current\":null,\"history\":[]}')",
                params![serde_json::json!({"피로도": 0, "주목도": attention}).to_string(), contract.to_string()],
            )
            .unwrap();
    }

    fn insert_market_protagonist_with_age(slot_conn: &Connection, contract: &serde_json::Value, attention: f64, age: i64) {
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, age)
                 VALUES ('proto:1', '시장테스트', '우완', '강속구형', '{}', '{}', ?1, '{}', '[\"포심 패스트볼\"]', ?2, '{\"current\":null,\"history\":[]}', ?3)",
                params![serde_json::json!({"피로도": 0, "주목도": attention}).to_string(), contract.to_string(), age],
            )
            .unwrap();
    }

    fn insert_game_log_grades(slot_conn: &Connection, season: i64, grades: &[&str]) {
        for (i, grade) in grades.iter().enumerate() {
            slot_conn
                .execute(
                    "INSERT INTO game_log (game_id, season, detail) VALUES (?1, ?2, ?3)",
                    params![format!("game:{season}:{i}"), season, serde_json::json!({"grade": grade, "runs_allowed": 1, "opponent": "team:x"}).to_string()],
                )
                .unwrap();
        }
    }

    fn insert_game_log_grade_on_day(slot_conn: &Connection, game_id: &str, day: i64, grade: &str) {
        slot_conn
            .execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES (?1, ?2, 'team:home', 'team:away', NULL)", params![game_id, day])
            .unwrap();
        slot_conn
            .execute(
                "INSERT INTO game_log (game_id, season, detail) VALUES (?1, 0, ?2)",
                params![game_id, serde_json::json!({"grade": grade, "runs_allowed": 1, "opponent": "team:x"}).to_string()],
            )
            .unwrap();
    }

    #[test]
    fn monthly_avg_grade_score_only_counts_outings_inside_the_day_window() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_game_log_grade_on_day(&slot_conn, "g_out", 1, "F"); // 범위 밖(day 28~56 미포함)
        insert_game_log_grade_on_day(&slot_conn, "g_in1", 30, "S");
        insert_game_log_grade_on_day(&slot_conn, "g_in2", 40, "A");

        let avg = monthly_avg_grade_score(&slot_conn, 28, 56).unwrap();
        assert_eq!(avg, Some((5.0 + 4.0) / 2.0), "F(day1) 경기는 범위 밖이라 평균에서 제외돼야 한다");
    }

    #[test]
    fn monthly_avg_grade_score_is_none_when_no_outings_in_window() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_game_log_grade_on_day(&slot_conn, "g1", 1, "B");

        assert_eq!(monthly_avg_grade_score(&slot_conn, 28, 56).unwrap(), None);
    }

    #[test]
    fn process_month_raises_morale_after_a_good_month() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:home"}), 0.0);
        insert_game_log_grade_on_day(&slot_conn, "g1", 10, "S");
        insert_game_log_grade_on_day(&slot_conn, "g2", 15, "S");

        process_month(&slot_conn, 28).unwrap();

        let live_state: serde_json::Value = serde_json::from_str(&slot_conn.query_row::<String, _, _>("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap()).unwrap();
        assert!(live_state["사기"].as_f64().unwrap() > 50.0, "좋은 한 달을 보내면 사기가 올라야 한다");
    }

    #[test]
    fn process_month_lowers_morale_after_a_bad_month() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:home"}), 0.0);
        insert_game_log_grade_on_day(&slot_conn, "g1", 10, "F");
        insert_game_log_grade_on_day(&slot_conn, "g2", 15, "F");

        process_month(&slot_conn, 28).unwrap();

        let live_state: serde_json::Value = serde_json::from_str(&slot_conn.query_row::<String, _, _>("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap()).unwrap();
        assert!(live_state["사기"].as_f64().unwrap() < 50.0, "나쁜 한 달을 보내면 사기가 내려가야 한다");
    }

    #[test]
    fn process_month_is_a_no_op_when_the_protagonist_did_not_pitch_that_month() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:home"}), 0.0);

        let before: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();

        process_month(&slot_conn, 28).unwrap();

        let after: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after, "이번 달 등판이 없으면 live_state 자체를 건드리지 않아야 한다");
    }

    #[test]
    fn process_month_clamps_morale_at_the_upper_bound() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:home"}), 0.0);
        slot_conn.execute("UPDATE protagonist SET live_state = ?1 WHERE id = 'proto:1'", params![serde_json::json!({"피로도": 0, "사기": 95.0}).to_string()]).unwrap();
        insert_game_log_grade_on_day(&slot_conn, "g1", 10, "S");

        process_month(&slot_conn, 28).unwrap();

        let live_state: serde_json::Value = serde_json::from_str(&slot_conn.query_row::<String, _, _>("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap()).unwrap();
        assert_eq!(live_state["사기"].as_f64().unwrap(), 100.0, "사기는 100을 넘지 않아야 한다");
    }

    fn read_contract(conn: &Connection) -> serde_json::Value {
        let raw: String = conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn aggregate_game_log_computes_decision_tallies_strikeouts_innings_and_era() {
        let slot_conn = slot::open_in_memory().unwrap();
        let insert = |game_id: &str, season: i64, decision: &str, runs_allowed: i64, strikeouts: i64, innings: i64| {
            slot_conn
                .execute(
                    "INSERT INTO game_log (game_id, season, detail) VALUES (?1, ?2, ?3)",
                    params![
                        game_id,
                        season,
                        serde_json::json!({
                            "grade": "B", "runs_allowed": runs_allowed, "opponent": "team:x",
                            "decision": decision, "strikeouts": strikeouts, "innings_pitched": innings,
                        })
                        .to_string()
                    ],
                )
                .unwrap();
        };
        insert("g1", 0, "승", 2, 8, 9);
        insert("g2", 0, "패", 5, 3, 9);
        insert("g3", 1, "무승부", 4, 4, 9);

        let career = aggregate_game_log(&slot_conn, None).unwrap();
        assert_eq!((career.games, career.wins, career.losses, career.no_decisions), (3, 1, 1, 1));
        assert_eq!(career.strikeouts, 15);
        assert_eq!(career.innings_pitched, 27);
        assert_eq!(career.runs_allowed, 11);
        assert!((career.era() - 11.0 * 9.0 / 27.0).abs() < 1e-9);

        let season0 = aggregate_game_log(&slot_conn, Some(0)).unwrap();
        assert_eq!((season0.games, season0.wins, season0.losses), (2, 1, 1));
    }

    #[test]
    fn aggregate_game_log_treats_legacy_rows_without_decision_fields_as_no_decisions() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_game_log_grades(&slot_conn, 0, &["S", "F"]); // decision/strikeouts/innings_pitched 없는 구형 shape
        let career = aggregate_game_log(&slot_conn, None).unwrap();
        assert_eq!(career.games, 2);
        assert_eq!(career.no_decisions, 2);
        assert_eq!(career.strikeouts, 0);
        assert_eq!(career.innings_pitched, 0);
    }

    #[test]
    fn process_protagonist_contract_skips_amateur_contracts() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:hs_a"}), 0.0);

        process_protagonist_contract(&slot_conn, &content_conn, 1, 0, 364).unwrap();

        assert_eq!(read_contract(&slot_conn), serde_json::json!({"team_id": "team:hs_a"}), "amateur contract must be left untouched");
        assert!(list_pending_actions(&slot_conn).unwrap().is_empty());
    }

    #[test]
    fn process_protagonist_contract_can_release_a_poorly_performing_expensive_player() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 20000, "years_remaining": 3}), 0.0);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let contract = read_contract(&slot_conn);
            if contract.get("team_id").map(serde_json::Value::is_null).unwrap_or(false) {
                assert_eq!(contract["status"], "FA");
                let pending = list_pending_actions(&slot_conn).unwrap();
                assert_eq!(pending.len(), 1);
                assert_eq!(pending[0].kind, "contractNego");
                let payload: serde_json::Value = serde_json::from_str(&pending[0].payload).unwrap();
                assert_eq!(payload["kind"], "FA");
                assert!(!payload["offers"].as_array().unwrap().is_empty());
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to release a poorly-performing, expensive, poor-team player");
    }

    #[test]
    fn process_protagonist_contract_can_trigger_decline_retirement_for_an_old_underperforming_fa() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..20i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist_with_age(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0, 50);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let (retired, reason): (i64, Option<String>) =
                slot_conn.query_row("SELECT retired, retirement_reason FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
            if retired == 1 {
                assert_eq!(reason.as_deref(), Some("decline"));
                let pending = list_pending_actions(&slot_conn).unwrap();
                assert_eq!(pending.len(), 1);
                assert_eq!(pending[0].kind, "retirement");
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to force decline retirement for a 50-year-old FA with F-grade form");
    }

    #[test]
    fn process_protagonist_contract_never_retires_a_young_fa_regardless_of_performance() {
        let content_conn = build_market_content_db();
        for seed in 0..10i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist_with_age(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0, 22);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let retired: i64 = slot_conn.query_row("SELECT retired FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
            assert_eq!(retired, 0, "22세는 위험연령 미만이라 은퇴 판정 자체가 안 일어나야 함");
        }
    }

    #[test]
    fn process_protagonist_contract_logs_a_release_to_league_transactions() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 20000, "years_remaining": 3}), 0.0);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let contract = read_contract(&slot_conn);
            if contract.get("team_id").map(serde_json::Value::is_null).unwrap_or(false) {
                let detail: String = slot_conn
                    .query_row("SELECT detail FROM league_transactions WHERE kind = 'contract'", [], |r| r.get(0))
                    .unwrap();
                let detail: serde_json::Value = serde_json::from_str(&detail).unwrap();
                assert_eq!(detail["event"], "release");
                assert_eq!(detail["team_id"], "team:poor_a");
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to release and log the event");
    }

    #[test]
    fn resolve_contract_nego_accept_logs_a_sign_to_league_transactions() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
        push_contract_nego(&slot_conn, 10, "FA", &[("team:rich_a".to_string(), 8000, 3)]).unwrap();
        let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "accept:team:rich_a").unwrap();

        let detail: String = slot_conn.query_row("SELECT detail FROM league_transactions WHERE kind = 'contract'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail).unwrap();
        assert_eq!(detail["event"], "sign");
        assert_eq!(detail["team_id"], "team:rich_a");
        assert_eq!(detail["salary"], 8000);
        assert_eq!(detail["negotiation_kind"], "FA");
    }

    #[test]
    fn process_protagonist_contract_offers_renewal_when_years_remaining_hits_zero() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:rich_a", "salary": 0, "years_remaining": 0}), 0.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let pending = list_pending_actions(&slot_conn).unwrap();
            if let Some(action) = pending.iter().find(|p| p.kind == "contractNego") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                if payload["kind"] == "재계약" {
                    let offers = payload["offers"].as_array().unwrap();
                    assert_eq!(offers.len(), 1);
                    assert_eq!(offers[0]["team_id"], "team:rich_a");
                    triggered = true;
                    break;
                }
            }
        }
        assert!(triggered, "expected at least one low-risk seed to reach the renewal-offer path instead of release");
    }

    #[test]
    fn process_protagonist_contract_decrements_years_remaining_when_not_expiring_or_released() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:rich_a", "salary": 0, "years_remaining": 3}), 0.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            process_protagonist_contract(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let contract = read_contract(&slot_conn);
            if contract.get("team_id").and_then(|v| v.as_str()) == Some("team:rich_a") && contract["years_remaining"] == 2 {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one low-risk seed to just decrement years_remaining without release or renewal");
    }

    #[test]
    fn process_protagonist_contract_regenerates_fa_offers_each_season_while_unsigned() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);

        process_protagonist_contract(&slot_conn, &content_conn, 1, 0, 364).unwrap();

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "contractNego");
        let payload: serde_json::Value = serde_json::from_str(&pending[0].payload).unwrap();
        assert_eq!(payload["kind"], "FA");
    }

    #[test]
    fn resolve_contract_nego_accept_signs_the_offered_terms() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
        push_contract_nego(&slot_conn, 10, "FA", &[("team:rich_a".to_string(), 8000, 3)]).unwrap();
        let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "accept:team:rich_a").unwrap();

        let contract = read_contract(&slot_conn);
        assert_eq!(contract["team_id"], "team:rich_a");
        assert_eq!(contract["salary"], 8000);
        assert_eq!(contract["years_remaining"], 3);
        assert!(list_pending_actions(&slot_conn).unwrap().is_empty());
    }

    #[test]
    fn resolve_contract_nego_reject_leaves_the_contract_unsigned() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
        push_contract_nego(&slot_conn, 10, "FA", &[("team:rich_a".to_string(), 8000, 3)]).unwrap();
        let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "reject").unwrap();

        let contract = read_contract(&slot_conn);
        assert!(contract["team_id"].is_null());
        assert!(list_pending_actions(&slot_conn).unwrap().is_empty(), "resolving (even by rejecting) should consume the pending action");
    }

    #[test]
    fn resolve_contract_nego_rejecting_a_renewal_offer_releases_the_player_to_fa() {
        // §2-1 "최종 타결 또는 결렬(결렬 시 FA)" — 재계약 협상은 거절 전까지
        // 옛 팀 소속 그대로 남아있다가(FA와 달리 team_id가 null이 아님),
        // 거절되면 그제서야 FA로 풀려야 한다.
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:rich_a", "salary": 5000, "years_remaining": 0}), 0.0);
        push_contract_nego(&slot_conn, 10, "재계약", &[("team:rich_a".to_string(), 8000, 3)]).unwrap();
        let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "reject").unwrap();

        let contract = read_contract(&slot_conn);
        assert!(contract["team_id"].is_null(), "rejecting a renewal offer must release the player to FA, not leave the stale contract");
        assert_eq!(contract["status"], "FA");
    }

    #[test]
    fn resolve_contract_nego_counter_offer_either_signs_the_requested_amount_or_stays_unsigned() {
        let content_conn = build_market_content_db();
        let mut signed_once = false;
        let mut unsigned_once = false;
        for seed in 0..40i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
            push_contract_nego(&slot_conn, 10, "FA", &[("team:rich_a".to_string(), 8000, 3)]).unwrap();
            let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

            resolve_choice(&slot_conn, &content_conn, seed, &action_id, "counter:team:rich_a:12000").unwrap();

            let contract = read_contract(&slot_conn);
            if contract["team_id"] == "team:rich_a" {
                assert_eq!(contract["salary"], 12000, "an accepted counter must sign at the requested amount, not the original offer");
                signed_once = true;
            } else {
                assert!(contract["team_id"].is_null());
                unsigned_once = true;
            }
            if signed_once && unsigned_once {
                break;
            }
        }
        assert!(signed_once, "expected at least one seed where the rich team accepts the counter-offer");
        assert!(unsigned_once, "expected at least one seed where the counter-offer is rejected");
    }

    #[test]
    fn resolve_contract_nego_counter_below_the_offer_always_signs() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
        push_contract_nego(&slot_conn, 10, "FA", &[("team:poor_a".to_string(), 8000, 3)]).unwrap();
        let action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "counter:team:poor_a:6000").unwrap();

        let contract = read_contract(&slot_conn);
        assert_eq!(contract["team_id"], "team:poor_a");
        assert_eq!(contract["salary"], 6000);
    }

    fn insert_trade_pending(conn: &Connection, day: i64, payload: &serde_json::Value) -> String {
        let id = format!("trade:{day}");
        conn.execute(
            "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES (?1, 'tradeDecision', 'urgent', ?2, ?3)",
            params![id, day, payload.to_string()],
        )
        .unwrap();
        id
    }

    #[test]
    fn process_protagonist_trade_skips_when_contract_negotiation_is_pending() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 20000, "years_remaining": 3}), 0.0);
        push_contract_nego(&slot_conn, 10, "재계약", &[("team:poor_a".to_string(), 8000, 3)]).unwrap();

        process_protagonist_trade(&slot_conn, &content_conn, 1, 10).unwrap();

        let pending = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pending.len(), 1, "no tradeDecision should be added on top of a pending contractNego");
        assert_eq!(pending[0].kind, "contractNego");
    }

    #[test]
    fn process_protagonist_trade_skips_unsigned_and_amateur_contracts() {
        let content_conn = build_market_content_db();

        let unsigned = slot::open_in_memory().unwrap();
        insert_market_protagonist(&unsigned, &serde_json::json!({"team_id": null, "status": "FA", "salary": 5000}), 0.0);
        process_protagonist_trade(&unsigned, &content_conn, 1, 10).unwrap();
        assert!(list_pending_actions(&unsigned).unwrap().is_empty());

        let amateur = slot::open_in_memory().unwrap();
        insert_market_protagonist(&amateur, &serde_json::json!({"team_id": "team:hs_a"}), 0.0);
        process_protagonist_trade(&amateur, &content_conn, 1, 10).unwrap();
        assert!(list_pending_actions(&amateur).unwrap().is_empty());
    }

    #[test]
    fn process_protagonist_trade_can_produce_a_player_trade_with_a_counterpart() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..60i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_minimal_roster(&slot_conn, "team:rich_a");
            insert_minimal_roster(&slot_conn, "team:rich_b");
            insert_minimal_roster(&slot_conn, "team:indep_a");
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 5000, "years_remaining": 3}), 0.0);

            process_protagonist_trade(&slot_conn, &content_conn, seed, 10).unwrap();

            let pending = list_pending_actions(&slot_conn).unwrap();
            if let Some(action) = pending.iter().find(|p| p.kind == "tradeDecision") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                assert_eq!(payload["from_team_id"], "team:poor_a");
                assert_ne!(payload["to_team_id"], "team:poor_a");
                assert!(matches!(payload["kind"].as_str().unwrap(), "현금" | "선수"));
                if payload["kind"] == "선수" {
                    assert!(payload["counterpart"].is_string(), "player-for-player trades should name a counterpart NPC");
                }
                assert_eq!(payload["can_reject"], false, "no no_trade_clause set — trade should not be rejectable");
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to produce a trade for a poor-team, low-salary protagonist");
    }

    #[test]
    fn process_protagonist_trade_marks_can_reject_when_no_trade_clause_is_set() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..60i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_minimal_roster(&slot_conn, "team:rich_a");
            insert_minimal_roster(&slot_conn, "team:rich_b");
            insert_market_protagonist(
                &slot_conn,
                &serde_json::json!({"team_id": "team:poor_a", "salary": 20000, "years_remaining": 3, "no_trade_clause": true}),
                0.0,
            );

            process_protagonist_trade(&slot_conn, &content_conn, seed, 10).unwrap();

            if let Some(action) = list_pending_actions(&slot_conn).unwrap().into_iter().find(|p| p.kind == "tradeDecision") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                assert_eq!(payload["can_reject"], true);
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to produce a trade for testing the no_trade_clause flag");
    }

    #[test]
    fn resolve_trade_decision_accept_moves_the_player_and_records_a_transaction() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 5000, "years_remaining": 2}), 0.0);
        let action_id = insert_trade_pending(
            &slot_conn,
            10,
            &serde_json::json!({"from_team_id": "team:poor_a", "to_team_id": "team:rich_a", "kind": "현금", "counterpart": null, "can_reject": false}),
        );

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "accept").unwrap();

        let contract = read_contract(&slot_conn);
        assert_eq!(contract["team_id"], "team:rich_a");
        assert_eq!(contract["salary"], 5000, "salary carries over unchanged through a trade");
        assert!(list_pending_actions(&slot_conn).unwrap().is_empty());

        let txn_count: i64 = slot_conn.query_row("SELECT count(*) FROM league_transactions WHERE kind = 'trade'", [], |r| r.get(0)).unwrap();
        assert_eq!(txn_count, 1);
    }

    #[test]
    fn resolve_trade_decision_reject_without_no_trade_clause_errors() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 5000, "years_remaining": 2}), 0.0);
        let action_id = insert_trade_pending(
            &slot_conn,
            10,
            &serde_json::json!({"from_team_id": "team:poor_a", "to_team_id": "team:rich_a", "kind": "현금", "counterpart": null, "can_reject": false}),
        );

        let result = resolve_choice(&slot_conn, &content_conn, 1, &action_id, "reject");
        assert!(result.is_err(), "rejecting a trade without a no-trade clause should be an error");
    }

    #[test]
    fn resolve_trade_decision_reject_with_no_trade_clause_keeps_the_old_team() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 5000, "years_remaining": 2}), 0.0);
        let action_id = insert_trade_pending(
            &slot_conn,
            10,
            &serde_json::json!({"from_team_id": "team:poor_a", "to_team_id": "team:rich_a", "kind": "현금", "counterpart": null, "can_reject": true}),
        );

        resolve_choice(&slot_conn, &content_conn, 1, &action_id, "reject").unwrap();

        let contract = read_contract(&slot_conn);
        assert_eq!(contract["team_id"], "team:poor_a", "rejecting via a no-trade clause should keep the player on the original team");
    }

    #[test]
    fn season_rollover_wires_up_protagonist_trade_processing() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..60i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            slot_conn.execute("UPDATE meta SET world_seed = ?1", params![seed]).unwrap();
            insert_minimal_roster(&slot_conn, "team:rich_a");
            insert_minimal_roster(&slot_conn, "team:rich_b");
            insert_minimal_roster(&slot_conn, "team:indep_a");
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 5000, "years_remaining": 3}), 0.0);

            season_rollover(&slot_conn, &content_conn, 364).unwrap();

            if list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "tradeDecision") {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected season_rollover to invoke process_protagonist_trade and eventually produce a trade");
    }

    fn build_career_content_db() -> Connection {
        let conn = content::open_in_memory().unwrap();
        for league_id in ["league:hs", "league:univ", "league:independent", "league:pro"] {
            conn.execute("INSERT INTO leagues (id, meta) VALUES (?1, NULL)", [league_id]).unwrap();
        }
        for (team_id, league_id) in [
            ("team:hs_a", "league:hs"),
            ("team:univ_a", "league:univ"),
            ("team:indep_a", "league:independent"),
            ("team:pro_a", "league:pro"),
            ("team:pro_b", "league:pro"),
        ] {
            conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES (?1, ?2, NULL, NULL)", params![team_id, league_id]).unwrap();
        }
        conn
    }

    fn insert_career_protagonist(slot_conn: &Connection, team_id: &str, age: i64, attention: f64) {
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, age)
                 VALUES ('proto:1', '갈림길테스트', '우완', '강속구형', '{}', '{}', ?1, '{}', '[\"포심 패스트볼\"]', ?2, '{\"current\":null,\"history\":[]}', ?3)",
                params![
                    serde_json::json!({"피로도": 0, "주목도": attention}).to_string(),
                    serde_json::json!({"team_id": team_id}).to_string(),
                    age,
                ],
            )
            .unwrap();
    }

    fn career_event_kinds(conn: &Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT kind FROM career_events ORDER BY id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
    }

    #[test]
    fn process_protagonist_career_path_skips_when_age_is_untracked() {
        let content_conn = build_career_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:hs_a"}), 0.0);

        process_protagonist_career_path(&slot_conn, &content_conn, 1, 0, 364).unwrap();

        assert!(list_pending_actions(&slot_conn).unwrap().is_empty());
    }

    #[test]
    fn process_protagonist_career_path_just_increments_age_before_graduation() {
        let content_conn = build_career_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn, "team:hs_a", 17, 0.0);

        process_protagonist_career_path(&slot_conn, &content_conn, 1, 0, 364).unwrap();

        let age: i64 = slot_conn.query_row("SELECT age FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(age, 18);
        assert!(list_pending_actions(&slot_conn).unwrap().is_empty());
    }

    #[test]
    fn process_protagonist_career_path_drafted_player_gets_a_pro_contract() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_career_protagonist(&slot_conn, "team:hs_a", 19, 1000.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            process_protagonist_career_path(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let pending = list_pending_actions(&slot_conn).unwrap();
            if let Some(action) = pending.iter().find(|p| p.kind == "draft") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                assert_eq!(payload["drafted"], true);
                let team_id = payload["team_id"].as_str().unwrap().to_string();
                assert!(team_id == "team:pro_a" || team_id == "team:pro_b");

                let contract = read_contract(&slot_conn);
                assert_eq!(contract["team_id"], team_id);
                assert_eq!(contract["years_remaining"], 2);
                assert_eq!(career_event_kinds(&slot_conn), vec!["career_choice"], "지명은 자동 확정이라 즉시 기록돼야 함");
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to draft a high-performing, high-attention HS senior");
    }

    #[test]
    fn process_protagonist_career_path_undrafted_player_gets_a_career_choice() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_career_protagonist(&slot_conn, "team:hs_a", 19, 0.0);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            process_protagonist_career_path(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let pending = list_pending_actions(&slot_conn).unwrap();
            if let Some(action) = pending.iter().find(|p| p.kind == "careerChoice") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                assert_eq!(payload["drafted"], false);
                assert_eq!(payload["options"], serde_json::json!(["대학", "독립", "입대"]));
                assert_eq!(read_contract(&slot_conn)["team_id"], "team:hs_a", "contract stays put until the player chooses");
                assert!(career_event_kinds(&slot_conn).is_empty(), "미지명은 플레이어가 아직 선택 안 해서 기록할 게 없어야 함");
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to leave a poorly-performing, unnoticed HS senior undrafted");
    }

    #[test]
    fn resolve_career_choice_university_and_independent_assign_a_team_in_that_league() {
        let content_conn = build_career_content_db();

        let slot_conn = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn, "team:hs_a", 20, 0.0);
        resolve_career_choice(&slot_conn, &content_conn, 1, "대학", 364).unwrap();
        assert_eq!(read_contract(&slot_conn)["team_id"], "team:univ_a");
        assert_eq!(career_event_kinds(&slot_conn), vec!["career_choice"]);

        let slot_conn2 = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn2, "team:hs_a", 20, 0.0);
        resolve_career_choice(&slot_conn2, &content_conn, 1, "독립", 364).unwrap();
        assert_eq!(read_contract(&slot_conn2)["team_id"], "team:indep_a");
        assert_eq!(career_event_kinds(&slot_conn2), vec!["career_choice"]);
    }

    #[test]
    fn process_amateur_annual_redraft_drafts_a_high_performing_university_player() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_career_protagonist(&slot_conn, "team:univ_a", 18, 1000.0); // 1학년이어도 즉시 신청 가능
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            process_amateur_annual_redraft(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            let pending = list_pending_actions(&slot_conn).unwrap();
            if let Some(action) = pending.iter().find(|p| p.kind == "draft") {
                let payload: serde_json::Value = serde_json::from_str(&action.payload).unwrap();
                assert_eq!(payload["drafted"], true);
                assert_eq!(read_contract(&slot_conn)["team_id"], payload["team_id"]);
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to draft a high-performing, high-attention university freshman");
    }

    #[test]
    fn process_amateur_annual_redraft_drafts_a_high_performing_independent_player() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_career_protagonist(&slot_conn, "team:indep_a", 22, 1000.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            process_amateur_annual_redraft(&slot_conn, &content_conn, seed, 0, 364).unwrap();

            if list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "draft") {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed to draft a high-performing, high-attention independent-league player");
    }

    #[test]
    fn process_amateur_annual_redraft_is_a_no_op_for_a_poorly_performing_player() {
        let content_conn = build_career_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn, "team:univ_a", 18, 0.0);
        insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

        process_amateur_annual_redraft(&slot_conn, &content_conn, 1, 0, 364).unwrap();

        assert!(list_pending_actions(&slot_conn).unwrap().is_empty(), "미지명이면 careerChoice도 안 뜨고 조용히 재적을 유지해야 한다");
        assert_eq!(read_contract(&slot_conn)["team_id"], "team:univ_a", "미지명이면 소속 팀이 그대로여야 한다");
    }

    #[test]
    fn process_amateur_annual_redraft_never_fires_outside_university_or_independent() {
        let content_conn = build_career_content_db();
        for team_id in ["team:hs_a", "team:pro_a"] {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_career_protagonist(&slot_conn, team_id, 18, 1000.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            for seed in 0..30i64 {
                process_amateur_annual_redraft(&slot_conn, &content_conn, seed, 0, 364).unwrap();
                assert!(list_pending_actions(&slot_conn).unwrap().is_empty(), "league:{team_id}는 이 함수의 대상이 아니어야 한다");
            }
        }
    }

    #[test]
    fn season_rollover_wires_up_amateur_annual_redraft_processing() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            slot_conn.execute("UPDATE meta SET world_seed = ?1", params![seed]).unwrap();
            insert_career_protagonist(&slot_conn, "team:univ_a", 18, 1000.0);
            insert_game_log_grades(&slot_conn, 0, &["S", "S", "S"]);

            season_rollover(&slot_conn, &content_conn, 364).unwrap();

            if list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "draft") {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "season_rollover should invoke process_amateur_annual_redraft for a university protagonist");
    }

    #[test]
    fn resolve_career_choice_military_starts_service_and_clears_the_team() {
        let content_conn = build_career_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn, "team:hs_a", 20, 0.0);

        resolve_career_choice(&slot_conn, &content_conn, 1, "입대", 100).unwrap();

        let contract = read_contract(&slot_conn);
        assert!(contract["team_id"].is_null());
        assert_eq!(contract["status"], "military");
        let return_day: i64 = slot_conn.query_row("SELECT military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert_eq!(return_day, 100 + crate::sim::npc::MILITARY_SERVICE_DAYS);
        assert_eq!(career_event_kinds(&slot_conn), vec!["career_choice"]);
    }

    #[test]
    fn process_protagonist_military_discharge_reassigns_to_independent_league_once_service_ends() {
        let content_conn = build_career_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_career_protagonist(&slot_conn, "team:hs_a", 20, 0.0);
        resolve_career_choice(&slot_conn, &content_conn, 1, "입대", 100).unwrap();
        let return_day: i64 = slot_conn.query_row("SELECT military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();

        process_protagonist_military_discharge(&slot_conn, &content_conn, 1, return_day).unwrap();

        assert_eq!(read_contract(&slot_conn)["team_id"], "team:indep_a");
        let return_day_after: Option<i64> =
            slot_conn.query_row("SELECT military_return_day FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        assert!(return_day_after.is_none());
        assert_eq!(career_event_kinds(&slot_conn), vec!["career_choice", "military_discharge"]);
    }

    #[test]
    fn season_rollover_wires_up_protagonist_career_path_processing() {
        let content_conn = build_career_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            slot_conn.execute("UPDATE meta SET world_seed = ?1", params![seed]).unwrap();
            insert_career_protagonist(&slot_conn, "team:hs_a", 19, 0.0);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            season_rollover(&slot_conn, &content_conn, 364).unwrap();

            if list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "careerChoice" || p.kind == "draft") {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected season_rollover to invoke process_protagonist_career_path and eventually trigger 갈림길A");
    }

    #[test]
    fn season_rollover_writes_a_career_history_line_for_the_finished_season() {
        let content_conn = build_market_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        slot_conn.execute("UPDATE meta SET world_seed = ?1", params![1i64]).unwrap();
        insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:hs_a"}), 0.0);
        insert_game_log_grades(&slot_conn, 0, &["S", "B"]);

        season_rollover(&slot_conn, &content_conn, 364).unwrap();

        let line_raw: String = slot_conn.query_row("SELECT line FROM career_history WHERE season = 0", [], |r| r.get(0)).unwrap();
        let line: serde_json::Value = serde_json::from_str(&line_raw).unwrap();
        assert_eq!(line["games"], 2);
    }

    #[test]
    fn generate_league_roster_inserts_expected_npc_count() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();

        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        let count: i64 = slot_conn.query_row("SELECT count(*) FROM npc", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 18); // 2 teams * (roster_size 8 + 감독 1명)
    }

    #[test]
    fn generate_league_roster_creates_one_manager_per_team_within_the_documented_stat_band() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();

        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        for team_id in ["team:a", "team:b"] {
            let (position, stats_raw): (String, String) = slot_conn
                .query_row("SELECT position, stats FROM npc WHERE id = ?1", [format!("manager:{team_id}")], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap();
            assert_eq!(position, "감독");
            let stats: serde_json::Value = serde_json::from_str(&stats_raw).unwrap();
            for key in ["전술력", "신뢰형성력", "육성안목", "카리스마"] {
                let v = stats[key].as_f64().unwrap();
                assert!((20.0..=80.0).contains(&v), "{key}={v} out of band");
            }
        }
    }

    #[test]
    fn load_manager_stats_reads_the_generated_manager_row() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        let stats_raw: String = slot_conn.query_row("SELECT stats FROM npc WHERE id = 'manager:team:a'", [], |r| r.get(0)).unwrap();
        let expected: serde_json::Value = serde_json::from_str(&stats_raw).unwrap();

        let loaded = load_manager_stats(&slot_conn, "team:a").unwrap();
        assert_eq!(loaded.tactics, expected["전술력"].as_f64().unwrap());
        assert_eq!(loaded.trust, expected["신뢰형성력"].as_f64().unwrap());
    }

    #[test]
    fn load_manager_stats_falls_back_to_the_hash_approximation_when_no_manager_row_exists() {
        let slot_conn = slot::open_in_memory().unwrap(); // 감독을 만들지 않은 세이브(구버전·합성 테스트 상황 재현)

        let loaded = load_manager_stats(&slot_conn, "team:never_generated").unwrap();
        let expected = manager::manager_stats("team:never_generated");
        assert_eq!(loaded.tactics, expected.tactics);
        assert_eq!(loaded.trust, expected.trust);
    }

    #[test]
    fn relationship_value_defaults_to_zero_for_an_untouched_relationship() {
        let slot_conn = slot::open_in_memory().unwrap();
        assert_eq!(relationship_value(&slot_conn, "manager:team:a").unwrap(), 0);
    }

    #[test]
    fn adjust_relationship_upserts_and_clamps_within_the_documented_range() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        adjust_relationship(&slot_conn, "manager:team:a", 40).unwrap();
        assert_eq!(relationship_value(&slot_conn, "manager:team:a").unwrap(), 40);

        adjust_relationship(&slot_conn, "manager:team:a", 40).unwrap();
        assert_eq!(relationship_value(&slot_conn, "manager:team:a").unwrap(), 80);

        adjust_relationship(&slot_conn, "manager:team:a", 1000).unwrap();
        assert_eq!(relationship_value(&slot_conn, "manager:team:a").unwrap(), 100, "관계도는 100을 넘지 않아야 한다");

        adjust_relationship(&slot_conn, "manager:team:a", -1000).unwrap();
        assert_eq!(relationship_value(&slot_conn, "manager:team:a").unwrap(), -100, "관계도는 -100 밑으로 내려가지 않아야 한다");
    }

    #[test]
    fn adjust_relationship_is_a_no_op_when_the_manager_does_not_exist() {
        let slot_conn = slot::open_in_memory().unwrap(); // 감독 npc 행 없음(FK 대상 부재)

        adjust_relationship(&slot_conn, "manager:team:ghost", 10).unwrap(); // 에러 없이 조용히 무시돼야 함

        assert_eq!(relationship_value(&slot_conn, "manager:team:ghost").unwrap(), 0);
    }

    #[test]
    fn process_week_does_not_apply_player_growth_to_the_manager() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();

        let before: String = slot_conn.query_row("SELECT stats FROM npc WHERE id = 'manager:team:a'", [], |r| r.get(0)).unwrap();

        process_week(&slot_conn, &content_conn, 123, 7).unwrap();

        let after: String = slot_conn.query_row("SELECT stats FROM npc WHERE id = 'manager:team:a'", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after, "process_week의 성장 처리가 감독 스탯을 건드리면 안 된다");
    }

    #[test]
    fn season_rollover_does_not_age_retire_or_conscript_the_manager() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap();
        // 가드가 없다면 확실히 은퇴 판정을 받도록 나이를 극단값으로 미리 올려둔다
        // (league:x의 age_range 폴백은 18~35 — 200살은 어느 기준으로도 은퇴권).
        slot_conn.execute("UPDATE npc SET age = 200 WHERE id = 'manager:team:a'", []).unwrap();

        season_rollover(&slot_conn, &content_conn, 364).unwrap();

        let (age, retired, military_return_day): (i64, i64, Option<i64>) = slot_conn
            .query_row("SELECT age, retired, military_return_day FROM npc WHERE id = 'manager:team:a'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .unwrap();
        assert_eq!(age, 200, "감독은 세대교체의 나이 증가 대상이 아니어야 한다");
        assert_eq!(retired, 0, "감독은 은퇴 판정 대상이 아니어야 한다");
        assert!(military_return_day.is_none(), "감독은 병역 편입 대상이 아니어야 한다");
    }

    #[test]
    fn generate_freshmen_does_not_count_the_manager_toward_the_active_roster() {
        let content_conn = build_test_content_db();
        let mut slot_conn = slot::open_in_memory().unwrap();
        generate_league_roster(&mut slot_conn, &content_conn, 123, "league:x").unwrap(); // roster_size 8 + 감독 1명

        generate_freshmen(&slot_conn, &content_conn, 123, 0).unwrap();

        // 감독을 활성 로스터에 잘못 포함시키면(9명으로 카운트) 정원 미달 판정이
        // 흔들릴 수 있다 — 감독 행 자체는 여전히 팀당 1개여야 한다(중복 생성 없음).
        let manager_count: i64 =
            slot_conn.query_row("SELECT count(*) FROM npc WHERE team_id = 'team:a' AND position = '감독'", [], |r| r.get(0)).unwrap();
        assert_eq!(manager_count, 1);
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
        assert_eq!(count, (LEAGUE_IDS.len() as i64) * 5); // 1 team * (roster_size 4 + 감독 1명) per league
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
        assert_eq!(current_day(&slot_conn), crate::calendar::season_length(1), "시즌 1 길이만큼 정확히 전진 후 롤오버해야 함");
        let inbox_count: i64 = slot_conn.query_row("SELECT count(*) FROM inbox", [], |r| r.get(0)).unwrap();
        assert_eq!(inbox_count, 0, "season boundary should clear inbox");
        let season: String = slot_conn
            .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(season, "1");
        assert!(integrity_sig(&slot_conn).is_some());
    }

    #[test]
    fn advance_short_circuits_once_the_protagonist_has_retired() {
        let mut slot_conn = slot::open_in_memory().unwrap();
        let content_conn = content::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury, retired, retirement_reason)
                 VALUES ('proto:1', '은퇴선수', '우투', '강속구형', '{}', '{}', '{}', '{}', '[]', '{}', '{}', 1, 'voluntary')",
                [],
            )
            .unwrap();
        slot_conn
            .execute(
                "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES ('retirement:1', 'retirement', 'urgent', 1, '{}')",
                [],
            )
            .unwrap();

        let pending = advance(&mut slot_conn, &content_conn).unwrap();

        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].kind, "retirement");
        assert_eq!(current_day(&slot_conn), 0, "은퇴 후엔 advance()가 하루도 더 전진하면 안 됨");
    }

    #[test]
    fn resolve_choice_retirement_just_dismisses_the_pending_action() {
        let slot_conn = slot::open_in_memory().unwrap();
        let content_conn = content::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO pending_actions (id, type, urgency, created_day, payload) VALUES ('retirement:1', 'retirement', 'urgent', 1, '{\"reason\":\"voluntary\"}')",
                [],
            )
            .unwrap();

        let step = resolve_choice(&slot_conn, &content_conn, 1, "retirement:1", "확인").unwrap();

        assert!(step.is_none());
        let count: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn advance_stops_at_protagonist_game_day_and_resolve_unblocks_it() {
        let mut slot_conn = slot::open_in_memory().unwrap();
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:x', 'league:hs', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:y', 'league:hs', NULL, NULL)", []).unwrap();
        insert_minimal_roster(&slot_conn, "team:x");
        insert_minimal_roster(&slot_conn, "team:y");
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                 VALUES ('proto:1', '주인공', '우투', '강속구형', ?1, '{}', '{\"피로도\":0}', '{}', '[\"포심 패스트볼\"]', '{\"team_id\":\"team:x\"}', '{}')",
                params![serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
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

        // "자동" 모드 — 매치 세션이 한 번에 끝까지 진행돼 GameOver로 귀결된다.
        let step = resolve_choice(&slot_conn, &content_conn, 999, &pending[0].id, "자동").unwrap();
        assert!(matches!(step, Some(match_session::MatchStepResult::GameOver { .. })));
        let remaining: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0);
        let result_raw: Option<String> = slot_conn.query_row("SELECT result FROM schedule WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        assert!(result_raw.is_some(), "the protagonist's own game should now have a recorded result");

        // 시즌 경계(364일)를 넘기면 season_rollover가 다음 시즌 일정을
        // 다시 만든다(§6-36에서 고친 버그 — 예전엔 이 재생성이 없어서
        // 시즌 2부터 영원히 경기가 안 열렸다) — 그래서 이 2팀짜리 리그도
        // 새 시즌에 또 한 번 맞대결이 잡혀야 한다.
        let pending2 = advance(&mut slot_conn, &content_conn).unwrap();
        assert_eq!(pending2.len(), 1);
        assert_eq!(pending2[0].kind, "game");
        assert!(pending2[0].created_day > 364, "새로 생성된 경기는 다음 시즌(365일 이후)이어야 함");
        assert!(current_day(&slot_conn) > 5);
    }

    #[test]
    fn resolve_choice_wraps_a_pitcher_change_decision_into_a_pending_action() {
        let mut triggered = false;
        for seed in 0..30i64 {
            let mut slot_conn = slot::open_in_memory().unwrap();
            let content_conn = content::open_in_memory().unwrap();
            content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
            content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:x', 'league:hs', NULL, NULL)", []).unwrap();
            content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:y', 'league:hs', NULL, NULL)", []).unwrap();
            insert_minimal_roster(&slot_conn, "team:x");
            insert_minimal_roster(&slot_conn, "team:y");
            slot_conn
                .execute(
                    "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                     VALUES ('proto:1', '주인공', '우투', '강속구형', ?1, '{}', '{\"피로도\":0}', '{}', '[\"포심 패스트볼\"]', '{\"team_id\":\"team:x\"}', '{}')",
                    params![serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
                )
                .unwrap();
            slot_conn.execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 5, 'team:x', 'team:y', NULL)", []).unwrap();

            let pending = advance(&mut slot_conn, &content_conn).unwrap();
            let step = resolve_choice(&slot_conn, &content_conn, seed, &pending[0].id, "수동").unwrap();
            assert!(matches!(step, Some(match_session::MatchStepResult::AwaitingPitch { .. })));

            // 소프트캡을 이미 넘긴 상태로 미리 채워 다음 하프이닝 경계에서
            // 반드시 PitcherChangeDecision이 뜨게 만든다.
            slot_conn.execute("UPDATE match_session SET pitch_seq = 200 WHERE id = 1", []).unwrap();

            let mut action_id = list_pending_actions(&slot_conn).unwrap()[0].id.clone();
            for _ in 0..200 {
                let step = resolve_choice(&slot_conn, &content_conn, seed, &action_id, "포심 패스트볼:MidCenter").unwrap();
                match step {
                    Some(match_session::MatchStepResult::PitcherChangeDecision { pitches_thrown, .. }) => {
                        let pending = list_pending_actions(&slot_conn).unwrap();
                        assert_eq!(pending.len(), 1);
                        assert_eq!(pending[0].kind, "pitcherChange");
                        let payload: serde_json::Value = serde_json::from_str(&pending[0].payload).unwrap();
                        assert_eq!(payload["pitches_thrown"], pitches_thrown);
                        assert!(payload.get("manager_recommends_pull").is_some());
                        triggered = true;
                        break;
                    }
                    Some(match_session::MatchStepResult::AwaitingPitch { .. }) | Some(match_session::MatchStepResult::GameOver { .. }) => {
                        let next = list_pending_actions(&slot_conn).unwrap();
                        if next.is_empty() {
                            break; // 게임 종료
                        }
                        action_id = next[0].id.clone();
                    }
                    None => break,
                }
            }
            if triggered {
                break;
            }
        }
        assert!(triggered, "expected at least one seed to reach a half-inning boundary and surface a pitcherChange pending action");
    }

    #[test]
    fn resolve_choice_chains_pitch_pending_actions_through_a_manual_game() {
        let mut slot_conn = slot::open_in_memory().unwrap();
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:x', 'league:hs', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:y', 'league:hs', NULL, NULL)", []).unwrap();
        insert_minimal_roster(&slot_conn, "team:x");
        insert_minimal_roster(&slot_conn, "team:y");
        slot_conn
            .execute(
                "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
                 VALUES ('proto:1', '주인공', '우투', '강속구형', ?1, '{}', '{\"피로도\":0}', '{}', '[\"포심 패스트볼\"]', '{\"team_id\":\"team:x\"}', '{}')",
                params![serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
            )
            .unwrap();
        slot_conn
            .execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 5, 'team:x', 'team:y', NULL)", [])
            .unwrap();

        let pending = advance(&mut slot_conn, &content_conn).unwrap();
        assert_eq!(pending[0].kind, "game");

        // "수동" 모드로 응답 — 매 구 AwaitingPitch로 멈추고 'pitch' PendingAction이 새로 생겨야 한다.
        let step = resolve_choice(&slot_conn, &content_conn, 1234, &pending[0].id, "수동").unwrap();
        assert!(matches!(step, Some(match_session::MatchStepResult::AwaitingPitch { .. })));
        let pitch_pending: Vec<PendingActionRow> = list_pending_actions(&slot_conn).unwrap();
        assert_eq!(pitch_pending.len(), 1);
        assert_eq!(pitch_pending[0].kind, "pitch");

        // 계속 같은 코스로 응답해가며 경기가 실제로 끝나는지 확인.
        let mut action_id = pitch_pending[0].id.clone();
        let mut guard = 0;
        loop {
            let step = resolve_choice(&slot_conn, &content_conn, 1234, &action_id, "포심 패스트볼:MidCenter").unwrap();
            match step {
                Some(match_session::MatchStepResult::GameOver { .. }) => break,
                Some(match_session::MatchStepResult::AwaitingPitch { .. }) => {
                    let next: Vec<PendingActionRow> = list_pending_actions(&slot_conn).unwrap();
                    assert_eq!(next.len(), 1, "exactly one live 'pitch' PendingAction should exist at a time");
                    action_id = next[0].id.clone();
                }
                // 이 루프는 매번 같은 문자열("포심 패스트볼:MidCenter")을 보내는데,
                // 'pitcherChange' 액션엔 "교체"/"유지"가 아닌 임의 문자열이 곧
                // "맡기기"(AI 판정에 위임)라 그대로 재사용해도 안전하게 진행된다.
                Some(match_session::MatchStepResult::PitcherChangeDecision { .. }) => {
                    let next: Vec<PendingActionRow> = list_pending_actions(&slot_conn).unwrap();
                    assert_eq!(next.len(), 1, "exactly one live PendingAction should exist at a time");
                    action_id = next[0].id.clone();
                }
                None => panic!("expected a match_session step result"),
            }
            guard += 1;
            assert!(guard < 5000, "manual game via resolve_choice did not finish in time");
        }

        let remaining: i64 = slot_conn.query_row("SELECT count(*) FROM pending_actions", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0, "no dangling pending actions once the game ends");
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

        let slot_conn = slot::open_in_memory().unwrap();
        generate_schedule(&slot_conn, &content_conn, 42, "league:univ", 0, 1).unwrap();

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
    fn process_day_accumulates_fatigue_for_the_starting_pitcher_and_batters() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)", []).unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        insert_minimal_roster(&slot_conn, "team:b");
        slot_conn
            .execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 10, 'team:a', 'team:b', NULL)", [])
            .unwrap();

        process_day(&slot_conn, &content_conn, 777, 10).unwrap();

        let pitcher_fatigue: f64 = slot_conn
            .query_row("SELECT live_state FROM npc WHERE id = 'team:a_sp'", [], |r| r.get::<_, String>(0))
            .map(|raw| serde_json::from_str::<serde_json::Value>(&raw).unwrap().get("피로도").unwrap().as_f64().unwrap())
            .unwrap();
        assert!(pitcher_fatigue > 0.0, "starting pitcher should accumulate fatigue after pitching");

        let batter_fatigue: f64 = slot_conn
            .query_row("SELECT live_state FROM npc WHERE id = 'team:a_b0'", [], |r| r.get::<_, String>(0))
            .map(|raw| serde_json::from_str::<serde_json::Value>(&raw).unwrap().get("피로도").unwrap().as_f64().unwrap())
            .unwrap();
        assert!(batter_fatigue > 0.0, "batter in the lineup pool should accumulate fatigue after the game");
    }

    #[test]
    fn process_day_records_acute_injuries_for_heavily_fatigued_participants() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)", []).unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        insert_minimal_roster(&slot_conn, "team:b");
        slot_conn
            .execute(
                "UPDATE npc SET live_state = ?1",
                params![serde_json::json!({"피로도": 5000.0, "사기": 50.0}).to_string()],
            )
            .unwrap();
        slot_conn
            .execute("INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 10, 'team:a', 'team:b', NULL)", [])
            .unwrap();

        process_day(&slot_conn, &content_conn, 42, 10).unwrap();

        let mut stmt = slot_conn.prepare("SELECT injury FROM npc").unwrap();
        let injured_count = stmt
            .query_map([], |r| r.get::<_, Option<String>>(0))
            .unwrap()
            .map(|raw| raw.unwrap())
            .filter(|raw| match raw {
                Some(raw) => {
                    let injury: serde_json::Value = serde_json::from_str(raw).unwrap();
                    !injury.get("history").unwrap().as_array().unwrap().is_empty()
                }
                None => false,
            })
            .count();
        assert!(injured_count > 0, "expected at least one acute injury from a full game at fatigue=5000");
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
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:a', 'league:x', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:b', 'league:x', NULL, NULL)", []).unwrap();

        let conn = slot::open_in_memory().unwrap();
        conn.execute("INSERT INTO standings (team_id, w, l, t, rank) VALUES ('team:a', 10, 5, 0, 0)", []).unwrap();
        conn.execute("INSERT INTO standings (team_id, w, l, t, rank) VALUES ('team:b', 3, 12, 0, 0)", []).unwrap();
        conn.execute(
            "INSERT INTO schedule (game_id, day, home, away, result) VALUES ('game:1', 1, 'team:a', 'team:b', NULL)",
            [],
        )
        .unwrap();

        season_rollover(&conn, &content_conn, 364).unwrap();

        let standings_count: i64 = conn.query_row("SELECT count(*) FROM standings", [], |r| r.get(0)).unwrap();
        assert_eq!(standings_count, 0);
        let schedule_count: i64 = conn.query_row("SELECT count(*) FROM schedule", [], |r| r.get(0)).unwrap();
        assert_eq!(schedule_count, 0);

        let rank_a: i64 = conn
            .query_row("SELECT rank FROM history_standings WHERE season = 0 AND team_id = 'team:a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rank_a, 1, "team:a has the better win% and should rank 1st");
    }

    #[test]
    fn season_rollover_wires_up_protagonist_contract_processing() {
        let content_conn = build_market_content_db();
        let mut triggered = false;
        for seed in 0..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            slot_conn.execute("UPDATE meta SET world_seed = ?1", params![seed]).unwrap();
            insert_market_protagonist(&slot_conn, &serde_json::json!({"team_id": "team:poor_a", "salary": 20000, "years_remaining": 3}), 0.0);
            insert_game_log_grades(&slot_conn, 0, &["F", "F", "F"]);

            season_rollover(&slot_conn, &content_conn, 364).unwrap();

            let contract = read_contract(&slot_conn);
            if contract.get("team_id").map(serde_json::Value::is_null).unwrap_or(false) {
                assert!(list_pending_actions(&slot_conn).unwrap().iter().any(|p| p.kind == "contractNego"));
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected season_rollover to invoke process_protagonist_contract and eventually release a bad-fit player");
    }

    #[test]
    fn retire_excludes_player_from_batting_lineup() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        let before = load_batting_lineup(&slot_conn, "team:a").unwrap();
        assert_eq!(before.len(), 8);

        retire(&slot_conn, "team:a_b0").unwrap();

        let after = load_batting_lineup(&slot_conn, "team:a").unwrap();
        assert_eq!(after.len(), 7);
        assert!(!after.iter().any(|b| b.id == "team:a_b0"));
    }

    #[test]
    fn enlist_excludes_from_lineup_and_discharge_restores_it() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");

        enlist(&slot_conn, "team:a_b0", 100).unwrap();
        let while_serving = load_batting_lineup(&slot_conn, "team:a").unwrap();
        assert_eq!(while_serving.len(), 7);
        assert!(!while_serving.iter().any(|b| b.id == "team:a_b0"));

        let (return_day, served): (i64, i64) = slot_conn
            .query_row("SELECT military_return_day, military_served FROM npc WHERE id = 'team:a_b0'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(return_day, 100 + crate::sim::npc::MILITARY_SERVICE_DAYS);
        assert_eq!(served, 1);

        discharge(&slot_conn, "team:a_b0").unwrap();
        let after_discharge = load_batting_lineup(&slot_conn, "team:a").unwrap();
        assert_eq!(after_discharge.len(), 8);
        assert!(after_discharge.iter().any(|b| b.id == "team:a_b0"));
    }

    #[test]
    fn process_week_auto_discharges_once_return_day_is_reached() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        enlist(&slot_conn, "team:a_b0", 10).unwrap();

        let return_day: i64 =
            slot_conn.query_row("SELECT military_return_day FROM npc WHERE id = 'team:a_b0'", [], |r| r.get(0)).unwrap();

        process_week(&slot_conn, &content_conn, 1, return_day).unwrap();

        let after: Option<i64> =
            slot_conn.query_row("SELECT military_return_day FROM npc WHERE id = 'team:a_b0'", [], |r| r.get(0)).unwrap();
        assert!(after.is_none(), "player should be auto-discharged once the current day reaches military_return_day");
    }

    #[test]
    fn process_week_applies_military_decline_instead_of_growth_while_enlisted() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_test_player(
            &slot_conn,
            "npc:soldier",
            "team:a",
            "타자",
            serde_json::json!({"파워": 50.0, "스피드": 50.0, "체력": 50.0, "컨택": 50.0, "선구안": 50.0, "수비": 50.0, "클러치": 50.0, "침착함": 50.0, "리더십": 50.0, "천재성": 80.0, "인성": 50.0, "성실함": 50.0}),
        );
        enlist(&slot_conn, "npc:soldier", 1).unwrap();

        process_week(&slot_conn, &content_conn, 1, 8).unwrap();

        let stats = read_stats(&slot_conn, "npc:soldier");
        let power = stats.get("파워").unwrap().as_f64().unwrap();
        assert!(power < 50.0, "physical stat should decline during service, got {power}");
        assert_eq!(stats.get("컨택").unwrap().as_f64().unwrap(), 50.0, "technical stat must not change during service");
    }

    #[test]
    fn season_rollover_auto_enlists_eligible_players() {
        let content_conn = build_freshmen_content_db(
            "league:pro",
            "team:p1",
            r#"{"roster_size":1,"pitcher_ratio":0.0,"sp_ratio":0.0,"stat_min":20.0,"stat_max":80.0}"#,
        );
        let slot_conn = slot::open_in_memory().unwrap();
        let stats = serde_json::json!({"파워": 50.0, "스피드": 50.0, "체력": 50.0, "컨택": 50.0, "선구안": 50.0, "수비": 50.0, "클러치": 50.0, "침착함": 50.0, "리더십": 50.0, "천재성": 50.0, "인성": 50.0, "성실함": 50.0});
        let injury = serde_json::json!({"current": null, "history": []});
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES ('npc:eligible', '입대대상', 'team:p1', '타자', 28, 1, 0, 50.0, '{}', ?1, '{}', '{}', NULL, ?2)",
                params![stats.to_string(), injury.to_string()],
            )
            .unwrap();

        season_rollover(&slot_conn, &content_conn, 364).unwrap();

        let (return_day, served): (Option<i64>, i64) = slot_conn
            .query_row("SELECT military_return_day, military_served FROM npc WHERE id = 'npc:eligible'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert!(return_day.is_some(), "a 28(+1=29)yo player should be auto-enlisted at season boundary");
        assert_eq!(served, 1);
    }

    fn build_freshmen_content_db(league_id: &str, team_id: &str, rules: &str) -> Connection {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES (?1, NULL)", [league_id]).unwrap();
        content_conn
            .execute("INSERT INTO teams (id, league_id, color, meta) VALUES (?1, ?2, NULL, NULL)", params![team_id, league_id])
            .unwrap();
        content_conn
            .execute(
                "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES (?1, '전통/정통', '안정', '중견')",
                [team_id],
            )
            .unwrap();
        content_conn.execute("INSERT INTO generation_rules (league_id, rules) VALUES (?1, ?2)", params![league_id, rules]).unwrap();
        content_conn
            .execute("INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_surname', 'kr', 'surname', '[\"김\"]')", [])
            .unwrap();
        content_conn
            .execute("INSERT INTO name_pools (id, locale, kind, names) VALUES ('namepool:kr_given', 'kr', 'given', '[\"민준\"]')", [])
            .unwrap();
        content_conn
            .execute("INSERT INTO pitch_types (id, family, name, meta) VALUES ('pitch:four_seam', '패스트볼류', '포심 패스트볼', NULL)", [])
            .unwrap();
        content_conn
    }

    #[test]
    fn generate_freshmen_tops_up_missing_roster_slots() {
        let content_conn = build_freshmen_content_db(
            "league:hs",
            "team:h1",
            r#"{"roster_size":6,"pitcher_ratio":0.5,"sp_ratio":0.5,"stat_min":20.0,"stat_max":80.0}"#,
        );
        let slot_conn = slot::open_in_memory().unwrap();
        insert_test_player(&slot_conn, "npc:h1_existing1", "team:h1", "타자", serde_json::json!({"파워": 50.0}));
        insert_test_player(&slot_conn, "npc:h1_existing2", "team:h1", "타자", serde_json::json!({"파워": 50.0}));

        generate_freshmen(&slot_conn, &content_conn, 42, 5).unwrap();

        let active_count: i64 =
            slot_conn.query_row("SELECT count(*) FROM npc WHERE team_id = 'team:h1' AND retired = 0", [], |r| r.get(0)).unwrap();
        assert_eq!(active_count, 6, "2 existing + 4 freshmen should fill the 6-player roster");
    }

    #[test]
    fn season_rollover_retires_ancient_players_and_backfills_active_roster() {
        let content_conn = build_freshmen_content_db(
            "league:pro",
            "team:p1",
            r#"{"roster_size":3,"pitcher_ratio":0.34,"sp_ratio":1.0,"stat_min":20.0,"stat_max":80.0}"#,
        );

        let slot_conn = slot::open_in_memory().unwrap();
        let stats = serde_json::json!({"파워": 50.0, "스피드": 50.0, "체력": 50.0, "컨택": 50.0, "선구안": 50.0, "수비": 50.0, "클러치": 50.0, "침착함": 50.0, "리더십": 50.0, "천재성": 50.0, "인성": 50.0, "성실함": 50.0});
        let injury = serde_json::json!({"current": null, "history": []});
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES ('npc:ancient', '노장', 'team:p1', '타자', 70, 1, 0, 50.0, '{}', ?1, '{}', '{}', NULL, ?2)",
                params![stats.to_string(), injury.to_string()],
            )
            .unwrap();
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES ('npc:other1', '기타1', 'team:p1', '타자', 25, 1, 0, 50.0, '{}', ?1, '{}', '{}', NULL, ?2)",
                params![stats.to_string(), injury.to_string()],
            )
            .unwrap();
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES ('npc:other2', '기타2', 'team:p1', '선발투수', 25, 1, 0, 50.0, '{}', ?1, '{}', '{}', NULL, ?2)",
                params![stats.to_string(), injury.to_string()],
            )
            .unwrap();

        for i in 0..15i64 {
            season_rollover(&slot_conn, &content_conn, 364 * (i + 1)).unwrap();
        }

        let retired: i64 = slot_conn.query_row("SELECT retired FROM npc WHERE id = 'npc:ancient'", [], |r| r.get(0)).unwrap();
        assert_eq!(retired, 1, "a 70+yo player in a max-age-40 league should retire within 15 seasons");

        // >=3 rather than ==3: replacement freshmen are generated within the
        // league's full age band (20~40 for pro), so a replacement can itself
        // already be past the military conscription age and get enlisted —
        // this test never calls process_week, so discharge (which only fires
        // there) can't clear it, and generate_freshmen keeps backfilling.
        // That's a real, harmless consequence of the two systems interacting
        // outside their normal weekly cadence, not a roster-shrinkage bug.
        let active_count: i64 =
            slot_conn.query_row("SELECT count(*) FROM npc WHERE team_id = 'team:p1' AND retired = 0", [], |r| r.get(0)).unwrap();
        assert!(active_count >= 3, "roster should never shrink below roster_size after retirements, got {active_count}");
    }

    #[test]
    fn simulate_series_stops_as_soon_as_majority_is_reached() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_minimal_roster(&slot_conn, "team:a");
        insert_minimal_roster(&slot_conn, "team:b");
        let _ = &content_conn; // unused here — simulate_series only needs slot_conn

        let mut rng = ChaCha8Rng::seed_from_u64(5);
        let (winner, games) = simulate_series(&slot_conn, &mut rng, "league:pro", "team:a", "team:b", 7).unwrap();
        assert!(winner == "team:a" || winner == "team:b");
        assert!(games >= 4 && games <= 7, "best-of-7 must end between 4 and 7 games, got {games}");
    }

    fn build_independent_content_db() -> Connection {
        let conn = content::open_in_memory().unwrap();
        conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:independent', NULL)", []).unwrap();
        for i in 0..10 {
            conn.execute(
                "INSERT INTO teams (id, league_id, color, meta) VALUES (?1, 'league:independent', NULL, NULL)",
                params![format!("team:i{i}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES (?1, '전통/정통', '안정', '중견')",
                params![format!("team:i{i}")],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn run_independent_season_narrows_ten_teams_down_to_one_champion() {
        let content_conn = build_independent_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        for i in 0..10 {
            insert_minimal_roster(&slot_conn, &format!("team:i{i}"));
        }

        let champion = run_independent_season(&slot_conn, &content_conn, 4242, 1).unwrap();
        assert!(champion.starts_with("team:i"));

        // 3단계 게임 수: 1차 10팀 laps2(18일*5경기=90) + 2차 8팀 laps2(14일*4경기=56)
        // + 3차 4팀 laps1(3일*2경기=6) = 152, 포스트시즌(준PO+PO+챔피언 최대 5경기)은
        // schedule에 안 남으므로(4차는 series라 별도 기록) 최소 152개는 있어야 함.
        let scheduled_games: i64 = slot_conn.query_row("SELECT count(*) FROM schedule", [], |r| r.get(0)).unwrap();
        assert!(scheduled_games >= 90 + 56 + 6, "expected at least 152 recorded stage games, got {scheduled_games}");

        let champion_txn: i64 = slot_conn
            .query_row("SELECT count(*) FROM league_transactions WHERE kind = 'champion'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(champion_txn, 1);
    }

    #[test]
    fn run_pro_postseason_returns_none_without_enough_standings() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:pro', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:p0', 'league:pro', NULL, NULL)", []).unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        let result = run_pro_postseason(&slot_conn, &content_conn, 1, 364).unwrap();
        assert!(result.is_none(), "fewer than 5 standings rows should skip the postseason");
    }

    #[test]
    fn run_pro_postseason_crowns_a_champion_from_top_five_standings() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:pro', NULL)", []).unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        for i in 0..5 {
            let team_id = format!("team:p{i}");
            content_conn
                .execute(
                    "INSERT INTO teams (id, league_id, color, meta) VALUES (?1, 'league:pro', NULL, NULL)",
                    params![team_id],
                )
                .unwrap();
            insert_minimal_roster(&slot_conn, &team_id);
            // seed win% so team:p0 is 1st seed .. team:p4 is 5th seed
            let wins = 20 - (i * 2);
            slot_conn
                .execute(
                    "INSERT INTO standings (team_id, w, l, t, rank) VALUES (?1, ?2, ?3, 0, 0)",
                    params![team_id, wins, 20 - wins],
                )
                .unwrap();
        }

        let champion = run_pro_postseason(&slot_conn, &content_conn, 99, 364).unwrap();
        assert!(champion.is_some());
        assert!(champion.unwrap().starts_with("team:p"));

        let champion_txn: i64 = slot_conn
            .query_row("SELECT count(*) FROM league_transactions WHERE kind = 'champion'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(champion_txn, 1);
    }

    #[test]
    fn standard_seed_order_matches_known_bracket_layout() {
        assert_eq!(standard_seed_order(1), vec![1]);
        assert_eq!(standard_seed_order(2), vec![1, 2]);
        assert_eq!(standard_seed_order(8), vec![1, 8, 4, 5, 2, 7, 3, 6]);
    }

    #[test]
    fn standard_seed_order_byes_never_pair_with_each_other() {
        // for every practical (n_teams, bracket_size) pair used by the 8
        // tournaments (byes <= bracket_size/2), round-1 pairs must never be
        // (bye, bye) — otherwise simulate_knockout_bracket would silently
        // drop a bracket slot (the (None, None) arm).
        for (n_teams, bracket_size) in [(48usize, 64usize), (102, 128), (24, 32), (5, 8)] {
            let order = standard_seed_order(bracket_size);
            for pair in order.chunks(2) {
                let both_byes = pair[0] > n_teams && pair[1] > n_teams;
                assert!(!both_byes, "byes {pair:?} paired together for n_teams={n_teams} bracket={bracket_size}");
            }
        }
    }

    fn insert_team_with_stadium(content_conn: &Connection, team_id: &str, league_id: &str, stadium_id: &str) {
        content_conn
            .execute(
                "INSERT INTO teams (id, league_id, color, meta, stadium_id) VALUES (?1, ?2, NULL, NULL, ?3)",
                params![team_id, league_id, stadium_id],
            )
            .unwrap();
    }

    fn set_standings(slot_conn: &Connection, team_id: &str, w: i64, l: i64) {
        slot_conn
            .execute(
                "INSERT INTO standings (team_id, w, l, t, rank) VALUES (?1, ?2, ?3, 0, 0)
                 ON CONFLICT(team_id) DO UPDATE SET w = excluded.w, l = excluded.l",
                params![team_id, w, l],
            )
            .unwrap();
    }

    #[test]
    fn simulate_knockout_bracket_reduces_any_team_count_to_one_champion() {
        let slot_conn = slot::open_in_memory().unwrap();
        for n in [2usize, 3, 5, 8, 9] {
            let teams: Vec<String> = (0..n).map(|i| format!("team:k{n}_{i}")).collect();
            for t in &teams {
                insert_minimal_roster(&slot_conn, t);
            }
            let mut rng = ChaCha8Rng::seed_from_u64(n as u64);
            let champion = simulate_knockout_bracket(&slot_conn, &mut rng, "league:hs", &teams).unwrap();
            assert!(teams.contains(&champion), "champion must be one of the {n} entrants");
        }
    }

    /// 대학 5조 × 5팀(조당) = 25팀 — 왕중왕전(리더5+WC3=8)·은하기(상위4×5+WC4=24)·
    /// 여명기(상위3×5+WC5=20) 세 대회 전부 remainder 풀이 바닥나지 않게 조당
    /// 5팀으로 잡았다(조당 4팀이면 은하기 WC 후보가 0명이 됨).
    fn build_univ_tournament_db() -> (Connection, Connection) {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:univ', NULL)", []).unwrap();
        let stadiums = ["stadium:mireu", "stadium:byeolbit", "stadium:geumgang_univ", "stadium:noeul", "stadium:taejong"];
        for s in stadiums {
            content_conn.execute("INSERT INTO stadiums (id, name, park_factor, meta) VALUES (?1, ?1, '중립', NULL)", [s]).unwrap();
        }

        let slot_conn = slot::open_in_memory().unwrap();
        for (gi, stadium) in stadiums.iter().enumerate() {
            for i in 0..5 {
                let team_id = format!("team:u{gi}_{i}");
                insert_team_with_stadium(&content_conn, &team_id, "league:univ", stadium);
                insert_minimal_roster(&slot_conn, &team_id);
                // rank within group: i=0 is best (most wins)
                set_standings(&slot_conn, &team_id, (10 - i) as i64, i as i64);
            }
        }
        (content_conn, slot_conn)
    }

    #[test]
    fn run_univ_wangjungwang_crowns_a_champion_from_eight_teams() {
        let (content_conn, slot_conn) = build_univ_tournament_db();
        let champion = run_univ_wangjungwang(&slot_conn, &content_conn, 1).unwrap();
        assert!(champion.starts_with("team:u"));
        let txn: i64 = slot_conn
            .query_row(
                "SELECT count(*) FROM league_transactions WHERE kind = 'champion' AND id LIKE 'txn:univ_wangjungwang%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(txn, 1);
    }

    #[test]
    fn run_univ_eunhagi_runs_prelim_groups_then_crowns_a_champion() {
        let (content_conn, slot_conn) = build_univ_tournament_db();
        let champion = run_univ_eunhagi(&slot_conn, &content_conn, 2, 1).unwrap();
        assert!(champion.starts_with("team:u"));

        // 8 groups of 3 teams, single round robin -> 3 games/group = 24 games total.
        let prelim_games: i64 = slot_conn
            .query_row("SELECT count(*) FROM schedule WHERE game_id LIKE 'game:univ_eunhagi_prelim_%'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(prelim_games, 24);
    }

    #[test]
    fn run_univ_yeongmyeonggi_runs_prelim_groups_then_crowns_a_champion() {
        let (content_conn, slot_conn) = build_univ_tournament_db();
        let champion = run_univ_yeongmyeonggi(&slot_conn, &content_conn, 3, 1).unwrap();
        assert!(champion.starts_with("team:u"));

        // 4 groups of 5 teams, single round robin -> 10 games/group = 40 games total.
        let prelim_games: i64 = slot_conn
            .query_row("SELECT count(*) FROM schedule WHERE game_id LIKE 'game:univ_yeongmyeonggi_prelim_%'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(prelim_games, 40);
    }

    /// 고교 8권역 — 4개 대권역(서울·경인·호남·부경울에 대응하는 split 구장)은
    /// 8팀씩, 4개 단일권역(강원·충청·대구경북·제주에 대응)은 5팀씩(52팀 총).
    /// 무궁화기(소권역당3 = 대권역쿼터6/단일쿼터3)가 WC12 후보 풀을 남기려면
    /// 대권역 8팀(쿼터6→잔여2), 단일권역 5팀(쿼터3→잔여2)이 필요해 이 크기로
    /// 잡았다.
    fn build_hs_tournament_db() -> (Connection, Connection) {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        let split_regions = HS_SPLIT_REGION_STADIUMS;
        let single_regions = ["stadium:seorak_hs", "stadium:gyeryong", "stadium:palgong", "stadium:halla"];
        for s in split_regions.iter().chain(single_regions.iter()) {
            content_conn.execute("INSERT INTO stadiums (id, name, park_factor, meta) VALUES (?1, ?1, '중립', NULL)", [s]).unwrap();
        }

        let slot_conn = slot::open_in_memory().unwrap();
        for stadium in split_regions {
            for i in 0..8 {
                let team_id = format!("team:h_{stadium}_{i}");
                insert_team_with_stadium(&content_conn, &team_id, "league:hs", stadium);
                insert_minimal_roster(&slot_conn, &team_id);
                set_standings(&slot_conn, &team_id, (16 - i) as i64, i as i64);
            }
        }
        for stadium in single_regions {
            for i in 0..5 {
                let team_id = format!("team:h_{stadium}_{i}");
                insert_team_with_stadium(&content_conn, &team_id, "league:hs", stadium);
                insert_minimal_roster(&slot_conn, &team_id);
                set_standings(&slot_conn, &team_id, (10 - i) as i64, i as i64);
            }
        }
        (content_conn, slot_conn)
    }

    fn assert_single_champion_txn(slot_conn: &Connection, purpose: &str) -> String {
        let champion: String = slot_conn
            .query_row(
                "SELECT detail FROM league_transactions WHERE kind = 'champion' AND id LIKE ?1",
                [format!("txn:{purpose}_champion_%")],
                |r| r.get(0),
            )
            .unwrap();
        assert!(champion.starts_with("team:h_"));
        champion
    }

    #[test]
    fn run_hs_gaenari_crowns_a_champion_from_region_seeds_and_wildcards() {
        let (content_conn, slot_conn) = build_hs_tournament_db();
        run_hs_gaenari(&slot_conn, &content_conn, 10).unwrap();
        assert_single_champion_txn(&slot_conn, "hs_gaenari");
    }

    #[test]
    fn run_hs_jangmi_crowns_a_champion() {
        let (content_conn, slot_conn) = build_hs_tournament_db();
        run_hs_jangmi(&slot_conn, &content_conn, 11).unwrap();
        assert_single_champion_txn(&slot_conn, "hs_jangmi");
    }

    #[test]
    fn run_hs_mugunghwa_crowns_a_champion_with_full_forty_eight_field() {
        let (content_conn, slot_conn) = build_hs_tournament_db();
        run_hs_mugunghwa(&slot_conn, &content_conn, 12).unwrap();
        assert_single_champion_txn(&slot_conn, "hs_mugunghwa");
    }

    #[test]
    fn run_hs_paewang_crowns_a_champion_without_wildcards() {
        let (content_conn, slot_conn) = build_hs_tournament_db();
        run_hs_paewang(&slot_conn, &content_conn, 13).unwrap();
        assert_single_champion_txn(&slot_conn, "hs_paewang");
    }

    #[test]
    fn run_hs_gukhwa_crowns_a_champion_from_the_entire_league() {
        let (content_conn, slot_conn) = build_hs_tournament_db();
        run_hs_gukhwa(&slot_conn, &content_conn, 14).unwrap();
        assert_single_champion_txn(&slot_conn, "hs_gukhwa");
    }

    fn read_stats(conn: &Connection, id: &str) -> serde_json::Value {
        let raw: String = conn.query_row("SELECT stats FROM npc WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn process_week_grows_active_npc_stats_over_many_weeks() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_test_player(
            &slot_conn,
            "npc:grow1",
            "team:a",
            "타자",
            serde_json::json!({"파워": 20.0, "스피드": 20.0, "체력": 20.0, "컨택": 20.0, "선구안": 20.0, "수비": 20.0, "클러치": 20.0, "침착함": 20.0, "리더십": 20.0, "천재성": 80.0, "인성": 50.0, "성실함": 50.0}),
        );

        for week in 0..30i64 {
            process_week(&slot_conn, &content_conn, 1234, week * 7).unwrap();
        }

        let stats = read_stats(&slot_conn, "npc:grow1");
        let grew = stats.as_object().unwrap().iter().any(|(k, v)| {
            k != "천재성" && k != "인성" && k != "성실함" && v.as_f64().unwrap() > 20.0
        });
        assert!(grew, "expected at least one exposed stat to grow over 30 weeks, got {stats:?}");
    }

    #[test]
    fn process_week_skips_retired_players() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        let initial = serde_json::json!({"파워": 20.0, "스피드": 20.0, "체력": 20.0, "컨택": 20.0, "선구안": 20.0, "수비": 20.0, "클러치": 20.0, "침착함": 20.0, "리더십": 20.0, "천재성": 80.0, "인성": 50.0, "성실함": 50.0});
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches)
                 VALUES ('npc:retired1', '은퇴선수', 'team:a', '타자', 40, 1, 1, 50.0, '{}', ?1, '{}', '{}', NULL)",
                params![initial.to_string()],
            )
            .unwrap();

        for week in 0..30i64 {
            process_week(&slot_conn, &content_conn, 1234, week * 7).unwrap();
        }

        let stats = read_stats(&slot_conn, "npc:retired1");
        assert_eq!(stats, initial, "retired player's stats should never change");
    }

    fn read_injury(conn: &Connection, id: &str) -> serde_json::Value {
        let raw: String = conn.query_row("SELECT injury FROM npc WHERE id = ?1", [id], |r| r.get(0)).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    #[test]
    fn process_week_records_overuse_injury_for_fatigued_sparta_players() {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:x', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:sparta', 'league:x', NULL, NULL)", []).unwrap();
        content_conn
            .execute(
                "INSERT INTO team_traits (team_id, philosophy, resource, status) VALUES ('team:sparta', '스파르타(혹독훈련)', '안정', '중견')",
                [],
            )
            .unwrap();

        let slot_conn = slot::open_in_memory().unwrap();
        for i in 0..50 {
            let id = format!("npc:fatigued{i}");
            slot_conn
                .execute(
                    "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                     VALUES (?1, ?1, 'team:sparta', '타자', 25, 1, 0, 50.0, '{}', ?2, '{}', ?3, NULL, ?4)",
                    params![
                        id,
                        serde_json::json!({"파워": 50.0, "스피드": 50.0, "체력": 50.0, "컨택": 50.0, "선구안": 50.0, "수비": 50.0, "클러치": 50.0, "침착함": 50.0, "리더십": 50.0, "천재성": 50.0, "인성": 50.0, "성실함": 50.0}).to_string(),
                        serde_json::json!({"피로도": 100.0, "사기": 50.0}).to_string(),
                        serde_json::json!({"current": null, "history": []}).to_string(),
                    ],
                )
                .unwrap();
        }

        process_week(&slot_conn, &content_conn, 555, 7).unwrap();

        let injured_count: usize = (0..50)
            .filter(|i| {
                let injury = read_injury(&slot_conn, &format!("npc:fatigued{i}"));
                !injury.get("history").unwrap().as_array().unwrap().is_empty()
            })
            .count();
        assert!(injured_count > 0, "expected at least one overuse injury among 50 heavily-fatigued sparta players");
    }

    #[test]
    fn process_week_applies_aging_decline_to_physical_stats_only() {
        let content_conn = content::open_in_memory().unwrap();
        let slot_conn = slot::open_in_memory().unwrap();
        slot_conn
            .execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES ('npc:veteran', '베테랑', 'team:a', '선발투수', 35, 1, 0, 50.0, '{}', ?1, '{}', '{}', NULL, ?2)",
                params![
                    serde_json::json!({"구속": 50.0, "체력": 50.0, "회복력": 50.0, "제구": 50.0, "구위": 50.0, "경기운영": 50.0, "클러치": 50.0, "침착함": 50.0, "리더십": 50.0, "천재성": 20.0, "인성": 50.0, "성실함": 50.0}).to_string(),
                    serde_json::json!({"current": null, "history": []}).to_string(),
                ],
            )
            .unwrap();

        process_week(&slot_conn, &content_conn, 1, 7).unwrap();

        let stats = read_stats(&slot_conn, "npc:veteran");
        let velocity = stats.get("구속").unwrap().as_f64().unwrap();
        assert!((velocity - 49.95).abs() < 1e-9, "physical stat should decline for a 35yo past decline start age, got {velocity}");
        assert_eq!(stats.get("제구").unwrap().as_f64().unwrap(), 50.0, "technical stat must not decline");
    }
}