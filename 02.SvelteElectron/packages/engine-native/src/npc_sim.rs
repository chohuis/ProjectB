use std::collections::{HashMap, HashSet};
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::sim_types::*;
use crate::growth_engine::{calc_npc_fame_delta, CalcNpcFameDeltaParams, NpcPerfEntry};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

fn clamp_f(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }
fn clamp_stat(v: f64) -> f64 { v.max(1.0).min(99.0).round() }

// ── 시드 기반 LCG (TS makeRand와 동일 알고리즘) ──────────────────────────────

pub(crate) struct LcgRand { pub(crate) s: u32 }

impl LcgRand {
    pub(crate) fn new(seed: u32) -> Self { LcgRand { s: seed } }
    pub(crate) fn next(&mut self) -> f64 {
        self.s = (self.s ^ (self.s >> 16)).wrapping_mul(0x045d9f3b);
        self.s = (self.s ^ (self.s >> 16)).wrapping_mul(0x045d9f3b);
        self.s ^= self.s >> 16;
        (self.s as f64) / 0xffffffff_u32 as f64
    }
}

// ── 게임 시뮬레이션 ──────────────────────────────────────────────────────────

fn cond_start_mod(pitcher_id: &str, conditions: &HashMap<String, SimPlayerCondition>) -> f64 {
    let fatigue = conditions.get(pitcher_id).map(|c| c.fatigue).unwrap_or(100.0);
    clamp_f(0.60 + fatigue * 0.004, 0.60, 1.0)
}

struct PitAccum { outs: i32, er: i32, h: i32, k: i32, bb: i32, pc: i32 }
struct BatAccum { ab: i32, h: i32, hr: i32, rbi: i32, bb: i32, k: i32 }

fn sim_max_outs(pit: &SimPitcher, is_starter: bool, cond_mod: f64, rng: &mut impl Rng) -> i32 {
    let eff_stam = pit.stamina * cond_mod;
    if is_starter {
        (12.0 + (eff_stam / 99.0) * 15.0 + (rng.gen::<f64>() - 0.5) * 6.0).round() as i32
    } else {
        3 + (rng.gen::<f64>() * 4.0) as i32
    }
}

// ── 투구 단위 반이닝 시뮬 ────────────────────────────────────────────────────

enum NpcPitchResult { Ball, StrikeLook, StrikeSwing, Foul, Out, Single, Double, Triple, HR }

// 타석 결과 (투구 루프 종료 후 반환)
enum AbResult { K, BB, Out, DoublePlay, Single, Double, Triple, HR }

fn npc_sim_one_pitch(
    vel: f64, cmd: f64, ctl: f64, mov: f64,
    contact: f64, eye: f64, discipline: f64, power: f64,
    balls: u8, strikes: u8,
    rng: &mut impl Rng,
) -> NpcPitchResult {
    // 3-0 카운트: 타자가 거의 지켜봄 (선구안 높을수록 더 적극적으로 기다림)
    if balls == 3 && strikes == 0 {
        let take_prob = clamp_f(0.80 + (discipline - 50.0) * 0.003, 0.65, 0.95);
        if rng.gen::<f64>() < take_prob {
            let in_zone = rng.gen::<f64>() < clamp_f(0.58 + (ctl - 50.0) * 0.003, 0.42, 0.72);
            return if in_zone { NpcPitchResult::StrikeLook } else { NpcPitchResult::Ball };
        }
    }
    // 볼/스트라이크 비율 — 볼넷 총량을 정하는 레버. 정본은 `tuning.rs`
    let strike_prob = clamp_f(
        crate::tuning::NPC_STRIKE_PROB_BASE + (ctl - 50.0) * 0.003 + (cmd - 50.0) * 0.002,
        0.38, 0.68);
    if rng.gen::<f64>() >= strike_prob {
        let chase = clamp_f(
            crate::tuning::NPC_CHASE_BASE - (discipline - 50.0) * 0.003, 0.08, 0.40);
        return if rng.gen::<f64>() < chase { NpcPitchResult::StrikeSwing } else { NpcPitchResult::Ball };
    }
    let swing_prob = clamp_f(0.70 + (contact - 50.0) * 0.003 - (eye - 50.0) * 0.002, 0.50, 0.88);
    if rng.gen::<f64>() >= swing_prob { return NpcPitchResult::StrikeLook; }

    let base_contact = clamp_f(
        0.78 + (contact - 50.0) * 0.004 - (vel - 50.0) * 0.003 - (mov - 50.0) * 0.002,
        0.40, 0.92,
    );
    let contact_prob = if strikes == 2 { clamp_f(base_contact + 0.06, 0.40, 0.92) } else { base_contact };
    if rng.gen::<f64>() >= contact_prob { return NpcPitchResult::StrikeSwing; }

    let foul_prob = clamp_f(0.36 - (contact - 50.0) * 0.003, 0.18, 0.52);
    if rng.gen::<f64>() < foul_prob { return NpcPitchResult::Foul; }

    let hr_rate  = clamp_f(0.030 + (power - 50.0) * 0.0015 - (vel - 50.0) * 0.001, 0.005, 0.08);
    // 인플레이 타구의 아웃 비율 — **리그 타격 수준을 정하는 단일 레버**다.
    // 정본은 `tuning.rs` (근거·실측치도 거기 있다)
    let out_rate = clamp_f(
        crate::tuning::NPC_INPLAY_OUT_BASE
            - (contact - 50.0) * crate::tuning::NPC_INPLAY_OUT_CONTACT_SCALE,
        crate::tuning::NPC_INPLAY_OUT_MIN,
        crate::tuning::NPC_INPLAY_OUT_MAX,
    );
    let r: f64   = rng.gen();
    if r < hr_rate              { return NpcPitchResult::HR; }
    if r < hr_rate + out_rate   { return NpcPitchResult::Out; }
    let h: f64 = rng.gen();
    if h < 0.04        { NpcPitchResult::Triple }
    else if h < 0.28   { NpcPitchResult::Double }
    else               { NpcPitchResult::Single }
}

// 투구 루프로 타석 1개 처리 → (결과, 투구수)
fn sim_at_bat(
    vel: f64, cmd: f64, ctl: f64, mov: f64,
    contact: f64, eye: f64, discipline: f64, power: f64,
    bases: &[bool; 3], outs: i32,
    rng: &mut impl Rng,
) -> (AbResult, u32) {
    let mut balls = 0u8;
    let mut strikes = 0u8;
    let mut pc = 0u32;
    loop {
        let r = npc_sim_one_pitch(vel, cmd, ctl, mov, contact, eye, discipline, power, balls, strikes, rng);
        pc += 1;
        match r {
            NpcPitchResult::Ball => {
                balls += 1;
                if balls >= 4 { return (AbResult::BB, pc); }
            }
            NpcPitchResult::StrikeLook | NpcPitchResult::StrikeSwing => {
                strikes += 1;
                if strikes >= 3 { return (AbResult::K, pc); }
            }
            NpcPitchResult::Foul => { if strikes < 2 { strikes += 1; } }
            NpcPitchResult::Out => {
                if bases[0] && outs < 2 && rng.gen::<f64>() < 0.12 {
                    return (AbResult::DoublePlay, pc);
                }
                return (AbResult::Out, pc);
            }
            NpcPitchResult::Single => return (AbResult::Single, pc),
            NpcPitchResult::Double => return (AbResult::Double, pc),
            NpcPitchResult::Triple => return (AbResult::Triple, pc),
            NpcPitchResult::HR     => return (AbResult::HR, pc),
        }
        if pc >= 12 { return (AbResult::Out, pc); } // 안전장치
    }
}

// 타석 결과를 베이스/득점에 적용 → (outs_added, runs_scored, is_hit, is_hr)
fn apply_ab_result(
    result: &AbResult,
    bases: &mut [bool; 3],
    rng: &mut impl Rng,
) -> (i32, i32, bool, bool) {
    match result {
        AbResult::K | AbResult::Out => {
            if matches!(result, AbResult::Out) && bases[2] && rng.gen::<f64>() < 0.10 {
                bases[2] = false;
                return (1, 1, false, false); // 희생플라이
            }
            (1, 0, false, false)
        }
        AbResult::DoublePlay => (2, 0, false, false),
        AbResult::BB => {
            let (b1, b2, b3) = (bases[0], bases[1], bases[2]);
            let runs = if b1 && b2 && b3 { 1 } else { 0 };
            bases[2] = if b1 && b2 { true } else { b3 };
            bases[1] = if b1 { true } else { b2 };
            bases[0] = true;
            (0, runs, false, false)
        }
        AbResult::Single => {
            let (b1, b2, b3) = (bases[0], bases[1], bases[2]);
            let mut runs = 0;
            if b3 { runs += 1; }
            let new_b3 = if b2 { if rng.gen::<f64>() < 0.45 { runs += 1; false } else { true } } else { false };
            bases[2] = new_b3;
            bases[1] = b1;
            bases[0] = true;
            (0, runs, true, false)
        }
        AbResult::Double => {
            let (b1, b2, b3) = (bases[0], bases[1], bases[2]);
            let mut runs = 0;
            if b3 { runs += 1; }
            if b2 { runs += 1; }
            let new_b3 = if b1 { if rng.gen::<f64>() < 0.5 { true } else { runs += 1; false } } else { false };
            bases[2] = new_b3;
            bases[1] = true;
            bases[0] = false;
            (0, runs, true, false)
        }
        AbResult::Triple => {
            let mut runs = 0;
            for i in 0..3 { if bases[i] { runs += 1; bases[i] = false; } }
            bases[2] = true;
            (0, runs, true, false)
        }
        AbResult::HR => {
            let mut runs = 1;
            for i in 0..3 { if bases[i] { runs += 1; bases[i] = false; } }
            (0, runs, true, true)
        }
    }
}

