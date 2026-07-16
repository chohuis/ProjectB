use std::collections::HashMap;

use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::{content, match_session, slot};
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
        "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
         VALUES ('proto:1', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
        ],
    )?;
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

/// 주인공 주간 훈련 적용 — `process_week`(NPC 전용)과 별도로 둔다(협/한
/// 주인공은 `npc` 테이블에 없어 그쪽 쿼리에 안 걸림). 훈련 설정을 한
/// 번도 안 했으면(§`training IS NULL`) 조용히 아무 것도 안 함 — 플레이어가
/// 최소 1회는 설정해야 성장이 시작된다는 뜻이라 첫 세션엔 자연스러운
/// "아직 훈련 계획을 안 짰다"는 상태.
fn process_protagonist_week(slot_conn: &Connection, world_seed: i64, day: i64) -> anyhow::Result<()> {
    let row: Option<(String, String, String, Option<String>, String, String)> = slot_conn
        .query_row("SELECT stats, xp, live_state, training, pitches, contract FROM protagonist WHERE id = 'proto:1'", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .optional()?;
    let Some((stats_raw, xp_raw, live_state_raw, training_raw, pitches_raw, contract_raw)) = row else {
        return Ok(()); // 아직 캐릭터 생성 전
    };
    let Some(training_raw) = training_raw else {
        return Ok(()); // 훈련 설정을 아직 한 번도 안 함
    };

    let mut stats: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&stats_raw)?;
    let mut xp: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&xp_raw)?;
    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
    let mut training: serde_json::Value = serde_json::from_str(&training_raw)?;

    let genius = stats.get("천재성").and_then(|v| v.as_f64()).unwrap_or(50.0);

    let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
    let has_upcoming_start = match contract.get("team_id").and_then(|v| v.as_str()) {
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
                "SELECT count(*) FROM npc WHERE team_id = ?1 AND retired = 0 AND military_return_day IS NULL",
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

fn win_pct(w: i64, l: i64) -> f64 {
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
        params![format!("txn:indep_champion_{world_seed}"), postseason_day, champion],
    )?;
    Ok(champion)
}

/// 프로 5강 와일드카드 사다리 — 01_프로.md §4. `standings`에 league:pro 팀이
/// 5개 미만이면(정규시즌이 아직 안 끝났거나 합성 테스트 데이터) None. 챔피언은
/// `league_transactions`에 기록.
pub fn run_pro_postseason(slot_conn: &Connection, content_conn: &Connection, world_seed: i64) -> anyhow::Result<Option<String>> {
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
        "INSERT INTO league_transactions (id, day, kind, detail) VALUES (?1, 0, 'champion', ?2)",
        params![format!("txn:pro_champion_{world_seed}"), champion],
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
/// 같은 부위 재발이면 심각도 자동 한 단계 상승(08_부상_시스템.md §5),
/// 치료법은 감독/매니저 AI가 아직 없어 항상 "재활"(중간 옵션)로 고정하는
/// placeholder(§4 — "무리한 복귀"·"수술" 선택은 실제 의사결정 주체가
/// 필요해 I6 이후 스코프). 예상 복귀일 = day + 심각도별 이탈기간.
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

    let mut stmt =
        conn.prepare("SELECT id, team_id, position, age, stats, xp, live_state, injury, military_return_day FROM npc WHERE retired = 0")?;
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
fn process_month(_conn: &Connection, _day: i64) -> anyhow::Result<()> {
    Ok(())
}

/// 시즌 경계 — 시즌 카운터 증가, 인박스 비움(04_게임루프.md §1), **프로
/// 포스트시즌 실행**(I5 2차분 추가 — standings가 지워지기 전에 트리거),
/// standings를 **리그별로** history_standings에 압축(1차분의 "전체 뭉쳐서
/// 순위" placeholder를 이번에 리그별 정확한 순위로 개선) 후 다음 시즌을 위해
/// standings·schedule·season_stats 초기화. 시즌 평가·주목도 확정·방출판정·
/// 재계약/FA/드래프트·로스터 세대교체·투자정산은 sim/eval·sim/market·
/// generate_freshmen이 생긴 뒤 여기 채울 것 — 지금 호출하면 todo!() 패닉이라
/// 안 부름.
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
    run_pro_postseason(conn, content_conn, world_seed)?;

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
    conn.execute("UPDATE npc SET age = age + 1 WHERE retired = 0", [])?;
    // 복무 중(military_return_day가 NULL이 아님)인 선수는 은퇴·입대 판정
    // 둘 다 대상에서 뺀다 — 이미 다른 생애주기 이벤트가 진행 중.
    let mut stmt = conn.prepare("SELECT id, team_id, age, military_served FROM npc WHERE retired = 0 AND military_return_day IS NULL")?;
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
            process_week(&tx, content_conn, world_seed, today)?;
            process_protagonist_week(&tx, world_seed, today)?;
        }
        if today % 28 == 0 {
            process_month(&tx, today)?;
        }
        if today % 364 == 0 {
            season_rollover(&tx, content_conn, today)?;
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
        _ => None,
    };

    if let Some(match_session::MatchStepResult::AwaitingPitch { batter_id, balls, strikes, high_leverage }) = &step {
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
    fn process_protagonist_week_does_nothing_without_training_config() {
        let content_conn = build_hs_school_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        create_protagonist(&slot_conn, &content_conn, 1, "미설정", "우완", "team:hanseong_hs", "강속구형", None).unwrap();

        let before: String = slot_conn.query_row("SELECT stats FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        for week in 0..10i64 {
            process_protagonist_week(&slot_conn, 1, week * 7).unwrap();
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
            process_protagonist_week(&slot_conn, 1, week * 7).unwrap();
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
            process_protagonist_week(&slot_conn, 1, week * 7).unwrap();
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

        process_protagonist_week(&slot_conn, 1, 0).unwrap();

        let live_state_raw: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let live_state: serde_json::Value = serde_json::from_str(&live_state_raw).unwrap();
        let fatigue = live_state.get("피로도").unwrap().as_f64().unwrap();
        // "강"이었다면 +8이어야 하지만, 등판 예정 주라 "보통"으로 캡돼 +0.
        assert_eq!(fatigue, 0.0, "requested 강 during a start week should be capped to 보통 (no fatigue increase)");
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

        // no more scheduled games — next advance() runs forward again (bounded by the safety cap).
        let pending2 = advance(&mut slot_conn, &content_conn).unwrap();
        assert!(pending2.is_empty());
        assert!(current_day(&slot_conn) > 5);
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
        let result = run_pro_postseason(&slot_conn, &content_conn, 1).unwrap();
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

        let champion = run_pro_postseason(&slot_conn, &content_conn, 99).unwrap();
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