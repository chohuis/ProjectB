use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use rusqlite::{params, Connection, OptionalExtension};

use crate::sim::eval;
use crate::sim::match_sim::{self, BatterStats, PaOutcome, PitcherStats};
use crate::sim::pitch::{self, Power};

use super::repository;

/// `startMatch`/`pitch`(I6 3차분) 호출 결과 — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §3의 두 모드(자동·수동, 반자동은 대화 2026-07-25에서 폐지)가 전부 이
/// 상태들 중 하나로 귀결된다.
#[derive(Debug, Clone, PartialEq)]
pub enum MatchStepResult {
    /// 주인공이 다음 공을 던질 차례이고, 모드상 플레이어 입력이 필요한
    /// 시점 — `submit_pitch`로 구종·코스를 제출해야 진행된다.
    /// `inning`~`away_runs`는 [05_매치](../../../04_UI기획/05_매치.md) §2
    /// "상시 경기 상황판"(다이아몬드+주자+이닝+스코어+B-S-O)을 그리는 데
    /// 필요한 세션 스냅샷 — 이 시점(수동 모드 매 구)에만 노출된다.
    /// **"자동" 모드는 한 번의 호출로 경기 전체가 끝까지
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
        /// 주인공 투수 피로도(§6-N, UI 매치 화면 스태미나 게이지용) —
        /// `PitcherChangeDecision`이 이미 쓰던 `load_protagonist_as_pitcher(..).fatigue`
        /// 를 그대로 threading. 이 시점(§8 판단 이전)엔 "고려 구간"
        /// 진입 여부와 무관하게 매 구 노출.
        fatigue: f64,
        /// 이번 경기 누적 투구수 — `session.pitch_seq` 그대로.
        pitches_thrown: u32,
        /// 방금 전 타석의 인플레이 타구를 처리한 포지션(대화 2026-07-25,
        /// 매치 화면 수비 배지 하이라이트용) — `resolve_in_play_result`가
        /// 뽑은 값을 `run_until_decision_point`의 로컬 변수로 threading해,
        /// 그 InPlay 판정 바로 다음 `AwaitingPitch` 응답 한 번에만 실린다
        /// (하프이닝이 넘어가면 지워짐 — 몇 이닝 전 플레이가 계속 표시되는
        /// 걸 방지). K/BB/HBP처럼 인플레이가 아니었거나, 방금 막 하프이닝이
        /// 시작됐으면 `None`.
        last_fielder_position: Option<String>,
        /// `last_fielder_position`이 있을 때만 의미 있음 — 그 플레이가
        /// 실책(`PaOutcome::ReachOnError`)이었는지.
        last_play_was_error: bool,
    },
    /// 경기 종료 — `schedule.result`·`standings`가 이미 반영됐고
    /// `match_session` 행도 삭제됨.
    GameOver { home_runs: u32, away_runs: u32 },
    /// 감독 개입(§8) 수동 모드 — 하프이닝 경계에서 투구수가 "고려 구간"
    /// (`sim::manager::pull_probability` > 0)에 들어서면 자동 모드처럼
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
    /// 투수·강판 시점 이닝. 자동 모드에서만 채워짐(수동 모드는 이번
    /// 스코프에서 개입 없음, 대화 설계).
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
    ///
    /// **Phase 4(대화 2026-07-24)에서 게이팅 기준 교체**: 투구수 단위였던
    /// 위 필드를 이닝+공수 단위(`pull_decision_settled_inning`+
    /// `pull_decision_settled_top_of_inning`, migration v23)로 바꿨다 —
    /// §8 원 설계("이닝 종료마다 판단 기회")대로 소프트캡을 넘긴 채 같은
    /// 하프이닝 안에서 몇 구를 더 던져도 다시 안 묻고, 하프이닝이 바뀌면
    /// (`session.inning`/`top_of_inning`이 달라지므로) 비교 자체가 자동으로
    /// 갱신돼 별도 리셋 코드 없이 새로 물어볼 수 있는 상태로 돌아온다.
    pull_decision_settled_inning: Option<i64>,
    pull_decision_settled_top_of_inning: Option<bool>,
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
    /// 2단계 교체(선발→중계→마무리, Phase 2, 대화 2026-07-24) — 1단계가
    /// 진짜 중계(마무리가 아님, 즉 `*_pull_was_save_situation == false`)
    /// 였을 때만 의미가 있다. `sim::match_sim::simulate_game`의 배경
    /// 로직과 동일한 원칙(migration v21).
    protagonist_second_pulled: bool,
    second_relief_pitcher_id: Option<String>,
    protagonist_second_pull_was_save_situation: bool,
    opponent_second_pulled: bool,
    opponent_second_relief_pitcher_id: Option<String>,
    opponent_second_pull_was_save_situation: bool,
    /// 비자책점(Phase 7, 정합성 점검에서 발견) — NPC는 Phase 2부터
    /// `season_stats.unearned_runs`로 자책/비자책을 구분해왔는데
    /// 주인공 본인 `game_log`엔 이 구분이 없어 실책 실점까지 통째로
    /// ERA에 잡히던 걸 바로잡음(migration v19). 강판되면 인터랙티브
    /// 1구 루프 자체가 안 도니 `hits_allowed`처럼 그 시점에서 자연히
    /// 멈춘다.
    unearned_runs_allowed: i64,
    /// 도루(Phase 3, §9) — 배경 `simulate_half_inning`의 로컬 변수
    /// `runner_on_first_id`와 같은 개념, `submit_pitch` 호출마다 DB를
    /// 오가는 인터랙티브 세션 특성상 여기 영속시켜야 한다(migration v22).
    runner_on_first_id: Option<String>,
    /// 매치 화면 박스스코어(migration v26, 대화 2026-07-25) — 하프이닝
    /// 경계마다 한 줄씩(`push_inning_log_entry`) 쌓이는 JSON 배열
    /// `[{"inning","top_of_inning","runs","hits","walks"}, ...]`.
    inning_log: String,
    /// 이번 경기 한정 타자 개인기록(migration v26) — `{npc_id: {...}}`
    /// (키는 `repository::batter_stats_fields`와 동일 관례). 시즌 전체는
    /// 기존 `season_stats` 테이블(`get_player_season_batting_stats`).
    batter_game_stats: String,
    /// 지금 진행 중인 하프이닝의 누적치(migration v26) — 하프이닝
    /// 경계(`push_inning_log_entry`)에서 `inning_log`로 flush되고 0으로
    /// 리셋된다. 배경 하프이닝은 `HalfInningStats`를 한 번에 대입, 인터랙티브
    /// (주인공 투구) 하프이닝은 `apply_pa_outcome`·`hits_allowed`/`walks_allowed`
    /// 증가 지점에서 매 타석마다 누적.
    current_half_runs: i64,
    current_half_hits: i64,
    current_half_walks: i64,
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
        i64,
        i64,
        Option<String>,
        i64,
        i64,
        Option<String>,
        i64,
        Option<String>,
        Option<i64>,
        Option<i64>,
        String,
        String,
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
                    hits_allowed, walks_allowed, protagonist_pull_was_save_situation, opponent_pull_was_save_situation,
                    unearned_runs_allowed,
                    protagonist_second_pulled, second_relief_pitcher_id, protagonist_second_pull_was_save_situation,
                    opponent_second_pulled, opponent_second_relief_pitcher_id, opponent_second_pull_was_save_situation,
                    runner_on_first_id,
                    pull_decision_settled_inning, pull_decision_settled_top_of_inning,
                    inning_log, batter_game_stats, current_half_runs, current_half_hits, current_half_walks
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
                    r.get(34)?,
                    r.get(35)?,
                    r.get(36)?,
                    r.get(37)?,
                    r.get(38)?,
                    r.get(39)?,
                    r.get(40)?,
                    r.get(41)?,
                    r.get(42)?,
                    r.get(43)?,
                    r.get(44)?,
                    r.get(45)?,
                    r.get(46)?,
                    r.get(47)?,
                    r.get(48)?,
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
        _pull_decision_settled_at_pitch_count,
        park_factor,
        weather_control_mod,
        weather_power_mod,
        weather_fatigue_mult,
        hits_allowed,
        walks_allowed,
        protagonist_pull_was_save_situation,
        opponent_pull_was_save_situation,
        unearned_runs_allowed,
        protagonist_second_pulled,
        second_relief_pitcher_id,
        protagonist_second_pull_was_save_situation,
        opponent_second_pulled,
        opponent_second_relief_pitcher_id,
        opponent_second_pull_was_save_situation,
        runner_on_first_id,
        pull_decision_settled_inning,
        pull_decision_settled_top_of_inning,
        inning_log,
        batter_game_stats,
        current_half_runs,
        current_half_hits,
        current_half_walks,
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
        conditions: match_sim::GameConditions { park_factor, weather_control_mod, weather_power_mod, weather_fatigue_mult },
        hits_allowed,
        walks_allowed,
        protagonist_pull_was_save_situation: protagonist_pull_was_save_situation != 0,
        opponent_pull_was_save_situation: opponent_pull_was_save_situation != 0,
        protagonist_second_pulled: protagonist_second_pulled != 0,
        second_relief_pitcher_id,
        protagonist_second_pull_was_save_situation: protagonist_second_pull_was_save_situation != 0,
        opponent_second_pulled: opponent_second_pulled != 0,
        opponent_second_relief_pitcher_id,
        opponent_second_pull_was_save_situation: opponent_second_pull_was_save_situation != 0,
        unearned_runs_allowed,
        runner_on_first_id,
        pull_decision_settled_inning,
        pull_decision_settled_top_of_inning: pull_decision_settled_top_of_inning.map(|v| v != 0),
        inning_log,
        batter_game_stats,
        current_half_runs,
        current_half_hits,
        current_half_walks,
    }))
}

