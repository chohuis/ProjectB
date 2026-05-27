#![allow(clippy::too_many_arguments)]

use rand::Rng;
use std::collections::HashMap;
use std::f64::consts::PI;

use crate::types::*;
use crate::tuning as T;

// ── 유틸 ──────────────────────────────────────────────────────────────────────

fn clamp(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }
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

fn is_inplay(code: PitchResultCode) -> bool {
    matches!(code, PitchResultCode::InplayOut | PitchResultCode::FieldingError |
        PitchResultCode::HitSingle | PitchResultCode::HitDouble |
        PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

fn is_ab_terminal(code: PitchResultCode) -> bool {
    matches!(code, PitchResultCode::Walk | PitchResultCode::InplayOut |
        PitchResultCode::FieldingError | PitchResultCode::HitSingle |
        PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

// ── 초기 상태 생성 ────────────────────────────────────────────────────────────

pub fn build_pitcher(opts: &PartialPitcherStats, cmd: f64, vel: f64, sca: f64, mr: f64, ctl: f64, mvt: f64, clt: f64, hr: f64) -> PitcherStats {
    PitcherStats {
        name:        opts.name.clone(),
        command:     opts.command.unwrap_or(cmd),
        velocity:    opts.velocity.unwrap_or(vel),
        stamina_cap: opts.stamina_cap.unwrap_or(sca),
        mental_resil:opts.mental_resil.unwrap_or(mr),
        control:     opts.control.unwrap_or(ctl),
        movement:    opts.movement.unwrap_or(mvt),
        clutch:      opts.clutch.unwrap_or(clt),
        hold_runners:opts.hold_runners.unwrap_or(hr),
    }
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
        speed: r!(), base_instinct: r!(), fielding: r!(), arm: r!(),
    }
}

fn create_runner(batter: &BatterStats) -> RunnerStats {
    RunnerStats { speed: batter.speed, instinct: batter.base_instinct }
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
    let op_opts  = opts.opponent_pitcher.as_ref().cloned().unwrap_or_default();
    let npc_opts = opts.npc_starter_pitcher.as_ref().cloned().unwrap_or_default();

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
        protagonist_side,
        protagonist_pitcher, my_npc_pitcher, opponent_npc_pitcher,
        home_lineup, away_lineup,
        home_lineup_index: 0, away_lineup_index: 0,
        batter_mean,
        role, entry_trigger,
        protagonist_has_entered: is_immediate,
        protagonist_exited: false,
        pitch_count_since_entry: 0,
        k_since_entry: 0,
        h_since_entry: 0,
        bb_since_entry: 0,
        outs_since_entry: 0,
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
    round2(pitch_q - extra + chase_penalty)
}

fn resolve_contact(pitch_q: f64, contact_q: f64, batter: &BatterStats, rng: &mut impl Rng) -> PitchResultCode {
    use PitchResultCode::*;
    let roll = rng.gen::<f64>();
    let hit_bonus = clamp((60.0 - pitch_q) * 0.003 + (batter.power - 50.0) * 0.002, -0.12, 0.20);

    if contact_q >= 72.0 {
        if roll < 0.55 { StrikeSwing } else if roll < 0.80 { Foul } else if roll < 0.95 { InplayOut } else { HitSingle }
    } else if contact_q >= 60.0 {
        if roll < 0.30 { StrikeSwing } else if roll < 0.50 { Foul } else if roll < 0.75 { InplayOut } else { HitSingle }
    } else if contact_q >= 52.0 {
        if roll < 0.15 { StrikeSwing } else if roll < 0.30 { Foul } else if roll < 0.65 { InplayOut } else { HitSingle }
    } else if contact_q >= 45.0 {
        if roll < 0.08 { StrikeSwing }
        else if roll < 0.20 { Foul }
        else if roll < clamp(0.55 - hit_bonus, 0.32, 0.68) { InplayOut }
        else if roll < clamp(0.88 - hit_bonus * 0.5, 0.74, 0.94) { HitSingle }
        else { HitDouble }
    } else if contact_q >= 38.0 {
        if roll < 0.05 { StrikeSwing }
        else if roll < 0.14 { Foul }
        else if roll < clamp(0.35 - hit_bonus, 0.18, 0.48) { InplayOut }
        else if roll < clamp(0.72 - hit_bonus * 0.5, 0.56, 0.82) { HitSingle }
        else if roll < clamp(0.92 - hit_bonus * 0.3, 0.86, 0.96) { HitDouble }
        else { HitTriple }
    } else if contact_q >= 32.0 {
        if roll < 0.03 { StrikeSwing }
        else if roll < 0.10 { Foul }
        else if roll < clamp(0.25 - hit_bonus, 0.10, 0.36) { InplayOut }
        else if roll < clamp(0.58 - hit_bonus * 0.5, 0.44, 0.70) { HitSingle }
        else if roll < clamp(0.82 - hit_bonus * 0.3, 0.75, 0.90) { HitDouble }
        else if roll < clamp(0.95 + hit_bonus * 0.2, 0.92, 0.98) { HitTriple }
        else { HomeRun }
    } else {
        if roll < 0.05 { Foul }
        else if roll < clamp(0.15 - hit_bonus, 0.05, 0.24) { InplayOut }
        else if roll < clamp(0.48 - hit_bonus * 0.5, 0.36, 0.58) { HitSingle }
        else if roll < clamp(0.72 - hit_bonus * 0.3, 0.64, 0.80) { HitDouble }
        else if roll < clamp(0.87 + hit_bonus * 0.2, 0.83, 0.92) { HitTriple }
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
    let location_q = T::LOCATION_CENTER_PENALTY + dist * T::LOCATION_DISTANCE_SCALE;

    let command_bonus  = (pitcher.command  - 50.0) * 0.10;
    let velocity_bonus = if decision.pitch_type == PitchType::Fastball {
        (pitcher.velocity - 50.0) * 0.12
    } else {
        (pitcher.velocity - 50.0) * 0.03
    };
    let control_bonus  = (pitcher.control  - 50.0) * 0.06;
    let movement_bonus = if decision.pitch_type != PitchType::Fastball {
        (pitcher.movement - 50.0) * 0.08
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
    let random_noise    = rng.gen::<f64>() * 16.0 - 8.0;

    let weather_mod = T::weather_quality_modifier(state.weather, decision.pitch_type);
    let park_mod    = T::park_quality_modifier(state.park);
    let pattern_mod = pitch_pattern_modifier(decision.pitch_type, &state.last_pitch_types);
    let jam_mod     = jam_pressure_modifier(state, mental, batter.batting_clutch);
    let clutch_mod  = clutch_modifier(state, pitcher.clutch);

    round2(
        T::pitch_base(decision.pitch_type)
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

fn advance_on_walk(runners: MatchRunners, new_runner: RunnerStats) -> (MatchRunners, i32) {
    let mut runs = 0;
    let (mut first, mut second, mut third) = (runners.first, runners.second, runners.third);
    if first.is_some() {
        if second.is_some() {
            if third.is_some() { runs = 1; }
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

fn advance_on_hit(runners: MatchRunners, code: PitchResultCode, new_runner: RunnerStats, rng: &mut impl Rng)
    -> (MatchRunners, i32, i32, Vec<String>)
{
    let mut next = MatchRunners { first: None, second: None, third: None };
    let mut runs = 0i32; let mut extra_outs = 0i32; let mut logs = vec![];

    match code {
        PitchResultCode::HomeRun => {
            runs = 1 + runners.first.is_some() as i32
                     + runners.second.is_some() as i32
                     + runners.third.is_some() as i32;
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitTriple => {
            runs = runners.first.is_some() as i32
                 + runners.second.is_some() as i32
                 + runners.third.is_some() as i32;
            next.third = Some(new_runner);
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitDouble => {
            if runners.third.is_some()  { runs += 1; }
            if runners.second.is_some() { runs += 1; }
            if let Some(r) = runners.first {
                match try_extra_base(&r, "1st_scores_double", rng) {
                    "advance" => { runs += 1; logs.push(format!("적극 주루! 1루 주자 홈인 (스피드 {})", r.speed)); }
                    "out"     => { extra_outs += 1; logs.push(format!("주루 아웃! 1루 주자 홈 태그아웃 (스피드 {})", r.speed)); }
                    _         => { next.third = Some(r); }
                }
            }
            next.second = Some(new_runner);
            return (next, runs, extra_outs, logs);
        }
        PitchResultCode::HitSingle => {
            if runners.third.is_some() { runs += 1; }
            if let Some(r) = runners.second.clone() {
                match try_extra_base(&r, "2nd_scores_single", rng) {
                    "advance" => { runs += 1; logs.push(format!("적극 주루! 2루 주자 홈인 (스피드 {})", r.speed)); }
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
    let hold_factor = clamp(1.0 - (pitcher.hold_runners - 50.0) * 0.008, 0.4, 1.6);

    if first.is_some() && second.is_none() {
        let r = first.as_ref().unwrap().clone();
        let attempt_prob = clamp((r.speed - 40.0) * 0.008 * (r.instinct / 50.0) * hold_factor + manager_boost, 0.0, 0.30);
        if rng.gen::<f64>() < attempt_prob {
            let success = clamp(0.28 + (r.speed - 50.0) * 0.007, 0.15, 0.90);
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
        if third.is_none() && r.speed > 68.0 {
            let r = r.clone();
            let attempt_prob = clamp((r.speed - 58.0) * 0.006 * (r.instinct / 55.0) * hold_factor + manager_boost, 0.0, 0.16);
            if rng.gen::<f64>() < attempt_prob {
                let success = clamp(0.22 + (r.speed - 65.0) * 0.008, 0.10, 0.78);
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

fn try_double_play(runners: &MatchRunners, outs_before: u8, rng: &mut impl Rng) -> (bool, MatchRunners) {
    if outs_before >= 2 || runners.first.is_none() { return (false, runners.clone()); }
    let base_prob = T::DOUBLE_PLAY_BASE_PROB
        + if runners.second.is_some() { 0.05 } else { 0.0 }
        + if runners.third.is_some()  { 0.03 } else { 0.0 };
    if rng.gen::<f64>() >= base_prob { return (false, runners.clone()); }
    (true, MatchRunners { first: None, second: runners.second.clone(), third: runners.third.clone() })
}

// ── 보정 함수 ─────────────────────────────────────────────────────────────────

fn resolve_mental_delta(code: PitchResultCode) -> f64 {
    match code {
        PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing => 0.5,
        PitchResultCode::InplayOut   =>  0.8,
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
        PitchResultCode::Ball         => "볼",
        PitchResultCode::Foul         => "파울",
        PitchResultCode::InplayOut    => "타구 아웃",
        PitchResultCode::FieldingError=> "실책",
        PitchResultCode::Walk         => "볼넷",
        PitchResultCode::HitSingle    => "안타",
        PitchResultCode::HitDouble    => "2루타",
        PitchResultCode::HitTriple    => "3루타",
        PitchResultCode::HomeRun      => "홈런",
        PitchResultCode::GameOver     => "경기 종료",
    }
}

fn get_result_tone(code: PitchResultCode) -> &'static str {
    match code {
        PitchResultCode::StrikeSwing | PitchResultCode::StrikeLook | PitchResultCode::InplayOut => "good",
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
        PitchResultCode::Ball => "BALL", PitchResultCode::Foul => "FOUL",
        PitchResultCode::InplayOut => "INPLAY_OUT", PitchResultCode::FieldingError => "FIELDING_ERROR",
        PitchResultCode::Walk => "WALK", PitchResultCode::HitSingle => "HIT_SINGLE",
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

fn auto_pick_decision(state: &MatchState, rng: &mut impl Rng) -> PitchDecision {
    let (balls, strikes) = (state.count.balls, state.count.strikes);
    let (target, pitch_type, strategy);

    if balls >= 3 {
        target = XY { x: (rng.gen::<f64>() - 0.5) * 1.0, y: (rng.gen::<f64>() - 0.5) * 1.0 };
        pitch_type = PitchType::Fastball; strategy = PitchStrategy::Safe;
    } else if strikes == 2 {
        let sx = if rng.gen::<f64>() < 0.5 { -1.0 } else { 1.0 };
        let sy = if rng.gen::<f64>() < 0.5 { -1.0 } else { 1.0 };
        target = XY { x: sx * (0.55 + rng.gen::<f64>() * 0.40), y: sy * (0.55 + rng.gen::<f64>() * 0.40) };
        pitch_type = PitchType::Slider; strategy = PitchStrategy::Aggressive;
    } else {
        target = XY { x: (rng.gen::<f64>() - 0.5) * 1.6, y: (rng.gen::<f64>() - 0.5) * 1.6 };
        let types = [PitchType::Fastball, PitchType::Fastball, PitchType::Slider, PitchType::Changeup];
        pitch_type = types[rng.gen_range(0..types.len())];
        strategy = PitchStrategy::Balanced;
    }
    PitchDecision { pitch_type, location: target_to_zone(target), target: Some(target), strategy, power: PitchPower::Normal }
}

fn random_decision_for_sim(rng: &mut impl Rng) -> PitchDecision {
    let types    = [PitchType::Fastball, PitchType::Slider, PitchType::Curve, PitchType::Changeup];
    let strats   = [PitchStrategy::Aggressive, PitchStrategy::Balanced, PitchStrategy::Safe];
    let powers   = [PitchPower::Low, PitchPower::Normal, PitchPower::High];
    let target   = XY { x: (rng.gen::<f64>() - 0.5) * 2.2, y: (rng.gen::<f64>() - 0.5) * 2.2 };
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

    if pce  >= T::PROTAGONIST_PITCH_COUNT_HARD { return ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::PitchLimit) }; }
    if stam <= T::PROTAGONIST_STAMINA_EMERGENCY { return ProtagonistExitCheck { should_exit: true, reason: Some(ExitReason::Stamina) }; }

    let mut danger = 0.0;
    if pce >= T::PROTAGONIST_PITCH_COUNT_SOFT { danger += 20.0 + (pce - T::PROTAGONIST_PITCH_COUNT_SOFT) * 1.2; }
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
        apply_hit_upgrade(resolve_contact(quality, cq, &current_batter, rng), current_batter.power, pre_state.weather, rng)
    };

    let ball_in_play = resolve_ball_in_play(result_code, decision, quality, rng);

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

    match result_code {
        PitchResultCode::Ball => {
            next_count.balls += 1;
            if next_count.balls >= 4 {
                result_code = PitchResultCode::Walk;
                next_count  = MatchCount { balls: 0, strikes: 0 };
                let new_runner = create_runner(&current_batter);
                let (wr, wr_runs) = advance_on_walk(next_runners, new_runner);
                next_runners = wr;
                add_runs(wr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            }
        }
        PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing => {
            next_count.strikes += 1;
            if next_count.strikes >= 3 { next_outs += 1; next_count = MatchCount { balls: 0, strikes: 0 }; }
        }
        PitchResultCode::Foul => {
            if next_count.strikes < 2 { next_count.strikes += 1; }
        }
        PitchResultCode::InplayOut => {
            next_outs += 1;
            next_count = MatchCount { balls: 0, strikes: 0 };
            let (is_dp, dp_runners) = try_double_play(&next_runners, pre_state.outs, rng);
            if is_dp { next_outs += 1; next_runners = dp_runners; running_logs.push("병살타!".to_string()); }
        }
        PitchResultCode::FieldingError => {
            next_count = MatchCount { balls: 0, strikes: 0 };
            let new_runner = create_runner(&current_batter);
            let (hr, hr_runs, hr_extra, hr_logs) = advance_on_hit(next_runners, PitchResultCode::HitSingle, new_runner, rng);
            next_runners = hr;
            add_runs(hr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            next_outs += hr_extra as u8;
            running_logs.extend(hr_logs);
            let fielder_name = fielding_result.as_ref().map(|f| f.fielder.name.clone()).unwrap_or_default();
            running_logs.push(format!("실책! ({})", fielder_name));
        }
        _ if is_inplay(result_code) => {
            let new_runner = create_runner(&current_batter);
            let (hr, hr_runs, hr_extra, hr_logs) = advance_on_hit(next_runners, result_code, new_runner, rng);
            next_runners = hr;
            add_runs(hr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            next_outs += hr_extra as u8;
            next_count = MatchCount { balls: 0, strikes: 0 };
            running_logs.extend(hr_logs);
        }
        _ => {}
    }

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
    let is_out_result = is_k_out || result_code == PitchResultCode::InplayOut;
    let next_k_since_entry    = pre_state.k_since_entry    + if is_protagonist_active && is_k_out { 1 } else { 0 };
    let next_h_since_entry    = pre_state.h_since_entry    + if is_protagonist_active && is_hit { 1 } else { 0 };
    let next_bb_since_entry   = pre_state.bb_since_entry   + if is_protagonist_active && result_code == PitchResultCode::Walk { 1 } else { 0 };
    let next_outs_since_entry = pre_state.outs_since_entry + if is_protagonist_active && is_out_result { 1 } else { 0 };

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
    let pitch_log = build_pitch_log(&pre_state, decision, lr.landing, result_code, quality);
    let all_new_logs: Vec<String> = steal_logs.into_iter()
        .chain(lr.miss_log.into_iter())
        .chain(std::iter::once(pitch_log))
        .chain(running_logs.into_iter())
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
        home_lineup_index: next_home_idx, away_lineup_index: next_away_idx,
        last_pitch_types: next_last_types,
        defense_stat: next_defense_stat,
        batter_accum: next_batter_accum,
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

    let outcome = PitchOutcome {
        result_code, quality, comment: get_result_comment(result_code).to_string(),
        ball_in_play, fielding_result, animation_cues, landing_target: lr.landing,
    };
    MatchStepResult { next_state, outcome }
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
            protagonist_entered: state.protagonist_has_entered,
        };
    }
    let mut next = state.clone();
    next.is_finished = true;
    next.logs.push("경기 종료".to_string());
    let summary = build_summary(&next);
    FinishMatchResult { next_state: next, summary, batter_lines, protagonist_entered: state.protagonist_has_entered }
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

    while !s.is_finished && !s.protagonist_has_entered && safety > 0 {
        safety -= 1;
        if should_protagonist_enter(&s) {
            s = protagonist_enters_mid_inning(&s);
            break;
        }
        let decision = auto_pick_decision(&s, rng);
        s = step_pitch_core(&s, &decision, false, rng).next_state;
    }
    s
}

pub fn auto_simulate_to_game_end(state: &MatchState, rng: &mut impl Rng) -> MatchState {
    let mut s = state.clone();
    let mut safety = 5000i32;

    while !s.is_finished && safety > 0 {
        safety -= 1;
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
        let decision = if is_protagonist_pitching(&state) { random_decision_for_sim(rng) } else { auto_pick_decision(&state, rng) };
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
