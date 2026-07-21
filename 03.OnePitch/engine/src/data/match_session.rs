use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};

use crate::sim::eval;
use crate::sim::match_sim::{self, BatterStats, PaOutcome, PitcherStats};
use crate::sim::pitch::{self, Course};

use super::repository;

/// `startMatch`/`pitch`(I6 3차분) 호출 결과 — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §3의 세 모드(자동·수동·반자동)가 전부 이 두 상태 중 하나로 귀결된다.
#[derive(Debug, Clone, PartialEq)]
pub enum MatchStepResult {
    /// 주인공이 다음 공을 던질 차례이고, 모드상 플레이어 입력이 필요한
    /// 시점 — `submit_pitch`로 구종·코스를 제출해야 진행된다.
    /// `inning`~`away_runs`는 [05_매치](../../../04_UI기획/05_매치.md) §2
    /// "상시 경기 상황판"(다이아몬드+주자+이닝+스코어+B-S-O)을 그리는 데
    /// 필요한 세션 스냅샷 — 이 시점(수동 매 구·반자동 결정적 순간)에만
    /// 노출된다. **"자동" 모드는 한 번의 호출로 경기 전체가 끝까지
    /// 시뮬레이션되어 중간 정지점이 아예 없어**, 자동 모드 도중엔 이
    /// 스냅샷을 볼 방법이 구조적으로 없다(엔진을 매 구·매 하프이닝마다
    /// 멈추도록 재설계해야 하는 별도 스코프 — 10_구현_Phase_계획.md
    /// §6-31 스코프 판단 참고).
    AwaitingPitch {
        batter_id: String,
        balls: u32,
        strikes: u32,
        high_leverage: bool,
        inning: u32,
        top_of_inning: bool,
        outs: u32,
        bases: Vec<bool>,
        home_runs: u32,
        away_runs: u32,
    },
    /// 경기 종료 — `schedule.result`·`standings`가 이미 반영됐고
    /// `match_session` 행도 삭제됨.
    GameOver { home_runs: u32, away_runs: u32 },
}

struct SessionRow {
    game_id: String,
    home: String,
    away: String,
    league_id: String,
    mode: String,
    inning: i64,
    top_of_inning: bool,
    outs: i64,
    bases: [bool; 3],
    home_runs: i64,
    away_runs: i64,
    home_batter_idx: i64,
    away_batter_idx: i64,
    balls: i64,
    strikes: i64,
    current_batter_id: Option<String>,
    pitch_seq: i64,
    strikeouts: i64,
    /// 감독 개입(§8, I7 29차분) — 주인공이 강판됐는지·이후 던지는 불펜
    /// 투수·강판 시점 이닝. 자동·반자동 모드에서만 채워짐(수동 모드는
    /// 이번 스코프에서 개입 없음, 대화 설계).
    protagonist_pulled: bool,
    relief_pitcher_id: Option<String>,
    protagonist_pull_inning: Option<i64>,
    protagonist_pull_opponent_runs: Option<i64>,
}

#[allow(clippy::type_complexity)]
fn load_session(conn: &Connection) -> anyhow::Result<Option<SessionRow>> {
    let row: Option<(
        String,
        String,
        String,
        String,
        String,
        i64,
        i64,
        i64,
        String,
        i64,
        i64,
        i64,
        i64,
        i64,
        i64,
        Option<String>,
        i64,
        i64,
        i64,
        Option<String>,
        Option<i64>,
        Option<i64>,
    )> = conn
        .query_row(
            "SELECT game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs,
                    home_batter_idx, away_batter_idx, balls, strikes, current_batter_id, pitch_seq, strikeouts,
                    protagonist_pulled, relief_pitcher_id, protagonist_pull_inning, protagonist_pull_opponent_runs
             FROM match_session WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get(12)?,
                    r.get(13)?,
                    r.get(14)?,
                    r.get(15)?,
                    r.get(16)?,
                    r.get(17)?,
                    r.get(18)?,
                    r.get(19)?,
                    r.get(20)?,
                    r.get(21)?,
                ))
            },
        )
        .optional()?;
    let Some((
        game_id,
        home,
        away,
        league_id,
        mode,
        inning,
        top_of_inning,
        outs,
        bases_raw,
        home_runs,
        away_runs,
        home_batter_idx,
        away_batter_idx,
        balls,
        strikes,
        current_batter_id,
        pitch_seq,
        strikeouts,
        protagonist_pulled,
        relief_pitcher_id,
        protagonist_pull_inning,
        protagonist_pull_opponent_runs,
    )) = row
    else {
        return Ok(None);
    };
    let bases_vec: Vec<bool> = serde_json::from_str(&bases_raw)?;
    Ok(Some(SessionRow {
        game_id,
        home,
        away,
        league_id,
        mode,
        inning,
        top_of_inning: top_of_inning != 0,
        outs,
        bases: [bases_vec[0], bases_vec[1], bases_vec[2]],
        home_runs,
        away_runs,
        home_batter_idx,
        away_batter_idx,
        balls,
        strikes,
        current_batter_id,
        pitch_seq,
        strikeouts,
        protagonist_pulled: protagonist_pulled != 0,
        relief_pitcher_id,
        protagonist_pull_inning,
        protagonist_pull_opponent_runs,
    }))
}

