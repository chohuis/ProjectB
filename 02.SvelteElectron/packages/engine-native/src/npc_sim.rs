use std::collections::{HashMap, HashSet};
use rand::Rng;

use crate::sim_types::*;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

fn clamp_f(v: f64, lo: f64, hi: f64) -> f64 { v.max(lo).min(hi) }
fn clamp_stat(v: f64) -> f64 { v.max(1.0).min(99.0).round() }

// ── 시드 기반 LCG (TS makeRand와 동일 알고리즘) ──────────────────────────────

struct LcgRand { s: u32 }

impl LcgRand {
    fn new(seed: u32) -> Self { LcgRand { s: seed } }
    fn next(&mut self) -> f64 {
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
    let strike_prob = clamp_f(0.58 + (ctl - 50.0) * 0.003 + (cmd - 50.0) * 0.002, 0.42, 0.72);
    if rng.gen::<f64>() >= strike_prob {
        let chase = clamp_f(0.28 - (discipline - 50.0) * 0.003, 0.10, 0.42);
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
    let out_rate = clamp_f(0.62  - (contact - 50.0) * 0.004, 0.40, 0.78);
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

    // 투수 또는 타자 데이터 없으면 시뮬 불가 — 기본 결과 반환
    if home_pit_q.is_empty() || away_pit_q.is_empty()
        || params.home_lineup.is_empty() || params.away_lineup.is_empty()
    {
        return SimGameResult {
            result: MatchResult {
                home_score: 0,
                away_score: 0,
                winner_id: String::new(),
                loser_id: String::new(),
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

fn npc_core_ovr(npc: &NpcSaveState) -> f64 {
    if npc.player_type == "pitcher" {
        npc.pitching.as_ref().map(|p| p.ovr).unwrap_or(0.0)
    } else {
        npc.batting.as_ref().map(|b| b.ovr).unwrap_or(0.0)
    }
}

#[allow(dead_code)]
fn apply_aging_decay(mut npc: NpcSaveState) -> NpcSaveState {
    let age = npc.age;
    if age < 30 { return npc; }
    let factor = if age >= 33 { 2.0 } else { 1.0 };

    if npc.player_type == "pitcher" {
        if let Some(p) = npc.pitching.take() {
            npc.pitching = Some(NpcPitchingAttrs {
                velocity: clamp_stat(p.velocity - 0.4 * factor),
                stamina:  clamp_stat(p.stamina  - 0.3 * factor),
                recovery: clamp_stat(p.recovery - 0.2 * factor),
                ovr:      clamp_stat(p.ovr      - 0.3 * factor),
                ..p
            });
        }
    } else if npc.player_type == "batter" {
        if let Some(b) = npc.batting.take() {
            npc.batting = Some(NpcBattingAttrs {
                speed:    clamp_stat(b.speed    - 0.4 * factor),
                power:    clamp_stat(b.power    - 0.2 * factor),
                fielding: clamp_stat(b.fielding - 0.2 * factor),
                ovr:      clamp_stat(b.ovr      - 0.3 * factor),
                ..b
            });
        }
    }
    npc
}

fn kbl_farm_team(team_id: &str) -> Option<&'static str> {
    match team_id {
        "PKT_Busan_GiantWhales"     => Some("TEAM_KBL_GIANTWHALES_2"),
        "PKT_Changwon_SteelDinos"   => Some("TEAM_KBL_STEELDINOS_2"),
        "PKT_Daegu_RoyalLions"      => Some("TEAM_KBL_ROYALLIONS_2"),
        "PKT_Daejeon_SoaringEagles" => Some("TEAM_KBL_SOARINGEAGLES_2"),
        "PKT_Gwangju_EmberTigers"   => Some("TEAM_KBL_EMBERTIGERS_2"),
        "PKT_Incheon_SkyGulls"      => Some("TEAM_KBL_SKYGULLS_2"),
        "PKT_Seoul_BearGuardians"   => Some("TEAM_KBL_BEARGUARDIANS_2"),
        "PKT_Seoul_TwinWolves"      => Some("TEAM_KBL_TWINWOLVES_2"),
        _ => None,
    }
}

fn is_kbl_farm_team(team_id: &str) -> bool {
    matches!(team_id,
        "TEAM_KBL_GIANTWHALES_2"  | "TEAM_KBL_STEELDINOS_2"  |
        "TEAM_KBL_ROYALLIONS_2"   | "TEAM_KBL_SOARINGEAGLES_2" |
        "TEAM_KBL_EMBERTIGERS_2"  | "TEAM_KBL_SKYGULLS_2"    |
        "TEAM_KBL_BEARGUARDIANS_2"| "TEAM_KBL_TWINWOLVES_2"
    )
}

fn roster_rule(league_id: &str) -> Option<(i32, i32)> {
    match league_id {
        "LEAGUE_HIGHSCHOOL"  => Some((18, 30)),
        "LEAGUE_UNIVERSITY"  => Some((20, 40)),
        "LEAGUE_INDEPENDENT" => Some((18, 45)),
        "LEAGUE_KBL"         => Some((40, 65)),
        "LEAGUE_ABL"         => Some((50, 90)),
        _ => None,
    }
}

// ── 은퇴 판정 + 로스터 캡 정규화 ────────────────────────────────────────────

fn normalize_offseason_npcs(
    npcs: Vec<NpcSaveState>,
    season_year: i32,
    summary: &mut SeasonEndSummary,
    logs: &mut Vec<String>,
    rng: &mut impl Rng,
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
            npc.career_history.push(history);
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

    for (key, indices) in &by_league_team {
        let league_id = key.split("::").next().unwrap_or("");
        let rule = match roster_rule(league_id) { Some(r) => r, None => continue };
        let (_min, max) = rule;

        if indices.len() as i32 > max {
            let overflow = indices.len() as i32 - max;
            let mut sorted_i = indices.clone();
            sorted_i.sort_by(|&a, &b| {
                let ovr_a = npc_core_ovr(&next[a]);
                let ovr_b = npc_core_ovr(&next[b]);
                ovr_a.partial_cmp(&ovr_b).unwrap_or(std::cmp::Ordering::Equal)
                    .then(next[b].age.cmp(&next[a].age))
            });
            for &idx in sorted_i.iter().take(overflow as usize) {
                let npc = &mut next[idx];
                if league_id == "LEAGUE_KBL" {
                    if let Some(farm) = kbl_farm_team(&npc.current_team) {
                        logs.push(format!("{} → 2군 강등", npc.name));
                        npc.current_team = farm.into();
                    } else {
                        logs.push(format!("{} → 독립리그", npc.name));
                        npc.current_league = "LEAGUE_INDEPENDENT".into();
                        npc.current_team   = "".into();
                    }
                } else if league_id == "LEAGUE_ABL" {
                    logs.push(format!("{} → 독립리그 (ABL 로스터 초과)", npc.name));
                    npc.current_league = "LEAGUE_INDEPENDENT".into();
                    npc.current_team   = "".into();
                } else {
                    logs.push(format!("{} 은퇴 (로스터 초과)", npc.name));
                    npc.career_status  = "retired".into();
                    npc.current_league = "LEAGUE_RETIRED".into();
                    npc.current_team   = "".into();
                    summary.retired_count += 1;
                }
            }
        }
    }

    next
}

// ── 오프시즌 전체 처리 ────────────────────────────────────────────────────────

pub fn run_offseason(params: OffseasonParams) -> OffseasonOutput {
    let mut rng = rand::thread_rng();
    let mut summary = SeasonEndSummary::default();
    let mut new_pending: Vec<NpcSaveState> = Vec::new();
    let season_year = params.season_year;

    let processed: Vec<NpcSaveState> = params.npcs.into_iter().map(|npc| {
        if npc.current_league == "LEAGUE_HIGHSCHOOL" { return npc; }

        let mut n = npc;

        // 1. 군 전역
        if n.career_status == "military" {
            if let Some(dy) = n.military_discharge_year {
                if dy <= season_year {
                    n.career_status   = "active".into();
                    n.military_status = "군필".into();
                    n.current_league  = "LEAGUE_INDEPENDENT".into();
                    n.current_team    = "".into();
                    summary.military_discharged_count += 1;
                }
            }
        }

        if n.career_status == "retired" || n.current_league == "LEAGUE_RETIRED" { return n; }

        // 2. 나이 +1
        n.age += 1;

        if n.current_league == "LEAGUE_DRAFT_POOL" || n.current_league == "LEAGUE_FREE_AGENT" { return n; }
        if n.career_status != "active" { return n; }

        // 3. 대학 학년 진급 + 졸업
        if n.current_league == "LEAGUE_UNIVERSITY" {
            if n.grade == Some(3) {
                let entry = NpcCareerEntry {
                    year: season_year,
                    league_id: "LEAGUE_UNIVERSITY".into(),
                    team_id: n.current_team.clone(),
                    stat_line: "-".into(),
                    highlights: vec![],
                };
                n.grade          = None;
                n.current_league = "LEAGUE_DRAFT_POOL".into();
                n.career_history.push(entry);
                new_pending.push(n.clone());
                summary.univ_graduated_count += 1;
                return n;
            } else if let Some(g) = n.grade {
                if g < 3 { n.grade = Some(g + 1); }
            }
            return n;
        }

        // 4. 에이징: 월간 감퇴(calc_monthly_npc_growth)로 이관, 오프시즌 중복 처리 제거

        // 5. 프로 연차 + FA
        if n.current_league == "LEAGUE_KBL" || n.current_league == "LEAGUE_ABL" {
            n.pro_service_years = Some(n.pro_service_years.unwrap_or(0) + 1);
            if n.pro_service_years.unwrap_or(0) >= 9 && rng.gen::<f64>() < 0.6 {
                n.current_league = "LEAGUE_FREE_AGENT".into();
                n.current_team   = "".into();
                summary.fa_count += 1;
                return n;
            }
        }

        // 6. 군입대 판정
        if n.military_status == "미필" {
            let is_kbl = n.current_league == "LEAGUE_KBL" || n.current_league == "LEAGUE_ABL";
            let threshold = if is_kbl { 27 } else { 24 };
            let chance    = if is_kbl { 0.25 } else { 0.35 };
            if n.age >= threshold && rng.gen::<f64>() < chance {
                n.career_status        = "military".into();
                n.military_status      = "현역".into();
                n.military_enlist_year = Some(season_year);
                n.military_discharge_year = Some(season_year + 2);
                n.current_league       = "LEAGUE_MILITARY".into();
                n.current_team         = "".into();
                summary.military_enlisted_count += 1;
                return n;
            }
        }
        n
    }).collect();

    // 7. 은퇴 판정 + 로스터 캡
    let mut logs: Vec<String> = Vec::new();
    let mut after_normalize = normalize_offseason_npcs(processed, season_year, &mut summary, &mut logs, &mut rng);

    // 8. FA → KBL 1군 재배치
    let kbl_teams: Vec<String> = {
        let mut seen: HashSet<String> = HashSet::new();
        after_normalize.iter()
            .filter(|n| n.current_league == "LEAGUE_KBL" && !is_kbl_farm_team(&n.current_team))
            .map(|n| n.current_team.clone())
            .filter(|t| seen.insert(t.clone()))
            .collect()
    };

    for npc in after_normalize.iter_mut() {
        if npc.current_league != "LEAGUE_FREE_AGENT" { continue; }
        if !kbl_teams.is_empty() {
            let idx = (rng.gen::<f64>() * kbl_teams.len() as f64) as usize % kbl_teams.len();
            npc.current_league = "LEAGUE_KBL".into();
            npc.current_team   = kbl_teams[idx].clone();
        } else {
            npc.current_league = "LEAGUE_INDEPENDENT".into();
            npc.current_team   = "".into();
        }
    }

    OffseasonOutput {
        npcs: after_normalize,
        pending_draft: [params.pending_draft, new_pending].concat(),
        summary,
        logs,
    }
}

// ── 학년 진급 ─────────────────────────────────────────────────────────────────

pub fn advance_grades(params: AdvanceGradesParams) -> GradeAdvanceResult {
    let mut updated   = Vec::new();
    let mut graduated = Vec::new();
    let season_year   = params.season_year;

    for npc in params.npcs {
        let is_hs = npc.current_league == "LEAGUE_HIGHSCHOOL"
            && npc.career_status == "active"
            && npc.grade.is_some();

        if !is_hs { updated.push(npc); continue; }

        let grade = npc.grade.unwrap();

        if grade == 3 {
            let entry = NpcCareerEntry {
                year: season_year,
                league_id: "LEAGUE_HIGHSCHOOL".into(),
                team_id: npc.current_team.clone(),
                stat_line: "-".into(),
                highlights: vec![],
            };
            let mut g = npc;
            g.grade          = None;
            g.age           += 1;
            g.current_league = "LEAGUE_DRAFT_POOL".into();
            g.career_history.push(entry);
            graduated.push(g.clone());
            updated.push(g);
        } else {
            let mut n = npc;
            n.grade = Some(grade + 1);
            n.age  += 1;
            updated.push(n);
        }
    }

    GradeAdvanceResult { updated, graduated }
}

// ── 신입생 생성 ───────────────────────────────────────────────────────────────

const SURNAMES:    &[&str] = &["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전"];
const SYLLABLES_A: &[&str] = &["민","준","현","재","우","지","도","성","진","동","태","수","영","혁","훈","기","상","정","세","찬"];
const SYLLABLES_B: &[&str] = &["준","혁","원","환","빈","욱","식","윤","완","호","진","우","기","수","민","찬","훈","성","재","현"];
const POSITIONS:   &[&str] = &["C","1B","2B","3B","SS","LF","CF","RF"];

fn gen_name(rng: &mut LcgRand) -> (String, String) {
    let sur = SURNAMES[(rng.next() * SURNAMES.len() as f64) as usize % SURNAMES.len()];
    let a   = SYLLABLES_A[(rng.next() * SYLLABLES_A.len() as f64) as usize % SYLLABLES_A.len()];
    let b   = SYLLABLES_B[(rng.next() * SYLLABLES_B.len() as f64) as usize % SYLLABLES_B.len()];
    (format!("{}{}{}", sur, a, b), format!("{} {}{}", sur, a, b))
}

fn make_pitching(ovr: f64, rng: &mut LcgRand) -> NpcPitchingAttrs {
    let stamina      = clamp_stat(ovr - 2.0  + (rng.next() - 0.5) * 12.0);
    let velocity     = clamp_stat(ovr + 4.0  + (rng.next() - 0.5) * 12.0);
    let command      = clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0);
    let control      = clamp_stat(ovr - 3.0  + (rng.next() - 0.5) * 12.0);
    let movement     = clamp_stat(ovr - 4.0  + (rng.next() - 0.5) * 12.0);
    let mentality    = clamp_stat(ovr        + (rng.next() - 0.5) * 12.0);
    let recovery     = clamp_stat(ovr - 6.0  + (rng.next() - 0.5) * 12.0);
    let clutch       = clamp_stat(ovr - 8.0  + (rng.next() - 0.5) * 12.0);
    let hold_runners = clamp_stat(ovr - 10.0 + (rng.next() - 0.5) * 12.0);
    NpcPitchingAttrs { ovr, stamina, velocity, command, control, movement, mentality, recovery, clutch, hold_runners }
}

fn make_batting(ovr: f64, rng: &mut LcgRand) -> NpcBattingAttrs {
    let contact       = clamp_stat(ovr - 2.0  + (rng.next() - 0.5) * 12.0);
    let power         = clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0);
    let eye           = clamp_stat(ovr - 3.0  + (rng.next() - 0.5) * 12.0);
    let discipline    = clamp_stat(ovr - 4.0  + (rng.next() - 0.5) * 12.0);
    let speed         = clamp_stat(ovr        + (rng.next() - 0.5) * 12.0);
    let base_instinct = clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0);
    let bunting       = clamp_stat(ovr - 15.0 + (rng.next() - 0.5) * 12.0);
    let fielding      = clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0);
    let arm           = clamp_stat(ovr - 5.0  + (rng.next() - 0.5) * 12.0);
    let batting_clutch = clamp_stat(ovr - 8.0 + (rng.next() - 0.5) * 12.0);
    NpcBattingAttrs {
        ovr, contact, power, eye, discipline, speed, base_instinct,
        bunting, platoon: 50.0, fielding, arm, batting_clutch,
    }
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
            player_type:    if is_sp { "pitcher".into() } else { "batter".into() },
            position,
            grade:          Some(1),
            age:            16,
            school_id:      params.school_id.clone(),
            graduation_year: params.season_year + 2,
            career_status:  "active".into(),
            current_league: "LEAGUE_HIGHSCHOOL".into(),
            current_team:   params.team_id.clone(),
            military_status: "미필".into(),
            pitching:       Some(make_pitching(ovr_p.round(), &mut rng)),
            batting:        Some(make_batting(ovr_b.round(),  &mut rng)),
            development_rate: dev_r.round() as i32,
            career_history:  vec![],
            achievements:    vec![],
            military_enlist_year:    None,
            military_discharge_year: None,
            pro_service_years:       None,
        });
    }
    result
}

