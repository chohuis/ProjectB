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
    /// 한 걸음. `next`와 `RngCore`가 **같은 수열**을 쓰게 여기로 모은다
    fn step(&mut self) -> u32 {
        self.s = (self.s ^ (self.s >> 16)).wrapping_mul(0x045d9f3b);
        self.s = (self.s ^ (self.s >> 16)).wrapping_mul(0x045d9f3b);
        self.s ^= self.s >> 16;
        self.s
    }
    pub(crate) fn next(&mut self) -> f64 {
        (self.step() as f64) / 0xffffffff_u32 as f64
    }
}

// 🔴 **`thread_rng`을 대신 쓰려면 이 트레이트가 필요하다.**
//
// 오프시즌이 `thread_rng`을 써서 **같은 세이브·같은 씨앗도 실행마다 결과가
// 달랐다.** 실측: 같은 설정으로 test:foreign을 세 번 돌리면 외국인 교체율이
// 4.0 · 4.0 · 4.3으로 갈리고, "빈 슬롯을 남긴 팀이 없다" 검사가 **3회 중
// 1회** 빨간불이었다. 그 상태에서는
//   · 계측을 한 번 돌려서 전후를 비교할 수 없고
//   · 간헐 실패를 회귀와 구분할 수 없고
//   · 밸런스 값을 정할 근거를 만들 수 없다.
//
// `Rng`는 `RngCore`에 대해 자동 구현되므로 이것만 있으면 `gen::<f64>()`가 그대로 돈다.
impl rand::RngCore for LcgRand {
    fn next_u32(&mut self) -> u32 { self.step() }
    fn next_u64(&mut self) -> u64 {
        ((self.next_u32() as u64) << 32) | (self.next_u32() as u64)
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut i = 0;
        while i < dest.len() {
            let v = self.next_u32().to_le_bytes();
            let n = (dest.len() - i).min(4);
            dest[i..i + n].copy_from_slice(&v[..n]);
            i += n;
        }
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

// ── 게임 시뮬레이션 ──────────────────────────────────────────────────────────

fn cond_start_mod(pitcher_id: &str, conditions: &HashMap<String, SimPlayerCondition>) -> f64 {
    let fatigue = conditions.get(pitcher_id).map(|c| c.fatigue).unwrap_or(100.0);
    clamp_f(0.60 + fatigue * 0.004, 0.60, 1.0)
}

struct PitAccum { outs: i32, er: i32, h: i32, k: i32, bb: i32, pc: i32, risp_ab: i32, risp_h: i32 }
struct BatAccum { ab: i32, h: i32, hr: i32, rbi: i32, bb: i32, k: i32, sb: i32, risp_ab: i32, risp_h: i32 }

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
/// 베이스 상태. `Some(주자 lineup 인덱스)`.
///
/// ⚠ 예전엔 `[bool; 3]`이었다. 누가 나가 있는지를 안 들고 다니면 **도루를
/// 누구에게 붙일지 알 수 없다** — `sb: 0` 하드코딩이 그래서 남아 있었다.
type Bases = [Option<usize>; 3];

fn occupied(b: &Bases) -> [bool; 3] { [b[0].is_some(), b[1].is_some(), b[2].is_some()] }

fn apply_ab_result(
    result: &AbResult,
    bases: &mut Bases,
    batter_idx: usize,
    rng: &mut impl Rng,
) -> (i32, i32, bool, bool) {
    let (b1, b2, b3) = (bases[0], bases[1], bases[2]);
    match result {
        AbResult::K | AbResult::Out => {
            if matches!(result, AbResult::Out) && b3.is_some() && rng.gen::<f64>() < 0.10 {
                bases[2] = None;
                return (1, 1, false, false); // 희생플라이
            }
            (1, 0, false, false)
        }
        // 병살은 1루 주자를 지운다 — 예전엔 아웃 수만 늘리고 주자를 안 지워
        // 그 주자가 계속 남아 있었다(신분을 안 들고 다녀 티가 안 났다)
        AbResult::DoublePlay => { bases[0] = None; (2, 0, false, false) }
        AbResult::BB => {
            let runs = if b1.is_some() && b2.is_some() && b3.is_some() { 1 } else { 0 };
            bases[2] = if b1.is_some() && b2.is_some() { b2 } else { b3 };
            bases[1] = if b1.is_some() { b1 } else { b2 };
            bases[0] = Some(batter_idx);
            (0, runs, false, false)
        }
        AbResult::Single => {
            let mut runs = 0;
            if b3.is_some() { runs += 1; }
            let new_b3 = if b2.is_some() {
                if rng.gen::<f64>() < 0.45 { runs += 1; None } else { b2 }
            } else { None };
            bases[2] = new_b3;
            bases[1] = b1;
            bases[0] = Some(batter_idx);
            (0, runs, true, false)
        }
        AbResult::Double => {
            let mut runs = 0;
            if b3.is_some() { runs += 1; }
            if b2.is_some() { runs += 1; }
            let new_b3 = if b1.is_some() {
                if rng.gen::<f64>() < 0.5 { b1 } else { runs += 1; None }
            } else { None };
            bases[2] = new_b3;
            bases[1] = Some(batter_idx);
            bases[0] = None;
            (0, runs, true, false)
        }
        AbResult::Triple => {
            let mut runs = 0;
            for i in 0..3 { if bases[i].is_some() { runs += 1; bases[i] = None; } }
            bases[2] = Some(batter_idx);
            (0, runs, true, false)
        }
        AbResult::HR => {
            let mut runs = 1;
            for i in 0..3 { if bases[i].is_some() { runs += 1; bases[i] = None; } }
            (0, runs, true, true)
        }
    }
}

/// 위기 상황 보정 — **`match_engine`의 `clutch_modifier`·`jam_pressure_modifier`와
/// 같은 개념**을 리그 시뮬로 옮긴 것이다.
///
/// 리그 720경기는 이 함수를 타고, 주인공 경기만 `match_engine`을 탄다.
/// 한쪽에만 위기 보정이 있으면 **같은 리그에서 주인공만 성격이 성적에 닿는다.**
///
/// 반환값은 투수 능력치에 곱하는 배율이다. 폭을 좁게 잡는 이유: 위기 보정이
/// 크면 능력치보다 상황이 성적을 정하게 되고 OVR·성적 상관이 무너진다.
fn npc_clutch_mod(
    bases: &[bool; 3], outs: i32, inning: i32, score_diff: i32,
    pit_clutch: f64, pit_mentality: f64, bat_clutch: f64,
) -> f64 {
    use crate::tuning as T;
    let scoring_pos = bases[1] || bases[2];
    let late_close  = inning >= 7 && score_diff.abs() <= 3;
    if !scoring_pos && !late_close { return 1.0; }

    let mut pressure = 0.0;
    if scoring_pos {
        pressure += T::NPC_CLUTCH_SCORING_POS;
        if outs >= 2 { pressure += T::NPC_CLUTCH_TWO_OUT; }
        if bases[0] && bases[1] && bases[2] { pressure += T::NPC_CLUTCH_LOADED; }
    }
    if late_close { pressure += T::NPC_CLUTCH_LATE_CLOSE; }

    // 투수 기질이 압박을 덜어낸다. clutch 90이면 (90-50)*0.008 = 0.32 → 32% 완화
    let relief = ((pit_clutch - 50.0) * T::NPC_CLUTCH_PITCHER_SCALE
                + (pit_mentality - 50.0) * T::NPC_CLUTCH_MENTAL_SCALE).clamp(-0.6, 0.6);
    pressure *= 1.0 - relief;
    // 승부처에 강한 타자는 압박을 키운다
    pressure += (bat_clutch - 50.0) * T::NPC_CLUTCH_BATTER_SCALE;

    clamp_f(1.0 - pressure, T::NPC_CLUTCH_MIN, T::NPC_CLUTCH_MAX)
}

fn sim_half_inning_pitch(
    lineup: &[SimBatter],
    // 수비 팀 라인업 — **포수를 찾는 데만 쓴다**(도루 저지)
    def_lineup: &[SimBatter],
    lineup_pos: usize,
    pit: &SimPitcher,
    pit_stamina: f64,
    pit_outs: i32,
    start_cond_mod: f64,
    // 위기 보정 입력 — 이 둘이 없으면 후반 접전을 못 본다
    inning: i32,
    score_diff: i32,
    pit_map: &mut HashMap<String, PitAccum>,
    bat_map: &mut HashMap<String, BatAccum>,
    rng: &mut impl Rng,
) -> (i32, usize, i32, f64) {  // (runs, new_lineup_pos, new_pit_outs, new_stamina)
    let mut bases: Bases = [None; 3];
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
        .or_insert(PitAccum { outs: 0, er: 0, h: 0, k: 0, bb: 0, pc: 0, risp_ab: 0, risp_h: 0 });
    let acc_ptr = acc as *mut PitAccum;

    // 도루는 **투수 견제력**이 누른다. 이닝 내내 같은 투수이므로 한 번만 계산한다
    let hold_factor = crate::tuning::steal_hold_factor(pit.hold_runners);
    // 포수 송구 — **두 모델이 같은 규칙을 쓴다.** `match_engine`도 같은 항을 쓴다.
    // ⚠ 한쪽만 넣으면 주인공 기록과 리그 기록이 다른 척도가 된다
    //   (`match_engine`의 도루 주석이 같은 함정을 적어 뒀다).
    // 포수를 못 찾으면 중립(50)이다 — 옛 페이로드는 position이 비어 있다.
    let catcher_arm = def_lineup.iter()
        .find(|b| b.position == "C")
        .map(|b| b.arm)
        .unwrap_or(crate::tuning::STEAL_CATCHER_ARM_PIVOT);

    while outs < 3 {
        if lineup.is_empty() { outs += 1; cur_pit_outs += 1; continue; }

        // ── 도루 (타석 전) ──────────────────────────────────────────
        //
        // ⚠ **모델 두 벌 중 이쪽에만 없었다.** `match_engine`(주인공 경기)은
        // 도루를 돌리는데 여기(리그 720경기)는 `sb: 0`을 하드코딩했다 —
        // 리그 전체 도루가 0이라 도루왕이 구조적으로 안 나왔다.
        // 규칙·계수는 `tuning.rs`에 올려 **두 모델이 같은 값을 본다.**
        //
        // 도루 실패는 아웃이고 **투수 이닝에도 들어간다** — 주자 아웃도
        // 투수가 있는 동안 잡힌 아웃이다. 이걸 빼면 이닝이 짧아져
        // 9이닝당 지표가 전부 부푼다(주인공 쪽에서 겪은 결함과 같은 형태).
        for (from, to) in [(0usize, 1usize), (1usize, 2usize)] {
            if outs >= 3 { break; }
            let Some(ri) = bases[from] else { continue };
            if bases[to].is_some() { continue; }
            let r = &lineup[ri % n];
            let (attempt, success) = if from == 0 {
                crate::tuning::steal_second_probs(r.speed, r.base_instinct, hold_factor, 0.0, catcher_arm)
            } else {
                crate::tuning::steal_third_probs(r.speed, r.base_instinct, hold_factor, 0.0, catcher_arm)
            };
            if rng.gen::<f64>() >= attempt { continue; }
            if rng.gen::<f64>() < success {
                bases[to] = bases[from].take();
                bat_map.entry(r.id.clone())
                    .or_insert(BatAccum { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, risp_ab: 0, risp_h: 0 })
                    .sb += 1;
            } else {
                bases[from] = None;
                outs += 1;
                cur_pit_outs += 1;
                unsafe { (*acc_ptr).outs += 1; }
            }
        }
        if outs >= 3 { break; }

        let batter = &lineup[lpos % n];
        let batter_idx = lpos % n;
        lpos += 1;

        // 스태미나·컨디션과 **같은 축**으로 곱한다 — 능력치를 직접 흔드는 게
        // 아니라 그 순간의 실효 능력을 조정하는 것이다
        let cm  = npc_clutch_mod(&occupied(&bases), outs, inning, score_diff,
                                 pit.clutch, pit.mentality, batter.batting_clutch);
        // 득점권 = 2·3루 주자. **`npc_clutch_mod`의 판정과 같은 정의여야 한다** —
        // 보정을 받은 타석과 기록에 남는 타석이 다르면 스플릿이 보정을 못 보여준다
        let risp = bases[1].is_some() || bases[2].is_some();
        let q   = quality(stamina) * start_cond_mod * cm;
        let vel = pit.velocity * q;
        let cmd = pit.command  * q;
        let ctl = pit.control  * q;
        let mov = pit.movement * q;

        let (ab_result, pc) = sim_at_bat(
            vel, cmd, ctl, mov,
            batter.contact, batter.eye, batter.discipline, batter.power,
            &occupied(&bases), outs, rng,
        );
        stamina = (stamina - stamina_loss * pc as f64).max(0.0);

        let (outs_added, runs_scored, is_hit, is_hr) =
            apply_ab_result(&ab_result, &mut bases, batter_idx, rng);

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
        // ⚠ **득점권 기록을 따로 남긴다.** 위기 보정(`npc_clutch_mod`)이
        // 실제로 성적을 만드는지 시즌 ERA로는 못 본다 — 득점권은 전체
        // 타석의 25%뿐이라 희석되고, 기질 20↔90 차이(ERA 0.18)가 노이즈
        // (±0.14)에 묻힌다. **스플릿으로 보여줘야 성격이 기록에 드러난다** —
        // 실제 야구도 시즌 ERA가 아니라 상황별 성적으로 이걸 본다.
        //
        // 볼넷은 타수가 아니므로 제외한다(피안타율 분모를 맞춘다).
        if !is_bb {
            pa.risp_ab += risp as i32;
            if is_hit { pa.risp_h += risp as i32; }
        }

        let ba = bat_map.entry(batter.id.clone())
            .or_insert(BatAccum { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, risp_ab: 0, risp_h: 0 });
        if !is_bb {
            ba.ab += 1;
            ba.risp_ab += risp as i32;
            if is_hit { ba.risp_h += risp as i32; }
        }
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
    // ⚠ **마무리를 불펜에서 뺀다.** 호출측(`rosterEngine.getTeamBullpen`)이
    // 마무리를 불펜 목록에도 같이 넣어 보낸다. 그대로 두면 마무리가 점수순
    // 정렬에서 대개 맨 앞이라 **6~7회에 소모되고 9회에 남아 있지 않다.**
    // 뒤에 한 번 더 push하는 코드는 `any(id)` 가드에 걸려 아무 일도 안 했다.
    let closer_id = closer.as_ref().map(|c| c.id.as_str());
    for p in bullpen {
        if Some(p.id.as_str()) == closer_id { continue; }
        if !q.iter().any(|x| x.id == p.id) { q.push(p.clone()); }
    }
    if let Some(c) = closer {
        if !q.iter().any(|x| x.id == c.id) { q.push(c.clone()); }
    }
    q
}

pub fn sim_game(params: &SimGameParams) -> SimGameResult {
    // 씨앗이 있으면 결정적으로 — 경기 식별자를 섞어 경기마다 다르게 한다
    let mut rng: Box<dyn rand::RngCore> = if params.world_seed != 0 {
        Box::new(LcgRand::new(seed_of(
            params.world_seed ^ (params.week as u32).wrapping_mul(2654435761),
            &[params.schedule_id.as_str()])))
    } else {
        Box::new(rand::thread_rng())
    };

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

    // ⚠ **마무리가 한 번도 등판하지 않았다.**
    //
    // 큐가 [선발, 불펜..., 마무리] 순서인데 앞에서부터 소모한다. 9이닝 경기에서
    // 불펜을 전부 쓰는 일은 없으니 **맨 뒤의 마무리는 영영 안 나온다** —
    // 팀마다 제일 좋은 불펜이 놀고, `pitcher_decision`의 `is_closer`가 참이
    // 되는 투수가 없어 **리그 전체 세이브가 0**이었다(실측 규정투수 99~115명 전원).
    //
    // 실제 야구처럼 **접전 9회에 마무리를 낸다.** 요건은 세이브 판정과 같은
    // 상수를 쓴다 — 따로 적으면 "나왔는데 세이브는 안 붙는" 경기가 생긴다.
    let closer_pos = |q: &[SimPitcher], c: &Option<SimPitcher>| -> Option<usize> {
        let c = c.as_ref()?;
        q.iter().position(|p| p.id == c.id)
    };
    let h_closer_pos = closer_pos(&home_pit_q, &params.home_closer);
    let a_closer_pos = closer_pos(&away_pit_q, &params.away_closer);

    for inning in 1i32..=9 {
        // 홈 투수 교체
        if h_pit_idx + 1 < home_pit_q.len() {
            let max = *pit_max_map.get(&home_pit_q[h_pit_idx].id).unwrap_or(&27);
            if h_pit_outs >= max { h_pit_idx += 1; h_pit_outs = 0; }
        }
        if inning == 9 {
            let lead = home_score - away_score;
            if let Some(ci) = h_closer_pos {
                if lead > 0 && lead <= crate::tuning::SAVE_MAX_MARGIN && ci > h_pit_idx {
                    h_pit_idx = ci; h_pit_outs = 0;
                }
            }
        }
        let h_pit = &home_pit_q[h_pit_idx.min(home_pit_q.len().saturating_sub(1))];
        let h_cond = cond_start_mod(&h_pit.id, &params.conditions);
        let h_stamina = *pit_stamina_map.get(&h_pit.id).unwrap_or(&h_pit.stamina);

        // 원정 공격 (상반기)
        let (top_runs, new_away_lpos, new_h_outs, new_h_stamina) = sim_half_inning_pitch(
            &params.away_lineup, &params.home_lineup, away_lpos, h_pit, h_stamina, h_pit_outs, h_cond,
            inning, home_score - away_score,
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
        if inning == 9 {
            let lead = away_score - home_score;
            if let Some(ci) = a_closer_pos {
                if lead > 0 && lead <= crate::tuning::SAVE_MAX_MARGIN && ci > a_pit_idx {
                    a_pit_idx = ci; a_pit_outs = 0;
                }
            }
        }
        let a_pit = &away_pit_q[a_pit_idx.min(away_pit_q.len().saturating_sub(1))];
        let a_cond = cond_start_mod(&a_pit.id, &params.conditions);
        let a_stamina = *pit_stamina_map.get(&a_pit.id).unwrap_or(&a_pit.stamina);

        // 9회 말 홈팀 앞서면 walk-off
        if inning == 9 && home_score > away_score { break; }

        // 홈 공격 (하반기)
        let (bot_runs, new_home_lpos, new_a_outs, new_a_stamina) = sim_half_inning_pitch(
            &params.home_lineup, &params.away_lineup, home_lpos, a_pit, a_stamina, a_pit_outs, a_cond,
            inning, home_score - away_score,
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
                    &params.away_lineup, &params.home_lineup, away_lpos, ex_h, ex_h_st, 27, ex_h_cond,
                    ex_inning, home_score - away_score,
                    &mut pit_map, &mut bat_map, &mut rng,
                );
                away_score += t;
                away_lpos   = new_al;
                pit_stamina_map.insert(ex_h.id.clone(), new_ex_h_st);

                let ex_a = &away_pit_q[a_pit_idx.min(away_pit_q.len().saturating_sub(1))];
                let ex_a_cond = cond_start_mod(&ex_a.id, &params.conditions);
                let ex_a_st = *pit_stamina_map.get(&ex_a.id).unwrap_or(&ex_a.stamina);
                let (b, new_hl, _, new_ex_a_st) = sim_half_inning_pitch(
                    &params.home_lineup, &params.away_lineup, home_lpos, ex_a, ex_a_st, 27, ex_a_cond,
                    ex_inning, home_score - away_score,
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
    let pitcher_decision = |pit_id: &str, team_won: bool, pit_q: &[SimPitcher], final_idx: usize,
                            closer_id: Option<&str>| -> String {
        let acc = match pit_map.get(pit_id) { Some(a) => a, None => return "ND".into() };
        let is_starter = pit_q.first().map(|p| p.id == pit_id).unwrap_or(false);
        // ⚠ **자리가 아니라 신분으로 본다.** 예전엔 `pit_q.last()`와 비교했는데
        // 마무리가 불펜에 섞여 들어와 큐 중간에 있었다 — 등판해도 세이브가
        // 안 붙었고, 큐 마지막은 제일 약한 불펜이라 실질적으로 아무도
        // 세이브를 못 받았다(실측 규정투수 108~110명 전원 sv 0).
        let is_closer  = closer_id.is_some_and(|c| c == pit_id) && !is_starter;
        let _ = final_idx;
        if team_won {
            if is_starter && acc.outs >= 15  { return "W".into(); }
            if is_closer && margin <= crate::tuning::SAVE_MAX_MARGIN { return "SV".into(); }
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
        let closer_id = if is_home { params.home_closer.as_ref() } else { params.away_closer.as_ref() }
            .map(|c| c.id.as_str());
        let decision  = pitcher_decision(id, team_won, pit_q, final_idx, closer_id);
        let ip        = (acc.outs / 3) as f64 + (acc.outs % 3) as f64 / 10.0;
        player_lines.push(PlayerGameLine::Pitcher {
            player_id: id.clone(), ip, er: acc.er, h: acc.h, k: acc.k, bb: acc.bb, pc: acc.pc, decision,
            risp_ab: acc.risp_ab, risp_h: acc.risp_h,
        });
    }

    let all_batter_ids: HashSet<String> = params.home_lineup.iter().chain(params.away_lineup.iter())
        .map(|b| b.id.clone()).collect();
    for id in &all_batter_ids {
        // ⚠ **`ab > 0`으로 거르면 볼넷만 얻은 타자가 통째로 사라진다.**
        // 볼넷은 타수에 안 잡히므로, 그 경기에 타수 없이 볼넷만 있는 타자
        // (막판 출전·대타)의 볼넷이 기록에서 빠진다. 투수 쪽은 그 볼넷을
        // 정상 기록하니 **투타 대사가 어긋난다**(감사 실측 200경기당 0~8차).
        // 안타·삼진은 항상 타수를 동반해서 이 조건에 안 걸렸고, 그래서
        // 볼넷 하나만 조용히 새고 있었다.
        //
        // 출전 여부는 "타석에 섰는가"로 본다 — 타수 또는 볼넷이 있으면 출전이다.
        let acc = match bat_map.get(id) {
            Some(a) if a.ab > 0 || a.bb > 0 => a,
            _ => continue,
        };
        player_lines.push(PlayerGameLine::Batter {
            player_id: id.clone(), ab: acc.ab, h: acc.h, hr: acc.hr,
            rbi: acc.rbi, bb: acc.bb, k: acc.k, sb: acc.sb,
            risp_ab: acc.risp_ab, risp_h: acc.risp_h,
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
    events: &mut Vec<OffseasonEvent>,
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
            // 소속을 비우기 전에 떠둔다 — 아래에서 `current_team`이 지워진다
            let from_team = npc.current_team.clone();
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
            events.push(ev("retire_age", npc, Some(from_team), None));
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
            // 🔴 **보직 하한을 본다.** 예전엔 OVR 낮은 순으로만 밀어서
            // 야수가 14명이어도 계속 깎였다. 실측(KBL 1군 4시즌):
            //     release_roster/야수 25 · release_roster/투수 2
            // 정원 정리 하나가 야수를 12배 밀어냈고, 1군 야수 미달이
            // 2/10팀 → 5/10팀(최소 8)으로 나빠졌다.
            //
            // ⚠ 이 결함은 원래 있었는데 **생성 시점 OVR로 돌 땐 안 보였다** —
            // 투수·야수 분포가 생성값이라 고르게 섞였다. live를 넘기자
            // 성장·노쇠가 반영되면서 한쪽이 하위에 몰렸다.
            //
            // ⚠ **끝내 못 지키면 그냥 민다.** 정원 초과를 안 풀면 로스터가
            // 상한 위에서 굳는다 — 하한보다 상한이 먼저다.
            // `fill_first_teams`와 콜다운엔 같은 가드가 이미 있다.
            let is_first_team = !league_id.ends_with("_FARM")
                && matches!(league_id.as_str(),
                    "LEAGUE_KBL" | "LEAGUE_ABL" | "LEAGUE_JBL");
            let (mut pit_now, mut bat_now) = (0usize, 0usize);
            for &i in indices.iter() {
                if next[i].career_status != "active" { continue; }
                if next[i].player_type == "pitcher" { pit_now += 1; } else { bat_now += 1; }
            }
            // 하한을 지키며 고른 순서 → 남으면 나머지로 채운다
            let mut order: Vec<usize> = Vec::with_capacity(overflow as usize);
            let mut spare: Vec<usize> = Vec::new();
            for &i in sorted_i.iter() {
                if order.len() >= overflow as usize { break; }
                let is_pit = next[i].player_type == "pitcher";
                let ok = !is_first_team || if is_pit {
                    pit_now > crate::tuning::FIRST_TEAM_MIN_PITCHERS
                } else {
                    bat_now > crate::tuning::FIRST_TEAM_MIN_BATTERS
                };
                if ok {
                    if is_pit { pit_now -= 1; } else { bat_now -= 1; }
                    order.push(i);
                } else {
                    spare.push(i);
                }
            }
            for i in spare {
                if order.len() >= overflow as usize { break; }
                order.push(i);
            }
            for &idx in order.iter() {
                let (new_league, new_team) = {
                    let npc = &mut next[idx];
                    // 1군 초과는 2군으로 내린다 — **리그도 같이 바꾼다.**
                    // 팀만 `_2`로 바꾸면 그 선수는 여전히 1군 소속으로 집계돼
                    // 2군 상한이 영원히 안 걸린다 (KBL 700명의 원인)
                    match farm_league(&league_id).zip(farm_team(&npc.current_team)) {
                        Some((farm_lid, farm_tid)) => {
                            events.push(ev("demote_roster", npc, Some(npc.current_team.clone()), None));
                            npc.current_league = farm_lid.clone();
                            npc.current_team   = farm_tid.clone();
                            (Some(farm_lid), Some(farm_tid))
                        }
                        // 내릴 곳이 없으면 방출이다. 소속만 비워두면 12단계가
                        // 미지명자와 같은 로직으로 진로를 정한다 (독립 입단 또는 은퇴).
                        // 예전엔 여기서 바로 은퇴시켜 22세 신인이 방출 한 번에 끝났다
                        None if can_place => {
                            events.push(ev("release_roster", npc, Some(npc.current_team.clone()), None));
                            npc.current_team = "".into();
                            (None, None)
                        }
                        None => {
                            events.push(ev("retire_no_team", npc, Some(npc.current_team.clone()), None));
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

    fill_first_teams(&mut next, limits, events, is_foreign);
    // 충원 **뒤에** 돈다 — 새로 올라온 선수까지 보고 남은 공백만 전환한다
    fix_position_gaps(&mut next, season_year);
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
    events: &mut Vec<OffseasonEvent>,
    // 그해 성적 평점 (npcId → 0~100). 비면 능력치로 떨어진다
    perf: &HashMap<String, f64>,
    // 구단 성향 (teamId → 12축). 비면 default()
    profiles: &HashMap<String, crate::sim_types::ProTeamProfile>,
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
        // 🔴 **독립리그가 빠져 있었다.** 그래서 정리 경로가 없는 리그가 됐다 —
        // 9팀이 전부 정원 45로 꽉 차고 나이 중앙 28 · 상한(31) 초과 107명인
        // 채로 굳었고, 2027년부터 미지명자 유입이 **0명**이었다.
        //
        // ⚠ 나이로 자르는 게 아니다. 프로와 **같은 판정**을 태운다 — 성적이
        // 안 나오면 팀 기대에 못 미치는 것이고 그게 방출 사유다. 성적은
        // `perf_scores`로 온다(독립도 배경 리그라 `playerLines`가 쌓인다).
        //
        // ⚠ **리그를 여기 적는 방식 자체가 이 프로젝트의 반복된 결함이다.**
        // 해외를 열었을 때도 승강·FA·트레이드가 `LEAGUE_KBL` 하드코딩이라
        // "채우는 경로는 있는데 정리하는 경로가 없는 리그"가 됐다.
        // **새 리그를 열면 여기부터 본다.**
        if !matches!(n.current_league.as_str(),
            "LEAGUE_KBL" | "LEAGUE_KBL_FARM" | "LEAGUE_ABL" | "LEAGUE_ABL_FARM"
            | "LEAGUE_JBL" | "LEAGUE_JBL_FARM" | "LEAGUE_INDEPENDENT") { continue; }
        if is_foreign(n) { continue; }

        let (sum, cnt) = team_salaries.get(&n.current_team).copied().unwrap_or((0, 1));
        let market = (sum / cnt.max(1) as i64).max(1);
        let ovr = npc_core_ovr(n);

        let res = eval_release_priority(EvalReleaseParams {
            team_profile: profiles.get(&n.current_team).cloned().unwrap_or_default(),
            player: RosterPlayerRef {
                id: n.npc_id.clone(), position: n.position.clone(), age: n.age, ovr,
                salary: n.current_salary, remaining_years: n.contract_years,
                pro_service_years: n.pro_service_years.unwrap_or(0),
                registrable: true,
                is_prospect: n.current_team.ends_with("_2"),
                personality: n.personality.clone(), fame: n.fame, perf: None,
                is_foreign: false,   // 위에서 걸러졌다
            },
            // 🔴 **그해 성적이 있으면 그걸 본다.** 예전엔 능력치를 대용으로
            // 썼는데, 그 능력치마저 생성 시점 값이라 사실상 "태어날 때 실력"으로
            // 방출을 정하고 있었다. 성적은 호출부에서 넘어온다(`perfScores`).
            //
            // ⚠ 없으면 능력치로 떨어진다 — 아마추어·구 세이브·표본 0인 사람이다.
            // 그 폴백을 지우면 성적이 없는 리그가 통째로 방출 대상에서 빠진다
            recent_performance_rating: perf.get(&n.npc_id).copied().unwrap_or(ovr),
            roster_depth_at_position:
                depth.get(&(n.current_team.clone(), n.position.clone())).copied().unwrap_or(1),
            current_salary: n.current_salary,
            market_value: market,
            owner_relation: 0.0,          // NPC는 구단주 관계가 없다 (6C 설계)
            owner_relation_weight: 0.0,
        });
        // 리그별 임계값 — 없으면 공통값. 독립은 배점 구조가 달라 따로 둔다
        let thr = rules.threshold_by_league.get(&n.current_league)
            .copied().unwrap_or(rules.score_threshold);
        if res.release_score >= thr {
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

        events.push(ev("release_score", &npcs[idx], Some(team.clone()), Some(format!("{score:.0}"))));
        npcs[idx].current_team = String::new();
        npcs[idx].current_salary = 0;
        npcs[idx].contract_years = 0;
    }
    released
}

/// 육성선수 단년 계약 만료 — **성장했으면 재계약, 아니면 방출**.
///
/// 🔴 **이게 없어서 2군 육성 몫이 첫 해에 차고 영영 안 열렸다.** 육성선수는
/// `contract_years = 1`로 들어오는데(draft.rs "한 해 안에 증명해야 한다"),
/// 계약 만료 판정이 `market.ts`에 있고 거긴 `_1`(1군)만 훑는다. 실측:
///
///     연도   →2군   포기
///     2026     74    775      ← 첫 해에 팀당 10명을 채운다
///     2027      0    937      ← 그 뒤로 한 명도 못 들어간다
///     2030      0    971
///
/// 나가는 길이 셋 다 막혀 있었다 — 콜업은 OVR 42~64라 밀리고, 방출 2단계는
/// 점수가 과지급·부진·뎁스라 연봉 2000에 젊으면 안 걸린다.
///
/// ⚠ **비교 기준은 입단 시점이 아니라 직전 판정 시점이다.** 육성선수는
/// 열여덟·아홉이라 입단 대비로는 거의 다 성장해서, 그렇게 재면 아무도 안
/// 나가고 위 실측이 그대로 남는다. 판정할 때마다 기준을 갱신한다.
///
/// ⚠ **입단 연도에는 안 건다.** 그 해엔 5월까지 1군 등록도 안 되므로
/// 증명할 기회 자체가 없다.
///
/// 방출자는 소속만 비운다 — 진로 배정(12단계)이 독립·은퇴를 정한다.
/// `release_second_stage`와 같은 모양이다.
/// 독립리그 연봉 갱신 — **성적과 능력치로 벌린다.**
///
/// 🔴 프로는 매년 재계약으로 연봉이 벌어지는데(`market.ts`의 재계약 루프),
/// 그 루프는 `_1`(1군)만 돌아서 독립은 평생 첫 연봉 그대로였다. 그래서
/// 팀 평균 대비 편차가 없었고, 방출 산식의 과지급 항목(최대 +50점)이
/// 변별력을 잃었다 — 독립에서 아무도 안 잘린 이유의 절반이다.
///
/// ⚠ **산식을 새로 만들지 않는다.** `calc_npc_renewal_salary`가 정본이고
/// 프로 재계약이 쓰는 그 함수다. 따로 만들면 같은 세계에 연봉 기준이 둘이 된다.
///
/// ⚠ **성적이 없으면 건너뛴다.** 표본 미달자를 중립 50으로 갱신하면 안 뛴
/// 선수의 연봉이 조용히 움직인다.
fn renew_independent_salaries(
    npcs: &mut [NpcSaveState],
    perf: &HashMap<String, f64>,
    // 리그 연봉 배수 — 규칙 파일이 정본이다
    salary_mult: &HashMap<String, f64>,
) -> usize {
    let mut n_done = 0;
    for n in npcs.iter_mut() {
        if n.career_status != "active" { continue; }
        if n.current_league != "LEAGUE_INDEPENDENT" || n.current_team.is_empty() { continue; }
        let Some(score) = perf.get(&n.npc_id).copied() else { continue };
        let greed = n.personality.as_ref().map(|p| p.greed).unwrap_or(40.0);
        let next = crate::player_engine::calc_npc_renewal_salary(
            crate::player_engine::CalcNpcRenewalSalaryParams {
                // 규칙 파일의 배수를 그대로 넘긴다 — 코드에 표를 두 번 두지 않는다
                league_mult: salary_mult.clone(),
                ovr: npc_core_ovr(n),
                age: n.age,
                league_id: n.current_league.clone(),
                current_salary: n.current_salary.max(1),
                performance_score: score,
                greed,
            });
        if next != n.current_salary { n_done += 1; }
        n.current_salary = next;
    }
    n_done
}

fn expire_development_contracts(
    npcs: &mut [NpcSaveState],
    season_year: i32,
    events: &mut Vec<OffseasonEvent>,
) -> usize {
    let mut released = 0;
    for n in npcs.iter_mut() {
        let Some(since) = n.development_since else { continue };
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        if !n.current_league.ends_with("_FARM") { continue; }
        if since >= season_year { continue; }

        let now = npc_core_ovr(n).round() as i32;
        // 기준이 없으면 이번에 세운다 — 옛 세이브에서 넘어온 사람이다.
        // 여기서 방출하면 배선이 늦게 들어왔다는 이유로 사람을 자르게 된다
        let Some(base) = n.development_ovr else {
            n.development_ovr = Some(now);
            n.contract_years = 1;
            continue;
        };

        if now > base {
            n.development_ovr = Some(now);
            n.contract_years = 1;
        } else {
            let team = n.current_team.clone();
            events.push(ev("development_expired", n, Some(team.clone()),
                Some(format!("{base} → {now}"))));
            // ⚠ **선수 이력에도 남긴다.** 오프시즌 이벤트는 그 해 요약용이라
            // 진로 배정이 못 읽는다. 진로 배정은 이걸 보고 **같은 해에 같은
            // 자리로 되돌아오는 것**을 막는다 — 안 막으면 회전문이 된다.
            // 이력 화면에도 "재계약 불가"로 남는 게 맞다
            n.career_events.push(crate::sim_types::NpcCareerEvent {
                year: season_year,
                event_type: "development_expired".into(),
                from_team_id: Some(team),
                to_team_id: None,
                from_league_id: Some(n.current_league.clone()),
                to_league_id: None,
                detail: Some(format!("육성선수 재계약 불가 (OVR {base} → {now})")),
            });
            n.current_team = String::new();
            n.current_salary = 0;
            n.contract_years = 0;
            n.development_since = None;
            n.development_ovr = None;
            released += 1;
        }
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
    events: &mut Vec<OffseasonEvent>,
    // ⚠ **외국인은 2군에 못 내린다**(1군 전용 슬롯). 자리를 만들려고 투수를
    // 내릴 때 이걸 안 걸면 용병이 2군으로 밀려 보유 한도가 깨진다 —
    // 실제로 이 경로를 추가하자마자 `test:foreign`이 잡았다.
    is_foreign: &dyn Fn(&NpcSaveState) -> bool,
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
        let Some((min, max)) = roster_rule(&league_id, limits) else { continue };

        // ⚠ **야수 하한은 총원 가드 밖에서 본다.**
        //
        // 예전엔 `have >= min`이면 바로 빠져나갔다. 그런데 보직 배분이 깨지는
        // 팀은 **대개 총원이 차 있다** — 실측에서 야수 3명·투수 34명·총 37명인
        // 팀이 나왔고, 총원이 min(26)을 넘으니 이 함수가 한 번도 안 돌았다.
        // 정확히 필요한 상황에서만 작동하지 않는 구조였다.
        let batters_now = npcs.iter()
            .filter(|n| n.career_status == "active" && n.current_team == team_id
                     && n.player_type != "pitcher")
            .count();
        let batter_short = crate::tuning::FIRST_TEAM_MIN_BATTERS.saturating_sub(batters_now);
        if have as i32 >= min && batter_short == 0 { continue; }

        let farm_tid = format!("{base}_2");
        let pick_best = |npcs: &[NpcSaveState], want_pitcher: Option<bool>| -> Vec<usize> {
            let mut v: Vec<usize> = npcs.iter().enumerate()
                .filter(|(_, n)| n.career_status == "active" && n.current_team == farm_tid)
                .filter(|(_, n)| match want_pitcher {
                    Some(p) => (n.player_type == "pitcher") == p,
                    None => true,
                })
                .map(|(i, _)| i)
                .collect();
            // 능력치 높은 순 — 2군에서 제일 나은 선수가 올라간다
            v.sort_by(|&a, &b| npc_core_ovr(&npcs[b])
                .partial_cmp(&npc_core_ovr(&npcs[a])).unwrap_or(std::cmp::Ordering::Equal));
            v
        };

        let promote = |npcs: &mut [NpcSaveState], idx: usize, events: &mut Vec<OffseasonEvent>| {
            npcs[idx].current_league = league_id.clone();
            npcs[idx].current_team   = team_id.clone();
            events.push(ev("promote", &npcs[idx], Some(team_id.clone()), None));
        };

        // ① **야수 하한부터 채운다.** 능력치 순으로만 뽑으면 2군 상위권이
        // 투수에 몰렸을 때 투수만 올라와 로스터를 잠식한다(정본은 `tuning.rs`).
        //
        // 정원이 이미 찼으면 **투수를 내려 자리를 만든다.** 안 그러면 야수 3명인
        // 팀이 영영 그대로다 — 타순 한 바퀴도 못 채워 남은 타자의 타석이
        // 부풀고 통계가 왜곡된다.
        let mut used = 0usize;
        let mut room = (max as usize).saturating_sub(have);
        if batter_short > 0 {
            let want = batter_short;
            if room < want {
                // 능력치 낮은 투수부터 2군으로 — 콜다운과 같은 기준이다
                let mut pit: Vec<usize> = npcs.iter().enumerate()
                    .filter(|(_, n)| n.career_status == "active"
                                  && n.current_team == team_id
                                  && n.player_type == "pitcher"
                                  && !is_foreign(n))
                    .map(|(i, _)| i)
                    .collect();
                pit.sort_by(|&a, &b| npc_core_ovr(&npcs[a])
                    .partial_cmp(&npc_core_ovr(&npcs[b])).unwrap_or(std::cmp::Ordering::Equal));
                // ⚠ **투수 하한 아래로는 내리지 않는다.** 야수를 채우겠다고
                // 무한정 내리면 이번엔 등판이 무너진다 — 콜다운에서 똑같은
                // 결함이 나왔다(정본은 `tuning::FIRST_TEAM_MIN_PITCHERS`).
                // 외국인 투수는 애초에 `pit`에 없으니 총원(`pitchers_now`)으로 센다.
                let pitchers_now = npcs.iter()
                    .filter(|n| n.career_status == "active" && n.current_team == team_id
                             && n.player_type == "pitcher")
                    .count();
                let can_demote = pitchers_now
                    .saturating_sub(crate::tuning::FIRST_TEAM_MIN_PITCHERS)
                    .min(want - room);
                let farm_lid = farm_league(&league_id);
                for &idx in pit.iter().take(can_demote) {
                    if let (Some(fl), Some(ft)) = (farm_lid.clone(), farm_team(&team_id)) {
                        events.push(ev("demote_fielder", &npcs[idx], Some(team_id.clone()), None));
                        npcs[idx].current_league = fl;
                        npcs[idx].current_team   = ft;
                        room += 1;
                    }
                }
            }
            let cands = pick_best(npcs, Some(false));
            for &idx in cands.iter().take(want.min(room)) {
                promote(npcs, idx, events);
                used += 1;
            }
        }
        let need = (min as usize).saturating_sub(have);

        // ② 남은 자리는 보직 무관 상위 능력치로 채운다
        if used < need {
            let cands = pick_best(npcs, None);
            for &idx in cands.iter() {
                if used >= need { break; }
                if npcs[idx].current_team == team_id { continue; }  // ①에서 이미 올림
                promote(npcs, idx, events);
                used += 1;
            }
        }
    }
}

/// 판정용 씨앗 — 입력에서 만든다. TS `seedOf`와 **같은 규칙**이다(FNV-1a).
///
/// 🔴 엔진이 `thread_rng`을 쓰면 같은 세이브도 실행마다 결과가 다르다.
/// 그 상태에선 계측을 한 번 돌려 전후를 비교할 수 없고, 간헐 실패를
/// 회귀와 구분할 수 없다.
///
/// ⚠ **무엇을 섞느냐가 뜻을 정한다.** 팀을 섞으면 팀마다 다른 답이 나온다 —
///   FA 입찰이 그런 자리다. 안 섞으면 어느 팀이 물어도 같은 답이 된다.
/// ⚠ **0을 돌려주지 않는다.** 엔진이 0을 "씨앗 없음"으로 읽어 `thread_rng`로
///   떨어진다 — 고치려던 그 자리로 돌아간다.
fn seed_of(base: u32, parts: &[&str]) -> u32 {
    let mut h: u32 = 0x811c_9dc5 ^ base;
    for part in parts {
        for b in part.as_bytes() {
            h ^= *b as u32;
            h = h.wrapping_mul(0x0100_0193);
        }
    }
    if h == 0 { 1 } else { h }
}

/// 오프시즌 사건 한 건.
///
/// ⚠ **이름을 담지 않는다.** 화면이 `npcId`로 조회한다 — 은퇴자도 `npcs`에
/// 남으므로 조회된다. 팀 이름도 마찬가지로 ID만 넘긴다.
fn ev(kind: &str, npc: &NpcSaveState, from_team: Option<String>, detail: Option<String>)
    -> OffseasonEvent
{
    OffseasonEvent {
        kind:         kind.into(),
        npc_id:       npc.npc_id.clone(),
        from_team_id: from_team.filter(|t| !t.is_empty()),
        to_team_id:   None,
        detail,
    }
}

/// 간 곳이 있는 사건 (FA 계약처럼).
///
/// ⚠ `ev()`를 고치면 호출부 열여덟을 다 건드려야 한다 — 거기엔 간 곳이 없는
/// 사건만 있으므로 재료가 없는 자리에 `None`만 늘리는 셈이다.
fn ev_to(kind: &str, npc: &NpcSaveState, from_team: Option<String>, to_team: String,
         detail: Option<String>) -> OffseasonEvent
{
    OffseasonEvent {
        kind:         kind.into(),
        npc_id:       npc.npc_id.clone(),
        from_team_id: from_team.filter(|t| !t.is_empty()),
        to_team_id:   (!to_team.is_empty()).then_some(to_team),
        detail,
    }
}

/// 포지션 공백을 **남는 자리에서 전환해** 메운다 (Phase 2-b).
///
/// ⚠ **충원만으로는 못 메운다.** 정원이 찬 팀은 신입생·승격 대상이 아니라
/// 공백이 그대로 유지된다 — 실측에서 야수 12명인 고교 팀에 유격수가 0명이었다.
/// `fill_first_teams`가 총원만 보고 구성을 안 보던 것과 **같은 구조**다.
///
/// 실제 야구에서도 유틸리티 전환은 흔하다. 3루수가 셋이고 유격수가 없으면
/// 한 명을 돌린다. 능력치는 그대로 두고 자리만 바꾼다 — 이 모델의 수비는
/// `fielding` 단일 스탯이라 포지션별 보정이 없다.
///
/// **전 리그에 한 번에 적용된다** — 고교·대학·독립·프로 1군·2군의 충원 경로가
/// 각각 다른데, 공백이 생기는 방식은 같기 때문이다.
///
/// ⚠ **오프시즌 소식에는 안 올린다.** 이건 사건이 아니라 라인업 9명을 세우기
/// 위한 정합성 보정이고, 대상도 "그 자리에서 능력치가 가장 낮은 사람"이라
/// 승격도 강등도 아니다. 실측 한 시즌에서 **소식 213줄 중 99줄(46%)이
/// 이것**이었고 그중 93줄이 대학팀이었다 — 852명이 은퇴한 시즌인데.
///
/// ⚠ 대신 **경력 사건으로 남긴다.** 예전엔 `position`만 바꾸고 아무 기록도
/// 안 남겨서, 작년엔 3루수였던 선수가 왜 좌익수인지 알 방법이 없었다.
/// 정보가 있어야 할 자리와 없어야 할 자리가 정확히 뒤바뀌어 있었다.
pub(crate) fn fix_position_gaps(npcs: &mut [NpcSaveState], season_year: i32) {
    // 포수가 맨 앞이다 — 전문 요원이라 0명이면 경기가 성립하지 않는다
    const FIELD: [&str; 8] = ["C", "SS", "CF", "2B", "3B", "RF", "LF", "1B"];

    let mut by_team: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, n) in npcs.iter().enumerate() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        if n.player_type == "pitcher" { continue; }
        by_team.entry(n.current_team.clone()).or_default().push(i);
    }

    let mut keys: Vec<String> = by_team.keys().cloned().collect();
    keys.sort();   // HashMap 순회 순서에 기대지 않는다 (결정성)

    for team in keys {
        let idxs = match by_team.get(&team) { Some(v) => v.clone(), None => continue };
        if idxs.len() < FIELD.len() { continue; }   // 자리 수보다 적으면 전환해도 소용없다

        let mut cnt: HashMap<String, Vec<usize>> = HashMap::new();
        for &i in &idxs { cnt.entry(npcs[i].position.clone()).or_default().push(i); }

        for pos in FIELD {
            if cnt.get(pos).map_or(0, |v| v.len()) > 0 { continue; }
            // ⚠ **3명 조건만으로는 못 메운다.** 야수 14명을 8자리에 나누면
            // 대부분 1~2명씩이라 3명인 자리가 아예 없다 — 실측에서 야수 16명인
            // 대학 팀에 2루수가 0명인데도 전환이 안 걸렸다(공백 33팀 잔존).
            //
            // 그래서 두 번 본다: 여유 있는 자리(3명+)를 먼저 쓰고, 없으면
            // 2명인 자리에서 가져온다. **"백업이 없는 것"이 "아무도 없는 것"보다
            // 낫다** — 8포지션 전원 배치가 우선이다.
            let pick = |min: usize| FIELD.iter()
                .filter(|p| **p != pos)
                .filter(|p| cnt.get(**p).map_or(0, |v| v.len()) >= min)
                .max_by_key(|p| (cnt.get(**p).map_or(0, |v| v.len()), std::cmp::Reverse(**p)));
            let donor = pick(3).or_else(|| pick(2));
            let Some(from) = donor else { continue };
            let Some(pool) = cnt.get_mut(*from) else { continue };
            // 그 자리에서 능력치가 가장 낮은 사람을 돌린다 — 주전은 자리를 지킨다
            pool.sort_by(|&a, &b| npc_core_ovr(&npcs[a])
                .partial_cmp(&npc_core_ovr(&npcs[b])).unwrap_or(std::cmp::Ordering::Equal));
            let moved = pool.remove(0);
            let was = npcs[moved].position.clone();
            npcs[moved].career_events.push(NpcCareerEvent {
                year: season_year,
                event_type: "position_change".into(),
                from_team_id: Some(team.clone()),
                to_team_id: None,
                from_league_id: None,
                to_league_id: None,
                detail: Some(format!("{was} → {pos}")),
            });
            npcs[moved].position = pos.to_string();
            cnt.entry(pos.to_string()).or_default().push(moved);
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
    // 🔴 **예전엔 `thread_rng`이었다.** 같은 세이브·같은 씨앗도 실행마다
    // 결과가 달라서 계측을 한 번 돌려선 아무것도 판단할 수 없었다 —
    // test:foreign의 "빈 슬롯" 검사가 3회 중 1회 빨간불이었고, 외국인
    // 교체율이 4.0·4.0·4.3으로 갈렸다. 결정적 `LcgRand`가 **바로 옆에**
    // 있었는데 안 쓰고 있었다.
    //
    // ⚠ 씨앗에 연도를 섞는다. 세계 씨앗만 쓰면 해마다 같은 수열이 나온다.
    let seed = (params.world_seed ^ (params.season_year as u32).wrapping_mul(2654435761))
        .wrapping_mul(0x9e3779b1) | 1;
    let mut rng = LcgRand::new(seed);
    let mut lcg = LcgRand::new(
        (params.season_year as u32).wrapping_mul(3571)
    );
    let mut summary = SeasonEndSummary::default();
    let mut events: Vec<OffseasonEvent> = Vec::new();
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
            // 성적 배수 — **재계약도 성적을 본다**(사용자 확정 2026-08-24).
            //
            // 🔴 예전엔 OVR·연차·나이만 봐서, FA로 올린 몸값이 **이듬해 그대로
            //    되돌아갔다** — `faRules.perfSpan`이 1년짜리가 됐다.
            // ⚠ 폭은 FA보다 좁다. 구단이 불러 압도하는 자리다.
            // ⚠ **성적이 없으면 1.0**(중립) — 부상·2군 체류로 표본이 없는 사람을
            //   깎으면 안 뛴 사람을 벌하는 것이다. FA·방출 판정도 같다.
            let salary = match params.perf_scores.get(&n.npc_id) {
                Some(&score) if params.renew_perf_span > 0.0 => {
                    let m = 1.0 + (score / 50.0 - 1.0) * params.renew_perf_span;
                    ((salary as f64) * m).round() as i64
                }
                _ => salary,
            };
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
                // ⚠ **어느 부대를 다녀왔는지는 남긴다.** 예전엔 그냥 지워서
                // 전역 후 상무/현역 구분이 사라졌다 — 커리어에 표시할 수 없다
                n.military_served_unit  = n.military_unit.take();
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

    // 🔴 **FA 재배치가 외국인 한도를 안 봤다.** 정원(로스터 상한)만 보고
    // 붙여서 ABL·JBL 출신 FA가 KBL 팀에 쌓였다 — 실측 총원 113명(규칙대로면 30).
    // 이력이 그대로 남아 있었다:
    //     PLY_AB26_ABL_BAYSEALS_1_001 팀=TEAM_KBL_BUSAN_WAVES_1 [2028:fa_signed]
    //
    // 팀별 현재 외국인 수를 세 둔다. 아래 후보 필터가 이걸 본다.
    let mut team_foreign: std::collections::HashMap<String, (i32, i32)> =
        std::collections::HashMap::new();   // 팀 → (외국인 수, 그중 투수)
    for n in processed.iter() {
        if n.career_status != "active" { continue; }
        if n.current_team.is_empty() { continue; }
        if !is_foreign(n) { continue; }
        let e = team_foreign.entry(n.current_team.clone()).or_insert((0, 0));
        e.0 += 1;
        if n.player_type == "pitcher" { e.1 += 1; }
    }

    // 팀별 총연봉·포지션 인원 — **루프 앞에서 만든다.** 안에서 `processed`를
    // 다시 훑으면 가변 순회와 겹친다. 배정할 때마다 갱신한다 —
    // 안 하면 같은 오프시즌에 한 팀이 무제한으로 부른다
    let mut team_payroll: HashMap<String, i64> = HashMap::new();
    let mut team_at_pos: HashMap<(String, String), usize> = HashMap::new();
    for n in processed.iter() {
        if n.career_status != "active" || n.current_team.is_empty() { continue; }
        *team_payroll.entry(n.current_team.clone()).or_insert(0) += n.current_salary;
        *team_at_pos.entry((n.current_team.clone(), n.position.clone())).or_insert(0) += 1;
    }

    for npc in processed.iter_mut() {
        if npc.current_league != "LEAGUE_FREE_AGENT" { continue; }
        // FA 직전 리그 판별: original_league_id 우선, 없으면 KBL 기본값
        let origin_league = npc.original_league_id.as_deref()
            .filter(|l| !l.is_empty())
            .unwrap_or("LEAGUE_KBL");
        let max = roster_rule(origin_league, &params.roster_limits).map(|(_, m)| m);
        // 정원에 여유가 있는 팀만 후보다. 여유를 안 보면 FA가 캡을 통과한다
        // 이 선수가 **돌아갈 리그 기준**으로 외국인인가.
        // ⚠ `is_foreign`은 `current_league`를 보는데 지금은 LEAGUE_FREE_AGENT라
        //   늘 false다 — 그래서 여기서 원소속 리그로 다시 묻는다
        let fgn = foreign_leagues.iter().any(|l| l == origin_league)
            && npc.nationality.as_deref().unwrap_or("KOR")
               != home_nationality.get(origin_league).map(|s| s.as_str()).unwrap_or("KOR");
        let is_pit = npc.player_type == "pitcher";

        // 정원에 여유가 있는 팀만 후보다. 여유를 안 보면 FA가 캡을 통과한다.
        // **외국인이면 보유 한도까지 본다** — 안 보면 한 팀에 열댓 명이 쌓인다
        let open: Vec<&String> = league_teams.get(origin_league)
            .map(|teams| teams.iter().filter(|t| {
                let n = team_active_count.get(*t).copied().unwrap_or(0) as i32;
                if !max.map_or(true, |m| n < m) { return false; }
                if !fgn { return true; }
                let (held, pit) = team_foreign.get(*t).copied().unwrap_or((0, 0));
                if let Some(cap) = params.foreign_per_team { if held >= cap { return false; } }
                if is_pit {
                    if let Some(pc) = params.foreign_max_pitchers { if pit >= pc { return false; } }
                }
                true
            }).collect())
            .unwrap_or_default();

        if open.is_empty() {
            // 미계약 — 갈 팀이 없다. 진로(독립 입단·은퇴)는 D-4가 정한다.
            // ⚠ 떠난 팀은 `original_team_id`에만 남아 있다 — `current_team`은
            // FA 전환 때 이미 비었다
            events.push(ev("fa_unsigned", npc, npc.original_team_id.clone(), None));
            summary.fa_unsigned_count += 1;   // 갈 팀 자체가 없는 갈래도 센다
            npc.current_league = "LEAGUE_INDEPENDENT".into();
            npc.current_team   = "".into();
            continue;
        }
        // ── 구단 입찰 ─────────────────────────────────────────────
        //
        // 🔴 예전엔 `open` 중 **무작위**였다. 구단이 원하는지·얼마를 줄지가
        // 없어서 FA가 되면 전원이 계약했다(실측 미계약 0건).
        //
        // ⚠ **후보 선정(`open`)은 그대로 쓴다.** 정원·외국인 보유 한도·투수
        // 한도·원소속 리그를 이미 본다 — 이번에 외국인을 113 → 30으로 고친
        // 자리라 건드리면 그게 깨진다.
        let (team, signed_salary) = if params.fa_bid_interest_min > 0.0 {
            let ovr = npc_core_ovr(npc);
            // 시장 가치 — **세계 생성·드래프트·프로 재계약이 쓰는 그 함수다**(지수 곱선).
            //
            // 🔴 예전엔 둘 다 `current_salary`였고, 그 다음엔 `calc_npc_renewal_salary`
            //    (선형)를 썼다. 둘 다 틀렸다. 선형 산식은 독립리그처럼 연봉이 낮은
            //    리그에 맞춰졌고 상한이 `market * 1.35`인데, KBL 1군은 OVR 90이 실제
            //    13만인데 그 산식은 1.06만을 낸다 — **잘하는 선수일수록 심하게
            //    깎였다**(성적 80+ 구간 배수 중앙 0.17 · 성적 0~20은 0.43으로 더 낫았다).
            //
            // ⚠ **같은 세계에 연봉 산식이 둘이다.** 이름과 주석만 보고 고르면 틀린다 —
            //   `renew_independent_salaries` 주석은 선형 산식을 "프로 재계약이 쓰는
            //   그 함수"라고 적어 둔다. 실제 프로 재계약(7번 단계)은 이 함수를 쓴다.
            // ⚠ 팀 예산 지수는 1.0(평균팀)이다 — 재계약 호출부와 맞춘다. 팀별 차등은
            //   입찰의 `win_mult`와 상한이 따로 본다.
            // ⚠ 이 함수는 **성적을 안 받는다.** "잘하면 많이 오른다"는 아직 없다.
            let (want, _want_yrs) = estimate_salary_and_contract(
                ovr, origin_league, npc.pro_service_years.unwrap_or(0), npc.age, 1.0,
                &salary_rules, &mut rng);
            // 성적 배수 — **FA는 재계약과 달라야 한다.** 재계약은 구단이 불러 압도하지만
            // FA는 시장이 값을 매기는 자리라, 잘하면 많이 오르고 애매하면 내려야 한다.
            //
            // 🔴 예전엔 성적이 산식에 없어 배수가 `시장가 / 원래 연봉`의 함수였다 —
            //    연봉이 낮을수록 많이 올라서 **못한 선수가 더 오르는** 꺼꿔짐이었다
            //    (성적 0~20 구간 1.22 vs 80~100 구간 1.06).
            //
            // ⚠ **성적이 없으면 1.0이다**(중립). 부상· 2군 체류로 표본이 안 쌀인
            //   사람이 계약자의 29%다 — 그들을 깎으면 안 뛴 사람을 벌하는 것이다.
            //   방출 판정도 같은 이유로 표본 미달자를 건너뒄다.
            let want = match params.perf_scores.get(&npc.npc_id) {
                Some(&score) if params.fa_perf_span > 0.0 => {
                    // score 0~100 → (1 - span) ~ (1 + span)
                    let m = 1.0 + (score / 50.0 - 1.0) * params.fa_perf_span;
                    ((want as f64) * m).round() as i64
                }
                _ => want,
            };
            let mut best: Option<(String, i64)> = None;
            for tid in &open {
                // 그 팀이 지금 얇은 자리 — 같은 포지션이 1명 이하면 부족으로 본다
                let mut needs: Vec<String> = Vec::new();
                {
                    let payroll = team_payroll.get(*tid).copied().unwrap_or(0);
                    let at_pos = team_at_pos
                        .get(&((*tid).clone(), npc.position.clone())).copied().unwrap_or(0);
                    if at_pos <= 1 { needs.push(npc.position.clone()); }
                    let cap = params.team_payroll_cap.get(*tid).copied().unwrap_or(0).max(1);
                    // ⚠ **선수와 팀을 둘 다 섞는다.** 선수를 빼면 그해 전원이 같은
                    //   난수를 받고, 팀을 빼면 어느 구단이든 같은 값을 부른다.
                    let bid = crate::team_engine::eval_fa_bid(crate::team_engine::EvalFaBidParams {
                        seed: seed_of(
                            params.world_seed ^ (season_year as u32).wrapping_mul(2654435761),
                            &[npc.npc_id.as_str(), tid.as_str()]),
                        team_profile: params.team_profiles.get(*tid).cloned().unwrap_or_default(),
                        fa_player: crate::sim_types::FaPlayerRef {
                            id: npc.npc_id.clone(),
                            position: npc.position.clone(),
                            age: npc.age,
                            ovr,
                            market_value: want,
                            demand_salary: want,
                            demand_years: npc.contract_years.max(1),
                            fame: npc.fame,
                            personality: npc.personality.clone(),
                            pro_service_years: npc.pro_service_years.unwrap_or(0),
                            current_league: origin_league.to_string(),
                        },
                        roster_needs: needs,
                        salary_cap: cap,
                        current_payroll: payroll,
                        bid_floor_ratio: params.fa_bid_floor_ratio,
                    });
                    if bid.interest_level < params.fa_bid_interest_min { continue; }
                    // 1차는 최고 제시액으로 간다 — 선수의 선택은 2차다
                    if best.as_ref().map_or(true, |(_, s)| bid.bid_salary > *s) {
                        best = Some(((*tid).clone(), bid.bid_salary));
                    }
                }
            }
            match best {
                // 🔴 **이긴 구단의 제시액이 계약 연봉이다.** 예전어 이 값을
                // 버렸다(`Some((tid, _))`) — 구단이 얼마를 부를지 정해 놓고
                // 계약서에 안 적은 셈이라, FA를 거쳐도 몸값이 평생 고정이고
                // `team_payroll`도 옷 값으로 쌀였다.
                Some((tid, s)) => (tid, Some(s)),
                // 아무도 안 불렀다 — 미계약. 진로는 D-4가 정한다
                None => {
                    events.push(ev("fa_unsigned", npc, npc.original_team_id.clone(), None));
                    summary.fa_unsigned_count += 1;
                    npc.current_league = "LEAGUE_INDEPENDENT".into();
                    npc.current_team   = "".into();
                    continue;
                }
            }
        } else {
            // 입찰을 안 하는 예전 경로 — 제시액이 없으니 연봉도 안 건드린다
            let idx = (rng.gen::<f64>() * open.len() as f64) as usize % open.len();
            (open[idx].clone(), None)
        };
        // ⚠ **총연봉 누적보다 먼저 갱신한다** — 순서가 바뀌면 캡 계산이
        //   옛 연봉으로 돌아 같은 오프시즌의 뒷사람 판정이 어긋난다
        // 계약 성사를 남긴다. 예전엔 미계약만 사건이 있어
        // **구단이 누구를 얼마에 데려갔는지를 알 방법이 없었다** — 화면에도
        // 안 뜨고 계측도 못 했다. 성적과 전후 연봉을 같이 적는다.
        let before_salary = npc.current_salary;
        if let Some(s) = signed_salary { npc.current_salary = s; }
        if signed_salary.is_some() {
            summary.fa_signed_count += 1;
            let score = params.perf_scores.get(&npc.npc_id).copied();
            events.push(ev_to("fa_contract", npc, npc.original_team_id.clone(),
                team.clone(),
                Some(format!("{}→{}·{}", before_salary, npc.current_salary,
                    score.map_or("-".to_string(), |v| format!("{:.0}", v))))));
        }
        *team_active_count.entry(team.clone()).or_default() += 1;
        *team_payroll.entry(team.clone()).or_insert(0) += npc.current_salary;
        *team_at_pos.entry((team.clone(), npc.position.clone())).or_insert(0) += 1;
        // ⚠ **집계를 안 갱신하면 같은 주에 여럿이 같은 팀으로 몰린다** —
        //   한 명씩 볼 땐 다 여유가 있어 보인다
        if fgn {
            let e = team_foreign.entry(team.clone()).or_insert((0, 0));
            e.0 += 1;
            if is_pit { e.1 += 1; }
        }
        npc.current_league = origin_league.into();
        npc.current_team   = team;
        npc.original_league_id = None;
        npc.original_team_id   = None;
    }

    // 11. 은퇴 판정 + 로스터 캡
    let can_place = !params.independent_team_ids.is_empty();
    let mut after_normalize = normalize_offseason_npcs(
        processed, season_year, &mut summary, &mut events, &mut rng,
        &params.roster_limits, can_place, &is_foreign,
    );

    // 12. 소속을 잃은 사람들의 진로 — 방출자와 FA 미계약자.
    //
    // **미지명 졸업생과 같은 로직을 탄다** (`draft::Placer`). 따로 짜면 셋 중
    // 하나가 반드시 어긋난다. 예전엔 이들이 전부 "은퇴"로 처리돼
    // 22세 신인이 방출 한 번에 은퇴하고 있었다.
    // 11-b. 방출 2단계 — 정원 안이어도 성적·연봉으로 걸러낸다.
    // 진로 배정(12단계) **앞**에 있어야 방출자가 그 경로를 탄다
    // 11-b0. 독립리그 연봉 갱신. **방출 판정 앞**이어야 그해 성적이 반영된
    // 연봉으로 과지급을 잰다
    renew_independent_salaries(&mut after_normalize, &params.perf_scores,
        &params.salary_rules.as_ref().map(|r| r.league_mult.clone()).unwrap_or_default());

    if let Some(rr) = params.release_rules.as_ref() {
        release_second_stage(
            &mut after_normalize, rr, &params.roster_limits, &mut events,
            &params.perf_scores, &params.team_profiles, &is_foreign);
    }

    // 11-c. 육성선수 단년 계약 만료. 이것도 진로 배정 **앞**이어야 방출자가
    // 독립·은퇴로 갈린다. 여기서 빈 자리에 그해 미지명자가 들어간다
    expire_development_contracts(&mut after_normalize, season_year, &mut events);

    // 11-e. **방출로 빈 자리를 다시 채운다.**
    //
    // 🔴 `fill_first_teams`는 `normalize_offseason_npcs` 안(11단계)에 있어
    // **방출(11-b)보다 먼저** 돈다. 채운 뒤에 깎으니 그 자리가 그대로 남았고,
    // 그 뒤로 1군을 채우는 경로가 없다.
    //
    // 방출이 능력치 하나로만 돌던 시절엔 건수가 적어 안 보였다. 성적·성향을
    // 잇자 건수가 늘면서 드러났다 — 실측 KBL 1군 야수 미달이 2/10팀 →
    // 5/10팀(최소 8)이 됐고, 정원 정리에 보직 가드를 넣어 3/10까지만 돌아왔다.
    //
    // 이러면 사슬이 맞는다: **방출 → 2군에서 올림 → 2군은 진로 배정이 채움**.
    // 진로 배정(12단계)이 뒤에 오므로 2군이 얇아진 것도 같은 패스에서 메워진다.
    fill_first_teams(&mut after_normalize, &params.roster_limits, &mut events, &is_foreign);


    let mut leftover_pending = Vec::new();
    if can_place {
        // 졸업했는데 지명을 못 받은 사람도 같이 처리한다. 드래프트는 졸업 전(W47)에
        // 끝나므로, 여기 남아 있다는 건 미지명이라는 뜻이다
        let grad_start = after_normalize.len();
        after_normalize.extend(params.pending_draft.iter().cloned());

        let rules = params.placement.clone().unwrap_or(crate::draft::PlacementRules {
            university_max: 40, independent_max: 45, independent_age_max: 31,
            // 폴백 — TS가 규칙 파일에서 계산해 넘긴다(`placementRulesFrom`)
            university_annual_max: None, farm_max: 0,
            development_salary: None, development_max: 0,
        });
        let mut placer = crate::draft::Placer::new(
            &after_normalize, &params.university_team_ids, &params.independent_team_ids,
            &params.farm_team_ids, rules,
        ).with_salary(params.salary_rules.clone(), season_year as u32);
        let mut homeless: Vec<usize> = after_normalize.iter().enumerate()
            .filter(|(i, n)| n.career_status == "active"
                && (n.current_team.is_empty()
                    || n.current_league == crate::draft::DRAFT_POOL_LEAGUE
                    || *i >= grad_start))
            .map(|(i, _)| i)
            .collect();
        // ⚠ **능력치 순으로 돌린다.** 예전엔 인덱스 순이었고, 기존 NPC(방출자)가
        // 앞이고 졸업생(`idx >= grad_start`)이 뒤라 **방출자가 자리를 다 먹었다.**
        //
        // 실측: 육성선수 슬롯 100개(10팀 x 10)에 방출자가 연 ~95명 들어가서,
        // 미지명 졸업생은 2군 배정이 **0명**이었다 — 제도가 한쪽에만 열렸다.
        //
        // `apply_draft` 쪽 배정은 원래 능력치 순이다("좋은 선수가 먼저 자리를
        // 잡는다"). 같은 판정이 경로에 따라 기준이 달랐던 것이고, 실력으로
        // 가르면 방출자든 신인이든 같은 잣대를 받는다.
        homeless.sort_by(|&a, &b| {
            npc_core_ovr(&after_normalize[b])
                .partial_cmp(&npc_core_ovr(&after_normalize[a]))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

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
            // 마지막으로 뛴 팀. 이 시점엔 소속이 이미 비어 있다
            let last_team = after_normalize[idx].career_history.last()
                .map(|e| e.team_id.clone());
            placer.place(&mut after_normalize[idx], season_year, event, reason, from_hs);
            if after_normalize[idx].career_status == "retired" {
                quit += 1;
                // ⚠ 예전엔 이 841명이 **맨 아래 한 줄**이었다. 대학팀 수비 조정
                // 99줄 뒤에 "갈 팀을 못 찾아 그만둔 선수 841명" 한 줄
                events.push(ev("retire_no_team", &after_normalize[idx], last_team, None));
            }
        }
        if quit > 0 { summary.retired_count += quit as i32; }
    } else {
        leftover_pending = params.pending_draft;
    }

    // 13. **포지션 공백을 마지막에 한 번 더 메운다.**
    //
    // 🔴 `fix_position_gaps`는 11단계(`normalize_offseason_npcs` 안)에서 돈다.
    // 그런데 그 뒤에 방출(11-b)·육성 만료(11-c)·재충원(11-e)·진로 배정(12)이
    // 전부 선수를 움직인다 — **메운 뒤에 다시 벌어진다.**
    //
    // 실측: 시즌 중에는 공백이 **0팀**인데(237팀 전수 확인) 검사는 시즌종료·
    // 오프시즌직후에 포수 0팀을 1~4팀 잡았다. 공백이 오프시즌 안에서 생기고
    // 그 안에서 안 메워진다는 뜻이다.
    //
    // 이 세션에서 같은 형태를 세 번째로 만났다 — 방출이 충원보다 뒤에 와서
    // 채운 뒤에 깎았고, 콜업이 야수 총원을 안 봤고, 이번엔 공백 메우기다.
    // **같은 일을 하는 자리가 여럿이면 순서를 본다.**
    fix_position_gaps(&mut after_normalize, season_year);

    // ⚠ **요약 문장도 여기서 안 만든다.** 한 번 만들어 봤다가 화면과 숫자가
    // 어긋났다 — Rust는 **사건**을 세는데(방출 1170) 화면은 **사람**을 센다
    // (방출 45). 한 사람이 2군→방출→은퇴처럼 여러 사건을 겪기 때문이다.
    // 사람 단위로 합치는 규칙은 `offseasonReport.ts` 하나뿐이어야 하므로,
    // 요약 줄은 그쪽에서 만든다(`npcEngine.ts`).
    OffseasonOutput {
        npcs: after_normalize,
        pending_draft: [leftover_pending, new_pending].concat(),
        summary,
        logs,
        events,
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

/// 로마자 표기. **인덱스가 위 배열과 1:1이어야 한다** — 어긋나면 김씨가
/// Lee로 나온다. 배열을 늘릴 때 짝을 같이 늘려야 하고, 그걸 `check-namepair`가
/// 본다.
///
/// ⚠ 조합은 8,000가지지만 **음절 60개만 매핑하면 전부 커버된다.** 이게 이
/// 작업이 감당 가능한 이유다.
pub(crate) const SURNAMES_EN: &[&str] = &[
    "Kim","Lee","Park","Choi","Jung","Kang","Cho","Yoon","Jang","Lim",
    "Han","Oh","Seo","Shin","Kwon","Hwang","Ahn","Song","Ryu","Jeon",
];
pub(crate) const SYLLABLES_A_EN: &[&str] = &[
    "Min","Jun","Hyun","Jae","Woo","Ji","Do","Sung","Jin","Dong",
    "Tae","Soo","Young","Hyuk","Hoon","Ki","Sang","Jung","Se","Chan",
];
pub(crate) const SYLLABLES_B_EN: &[&str] = &[
    "jun","hyuk","won","hwan","bin","wook","sik","yoon","wan","ho",
    "jin","woo","ki","soo","min","chan","hoon","sung","jae","hyun",
];

/// (한글, 로마자). 로마자는 **이름-성** 순이다 — `Woo-chan Kim`.
///
/// ⚠ 두 번째 값이 예전엔 `"김 우찬"`(띄어쓴 한글)이었다. 이름이 `nameEn`
/// 필드에 들어가는데 **영문이 아니었다** — 영어 표기를 켜면 그대로 한글이 떴다.
pub(crate) fn gen_name(rng: &mut LcgRand) -> (String, String) {
    let i = (rng.next() * SURNAMES.len() as f64) as usize % SURNAMES.len();
    let j = (rng.next() * SYLLABLES_A.len() as f64) as usize % SYLLABLES_A.len();
    let k = (rng.next() * SYLLABLES_B.len() as f64) as usize % SYLLABLES_B.len();
    (
        format!("{}{}{}", SURNAMES[i], SYLLABLES_A[j], SYLLABLES_B[k]),
        format!("{}-{} {}", SYLLABLES_A_EN[j], SYLLABLES_B_EN[k], SURNAMES_EN[i]),
    )
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
    // ⚠ **시드가 학교 이름 길이였다.** 같은 길이의 학교가 **같은 난수열**을 쓴다 —
    // 102팀에 길이는 몇 종류뿐이라 충돌이 심하다. `needed_positions`가 비어
    // 전부 폴백으로 뽑히는 해엔 그 편향이 그대로 드러났다(실측 투수 비율
    // 목표 45%인데 32.5% — 표본 1,020이면 통계 오차로는 불가능한 차이다).
    // 글자 값을 섞어 학교마다 다른 스트림을 준다.
    let name_hash = params.school_id.bytes()
        .fold(2166136261u32, |h, b| (h ^ b as u32).wrapping_mul(16777619));
    let seed = name_hash.wrapping_mul(997)
        .wrapping_add((params.season_year as u32).wrapping_mul(31));
    let mut rng = LcgRand::new(seed);
    let talent = crate::sim_types::TalentRulesPayload::resolve(params.talent.as_ref());

    for i in 0..bulk_count as usize {
        let npc_id = format!("GEN_{}_Y{}_{:03}", params.school_id, params.season_year, params.id_offset as usize + i + 1);
        let (name, name_en) = match params.name_pool.as_ref() {
            Some(pool) => crate::roster_gen::gen_name_from_pool(pool, &mut rng),
            None => gen_name(&mut rng),
        };
        // **부족한 자리부터 채운다.** 목록이 모자라면 무작위로 넘어간다 —
        // 정본은 호출측이고(그쪽만 현재 로스터를 안다), 여기선 순서대로 쓴다
        let position = match params.needed_positions.get(i) {
            Some(p) if !p.is_empty() => p.clone(),
            _ => {
                // ⚠ **여기가 파이프라인 전체의 투수 비율을 정한다.**
                //
                // 예전엔 0.3이었다. 로스터 생성은 `pitcher_ratio`(0.45)로 만드는데
                // **신입생은 30%만 투수**라, 세대가 교체될수록 리그가 30%로 수렴한다.
                // 30명 로스터 기준 투수 13.5명 → 9명이다. 실측에서 고교 투수가
                // 23/102팀 미달이었고, 그 부족이 대학·독립·드래프트를 거쳐
                // 프로까지 그대로 내려갔다 — 구단당 투수 총량이 11~13명(하한 21).
                //
                // 2군에 육성선수를 넣어도 안 풀린 이유가 이것이다. **상류가 마르면
                // 하류에서 아무리 퍼도 안 찬다.**
                let pit_ratio = if params.pitcher_ratio > 0.0 { params.pitcher_ratio } else { 0.45 };
                if rng.next() < pit_ratio {
                    // ⚠ **선발 비중은 생성과 같아야 한다.** 0.55로 뒀더니 선발이
                    // 매년 불어나 6시즌에 리그 57 → 112명이 됐다(정본은 `tuning`)
                    if rng.next() < crate::tuning::SP_SHARE_OF_PITCHERS {
                        "SP".to_string()
                    } else { "RP".to_string() }
                }
                else { POSITIONS[(rng.next() * POSITIONS.len() as f64) as usize % POSITIONS.len()].to_string() }
            }
        };
        let is_sp = matches!(position.as_str(), "SP" | "RP" | "CP" | "P");
        let ovr_p = params.pitching_ovr_min + rng.next() * (params.pitching_ovr_max - params.pitching_ovr_min);
        let ovr_b = params.batting_ovr_min  + rng.next() * (params.batting_ovr_max  - params.batting_ovr_min);
        // ⚠ **천장과 속도를 같이 뽑는다.** 예전엔 속도만 균등 난수였고 천장은
        // `ovr_max * 1.15` 고정이라 **신입생 전원이 같은 천장**을 가졌다.
        // 소수(`tailRate`)에게만 높은 천장과 빠른 성장을 준다 — 나머지는 그대로다.
        let (pot_mult, dev_r) = crate::tuning::sample_talent(
            &talent, params.dev_rate_min, params.dev_rate_max,
            rng.next(), rng.next(), rng.next());

        result.push(NpcSaveState {
            npc_id,
            name,
            name_en: Some(name_en),
            nationality:    Some("KOR".into()),
            // 신입생은 학생이다 — 육성선수는 프로 2군에 들어갈 때만 붙는다
            development_since: None,
            development_ovr: None,
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
            // 천장은 **시작 능력치와 다른 상한**을 쓸 수 있다 — 육성선수가
            // 그 경우다(약하게 시작하되 클 수 있어야 한다)
            potential_hidden: (params.potential_ovr_max
                .unwrap_or_else(|| params.pitching_ovr_max.max(params.batting_ovr_max))
                * pot_mult)
                .clamp(ovr_p.max(ovr_b), 99.0),
            career_history:  vec![],
            career_events:   vec![],
            achievements:    vec![],
            military_enlist_year:    None,
            military_discharge_year: None,
            military_served_unit: None,
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

    // Phase 1: 전역 공백 포지션 채우기 (팀당 제한은 무시하되 **정원은 본다**)
    //
    // 🔴 예전엔 `max_total` 가드가 없었다. 호출부가 `&[]`를 넘기고 있어
    //    드러나지 않았을 뿐이다 — 전역자 포지션을 실제로 넘기자
    //    정원 13명에 **56명이 뒤혓다**(전역자 100건). 상무는 로스터 캅이
    //    안 걸리니(career_status가 military) 그 누수가 해마다 쌀인다.
    let mut remaining_vacancies = vacating_positions.to_vec();
    for (id, _, _, pos) in &sorted {
        if selected.len() >= max_total { break; }
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

/// 선수 한 명에 대한 **리그 전체의 평가 편차.**
///
/// ⚠ 없으면 보드가 점수 순 그대로라 **상위 110명이 매년 그대로 지명되고
/// 111위 아래는 보드에 뜨기만 하고 영영 안 뽑힌다.** 실제 드래프트는
/// 구단마다 평가가 갈려서 그렇게 안 흐른다.
///
/// 라운드 노이즈(`spread`)와 다르다. 그건 매 순번 새로 뽑혀 "누가 먼저"만
/// 흔들지만, 이건 **드래프트 내내 같은 값**이라 순위 자체를 재배열한다.
/// 시드가 (연도, npcId)라 같은 세계를 다시 열면 같은 결과가 나온다.
fn scout_bias(npc_id: &str, year: i32, magnitude: f64) -> f64 {
    // ⚠ **하위 비트를 섞어야 한다.** 처음엔 `h * 131 + b`만 돌리고 비트를
    // 잘라 썼는데, 끝 글자만 다른 ID들이 **전부 같은 편차**를 받았다
    // (`N000`~`N005` 여섯이 모두 -3.93). 그러면 섞이지 않는다.
    let mut h = npc_id.bytes().fold(
        (year as u32 as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15),
        |a, b| (a ^ b as u64).wrapping_mul(0x100_0000_01B3),   // FNV-1a
    );
    // splitmix64 마무리 — 인접 입력이 전혀 다른 출력이 되게
    h ^= h >> 30; h = h.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    h ^= h >> 27; h = h.wrapping_mul(0x94D0_49BB_1331_11EB);
    h ^= h >> 31;
    // 0..1을 둘 겹쳐 가운데가 두꺼운 분포로 — 큰 편차는 드물게
    let u = (h & 0xFFFF_FFFF) as f64 / 4_294_967_295.0;
    let v = (h >> 32) as f64 / 4_294_967_295.0;
    (u + v - 1.0) * magnitude
}

/// 평가 편차의 크기.
///
/// ⚠ **9는 신호를 덮었다.** "능력치 보정이 최대 +43"을 기준으로 잡았는데,
/// 그 폭은 후보 **전체**의 이야기다. 지명 대상 풀은 상위 220명으로 미리
/// 좁혀지므로 **실제 지명자의 점수 폭은 18.2점**(p5~p95)뿐이다.
/// 거기에 편차 ±9와 라운드 노이즈 ±7.5가 얹히면 흔들림이 신호와 맞먹는다.
///
/// 실측 603명: 라운드별 점수 중앙은 1R 84.0 → 11R 74.5로 제대로 내려가는데
/// **라운드별 OVR 중앙은 1R 80 · 11R 77로 평평**했고, 고교 3학년 투수 기준
/// 백분위로 보면 95백분위와 60백분위가 **똑같이 7R**이었다.
const SCOUT_BIAS: f64 = 4.0;

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
    // ⚠ 풀 좁히기와 지명에 **같은 편차**를 먹인다. 한쪽에만 주면 보드에 오른
    // 순서와 실제로 뽑히는 순서가 어긋나 화면이 거짓말을 한다
    let bias_of = |id: &str| scout_bias(id, year, SCOUT_BIAS);
    let mut scored: Vec<(String, f64)> = pool.iter()
        .map(|n| (
            n.npc_id.clone(),
            calc_draft_score(n, meta_map.get(&n.npc_id).copied()) + bias_of(&n.npc_id),
        ))
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
            // ⚠ **상한 15는 신호를 덮었다.** 지명자 점수 폭이 18.2점이라
            // ±7.5는 그 절반이다. 4R부터 사실상 순서가 사라졌고, 실측에서
            // 라운드별 OVR이 평평했다(1R 80 · 11R 77).
            //
            // 라운드가 깊을수록 평가가 갈리는 건 맞지만, 그 폭이 "능력치
            // 차이를 못 읽을 만큼"이면 안 된다. 상한을 신호 폭의 1/3로 둔다.
            let spread = (r as f64 * 1.2).min(6.0);
            let scored_now: Vec<f64> = remaining_ids.iter().map(|id| {
                let npc = candidate_map[id];
                let base = calc_draft_score(npc, meta_map.get(id).copied()) + bias_of(id);
                // 부족한 보직에 가점 — 팀 사정을 본다. 없으면 0이라 예전 그대로다
                let need = params.team_needs.get(&params.team_ids[t as usize]);
                let short = match need {
                    Some(nd) if npc.player_type == "pitcher" => nd.pitchers,
                    Some(nd) => nd.batters,
                    None => 0,
                };
                // **벗어난 정도에 비례한다.** 무조건 최대로 주면 살짝 기운 팀도
                // 능력치를 뒤집어서, 부족팀 지명이 100% 부족 보직이 됐다(실측).
                // 살짝 기운 팀은 거의 영향이 없고 크게 기운 팀만 뒤집는다.
                let sat = if params.need_saturation > 0.0 { params.need_saturation } else { 1.0 };
                let need_pt = if short > 0 {
                    (short as f64 * params.need_bonus / sat).min(params.need_bonus)
                } else { 0.0 };
                base + need_pt + (rng.next() - 0.5) * spread
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
        &params.farm_team_ids,
        params.placement.clone().unwrap_or(crate::draft::PlacementRules {
            university_max: 40, independent_max: 45, independent_age_max: 31,
            // 폴백 — TS가 규칙 파일에서 계산해 넘긴다(`placementRulesFrom`)
            university_annual_max: None, farm_max: 0,
            development_salary: None, development_max: 0,
        }),
    ).with_salary(params.salary_rules.clone(), params.result.year as u32);
    // 지명된 재학생은 곧 떠난다 — 집계에 남기면 그 팀이 한 명 덜 받는다
    for npc in result_npcs.iter() {
        if pick_map.contains_key(&npc.npc_id) { placer.forget(npc); }
    }

    // ⚠ **그해 후보였던 사람만 보면 안 된다.** 재도전 기한이 지나 후보에서
    // 빠진 사람은 `undrafted`에 없어서, 그것만 보면 소속 없는 채로 영영
    // 풀에 남는다 — 화면에도 안 뜨고 나이만 먹는 유령이 된다.
    // 풀에 있는 사람은 전부 갈 곳을 정해 준다.
    let mut undrafted_idx: Vec<(usize, f64)> = result_npcs.iter().enumerate()
        .filter(|(_, n)| n.current_league == "LEAGUE_DRAFT_POOL")
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

/// 드래프트 라운드 수 — TS `DRAFT_ROUNDS`와 같아야 한다 (10팀 × 11라운드)
const DRAFT_ROUNDS: i32 = 11;

/// 이 점수 아래는 미지명. **리그 백분위 기준**이라 "리그 중하위면 못 간다"는 뜻이다.
/// 너무 낮으면 "누구나 지명"이라 진로에 긴장이 없다 — 60회 조사에서 실제로
/// 미지명이 0건이었다
/// 이 아래는 미지명.
///
/// ⚠ **25는 아무도 못 거르는 값이었다.** 실측에서 백분위 33·55짜리도 부상만
/// 없으면 6~7R로 지명됐다 — 미지명 경로가 사실상 부상 하나뿐이었고, 사용자가
/// 정한 세 갈래("상위픽 / 무난하면 중간 / 애매하면 미지명") 중 하나가 없었다.
///
/// 같은 세계의 NPC는 **고교 3학년 투수 4805명 중 327명(6.81%)만** 고졸로
/// 지명된다. 백분위 93이 관문이고 그 지점의 **실측** score가 88이다.
///
/// 라운드 직선이 11R에서 끊기는 지점을 그대로 문턱으로 삼는다 — 어긋나면
/// 11R이 도달 불가가 되거나(문턱이 위) 12R 이상이 미지명으로 뭉개진다
/// (문턱이 아래). `draftRelative.test.ts`가 두 값의 일치를 잠근다.
const UNDRAFTED_SCORE: f64 = 78.0;

pub fn determine_protagonist_draft(params: ProtagonistDraftParams) -> ProtagonistDraftOutcome {
    // ⚠ **드래프트는 상대평가다** (사용자 확정 2026-08-09).
    //
    //   상위픽   팀 에이스급 + 리그 최상위
    //   중간픽   리그에서 무난한 수준
    //   미지명   애매하거나 · 큰 부상이 있거나 · 대회에서 못했거나
    //
    // 예전엔 `scout*0.6 + ovr*0.4`의 **절대값**이었다. 고교말 OVR 실측 범위가
    // 52~63이라 OVR 기여가 4.4점 폭뿐이었고, scoutScore는 3년에 +14가 천장이라
    // **60회 조사에서 지명 30회가 전부 9라운드**였다 — 육성 결과가 진로에
    // 안 비쳤고, 세계 전력이 바뀌면 기준선이 통째로 어긋난다.

    // ① 리그 백분위 — 나보다 약한 지명 대상 투수의 비율
    let pct = if params.peer_ovrs.is_empty() {
        // 폴백: 또래 데이터가 안 넘어왔다. **조용히 0을 쓰면 전원 미지명이
        // 되므로** OVR을 그대로 백분위처럼 본다
        params.pitching_ovr
    } else {
        let below = params.peer_ovrs.iter().filter(|&&o| o < params.pitching_ovr).count();
        below as f64 / params.peer_ovrs.len() as f64 * 100.0
    };

    // ② 순수 재능 — **팀운과 무관하게 스카우트가 보는 축**(사용자 지적).
    // 백분위만 쓰면 약팀에서 대회를 못 나간 좋은 투수가 통째로 묻힌다.
    // ⚠ **척도를 실측에 맞춘다.** 처음엔 45~80으로 폈는데 고교말 OVR이
    // 52~63이라 상한에 한참 못 미쳐 ovr_norm이 34밖에 안 나왔고,
    // 그 탓에 **20회 전부 미지명**이 됐다. 고졸 투수의 실제 띠는 40~70이다.
    // ⚠ **척도는 40~85다.** 예전엔 40~70이라 **OVR 70에서 이미 포화**됐다 —
    // 또래 최대가 83인데 70 위로는 이 항이 전부 100이라, "OVR도 반영한다"가
    // 상위권에서 작동을 멈췄다. 잘 키운 결과가 라운드로 안 이어졌다.
    //   OVR 70 → 67 · 75 → 78 · 83 → 96
    let ovr_norm = ((params.pitching_ovr - 40.0) / 45.0 * 100.0).clamp(0.0, 100.0);

    // 둘 다 0~100이라 가중평균이 그대로 0~100이 된다
    let base = pct * 0.6 + ovr_norm * 0.4;

    // ③ 팀 에이스면 스카우트가 더 본다
    let ace_bonus = match params.team_ace_rank { Some(1) => 8.0, Some(2) => 3.0, _ => 0.0 };

    // ④ 대회 활약 — **한 시즌 평균**이고 미진출(10)이 평범이다.
    // 큰 무대에서 보여준 게 픽을 올린다. **팀운을 타는 축이라 비중을 크게
    // 두지 않는다.**
    //
    // ⚠ 기준점이 50이었다. 그런데 평범한 고교생은 대회 미진출이라 10점이고,
    // 결국 **전원이 똑같이 -12를 먹는 항**이었다 — 가르는 게 아무것도 없었다.
    let tour_adj = (params.tournament_score.unwrap_or(20.0) - 20.0) * 0.20;

    // ⑤ **개인 수상** — 대회는 팀운을 타지만 수상은 혼자 만든 결과다.
    // 그래서 대회보다 무겁게 본다. 다만 흔치 않아야 의미가 있다:
    // 실측 30커리어에 4명만 받았고, 그 희소성이 곧 이 항의 가치다.
    //
    // 상한 20 — 3년 내내 휩쓸어도 2라운드어치까지다. 백분위·OVR이 정본이고
    // 수상은 그 위에 얹는 축이라, 이게 순위를 뒤집으면 안 된다.
    let award_adj = (params.award_titles.unwrap_or(0) as f64 * 6.0
        + params.award_mvps.unwrap_or(0) as f64 * 10.0).min(20.0);

    // ⑥ 부상 — **심각도로 가른다.** 스카우트가 제일 무겁게 보는 항목이지만,
    // 무겁게 보는 건 수술 이력이지 지나간 염증이 아니다.
    //
    // ⚠ 예전엔 중등도 이상을 전부 건당 -12로 뭉쳐서 셌고 상한도 없었다.
    // 실측에서 감점이 -252까지 나왔고(그냥 0점), 30커리어 중 6명이 이 항
    // 하나로 미지명이었다 — 팔꿈치 염증 두 번이 UCL 파열과 같은 무게였다.
    //
    // 상한 45 — 수술 2회면 어떤 재능이든 미지명으로 간다. 그 위로 더 깎아도
    // 결과가 같은데 내역만 못 읽게 된다.
    let injury_pen = (params.moderate_injuries.unwrap_or(0) as f64 * 2.0
        + params.severe_injuries.unwrap_or(0) as f64 * 10.0
        + params.surgery_injuries.unwrap_or(0) as f64 * 18.0).min(45.0);

    // ⑦ 스카우트 평가는 보조축
    let scout_adj = (params.scout_score - 30.0) * 0.20;

    // ⚠ **위를 자르지 않는다.** 예전엔 `clamp(0.0, 100.0)`이었는데, `base`가
    // 이미 0~100이고 그 위에 에이스(+8)·수상(+20)이 얹히므로 실측 원값이
    // 105·110까지 나온다. 100에서 자르면 **그 순서가 지워져** 전부 같은
    // 라운드로 뭉쳤다 — 실측 17건 중 3건이 정확히 100.0이었고 1R에 7건이
    // 몰린 게 이것 때문이다.
    let draft_score =
        (base + ace_bonus + tour_adj + award_adj + scout_adj - injury_pen).max(0.0);

    let breakdown = DraftScoreBreakdown {
        percentile: pct, ovr_norm, base, ace_bonus, tour_adj, award_adj,
        scout_adj, injury_pen, total: draft_score,
    };

    if draft_score < UNDRAFTED_SCORE {
        return ProtagonistDraftOutcome {
            drafted: false, round: None, pick: None, team_id: None, breakdown,
        };
    }

    // ⚠ **구간 대신 직선이다.** 예전 식(`ceil(4 + (55-score)/5)`)은 경계 때문에
    // **4·8·10·11라운드가 도달 불가**였다 — 나오는 값이 1·2·3·5·6·7·9뿐이었다.
    //
    // ⚠ **앵커를 NPC 실측에 맞춘다** (2026-08-12). 예전 앵커는 "리그 중위(50)
    // → 6R · 최상위(95) → 1R"이었는데, 그건 어림이지 잰 값이 아니었다.
    // 같은 세계의 고졸 지명자 327명을 주인공과 **같은 분모**(고교 3학년 투수)로
    // 재보니 주인공이 5라운드 관대했다:
    //
    //   백분위    NPC 실측     옛 주인공 산식
    //   95~100      5R             1R
    //   85~ 95      7R             2R
    //   75~ 85      7R             3R
    //
    // 그리고 **고교 3학년 투수 4805명 중 고졸 지명은 327명(6.81%)** 이다 —
    // 지명되려면 백분위 93 이상이어야 한다. 옛 문턱(25)은 백분위 33도
    // 통과시켜서 "애매하면 미지명"이 아예 작동하지 않았다.
    //
    // ⚠ **앵커는 실측 score 분포 위에 놓는다.** 한 번 틀렸다: 백분위와 OVR만
    // 더해 최대 93으로 보고 기울기를 0.81로 잡았는데, 에이스(+8)·수상(+20)이
    // 얹혀 실제 score는 88~110이었다. 93 위가 전부 1R로 떨어져 **17건 중
    // 7건이 1R**이 됐다.
    //
    // 실측 지명자의 score와 NPC 라운드를 맞춘다:
    //   score  88 → 7R   (백분위 93 — NPC 관문)
    //   score  98 → 3R   (백분위 97)
    //   score 110 → 1R   (백분위 96 + 에이스 + 수상 석권)
    // 기울기 0.40R/점, 11R에서 끊기는 지점이 78이다.
    let round = (11.0 - (draft_score - 78.0) * 0.40)
        .round().clamp(1.0, DRAFT_ROUNDS as f64) as i32;
    let teams = &params.team_ids;
    if teams.is_empty() {
        return ProtagonistDraftOutcome { drafted: false, round: None, pick: None, team_id: None, breakdown };
    }

    // ⚠ **팀과 순번을 따로 굴리지 않는다.**
    //
    // 예전엔 `t_idx`(팀)와 `p_idx`(슬롯)를 각각 뽑아서, 화면에 "6라운드
    // 3순위 · A팀"이라 떠도 **그 라운드 3순위의 실제 주인은 다른 팀**이었다.
    // 지명은 순번이 팀을 정하는 것이지 둘이 따로 있는 게 아니다.
    //
    // 슬롯 하나만 뽑고 팀은 그 자리의 주인으로 받는다. `team_ids`는
    // **그 해 지명 순서**여야 한다(전 시즌 성적 역순) — 알파벳순 기본값을
    // 넘기면 순번은 맞는데 팀이 틀리는 옛 상태로 돌아간다.
    let mut rng = LcgRand::new(
        (params.year as u32).wrapping_mul(997).wrapping_add((draft_score.round() as u32).wrapping_mul(13))
    );
    let slot = (rng.next() * teams.len() as f64) as usize % teams.len();
    let pick = (round - 1) * teams.len() as i32 + slot as i32 + 1;

    ProtagonistDraftOutcome {
        drafted: true,
        round:   Some(round),
        pick:    Some(pick),
        team_id: Some(teams[slot].clone()),
        breakdown,
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
    // 전역 공백 포지션을 먼저 채운다(Phase 1) — 비면 OVR 순만 돌린다.
    // ⚠ 예전엔 `&[]`가 박혀 있어 **Phase 1이 한 번도 안 돌았다.**
    let selected = select_sports_unit_ids(
        &pool, &params.vacating_positions, params.max_total, params.max_per_team);
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

// ── run_draft_board 제거됨 (2026-08-12) ─────────────────────────
//
// **주인공 지명 위치를 정하는 두 번째 산식**이 여기 살아 있었다.
// 스카우트 점수와 OVR을 6:4로 섞은 뒤 그 절대값에서 목표 순번을 직접
// 뽑았고(폐기된 옛 식), 지명 순서는 짝수 라운드를 뒤집는 스네이크였다.
//
// ⚠ 그 식을 여기 그대로 적지 않는다 — `draftBoardSingleSource.test.ts`가
// 지문(상수·필드명)으로 부활을 잡는데, 주석에 인용하면 검사가 그걸 문다.
//
// 둘 다 지금 정본과 다르다. 절대식은 상대평가(determine_protagonist_draft)로
// 바뀌었고 지명 순서는 10팀 정순이다(pickInRound 주석). 그런데 호출부가
// 사라진 뒤에도 남아 있었다 — 이 저장소에서 반복적으로 나온 "정본이 둘"의
// 씨앗이고, 실제로 픽번호 중복을 쫓다가 여기부터 의심했다.
//
// 보드 화면(DraftBoardModal)은 이제 processNpcDraft 결과를 재생만 한다.

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
    // 씨앗이 있으면 결정적으로 — 없으면 예전 그대로다
    let mut rng: Box<dyn rand::RngCore> = if params.seed != 0 {
        Box::new(LcgRand::new(params.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
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

#[cfg(test)]
mod clutch_tests {
    use super::*;

    const NONE:    [bool; 3] = [false, false, false];
    const SECOND:  [bool; 3] = [false, true,  false];
    const LOADED:  [bool; 3] = [true,  true,  true];

    /// 위기 보정은 **시즌 ERA로 재기 어렵다** — 득점권은 전체 타석의 25%뿐이라
    /// 전체 평균으로 희석된다. 400경기 실측에서 clutch 20↔90 차가 0.18인데
    /// ERA 노이즈가 ±0.14라 근거가 약했다(`audit:engine` ④번은 방향만 본다).
    ///
    /// 여기서는 **함수를 직접** 본다. 결정론적이라 노이즈가 없다.
    #[test]
    fn 위기가_아니면_보정이_없다() {
        // 주자 없음 + 초반 = 무보정
        assert_eq!(npc_clutch_mod(&NONE, 0, 3, 0, 50.0, 50.0, 50.0), 1.0);
        // 1루만 있어도 득점권이 아니다
        assert_eq!(npc_clutch_mod(&[true, false, false], 1, 3, 0, 50.0, 50.0, 50.0), 1.0);
    }

    #[test]
    fn 득점권과_후반접전이_압박을_만든다() {
        let base = npc_clutch_mod(&SECOND, 0, 3, 0, 50.0, 50.0, 50.0);
        assert!(base < 1.0, "득점권인데 보정이 없다: {base}");

        // 2아웃이면 더 조인다
        let two_out = npc_clutch_mod(&SECOND, 2, 3, 0, 50.0, 50.0, 50.0);
        assert!(two_out < base, "2아웃이 더 낮아야 한다: {two_out} vs {base}");

        // 만루면 더
        let loaded = npc_clutch_mod(&LOADED, 2, 3, 0, 50.0, 50.0, 50.0);
        assert!(loaded < two_out, "만루가 더 낮아야 한다: {loaded} vs {two_out}");

        // 주자가 없어도 후반 접전이면 압박이 있다
        let late = npc_clutch_mod(&NONE, 0, 9, 1, 50.0, 50.0, 50.0);
        assert!(late < 1.0, "후반 1점차인데 보정이 없다: {late}");
        // 점수 차가 크면 압박이 사라진다
        assert_eq!(npc_clutch_mod(&NONE, 0, 9, 9, 50.0, 50.0, 50.0), 1.0);
    }

    #[test]
    fn 배짱이_좋을수록_압박을_덜_받는다() {
        let weak   = npc_clutch_mod(&LOADED, 2, 9, 1, 20.0, 20.0, 50.0);
        let normal = npc_clutch_mod(&LOADED, 2, 9, 1, 50.0, 50.0, 50.0);
        let strong = npc_clutch_mod(&LOADED, 2, 9, 1, 90.0, 90.0, 50.0);
        assert!(weak < normal && normal < strong,
                "단조성이 깨졌다: {weak} < {normal} < {strong}");

        // **크기도 본다.** 방향만 맞고 폭이 0에 가까우면 있으나 마나다 —
        // 실제로 첫 계수(0.030)가 그래서 시즌 성적에 안 보였다
        assert!(strong - weak >= 0.05,
                "clutch 20↔90 폭이 너무 좁다: {}", strong - weak);
    }

    #[test]
    fn 승부처에_강한_타자는_압박을_키운다() {
        let vs_weak   = npc_clutch_mod(&SECOND, 2, 9, 1, 50.0, 50.0, 20.0);
        let vs_strong = npc_clutch_mod(&SECOND, 2, 9, 1, 50.0, 50.0, 90.0);
        assert!(vs_strong < vs_weak,
                "강한 타자 상대가 더 낮아야 한다: {vs_strong} vs {vs_weak}");
    }

    #[test]
    fn 보정폭이_상한_하한을_벗어나지_않는다() {
        // 최악 조건에서도 하한 아래로 안 내려간다 — 위기 보정이 능력치를
        // 압도하면 OVR·성적 상관이 무너진다
        let worst = npc_clutch_mod(&LOADED, 2, 9, 0, 1.0, 1.0, 99.0);
        assert!(worst >= crate::tuning::NPC_CLUTCH_MIN - 1e-9, "하한 위반: {worst}");
        let best = npc_clutch_mod(&NONE, 0, 9, 0, 99.0, 99.0, 1.0);
        assert!(best <= crate::tuning::NPC_CLUTCH_MAX + 1e-9, "상한 위반: {best}");
    }

    // ── 계수가 **성적을 얼마나 바꾸는가** ────────────────────────────
    //
    // ⚠ 위 검사들은 전부 `npc_clutch_mod`의 **모양**만 본다 — 단조성·상한·폭.
    // 그런데 ②에서 물어야 할 것은 "그래서 타율이 얼마나 움직이나"다.
    // 배율 0.853이 능력치를 15% 깎는데, 그게 타율 .005를 움직이는지
    // .050을 움직이는지는 모양 검사로 알 수 없다.
    //
    // **실제 야구 기준**: 득점권 타율은 전체와 거의 같다(MLB 통산 .248 vs
    // .250, 차이 .002). 상황이 성적을 크게 흔들지 않는다. 우리 모델은
    // 압박을 **투수 능력 감소**로 넣으므로 득점권 타율이 조금 **높아지는**
    // 방향이 맞고, 폭이 실제와 비슷해야 한다.

    /// 한 배율에서 타석을 대량 시행해 (타율, 출루율)을 낸다.
    ///
    /// `sim_at_bat`을 직접 부른다 — 리그 루프에 집계를 넣으면 720경기마다
    /// 도는 자리라 Phase 8(성능)과 충돌한다.
    fn 타석_시행(cm: f64, n: usize, seed: u64) -> (f64, f64) {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        // 리그 평균 대역. 절대값보다 **배율 간 차이**를 보는 것이라
        // 값 자체가 정확할 필요는 없다 — 다만 실측 리그 타율(.253~.260)
        // 근처에서 재야 폭이 현실적이다
        let (v, c, ct, m) = (70.0, 70.0, 70.0, 70.0);
        let (contact, eye, disc, power) = (70.0, 70.0, 70.0, 70.0);
        let bases = [false, false, false];

        let (mut ab, mut hits, mut bb) = (0usize, 0usize, 0usize);
        for _ in 0..n {
            let (r, _) = sim_at_bat(v * cm, c * cm, ct * cm, m * cm,
                                    contact, eye, disc, power, &bases, 0, &mut rng);
            match r {
                AbResult::BB => bb += 1,
                AbResult::Single | AbResult::Double | AbResult::Triple | AbResult::HR => {
                    ab += 1; hits += 1;
                }
                _ => ab += 1,
            }
        }
        let pa = ab + bb;
        (hits as f64 / ab as f64, (hits + bb) as f64 / pa as f64)
    }

    #[test]
    fn 위기보정이_타율을_현실적인_폭으로만_움직인다() {
        const N: usize = 200_000;
        let 중립 = 타석_시행(1.0, N, 20260804);

        // 가장 흔한 위기: 득점권 · 아웃카운트 무관 · 평균 기질
        let cm_risp = npc_clutch_mod(&SECOND, 0, 3, 0, 50.0, 50.0, 50.0);
        let 득점권 = 타석_시행(cm_risp, N, 20260805);

        // 가장 극단: 만루 2아웃 9회 1점차 · 기질 평균
        let cm_max = npc_clutch_mod(&LOADED, 2, 9, 1, 50.0, 50.0, 50.0);
        let 최악 = 타석_시행(cm_max, N, 20260806);

        println!("  중립   배율 1.000  타율 {:.3}  출루 {:.3}", 중립.0, 중립.1);
        println!("  득점권 배율 {cm_risp:.3}  타율 {:.3}  출루 {:.3}  (차 {:+.3})",
                 득점권.0, 득점권.1, 득점권.0 - 중립.0);
        println!("  최악   배율 {cm_max:.3}  타율 {:.3}  출루 {:.3}  (차 {:+.3})",
                 최악.0, 최악.1, 최악.0 - 중립.0);

        // 방향: 압박은 투수를 깎으므로 타자가 유리해야 한다
        assert!(득점권.0 > 중립.0, "득점권인데 타율이 안 올랐다");

        // **폭**: 실제 야구의 득점권 차이는 .002 수준이다. 시뮬은 그보다
        // 뚜렷해도 되지만(성격이 보이긴 해야 한다) 상황이 능력치를 압도하면
        // OVR·성적 상관이 무너진다 — 이번 라운드에서 그걸 15시즌 걸려 고쳤다.
        let d = 득점권.0 - 중립.0;
        assert!(d <= 0.020, "득점권 타율 차이가 {d:+.3} — 상황이 능력치를 압도한다");

        let dmax = 최악.0 - 중립.0;
        assert!(dmax <= 0.045, "최악 상황 타율 차이가 {dmax:+.3} — 폭이 너무 크다");
    }

    #[test]
    fn 기질_차이가_타율에서_보인다() {
        const N: usize = 200_000;
        // 같은 상황, 배짱만 다른 두 투수
        let cm_weak   = npc_clutch_mod(&LOADED, 2, 9, 1, 20.0, 20.0, 50.0);
        let cm_strong = npc_clutch_mod(&LOADED, 2, 9, 1, 90.0, 90.0, 50.0);
        let 약 = 타석_시행(cm_weak,   N, 20260807);
        let 강 = 타석_시행(cm_strong, N, 20260808);

        println!("  기질 20 배율 {cm_weak:.3}  피안타율 {:.3}", 약.0);
        println!("  기질 90 배율 {cm_strong:.3}  피안타율 {:.3}  (차 {:+.3})",
                 강.0, 강.0 - 약.0);

        // **보이긴 해야 한다.** 첫 계수(0.030)는 방향만 맞고 폭이 0에 가까워
        // 시즌 성적에 전혀 안 나타났다 — 있으나 마나였다
        let d = 약.0 - 강.0;
        assert!(d >= 0.004,
                "배짱 20↔90의 피안타율 차이가 {d:.3} — 성격이 성적에 안 보인다");
        // 다만 능력치를 압도하면 안 된다
        assert!(d <= 0.030, "배짱 차이가 {d:.3} — 능력치보다 기질이 성적을 정한다");
    }

}

// ── 마무리·세이브 ────────────────────────────────────────────────────────────

#[cfg(test)]
mod closer_tests {
    use super::*;

    // ⚠ **이건 집계로 잡기 어렵다.** 리그 세이브가 0이어도 "접전이 적었나"로
    // 읽히지, 마무리가 큐 맨 뒤에 있어 영영 등판 못 한다는 건 안 보인다.
    // 실제로 규정투수 99~115명 전원의 sv가 0인 걸 수상 자격선 점검에서야 봤다.

    fn pit(id: &str, ovr: f64) -> SimPitcher {
        SimPitcher {
            id: id.into(), velocity: ovr, movement: ovr, command: ovr, control: ovr,
            stamina: ovr, stamina_cap: 100.0, clutch: 50.0, mentality: 50.0,
            hold_runners: 50.0,
        }
    }
    fn bat(id: &str, ovr: f64) -> SimBatter {
        SimBatter {
            id: id.into(), contact: ovr, power: ovr, eye: ovr, discipline: ovr,
            batting_clutch: 50.0, speed: 55.0, base_instinct: 55.0,
            // 포수 도루 저지용 — 검사는 중립으로 둔다(포수가 아니다)
            position: String::new(), arm: 50.0,
        }
    }
    /// ⚠ **주력은 실측 분포를 쓴다.** 두 번 틀렸다:
    ///
    ///   1차 — 9명 전원 speed 55. 도루가 경기당 0.17개로 나와 "계수가 너무
    ///         강하다"는 오판 직전까지 갔다. 평균값 9명은 대표성이 없다.
    ///   2차 — 45~77로 흩뿌렸다. 그런데 **리그 실측은 p25 72 / 중앙 81 / p95 94**다.
    ///         45는 존재하지 않는 값이라 여전히 현실과 달랐다.
    ///
    /// 계수를 이 분포 위에서 맞췄으므로 테스트도 같은 분포여야 한다.
    fn lineup(prefix: &str, ovr: f64) -> Vec<SimBatter> {
        // 실측 p25 72 ~ p95 94를 9명에 펼친다
        (0..9).map(|i| {
            let mut b = bat(&format!("{prefix}B{i}"), ovr);
            b.speed = 71.0 + (i as f64) * 3.0;          // 71 ~ 95
            b.base_instinct = 75.0;                      // 실측 중앙
            b
        }).collect()
    }

    /// 마무리를 둔 두 팀으로 여러 경기를 돌린다. 접전이면 마무리가 나와야 한다.
    ///
    /// ⚠ **호출측 모양 그대로 넘긴다.** `rosterEngine.getTeamBullpen`은 마무리를
    /// **불펜 목록에도 같이** 넣어 보내고 점수순으로 정렬하므로 마무리가 대개
    /// 맨 앞이다. 처음엔 여기서 마무리를 불펜에서 빼고 넘겼는데, 그러면
    /// 테스트는 통과하고 실제로는 세이브가 0이었다 — 현실에 없는 입력이었다.
    fn run(n: usize) -> (usize, usize) {
        let mut appeared = 0usize;
        let mut saves = 0usize;
        for w in 0..n {
            let hpen = || { let mut v = vec![pit("HCP", 75.0)];
                v.extend((0..4).map(|i| pit(&format!("HRP{i}"), 58.0))); v };
            let apen = || { let mut v = vec![pit("ACP", 75.0)];
                v.extend((0..4).map(|i| pit(&format!("ARP{i}"), 58.0))); v };
            let params = SimGameParams {
                // 씨앗 배선에서 늘어난 둘 — 검사는 0(=예전 경로)으로 둔다
                schedule_id: String::new(), world_seed: 0,
                home_rotation: vec![pit("HSP", 62.0)],
                away_rotation: vec![pit("ASP", 62.0)],
                home_bullpen: hpen(),
                away_bullpen: apen(),
                home_closer: Some(pit("HCP", 75.0)),
                away_closer: Some(pit("ACP", 75.0)),
                home_lineup: lineup("H", 60.0),
                away_lineup: lineup("A", 60.0),
                home_rot_idx: 0, away_rot_idx: 0,
                conditions: HashMap::new(),
                week: w as i32 + 1,
                home_team_id: "TEAM_H".into(), away_team_id: "TEAM_A".into(),
            };
            let r = sim_game(&params);
            for line in &r.result.player_lines {
                if let PlayerGameLine::Pitcher { player_id, decision, .. } = line {
                    if player_id == "HCP" || player_id == "ACP" {
                        appeared += 1;
                        if decision == "SV" { saves += 1; }
                    }
                }
            }
        }
        (appeared, saves)
    }

    #[test]
    fn 마무리가_등판한다() {
        // 큐가 [선발, 불펜 4, 마무리]라 앞에서부터 소모하면 마무리는 영영 안 나온다
        let (appeared, _) = run(60);
        assert!(appeared > 0, "60경기 동안 마무리가 한 번도 등판하지 않았다");
    }

    /// 도루가 **나오되 폭주하지 않는가.**
    ///
    /// KBO는 팀당 경기당 도루 0.5~0.9개다. 한 경기 두 팀 합쳐 **1.0~1.8개**.
    ///
    /// ⚠ **처음엔 0.2~3.0으로 뒀다가 못 걸렀다.** 그 폭이면 실측 도루왕 47~51
    /// (KBO 30~40)·규정타석 중앙 22(KBO 8~10)가 전부 통과한다. 게다가 도루 실패
    /// 아웃이 투수 이닝에 들어가 리그 ERA를 4.71 → 3.88로 끌어내렸다 —
    /// 사용자 확정 "KBO 수준(ERA 4점대)"에서 벗어나는데 테스트는 초록이었다.
    /// **범위를 실제 리그 수치로 좁힌다.**
    #[test]
    fn 도루가_현실적인_빈도로_나온다() {
        let n = 80usize;
        let mut sb = 0usize;
        for w in 0..n {
            let params = SimGameParams {
                // 씨앗 배선에서 늘어난 둘 — 검사는 0(=예전 경로)으로 둔다
                schedule_id: String::new(), world_seed: 0,
                home_rotation: vec![pit("HSP", 62.0)],
                away_rotation: vec![pit("ASP", 62.0)],
                home_bullpen: (0..4).map(|i| pit(&format!("HRP{i}"), 58.0)).collect(),
                away_bullpen: (0..4).map(|i| pit(&format!("ARP{i}"), 58.0)).collect(),
                home_closer: None, away_closer: None,
                home_lineup: lineup("H", 60.0),
                away_lineup: lineup("A", 60.0),
                home_rot_idx: 0, away_rot_idx: 0,
                conditions: HashMap::new(),
                week: w as i32 + 1,
                home_team_id: "TEAM_H".into(), away_team_id: "TEAM_A".into(),
            };
            for line in &sim_game(&params).result.player_lines {
                if let PlayerGameLine::Batter { sb: s, .. } = line { sb += *s as usize; }
            }
        }
        let per_game = sb as f64 / n as f64;
        assert!(per_game > 0.5, "도루가 경기당 {per_game:.2}개 — 너무 적다(KBO 1.0~1.8)");
        assert!(per_game < 2.2, "도루가 경기당 {per_game:.2}개 — 너무 많다(KBO 1.0~1.8)");
    }

    #[test]
    fn 접전이면_세이브가_기록된다() {
        // 세이브가 0이면 세이브왕이 구조적으로 안 나온다 — 실측이 정확히 그랬다
        let (_, saves) = run(60);
        assert!(saves > 0, "60경기 동안 세이브가 한 건도 없었다");
    }

    /// 득점권 스플릿이 **실제로 쌓이는가.**
    ///
    /// ⚠ 이 검사가 없으면 필드만 늘고 값이 0인 채로 화면에 나간다 —
    /// 이 프로젝트에서 반복된 형태다(세이브 0·도루 0이 그랬고, 둘 다
    /// 집계로는 "접전이 적었나"로 읽혀 몇 달을 안 보였다).
    ///
    /// 판정은 **비율**로 한다. 절대값은 리그 타격 수준에 따라 움직이지만,
    /// 득점권 타석이 전체의 몇 %인지는 야구 구조가 정한다(실제 20~28%).
    #[test]
    fn 득점권_기록이_쌓인다() {
        let (mut ab, mut risp_ab, mut risp_h, mut h) = (0i32, 0i32, 0i32, 0i32);
        let (mut p_ab, mut p_risp_ab) = (0i32, 0i32);
        for w in 0..40 {
            let params = SimGameParams {
                // 씨앗 배선에서 늘어난 둘 — 검사는 0(=예전 경로)으로 둔다
                schedule_id: String::new(), world_seed: 0,
                home_rotation: vec![pit("HSP", 65.0)],
                away_rotation: vec![pit("ASP", 65.0)],
                home_bullpen: (0..4).map(|i| pit(&format!("HRP{i}"), 60.0)).collect(),
                away_bullpen: (0..4).map(|i| pit(&format!("ARP{i}"), 60.0)).collect(),
                home_closer: None, away_closer: None,
                home_lineup: lineup("H", 65.0),
                away_lineup: lineup("A", 65.0),
                home_rot_idx: 0, away_rot_idx: 0,
                conditions: HashMap::new(),
                week: w as i32 + 1,
                home_team_id: "TEAM_H".into(), away_team_id: "TEAM_A".into(),
            };
            let r = sim_game(&params);
            for line in &r.result.player_lines {
                match line {
                    PlayerGameLine::Batter { ab: a, h: hh, risp_ab: ra, risp_h: rh, .. } => {
                        ab += a; h += hh; risp_ab += ra; risp_h += rh;
                    }
                    PlayerGameLine::Pitcher { risp_ab: ra, .. } => {
                        p_risp_ab += ra;
                    }
                }
            }
            for line in &r.result.player_lines {
                if let PlayerGameLine::Pitcher { h: hh, .. } = line { p_ab += hh; }
            }
        }
        let share = risp_ab as f64 / ab as f64;
        println!("  타수 {ab} · 득점권 {risp_ab} ({:.1}%) · 득점권 안타 {risp_h}", share * 100.0);
        println!("  전체 타율 {:.3} · 득점권 타율 {:.3}",
                 h as f64 / ab as f64, risp_h as f64 / risp_ab.max(1) as f64);

        assert!(risp_ab > 0, "득점권 타수가 0 — 배선이 안 돌았다");
        assert!(risp_h > 0, "득점권 안타가 0 — 안타 쪽 배선이 빠졌다");
        // 실제 야구의 득점권 타석 비중은 20~28%다
        assert!((0.15..=0.35).contains(&share),
                "득점권 타석 비중이 {:.1}% — 판정이 현실과 다르다", share * 100.0);

        // **투타 대사가 맞아야 한다.** 같은 타석을 양쪽이 세므로 합계가 같다 —
        // 어긋나면 한쪽 누적이 빠진 것이다(볼넷 누락이 그런 식으로 숨어 있었다)
        assert_eq!(risp_ab, p_risp_ab,
                   "타자 득점권 타수 {risp_ab} vs 투수 {p_risp_ab} — 대사가 어긋난다");
        let _ = p_ab;
    }

}

// ── 신입생 보직 비율 ─────────────────────────────────────────────────────────

#[cfg(test)]
mod freshmen_ratio_tests {
    use super::*;
    use crate::sim_types::GenerateFreshmenParams;

    /// ⚠ **폴백 비율이 파이프라인 전체의 투수 수를 정한다.**
    ///
    /// 로스터 생성은 `pitcher_ratio`(0.45)로 만드는데 신입생 폴백은 0.3이 박혀
    /// 있었다. 세대가 교체될수록 리그가 30%로 수렴한다 — 30명 로스터 기준
    /// 투수 13.5명 → 9명이다. 실측 고교 23/102팀 투수 미달이었고, 그 부족이
    /// 대학·독립·드래프트를 거쳐 프로까지 내려가 구단당 총량이 11~13명(하한 21)이었다.
    ///
    /// **2군에 육성선수를 넣어도 안 풀렸다** — 상류가 마르면 하류에서 퍼도 안 찬다.
    #[test]
    fn 신입생_투수_비율이_로스터_생성과_같다() {
        // ⚠ **학교 하나로 재면 안 된다.** 학교마다 난수 스트림이 따로라
        // 한 스트림의 치우침이 그대로 결과가 된다(실측 한 학교 52%).
        // 실제로는 102개 학교가 각자 돌므로 **여러 학교를 합쳐서** 본다.
        let make = |ratio: f64| {
            let mut pit = 0usize;
            let mut tot = 0usize;
            for i in 0..30 {
            let out = generate_freshmen(GenerateFreshmenParams { name_pool: None,
                school_id: format!("SCHOOL_HS_{i:02}"), team_id: "TEAM_T".into(),
                annual_roster_size: 40,
                pitching_ovr_min: 45.0, pitching_ovr_max: 70.0,
                batting_ovr_min: 45.0, batting_ovr_max: 70.0,
                potential_ovr_max: None,   // 천장 = ovr_max (기본 동작)
                dev_rate_min: 45.0, dev_rate_max: 75.0,
                named_npcs: vec![], season_year: 2026, id_offset: 0,
                needed_positions: vec![],   // 전부 폴백으로 뽑힌다
                talent: None,
                pitcher_ratio: ratio,
            });
            pit += out.iter().filter(|n| n.player_type == "pitcher").count();
            tot += out.len();
            }
            pit as f64 / tot as f64
        };
        let r = make(0.45);
        assert!((r - 0.45).abs() < 0.06, "폴백 투수 비율 {r:.3} — 목표 0.45");

        // 규칙이 0이면(구 페이로드) 기본값 0.45로 떨어져야 한다 — 0.3으로 돌아가면 안 된다
        let d = make(0.0);
        assert!((d - 0.45).abs() < 0.06, "기본값 투수 비율 {d:.3} — 0.45여야 한다");
    }

    #[test]
    fn 신입생_선발_비중이_생성과_같다() {
        // ⚠ 처음엔 "선발이 더 많다"로 검사했다. 내가 폴백에 넣은 0.55를 그대로
        // 전제로 삼은 것인데, **생성은 투수 14명 중 선발 6 · 불펜 8**이라
        // 애초에 불펜이 더 많다(`SP_SHARE_OF_PITCHERS` 0.45).
        //
        // 충원이 생성보다 선발을 많이 뽑으면 매년 불어난다 — 실측 6시즌에
        // 리그 선발이 57 → 112명(팀당 11명)이 됐고, 로테이션은 5~6이라
        // 명목상 선발이 각자 짧게 던지면서 **OVR–ERA 상관이 −0.61 → −0.19**로
        // 무너졌다. 검사는 **비중**을 봐야 한다.
        let out = generate_freshmen(GenerateFreshmenParams { name_pool: None,
            school_id: "SCHOOL_T".into(), team_id: "TEAM_T".into(),
            annual_roster_size: 400,
            pitching_ovr_min: 45.0, pitching_ovr_max: 70.0,
            batting_ovr_min: 45.0, batting_ovr_max: 70.0,
            potential_ovr_max: None,   // 천장 = ovr_max (기본 동작)
            dev_rate_min: 45.0, dev_rate_max: 75.0,
            named_npcs: vec![], season_year: 2026, id_offset: 0,
            needed_positions: vec![], pitcher_ratio: 0.45,
            talent: None,
        });
        let sp = out.iter().filter(|n| n.position == "SP").count();
        let rp = out.iter().filter(|n| n.position == "RP").count();
        let share = sp as f64 / (sp + rp).max(1) as f64;
        let want = crate::tuning::SP_SHARE_OF_PITCHERS;
        assert!((share - want).abs() < 0.08,
            "선발 비중 {share:.3} (선발 {sp} / 불펜 {rp}) — 생성은 {want}");
    }

    #[test]
    fn 천장은_시작_능력치와_따로_준다() {
        // 육성선수: **약하게 시작하되 클 수 있다** (사용자 확정 2026-08-07).
        //
        // ⚠ 천장은 `ovr_max * pot_mult`다. 그래서 시작 능력치를 낮추려고
        // `ovr_max`를 내리면 **천장까지 같이 내려간다** — 그러면 그냥 약한
        // 선수가 되고 육성선수가 프로가 되는 경로 자체가 없어진다.
        let mk = |ovr_max: f64, pot: Option<f64>| generate_freshmen(GenerateFreshmenParams {
            name_pool: None,
            school_id: "SCHOOL_T".into(), team_id: "TEAM_T".into(),
            annual_roster_size: 300,
            pitching_ovr_min: 42.0, pitching_ovr_max: ovr_max,
            batting_ovr_min: 42.0, batting_ovr_max: ovr_max,
            potential_ovr_max: pot,
            dev_rate_min: 45.0, dev_rate_max: 75.0,
            named_npcs: vec![], season_year: 2026, id_offset: 0,
            needed_positions: vec![], pitcher_ratio: 0.45,
            talent: None,
        });
        let top = |v: &[NpcSaveState]| v.iter()
            .map(|n| n.potential_hidden).fold(f64::MIN, f64::max);

        // 능력치 범위를 64로 낮추고 천장 기준만 76으로 준다
        let lowered  = mk(64.0, Some(76.0));
        // 비교군: 천장도 같이 내려간 경우
        let together = mk(64.0, None);

        assert!(top(&lowered) > top(&together),
            "천장을 따로 안 줬다: 분리 {:.1} vs 같이내림 {:.1}",
            top(&lowered), top(&together));

        // 시작 능력치는 실제로 낮다 — 천장만 높지 지금 강한 게 아니다
        let ovr_of = |n: &NpcSaveState| n.pitching.as_ref().map(|p| p.ovr)
            .unwrap_or_else(|| n.batting.as_ref().map(|b| b.ovr).unwrap_or(0.0));
        assert!(lowered.iter().all(|n| ovr_of(n) <= 64.0),
            "시작 능력치가 낮춘 상한을 넘었다");
    }
}

#[cfg(test)]
mod name_pair_tests {
    use super::*;

    /// ⚠ **인덱스가 어긋나면 김씨가 Lee로 나온다.** 배열을 늘릴 때 짝을 같이
    /// 늘려야 하는데, 길이가 다르면 조용히 다른 사람 이름이 붙는다.
    #[test]
    fn 한글_로마자_배열_길이가_같다() {
        assert_eq!(SURNAMES.len(), SURNAMES_EN.len(), "성");
        assert_eq!(SYLLABLES_A.len(), SYLLABLES_A_EN.len(), "이름 첫 음절");
        assert_eq!(SYLLABLES_B.len(), SYLLABLES_B_EN.len(), "이름 끝 음절");
    }

    #[test]
    fn 로마자에_한글이_안_섞인다() {
        for s in SURNAMES_EN.iter().chain(SYLLABLES_A_EN).chain(SYLLABLES_B_EN) {
            assert!(s.is_ascii(), "한글이 남았다: {s}");
            assert!(!s.is_empty(), "빈 칸이 있다");
        }
    }

    #[test]
    fn 로마자는_이름_성_순이다() {
        let mut rng = LcgRand::new(7);
        let (ko, en) = gen_name(&mut rng);
        // 한글은 붙여 쓰고(김우찬), 로마자는 "이름-끝 성"이다(Woo-chan Kim)
        assert_eq!(ko.chars().count(), 3, "한글 이름은 세 글자다: {ko}");
        assert!(en.contains('-'), "이름 두 음절이 하이픈으로 붙어야 한다: {en}");
        let parts: Vec<&str> = en.split(' ').collect();
        assert_eq!(parts.len(), 2, "\"이름-끝 성\" 두 덩어리여야 한다: {en}");
        assert!(SURNAMES_EN.contains(&parts[1]), "성이 뒤에 와야 한다: {en}");
    }

    #[test]
    fn 같은_시드면_한글과_로마자가_같은_사람이다() {
        // ⚠ 두 표기가 **다른 난수**를 쓰면 영어로 바꿨을 때 다른 사람이 된다
        let (ko, en) = gen_name(&mut LcgRand::new(42));
        let i = SURNAMES.iter().position(|s| ko.starts_with(s)).expect("성 없음");
        assert!(en.ends_with(SURNAMES_EN[i]), "{ko} ↔ {en} 성이 다르다");
    }
}