fn sim_half_inning_pitch(
    lineup: &[SimBatter],
    lineup_pos: usize,
    pit: &SimPitcher,
    pit_stamina: f64,
    pit_outs: i32,
    start_cond_mod: f64,
    pit_map: &mut HashMap<String, PitAccum>,
    bat_map: &mut HashMap<String, BatAccum>,
    rng: &mut impl Rng,
) -> (i32, usize, i32, f64) {  // (runs, new_lineup_pos, new_pit_outs, new_stamina)
    let mut bases        = [false; 3];
    let mut outs         = 0i32;
    let mut runs         = 0i32;
    let mut lpos         = lineup_pos;
    let mut cur_pit_outs = pit_outs;
    let mut stamina      = pit_stamina;
    let n                = lineup.len().max(1);

    if lineup.is_empty() { return (0, lineup_pos, pit_outs, pit_stamina); }

    let stamina_loss = 100.0 / (60.0 + (pit.stamina_cap - 50.0) * 1.5).max(30.0);
    let quality = |st: f64| -> f64 {
        if st < 40.0 { clamp_f(0.75 + st * 0.00625, 0.75, 1.0) }
        else if st < 70.0 { clamp_f(1.0 - (70.0 - st) * 0.004, 0.88, 1.0) }
        else { 1.0 }
    };

    let acc = pit_map.entry(pit.id.clone())
        .or_insert(PitAccum { outs: 0, er: 0, h: 0, k: 0, bb: 0, pc: 0 });
    let acc_ptr = acc as *mut PitAccum;

    while outs < 3 {
        if lineup.is_empty() { outs += 1; cur_pit_outs += 1; continue; }
        let batter = &lineup[lpos % n];
        lpos += 1;

        let q   = quality(stamina) * start_cond_mod;
        let vel = pit.velocity * q;
        let cmd = pit.command  * q;
        let ctl = pit.control  * q;
        let mov = pit.movement * q;

        let (ab_result, pc) = sim_at_bat(
            vel, cmd, ctl, mov,
            batter.contact, batter.eye, batter.discipline, batter.power,
            &bases, outs, rng,
        );
        stamina = (stamina - stamina_loss * pc as f64).max(0.0);

        let (outs_added, runs_scored, is_hit, is_hr) = apply_ab_result(&ab_result, &mut bases, rng);

        outs         += outs_added;
        cur_pit_outs += outs_added;
        runs         += runs_scored;

        let is_k  = matches!(ab_result, AbResult::K);
        let is_bb = matches!(ab_result, AbResult::BB);

        let pa = unsafe { &mut *acc_ptr };
        pa.outs += outs_added;
        pa.er   += runs_scored;
        pa.pc   += pc as i32;
        if is_hit { pa.h  += 1; }
        if is_k   { pa.k  += 1; }
        if is_bb  { pa.bb += 1; }

        let ba = bat_map.entry(batter.id.clone())
            .or_insert(BatAccum { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
        if !is_bb { ba.ab += 1; }
        if is_hit  { ba.h  += 1; }
        if is_hr   { ba.hr += 1; }
        if is_bb   { ba.bb += 1; }
        if is_k    { ba.k  += 1; }
        ba.rbi += runs_scored;
    }

    (runs, lpos, cur_pit_outs, stamina)
}

fn build_pit_queue(
    rotation: &[SimPitcher],
    bullpen: &[SimPitcher],
    closer: &Option<SimPitcher>,
    rot_idx: usize,
) -> Vec<SimPitcher> {
    let mut q: Vec<SimPitcher> = Vec::new();
    if !rotation.is_empty() {
        q.push(rotation[rot_idx % rotation.len()].clone());
    }
    for p in bullpen {
        if !q.iter().any(|x| x.id == p.id) { q.push(p.clone()); }
    }
    if let Some(c) = closer {
        if !q.iter().any(|x| x.id == c.id) { q.push(c.clone()); }
    }
    q
}

pub fn sim_game(params: &SimGameParams) -> SimGameResult {
    let mut rng = rand::thread_rng();

    let home_pit_q = build_pit_queue(&params.home_rotation, &params.home_bullpen, &params.home_closer, params.home_rot_idx);
    let away_pit_q = build_pit_queue(&params.away_rotation, &params.away_bullpen, &params.away_closer, params.away_rot_idx);

    // 투수 또는 타자 데이터 없으면 시뮬 불가 — 홈팀 몰수승으로 처리
    if home_pit_q.is_empty() || away_pit_q.is_empty()
        || params.home_lineup.is_empty() || params.away_lineup.is_empty()
    {
        return SimGameResult {
            result: MatchResult {
                home_score: 0,
                away_score: 0,
                winner_id: params.home_team_id.clone(),
                loser_id:  params.away_team_id.clone(),
                player_lines: vec![],
                events: vec![],
            },
            next_home_rot_idx: params.home_rot_idx as i32,
            next_away_rot_idx: params.away_rot_idx as i32,
            pitcher_conditions: HashMap::new(),
        };
    }

    let home_pit_ids: HashSet<String> = home_pit_q.iter().map(|p| p.id.clone()).collect();

    let mut pit_max_map: HashMap<String, i32> = HashMap::new();

    // pre-compute max outs for all pitchers
    for (i, p) in home_pit_q.iter().enumerate() {
        let cond_mod = cond_start_mod(&p.id, &params.conditions);
        let m = sim_max_outs(p, i == 0, cond_mod, &mut rng);
        pit_max_map.insert(p.id.clone(), m);
    }
    for (i, p) in away_pit_q.iter().enumerate() {
        let cond_mod = cond_start_mod(&p.id, &params.conditions);
        let m = sim_max_outs(p, i == 0, cond_mod, &mut rng);
        pit_max_map.insert(p.id.clone(), m);
    }

    let mut pit_map: HashMap<String, PitAccum> = HashMap::new();
    let mut bat_map: HashMap<String, BatAccum> = HashMap::new();

    // 경기 중 투수별 현재 스태미나 추적 (초기값 = stamina 필드)
    let mut pit_stamina_map: HashMap<String, f64> = HashMap::new();
    for p in home_pit_q.iter().chain(away_pit_q.iter()) {
        pit_stamina_map.entry(p.id.clone()).or_insert(p.stamina);
    }

    let mut home_score = 0i32;
    let mut away_score = 0i32;
    let mut home_lpos  = 0usize;
    let mut away_lpos  = 0usize;
    let mut h_pit_idx  = 0usize;
    let mut a_pit_idx  = 0usize;
    let mut h_pit_outs = 0i32;
    let mut a_pit_outs = 0i32;

    for inning in 1i32..=9 {
        // 홈 투수 교체
        if h_pit_idx + 1 < home_pit_q.len() {
            let max = *pit_max_map.get(&home_pit_q[h_pit_idx].id).unwrap_or(&27);
            if h_pit_outs >= max { h_pit_idx += 1; h_pit_outs = 0; }
        }
        let h_pit = &home_pit_q[h_pit_idx.min(home_pit_q.len().saturating_sub(1))];
        let h_cond = cond_start_mod(&h_pit.id, &params.conditions);
        let h_stamina = *pit_stamina_map.get(&h_pit.id).unwrap_or(&h_pit.stamina);

        // 원정 공격 (상반기)
        let (top_runs, new_away_lpos, new_h_outs, new_h_stamina) = sim_half_inning_pitch(
            &params.away_lineup, away_lpos, h_pit, h_stamina, h_pit_outs, h_cond,
            &mut pit_map, &mut bat_map, &mut rng,
        );
        away_score  += top_runs;
        away_lpos    = new_away_lpos;
        h_pit_outs   = new_h_outs;
        pit_stamina_map.insert(h_pit.id.clone(), new_h_stamina);

        // 원정 투수 교체
        if a_pit_idx + 1 < away_pit_q.len() {
            let max = *pit_max_map.get(&away_pit_q[a_pit_idx].id).unwrap_or(&27);
            if a_pit_outs >= max { a_pit_idx += 1; a_pit_outs = 0; }
        }
        let a_pit = &away_pit_q[a_pit_idx.min(away_pit_q.len().saturating_sub(1))];
        let a_cond = cond_start_mod(&a_pit.id, &params.conditions);
        let a_stamina = *pit_stamina_map.get(&a_pit.id).unwrap_or(&a_pit.stamina);

        // 9회 말 홈팀 앞서면 walk-off
        if inning == 9 && home_score > away_score { break; }

        // 홈 공격 (하반기)
        let (bot_runs, new_home_lpos, new_a_outs, new_a_stamina) = sim_half_inning_pitch(
            &params.home_lineup, home_lpos, a_pit, a_stamina, a_pit_outs, a_cond,
            &mut pit_map, &mut bat_map, &mut rng,
        );
        home_score  += bot_runs;
        home_lpos    = new_home_lpos;
        a_pit_outs   = new_a_outs;
        pit_stamina_map.insert(a_pit.id.clone(), new_a_stamina);

        // 콜드게임
        let diff = (home_score - away_score).abs();
        if (inning >= 5 && diff >= 10) || (inning >= 7 && diff >= 7) { break; }

        // 9회 연장
        if inning == 9 && home_score == away_score {
            let mut ex_inning = 10i32;
            while ex_inning <= 12 && home_score == away_score {
                let ex_h = &home_pit_q[h_pit_idx.min(home_pit_q.len().saturating_sub(1))];
                let ex_h_cond = cond_start_mod(&ex_h.id, &params.conditions);
                let ex_h_st = *pit_stamina_map.get(&ex_h.id).unwrap_or(&ex_h.stamina);
                let (t, new_al, _, new_ex_h_st) = sim_half_inning_pitch(
                    &params.away_lineup, away_lpos, ex_h, ex_h_st, 27, ex_h_cond,
                    &mut pit_map, &mut bat_map, &mut rng,
                );
                away_score += t;
                away_lpos   = new_al;
                pit_stamina_map.insert(ex_h.id.clone(), new_ex_h_st);

                let ex_a = &away_pit_q[a_pit_idx.min(away_pit_q.len().saturating_sub(1))];
                let ex_a_cond = cond_start_mod(&ex_a.id, &params.conditions);
                let ex_a_st = *pit_stamina_map.get(&ex_a.id).unwrap_or(&ex_a.stamina);
                let (b, new_hl, _, new_ex_a_st) = sim_half_inning_pitch(
                    &params.home_lineup, home_lpos, ex_a, ex_a_st, 27, ex_a_cond,
                    &mut pit_map, &mut bat_map, &mut rng,
                );
                home_score += b;
                home_lpos   = new_hl;
                pit_stamina_map.insert(ex_a.id.clone(), new_ex_a_st);
                ex_inning   += 1;
            }
            if home_score == away_score {
                if rng.gen::<f64>() < 0.5 { home_score += 1; } else { away_score += 1; }
            }
        }
    }

    let home_won  = home_score > away_score;
    let winner_id = if home_won { params.home_team_id.clone() } else { params.away_team_id.clone() };
    let loser_id  = if home_won { params.away_team_id.clone() } else { params.home_team_id.clone() };
    let margin    = (home_score - away_score).abs();

    // W/L/SV/HD 결정
    let pitcher_decision = |pit_id: &str, team_won: bool, pit_q: &[SimPitcher], final_idx: usize| -> String {
        let acc = match pit_map.get(pit_id) { Some(a) => a, None => return "ND".into() };
        let is_starter = pit_q.first().map(|p| p.id == pit_id).unwrap_or(false);
        let is_closer  = pit_q.len() > 1 && pit_q.last().map(|p| p.id == pit_id).unwrap_or(false);
        let _ = final_idx;
        if team_won {
            if is_starter && acc.outs >= 15  { return "W".into(); }
            if is_closer && margin <= 3       { return "SV".into(); }
            if !is_starter && !is_closer && acc.outs >= 3 { return "HD".into(); }
        } else if is_starter {
            return "L".into();
        }
        "ND".into()
    };

    let mut player_lines: Vec<PlayerGameLine> = Vec::new();

    for (id, acc) in &pit_map {
        let is_home   = home_pit_ids.contains(id);
        let pit_q     = if is_home { &home_pit_q } else { &away_pit_q };
        let final_idx = if is_home { h_pit_idx } else { a_pit_idx };
        let team_won  = if is_home { home_won } else { !home_won };
        let decision  = pitcher_decision(id, team_won, pit_q, final_idx);
        let ip        = (acc.outs / 3) as f64 + (acc.outs % 3) as f64 / 10.0;
        player_lines.push(PlayerGameLine::Pitcher {
            player_id: id.clone(), ip, er: acc.er, h: acc.h, k: acc.k, bb: acc.bb, pc: acc.pc, decision,
        });
    }

    let all_batter_ids: HashSet<String> = params.home_lineup.iter().chain(params.away_lineup.iter())
        .map(|b| b.id.clone()).collect();
    for id in &all_batter_ids {
        let acc = match bat_map.get(id) { Some(a) if a.ab > 0 => a, _ => continue };
        player_lines.push(PlayerGameLine::Batter {
            player_id: id.clone(), ab: acc.ab, h: acc.h, hr: acc.hr,
            rbi: acc.rbi, bb: acc.bb, k: acc.k, sb: 0,
        });
    }

    // 투수 컨디션 업데이트 (아웃당 ~2.7pt 피로)
    let mut pitcher_conditions: HashMap<String, SimPlayerCondition> = HashMap::new();
    for (id, acc) in &pit_map {
        let prev_fatigue = params.conditions.get(id).map(|c| c.fatigue).unwrap_or(100.0);
        let fatigue_loss = acc.outs as f64 * 2.7;
        pitcher_conditions.insert(id.clone(), SimPlayerCondition {
            fatigue: clamp_f(prev_fatigue - fatigue_loss, 0.0, 100.0),
            last_pitched_week: params.week,
            pitch_outs_last: acc.outs,
        });
    }

    SimGameResult {
        result: MatchResult {
            home_score, away_score, winner_id, loser_id, player_lines, events: vec![],
        },
        next_home_rot_idx: params.home_rot_idx as i32 + 1,
        next_away_rot_idx: params.away_rot_idx as i32 + 1,
        pitcher_conditions,
    }
}

// ── NPC 공통 헬퍼 ────────────────────────────────────────────────────────────

// FA 자격 연수는 `team_engine`에 하나만 둔다. 예전엔 여기에도 같은 표가
// 있었다 — Rust 안에서만 정의가 둘이었고, TS `FA_THRESHOLD`까지 세 곳이었다
use crate::team_engine::fa_eligibility_years;

/// FA 재취득까지 필요한 연수. 현실 야구의 재자격 기간에 해당한다.
/// 누적 연차(`pro_service_years`)는 리셋하지 않고 이 기간만 센다.
const FA_REACQUIRE_YEARS: i32 = 4;

pub(crate) fn npc_core_ovr(npc: &NpcSaveState) -> f64 {
    if npc.player_type == "pitcher" {
        npc.pitching.as_ref().map(|p| p.ovr).unwrap_or(0.0)
    } else {
        npc.batting.as_ref().map(|b| b.ovr).unwrap_or(0.0)
    }
}


/// 1군 팀 → 팜(2군) 팀 — ID 규칙: TEAM_X_1 → TEAM_X_2 (refs.json 정본 규칙)
fn farm_team(team_id: &str) -> Option<String> {
    team_id.strip_suffix("_1").map(|base| format!("{}_2", base))
}

/// 1군 리그 → 팜 리그. 팀 ID의 `_1 → _2`와 짝이다 —
/// 팀만 바꾸고 리그를 그대로 두면 2군 선수가 1군 소속으로 남아
/// **1군 상한이 1군+2군 합산 상한처럼 작동한다.** 실제로 그래서 KBL 소속이
/// 700명까지 부풀었고 2군 상한은 아무한테도 안 걸리고 있었다.
fn farm_league(league_id: &str) -> Option<String> {
    matches!(league_id, "LEAGUE_KBL" | "LEAGUE_ABL" | "LEAGUE_JBL")
        .then(|| format!("{league_id}_FARM"))
}

/// 팀당 유지 인원 (min, max).
///
/// **정본은 `generation_rules.json rosterRules[리그].rosterMin/rosterMax`다.**
/// 예전엔 이 함수와 TS `ROSTER_RULES`에 각각 하드코딩돼 있었고 둘 다 규칙 파일과
/// 달랐다 (KBL 상한 65 vs 생성 인원 30). 규칙이 안 넘어오면 생성 인원 기준
/// 폴백을 쓴다 — 상한이 없으면 로스터가 무한히 부푼다
fn roster_rule(league_id: &str, limits: &HashMap<String, RosterLimit>) -> Option<(i32, i32)> {
    if let Some(l) = limits.get(league_id) {
        return Some((l.roster_min, l.roster_max));
    }
    // 팜 리그 규칙이 없으면 1군 규칙을 물려받는다 (ABL_FARM·JBL_FARM)
    if let Some(base) = league_id.strip_suffix("_FARM") {
        if let Some(l) = limits.get(base) {
            return Some((l.roster_min, l.roster_max));
        }
    }
    None
}

// ── 은퇴 판정 + 로스터 캡 정규화 ────────────────────────────────────────────

fn normalize_offseason_npcs(
    npcs: Vec<NpcSaveState>,
    season_year: i32,
    summary: &mut SeasonEndSummary,
    logs: &mut Vec<String>,
    rng: &mut impl Rng,
    limits: &HashMap<String, RosterLimit>,
    // 12단계 진로 배정이 돌 수 있는가. false면 방출 대신 바로 은퇴시킨다 —
    // 소속 없는 현역이 떠다니면 화면과 시뮬이 다 깨진다
    can_place: bool,
    // 외국인 판정. 이들은 **2군으로 못 내린다**(1군 전용) —
    // 정원 초과는 내국인 안에서 푼다
    is_foreign: &dyn Fn(&NpcSaveState) -> bool,
) -> Vec<NpcSaveState> {
    let mut next = npcs;

    // 은퇴 판정
    for npc in next.iter_mut() {
        if npc.career_status == "injured" {
            npc.career_status = "active".into();
            continue;
        }
        if npc.career_status != "active" { continue; }
        if npc.current_league == "LEAGUE_RETIRED" { continue; }
        if npc.age < 35 { continue; }

        let age_over = npc.age - 34;
        let ovr = npc_core_ovr(npc);
        let low_ovr_penalty = if ovr < 55.0 { (55.0 - ovr) * 0.01 } else { 0.0 };
        let retire_chance = (0.06 * age_over as f64 + low_ovr_penalty).min(0.72);
        if rng.gen::<f64>() < retire_chance {
            let history = NpcCareerEntry {
                year: season_year,
                league_id: npc.current_league.clone(),
                team_id: npc.current_team.clone(),
                stat_line: "retired".into(),
                highlights: vec![],
            };
            push_year_once(&mut npc.career_history, history);
            // ⚠ **은퇴가 경력 사건으로 안 남고 있었다.** `NpcCareerEventType`에
            // `retirement`가 정의돼 있는데 쓰는 곳은 주인공 경로뿐이라, NPC는
            // 경력 화면에 은퇴가 뜨지 않았다. 사건 집계로 세대교체를 확인할
            // 방법도 없어서 "나이 은퇴가 한 번도 없다"고 잘못 읽기까지 했다.
            // ⚠ 소속을 비우기 **전에** 넣어야 어디서 은퇴했는지가 남는다.
            npc.career_events.push(NpcCareerEvent {
                year: season_year,
                event_type: "retirement".into(),
                from_team_id: (!npc.current_team.is_empty()).then(|| npc.current_team.clone()),
                to_team_id: None,
                from_league_id: Some(npc.current_league.clone()),
                to_league_id: None,
                detail: Some(format!("{}세 은퇴", npc.age)),
            });
            npc.career_status   = "retired".into();
            npc.current_league  = "LEAGUE_RETIRED".into();
            npc.current_team    = "".into();
            summary.retired_count += 1;
            logs.push(format!("{} retired", npc.name));
        }
    }

    // 리그·팀별 그룹화 및 로스터 캡
    let mut by_league_team: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, npc) in next.iter().enumerate() {
        if npc.career_status != "active" { continue; }
        let key = format!("{}::{}", npc.current_league, npc.current_team);
        by_league_team.entry(key).or_default().push(i);
    }

    // **상위 리그부터 처리한다.** 1군 초과분이 2군으로 내려가면 2군 인원이
    // 늘어나므로, 2군을 먼저 세어두면 그 유입이 상한 검사를 통과해버린다.
    //
    // 실제로 그렇게 돌고 있었다 — 스냅샷을 한 번만 뜨고 순회 순서가 HashMap
    // 임의 순서라, 2군이 34명(상한)일 때 강등자가 들어와 35명이 되어도
    // 아무도 다시 안 봤다. 7-5 F-4가 FA 계약자를 1군에 직접 넣으면서
    // 1군 초과가 늘자 회귀에 걸렸다.
    let mut keys: Vec<String> = by_league_team.keys().cloned().collect();
    // 팜 리그를 뒤로. 나머지는 이름순 (결정성 — HashMap 순회 순서에 기대지 않는다)
    keys.sort_by(|a, b| {
        let fa = a.contains("_FARM");
        let fb = b.contains("_FARM");
        fa.cmp(&fb).then_with(|| a.cmp(b))
    });

    for key in keys {
        let indices = by_league_team.get(&key).cloned().unwrap_or_default();
        let league_id = key.split("::").next().unwrap_or("").to_string();
        let rule = match roster_rule(&league_id, limits) { Some(r) => r, None => continue };
        let (_min, max) = rule;

        if indices.len() as i32 > max {
            let overflow = indices.len() as i32 - max;
            // 외국인은 강등 대상이 아니다 — 1군 전용 슬롯이라 내릴 곳이 없다.
            // 남은 자리에서 밀어내면 그 팀은 보유 3명을 채우고도 한 자리를 논다
            let mut sorted_i: Vec<usize> = indices.iter().copied()
                .filter(|&i| !is_foreign(&next[i])).collect();
            sorted_i.sort_by(|&a, &b| {
                let ovr_a = npc_core_ovr(&next[a]);
                let ovr_b = npc_core_ovr(&next[b]);
                ovr_a.partial_cmp(&ovr_b).unwrap_or(std::cmp::Ordering::Equal)
                    .then(next[b].age.cmp(&next[a].age))
                    .then(next[a].npc_id.cmp(&next[b].npc_id))
            });
            for &idx in sorted_i.iter().take(overflow as usize) {
                let (new_league, new_team) = {
                    let npc = &mut next[idx];
                    // 1군 초과는 2군으로 내린다 — **리그도 같이 바꾼다.**
                    // 팀만 `_2`로 바꾸면 그 선수는 여전히 1군 소속으로 집계돼
                    // 2군 상한이 영원히 안 걸린다 (KBL 700명의 원인)
                    match farm_league(&league_id).zip(farm_team(&npc.current_team)) {
                        Some((farm_lid, farm_tid)) => {
                            logs.push(format!("{} → 2군 강등 ({league_id})", npc.name));
                            npc.current_league = farm_lid.clone();
                            npc.current_team   = farm_tid.clone();
                            (Some(farm_lid), Some(farm_tid))
                        }
                        // 내릴 곳이 없으면 방출이다. 소속만 비워두면 12단계가
                        // 미지명자와 같은 로직으로 진로를 정한다 (독립 입단 또는 은퇴).
                        // 예전엔 여기서 바로 은퇴시켜 22세 신인이 방출 한 번에 끝났다
                        None if can_place => {
                            logs.push(format!("{} 방출 (로스터 초과 {league_id})", npc.name));
                            npc.current_team = "".into();
                            (None, None)
                        }
                        None => {
                            logs.push(format!("{} 은퇴 (로스터 초과 {league_id})", npc.name));
                            npc.career_status  = "retired".into();
                            npc.current_league = "LEAGUE_RETIRED".into();
                            npc.current_team   = "".into();
                            summary.retired_count += 1;
                            (None, None)
                        }
                    }
                };

                // 내려간 선수를 **받는 쪽 그룹에 넣는다.** 이게 없으면 팜이
                // 상한을 넘어도 자기 차례에 세지 않은 인원이라 통과한다
                if let (Some(lid), Some(tid)) = (new_league, new_team) {
                    by_league_team.entry(format!("{lid}::{tid}")).or_default().push(idx);
                }
            }
        }
    }

    fill_first_teams(&mut next, limits, logs);
    next
}

/// 방출 2단계 — **정원 안이어도** 성적·연봉·뎁스로 걸러낸다.
///
/// 1단계는 로스터 초과분 밀어내기(7-1 D-4a)라 정원이 차 있지 않으면 아무도
/// 안 걸린다. 그래서 부진한 고연봉 베테랑이 정원 안에서 계속 버텼다.
///
/// 방출자는 소속만 비워두고 진로 배정(12단계)이 독립·은퇴를 정한다 —
/// 미지명자·FA 미계약자와 **같은 로직**이다.
fn release_second_stage(
    npcs: &mut [NpcSaveState],
    rules: &crate::free_agency::ReleaseRules,
    limits: &HashMap<String, RosterLimit>,
    logs: &mut Vec<String>,
    // 외국인은 이 경로를 타지 않는다. 방출자는 소속만 비고 진로 배정이
    // 독립 입단·은퇴를 정하는데, 용병이 국내 독립리그로 가는 건 말이 안 된다.
    // 외국인 교체는 재계약 판정 + 새 영입이 짝이다 (F-4·F-5)
    is_foreign: &dyn Fn(&NpcSaveState) -> bool,
) -> usize {
    use crate::team_engine::{eval_release_priority, EvalReleaseParams};

    // 팀별 포지션 뎁스 — 같은 자리에 사람이 많으면 방출 압력이 올라간다
    let mut depth: HashMap<(String, String), i32> = HashMap::new();
    for n in npcs.iter() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        *depth.entry((n.current_team.clone(), n.position.clone())).or_insert(0) += 1;
    }

    // 팀별 시장가 기준선 = 그 팀 평균 연봉. 과지급 판정의 분모다
    let mut team_salaries: HashMap<String, (i64, i32)> = HashMap::new();
    for n in npcs.iter() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        let e = team_salaries.entry(n.current_team.clone()).or_insert((0, 0));
        e.0 += n.current_salary;
        e.1 += 1;
    }

    let mut per_team: HashMap<String, usize> = HashMap::new();
    let mut released = 0usize;

    // 방출 점수가 높은 순으로 — 팀당 상한이 있어 순서가 결과를 바꾼다
    let mut scored: Vec<(usize, f64)> = Vec::new();
    for (i, n) in npcs.iter().enumerate() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        // 프로만. 학생·독립은 방출 개념이 없다
        if !matches!(n.current_league.as_str(),
            "LEAGUE_KBL" | "LEAGUE_KBL_FARM" | "LEAGUE_ABL" | "LEAGUE_ABL_FARM"
            | "LEAGUE_JBL" | "LEAGUE_JBL_FARM") { continue; }
        if is_foreign(n) { continue; }

        let (sum, cnt) = team_salaries.get(&n.current_team).copied().unwrap_or((0, 1));
        let market = (sum / cnt.max(1) as i64).max(1);
        let ovr = npc_core_ovr(n);

        let res = eval_release_priority(EvalReleaseParams {
            team_profile: ProTeamProfile::default(),
            player: RosterPlayerRef {
                id: n.npc_id.clone(), position: n.position.clone(), age: n.age, ovr,
                salary: n.current_salary, remaining_years: n.contract_years,
                pro_service_years: n.pro_service_years.unwrap_or(0),
                is_prospect: n.current_team.ends_with("_2"),
                personality: n.personality.clone(), fame: n.fame, perf: None,
                is_foreign: false,   // 위에서 걸러졌다
            },
            // 성적 표본이 없으므로 능력치를 성적 대용으로 쓴다 —
            // 오프시즌엔 시즌 기록이 이미 정산돼 넘어오지 않는다
            recent_performance_rating: ovr,
            roster_depth_at_position:
                depth.get(&(n.current_team.clone(), n.position.clone())).copied().unwrap_or(1),
            current_salary: n.current_salary,
            market_value: market,
            owner_relation: 0.0,          // NPC는 구단주 관계가 없다 (6C 설계)
            owner_relation_weight: 0.0,
        });
        if res.release_score >= rules.score_threshold {
            scored.push((i, res.release_score));
        }
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    for (idx, score) in scored {
        let team = npcs[idx].current_team.clone();
        let league = npcs[idx].current_league.clone();
        // 하한 아래로는 안 내린다 — 방출만 돌면 로스터가 마른다 (7-2 P-4 교훈)
        let min = roster_rule(&league, limits).map(|(m, _)| m).unwrap_or(0);
        let have = npcs.iter().filter(|n|
            n.career_status == "active" && n.current_team == team).count() as i32;
        if have <= min { continue; }

        let cnt = per_team.entry(team.clone()).or_insert(0);
        if *cnt >= rules.max_per_team { continue; }
        *cnt += 1;
        released += 1;

        logs.push(format!("{} 방출 (점수 {:.0})", npcs[idx].name, score));
        npcs[idx].current_team = String::new();
        npcs[idx].current_salary = 0;
        npcs[idx].contract_years = 0;
    }
    released
}