fn save_session(conn: &Connection, s: &SessionRow) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE match_session SET inning = ?1, top_of_inning = ?2, outs = ?3, bases = ?4, home_runs = ?5, away_runs = ?6,
             home_batter_idx = ?7, away_batter_idx = ?8, balls = ?9, strikes = ?10, current_batter_id = ?11, pitch_seq = ?12,
             strikeouts = ?13, protagonist_pulled = ?14, relief_pitcher_id = ?15, protagonist_pull_inning = ?16,
             protagonist_pull_opponent_runs = ?17
         WHERE id = 1",
        params![
            s.inning,
            s.top_of_inning as i64,
            s.outs,
            serde_json::json!(s.bases).to_string(),
            s.home_runs,
            s.away_runs,
            s.home_batter_idx,
            s.away_batter_idx,
            s.balls,
            s.strikes,
            s.current_batter_id,
            s.pitch_seq,
            s.strikeouts,
            s.protagonist_pulled as i64,
            s.relief_pitcher_id,
            s.protagonist_pull_inning,
            s.protagonist_pull_opponent_runs,
        ],
    )?;
    Ok(())
}

fn load_protagonist_as_pitcher(conn: &Connection) -> anyhow::Result<PitcherStats> {
    let (stats_raw, live_state_raw): (String, String) =
        conn.query_row("SELECT stats, live_state FROM protagonist WHERE id = 'proto:1'", [], |r| Ok((r.get(0)?, r.get(1)?)))?;
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    Ok(PitcherStats {
        id: "proto:1".to_string(),
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
        fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
    })
}

