use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};

use crate::sim::eval;
use crate::sim::match_sim::{self, BatterStats, PaOutcome, PitcherStats};
use crate::sim::pitch::{self, Course};

use super::repository;

/// `startMatch`/`pitch`(I6 3차분) 호출 결과 — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §3의 세 모드(자동·수동·반자동)가 전부 이 상태들 중 하나로 귀결된다.
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
    /// 감독 개입(§8) 수동 모드 — 하프이닝 경계에서 투구수가 "고려 구간"
    /// (`sim::manager::pull_probability` > 0)에 들어서면 자동·반자동처럼
    /// AI가 바로 판단하지 않고 플레이어에게 묻는다. `submit_pitcher_change_decision`
    /// 으로 "유지"/"교체"/"맡기기"(=AI 판정 그대로) 중 하나를 제출해야
    /// 진행된다.
    PitcherChangeDecision {
        inning: u32,
        top_of_inning: bool,
        home_runs: u32,
        away_runs: u32,
        pitches_thrown: u32,
        fatigue: f64,
        manager_recommends_pull: bool,
    },
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
    /// 상대팀 투수 강판(§8 대칭, Part H, 대화 2026-07-26) — 주인공 쪽과
    /// 달리 "지금까지 이 게임에서 상대 투수가 상대한 누적 타자 수"까지
    /// 세션에 남겨야 하프이닝마다 새로 세션을 불러와도(§5 "1구 단위") 투구수
    /// 근사(§8 "타자 수 × 3.8")가 끊기지 않는다.
    opponent_pulled: bool,
    opponent_relief_pitcher_id: Option<String>,
    opponent_pitcher_batters_faced: i64,
    /// 수동 모드 감독 개입 핑퐁 버그 수정(Phase 3, migration v15) — 특정
    /// 투구수(`pitch_seq`)에서 "불풀"로 확정되면 그 투구수를 기록해둔다.
    /// `run_until_decision_point`가 매 루프 패스마다 강판 소프트캡
    /// "고려 구간" 판정을 다시 타는데, 이 값이 현재 투구수와 같으면
    /// "이미 이 투구수에서 물어봤고 안 뽑기로 했다"로 보고 다시 안 묻는다
    /// — 없으면 `submit_pitcher_change_decision`으로 "유지/맡기기"를
    /// 답해도 바로 다음 `submit_pitch` 호출에서 투구수가 아직 그대로라
    /// 또 `PitcherChangeDecision`을 돌려주는 무한 핑퐁에 빠진다.
    pull_decision_settled_at_pitch_count: Option<i64>,
    /// 환경 요소(Phase 5, §10-1) — `start_protagonist_match`가 게임 시작
    /// 시점에 딱 한 번 굴려 저장한 값(migration v17). 이후 하프이닝·1구
    /// 판정 내내 고정.
    conditions: match_sim::GameConditions,
    /// 주인공 본인 등판의 피안타·볼넷 누적(Phase 6, §12 "WHIP") —
    /// `strikeouts`와 같은 패턴으로 1구 단위 루프에서 직접 증가시킨다.
    /// `game_log` detail JSON에 실어 `CareerLine::whip()`이 통산·시즌
    /// 집계에 쓴다(migration v18).
    hits_allowed: i64,
    walks_allowed: i64,
    /// 세이브 판정(Phase 6, §12) — 강판되는 그 순간 `manager::is_save_situation`
    /// 이 참이었는지 기억해둔다(migration v18). `finalize_game`이 게임
    /// 종료 시점에 그 팀이 리드를 지킨 채 이겼는지 보고 구원투수에게
    /// 세이브를 준다.
    protagonist_pull_was_save_situation: bool,
    opponent_pull_was_save_situation: bool,
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
        i64,
        Option<String>,
        i64,
        Option<i64>,
        f64,
        f64,
        f64,
        f64,
        i64,
        i64,
        i64,
        i64,
    )> = conn
        .query_row(
            "SELECT game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases, home_runs, away_runs,
                    home_batter_idx, away_batter_idx, balls, strikes, current_batter_id, pitch_seq, strikeouts,
                    protagonist_pulled, relief_pitcher_id, protagonist_pull_inning, protagonist_pull_opponent_runs,
                    opponent_pulled, opponent_relief_pitcher_id, opponent_pitcher_batters_faced,
                    pull_decision_settled_at_pitch_count,
                    park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult,
                    hits_allowed, walks_allowed, protagonist_pull_was_save_situation, opponent_pull_was_save_situation
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
                    r.get(22)?,
                    r.get(23)?,
                    r.get(24)?,
                    r.get(25)?,
                    r.get(26)?,
                    r.get(27)?,
                    r.get(28)?,
                    r.get(29)?,
                    r.get(30)?,
                    r.get(31)?,
                    r.get(32)?,
                    r.get(33)?,
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
        opponent_pulled,
        opponent_relief_pitcher_id,
        opponent_pitcher_batters_faced,
        pull_decision_settled_at_pitch_count,
        park_factor,
        weather_control_mod,
        weather_power_mod,
        weather_fatigue_mult,
        hits_allowed,
        walks_allowed,
        protagonist_pull_was_save_situation,
        opponent_pull_was_save_situation,
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
        opponent_pulled: opponent_pulled != 0,
        opponent_relief_pitcher_id,
        opponent_pitcher_batters_faced,
        pull_decision_settled_at_pitch_count,
        conditions: match_sim::GameConditions { park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult },
        hits_allowed,
        walks_allowed,
        protagonist_pull_was_save_situation: protagonist_pull_was_save_situation != 0,
        opponent_pull_was_save_situation: opponent_pull_was_save_situation != 0,
    }))
}

fn save_session(conn: &Connection, s: &SessionRow) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE match_session SET inning = ?1, top_of_inning = ?2, outs = ?3, bases = ?4, home_runs = ?5, away_runs = ?6,
             home_batter_idx = ?7, away_batter_idx = ?8, balls = ?9, strikes = ?10, current_batter_id = ?11, pitch_seq = ?12,
             strikeouts = ?13, protagonist_pulled = ?14, relief_pitcher_id = ?15, protagonist_pull_inning = ?16,
             protagonist_pull_opponent_runs = ?17, opponent_pulled = ?18, opponent_relief_pitcher_id = ?19,
             opponent_pitcher_batters_faced = ?20, pull_decision_settled_at_pitch_count = ?21,
             hits_allowed = ?22, walks_allowed = ?23, protagonist_pull_was_save_situation = ?24,
             opponent_pull_was_save_situation = ?25
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
            s.opponent_pulled as i64,
            s.opponent_relief_pitcher_id,
            s.opponent_pitcher_batters_faced,
            s.pull_decision_settled_at_pitch_count,
            s.hits_allowed,
            s.walks_allowed,
            s.protagonist_pull_was_save_situation as i64,
            s.opponent_pull_was_save_situation as i64,
        ],
    )?;
    Ok(())
}