/// 1군이 최소 인원에 미달하면 같은 구단 2군에서 능력치 상위를 끌어올린다.
///
/// 신인이 전부 2군에서 시작하면(D-3b) 1군은 은퇴·FA로 **빠지기만 한다.**
/// 실측에서 1군이 팀당 24명(최소 16)까지 말랐다. 성적 기반 상시 콜업은
/// Phase 7-2가 담당하고, 여기서는 리그가 성립하는 최소선만 지킨다.
fn fill_first_teams(
    npcs: &mut [NpcSaveState],
    limits: &HashMap<String, RosterLimit>,
    logs: &mut Vec<String>,
) {
    // 1군 팀별 현재 인원
    let mut count: HashMap<String, usize> = HashMap::new();
    for n in npcs.iter() {
        if n.career_status != "active" { continue; }
        if farm_league(&n.current_league).is_none() { continue; }  // 1군 리그만
        *count.entry(n.current_team.clone()).or_default() += 1;
    }

    for (team_id, have) in count {
        let Some(base) = team_id.strip_suffix("_1") else { continue };
        // 이 팀이 속한 1군 리그를 인원에서 역추적한다
        let Some(league_id) = npcs.iter()
            .find(|n| n.current_team == team_id && n.career_status == "active")
            .map(|n| n.current_league.clone()) else { continue };
        let Some((min, _)) = roster_rule(&league_id, limits) else { continue };
        if have as i32 >= min { continue; }

        let farm_tid = format!("{base}_2");
        let mut cands: Vec<usize> = npcs.iter().enumerate()
            .filter(|(_, n)| n.career_status == "active" && n.current_team == farm_tid)
            .map(|(i, _)| i)
            .collect();
        // 능력치 높은 순 — 2군에서 제일 나은 선수가 올라간다
        cands.sort_by(|&a, &b| npc_core_ovr(&npcs[b])
            .partial_cmp(&npc_core_ovr(&npcs[a])).unwrap_or(std::cmp::Ordering::Equal));

        let need = (min as usize).saturating_sub(have);
        for &idx in cands.iter().take(need) {
            npcs[idx].current_league = league_id.clone();
            npcs[idx].current_team   = team_id.clone();
            logs.push(format!("{} → 1군 승격 ({team_id})", npcs[idx].name));
        }
    }
}

// ── 오프시즌 전체 처리 ────────────────────────────────────────────────────────