fn load_protagonist_pitches(conn: &Connection) -> anyhow::Result<Vec<String>> {
    let raw: String = conn.query_row("SELECT pitches FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    Ok(serde_json::from_str(&raw)?)
}

/// PA 결과를 세션에 반영 — 아웃 집계 또는 주자 진루+득점, 타석 종료 시
/// 카운트·타자 정보를 리셋해 다음 타자를 맞을 준비를 한다.
/// `match_sim::simulate_half_inning`의 내부 스위치와 동일한 분기를
/// 세션 상태에 대해 재현한 것 — 로직 자체는 그쪽과 절대 갈라지지 않게
/// 유지해야 한다(둘 다 `PaOutcome`을 공유하는 이유).
fn apply_pa_outcome(session: &mut SessionRow, batting_team_is_home: bool, outcome: PaOutcome) {
    let runs = match outcome {
        PaOutcome::Strikeout | PaOutcome::Out => {
            session.outs += 1;
            0
        }
        PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::Single => match_sim::advance_runners(&mut session.bases, 1),
        PaOutcome::Double => match_sim::advance_runners(&mut session.bases, 2),
        PaOutcome::Triple => match_sim::advance_runners(&mut session.bases, 3),
        PaOutcome::HomeRun => match_sim::advance_runners(&mut session.bases, 4),
    };
    if batting_team_is_home {
        session.home_runs += runs as i64;
    } else {
        session.away_runs += runs as i64;
    }
    session.current_batter_id = None;
    session.balls = 0;
    session.strikes = 0;
}

#[derive(Debug, PartialEq)]
enum Transition {
    Continue,
    GameOver,
}

/// 하프이닝 경계 처리 — §10-2 콜드게임(아마추어)·연장전 규칙(아마추어=
/// 승부치기 무제한, 프로 정규시즌=12회 제한 무승부)을 그대로 재현.
/// `match_sim::simulate_game`의 이닝 루프와 같은 조건을 세션 상태에 대해
/// 반복 적용한 것 — 콜드게임 조기종료(§10-2 5회15점/7회10점)도
/// `match_sim::simulate_game`(line 218~223)과 동일한 조건식을 그대로
/// 복제해 인터랙티브 경로에도 반영한다(예전엔 스코프 아웃이었으나
/// I6 이월 항목 처리로 이번에 채움).
fn transition_half_inning(session: &mut SessionRow) -> Transition {
    let amateur = match_sim::is_amateur(&session.league_id);
    session.outs = 0;
    session.bases = if amateur && session.inning > 9 { [true, true, false] } else { [false; 3] };
    session.current_batter_id = None;
    session.balls = 0;
    session.strikes = 0;

    if session.top_of_inning {
        // 원정(top) 종료 — 끝내기 조건이면 홈 공격 없이 바로 종료.
        let walk_off = session.inning >= 9 && session.home_runs > session.away_runs;
        if walk_off {
            return Transition::GameOver;
        }
        session.top_of_inning = false;
        Transition::Continue
    } else {
        // 홈(bottom) 종료 — 이닝 완전 종료, 게임 종료 조건 판정.
        if session.inning >= 9 && session.home_runs != session.away_runs {
            return Transition::GameOver;
        }
        if amateur {
            let margin = (session.home_runs - session.away_runs).unsigned_abs();
            if (session.inning >= 5 && margin >= 15) || (session.inning >= 7 && margin >= 10) {
                return Transition::GameOver; // 콜드게임(§10-2, match_.rs와 동일 조건)
            }
        }
        if !amateur && session.inning >= 12 {
            return Transition::GameOver; // 프로 정규시즌 12회 제한(무승부)
        }
        if session.inning >= 30 {
            return Transition::GameOver; // 절대 안전장치
        }
        session.inning += 1;
        session.top_of_inning = true;
        Transition::Continue
    }
}

fn finalize_game(slot_conn: &Connection, session: &SessionRow, protagonist_team_id: &str) -> anyhow::Result<MatchStepResult> {
    let result_json = serde_json::json!({"home": session.home_runs, "away": session.away_runs}).to_string();
    slot_conn.execute("UPDATE schedule SET result = ?1 WHERE game_id = ?2", params![result_json, session.game_id])?;
    repository::update_standings(slot_conn, &session.home, &session.away, session.home_runs as u32, session.away_runs as u32)?;
    apply_protagonist_evaluation(slot_conn, session, protagonist_team_id)?;
    slot_conn.execute("DELETE FROM match_session WHERE id = 1", [])?;
    Ok(MatchStepResult::GameOver { home_runs: session.home_runs as u32, away_runs: session.away_runs as u32 })
}

/// 주인공 등판 평가([09_평가_시스템](../../../02_기획/육성코어/09_평가_시스템.md)
/// §5-4 "역할별 계산 트리거") — §5-3 "최소 등판 기준"(선발 1이닝 이상)은
/// 지금 감독 개입 소프트캡(90구)이 훨씬 높아 사실상 항상 자동 충족.
/// 감독 신뢰도(§4)는 스태프 시스템이 정식으로 없어(전술력·신뢰형성력만
/// 해시 근사, `sim::manager`) 반영 안 함 — 사기·주목도·`game_log` 기록만.
/// 강판된 경우(`protagonist_pulled`) `runs_allowed`·`innings_pitched`는
/// 강판 시점 스냅샷을 우선 써서, 불펜이 강판 이후 내준 점수가 주인공
/// 개인 성적에 안 섞이게 한다.
fn apply_protagonist_evaluation(slot_conn: &Connection, session: &SessionRow, protagonist_team_id: &str) -> anyhow::Result<()> {
    let protagonist_is_home = session.home == protagonist_team_id;
    let (full_game_runs, opponent_team) =
        if protagonist_is_home { (session.away_runs as u32, session.away.clone()) } else { (session.home_runs as u32, session.home.clone()) };
    let runs_allowed = session.protagonist_pull_opponent_runs.map(|r| r as u32).unwrap_or(full_game_runs);
    let innings_pitched = session.protagonist_pull_inning.unwrap_or(session.inning);

    let opponent_lineup = repository::load_batting_lineup(slot_conn, &opponent_team)?;
    let opponent_avg = if opponent_lineup.is_empty() {
        50.0
    } else {
        opponent_lineup.iter().map(|b| (b.contact + b.eye + b.power) / 3.0).sum::<f64>() / opponent_lineup.len() as f64
    };

    let pitcher = load_protagonist_as_pitcher(slot_conn)?;
    let own_skill = (pitcher.control + pitcher.stuff) / 2.0;

    let grade = eval::grade_outing(runs_allowed, opponent_avg, own_skill);

    let live_state_raw: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
    let morale = live_state.get("사기").and_then(|v| v.as_f64()).unwrap_or(50.0);
    let attention = live_state.get("주목도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    live_state.insert("사기".to_string(), serde_json::json!((morale + eval::morale_delta(grade)).clamp(0.0, 100.0)));
    live_state.insert("주목도".to_string(), serde_json::json!(attention + eval::attention_gain(grade)));
    slot_conn.execute(
        "UPDATE protagonist SET live_state = ?1 WHERE id = 'proto:1'",
        params![serde_json::Value::Object(live_state).to_string()],
    )?;

    let season: i64 = slot_conn
        .query_row("SELECT value FROM season_meta WHERE key = 'season'", [], |r| r.get::<_, String>(0))
        .optional()?
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    // 승/패/무승부 — 팀 최종 득실을 그대로 주인공의 결정(decision)으로 쓴다
    // (강판 후 불펜이 지키거나 뒤집는 경우까지 포함 — 실제 야구의 승리
    // 투수 요건 세부는 반영 안 함, 다른 박스스코어 항목들과 같은 수준의
    // 근사). 이닝(`innings_pitched`)의 소수점 아웃 카운트도 마찬가지.
    let decision = if session.home_runs == session.away_runs {
        "무승부"
    } else if protagonist_is_home == (session.home_runs > session.away_runs) {
        "승"
    } else {
        "패"
    };
    let detail = serde_json::json!({
        "grade": grade,
        "runs_allowed": runs_allowed,
        "opponent": opponent_team,
        "decision": decision,
        "strikeouts": session.strikeouts,
        "innings_pitched": innings_pitched,
        "pulled_by_manager": session.protagonist_pulled,
    })
    .to_string();
    slot_conn.execute(
        "INSERT INTO game_log (game_id, season, detail) VALUES (?1, ?2, ?3)
         ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, detail = excluded.detail",
        params![session.game_id, season, detail],
    )?;

    Ok(())
}

/// 주인공 등판 경기 시작(§1 축1 유형A) — `advance()`가 오늘 주인공 경기를
/// 찾아 만든 `'game'` PendingAction이 `mode`로 응답되면 호출된다(모드
/// 선택 자체는 §3 "경기 시작 전 1회 선택" — 그 선택 UI는 I7 소관, 여기는
/// 선택된 값을 받아 세션을 여는 것만). **주인공은 항상 선발 완투로 가정**
/// (다른 배경 경기들과 동일한 placeholder — 구원 등판·투수 교체는 감독
/// AI가 생기는 후속 Phase 스코프).
pub fn start_protagonist_match(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    game_id: &str,
    home: &str,
    away: &str,
    mode: &str,
) -> anyhow::Result<MatchStepResult> {
    if !["자동", "수동", "반자동"].contains(&mode) {
        anyhow::bail!("unknown match mode: {mode}");
    }
    let league_id: String = content_conn.query_row("SELECT league_id FROM teams WHERE id = ?1", [home], |r| r.get(0))?;

    slot_conn.execute(
        "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                     home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id, pitch_seq, strikeouts)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL, 0, 0)",
        params![game_id, home, away, league_id, mode],
    )?;

    run_until_decision_point(slot_conn, world_seed, None)
}

/// 1구 제출(§5) — `AwaitingPitch`로 멈춘 세션에 플레이어의 구종·코스
/// 선택을 반영하고 다음 결정 지점(또는 경기 종료)까지 진행한다.
pub fn submit_pitch(slot_conn: &Connection, world_seed: i64, pitch_name: &str, course: Course) -> anyhow::Result<MatchStepResult> {
    run_until_decision_point(slot_conn, world_seed, Some((pitch_name.to_string(), course)))
}

/// 세션이 있는 동안 계속 진행하다가 ①플레이어 입력이 필요하거나(§3 모드에
/// 따라) ②경기가 끝나면 멈춘다. `player_pitch`는 `submit_pitch`로 막
/// 제출된 선택 — 있으면 이번 루프의 **첫 판정에만** 소비되고, 이후
/// 반복에서는 다시 정상적인 AI/프롬프트 로직을 탄다.
fn run_until_decision_point(slot_conn: &Connection, world_seed: i64, mut player_pitch: Option<(String, Course)>) -> anyhow::Result<MatchStepResult> {
    let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
    let protagonist_team_id: String = {
        let contract_raw: String = slot_conn.query_row("SELECT contract FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
        let contract: serde_json::Value = serde_json::from_str(&contract_raw)?;
        contract
            .get("team_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("protagonist has no team_id in contract"))?
            .to_string()
    };

    loop {
        let mut session = load_session(slot_conn)?.ok_or_else(|| anyhow::anyhow!("no match session in progress"))?;

        if session.outs >= 3 {
            match transition_half_inning(&mut session) {
                Transition::GameOver => return finalize_game(slot_conn, &session, &protagonist_team_id),
                Transition::Continue => {
                    save_session(slot_conn, &session)?;
                    continue;
                }
            }
        }

        let (batting_team, pitching_team) =
            if session.top_of_inning { (session.away.clone(), session.home.clone()) } else { (session.home.clone(), session.away.clone()) };
        let batting_team_is_home = batting_team == session.home;
        let protagonist_pitching_team = pitching_team == protagonist_team_id;

        // 감독 개입(§8, I7 29차분) — 하프이닝 경계마다(수동 모드 제외) 판단.
        // 강판되면 이후 이 팀의 투구는 배경 하프이닝 경로로 넘어간다(아래).
        if protagonist_pitching_team && !session.protagonist_pulled && session.mode != "수동" {
            let manager = crate::sim::manager::manager_stats(&protagonist_team_id);
            let pitcher_fatigue = load_protagonist_as_pitcher(slot_conn)?.fatigue;
            let mut pull_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                world_seed,
                &format!("pull:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
            ));
            let should_pull = crate::sim::manager::should_pull_pitcher(
                &mut pull_rng,
                session.pitch_seq as u32,
                pitcher_fatigue,
                manager.tactics,
                manager.trust,
            );
            if should_pull {
                if let Some(reliever) = repository::load_relief_pitcher(slot_conn, &protagonist_team_id)? {
                    let protagonist_is_home = session.home == protagonist_team_id;
                    let opponent_runs_so_far = if protagonist_is_home { session.away_runs } else { session.home_runs };
                    session.protagonist_pulled = true;
                    session.relief_pitcher_id = Some(reliever.id);
                    session.protagonist_pull_inning = Some(session.inning);
                    session.protagonist_pull_opponent_runs = Some(opponent_runs_so_far);
                    save_session(slot_conn, &session)?;
                }
            }
        }
        let protagonist_pitching = protagonist_pitching_team && !session.protagonist_pulled;

        if !protagonist_pitching {
            // 배경 하프이닝 통째로 — 주인공 팀 타석은 항상 이쪽(DH, §7이라
            // 주인공은 절대 타석에 안 섬 — load_batting_lineup은 npc만
            // 조회하므로 자연히 주인공을 제외함). 주인공이 방금 강판됐다면
            // (`protagonist_pitching_team`이지만 pulled) 저장된 불펜 투수가
            // 대신 던진다.
            let lineup = repository::load_batting_lineup(slot_conn, &batting_team)?;
            let pitcher = if protagonist_pitching_team {
                let relief_id = session.relief_pitcher_id.clone().expect("protagonist_pulled requires relief_pitcher_id");
                repository::load_pitcher_by_id(slot_conn, &relief_id)?
            } else {
                repository::load_starting_pitcher(slot_conn, &pitching_team)?
            };
            let mut idx = (if batting_team_is_home { session.home_batter_idx } else { session.away_batter_idx }) as usize;
            let mut rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                world_seed,
                &format!("match:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
            ));
            let mut injuries = Vec::new();
            let runs = match_sim::simulate_half_inning(&mut rng, &lineup, &mut idx, &pitcher, session.bases, &mut injuries);
            repository::apply_injury_events(slot_conn, &injuries, today)?;
            repository::accumulate_game_fatigue(slot_conn, &batting_team)?;
            if !protagonist_pitching_team {
                // 주인공이 강판된 뒤의 불펜 투수는 이번 스코프에서 피로도
                // 누적 대상 아님(§8 스코프 판단) — `accumulate_game_fatigue`는
                // position='선발투수'만 찾아 이미 벤치로 물러난 주인공/선발을
                // 잘못 갱신하게 되므로 호출 자체를 건너뛴다.
                repository::accumulate_game_fatigue(slot_conn, &pitching_team)?;
            }

            if batting_team_is_home {
                session.home_runs += runs as i64;
                session.home_batter_idx = idx as i64;
            } else {
                session.away_runs += runs as i64;
                session.away_batter_idx = idx as i64;
            }
            session.outs = 3;
            save_session(slot_conn, &session)?;
            continue;
        }

        // 주인공이 던지는 하프이닝 — 1구 단위(§5).
        let lineup = repository::load_batting_lineup(slot_conn, &batting_team)?;
        if lineup.is_empty() {
            session.outs = 3; // 방어적 처리 — 상대 라인업이 없으면 그냥 하프이닝 종료
            save_session(slot_conn, &session)?;
            continue;
        }

        let batter: BatterStats = match &session.current_batter_id {
            Some(id) => lineup.iter().find(|b| &b.id == id).cloned().unwrap_or_else(|| lineup[0].clone()),
            None => {
                let mut idx = (if batting_team_is_home { session.home_batter_idx } else { session.away_batter_idx }) as usize;
                let b = lineup[idx % lineup.len()].clone();
                idx += 1;
                if batting_team_is_home {
                    session.home_batter_idx = idx as i64;
                } else {
                    session.away_batter_idx = idx as i64;
                }
                session.current_batter_id = Some(b.id.clone());
                session.balls = 0;
                session.strikes = 0;
                save_session(slot_conn, &session)?;
                b
            }
        };

        let pitcher = load_protagonist_as_pitcher(slot_conn)?;
        let bases_loaded = session.bases.iter().all(|&b| b);
        let score_diff = (session.home_runs - session.away_runs) as i32;
        let high_leverage = pitch::is_high_leverage_situation(bases_loaded, score_diff, session.inning as u32);

        let mut rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
            world_seed,
            &format!("pitch:{}:{}", session.game_id, session.pitch_seq),
        ));

        let (_pitch_name, course) = if let Some(choice) = player_pitch.take() {
            choice
        } else {
            let should_prompt = match session.mode.as_str() {
                "수동" => true,
                "반자동" => high_leverage,
                _ => false, // 자동
            };
            if should_prompt {
                return Ok(MatchStepResult::AwaitingPitch {
                    batter_id: session.current_batter_id.clone().unwrap(),
                    balls: session.balls as u32,
                    strikes: session.strikes as u32,
                    high_leverage,
                    inning: session.inning as u32,
                    top_of_inning: session.top_of_inning,
                    outs: session.outs as u32,
                    bases: session.bases.to_vec(),
                    home_runs: session.home_runs as u32,
                    away_runs: session.away_runs as u32,
                });
            }
            let pitches = load_protagonist_pitches(slot_conn)?;
            pitch::choose_pitch_and_course(&mut rng, &pitches, &batter, high_leverage)
        };

        let result = pitch::throw_pitch(&mut rng, &pitcher, &batter, course);
        session.pitch_seq += 1;
        let mut count = pitch::Count { balls: session.balls as u32, strikes: session.strikes as u32 };
        let outcome = pitch::apply_pitch_result(&mut count, result);
        session.balls = count.balls as i64;
        session.strikes = count.strikes as i64;

        if let Some((part, severity)) = crate::sim::injury::check_acute_injury(&mut rng, batter.fatigue) {
            repository::apply_injury_events(slot_conn, &[match_sim::InjuryEvent { player_id: batter.id.clone(), part, severity }], today)?;
        }
        // 주인공 본인(투수)의 급성형 부상 — 07_매치_엔진.md §13·08_부상_시스템.md
        // §3. NPC 배터와 달리 주인공은 실제 선택 주체가 있어 `apply_injury`
        // (injuryTreatment PendingAction 생성)로 간다. 감독 개입(§8)으로
        // 투구수·피로도 기반 강판은 생겼지만, "부상 발생 즉시 강판"은 별개
        // 트리거라 이번 스코프에선 반영 안 함 — 부상은 기록되지만 이번
        // 하프이닝은 그대로 이어진다(배경 경기의 급성 부상도 동일하게
        // 즉시 교체 없음).
        if let Some((part, severity)) = crate::sim::injury::check_acute_injury(&mut rng, pitcher.fatigue) {
            repository::apply_injury(slot_conn, part, severity, today)?;
        }

        match outcome {
            pitch::AtBatOutcome::InProgress => {}
            pitch::AtBatOutcome::Strikeout => {
                session.strikeouts += 1;
                apply_pa_outcome(&mut session, batting_team_is_home, PaOutcome::Strikeout);
            }
            pitch::AtBatOutcome::Walk => apply_pa_outcome(&mut session, batting_team_is_home, PaOutcome::Walk),
            pitch::AtBatOutcome::HitByPitch => apply_pa_outcome(&mut session, batting_team_is_home, PaOutcome::HitByPitch),
            pitch::AtBatOutcome::InPlay => {
                let pa = match_sim::resolve_in_play_result(&mut rng, &batter, &pitcher);
                apply_pa_outcome(&mut session, batting_team_is_home, pa);
            }
        }
        save_session(slot_conn, &session)?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{content, slot};

    fn build_content_db() -> Connection {
        let content_conn = content::open_in_memory().unwrap();
        content_conn.execute("INSERT INTO leagues (id, meta) VALUES ('league:hs', NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:home', 'league:hs', NULL, NULL)", []).unwrap();
        content_conn.execute("INSERT INTO teams (id, league_id, color, meta) VALUES ('team:away', 'league:hs', NULL, NULL)", []).unwrap();
        content_conn
    }

    fn insert_roster(conn: &Connection, team_id: &str) {
        for i in 0..8 {
            conn.execute(
                "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
                 VALUES (?1, ?1, ?2, '타자', 20, 1, 0, 50.0, '{}', ?3, '{}', '{\"피로도\":0}', NULL, '{\"current\":null,\"history\":[]}')",
                params![
                    format!("{team_id}_b{i}"),
                    team_id,
                    serde_json::json!({"컨택": 50.0, "선구안": 50.0, "파워": 50.0}).to_string(),
                ],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?1, ?2, '선발투수', 20, 1, 0, 50.0, '{}', ?3, '{}', '{\"피로도\":0}', '[\"포심 패스트볼\"]', '{\"current\":null,\"history\":[]}')",
            params![format!("{team_id}_sp"), team_id, serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
        )
        .unwrap();
    }

    fn insert_protagonist(conn: &Connection, team_id: &str) {
        conn.execute(
            "INSERT INTO protagonist (id, name, handedness, archetype, stats, xp, live_state, finance, pitches, contract, injury)
             VALUES ('proto:1', '주인공', '우투', '강속구형', ?1, '{}', '{\"피로도\":0}', '{}', '[\"포심 패스트볼\"]', ?2, '{\"current\":null,\"history\":[]}')",
            params![
                serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string(),
                serde_json::json!({"team_id": team_id}).to_string(),
            ],
        )
        .unwrap();
    }

    fn insert_reliever(conn: &Connection, team_id: &str) {
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?1, ?2, '구원투수', 20, 1, 0, 50.0, '{}', ?3, '{}', '{\"피로도\":0}', '[\"포심 패스트볼\"]', '{\"current\":null,\"history\":[]}')",
            params![format!("{team_id}_rp"), team_id, serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
        )
        .unwrap();
    }

    fn insert_schedule(conn: &Connection, game_id: &str) {
        conn.execute(
            "INSERT INTO schedule (game_id, day, home, away, result) VALUES (?1, 1, 'team:home', 'team:away', NULL)",
            [game_id],
        )
        .unwrap();
    }

    fn bottom_of_inning_end_session(league_id: &str, inning: i64, home_runs: i64, away_runs: i64) -> SessionRow {
        SessionRow {
            game_id: "game:1".to_string(),
            home: "team:home".to_string(),
            away: "team:away".to_string(),
            league_id: league_id.to_string(),
            mode: "자동".to_string(),
            inning,
            top_of_inning: false,
            outs: 3,
            bases: [false; 3],
            home_runs,
            away_runs,
            home_batter_idx: 0,
            away_batter_idx: 0,
            balls: 0,
            strikes: 0,
            current_batter_id: None,
            pitch_seq: 0,
            strikeouts: 0,
            protagonist_pulled: false,
            relief_pitcher_id: None,
            protagonist_pull_inning: None,
            protagonist_pull_opponent_runs: None,
        }
    }

    #[test]
    fn cold_game_ends_amateur_match_at_5th_inning_with_15_run_margin() {
        let mut session = bottom_of_inning_end_session("league:hs", 5, 20, 3);
        assert_eq!(transition_half_inning(&mut session), Transition::GameOver);
    }

    #[test]
    fn cold_game_ends_amateur_match_at_7th_inning_with_10_run_margin() {
        let mut session = bottom_of_inning_end_session("league:hs", 7, 12, 2);
        assert_eq!(transition_half_inning(&mut session), Transition::GameOver);
    }

    #[test]
    fn cold_game_does_not_trigger_before_5th_inning_even_with_a_big_margin() {
        let mut session = bottom_of_inning_end_session("league:hs", 4, 20, 1);
        assert_eq!(transition_half_inning(&mut session), Transition::Continue);
    }

    #[test]
    fn cold_game_does_not_trigger_with_margin_below_threshold() {
        let mut session = bottom_of_inning_end_session("league:hs", 6, 12, 5);
        assert_eq!(transition_half_inning(&mut session), Transition::Continue);
    }

    #[test]
    fn cold_game_never_triggers_in_the_pro_league_regardless_of_margin_or_inning() {
        let mut session = bottom_of_inning_end_session("league:pro", 7, 20, 1);
        assert_eq!(transition_half_inning(&mut session), Transition::Continue);
    }

    #[test]
    fn automatic_mode_runs_a_full_game_to_completion() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let result = start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "자동").unwrap();

        match result {
            MatchStepResult::GameOver { home_runs, away_runs } => {
                assert!(home_runs < 50 && away_runs < 50);
            }
            other => panic!("expected automatic mode to finish the game outright, got {other:?}"),
        }

        let result_raw: Option<String> = slot_conn.query_row("SELECT result FROM schedule WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        assert!(result_raw.is_some(), "schedule.result should be populated once the game ends");

        let session_count: i64 = slot_conn.query_row("SELECT count(*) FROM match_session", [], |r| r.get(0)).unwrap();
        assert_eq!(session_count, 0, "match_session row should be cleared after the game ends");

        let (w, l, t): (i64, i64, i64) =
            slot_conn.query_row("SELECT w, l, t FROM standings WHERE team_id = 'team:home'", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap();
        assert_eq!(w + l + t, 1);
    }

    #[test]
    fn game_completion_records_an_evaluation_grade_and_updates_live_state() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let before_live_state: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let before: serde_json::Value = serde_json::from_str(&before_live_state).unwrap();
        let before_morale = before.get("사기").and_then(|v| v.as_f64()).unwrap_or(50.0);

        start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "자동").unwrap();

        let after_live_state: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        let after: serde_json::Value = serde_json::from_str(&after_live_state).unwrap();
        assert_ne!(before_morale, after.get("사기").unwrap().as_f64().unwrap(), "morale should shift after an evaluated outing");
        assert!(after.get("주목도").unwrap().as_f64().unwrap() > 0.0, "attention should have accrued from the outing");

        let (season, detail_raw): (i64, String) =
            slot_conn.query_row("SELECT season, detail FROM game_log WHERE game_id = 'game:1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(season, 0);
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert!(crate::sim::eval::GRADES.contains(&detail.get("grade").unwrap().as_str().unwrap()));
    }

    #[test]
    fn game_completion_records_strikeouts_innings_and_a_win_loss_decision() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "자동").unwrap();

        let (home_runs, away_runs): (i64, i64) = {
            let result_raw: String = slot_conn.query_row("SELECT result FROM schedule WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
            let v: serde_json::Value = serde_json::from_str(&result_raw).unwrap();
            (v["home"].as_i64().unwrap(), v["away"].as_i64().unwrap())
        };

        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert!(detail.get("strikeouts").and_then(|v| v.as_i64()).unwrap() >= 0);
        assert!(detail.get("innings_pitched").and_then(|v| v.as_i64()).unwrap() >= 1);

        let expected_decision = if home_runs == away_runs {
            "무승부"
        } else if home_runs > away_runs {
            "승" // 주인공은 team:home 소속
        } else {
            "패"
        };
        assert_eq!(detail.get("decision").and_then(|v| v.as_str()).unwrap(), expected_decision);
    }

    #[test]
    fn protagonist_pitcher_can_suffer_an_acute_injury_during_their_own_start() {
        let content_conn = build_content_db();
        let mut triggered = false;
        for seed in 0..150i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_schedule(&slot_conn, "game:1");

            start_protagonist_match(&slot_conn, &content_conn, seed, "game:1", "team:home", "team:away", "자동").unwrap();

            let injury_raw: String = slot_conn.query_row("SELECT injury FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
            let injury: serde_json::Value = serde_json::from_str(&injury_raw).unwrap();
            if !injury["current"].is_null() {
                triggered = true;
                break;
            }
        }
        assert!(triggered, "expected at least one seed across 150 trials to injure the protagonist pitcher during their own start");
    }

    #[test]
    fn manual_mode_pauses_on_every_pitch_the_protagonist_throws() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let result = start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "수동").unwrap();
        match result {
            MatchStepResult::AwaitingPitch { balls, strikes, .. } => {
                assert_eq!((balls, strikes), (0, 0));
            }
            other => panic!("expected manual mode to pause on the very first protagonist pitch, got {other:?}"),
        }
    }

    #[test]
    fn submitting_pitches_eventually_finishes_a_manual_game() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let mut result = start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "수동").unwrap();
        let mut guard = 0;
        loop {
            match result {
                MatchStepResult::GameOver { .. } => break,
                MatchStepResult::AwaitingPitch { .. } => {
                    result = submit_pitch(&slot_conn, 1, "포심 패스트볼", Course::MidCenter).unwrap();
                }
            }
            guard += 1;
            assert!(guard < 5000, "manual game did not finish within a reasonable number of pitches");
        }
    }

    #[test]
    fn automatic_mode_is_deterministic_given_the_same_seed() {
        let build_and_run = || {
            let content_conn = build_content_db();
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_schedule(&slot_conn, "game:1");
            start_protagonist_match(&slot_conn, &content_conn, 777, "game:1", "team:home", "team:away", "자동").unwrap()
        };
        assert_eq!(build_and_run(), build_and_run());
    }

    /// 감독 개입(§8, I7 29차분) — 하드캡(120구)을 훨씬 넘긴 투구수로 세션을
    /// 직접 꾸며 첫 하프이닝 경계에서 반드시 강판되도록 만든다(RNG에
    /// 기대지 않는 결정론적 시나리오). 강판 이후 나머지 이닝은 불펜
    /// (`team:home_rp`)이 던져야 하고, `game_log`에는 강판 시점(1이닝·
    /// 상대 0점) 스냅샷이 주인공 개인 성적으로 남아야 한다.
    #[test]
    fn manager_pulls_the_protagonist_once_pitch_count_clears_the_hard_cap() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_reliever(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        // team:home이 주인공 팀 — top of inning 1에서 곧바로 등판(위 §7
        // "홈이 pitching_team"). pitch_seq를 하드캡 이상으로 미리 채워
        // 첫 경계 판정에서 반드시 강판되게 한다.
        slot_conn
            .execute(
                "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                             home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                             current_batter_id, pitch_seq, strikeouts)
                 VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '자동', 1, 1, 0, '[false,false,false]',
                         0, 0, 0, 0, 0, 0, NULL, 200, 0)",
                [],
            )
            .unwrap();

        let result = run_until_decision_point(&slot_conn, 1, None).unwrap();
        assert!(matches!(result, MatchStepResult::GameOver { .. }), "automatic mode should still run to completion after a mid-game pull");

        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert_eq!(detail.get("pulled_by_manager").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(detail.get("innings_pitched").and_then(|v| v.as_i64()), Some(1), "should freeze at the inning the pull happened in");
        assert_eq!(detail.get("runs_allowed").and_then(|v| v.as_i64()), Some(0), "should freeze at the opponent score at pull time, not the final score");
    }

    #[test]
    fn manager_never_pulls_in_manual_mode() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_reliever(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        slot_conn
            .execute(
                "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                             home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                             current_batter_id, pitch_seq, strikeouts)
                 VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '수동', 1, 1, 0, '[false,false,false]',
                         0, 0, 0, 0, 0, 0, NULL, 200, 0)",
                [],
            )
            .unwrap();

        let result = run_until_decision_point(&slot_conn, 1, None).unwrap();
        assert!(matches!(result, MatchStepResult::AwaitingPitch { .. }), "manual mode keeps pausing on the protagonist's own pitch regardless of pitch count");

        let pulled: i64 = slot_conn.query_row("SELECT protagonist_pulled FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pulled, 0);
    }
}
