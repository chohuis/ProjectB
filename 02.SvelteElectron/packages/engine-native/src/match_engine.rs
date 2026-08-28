#![allow(clippy::too_many_arguments)]

use rand::Rng;
use std::collections::HashMap;
use std::f64::consts::PI;

use crate::types::*;
use crate::tuning as T;

// ── 유틸 ──────────────────────────────────────────────────────────────────────

fn clamp(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }

// ── 계측: contact_q가 어느 밴드에서 도는가 ────────────────────────────────
//
// `resolve_contact`의 밴드 표는 구간마다 안타 비율이 다르다(28% ~ 40%+).
// 표 주석은 "OVR 70 대 70 → contact_q 약 56"(28% 구간)이라 하는데 **실측
// BABIP은 44.7%**였다 — 실제로는 더 낮은 밴드에서 돈다는 뜻이다.
// 어느 밴드인지 모르면 표를 못 고친다. 밴드가 다섯이라 한 곳만 만지면
// 다른 구간이 어긋난다.
//
// 계측 전용이라 릴리스 동작에 영향이 없다(카운터를 안 읽으면 그만이다).
use std::cell::RefCell;
thread_local! {
    /// [72+, 60~72, 52~60, 45~52, 38~45, <38] 스윙 횟수
    pub static CONTACT_BANDS: RefCell<[u64; 6]> = const { RefCell::new([0; 6]) };
    /// contact_q 합 — 평균을 내려고 같이 쌓는다
    pub static CONTACT_SUM: RefCell<(f64, u64)> = const { RefCell::new((0.0, 0)) };
}

fn tally_contact_band(cq: f64) {
    let i = if cq >= 72.0 { 0 } else if cq >= 60.0 { 1 } else if cq >= 52.0 { 2 }
            else if cq >= 45.0 { 3 } else if cq >= 38.0 { 4 } else { 5 };
    CONTACT_BANDS.with(|b| b.borrow_mut()[i] += 1);
    CONTACT_SUM.with(|s| { let mut m = s.borrow_mut(); m.0 += cq; m.1 += 1; });
}

/// 계측값 읽기 — (밴드별 횟수, 평균 contact_q)
pub fn read_contact_bands() -> ([u64; 6], f64) {
    let bands = CONTACT_BANDS.with(|b| *b.borrow());
    let (sum, n) = CONTACT_SUM.with(|s| *s.borrow());
    (bands, if n > 0 { sum / n as f64 } else { 0.0 })
}

pub fn reset_contact_bands() {
    CONTACT_BANDS.with(|b| *b.borrow_mut() = [0; 6]);
    CONTACT_SUM.with(|s| *s.borrow_mut() = (0.0, 0));
}
fn round1(x: f64) -> f64 { (x * 10.0).round() / 10.0 }
fn round2(x: f64) -> f64 { (x * 100.0).round() / 100.0 }

fn gaussian(rng: &mut impl Rng, mean: f64, std: f64) -> f64 {
    let u: f64 = rng.gen::<f64>().max(1e-10);
    let v: f64 = rng.gen::<f64>();
    mean + std * ((-2.0 * u.ln()).sqrt() * (2.0 * PI * v).cos())
}

fn zone_to_target(loc: u8) -> XY {
    match loc {
        7 => XY { x: -0.67, y: -0.67 }, 8 => XY { x:  0.00, y: -0.67 }, 9 => XY { x:  0.67, y: -0.67 },
        4 => XY { x: -0.67, y:  0.00 }, 5 => XY { x:  0.00, y:  0.00 }, 6 => XY { x:  0.67, y:  0.00 },
        1 => XY { x: -0.67, y:  0.67 }, 2 => XY { x:  0.00, y:  0.67 }, 3 => XY { x:  0.67, y:  0.67 },
        _ => XY { x:  0.00, y:  0.00 },
    }
}

fn fielder_default_pos(pos: FieldPosition) -> XY {
    match pos {
        FieldPosition::P  => XY { x: 50.0, y: 62.0 },
        FieldPosition::C  => XY { x: 50.0, y: 90.0 },
        FieldPosition::B1 => XY { x: 78.0, y: 70.0 },
        FieldPosition::B2 => XY { x: 63.0, y: 55.0 },
        FieldPosition::B3 => XY { x: 22.0, y: 70.0 },
        FieldPosition::SS => XY { x: 37.0, y: 55.0 },
        FieldPosition::LF => XY { x: 18.0, y: 28.0 },
        FieldPosition::CF => XY { x: 50.0, y: 16.0 },
        FieldPosition::RF => XY { x: 82.0, y: 28.0 },
    }
}

/// 인플레이 아웃 계열 — `InplayOut`(중간값)과 좁혀진 넷.
///
/// ⚠ 이 셋을 각각 나열하는 `matches!`를 새로 쓰지 말 것. 코드가 하나 늘 때마다
/// 빠뜨린 자리가 조용히 생긴다 — 여기 한 곳만 고치면 되게 둔다.
fn is_out_in_play(code: PitchResultCode) -> bool {
    matches!(code,
        PitchResultCode::InplayOut | PitchResultCode::GroundOut |
        PitchResultCode::FlyOut    | PitchResultCode::LineOut   |
        PitchResultCode::DoublePlay)
}