pub fn run_offseason(params: OffseasonParams) -> OffseasonOutput {
    let salary_rules = params.salary_rules.clone().unwrap_or_default();
    // 외국인 슬롯 판정 — `params.npcs`가 아래에서 move되므로 표만 먼저 떼어 둔다.
    //
    // ⚠ **외국인은 국적이 아니라 리그 기준 상대 개념이다.** `국적 != "KOR"`로
    // 보면 ABL(USA)·JBL(JPN) 로스터 전원이 외국인이 된다. 정본 표는
    // generation_rules.json이고 여기 다시 적지 않는다 — 호출측이 넘긴다.
    let foreign_leagues = params.foreign_leagues.clone();
    let home_nationality = params.home_nationality.clone();
    let is_foreign = |n: &NpcSaveState| -> bool {
        if !foreign_leagues.iter().any(|l| *l == n.current_league) { return false; }
        let home = home_nationality.get(&n.current_league).map(|s| s.as_str()).unwrap_or("KOR");
        n.nationality.as_deref().unwrap_or("KOR") != home
    };
    let mut rng = rand::thread_rng();
    let mut lcg = LcgRand::new(
        (params.season_year as u32).wrapping_mul(3571)
    );
    let mut summary = SeasonEndSummary::default();
    let mut new_pending: Vec<NpcSaveState> = Vec::new();
    let season_year = params.season_year;
    let mut processed: Vec<NpcSaveState> = params.npcs.into_iter().map(|npc| {
        if npc.current_league == "LEAGUE_HIGHSCHOOL" { return npc; }

        let mut n = npc;

        // 1. 군 복무 중: 나머지 처리 건너뜀 (나이 증가는 advance_all_ages에서 일괄 처리)
        if n.career_status == "military" {
            return n;
        }

        if n.career_status == "retired" || n.current_league == "LEAGUE_RETIRED" { return n; }

        if n.current_league == "LEAGUE_DRAFT_POOL" || n.current_league == "LEAGUE_FREE_AGENT" { return n; }
        if n.career_status != "active" { return n; }

        // 대학 처리: 학년 진급은 advance_all_grades에서, 여기서는 grade 4 졸업생만 pending 처리
        if n.current_league == "LEAGUE_UNIVERSITY" {
            if n.grade.is_none() {
                // advance_all_grades에서 grade=None + LEAGUE_DRAFT_POOL로 전환된 졸업생
                new_pending.push(n.clone());
                summary.univ_graduated_count += 1;
            }
            return n;
        }

        // 4. 에이징: 주간 감퇴(calc_weekly_npc_growth)로 이관, 오프시즌 중복 처리 제거

        // 5. 프로 연차 + FA
        //
        // ⚠ **연차 적립과 FA 선언을 분리한다.** 예전엔 한 조건문이었고 거기에
        // `LEAGUE_KBL_FARM`이 빠져 **2군 선수는 연차가 안 쌓였다.** 프로 인원의
        // 절반이 2군인데 그동안 시계가 멈춘 셈이라, 실측에서 2군 평균 연차가
        // 3.0 → 1.4년으로 **역행**했고 FA 자격자가 300 → 20명으로 말랐다.
        // 2군에서도 등록 연수는 쌓이되, 선언은 1군에서 한다.
        let is_pro_any = n.current_league == "LEAGUE_KBL"
            || n.current_league == "LEAGUE_KBL_FARM"
            || n.current_league == "LEAGUE_ABL"
            || n.current_league == "LEAGUE_ABL_FARM"
            || n.current_league == "LEAGUE_JBL"
            || n.current_league == "LEAGUE_JBL_FARM";
        if is_pro_any {
            n.pro_service_years = Some(n.pro_service_years.unwrap_or(0) + 1);
        }

        let is_top_league = n.current_league == "LEAGUE_KBL"
            || n.current_league == "LEAGUE_ABL"
            || n.current_league == "LEAGUE_JBL";
        // ⚠ **외국인은 FA를 취득하지 않는다.** 용병은 단년 계약이고 연차로
        // 자격을 쌓는 신분이 아니다. 안 막으면 8년 뒤 전원이 FA 시장에 나와
        // FA 재배치가 그들을 아무 팀에나 넣는다 — 보유 한도가 그 자리에서 깨진다.
        if is_top_league && !is_foreign(&n) {
            let fa_threshold = fa_eligibility_years(&n.current_league);
            // ⚠ **연차를 0으로 리셋하지 않는다.** 예전엔 리셋해서 1군 평균이
            // 7년 → 1.8년으로 폭락하고 7년차 이상이 157명 → 0명이 됐다.
            // 현실 야구처럼 누적은 유지하고 **재취득 기간**(4년)을 따로 센다.
            let last_fa = n.career_events.iter()
                .filter(|e| e.event_type == "fa_signed")
                .map(|e| e.year)
                .max();
            let reacquire_ok = last_fa.map_or(true, |y| season_year - y >= FA_REACQUIRE_YEARS);

            if n.pro_service_years.unwrap_or(0) >= fa_threshold
                && reacquire_ok
                && rng.gen::<f64>() < 0.6
            {
                n.original_league_id = Some(n.current_league.clone()); // FA 재배치 시 원래 리그로 복귀
                // 재취득 판정의 근거가 되는 기록 — 이게 없으면 매년 FA가 된다
                n.career_events.push(NpcCareerEvent {
                    year: season_year,
                    event_type: "fa_signed".into(),
                    from_team_id: (!n.current_team.is_empty()).then(|| n.current_team.clone()),
                    to_team_id: None,
                    from_league_id: Some(n.current_league.clone()),
                    to_league_id: None,
                    detail: Some(format!("FA 취득 ({}년차)", n.pro_service_years.unwrap_or(0))),
                });
                n.current_league    = "LEAGUE_FREE_AGENT".into();
                n.current_team      = "".into();
                summary.fa_count   += 1;
                return n;
            }
        }

        // 6. 연봉/계약 갱신 (active 선수, 군 복무/은퇴 제외)
        if n.career_status == "active"
            && n.current_league != "LEAGUE_MILITARY"
            && n.current_league != "LEAGUE_RETIRED"
        {
            let ovr = npc_core_ovr(&n);
            // 오프시즌 재계약 — 팀 예산 지수는 이 경로로 안 들어온다(1.0 = 평균팀).
            // 팀별 차등은 Phase 7-4 FA 등급제에서 협상 경로와 함께 붙인다.
            let (salary, years) = estimate_salary_and_contract(
                ovr, &n.current_league, n.pro_service_years.unwrap_or(0), n.age, 1.0,
                &salary_rules, &mut lcg);
            n.current_salary = salary;
            // 외국인은 **단년 계약**이다 — 다년으로 묶이면 매 시즌 교체(F-4)가 막힌다
            n.contract_years  = if is_foreign(&n) { 1 } else { years };
        }

        n
    }).collect();

    // 7. 전역 처리 (discharge_year 도달)
    for n in processed.iter_mut() {
        if n.career_status != "military" { continue; }
        if let Some(dy) = n.military_discharge_year {
            if dy <= season_year {
                n.career_status   = "active".into();
                n.military_status = "군필".into();
                // CLUB_ → TEAM_*_1 변환 (구버전 세이브 호환)
                let fix_team_id = |id: Option<&String>| -> String {
                    match id {
                        Some(t) if t.starts_with("CLUB_") =>
                            format!("TEAM_{}_1", &t["CLUB_".len()..]),
                        Some(t) => t.clone(),
                        None => String::new(),
                    }
                };
                if n.military_unit.as_deref() == Some("sports") {
                    // 체육부대: 원소속팀 복귀 (KBL/ABL), 독립 출신은 독립리그
                    n.current_league = n.original_league_id.clone()
                        .filter(|l| !l.is_empty())
                        .unwrap_or_else(|| "LEAGUE_INDEPENDENT".into());
                    n.current_team   = fix_team_id(n.original_team_id.as_ref());
                } else {
                    // 일반부대: 계약 잔여 있으면 원소속팀 복귀, 없으면 FA
                    let has_contract = n.contract_years > 0;
                    if has_contract {
                        n.current_league = n.original_league_id.clone()
                            .filter(|l| !l.is_empty())
                            .unwrap_or_else(|| "LEAGUE_INDEPENDENT".into());
                        n.current_team   = fix_team_id(n.original_team_id.as_ref());
                    } else {
                        // FA 전환 — original_league_id는 FA 재배치 시 사용하므로 여기서 클리어 안 함
                        n.current_league = "LEAGUE_FREE_AGENT".into();
                        n.current_team   = "".into();
                    }
                }
                // 복귀 완료 후 필드 클리어 (FA 전환 시 original_league_id는 재배치까지 보존)
                if n.current_league != "LEAGUE_FREE_AGENT" {
                    n.original_league_id = None;
                    n.original_team_id   = None;
                }
                n.military_unit         = None;
                n.military_discharge_year = None;
                summary.military_discharged_count += 1;
                summary.military_discharged_names.push(n.name.clone());
            }
        }
    }

    // 8-10. 군입대 판정/체육부대 선발/입대 처리 → TypeScript Phase 4 통합 처리로 이전

    let mut logs: Vec<String> = Vec::new();

    // 8. FA → 원래 리그의 **자리가 있는 팀**으로 재배치.
    //
    // ⚠ 이 블록은 로스터 캡보다 **먼저** 돌아야 한다. 예전엔 캡 뒤에 있어서
    // 캡이 34명으로 줄여놓은 팀에 FA 40명이 그대로 얹혔다 — 결과 74명.
    // 캡이 매년 통과되면서 프로 소속이 계속 부푼 진짜 메커니즘이 이거다.
    let mut team_active_count: HashMap<String, usize> = HashMap::new();
    for n in processed.iter() {
        if n.career_status == "active" && !n.current_team.is_empty() {
            *team_active_count.entry(n.current_team.clone()).or_default() += 1;
        }
    }
    // 리그별 현역 팀 목록 (active NPC 5명 미만은 유령 팀 — 구 팀ID 잔존 방지)
    let mut league_teams: HashMap<String, Vec<String>> = HashMap::new();
    for n in processed.iter() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        let is_pro = n.current_league == "LEAGUE_KBL"
            || n.current_league == "LEAGUE_ABL"
            || n.current_league == "LEAGUE_JBL";
        if !is_pro { continue; }
        if team_active_count.get(&n.current_team).copied().unwrap_or(0) < 5 { continue; }
        league_teams
            .entry(n.current_league.clone())
            .or_default()
            .push(n.current_team.clone());
    }
    for teams in league_teams.values_mut() {
        teams.sort();
        teams.dedup();
    }

    let mut fa_unsigned = 0usize;
    for npc in processed.iter_mut() {
        if npc.current_league != "LEAGUE_FREE_AGENT" { continue; }
        // FA 직전 리그 판별: original_league_id 우선, 없으면 KBL 기본값
        let origin_league = npc.original_league_id.as_deref()
            .filter(|l| !l.is_empty())
            .unwrap_or("LEAGUE_KBL");
        let max = roster_rule(origin_league, &params.roster_limits).map(|(_, m)| m);
        // 정원에 여유가 있는 팀만 후보다. 여유를 안 보면 FA가 캡을 통과한다
        let open: Vec<&String> = league_teams.get(origin_league)
            .map(|teams| teams.iter().filter(|t| {
                let n = team_active_count.get(*t).copied().unwrap_or(0) as i32;
                max.map_or(true, |m| n < m)
            }).collect())
            .unwrap_or_default();

        if open.is_empty() {
            // 미계약 — 갈 팀이 없다. 진로(독립 입단·은퇴)는 D-4가 정한다
            npc.current_league = "LEAGUE_INDEPENDENT".into();
            npc.current_team   = "".into();
            fa_unsigned += 1;
            continue;
        }
        let idx = (rng.gen::<f64>() * open.len() as f64) as usize % open.len();
        let team = open[idx].clone();
        *team_active_count.entry(team.clone()).or_default() += 1;
        npc.current_league = origin_league.into();
        npc.current_team   = team;
        npc.original_league_id = None;
        npc.original_team_id   = None;
    }
    if fa_unsigned > 0 {
        logs.push(format!("FA 미계약 {fa_unsigned}명 — 원 소속 리그에 자리가 없었다"));
    }

    // 11. 은퇴 판정 + 로스터 캡
    let can_place = !params.independent_team_ids.is_empty();
    let mut after_normalize = normalize_offseason_npcs(
        processed, season_year, &mut summary, &mut logs, &mut rng,
        &params.roster_limits, can_place, &is_foreign,
    );

    // 12. 소속을 잃은 사람들의 진로 — 방출자와 FA 미계약자.
    //
    // **미지명 졸업생과 같은 로직을 탄다** (`draft::Placer`). 따로 짜면 셋 중
    // 하나가 반드시 어긋난다. 예전엔 이들이 전부 "은퇴"로 처리돼
    // 22세 신인이 방출 한 번에 은퇴하고 있었다.
    // 11-b. 방출 2단계 — 정원 안이어도 성적·연봉으로 걸러낸다.
    // 진로 배정(12단계) **앞**에 있어야 방출자가 그 경로를 탄다
    if let Some(rr) = params.release_rules.as_ref() {
        let n = release_second_stage(
            &mut after_normalize, rr, &params.roster_limits, &mut logs, &is_foreign);
        if n > 0 { logs.push(format!("방출 2단계 {n}명")); }
    }

    let mut leftover_pending = Vec::new();
    if can_place {
        // 졸업했는데 지명을 못 받은 사람도 같이 처리한다. 드래프트는 졸업 전(W47)에
        // 끝나므로, 여기 남아 있다는 건 미지명이라는 뜻이다
        let grad_start = after_normalize.len();
        after_normalize.extend(params.pending_draft.iter().cloned());

        let rules = params.placement.clone().unwrap_or(crate::draft::PlacementRules {
            university_max: 40, independent_max: 45, independent_age_max: 31,
            // 폴백 — TS가 규칙 파일에서 계산해 넘긴다(`placementRulesFrom`)
            university_annual_max: None,
        });
        let mut placer = crate::draft::Placer::new(
            &after_normalize, &params.university_team_ids, &params.independent_team_ids, rules,
        );
        let homeless: Vec<usize> = after_normalize.iter().enumerate()
            .filter(|(i, n)| n.career_status == "active"
                && (n.current_team.is_empty()
                    || n.current_league == crate::draft::DRAFT_POOL_LEAGUE
                    || *i >= grad_start))
            .map(|(i, _)| i)
            .collect();

        let mut quit = 0usize;
        for idx in homeless {
            // **대학은 고교 졸업자만.** 프로·대학을 거친 사람의 대학 입학은 학적 역행이다
            let from_hs = after_normalize[idx].career_history.last()
                .is_some_and(|e| e.league_id == "LEAGUE_HIGHSCHOOL");
            let (event, reason) = if from_hs || idx >= grad_start {
                ("draft_undrafted", "미지명")
            } else {
                ("release", "방출")
            };
            placer.place(&mut after_normalize[idx], season_year, event, reason, from_hs);
            if after_normalize[idx].career_status == "retired" { quit += 1; }
        }
        if quit > 0 {
            summary.retired_count += quit as i32;
            logs.push(format!("갈 팀을 못 찾아 야구를 그만둔 선수 {quit}명"));
        }
    } else {
        leftover_pending = params.pending_draft;
    }

    OffseasonOutput {
        npcs: after_normalize,
        pending_draft: [leftover_pending, new_pending].concat(),
        summary,
        logs,
    }
}

// ── 학년 진급 ─────────────────────────────────────────────────────────────────

/// 같은 해가 이미 있으면 안 넣는다.
///
/// ⚠ **연도 기록을 네 곳이 각자 쓰고 있었고 방어는 한 곳에만 있었다.**
/// Rust 학년 진급·은퇴, TS `applySeasonHistory`, TS `processAllLeaguesSeasonEnd`.
/// 그래서 고교생은 같은 해가 **두 줄**로 남았다(Rust 진급 + TS 성적 기록).
/// 경력 화면과 **드래프트 경로 판정**(`career_history.last()`로 고졸/대졸을
/// 가른다)이 이 배열을 읽으므로 중복은 그대로 오작동이 된다.
fn push_year_once(hist: &mut Vec<NpcCareerEntry>, entry: NpcCareerEntry) {
    if hist.iter().any(|h| h.year == entry.year) { return; }
    hist.push(entry);
}

// HS 전용 학년 진급 (기존 호환용, advance_all_grades 사용 권장)
pub fn advance_grades(params: AdvanceGradesParams) -> GradeAdvanceResult {
    let mut updated      = Vec::new();
    let mut hs_graduated = Vec::new();
    let season_year      = params.season_year;

    for npc in params.npcs {
        let is_hs = npc.current_league == "LEAGUE_HIGHSCHOOL"
            && npc.career_status != "retired"   // 부상 중이어도 학년은 오른다
            && npc.grade.is_some();

        if !is_hs { updated.push(npc); continue; }

        let grade = npc.grade.unwrap();

        if grade >= 3 {
            let entry = NpcCareerEntry {
                year: season_year,
                league_id: "LEAGUE_HIGHSCHOOL".into(),
                team_id: npc.current_team.clone(),
                stat_line: "-".into(),
                highlights: vec![],
            };
            let mut g = npc;
            g.grade          = None;
            g.current_league = "LEAGUE_DRAFT_POOL".into();
            push_year_once(&mut g.career_history, entry);
            hs_graduated.push(g);
        } else {
            let mut n = npc;
            n.grade = Some(grade + 1);
            updated.push(n);
        }
    }

    GradeAdvanceResult { updated, hs_graduated, univ_graduated: vec![] }
}

// HS + 대학 전체 학년 진급 (단일 호출용)
//
// ⚠ 예전엔 `career_status == "active"`만 진급시켰다. **부상 중인 선수는
// 학년이 안 오르고 졸업도 안 됐다** — 나이만 매 시즌 +1 되어 20~21세
// 고교생이 쌓였다. 완치돼도 부상 상태가 안 풀리던 결함(시즌 중 고교의
// 47%가 injured)과 겹쳐 대량으로 샜다. 자리를 비우는 건 은퇴뿐이다.
pub fn advance_all_grades(params: AdvanceGradesParams) -> GradeAdvanceResult {
    let mut updated        = Vec::new();
    let mut hs_graduated   = Vec::new();
    let mut univ_graduated = Vec::new();
    let season_year        = params.season_year;

    for npc in params.npcs {
        // ── 고등학교 ──────────────────────────────────────────────────────────
        if npc.current_league == "LEAGUE_HIGHSCHOOL"
            && npc.career_status != "retired"   // 부상 중이어도 학년은 오른다
            && npc.grade.is_some()
        {
            let grade = npc.grade.unwrap();
            // 매 학년 careerHistory 기록
            let entry = NpcCareerEntry {
                year: season_year,
                league_id: "LEAGUE_HIGHSCHOOL".into(),
                team_id: npc.current_team.clone(),
                stat_line: "-".into(),
                highlights: vec![],
            };
            if grade >= 3 {
                let mut g = npc;
                g.grade          = None;
                g.current_league = "LEAGUE_DRAFT_POOL".into();
                push_year_once(&mut g.career_history, entry);
                hs_graduated.push(g);
            } else {
                let mut n = npc;
                n.grade = Some(grade + 1);
                push_year_once(&mut n.career_history, entry);
                updated.push(n);
            }
            continue;
        }

        // ── 대학교 ────────────────────────────────────────────────────────────
        if npc.current_league == "LEAGUE_UNIVERSITY"
            && npc.career_status != "retired"   // 부상 중이어도 학년은 오른다
            && npc.grade.is_some()
        {
            let grade = npc.grade.unwrap();
            // 매 학년 careerHistory 기록
            let entry = NpcCareerEntry {
                year: season_year,
                league_id: "LEAGUE_UNIVERSITY".into(),
                team_id: npc.current_team.clone(),
                stat_line: "-".into(),
                highlights: vec![],
            };
            if grade >= 4 {
                let mut g = npc;
                g.grade          = None;
                g.current_league = "LEAGUE_DRAFT_POOL".into();
                push_year_once(&mut g.career_history, entry);
                univ_graduated.push(g);
            } else {
                let mut n = npc;
                n.grade = Some(grade + 1);
                push_year_once(&mut n.career_history, entry);
                updated.push(n);
            }
            continue;
        }

        updated.push(npc);
    }

    GradeAdvanceResult { updated, hs_graduated, univ_graduated }
}

// 전체 NPC 나이 +1 (단일 호출, 학년 진급 이후 실행)
pub fn advance_all_ages(params: AdvanceAllAgesParams) -> Vec<NpcSaveState> {
    params.npcs.into_iter().map(|mut n| {
        if n.career_status != "retired" && n.current_league != "LEAGUE_RETIRED" {
            n.age += 1;
        }
        n
    }).collect()
}

// ── 신입생 생성 ───────────────────────────────────────────────────────────────

pub(crate) const SURNAMES:    &[&str] = &["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전"];
pub(crate) const SYLLABLES_A: &[&str] = &["민","준","현","재","우","지","도","성","진","동","태","수","영","혁","훈","기","상","정","세","찬"];
pub(crate) const SYLLABLES_B: &[&str] = &["준","혁","원","환","빈","욱","식","윤","완","호","진","우","기","수","민","찬","훈","성","재","현"];
pub(crate) const POSITIONS:   &[&str] = &["C","1B","2B","3B","SS","LF","CF","RF"];

pub(crate) fn gen_name(rng: &mut LcgRand) -> (String, String) {
    let sur = SURNAMES[(rng.next() * SURNAMES.len() as f64) as usize % SURNAMES.len()];
    let a   = SYLLABLES_A[(rng.next() * SYLLABLES_A.len() as f64) as usize % SYLLABLES_A.len()];
    let b   = SYLLABLES_B[(rng.next() * SYLLABLES_B.len() as f64) as usize % SYLLABLES_B.len()];
    (format!("{}{}{}", sur, a, b), format!("{} {}{}", sur, a, b))
}