fn save_session(conn: &Connection, s: &SessionRow) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE match_session SET inning = ?1, top_of_inning = ?2, outs = ?3, bases = ?4, home_runs = ?5, away_runs = ?6,
             home_batter_idx = ?7, away_batter_idx = ?8, balls = ?9, strikes = ?10, current_batter_id = ?11, pitch_seq = ?12,
             strikeouts = ?13, protagonist_pulled = ?14, relief_pitcher_id = ?15, protagonist_pull_inning = ?16,
             protagonist_pull_opponent_runs = ?17, opponent_pulled = ?18, opponent_relief_pitcher_id = ?19,
             opponent_pitcher_batters_faced = ?20,
             hits_allowed = ?21, walks_allowed = ?22, protagonist_pull_was_save_situation = ?23,
             opponent_pull_was_save_situation = ?24, unearned_runs_allowed = ?25,
             protagonist_second_pulled = ?26, second_relief_pitcher_id = ?27, protagonist_second_pull_was_save_situation = ?28,
             opponent_second_pulled = ?29, opponent_second_relief_pitcher_id = ?30, opponent_second_pull_was_save_situation = ?31,
             runner_on_first_id = ?32, pull_decision_settled_inning = ?33, pull_decision_settled_top_of_inning = ?34,
             inning_log = ?35, batter_game_stats = ?36, current_half_runs = ?37, current_half_hits = ?38, current_half_walks = ?39
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
            s.hits_allowed,
            s.walks_allowed,
            s.protagonist_pull_was_save_situation as i64,
            s.opponent_pull_was_save_situation as i64,
            s.unearned_runs_allowed,
            s.protagonist_second_pulled as i64,
            s.second_relief_pitcher_id,
            s.protagonist_second_pull_was_save_situation as i64,
            s.opponent_second_pulled as i64,
            s.opponent_second_relief_pitcher_id,
            s.opponent_second_pull_was_save_situation as i64,
            s.runner_on_first_id,
            s.pull_decision_settled_inning,
            s.pull_decision_settled_top_of_inning.map(|b| b as i64),
            s.inning_log,
            s.batter_game_stats,
            s.current_half_runs,
            s.current_half_hits,
            s.current_half_walks,
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
/// 쓰인다. `batter_id`(Phase 3, 도루 지원)는 이 타석 결과로 1루 주자
/// 신원이 바뀌는지 판단하는 데 쓴다 — 배경 `simulate_half_inning`의
/// "1루 주자 신원 갱신" 로직과 동일(1루가 비면 `None`, 볼넷·사구·실책·
/// 단타로 새로 1루에 도착했으면 그 타자로 교체, 그 외엔 기존 주자 유지).
fn apply_pa_outcome(rng: &mut impl Rng, session: &mut SessionRow, batting_team_is_home: bool, outcome: PaOutcome, team_speed: f64, batter_id: &str) -> u32 {
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
    // 박스스코어(migration v26) — 인터랙티브 하프이닝은 이 함수가 유일한
    // 득점 반영 지점이라 여기서 같이 누적해두면 `transition_half_inning`
    // 이 하프이닝 경계에서 그대로 flush할 수 있다.
    session.current_half_runs += runs as i64;
    // 1루 주자 신원 갱신(Phase 3, §9 도루) — 배경 `simulate_half_inning`과
    // 동일한 규칙: 1루가 비었으면 놓치고, 볼넷·사구·실책·단타로 새로
    // 도착했으면 그 타자로 교체, 그 외(아웃·병살 등 1루를 안 건드리는
    // 결과)는 기존 주자가 계속 1루에 남아있으므로 그대로 둔다.
    if !session.bases[0] {
        session.runner_on_first_id = None;
    } else if matches!(outcome, PaOutcome::Walk | PaOutcome::HitByPitch | PaOutcome::ReachOnError | PaOutcome::Single) {
        session.runner_on_first_id = Some(batter_id.to_string());
    }
    session.current_batter_id = None;
    session.balls = 0;
    session.strikes = 0;
    runs
}