fn is_inplay(code: PitchResultCode) -> bool {
    is_out_in_play(code) || matches!(code, PitchResultCode::FieldingError |
        PitchResultCode::HitSingle | PitchResultCode::HitDouble |
        PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

fn is_ab_terminal(code: PitchResultCode) -> bool {
    is_out_in_play(code) || matches!(code, PitchResultCode::Walk |
        PitchResultCode::FieldingError | PitchResultCode::HitSingle |
        PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

/// 중간값 `InplayOut`을 실제 타구로 좁힌다.
///
/// 타구 종류는 엔진이 이미 `BallInPlay.hitType`으로 정해 놓았는데
/// **결과 코드가 하나뿐이라 화면까지 못 갔다.** 병살은 아웃이 둘이라
/// 따로 둔다 — 색도 연출도 집계도 달라야 한다.
fn narrow_inplay_out(ball: Option<&BallInPlay>, is_dp: bool) -> PitchResultCode {
    if is_dp { return PitchResultCode::DoublePlay; }
    match ball.map(|b| b.hit_type) {
        Some(BallHitType::GroundBall) | Some(BallHitType::Bunt) => PitchResultCode::GroundOut,
        Some(BallHitType::LineDrive)  => PitchResultCode::LineOut,
        Some(BallHitType::FlyBall) | Some(BallHitType::Popup) => PitchResultCode::FlyOut,
        // 타구 정보 없이 아웃이 될 수는 없다. 그래도 오면 땅볼로 둔다
        None => PitchResultCode::GroundOut,
    }
}

// ── 초기 상태 생성 ────────────────────────────────────────────────────────────

pub fn build_pitcher(opts: &PartialPitcherStats, cmd: f64, vel: f64, sca: f64, mr: f64, ctl: f64, mvt: f64, clt: f64, hr: f64) -> PitcherStats {
    let base_cmd = opts.command.unwrap_or(cmd);
    let base_ctl = opts.control.unwrap_or(ctl);
    // ⚠ **폼 무너짐이 여기서 실제로 걸린다.** 화면에만 적고 경기에 안 가면
    // "표시는 있는데 효과가 없는" 결함이 된다 — 설계에서 못박은 조건이다.
    let (cmd_pen, ctl_pen) = T::form_penalty(opts.developing_difficulty.unwrap_or(0.0), base_ctl);

    PitcherStats {
        name:        opts.name.clone(),
        command:     (base_cmd - cmd_pen).max(1.0),
        velocity:    opts.velocity.unwrap_or(vel),
        stamina_cap: opts.stamina_cap.unwrap_or(sca),
        mental_resil:opts.mental_resil.unwrap_or(mr),
        control:     (base_ctl - ctl_pen).max(1.0),
        movement:    opts.movement.unwrap_or(mvt),
        clutch:      opts.clutch.unwrap_or(clt),
        hold_runners:opts.hold_runners.unwrap_or(hr),
        // ⚠ **빈 배열을 그대로 두지 않는다.** 비면 구종 선택이 아무것도 못 뽑고
        // 조용히 옛 하드코딩처럼 굴러간다 — 배선 누락이 "아무 일도 안 일어남"으로
        // 나타나는 자리다. 최소 패스트볼 하나는 보장한다.
        arsenal: match opts.arsenal.as_ref() {
            Some(a) if !a.is_empty() => a.clone(),
            _ => vec![ArsenalPitch { pitch_type: PitchType::Fastball, grade: 3 }],
        },
    }
}

/// 카운트에 맞춰 **보유 구종에서** 하나 고른다. 숙련도가 가중치다.
///
/// ⚠ 예전엔 `[Fastball, Fastball, Slider, Changeup]`을 하드코딩으로 뽑았다.
/// `PitcherStats`에 구종 배열 자체가 없었으니 **배운 구종은 경기에 안 나왔고**,
/// 너클볼을 마스터해도 던지지 않았다. 숙련도도 결과에 안 닿았다.
///
/// 카운트 로직은 살린다 — 볼이 몰리면 스트라이크를 넣어야 하고, 두 스트라이크면
/// 결정구를 던진다. 다만 **무엇이 그 역할을 맡는지는 보유 구종이 정한다.**
fn pick_from_arsenal(pit: &PitcherStats, balls: u8, strikes: u8, rng: &mut impl Rng) -> PitchType {
    if pit.arsenal.is_empty() { return PitchType::Fastball; }

    // 볼 3개 — 제일 잘 넣는 속구 계열. 없으면 숙련도 최고
    if balls >= 3 {
        let fb = pit.arsenal.iter()
            .filter(|a| matches!(a.pitch_type,
                PitchType::Fastball | PitchType::Sinker | PitchType::Cutter))
            .max_by_key(|a| a.grade);
        if let Some(a) = fb { return a.pitch_type; }
        return pit.arsenal.iter().max_by_key(|a| a.grade).unwrap().pitch_type;
    }

    // 두 스트라이크 — 결정구. 속구가 아닌 것 중 숙련도 최고를 크게 선호한다
    if strikes == 2 {
        let out_pitch = pit.arsenal.iter()
            .filter(|a| !matches!(a.pitch_type, PitchType::Fastball))
            .max_by_key(|a| a.grade);
        if let Some(a) = out_pitch {
            // 항상 같은 공이면 읽힌다 — 70%만 결정구로 간다
            if rng.gen::<f64>() < 0.70 { return a.pitch_type; }
        }
    }

    // 그 외 — 숙련도 가중 추첨
    let total: f64 = pit.arsenal.iter().map(|a| T::grade_pick_weight(a.grade)).sum();
    if total <= 0.0 { return pit.arsenal[0].pitch_type; }
    let mut roll = rng.gen::<f64>() * total;
    for a in pit.arsenal.iter() {
        roll -= T::grade_pick_weight(a.grade);
        if roll <= 0.0 { return a.pitch_type; }
    }
    pit.arsenal[pit.arsenal.len() - 1].pitch_type
}

/// 이 투수가 그 구종을 얼마나 다듬었나 — 없으면 기준(3)으로 본다
fn grade_of(pit: &PitcherStats, t: PitchType) -> u8 {
    pit.arsenal.iter().find(|a| a.pitch_type == t).map(|a| a.grade).unwrap_or(3)
}

fn create_manager(opts: &PartialManagerStats) -> ManagerStats {
    ManagerStats {
        tactical_iq:    opts.tactical_iq.unwrap_or(50.0),
        bullpen_read:   opts.bullpen_read.unwrap_or(50.0),
        offense_mind:   opts.offense_mind.unwrap_or(50.0),
        motivator:      opts.motivator.unwrap_or(50.0),
        clutch_decision:opts.clutch_decision.unwrap_or(50.0),
    }
}

pub fn create_batter(rng: &mut impl Rng, mean: f64) -> BatterStats {
    let spread = 18.0_f64;
    macro_rules! r { () => { clamp(mean + (rng.gen::<f64>() * 2.0 - 1.0) * spread, 10.0, 95.0).round() } }
    BatterStats {
        id: None, name: None,
        contact: r!(), power: r!(), eye: r!(), discipline: r!(),
        batting_clutch: r!(), platoon: 50.0,
        speed: r!(), base_instinct: r!(), bunting: Some(r!()), fielding: r!(), arm: r!(),
    }
}

fn create_runner(batter: &BatterStats) -> RunnerStats {
    RunnerStats {
        player_id: batter.id.clone(),
        speed: batter.speed,
        instinct: batter.base_instinct,
    }
}

fn create_default_fielders(rng: &mut impl Rng, mean: f64) -> Vec<FielderStats> {
    let spread = 15.0_f64;
    macro_rules! r { () => { clamp(mean + (rng.gen::<f64>() * 2.0 - 1.0) * spread, 10.0, 90.0).round() } }
    let positions = [
        (FieldPosition::P,  "투수"),  (FieldPosition::C,  "포수"),
        (FieldPosition::B1, "1루수"), (FieldPosition::B2, "2루수"),
        (FieldPosition::B3, "3루수"), (FieldPosition::SS, "유격수"),
        (FieldPosition::LF, "좌익수"),(FieldPosition::CF, "중견수"),
        (FieldPosition::RF, "우익수"),
    ];
    let mut out = Vec::with_capacity(9);
    for (pos, name) in &positions {
        let p = fielder_default_pos(*pos);
        out.push(FielderStats {
            position: *pos, name: name.to_string(),
            fielding: r!(), arm: r!(), speed: r!(),
            x: p.x, y: p.y,
        });
    }
    out
}

pub fn create_initial_match_state(opts: &MatchStartOptions, rng: &mut impl Rng) -> MatchState {
    let protagonist_side = opts.protagonist_side.clone().unwrap_or_else(|| "home".to_string());
    let role = opts.role.unwrap_or(PitcherRole::SP);
    let bullpen_read    = opts.my_manager.as_ref().and_then(|m| m.bullpen_read).unwrap_or(50.0);
    let clutch_decision = opts.my_manager.as_ref().and_then(|m| m.clutch_decision).unwrap_or(50.0);
    let entry_trigger = opts.entry_trigger.clone()
        .unwrap_or_else(|| match role {
            PitcherRole::SP => EntryTrigger::InningStart { inning: 1 },
            PitcherRole::RP => {
                let min_inning = if bullpen_read >= 70.0 { 5 } else if bullpen_read >= 40.0 { 6 } else { 7 };
                EntryTrigger::MidInning { inning: min_inning, max_outs: 3, score_diff_cap: 6 }
            }
            PitcherRole::CP => {
                let inning_threshold = if clutch_decision >= 70.0 { 8 } else { 9 };
                EntryTrigger::CloseGame { inning_threshold, max_lead_diff: 3, min_lead_diff: 1 }
            }
        });

    let pp_opts = opts.protagonist_pitcher.as_ref()
        .or(opts.pitcher.as_ref())
        .cloned()
        .unwrap_or_default();
    // ⚠ **큐가 있으면 0번(선발)이 우선이다** (C-1 배선 누락 수정).
    // 예전엔 큐를 넣어도 선발은 (없으면 기본값 50/52/55…)로
    // 던졌다 — 큐는 교체될 때만 쓰였다. 그래서 능력치를 55든 80이든 넣어도
    // contact_q가 54에 고정됐고 OVR–ERA 곡선이 평평했다(실측 2026-08-11).
    let op_opts  = opts.opponent_pitchers.as_ref().and_then(|v| v.first().cloned())
        .or_else(|| opts.opponent_pitcher.as_ref().cloned()).unwrap_or_default();
    let npc_opts = opts.my_pitchers.as_ref().and_then(|v| v.first().cloned())
        .or_else(|| opts.npc_starter_pitcher.as_ref().cloned()).unwrap_or_default();

    let protagonist_pitcher = build_pitcher(&pp_opts,  50.0, 52.0, 55.0, 48.0, 50.0, 50.0, 50.0, 50.0);
    let opponent_npc_pitcher = build_pitcher(&op_opts, 50.0, 52.0, 55.0, 48.0, 50.0, 50.0, 50.0, 50.0);
    let my_npc_pitcher = build_pitcher(&npc_opts, 48.0, 50.0, 52.0, 48.0, 48.0, 48.0, 48.0, 48.0);

    let batter_mean  = opts.batter_mean.unwrap_or(50.0);
    let inning_limit = opts.inning_limit.unwrap_or(9);

    let fallback_opp: Vec<BatterStats> = (0..9).map(|_| create_batter(rng, batter_mean)).collect();
    let fallback_my:  Vec<BatterStats> = (0..9).map(|_| create_batter(rng, batter_mean)).collect();

    let (home_lineup, away_lineup) = if protagonist_side == "home" {
        (
            opts.home_lineup.clone().or(opts.my_team_lineup.clone()).unwrap_or(fallback_my),
            opts.away_lineup.clone().or(opts.opponent_lineup.clone()).unwrap_or(fallback_opp),
        )
    } else {
        (
            opts.home_lineup.clone().or(opts.opponent_lineup.clone()).unwrap_or(fallback_opp),
            opts.away_lineup.clone().or(opts.my_team_lineup.clone()).unwrap_or(fallback_my),
        )
    };

    // C-3: 타자 기록 — 라인업 순서와 같다. id가 없으면 순번으로 대체한다.
    // ⚠ 라인업이 MatchState로 이동하기 **전에** 만든다
    let _home_bat_lines: Vec<crate::types::BatterLineAccum> = home_lineup.iter().enumerate()
        .map(|(i, b)| crate::types::BatterLineAccum {
            player_id: b.id.clone().unwrap_or_else(|| format!("H{}", i)), ..Default::default() }).collect();
    let _away_bat_lines: Vec<crate::types::BatterLineAccum> = away_lineup.iter().enumerate()
        .map(|(i, b)| crate::types::BatterLineAccum {
            player_id: b.id.clone().unwrap_or_else(|| format!("A{}", i)), ..Default::default() }).collect();

    let is_immediate = matches!(&entry_trigger, EntryTrigger::InningStart { inning } if *inning <= 1);
    let initial_stamina = clamp(opts.initial_stamina.unwrap_or(82.0), 0.0, 100.0);
    let initial_mental  = clamp(opts.initial_mental.unwrap_or(74.0), 0.0, 100.0);

    let my_manager  = opts.my_manager.as_ref().map(create_manager).unwrap_or(create_manager(&PartialManagerStats::default()));
    let opp_manager = opts.opponent_manager.as_ref().map(create_manager).unwrap_or(create_manager(&PartialManagerStats::default()));

    let fielders = opts.fielders.clone()
        .unwrap_or_else(|| create_default_fielders(rng, 50.0));

    let match_id = opts.match_id.clone()
        .unwrap_or_else(|| format!("match-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));

    MatchState {
        match_id,
        inning: 1, inning_limit,
        half: HalfInning::Top,
        outs: 0,
        count: MatchCount { balls: 0, strikes: 0 },
        runners: MatchRunners { first: None, second: None, third: None },
        score: MatchScore { home: 0, away: 0 },
        inning_scores: InningScores {
            home: vec![0; inning_limit as usize],
            away: vec![0; inning_limit as usize],
        },
        pitch_count: 0,
        pitch_limit: T::league_pitch_limit(opts.league_id.as_deref().unwrap_or("")),
        pitch_soft:  T::league_pitch_soft(opts.league_id.as_deref().unwrap_or("")),
        protagonist_side,
        protagonist_pitcher, my_npc_pitcher, opponent_npc_pitcher,
        // C-1: 큐가 비면 위의 단일 투수를 그대로 쓴다 — 예전과 완전히 같다
        my_queue: {
            let ps = opts.my_pitchers.clone().unwrap_or_default();
            let mo = queue_max_outs(&ps, rng);
            PitcherQueue { pitch_limit: T::league_pitch_limit(opts.league_id.as_deref().unwrap_or("")), lines: ps.iter().enumerate().map(|(i, p)| crate::types::PitcherLineAccum { player_id: p.name.clone().unwrap_or_else(|| format!("P{}", i)), ..Default::default() }).collect(), pitchers: ps, max_outs: mo, ..Default::default() }
        },
        opponent_queue: {
            let ps = opts.opponent_pitchers.clone().unwrap_or_default();
            let mo = queue_max_outs(&ps, rng);
            PitcherQueue { pitch_limit: T::league_pitch_limit(opts.league_id.as_deref().unwrap_or("")), lines: ps.iter().enumerate().map(|(i, p)| crate::types::PitcherLineAccum { player_id: p.name.clone().unwrap_or_else(|| format!("P{}", i)), ..Default::default() }).collect(), pitchers: ps, max_outs: mo, ..Default::default() }
        },
        home_lineup, away_lineup,
        home_lineup_index: 0, away_lineup_index: 0,
        home_bat_lines: _home_bat_lines, away_bat_lines: _away_bat_lines,
        batter_mean,
        role, entry_trigger,
        protagonist_has_entered: is_immediate,
        protagonist_exited: false,
        pitch_count_since_entry: 0,
        k_since_entry: 0,
        h_since_entry: 0,
        bb_since_entry: 0,
        outs_since_entry: 0,
        er_since_entry: 0,
        protagonist_stamina: initial_stamina,
        protagonist_mental: initial_mental,
        npc_pitcher_stamina:    NpcPitcherTracker { my: 80.0, opponent: 80.0 },
        npc_pitcher_mental:     NpcPitcherTracker { my: 72.0, opponent: 72.0 },
        npc_pitcher_pitch_count:NpcPitcherTracker { my: 0.0,  opponent: 0.0  },
        inherited_runners: MatchRunners { first: None, second: None, third: None },
        my_manager, opponent_manager: opp_manager,
        mound_visits_left: 3,
        last_mound_visit_pitch: -10,
        pre_entry_logs: vec![],
        last_pitch_types: vec![],
        weather: opts.weather.unwrap_or(WeatherType::Sunny),
        park:    opts.park.unwrap_or(ParkType::Neutral),
        is_finished: false,
        logs: vec!["경기 시작".to_string()],
        fielders,
        defense_stat: DefenseStat { errors: 0, assists: 0, throw_outs: 0, throw_safes: 0 },
        batter_accum: HashMap::new(),
        // 씨앗은 호출부(lib.rs)가 채운다 — 여기선 "없음"으로 둔다
        rng_seed: 0,
    }
}

// ── 상태 헬퍼 ─────────────────────────────────────────────────────────────────

fn is_our_team_fielding(state: &MatchState) -> bool {
    (state.half == HalfInning::Top    && state.protagonist_side == "home") ||
    (state.half == HalfInning::Bottom && state.protagonist_side == "away")
}

fn is_protagonist_actively_pitching(state: &MatchState) -> bool {
    is_our_team_fielding(state) && state.protagonist_has_entered && !state.protagonist_exited
}

pub fn is_protagonist_pitching(state: &MatchState) -> bool {
    is_protagonist_actively_pitching(state)
}

/// 투수별 등판 한계(아웃) — **`npc_sim::sim_max_outs`와 같은 식이다.**
///
/// 두 엔진이 다른 식을 쓰면 통합 후 리그 성적이 어긋난다. 그쪽이 이미
/// 검증된 값이라 그대로 옮긴다.
///
///   선발  12 + (스태미나/99)×15 ± 3   → 스태미나 99면 약 27아웃(완투)
///   구원  3 ~ 6
/// 주인공 선발의 아웃 예산 — **`queue_max_outs`의 선발 식과 같다.**
///
/// ⚠ 흔들림(±3)은 빼고 쓴다. `should_protagonist_exit`은 타석마다 불리므로
/// 난수를 넣으면 **같은 등판 안에서 예산이 매번 달라진다** — 22아웃에서
/// 내려갈지 25아웃에서 내려갈지가 매 타석 재추첨된다.
///
/// 구원 등판(선발이 아닌 경우)엔 예산을 안 준다 — 0을 돌려주면 호출부가
/// 건너뛰고, 스태미나·투구수·전술 판정이 그대로 돈다.
fn protagonist_max_outs(state: &MatchState) -> u32 {
    // 선발이 아니면 예산 없음. `my_queue`가 비었으면(구 세이브) 선발로 본다
    let is_starter = state.my_queue.pitchers.is_empty() || state.my_queue.current == 0;
    if !is_starter { return 0; }
    // ⚠ **현재 스태미나가 아니라 상한이다.** 현재값을 쓰면 던질수록 예산이
    // 줄어 자기 자신을 쫓아가는 식이 된다 — NPC는 `stamina_cap`으로 정한다
    let stam = state.protagonist_pitcher.stamina_cap.max(1.0);
    (12.0 + (stam / 99.0) * 15.0).round().max(1.0) as u32
}

fn queue_max_outs(pitchers: &[PartialPitcherStats], rng: &mut impl Rng) -> Vec<i32> {
    pitchers.iter().enumerate().map(|(i, p)| {
        let stam = p.stamina_cap.unwrap_or(50.0);
        if i == 0 { (12.0 + (stam / 99.0) * 15.0 + (rng.gen::<f64>() - 0.5) * 6.0).round() as i32 }
        else      { 3 + (rng.gen::<f64>() * 4.0) as i32 }
    }).collect()
}

/// 큐가 있으면 다음 투수로 바꾼다 (C-1).
///
/// ⚠ **큐가 비면 아무 일도 안 한다** — 예전 동작 그대로다.
/// `get_active_pitcher`가 참조를 돌려주므로 큐를 직접 보게 하면 수명이 얽힌다.
/// 대신 여기서 **단일 필드를 큐에서 갈아 끼운다** — 읽는 쪽은 한 줄도 안 바뀐다.
/// 스태미나·투구수는 새 투수 기준으로 되돌린다.
fn switch_pitcher_if_needed(state: &mut MatchState, my_side: bool) {
    let q = if my_side { &mut state.my_queue } else { &mut state.opponent_queue };
    if !q.should_switch() { return; }
    q.advance();
    let Some(next) = q.pitchers.get(q.current).cloned() else { return };
    let built = build_pitcher(&next, 50.0, 52.0, 55.0, 48.0, 50.0, 50.0, 50.0, 50.0);
    let name = built.name.clone().unwrap_or_else(|| "불펜".to_string());
    // ⚠ **100으로 리셋하면 안 된다.** 구원 투수가 자기 능력과 무관하게
    // 스태미나 100으로 들어와서, 교체하는 팀이 압도적으로 유리해졌다.
    // 실측(2026-08-12): 같은 능력치·타선·수비에서
    //   주인공(완투)      ERA 3.83
    //   투수진 3명(교체)  ERA 1.65
    // stamina_penalty = (50 - 스태미나) x 0.18이라 그대로 품질 차이가 된다.
    // **주인공은 82에서 시작한다** — 구원도 같은 기준으로 들어와야 공평하다.
    let fresh = built.stamina_cap.min(82.0);
    if my_side {
        state.my_npc_pitcher = built;
        state.npc_pitcher_stamina.my = fresh;
        state.npc_pitcher_pitch_count.my = 0.0;
    } else {
        state.opponent_npc_pitcher = built;
        state.npc_pitcher_stamina.opponent = fresh;
        state.npc_pitcher_pitch_count.opponent = 0.0;
    }
    state.logs.push(format!("[{}회] 투수 교체 — {}", state.inning, name));
}

fn get_active_pitcher(state: &MatchState) -> &PitcherStats {
    if !is_our_team_fielding(state) { return &state.opponent_npc_pitcher; }
    if state.protagonist_has_entered && !state.protagonist_exited { return &state.protagonist_pitcher; }
    &state.my_npc_pitcher
}

fn get_active_stamina(state: &MatchState) -> f64 {
    if !is_our_team_fielding(state) { return state.npc_pitcher_stamina.opponent; }
    if state.protagonist_has_entered && !state.protagonist_exited { return state.protagonist_stamina; }
    state.npc_pitcher_stamina.my
}

fn get_active_mental(state: &MatchState) -> f64 {
    if !is_our_team_fielding(state) { return state.npc_pitcher_mental.opponent; }
    if state.protagonist_has_entered && !state.protagonist_exited { return state.protagonist_mental; }
    state.npc_pitcher_mental.my
}

fn get_current_batter(state: &MatchState, rng: &mut impl Rng) -> BatterStats {
    let is_top = state.half == HalfInning::Top;
    let lineup = if is_top { &state.away_lineup } else { &state.home_lineup };
    let idx    = if is_top { state.away_lineup_index } else { state.home_lineup_index };
    lineup.get(idx).cloned().unwrap_or_else(|| create_batter(rng, state.batter_mean))
}

// ── Phase A: 착탄 ─────────────────────────────────────────────────────────────

struct LandingResult {
    landing: XY,
    in_zone: bool,
    in_shadow: bool,
    miss_log: Option<String>,
}

fn resolve_actual_landing(
    target: XY, pitcher: &PitcherStats, stamina: f64, mental: f64,
    state: &MatchState, rng: &mut impl Rng,
) -> LandingResult {
    let mut sigma = (T::DISPERSION_BASE
        - (pitcher.control - 50.0) * T::DISPERSION_CONTROL_SCALE
        + if stamina < 50.0 { (50.0 - stamina) * T::DISPERSION_STAMINA_SCALE } else { 0.0 }
        + if mental  < 50.0 { (50.0 - mental)  * T::DISPERSION_MENTAL_SCALE  } else { 0.0 })
        .max(0.02);

    let has_scoring = state.runners.second.is_some() || state.runners.third.is_some();
    let is_full_base = state.runners.first.is_some() && state.runners.second.is_some() && state.runners.third.is_some();
    let is_late = state.inning >= state.inning_limit - 2;
    sigma *= 1.0
        + if has_scoring  { 0.10 } else { 0.0 }
        + if is_full_base { 0.08 } else { 0.0 }
        + if is_late      { 0.06 } else { 0.0 };

    let landing = XY {
        x: target.x + gaussian(rng, 0.0, sigma),
        y: target.y + gaussian(rng, 0.0, sigma),
    };
    let ax = landing.x.abs(); let ay = landing.y.abs();
    let sh = T::SHADOW_ZONE_HALF;
    let in_zone   = ax <= 1.0 && ay <= 1.0;
    let in_shadow = !in_zone && ax <= 1.0 + sh && ay <= 1.0 + sh;
    let is_ball   = !in_zone && !in_shadow;

    let drift = ((landing.x - target.x).powi(2) + (landing.y - target.y).powi(2)).sqrt();
    let miss_log = if is_ball   && drift > 0.25 { Some("제구 이탈 (볼존)".to_string()) }
        else if in_shadow && drift > 0.25 { Some("제구 불안 (경계선)".to_string()) }
        else if in_zone   && drift > 0.40 { Some(format!("제구 불안 (편차 {:.2})", drift)) }
        else { None };

    LandingResult { landing, in_zone, in_shadow, miss_log }
}

// ── Phase B: 스윙 결정 ────────────────────────────────────────────────────────

fn swing_decision(
    landing: XY, pitch_type: PitchType, batter: &BatterStats,
    in_zone: bool, in_shadow: bool, rng: &mut impl Rng,
) -> (bool, bool) {
    let ax = landing.x.abs(); let ay = landing.y.abs();
    let margin = (T::SWING_MARGIN_BASE
        - (batter.discipline - 50.0) * T::SWING_DISCIPLINE_SCALE
        - (batter.eye        - 50.0) * T::SWING_EYE_SCALE
        + if pitch_type == PitchType::Fastball { T::SWING_FASTBALL_BONUS } else { 0.0 })
        .max(0.0);
    let in_swing_zone = ax <= 1.0 + margin && ay <= 1.0 + margin;
    let umpire_strike = in_zone || (in_shadow && rng.gen::<f64>() < T::SHADOW_UMPIRE_STRIKE_PROB);

    let swing_prob = if in_zone {
        clamp(0.78 + (50.0 - batter.discipline) * 0.003, 0.55, 0.97)
    } else if in_shadow {
        if in_swing_zone { clamp(0.45 + (50.0 - batter.discipline) * 0.004, 0.20, 0.80) }
        else { 0.12 }
    } else {
        if in_swing_zone { clamp(0.22 + (50.0 - batter.discipline) * 0.003, 0.05, 0.55) }
        else { 0.02 }
    };
    (rng.gen::<f64>() < swing_prob, umpire_strike)
}

// ── Phase C/D: 컨택·히트 결정 ─────────────────────────────────────────────────

fn calculate_contact_quality(pitch_q: f64, batter: &BatterStats, in_zone: bool, in_shadow: bool) -> f64 {
    let extra = (batter.contact - 50.0) * 0.20;
    let chase_penalty = if !in_zone { if in_shadow { 5.0 } else { 12.0 } } else { 0.0 };
    // ⚠ **오프셋은 여기 한 곳에서만 더한다.** 밴드 표는 "동급 = 56"을
    // 전제하는데 실측 평균이 48이다 — 표를 다시 쓰는 대신 입력을 옮긴다.
    // 정본은 `tuning::CONTACT_Q_OFFSET`
    round2(pitch_q - extra + chase_penalty + T::contact_q_offset())
}

fn resolve_contact(pitch_q: f64, contact_q: f64, batter: &BatterStats, rng: &mut impl Rng) -> PitchResultCode {
    use PitchResultCode::*;
    let roll = rng.gen::<f64>();
    let hit_bonus = clamp((60.0 - pitch_q) * 0.003 + (batter.power - 50.0) * 0.002, -0.12, 0.20);

    // ⚠ **표가 세 축에서 동시에 어긋나 있었다.**
    //
    // 실측(엔진 직접 호출 200경기, OVR 70 대 70 → contact_q 약 56):
    //   헛스윙 15% · 파울 15% · 인플레이 중 안타 50%
    // 현실은 대략 헛스윙 25% · 파울 35% · BABIP 30%다. 헛스윙과 파울이 둘 다
    // 적어 삼진이 안 쌓이고 BABIP은 1.7배라, 피안타/삼진 비가 **4.67**이 나왔다
    // (같은 조건 `npc_sim`은 1.17). 단일 계수로는 못 맞춘다.
    //
    // 아래는 **스윙 한 번의 결과 분포**다. 구간이 올라갈수록(투수가 이긴 공)
    // 헛스윙이 늘고 인플레이가 줄며, 인플레이 중 안타 비율도 함께 떨어진다.
    // 파울은 어느 구간이든 22~35%로 둔다 — 파울이 적으면 승부가 너무 빨리 끝나
    // 삼진도 볼넷도 안 나온다.
    if contact_q >= 72.0 {
        // 투수 완승 — 헛스윙 50 / 파울 30 / 인플레이 20 (그중 안타 15%)
        if roll < 0.50 { StrikeSwing } else if roll < 0.80 { Foul } else if roll < 0.97 { InplayOut } else { HitSingle }
    } else if contact_q >= 60.0 {
        // 헛스윙 32 / 파울 33 / 인플레이 35 (안타 22%)
        if roll < 0.32 { StrikeSwing } else if roll < 0.65 { Foul } else if roll < 0.92 { InplayOut } else { HitSingle }
    } else if contact_q >= 52.0 {
        // 헛스윙 22 / 파울 35 / 인플레이 43 (안타 28%)
        if roll < 0.22 { StrikeSwing } else if roll < 0.57 { Foul } else if roll < 0.88 { InplayOut } else { HitSingle }
    } else if contact_q >= 45.0 {
        // 헛스윙 15 / 파울 35 / 인플레이 50 (안타 33%)
        if roll < 0.15 { StrikeSwing }
        else if roll < 0.50 { Foul }
        else if roll < clamp(0.835 - hit_bonus, 0.62, 0.92) { InplayOut }
        else if roll < clamp(0.95 - hit_bonus * 0.5, 0.90, 0.98) { HitSingle }
        else { HitDouble }
    } else if contact_q >= 38.0 {
        // 헛스윙 10 / 파울 32 / 인플레이 58 (안타 40%)
        if roll < 0.10 { StrikeSwing }
        else if roll < 0.42 { Foul }
        else if roll < clamp(0.768 - hit_bonus, 0.55, 0.87) { InplayOut }
        else if roll < clamp(0.93 - hit_bonus * 0.5, 0.87, 0.97) { HitSingle }
        else if roll < clamp(0.98 - hit_bonus * 0.3, 0.95, 0.99) { HitDouble }
        else { HitTriple }
    } else if contact_q >= 32.0 {
        // 헛스윙 6 / 파울 28 / 인플레이 66 (안타 50%)
        if roll < 0.06 { StrikeSwing }
        else if roll < 0.34 { Foul }
        else if roll < clamp(0.67 - hit_bonus, 0.45, 0.78) { InplayOut }
        else if roll < clamp(0.87 - hit_bonus * 0.5, 0.80, 0.93) { HitSingle }
        else if roll < clamp(0.95 - hit_bonus * 0.3, 0.92, 0.97) { HitDouble }
        else if roll < clamp(0.98 + hit_bonus * 0.2, 0.97, 0.99) { HitTriple }
        else { HomeRun }
    } else {
        // 통타 — 파울 22 / 인플레이 78 (안타 62%). 여기서도 100%는 아니다
        if roll < 0.22 { Foul }
        else if roll < clamp(0.535 - hit_bonus, 0.35, 0.66) { InplayOut }
        else if roll < clamp(0.78 - hit_bonus * 0.5, 0.68, 0.86) { HitSingle }
        else if roll < clamp(0.90 - hit_bonus * 0.3, 0.86, 0.94) { HitDouble }
        else if roll < clamp(0.94 + hit_bonus * 0.2, 0.92, 0.96) { HitTriple }
        else { HomeRun }
    }
}

// ── 투구 품질 계산 ─────────────────────────────────────────────────────────────

fn calculate_pitch_quality(
    state: &MatchState, pitcher: &PitcherStats, batter: &BatterStats,
    stamina: f64, mental: f64, decision: &PitchDecision, landing: XY,
    rng: &mut impl Rng,
) -> f64 {
    let dist = (landing.x * landing.x + landing.y * landing.y).sqrt();
    // 의도 기준: 겨냥한 곳의 난이도 + 얼마나 정확히 꽂혔는가.
    // 착탄 기준(예전): 중심에서 멀수록 좋다 — 흩어짐이 품질을 올려준다
    let location_q = if T::location_intent_mode() > 0.0 {
        let t = decision.target.unwrap_or(landing);
        let t_dist = (t.x * t.x + t.y * t.y).sqrt();
        let miss = ((landing.x - t.x).powi(2) + (landing.y - t.y).powi(2)).sqrt();
        T::LOCATION_CENTER_PENALTY + t_dist * T::LOCATION_DISTANCE_SCALE - miss * T::LOCATION_MISS_PENALTY
    } else {
        T::LOCATION_CENTER_PENALTY + dist * T::LOCATION_DISTANCE_SCALE
    };

    // 능력치 기여는 배수를 탄다 — 잡음을 줄인 만큼 키워 균형을 맞춘다
    let sk = T::pitch_skill_scale();
    let command_bonus  = (pitcher.command  - 50.0) * 0.10 * sk;
    let velocity_bonus = if decision.pitch_type == PitchType::Fastball {
        (pitcher.velocity - 50.0) * 0.12 * sk
    } else {
        (pitcher.velocity - 50.0) * 0.03 * sk
    };
    let control_bonus  = (pitcher.control  - 50.0) * 0.06 * sk;
    let movement_bonus = if decision.pitch_type != PitchType::Fastball {
        (pitcher.movement - 50.0) * 0.08 * sk
    } else { 0.0 };

    let batter_penalty = (batter.contact    - 50.0) * 0.10
                       + (batter.eye        - 50.0) * 0.06
                       + (batter.discipline - 50.0) * 0.04;

    let count_mod = count_modifier(&state.count);
    let full_count_noise = if state.count.balls == 3 && state.count.strikes == 2 {
        rng.gen::<f64>() * 6.0 - 3.0
    } else { 0.0 };

    let stamina_penalty = (50.0 - stamina).max(0.0) * 0.18;
    let mental_bonus    = (mental - 50.0) * 0.08;
    let noise = T::pitch_quality_noise();
    let random_noise    = rng.gen::<f64>() * noise - noise / 2.0;

    let weather_mod = T::weather_quality_modifier(state.weather, decision.pitch_type);
    let park_mod    = T::park_quality_modifier(state.park);
    let pattern_mod = pitch_pattern_modifier(decision.pitch_type, &state.last_pitch_types);
    let jam_mod     = jam_pressure_modifier(state, mental, batter.batting_clutch);
    let clutch_mod  = clutch_modifier(state, pitcher.clutch);

    // ⚠ **숙련도가 여기 걸린다.** 예전엔 화면에 "숙련도 4/5"라고 적어놓고
    // 던지면 아무 차이가 없었다 — 계수가 배우는 속도에만 쓰였다.
    let grade_bonus = T::grade_quality_bonus(grade_of(pitcher, decision.pitch_type));

    round2(
        T::pitch_base(decision.pitch_type) + grade_bonus
        + T::strategy_bonus(decision.strategy)
        + T::power_bonus(decision.power)
        + location_q
        + command_bonus + velocity_bonus + control_bonus + movement_bonus
        + count_mod + full_count_noise
        - batter_penalty
        + mental_bonus - stamina_penalty
        + weather_mod + park_mod + pattern_mod + jam_mod + clutch_mod
        + random_noise
    )
}

// ── Ball-in-play ──────────────────────────────────────────────────────────────

fn resolve_hit_type(code: PitchResultCode, decision: &PitchDecision, quality: f64, rng: &mut impl Rng) -> BallHitType {
    if decision.strategy == PitchStrategy::Safe && decision.power == PitchPower::Low { return BallHitType::Bunt; }
    if code == PitchResultCode::HomeRun  { return BallHitType::FlyBall; }
    if code == PitchResultCode::HitTriple { return if rng.gen::<f64>() < 0.70 { BallHitType::FlyBall } else { BallHitType::LineDrive }; }
    if code == PitchResultCode::HitDouble { return if rng.gen::<f64>() < 0.55 { BallHitType::LineDrive } else { BallHitType::FlyBall }; }
    if code == PitchResultCode::InplayOut && quality >= 60.0 && rng.gen::<f64>() < 0.30 { return BallHitType::Popup; }

    let gb_pitches = [PitchType::Sinker, PitchType::Cutter, PitchType::Slider];
    let fb_pitches = [PitchType::Changeup, PitchType::Curve, PitchType::Forkball, PitchType::Screwball, PitchType::Knuckleball];
    let roll = rng.gen::<f64>();

    if gb_pitches.contains(&decision.pitch_type) {
        if roll < 0.68 { BallHitType::GroundBall } else if roll < 0.85 { BallHitType::LineDrive } else { BallHitType::FlyBall }
    } else if fb_pitches.contains(&decision.pitch_type) {
        if roll < 0.15 { BallHitType::GroundBall } else if roll < 0.48 { BallHitType::LineDrive } else { BallHitType::FlyBall }
    } else {
        if roll < 0.38 { BallHitType::GroundBall } else if roll < 0.68 { BallHitType::LineDrive } else { BallHitType::FlyBall }
    }
}

fn resolve_zone(hit_type: BallHitType, loc: u8, rng: &mut impl Rng) -> FieldPosition {
    let is_left  = loc == 1 || loc == 4 || loc == 7;
    let is_right = loc == 3 || loc == 6 || loc == 9;
    match hit_type {
        BallHitType::Bunt => {
            let opts = [FieldPosition::P, FieldPosition::C, FieldPosition::B1, FieldPosition::B3];
            opts[rng.gen_range(0..opts.len())]
        }
        BallHitType::Popup => {
            let opts = [FieldPosition::C, FieldPosition::B1, FieldPosition::B2, FieldPosition::B3, FieldPosition::SS];
            opts[rng.gen_range(0..opts.len())]
        }
        BallHitType::GroundBall => {
            if is_left  { if rng.gen::<f64>() < 0.52 { FieldPosition::B3 } else { FieldPosition::SS } }
            else if is_right { if rng.gen::<f64>() < 0.55 { FieldPosition::B1 } else { FieldPosition::B2 } }
            else { if rng.gen::<f64>() < 0.50 { FieldPosition::SS } else { FieldPosition::B2 } }
        }
        BallHitType::FlyBall => {
            if is_left  { if rng.gen::<f64>() < 0.72 { FieldPosition::RF } else { FieldPosition::CF } }
            else if is_right { if rng.gen::<f64>() < 0.72 { FieldPosition::LF } else { FieldPosition::CF } }
            else { let r = rng.gen::<f64>(); if r < 0.60 { FieldPosition::CF } else if r < 0.80 { FieldPosition::LF } else { FieldPosition::RF } }
        }
        BallHitType::LineDrive => {
            if is_left  { if rng.gen::<f64>() < 0.45 { FieldPosition::B1 } else { FieldPosition::RF } }
            else if is_right { if rng.gen::<f64>() < 0.45 { FieldPosition::B3 } else { FieldPosition::LF } }
            else { if rng.gen::<f64>() < 0.45 { FieldPosition::B2 } else { FieldPosition::CF } }
        }
    }
}

fn resolve_hardness(code: PitchResultCode, power: PitchPower, quality: f64, rng: &mut impl Rng) -> u8 {
    let mut base = match code {
        PitchResultCode::HomeRun   => 5.0,
        PitchResultCode::HitTriple => 4.2,
        PitchResultCode::HitDouble => 3.5,
        PitchResultCode::HitSingle => 2.8,
        _                          => 2.0,
    };
    if power == PitchPower::High { base += 0.5; }
    if power == PitchPower::Low  { base -= 0.5; }
    if quality < 40.0 { base += 0.5; }
    if quality < 32.0 { base += 0.5; }
    base += (rng.gen::<f64>() - 0.5) * 1.2;
    clamp(base.round(), 1.0, 5.0) as u8
}

fn resolve_ball_in_play(code: PitchResultCode, decision: &PitchDecision, quality: f64, rng: &mut impl Rng) -> Option<BallInPlay> {
    if !is_inplay(code) { return None; }
    let hit_type = resolve_hit_type(code, decision, quality, rng);
    let zone     = resolve_zone(hit_type, decision.location, rng);
    let hardness = resolve_hardness(code, decision.power, quality, rng);
    Some(BallInPlay { hit_type, zone, hardness })
}

// ── 수비 처리 ─────────────────────────────────────────────────────────────────

fn calc_error_prob(ball: &BallInPlay, fielder: &FielderStats) -> f64 {
    let base = match ball.hit_type {
        BallHitType::Popup      => 0.04,
        BallHitType::Bunt       => 0.08,
        BallHitType::FlyBall    => 0.06,
        BallHitType::GroundBall => 0.11,
        BallHitType::LineDrive  => 0.09,
    };
    clamp(base + (ball.hardness as f64 - 3.0) * 0.025 - (fielder.fielding - 50.0) * 0.003, 0.01, 0.40)
}

fn make_default_fielder(pos: FieldPosition) -> FielderStats {
    let p = fielder_default_pos(pos);
    FielderStats { position: pos, name: format!("{:?}", pos), fielding: 50.0, arm: 50.0, speed: 50.0, x: p.x, y: p.y }
}

fn resolve_fielding_result(ball: &BallInPlay, fielders: &[FielderStats], rng: &mut impl Rng) -> (FieldingResult, PitchResultCode) {
    let fielder = fielders.iter().find(|f| f.position == ball.zone)
        .cloned()
        .unwrap_or_else(|| make_default_fielder(ball.zone));

    let is_error = rng.gen::<f64>() < calc_error_prob(ball, &fielder);
    let mut threw_to: Option<FieldPosition> = None;
    let mut throw_result: Option<String> = None;
    let mut result_code = if is_error { PitchResultCode::FieldingError } else { PitchResultCode::InplayOut };

    if !is_error {
        let needs_throw = matches!(ball.hit_type, BallHitType::GroundBall | BallHitType::LineDrive | BallHitType::Bunt);
        if needs_throw && ball.zone != FieldPosition::B1 {
            threw_to = Some(FieldPosition::B1);
            let arm_mod = (fielder.arm - 50.0) * 0.004;
            let hard_penalty = (ball.hardness as f64 - 3.0) * 0.02;
            let success = clamp(0.88 + arm_mod - hard_penalty, 0.45, 0.97);
            if rng.gen::<f64>() < success {
                throw_result = Some("out".to_string());
            } else {
                throw_result = Some("safe".to_string());
                result_code = PitchResultCode::FieldingError;
            }
        }
    }

    let fr = FieldingResult {
        fielder,
        is_error,
        threw_to,
        throw_result,
        runner_extra_advance: if is_error { 1 } else { 0 },
    };
    (fr, result_code)
}

// ── 주루 ──────────────────────────────────────────────────────────────────────

/// 🔴 **누가 홈을 밟았는지 `scored`에 담는다** (2026-08-28).
///   득점(R)은 홈을 밟은 사람 것이라 수만 세면 사람에게 못 붙인다.
fn advance_on_walk(runners: MatchRunners, new_runner: RunnerStats, scored: &mut Vec<String>) -> (MatchRunners, i32) {
    let mut runs = 0;
    let (mut first, mut second, mut third) = (runners.first, runners.second, runners.third);
    if first.is_some() {
        if second.is_some() {
            if let Some(r) = third.as_ref() {
                runs = 1;
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            third = second.take();
            second = first.take();
        } else { second = first.take(); }
    }
    first = Some(new_runner);
    (MatchRunners { first, second, third }, runs)
}

fn try_extra_base(runner: &RunnerStats, ctx: &str, rng: &mut impl Rng) -> &'static str {
    let (attempt_base, success_base) = match ctx {
        "1st_to_3rd_single" => (0.20, 0.72),
        "2nd_scores_single" => (0.35, 0.63),
        "1st_scores_double" => (0.30, 0.58),
        _                   => (0.0,  0.0),
    };
    let speed_mod    = (runner.speed    - 50.0) * 0.005;
    let instinct_mod = (runner.instinct - 50.0) * 0.003;
    if rng.gen::<f64>() >= clamp(attempt_base + speed_mod + instinct_mod, 0.02, 0.75) { return "stop"; }
    if rng.gen::<f64>() < clamp(success_base + speed_mod, 0.15, 0.95) { "advance" } else { "out" }
}

/// 🔴 **홈을 밟은 사람을 `scored`에 담는다** — 타자 본인의 홈런도 포함이다
fn advance_on_hit(runners: MatchRunners, code: PitchResultCode, new_runner: RunnerStats,
                  rng: &mut impl Rng, scored: &mut Vec<String>)
    -> (MatchRunners, i32, i32, Vec<String>)
{
    let mut next = MatchRunners { first: None, second: None, third: None };
    let mut runs = 0i32; let mut extra_outs = 0i32; let mut logs = vec![];

    match code {
        PitchResultCode::HomeRun => {
            runs = 1 + runners.first.is_some() as i32
                     + runners.second.is_some() as i32
                     + runners.third.is_some() as i32;
            // 타자 본인도 홈을 밟는다
            if let Some(id) = new_runner.player_id.clone() { scored.push(id); }
            for r in [&runners.first, &runners.second, &runners.third].into_iter().flatten() {
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitTriple => {
            runs = runners.first.is_some() as i32
                 + runners.second.is_some() as i32
                 + runners.third.is_some() as i32;
            for r in [&runners.first, &runners.second, &runners.third].into_iter().flatten() {
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            next.third = Some(new_runner);
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitDouble => {
            if let Some(r) = runners.third.as_ref() {
                runs += 1;
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            if let Some(r) = runners.second.as_ref() {
                runs += 1;
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            if let Some(r) = runners.first {
                match try_extra_base(&r, "1st_scores_double", rng) {
                    "advance" => { runs += 1;
                        if let Some(id) = r.player_id.clone() { scored.push(id); }
                        logs.push(format!("적극 주루! 1루 주자 홈인 (스피드 {})", r.speed)); }
                    "out"     => { extra_outs += 1; logs.push(format!("주루 아웃! 1루 주자 홈 태그아웃 (스피드 {})", r.speed)); }
                    _         => { next.third = Some(r); }
                }
            }
            next.second = Some(new_runner);
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitSingle => {
            if let Some(r) = runners.third.as_ref() {
                runs += 1;
                if let Some(id) = r.player_id.clone() { scored.push(id); }
            }
            if let Some(r) = runners.second.clone() {
                match try_extra_base(&r, "2nd_scores_single", rng) {
                    "advance" => { runs += 1;
                        if let Some(id) = r.player_id.clone() { scored.push(id); }
                        logs.push(format!("적극 주루! 2루 주자 홈인 (스피드 {})", r.speed)); }
                    "out"     => { extra_outs += 1; logs.push(format!("주루 아웃! 2루 주자 홈 태그아웃 (스피드 {})", r.speed)); }
                    _         => { next.third = Some(r); }
                }
            }
            if let Some(r) = runners.first.clone() {
                if next.third.is_none() {
                    match try_extra_base(&r, "1st_to_3rd_single", rng) {
                        "advance" => { next.third = Some(r.clone()); logs.push(format!("적극 주루! 1루 주자 3루까지 (스피드 {})", r.speed)); }
                        "out"     => { extra_outs += 1; logs.push(format!("주루 아웃! 1루 주자 3루 태그아웃 (스피드 {})", r.speed)); }
                        _         => { next.second = Some(r); }
                    }
                } else { next.second = Some(r); }
            }
            next.first = Some(new_runner);
            return (next, runs, extra_outs, logs);
        }
        _ => {}
    }
    (runners, 0, 0, vec![])
}

fn attempt_steals(state: &MatchState, pitcher: &PitcherStats, rng: &mut impl Rng)
    -> (MatchRunners, u8, Vec<String>)
{
    let mut first = state.runners.first.clone();
    let mut second = state.runners.second.clone();
    let mut third = state.runners.third.clone();
    let mut outs = state.outs;
    let mut steal_logs: Vec<String> = vec![];

    let is_our_batting = !is_our_team_fielding(state);
    let manager_boost = if is_our_batting {
        (state.my_manager.offense_mind - 50.0) * T::OFFENSE_STEAL_MODIFIER
    } else { 0.0 };
    // ⚠ 계수를 여기 적지 않는다 — **`npc_sim`이 같은 규칙을 쓴다.**
    // 두 벌로 두면 주인공 기록과 리그 기록이 다른 척도가 된다
    // (실제로 도루가 이쪽에만 있어서 리그 도루가 0이었다).
    let hold_factor = T::steal_hold_factor(pitcher.hold_runners);
    // 🔴 **포수가 도루에 아무 영향이 없었다.** 투수 견제만 걸리고 포수는 자리만 지켰다.
    //    수비팀 포수의 `arm`을 성공 확률에 넣는다 — 못 찾으면 50(중립)이다.
    let catcher_arm = state.fielders.iter()
        .find(|f| f.position == crate::types::FieldPosition::C)
        .map(|f| f.arm)
        .unwrap_or(T::STEAL_CATCHER_ARM_PIVOT);

    if first.is_some() && second.is_none() {
        let r = first.as_ref().unwrap().clone();
        let (attempt_prob, success) = T::steal_second_probs(r.speed, r.instinct, hold_factor, manager_boost, catcher_arm);
        if rng.gen::<f64>() < attempt_prob {
            if rng.gen::<f64>() < success {
                second = first.take();
                steal_logs.push(format!("도루 성공! 1루→2루 (스피드 {})", r.speed));
            } else {
                first = None; outs += 1;
                steal_logs.push(format!("도루 실패! 1루 주자 아웃 (스피드 {})", r.speed));
            }
        }
    }
    if let Some(ref r) = second.clone() {
        if third.is_none() && r.speed > T::STEAL_3B_SPEED_GATE {
            let r = r.clone();
            let (attempt_prob, success) = T::steal_third_probs(r.speed, r.instinct, hold_factor, manager_boost, catcher_arm);
            if rng.gen::<f64>() < attempt_prob {
                if rng.gen::<f64>() < success {
                    third = second.take();
                    steal_logs.push(format!("도루 성공! 2루→3루 (스피드 {})", r.speed));
                } else {
                    second = None; outs += 1;
                    steal_logs.push(format!("도루 실패! 2루 주자 아웃 (스피드 {})", r.speed));
                }
            }
        }
    }
    (MatchRunners { first, second, third }, outs, steal_logs)
}

/// ⚠ **타구 종류를 본다.** 예전엔 안 봐서 주자 1루면 뜬공에도 22%로 병살이
/// 붙었다 — 결과 코드가 `INPLAY_OUT` 하나뿐이라 화면엔 "아웃"으로만 나와
/// 안 보였다. 코드를 쪼개자마자 "중견수 병살타"가 로그에 찍혔다.
fn try_double_play(
    ball: Option<&BallInPlay>, runners: &MatchRunners, outs_before: u8, rng: &mut impl Rng,
) -> (bool, MatchRunners) {
    if outs_before >= 2 || runners.first.is_none() { return (false, runners.clone()); }
    let type_mod = match ball.map(|b| b.hit_type) {
        Some(BallHitType::GroundBall) | Some(BallHitType::Bunt) => 1.0,
        Some(BallHitType::LineDrive) => T::DOUBLE_PLAY_LINEDRIVE_MOD,
        // 뜬공·팝업으로는 병살이 안 된다
        _ => 0.0,
    };
    if type_mod <= 0.0 { return (false, runners.clone()); }
    let base_prob = (T::DOUBLE_PLAY_BASE_PROB
        + if runners.second.is_some() { 0.05 } else { 0.0 }
        + if runners.third.is_some()  { 0.03 } else { 0.0 }) * type_mod;
    if rng.gen::<f64>() >= base_prob { return (false, runners.clone()); }
    (true, MatchRunners { first: None, second: runners.second.clone(), third: runners.third.clone() })
}

// ── 보정 함수 ─────────────────────────────────────────────────────────────────

fn resolve_mental_delta(code: PitchResultCode) -> f64 {
    match code {
        PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing => 0.5,
        PitchResultCode::InplayOut | PitchResultCode::GroundOut
        | PitchResultCode::FlyOut | PitchResultCode::LineOut => 0.8,
        // 아웃 두 개를 한 번에 잡았다. 0.8을 두 번 준 셈으로 둔다
        PitchResultCode::DoublePlay  =>  1.6,
        PitchResultCode::FieldingError => -1.2,
        PitchResultCode::Ball        => -0.4,
        PitchResultCode::Foul        => -0.1,
        PitchResultCode::Walk        => -0.9,
        PitchResultCode::HitSingle   => -1.0,
        PitchResultCode::HitDouble   => -1.4,
        PitchResultCode::HitTriple   => -1.8,
        PitchResultCode::HomeRun     => -2.4,
        _                            =>  0.0,
    }
}

fn count_modifier(count: &MatchCount) -> f64 {
    match (count.balls, count.strikes) {
        (0, 2) =>  5.0,
        (1, 2) =>  3.0,
        (2, 2) =>  2.0,
        (3, 0) => -8.0,
        (3, 1) => -5.0,
        _      =>  0.0,
    }
}

fn apply_hit_upgrade(code: PitchResultCode, power: f64, weather: WeatherType, rng: &mut impl Rng) -> PitchResultCode {
    if code != PitchResultCode::HitSingle && code != PitchResultCode::HitDouble { return code; }
    let power_factor = (power - 50.0) / 50.0;
    let wind_bonus   = T::weather_power_modifier(weather);
    let mut result = code;
    if result == PitchResultCode::HitSingle {
        if rng.gen::<f64>() < (T::HIT_UPGRADE_SINGLE_TO_DOUBLE_BASE + power_factor * 0.10 + wind_bonus).max(0.0) {
            result = PitchResultCode::HitDouble;
        }
    }
    if result == PitchResultCode::HitDouble {
        if rng.gen::<f64>() < (T::HIT_UPGRADE_DOUBLE_TO_HR_BASE + power_factor * 0.08 + wind_bonus).max(0.0) {
            result = PitchResultCode::HomeRun;
        }
    }
    result
}

fn pitch_pattern_modifier(pitch_type: PitchType, last: &[PitchType]) -> f64 {
    if last.is_empty() { return 0.0; }
    let mut consecutive = 0usize;
    for &p in last.iter().rev() {
        if p == pitch_type { consecutive += 1; } else { break; }
    }
    if consecutive >= 3 { return -4.0; }
    if consecutive >= 2 { return -2.0; }
    if consecutive >= 1 { return -1.0; }
    if !last.iter().rev().take(3).any(|&p| p == pitch_type) { 1.0 } else { 0.0 }
}

fn jam_pressure_modifier(state: &MatchState, mental: f64, batter_clutch: f64) -> f64 {
    if state.runners.second.is_none() && state.runners.third.is_none() { return 0.0; }
    let mut pressure = -1.0;
    if state.outs == 2 { pressure -= 1.0; }
    if state.runners.first.is_some() && state.runners.second.is_some() && state.runners.third.is_some() { pressure -= 1.0; }
    if      mental < 30.0 { pressure -= 1.5; }
    else if mental < 50.0 { pressure -= 0.5; }
    pressure -= (batter_clutch - 50.0) * 0.02;
    pressure
}

fn clutch_modifier(state: &MatchState, pitcher_clutch: f64) -> f64 {
    let inning_ratio = state.inning as f64 / state.inning_limit as f64;
    if inning_ratio < 0.67 { return 0.0; }
    let score_diff = (state.score.home - state.score.away).abs() as f64;
    if score_diff > 3.0 { return 0.0; }
    let inning_pressure = (inning_ratio - 0.67) * 6.0;
    let score_pressure  = (3.0 - score_diff).max(0.0) * 0.5;
    let raw_pressure    = -(inning_pressure + score_pressure) * 0.8;
    let clutch_factor   = 1.0 - clamp((pitcher_clutch - 50.0) * 0.008, -0.3, 0.3);
    raw_pressure * clutch_factor
}

// ── 게임 종료 판단 ────────────────────────────────────────────────────────────

fn is_cold_game(state: &MatchState) -> bool {
    if state.half != HalfInning::Bottom || state.outs < 3 { return false; }
    let diff = (state.score.home - state.score.away).unsigned_abs() as u8;
    (state.inning >= 5 && diff >= 10) || (state.inning >= 7 && diff >= 7)
}

fn should_auto_finish(state: &MatchState) -> bool {
    if state.half == HalfInning::Bottom && state.inning >= state.inning_limit && state.score.home > state.score.away { return true; }
    if state.inning > state.inning_limit && state.score.home != state.score.away { return true; }
    is_cold_game(state)
}

fn finish_log(state: &MatchState) -> String {
    if state.half == HalfInning::Bottom && state.inning >= state.inning_limit && state.score.home > state.score.away {
        return "끝내기!".to_string();
    }
    if is_cold_game(state) {
        let diff = (state.score.home - state.score.away).unsigned_abs();
        return format!("콜드게임 ({}회 종료, {}점차)", state.inning, diff);
    }
    "규정 이닝 종료".to_string()
}

// ── 로그/텍스트 ───────────────────────────────────────────────────────────────

fn get_result_comment(code: PitchResultCode) -> &'static str {
    match code {
        PitchResultCode::StrikeSwing  => "헛스윙 스트라이크",
        PitchResultCode::StrikeLook   => "루킹 스트라이크",
        // 삼진 — **타자가 물러났다.** 스트라이크 하나와 다른 일이다
        PitchResultCode::StrikeoutSwing => "헛스윙 삼진",
        PitchResultCode::StrikeoutLook  => "루킹 삼진",
        PitchResultCode::Ball         => "볼",
        PitchResultCode::Foul         => "파울",
        PitchResultCode::InplayOut    => "타구 아웃",
        PitchResultCode::GroundOut    => "땅볼 아웃",
        PitchResultCode::FlyOut       => "뜬공 아웃",
        PitchResultCode::LineOut      => "직선타 아웃",
        PitchResultCode::DoublePlay   => "병살타",
        PitchResultCode::FieldingError=> "실책",
        PitchResultCode::Walk         => "볼넷",
        PitchResultCode::HitByPitch   => "몸에 맞는 공",
        PitchResultCode::SacBunt      => "희생번트",
        PitchResultCode::SacFly       => "희생플라이",
        PitchResultCode::HitSingle    => "안타",
        PitchResultCode::HitDouble    => "2루타",
        PitchResultCode::HitTriple    => "3루타",
        PitchResultCode::HomeRun      => "홈런",
        PitchResultCode::GameOver     => "경기 종료",
    }
}

fn get_result_tone(code: PitchResultCode) -> &'static str {
    match code {
        PitchResultCode::StrikeSwing | PitchResultCode::StrikeLook => "good",
        c if is_out_in_play(c) => "good",
        PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple
        | PitchResultCode::HomeRun | PitchResultCode::Walk | PitchResultCode::FieldingError => "bad",
        _ => "neutral",
    }
}

fn build_pitch_log(state: &MatchState, decision: &PitchDecision, landing: XY, code: PitchResultCode, quality: f64) -> String {
    let half_label = if state.half == HalfInning::Top { "초" } else { "말" };
    let pt = match decision.pitch_type {
        PitchType::Fastball    => "fastball",   PitchType::Sinker    => "sinker",
        PitchType::Cutter      => "cutter",     PitchType::Slider    => "slider",
        PitchType::Curve       => "curve",      PitchType::Changeup  => "changeup",
        PitchType::Splitter    => "splitter",   PitchType::Forkball  => "forkball",
        PitchType::Screwball   => "screwball",  PitchType::Knuckleball => "knuckleball",
    };
    let st = match decision.strategy { PitchStrategy::Aggressive => "aggressive", PitchStrategy::Balanced => "balanced", PitchStrategy::Safe => "safe" };
    let pw = match decision.power { PitchPower::Low => "low", PitchPower::Normal => "normal", PitchPower::High => "high" };
    let code_str = match code {
        PitchResultCode::StrikeSwing => "STRIKE_SWING", PitchResultCode::StrikeLook => "STRIKE_LOOK",
        PitchResultCode::StrikeoutSwing => "STRIKEOUT_SWING",
        PitchResultCode::StrikeoutLook => "STRIKEOUT_LOOK",
        PitchResultCode::Ball => "BALL", PitchResultCode::Foul => "FOUL",
        PitchResultCode::InplayOut => "INPLAY_OUT", PitchResultCode::GroundOut => "GROUND_OUT",
        PitchResultCode::FlyOut => "FLY_OUT", PitchResultCode::LineOut => "LINE_OUT",
        PitchResultCode::DoublePlay => "DOUBLE_PLAY", PitchResultCode::FieldingError => "FIELDING_ERROR",
        PitchResultCode::Walk => "WALK",
        PitchResultCode::HitByPitch => "HIT_BY_PITCH",
        PitchResultCode::SacBunt => "SAC_BUNT", PitchResultCode::SacFly => "SAC_FLY",
        PitchResultCode::HitSingle => "HIT_SINGLE",
        PitchResultCode::HitDouble => "HIT_DOUBLE", PitchResultCode::HitTriple => "HIT_TRIPLE",
        PitchResultCode::HomeRun => "HOME_RUN", PitchResultCode::GameOver => "GAME_OVER",
    };
    format!("[{}회{}] {} ({:.2},{:.2}) {}/{} -> {} (Q:{:.1})",
        state.inning, half_label, pt, landing.x, landing.y, st, pw, code_str, quality)
}

fn build_summary(state: &MatchState) -> String {
    if !state.protagonist_has_entered {
        return format!("{}:{} 종료 (등판 없음)", state.score.away, state.score.home);
    }
    format!("{}:{} 종료 (투구수 {}, 체력 {:.1}, 멘탈 {:.1})",
        state.score.away, state.score.home,
        state.pitch_count_since_entry,
        state.protagonist_stamina, state.protagonist_mental)
}

// ── 애니메이션 큐 ─────────────────────────────────────────────────────────────

const MOUND_POS: XY = XY { x: 50.0, y: 62.0 };
const HOME_POS:  XY = XY { x: 50.0, y: 88.0 };

fn batted_duration(hit_type: BallHitType) -> u32 {
    match hit_type {
        BallHitType::Bunt      => 280, BallHitType::Popup     => 520,
        BallHitType::GroundBall=> 380, BallHitType::LineDrive => 330,
        BallHitType::FlyBall   => 680,
    }
}
fn batted_arc(hit_type: BallHitType) -> f64 {
    match hit_type {
        BallHitType::Popup      => 0.85, BallHitType::FlyBall    => 0.60,
        BallHitType::LineDrive  => 0.15, BallHitType::GroundBall => 0.05,
        BallHitType::Bunt       => 0.08,
    }
}

fn build_runner_advance_cues(code: PitchResultCode, pre: &MatchRunners) -> Vec<AnimationCue> {
    let mut cues = vec![];
    let push = |id: &str, base: &str, ms: u32| AnimationCue::RunnerAdvance {
        runner_id: id.to_string(), to_base: base.to_string(), duration: ms
    };
    match code {
        PitchResultCode::HomeRun => {
            cues.push(push("batter", "home", 600));
            if pre.third.is_some()  { cues.push(push("third",  "home", 380)); }
            if pre.second.is_some() { cues.push(push("second", "home", 460)); }
            if pre.first.is_some()  { cues.push(push("first",  "home", 540)); }
        }
        PitchResultCode::HitTriple => {
            cues.push(push("batter", "3B", 580));
            if pre.third.is_some()  { cues.push(push("third",  "home", 360)); }
            if pre.second.is_some() { cues.push(push("second", "home", 440)); }
            if pre.first.is_some()  { cues.push(push("first",  "home", 520)); }
        }
        PitchResultCode::HitDouble => {
            cues.push(push("batter", "2B", 520));
            if pre.third.is_some()  { cues.push(push("third",  "home", 360)); }
            if pre.second.is_some() { cues.push(push("second", "home", 440)); }
            if pre.first.is_some()  { cues.push(push("first",  "3B",  520)); }
        }
        PitchResultCode::HitSingle | PitchResultCode::FieldingError => {
            cues.push(push("batter", "1B", 440));
            if pre.third.is_some()  { cues.push(push("third",  "home", 320)); }
            if pre.second.is_some() { cues.push(push("second", "3B",   400)); }
            if pre.first.is_some()  { cues.push(push("first",  "2B",   480)); }
        }
        PitchResultCode::Walk => {
            cues.push(push("batter", "1B", 380));
            if pre.first.is_some() {
                cues.push(push("first", "2B", 420));
                if pre.second.is_some() {
                    cues.push(push("second", "3B", 460));
                    if pre.third.is_some() { cues.push(push("third", "home", 380)); }
                }
            }
        }
        _ => {}
    }
    cues
}

fn build_animation_cues(
    decision: &PitchDecision, code: PitchResultCode,
    ball: Option<&BallInPlay>, fr: Option<&FieldingResult>, pre_runners: &MatchRunners,
) -> Vec<AnimationCue> {
    let mut cues = vec![];
    let pitch_dur = match decision.power { PitchPower::High => 240, PitchPower::Low => 340, _ => 290 };
    cues.push(AnimationCue::BallPitch { from: MOUND_POS, to: HOME_POS, duration: pitch_dur });

    let ball = match ball {
        None => {
            cues.push(AnimationCue::ShowResult {
                text: get_result_comment(code).to_string(),
                tone: get_result_tone(code).to_string(), x: 50.0, y: 50.0,
            });
            return cues;
        }
        Some(b) => b,
    };

    let zone_pos = fielder_default_pos(ball.zone);
    let dur = batted_duration(ball.hit_type);
    cues.push(AnimationCue::BallBatted { from: HOME_POS, to: zone_pos, arc: batted_arc(ball.hit_type), hit_type: ball.hit_type, duration: dur });
    cues.push(AnimationCue::FielderMove { position: ball.zone, to: zone_pos, duration: (dur as f64 * 0.85) as u32 });

    if let Some(f) = fr {
        if let Some(threw_to) = f.threw_to {
            let throw_to = fielder_default_pos(threw_to);
            let throw_dur = (200.0 + (100.0 - f.fielder.arm) * 1.2) as u32;
            cues.push(AnimationCue::BallThrow { from: zone_pos, to: throw_to, duration: throw_dur });
        }
    }

    cues.extend(build_runner_advance_cues(code, pre_runners));

    let result_text = if code == PitchResultCode::FieldingError {
        format!("실책! ({})", fr.map(|f| f.fielder.name.as_str()).unwrap_or(""))
    } else {
        get_result_comment(code).to_string()
    };
    cues.push(AnimationCue::ShowResult { text: result_text, tone: get_result_tone(code).to_string(), x: 50.0, y: 40.0 });
    cues
}

// ── NPC 자동 투구 결정 ────────────────────────────────────────────────────────

fn target_to_zone(t: XY) -> u8 {
    let col = if t.x < -0.33 { 0 } else if t.x < 0.33 { 1 } else { 2 };
    let row = if t.y < -0.33 { 0 } else if t.y < 0.33 { 1 } else { 2 };
    [[7u8, 8, 9], [4, 5, 6], [1, 2, 3]][row][col]
}

/// 카운트별 목표 지점 — **투수 AI의 코스 선택 정본이다.**
///
/// ⚠ 예전엔 `auto_pick_decision`과 `random_decision_for_sim`이 각자 좌표를
/// 만들었고 **둘 다 존 밖을 겨냥하지 않았다**(각각 최대 0.8, 1.1인데 볼
/// 판정선은 1.2다). 그래서 200경기에 볼넷이 3개였다. 표를 두 곳에 두면
/// 한쪽만 고쳐지므로 여기 하나로 모은다. 수치 정본은 `tuning.rs`.
fn pick_target(balls: u8, strikes: u8, rng: &mut impl Rng) -> XY {
    let chase_prob = if balls >= 3 { T::AUTO_CHASE_PROB_BEHIND }
        else if strikes == 2 { T::AUTO_CHASE_PROB_AHEAD }
        else { T::AUTO_CHASE_PROB_NEUTRAL };

    let sign = |rng: &mut dyn FnMut() -> f64| if rng() < 0.5 { -1.0 } else { 1.0 };
    let mut r = || rng.gen::<f64>();

    if r() < chase_prob {
        // 유인구 — **한 축만** 존 밖으로 뺀다. 두 축 다 빼면 대각선으로 크게
        // 벗어나 타자가 아예 안 속고 볼만 쌓인다
        let out = T::AUTO_CHASE_MIN + r() * T::AUTO_CHASE_SPAN;
        let other = (r() - 0.5) * 1.8;
        let (sx, sy) = (sign(&mut r), sign(&mut r));
        return if r() < 0.5 { XY { x: sx * out, y: other } } else { XY { x: other, y: sy * out } };
    }

    if balls >= 3 {
        // 볼넷을 피해야 한다 — 존 한복판
        XY { x: (r() - 0.5) * 1.0, y: (r() - 0.5) * 1.0 }
    } else if strikes == 2 {
        // 코너
        let (sx, sy) = (sign(&mut r), sign(&mut r));
        XY { x: sx * (0.55 + r() * 0.40), y: sy * (0.55 + r() * 0.40) }
    } else {
        XY { x: (r() - 0.5) * 1.6, y: (r() - 0.5) * 1.6 }
    }
}

fn auto_pick_decision(state: &MatchState, rng: &mut impl Rng) -> PitchDecision {
    let (balls, strikes) = (state.count.balls, state.count.strikes);
    let target = pick_target(balls, strikes, rng);
    // ⚠ 구종은 **보유 목록에서** 나온다. 전략(공격적/안전)만 카운트가 정한다
    let pit = get_active_pitcher(state);
    let pitch_type = pick_from_arsenal(pit, balls, strikes, rng);
    let strategy = if balls >= 3 { PitchStrategy::Safe }
        else if strikes == 2 { PitchStrategy::Aggressive }
        else { PitchStrategy::Balanced };
    PitchDecision { pitch_type, location: target_to_zone(target), target: Some(target), strategy, power: PitchPower::Normal }
}

/// ⚠ **카운트를 받아야 한다.** 예전엔 인자가 rng뿐이라 `pick_target(0,0)`으로
/// 항상 중립 카운트를 썼다. 그래서 `runSimpleGame`(감사가 쓰는 경로)은
/// 볼 3개·스트라이크 2개의 코스 변화를 **재현하지 못했고**, 실제 자동진행
/// (`auto_pick_decision`)과 다른 야구를 하고 있었다.
fn random_decision_for_sim(balls: u8, strikes: u8, rng: &mut impl Rng) -> PitchDecision {
    let types    = [PitchType::Fastball, PitchType::Slider, PitchType::Curve, PitchType::Changeup];
    let strats   = [PitchStrategy::Aggressive, PitchStrategy::Balanced, PitchStrategy::Safe];
    let powers   = [PitchPower::Low, PitchPower::Normal, PitchPower::High];
    // 코스는 공통 함수를 쓴다 — 여기 좌표를 따로 적으면 `auto_pick_decision`과
    // 어긋나고, 실제로 그래서 두 경로가 각자 볼넷을 못 만들고 있었다.
    // 카운트를 모르는 자리라 중립 카운트로 뽑는다
    let target   = pick_target(balls, strikes, rng);
    PitchDecision {
        pitch_type: types[rng.gen_range(0..types.len())],
        location:   target_to_zone(target),
        target:     Some(target),
        strategy:   strats[rng.gen_range(0..strats.len())],
        power:      powers[rng.gen_range(0..powers.len())],
    }
}

// ── 등판 진입/강판 ────────────────────────────────────────────────────────────

fn should_protagonist_enter(state: &MatchState) -> bool {
    if state.protagonist_has_entered || state.protagonist_exited || state.is_finished { return false; }
    if !is_our_team_fielding(state) { return false; }

    match &state.entry_trigger {
        EntryTrigger::InningStart { inning } => {
            state.inning >= *inning
            && state.outs == 0
            && state.count.balls == 0 && state.count.strikes == 0
        }
        EntryTrigger::MidInning { inning, score_diff_cap, .. } => {
            if state.inning < *inning { return false; }
            let my_score  = if state.protagonist_side == "home" { state.score.home } else { state.score.away };
            let opp_score = if state.protagonist_side == "home" { state.score.away } else { state.score.home };
            if opp_score - my_score > *score_diff_cap { return false; }
            let iq_factor = 1.0 - (state.my_manager.tactical_iq - 50.0) * 0.004;
            let stamina_threshold = T::NPC_STARTER_STAMINA_LIMIT * iq_factor;
            let pitch_threshold   = T::NPC_STARTER_PITCH_COUNT_SOFT - (state.my_manager.tactical_iq - 50.0) * 0.5;
            state.npc_pitcher_stamina.my <= stamina_threshold
            || state.npc_pitcher_pitch_count.my >= pitch_threshold
        }
        EntryTrigger::CloseGame { inning_threshold, max_lead_diff, min_lead_diff } => {
            if state.inning < *inning_threshold { return false; }
            let my_score  = if state.protagonist_side == "home" { state.score.home } else { state.score.away };
            let opp_score = if state.protagonist_side == "home" { state.score.away } else { state.score.home };
            let lead = my_score - opp_score;
            lead >= *min_lead_diff && lead <= *max_lead_diff
        }
        EntryTrigger::Manual { inning, half, outs, .. } => {
            state.inning == *inning && &state.half == half && state.outs == *outs
        }
    }
}

fn protagonist_enters_mid_inning(state: &MatchState) -> MatchState {
    let half_label = if state.half == HalfInning::Top { "초" } else { "말" };
    let entry_log = format!("[{}회{} {}아웃] 주인공 등판!", state.inning, half_label, state.outs);
    let mut next = state.clone();
    next.protagonist_has_entered = true;
    next.pitch_count_since_entry = 0;
    next.inherited_runners = state.runners.clone();
    next.last_pitch_types = vec![];
    next.pre_entry_logs.push(entry_log.clone());
    next.logs.push(entry_log);
    next
}

fn protagonist_exits_game(state: &MatchState, reason: ExitReason) -> MatchState {
    let reason_label = match reason {
        ExitReason::PitchLimit  => "투구수 제한",
        ExitReason::Stamina     => "체력 부족",
        ExitReason::Performance => "부진",
        ExitReason::Tactical    => "전술적 교체",
    };
    let log = format!("주인공 강판 ({}) — NPC 구원 투수 등판", reason_label);
    let mut next = state.clone();
    next.protagonist_exited = true;
    next.logs.push(log);
    next
}

pub fn should_protagonist_exit(state: &MatchState) -> ProtagonistExitCheck {
    if !state.protagonist_has_entered || state.protagonist_exited {
        return ProtagonistExitCheck { should_exit: false, reason: None };
    }

    let pce   = state.pitch_count_since_entry as f64;
    let stam  = state.protagonist_stamina;
    let mental = state.protagonist_mental;
    let tiq   = state.my_manager.tactical_iq;
    let cdec  = state.my_manager.clutch_decision;

    // 리그별 상한 (고교 105 / 그 외 120). 구 세이브는 0이라 전역 상수로 떨어진다.
    let hard = if state.pitch_limit > 0.0 { state.pitch_limit } else { T::PROTAGONIST_PITCH_COUNT_HARD };
    let soft = if state.pitch_soft  > 0.0 { state.pitch_soft  } else { T::protagonist_pitch_soft() };

    if pce  >= hard { return ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::PitchLimit) }; }

    // ⚠ **NPC와 같은 규칙으로 내려온다** (2026-08-13).
    //
    // 예전엔 주인공만 스태미나 문턱(35)으로 내려왔다. 그 상수 주석은
    // "NPC와 같은 기준"이라고 적혀 있었지만 **NPC는 스태미나 문턱을 아예
    // 안 쓴다** — `PitcherQueue::should_switch`가 아웃카운트 예산과 투구수만
    // 본다. 35라는 숫자가 NPC의 어떤 값과도 대응하지 않았다.
    //
    // 그 결과가 등판 길이 차이다:
    //   NPC 선발  max_outs = 12 + (스태미나/99)*15  → 스태미나 60이면 7이닝
    //   주인공    스태미나 <= 35                    → 실측 4.5이닝
    //
    // 이닝이 짧으니 시즌 이닝이 32~44에 머물고, 그 때문에 수상 자격선에
    // 계속 걸렸으며 탈삼진왕·방어율왕은 210시즌 0건이었다. 볼륨이 필요한
    // 부문에서 NPC 에이스와 싸움이 안 된다.
    //
    // 예산은 `queue_max_outs`의 선발 식을 그대로 쓴다 — 흔들림(±3)은 경기마다
    // 새로 뽑으면 같은 경기 안에서 값이 바뀌므로 여기선 뺀다.
    let budget = protagonist_max_outs(state);
    if budget > 0 && state.outs_since_entry >= budget {
        return ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::Stamina) };
    }

    // 스태미나는 **비상 하한**으로만 남긴다 — 부상·급락으로 예산을 채우기
    // 전에 무너지는 경우다. 여기가 정상 교체 사유였던 게 위의 결함이다
    if stam <= T::protagonist_stamina_exit() { return ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::Stamina) }; }

    let mut danger = 0.0;
    if pce >= soft { danger += 20.0 + (pce - soft) * 1.2; }
    if stam  < 30.0 { danger += (30.0 - stam)  * 1.5; }
    if mental < 30.0 { danger += (30.0 - mental) * 1.0; }

    let inning_ratio = state.inning as f64 / state.inning_limit as f64;
    if inning_ratio >= 0.8 { danger += 12.0; }
    let has_scoring = state.runners.second.is_some() || state.runners.third.is_some();
    let is_late = state.inning >= state.inning_limit - 1;
    if has_scoring && is_late { danger += 18.0; }

    let base_threshold = 65.0;
    let iq_adj    = (tiq  - 50.0) * 0.4;
    let clutch_adj = if is_late { (cdec - 50.0) * 0.3 } else { 0.0 };
    let threshold = base_threshold - iq_adj - clutch_adj;

    if danger >= threshold { ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::Tactical) } }
    else { ProtagonistExitCheck { should_exit: false, reason: None } }
}

// ── 마운드 방문 ───────────────────────────────────────────────────────────────

pub fn auto_mound_visit_if_needed(state: &MatchState) -> MatchState {
    if state.mound_visits_left <= 0 { return state.clone(); }
    if !state.protagonist_has_entered || state.protagonist_exited { return state.clone(); }
    if state.pitch_count as i32 - state.last_mound_visit_pitch < T::MOUND_VISIT_MIN_PITCH_GAP { return state.clone(); }

    let crisis_threshold     = 35.0 + (state.my_manager.clutch_decision - 50.0) * 0.2;
    let situational_threshold = 52.0 + (state.my_manager.tactical_iq - 50.0) * 0.1;
    let has_scoring = state.runners.second.is_some() || state.runners.third.is_some();
    let is_late = state.inning >= state.inning_limit - 2;

    let should_visit = state.protagonist_mental < crisis_threshold
        || (state.protagonist_mental < situational_threshold && has_scoring && is_late);

    if !should_visit { return state.clone(); }
    request_mound_visit(state)
}

pub fn request_mound_visit(state: &MatchState) -> MatchState {
    if state.mound_visits_left <= 0 { return state.clone(); }
    if !state.protagonist_has_entered || state.protagonist_exited { return state.clone(); }
    if state.pitch_count as i32 - state.last_mound_visit_pitch < T::MOUND_VISIT_MIN_PITCH_GAP { return state.clone(); }

    let motivator_factor = state.my_manager.motivator / 50.0;
    let mental_recovery  = T::MOUND_VISIT_MENTAL_RECOVERY * motivator_factor;
    let stamina_recovery = T::MOUND_VISIT_STAMINA_RECOVERY;
    let next_mental  = round1(clamp(state.protagonist_mental  + mental_recovery,  0.0, 100.0));
    let next_stamina = round1(clamp(state.protagonist_stamina + stamina_recovery, 0.0, 100.0));

    let mut next = state.clone();
    next.protagonist_mental  = next_mental;
    next.protagonist_stamina = next_stamina;
    next.last_pitch_types    = vec![];
    next.mound_visits_left  -= 1;
    next.last_mound_visit_pitch = state.pitch_count as i32;
    next.logs.push(format!("마운드 방문 (멘탈+{:.1}, 체력+{})", mental_recovery, stamina_recovery));
    next
}

// ── 핵심 투구 처리 엔진 ────────────────────────────────────────────────────────

pub fn step_pitch_core(state: &MatchState, decision: &PitchDecision, is_protagonist: bool, rng: &mut impl Rng) -> MatchStepResult {
    if state.is_finished {
        return MatchStepResult {
            next_state: state.clone(),
            outcome: PitchOutcome {
                result_code: PitchResultCode::GameOver, quality: 0.0,
                comment: "이미 종료된 경기입니다.".to_string(),
                ball_in_play: None, fielding_result: None, animation_cues: vec![],
                landing_target: XY { x: 0.0, y: 0.0 },
            },
            mid_game_injury: None,
            narrative_logs: vec![],
        };
    }

    // ── 1. 도루 시도 ──────────────────────────────────────────────────────────
    let active_pitcher = get_active_pitcher(state).clone();
    let (steal_runners, steal_outs, steal_logs) = attempt_steals(state, &active_pitcher, rng);
    let mut pre_runners = steal_runners;
    let mut pre_outs    = steal_outs;
    let mut pre_inning  = state.inning;
    let mut pre_half    = state.half;

    if pre_outs >= 3 {
        pre_outs    = 0;
        pre_runners = MatchRunners { first: None, second: None, third: None };
        if pre_half == HalfInning::Top { pre_half = HalfInning::Bottom; }
        else { pre_half = HalfInning::Top; pre_inning += 1; }
    }

    let pre_state = MatchState {
        runners: pre_runners.clone(), outs: pre_outs,
        inning: pre_inning, half: pre_half, ..state.clone()
    };

    // ── 2. 현재 투수·타자·스태미나 결정 ──────────────────────────────────────
    let current_pitcher = get_active_pitcher(&pre_state).clone();
    let current_batter  = get_current_batter(&pre_state, rng);
    let current_stamina = get_active_stamina(&pre_state);
    let current_mental  = get_active_mental(&pre_state);

    // ── 3. 착탄 → 스윙 → 결과 ────────────────────────────────────────────────
    let target = decision.target.unwrap_or_else(|| zone_to_target(decision.location));
    let lr = resolve_actual_landing(target, &current_pitcher, current_stamina, current_mental, &pre_state, rng);
    let quality = calculate_pitch_quality(&pre_state, &current_pitcher, &current_batter, current_stamina, current_mental, decision, lr.landing, rng);
    let (swings, umpire_strike) = swing_decision(lr.landing, decision.pitch_type, &current_batter, lr.in_zone, lr.in_shadow, rng);

    let mut result_code = if !swings {
        if umpire_strike { PitchResultCode::StrikeLook } else { PitchResultCode::Ball }
    } else {
        let cq = calculate_contact_quality(quality, &current_batter, lr.in_zone, lr.in_shadow);
        tally_contact_band(cq);
        apply_hit_upgrade(resolve_contact(quality, cq, &current_batter, rng), current_batter.power, pre_state.weather, rng)
    };

    let ball_in_play = resolve_ball_in_play(result_code, decision, quality, rng);

    // 🔴 **희생번트** (2026-08-28). 작전이 나오는 상황에서만 시도한다:
    //   무사 또는 1사 · 주자 있음 · 접전(3점 차 이내) · 스트라이크 2개 전.
    //
    //   ⚠ **`bunting` 능력치를 여기서 처음 쓴다.** 성장 엔진엔 있는데
    //     경기엔 안 오고 있어서 **올려도 아무 일이 안 일어나는 값**이었다.
    //   ⚠ 실패하면 그냥 아웃이다(희생타로 안 센다) — 타수로 잡힌다.
    //   ⚠ 타자가 스윙한 뒤에는 안 건다 — 이미 결과가 정해진 투구다.
    if !swings
        && pre_state.outs < 2
        && pre_state.count.strikes < 2
        && (pre_state.runners.first.is_some() || pre_state.runners.second.is_some())
        && (pre_state.score.home - pre_state.score.away).abs() <= 3
        && rng.gen::<f64>() < T::SAC_BUNT_ATTEMPT_PROB
    {
        let bunt = current_batter.bunting.unwrap_or(50.0);
        let ok = T::SAC_BUNT_SUCCESS_BASE + (bunt - 50.0) * 0.005;
        result_code = if rng.gen::<f64>() < clamp(ok, 0.35, 0.95) {
            PitchResultCode::SacBunt
        } else {
            // 실패는 그냥 아웃이다 — 희생타가 아니라 타수로 잡힌다
            PitchResultCode::GroundOut
        };
    }

    // 🔴 **사구** (2026-08-28). 볼 하나에 얹는다 — 타석당이 아니라 투구당이다.
    //   제구가 나쁘면 더 맞힌다. 볼넷과 **다른 사건**이라 타수가 아니고
    //   출루율 분모에 들어가며 투수 기록에도 따로 남는다.
    if result_code == PitchResultCode::Ball {
        let cmd_mod = 1.0 - (current_pitcher.command - 50.0) * T::HIT_BY_PITCH_COMMAND_SPAN;
        let p = T::HIT_BY_PITCH_PER_BALL * clamp(cmd_mod, 0.35, 1.8);
        if rng.gen::<f64>() < p { result_code = PitchResultCode::HitByPitch; }
    }

    let mut fielding_result: Option<FieldingResult> = None;
    if let Some(ref ball) = ball_in_play {
        if result_code == PitchResultCode::InplayOut {
            let (fr, adj_code) = resolve_fielding_result(ball, &pre_state.fielders, rng);
            fielding_result = Some(fr);
            result_code = adj_code;
        }
    }

    // ── 4. 카운트/아웃/주자/득점 업데이트 ────────────────────────────────────
    let mut next_count   = pre_state.count.clone();
    let mut next_outs    = pre_state.outs;
    let mut next_runners = pre_state.runners.clone();
    let mut next_score   = pre_state.score.clone();
    let mut next_inning_scores = pre_state.inning_scores.clone();
    let mut next_inning  = pre_state.inning;
    let mut next_half    = pre_state.half;
    let mut running_logs: Vec<String> = vec![];

    let add_runs = |runs: i32, score: &mut MatchScore, inning_scores: &mut InningScores, half: HalfInning, inning: u8| {
        if runs <= 0 { return; }
        let team = half == HalfInning::Top;  // top = away batting
        let idx = (inning as usize).saturating_sub(1).min(inning_scores.home.len().saturating_sub(1));
        if team { score.away += runs; if idx < inning_scores.away.len() { inning_scores.away[idx] += runs; } }
        else    { score.home += runs; if idx < inning_scores.home.len() { inning_scores.home[idx] += runs; } }
    };

    // 이 투구로 늘어난 아웃 수 — 아래 3아웃 전환이 `next_outs`를 0으로 되돌리므로
    // **되돌리기 전에** 재야 한다
    let outs_before_play = next_outs;
    // 이 투구로 홈을 밟은 사람들. 아래 타자 기록에서 R로 붙인다
    let mut scored_ids: Vec<String> = Vec::new();

    match result_code {
        PitchResultCode::Ball => {
            next_count.balls += 1;
            if next_count.balls >= 4 {
                result_code = PitchResultCode::Walk;
                next_count  = MatchCount { balls: 0, strikes: 0 };
                let new_runner = create_runner(&current_batter);
                let (wr, wr_runs) = advance_on_walk(next_runners, new_runner, &mut scored_ids);
                next_runners = wr;
                add_runs(wr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            }
        }
        PitchResultCode::SacBunt => {
            next_outs += 1;
            next_count = MatchCount { balls: 0, strikes: 0 };
            // 주자를 **뒤에서부터** 한 칸씩 민다 — 앞 베이스가 비어 있을 때만.
            // ⚠ 3루 주자는 홈으로 안 보낸다. 그건 스퀴즈고 다른 작전이다.
            // ⚠ 만루면 아무도 못 간다(타자만 아웃) — 드물지만 그게 맞다.
            let mut b1 = next_runners.first.take();
            let mut b2 = next_runners.second.take();
            let mut b3 = next_runners.third.take();
            if b3.is_none() { b3 = b2.take(); }
            if b2.is_none() { b2 = b1.take(); }
            next_runners = MatchRunners { first: b1, second: b2, third: b3 };
        }
        PitchResultCode::HitByPitch => {
            // 볼넷과 **같은 진루**다 — 밀어내기까지 같다. 기록만 다르다
            next_count = MatchCount { balls: 0, strikes: 0 };
            let new_runner = create_runner(&current_batter);
            let (wr, wr_runs) = advance_on_walk(next_runners, new_runner, &mut scored_ids);
            next_runners = wr;
            add_runs(wr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
        }
        PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing => {
            next_count.strikes += 1;
            if next_count.strikes >= 3 {
                next_outs += 1;
                next_count = MatchCount { balls: 0, strikes: 0 };
                // 🔴 **3스트라이크째면 삼진으로 좁힌다** — `narrow_inplay_out`과 같은 방식.
                //   예전엔 여기서 코드를 안 바꿔서 화면이 "루킹"이라고만 했고,
                //   **타자가 물러난 것**을 말할 방법이 없었다.
                result_code = if result_code == PitchResultCode::StrikeLook {
                    PitchResultCode::StrikeoutLook
                } else {
                    PitchResultCode::StrikeoutSwing
                };
            }
        }
        PitchResultCode::Foul => {
            if next_count.strikes < 2 { next_count.strikes += 1; }
        }
        PitchResultCode::InplayOut => {
            next_outs += 1;
            next_count = MatchCount { balls: 0, strikes: 0 };
            let (is_dp, dp_runners) = try_double_play(ball_in_play.as_ref(), &next_runners, pre_state.outs, rng);
            if is_dp { next_outs += 1; next_runners = dp_runners; }
            // 여기서야 타구 종류와 병살 여부가 다 정해진다 — 이제 코드를 좁힌다
            result_code = narrow_inplay_out(ball_in_play.as_ref(), is_dp);

            // 🔴 **희생플라이** (2026-08-28). 3루 주자가 뜬공에 홈으로 들어온다.
            //   ⚠ `npc_sim`엔 이 갈래가 **이미 있었다**(0.10) — 주인공 경기만
            //     없어서 **두 엔진이 다른 야구를 하고 있었다.**
            //   ⚠ 2아웃이면 안 된다 — 뜬공 아웃으로 이닝이 끝난다.
            if result_code == PitchResultCode::FlyOut
                && pre_state.outs < 2
                && next_runners.third.is_some()
                && rng.gen::<f64>() < T::SAC_FLY_PROB
            {
                if let Some(r) = next_runners.third.take() {
                    if let Some(id) = r.player_id.clone() { scored_ids.push(id); }
                }
                add_runs(1, &mut next_score, &mut next_inning_scores, next_half, next_inning);
                result_code = PitchResultCode::SacFly;
            }
        }
        PitchResultCode::FieldingError => {
            next_count = MatchCount { balls: 0, strikes: 0 };
            let new_runner = create_runner(&current_batter);
            let (hr, hr_runs, hr_extra, hr_logs) = advance_on_hit(next_runners, PitchResultCode::HitSingle, new_runner, rng, &mut scored_ids);
            next_runners = hr;
            add_runs(hr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            next_outs += hr_extra as u8;
            running_logs.extend(hr_logs);
            let fielder_name = fielding_result.as_ref().map(|f| f.fielder.name.clone()).unwrap_or_default();
            running_logs.push(format!("실책! ({})", fielder_name));
        }
        _ if is_inplay(result_code) => {
            let new_runner = create_runner(&current_batter);
            let (hr, hr_runs, hr_extra, hr_logs) = advance_on_hit(next_runners, result_code, new_runner, rng, &mut scored_ids);
            next_runners = hr;
            add_runs(hr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            next_outs += hr_extra as u8;
            next_count = MatchCount { balls: 0, strikes: 0 };
            running_logs.extend(hr_logs);
        }
        _ => {}
    }

    let outs_added_this_play = next_outs.saturating_sub(outs_before_play) as u32;
    // 이 투구로 들어온 점수 — 아웃과 같은 방식으로 잰다
    let runs_added_this_play = ((next_score.home - pre_state.score.home)
        + (next_score.away - pre_state.score.away)).max(0) as u32;

    // 수비 스탯 업데이트
    let mut next_defense_stat = pre_state.defense_stat.clone();
    if let Some(ref fr) = fielding_result {
        if fr.is_error { next_defense_stat.errors += 1; }
        else if fr.throw_result.as_deref() == Some("out") {
            next_defense_stat.throw_outs += 1; next_defense_stat.assists += 1;
        } else if fr.throw_result.as_deref() == Some("safe") {
            next_defense_stat.throw_safes += 1;
        }
    }

    // 콜드게임: 3아웃 전환 전에 판정해야 half=Bottom 조건이 살아있음
    let cold_game_inning_end = next_outs >= 3
        && next_half == HalfInning::Bottom
        && { let d = (next_score.home - next_score.away).unsigned_abs() as u8;
             (next_inning >= 5 && d >= 10) || (next_inning >= 7 && d >= 7) };
    let cold_game_completed_inning = next_inning as u8;

    // 3아웃 → half 전환
    if next_outs >= 3 {
        next_outs    = 0;
        next_count   = MatchCount { balls: 0, strikes: 0 };
        next_runners = MatchRunners { first: None, second: None, third: None };
        if next_half == HalfInning::Top { next_half = HalfInning::Bottom; }
        else { next_half = HalfInning::Top; next_inning += 1; }
    }

    // ── 5. 스태미나/멘탈 업데이트 ────────────────────────────────────────────
    let stamina_cost = T::STAMINA_BASE
        + if decision.strategy == PitchStrategy::Aggressive { T::STAMINA_AGGRESSIVE_BONUS } else { 0.0 }
        + if decision.pitch_type == PitchType::Fastball { T::STAMINA_FASTBALL_BONUS } else { 0.0 }
        + T::stamina_power_cost(decision.power);
    let stamina_cap_factor = 1.0 - clamp((current_pitcher.stamina_cap - 55.0) * 0.005, -0.15, 0.15);
    let fatigue_mult = if current_stamina < 40.0 { 1.0 + (40.0 - current_stamina) * 0.025 } else { 1.0 };
    let stamina_loss = stamina_cost * stamina_cap_factor * fatigue_mult;

    let mental_resil_factor = 1.0 - clamp((current_pitcher.mental_resil - 50.0) * 0.004, -0.15, 0.15);
    let raw_mental_delta = resolve_mental_delta(result_code) * mental_resil_factor;
    let inning_changed = next_outs == 0 && pre_state.outs > 0;
    let mental_delta = raw_mental_delta + if inning_changed { T::MENTAL_RECOVERY_INNING_END } else { 0.0 };

    let next_stamina_val = round1(clamp(current_stamina - stamina_loss, 0.0, 100.0));
    let next_mental_val  = round1(clamp(current_mental  + mental_delta, 0.0, 100.0));

    let mut next_protagonist_stamina = pre_state.protagonist_stamina;
    let mut next_protagonist_mental  = pre_state.protagonist_mental;
    let mut next_npc_stamina  = pre_state.npc_pitcher_stamina.clone();
    let mut next_npc_mental   = pre_state.npc_pitcher_mental.clone();
    let mut next_npc_pc       = pre_state.npc_pitcher_pitch_count.clone();

    if is_protagonist && is_protagonist_actively_pitching(&pre_state) {
        next_protagonist_stamina = next_stamina_val;
        next_protagonist_mental  = next_mental_val;
    } else if is_our_team_fielding(&pre_state) {
        next_npc_stamina.my    = next_stamina_val;
        next_npc_mental.my     = next_mental_val;
        next_npc_pc.my         = pre_state.npc_pitcher_pitch_count.my + 1.0;
    } else {
        next_npc_stamina.opponent  = next_stamina_val;
        next_npc_mental.opponent   = next_mental_val;
        next_npc_pc.opponent       = pre_state.npc_pitcher_pitch_count.opponent + 1.0;
    }

    // ── 6. 타자 교체 ─────────────────────────────────────────────────────────
    let is_k_out = matches!(result_code, PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing) && pre_state.count.strikes == 2;
    let ab_ended = is_k_out || is_ab_terminal(result_code);

    let mut next_home_idx = pre_state.home_lineup_index;
    let mut next_away_idx = pre_state.away_lineup_index;
    if ab_ended {
        if pre_state.half == HalfInning::Top {
            let len = pre_state.away_lineup.len().max(1);
            next_away_idx = (pre_state.away_lineup_index + 1) % len;
        } else {
            let len = pre_state.home_lineup.len().max(1);
            next_home_idx = (pre_state.home_lineup_index + 1) % len;
        }
    }

    let mut next_last_types = pre_state.last_pitch_types.clone();
    next_last_types.push(decision.pitch_type);
    if next_last_types.len() > 5 { next_last_types.remove(0); }

    let is_protagonist_active = is_protagonist && is_protagonist_actively_pitching(&pre_state);
    let next_pc_since_entry = if is_protagonist_active {
        pre_state.pitch_count_since_entry + 1
    } else { pre_state.pitch_count_since_entry };

    let is_hit = matches!(result_code, PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun);
    // ⚠ **아웃을 "있었다/없었다"로 세면 안 된다.** 병살타는 한 타석에 아웃이
    // 둘이고, 안타 때 주루사(`hr_extra`)도 아웃이다. 예전엔 불리언이라
    // 그 아웃들이 주인공 이닝에 안 잡혔고 `ip = outs/3`이 작아져
    // **9이닝당 피안타·ERA가 그대로 부풀었다.**
    let next_k_since_entry    = pre_state.k_since_entry    + if is_protagonist_active && is_k_out { 1 } else { 0 };
    let next_h_since_entry    = pre_state.h_since_entry    + if is_protagonist_active && is_hit { 1 } else { 0 };
    let next_bb_since_entry   = pre_state.bb_since_entry   + if is_protagonist_active && result_code == PitchResultCode::Walk { 1 } else { 0 };
    let next_outs_since_entry = pre_state.outs_since_entry
        + if is_protagonist_active { outs_added_this_play } else { 0 };
    let next_er_since_entry = pre_state.er_since_entry
        + if is_protagonist_active { runs_added_this_play } else { 0 };

    // ── 6b. 타자 스탯 누적 ────────────────────────────────────────────────────
    let mut next_batter_accum = pre_state.batter_accum.clone();
    if ab_ended {
        if let Some(ref batter_id) = current_batter.id {
            let is_bb = result_code == PitchResultCode::Walk;
            let batting_runs = if pre_state.half == HalfInning::Top {
                (next_score.away - pre_state.score.away).max(0) as u32
            } else {
                (next_score.home - pre_state.score.home).max(0) as u32
            };
            let accum = next_batter_accum.entry(batter_id.clone()).or_default();
            accum.pa += 1;
            if !is_bb { accum.ab += 1; }
            if is_hit { accum.h += 1; }
            if result_code == PitchResultCode::HomeRun { accum.hr += 1; }
            if is_bb { accum.bb += 1; }
            if is_k_out { accum.k += 1; }
            accum.rbi += batting_runs;
        }
    }

    // ── 7. 로그 조합 ─────────────────────────────────────────────────────────
    //
    // ⚠ **두 종류를 섞지 않는다.** `build_pitch_log`은
    // `[6회초] fastball (0.50,0.50) balanced/normal -> GROUND_OUT (Q:45.2)` 같은
    // 개발자용 한 줄이고, 나머지(도루·주루·실책)는 사람이 읽는 문장이다.
    // 예전엔 둘이 한 배열에 섞여 `state.logs`로만 나갔고, 그래서 화면이
    // **주루·실책을 받을 방법이 없었다** — 받으면 디버그 줄까지 같이 왔다.
    let pitch_log = build_pitch_log(&pre_state, decision, lr.landing, result_code, quality);
    let narrative_logs: Vec<String> = steal_logs.into_iter()
        .chain(lr.miss_log.into_iter())
        .chain(running_logs.into_iter())
        .collect();
    let all_new_logs: Vec<String> = std::iter::once(pitch_log)
        .chain(narrative_logs.iter().cloned())
        .collect();

    // ── 8. 애니메이션 큐 ─────────────────────────────────────────────────────
    let animation_cues = build_animation_cues(
        decision, result_code,
        ball_in_play.as_ref(), fielding_result.as_ref(), &pre_state.runners,
    );

    let mut next_state = MatchState {
        inning: next_inning, half: next_half, outs: next_outs, count: next_count,
        runners: next_runners, score: next_score, inning_scores: next_inning_scores,
        pitch_count: state.pitch_count + 1,
        protagonist_stamina: next_protagonist_stamina, protagonist_mental: next_protagonist_mental,
        npc_pitcher_stamina: next_npc_stamina, npc_pitcher_mental: next_npc_mental,
        npc_pitcher_pitch_count: next_npc_pc,
        pitch_count_since_entry: next_pc_since_entry,
        k_since_entry: next_k_since_entry,
        h_since_entry: next_h_since_entry,
        bb_since_entry: next_bb_since_entry,
        outs_since_entry: next_outs_since_entry,
        er_since_entry: next_er_since_entry,
        home_lineup_index: next_home_idx, away_lineup_index: next_away_idx,
        last_pitch_types: next_last_types,
        defense_stat: next_defense_stat,
        batter_accum: next_batter_accum,
        // 한 구를 던져도 씨앗은 그대로 이어진다 — 갱신은 진입부가 한다
        rng_seed: state.rng_seed,
        logs: {
            let mut l = state.logs.clone();
            l.extend(all_new_logs);
            l
        },
        ..pre_state
    };

    if cold_game_inning_end {
        let diff = (next_state.score.home - next_state.score.away).unsigned_abs();
        let fl = format!("콜드게임 ({}회 종료, {}점차)", cold_game_completed_inning, diff);
        next_state.is_finished = true;
        next_state.logs.push(fl);
    } else if should_auto_finish(&next_state) {
        let fl = finish_log(&next_state);
        next_state.is_finished = true;
        next_state.logs.push(fl);
    }

    // ── C-1: 투수 큐 — 아웃 누적 후 한계를 넘으면 교체 ────────────────────
    //
    // ⚠ **3아웃 전환이 `next_outs`를 0으로 되돌리므로 증가분은 `outs_before_play`와
    // 비교해 얻는다.** 그리고 **주인공이 던지는 동안은 큐를 안 건드린다** —
    // 주인공 교체는 별도 경로(`protagonist_exits_game`)다.
    {
        // outs는 u8이라 i32로 올려 뺀다 (3아웃 전환이 0으로 되돌린 경우 포함)
        let delta: i32 = if next_outs >= outs_before_play { (next_outs - outs_before_play) as i32 }
                         else { (3 - outs_before_play) as i32 };
        let ours = is_our_team_fielding(&next_state);
        let protagonist_on_mound = ours && next_state.protagonist_has_entered && !next_state.protagonist_exited;
        if delta > 0 && !protagonist_on_mound {
            if ours { next_state.my_queue.outs_by_current += delta; }
            else    { next_state.opponent_queue.outs_by_current += delta; }
        }

        // ── C-2: 투수별 기록 누적 ────────────────────────────────────────
        //
        // ⚠ 지금 엔진은 주인공 것만 쌓는다(`k_since_entry` 등). 교체된 투수들의
        // 성적이 안 남아서 통합하면 **리그 순위표가 통째로 빈다.**
        // `sim_game`의 `PitAccum`과 같은 항목을 큐 안에 쌓는다.
        if !protagonist_on_mound {
            let cnt_reset = next_state.count.strikes == 0 && next_state.count.balls == 0;
            let scored = (next_state.score.home + next_state.score.away)
                - (state.score.home + state.score.away);
            let q = if ours { &mut next_state.my_queue } else { &mut next_state.opponent_queue };
            let idx = q.current;
            if let Some(line) = q.lines.get_mut(idx) {
                line.outs += delta;
                line.pc += 1;
                match result_code {
                    PitchResultCode::StrikeSwing | PitchResultCode::StrikeLook
                        if cnt_reset => line.k += 1,
                    PitchResultCode::Walk => line.bb += 1,
                    // 사구는 볼넷과 **다른 사건**이다 — 따로 센다
                    PitchResultCode::HitByPitch => line.hbp += 1,
                    PitchResultCode::HitSingle | PitchResultCode::HitDouble
                    | PitchResultCode::HitTriple => line.h += 1,
                    // 피홈런도 안타다 — 그 위에 하나 더 센다
                    PitchResultCode::HomeRun => { line.h += 1; line.hr += 1; }
                    _ => {}
                }
                // 자책점 — 이번 투구로 늘어난 점수를 현재 투수 앞으로 단다
                // (실책 실점 구분은 sim_game도 안 한다 — 같은 수준으로 맞춘다)
                if scored > 0 { line.er += scored; }
            }
        }

        // ── C-3: 타자 기록 ────────────────────────────────────────────────
        //
        // ⚠ **투수만 쌓으면 순위표의 절반이 빈다** — 타율·홈런·타점왕이 안 나오고
        // 팀 득점도 선수별로 안 갈린다. 타석이 끝나는 결과에서만 센다
        // (파울·볼·헛스윙은 타석이 안 끝나므로 제외).
        {
            let is_top = state.half == HalfInning::Top;
            let idx = if is_top { state.away_lineup_index } else { state.home_lineup_index };
            let scored = (next_state.score.home + next_state.score.away)
                - (state.score.home + state.score.away);
            let lines = if is_top { &mut next_state.away_bat_lines } else { &mut next_state.home_bat_lines };
            if let Some(b) = lines.get_mut(idx) {
                use PitchResultCode::*;
                match result_code {
                    Walk => { b.bb += 1; }
                    // 🔴 **셋 다 타수가 아니다.** 여기서 `ab`를 올리면 타율이
                    //    희생타 때문에 떨어진다 — 야구 규칙과 다르다.
                    HitByPitch => { b.hbp += 1; }
                    SacBunt    => { b.sac += 1; }
                    SacFly     => { b.sf  += 1; }
                    HitSingle => { b.ab += 1; b.h += 1; }
                    // 🔴 **장타를 갈라 센다.** 엔진은 처음부터 2루타·3루타를
                    //    따로 만드는데 `h` 하나로 뭉개서, SLG가
                    //    `(h + hr*3)/ab`라는 근사가 됐다(장타를 단타로 셌다).
                    HitDouble => { b.ab += 1; b.h += 1; b.b2 += 1; }
                    HitTriple => { b.ab += 1; b.h += 1; b.b3 += 1; }
                    HomeRun => { b.ab += 1; b.h += 1; b.hr += 1; }
                    // 삼진은 카운트가 리셋됐을 때만 (타석 종료)
                    StrikeSwing | StrikeLook if next_state.count.strikes == 0 && next_state.count.balls == 0 => {
                        b.ab += 1; b.k += 1;
                    }
                    InplayOut | GroundOut | FlyOut | LineOut | DoublePlay | FieldingError => { b.ab += 1; }
                    _ => {}
                }
                if scored > 0 { b.rbi += scored; }
            }
            // 🔴 **득점(R)은 홈을 밟은 사람 것이다** — 타점과 다르다.
            //    `RunnerStats`에 신원이 없어 못 붙이고 있었다(배경 리그는
            //    진작 lineup 인덱스를 들고 다녔다 — 주인공 경기만 빠져 있었다).
            // ⚠ 공격 중인 쪽 라인에서만 찾는다 — 수비 쪽에 같은 id가 있을 리 없지만
            //   대타·교체로 라인이 길어져도 값이 새지 않게 한 쪽만 본다.
            for id in scored_ids.iter() {
                if let Some(sb) = lines.iter_mut().find(|x| &x.player_id == id) { sb.r += 1; }
            }
        }

        if !protagonist_on_mound { switch_pitcher_if_needed(&mut next_state, ours); }
    }

    let outcome = PitchOutcome {
        result_code, quality, comment: get_result_comment(result_code).to_string(),
        ball_in_play, fielding_result, animation_cues, landing_target: lr.landing,
    };

    // 경기 중 부상 체크 (주인공 등판 중, 투구 80구↑, 스태미나 저하 시)
    let mid_game_injury = if is_protagonist && next_state.protagonist_has_entered && !next_state.protagonist_exited {
        check_mid_game_injury(next_state.pitch_count_since_entry, next_state.protagonist_stamina, rng)
    } else {
        None
    };

    MatchStepResult { next_state, outcome, mid_game_injury, narrative_logs }
}

fn check_mid_game_injury(pitch_count: u32, stamina: f64, rng: &mut impl Rng) -> Option<crate::types::MidGameInjury> {
    if pitch_count < 80 || stamina >= 20.0 { return None; }

    let per_pitch_chance = if stamina < 5.0 { 0.012 }
        else if stamina < 10.0 { 0.006 }
        else { 0.003 };

    if rng.gen::<f64>() >= per_pitch_chance { return None; }

    let tier_roll: f64 = rng.gen();
    let (severity, injury_type) = if stamina < 5.0 && tier_roll < 0.05 {
        ("severe", "UCL_PARTIAL")
    } else if tier_roll < 0.35 {
        ("moderate", if rng.gen::<f64>() < 0.6 { "ELBOW_INFLAM" } else { "SHOULDER_INFLAM" })
    } else {
        ("light", if rng.gen::<f64>() < 0.5 { "ARM_FATIGUE" } else { "MUSCLE_TIGHTNESS" })
    };

    Some(crate::types::MidGameInjury {
        injury_type: injury_type.to_string(),
        severity: severity.to_string(),
    })
}

// ── 공개 오케스트레이션 함수 ─────────────────────────────────────────────────

pub fn finish_match(state: &MatchState) -> FinishMatchResult {
    let batter_lines: Vec<BatterLine> = state.batter_accum.iter().map(|(id, a)| BatterLine {
        player_id: id.clone(), pa: a.pa, ab: a.ab, h: a.h, hr: a.hr, rbi: a.rbi, bb: a.bb, k: a.k,
    }).collect();

    if state.is_finished {
        return FinishMatchResult {
            next_state: state.clone(),
            summary: build_summary(state),
            batter_lines,
            // ⚠ 리그 경기와 **같은 함수**로 만든다 — 두 벌이 되면 주인공만
            //   다른 기록을 갖는다
            player_lines: collect_player_lines(state),
            protagonist_entered: state.protagonist_has_entered,
        };
    }
    let mut next = state.clone();
    next.is_finished = true;
    next.logs.push("경기 종료".to_string());
    let summary = build_summary(&next);
    let player_lines = collect_player_lines(&next);
    FinishMatchResult { next_state: next, summary, batter_lines, player_lines,
                        protagonist_entered: state.protagonist_has_entered }
}

pub fn advance_game_phase(state: &MatchState, rng: &mut impl Rng) -> GamePhaseResult {
    if state.is_finished {
        return GamePhaseResult::GameOver { state: state.clone(), summary: build_summary(state) };
    }
    if !state.protagonist_has_entered {
        if should_protagonist_enter(state) {
            return GamePhaseResult::ProtagonistEntry { state: protagonist_enters_mid_inning(state) };
        }
        return GamePhaseResult::PreEntrySim;
    }
    if state.protagonist_exited {
        return GamePhaseResult::PostExitSim;
    }
    let exit = should_protagonist_exit(state);
    if exit.should_exit {
        if let Some(reason) = exit.reason {
            return GamePhaseResult::ProtagonistExit {
                reason,
                state: protagonist_exits_game(state, reason),
            };
        }
    }
    if is_protagonist_actively_pitching(state) {
        return GamePhaseResult::ProtagonistPitch;
    }
    let result = auto_simulate_half_inning(state, rng);
    GamePhaseResult::AutoBatting { result }
}

pub fn auto_simulate_half_inning(state: &MatchState, rng: &mut impl Rng) -> HalfInningSimResult {
    let start_half   = state.half;
    let start_inning = state.inning;
    let mut s = state.clone();
    let mut runs = 0i32; let mut hits = 0i32; let mut walks = 0i32; let mut strikeouts = 0i32;
    let mut logs: Vec<String> = vec![];
    let mut at_bats: Vec<AtBatLog> = vec![];
    let mut safety = 300i32;

    let mut ab_pitch_count = 0u32;
    let batting_team_is_away = start_half == HalfInning::Top;
    let mut ab_start_score = if batting_team_is_away { s.score.away } else { s.score.home };

    while !s.is_finished && safety > 0 {
        safety -= 1;
        if s.half != start_half || s.inning != start_inning { break; }

        let prev_strikes = s.count.strikes;
        let prev_score   = s.score.clone();
        let pitcher      = get_active_pitcher(&s).clone();
        let batter       = get_current_batter(&s, rng);
        let decision     = auto_pick_decision(&s, rng);
        let step         = step_pitch_core(&s, &decision, false, rng);
        let code         = step.outcome.result_code;
        let scored = if batting_team_is_away {
            step.next_state.score.away - prev_score.away
        } else {
            step.next_state.score.home - prev_score.home
        };

        runs += scored;
        ab_pitch_count += 1;

        if matches!(code, PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun) { hits += 1; }
        if code == PitchResultCode::Walk { walks += 1; }
        let is_k_out = matches!(code, PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing) && prev_strikes == 2;
        if is_k_out { strikeouts += 1; }

        if is_k_out || is_ab_terminal(code) {
            let cur_score = if batting_team_is_away { step.next_state.score.away } else { step.next_state.score.home };
            let runs_this_ab = (cur_score - ab_start_score).max(0);
            at_bats.push(AtBatLog {
                pitcher_name: pitcher.name.clone().unwrap_or_else(|| "투수".to_string()),
                batter_name:  batter.name.clone().unwrap_or_else(|| "타자".to_string()),
                result_code: code,
                pitch_count: ab_pitch_count,
                runs_scored: runs_this_ab,
            });
            ab_pitch_count = 0;
            ab_start_score = cur_score;
        }

        let new_logs = step.next_state.logs[s.logs.len()..].to_vec();
        logs.extend(new_logs);
        s = step.next_state;
    }

    HalfInningSimResult { next_state: s, runs, hits, walks, strikeouts, logs, at_bats }
}

pub fn auto_simulate_until_entry(state: &MatchState, rng: &mut impl Rng) -> MatchState {
    let mut s = state.clone();
    let mut safety = 5000i32;
    let mut last_inning = s.inning;

    while !s.is_finished && !s.protagonist_has_entered && safety > 0 {
        safety -= 1;
        if should_protagonist_enter(&s) {
            s = protagonist_enters_mid_inning(&s);
            break;
        }
        let decision = auto_pick_decision(&s, rng);
        s = step_pitch_core(&s, &decision, false, rng).next_state;

        if s.inning != last_inning {
            let idx = (last_inning as usize).saturating_sub(1);
            let h = s.inning_scores.home.get(idx).copied().unwrap_or(0);
            let a = s.inning_scores.away.get(idx).copied().unwrap_or(0);
            s.pre_entry_logs.push(format!(
                "{}회 종료 — 홈 {}점 / 원정 {}점 (누계 홈 {} : 원정 {})",
                last_inning, h, a, s.score.home, s.score.away
            ));
            last_inning = s.inning;
        }
    }
    s
}

pub fn auto_simulate_to_game_end(state: &MatchState, rng: &mut impl Rng) -> MatchState {
    let mut s = state.clone();
    let mut safety = 5000i32;

    while !s.is_finished && safety > 0 {
        safety -= 1;

        // ⚠ **주인공 교체 판정** (사용자 확정 2026-08-12: 주인공도 교체한다).
        //
        // 예전엔 이 루프가 `should_protagonist_exit`을 한 번도 안 불렀다 —
        // 교체 판정이 `advance_game_phase`에만 있어서 자동 완주는 안 지났다.
        // 그래서 투구수 상한을 90/75/65로 훑어도 주인공 이닝이 526/525/540으로
        // 안 줄었다. **임계값이 아니라 판정 자체가 안 돌았다.**
        //
        // NPC 교체(`switch_pitcher_if_needed`)는 `step_pitch_core` 안에 이미 있다.
        if is_protagonist_actively_pitching(&s) {
            let exit = should_protagonist_exit(&s);
            if exit.should_exit {
                if let Some(reason) = exit.reason { s = protagonist_exits_game(&s, reason); }
            }
        }

        let decision = auto_pick_decision(&s, rng);
        let protagonist_pitching = is_protagonist_actively_pitching(&s);
        s = step_pitch_core(&s, &decision, protagonist_pitching, rng).next_state;
    }
    if !s.is_finished {
        s.is_finished = true;
        s.logs.push("경기 종료".to_string());
    }
    s
}

pub fn run_simple_game(params: &RunSimpleGameParams, rng: &mut impl Rng) -> GameSummary {
    let pitcher_opts = params.pitcher.clone().unwrap_or_default();
    let protagonist_ovr = params.protagonist_ovr.unwrap_or(62.0);
    let opponent_ovr    = params.opponent_ovr;

    let opts = MatchStartOptions {
        protagonist_pitcher: Some(pitcher_opts),
        batter_mean: Some(opponent_ovr),
        role: Some(PitcherRole::SP),
        ..Default::default()
    };
    let mut state = create_initial_match_state(&opts, rng);
    let mut strikeouts = 0i32; let mut hits = 0i32; let mut walks = 0i32;
    let mut at_bat_logs: Vec<crate::types::AtBatLog> = vec![];
    let mut safety = 800i32;

    while !state.is_finished && safety > 0 {
        safety -= 1;
        let prev_strikes = state.count.strikes;
        let decision = if is_protagonist_pitching(&state) {
            random_decision_for_sim(state.count.balls, state.count.strikes, rng)
        } else { auto_pick_decision(&state, rng) };
        let step = step_pitch_core(&state, &decision, is_protagonist_pitching(&state), rng);
        let code = step.outcome.result_code;
        if matches!(code, PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing) && prev_strikes == 2 { strikeouts += 1; }
        if matches!(code, PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun) { hits += 1; }
        if code == PitchResultCode::Walk { walks += 1; }
        state = step.next_state;

        if !state.is_finished && !is_protagonist_pitching(&state) {
            let sim = auto_simulate_half_inning(&state, rng);
            at_bat_logs.extend(sim.at_bats);
            state = sim.next_state;
        }
    }

    let runs_allowed = state.score.away;
    let offense_base = 3.0 + (protagonist_ovr - opponent_ovr) * 0.05;
    let noise = (rng.gen::<f64>() + rng.gen::<f64>() + rng.gen::<f64>() - 1.5) * 2.0;
    let mut home_score = (offense_base + noise).max(0.0).round() as i32;
    let mut away_score = runs_allowed;
    if home_score == away_score { if home_score > 0 { home_score -= 1; } else { away_score += 1; } }

    let finish_note = state.logs.last().cloned().unwrap_or_default();
    let summary = if finish_note.contains("콜드게임") { finish_note } else { String::new() };

    GameSummary { home_score, away_score, strikeouts, hits, walks, at_bat_logs, summary }
}

// ── C-3: SimGameResult 어댑터 ────────────────────────────────────────────────
//
// `match_engine` 결과를 `sim_game`의 반환 계약으로 바꾼다. **그 계약을 그대로
// 만족해야** 순위표·성적표·로테이션이 안 깨진다 — 리그 운영 코드 전체가
// `SimGameResult`를 전제로 짜여 있다.
//
// ⚠ 이건 **변환만** 한다. 값을 만들지 않는다. 누락이 있으면 여기서 0이 아니라
// 위(C-1·C-2)에서 안 쌓인 것이다.

/// 큐·타자 기록 → `player_lines`
fn collect_player_lines(state: &MatchState) -> Vec<crate::sim_types::PlayerGameLine> {
    use crate::sim_types::PlayerGameLine;
    let mut out = Vec::new();
    // 🔴 **`decision`이 빈 문자열이었다** (2026-08-28). "승패는 리그 쪽이
    //   정한다"고 적혀 있었는데 **리그 쪽이 안 채웠다.** 모든 리그가
    //   이 경로라서, 실측 투수 라인의 **77.3%가 빈 값**이었고 KBL·ABL·JBL·
    //   고교·대학·독립 **NPC 전원이 승·패·세이브·홀드 0**이었다.
    //
    // ⚠ 규칙은 `npc_sim::decide_pitcher`가 정본이다 — 여기서 다시 적지 않는다.
    let my_is_home = state.protagonist_side == "home";
    let margin = (state.score.home - state.score.away).abs();
    let is_draw = state.score.home == state.score.away;
    for (q, is_home) in [(&state.my_queue, my_is_home), (&state.opponent_queue, !my_is_home)] {
        let team_won = if is_home { state.score.home > state.score.away }
                       else       { state.score.away > state.score.home };
        // 큐 0번이 선발, 마지막이 마무리 — `build_pit_queue`와 같은 규약이다
        let starter_id = q.lines.first().map(|l| l.player_id.as_str());
        let closer_id  = q.pitchers.last().and_then(|p| p.name.as_deref());
        for l in &q.lines {
            if l.outs == 0 && l.pc == 0 { continue; }   // 안 던진 투수는 안 넣는다
            let is_starter = starter_id == Some(l.player_id.as_str());
            let is_closer  = closer_id  == Some(l.player_id.as_str()) && !is_starter;
            out.push(PlayerGameLine::Pitcher {
                player_id: l.player_id.clone(),
                ip: (l.outs as f64) / 3.0,
                er: l.er, h: l.h, hr: l.hr, k: l.k, bb: l.bb, hbp: l.hbp, pc: l.pc,
                // ⚠ 무승부면 아무도 승패를 안 진다 — TS 래퍼와 같은 규칙이다
                decision: if is_draw { "ND".to_string() }
                          else { crate::npc_sim::decide_pitcher(is_starter, is_closer, l.outs, team_won, margin) },
                gs: is_starter,
                risp_ab: l.risp_ab, risp_h: l.risp_h,
            });
        }
    }
    for lines in [&state.home_bat_lines, &state.away_bat_lines] {
        for b in lines {
            if b.ab == 0 && b.bb == 0 { continue; }     // 안 나온 타자는 안 넣는다
            out.push(PlayerGameLine::Batter {
                player_id: b.player_id.clone(),
                ab: b.ab, h: b.h, b2: b.b2, b3: b.b3, hr: b.hr,
                r: b.r, hbp: b.hbp, sac: b.sac, sf: b.sf, rbi: b.rbi,
                bb: b.bb, k: b.k, sb: b.sb,
                risp_ab: b.risp_ab, risp_h: b.risp_h,
            });
        }
    }
    out
}

/// 끝난 경기 → `MatchResult` (C-3)
pub fn to_match_result(state: &MatchState, home_team_id: &str, away_team_id: &str)
    -> crate::sim_types::MatchResult
{
    let home = state.score.home;
    let away = state.score.away;
    let (winner, loser) = if home >= away { (home_team_id, away_team_id) }
                          else            { (away_team_id, home_team_id) };
    crate::sim_types::MatchResult {
        home_score: home,
        away_score: away,
        winner_id: winner.to_string(),
        loser_id:  loser.to_string(),
        player_lines: collect_player_lines(state),
        events: vec![],
    }
}

/// 끝난 경기 → `SimGameResult` (C-3 완성)
///
/// 리그 운영 코드가 이 계약 전체를 쓴다 — `MatchResult`만으론 부족하다.
///   `next_*_rot_idx`      다음 경기 선발이 누구인지
///   `pitcher_conditions`  피로 누적. **안 넘기면 투수가 무한정 던진다**
///
/// ⚠ 피로 계수 `outs × 2.7`은 `npc_sim`과 **같은 값이다.** 다르면 한쪽
/// 리그만 투수가 빨리 지친다.
pub fn to_sim_game_result(
    state: &MatchState,
    home_team_id: &str,
    away_team_id: &str,
    week: i32,
    prev_conditions: &std::collections::HashMap<String, crate::sim_types::SimPlayerCondition>,
    home_rot_idx: usize,
    away_rot_idx: usize,
) -> crate::sim_types::SimGameResult {
    use crate::sim_types::{SimGameResult, SimPlayerCondition};
    let mut conds = std::collections::HashMap::new();

    // 주인공 쪽 큐가 홈인지 원정인지는 `protagonist_side`가 정한다
    let my_is_home = state.protagonist_side == "home";
    for (q, is_home) in [(&state.my_queue, my_is_home), (&state.opponent_queue, !my_is_home)] {
        let _ = is_home;
        for l in &q.lines {
            if l.outs == 0 && l.pc == 0 { continue; }
            let prev = prev_conditions.get(&l.player_id).map(|c| c.fatigue).unwrap_or(100.0);
            conds.insert(l.player_id.clone(), SimPlayerCondition {
                fatigue: (prev - l.outs as f64 * 2.7).clamp(0.0, 100.0),
                last_pitched_week: week,
                pitch_outs_last: l.outs,
            });
        }
    }

    // 로테이션은 **쓴 투수 수만큼** 민다 — 선발이 하나만 나갔으면 +1이다
    let used = |q: &crate::types::PitcherQueue| q.current + 1;
    let (home_used, away_used) = if my_is_home {
        (used(&state.my_queue), used(&state.opponent_queue))
    } else {
        (used(&state.opponent_queue), used(&state.my_queue))
    };

    SimGameResult {
        result: to_match_result(state, home_team_id, away_team_id),
        next_home_rot_idx: (home_rot_idx + home_used.min(1)) as i32,
        next_away_rot_idx: (away_rot_idx + away_used.min(1)) as i32,
        pitcher_conditions: conds,
    }
}