/// 생성한 스탯이 목표 OVR을 내도록 **전 스탯을 평행이동**한다.
///
/// ⚠ **이게 없으면 생성기가 매긴 `ovr`이 거짓말이 된다.** 개별 스탯은
/// `ovr` 기준 오프셋으로 만드는데 그 오프셋이 대부분 음수라(command −5,
/// recovery −6, clutch −8, holdRunners −10) 같은 스탯을 OVR 공식에 넣으면
/// 다른 값이 나온다 — 투수 **−2.1**, 타자 **−4.0~−4.8**.
///
/// 첫 주간 성장에서 엔진이 OVR을 재계산하는 순간 전 세계 선수가 일제히
/// 그만큼 내려앉았고, 매 시즌 신규 생성분이 같은 손실을 다시 겪어
/// 리그 평균이 계속 떨어졌다(1군 상위 88 → 81 → 77). 성장이 약해서가
/// 아니라 **장부가 매년 정정되고 있었다.**
///
/// ⚠ **OVR 공식을 여기 다시 적지 않는다** — `calc_*_ovr`을 그대로 부른다.
/// 이 프로젝트에서 표를 두 번 적어 생긴 결함이 Phase 7에만 15건이었다.
/// `clamp_stat`이 반올림하므로 한 번에 안 맞는다. 잔차 0.5 미만은 반올림
/// 한계라 더 줄일 수 없다.
macro_rules! align_ovr {
    ($obj:expr, $target:expr, $calc:ident, [$($f:ident),+]) => {
        for _ in 0..4 {
            let diff = $target - $calc(&$obj);
            if diff.abs() < 0.5 { break; }
            $( $obj.$f = clamp_stat($obj.$f + diff); )+
        }
        $obj.ovr = $calc(&$obj);
    };
}

pub(crate) fn make_pitching(ovr: f64, rng: &mut LcgRand) -> NpcPitchingAttrs {
    let mut p = NpcPitchingAttrs {
        ovr,
        stamina:      clamp_stat(ovr - 2.0  + (rng.next() - 0.5) * 12.0),
        velocity:     clamp_stat(ovr + 4.0  + (rng.next() - 0.5) * 12.0),
        command:      clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0),
        control:      clamp_stat(ovr - 3.0  + (rng.next() - 0.5) * 12.0),
        movement:     clamp_stat(ovr - 4.0  + (rng.next() - 0.5) * 12.0),
        mentality:    clamp_stat(ovr        + (rng.next() - 0.5) * 12.0),
        recovery:     clamp_stat(ovr - 6.0  + (rng.next() - 0.5) * 12.0),
        clutch:       clamp_stat(ovr - 8.0  + (rng.next() - 0.5) * 12.0),
        hold_runners: clamp_stat(ovr - 10.0 + (rng.next() - 0.5) * 12.0),
    };
    align_ovr!(p, ovr, calc_npc_pitching_ovr,
        [stamina, velocity, command, control, movement, mentality, recovery, clutch, hold_runners]);
    p
}

pub(crate) fn make_batting(ovr: f64, rng: &mut LcgRand) -> NpcBattingAttrs {
    let mut b = NpcBattingAttrs {
        ovr,
        contact:        clamp_stat(ovr - 2.0  + (rng.next() - 0.5) * 12.0),
        power:          clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0),
        eye:            clamp_stat(ovr - 3.0  + (rng.next() - 0.5) * 12.0),
        discipline:     clamp_stat(ovr - 4.0  + (rng.next() - 0.5) * 12.0),
        speed:          clamp_stat(ovr        + (rng.next() - 0.5) * 12.0),
        base_instinct:  clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0),
        bunting:        clamp_stat(ovr - 15.0 + (rng.next() - 0.5) * 12.0),
        // 플래툰은 능력이 아니라 성향이라 중립 고정이다. 다만 OVR 공식에는
        // 가중치 0.3으로 들어가므로, 고정된 만큼의 어긋남은 아래 보정이 흡수한다
        platoon:        50.0,
        fielding:       clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0),
        arm:            clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0),
        batting_clutch: clamp_stat(ovr - 8.0  + (rng.next() - 0.5) * 12.0),
    };
    align_ovr!(b, ovr, calc_npc_batting_ovr,
        [contact, power, eye, discipline, speed, base_instinct, bunting, fielding, arm, batting_clutch]);
    b
}

pub fn generate_freshmen(params: GenerateFreshmenParams) -> Vec<NpcSaveState> {
    let mut result = params.named_npcs;
    let named_count = result.len();
    let bulk_count  = (params.annual_roster_size - named_count as i32).max(0);
    let seed = (params.school_id.len() as u32).wrapping_mul(997)
        .wrapping_add((params.season_year as u32).wrapping_mul(31));
    let mut rng = LcgRand::new(seed);

    for i in 0..bulk_count as usize {
        let npc_id = format!("GEN_{}_Y{}_{:03}", params.school_id, params.season_year, params.id_offset as usize + i + 1);
        let (name, name_en) = gen_name(&mut rng);
        let is_sp = rng.next() < 0.3;
        let ovr_p = params.pitching_ovr_min + rng.next() * (params.pitching_ovr_max - params.pitching_ovr_min);
        let ovr_b = params.batting_ovr_min  + rng.next() * (params.batting_ovr_max  - params.batting_ovr_min);
        let dev_r = params.dev_rate_min     + rng.next() * (params.dev_rate_max      - params.dev_rate_min);
        let position = if is_sp { "SP".to_string() } else {
            POSITIONS[(rng.next() * POSITIONS.len() as f64) as usize % POSITIONS.len()].to_string()
        };

        result.push(NpcSaveState {
            npc_id,
            name,
            name_en: Some(name_en),
            nationality:    Some("KOR".into()),
            player_type:    if is_sp { "pitcher".into() } else { "batter".into() },
            position,
            grade:          Some(1),
            age:            17,
            school_id:      params.school_id.clone(),
            graduation_year: params.season_year + 2,
            career_status:  "active".into(),
            current_league: "LEAGUE_HIGHSCHOOL".into(),
            current_team:   params.team_id.clone(),
            military_status: "미필".into(),
            pitching:       Some(make_pitching(ovr_p.round(), &mut rng)),
            batting:        Some(make_batting(ovr_b.round(),  &mut rng)),
            development_rate: dev_r.round() as i32,
            potential_hidden: params.pitching_ovr_max.max(params.batting_ovr_max) * 1.15,
            career_history:  vec![],
            career_events:   vec![],
            achievements:    vec![],
            military_enlist_year:    None,
            military_discharge_year: None,
            pro_service_years:       None,
            current_salary:          0,
            contract_years:          1,
            sports_unit_selected:    false,
            military_unit:           None,
            military_rank:           None,
            original_league_id:      None,
            original_team_id:        None,
            fame:                    0.0,
            personality:             None,
        });
    }
    result
}

// ── 연봉/계약 기간 추정 (player_engine.league_salary_mult 공식과 통일) ───────

// ── 연봉 모델 (Phase 6.5) ────────────────────────────────────────────────────
//
// 예전엔 `1800 + (ovr-50) * 220` 선형이었다. 그래서 **연차가 사실상 무의미했고**
// (0년차 OVR61 = 4,296만 / 12년차 OVR61 = 4,209만) 팀 사정도 안 보였다.
//
// 지금은 base(OVR) × 연차계수 × 나이보정 × 팀지수 × 리그배수 다.
// 수치 정본은 `generation_rules.json` 의 `salaryRules` — 여기 하드코딩하지 않는다.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceBand {
    pub until: i32,
    pub factor: f64,
}