/// 이번 경기 개인기록(migration v26) 누적 — `line`(이 타석 1건 또는
/// 하프이닝 1회분의 델타)을 `session.batter_game_stats`(JSON,
/// `{npc_id: {...}}`)에 필드별로 더해 넣는다. 키 이름은
/// `repository::batter_stats_fields`와 동일 관례(시즌 집계와 표시 코드를
/// 공유하기 쉽게).
fn merge_batter_game_stats(session: &mut SessionRow, batter_id: &str, line: &match_sim::BatterGameStats) {
    let mut all: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&session.batter_game_stats).unwrap_or_default();
    let mut entry: serde_json::Map<String, serde_json::Value> = all.get(batter_id).and_then(|v| v.as_object()).cloned().unwrap_or_default();
    for (key, delta) in [
        ("plate_appearances", line.plate_appearances),
        ("at_bats", line.at_bats),
        ("hits", line.hits),
        ("doubles", line.doubles),
        ("triples", line.triples),
        ("home_runs", line.home_runs),
        ("walks", line.walks),
        ("strikeouts", line.strikeouts),
        ("rbi", line.rbi),
        ("stolen_bases", line.stolen_bases),
        ("caught_stealing", line.caught_stealing),
    ] {
        let current = entry.get(key).and_then(|v| v.as_u64()).unwrap_or(0);
        entry.insert(key.to_string(), serde_json::json!(current + delta as u64));
    }
    all.insert(batter_id.to_string(), serde_json::Value::Object(entry));
    session.batter_game_stats = serde_json::Value::Object(all).to_string();
}

#[derive(Debug, PartialEq)]
enum Transition {
    Continue,
    GameOver,
}

/// 박스스코어 이닝 로그(migration v26) 한 줄 추가 — `transition_half_inning`
/// 이 호출부에서 `session.top_of_inning`을 뒤집기 **직전**에 불러야
/// 방금 끝난 하프이닝의 이닝·공수가 정확히 기록된다. `current_half_*`를
/// 소비한 뒤 0으로 리셋해 다음 하프이닝을 위해 비운다.
fn push_inning_log_entry(session: &mut SessionRow) {
    let mut log: Vec<serde_json::Value> = serde_json::from_str(&session.inning_log).unwrap_or_default();
    log.push(serde_json::json!({
        "inning": session.inning,
        "top_of_inning": session.top_of_inning,
        "runs": session.current_half_runs,
        "hits": session.current_half_hits,
        "walks": session.current_half_walks,
    }));
    session.inning_log = serde_json::Value::Array(log).to_string();
    session.current_half_runs = 0;
    session.current_half_hits = 0;
    session.current_half_walks = 0;
}