fn load_protagonist_as_pitcher(conn: &Connection) -> anyhow::Result<PitcherStats> {
    let (stats_raw, live_state_raw, handedness_raw): (String, String, String) = conn.query_row(
        "SELECT stats, live_state, handedness FROM protagonist WHERE id = 'proto:1'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let v: serde_json::Value = serde_json::from_str(&stats_raw)?;
    let live_state: serde_json::Value = serde_json::from_str(&live_state_raw)?;
    Ok(PitcherStats {
        id: "proto:1".to_string(),
        control: v.get("제구").and_then(|x| x.as_f64()).unwrap_or(50.0),
        stuff: v.get("구위").and_then(|x| x.as_f64()).unwrap_or(50.0),
        fatigue: live_state.get("피로도").and_then(|x| x.as_f64()).unwrap_or(0.0),
        velocity: v.get("구속").and_then(|x| x.as_f64()).unwrap_or(50.0),
        game_management: v.get("경기운영").and_then(|x| x.as_f64()).unwrap_or(50.0),
        clutch: v.get("클러치").and_then(|x| x.as_f64()).unwrap_or(50.0),
        composure: v.get("침착함").and_then(|x| x.as_f64()).unwrap_or(50.0),
        handedness: match_sim::Handedness::parse(&handedness_raw),
    })
}

/// 구종 마스터리(05_구종_시스템.md §2, 대화 2026-07-23) — `protagonist.pitches`는
/// `{name, stage, weeks}` 객체 배열. Phase 4부터 매치 엔진이 마스터리
/// 단계를 실제로 쓰므로(`pitch::throw_pitch`) 이름만 뽑던 예전과 달리
/// stage를 그대로 보존해서 넘긴다.
fn load_protagonist_pitches(conn: &Connection) -> anyhow::Result<Vec<pitch::PitchMastery>> {
    let raw: String = conn.query_row("SELECT pitches FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let pitches: Vec<serde_json::Value> = serde_json::from_str(&raw)?;
    Ok(repository::pitch_mastery_entries(&pitches))
}

/// PA 결과를 세션에 반영 — 아웃 집계 또는 주자 진루+득점, 타석 종료 시
/// 카운트·타자 정보를 리셋해 다음 타자를 맞을 준비를 한다.
/// `match_sim::simulate_half_inning`의 내부 스위치와 동일한 분기를
/// 세션 상태에 대해 재현한 것 — 로직 자체는 그쪽과 절대 갈라지지 않게
/// 유지해야 한다(둘 다 `PaOutcome`을 공유하는 이유). `team_speed`(Phase 3)
/// 는 단타·2루타의 무리한 추가진루 판정(`advance_runners_realistic`)에
/// 쓰인다 — 도루 이벤트 자체는 이 인터랙티브 경로(주인공이 직접 던지는
/// 하프이닝)에선 스코프 밖(배경 하프이닝인 `simulate_half_inning`에만
/// 있음, 1구 단위 루프에 끼워 넣으면 매 구마다 중복 판정될 위험이 있어
/// 이번엔 보류 — 10_구현_Phase_계획.md 참고).
fn apply_pa_outcome(rng: &mut impl Rng, session: &mut SessionRow, batting_team_is_home: bool, outcome: PaOutcome, team_speed: f64) {
    let runs = match outcome {
        PaOutcome::Strikeout | PaOutcome::Out => {
            session.outs += 1;
            0
        }
        PaOutcome::DoublePlay => {
            session.outs += 2;
            session.bases[0] = false;
            0
        }
        PaOutcome::SacFly => {
            session.outs += 1;
            if session.bases[2] {
                session.bases[2] = false;
                1
            } else {
                0
            }
        }
        PaOutcome::ReachOnError | PaOutcome::Walk | PaOutcome::HitByPitch => match_sim::advance_runners(&mut session.bases, 1),
        PaOutcome::Single => match_sim::advance_runners_realistic(rng, &mut session.bases, 1, session.outs as u32, team_speed),
        PaOutcome::Double => match_sim::advance_runners_realistic(rng, &mut session.bases, 2, session.outs as u32, team_speed),
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
    credit_saves(slot_conn, session, protagonist_team_id)?;
    slot_conn.execute("DELETE FROM match_session WHERE id = 1", [])?;
    Ok(MatchStepResult::GameOver { home_runs: session.home_runs as u32, away_runs: session.away_runs as u32 })
}

/// 세이브 판정(Phase 6, §12) — 배경 경기(`match_sim::simulate_game`)는
/// 게임 종료 시점에 자체적으로 판정하지만, 인터랙티브 경기는 하프이닝마다
/// 흩어져 진행돼 게임이 완전히 끝나야만 "리드를 지켰는지" 알 수 있어
/// 여기 게임 종료 지점에서 한 번에 처리한다. 주인공 쪽·상대 쪽 둘 다
/// 대상 — 강판된 그 순간 세이브 상황이었고(`*_pull_was_save_situation`),
/// 그 팀이 최종적으로 리드를 지킨 채 이겼으면 구원투수에게 세이브 1개.
fn credit_saves(slot_conn: &Connection, session: &SessionRow, protagonist_team_id: &str) -> anyhow::Result<()> {
    let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
    let week = crate::calendar::week_for_day(today);

    if session.protagonist_pulled && session.protagonist_pull_was_save_situation {
        let protagonist_is_home = session.home == protagonist_team_id;
        let (team_runs, opponent_runs) =
            if protagonist_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
        if team_runs > opponent_runs {
            if let Some(reliever_id) = &session.relief_pitcher_id {
                repository::credit_pitcher_save(slot_conn, reliever_id, week)?;
            }
        }
    }
    if session.opponent_pulled && session.opponent_pull_was_save_situation {
        let opponent_is_home = session.home != protagonist_team_id;
        let (team_runs, opponent_runs) =
            if opponent_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
        if team_runs > opponent_runs {
            if let Some(reliever_id) = &session.opponent_relief_pitcher_id {
                repository::credit_pitcher_save(slot_conn, reliever_id, week)?;
            }
        }
    }
    Ok(())
}

/// 주인공 등판 평가([09_평가_시스템](../../../02_기획/육성코어/09_평가_시스템.md)
/// §5-4 "역할별 계산 트리거") — §5-3 "최소 등판 기준"(선발 1이닝 이상)은
/// 지금 감독 개입 소프트캡(90구)이 훨씬 높아 사실상 항상 자동 충족.
/// 감독 신뢰도(§4)는 스태프 시스템이 정식으로 없어(전술력·신뢰형성력만
/// 해시 근사, `sim::manager`) 반영 안 함 — 사기·주목도·`game_log` 기록만.
/// 강판된 경우(`protagonist_pulled`) `runs_allowed`·`innings_pitched`는
/// 강판 시점 스냅샷을 우선 써서, 불펜이 강판 이후 내준 점수가 주인공
/// 개인 성적에 안 섞이게 한다.
/// 등판 1구당 주인공 피로도 누적(§6-62, 대화 설계 2026-07-21) — 예전엔
/// 주인공 피로도가 훈련 강도로만 결정되고 실제 등판과는 무관했다(NPC는
/// `repository::accumulate_game_fatigue`로 경기당 고정 피로도가 쌓이는데
/// 주인공에겐 그 연결이 없었음). 매 구 단위로 세밀하게 추적하는 주인공
/// 세션 특성을 살려 경기당 고정치 대신 투구수 비례로 반영 — 한 등판
/// (90~120구, §6-54 소프트·하드캡)이면 대략 NPC 경기당 고정치(12)와
/// 비슷한 13.5~18 사이가 쌓인다. 주간 회복은 `process_protagonist_week`
/// (repository.rs)의 절반 감소가 담당.
const PROTAGONIST_FATIGUE_PER_PITCH: f64 = 0.15;

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
    // 투수지도력 코치 보너스(이월 부채 정리, 대화 2026-07-22) — 코치 없으면
    // (구버전 세이브 등) 0(무보정).
    let coach = repository::load_coach_stats(slot_conn, protagonist_team_id)?;
    let eval_bonus = coach.as_ref().map(|c| crate::sim::staff::coach_eval_bonus(c.pitching)).unwrap_or(0.0);
    let own_skill = (pitcher.control + pitcher.stuff) / 2.0 + eval_bonus;

    let grade = eval::grade_outing(runs_allowed, opponent_avg, own_skill);

    let live_state_raw: String = slot_conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0))?;
    let mut live_state: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&live_state_raw)?;
    let morale = live_state.get("사기").and_then(|v| v.as_f64()).unwrap_or(50.0);
    let attention = live_state.get("주목도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let fatigue = live_state.get("피로도").and_then(|v| v.as_f64()).unwrap_or(0.0);
    // 멘탈코칭 코치 보너스 — 나쁜 등급의 사기 하락폭만 완화(좋은 등급엔
    // 영향 없음, sim::staff::coach_mental_dampening 문서 참고).
    let mut morale_delta = eval::morale_delta(grade);
    if morale_delta < 0.0 {
        morale_delta *= coach.as_ref().map(|c| crate::sim::staff::coach_mental_dampening(c.mental)).unwrap_or(1.0);
    }
    live_state.insert("사기".to_string(), serde_json::json!((morale + morale_delta).clamp(0.0, 100.0)));
    live_state.insert("주목도".to_string(), serde_json::json!(attention + eval::attention_gain(grade)));
    live_state.insert("피로도".to_string(), serde_json::json!(fatigue + session.pitch_seq as f64 * PROTAGONIST_FATIGUE_PER_PITCH));
    slot_conn.execute(
        "UPDATE protagonist SET live_state = ?1 WHERE id = 'proto:1'",
        params![serde_json::Value::Object(live_state).to_string()],
    )?;

    // 감독 관계도(§6-59) — 좋은 등급 누적이 관계를 쌓는다(04_프로_커리어.md
    // §Phase3). 감독이 없는 세이브에선 `adjust_relationship`이 조용히 no-op.
    repository::adjust_relationship(slot_conn, &format!("manager:{protagonist_team_id}"), crate::sim::manager::relationship_delta_from_grade(grade))?;

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
        "hits_allowed": session.hits_allowed,
        "walks": session.walks_allowed,
    })
    .to_string();
    slot_conn.execute(
        "INSERT INTO game_log (game_id, season, detail) VALUES (?1, ?2, ?3)
         ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, detail = excluded.detail",
        params![session.game_id, season, detail],
    )?;

    // 업적(특수달성형, 04_업적.md §2) — "퍼펙트게임" 원안은 타자 아웃·안타·
    // 볼넷까지 매치 엔진이 추적해야 해(현재는 실점만 기록) 이번 1차 배치는
    // 이미 있는 값(무실점 + 완투)만으로 판정 가능한 "완봉승"으로 단순화한
    // D그룹 placeholder — `apply_protagonist_evaluation`이 이미 이 값들을
    // 계산해뒀으니 별도 조회 없이 그대로 판정.
    if decision == "승" && runs_allowed == 0 && session.protagonist_pull_inning.is_none() {
        let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
        repository::unlock_achievement(slot_conn, "ach:shutout", "완봉승", 1, today)?;
    }

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

    // 환경 요소(Phase 5, §10-1) — 홈팀 구장의 파크팩터 + 게임당 1회 굴리는
    // 날씨. `content_conn`은 이후 `submit_pitch` 호출마다 넘어오지 않으므로
    // (세션 시작 이후엔 slot_conn만으로 진행하는 기존 관례) 여기서 한 번만
    // 계산해 세션에 영속시킨다(migration v17).
    let park_factor_raw = crate::data::content::load_team_park_factor(content_conn, home)?;
    let mut weather_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(world_seed, &format!("weather:{game_id}")));
    let conditions = match_sim::roll_game_conditions(&mut weather_rng, park_factor_raw.as_deref());

    slot_conn.execute(
        "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                     home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes, current_batter_id, pitch_seq, strikeouts,
                                     park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, 1, 1, 0, '[false,false,false]', 0, 0, 0, 0, 0, 0, NULL, 0, 0, ?6, ?7, ?8, ?9)",
        params![
            game_id,
            home,
            away,
            league_id,
            mode,
            conditions.park_factor,
            conditions.weather_control_mod,
            conditions.weather_power_mod,
            conditions.weather_fatigue_mult,
        ],
    )?;

    run_until_decision_point(slot_conn, world_seed, None, None)
}