/// 팀당 유지 인원. `rosterSize`(생성 인원)와 다르다 —
/// 생성은 시작 인원이고 이건 매 시즌 오프시즌에 강제되는 상한이다
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterLimit {
    #[serde(default)]
    pub roster_min: i32,
    pub roster_max: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalaryRules {
    pub ovr_pivot: f64,
    pub ovr_growth: f64,
    pub ovr_base: f64,
    pub service: Vec<ServiceBand>,
    pub aging_from_age: i32,
    pub aging_per_year: f64,
    pub team_index_min: f64,
    pub team_index_max: f64,
    pub jitter: f64,
    pub league_mult: std::collections::HashMap<String, f64>,
    pub min_salary: std::collections::HashMap<String, f64>,
}

impl Default for SalaryRules {
    /// 규칙이 안 넘어왔을 때의 폴백. **구 선형식과 같은 감각**으로 둔다 —
    /// 규칙 누락이 연봉을 0으로 만들어 세이브를 망가뜨리지 않게.
    fn default() -> Self {
        SalaryRules {
            ovr_pivot: 50.0, ovr_growth: 1.10, ovr_base: 3000.0,
            service: vec![ServiceBand { until: 99, factor: 1.0 }],
            aging_from_age: 34, aging_per_year: 0.06,
            team_index_min: 0.8, team_index_max: 1.35, jitter: 0.10,
            league_mult: std::collections::HashMap::new(),
            min_salary: std::collections::HashMap::new(),
        }
    }
}

fn service_factor(rules: &SalaryRules, years: i32) -> f64 {
    for b in &rules.service {
        if years <= b.until { return b.factor; }
    }
    rules.service.last().map(|b| b.factor).unwrap_or(1.0)
}

/// 연봉·계약연수.
///
/// `team_index` = 그 팀 예산 / 리그 평균 예산 (TS가 refs에서 계산해 넘긴다).
/// 1.0이면 평균팀. 없으면 1.0을 넘기면 된다.
pub(crate) fn estimate_salary_and_contract(
    ovr: f64,
    league: &str,
    service_years: i32,
    age: i32,
    team_index: f64,
    rules: &SalaryRules,
    rng: &mut LcgRand,
) -> (i64, i32) {
    let mult = *rules.league_mult.get(league).unwrap_or(&1.0);

    // ① OVR 곡선 — 선형이 아니다. 상위 몇 명이 시장을 지배하는 게 실제에 가깝다
    let base = rules.ovr_base * rules.ovr_growth.powf(ovr - rules.ovr_pivot);

    // ② 연차 — 신인은 구단이 정하고, FA 자격을 얻어야 협상력이 생긴다
    let svc = service_factor(rules, service_years);

    // ③ 나이 — 노장은 깎인다
    let aging = if age > rules.aging_from_age {
        (1.0 - (age - rules.aging_from_age) as f64 * rules.aging_per_year).max(0.45)
    } else { 1.0 };

    // ④ 팀 사정 — 부유한 팀이 더 준다
    let team = team_index.clamp(rules.team_index_min, rules.team_index_max);

    // ⑤ 흔들기 — 같은 조건이어도 계약마다 조금씩 다르다
    let jitter = 1.0 + (rng.next() * 2.0 - 1.0) * rules.jitter;

    let raw = base * svc * aging * team * mult * jitter;
    let floor = *rules.min_salary.get(league).unwrap_or(&0.0);
    let salary = raw.max(floor).round() as i64;

    let years = if ovr >= 75.0      { 3 + (rng.next() * 3.0) as i32 }
                else if ovr >= 68.0 { 2 + (rng.next() * 3.0) as i32 }
                else if ovr >= 55.0 { 1 + (rng.next() * 2.0) as i32 }
                else                { 1 };
    (salary, years)
}

// ── 체육부대 선발 (포지션 우선 → OVR 순) ─────────────────────────────────────

fn select_sports_unit_ids(
    candidates: &[(String, f64, String, String)],  // (id, ovr, team_id, position)
    vacating_positions: &[String],                 // 올해 전역자 포지션 목록
    max_total: usize,
    max_per_team: usize,
) -> std::collections::HashSet<String> {
    let mut selected: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut team_count: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    // OVR 내림차순 정렬 (Phase 1, 2 공통)
    let mut sorted = candidates.to_vec();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Phase 1: 전역 공백 포지션 채우기 (팀당 제한 무시)
    let mut remaining_vacancies = vacating_positions.to_vec();
    for (id, _, _, pos) in &sorted {
        if remaining_vacancies.is_empty() { break; }
        if let Some(idx) = remaining_vacancies.iter().position(|v| v == pos) {
            selected.insert(id.clone());
            remaining_vacancies.remove(idx);
        }
    }

    // Phase 2: 잔여 슬롯 OVR 순 (팀당 max_per_team 적용)
    for (id, _, team_id, _) in &sorted {
        if selected.len() >= max_total { break; }
        if selected.contains(id) { continue; }
        let cnt = team_count.entry(team_id.clone()).or_insert(0);
        if *cnt < max_per_team {
            selected.insert(id.clone());
            *cnt += 1;
        }
    }
    selected
}

// ── 드래프트 시뮬레이션 ───────────────────────────────────────────────────────

fn potential_bonus(tier: &str) -> f64 {
    match tier { "S" => 30.0, "A" => 20.0, "B" => 10.0, _ => 0.0 }
}

/// 드래프트 평가 점수 — **나이 · 능력치 · 재능**을 함께 본다.
///
/// ⚠ 예전엔 `ovr*0.6 + 성장률*0.3 + 잠재*0.1`이라 **최고 선수가 평균의 1.4배**
/// 밖에 안 됐다. 그 점수로 1,682명에서 확률 추첨을 돌리니 최고 유망주가 지명될
/// 확률이 약 9%였다 — 실측에서 **OVR 83 대학 투수가 미지명**이고 OVR 51 고졸이
/// 2순위로 뽑혔다.
///
/// 두 가지를 바꿨다:
///  · 능력치 격차를 **제곱으로 벌린다** — 상위권이 실제로 유리해진다
///  · **나이**를 넣는다. 같은 실력이면 어린 쪽이 유망하다 (19세 기준, 매년 감점)
///
/// 대회 입상·개인 수상은 **데이터가 없어서 못 넣는다** — `careerHistory.highlights`가
/// 타입만 있고 채우는 코드가 없다(전부 빈 배열). 그 데이터를 만든 뒤에 더한다.
fn calc_draft_score(npc: &NpcSaveState, meta: Option<&NamedNpcMeta>) -> f64 {
    let ovr = npc_core_ovr(npc);
    let pot = meta.map(|m| potential_bonus(&m.pro_potential_tier)).unwrap_or(0.0);

    // 능력치는 50을 기준으로 초과분을 제곱해 키운다.
    // OVR 83 → (33/25)^2 * 20 ≈ 34.8 / OVR 60 → (10/25)^2 * 20 = 3.2
    let edge = ((ovr - 50.0).max(0.0) / 25.0).powi(2) * 20.0;

    // ── 나이 (업사이드 프리미엄) ─────────────────────────────────
    //
    // ⚠ 처음엔 19세 +10 / 매년 -1.8이었는데 **능력치 보정(최대 +43)에 눌려
    // 아무 영향도 못 줬다.** 대학 얼리 신청 자격이 OVR 68~74 하한이라 신청자는
    // 전원 고OVR이고, 19세 고졸(OVR 40~55)은 경쟁이 안 됐다 —
    // 실측에서 **보드 220명 중 고졸이 5명**까지 줄었다(주인공의 기본 경로다).
    //
    // 어린 선수는 완성 전이라 현재 능력치가 낮은 게 정상이고, 구단은 그걸
    // 감안해 뽑는다. 그 프리미엄을 능력치 보정과 같은 크기로 준다.
    // ⚠ 한 번 +26까지 올렸다가 되돌렸다. 그러면 능력치 차이를 덮어서
    // **OVR 55(19세)가 1순위, OVR 82(26세)가 미지명**이 됐다(실측 2031).
    // 업사이드 프리미엄은 능력치를 뒤집지 않을 만큼만 준다.
    let youth = (14.0 - ((npc.age - 19).max(0) as f64) * 3.0).max(-6.0);

    ovr * 0.40 + edge + npc.development_rate as f64 * 0.35 + pot * 0.1 + youth
}

fn weighted_pick(weights: &[f64], rng: &mut LcgRand) -> usize {
    let total: f64 = weights.iter().sum();
    let mut r = rng.next() * total;
    for (i, &w) in weights.iter().enumerate() {
        r -= w;
        if r <= 0.0 { return i; }
    }
    weights.len().saturating_sub(1)
}

pub fn run_draft(params: DraftSimParams) -> DraftSimResult {
    let meta_map: HashMap<String, &NamedNpcMeta> = params.named_metas.iter()
        .map(|m| (m.npc_id.clone(), m)).collect();
    let pool: Vec<&NpcSaveState> = params.candidates.iter().collect();
    let year  = params.year;
    let mut rng = LcgRand::new(
        (year as u32).wrapping_mul(1337).wrapping_add((pool.len() as u32).wrapping_mul(7))
    );

    let mut picks: Vec<DraftPick> = Vec::new();
    let candidate_map: HashMap<String, &NpcSaveState> = params.candidates.iter()
        .map(|n| (n.npc_id.clone(), n)).collect();

    // ── 지명 대상 풀을 상위 N명으로 좁힌다 ──────────────────────
    //
    // ⚠ 예전엔 후보 **전원**(실측 1,682명)에서 확률 추첨을 돌렸다. 지명은
    // 110명뿐인데 풀이 그렇게 크면 점수 가중이 거의 의미가 없어져,
    // **최고 유망주가 지명될 확률이 약 9%**였다.
    //
    // 화면(관전 보드)이 상위 N명만 보여주는 것과도 어긋났다 — 보드에는
    // "220명 중 110명 지명"으로 보이는데 실제로는 1,682명에서 뽑고 있었다.
    // 나머지는 지금처럼 대학·독립으로 흩어진다(`Placer`).
    let slots = (params.rounds as usize) * params.team_ids.len();
    let pool_size = (slots * params.pool_multiplier.max(1)).min(pool.len());
    let mut scored: Vec<(String, f64)> = pool.iter()
        .map(|n| (n.npc_id.clone(), calc_draft_score(n, meta_map.get(&n.npc_id).copied())))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut remaining_ids: Vec<String> =
        scored.into_iter().take(pool_size).map(|(id, _)| id).collect();
    let excluded: Vec<String> = pool.iter()
        .map(|n| n.npc_id.clone())
        .filter(|id| !remaining_ids.contains(id))
        .collect();

    for r in 1..=params.rounds {
        let mut t = 0;
        while t < params.team_ids.len() as i32 && !remaining_ids.is_empty() {
            let pick_num = (r - 1) * params.team_ids.len() as i32 + t + 1;
            // ⚠ **비례 추첨이 아니라 최고점을 뽑는다.**
            //
            // 예전엔 `weighted_pick`(점수 비례 확률)이었다. 점수 격차가 1.5배쯤이라
            // 최상위도 30%쯤 미지명으로 샜다 — 실측에서 **OVR 82가 미지명이고
            // OVR 72가 지명**됐다. "나이·능력치·재능으로 뽑는다"와 어긋난다.
            //
            // 구단이 매 순번에서 **가장 좋다고 본 선수**를 고르고, 그 평가에
            // 노이즈가 섞이는 게 실제 드래프트에 가깝다. 노이즈는 라운드가
            // 깊을수록 커지되 상한이 있다(예전엔 11R에서 ±44라 순수 난수였다).
            let spread = (r as f64 * 4.0).min(15.0);
            let scored_now: Vec<f64> = remaining_ids.iter().map(|id| {
                let npc = candidate_map[id];
                let base = calc_draft_score(npc, meta_map.get(id).copied());
                base + (rng.next() - 0.5) * spread
            }).collect();
            let idx = scored_now.iter().enumerate()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
                .unwrap_or(0);
            let npc_id = remaining_ids[idx].clone();
            picks.push(DraftPick {
                round: r,
                pick: pick_num,
                team_id: params.team_ids[t as usize].clone(),
                npc_id,
            });
            remaining_ids.remove(idx);
            t += 1;
        }
    }

    // 미지명 = 풀에 들었지만 안 뽑힌 사람 + 풀에도 못 든 사람
    let mut undrafted_ids = remaining_ids;
    undrafted_ids.extend(excluded);
    DraftSimResult { year, picks, undrafted_ids }
}

// 팀별 빈 슬롯 탐색: 포지션 수요 우선(strict=true), 없으면 슬롯만 확인.
// 배정 성공 시 roster를 즉시 업데이트하고 팀 ID 반환.
fn find_slot(
    roster: &mut HashMap<String, (usize, usize)>,
    want_pitcher: bool,
    team_ids: &[String],
    max: usize,
) -> Option<String> {
    for strict in [true, false] {
        let mut best: Option<(String, usize)> = None;
        for tid in team_ids {
            let (p, b) = roster.get(tid).copied().unwrap_or((0, 0));
            let total = p + b;
            if total >= max { continue; }
            if strict {
                let ratio = if total > 0 { p as f64 / total as f64 } else { 0.5 };
                // 투수 비율 >0.65면 투수 추가 사양, <0.55면 타자 추가 사양
                if  want_pitcher && ratio > 0.65 { continue; }
                if !want_pitcher && ratio < 0.55 { continue; }
            }
            let slots = max - total;
            if best.as_ref().map_or(true, |(_, s)| slots > *s) {
                best = Some((tid.clone(), slots));
            }
        }
        if let Some((tid, _)) = best {
            let e = roster.entry(tid.clone()).or_insert((0, 0));
            if want_pitcher { e.0 += 1; } else { e.1 += 1; }
            return Some(tid);
        }
    }
    None
}

pub fn apply_draft(params: ApplyDraftParams) -> Vec<NpcSaveState> {
    let pick_map: HashMap<String, &DraftPick> = params.result.picks.iter()
        .map(|p| (p.npc_id.clone(), p)).collect();
    let undrafted: HashSet<String> = params.result.undrafted_ids.iter().cloned().collect();

    // Step 1: 대학/독립 팀의 현재 로스터 집계 (run_offseason 이후 상태 기준)
    let mut roster: HashMap<String, (usize, usize)> = HashMap::new(); // team -> (pitchers, batters)
    let univ_set: HashSet<&str> = params.university_team_ids.iter().map(|s| s.as_str()).collect();
    let ind_set:  HashSet<&str> = params.independent_team_ids.iter().map(|s| s.as_str()).collect();

    for npc in &params.npcs {
        if npc.current_league == "LEAGUE_DRAFT_POOL"
            || npc.current_league == "LEAGUE_RETIRED"
            || npc.career_status == "retired" { continue; }
        // 지명된 재학생은 곧 팀을 떠난다 — 자리를 차지한 것으로 세면
        // 그 팀이 미지명자를 한 명 덜 받는다
        if pick_map.contains_key(&npc.npc_id) { continue; }
        let t = &npc.current_team;
        if !univ_set.contains(t.as_str()) && !ind_set.contains(t.as_str()) { continue; }
        let e = roster.entry(t.clone()).or_insert((0, 0));
        if npc.player_type == "pitcher" { e.0 += 1; } else { e.1 += 1; }
    }

    // Step 2: KBL 지명자 먼저 처리.
    //
    // **출신 리그를 따지지 않는다.** 예전엔 `LEAGUE_DRAFT_POOL` 소속만 옮겼는데,
    // D-2에서 대학 재학생·독립리그 선수가 소속을 유지한 채 신청할 수 있게 되면서
    // 그 조건이 남아 있으면 **지명돼도 원 소속에 그대로 남는다.**
    let mut result_npcs = params.npcs;
    for npc in result_npcs.iter_mut() {
        if let Some(pick) = pick_map.get(&npc.npc_id) {
            let from_team   = (!npc.current_team.is_empty()).then(|| npc.current_team.clone());
            let from_league = (npc.current_league != "LEAGUE_DRAFT_POOL")
                .then(|| npc.current_league.clone());

            // **상위 라운드(특급 신인)는 1군에서 시작한다.** 나머지는 2군 —
            // 전원 1군이면 정원(34)이 매년 11명씩 밀려 베테랑이 대신 나간다.
            // 2군에서 시작한 신인의 1군 진입은 Phase 7-2 승강이 성적으로 판단한다
            let to_first = pick.round <= params.first_team_rounds;
            let (team_id, league_id) = match (!to_first)
                .then(|| farm_team(&pick.team_id)).flatten()
            {
                Some(farm) => (farm, "LEAGUE_KBL_FARM"),
                None => (pick.team_id.clone(), "LEAGUE_KBL"),
            };

            // 계약금은 **지명 구단**의 예산 지수로 정한다 (2군 팀이 아니라)
            let idx = params.team_index.get(&pick.team_id).copied().unwrap_or(1.0);
            let detail = match params.contract.as_ref() {
                Some(rules) => {
                    let (salary, bonus, years) = rules.for_pick(pick.pick, idx);
                    npc.current_salary = salary;
                    npc.contract_years = years;
                    format!("{}라운드 {}번 지명 · 계약금 {}만원", pick.round, pick.pick, bonus)
                }
                None => format!("{}라운드 {}번 지명", pick.round, pick.pick),
            };

            // career_history에는 실제 시즌 기록만 → 드래프트 이벤트는 career_events에 기록
            npc.career_events.push(NpcCareerEvent {
                year: params.result.year,
                event_type: "draft_picked".into(),
                from_team_id: from_team,
                to_team_id: Some(team_id.clone()),
                from_league_id: from_league,
                to_league_id: Some(league_id.into()),
                detail: Some(detail),
            });
            npc.current_league    = league_id.into();
            npc.current_team      = team_id;
            npc.grade             = None;   // 재학생이 지명되면 학적이 끝난다
            npc.school_id         = String::new();
            npc.pro_service_years = Some(0);
        }
    }

    // Step 3: 미지명자 진로. **경로를 본다** — 고교 졸업자만 대학에 갈 수 있다.
    // 예전엔 남는 자리부터 채워서 대졸 미지명자가 대학 1학년으로 다시 입학했다
    let mut placer = crate::draft::Placer::new(
        &result_npcs, &params.university_team_ids, &params.independent_team_ids,
        params.placement.clone().unwrap_or(crate::draft::PlacementRules {
            university_max: 40, independent_max: 45, independent_age_max: 31,
            // 폴백 — TS가 규칙 파일에서 계산해 넘긴다(`placementRulesFrom`)
            university_annual_max: None,
        }),
    );
    // 지명된 재학생은 곧 떠난다 — 집계에 남기면 그 팀이 한 명 덜 받는다
    for npc in result_npcs.iter() {
        if pick_map.contains_key(&npc.npc_id) { placer.forget(npc); }
    }

    let mut undrafted_idx: Vec<(usize, f64)> = result_npcs.iter().enumerate()
        .filter(|(_, n)| n.current_league == "LEAGUE_DRAFT_POOL" && undrafted.contains(&n.npc_id))
        .map(|(i, n)| (i, npc_core_ovr(n)))
        .collect();
    // 능력치 높은 순 — 좋은 선수가 먼저 자리를 잡는다
    undrafted_idx.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    for (idx, _) in undrafted_idx {
        // 마지막 경력이 고교면 대학 진학 가능. 대학·독립 출신은 안 된다
        let from_highschool = result_npcs[idx].career_history.last()
            .map_or(true, |e| e.league_id == "LEAGUE_HIGHSCHOOL");
        placer.place(
            &mut result_npcs[idx], params.result.year,
            "draft_undrafted", "미지명", from_highschool,
        );
    }

    result_npcs
}

pub fn determine_protagonist_draft(params: ProtagonistDraftParams) -> ProtagonistDraftOutcome {
    let score = params.scout_score * 0.6 + params.pitching_ovr * 0.4;

    let round = if      score >= 82.0 { 1 }
    else if score >= 68.0 { 2 }
    else if score >= 55.0 { 3 }
    else if score >= 44.0 { (4.0 + (55.0 - score) / 5.0).ceil() as i32 }
    else if score >= 30.0 { 9 }
    else                  { return ProtagonistDraftOutcome { drafted: false, round: None, pick: None, team_id: None }; };

    let round = round.min(10);  // DRAFT_ROUNDS = 10
    let teams = &params.team_ids;
    if teams.is_empty() {
        return ProtagonistDraftOutcome { drafted: false, round: None, pick: None, team_id: None };
    }

    let mut rng = LcgRand::new(
        (params.year as u32).wrapping_mul(997).wrapping_add((score.round() as u32).wrapping_mul(13))
    );
    let t_idx  = (rng.next() * teams.len() as f64) as usize % teams.len();
    let p_idx  = (rng.next() * teams.len() as f64) as usize % teams.len();
    let pick   = (round - 1) * teams.len() as i32 + p_idx as i32 + 1;

    ProtagonistDraftOutcome {
        drafted: true,
        round:   Some(round),
        pick:    Some(pick),
        team_id: Some(teams[t_idx].clone()),
    }
}

// ── 체육부대 후보 30명 공개 (W50 루머) ───────────────────────────────────────

pub fn calc_sports_unit_candidates(params: SportsUnitCandidatesParams) -> SportsUnitCandidatesResult {
    let mut sorted = params.candidates.clone();
    sorted.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap_or(std::cmp::Ordering::Equal));
    let top = sorted.into_iter().take(params.top_n).collect::<Vec<_>>();
    let protagonist_rank = top.iter().position(|c| c.is_protagonist).map(|i| i + 1);
    SportsUnitCandidatesResult { top_candidates: top, protagonist_rank }
}

// ── 체육부대 최종 선발 (W52 입대 신청자 기준) ─────────────────────────────────

pub fn calc_sports_unit_selection(params: SportsUnitSelectionParams) -> SportsUnitSelectionResult {
    let pool: Vec<(String, f64, String, String)> = params.applicants.iter()
        .map(|c| (c.id.clone(), c.ovr, c.team_id.clone(), c.position.clone()))
        .collect();
    // 주인공 선발 시에는 vacating_positions 없이 OVR 순 Phase2만 동작
    let selected = select_sports_unit_ids(&pool, &[], params.max_total, params.max_per_team);
    let protagonist_selected = params.applicants.iter()
        .any(|c| c.is_protagonist && selected.contains(&c.id));
    SportsUnitSelectionResult { protagonist_selected, selected_ids: selected.into_iter().collect() }
}

// ── 일반병 입대 대상 랜덤 선택 (시즌당 최대 max_count명) ─────────────────────

pub fn pick_general_enlistees(params: PickGeneralEnlisteesParams) -> PickGeneralEnlisteesResult {
    let mut ids = params.ids.clone();
    let mut rng = LcgRand::new(params.seed.wrapping_mul(2654435761));
    // Fisher-Yates 셔플
    let n = ids.len();
    for i in (1..n).rev() {
        let j = (rng.next() * (i + 1) as f64) as usize % (i + 1);
        ids.swap(i, j);
    }
    ids.truncate(params.max_count);
    PickGeneralEnlisteesResult { selected_ids: ids }
}

// ── 조기 입대 자발적 선택 결정 (25~27세, 주전 경쟁 탈락 선수) ─────────────────

pub fn calc_early_enlist_decisions(params: CalcEarlyEnlistParams) -> CalcEarlyEnlistResult {
    let mut rng = LcgRand::new(params.seed.wrapping_mul(1_234_567_891));
    let mut early_enlist_ids = Vec::new();

    for c in &params.candidates {
        let mut prob: f64 = 0.0;

        // 나이 보정: 나이 들수록 군대 미루는 게 손해
        prob += match c.age {
            27 => 0.20,
            26 => 0.12,
            25 => 0.05,
            _ => 0.0,
        };

        // OVR 하위권: 주전 경쟁에서 밀림
        if c.ovr_rank_pct < 0.20 {
            prob += 0.35;
        } else if c.ovr_rank_pct < 0.35 {
            prob += 0.20;
        }

        // 출장 시간 부족: 사실상 벤치 신세
        if c.playing_time_pct < 0.20 {
            prob += 0.30;
        } else if c.playing_time_pct < 0.35 {
            prob += 0.15;
        }

        // 계약 만료 임박: 재계약 불확실
        if c.contract_years_left <= 1 {
            prob += 0.20;
        }

        prob = prob.min(0.85);

        if rng.next() < prob {
            early_enlist_ids.push(c.id.clone());
        }
    }

    CalcEarlyEnlistResult { early_enlist_ids }
}