// ── 드래프트 시뮬레이션 ───────────────────────────────────────────────────────

fn potential_bonus(tier: &str) -> f64 {
    match tier { "S" => 30.0, "A" => 20.0, "B" => 10.0, _ => 0.0 }
}

fn calc_draft_score(npc: &NpcSaveState, meta: Option<&NamedNpcMeta>) -> f64 {
    let ovr     = npc_core_ovr(npc);
    let pot     = meta.map(|m| potential_bonus(&m.pro_potential_tier)).unwrap_or(0.0);
    ovr * 0.6 + npc.development_rate as f64 * 0.3 + pot * 0.1
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
    let pool: Vec<&NpcSaveState> = params.candidates.iter()
        .filter(|n| n.current_league == "LEAGUE_DRAFT_POOL").collect();
    let year  = params.year;
    let mut rng = LcgRand::new(
        (year as u32).wrapping_mul(1337).wrapping_add((pool.len() as u32).wrapping_mul(7))
    );

    let mut picks: Vec<DraftPick> = Vec::new();
    let mut remaining_ids: Vec<String> = pool.iter().map(|n| n.npc_id.clone()).collect();
    let candidate_map: HashMap<String, &NpcSaveState> = params.candidates.iter()
        .map(|n| (n.npc_id.clone(), n)).collect();

    for r in 1..=params.rounds {
        let mut t = 0;
        while t < params.team_ids.len() as i32 && !remaining_ids.is_empty() {
            let pick_num = (r - 1) * params.team_ids.len() as i32 + t + 1;
            let scores: Vec<f64> = remaining_ids.iter().map(|id| {
                let npc = candidate_map[id];
                let base = calc_draft_score(npc, meta_map.get(id).copied());
                let noise = (rng.next() - 0.5) * (r as f64 * 8.0);
                (base + noise).max(0.1)
            }).collect();
            let idx = weighted_pick(&scores, &mut rng);
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

    DraftSimResult { year, picks, undrafted_ids: remaining_ids }
}

pub fn apply_draft(params: ApplyDraftParams) -> Vec<NpcSaveState> {
    let pick_map: HashMap<String, &DraftPick> = params.result.picks.iter()
        .map(|p| (p.npc_id.clone(), p)).collect();
    let undrafted: HashSet<String> = params.result.undrafted_ids.iter().cloned().collect();

    params.npcs.into_iter().map(|mut npc| {
        if npc.current_league != "LEAGUE_DRAFT_POOL" { return npc; }
        if let Some(pick) = pick_map.get(&npc.npc_id) {
            npc.career_history.push(NpcCareerEntry {
                year: params.result.year,
                league_id: "LEAGUE_DRAFT".into(),
                team_id: pick.team_id.clone(),
                stat_line: format!("드래프트 {}라운드 {}번 지명", pick.round, pick.pick),
                highlights: vec![format!("{}라운드 지명", pick.round)],
            });
            npc.current_league = "LEAGUE_KBL".into();
            npc.current_team   = pick.team_id.clone();
        } else if undrafted.contains(&npc.npc_id) {
            let ovr = npc_core_ovr(&npc);
            let go_independent = ovr >= 45.0;
            let stat_line = if go_independent { "미지명 → 독립리그" } else { "미지명 → 은퇴" };
            npc.career_history.push(NpcCareerEntry {
                year: params.result.year,
                league_id: "LEAGUE_DRAFT".into(),
                team_id: "".into(),
                stat_line: stat_line.into(),
                highlights: vec![],
            });
            if go_independent {
                npc.current_league = "LEAGUE_INDEPENDENT".into();
                npc.current_team   = "".into();
            } else {
                npc.career_status  = "retired".into();
                npc.current_league = "LEAGUE_RETIRED".into();
                npc.current_team   = "".into();
            }
        }
        npc
    }).collect()
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

pub fn advance_protagonist_grade(params: ProtagonistGradeParams) -> ProtagonistGradeResult {
    let new_age = params.current_age + 1;
    if params.current_grade == 3 {
        return ProtagonistGradeResult {
            new_grade: serde_json::Value::String("graduated".into()),
            new_age,
            is_graduating: true,
        };
    }
    let next = params.current_grade + 1;
    ProtagonistGradeResult {
        new_grade: serde_json::Value::Number(next.into()),
        new_age,
        is_graduating: false,
    }
}

// ── NPC 월간 성장 ─────────────────────────────────────────────────────────────

use crate::sim_types::{
    NpcLiveOutput, NpcMonthlyPerf, NpcTeamContext,
    MonthlyNpcGrowthParams, MonthlyNpcGrowthResult,
};

fn age_growth_factor(age: i32) -> f64 {
    match age {
        i32::MIN..=17 => 1.35,
        18..=20       => 1.20,
        21..=23       => 1.00,
        24..=26       => 0.70,
        27..=29       => 0.30,
        30..=32       => 0.08,
        _             => 0.00,
    }
}

fn facility_factor(tier: &str) -> f64 {
    match tier {
        "1군"  => 1.00,
        "2군"  => 0.88,
        "대학" => 0.95,
        "고교" => 1.08,
        _      => 0.78,
    }
}

fn training_factor(ctx: &NpcTeamContext, phase: &str) -> f64 {
    let fac  = facility_factor(&ctx.facility_tier);
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

fn perf_factor(perf: Option<&NpcMonthlyPerf>, phase: &str, player_type: &str) -> f64 {
    let phase_weight = match phase {
        "offseason"  => 0.20,
        "preseason"  => 0.50,
        "postseason" => 0.80,
        _            => 1.00,
    };
    let base = if let Some(p) = perf {
        let games = (p.games_played as f64 / 5.0).min(1.0);
        games * quality_factor(p, player_type)
    } else {
        0.40
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

// 월간 감퇴 (연간 총량의 1/12)
fn apply_monthly_aging_pitch(p: &mut NpcPitchingAttrs, age: i32, perf: Option<&NpcMonthlyPerf>, phase: &str) {
    if age < 30 { return; }

    let perf_mod = if let Some(pf) = perf {
        let q = quality_factor(pf, "pitcher");
        if q >= 1.15 { 0.80 } else if q >= 1.00 { 1.00 } else { 1.20 }
    } else { 1.00 };
    let phase_mod = if phase == "offseason" { 0.85 } else { 1.00 };
    let mgmt = perf_mod * phase_mod;

    // 연간 감퇴 / 12 (기존 apply_aging_decay 수치 기준)
    let (vel_y, sta_y, rec_y, cmd_y, ctrl_y) = match age {
        30..=32 => (1.00, 0.80, 0.20, 0.30, 0.30),
        33..=35 => (2.50, 2.00, 0.50, 3.20, 3.00),
        _       => (4.00, 3.50, 0.80, 5.00, 4.50),
    };

    p.velocity = clamp_stat(p.velocity - vel_y  / 12.0 * mgmt);
    p.stamina  = clamp_stat(p.stamina  - sta_y  / 12.0 * mgmt);
    p.recovery = clamp_stat(p.recovery - rec_y  / 12.0 * mgmt);
    p.command  = clamp_stat(p.command  - cmd_y  / 12.0 * mgmt);
    p.control  = clamp_stat(p.control  - ctrl_y / 12.0 * mgmt);
    p.ovr = calc_npc_pitching_ovr(p);
}

fn apply_monthly_aging_bat(b: &mut NpcBattingAttrs, age: i32, perf: Option<&NpcMonthlyPerf>, phase: &str) {
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

    b.speed = clamp_stat(b.speed - spd_y / 12.0 * mgmt);
    b.power = clamp_stat(b.power - pow_y / 12.0 * mgmt);
    b.ovr   = calc_npc_batting_ovr(b);
}

pub fn calc_monthly_npc_growth(params: MonthlyNpcGrowthParams) -> MonthlyNpcGrowthResult {
    let mut rng = rand::thread_rng();
    let phase = params.current_phase.as_str();

    // 팀 컨텍스트 맵
    let ctx_map: HashMap<String, &NpcTeamContext> =
        params.team_contexts.iter().map(|c| (c.team_id.clone(), c)).collect();

    let default_ctx = NpcTeamContext {
        team_id: String::new(),
        facility_tier: "독립".into(),
        manager_development: 50.0,
        coach_teaching: 50.0,
    };

    let updated: Vec<NpcLiveOutput> = params.npcs.into_iter().map(|mut npc| {
        let ctx = ctx_map.get(&npc.team_id).copied().unwrap_or(&default_ctx);
        let perf = params.perf_data.get(&npc.npc_id);

        let age_f     = age_growth_factor(npc.age);
        let trn_f     = training_factor(ctx, phase);
        let prf_f     = perf_factor(perf, phase, &npc.player_type);
        let dev_f     = npc.development_rate as f64 / 50.0;
        let rand_f    = 0.85 + rng.gen::<f64>() * 0.30;  // 0.85~1.15
        let potential = npc.potential_hidden.unwrap_or(75.0).clamp(60.0, 99.0);
        // A: 잠재력 속도 배율
        let speed_f   = 0.80 + (potential - 60.0) / 39.0 * 0.40;

        // 월간 기본 XP (성장이 있는 나이대만)
        let base_xp = if age_f > 0.0 {
            2.5 * dev_f * age_f * trn_f * prf_f * rand_f * speed_f
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
                        let cap_f = {
                            let ratio = cur / potential;
                            if      ratio < 0.75 { 1.00 }
                            else if ratio < 0.85 { 0.70 }
                            else if ratio < 0.95 { 0.35 }
                            else                 { 0.10 }
                        };
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
                // 월간 에이징 감퇴
                apply_monthly_aging_pitch(pit, npc.age, perf, phase);
            }
        } else {
            if let Some(ref mut bat) = npc.batting {
                if base_xp > 0.0 {
                    for &(stat, weight) in batting_xp_weights(npc.age) {
                        let cur  = get_npc_batting_stat(bat, stat);
                        let cap_f = {
                            let ratio = cur / potential;
                            if      ratio < 0.75 { 1.00 }
                            else if ratio < 0.85 { 0.70 }
                            else if ratio < 0.95 { 0.35 }
                            else                 { 0.10 }
                        };
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
                apply_monthly_aging_bat(bat, npc.age, perf, phase);
            }
        }

        let current_ovr = if npc.player_type == "pitcher" {
            npc.pitching.as_ref().map(|p| p.ovr).unwrap_or(0.0)
        } else {
            npc.batting.as_ref().map(|b| b.ovr).unwrap_or(0.0)
        };
        let peak = npc.peak_ovr.unwrap_or(0.0).max(current_ovr);

        NpcLiveOutput {
            npc_id:      npc.npc_id,
            pitching:    npc.pitching,
            batting:     npc.batting,
            pitching_xp: npc.pitching_xp,
            batting_xp:  npc.batting_xp,
            peak_ovr:    peak,
        }
    }).collect();

    MonthlyNpcGrowthResult { updated }
}