/// 하프이닝 경계 처리 — §10-2 콜드게임(아마추어)·연장전 규칙(아마추어=
/// 승부치기 무제한, 프로 정규시즌=12회 제한 무승부)을 그대로 재현.
/// `match_sim::simulate_game`의 이닝 루프와 같은 조건을 세션 상태에 대해
/// 반복 적용한 것 — 콜드게임 조기종료(§10-2 5회15점/7회10점)도
/// `match_sim::simulate_game`(line 218~223)과 동일한 조건식을 그대로
/// 복제해 인터랙티브 경로에도 반영한다(예전엔 스코프 아웃이었으나
/// I6 이월 항목 처리로 이번에 채움).
fn transition_half_inning(session: &mut SessionRow) -> Transition {
    // 박스스코어(migration v26) — 방금 끝난 하프이닝의 누적치를 로그에
    // 남긴다. `top_of_inning`을 뒤집기 전에 호출해야 그 하프이닝의 진짜
    // 공수가 기록된다.
    push_inning_log_entry(session);
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

/// 세이브·홀드 판정(Phase 6 §12 + Phase 2 2단계 교체) — 배경 경기
/// (`match_sim::simulate_game`)는 게임 종료 시점에 자체적으로 판정하지만,
/// 인터랙티브 경기는 하프이닝마다 흩어져 진행돼 게임이 완전히 끝나야만
/// "리드를 지켰는지" 알 수 있어 여기 게임 종료 지점에서 한 번에 처리한다.
/// 주인공 쪽·상대 쪽 둘 다 대상 — 2단계까지 갔으면(중계→마무리) 세이브는
/// 마지막(2단계) 투수에게, 홀드는 중간에 빠진(1단계) 투수에게(팀이 리드를
/// 지킨 채 이겼을 때만). 2단계로 안 갔으면 배경 엔진과 같은 규칙(1단계
/// 투수가 세이브 상황에 등판했고 팀이 리드를 지킨 채 이겼으면 세이브).
fn credit_saves(slot_conn: &Connection, session: &SessionRow, protagonist_team_id: &str) -> anyhow::Result<()> {
    let today: i64 = slot_conn.query_row("SELECT current_day FROM meta", [], |r| r.get(0))?;
    let week = crate::calendar::week_for_day(today);

    let protagonist_is_home = session.home == protagonist_team_id;
    let (proto_team_runs, proto_opponent_runs) =
        if protagonist_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
    let protagonist_team_won = proto_team_runs > proto_opponent_runs;

    if session.protagonist_pulled {
        if session.protagonist_second_pulled {
            if session.protagonist_second_pull_was_save_situation && protagonist_team_won {
                if let Some(closer_id) = &session.second_relief_pitcher_id {
                    repository::credit_pitcher_save(slot_conn, closer_id, week)?;
                }
            }
            if protagonist_team_won {
                if let Some(reliever_id) = &session.relief_pitcher_id {
                    repository::credit_pitcher_hold(slot_conn, reliever_id, week)?;
                }
            }
        } else if session.protagonist_pull_was_save_situation && protagonist_team_won {
            if let Some(reliever_id) = &session.relief_pitcher_id {
                repository::credit_pitcher_save(slot_conn, reliever_id, week)?;
            }
        }
    }

    let opponent_is_home = !protagonist_is_home;
    let (opp_team_runs, opp_opponent_runs) =
        if opponent_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
    let opponent_team_won = opp_team_runs > opp_opponent_runs;

    if session.opponent_pulled {
        if session.opponent_second_pulled {
            if session.opponent_second_pull_was_save_situation && opponent_team_won {
                if let Some(closer_id) = &session.opponent_second_relief_pitcher_id {
                    repository::credit_pitcher_save(slot_conn, closer_id, week)?;
                }
            }
            if opponent_team_won {
                if let Some(reliever_id) = &session.opponent_relief_pitcher_id {
                    repository::credit_pitcher_hold(slot_conn, reliever_id, week)?;
                }
            }
        } else if session.opponent_pull_was_save_situation && opponent_team_won {
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
    let eval_bonus = crate::sim::staff::coach_eval_bonus(repository::best_coach_stat(&coach, |c| c.pitching).unwrap_or(50.0));
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
        morale_delta *= crate::sim::staff::coach_mental_dampening(repository::best_coach_stat(&coach, |c| c.mental).unwrap_or(50.0));
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
        "unearned_runs": session.unearned_runs_allowed,
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
/// 매치 화면 박스스코어(migration v26, 대화 2026-07-25) — 진행 중인
/// 세션이 없으면 `None`. `[{"inning","top_of_inning","runs","hits","walks"}, ...]`
/// JSON 원시 통과(모듈 문서 관례) — Dart가 표시용으로만 읽는다.
pub fn get_inning_log(conn: &Connection) -> anyhow::Result<Option<String>> {
    Ok(load_session(conn)?.map(|s| s.inning_log))
}

/// 매치 화면 구장 도트 아트·팀 색 해시 시드용(대화 2026-07-25) — 진행
/// 중인 세션의 (홈, 원정) 팀 id. 세션이 없으면 `None`.
pub fn get_match_teams(conn: &Connection) -> anyhow::Result<Option<(String, String)>> {
    Ok(load_session(conn)?.map(|s| (s.home, s.away)))
}

/// 매치 화면 "이번 경기" 타자 개인기록(migration v26) — `{npc_id: {...}}`
/// JSON 원시 통과. 진행 중인 세션이 없으면 `None`.
pub fn get_batter_game_stats_json(conn: &Connection) -> anyhow::Result<Option<String>> {
    Ok(load_session(conn)?.map(|s| s.batter_game_stats))
}

pub fn start_protagonist_match(
    slot_conn: &Connection,
    content_conn: &Connection,
    world_seed: i64,
    game_id: &str,
    home: &str,
    away: &str,
    mode: &str,
) -> anyhow::Result<MatchStepResult> {
    if !["자동", "수동"].contains(&mode) {
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

/// 1구 제출(§5) — `AwaitingPitch`로 멈춘 세션에 플레이어의 구종·위치(연속
/// 좌표)·구위 선택을 반영하고 다음 결정 지점(또는 경기 종료)까지 진행한다.
pub fn submit_pitch(slot_conn: &Connection, world_seed: i64, pitch_name: &str, target_x: f64, target_y: f64, power: Power) -> anyhow::Result<MatchStepResult> {
    run_until_decision_point(slot_conn, world_seed, Some((pitch_name.to_string(), target_x, target_y, power)), None)
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
    mut player_pitch: Option<(String, f64, f64, Power)>,
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
    // 방금 전 타석 인플레이 판정이 처리한 포지션(대화 2026-07-25) —
    // `loop` 밖에 둬서 "InPlay 처리 반복"과 "그다음 AwaitingPitch 반환
    // 반복"이 (같은 호출 안에서) 서로 다른 반복이어도 값이 살아있게 한다.
    // 하프이닝이 넘어가면 지워(아래 두 지점) 몇 이닝 전 플레이가 계속
    // 표시되는 걸 방지.
    let mut last_fielder_position: Option<(String, bool)> = None;

    loop {
        let mut session = load_session(slot_conn)?.ok_or_else(|| anyhow::anyhow!("no match session in progress"))?;

        if session.outs >= 3 {
            match transition_half_inning(&mut session) {
                Transition::GameOver => return finalize_game(slot_conn, &session, &protagonist_team_id),
                Transition::Continue => {
                    last_fielder_position = None;
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
        // 투구는 배경 하프이닝 경로로 넘어간다(아래). 자동은 AI가
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

            // 수동 모드 핑퐁 버그 수정(Phase 3, migration v15) + 재질문 UX
            // 개선(Phase 4, migration v23) — 이 하프이닝(이닝+공수)에서
            // 이미 "불풀"로 확정된 적이 있으면 다시 안 묻는다. 예전엔
            // 투구수 단위로 게이팅해 소프트캡을 넘긴 채 몇 구만 더 던져도
            // 바로 다음 구에서 또 물어봤다(§8 원 설계 "이닝 종료마다 판단
            // 기회"와 어긋남) — 이닝+공수 단위로 바꿔 하프이닝이 바뀌기
            // 전까지는 재질문 없이 자연히 억제되게 했다(별도 리셋 코드
            // 불필요 — 비교 기준 자체가 그 시점의 inning/top_of_inning).
            let already_settled_no_pull = session.pull_decision_settled_inning == Some(session.inning)
                && session.pull_decision_settled_top_of_inning == Some(session.top_of_inning);
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
                                session.pull_decision_settled_inning = Some(session.inning);
                                session.pull_decision_settled_top_of_inning = Some(session.top_of_inning);
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
                                session.pull_decision_settled_inning = Some(session.inning);
                                session.pull_decision_settled_top_of_inning = Some(session.top_of_inning);
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
                    session.pull_decision_settled_inning = Some(session.inning);
                    session.pull_decision_settled_top_of_inning = Some(session.top_of_inning);
                    save_session(slot_conn, &session)?;
                }
            }
        } else if protagonist_pitching_team
            && session.protagonist_pulled
            && !session.protagonist_second_pulled
            && !session.protagonist_pull_was_save_situation
        {
            // 2단계 전환(중계→마무리, Phase 2) — 배경 엔진(`sim::match_sim::
            // simulate_game`)과 같은 원칙: 1단계가 진짜 중계(마무리가
            // 아님, `protagonist_pull_was_save_situation == false`)였을
            // 때만, 새로 세이브 상황이 되면 즉시 마무리로 넘긴다. 투구수
            // 기반 판정(`should_pull_pitcher`)은 안 씀 — 중계가 보통
            // 1~2이닝만 던지고 물러나 하드캡에 거의 안 닿는 문제를 배경
            // 엔진 구현 중 실측으로 발견해 뺐다(같은 이유).
            let protagonist_is_home = session.home == protagonist_team_id;
            let (team_runs_so_far, opponent_runs_so_far) =
                if protagonist_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
            if crate::sim::manager::is_save_situation(session.inning, team_runs_so_far, opponent_runs_so_far) {
                if let Some(closer) = repository::load_relief_pitcher(slot_conn, &protagonist_team_id, true)? {
                    if Some(&closer.id) != session.relief_pitcher_id.as_ref() {
                        session.protagonist_second_pulled = true;
                        session.second_relief_pitcher_id = Some(closer.id);
                        session.protagonist_second_pull_was_save_situation = true;
                        save_session(slot_conn, &session)?;
                    }
                }
            }
        }
        if !protagonist_pitching_team && session.opponent_pulled && !session.opponent_second_pulled && !session.opponent_pull_was_save_situation {
            // 상대팀 대칭(Part H와 같은 원칙) — `pitching_team`은 이 루프
            // 패스에서 지금 던지고 있는 팀이므로, `!protagonist_pitching_team`
            // 가드 안에서는 항상 상대팀을 가리킨다.
            let pitching_team_is_home = pitching_team == session.home;
            let (team_runs_so_far, opponent_runs_so_far) =
                if pitching_team_is_home { (session.home_runs, session.away_runs) } else { (session.away_runs, session.home_runs) };
            if crate::sim::manager::is_save_situation(session.inning, team_runs_so_far, opponent_runs_so_far) {
                if let Some(closer) = repository::load_relief_pitcher(slot_conn, &pitching_team, true)? {
                    if Some(&closer.id) != session.opponent_relief_pitcher_id.as_ref() {
                        session.opponent_second_pulled = true;
                        session.opponent_second_relief_pitcher_id = Some(closer.id);
                        session.opponent_second_pull_was_save_situation = true;
                        session.opponent_pitcher_batters_faced = 0;
                        save_session(slot_conn, &session)?;
                    }
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
                // 2단계까지 갔으면(중계→마무리, Phase 2) 그 투수를 우선.
                let relief_id = if session.protagonist_second_pulled {
                    session.second_relief_pitcher_id.clone().expect("protagonist_second_pulled requires second_relief_pitcher_id")
                } else {
                    session.relief_pitcher_id.clone().expect("protagonist_pulled requires relief_pitcher_id")
                };
                repository::load_pitcher_by_id(slot_conn, &relief_id)?
            } else if session.opponent_pulled {
                let relief_id = if session.opponent_second_pulled {
                    session.opponent_second_relief_pitcher_id.clone().expect("opponent_second_pulled requires opponent_second_relief_pitcher_id")
                } else {
                    session.opponent_relief_pitcher_id.clone().expect("opponent_pulled requires opponent_relief_pitcher_id")
                };
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
            // 수비 중인 팀(투구 중인 팀)의 라인업(대화 2026-07-25부터 포지션별
            // 개인 수비 스탯을 쓰기 위해 팀 평균 스칼라 대신 라인업 자체를
            // 넘긴다)·감독 전술력(Phase 5, 수비 시프트 적중도) — 실책·시프트
            // 판정에 씀.
            let fielding_lineup = repository::load_batting_lineup(slot_conn, &pitching_team)?;
            let fielding_tactics = repository::load_manager_stats(slot_conn, &pitching_team)?.tactics;
            let runs = match_sim::simulate_half_inning(
                &mut rng,
                &lineup,
                &mut idx,
                &pitcher,
                session.bases,
                leverage_base,
                &fielding_lineup,
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
            session.current_half_runs += runs as i64;
            session.current_half_hits += half_inning_stats.pitcher.hits_allowed as i64;
            session.current_half_walks += half_inning_stats.pitcher.walks as i64;
            for (batter_id, s) in &half_inning_stats.batters {
                repository::upsert_batter_season_stats(slot_conn, batter_id, week, s)?;
                merge_batter_game_stats(&mut session, batter_id, s);
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

        // 도루 시도(Phase 3, §9) — 다음 구를 던지기 전, 1루에 주자가 있고
        // 2루가 비어 있을 때마다(매 구) 판정한다. 배경 `simulate_half_inning`
        // 과 동일한 `attempt_steal` 함수를 재사용해 두 엔진이 갈라지지
        // 않게 한다. 성공/실패 모두 이 `submit_pitch` 호출을 소비하고
        // (이번 구는 실제로 안 던짐) 다음 호출에서 정상적으로 이어간다 —
        // `attempt_steal`이 `None`(이번엔 시도 자체가 없음)이면 그대로
        // 통과해 아래 정상 투구 로직으로 흘러간다.
        if session.bases[0] && !session.bases[1] {
            if let Some(runner_id) = session.runner_on_first_id.clone() {
                let team_speed = match_sim::average_speed(&lineup);
                let fielding_lineup = repository::load_batting_lineup(slot_conn, &protagonist_team_id)?;
                let team_defense = match_sim::average_defense(&fielding_lineup);
                let pitcher_game_management = load_protagonist_as_pitcher(slot_conn)?.game_management;
                let mut steal_rng = ChaCha8Rng::seed_from_u64(repository::league_sub_seed(
                    world_seed,
                    &format!("steal:{}:{}", session.game_id, session.pitch_seq),
                ));
                if let Some(success) = match_sim::attempt_steal(&mut steal_rng, team_speed, pitcher_game_management, team_defense) {
                    let mut line = match_sim::BatterGameStats::default();
                    if success {
                        session.bases[0] = false;
                        session.bases[1] = true;
                        line.stolen_bases += 1;
                    } else {
                        session.bases[0] = false;
                        session.outs += 1;
                        line.caught_stealing += 1;
                    }
                    session.runner_on_first_id = None;
                    let week = crate::calendar::week_for_day(today);
                    repository::upsert_batter_season_stats(slot_conn, &runner_id, week, &line)?;
                    save_session(slot_conn, &session)?;
                    continue;
                }
            }
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

        let (pitch_name, target_x, target_y, power) = if let Some(choice) = player_pitch.take() {
            choice
        } else {
            let should_prompt = session.mode == "수동";
            if should_prompt {
                let (last_position, last_was_error) = match last_fielder_position.take() {
                    Some((position, was_error)) => (Some(position), was_error),
                    None => (None, false),
                };
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
                    fatigue: pitcher.fatigue,
                    pitches_thrown: session.pitch_seq as u32,
                    last_fielder_position: last_position,
                    last_play_was_error: last_was_error,
                });
            }
            let (pitch, x, y, power) = pitch::choose_pitch_and_target(&mut rng, &repertoire, &batter, high_leverage);
            (pitch.name, x, y, power)
        };
        // 플레이어가 직접 고른 구종은 이름만 넘어오므로(§5 UI가 known
        // 구종 중에서만 고르게 함) 마스터리 단계를 레퍼토리에서 다시
        // 찾는다 — 못 찾으면(방어적 폴백) 습작(1단계) 취급.
        let mastery_stage = repertoire.iter().find(|p| p.name == pitch_name).map(|p| p.stage).unwrap_or(1);

        let result = pitch::throw_pitch(&mut rng, &pitcher, &batter, target_x, target_y, power, high_leverage, mastery_stage, repertoire_diverse, &session.conditions);
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
        // 상대 타자 개인 기록(Phase 7 정합성 점검에서 발견 — 이 인터랙티브
        // 루프가 `simulate_half_inning`과 달리 season_stats 집계 자체가
        // 아예 빠져 있었다) — `record_batter_pa`(배경과 공유)로 델타를
        // 만들어 그 자리에서 바로 upsert. `week`는 이 호출부 안에서는
        // 날짜가 안 바뀌므로 한 번만 계산.
        let week = crate::calendar::week_for_day(today);

        match outcome {
            pitch::AtBatOutcome::InProgress => {}
            pitch::AtBatOutcome::Strikeout => {
                session.strikeouts += 1;
                let runs = apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::Strikeout, team_speed, &batter.id);
                let mut line = match_sim::BatterGameStats::default();
                match_sim::record_batter_pa(&mut line, PaOutcome::Strikeout, runs);
                merge_batter_game_stats(&mut session, &batter.id, &line);
                repository::upsert_batter_season_stats(slot_conn, &batter.id, week, &line)?;
            }
            pitch::AtBatOutcome::Walk => {
                session.walks_allowed += 1;
                session.current_half_walks += 1;
                let runs = apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::Walk, team_speed, &batter.id);
                let mut line = match_sim::BatterGameStats::default();
                match_sim::record_batter_pa(&mut line, PaOutcome::Walk, runs);
                merge_batter_game_stats(&mut session, &batter.id, &line);
                repository::upsert_batter_season_stats(slot_conn, &batter.id, week, &line)?;
            }
            pitch::AtBatOutcome::HitByPitch => {
                let runs = apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, PaOutcome::HitByPitch, team_speed, &batter.id);
                let mut line = match_sim::BatterGameStats::default();
                match_sim::record_batter_pa(&mut line, PaOutcome::HitByPitch, runs);
                merge_batter_game_stats(&mut session, &batter.id, &line);
                repository::upsert_batter_season_stats(slot_conn, &batter.id, week, &line)?;
            }
            pitch::AtBatOutcome::InPlay => {
                // 수비 중인 팀은 주인공 자신의 팀(투구 중이므로, Phase 2).
                // 감독 전술력(Phase 5, 수비 시프트)도 같은 팀 것. 대화
                // 2026-07-25부터 팀 평균 스칼라 대신 라인업 자체를 넘겨
                // `resolve_in_play_result`가 포지션별 개인 수비 스탯을 쓴다.
                let fielding_lineup = repository::load_batting_lineup(slot_conn, &protagonist_team_id)?;
                let fielding_tactics = repository::load_manager_stats(slot_conn, &protagonist_team_id)?.tactics;
                let resolution = match_sim::resolve_in_play_result(
                    &mut rng,
                    &batter,
                    &pitcher,
                    session.bases,
                    session.outs as u32,
                    &fielding_lineup,
                    fielding_tactics,
                    high_leverage,
                    &session.conditions,
                );
                let pa = resolution.outcome;
                last_fielder_position = Some((resolution.fielder_position.to_string(), pa == PaOutcome::ReachOnError));
                if matches!(pa, PaOutcome::Single | PaOutcome::Double | PaOutcome::Triple | PaOutcome::HomeRun) {
                    session.hits_allowed += 1;
                    session.current_half_hits += 1;
                }
                let runs = apply_pa_outcome(&mut rng, &mut session, batting_team_is_home, pa, team_speed, &batter.id);
                if pa == PaOutcome::ReachOnError {
                    // 비자책점(Phase 7, 정합성 점검에서 발견) — NPC는
                    // Phase 2부터 실책 실점을 비자책으로 구분해왔는데
                    // 주인공 본인 game_log엔 이 구분이 없었다.
                    session.unearned_runs_allowed += runs as i64;
                }
                let mut line = match_sim::BatterGameStats::default();
                match_sim::record_batter_pa(&mut line, pa, runs);
                merge_batter_game_stats(&mut session, &batter.id, &line);
                repository::upsert_batter_season_stats(slot_conn, &batter.id, week, &line)?;
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

    /// Phase 2(2단계 교체) 테스트용 — `insert_reliever`와 대칭, 지정 마무리
    /// (`season_meta['closer:{team_id}']`)까지 같이 심어 `load_relief_pitcher(..., true)`
    /// 가 이 투수를 확정적으로 고르게 한다.
    fn insert_designated_closer(conn: &Connection, team_id: &str) {
        conn.execute(
            "INSERT INTO npc (id, name, team_id, position, age, is_named, retired, form, personality, stats, xp, live_state, pitches, injury)
             VALUES (?1, ?1, ?2, '마무리투수', 20, 1, 0, 50.0, '{}', ?3, '{}', '{\"피로도\":0}', '[\"포심 패스트볼\"]', '{\"current\":null,\"history\":[]}')",
            params![format!("{team_id}_closer"), team_id, serde_json::json!({"제구": 50.0, "구위": 50.0}).to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO season_meta (key, value) VALUES (?1, ?2)",
            params![format!("closer:{team_id}"), format!("{team_id}_closer")],
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
            pull_decision_settled_inning: None,
            pull_decision_settled_top_of_inning: None,
            conditions: match_sim::GameConditions::default(),
            hits_allowed: 0,
            walks_allowed: 0,
            protagonist_pull_was_save_situation: false,
            opponent_pull_was_save_situation: false,
            protagonist_second_pulled: false,
            second_relief_pitcher_id: None,
            protagonist_second_pull_was_save_situation: false,
            opponent_second_pulled: false,
            opponent_second_relief_pitcher_id: None,
            opponent_second_pull_was_save_situation: false,
            unearned_runs_allowed: 0,
            runner_on_first_id: None,
            inning_log: "[]".to_string(),
            batter_game_stats: "{}".to_string(),
            current_half_runs: 0,
            current_half_hits: 0,
            current_half_walks: 0,
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

    /// Phase 3(§9 "도루") — 주인공이 직접 던지는 인터랙티브 하프이닝에서도
    /// 상대팀 도루가 발생해야 한다(예전엔 배경 하프이닝에만 있었음).
    /// `attempt_steal`의 시도확률 자체가 낮아(평균 스피드면 매 구 10%) 한
    /// 게임 안에서도 안 뜰 수 있으므로, 여러 시드 중 최소 1건을 확인하는
    /// 기존 강판·세이브 테스트들과 같은 패턴을 쓴다.
    #[test]
    fn opposing_team_can_steal_bases_while_the_protagonist_pitches() {
        let content_conn = build_content_db();
        let mut stole_at_least_once = false;
        for world_seed in 1..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_schedule(&slot_conn, "game:1");

            let result = start_protagonist_match(&slot_conn, &content_conn, world_seed, "game:1", "team:home", "team:away", "자동").unwrap();
            assert!(matches!(result, MatchStepResult::GameOver { .. }));

            let mut stmt = slot_conn.prepare("SELECT line FROM season_stats WHERE player_id LIKE 'team:away_b%'").unwrap();
            let any_steal_activity = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .unwrap()
                .filter_map(|raw| raw.ok())
                .filter_map(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .any(|v| {
                    v.get("stolen_bases").and_then(|s| s.as_i64()).unwrap_or(0) > 0
                        || v.get("caught_stealing").and_then(|s| s.as_i64()).unwrap_or(0) > 0
                });
            if any_steal_activity {
                stole_at_least_once = true;
                break;
            }
        }
        assert!(stole_at_least_once, "29개 시드 내내 인터랙티브 경기에서 상대팀 도루 시도가 한 번도 기록되지 않음");
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
            MatchStepResult::AwaitingPitch { balls, strikes, fatigue, pitches_thrown, .. } => {
                assert_eq!((balls, strikes), (0, 0));
                assert_eq!(pitches_thrown, 0, "no pitch thrown yet at the very first AwaitingPitch");
                assert!(fatigue >= 0.0, "fatigue should be a real live_state reading, got {fatigue}");
            }
            other => panic!("expected manual mode to pause on the very first protagonist pitch, got {other:?}"),
        }
    }

    /// 대화 2026-07-25 — 반자동 모드 폐지(자동/수동 두 모드만 남김).
    #[test]
    fn semi_auto_mode_is_no_longer_accepted() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let result = start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "반자동");
        assert!(result.is_err(), "반자동 모드는 더 이상 유효한 선택지가 아니어야 함");
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
                    result = submit_pitch(&slot_conn, 1, "포심 패스트볼", 0.0, 0.0, Power::Normal).unwrap();
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
    fn pitches_thrown_on_awaiting_pitch_never_decreases_across_a_manual_game() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_protagonist(&slot_conn, "team:home");
        insert_schedule(&slot_conn, "game:1");

        let mut result = start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "수동").unwrap();
        let mut last_seen = 0u32;
        let mut saw_growth = false;
        let mut guard = 0;
        loop {
            match result {
                MatchStepResult::GameOver { .. } => break,
                MatchStepResult::AwaitingPitch { pitches_thrown, .. } => {
                    assert!(pitches_thrown >= last_seen, "pitches_thrown regressed: {pitches_thrown} < {last_seen}");
                    if pitches_thrown > last_seen {
                        saw_growth = true;
                    }
                    last_seen = pitches_thrown;
                    result = submit_pitch(&slot_conn, 1, "포심 패스트볼", 0.0, 0.0, Power::Normal).unwrap();
                }
                MatchStepResult::PitcherChangeDecision { .. } => {
                    result = submit_pitcher_change_decision(&slot_conn, 1, "맡기기").unwrap();
                }
            }
            guard += 1;
            assert!(guard < 5000, "manual game did not finish within a reasonable number of pitches");
        }
        assert!(saw_growth, "expected pitches_thrown to actually increase over the course of a game");
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

    /// Phase 7(정합성 점검) — 세이브 판정이 인터랙티브 엔진(`finalize_game`
    /// → `credit_saves`)에서도 실제로 season_stats까지 왕복하는지 확인.
    /// 7회·2점차 리드(세이브 상황, `manager::is_save_situation`)에서 하드캡
    /// 투구수로 강제 강판시킨다 — 이후 남은 이닝은 배경 하프이닝(평균 대
    /// 평균)이라 RNG에 따라 리드가 뒤집힐 수 있으므로, 여러 시드를 돌며
    /// 최소 1번은 세이브가 실제로 적립되는지 확인(다른 강판 테스트들과
    /// 같은 "여러 시드 중 최소 1건" 패턴).
    #[test]
    fn protagonist_pull_in_a_save_situation_eventually_credits_the_reliever_with_a_save() {
        let mut saved_at_least_once = false;
        for world_seed in 1..30i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_reliever(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_schedule(&slot_conn, "game:1");

            // team:home이 주인공 팀 — 7회 초(top_of_inning=1)에 던지는 중,
            // 2점차 리드(세이브 상황: 7회 이상 + 1~3점차)로 하드캡 이상
            // 투구수를 채워 첫 하프이닝 경계에서 반드시 강판되게 한다.
            slot_conn
                .execute(
                    "INSERT INTO match_session (id, game_id, home, away, league_id, mode, inning, top_of_inning, outs, bases,
                                                 home_runs, away_runs, home_batter_idx, away_batter_idx, balls, strikes,
                                                 current_batter_id, pitch_seq, strikeouts)
                     VALUES (1, 'game:1', 'team:home', 'team:away', 'league:hs', '자동', 7, 1, 0, '[false,false,false]',
                             2, 0, 0, 0, 0, 0, NULL, 200, 0)",
                    [],
                )
                .unwrap();

            let result = run_until_decision_point(&slot_conn, world_seed, None, None).unwrap();
            assert!(matches!(result, MatchStepResult::GameOver { .. }));

            let saves: Option<i64> = slot_conn
                .query_row("SELECT line FROM season_stats WHERE player_id = 'team:home_rp'", [], |r| r.get::<_, String>(0))
                .optional()
                .unwrap()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|v| v.get("saves").and_then(|s| s.as_i64()));
            if saves == Some(1) {
                saved_at_least_once = true;
                break;
            }
        }
        assert!(saved_at_least_once, "29개 시드 내내 인터랙티브 세이브가 한 번도 적립되지 않음");
    }

    /// Phase 2(2단계 교체, §12 "홀드") — 주인공이 이른 이닝(비세이브
    /// 상황)에 강판돼 진짜 중계가 들어온 뒤, 게임이 진행되며 새로 세이브
    /// 상황이 되면 지정 마무리로 2단계 전환이 일어나야 하고, 그 중계에게
    /// 홀드가 붙어야 한다. 초반 강판은 하드캡 투구수(200)로 확정시키고,
    /// 이후 스코어 전개는 배경 하프이닝 RNG에 맡기므로(세이브 테스트와
    /// 같은 패턴) 여러 시드 중 최소 1건을 확인한다.
    #[test]
    fn a_reliever_promoted_to_closer_in_an_interactive_game_earns_a_hold() {
        let mut held_at_least_once = false;
        for world_seed in 1..100i64 {
            let slot_conn = slot::open_in_memory().unwrap();
            insert_roster(&slot_conn, "team:home");
            insert_reliever(&slot_conn, "team:home");
            insert_designated_closer(&slot_conn, "team:home");
            insert_roster(&slot_conn, "team:away");
            insert_protagonist(&slot_conn, "team:home");
            insert_schedule(&slot_conn, "game:1");

            // team:home = 주인공 팀, 1회 초부터 던지는 중 — 이닝이 이르니
            // 세이브 상황이 될 수 없어(is_save_situation은 7회부터) 첫
            // 강판은 반드시 중계(마무리 아님)로 간다.
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

            let result = run_until_decision_point(&slot_conn, world_seed, None, None).unwrap();
            assert!(matches!(result, MatchStepResult::GameOver { .. }));

            let holds: Option<i64> = slot_conn
                .query_row("SELECT line FROM season_stats WHERE player_id = 'team:home_rp'", [], |r| r.get::<_, String>(0))
                .optional()
                .unwrap()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|v| v.get("holds").and_then(|s| s.as_i64()));
            if holds == Some(1) {
                held_at_least_once = true;
                break;
            }
        }
        assert!(held_at_least_once, "99개 시드 내내 인터랙티브 홀드가 한 번도 적립되지 않음");
    }

    /// Phase 7(정합성 점검에서 발견) — 주인공이 직접 던지는 인터랙티브
    /// 하프이닝(1구 단위 루프)은 배경 하프이닝(`simulate_half_inning`)과
    /// 달리 상대 타자 개인 season_stats 집계가 통째로 빠져 있었다. 이
    /// 테스트가 없었다면 "주인공을 상대한 타석만 쏙 빠진 통산 기록"이
    /// 조용히 굳어질 뻔했음 — `record_batter_pa` 공유 함수로 수정.
    #[test]
    fn opposing_batters_facing_the_protagonist_directly_still_record_season_stats() {
        let content_conn = build_content_db();
        let slot_conn = slot::open_in_memory().unwrap();
        insert_roster(&slot_conn, "team:home");
        insert_protagonist(&slot_conn, "team:home");
        insert_roster(&slot_conn, "team:away");
        insert_schedule(&slot_conn, "game:1");

        // team:home = 주인공 팀, 1회 초부터 던지므로 team:away 타자들이
        // 주인공을 직접 상대한다.
        start_protagonist_match(&slot_conn, &content_conn, 1, "game:1", "team:home", "team:away", "자동").unwrap();

        let has_batter_stats: bool = slot_conn
            .query_row("SELECT EXISTS(SELECT 1 FROM season_stats WHERE player_id LIKE 'team:away_b%')", [], |r| r.get(0))
            .unwrap();
        assert!(has_batter_stats, "주인공을 직접 상대한 타자도 season_stats가 남아야 함");
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

        let (settled_inning, settled_top): (Option<i64>, Option<i64>) = slot_conn
            .query_row("SELECT pull_decision_settled_inning, pull_decision_settled_top_of_inning FROM match_session WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((settled_inning, settled_top), (Some(1), Some(1)), "the no-pull decision for inning 1 top must be persisted");

        // 같은 하프이닝 안에서(inning·top_of_inning 불변) 실제 공을 제출하면
        // 그 공은 진짜로 던져져야 한다(pitch_seq가 201로 증가) — 버그가
        // 있었다면 이 공 자체가 던져지지도 않고 pitch_seq가 200에 멈춘 채
        // 또 PitcherChangeDecision만 반복됐다. Phase 4(재질문 UX 개선)
        // 이후로는 같은 하프이닝 안에서 몇 구를 더 던져도 다시 안 묻는다
        // (예전엔 투구수 단위 게이팅이라 201구째에 또 물어보는 게 "정상"
        // 취급이었는데, 그게 바로 이번에 고친 UX 과함이었다).
        let after_pitch = submit_pitch(&slot_conn, 1, "포심 패스트볼", 0.0, 0.0, Power::Normal).unwrap();
        assert!(matches!(after_pitch, MatchStepResult::AwaitingPitch { .. }), "같은 하프이닝 안에서는 재질문 없이 다음 구로 넘어가야 함, got {after_pitch:?}");
        let pitch_seq: i64 = slot_conn.query_row("SELECT pitch_seq FROM match_session WHERE id = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(pitch_seq, 201, "the pitch should have actually been thrown, advancing pitch_seq");
    }

    /// Phase 4(재질문 UX 개선, §8 "이닝 종료마다 판단 기회") 전용 회귀
    /// 테스트 — 소프트캡을 넘긴 채 같은 하프이닝 안에서 여러 구를 계속
    /// 던져도 "유지" 결정 이후로는 단 한 번도 재질문이 없어야 한다.
    /// 예전(투구수 단위 게이팅)에는 매 구마다 다시 물어봤다.
    #[test]
    fn manual_mode_does_not_reprompt_for_the_rest_of_the_half_inning_after_keeping_the_pitcher() {
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
        assert!(matches!(first, MatchStepResult::PitcherChangeDecision { .. }));
        let after_keep = submit_pitcher_change_decision(&slot_conn, 1, "유지").unwrap();
        assert!(matches!(after_keep, MatchStepResult::AwaitingPitch { .. }));

        // 이 하프이닝(inning=1, top_of_inning=1)이 끝나기 전까지 계속 공을
        // 던져도 "같은 하프이닝"에 대한 재질문은 단 한 번도 없어야 한다.
        // 하프이닝이 바뀌면(다음 이닝 진입) 새로 물어보는 것 자체는 정상
        // (§8 "이닝 종료마다 판단 기회") — 그건 버그가 아니라 설계 의도.
        for i in 0..20 {
            let (inning, top_of_inning): (i64, i64) =
                slot_conn.query_row("SELECT inning, top_of_inning FROM match_session WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
            if inning != 1 || top_of_inning != 1 {
                break; // 하프이닝이 바뀌었으면 이 테스트의 관찰 범위를 벗어남 — 정상 종료.
            }
            let step = submit_pitch(&slot_conn, 1, "포심 패스트볼", 0.0, 0.0, Power::Normal).unwrap();
            if let MatchStepResult::PitcherChangeDecision { inning, top_of_inning, .. } = step {
                assert!(
                    inning != 1 || !top_of_inning,
                    "같은 하프이닝(1회 초)에 대한 재질문이 다시 발생함(i={i})"
                );
                break; // 새 하프이닝에 대한 정당한 재질문 — 관찰 목적 달성, 종료.
            }
        }
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
        let (settled_inning, settled_top): (Option<i64>, Option<i64>) = slot_conn
            .query_row("SELECT pull_decision_settled_inning, pull_decision_settled_top_of_inning FROM match_session WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((settled_inning, settled_top), (Some(1), Some(1)), "the failed-pull attempt for inning 1 top must still be persisted as settled");

        // 같은 하프이닝 안에서 실제 공을 제출하면 그 공은 진짜로 던져져야
        // 한다 — 버그가 있었다면 매번 다시 강판을 시도했다 실패하며
        // pitch_seq가 300에 멈춘 채 무한 반복됐다.
        let after_pitch = submit_pitch(&slot_conn, 1, "포심 패스트볼", 0.0, 0.0, Power::Normal).unwrap();
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