pub fn run_draft_board(params: DraftBoardParams) -> DraftBoardResult {
    let teams = &params.team_ids;
    let n_teams = teams.len() as i32;
    if n_teams == 0 || params.rounds == 0 {
        return DraftBoardResult { picks: vec![], user_drafted: false, user_round: None, user_pick_no: None, user_team_id: None };
    }

    let total = params.rounds * n_teams;
    let combined = params.protagonist_scout_score * 0.6 + params.protagonist_ovr * 0.4;
    let target_pick = ((108.0 - combined) / 2.2).round() as i32;
    let target_pick = target_pick.max(1).min(total) as usize;

    // 비주인공 후보를 드래프트 점수 내림차순 정렬
    let mut sorted: Vec<DraftBoardCandidate> = params.candidates.iter()
        .filter(|c| !c.is_user)
        .cloned()
        .collect();
    sorted.sort_by(|a, b| {
        let sa = a.ovr + (a.potential - 50.0) * 0.3 - (a.age as f64 - 19.0).max(0.0) * 3.0;
        let sb = b.ovr + (b.potential - 50.0) * 0.3 - (b.age as f64 - 19.0).max(0.0) * 3.0;
        sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
    });

    // 주인공을 target_pick 위치에 삽입
    let insert_pos = (target_pick - 1).min(sorted.len());
    let user_opt = params.candidates.iter().find(|c| c.is_user).cloned();
    if let Some(ref u) = user_opt {
        sorted.insert(insert_pos, u.clone());
    }

    let mut rng = LcgRand::new(
        (params.year as u32).wrapping_mul(1337).wrapping_add((sorted.len() as u32).wrapping_mul(7))
    );

    let mut drafted = vec![false; sorted.len()];
    let mut picks: Vec<DraftBoardPick> = Vec::with_capacity(total as usize);
    let mut user_drafted = false;
    let mut user_round = None;
    let mut user_pick_no = None;
    let mut user_team_id = None;

    'outer: for r in 1..=params.rounds {
        for t in 0..n_teams {
            let pick_no = (r - 1) * n_teams + t + 1;
            // 스네이크: 홀수 라운드 정방향, 짝수 라운드 역방향
            let team_slot = if r % 2 == 1 { t } else { n_teams - 1 - t };
            let team_id = teams[team_slot as usize].clone();

            // 미지명 후보 상위 35명 풀
            let pool: Vec<usize> = (0..sorted.len())
                .filter(|&i| !drafted[i])
                .take(35)
                .collect();

            if pool.is_empty() { break 'outer; }

            // 가중치 점수 계산 (noise [0, 6])
            let scores: Vec<f64> = pool.iter().map(|&i| {
                let c = &sorted[i];
                let age_penalty = (c.age as f64 - 19.0).max(0.0) * 3.0;
                let pot_bonus   = (c.potential - 50.0) * 0.3;
                let noise       = rng.next() * 6.0;
                (c.ovr + pot_bonus - age_penalty + noise).max(0.1)
            }).collect();

            let sel_pool_idx = weighted_pick(&scores, &mut rng);
            let sel_idx = pool[sel_pool_idx];
            drafted[sel_idx] = true;

            let is_user = sorted[sel_idx].is_user;
            if is_user {
                user_drafted = true;
                user_round    = Some(r);
                user_pick_no  = Some(pick_no);
                user_team_id  = Some(team_id.clone());
            }

            picks.push(DraftBoardPick {
                pick_no,
                round: r,
                team_id,
                candidate_id: sorted[sel_idx].id.clone(),
                is_user,
            });
        }
    }

    DraftBoardResult { picks, user_drafted, user_round, user_pick_no, user_team_id }
}

pub fn advance_protagonist_grade(params: ProtagonistGradeParams) -> ProtagonistGradeResult {
    if params.current_grade >= 3 {
        return ProtagonistGradeResult {
            new_grade: serde_json::Value::String("graduated".into()),
            is_graduating: true,
        };
    }
    let next = params.current_grade + 1;
    ProtagonistGradeResult {
        new_grade: serde_json::Value::Number(next.into()),
        is_graduating: false,
    }
}

// ── NPC 월간 성장 ─────────────────────────────────────────────────────────────

use crate::sim_types::{
    NpcLiveOutput, NpcMonthlyPerf, NpcTeamContext, GrowthXpRules,
    MonthlyNpcGrowthParams, MonthlyNpcGrowthResult,
};

/// 잠재력에 가까울수록 XP를 깎는다 — **잠재력이 실제 상한이 되게 한다.**
///
/// ⚠ 예전엔 `ratio >= 0.95`가 `0.10`이라 **잠재력을 넘어서도 계속 자랐다.**
/// 성장 배율이 작을 땐 티가 안 났지만(연 +0.3), 배율을 목표 곡선에 맞추자
/// 잠재력 105%인 선수도 연 +3.3씩 올랐다 — 잠재력이 아무 의미가 없어진다.
fn potential_cap(cur: f64, potential: f64) -> f64 {
    let ratio = cur / potential;
    if      ratio >= 1.00 { 0.00 }
    else if ratio <  0.75 { 1.00 }
    else if ratio <  0.85 { 0.70 }
    else if ratio <  0.95 { 0.35 }
    else                  { 0.10 }
}

/// ⚠ **정본은 `generation_rules.json`의 `growthRules.xp.ageBands`다.**
/// 여기 값은 규칙을 못 받았을 때의 폴백이다 — 규칙 파일과 같아야 하고
/// `npm run test:growth`가 두 표의 일치를 대조한다.
fn age_growth_factor(age: i32) -> f64 {
    match age {
        i32::MIN..=18 => 1.80,
        19..=21       => 1.41,
        22..=24       => 0.71,
        25..=27       => 0.52,
        28..=30       => 0.22,
        31..=32       => 0.08,
        _             => 0.00,
    }
}

/// 규칙이 있으면 그걸, 없으면 폴백 표를 쓴다
fn age_growth_factor_of(rules: Option<&GrowthXpRules>, age: i32) -> f64 {
    match rules {
        Some(r) => r.age_bands.iter()
            .find(|b| age <= b.max_age)
            .map(|b| b.f)
            .unwrap_or(0.0),
        None => age_growth_factor(age),
    }
}

/// ⚠ **정본은 `generation_rules.json`의 `growthRules.facilityFactor`다.**
/// 여기 값은 그걸 못 받았을 때의 폴백이고 규칙 파일과 같아야 한다 —
/// `npm run test:draft`가 두 표의 일치를 대조한다.
///
/// 예전엔 이 표가 유일한 정본이었고 **대학 0.95 < 고교 1.08**이라, 고교
/// 출신이 대학에 가면 성장이 오히려 느려졌다. 그래서 얼리 신청 하한(68)을
/// 넘는 사람이 유출량을 못 따라가 **대학 후보가 5년에 걸쳐 220→1로 말라붙었다**.
fn facility_factor(tier: &str) -> f64 {
    match tier {
        "1군"  => 1.00,
        "2군"  => 0.92,
        "대학" => 1.15,
        "고교" => 1.05,
        _      => 0.85,
    }
}

fn training_factor(ctx: &NpcTeamContext, phase: &str) -> f64 {
    let fac  = ctx.facility_factor.unwrap_or_else(|| facility_factor(&ctx.facility_tier));
    let mgr  = 0.75 + ctx.manager_development / 250.0;
    let cch  = 0.80 + ctx.coach_teaching / 200.0;
    let mult = match phase {
        "offseason"  => 1.50,
        "preseason"  => 1.25,
        "postseason" => 0.85,
        _            => 1.00,
    };
    fac * mgr * cch * mult
}

fn quality_factor(perf: &NpcMonthlyPerf, player_type: &str) -> f64 {
    if player_type == "pitcher" {
        if let Some(era) = perf.era {
            if era < 2.5 { return 1.40; }
            if era < 3.5 { return 1.15; }
            if era < 4.5 { return 1.00; }
            if era < 6.0 { return 0.80; }
            return 0.60;
        }
    } else {
        if let Some(avg) = perf.batting_avg {
            if avg > 0.300 { return 1.40; }
            if avg > 0.270 { return 1.15; }
            if avg > 0.240 { return 1.00; }
            if avg > 0.200 { return 0.80; }
            return 0.60;
        }
    }
    1.00
}

/// ⚠ **정본은 `generation_rules.json`의 `growthRules.xp`다** (`noPerfBase`,
/// `phaseWeight`). 여기 상수는 규칙을 못 받았을 때의 폴백이고 규칙 파일과
/// 같아야 한다 — `npm run test:growth`가 두 표를 대조한다.
fn perf_factor(
    perf: Option<&NpcMonthlyPerf>,
    phase: &str,
    player_type: &str,
    rules: Option<&GrowthXpRules>,
) -> f64 {
    let pw = rules.and_then(|r| r.phase_weight.as_ref());
    let phase_weight = match phase {
        "offseason"  => pw.map(|w| w.offseason).unwrap_or(0.70),
        "preseason"  => pw.map(|w| w.preseason).unwrap_or(0.80),
        "postseason" => pw.map(|w| w.postseason).unwrap_or(0.85),
        _            => pw.map(|w| w.season).unwrap_or(1.00),
    };
    let base = if let Some(p) = perf {
        let games = (p.games_played as f64 / 5.0).min(1.0);
        games * quality_factor(p, player_type)
    } else {
        rules.and_then(|r| r.no_perf_base).unwrap_or(0.70)
    };
    base * phase_weight
}

// 투수 스탯별 XP 비중 (나이에 따라 성장 방향 변화)
fn pitching_xp_weights(age: i32) -> &'static [(&'static str, f64)] {
    if age <= 23 {
        &[("velocity",0.35),("command",0.30),("control",0.20),("movement",0.15)]
    } else if age <= 28 {
        &[("command",0.40),("control",0.35),("velocity",0.15),("movement",0.10)]
    } else {
        &[("mentality",0.50),("recovery",0.30),("command",0.20)]
    }
}

// 타자 스탯별 XP 비중
fn batting_xp_weights(age: i32) -> &'static [(&'static str, f64)] {
    if age <= 23 {
        &[("contact",0.35),("eye",0.25),("speed",0.20),("power",0.20)]
    } else if age <= 28 {
        &[("contact",0.40),("power",0.35),("eye",0.25)]
    } else {
        &[("eye",0.50),("discipline",0.30),("battingClutch",0.20)]
    }
}

fn xp_threshold(v: f64) -> f64 { 7.5 + v * 0.35 }

// ── NPC 구종 시스템 ───────────────────────────────────────────────────────────

fn npc_pitch_target(role: &str, velocity: f64) -> usize {
    match role {
        "SP" => if velocity >= 70.0 { 4 } else { 5 },
        "CP" => if velocity >= 70.0 { 2 } else if velocity >= 60.0 { 3 } else { 4 },
        _    => if velocity >= 65.0 { 3 } else { 4 },  // RP 기본
    }
}

// grade 0 = 발견 중, 1~4 = 해당 grade → 다음 grade로 올리는 주당 progress
fn pitch_progress_per_week(current_grade: u8) -> f64 {
    match current_grade {
        0 => 100.0 / 8.0,   // 발견 → grade 1: 8주
        1 => 100.0 / 8.0,   // grade 1 → grade 2: 8주
        2 => 100.0 / 12.0,  // grade 2 → grade 3: 12주
        3 => 100.0 / 24.0,  // grade 3 → grade 4: 24주
        4 => 100.0 / 36.0,  // grade 4 → grade 5: 36주
        _ => 0.0,
    }
}

fn decide_pitch_training(
    age: i32,
    pitches: &[crate::sim_types::NpcPitchEntry],
    role: &str,
    velocity: f64,
    ovr: f64,
    potential: f64,
    catalog_ids: &[String],
    npc_id: &str,
) -> Option<crate::sim_types::NpcPitchTraining> {
    if age >= 33 { return None; }
    if potential > 0.0 && ovr / potential < 0.70 { return None; }

    let target = npc_pitch_target(role, velocity);

    // 목표 미달 + 29세 미만 → 새 구종 발견
    if pitches.len() < target && age < 29 && !catalog_ids.is_empty() {
        let known: HashSet<&str> = pitches.iter().map(|p| p.id.as_str()).collect();
        let candidates: Vec<&str> = catalog_ids.iter()
            .map(String::as_str)
            .filter(|id| !known.contains(id))
            .collect();
        if !candidates.is_empty() {
            let seed = npc_id.bytes().fold(0u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32));
            let mut lcg = LcgRand::new(seed.wrapping_add(pitches.len() as u32));
            let idx = ((lcg.next() * candidates.len() as f64) as usize).min(candidates.len() - 1);
            return Some(crate::sim_types::NpcPitchTraining {
                pitch_id: candidates[idx].to_string(),
                progress: 0.0,
                is_new:   true,
            });
        }
    }

    // 업그레이드 대상 → 가장 낮은 grade 구종 (grade 5 미만)
    let lowest = pitches.iter().filter(|p| p.grade < 5).min_by_key(|p| p.grade);
    if let Some(p) = lowest {
        return Some(crate::sim_types::NpcPitchTraining {
            pitch_id: p.id.clone(),
            progress: 0.0,
            is_new:   false,
        });
    }

    None
}

fn get_npc_pitching_stat(p: &NpcPitchingAttrs, stat: &str) -> f64 {
    match stat {
        "velocity"    => p.velocity,
        "command"     => p.command,
        "control"     => p.control,
        "movement"    => p.movement,
        "mentality"   => p.mentality,
        "stamina"     => p.stamina,
        "recovery"    => p.recovery,
        "clutch"      => p.clutch,
        "holdRunners" => p.hold_runners,
        _             => 0.0,
    }
}

fn set_npc_pitching_stat(p: &mut NpcPitchingAttrs, stat: &str, val: f64) {
    match stat {
        "velocity"    => p.velocity    = val,
        "command"     => p.command     = val,
        "control"     => p.control     = val,
        "movement"    => p.movement    = val,
        "mentality"   => p.mentality   = val,
        "stamina"     => p.stamina     = val,
        "recovery"    => p.recovery    = val,
        "clutch"      => p.clutch      = val,
        "holdRunners" => p.hold_runners = val,
        _             => {}
    }
}

fn get_npc_batting_stat(b: &NpcBattingAttrs, stat: &str) -> f64 {
    match stat {
        "contact"       => b.contact,
        "power"         => b.power,
        "eye"           => b.eye,
        "discipline"    => b.discipline,
        "speed"         => b.speed,
        "baseInstinct"  => b.base_instinct,
        "bunting"       => b.bunting,
        "platoon"       => b.platoon,
        "fielding"      => b.fielding,
        "arm"           => b.arm,
        "battingClutch" => b.batting_clutch,
        _               => 0.0,
    }
}

fn set_npc_batting_stat(b: &mut NpcBattingAttrs, stat: &str, val: f64) {
    match stat {
        "contact"       => b.contact       = val,
        "power"         => b.power         = val,
        "eye"           => b.eye           = val,
        "discipline"    => b.discipline    = val,
        "speed"         => b.speed         = val,
        "baseInstinct"  => b.base_instinct = val,
        "bunting"       => b.bunting       = val,
        "platoon"       => b.platoon       = val,
        "fielding"      => b.fielding      = val,
        "arm"           => b.arm           = val,
        "battingClutch" => b.batting_clutch = val,
        _               => {}
    }
}

fn calc_npc_pitching_ovr(p: &NpcPitchingAttrs) -> f64 {
    let w = p.velocity * 2.5 + p.command * 2.5 + p.control * 2.0
          + p.movement * 1.5 + p.stamina * 1.5 + p.mentality * 1.0
          + p.recovery * 0.5 + p.clutch * 0.3 + p.hold_runners * 0.2;
    (w / 12.0).round().max(1.0).min(99.0)
}