/// 1구 제출(§5) — `AwaitingPitch`로 멈춘 세션에 플레이어의 구종·코스
/// 선택을 반영하고 다음 결정 지점(또는 경기 종료)까지 진행한다.
pub fn submit_pitch(slot_conn: &Connection, world_seed: i64, pitch_name: &str, course: Course) -> anyhow::Result<MatchStepResult> {
    run_until_decision_point(slot_conn, world_seed, Some((pitch_name.to_string(), course)), None)
}

/// 감독 개입 수동 모드(§8) 응답 — `PitcherChangeDecision`으로 멈춘
/// 세션에 `"유지"`/`"교체"`/그 외(="맡기기", AI 판정에 위임)를 반영하고
/// 다음 결정 지점까지 진행한다.
pub fn submit_pitcher_change_decision(slot_conn: &Connection, world_seed: i64, choice: &str) -> anyhow::Result<MatchStepResult> {
    run_until_decision_point(slot_conn, world_seed, None, Some(choice))
}

/// 세션이 있는 동안 계속 진행하다가 ①플레이어 입력이 필요하거나(§3 모드에
/// 따라) ②경기가 끝나면 멈춘다. `player_pitch`는 `submit_pitch`로 막
/// 제출된 선택, `pitcher_decision`은 `submit_pitcher_change_decision`으로
/// 막 제출된 선택 — 둘 다 있으면 이번 루프의 **첫 판정에만** 소비되고,
/// 이후 반복에서는 다시 정상적인 AI/프롬프트 로직을 탄다.
fn run_until_decision_point(
    slot_conn: &Connection,
    world_seed: i64,
    mut player_pitch: Option<(String, Course)>,
    mut pitcher_decision: Option<&str>,
) -> anyhow::Result<MatchStepResult> {
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

        // 감독 개입(§8) — 하프이닝 경계마다 판단. 강판되면 이후 이 팀의
        // 투구는 배경 하프이닝 경로로 넘어간다(아래). 자동·반자동은 AI가
        // 즉시 판단(기존 로직 그대로), 수동은 "고려 구간"(소프트캡 이상)
        // 에서만 플레이어에게 먼저 묻고(§8 "이닝 종료마다 판단 기회") —
        // 위기상황(`high_leverage`)마다 추가로 묻는 건 이번 스코프에서
        // 제외(10_구현_Phase_계획.md §6-58 스코프 판단 참고).
        if protagonist_pitching_team && !session.protagonist_pulled {
            let manager = repository::load_manager_stats(slot_conn, &protagonist_team_id)?;
            let manager_npc_id = format!("manager:{protagonist_team_id}");
            // 관계도(§6-59, 04_프로_커리어.md §Phase3 "감독 신뢰도 = 관계도
            // 재사용")로 감독의 정적 신뢰형성력을 보정 — 실제 그동안 쌓은
            // 관계가 강판 판단에 반영된다. 0.3 계수는 D그룹 placeholder.
            let relationship = repository::relationship_value(slot_conn, &manager_npc_id)? as f64;
            let effective_trust = (manager.trust + relationship * 0.3).clamp(0.0, 100.0);
            let pitcher_fatigue = load_protagonist_as_pitcher(slot_conn)?.fatigue;
            let pitches_thrown = session.pitch_seq as u32;

            // 수동 모드 핑퐁 버그 수정(Phase 3, migration v15) — 이 투구수에서
            // 이미 "불풀"로 확정된 적이 있으면 다시 안 묻는다. 없으면
            // `submit_pitcher_change_decision`으로 "유지"/"맡기기"를 답해도
            // 투구수(`pitch_seq`)가 아직 그대로인 채 바로 다음 `submit_pitch`
            // 호출이 이 게이트를 처음부터 다시 타서, 소프트캡을 넘긴 채로
            // 오래 던지는 어떤 경기든 `PitcherChangeDecision`↔`AwaitingPitch`
            // 사이를 영원히 왕복하는 무한 루프에 빠졌다(실측 진단으로 발견).
            let already_settled_no_pull = session.pull_decision_settled_at_pitch_count == Some(pitches_thrown as i64);
            let pull_now = if already_settled_no_pull {
                false
            } else if session.mode == "수동" {
                let prob = crate::sim::manager::pull_probability(pitches_thrown, pitcher_fatigue, manager.tactics, effective_trust);
                if prob <= 0.0 {
                    false // 아직 고려 구간 아님 — 묻지도 않고 계속 진행.
                } else {
                    match pitcher_decision.take() {
                        None => {
                            return Ok(MatchStepResult::PitcherChangeDecision {
                                inning: session.inning as u32,
                                top_of_inning: session.top_of_inning,
                                home_runs: session.home_runs as u32,
                                away_runs: session.away_runs as u32,
                                pitches_thrown,
                                fatigue: pitcher_fatigue,
                                manager_recommends_pull: prob >= 0.5,
                            });
                        }
                        Some(choice @ ("교체" | "유지")) => {
                            let pulled = choice == "교체";
                            // "맡기기"는 플레이어의 판단이 아니라 동의/반대 자체가
                            // 성립하지 않는다 — 이 두 분기에서만 관계도를 조정.
                            let agreed = pulled == (prob >= 0.5);
                            repository::adjust_relationship(slot_conn, &manager_npc_id, crate::sim::manager::relationship_delta_from_pull_agreement(agreed))?;
                            if !pulled {
                                session.pull_decision_settled_at_pitch_count = Some(pitches_thrown as i64);
                                save_session(slot_conn, &session)?;
                            }
                            pulled
                        }
                        Some(_) /* "맡기기" — AI 판정에 그대로 맡김 */ => {
                            let mut pull_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                                world_seed,
                                &format!("pull:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
                            ));
                            let pulled =
                                crate::sim::manager::should_pull_pitcher(&mut pull_rng, pitches_thrown, pitcher_fatigue, manager.tactics, effective_trust);
                            if !pulled {
                                session.pull_decision_settled_at_pitch_count = Some(pitches_thrown as i64);
                                save_session(slot_conn, &session)?;
                            }
                            pulled
                        }
                    }
                }
            } else {
                let mut pull_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                    world_seed,
                    &format!("pull:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
                ));
                crate::sim::manager::should_pull_pitcher(&mut pull_rng, pitches_thrown, pitcher_fatigue, manager.tactics, effective_trust)
            };

            if pull_now {
                let protagonist_is_home = session.home == protagonist_team_id;
                let (team_runs_so_far, opponent_runs_so_far) =
                    if protagonist_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
                // 이 강판 시점의 실제 이닝·점수차로 세이브 상황을 판단(Part G) —
                // 세이브 상황이면 마무리(`season_meta['closer:{team_id}']`)를,
                // 아니면 중계 풀을 우선한다.
                let save_situation = crate::sim::manager::is_save_situation(session.inning, team_runs_so_far, opponent_runs_so_far);
                if let Some(reliever) = repository::load_relief_pitcher(slot_conn, &protagonist_team_id, save_situation)? {
                    session.protagonist_pulled = true;
                    session.relief_pitcher_id = Some(reliever.id);
                    session.protagonist_pull_inning = Some(session.inning);
                    session.protagonist_pull_opponent_runs = Some(opponent_runs_so_far);
                    session.protagonist_pull_was_save_situation = save_situation;
                    save_session(slot_conn, &session)?;
                } else {
                    // 로스터에 불펜이 아예 없어(구원투수 부재) 강판하고 싶어도
                    // 못 하는 방어적 폴백(§6-N, `sim::match_.rs`의
                    // `TeamPitchingPlan.reliever: None` 완투 폴백과 동일 철학) —
                    // 이것도 "settled"로 남겨야 한다. 안 남기면 이 투구수에서
                    // 매번 다시 강판을 시도하고 매번 불펜이 없어 실패하는
                    // 무한 루프에 빠진다(실측 진단으로 발견, Phase 3).
                    session.pull_decision_settled_at_pitch_count = Some(pitches_thrown as i64);
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
            } else if session.opponent_pulled {
                let relief_id = session.opponent_relief_pitcher_id.clone().expect("opponent_pulled requires opponent_relief_pitcher_id");
                repository::load_pitcher_by_id(slot_conn, &relief_id)?
            } else {
                let starter = repository::load_starting_pitcher(slot_conn, &pitching_team)?;
                // 상대팀 투수 강판(§8 대칭, Part H, 대화 2026-07-26) — 지금까지
                // 이 게임에서 이 투수가 상대한 누적 타자 수(`opponent_pitcher_batters_faced`,
                // 하프이닝마다 아래에서 누적)로 배경 경기(process_day)와 동일한
                // "타자 수 × 3.8" 근사를 쓴다. 게임당 딱 1회만(주인공 쪽과 동일 제약).
                let approx_pitches = (session.opponent_pitcher_batters_faced as f64 * 3.8) as u32;
                let opponent_manager = repository::load_manager_stats(slot_conn, &pitching_team)?;
                let mut pull_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                    world_seed,
                    &format!("opponent_pull:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
                ));
                let should_pull = crate::sim::manager::should_pull_pitcher(
                    &mut pull_rng,
                    approx_pitches,
                    starter.fatigue,
                    opponent_manager.tactics,
                    opponent_manager.trust,
                );
                if should_pull {
                    let pitching_team_is_home = pitching_team == session.home;
                    let (team_runs_so_far, opponent_runs_so_far) =
                        if pitching_team_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
                    let save_situation = crate::sim::manager::is_save_situation(session.inning, team_runs_so_far, opponent_runs_so_far);
                    match repository::load_relief_pitcher(slot_conn, &pitching_team, save_situation)? {
                        Some(reliever) => {
                            session.opponent_pulled = true;
                            session.opponent_relief_pitcher_id = Some(reliever.id.clone());
                            session.opponent_pitcher_batters_faced = 0;
                            session.opponent_pull_was_save_situation = save_situation;
                            reliever
                        }
                        None => starter,
                    }
                } else {
                    starter
                }
            };
            let mut idx = (if batting_team_is_home { session.home_batter_idx } else { session.away_batter_idx }) as usize;
            let mut rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                world_seed,
                &format!("match:{}:{}:{}", session.game_id, session.inning, session.top_of_inning),
            ));
            let mut injuries = Vec::new();
            let mut half_inning_stats = match_sim::HalfInningStats::default();
            // 위기상황 기저값(Phase 1) — 만루 여부는 `simulate_half_inning`이
            // 타석마다 다시 판단하므로 여기선 이닝·스코어차만 넘긴다.
            let leverage_base =
                pitch::is_high_leverage_situation(false, (session.home_runs - session.away_runs) as i32, session.inning as u32);
            // 수비 중인 팀(투구 중인 팀)의 평균 수비력(Phase 2)·감독 전술력
            // (Phase 5, 수비 시프트 적중도) — 실책·시프트 판정에 씀.
            let fielding_lineup = repository::load_batting_lineup(slot_conn, &pitching_team)?;
            let team_defense = match_sim::average_defense(&fielding_lineup);
            let fielding_tactics = repository::load_manager_stats(slot_conn, &pitching_team)?.tactics;
            let runs = match_sim::simulate_half_inning(
                &mut rng,
                &lineup,
                &mut idx,
                &pitcher,
                session.bases,
                leverage_base,
                team_defense,
                fielding_tactics,
                &session.conditions,
                &mut injuries,
                &mut half_inning_stats,
            );
            if !protagonist_pitching_team {
                let faced_this_half =
                    half_inning_stats.pitcher.outs_recorded + half_inning_stats.pitcher.hits_allowed + half_inning_stats.pitcher.walks;
                session.opponent_pitcher_batters_faced += faced_this_half as i64;
            }
            repository::apply_injury_events(slot_conn, &injuries, today)?;
            repository::accumulate_game_fatigue(slot_conn, &batting_team, session.conditions.weather_fatigue_mult)?;
            // 이 하프이닝의 투수(상대 선발 또는 주인공 강판 후 중계/마무리투수)와
            // 타석에 선 타자 전원(주인공 팀 동료 또는 상대 타자) 모두
            // season_stats에 즉시 반영 — 배경 경기(process_day)와 동일한
            // upsert 헬퍼를 재사용해 게임 종료를 기다리지 않고 하프이닝마다
            // 누적한다(10_구현_Phase_계획.md §6-N, 원래 초안이 주인공 자신의
            // 경기에서 이 기록을 통째로 버리고 있었던 걸 바로잡음).
            let week = crate::calendar::week_for_day(today);
            repository::upsert_pitcher_season_stats(slot_conn, &pitcher.id, week, &half_inning_stats.pitcher)?;
            for (batter_id, s) in &half_inning_stats.batters {
                repository::upsert_batter_season_stats(slot_conn, batter_id, week, s)?;
            }
            if !protagonist_pitching_team && !session.opponent_pulled {
                // 주인공이 강판된 뒤의 불펜 투수와 동일한 이유(§8 스코프
                // 판단, Part H에서 상대팀에도 대칭 적용) — `accumulate_game_fatigue`
                // 는 position='선발투수'만 찾아 이미 벤치로 물러난 원래
                // 선발을 잘못 갱신하게 되므로, 상대팀도 강판 후에는 호출
                // 자체를 건너뛴다.
                repository::accumulate_game_fatigue(slot_conn, &pitching_team, session.conditions.weather_fatigue_mult)?;
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

        // 마스터리 단계·레퍼토리 다양성(Phase 4)은 어느 분기든(플레이어
        // 직접 선택 또는 AI 자동 선택) 필요해 분기 진입 전에 미리 불러온다.
        let repertoire = load_protagonist_pitches(slot_conn)?;
        let repertoire_diverse = pitch::repertoire_is_diverse(&repertoire);

        let (pitch_name, course) = if let Some(choice) = player_pitch.take() {
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
            let (pitch, course) = pitch::choose_pitch_and_course(&mut rng, &repertoire, &batter, high_leverage);
            (pitch.name, course)
        };
        // 플레이어가 직접 고른 구종은 이름만 넘어오므로(§5 UI가 known
        // 구종 중에서만 고르게 함) 마스터리 단계를 레퍼토리에서 다시
        // 찾는다 — 못 찾으면(방어적 폴백) 습작(1단계) 취급.
        let mastery_stage = repertoire.iter().find(|p| p.name == pitch_name).map(|p| p.stage).unwrap_or(1);

        let result = pitch::throw_pitch(&mut rng, &pitcher, &batter, course, high_leverage, mastery_stage, repertoire_diverse, &session.conditions);
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

        // 타석에 선 팀(=주인공 상대편)의 평균 주력(Phase 3) — 추가진루 판정에 씀.
        let team_speed = match_sim::average_speed(&lineup);

        match outcome {
            pitch::AtBatOutcome::InProgress => {}
            pitch::AtBatOutcome::Strikeout => {
                session.strikeouts += 1;
                apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::Strikeout, team_speed);
            }
            pitch::AtBatOutcome::Walk => {
                session.walks_allowed += 1;
                apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::Walk, team_speed);
            }
            pitch::AtBatOutcome::HitByPitch => {
                apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::HitByPitch, team_speed)
            }
            pitch::AtBatOutcome::InPlay => {
                // 수비 중인 팀은 주인공 자신의 팀(투구 중이므로, Phase 2).
                // 감독 전술력(Phase 5, 수비 시프트)도 같은 팀 것.
                let fielding_lineup = repository::load_batting_lineup(slot_conn, &protagonist_team_id)?;
                let team_defense = match_sim::average_defense(&fielding_lineup);
                let fielding_tactics = repository::load_manager_stats(slot_conn, &protagonist_team_id)?.tactics;
                let pa = match_sim::resolve_in_play_result(
                    &mut rng,
                    &batter,
                    &pitcher,
                    session.bases,
                    session.outs as u32,
                    team_defense,
                    fielding_tactics,
                    high_leverage,
                    &session.conditions,
                );
                if matches!(pa, PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun) {
                    session.hits_allowed += 1;
                }
                apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, pa, team_speed);
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
             VALUES ('proto:1', '주인공', '우투', '강속구형', ?1, '{}', '{\"피로도\":0}', '{}', '[{\"name\":\"포심 패스트볼\",\"stage\":1,\"weeks\":0}]', ?2, '{\"current\":null,\"history\":[]}')",
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
             VALUES (?1, ?1, ?2, '중계투수', 20, 1, 0, 50.0, '{}', ?3, '{}', '{\"피로도\":0}', '[\"포심 패스트볼\"]', '{\"current\":null,\"history\":[]}')",
            params![format!("{team_id}_rp"), team_id, serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
        )
        .unwrap();
    }

    fn insert_manager(conn: &Connection, team_id: &str, tactics: f64, trust: f64) {
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?1, ?2, '감독', 50, 0, 0, 50.0, '{}', ?3, '{}', '{}', NULL, '{\"current\":null,\"history\":[]}')",
            params![
                format!("manager:{team_id}"),
                team_id,
                serde_json::json!({"전술력": tactics, "신뢰형성력": trust, "육성안목": 50.0, "카리스마": 50.0}).to_string(),
            ],
        )
        .unwrap();
    }

    fn insert_coach(conn: &Connection, team_id: &str, stats: serde_json::Value) {
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?1, ?2, '코치', 50, 0, 0, 50.0, '{}', ?3, '{}', '{}', NULL, '{\"current\":null,\"history\":[]}')",
            params![format!("coach:{team_id}"), team_id, stats.to_string()],
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
            opponent_pulled: false,
            opponent_relief_pitcher_id: None,
            opponent_pitcher_batters_faced: 0,
            pull_decision_settled_at_pitch_count: None,
            conditions: match_sim::GameConditions::default(),
            hits_allowed: 0,
            walks_allowed: 0,
            protagonist_pull_was_save_situation: false,
            opponent_pull_was_save_situation: false,
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
    fn game_completion_records_season_stats_for_the_opposing_pitcher_and_teammates() {
        // 주인공 자신의 경기에서 배경 하프이닝(주인공 팀 타석)이 상대 선발
        // 투수와 주인공 팀 동료 타자들의 기록을 통째로 버리던 문제(초안 발견
        // 사항) — season_stats에 실제로 남는지 확인.
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "자동").unwrap();

        let line: String =
            slot_conn.query_row("SELECT line FROM season_stats WHERE player_id = 'team:away_sp' AND week = 1", [], |r| r.get(0)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert!(v["outs_recorded"].as_i64().unwrap() > 0, "opposing starter's innings should be recorded from the protagonist's own game");

        let home_batter_rows: i64 =
            slot_conn.query_row("SELECT COUNT(*) FROM season_stats WHERE player_id LIKE 'team:home_b%'", [], |r| r.get(0)).unwrap();
        assert!(home_batter_rows > 0, "protagonist's teammates' batting lines should be recorded");
    }

    #[test]
    fn pulling_the_protagonist_records_season_stats_for_the_reliever() {
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

        run_until_decision_point(&slot_conn, 1, None, None).unwrap(); // 프롬프트 발생
        submit_pitcher_change_decision(&slot_conn, 1, "교체").unwrap();

        let line: String =
            slot_conn.query_row("SELECT line FROM season_stats WHERE player_id = 'team:home_rp' AND week = 1", [], |r| r.get(0)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert!(v["outs_recorded"].as_i64().unwrap() > 0, "the reliever who finishes the game should have recorded innings");
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
        // Phase 2가 `resolve_in_play_result` 안에 새 RNG 굴림(실책·타구
        // 유형)을 추가하면서 각 시드의 이후 난수 시퀀스가 통째로 바뀌었다
        // — 어느 시드가 부상을 "뽑는지"는 달라져도 350회 시행이면 여전히
        // 안정적으로 최소 1건은 걸린다(원래 150회도 낮은 확률 이벤트
        // 대비 넉넉한 여유를 둔 값이었음).
        let content_conn = build_content_db();
        let mut triggered = false;
        for seed in 0..350i64 {
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
        assert!(triggered, "expected at least one seed across 350 trials to injure the protagonist pitcher during their own start");
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
                MatchStepResult::PitcherChangeDecision { .. } => {
                    result = submit_pitcher_change_decision(&slot_conn, 1, "맡기기").unwrap();
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

        let result = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        assert!(matches!(result, MatchStepResult::GameOver { .. }), "automatic mode should still run to completion after a mid-game pull");

        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert_eq!(detail.get("pulled_by_manager").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(detail.get("innings_pitched").and_then(|v| v.as_i64()), Some(1), "should freeze at the inning the pull happened in");
        assert_eq!(detail.get("runs_allowed").and_then(|v| v.as_i64()), Some(0), "should freeze at the opponent score at pull time, not the final score");
    }

    /// 상대팀 투수 강판(§8 대칭, Part H, 대화 2026-07-26) — 상대(`team:away`)
    /// 투수가 이번 게임에서 이미 많은 타자를 상대한 것으로 세션을 직접
    /// 꾸며(근사 투구수가 하드캡을 훌쩍 넘기게) 첫 하프이닝 경계에서 반드시
    /// 강판되도록 만든다(RNG에 기대지 않는 결정론적 시나리오). 세션 행은
    /// 게임 종료 시 지워지므로(`finalize_game`) 강판 자체는 그 결과물인
    /// season_stats로 검증 — Part H 이전엔 배경 쪽 상대 투수가 절대 안
    /// 바뀌어 `team:away_rp`에 season_stats가 남을 일이 없었다.
    #[test]
    fn opponent_pitcher_gets_pulled_and_the_reliever_records_season_stats() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_protagonist(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_reliever(&slot_conn, "team:away");
        insert_schedule(&slot_conn, "game:1");

        // top_of_inning=0(하위 이닝) — team:home이 타석, team:away가 투구.
        // opponent_pitcher_batters_faced=40 → 근사 투구수 152(40*3.8)로
        // 하드캡(120) 훌쩍 초과, RNG와 무관하게 무조건 강판.
        slot_conn
            .execute(
                "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                             home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                             current_batter_id, pitch_seq, strikeouts, opponent_pitcher_batters_faced)
                 VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '자동', 1, 0, 0, '[false,false,false]',
                         0, 0, 0, 0, 0, 0, NULL, 0, 0, 40)",
                [],
            )
            .unwrap();

        let result = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        assert!(matches!(result, MatchStepResult::GameOver { .. }), "automatic mode should still run to completion after an opponent pull");

        let has_reliever_stats: bool = slot_conn
            .query_row("SELECT EXISTS(SELECT 1 FROM season_stats WHERE player_id = 'team:away_rp')", [], |r| r.get(0))
            .unwrap();
        assert!(has_reliever_stats, "the opponent reliever should have pitched and recorded season_stats after being pulled in");
    }

    #[test]
    fn manager_never_auto_pulls_in_manual_mode_but_asks_the_player_instead() {
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

        let result = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        match result {
            MatchStepResult::PitcherChangeDecision { pitches_thrown, manager_recommends_pull, .. } => {
                assert_eq!(pitches_thrown, 200);
                assert!(manager_recommends_pull, "well past the hard cap, the manager's advisory opinion should be to pull");
            }
            other => panic!("manual mode past the soft cap should ask the player instead of silently pausing on the next pitch, got {other:?}"),
        }

        let pulled: i64 = slot_conn.query_row("SELECT protagonist_pulled FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pulled, 0, "no auto-pull should happen until the player actually responds");
    }

    /// 감독 개입 핑퐁 무한 루프 회귀 테스트(Phase 3, migration v15, 실측
    /// 진단으로 발견) — "유지"로 불풀을 확정해도 그 결정이 세션에 안
    /// 남으면, 바로 다음 실제 투구 제출에서 투구수가 아직 그대로라
    /// 강판 소프트캡 판정을 처음부터 다시 타서 `PitcherChangeDecision`을
    /// 또 돌려주고, 그걸 다시 답해도 또 물어보는 무한 핑퐁에 빠졌다.
    #[test]
    fn keeping_the_pitcher_in_manual_mode_settles_the_decision_so_the_next_pitch_actually_throws() {
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

        let first = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        assert!(matches!(first, MatchStepResult::PitcherChangeDecision { .. }), "got {first:?}");

        // "유지"로 확정 — 버그 수정 전엔 여기서 아무 것도 세션에 안 남았다.
        let after_keep = submit_pitcher_change_decision(&slot_conn, 1, "유지").unwrap();
        assert!(matches!(after_keep, MatchStepResult::AwaitingPitch { .. }), "got {after_keep:?}");

        let settled: Option<i64> =
            slot_conn.query_row("SELECT pull_decision_settled_at_pitch_count FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(settled, Some(200), "the no-pull decision at pitch 200 must be persisted");

        // 같은 투구수(200)에서 실제 공을 제출하면 그 공은 진짜로 던져져야
        // 한다(pitch_seq가 201로 증가) — 버그가 있었다면 이 공 자체가
        // 던져지지도 않고 pitch_seq가 200에 멈춘 채 또 PitcherChangeDecision
        // 만 반복됐다. (201구째도 여전히 "고려 구간"이라 그 시점에 새
        // PitcherChangeDecision이 뜨는 것 자체는 정상 — 매 투구마다 다시
        // 묻는 게 UX상 과함은 이미 아는 이월 이슈, 10_구현_Phase_계획.md 참고.)
        let after_pitch = submit_pitch(&slot_conn, 1, "포심 패스트볼", Course::MidCenter).unwrap();
        let pitch_seq: i64 = slot_conn.query_row("SELECT pitch_seq FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pitch_seq, 201, "the pitch should have actually been thrown, advancing pitch_seq — got step {after_pitch:?}");
    }

    /// 감독 개입 핑퐁 무한 루프 회귀 테스트의 두 번째 시나리오 — AI가
    /// 강판을 원해도(하드캡 훌쩍 넘김, `should_pull_pitcher`가 무조건
    /// true) 로스터에 불펜이 아예 없으면 강판 자체가 불발되는데, 이것도
    /// "settled"로 안 남으면 다음 투구 제출마다 매번 다시 강판을 시도했다
    /// 실패하는 무한 루프에 빠졌다.
    #[test]
    fn deferring_to_the_manager_when_no_reliever_exists_settles_the_decision_instead_of_looping() {
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home"); // insert_reliever 생략 — 불펜이 아예 없는 로스터.
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        slot_conn
            .execute(
                "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                             home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                             current_batter_id, pitch_seq, strikeouts)
                 VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '수동', 1, 1, 0, '[false,false,false]',
                         0, 0, 0, 0, 0, 0, NULL, 300, 0)",
                [],
            )
            .unwrap();

        let first = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        assert!(matches!(first, MatchStepResult::PitcherChangeDecision { .. }), "got {first:?}");

        // "맡기기" — 300구는 하드캡을 훌쩍 넘겨 AI가 무조건 강판을 시도하지만
        // (`should_pull_pitcher`는 확률 1.0이면 무조건 true), 불펜이 없어
        // 실제로는 강판이 불발된다.
        let after_defer = submit_pitcher_change_decision(&slot_conn, 1, "맡기기").unwrap();
        assert!(matches!(after_defer, MatchStepResult::AwaitingPitch { .. }), "got {after_defer:?}");

        let pulled: i64 = slot_conn.query_row("SELECT protagonist_pulled FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pulled, 0, "no reliever available means the pull can't actually happen");
        let settled: Option<i64> =
            slot_conn.query_row("SELECT pull_decision_settled_at_pitch_count FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(settled, Some(300), "the failed-pull attempt at pitch 300 must still be persisted as settled");

        // 같은 투구수(300)에서 실제 공을 제출하면 그 공은 진짜로 던져져야
        // 한다 — 버그가 있었다면 매번 다시 강판을 시도했다 실패하며
        // pitch_seq가 300에 멈춘 채 무한 반복됐다.
        let after_pitch = submit_pitch(&slot_conn, 1, "포심 패스트볼", Course::MidCenter).unwrap();
        let pitch_seq: i64 = slot_conn.query_row("SELECT pitch_seq FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pitch_seq, 301, "the pitch should have actually been thrown, advancing pitch_seq — got step {after_pitch:?}");
    }

    #[test]
    fn manual_mode_does_not_prompt_before_the_soft_cap() {
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
                         0, 0, 0, 0, 0, 0, NULL, 10, 0)",
                [],
            )
            .unwrap();

        let result = run_until_decision_point(&slot_conn, 1, None, None).unwrap();
        assert!(matches!(result, MatchStepResult::AwaitingPitch { .. }), "well below the soft cap, manual mode should not ask about a pitcher change yet");
    }

    #[test]
    fn player_choosing_keep_does_not_pull_the_pitcher() {
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

        run_until_decision_point(&slot_conn, 1, None, None).unwrap(); // 프롬프트 발생
        let result = submit_pitcher_change_decision(&slot_conn, 1, "유지").unwrap();

        assert!(matches!(result, MatchStepResult::AwaitingPitch { .. }), "keeping the pitcher should let the manual pitch loop continue as normal");
        let pulled: i64 = slot_conn.query_row("SELECT protagonist_pulled FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pulled, 0);
    }

    #[test]
    fn player_choosing_pull_now_pulls_the_pitcher_with_a_snapshot() {
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

        run_until_decision_point(&slot_conn, 1, None, None).unwrap(); // 프롬프트 발생
        let result = submit_pitcher_change_decision(&slot_conn, 1, "교체").unwrap();

        assert!(matches!(result, MatchStepResult::GameOver { .. }), "team:home is pitching in the top of inning 1 — pulling here hands the rest of the game to the background half-inning path");
        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert_eq!(detail.get("pulled_by_manager").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(detail.get("innings_pitched").and_then(|v| v.as_i64()), Some(1), "should freeze at the inning the pull happened in");
    }

    #[test]
    fn player_deferring_to_the_manager_uses_the_automatic_decision() {
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

        run_until_decision_point(&slot_conn, 1, None, None).unwrap(); // 프롬프트 발생
        // 200구는 하드캡을 훨씬 넘겨 should_pull_pitcher가 RNG 없이도
        // 무조건 true라, "맡기기"의 결과가 결정적으로 강판이어야 한다.
        let result = submit_pitcher_change_decision(&slot_conn, 1, "맡기기").unwrap();

        assert!(matches!(result, MatchStepResult::GameOver { .. }));
        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        assert_eq!(detail.get("pulled_by_manager").and_then(|v| v.as_bool()), Some(true));
    }

    fn relationship_of(conn: &Connection, npc_id: &str) -> Option<i64> {
        conn.query_row("SELECT value FROM relationships WHERE npc_id = ?1", [npc_id], |r| r.get(0)).optional().unwrap()
    }

    #[test]
    fn apply_protagonist_evaluation_moves_manager_relationship_with_the_grade() {
        let good = {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_manager(&slot_conn, "team:home", 50.0, 50.0);
            insert_schedule(&slot_conn, "game:1");
            let session = bottom_of_inning_end_session("league:hs", 9, 0, 0); // 완봉 페이스
            apply_protagonist_evaluation(&slot_conn, &session, "team:home").unwrap();
            relationship_of(&slot_conn, "manager:team:home")
        };

        let bad = {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_manager(&slot_conn, "team:home", 50.0, 50.0);
            insert_schedule(&slot_conn, "game:1");
            let session = bottom_of_inning_end_session("league:hs", 9, 0, 20); // 대량 실점
            apply_protagonist_evaluation(&slot_conn, &session, "team:home").unwrap();
            relationship_of(&slot_conn, "manager:team:home")
        };

        assert!(good.unwrap_or(0) > 0, "완봉급 등판은 관계도를 올려야 한다, got {good:?}");
        assert!(bad.unwrap_or(0) < 0, "대량 실점 등판은 관계도를 내려야 한다, got {bad:?}");
    }

    fn morale_of(conn: &Connection) -> f64 {
        let raw: String = conn.query_row("SELECT live_state FROM protagonist WHERE id = 'proto:1'", [], |r| r.get(0)).unwrap();
        serde_json::from_str::<serde_json::Value>(&raw).unwrap().get("사기").and_then(|v| v.as_f64()).unwrap_or(50.0)
    }

    #[test]
    fn apply_protagonist_evaluation_a_strong_mental_coach_dampens_bad_outing_morale_drop() {
        let bad_session = || bottom_of_inning_end_session("league:hs", 9, 0, 20); // 대량 실점

        let without_coach = {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_manager(&slot_conn, "team:home", 50.0, 50.0);
            insert_schedule(&slot_conn, "game:1");
            apply_protagonist_evaluation(&slot_conn, &bad_session(), "team:home").unwrap();
            morale_of(&slot_conn)
        };

        let with_strong_mental_coach = {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_manager(&slot_conn, "team:home", 50.0, 50.0);
            insert_coach(
                &slot_conn,
                "team:home",
                serde_json::json!({"투수지도력": 50.0, "타격지도력": 50.0, "주루지도력": 50.0, "컨디셔닝": 50.0, "멘탈코칭": 80.0, "스카우팅안목": 50.0, "종합지도력": 50.0}),
            );
            insert_schedule(&slot_conn, "game:1");
            apply_protagonist_evaluation(&slot_conn, &bad_session(), "team:home").unwrap();
            morale_of(&slot_conn)
        };

        assert!(
            with_strong_mental_coach > without_coach,
            "with_coach={with_strong_mental_coach} without_coach={without_coach} — strong mental coaching should dampen the morale drop"
        );
    }

    fn setup_manual_hard_cap_session(mode_conn: &Connection) {
        insert_roster(mode_conn, "team:home");
        insert_reliever(mode_conn, "team:home");
        insert_roster(mode_conn, "team:away");
        insert_protagonist(mode_conn, "team:home");
        insert_manager(mode_conn, "team:home", 50.0, 50.0);
        insert_schedule(mode_conn, "game:1");
        mode_conn
            .execute(
                "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                             home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                             current_batter_id, pitch_seq, strikeouts)
                 VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '수동', 1, 1, 0, '[false,false,false]',
                         0, 0, 0, 0, 0, 0, NULL, 200, 0)",
                [],
            )
            .unwrap();
    }

    #[test]
    fn agreeing_with_the_manager_raises_relationship_and_defying_it_lowers_it() {
        // 200구는 하드캡을 훨씬 넘겨 manager_recommends_pull이 결정적으로
        // true — "교체"는 동의, "유지"는 반대가 된다.
        let slot_conn_agree = slot::open_in_memory().unwrap();
        setup_manual_hard_cap_session(&slot_conn_agree);
        run_until_decision_point(&slot_conn_agree, 1, None, None).unwrap();
        submit_pitcher_change_decision(&slot_conn_agree, 1, "교체").unwrap();
        let rel_agree = relationship_of(&slot_conn_agree, "manager:team:home").unwrap_or(0);

        let slot_conn_defy = slot::open_in_memory().unwrap();
        setup_manual_hard_cap_session(&slot_conn_defy);
        run_until_decision_point(&slot_conn_defy, 1, None, None).unwrap();
        submit_pitcher_change_decision(&slot_conn_defy, 1, "유지").unwrap();
        let rel_defy = relationship_of(&slot_conn_defy, "manager:team:home").unwrap_or(0);

        assert!(rel_agree > 0, "감독 권고(교체)에 동의하면 관계도가 올라야 한다, got {rel_agree}");
        assert!(rel_defy < 0, "감독 권고(교체)에 반해 유지하면 관계도가 내려가야 한다, got {rel_defy}");
    }

    #[test]
    fn deferring_to_the_manager_does_not_add_a_pull_agreement_delta() {
        let slot_conn = slot::open_in_memory().unwrap();
        setup_manual_hard_cap_session(&slot_conn);
        run_until_decision_point(&slot_conn, 1, None, None).unwrap();

        submit_pitcher_change_decision(&slot_conn, 1, "맡기기").unwrap();

        // 강판 자체는 게임을 곧장 끝내(배경 하프이닝 경로) 등급 평가가
        // 뒤이어 관계도를 건드린다 — "맡기기"가 결백함을 보이려면 최종
        // 관계도가 "등급 델타만큼"인지(=동의/반대 보너스가 안 더해졌는지)
        // 확인해야 한다.
        let detail_raw: String = slot_conn.query_row("SELECT detail FROM game_log WHERE game_id = 'game:1'", [], |r| r.get(0)).unwrap();
        let detail: serde_json::Value = serde_json::from_str(&detail_raw).unwrap();
        let grade = detail["grade"].as_str().unwrap();
        let expected = crate::sim::manager::relationship_delta_from_grade(grade);

        assert_eq!(relationship_of(&slot_conn, "manager:team:home"), Some(expected), "맡기기는 등급에 따른 변화만 남겨야 한다(동의/반대 델타 없음)");
    }
}