fn calc_npc_batting_ovr(b: &NpcBattingAttrs) -> f64 {
    let w = b.contact * 2.0 + b.power * 1.8 + b.eye * 1.5
          + b.discipline * 1.2 + b.speed * 1.3 + b.base_instinct * 0.7
          + b.bunting * 0.3 + b.platoon * 0.3 + b.fielding * 1.3
          + b.arm * 0.8 + b.batting_clutch * 0.6;
    (w / 11.8).round().max(1.0).min(99.0)
}

/// 주간 감퇴를 **누적해서** 반영한다.
///
/// ⚠ 예전엔 스탯에서 곧바로 뺐다. 그런데 `clamp_stat`이 매번 `round()`를
/// 하고 주당 감퇴량은 연 2.5를 52로 나눈 **0.048**이라 75 − 0.048 = 74.95 →
/// 75로 되돌아갔다. **전 연령에서 노화가 통째로 사라졌고**, 35세 투수를
/// 52주 굴려도 스탯이 하나도 안 변했다. 그래서 1군 31세 이상 117명이
/// 한 시즌 동안 전원 무변화였고, 베테랑이 자리를 안 비워 2군 유망주가
/// 올라갈 자리도 없었다.
///
/// 성장은 XP를 쌓아 임계값에서 +1 하므로 멀쩡했다. 노화도 같은 방식으로
/// `debt`에 쌓아 1.0을 넘을 때 −1 한다.
fn apply_weekly_aging_pitch(
    p: &mut NpcPitchingAttrs, age: i32, perf: Option<&NpcMonthlyPerf>, phase: &str,
    debt: &mut HashMap<String, f64>,
) {
    if age < 30 { return; }

    let perf_mod = if let Some(pf) = perf {
        let q = quality_factor(pf, "pitcher");
        if q >= 1.15 { 0.80 } else if q >= 1.00 { 1.00 } else { 1.20 }
    } else { 1.00 };
    let phase_mod = if phase == "offseason" { 0.85 } else { 1.00 };
    let mgmt = perf_mod * phase_mod;

    // 연간 감퇴량 (기존 apply_aging_decay 수치 기준)
    let (vel_y, sta_y, rec_y, cmd_y, ctrl_y) = match age {
        30..=32 => (1.00, 0.80, 0.20, 0.30, 0.30),
        33..=35 => (2.50, 2.00, 0.50, 3.20, 3.00),
        _       => (4.00, 3.50, 0.80, 5.00, 4.50),
    };

    let mut apply = |stat: &str, cur: &mut f64, yearly: f64| {
        let acc = debt.get(stat).copied().unwrap_or(0.0) + yearly / 52.0 * mgmt;
        let drop = acc.floor();
        if drop >= 1.0 {
            *cur = clamp_stat(*cur - drop);
            debt.insert(stat.to_string(), acc - drop);
        } else {
            debt.insert(stat.to_string(), acc);
        }
    };
    apply("velocity", &mut p.velocity, vel_y);
    apply("stamina",  &mut p.stamina,  sta_y);
    apply("recovery", &mut p.recovery, rec_y);
    apply("command",  &mut p.command,  cmd_y);
    apply("control",  &mut p.control,  ctrl_y);
    p.ovr = calc_npc_pitching_ovr(p);
}

/// 타자 주간 감퇴 — 투수와 같은 누적 방식 (위 주석 참고)
fn apply_weekly_aging_bat(
    b: &mut NpcBattingAttrs, age: i32, perf: Option<&NpcMonthlyPerf>, phase: &str,
    debt: &mut HashMap<String, f64>,
) {
    if age < 30 { return; }

    let perf_mod = if let Some(pf) = perf {
        let q = quality_factor(pf, "batter");
        if q >= 1.15 { 0.80 } else if q >= 1.00 { 1.00 } else { 1.20 }
    } else { 1.00 };
    let phase_mod = if phase == "offseason" { 0.85 } else { 1.00 };
    let mgmt = perf_mod * phase_mod;

    let (spd_y, pow_y) = match age {
        30..=32 => (0.80, 0.50),
        33..=35 => (2.00, 1.50),
        _       => (3.50, 2.80),
    };

    let mut apply = |stat: &str, cur: &mut f64, yearly: f64| {
        let acc = debt.get(stat).copied().unwrap_or(0.0) + yearly / 52.0 * mgmt;
        let drop = acc.floor();
        if drop >= 1.0 {
            *cur = clamp_stat(*cur - drop);
            debt.insert(stat.to_string(), acc - drop);
        } else {
            debt.insert(stat.to_string(), acc);
        }
    };
    apply("speed", &mut b.speed, spd_y);
    apply("power", &mut b.power, pow_y);
    b.ovr = calc_npc_batting_ovr(b);
}

pub fn calc_weekly_npc_growth(params: MonthlyNpcGrowthParams) -> MonthlyNpcGrowthResult {
    let mut rng = rand::thread_rng();
    let phase = params.current_phase.as_str();

    // 팀 컨텍스트 맵
    let ctx_map: HashMap<String, &NpcTeamContext> =
        params.team_contexts.iter().map(|c| (c.team_id.clone(), c)).collect();

    // 팀을 못 찾았을 때만 쓰는 폴백이다. `facility_factor: None`이면
    // `training_factor`가 `facility_tier` 기준 폴백 표를 쓴다
    let default_ctx = NpcTeamContext {
        team_id: String::new(),
        facility_tier: "독립".into(),
        facility_factor: None,
        manager_development: 50.0,
        coach_teaching: 50.0,
    };

    let xp_rules = params.xp_rules.as_ref();

    let updated: Vec<NpcLiveOutput> = params.npcs.into_iter().map(|mut npc| {
        let ctx = ctx_map.get(&npc.team_id).copied().unwrap_or(&default_ctx);
        let perf = params.perf_data.get(&npc.npc_id);

        let age_f     = age_growth_factor_of(xp_rules, npc.age);
        let trn_f     = training_factor(ctx, phase);
        let prf_f     = perf_factor(perf, phase, &npc.player_type, xp_rules);
        let dev_f     = npc.development_rate as f64 / 50.0;
        let rand_f    = 0.85 + rng.gen::<f64>() * 0.30;  // 0.85~1.15
        let potential = npc.potential_hidden.unwrap_or(75.0).clamp(60.0, 99.0);
        // A: 잠재력 속도 배율
        let speed_f   = 0.80 + (potential - 60.0) / 39.0 * 0.40;

        // 투/타 배율 — 정본은 generation_rules.json (없으면 폴백)
        let mult = match xp_rules {
            Some(r) => if npc.player_type == "pitcher" { r.multiplier_pitcher } else { r.multiplier_batter },
            None    => if npc.player_type == "pitcher" { 30.0 } else { 39.0 },
        };

        // 주간 기본 XP (월간 2.5를 4.3주로 나눠 주간 단위로 전환)
        let base_xp = if age_f > 0.0 {
            (2.5 / 4.3) * dev_f * age_f * trn_f * prf_f * rand_f * speed_f * mult
        } else {
            0.0
        };

        if npc.player_type == "pitcher" {
            if let Some(ref mut pit) = npc.pitching {
                // XP 배분 및 레벨업 (B: 스탯별 cap 보정 적용)
                if base_xp > 0.0 {
                    for &(stat, weight) in pitching_xp_weights(npc.age) {
                        let cur  = get_npc_pitching_stat(pit, stat);
                        // B: soft cap — 잠재력에 근접할수록 XP 감쇠
                        let cap_f = potential_cap(cur, potential);
                        let gain = base_xp * weight * cap_f;
                        let acc  = npc.pitching_xp.get(stat).copied().unwrap_or(0.0) + gain;
                        if acc >= xp_threshold(cur) {
                            set_npc_pitching_stat(pit, stat, clamp_stat(cur + 1.0));
                            npc.pitching_xp.insert(stat.to_string(), acc - xp_threshold(cur));
                        } else {
                            npc.pitching_xp.insert(stat.to_string(), acc);
                        }
                    }
                    pit.ovr = calc_npc_pitching_ovr(pit);
                }
                // 주간 에이징 감퇴 — 누적분(aging_debt)을 들고 다닌다
                apply_weekly_aging_pitch(pit, npc.age, perf, phase, &mut npc.aging_debt);
            }

            // ── 구종 훈련 진행 ──────────────────────────────────────────────
            // 1) 진행 중인 훈련 advance
            let training_done = if let Some(ref mut tr) = npc.pitch_in_training {
                let cur_grade = if tr.is_new {
                    0u8
                } else {
                    npc.pitches.iter().find(|p| p.id == tr.pitch_id).map(|p| p.grade).unwrap_or(0)
                };
                tr.progress += pitch_progress_per_week(cur_grade);
                tr.progress >= 100.0
            } else {
                false
            };

            // 2) 완료 처리
            if training_done {
                if let Some(tr) = npc.pitch_in_training.take() {
                    if tr.is_new {
                        if npc.pitches.len() < 5 {
                            npc.pitches.push(crate::sim_types::NpcPitchEntry {
                                id: tr.pitch_id, grade: 1,
                            });
                        }
                    } else if let Some(p) = npc.pitches.iter_mut().find(|p| p.id == tr.pitch_id) {
                        p.grade = (p.grade + 1).min(5);
                    }
                }
            }

            // 3) 오프시즌 + 훈련 없음 → 다음 훈련 결정
            if npc.pitch_in_training.is_none() && phase == "offseason" {
                let velocity  = npc.pitching.as_ref().map(|p| p.velocity).unwrap_or(50.0);
                let ovr       = npc.pitching.as_ref().map(|p| p.ovr).unwrap_or(50.0);
                npc.pitch_in_training = decide_pitch_training(
                    npc.age,
                    &npc.pitches,
                    &npc.pitcher_role,
                    velocity,
                    ovr,
                    potential,
                    &params.pitch_catalog_ids,
                    &npc.npc_id,
                );
            }
        } else {
            if let Some(ref mut bat) = npc.batting {
                if base_xp > 0.0 {
                    for &(stat, weight) in batting_xp_weights(npc.age) {
                        let cur  = get_npc_batting_stat(bat, stat);
                        let cap_f = potential_cap(cur, potential);
                        let gain = base_xp * weight * cap_f;
                        let acc  = npc.batting_xp.get(stat).copied().unwrap_or(0.0) + gain;
                        if acc >= xp_threshold(cur) {
                            set_npc_batting_stat(bat, stat, clamp_stat(cur + 1.0));
                            npc.batting_xp.insert(stat.to_string(), acc - xp_threshold(cur));
                        } else {
                            npc.batting_xp.insert(stat.to_string(), acc);
                        }
                    }
                    bat.ovr = calc_npc_batting_ovr(bat);
                }
                apply_weekly_aging_bat(bat, npc.age, perf, phase, &mut npc.aging_debt);
            }
        }

        let current_ovr = if npc.player_type == "pitcher" {
            npc.pitching.as_ref().map(|p| p.ovr).unwrap_or(0.0)
        } else {
            npc.batting.as_ref().map(|b| b.ovr).unwrap_or(0.0)
        };
        let peak = npc.peak_ovr.unwrap_or(0.0).max(current_ovr);

        let fame_delta = {
            let perf_entry = params.perf_data.get(&npc.npc_id).map(|p| NpcPerfEntry {
                games_played: p.games_played.max(0) as u32,
                era:          p.era,
                batting_avg:  p.batting_avg,
            });
            calc_npc_fame_delta(CalcNpcFameDeltaParams {
                npc_id:       npc.npc_id.clone(),
                current_fame: npc.current_fame,
                team_id:      npc.team_id.clone(),
                age:          npc.age as u32,
                perf:         perf_entry,
            })
        };

        NpcLiveOutput {
            npc_id:           npc.npc_id,
            pitching:         npc.pitching,
            batting:          npc.batting,
            pitching_xp:      npc.pitching_xp,
            batting_xp:       npc.batting_xp,
            peak_ovr:         peak,
            fame_delta,
            pitches:          npc.pitches,
            pitch_in_training: npc.pitch_in_training,
            aging_debt:       npc.aging_debt,
        }
    }).collect();

    MonthlyNpcGrowthResult { updated }
}

// ── 배경 고교 졸업생 드래프트 ─────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BgHsGraduate {
    pub id: String,
    pub player_type: String,
    pub pitch_ovr: Option<f64>,
    pub bat_ovr:   Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BgDraftAssignment {
    pub id:            String,
    pub new_league_id: String,
    pub new_team_id:   String,
    pub round:         Option<i32>,
    pub detail:        String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BgHsGraduateDraftParams {
    pub graduates:      Vec<BgHsGraduate>,
    pub kbl_teams:      Vec<String>,
    pub abl_teams:      Vec<String>,
    pub jbl_teams:      Vec<String>,
    pub univ_teams:     Vec<String>,
    pub ind_teams:      Vec<String>,
    pub picks_per_team: Option<i32>,
    pub season_year:    i32,
    pub seed:           u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BgHsGraduateDraftResult {
    pub assignments: Vec<BgDraftAssignment>,
}

pub fn bg_hs_graduate_draft(params: BgHsGraduateDraftParams) -> BgHsGraduateDraftResult {
    let picks = params.picks_per_team.unwrap_or(2) as usize;

    // OVR 내림차순 정렬 인덱스
    let grad_ovr = |g: &BgHsGraduate| -> f64 {
        if g.player_type == "pitcher" { g.pitch_ovr.unwrap_or(0.0) }
        else { g.bat_ovr.unwrap_or(0.0) }
    };
    let mut sorted: Vec<usize> = (0..params.graduates.len()).collect();
    sorted.sort_by(|&a, &b| grad_ovr(&params.graduates[b])
        .partial_cmp(&grad_ovr(&params.graduates[a]))
        .unwrap_or(std::cmp::Ordering::Equal));

    // 드래프트 슬롯 생성: KBL → ABL → JBL, picks 라운드 반복
    let mut slots: Vec<(String, String, i32)> = Vec::new();
    for round in 0..picks {
        let r = round as i32 + 1;
        for tid in &params.kbl_teams { slots.push(("LEAGUE_KBL".into(), tid.clone(), r)); }
        for tid in &params.abl_teams { slots.push(("LEAGUE_ABL".into(), tid.clone(), r)); }
        for tid in &params.jbl_teams { slots.push(("LEAGUE_JBL".into(), tid.clone(), r)); }
    }

    let mut assignments = Vec::new();
    let mut grad_iter = sorted.iter();

    // 프로 드래프트 배정
    for (league_id, team_id, round_num) in &slots {
        let Some(&gi) = grad_iter.next() else { break };
        let g = &params.graduates[gi];
        assignments.push(BgDraftAssignment {
            id:            g.id.clone(),
            new_league_id: league_id.clone(),
            new_team_id:   team_id.clone(),
            round:         Some(*round_num),
            detail:        format!("{} {}라운드 지명", league_id, round_num),
        });
    }

    // 미지명자 → 대학 → 독립 → 은퇴
    let mut roster: HashMap<String, (usize, usize)> = HashMap::new();
    for &gi in grad_iter {
        let g = &params.graduates[gi];
        let is_pitcher = g.player_type == "pitcher";
        if let Some(tid) = find_slot(&mut roster, is_pitcher, &params.univ_teams, 40) {
            assignments.push(BgDraftAssignment {
                id: g.id.clone(), new_league_id: "LEAGUE_UNIVERSITY".into(),
                new_team_id: tid, round: None, detail: "미지명 → 대학리그".into(),
            });
        } else if let Some(tid) = find_slot(&mut roster, is_pitcher, &params.ind_teams, 45) {
            assignments.push(BgDraftAssignment {
                id: g.id.clone(), new_league_id: "LEAGUE_INDEPENDENT".into(),
                new_team_id: tid, round: None, detail: "미지명 → 독립리그".into(),
            });
        } else {
            assignments.push(BgDraftAssignment {
                id: g.id.clone(), new_league_id: "LEAGUE_RETIRED".into(),
                new_team_id: "".into(), round: None, detail: "미지명 → 은퇴".into(),
            });
        }
    }

    BgHsGraduateDraftResult { assignments }
}
