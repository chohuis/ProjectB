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

// ── 계측: 타자가 얼마나 자주·크게 읽는가 (결정 ⑩) ─────────────────────────
//
// 🔴 **구종 개수의 효과가 피안타율보다 훨씬 작다.** 실측(900경기/칸)에서
//    피안타율의 잡음 폭이 ±0.010 인데 노림수 회피가 주는 몫은 그보다 작아
//    묻힌다. 그래서 **결과가 아니라 산식 입력을 직접 센다** — 구종을 넓히면
//    「읽히는 빈도·크기」가 정말 주는지는 이걸로만 또렷하게 보인다.
thread_local! {
    /// (읽힌 몫의 합, **휘두른** 공 수, 그중 읽힌 공 수)
    ///
    /// ⚠ **분모는 던진 공이 아니라 휘두른 공이다.** 이 카운터는
    ///   `calculate_contact_quality` 안에서 도는데 그 함수는 타자가 휘둘렀을
    ///   때만 불린다(안 휘두르면 볼·루킹스트라이크로 끝난다). 「던진 공」으로
    ///   읽으면 비율이 통째로 틀린다.
    /// ⚠ **양쪽 반을 다 센다.** 상대 반(`auto_simulate_half_inning`)도 같은
    ///   `step_pitch_core` 를 타므로, 주인공 구종만 바꾸면 절반만 움직인다 —
    ///   주인공 쪽 실제 크기는 여기 보이는 차의 **약 두 배**다.
    pub static READ_TALLY: RefCell<(f64, u64, u64)> = const { RefCell::new((0.0, 0, 0)) };
}

fn tally_read(read: f64) {
    READ_TALLY.with(|t| {
        let mut m = t.borrow_mut();
        m.0 += read; m.1 += 1;
        if read > 0.0 { m.2 += 1; }
    });
}

/// 계측값 읽기 — (휘두른 공당 평균 읽힌 몫, 읽힌 비율, 휘두른 공 수)
pub fn read_read_tally() -> (f64, f64, u64) {
    let (sum, n, hit) = READ_TALLY.with(|t| *t.borrow());
    if n == 0 { return (0.0, 0.0, 0); }
    (sum / n as f64, hit as f64 / n as f64, n)
}

pub fn reset_read_tally() {
    READ_TALLY.with(|t| *t.borrow_mut() = (0.0, 0, 0));
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
    FENCE_MOVES.with(|f| *f.borrow_mut() = [0; 6]);
    PROMO_RATIO.with(|r| *r.borrow_mut() = [0; 6]);
}

// ── 계측: 담장 재확인이 결과를 몇 번 바꾸나 ───────────────────────────────
//
// 🔴 담장 재확인은 **양방향**이다 — 표의 홈런을 내리기도 하고 표의 2·3루타를
//    **홈런으로 올리기도** 한다. 올리는 쪽이 몇 건인지 아무도 안 셌다.
//
//    실측(2026-09-01): KBL 리그타율 .272 · 출루 .338 은 KBO 와 맞는데
//    **장타율만 .464**(KBO .390)다. 안타 수가 아니라 **안타 하나의 무게**가
//    문제라는 뜻이고, 그 무게를 이 갈래가 만들 수 있다.
//
// ⚠ 계측 전용이다. 카운터를 안 읽으면 릴리스 동작에 영향이 없다.
thread_local! {
    /// [HR→2루타, HR→3루타, HR→뜬공아웃, 2루타→HR, 3루타→HR, 그라운드HR]
    pub static FENCE_MOVES: RefCell<[u64; 6]> = const { RefCell::new([0; 6]) };
}

fn tally_fence_move(i: usize) {
    FENCE_MOVES.with(|f| f.borrow_mut()[i] += 1);
}

pub fn read_fence_moves() -> [u64; 6] {
    FENCE_MOVES.with(|f| *f.borrow())
}

// ── 계측: 승격 후보의 담장 대비 비율 ──────────────────────────────────────
//
// 🔴 승격 갈래에 **문턱이 없다.** 강등 쪽은 0.94 / 0.82 로 3단계인데
//    올리는 쪽은 `over` 하나만 본다. 문턱을 얼마로 둘지 정하려면
//    **넘긴 타구가 얼마나 넘겼는지** 분포를 알아야 한다.
//
// 구간: [1.00~1.02, 1.02~1.05, 1.05~1.10, 1.10~1.20, 1.20~1.35, 1.35+]
thread_local! {
    pub static PROMO_RATIO: RefCell<[u64; 6]> = const { RefCell::new([0; 6]) };
}

fn tally_promo_ratio(ratio: f64) {
    let i = if ratio < 1.02 { 0 } else if ratio < 1.05 { 1 } else if ratio < 1.10 { 2 }
            else if ratio < 1.20 { 3 } else if ratio < 1.35 { 4 } else { 5 };
    PROMO_RATIO.with(|r| r.borrow_mut()[i] += 1);
}

pub fn read_promo_ratio() -> [u64; 6] {
    PROMO_RATIO.with(|r| *r.borrow())
}

// ── 폭투 모수 (밸런스 ④) ─────────────────────────────────────────
//
// 🔴 **총량만 보면 어느 손잡이를 돌릴지 못 정한다.** 실측은 이렇다:
//
// ```
//   KBL 1군   폭투/팀 20.3 (목표 30~50)  ·  포일/팀 4.6 (목표 5~15, 하한 아래)
// ```
//
// 폭투를 올리는 길이 둘인데 **포일에 반대로 작용한다:**
//
// ```
//   WILD_PITCH_DISTANCE 를 내린다   후보가 는다 → **포일이 그만큼 준다**
//                                   (같은 문턱으로 갈리니까)
//   WILD_PITCH_BASE_PROB 를 올린다  폭투만 는다. 포일은 그대로
// ```
//
// 포일이 이미 하한 아래라 확률 쪽이 맞아 보이는데, **얼마나 올릴지는
// 모수를 알아야** 정해진다. 어느 단계에서 좁아지는지 센다:
//
// ```
//   [0] 전체 투구
//   [1] 그중 **주자 있고 안 휘두른** 것        ← 판정 자체가 여기서만 돈다
//   [2] 그중 dist >= WILD_PITCH_DISTANCE      ← 폭투 후보
//   [3] 실제 폭투
//   [4] 실제 포일
// ```
//
// ⚠ [1] → [2] 가 좁으면 **문턱이 병목**이고, [2] → [3] 이 좁으면 **확률이
// 병목**이다. 총량 20.3 만으로는 둘을 못 가른다.
thread_local! {
    pub static WP_FUNNEL: RefCell<[u64; 5]> = const { RefCell::new([0; 5]) };
}

fn tally_wp(i: usize) {
    WP_FUNNEL.with(|r| r.borrow_mut()[i] += 1);
}

pub fn read_wp_funnel() -> [u64; 5] {
    WP_FUNNEL.with(|r| *r.borrow())
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
        PitchResultCode::DoublePlay | PitchResultCode::TriplePlay)
}

fn is_inplay(code: PitchResultCode) -> bool {
    is_out_in_play(code) || matches!(code, PitchResultCode::FieldingError |
        PitchResultCode::HitSingle | PitchResultCode::HitDouble |
        PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

/// 삼진 — **타자가 물러난 결과 코드**다.
///
/// 🔴 `StrikeLook`/`StrikeSwing`(투구 하나)과 다르다. 3스트라이크째에
/// `run_pitch`가 코드를 이쪽으로 **좁힌다**(`StrikeoutLook`/`StrikeoutSwing`).
///
/// ⚠ **이 함수가 없어서 결함이 둘 났다** (2026-09-01). 삼진 코드를 새로
/// 만들면서 그걸 읽는 자리를 안 고쳐서, `is_k_out`·`is_ab_terminal`이
/// 좁혀진 코드를 못 알아봤다 — 바로 위 `is_out_in_play` 주석이
/// *"코드가 하나 늘 때마다 빠뜨린 자리가 조용히 생긴다"* 고 경고한 그대로다.
fn is_strikeout(code: PitchResultCode) -> bool {
    matches!(code, PitchResultCode::StrikeoutLook | PitchResultCode::StrikeoutSwing)
}

fn is_ab_terminal(code: PitchResultCode) -> bool {
    // ⚠ **삼진이 여기 없었다.** 그래서 `ab_ended`가 거짓이 되어
    //   **삼진당한 타자가 타순에서 안 넘어갔다** — 같은 타자가 다시 섰다.
    //   아웃은 따로 올라가므로 이닝은 멀쩡했고, 그래서 안 보였다.
    is_strikeout(code) || is_out_in_play(code) || matches!(code, PitchResultCode::Walk |
        PitchResultCode::FieldingError | PitchResultCode::HitSingle |
        PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun)
}

/// 중간값 `InplayOut`을 실제 타구로 좁힌다.
///
/// 타구 종류는 엔진이 이미 `BallInPlay.hitType`으로 정해 놓았는데
/// **결과 코드가 하나뿐이라 화면까지 못 갔다.** 병살은 아웃이 둘이라
/// 따로 둔다 — 색도 연출도 집계도 달라야 한다.
fn narrow_inplay_out(ball: Option<&BallInPlay>, killed: u8) -> PitchResultCode {
    // ⚠ 셋이면 삼중살이다 — 둘과 코드가 달라야 화면·집계가 갈린다
    if killed >= 3 { return PitchResultCode::TriplePlay; }
    if killed >= 2 { return PitchResultCode::DoublePlay; }
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
        // ⚠ **안 넘어오면 1.0(예전 동작)이다**
        bunt_mult:      opts.bunt_mult.unwrap_or(1.0),
        steal_mult:     opts.steal_mult.unwrap_or(1.0),
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
            // ⚠ 기본 수비진은 신원이 없다 — 호출부가 실제 선수를 안 넘겼을 때다.
            //   그런 경기의 실책은 아무에게도 안 붙는다(팀 카운터만 오른다)
            position: *pos, player_id: String::new(), name: name.to_string(),
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
    // 1.1 A④ §5-c — 추천 밖 깊이. 자리 밖 한 칸당 진입이 한 이닝 늦고 상황이 좁아진다.
    //   ⚠ 호출부가 `entry_trigger` 를 직접 넘긴 경우엔 안 건드린다 — 그건 화면·검사가 정한 자리다.
    let depth = opts.role_depth.unwrap_or(0) as i32;
    let entry_trigger = opts.entry_trigger.clone()
        .unwrap_or_else(|| match role {
            PitcherRole::SP => EntryTrigger::InningStart { inning: 1 },
            PitcherRole::RP => {
                let min_inning = if bullpen_read >= 70.0 { 5 } else if bullpen_read >= 40.0 { 6 } else { 7 };
                EntryTrigger::MidInning {
                    inning: (min_inning as i32 + depth).clamp(1, 9) as u8,
                    max_outs: 3,
                    // 지는 경기에만 나온다 — 깊이 한 칸당 2점씩 좁힌다. 0 밑으로는 안 내린다
                    score_diff_cap: (6 - 2 * depth).max(0),
                }
            }
            PitcherRole::CP => {
                // 1.1 A② §6-1-3 — 규칙 파일이 문을 주면(고교 8회 고정 제안) 감독 clutchDecision 을 안 본다
                let (base_inning, max_lead, min_lead) = if let Some(g) = opts.closer_gate.as_ref() {
                    (g.inning_threshold, g.max_lead_diff, g.min_lead_diff)
                } else {
                    (if clutch_decision >= 70.0 { 8 } else { 9 }, 3, 1)
                };
                EntryTrigger::CloseGame {
                    inning_threshold: (base_inning as i32 + depth).clamp(1, 9) as u8,
                    // 여유 있는 상황만 — 깊이 한 칸당 한 점씩 좁힌다. 최소 리드 밑으로는 안 내린다
                    max_lead_diff: (max_lead as i32 - depth).max(min_lead as i32),
                    min_lead_diff: min_lead,
                }
            }
        });
    // 리그별 투구수 상한 — 규칙 파일 값이 오면 그걸, 아니면 tuning 폴백 (1.1 A② §6-1-2 ②)
    let league_key = opts.league_id.as_deref().unwrap_or("");
    let pitch_limit = opts.pitch_limit_override.filter(|v| *v > 0.0).unwrap_or_else(|| T::league_pitch_limit(league_key));
    let pitch_soft  = opts.pitch_limit_override.filter(|v| *v > 0.0).map(|v| v * 0.75).unwrap_or_else(|| T::league_pitch_soft(league_key));
    let starter_outs_factor = opts.starter_outs_factor.filter(|v| *v > 0.0).unwrap_or(1.0);
    // 의무 휴식 — 불펜 주인공이 직전 등판 뒤 쉴 날이 안 찼으면 이 경기엔 못 나온다 (§6-1-4 결함)
    let protagonist_rest_blocked = match (&role, opts.rest_guard.as_ref()) {
        (PitcherRole::SP, _) | (_, None) => false,
        (_, Some(g)) => !crate::rest_rules::check_rest(crate::rest_rules::RestCheckParams {
            last_pitched_date: g.last_pitched_date.clone(),
            last_pitch_count: g.last_pitch_count,
            game_date: g.game_date.clone(),
        }).available,
    };

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

    // 🔴 주인공이 없는 경기면 **아무도 안 들어온다.** 안 그러면 기본값
    //   투수가 그 팀 마운드를 지킨다 — 리그 시뮬 홈이 그랬다.
    let no_protagonist = opts.no_protagonist.unwrap_or(false);
    let is_immediate = !no_protagonist
        && matches!(&entry_trigger, EntryTrigger::InningStart { inning } if *inning <= 1);
    let initial_stamina = clamp(opts.initial_stamina.unwrap_or(82.0), 0.0, 100.0);
    let initial_mental  = clamp(opts.initial_mental.unwrap_or(74.0), 0.0, 100.0);

    let my_manager  = opts.my_manager.as_ref().map(create_manager).unwrap_or(create_manager(&PartialManagerStats::default()));
    let opp_manager = opts.opponent_manager.as_ref().map(create_manager).unwrap_or(create_manager(&PartialManagerStats::default()));

    let fielders = opts.fielders.clone()
        .unwrap_or_else(|| create_default_fielders(rng, 50.0));
    // ⚠ **안 넘기면 빈 채로 둔다** — 그러면 예전 동작(양 반 모두 `fielders`)이다.
    //   기본 수비진을 만들어 채우면 상대가 **평균 50짜리 수비**를 갖게 되어
    //   조용히 밸런스가 바뀐다
    let opponent_fielders = opts.opponent_fielders.clone().unwrap_or_default();

    let match_id = opts.match_id.clone()
        .unwrap_or_else(|| format!("match-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));

    MatchState {
        match_id,
        inning: 1, inning_limit,
        extra_inning_limit: opts.extra_inning_limit.unwrap_or(0),
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
        pitch_limit,
        pitch_soft,
        starter_outs_factor,
        protagonist_rest_blocked,
        protagonist_side,
        protagonist_pitcher, my_npc_pitcher, opponent_npc_pitcher,
        // C-1: 큐가 비면 위의 단일 투수를 그대로 쓴다 — 예전과 완전히 같다
        my_queue: {
            let ps = opts.my_pitchers.clone().unwrap_or_default();
            // ⚠ **우리 감독**이 우리 투수 운용을 정한다
            let mo = queue_max_outs(&ps, rng, my_manager.bullpen_read, starter_outs_factor);
            PitcherQueue { pitch_limit, lines: ps.iter().enumerate().map(|(i, p)| crate::types::PitcherLineAccum { player_id: p.name.clone().unwrap_or_else(|| format!("P{}", i)), ..Default::default() }).collect(), pitchers: ps, max_outs: mo, ..Default::default() }
        },
        opponent_queue: {
            let ps = opts.opponent_pitchers.clone().unwrap_or_default();
            // ⚠ **상대 감독**이 상대 투수 운용을 정한다 — 한쪽만 넘기면
            //   그쪽만 바뀌어 양 팀 기준이 갈린다
            let mo = queue_max_outs(&ps, rng, opp_manager.bullpen_read, starter_outs_factor);
            PitcherQueue { pitch_limit, lines: ps.iter().enumerate().map(|(i, p)| crate::types::PitcherLineAccum { player_id: p.name.clone().unwrap_or_else(|| format!("P{}", i)), ..Default::default() }).collect(), pitchers: ps, max_outs: mo, ..Default::default() }
        },
        home_lineup, away_lineup,
        home_lineup_index: 0, away_lineup_index: 0,
        home_bat_lines: _home_bat_lines, away_bat_lines: _away_bat_lines,
        batter_mean,
        role, entry_trigger,
        no_protagonist,
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
        last_pitch_speed: None,
        last_pitch_zones: vec![],
        weather: opts.weather.unwrap_or(WeatherType::Sunny),
        park:    opts.park.unwrap_or(ParkType::Neutral),
        // ⚠ 안 넘기면 중립 기본값이다 — 예전과 같게 돈다
        park_dims: opts.park_dims.unwrap_or_default(),
        // ⚠ 벤치가 비면 교체가 없다 — 예전과 같게 돈다
        home_bench: opts.home_bench.clone().unwrap_or_default(),
        away_bench: opts.away_bench.clone().unwrap_or_default(),
        home_bench_used: 0,
        away_bench_used: 0,
        is_finished: false,
        logs: vec!["경기 시작".to_string()],
        fielders,
        opponent_fielders,
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
    // 1.1 A② §6-1-2 ③ — 리그 계수(고교 0.80 제안)로 선발 이닝을 줄여 불펜 이닝을 만든다. 0 이면 구 상태 = 1.0
    let factor = if state.starter_outs_factor > 0.0 { state.starter_outs_factor } else { 1.0 };
    ((12.0 + (stam / 99.0) * 15.0) * factor).round().max(1.0) as u32
}

/// 투수마다 몇 아웃까지 맡기나.
///
/// 🔴 **감독이 안 들어갔다.** 선발 이닝은 스태미나+난수, 불펜은 난수뿐이라
///   `bullpenRead` 가 높든 낮든 똑같이 바꿨다 — 그 값은 주인공 등판
///   시점에만 쓰이고 있었다.
///
/// ⚠ `bullpen_read` 가 높을수록 **선발을 일찍 내리고 불펜을 짧게 끊는다**
///   (불펜을 잘 읽는 감독). 50이 기준이라 **50이면 예전 값 그대로다.**
fn queue_max_outs(pitchers: &[PartialPitcherStats], rng: &mut impl Rng,
                  bullpen_read: f64, starter_outs_factor: f64) -> Vec<i32> {
    // 1.1 A② — 주인공 예산과 같은 리그 계수(고교 0.80 제안). 0 이면 1.0
    let factor = if starter_outs_factor > 0.0 { starter_outs_factor } else { 1.0 };
    // 70이면 선발 -3아웃(1이닝), 30이면 +2아웃꼴
    let k = (bullpen_read - 50.0) / 50.0;
    pitchers.iter().enumerate().map(|(i, p)| {
        let stam = p.stamina_cap.unwrap_or(50.0);
        if i == 0 {
            let base = (12.0 + (stam / 99.0) * 15.0) * factor + (rng.gen::<f64>() - 0.5) * 6.0;
            (base - k * 5.0).round().max(6.0) as i32
        } else {
            // ⚠ **절단이다(`as i32`) — 반올림이 아니다.** 예전 식이
            //   `3 + (rng * 4.0) as i32` 라 3~6이었는데, 반올림으로 바꾸면
            //   3~7이 된다. 감독을 얹는 김에 **밸런스가 조용히 움직였고**
            //   검사가 그걸 잡았다.
            (3 + (rng.gen::<f64>() * 4.0) as i32 - (k * 1.5).round() as i32).max(1)
        }
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

/// 지금 **수비하는 팀**의 감독 — 투수 교체를 정한다.
///
/// 🔴 예전엔 늘 `my_manager` 였다. `opponent_manager` 는 만들어져서
///   상태에 실리는데 **아무도 안 읽었다** — 완성된 죽은 갈래였고,
///   그래서 상대 팀은 감독이 누구든 똑같이 투수를 바꿨다.
fn fielding_manager(state: &MatchState) -> &ManagerStats {
    if is_our_team_fielding(state) { &state.my_manager } else { &state.opponent_manager }
}

/// 지금 **공격하는 팀**의 감독 — 번트·도루를 정한다.
///
/// ⚠ 수비 쪽과 **반대다.** 한 함수로 뭉치면 우리가 수비할 때 우리
///   감독이 상대 도루를 정하게 된다.
fn batting_manager(state: &MatchState) -> &ManagerStats {
    if is_our_team_fielding(state) { &state.opponent_manager } else { &state.my_manager }
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

/// 콘택트 품질 — **클수록 투수가 이긴 공이다**(`resolve_contact` 밴드 표).
///
/// ⚠ 인자가 늘었다(결정 ⑩⑪). 노림수는 **구종 이력**을, 결정구는 **카운트와
///   투수 arsenal** 을 봐야 해서 `state`·`pitcher`·`decision` 을 통째로 받는다.
///   값 몇 개만 뽑아 넘기면 부를 때마다 무엇을 넘길지 고르게 되고, 한 자리만
///   빠뜨려도 조용히 꺼진다 — 이 저장소가 이미 여러 번 겪은 모양이다.
fn calculate_contact_quality(
    pitch_q: f64, state: &MatchState, pitcher: &PitcherStats, batter: &BatterStats,
    decision: &PitchDecision, in_zone: bool, in_shadow: bool,
) -> f64 {
    let extra = (batter.contact - 50.0) * 0.20;
    let chase_penalty = if !in_zone { if in_shadow { 5.0 } else { 12.0 } } else { 0.0 };
    // 결정 ⑩ — 읽힌 공은 콘택트가 **오른다**. 그래서 품질에서 뺀다
    let read = batter_read_modifier(decision.pitch_type, &state.last_pitch_types, batter);
    tally_read(read);
    // 결정 ⑪ — 2스트라이크 결정구를 **존 밖에서** 따라 나왔다. 여기서만 얹는다
    // (존 안에 꽂힌 결정구 몫은 `calculate_pitch_quality` 의 PUTAWAY_BONUS 다)
    let putaway_chase = if state.count.strikes >= 2 && !in_zone
        && is_putaway_pitch(pitcher, decision.pitch_type) {
        T::PUTAWAY_CHASE_BONUS
    } else { 0.0 };
    // ⚠ **오프셋은 여기 한 곳에서만 더한다.** 밴드 표는 "동급 = 56"을
    // 전제하는데 실측 평균이 48이다 — 표를 다시 쓰는 대신 입력을 옮긴다.
    // 정본은 `tuning::CONTACT_Q_OFFSET`
    round2(pitch_q - extra + chase_penalty - read + putaway_chase + T::contact_q_offset())
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
    // 완급 조절 (결정 ⑧) — 직전 공과의 km/h 낙차. 구종 반복 페널티와 **겹친다**
    let speed_mod = T::speed_gap_bonus(
        state.last_pitch_speed,
        T::pitch_speed(pitcher.velocity, decision.pitch_type, decision.power),
    );
    // 코스 반복 (결정 ⑨) — 구종과 같은 꼴, 크기만 작다
    let course_mod = course_pattern_modifier(
        course_cell(intended_target(decision)), &state.last_pitch_zones,
    );
    let jam_mod     = jam_pressure_modifier(state, mental, batter.batting_clutch);
    let clutch_mod  = clutch_modifier(state, pitcher.clutch);

    // ⚠ **숙련도가 여기 걸린다.** 예전엔 화면에 "숙련도 4/5"라고 적어놓고
    // 던지면 아무 차이가 없었다 — 계수가 배우는 속도에만 쓰였다.
    let grade_bonus = T::grade_quality_bonus(grade_of(pitcher, decision.pitch_type));

    // 결정 ⑪ — 2스트라이크에 **최고 등급 구종**을 골랐다. 카운트 보정(0-2 +5)은
    // 「그 카운트라서」지 「결정구를 잘 골랐다」가 아니다 — 그 자리를 여기가 맡는다.
    // ⚠ 존 밖 유인에 타자가 따라 나온 몫은 `calculate_contact_quality` 가 얹는다
    let putaway_mod = if state.count.strikes >= 2 && is_putaway_pitch(pitcher, decision.pitch_type) {
        T::PUTAWAY_BONUS
    } else { 0.0 };

    round2(
        T::pitch_base(decision.pitch_type) + grade_bonus
        + T::strategy_bonus(decision.strategy)
        + T::power_bonus(decision.power)
        + location_q
        + command_bonus + velocity_bonus + control_bonus + movement_bonus
        + count_mod + full_count_noise
        - batter_penalty
        + mental_bonus - stamina_penalty
        + weather_mod + park_mod + pattern_mod + speed_mod + course_mod + jam_mod + clutch_mod
        + putaway_mod
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

/// 타구 방향.
///
/// 🔴 예전엔 **투구 코스만** 봤다 — 같은 코스면 홈런왕도 교타자도
///   같은 분포로 쳤다.
/// ⚠ 파워로 당겨치기를 대신한다 — 성향 값이 따로 없다(실측).
fn resolve_zone(hit_type: BallHitType, loc: u8, power: f64,
                rng: &mut impl Rng) -> FieldPosition {
    // 파워가 셀수록 당겨친다. 가운데 코스도 한쪽으로 기운다.
    let pull = ((power - T::PULL_PIVOT) / 50.0 * T::PULL_SPAN).clamp(-0.4, 0.4);
    let pulled = pull > 0.0 && rng.gen::<f64>() < pull;
    let is_left  = (loc == 1 || loc == 4 || loc == 7) || (loc == 2 || loc == 5 || loc == 8) && pulled;
    let is_right = (loc == 3 || loc == 6 || loc == 9) && !pulled;
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

/// 타구 종류가 정하는 발사각 대역(도).
///
/// ⚠ 땅볼이 음수인 게 요점이다 — 담장을 못 넘는다.
fn launch_angle_of(hit_type: BallHitType, rng: &mut impl Rng) -> f64 {
    let (lo, hi) = match hit_type {
        BallHitType::GroundBall => (-12.0, 6.0),
        BallHitType::Bunt       => (-15.0, 0.0),
        BallHitType::LineDrive  => (10.0, 25.0),
        BallHitType::FlyBall    => (25.0, 45.0),
        BallHitType::Popup      => (50.0, 75.0),
    };
    lo + rng.gen::<f64>() * (hi - lo)
}

/// 비거리(m).
///
/// 🔴 **결과가 정해진 뒤 붙이는 장식이 아니다** — 담장을 넘는지
///   이걸로 가른다.
/// ⚠ 최적각(28도)에서 멀어질수록 짧아진다. 팝업이 안 넘어가는 이유다.
fn flight_distance(hardness: u8, angle: f64, power: f64) -> f64 {
    let base = T::FLIGHT_BASE_M + (hardness as f64 - 1.0) * T::FLIGHT_PER_HARDNESS;
    let pw = (power - T::FLIGHT_POWER_PIVOT) / 50.0 * T::FLIGHT_POWER_SPAN;
    let off = (angle - T::FLIGHT_BEST_ANGLE).abs() * T::FLIGHT_ANGLE_PENALTY;
    (base + pw - off).max(0.0)
}

fn resolve_ball_in_play(code: PitchResultCode, decision: &PitchDecision, quality: f64,
                        power: f64, rng: &mut impl Rng) -> Option<BallInPlay> {
    if !is_inplay(code) { return None; }
    let hit_type = resolve_hit_type(code, decision, quality, rng);
    let zone     = resolve_zone(hit_type, decision.location, power, rng);
    let hardness = resolve_hardness(code, decision.power, quality, rng);
    let launch_angle = launch_angle_of(hit_type, rng);
    let distance = flight_distance(hardness, launch_angle, power);
    Some(BallInPlay { hit_type, zone, hardness, distance, launch_angle })
}

/// 그 방향의 담장 거리(m).
///
/// ⚠ 좌우가 비대칭인 구장이 있다 — 수비 위치로 방향을 안다.
fn fence_for(zone: FieldPosition, d: &crate::types::ParkDims) -> f64 {
    match zone {
        FieldPosition::LF => d.lf,
        FieldPosition::RF => d.rf,
        _ => d.cf,
    }
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

/// **이번 반에 수비하는 쪽**의 수비진.
///
/// 🔴 예전엔 반과 무관하게 `state.fielders` 하나만 봤다 — 홈(또는 주인공)
///   팀 9명이 **양 팀 이닝을 다 지켰다.** 원정 수비가 존재하지 않았다.
/// ⚠ `opponent_fielders`가 비면 예전 동작으로 떨어진다(구 세이브 호환).
fn fielding_side<'a>(state: &'a MatchState) -> &'a [FielderStats] {
    if state.opponent_fielders.is_empty() { return &state.fielders; }
    let my_is_home = state.protagonist_side == "home";
    // 초면 홈이 수비, 말이면 원정이 수비다
    let home_is_fielding = state.half == HalfInning::Top;
    if home_is_fielding == my_is_home { &state.fielders } else { &state.opponent_fielders }
}

fn make_default_fielder(pos: FieldPosition) -> FielderStats {
    let p = fielder_default_pos(pos);
    FielderStats { position: pos, player_id: String::new(), name: format!("{:?}", pos),
                   fielding: 50.0, arm: 50.0, speed: 50.0, x: p.x, y: p.y }
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

/// 도루 시도.
///
/// 🔴 **성공해도 기록이 안 남고 있었다** (2026-08-29). 로그 문자열만 만들고
///   타자 줄의 `sb`를 안 올렸다 — **규정타자 103명 전원 도루 0**이었고
///   도루왕이 한 번도 안 나왔다.
/// ⚠ 성공한 주자의 `player_id`를 돌려준다 — 호출부가 그 사람 줄에 단다.
/// 도루 시도.
///
/// ⚠ **성공한 주자와 잡힌 주자를 따로 돌려준다.** 예전엔 성공만 넘겨서
///   도루자가 기록에 안 남았다 — 판정은 도는데 셀 자리가 없었다.
fn attempt_steals(state: &MatchState, pitcher: &PitcherStats, rng: &mut impl Rng)
    -> (MatchRunners, u8, Vec<String>, Vec<String>, Vec<String>)
{
    let mut caught: Vec<String> = vec![];
    let mut stole: Vec<String> = vec![];
    let mut first = state.runners.first.clone();
    let mut second = state.runners.second.clone();
    let mut third = state.runners.third.clone();
    let mut outs = state.outs;
    let mut steal_logs: Vec<String> = vec![];

    // 🔴 **양 팀 감독이 각자 작전을 낸다.** 예전엔 우리가 공격할 때만
    //   감독이 걸렸고, 상대 공격은 늘 기본값이었다.
    let bm = batting_manager(state);
    let manager_boost = (bm.offense_mind - 50.0) * T::OFFENSE_STEAL_MODIFIER;
    // ⚠ 1.0이면 예전 동작이다.
    let steal_mult = bm.steal_mult.clamp(0.0, 3.0);
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

    // 🔴 **견제사** (C-④). `hold_runners` 가 도루 성공률만 낮추고 있었다 —
    //   주자를 잡는 사건이 없어서 견제 좋은 투수가 묶기만 하고 못 잡았다.
    //
    // ⚠ **도루 판정 앞**이다. 뒤에 두면 이미 뛴 주자를 견제하는 꼴이 된다.
    // ⚠ 주루센스가 좋으면 덜 걸린다 — 도루와 **반대 축**을 쓴다.
    // ⚠ 감독이 과감할수록 리드를 크게 시켜 더 걸린다.
    if let Some(r1) = first.clone() {
        if second.is_none() {
            let risk = ((pitcher.hold_runners - 50.0) / 50.0).max(-1.0);
            let lead = ((r1.instinct - 50.0) / 50.0).max(-1.0);
            let bold = steal_mult.clamp(0.5, 2.0);
            let p = (T::PICKOFF_BASE_PROB + risk * T::PICKOFF_HOLD_SPAN
                     - lead * T::PICKOFF_INSTINCT_SPAN) * bold;
            if rng.gen::<f64>() < p.clamp(0.0, T::PICKOFF_MAX_PROB) {
                first = None;
                outs += 1;
                steal_logs.push(format!("견제사 — {}",
                    r1.player_id.clone().unwrap_or_default()));
            }
        }
    }

    if first.is_some() && second.is_none() {
        let r = first.as_ref().unwrap().clone();
        let (attempt_prob, success) = T::steal_second_probs(r.speed, r.instinct, hold_factor, manager_boost, catcher_arm);
        if rng.gen::<f64>() < attempt_prob * steal_mult {
            if rng.gen::<f64>() < success {
                if let Some(id) = r.player_id.clone() { stole.push(id); }
                second = first.take();
                steal_logs.push(format!("도루 성공! 1루→2루 (스피드 {})", r.speed));
            } else {
                first = None; outs += 1;
                if let Some(id) = r.player_id.clone() { caught.push(id); }
                steal_logs.push(format!("도루 실패! 1루 주자 아웃 (스피드 {})", r.speed));
            }
        }
    }
    if let Some(ref r) = second.clone() {
        if third.is_none() && r.speed > T::STEAL_3B_SPEED_GATE {
            let r = r.clone();
            let (attempt_prob, success) = T::steal_third_probs(r.speed, r.instinct, hold_factor, manager_boost, catcher_arm);
            if rng.gen::<f64>() < attempt_prob * steal_mult {
                if rng.gen::<f64>() < success {
                    if let Some(id) = r.player_id.clone() { stole.push(id); }
                    third = second.take();
                    steal_logs.push(format!("도루 성공! 2루→3루 (스피드 {})", r.speed));
                } else {
                    second = None; outs += 1;
                    if let Some(id) = r.player_id.clone() { caught.push(id); }
                    steal_logs.push(format!("도루 실패! 2루 주자 아웃 (스피드 {})", r.speed));
                }
            }
        }
    }
    (MatchRunners { first, second, third }, outs, steal_logs, stole, caught)
}

/// ⚠ **타구 종류를 본다.** 예전엔 안 봐서 주자 1루면 뜬공에도 22%로 병살이
/// 붙었다 — 결과 코드가 `INPLAY_OUT` 하나뿐이라 화면엔 "아웃"으로만 나와
/// 안 보였다. 코드를 쪼개자마자 "중견수 병살타"가 로그에 찍혔다.
/// 병살·삼중살 판정.
///
/// ⚠ **아웃을 몇 개 잡았는지 돌려준다**(0·2·3). `bool` 하나면 삼중살에도
///   아웃이 둘만 올라가 **이닝이 안 끝난다.**
fn try_double_play(
    ball: Option<&BallInPlay>, runners: &MatchRunners, outs_before: u8, rng: &mut impl Rng,
) -> (u8, MatchRunners) {
    if outs_before >= 2 || runners.first.is_none() { return (0, runners.clone()); }
    let type_mod = match ball.map(|b| b.hit_type) {
        Some(BallHitType::GroundBall) | Some(BallHitType::Bunt) => 1.0,
        Some(BallHitType::LineDrive) => T::DOUBLE_PLAY_LINEDRIVE_MOD,
        // 뜬공·팝업으로는 병살이 안 된다
        _ => 0.0,
    };
    if type_mod <= 0.0 { return (0, runners.clone()); }
    let base_prob = (T::DOUBLE_PLAY_BASE_PROB
        + if runners.second.is_some() { 0.05 } else { 0.0 }
        + if runners.third.is_some()  { 0.03 } else { 0.0 }) * type_mod;
    if rng.gen::<f64>() >= base_prob { return (0, runners.clone()); }

    // 🔴 **삼중살** — 병살이 난 타구 중에서 다시 거른다.
    //
    // ⚠ **따로 판정하면 안 된다.** 두 판정이 같은 타구를 두 번 보면
    //   병살이 난 뒤 삼중살이 또 나는 꼴이 된다.
    // ⚠ 조건이 더 좁다: **무사 · 주자 둘 이상.** 1사면 아웃 셋을
    //   잡는 순간 이닝이 이미 끝나 있어 성립하지 않는다.
    let on_base = (runners.first.is_some() as u8)
        + (runners.second.is_some() as u8)
        + (runners.third.is_some() as u8);
    if outs_before == 0 && on_base >= 2
        && rng.gen::<f64>() < T::TRIPLE_PLAY_FROM_DP
    {
        // 주자가 다 죽는다 — 아웃 셋이라 이닝이 끝난다
        return (3, MatchRunners { first: None, second: None, third: None });
    }

    (2, MatchRunners { first: None, second: runners.second.clone(), third: runners.third.clone() })
}

// ── 보정 함수 ─────────────────────────────────────────────────────────────────

fn resolve_mental_delta(code: PitchResultCode) -> f64 {
    match code {
        PitchResultCode::StrikeLook | PitchResultCode::StrikeSwing => 0.5,
        PitchResultCode::InplayOut | PitchResultCode::GroundOut
        | PitchResultCode::FlyOut | PitchResultCode::LineOut => 0.8,
        // 아웃 두 개를 한 번에 잡았다. 0.8을 두 번 준 셈으로 둔다
        PitchResultCode::DoublePlay  =>  1.6,
        // 셋이면 그만큼 더 준다 — 이닝이 한 번에 끝난다
        PitchResultCode::TriplePlay  =>  2.4,
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

/// 구종 반복 페널티 — **⑩ 이후 이건 「투수 몫」의 절반뿐이다.**
///
/// 🔴 나머지 절반은 타자 쪽(`batter_read_modifier`)에 있다. 「같은 구종을
///   이어 던지면 불리하다」는 **한 가지 사실**이라 두 곳에서 세면 반복이
///   두 배로 벌 받는다. 크기 표는 `tuning.rs` 결정 ⑩ 머리말에 있다.
/// ⚠ ⑩ 이 꺼져 있으면 예전 크기(−1/−2/−4 · +1)로 돌아간다 — 계측에서
///   「⑩ 만 껐다」가 정말 예전과 같으려면 이쪽도 같이 되돌아가야 한다.
fn pitch_pattern_modifier(pitch_type: PitchType, last: &[PitchType]) -> f64 {
    if last.is_empty() { return 0.0; }
    let on = T::batter_read_mode() > 0.0;
    let (r1, r2, r3, fresh) = if on {
        (T::PITCH_REPEAT_1, T::PITCH_REPEAT_2, T::PITCH_REPEAT_3, T::PITCH_FRESH_BONUS)
    } else {
        (T::PITCH_REPEAT_1_LEGACY, T::PITCH_REPEAT_2_LEGACY,
         T::PITCH_REPEAT_3_LEGACY, T::PITCH_FRESH_BONUS_LEGACY)
    };
    let mut consecutive = 0usize;
    for &p in last.iter().rev() {
        if p == pitch_type { consecutive += 1; } else { break; }
    }
    if consecutive >= 3 { return r3; }
    if consecutive >= 2 { return r2; }
    if consecutive >= 1 { return r1; }
    if !last.iter().rev().take(T::BATTER_READ_WINDOW).any(|&p| p == pitch_type) { fresh } else { 0.0 }
}

/// 타자 노림수 (결정 ⑩) — **최근 구종 이력을 타자가 읽는다.**
///
/// 🔴 반환값은 **콘택트 품질에서 뺄 몫**이다(양수 = 타자에게 유리).
///   `contact_q` 는 클수록 투수가 이긴 공이므로(`resolve_contact` 밴드 표)
///   읽힌 공은 그만큼 내려야 한다.
/// ⚠ **직전과 같은 구종**이 제일 크고, 직전은 아니어도 **최근 3구에 두 번**
///   나왔으면 그 다음이다. 둘은 안 겹친다 — 큰 쪽 하나만 준다.
/// ⚠ 구종이 많을수록 이게 안 걸린다 — 그게 arsenal 을 넓히는 산식상 이유다.
///   **던지는 이 공까지 세어 3구다**(`BATTER_READ_WINDOW`). 그래서 구종 둘을
///   번갈아 던지면(…A,B 뒤에 A) 지금의 A 가 두 번째라 늘 걸리고, 셋 이상을
///   돌리면 안 걸린다. 구종 개수별 실측은 `npm run probe:a:read`.
fn batter_read_modifier(pitch_type: PitchType, last: &[PitchType], batter: &BatterStats) -> f64 {
    if T::batter_read_mode() <= 0.0 { return 0.0; }
    if last.is_empty() { return 0.0; }
    // **이 공까지 세어 3구**라서 앞 2구만 뒤진다 (`BATTER_READ_WINDOW` 머리말).
    // ⚠ 스윙마다 도는 자리라 **모으지 않는다** — 이터레이터로 훑는다
    let back = T::BATTER_READ_WINDOW.saturating_sub(1);
    let mut window = last.iter().rev().take(back);
    // `next()` 가 직전 공이다. 아래 `any` 는 그 다음부터 이어서 본다 —
    // 직전이 아닌 것을 이미 알고 보는 것이라 두 갈래가 안 겹친다
    let base = if window.next() == Some(&pitch_type) {
        T::BATTER_READ_SAME_AS_LAST
    } else if window.any(|&p| p == pitch_type) {
        T::BATTER_READ_TWICE_IN_WINDOW
    } else {
        return 0.0;
    };
    base * T::batter_read_scale(batter.eye, batter.discipline)
}

/// 결정구인가 (결정 ⑪) — **남들보다 잘 다듬은 공**이어야 한다.
///
/// ⚠ 전 구종이 같은 등급이면 **아무것도 결정구가 아니다.** 그렇게 안 하면
///   2스트라이크에 무엇을 던지든 가산이 붙어 `count_modifier` 를 한 번 더
///   더하는 것과 같아진다 — 「결정구를 잘 골랐다」가 아니다.
fn is_putaway_pitch(pit: &PitcherStats, t: PitchType) -> bool {
    if T::putaway_mode() <= 0.0 { return false; }
    if pit.arsenal.len() < 2 { return false; }
    let Some(top) = pit.arsenal.iter().map(|a| a.grade).max() else { return false };
    if !pit.arsenal.iter().any(|a| a.grade < top) { return false; }
    pit.arsenal.iter().any(|a| a.pitch_type == t && a.grade == top)
}

/// 존 밖 — **칸 하나다.** 사방으로 쪼갤지는 실측 뒤에 정한다 (`tuning.rs` 머리말)
const COURSE_CELL_OUT: u8 = 0;

/// 「같은 자리」의 뜻 — 코스를 칸으로 접는다 (결정 ⑨).
///
/// 🔴 **연속값이라 그대로는 못 센다.** `target` 은 XY 실수라 두 번 같은 값이
///   나오는 일이 없다 — 접지 않으면 반복이 **영원히 0건**이다.
///
/// ⚠ **겨냥한 곳으로 센다(`target`), 꽂힌 곳이 아니다.** 구종 페널티가
///   「고른 구종」을 보는 것과 같은 자리다 — 제구가 흔들려 딴 데 간 것을
///   「코스를 바꿨다」로 쳐 주면 제구 나쁜 투수가 이득을 본다.
/// ⚠ 존 밖(|x|>1 또는 |y|>1)은 한 칸이다. `target_to_zone` 은 존 밖도 3×3 에
///   욱여넣으므로 여기서 먼저 가른다.
fn course_cell(t: XY) -> u8 {
    if t.x.abs() > 1.0 || t.y.abs() > 1.0 { return COURSE_CELL_OUT; }
    target_to_zone(t)
}

/// 코스 반복 페널티 — `pitch_pattern_modifier` 와 **같은 꼴**이고 크기만 작다.
///
/// ⚠ 구종 페널티와 **겹쳐 걸린다.** 같은 구종을 같은 자리에 이어 던지면 둘 다
///   맞는다 — 그게 이 결정의 뜻이다(하나만 바꿔도 벌이 준다).
fn course_pattern_modifier(cell: u8, last: &[u8]) -> f64 {
    if T::course_mode() <= 0.0 { return 0.0; }
    if last.is_empty() { return 0.0; }
    let mut consecutive = 0usize;
    for &c in last.iter().rev() {
        if c == cell { consecutive += 1; } else { break; }
    }
    if consecutive >= 3 { return T::COURSE_REPEAT_3; }
    if consecutive >= 2 { return T::COURSE_REPEAT_2; }
    if consecutive >= 1 { return T::COURSE_REPEAT_1; }
    if !last.iter().rev().take(3).any(|&c| c == cell) { T::COURSE_FRESH_BONUS } else { 0.0 }
}

/// 이 결정이 겨냥한 자리. **`target` 이 없으면 존 좌표로 되돌린다** —
/// 플레이어 입력은 `location`(1~9)만 올 수 있다
fn intended_target(decision: &PitchDecision) -> XY {
    decision.target.unwrap_or_else(|| zone_to_target(decision.location))
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
    // 🔴 **연장 상한** (2026-08-29). 예전엔 이 줄이 없어서 승부가 날 때까지
    //   했다 — **무승부가 구조상 안 나왔다.** KBO는 12회까지다.
    // ⚠ `0`이면 무제한이다 — 대회·포스트시즌은 승자가 나와야 한다.
    if state.extra_inning_limit > 0 && state.inning > state.extra_inning_limit { return true; }
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
        PitchResultCode::TriplePlay   => "삼중살!",
        PitchResultCode::FieldingError=> "실책",
        PitchResultCode::Walk         => "볼넷",
        PitchResultCode::HitByPitch   => "몸에 맞는 공",
        PitchResultCode::Interference => "수비 방해",
        PitchResultCode::SacBunt      => "희생번트",
        PitchResultCode::SqueezeBunt  => "스퀴즈",
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
        PitchResultCode::DoublePlay => "DOUBLE_PLAY", PitchResultCode::TriplePlay => "TRIPLE_PLAY",
        PitchResultCode::FieldingError => "FIELDING_ERROR",
        PitchResultCode::Walk => "WALK",
        PitchResultCode::HitByPitch => "HIT_BY_PITCH",
        PitchResultCode::Interference => "INTERFERENCE",
        PitchResultCode::SacBunt => "SAC_BUNT", PitchResultCode::SqueezeBunt => "SQUEEZE",
        PitchResultCode::SacFly => "SAC_FLY",
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

            // 🔴 **병살은 두 번 던진다.** 예전엔 송구 큐가 하나뿐이라
            //   화면에서 병살과 평범한 땅볼이 **똑같이 보였다.**
            //   2루(포스아웃) → 1루(타자아웃)가 실제 순서다.
            // ⚠ 첫 송구가 이미 1루면 두 번째가 없다 — 그건 1루에서
            //   잡고 2루로 던지는 드문 형태라 여기 모델엔 없다.
            if code == PitchResultCode::DoublePlay && threw_to != FieldPosition::B1 {
                let relay_from = throw_to;
                let relay_to = fielder_default_pos(FieldPosition::B1);
                cues.push(AnimationCue::BallThrow {
                    from: relay_from, to: relay_to, duration: 220,
                });
            }
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
/// 코스를 고르되 **직전 칸을 피한다** (결정 ⑨ · 2026-09-07).
///
/// 🔴 **안 피하면 AI 만 손해다.** 코스 반복 페널티는 플레이어와 AI 에 똑같이
///   걸리는데, 플레이어는 눈으로 보고 자리를 바꾸고 AI 는 계속 같은 칸에
///   던진다 — 벌만 AI 가 먹는다. 구종 쪽은 `pick_from_arsenal` 이 이미
///   보유 목록에서 섞어 뽑아 이 문제가 없다.
///
/// ⚠ **볼 3개면 안 피한다.** 그 카운트의 자리는 「존 한복판」 하나뿐이라
///   피하게 만들면 볼넷을 피하려는 행동 자체가 무너진다 — 페널티(−0.5)보다
///   볼넷 한 개가 훨씬 비싸다.
/// ⚠ **다시 뽑는 것은 한 번뿐이다.** 유인구처럼 칸이 하나(존 밖)인 자리는
///   몇 번을 다시 뽑아도 같은 칸이 나온다 — 무한 반복이 된다.
fn pick_target_avoiding(balls: u8, strikes: u8, last_zones: &[u8], rng: &mut impl Rng) -> XY {
    let first = pick_target(balls, strikes, rng);
    // 🔴 **꺼져 있으면 난수를 한 방울도 더 안 먹는다.** 재추첨이 rng 를
    //   당기므로, 여기서 안 막으면 「끈 상태」가 결정 ⑨ 이전과 달라진다
    if T::course_mode() <= 0.0 { return first; }
    if balls >= 3 { return first; }
    let Some(&last) = last_zones.last() else { return first };
    if course_cell(first) != last { return first; }
    pick_target(balls, strikes, rng)
}

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
    let target = pick_target_avoiding(balls, strikes, &state.last_pitch_zones, rng);
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
///
/// ⚠ **여기는 코스 반복을 안 피한다**(결정 ⑨). 이 함수가 서 있는 자리는
///   **플레이어**다 — 자동진행의 AI 는 `auto_pick_decision` 이고 그쪽이
///   `pick_target_avoiding` 을 쓴다. 여기까지 피하게 만들면 「손으로 던지면
///   벌을 먹고 자동이면 안 먹는다」의 반대가 되어, 플레이어가 실제로 받는
///   벌을 감사(`audit:engine`)가 못 본다.
/// 🔴 **구종을 하드코딩으로 뽑고 있었다** (2026-09-08). `[Fastball, Slider,
///   Curve, Changeup]` 넷을 균등 추첨했다 — `pick_from_arsenal` 이 예전에
///   가지고 있던 바로 그 결함이고, 고칠 때 이 형제 함수까지 안 왔다.
///
///   ⚠ 새는 자리가 둘이었다:
///   ① **안 가진 구종을 던졌다.** 너클볼만 익힌 투수도 여기선 슬라이더를 던진다.
///   ② **숙련도가 안 걸렸다.** `grade_of` 는 arsenal 에 없으면 기준(3)을 주므로,
///      넷 중 안 가진 구종은 늘 3등급으로 계산됐다.
///
///   그래서 **엔진 직접 호출 계측 전부**(`audit:engine` ② · `probe:a:tempo` ·
///   `probe:a:read`)가 「구종 넷을 균등하게 던지는 투수」를 재고 있었다.
///   구종 개수를 2~5로 바꿔도 피안타율이 소수점 셋째 자리까지 똑같이 나온
///   것이 이 결함의 증상이다 — arsenal 이 산식에 아예 안 닿았다.
///
/// ⚠ 실제 플레이는 원래 멀쩡했다. 플레이어는 화면에서 자기 구종만 고르고
///   NPC 는 `auto_pick_decision` → `pick_from_arsenal` 을 탄다. 이 함수는
///   **계측·자동 시뮬 전용**이라 결함이 화면에 안 보였다.
fn random_decision_for_sim(pitcher: &PitcherStats, balls: u8, strikes: u8, rng: &mut impl Rng) -> PitchDecision {
    let strats   = [PitchStrategy::Aggressive, PitchStrategy::Balanced, PitchStrategy::Safe];
    let powers   = [PitchPower::Low, PitchPower::Normal, PitchPower::High];
    // 코스는 공통 함수를 쓴다 — 여기 좌표를 따로 적으면 `auto_pick_decision`과
    // 어긋나고, 실제로 그래서 두 경로가 각자 볼넷을 못 만들고 있었다.
    // 카운트를 모르는 자리라 중립 카운트로 뽑는다
    let target   = pick_target(balls, strikes, rng);
    PitchDecision {
        // **보유 구종에서 고른다** — 규칙은 `pick_from_arsenal` 이 정본이다.
        // 여기 표를 다시 적으면 두 경로가 또 갈린다
        pitch_type: pick_from_arsenal(pitcher, balls, strikes, rng),
        location:   target_to_zone(target),
        target:     Some(target),
        strategy:   strats[rng.gen_range(0..strats.len())],
        power:      powers[rng.gen_range(0..powers.len())],
    }
}

// ── 등판 진입/강판 ────────────────────────────────────────────────────────────

fn should_protagonist_enter(state: &MatchState) -> bool {
    // 🔴 **여기도 막아야 한다.** 시작만 막으면 `entry_trigger` 가 나중에
    //   불러들여서 6회쯤 기본값 투수가 등판한다 — 갈래가 둘이다.
    if state.no_protagonist { return false; }
    // 의무 휴식이 안 찼다 — 불펜 주인공은 이 경기에 못 나온다 (1.1 A② §6-1-4 · 고교 주말 연투 결함)
    if state.protagonist_rest_blocked { return false; }
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
    // 완급·코스 기억도 같이 비운다 — 투수가 바뀌면 앞 사람의 배열이다
    next.last_pitch_speed = None;
    next.last_pitch_zones = vec![];
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
    next.last_pitch_speed    = None;
    next.last_pitch_zones    = vec![];
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
    let (steal_runners, steal_outs, mut steal_logs, stole_ids, caught_ids) = attempt_steals(state, &active_pitcher, rng);
    let mut pre_runners = steal_runners;
    let mut pre_outs    = steal_outs;

    // 🔴 **보크** (2단계). 투구 전 사건이라 **타석은 그대로**고 주자만
    //   한 칸씩 간다 — 결과 코드가 필요 없다.
    //
    // ⚠ **도루 함수 안에 못 넣는다.** 3루 주자가 홈에 오면 득점인데
    //   `attempt_steals` 는 득점을 반환하지 않는다. 여기선 점수를 만진다.
    // ⚠ 제구가 나쁠수록 자주 낸다. 실제 KBO 는 팀당 시즌 3~8개다.
    let mut balk_runs = 0i32;
    let mut balked = false;
    let mut balk_scored_ids: Vec<String> = vec![];
    if pre_runners.first.is_some() || pre_runners.second.is_some()
        || pre_runners.third.is_some()
    {
        let ctl = ((50.0 - active_pitcher.control) / 50.0).max(0.0);
        let p = T::BALK_BASE_PROB + ctl * T::BALK_CONTROL_SPAN;
        if rng.gen::<f64>() < p.clamp(0.0, T::BALK_MAX_PROB) {
            balked = true;
            // ⚠ **뒤에서부터** 민다 — 앞에서 밀면 덮어쓴다
            if let Some(r3) = pre_runners.third.take() {
                balk_runs += 1;
                if let Some(id) = r3.player_id.clone() { balk_scored_ids.push(id); }
            }
            pre_runners.third  = pre_runners.second.take();
            pre_runners.second = pre_runners.first.take();
            steal_logs.push(if balk_runs > 0 {
                "보크! 3루 주자가 홈을 밟는다".to_string()
            } else {
                "보크! 주자가 한 베이스씩 진루한다".to_string()
            });
        }
    }
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
    // 🔴 **대타** (7단계). 후반 접전에 약한 타자를 바꾼다.
    //
    // ⚠ **새 설계가 아니다** — `PitcherQueue` 가 하던 일을 타자에 옮겼다.
    //   벤치를 앞에서부터 소모하고 라인업의 그 자리를 갈아 끼운다.
    // ⚠ **타순 자리를 물려받는다** — 9번을 바꾸면 그 뒤로도 9번에서 친다.
    // ⚠ 감독 `tacticalIQ` 가 판단한다 — 이번 세션에 살린 값이다.
    // ⚠ 벤치가 비면 아무 일도 안 일어난다(예전 동작).
    let mut pinch_state = pre_state.clone();
    // ⚠ 로그는 여기서 못 넣는다 — 마지막 조합이 `state.logs` 를 복사하고
    //   `pre_state.logs` 는 통째로 버린다. 밖으로 들고 나간다.
    let mut pinch_log: Option<String> = None;
    {
        let bat_is_home = pre_state.half == HalfInning::Bottom;
        let (bench, used, lineup, idx) = if bat_is_home {
            (&pre_state.home_bench, pre_state.home_bench_used,
             &pre_state.home_lineup, pre_state.home_lineup_index)
        } else {
            (&pre_state.away_bench, pre_state.away_bench_used,
             &pre_state.away_lineup, pre_state.away_lineup_index)
        };
        let slot = if lineup.is_empty() { 0 } else { idx % lineup.len() };
        // 🔴 **타석 시작에만 바꾼다.** 이게 없으면 투구마다 판정해서
        //   볼카운트 1-2 도중에 타자가 갈린다 — 야구가 아니다.
        let pa_start = pre_state.count.balls == 0 && pre_state.count.strikes == 0;
        // 🔴 **한 자리를 남긴다.** 대타가 벤치를 다 먹으면 8회 뒤
        //   대주자가 쓸 사람이 없다 — 실측에서 대주자가 팀당 0.08~0.16회였다.
        //   실제 감독도 대주자를 들려높고 간다.
        if pa_start && used + 1 < bench.len() && !lineup.is_empty()
            && pre_state.inning >= T::PINCH_HIT_MIN_INNING
            // ⚠ 3점 차까지 본다 — 2점이면 팀당 0.67회로 실제(1~2)보다 적다
            && (pre_state.score.home - pre_state.score.away).abs() <= 3
        {
            let cur = &lineup[slot];
            let cand = &bench[used];
            // 컨택+파워로 견준다 — 타자 OVR 이 따로 없다
            let cur_v = cur.contact + cur.power;
            let cand_v = cand.contact + cand.power;
            if cand_v >= cur_v + T::PINCH_HIT_OVR_GAP * 2.0 {
                let iq = (batting_manager(&pre_state).tactical_iq - 50.0) / 50.0;
                let p = T::PINCH_HIT_PROB * (1.0 + iq * 0.5);
                // ⚠ 천장이 0.9면 `PINCH_HIT_PROB` 0.6 × 최고 IQ(1.5)가 딱
                //   닿아서 **위로는 감독이 아무것도 안 하게** 된다.
                if rng.gen::<f64>() < p.clamp(0.0, 0.95) {
                    let picked = cand.clone();
                    let name = picked.name.clone().unwrap_or_default();
                    let pid = picked.id.clone().unwrap_or_default();
                    if bat_is_home {
                        pinch_state.home_lineup[slot] = picked;
                        pinch_state.home_bench_used += 1;
                    } else {
                        pinch_state.away_lineup[slot] = picked;
                        pinch_state.away_bench_used += 1;
                    }
                    // 🔴 **기록은 사람을 따라간다.** 자리는 물려받지만 타수까지
                    //   물려받으면 안 된다 — 대타 줄이 없으면 바뀌기 전 선수
                    //   기록에 쌓인다. 아래 집계가 `player_id` 로 찾는다.
                    if !pid.is_empty() {
                        let lines = if bat_is_home { &mut pinch_state.home_bat_lines }
                                    else           { &mut pinch_state.away_bat_lines };
                        if !lines.iter().any(|x| x.player_id == pid) {
                            lines.push(crate::types::BatterLineAccum {
                                player_id: pid, ..Default::default() });
                        }
                    }
                    pinch_log = Some(format!("대타 — {}", name));
                }
            }
        }
    }

    // 🔴 **대주자** (7단계). 늦은 접전에 느린 주자를 바꾼다.
    //
    // ⚠ **대타와 같은 벤치**다 — 대타로 넷을 다 쓰면 대주자가 없다.
    // ⚠ **타순 자리도 물려받는다.** 안 하면 이미 물러난 사람이 계속
    //   타석에 선다 — 라인업에서 그 id 자리를 찾아 같이 갈아 끼운다.
    // ⚠ 벤치는 앞에서부터 쓰는데 대주자는 **제일 빠른 사람**을 원한다.
    //   남은 구간에서 골라 맨 앞으로 당긴 뒤 소모한다(불변식 유지).
    // ⚠ 3루 주자는 안 바꾼다 — 한 베이스면 발이 거의 안 쓰인다.
    let mut pinch_run_log: Option<String> = None;
    {
        let bat_is_home = pinch_state.half == HalfInning::Bottom;
        let used = if bat_is_home { pinch_state.home_bench_used }
                   else          { pinch_state.away_bench_used };
        let blen = if bat_is_home { pinch_state.home_bench.len() }
                   else          { pinch_state.away_bench.len() };
        let pa_start = pinch_state.count.balls == 0 && pinch_state.count.strikes == 0;
        if pa_start && used < blen
            && pinch_state.inning >= T::PINCH_RUN_MIN_INNING
            && (pinch_state.score.home - pinch_state.score.away).abs() <= 2
        {
            // 느린 쪽부터 본다 — 2루가 득점권이라 먼저다
            let target: Option<u8> = if pinch_state.runners.second.is_some() { Some(2) }
                                     else if pinch_state.runners.first.is_some() { Some(1) }
                                     else { None };
            if let Some(base) = target {
                let cur = if base == 2 { pinch_state.runners.second.clone() }
                          else         { pinch_state.runners.first.clone() };
                let cur = cur.unwrap();
                let bench = if bat_is_home { &pinch_state.home_bench }
                            else          { &pinch_state.away_bench };
                // 남은 벤치 중 제일 빠른 사람
                let best = (used..bench.len())
                    .max_by(|&a, &b| bench[a].speed.total_cmp(&bench[b].speed))
                    .unwrap();
                if bench[best].speed >= cur.speed + T::PINCH_RUN_SPEED_GAP {
                    let iq = (batting_manager(&pinch_state).tactical_iq - 50.0) / 50.0;
                    let p = T::PINCH_RUN_PROB * (1.0 + iq * 0.5);
                    if rng.gen::<f64>() < p.clamp(0.0, 0.95) {
                        if bat_is_home { pinch_state.home_bench.swap(used, best); }
                        else           { pinch_state.away_bench.swap(used, best); }
                        let picked = if bat_is_home { pinch_state.home_bench[used].clone() }
                                     else          { pinch_state.away_bench[used].clone() };
                        let name = picked.name.clone().unwrap_or_default();
                        let pid = picked.id.clone().unwrap_or_default();
                        let new_runner = create_runner(&picked);
                        if base == 2 { pinch_state.runners.second = Some(new_runner); }
                        else         { pinch_state.runners.first  = Some(new_runner); }
                        // 🔴 타순 자리도 물려받는다 — 안 하면 물러난 사람이 또 친다
                        if let Some(ref old_id) = cur.player_id {
                            let lineup = if bat_is_home { &mut pinch_state.home_lineup }
                                         else          { &mut pinch_state.away_lineup };
                            if let Some(slot) = lineup.iter().position(|b| b.id.as_deref() == Some(old_id.as_str())) {
                                lineup[slot] = picked;
                            }
                        }
                        // 기록도 사람을 따라간다 — 그 사람 득점·도루가 붙을 자리
                        if !pid.is_empty() {
                            let lines = if bat_is_home { &mut pinch_state.home_bat_lines }
                                        else          { &mut pinch_state.away_bat_lines };
                            if !lines.iter().any(|x| x.player_id == pid) {
                                lines.push(crate::types::BatterLineAccum {
                                    player_id: pid, ..Default::default() });
                            }
                        }
                        if bat_is_home { pinch_state.home_bench_used += 1; }
                        else           { pinch_state.away_bench_used += 1; }
                        pinch_run_log = Some(format!("대주자 — {}루에 {}", base, name));
                    }
                }
            }
        }
    }
    let pre_state = pinch_state;

    let current_batter  = get_current_batter(&pre_state, rng);
    let current_stamina = get_active_stamina(&pre_state);
    let current_mental  = get_active_mental(&pre_state);

    // ── 3. 착탄 → 스윙 → 결과 ────────────────────────────────────────────────
    let target = intended_target(decision);
    let lr = resolve_actual_landing(target, &current_pitcher, current_stamina, current_mental, &pre_state, rng);
    let quality = calculate_pitch_quality(&pre_state, &current_pitcher, &current_batter, current_stamina, current_mental, decision, lr.landing, rng);
    // 🔴 **히트앤런** (C-③). 주자를 뛰게 하면서 타자가 친다.
    //
    // ⚠ **도루와 별도 갈래다.** 기존 도루 판정에 섞으면 도루 시도율이
    //   통째로 는다 — 기준선 중앙주자 3.2~5.6% · 상위주자 18.3~18.8%.
    // ⚠ 조건: 1루 주자 · 2루 빔 · 2아웃 전 · 스트라이크 2개 전.
    //   2스트라이크에 걸면 헛스윙 삼진 + 도루사로 이닝이 끝난다.
    let hit_and_run = pre_state.runners.first.is_some()
        && pre_state.runners.second.is_none()
        && pre_state.outs < 2
        && pre_state.count.strikes < 2
        && rng.gen::<f64>() < T::HIT_AND_RUN_PROB
            * batting_manager(&pre_state).steal_mult.clamp(0.0, 3.0);

    let (swings, umpire_strike) = if hit_and_run {
        // 🔴 **타자는 무조건 친다.** 그게 작전이다 — 주자가 이미 뛰었으니
        //   거르면 도루사가 된다.
        (true, false)
    } else {
        swing_decision(lr.landing, decision.pitch_type, &current_batter, lr.in_zone, lr.in_shadow, rng)
    };

    let mut result_code = if !swings {
        if umpire_strike { PitchResultCode::StrikeLook } else { PitchResultCode::Ball }
    } else {
        let cq = calculate_contact_quality(
            quality, &pre_state, &current_pitcher, &current_batter, decision, lr.in_zone, lr.in_shadow,
        );
        tally_contact_band(cq);
        apply_hit_upgrade(resolve_contact(quality, cq, &current_batter, rng), current_batter.power, pre_state.weather, rng)
    };

    // 🔴 **고의사구** (C-①). 예전엔 어떤 상황에서도 승부만 했다 —
    //   1루가 비고 2사 3루에 강타자가 서도 그냥 던졌다.
    //
    // ⚠ **1루가 비어야 한다.** 채워져 있으면 밀어내기 위험만 늘고
    //   포스 상황도 안 만들어진다 — 실제 야구가 그렇다.
    // ⚠ 판단은 **수비 쪽 감독**이다 — 번트·도루(공격 쪽)와 반대다.
    // ⚠ **`result_code` 를 덮어쓴다.** 조기 반환을 만들면 아래 기록
    //   집계·주자 진루를 통째로 건너뛰어 **볼넷이 기록에 안 남는다.**
    if !swings && pre_state.count.balls == 0 && pre_state.count.strikes == 0 {
        let fm = fielding_manager(&pre_state);
        let first_open = pre_state.runners.first.is_none();
        let scoring = pre_state.runners.second.is_some()
            || pre_state.runners.third.is_some();
        let diff = (pre_state.score.home - pre_state.score.away).abs();
        if first_open && scoring && pre_state.outs >= 1 && diff <= 3 {
            // 타자가 셀수록, 감독이 조심스러울수록 자주 건다.
            // `tactical_iq` 는 **상황을 알아보는 눈**이라 높을수록 잘 고른다.
            let power = current_batter.power.max(current_batter.contact);
            let iq = (fm.tactical_iq - 50.0) / 50.0;
            let over = ((power - T::IBB_BATTER_PIVOT) / 50.0).max(0.0);
            // 과감한 감독은 덜 피한다 — 작전 성향축(`steal_mult`)을 같이 쓴다
            let bold = fm.steal_mult.clamp(0.5, 2.0);
            let p = (T::IBB_BASE_PROB + over * T::IBB_POWER_SPAN)
                * (1.0 + iq * 0.4) / bold;
            if rng.gen::<f64>() < p.clamp(0.0, T::IBB_MAX_PROB) {
                result_code = PitchResultCode::Walk;
            }
        }
    }

    // 🔴 **히트앤런 결과.** 맞히면 주자가 살고, 헛치면 주자가 죽는다.
    //
    // ⚠ **병살을 피하는 게 이 작전의 값이다.** 땅볼이 나와도 주자가
    //   이미 뛰고 있어서 2루에서 못 잡는다.
    // ⚠ 헛스윙이면 주자는 **도루 시도가 된 셈**이다 — 포수가 바로 던진다.
    let mut hnr_runner_out = false;
    if hit_and_run {
        match result_code {
            // 맞혔다 — 병살·삼중살을 땅볼로 낮춘다(주자가 이미 뛰어
            // 2루에서 안 잡힌다). ⚠ 삼중살을 빼면 히트앤런을 걸고도
            //   주자 둘이 죽는다 — 작전을 거는 이유가 사라진다.
            PitchResultCode::DoublePlay | PitchResultCode::TriplePlay => {
                result_code = PitchResultCode::GroundOut;
            }
            // 헛쳤다 — 주자가 뛰다 잡힌다. 타자는 스트라이크만 먹는다
            PitchResultCode::StrikeSwing | PitchResultCode::StrikeoutSwing => {
                if rng.gen::<f64>() < T::HIT_AND_RUN_CAUGHT_PROB {
                    hnr_runner_out = true;
                }
            }
            _ => {}
        }
    }

    let ball_in_play = resolve_ball_in_play(result_code, decision, quality,
                                            current_batter.power, rng);

    // 🔴 **수비 방해** (6단계). 포수가 타자 스윙을 방해했다.
    //
    // ⚠ 스윙했을 때만이다 — 안 휘두르면 방해할 게 없다.
    // ⚠ **타수가 아니다**(볼넷과 같은 취급). 그래서 결과 코드가 따로 있다.
    // ⚠ 포수 수비가 나쁠수록 잦다. 실제 KBO 는 팀당 시즌 1~3건이다.
    if swings {
        let cb = pre_state.fielders.iter()
            .find(|f| f.position == crate::types::FieldPosition::C)
            .map(|f| f.fielding)
            .unwrap_or(T::CATCHER_BLOCK_PIVOT);
        let blk = (1.0 - (cb - T::CATCHER_BLOCK_PIVOT) / 50.0).clamp(0.2, 1.8);
        if rng.gen::<f64>() < T::INTERFERENCE_PROB * blk {
            result_code = PitchResultCode::Interference;
        }
    }

    // 🔴 **수비 시프트** (5단계). 당겨치는 타자에게 수비를 기울인다.
    //
    // ⚠ **방향이 정해진 뒤**에 건다 — `resolve_contact` 는 안타/아웃만
    //   정하고 어디로 갔는지는 모른다.
    // ⚠ **양방향이다.** 시프트 쪽 땅볼은 아웃이 늘고, 반대(빈 자리)로
    //   간 땅볼은 안타가 는다. 한쪽만 하면 리그 타율이 통째로 움직인다.
    // ⚠ 땅볼에만 건다 — 뜬공은 시프트와 무관하다.
    if let Some(b) = ball_in_play.as_ref() {
        let shifted = current_batter.power >= T::SHIFT_POWER_MIN;
        if shifted && b.hit_type == BallHitType::GroundBall {
            // 당겨치는 쪽(3루·유격) 이 시프트 방향이다
            let to_shift = matches!(b.zone,
                FieldPosition::B3 | FieldPosition::SS);
            let r = rng.gen::<f64>();
            match (result_code, to_shift) {
                // 시프트 쪽으로 굴렀다 — 수비가 몰려 있어 잡힌다
                (PitchResultCode::HitSingle, true)
                    if r < T::SHIFT_OUT_BONUS =>
                {
                    result_code = PitchResultCode::GroundOut;
                }
                // 빈 자리로 굴렀다 — 수비가 비어 안타가 된다
                (PitchResultCode::InplayOut, false)
                | (PitchResultCode::GroundOut, false)
                    if r < T::SHIFT_HOLE_PENALTY =>
                {
                    result_code = PitchResultCode::HitSingle;
                }
                _ => {}
            }
        }
    }

    // 🔴 **담장으로 다시 본다** (4단계 ③). 예전엔 홈런이 확률표에서
    //   바로 나와 **같은 타구가 잠실이든 사직이든 똑같이 홈런**이었다.
    //
    // ⚠ **확률표를 갈아엎지 않는다.** 표가 "얼마나 잘 맞았나"를 정하고,
    //   여기선 그 타구가 담장을 넘느냐만 본다.
    // ⚠ **양방향이다.** 표의 홈런이 못 넘으면 내리고, 표의 장타가
    //   넘으면 올린다. 한쪽만 하면 홈런이 일방적으로 줄거나 는다.
    // ⚠ 땅볼·번트는 안 본다 — 발사각이 음수라 애초에 못 넘는다.
    if let Some(b) = ball_in_play.as_ref() {
        let is_air = matches!(b.hit_type,
            BallHitType::FlyBall | BallHitType::LineDrive);
        if is_air {
            let fence = fence_for(b.zone, &pre_state.park_dims);
            let over = b.distance >= fence;
            match (result_code, over) {
                // 🔴 **표는 홈런인데 못 넘었다.** 예전엔 무조건 2루타였다 —
                //   1m 못 미친 타구와 20m 못 미친 타구가 같은 결과였다.
                //
                // ⚠ **담장 대비 비율**로 가른다. 절대 거리로 하면 구장마다
                //   같은 5m 가 다른 뜻이 된다.
                (PitchResultCode::HomeRun, false) => {
                    let ratio = b.distance / fence.max(1.0);
                    result_code = if ratio >= T::FENCE_HIT_RATIO {
                        // 펜스 직격 — 튀는 방향에 따라 3루타도 된다
                        if rng.gen::<f64>() < T::FENCE_TRIPLE_PROB {
                            tally_fence_move(1);
                            PitchResultCode::HitTriple
                        } else {
                            tally_fence_move(0);
                            PitchResultCode::HitDouble
                        }
                    } else if ratio >= T::DEEP_FLY_RATIO {
                        // 담장 앞 깊은 타구 — 2루타
                        tally_fence_move(0);
                        PitchResultCode::HitDouble
                    } else {
                        // 담장 근처도 못 갔다 — 평범한 뜬공 아웃
                        tally_fence_move(2);
                        PitchResultCode::FlyOut
                    };
                }
                // 표는 장타인데 넘었다 — 홈런이다
                // 🔴 **표는 장타인데 넘었다 — 문턱을 넘어야 홈런이다.**
                //
                // ⚠ 예전엔 `over` 하나만 봐서 **1cm 넘어도 홈런**이었다.
                //   내리는 쪽은 0.94 / 0.82 로 3단계인데 올리는 쪽만
                //   문턱이 없어 비대칭이었고, 실측에서 승격 6,182 >
                //   강등 4,631 로 **담장이 홈런을 만들고 있었다.**
                // ⚠ 문턱을 못 넘으면 표 그대로 둔다 — 2루타는 2루타,
                //   3루타는 3루타다. 여기서 내리면 강등 갈래와 겹친다.
                (PitchResultCode::HitDouble, true)
                    if b.distance / fence.max(1.0) >= T::FENCE_PROMOTE_RATIO => {
                    tally_fence_move(3);
                    tally_promo_ratio(b.distance / fence.max(1.0));
                    result_code = PitchResultCode::HomeRun;
                }
                (PitchResultCode::HitTriple, true)
                    if b.distance / fence.max(1.0) >= T::FENCE_PROMOTE_RATIO => {
                    tally_fence_move(4);
                    tally_promo_ratio(b.distance / fence.max(1.0));
                    result_code = PitchResultCode::HomeRun;
                }
                // 🔴 **그라운드 홈런** — 담장 **안**에 떨어졌는데 다 돌았다.
                //
                // ⚠ 조건이 겹쳐야 난다: 3루타가 날 만큼 깊고 · 좌우 구석이고 ·
                //   주자가 아주 빠르다. 실제 KBO 는 시즌 2~5건이다.
                // ⚠ **담장을 넘은 게 아니다** — `over` 가 false 인 갈래다.
                (PitchResultCode::HitTriple, false)
                    if current_batter.speed >= T::INSIDE_PARK_SPEED_MIN
                        && matches!(b.zone, FieldPosition::LF | FieldPosition::RF)
                        && b.distance / fence.max(1.0) >= T::DEEP_FLY_RATIO
                        && rng.gen::<f64>() < T::INSIDE_PARK_PROB =>
                {
                    tally_fence_move(5);
                    result_code = PitchResultCode::HomeRun;
                }
                _ => {}
            }
        }
    }

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
        // ⚠ 3루 주자는 여기 안 넣는다 — **그건 아래 스퀴즈다.**
        && (pre_state.runners.first.is_some() || pre_state.runners.second.is_some())
        && (pre_state.score.home - pre_state.score.away).abs() <= 3
        // ⚠ **지금 공격하는 팀 감독**이 정한다 — 양 팀 다 건다.
        //   1.0이면 예전과 똑같이 돈다.
        && rng.gen::<f64>() < T::SAC_BUNT_ATTEMPT_PROB
            * batting_manager(&pre_state).bunt_mult.clamp(0.0, 3.0)
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

    // 🔴 **스퀴즈** (C-②). 3루 주자를 번트로 불러들인다.
    //
    // ⚠ 희생번트와 **다른 상황**이다 — 저쪽은 주자를 진루시켜 다음을 노리고,
    //   이쪽은 지금 1점을 가져온다. 그래서 조건이 더 좁다:
    //   **3루 주자 · 2아웃 전 · 1점 승부(2점 차 이내) · 7회 이후.**
    // ⚠ **실패하면 3루 주자가 죽는다** — 번트 실패보다 대가가 크다.
    //   그래서 성공률도 번트보다 낮게 잡는다(주자가 미리 뛴다).
    // ⚠ 위 번트가 이미 코드를 정했으면 안 건다 — 한 투구에 작전은 하나다.
    if !swings
        && result_code != PitchResultCode::SacBunt
        && result_code != PitchResultCode::GroundOut
        && pre_state.outs < 2
        && pre_state.count.strikes < 2
        && pre_state.runners.third.is_some()
        && pre_state.inning >= T::SQUEEZE_MIN_INNING
        && (pre_state.score.home - pre_state.score.away).abs() <= 2
        && rng.gen::<f64>() < T::SQUEEZE_ATTEMPT_PROB
            * batting_manager(&pre_state).bunt_mult.clamp(0.0, 3.0)
    {
        let bunt = current_batter.bunting.unwrap_or(50.0);
        let ok = T::SQUEEZE_SUCCESS_BASE + (bunt - 50.0) * 0.005;
        result_code = if rng.gen::<f64>() < clamp(ok, 0.30, 0.90) {
            PitchResultCode::SqueezeBunt
        } else {
            // 🔴 **실패하면 3루 주자가 죽는다.** 타자는 살지만 아웃 하나가
            //   더 늘어난 것과 같다 — 병살로 낸다.
            PitchResultCode::DoublePlay
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
            let (fr, adj_code) = resolve_fielding_result(ball, fielding_side(&pre_state), rng);
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

    // 🔴 **폭투·포일** (2단계). 포수를 지나친 공에 주자가 진루한다.
    //
    // 🔴 **책임이 갈린다**(실제 야구 규칙):
    //   폭투(WP)  공이 너무 벗어나 포수가 잡을 수 없었다 → **투수** 기록
    //   포일(PB)  잡을 수 있는 공을 놓쳤다               → **포수** 기록
    //
    // ⚠ **타자가 안 쳤을 때만**이다. 친 공은 인플레이라 다른 흐름이다.
    // ⚠ 주자가 없으면 아무 일도 안 일어난다 — 기록도 안 남긴다.
    // ⚠ 보크와 같이 **여기서** 득점을 만진다 — 진루 로직 안에서는 못 한다.
    let mut wp_count = 0i32;
    // ⚠ 포수 이름을 **여기서** 잡는다 — 아래에선 `pre_state` 가 이미 옮겨졌다
    let mut pb_catcher: Option<String> = None;
    let mut pb_count = 0i32;
    let mut loose_runs = 0i32;
    let mut loose_scored: Vec<String> = vec![];
    tally_wp(0);   // 전체 투구 — 깔때기의 입구
    if !swings
        && (next_runners.first.is_some() || next_runners.second.is_some()
            || next_runners.third.is_some())
    {
        tally_wp(1);   // 주자 있고 안 휘둘렀다 — **판정 자체가 여기서만 돈다**
        // 존은 ±1 이다. 그보다 멀리 가면 포수가 몸으로 막아야 한다
        let dist = lr.landing.x.abs().max(lr.landing.y.abs());
        let catcher_block = pre_state.fielders.iter()
            .find(|f| f.position == crate::types::FieldPosition::C)
            .map(|f| f.fielding)
            .unwrap_or(T::CATCHER_BLOCK_PIVOT);
        // 포수가 좋을수록 덜 흘린다 — 1.0이 기준이다
        let block = (1.0 - (catcher_block - T::CATCHER_BLOCK_PIVOT) / 50.0
            * T::CATCHER_BLOCK_SPAN).clamp(0.15, 1.85);
        let (p, is_wp) = if dist >= T::WILD_PITCH_DISTANCE {
            tally_wp(2);   // 폭투 후보 — 여기가 좁으면 **문턱이 병목**이다
            (T::WILD_PITCH_BASE_PROB * block, true)
        } else {
            (T::PASSED_BALL_BASE_PROB * block, false)
        };
        if rng.gen::<f64>() < p {
            // [2]→[3] 이 좁으면 **확률이 병목**이다
            tally_wp(if is_wp { 3 } else { 4 });
            if is_wp { wp_count += 1; } else {
                pb_count += 1;
                pb_catcher = pre_state.fielders.iter()
                    .find(|f| f.position == crate::types::FieldPosition::C)
                    .map(|f| f.name.clone());
            }
            // ⚠ **뒤에서부터** 민다 — 앞에서 밀면 덮어쓴다
            if let Some(r3) = next_runners.third.take() {
                loose_runs += 1;
                if let Some(id) = r3.player_id.clone() { loose_scored.push(id); }
            }
            next_runners.third  = next_runners.second.take();
            next_runners.second = next_runners.first.take();
            running_logs.push(if is_wp {
                "폭투! 주자가 진루한다".to_string()
            } else {
                "포일! 포수가 공을 빠뜨렸다".to_string()
            });
        }
    }
    if loose_runs > 0 {
        add_runs(loose_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
        scored_ids.extend(loose_scored.iter().cloned());
    }

    // 🔴 **주루 방해** (6단계). 야수가 주자를 막아 한 베이스를 준다.
    //
    // ⚠ **수비 방해와 다른 사건**이다 — 저쪽은 타석이고 이건 주자다.
    // ⚠ 인플레이 타구가 있어야 성립한다. 주자가 뛰는 상황이라야 막힌다.
    // ⚠ 결과 코드를 안 바꾼다 — 타격 결과는 그대로고 주자만 더 간다.
    if ball_in_play.is_some() && rng.gen::<f64>() < T::OBSTRUCTION_PROB {
        // 뒤에서부터 민다 — 앞에서 밀면 덮어쓴다
        if let Some(r3) = next_runners.third.take() {
            if let Some(id) = r3.player_id.clone() { scored_ids.push(id); }
            add_runs(1, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            running_logs.push("주루 방해 — 3루 주자가 홈으로".to_string());
        } else if next_runners.second.is_some() {
            next_runners.third = next_runners.second.take();
            running_logs.push("주루 방해 — 주자가 한 베이스 더".to_string());
        } else if next_runners.first.is_some() {
            next_runners.second = next_runners.first.take();
            running_logs.push("주루 방해 — 주자가 한 베이스 더".to_string());
        }
    }

    // 🔴 **보크 득점을 여기서 반영한다.** 위에서 판정만 하고 점수를
    //   안 올리면 **3루 주자가 사라지기만 한다** — 죽은 갈래다.
    if balk_runs > 0 {
        add_runs(balk_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
        scored_ids.extend(balk_scored_ids.iter().cloned());
    }

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
        // 🔴 **스퀴즈** (C-②). `SacBunt` 와 달리 **3루 주자가 홈에 온다.**
        //   위 주석이 남겨 둔 자리다 — "그건 스퀴즈고 다른 작전이다".
        // ⚠ 타자는 아웃이지만 점수가 난다. 실패하면 애초에 이 코드가 안 온다.
        PitchResultCode::SqueezeBunt => {
            next_outs += 1;
            next_count = MatchCount { balls: 0, strikes: 0 };
            if let Some(r3) = next_runners.third.take() {
                if let Some(pid) = r3.player_id.clone() { scored_ids.push(pid); }
                add_runs(1, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            }
            // 나머지는 희생번트와 같이 한 칸씩
            let mut b1 = next_runners.first.take();
            let mut b2 = next_runners.second.take();
            let mut b3 = next_runners.third.take();
            if b3.is_none() { b3 = b2.take(); }
            if b2.is_none() { b2 = b1.take(); }
            next_runners = MatchRunners { first: b1, second: b2, third: b3 };
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
        // 🔴 **수비 방해** — 볼넷과 같은 진루다. 밀어내기까지 같다.
        //   ⚠ **타수가 아니다** — 아래 타수 집계에서 빠져 있어야 한다.
        PitchResultCode::Interference => {
            next_count = MatchCount { balls: 0, strikes: 0 };
            let new_runner = create_runner(&current_batter);
            let (wr, wr_runs) = advance_on_walk(next_runners, new_runner, &mut scored_ids);
            next_runners = wr;
            add_runs(wr_runs, &mut next_score, &mut next_inning_scores, next_half, next_inning);
            running_logs.push("수비 방해 — 타자가 1루로".to_string());
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

                // 🔴 **낫아웃** (6단계). 삼진인데 포수가 놓쳐 타자가 산다.
                //
                // ⚠ **1루가 비었거나 2아웃일 때만** 성립한다(실제 야구 규칙).
                //   1루에 주자가 있고 2아웃 미만이면 포스아웃이라 뛸 이유가 없다.
                // ⚠ **삼진은 투수 기록에 그대로 남는다** — 타자만 산다.
                //   그래서 `result_code` 를 안 바꾸고 주자·아웃만 손댄다.
                // 🔴 삼진은 모수가 크다(타석의 20% 안팎) — 확률을 높이면
                //   출루가 통째로 부푼다.
                let dropped_ok = next_runners.first.is_none() || pre_state.outs >= 2;
                if dropped_ok {
                    let cb = pre_state.fielders.iter()
                        .find(|f| f.position == crate::types::FieldPosition::C)
                        .map(|f| f.fielding)
                        .unwrap_or(T::CATCHER_BLOCK_PIVOT);
                    let blk = (1.0 - (cb - T::CATCHER_BLOCK_PIVOT) / 50.0
                        * T::DROPPED_THIRD_CATCHER_SPAN).clamp(0.15, 1.85);
                    if rng.gen::<f64>() < T::DROPPED_THIRD_PROB * blk {
                        // 타자가 산다 — 아웃을 되돌리고 1루에 세운다
                        next_outs = next_outs.saturating_sub(1);
                        next_runners.first = Some(create_runner(&current_batter));
                        running_logs.push("낫아웃! 타자가 1루에서 살았다".to_string());
                    }
                }
            }
        }
        PitchResultCode::Foul => {
            if next_count.strikes < 2 { next_count.strikes += 1; }
        }
        PitchResultCode::InplayOut => {
            next_outs += 1;
            next_count = MatchCount { balls: 0, strikes: 0 };
            // ⚠ **몇 명이 죽었는지**를 받는다(0·2·3). 예전엔 `bool` 이라
            //   삼중살을 표현할 수 없었다 — 아웃이 둘만 올라가 이닝이 안 끝난다.
            let (killed, dp_runners) = try_double_play(ball_in_play.as_ref(), &next_runners, pre_state.outs, rng);
            if killed >= 2 {
                // 타자 아웃은 위에서 이미 +1 했다 — 나머지만 더한다
                next_outs += killed - 1;
                next_runners = dp_runners;
            }
            // 여기서야 타구 종류와 병살 여부가 다 정해진다 — 이제 코드를 좁힌다
            result_code = narrow_inplay_out(ball_in_play.as_ref(), killed);

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

            // 🔴 **태그업** (6단계). 뜬공 아웃에 **2루 주자가 3루로** 간다.
            //
            // ⚠ 희생플라이(3루→홈)는 위에 이미 있다. 없던 게 이 갈래다.
            // ⚠ 3루가 비어 있어야 간다 — 위에서 홈으로 들어갔으면 비었다.
            // ⚠ 주루센스가 좋을수록 잘 판단한다.
            if result_code == PitchResultCode::FlyOut
                && pre_state.outs < 2
                && next_runners.third.is_none()
            {
                if let Some(r2) = next_runners.second.clone() {
                    let sense = ((r2.instinct - 50.0) / 50.0).clamp(-1.0, 1.0);
                    let p = T::TAG_UP_SECOND_PROB * (1.0 + sense * 0.5);
                    if rng.gen::<f64>() < p.clamp(0.0, 0.5) {
                        next_runners.third = next_runners.second.take();
                        running_logs.push("태그업 — 2루 주자가 3루로".to_string());
                    }
                }
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

    // 🔴 **히트앱런 주자가 잡혔다.** 위에서 판정만 하고 여기서
    //   반영한다 — 진루 처리가 끝난 뒤여야 주자를 다시 안 넣는다.
    // ⚠ 3아웃 전환 **앞**이다. 뒤에 두면 이닝이 안 넘어간다.
    if hnr_runner_out && next_runners.first.is_some() {
        next_runners.first = None;
        next_outs += 1;
        running_logs.push(format!("히트앤런 실패 — 주자 아웃"));
    }

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
    // 🔴 **좁혀진 코드를 본다** (2026-09-01). 예전엔
    //   `matches!(result_code, StrikeLook | StrikeSwing) && pre_state.count.strikes == 2`
    //   였는데, 이 줄에 닿을 때 `result_code`는 **이미 `StrikeoutLook`/
    //   `StrikeoutSwing`으로 좁혀져 있다**(위 5단계에서 바꾼다).
    //   그래서 **삼진이 한 번도 안 잡혔다**:
    //
    // ```
    //   주인공 시즌 K   0        전 무대 · 9시즌 (실측)
    //   리그 평균 9K   10.7      NPC 는 다른 경로라 정상
    //   타순           삼진당한 타자가 다시 섰다 (ab_ended 가 거짓)
    // ```
    //
    // ⚠ 아웃은 5단계에서 따로 올리므로 **이닝·ERA·승패는 멀쩡했다.**
    //   그래서 "k 만 0"이라는 이상한 모양으로 나타났다.
    let is_k_out = is_strikeout(result_code);
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

    // 코스 칸도 **같은 창(5구)** 으로 민다 (결정 ⑨). 길이가 다르면 「구종은
    // 바꿨는데 코스가 같다」를 두 잣대로 보게 된다
    let mut next_last_zones = pre_state.last_pitch_zones.clone();
    next_last_zones.push(course_cell(target));
    if next_last_zones.len() > 5 { next_last_zones.remove(0); }
    // 완급은 **한 칸**이다 (결정 ⑧) — 낙차는 직전 공과의 차다
    let next_last_speed = Some(
        T::pitch_speed(current_pitcher.velocity, decision.pitch_type, decision.power),
    );

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
    // ⚠ 대타 줄이 맨 앞이다 — 그 타석 결과보다 먼저 일어난 일이다
    let narrative_logs: Vec<String> = pinch_log.into_iter()
        .chain(pinch_run_log.into_iter())
        .chain(steal_logs.into_iter())
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
        last_pitch_zones: next_last_zones,
        last_pitch_speed: next_last_speed,
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
                // 🔴 **보크를 그 투수 줄에 단다.** 판정만 하고 안 세면
                //   화면에서 "왜 주자가 갔지"만 남는다 — 도루자에서 겪은
                //   것과 같은 형태다.
                if balked { line.bk += 1; }
                // ⚠ **폭투는 투수 것**이다 — 포일은 포수 것이라 여기 없다
                if wp_count > 0 { line.wp += wp_count; }

                // 🔴 **구종별** — `pitch_type` 이 매 투구에 있는데 아무도
                //   안 셌다. 투수 상세에 구종 목록은 뜨는데 실제로 뭘
                //   던졌는지는 알 수 없었다.
                // ⚠ 안 던진 구종은 안 실린다(맵) — 10종을 배열로 두면
                //   대부분 0인 칸이 매 경기 로그에 쌓인다.
                {
                    let key = format!("{:?}", decision.pitch_type).to_lowercase();
                    let m = line.pitch_mix.entry(key).or_default();
                    m.pc += 1;
                    match result_code {
                        PitchResultCode::StrikeoutSwing
                        | PitchResultCode::StrikeoutLook => m.k += 1,
                        PitchResultCode::HitSingle | PitchResultCode::HitDouble
                        | PitchResultCode::HitTriple | PitchResultCode::HomeRun
                            => m.h += 1,
                        _ => {}
                    }
                }

                // 🔴 **이닝별** — 합계만으로는 6이닝 3실점이 "고르게"인지
                //   "한 이닝에 몰아서"인지 구분이 안 됐다.
                // ⚠ 이닝은 **투구 시점**(`state`)이다. `next_state` 는 이미
                //   다음 이닝일 수 있다 — 3아웃이면 넘어간 뒤다.
                {
                    let inn = state.inning as i32;
                    let slot = match line.by_inning.iter_mut().find(|x| x.inning == inn) {
                        Some(x) => x,
                        None => {
                            line.by_inning.push(crate::types::InningLine {
                                inning: inn, ..Default::default()
                            });
                            line.by_inning.last_mut().unwrap()
                        }
                    };
                    slot.pc += 1;
                    slot.outs += delta;
                    if scored > 0 { slot.er += scored; }
                }
                match result_code {
                    // 🔴 **`StrikeSwing`/`StrikeLook`을 보고 있었다** (2026-08-29).
                    //   3스트라이크째에 `narrow`가 코드를 `Strikeout*`로 **좁히면서**
                    //   이 자리가 영영 안 걸렸다 — **탈삼진이 전원 0**이었다
                    //   (실측: 규정투수 56명 최다 K 0). 탈삼진왕이 한 번도 안 나왔다.
                    // ⚠ 삼진은 늘 타석을 끝내므로 `cnt_reset` 조건이 필요 없다.
                    PitchResultCode::StrikeoutSwing | PitchResultCode::StrikeoutLook
                        => line.k += 1,
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
        // 🔴 **선수별 수비 기록** (2026-08-29). `DefenseStat`은 팀 단위 하나뿐이라
        //   골든글러브를 뽑을 근거가 없었다.
        //
        // ⚠ 수비수는 **공격 팀의 반대편**이다 — 초면 홈이 수비다. 타자 줄과
        //   정반대라 여기서 헷갈리면 기록이 통째로 뒤집힌다.
        // ⚠ 삼진·볼넷은 `fielding_result`가 없으므로 자연히 빠진다.
        // 🔴 **삼진은 포수의 자살이다** (야구 규칙 · 2026-08-29).
        //   실제 KBO 포수는 시즌 자살 800~900인데 **거의 전부 삼진 포구**다.
        //   그걸 안 세니 포수 수비 기회가 극히 적어 골든글러브 자격을 못
        //   채웠다 — 실측에서 **10 리그시즌 중 1번**만 포수 부문이 나왔다.
        // ⚠ 삼진엔 `fielding_result`가 없으므로 여기서 따로 센다.
        if matches!(result_code, PitchResultCode::StrikeoutSwing | PitchResultCode::StrikeoutLook) {
            let is_top = state.half == HalfInning::Top;
            let catcher = fielding_side(state).iter()
                .find(|f| f.position == FieldPosition::C)
                .map(|f| f.player_id.clone()).unwrap_or_default();
            if !catcher.is_empty() {
                let lines = if is_top { &mut next_state.home_bat_lines }
                            else      { &mut next_state.away_bat_lines };
                if let Some(b) = lines.iter_mut().find(|x| x.player_id == catcher) {
                    b.putouts += 1;
                }
            }
        }

        if let Some(ref fr) = fielding_result {
            let is_top = state.half == HalfInning::Top;
            let recv_id = fr.threw_to.and_then(|to| fielding_side(state).iter()
                .find(|f| f.position == to).map(|f| f.player_id.clone()));
            let lines = if is_top { &mut next_state.home_bat_lines }
                        else      { &mut next_state.away_bat_lines };
            let fid = fr.fielder.player_id.clone();
            let mut bump = |id: &str, kind: u8| {
                if id.is_empty() { return; }
                if let Some(b) = lines.iter_mut().find(|x| x.player_id == id) {
                    match kind { 0 => b.errors += 1, 1 => b.assists += 1, _ => b.putouts += 1 }
                }
            };
            if fr.is_error {
                bump(&fid, 0);
            } else if fr.throw_result.as_deref() == Some("out") {
                // 던진 사람이 보살, 받은 사람이 자살이다
                bump(&fid, 1);
                if let Some(ref r) = recv_id { bump(r, 2); }
            } else if delta > 0 {
                // 송구 없이 잡은 아웃 — 뜬공·직선타는 잡은 사람이 자살이다
                bump(&fid, 2);
            }
        }

        // 🔴 **도루를 기록한다** (2026-08-29). 예전엔 `attempt_steals`가 로그
        //   문자열만 만들고 타자 줄을 안 건드렸다 — **규정타자 전원 도루 0**이었다.
        // ⚠ 주자는 **공격 팀** 소속이다 — 초면 원정, 말이면 홈이다.
        if !stole_ids.is_empty() || !caught_ids.is_empty() {
            let is_top = state.half == HalfInning::Top;
            let lines = if is_top { &mut next_state.away_bat_lines } else { &mut next_state.home_bat_lines };
            for id in &stole_ids {
                if let Some(b) = lines.iter_mut().find(|x| &x.player_id == id) { b.sb += 1; }
            }
            // 🔴 **도루자도 같은 자리에 센다.** 판정은 처음부터 돌았는데
            //   셀 자리가 없어서 화면엔 성공만 보이고 성공률을 못 냈다.
            for id in &caught_ids {
                if let Some(b) = lines.iter_mut().find(|x| &x.player_id == id) { b.cs += 1; }
            }
        }

        // 🔴 **포일은 포수 것이다.** 수비 팀 포수를 찾아 단다 —
        //   공격 팀 타자 줄에 달면 엉뚱한 사람 기록이 된다.
        // ⚠ 포수는 **수비 팀** 소속이다. 도루와 반대편이다.
        if pb_count > 0 {
            if let Some(cname) = pb_catcher.clone() {
                let is_top = state.half == HalfInning::Top;
                // 초면 홈이 수비다
                let dl = if is_top { &mut next_state.home_bat_lines }
                         else { &mut next_state.away_bat_lines };
                if let Some(b) = dl.iter_mut().find(|x| x.player_id == cname) {
                    b.pb += pb_count;
                }
            }
        }

        {
            let is_top = state.half == HalfInning::Top;
            let idx = if is_top { state.away_lineup_index } else { state.home_lineup_index };
            let scored = (next_state.score.home + next_state.score.away)
                - (state.score.home + state.score.away);
            let lines = if is_top { &mut next_state.away_bat_lines } else { &mut next_state.home_bat_lines };
            // 🔴 **자리가 아니라 사람으로 찾는다.** 예전엔 `get_mut(idx)` 로
            //   타순 인덱스를 썼는데, 대타가 들어오면 그 타수가 **바뀌기 전
            //   선수 줄에** 쌓인다. 자리는 물려받되 기록은 따라가야 한다.
            // ⚠ id 가 없는 라인업(스모크·구 세이브)은 예전대로 인덱스로 간다.
            // ⚠ `pre_state` 는 이미 `next_state` 로 옮겨갔다 — 이 타석의
            //   타자를 바로 쓴다(대타 교체가 반영된 값이다).
            let bat_id = current_batter.id.clone();
            let found = match bat_id {
                Some(ref id) if !id.is_empty() =>
                    lines.iter_mut().find(|x| x.player_id == *id),
                _ => lines.get_mut(idx),
            };
            if let Some(b) = found {
                use PitchResultCode::*;
                match result_code {
                    Walk => { b.bb += 1; }
                    // 🔴 **셋 다 타수가 아니다.** 여기서 `ab`를 올리면 타율이
                    //    희생타 때문에 떨어진다 — 야구 규칙과 다르다.
                    HitByPitch => { b.hbp += 1; }
                    SacBunt | SqueezeBunt => { b.sac += 1; }
                    SacFly     => { b.sf  += 1; }
                    HitSingle => { b.ab += 1; b.h += 1; }
                    // 🔴 **장타를 갈라 센다.** 엔진은 처음부터 2루타·3루타를
                    //    따로 만드는데 `h` 하나로 뭉개서, SLG가
                    //    `(h + hr*3)/ab`라는 근사가 됐다(장타를 단타로 셌다).
                    HitDouble => { b.ab += 1; b.h += 1; b.b2 += 1; }
                    HitTriple => { b.ab += 1; b.h += 1; b.b3 += 1; }
                    HomeRun => { b.ab += 1; b.h += 1; b.hr += 1; }
                    // 삼진은 카운트가 리셋됐을 때만 (타석 종료)
                    // 🔴 투수 쪽과 **같은 결함**이었다 — 좁혀진 코드를 안 봤다
                    StrikeoutSwing | StrikeoutLook => {
                        b.ab += 1; b.k += 1;
                    }
                    InplayOut | GroundOut | FlyOut | LineOut | DoublePlay | TriplePlay | FieldingError => { b.ab += 1; }
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
    // 헛스윙률의 재료 (결정 ⑧⑨ 계측) — 공 하나가 단위다
    let mut pitches = 0i32; let mut whiffs = 0i32;
    let mut safety = 300i32;

    let mut ab_pitch_count = 0u32;
    let batting_team_is_away = start_half == HalfInning::Top;
    let mut ab_start_score = if batting_team_is_away { s.score.away } else { s.score.home };

    while !s.is_finished && safety > 0 {
        safety -= 1;
        if s.half != start_half || s.inning != start_inning { break; }

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
        pitches += 1;
        // 헛스윙은 **삼진째도 센다** — `StrikeoutSwing` 이 3스트라이크째의
        // `StrikeSwing` 이라 안 세면 헛스윙률이 삼진만큼 깎인다
        if matches!(code, PitchResultCode::StrikeSwing | PitchResultCode::StrikeoutSwing) { whiffs += 1; }

        if matches!(code, PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun) { hits += 1; }
        if code == PitchResultCode::Walk { walks += 1; }
        // 🔴 여기도 좁혀진 코드를 본다 — `is_k_out`이 옛 코드를 보던 자리가
        //   **둘**이었다(2026-09-01). `prev_strikes`는 이제 안 쓴다.
        let is_k_out = is_strikeout(code);
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

    HalfInningSimResult { next_state: s, runs, hits, walks, strikeouts, logs, at_bats, pitches, whiffs }
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
    // 헛스윙률 (결정 ⑧⑨ 계측). **양쪽 반을 다 센다** — 주인공이 던지는 반은
    // `random_decision_for_sim`(플레이어 자리), 상대 반은 `auto_pick_decision`
    // (AI 자리)이라 한쪽만 세면 코스 회피의 효과가 절반만 보인다
    let mut pitches = 0i32; let mut whiffs = 0i32;
    // 타석 — hits/walks 와 **같은 반**만 센다(아래 auto_simulate_half_inning 은 안 센다)
    let mut plate_appearances = 0i32;
    let mut safety = 800i32;

    while !state.is_finished && safety > 0 {
        safety -= 1;
        let decision = if is_protagonist_pitching(&state) {
            random_decision_for_sim(get_active_pitcher(&state), state.count.balls, state.count.strikes, rng)
        } else { auto_pick_decision(&state, rng) };
        let step = step_pitch_core(&state, &decision, is_protagonist_pitching(&state), rng);
        let code = step.outcome.result_code;
        // 🔴 좁혀진 코드를 본다 — 옛 코드를 보던 자리가 **셋**이었다 (2026-09-01)
        if is_strikeout(code) { strikeouts += 1; }
        if matches!(code, PitchResultCode::HitSingle | PitchResultCode::HitDouble | PitchResultCode::HitTriple | PitchResultCode::HomeRun) { hits += 1; }
        if code == PitchResultCode::Walk { walks += 1; }
        if is_ab_terminal(code) { plate_appearances += 1; }
        pitches += 1;
        if matches!(code, PitchResultCode::StrikeSwing | PitchResultCode::StrikeoutSwing) { whiffs += 1; }
        state = step.next_state;

        if !state.is_finished && !is_protagonist_pitching(&state) {
            let sim = auto_simulate_half_inning(&state, rng);
            at_bat_logs.extend(sim.at_bats);
            pitches += sim.pitches;
            whiffs  += sim.whiffs;
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

    GameSummary { home_score, away_score, strikeouts, hits, walks, at_bat_logs, summary, pitches, whiffs, plate_appearances }
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
                bk: l.bk,
                wp: l.wp,
                pitch_mix: l.pitch_mix.clone(),
                by_inning: l.by_inning.clone(),
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
                bb: b.bb, k: b.k, sb: b.sb, cs: b.cs, pb: b.pb,
                risp_ab: b.risp_ab, risp_h: b.risp_h,
                e: b.errors, a: b.assists, po: b.putouts,
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
    // 🔴 **동점이면 무승부다** (2026-08-29). 예전엔 `home >= away`라
    //   **동점이 조용히 홈 승**이 됐다. 연장 상한이 없던 시절엔 닿기
    //   어려운 자리였지만, 12회 제한을 넣으면 정상 경로가 된다.
    let (winner, loser) = if home == away { ("", None) }
                          else if home > away { (home_team_id, Some(away_team_id)) }
                          else                { (away_team_id, Some(home_team_id)) };
    crate::sim_types::MatchResult {
        home_score: home,
        away_score: away,
        winner_id: winner.to_string(),
        loser_id:  loser.map(|s| s.to_string()),
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
    let mut conds = std::collections::BTreeMap::new();

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

#[cfg(test)]
mod 감독_투수운용 {
    use super::*;

    /// 🔴 **감독이 투수 교체를 바꾸는가.** 안 바뀌면 배선이 헛돈 것이다.
    fn outs_for(bullpen_read: f64) -> Vec<i32> {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        let ps: Vec<PartialPitcherStats> = (0..5).map(|i| PartialPitcherStats {
            stamina_cap: Some(if i == 0 { 80.0 } else { 40.0 }),
            ..Default::default()
        }).collect();
        queue_max_outs(&ps, &mut rng, bullpen_read, 1.0)
    }

    #[test]
    fn 불펜을_잘_읽으면_선발을_일찍_내린다() {
        let quick = outs_for(90.0);
        let slow  = outs_for(10.0);
        assert!(quick[0] < slow[0],
            "선발 아웃: 빠른 감독 {} vs 느린 감독 {}", quick[0], slow[0]);
    }

    #[test]
    fn 오십이면_예전값이다() {
        // 기준값에서 안 흔들려야 기존 밸런스가 그대로다
        use rand::SeedableRng;
        let mut r1 = rand::rngs::StdRng::seed_from_u64(7);
        let ps: Vec<PartialPitcherStats> = (0..3).map(|_| PartialPitcherStats {
            stamina_cap: Some(60.0), ..Default::default()
        }).collect();
        let with_mgr = queue_max_outs(&ps, &mut r1, 50.0, 1.0);
        let _ = &with_mgr;
        // 1.1 A② — 리그 계수 0.80 이면 선발 예산이 줄고(고교 §6-1-2 ③) 불펜은 그대로다
        let mut r2 = rand::rngs::StdRng::seed_from_u64(7);
        let mut r3 = rand::rngs::StdRng::seed_from_u64(7);
        let full = queue_max_outs(&ps, &mut r2, 50.0, 1.0);
        let cut  = queue_max_outs(&ps, &mut r3, 50.0, 0.80);
        assert!(cut[0] < full[0], "선발 예산 {} → {}", full[0], cut[0]);
        assert_eq!(cut[1..], full[1..]);
        let mut r2 = rand::rngs::StdRng::seed_from_u64(7);
        let old: Vec<i32> = ps.iter().enumerate().map(|(i, p)| {
            let stam = p.stamina_cap.unwrap_or(50.0);
            if i == 0 { (12.0 + (stam / 99.0) * 15.0 + (r2.gen::<f64>() - 0.5) * 6.0).round() as i32 }
            else      { 3 + (r2.gen::<f64>() * 4.0) as i32 }
        }).collect();
        assert_eq!(with_mgr, old, "50이면 예전과 같아야 한다");
    }

    #[test]
    fn 하한이_있다() {
        // 극단값에서 0아웃짜리 투수가 나오면 큐가 즉시 소진된다
        for br in [0.0, 100.0] {
            for v in outs_for(br) { assert!(v >= 1, "아웃 {} (bullpenRead {})", v, br); }
        }
    }
}


#[cfg(test)]
mod 삼중살 {
    use super::*;
    use rand::SeedableRng;

    fn runners(n: usize) -> MatchRunners {
        let r = || Some(RunnerStats {
            player_id: Some("R".into()), speed: 50.0, instinct: 50.0,
        });
        MatchRunners {
            first: r(),
            second: if n >= 2 { r() } else { None },
            third:  if n >= 3 { r() } else { None },
        }
    }
    fn ground() -> BallInPlay {
        BallInPlay { hit_type: BallHitType::GroundBall, zone: FieldPosition::SS, hardness: 3,
                     distance: 0.0, launch_angle: -5.0 }
    }

    /// 🔴 **삼중살은 무사에만 난다.** 1사면 아웃 셋을 잡는 순간 이닝이
    ///   이미 끝나 있어 성립하지 않는다.
    #[test]
    fn 일사에는_안_난다() {
        let b = ground();
        for seed in 0..400u64 {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let (killed, _) = try_double_play(Some(&b), &runners(2), 1, &mut rng);
            assert!(killed <= 2, "1사에 삼중살이 났다 (seed {})", seed);
        }
    }

    /// ⚠ 주자가 하나뿐이면 죽일 사람이 모자란다
    #[test]
    fn 주자_하나면_안_난다() {
        let b = ground();
        for seed in 0..400u64 {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let (killed, _) = try_double_play(Some(&b), &runners(1), 0, &mut rng);
            assert!(killed <= 2, "주자 하나에 삼중살이 났다 (seed {})", seed);
        }
    }

    /// 무사 주자 둘이면 드물게 난다 — **0건이면 죽은 갈래다**
    #[test]
    fn 무사_주자둘이면_드물게_난다() {
        let b = ground();
        let mut tp = 0;
        for seed in 0..4000u64 {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let (killed, r) = try_double_play(Some(&b), &runners(2), 0, &mut rng);
            if killed >= 3 {
                tp += 1;
                assert!(r.first.is_none() && r.second.is_none() && r.third.is_none(),
                    "삼중살인데 주자가 남았다");
            }
        }
        assert!(tp > 0, "4000판에 삼중살이 한 번도 안 났다 — 죽은 갈래다");
        // 드물어야 한다 — 병살 22% × 2%
        assert!(tp < 200, "삼중살이 {}건으로 너무 잦다", tp);
    }

    /// ⚠ 뜬공으로는 병살도 삼중살도 안 된다
    #[test]
    fn 뜬공은_아니다() {
        let b = BallInPlay { hit_type: BallHitType::FlyBall, zone: FieldPosition::CF, hardness: 3,
                             distance: 80.0, launch_angle: 35.0 };
        for seed in 0..200u64 {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let (killed, _) = try_double_play(Some(&b), &runners(3), 0, &mut rng);
            assert_eq!(killed, 0, "뜬공에 살이 붙었다 (seed {})", seed);
        }
    }
}

#[cfg(test)]
mod 보크 {
    use super::*;

    /// ⚠ 보크는 **투구 전** 사건이라 `step_pitch_core` 안에서 난다.
    ///   함수로 떼어내지 않았으므로 상수와 배선을 본다.
    #[test]
    fn 드문_사건이다() {
        // 실제 KBO 는 팀당 시즌 3~8개다. 타석당 확률이 0.6%를 넘으면
        // 한 시즌에 수십 개가 나온다.
        assert!(T::BALK_MAX_PROB <= 0.01, "보크 상한이 너무 높다");
        assert!(T::BALK_BASE_PROB > 0.0, "0이면 죽은 갈래다");
    }

    /// 🔴 제구가 나쁠수록 자주 낸다 — 그게 이 사건의 축이다
    #[test]
    fn 제구가_나쁠수록_잦다() {
        let p = |control: f64| {
            let ctl = ((50.0 - control) / 50.0).max(0.0);
            (T::BALK_BASE_PROB + ctl * T::BALK_CONTROL_SPAN).clamp(0.0, T::BALK_MAX_PROB)
        };
        assert!(p(20.0) > p(50.0), "제구 20이 50보다 잦아야 한다");
        assert!((p(50.0) - p(80.0)).abs() < 1e-9, "50 위는 더 안 좋아진다");
    }
}

#[cfg(test)]
mod 삼진_코드 {
    use super::*;

    /// 🔴 **좁혀진 코드를 읽는 자리가 셋이었고 전부 옛 코드를 봤다** (2026-09-01).
    ///
    /// `run_pitch`가 3스트라이크째에 `StrikeLook` → `StrikeoutLook`으로 코드를
    /// **좁힌다**. 그런데 그걸 읽는 `is_k_out` 셋이 좁히기 **전** 코드를
    /// 매치하고 있어서:
    ///
    /// ```
    ///   주인공 시즌 K   0        전 무대 · 9시즌 (트랙 B 실측)
    ///   타순           삼진당한 타자가 다시 섰다 (ab_ended 가 거짓)
    /// ```
    ///
    /// 아웃은 따로 올라가 **이닝·ERA·승패는 멀쩡했다.** 그래서 "k 만 0"이라는
    /// 이상한 모양으로 나타났고, 리그 전체(NPC 경로)는 9K 10.7 로 정상이라
    /// 대조군이 있어야만 보였다.
    #[test]
    fn 삼진은_타석을_끝낸다() {
        for code in [PitchResultCode::StrikeoutLook, PitchResultCode::StrikeoutSwing] {
            assert!(is_strikeout(code), "{code:?} 가 삼진으로 안 읽힌다");
            assert!(is_ab_terminal(code),
                "{code:?} 로 타석이 안 끝난다 — 삼진당한 타자가 다시 선다");
        }
    }

    /// ⚠ **투구 하나와 타석 종료를 가른다.** `StrikeLook`은 카운트만 올린다
    #[test]
    fn 스트라이크_하나는_타석을_안_끝낸다() {
        for code in [PitchResultCode::StrikeLook, PitchResultCode::StrikeSwing] {
            assert!(!is_strikeout(code), "{code:?} 는 투구 하나지 삼진이 아니다");
            assert!(!is_ab_terminal(code), "{code:?} 로 타석이 끝나면 안 된다");
        }
    }

    /// 🔴 **`matches!`를 새로 쓰지 마라** — `is_out_in_play` 주석이 그렇게
    /// 경고해 뒀는데 이번 결함이 정확히 그 형태였다. 읽는 자리를 함수 하나로
    /// 모아 두면 코드가 늘어도 한 곳만 고치면 된다.
    #[test]
    fn 삼진_판정을_직접_나열한_자리가_없다() {
        let src = include_str!("match_engine.rs");
        // ⚠ **자기 문자열을 세지 않으려고** 이 검사 본문을 잘라낸다.
        //   `include_str!`은 이 파일 전체를 읽으므로 아래 패턴이 그대로 걸린다.
        let cut = src.find("fn 삼진_판정을_직접_나열한_자리가_없다").unwrap_or(src.len());
        let body = &src[..cut];
        // 좁히는 자리(5단계)에서 코드를 만들 때는 나열이 맞다 — 그건 대입이라
        // `=>` 나 `=` 가 붙는다. 판정(`matches!`)만 센다
        let bad = body.matches("matches!(code, PitchResultCode::StrikeLook").count()
            + body.matches("matches!(result_code, PitchResultCode::StrikeLook").count();
        assert_eq!(bad, 0,
            "삼진을 `matches!`로 직접 판정하는 자리가 {bad}곳 있다 — `is_strikeout`을 써라");
    }
}

#[cfg(test)]
mod 폭투_포일 {
    use super::*;

    /// 🔴 **책임이 갈린다** — 존 밖으로 멀리 가면 투수(WP), 존 근처면 포수(PB).
    ///   같은 확률을 쓰면 "포수가 못 막을 공"과 "놓친 공"이 구분되지 않는다.
    #[test]
    fn 멀리_간_공이_훨씬_잦다() {
        assert!(T::WILD_PITCH_BASE_PROB > T::PASSED_BALL_BASE_PROB * 10.0,
            "폭투가 포일보다 훨씬 잦아야 한다 (WP {} vs PB {})",
            T::WILD_PITCH_BASE_PROB, T::PASSED_BALL_BASE_PROB);
    }

    /// ⚠ 포수가 좋을수록 덜 흘린다
    #[test]
    fn 포수가_좋으면_덜_흘린다() {
        let block = |fielding: f64| {
            (1.0 - (fielding - T::CATCHER_BLOCK_PIVOT) / 50.0 * T::CATCHER_BLOCK_SPAN)
                .clamp(0.15, 1.85)
        };
        assert!(block(90.0) < block(50.0), "좋은 포수가 덜 흘려야 한다");
        assert!(block(20.0) > block(50.0), "나쁜 포수가 더 흘려야 한다");
        assert!((block(50.0) - 1.0).abs() < 1e-9, "50이 기준값이다");
    }

    /// ⚠ 존 경계가 폭투와 포일을 가른다 — 존은 ±1 이다
    #[test]
    fn 존_밖_거리로_가른다() {
        assert!(T::WILD_PITCH_DISTANCE > 1.0, "존(±1) 밖이어야 폭투다");
        assert!(T::WILD_PITCH_DISTANCE < 2.5, "너무 멀면 폭투가 안 난다");
    }

    /// 드문 사건이다 — 실제 KBO 는 팀당 시즌 WP 30~50 · PB 5~15
    #[test]
    fn 드물다() {
        assert!(T::WILD_PITCH_BASE_PROB < 0.30, "폭투가 너무 잦다");
        assert!(T::PASSED_BALL_BASE_PROB < 0.02, "포일이 너무 잦다");
    }
}

#[cfg(test)]
mod 타구물리 {
    use super::*;

    /// 🔴 **최적각에서 멀어질수록 짧아진다.** 팝업이 안 넘어가는 이유다.
    #[test]
    fn 각도가_거리를_가른다() {
        let best = flight_distance(5, T::FLIGHT_BEST_ANGLE, 50.0);
        let popup = flight_distance(5, 65.0, 50.0);
        let grounder = flight_distance(5, -8.0, 50.0);
        assert!(best > popup, "최적각이 팝업보다 멀어야 한다");
        assert!(best > grounder, "최적각이 땅볼보다 멀어야 한다");
    }

    /// 세게 맞을수록 멀리 간다
    #[test]
    fn 세기가_거리를_가른다() {
        let a = flight_distance(1, T::FLIGHT_BEST_ANGLE, 50.0);
        let e = flight_distance(5, T::FLIGHT_BEST_ANGLE, 50.0);
        assert!(e > a + 40.0, "hardness 1 {} vs 5 {}", a, e);
    }

    /// 파워가 좋으면 더 간다
    #[test]
    fn 파워가_거리를_가른다() {
        let weak = flight_distance(4, T::FLIGHT_BEST_ANGLE, 20.0);
        let strong = flight_distance(4, T::FLIGHT_BEST_ANGLE, 90.0);
        assert!(strong > weak, "파워 90 이 20 보다 멀어야 한다");
    }

    /// 🔴 **실제 KBO 홈런 비거리 대역(105~135m)에 든다.**
    ///   너무 짧으면 아무도 못 넘고, 너무 길면 전부 넘는다.
    #[test]
    fn 홈런_대역이_현실적이다() {
        let top = flight_distance(5, T::FLIGHT_BEST_ANGLE, 90.0);
        assert!(top >= 120.0 && top <= 150.0, "최대 비거리 {}m", top);
        // ⚠ **평범한 타자(파워 50)의 hardness 4 는 담장을 못 넘어야 한다.**
        //   넘으면 장타가 전부 홈런이 된다(첫 값에서 OPS .904 → .989 로 올랐다).
        //   중립 구장 중앙이 122m 이다.
        let mid = flight_distance(4, T::FLIGHT_BEST_ANGLE, 50.0);
        assert!(mid >= 90.0 && mid < 118.0, "보통 장타 {}m", mid);
    }

    /// ⚠ 좌우 비대칭 구장에서 방향이 담장을 가른다
    #[test]
    fn 방향이_담장을_고른다() {
        let d = crate::types::ParkDims { lf: 95.0, cf: 125.0, rf: 100.0, fence: 3.0 };
        assert_eq!(fence_for(FieldPosition::LF, &d), 95.0);
        assert_eq!(fence_for(FieldPosition::RF, &d), 100.0);
        assert_eq!(fence_for(FieldPosition::CF, &d), 125.0);
        // 내야는 중앙으로 둔다 — 어차피 담장을 못 넘는다
        assert_eq!(fence_for(FieldPosition::SS, &d), 125.0);
    }

    /// 🔴 **땅볼은 발사각이 음수다** — 담장을 넘을 수 없다
    #[test]
    fn 땅볼은_안_뜬다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(1);
        for _ in 0..200 {
            let a = launch_angle_of(BallHitType::GroundBall, &mut rng);
            assert!(a < 10.0, "땅볼 발사각 {}", a);
        }
    }

    /// 뜬공이 라인드라이브보다 높이 뜬다
    #[test]
    fn 타구_종류가_각도를_가른다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let mut fly = 0.0; let mut line = 0.0;
        for _ in 0..500 {
            fly += launch_angle_of(BallHitType::FlyBall, &mut rng);
            line += launch_angle_of(BallHitType::LineDrive, &mut rng);
        }
        assert!(fly > line, "뜬공 {} vs 라인 {}", fly / 500.0, line / 500.0);
    }
}

#[cfg(test)]
mod 펜스 {
    use super::*;

    /// 🔴 **담장 대비 비율로 가른다.** 절대 거리로 하면 구장마다 같은
    ///   5m 가 다른 뜻이 된다 — 잠실(125)과 사직(118)에서 다르다.
    #[test]
    fn 비율_경계가_순서대로다() {
        assert!(T::FENCE_HIT_RATIO > T::DEEP_FLY_RATIO,
            "펜스 직격이 깊은 뜬공보다 담장에 가까워야 한다");
        assert!(T::FENCE_HIT_RATIO < 1.0, "1.0 이면 그냥 홈런이다");
        assert!(T::DEEP_FLY_RATIO > 0.5, "너무 낮으면 얕은 뜬공도 2루타가 된다");
    }

    /// 🔴 **올리는 쪽에도 문턱이 있어야 한다** (2026-09-01).
    ///
    /// 예전엔 `distance >= fence` 하나였다 — **1cm 넘어도 홈런**이다.
    /// 내리는 쪽은 0.94 / 0.82 로 3단계인데 올리는 쪽만 문턱이 없어
    /// 비대칭이었고, 실측에서 **승격 6,182 > 강등 4,631** 이 나왔다.
    /// 담장 재확인이 홈런을 **만들고** 있었다.
    #[test]
    fn 승격에도_문턱이_있다() {
        assert!(T::FENCE_PROMOTE_RATIO > 1.0,
            "1.0 이면 문턱이 없는 것과 같다 — 1cm 넘어도 홈런이 된다");
        // ⚠ 너무 높으면 담장이 홈런을 **줄이는** 쪽으로 뒤집힌다.
        //   실측: 1.05 면 순증이 +1,551 → −1,462 로 부호가 바뀐다.
        assert!(T::FENCE_PROMOTE_RATIO < 1.05,
            "1.05 이상이면 담장이 홈런을 줄이는 쪽으로 뒤집힌다");
    }

    /// ⚠ **강등 문턱과 짝이다.** 0.94 ~ 1.02 가 "담장 근처" 대역이 된다 —
    ///   예전엔 1.00 에서 칼같이 갈려 양쪽이 비대칭이었다.
    #[test]
    fn 담장_근처_대역이_대칭이다() {
        let below = 1.0 - T::FENCE_HIT_RATIO;       // 0.06
        let above = T::FENCE_PROMOTE_RATIO - 1.0;   // 0.02
        assert!(above > 0.0 && below > 0.0);
        // 완전 대칭일 필요는 없지만 **한쪽만 0** 이면 안 된다.
        // 위쪽이 아래쪽보다 넓으면 승격이 오히려 더 막혀 홈런이 마른다
        assert!(above <= below,
            "위쪽 대역 {above} 이 아래쪽 {below} 보다 넓다 — 홈런이 마른다");
    }

    /// 🔴 **상수만 보면 반쪽이다.** 갈래에서 조건을 빼도 상수는 그대로라
    ///   위 두 검사가 통과한다 — 실제로 변이 검증에서 그랬다.
    ///   **코드가 그 상수를 보는지**를 못박는다.
    #[test]
    fn 승격_갈래가_문턱을_실제로_본다() {
        let src = include_str!("match_engine.rs");
        // 승격 갈래 둘 다 조건이 걸려 있어야 한다
        let guard = "if b.distance / fence.max(1.0) >= T::FENCE_PROMOTE_RATIO => {";
        let n = src.matches(guard).count();
        assert!(n >= 2, "승격 갈래에 문턱 조건이 {n} 곳뿐이다 — 2루타·3루타 둘 다여야 한다");
        // ⚠ **이 검사 자신도 그 문자열을 담는다**(include_str! 함정).
        //   그래서 2 가 아니라 **2 이상**을 본다 — 아래에서 자기 몫을 뺀다.
        let mine = 1;  // 바로 위 `let guard` 줄
        assert!(n - mine >= 2,
            "검사 자신을 빼면 {} 곳이다 — 갈래에서 조건이 빠졌다", n - mine);
    }

    /// ⚠ 같은 비율이 구장마다 다른 거리다 — 그게 요점이다
    #[test]
    fn 구장마다_경계_거리가_다르다() {
        let jamsil = 125.0 * T::FENCE_HIT_RATIO;
        let sajik  = 118.0 * T::FENCE_HIT_RATIO;
        assert!(jamsil > sajik + 5.0,
            "잠실 {:.1}m vs 사직 {:.1}m", jamsil, sajik);
    }

    /// 그라운드 홈런은 드물다 — 실제 KBO 시즌 2~5건
    #[test]
    fn 그라운드홈런이_드물다() {
        assert!(T::INSIDE_PARK_PROB <= 0.10, "너무 잦다");
        assert!(T::INSIDE_PARK_PROB > 0.0, "0이면 죽은 갈래다");
        // 빠른 주자만 — 리그 상위권 주력이다
        assert!(T::INSIDE_PARK_SPEED_MIN >= 70.0, "누구나 되면 안 된다");
    }

    /// ⚠ 펜스 직격에서 3루타가 나오되 드물어야 한다
    #[test]
    fn 펜스_삼루타가_드물다() {
        assert!(T::FENCE_TRIPLE_PROB > 0.0, "0이면 죽은 갈래다");
        assert!(T::FENCE_TRIPLE_PROB < 0.5, "절반 넘으면 2루타보다 잦다");
    }
}

#[cfg(test)]
mod 시프트 {
    use super::*;
    use rand::SeedableRng;

    fn zone_counts(power: f64, seed: u64) -> (usize, usize) {
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        let (mut left, mut right) = (0, 0);
        for _ in 0..3000 {
            // 가운데 코스(5)로만 친다 — 성향만 보려는 것이다
            let z = resolve_zone(BallHitType::GroundBall, 5, power, &mut rng);
            match z {
                FieldPosition::B3 | FieldPosition::SS => left += 1,
                FieldPosition::B1 | FieldPosition::B2 => right += 1,
                _ => {}
            }
        }
        (left, right)
    }

    /// 🔴 **파워 타자가 당겨친다.** 예전엔 투구 코스만 봐서 홈런왕도
    ///   교타자도 같은 분포로 쳤다.
    #[test]
    fn 파워가_방향을_기울인다() {
        let (weak_l, _) = zone_counts(20.0, 1);
        let (strong_l, _) = zone_counts(95.0, 1);
        assert!(strong_l > weak_l,
            "파워 95 가 20 보다 당겨쳐야 한다 ({} vs {})", strong_l, weak_l);
    }

    /// ⚠ 평범한 타자(50)는 안 기운다 — 기준값이다
    #[test]
    fn 기준값은_안_기운다() {
        let (l, r) = zone_counts(50.0, 7);
        let diff = (l as f64 - r as f64).abs() / (l + r) as f64;
        assert!(diff < 0.15, "기준 타자가 기울었다 (좌 {} 우 {})", l, r);
    }

    /// 🔴 **시프트는 양방향이다** — 한쪽만 하면 리그 타율이 통째로 움직인다
    #[test]
    fn 양방향이다() {
        assert!(T::SHIFT_OUT_BONUS > 0.0, "시프트 쪽 아웃 가산이 없다");
        assert!(T::SHIFT_HOLE_PENALTY > 0.0, "빈 자리 안타 가산이 없다");
        // 빈 자리 쪽이 살짝 커야 시프트가 공짜가 아니다
        // 🔴 **모수가 다르다** — 인플레이 아웃이 단타보다 약 2.4배다.
        // 확률을 같게 주면 안타가 순증한다(실측: .322 → .327).
        // 그래서 안타 → 아웃 쪽을 훨씬 크게 준다.
        assert!(T::SHIFT_OUT_BONUS > T::SHIFT_HOLE_PENALTY * 2.0,
            "모수 차를 안 넘으면 시프트가 타율을 올린다");
    }

    /// ⚠ 아무에게나 걸지 않는다
    #[test]
    fn 파워_문턱이_있다() {
        assert!(T::SHIFT_POWER_MIN > 55.0, "문턱이 낮으면 전원 시프트다");
        assert!(T::SHIFT_POWER_MIN < 80.0, "너무 높으면 아무도 안 걸린다");
    }
}

#[cfg(test)]
mod 낫아웃_태그업 {
    use super::*;

    /// 🔴 **삼진은 모수가 크다**(타석의 20% 안팎). 확률을 높이면 출루가
    ///   통째로 부푼다 — 시프트에서 겪은 것과 같은 형태다.
    #[test]
    fn 낫아웃이_드물다() {
        assert!(T::DROPPED_THIRD_PROB > 0.0, "0이면 죽은 갈래다");
        // 실제 KBO 는 팀당 시즌 5~15건이다. 삼진 1000개 기준 1.5% 면 15건.
        assert!(T::DROPPED_THIRD_PROB <= 0.02,
            "삼진 모수가 커서 {} 면 출루가 부푼다", T::DROPPED_THIRD_PROB);
    }

    /// 포수가 좋으면 덜 놓친다 — 폭투·포일과 같은 축이다
    #[test]
    fn 포수가_좋으면_덜_놓친다() {
        let blk = |fielding: f64| {
            (1.0 - (fielding - T::CATCHER_BLOCK_PIVOT) / 50.0
                * T::DROPPED_THIRD_CATCHER_SPAN).clamp(0.15, 1.85)
        };
        assert!(blk(90.0) < blk(50.0), "좋은 포수가 덜 놓쳐야 한다");
        assert!(blk(20.0) > blk(50.0), "나쁜 포수가 더 놓쳐야 한다");
    }

    /// ⚠ 태그업은 희생플라이보다 잦다 — 홈보다 3루가 가깝다
    #[test]
    fn 태그업이_희생플라이보다_잦다() {
        assert!(T::TAG_UP_SECOND_PROB > T::SAC_FLY_PROB,
            "2루→3루({})가 3루→홈({})보다 쉬워야 한다",
            T::TAG_UP_SECOND_PROB, T::SAC_FLY_PROB);
    }

    /// 태그업이 너무 잦으면 뜬공이 진루타가 된다
    #[test]
    fn 태그업이_너무_잦지_않다() {
        // ⚠ 상한은 있되 **조건이 드물어서 확률 자체는 높다.** 희생플라이가
        //   0.55 인 것과 같은 이유다 — 그쪽 주석에 "0.10이면 타석의 0.11%로
        //   목표의 6분의 1"이라 적혀 있다. 뜬공 아웃 + 2아웃 전 + 2루 주자 +
        //   3루 빔이 다 겹쳐야 이 갈래에 온다.
        assert!(T::TAG_UP_SECOND_PROB < 0.85, "뜬공마다 진루하면 안 된다");
    }
}

#[cfg(test)]
mod 방해 {
    use super::*;

    /// ⚠ **둘은 다른 사건이다.** 수비 방해는 타석이고 주루 방해는 주자다.
    #[test]
    fn 둘이_다른_확률이다() {
        assert!(T::INTERFERENCE_PROB > 0.0, "수비 방해가 0이면 죽은 갈래다");
        assert!(T::OBSTRUCTION_PROB > 0.0, "주루 방해가 0이면 죽은 갈래다");
        // 주루 방해는 인플레이 타구에만 걸려 모수가 작다 — 확률이 더 높다
        assert!(T::OBSTRUCTION_PROB > T::INTERFERENCE_PROB,
            "모수가 작은 쪽이 확률이 높아야 비슷한 건수가 된다");
    }

    /// 🔴 **타석 모수가 크다.** 실제 KBO 는 팀당 시즌 1~3건이라
    ///   확률이 아주 낮아야 한다 — 낫아웃·시프트에서 겪은 형태다.
    #[test]
    fn 아주_드물다() {
        assert!(T::INTERFERENCE_PROB < 0.002,
            "타석마다 {} 면 시즌 수십 건이 된다", T::INTERFERENCE_PROB);
        assert!(T::OBSTRUCTION_PROB < 0.01,
            "인플레이마다 {} 면 너무 잦다", T::OBSTRUCTION_PROB);
    }

    /// ⚠ 수비 방해는 **타수가 아니다** — 타율 분모에 안 들어간다
    #[test]
    fn 수비방해는_타수가_아니다() {
        let src = include_str!("match_engine.rs");
        // 타수를 올리는 목록에 `Interference` 가 없어야 한다
        let ab_line = src.lines()
            .find(|l| l.contains("HitSingle => { b.ab += 1;"))
            .unwrap_or("");
        assert!(!ab_line.contains("Interference"), "타수 목록에 들어갔다");
    }

    // ── 대타 (7단계) ────────────────────────────────────────

    /// 🔴 **타석 도중에 타자가 바뀌면 안 된다.**
    ///
    /// 첫 판이 투구마다 돌아서 볼카운트 1-2에 대타가 들어갔다.
    /// 이 검사가 없으면 그 형태가 조용히 돌아온다 — 로그만 보면
    /// "대타"가 잘 나오는 것처럼 보인다.
    #[test]
    fn 대타는_타석_시작에만_바뀐다() {
        let src = include_str!("match_engine.rs");
        let i = src.find("let mut pinch_state").expect("대타 판정이 없다");
        let j = src[i..].find("let pre_state = pinch_state;").expect("끝을 못 찾겠다");
        let block = &src[i..i + j];
        assert!(block.contains("count.balls == 0") && block.contains("count.strikes == 0"),
            "타석 시작을 가리는 식이 없다");
        // 🔴 **식만 있고 안 쓰면 소용없다.** 변이 검증에서
        //   조건에서만 빼니 이 검사가 그대로 통과했다.
        assert!(block.contains("if pa_start &&"),
            "타석 시작 가드를 조건에 안 썼다 — 투구마다 타자가 갈린다");
    }

    /// 🔴 **기록은 사람을 따라간다.**
    ///
    /// 타순 자리는 물려받지만 타수까지 물려받으면 안 된다. 예전 집계는
    /// `lines.get_mut(idx)` 로 **타순 인덱스**를 썼고, 대타의 안타가
    /// 바뀌기 전 선수 기록에 쌓였다.
    #[test]
    fn 대타_기록은_자리가_아니라_사람에_붙는다() {
        let src = include_str!("match_engine.rs");
        // 타격 결과 집계가 id 로 찾아야 한다
        // ⚠ 한글 주석이 바이트로 길어서 고정 길이로 자르면 몷 미친다 —
        //   집계 블록의 시작을 집어서 사이를 본다.
        let i = src.find("let bat_id = current_batter.id.clone();")
            .expect("타격 집계가 타자를 안 집는다");
        let j = src[i..].find("HitSingle => { b.ab += 1;").expect("타격 집계가 없다");
        assert!(src[i..i + j].contains("x.player_id == *id"),
            "타격 집계가 아직 타순 인덱스로 찾는다");
        // 교체할 때 대타 줄을 만들어야 한다 — 없으면 찾아도 못 찾는다
        let j = src.find("let mut pinch_state").expect("대타 판정이 없다");
        let k = src[j..].find("let pre_state = pinch_state;").unwrap();
        assert!(src[j..j + k].contains("BatterLineAccum"),
            "대타 기록 줄을 안 만든다");
    }

    /// ⚠ **감독이 위로도 아래로도 움직여야 한다.**
    ///
    /// 확률 천장이 `PINCH_HIT_PROB × 최고 IQ 배수`보다 낮으면 좋은 감독이
    /// 나쁜 감독과 같아진다 — 살려 둔 `tacticalIQ` 가 또 죽는다.
    #[test]
    fn 대타_확률에_감독이_들어갈_자리가_있다() {
        // 판정식: PROB × (1 + iq×0.5), iq 는 -1..1 → 배수 0.5..1.5
        let top = T::PINCH_HIT_PROB * 1.5;
        assert!(top < 0.95,
            "최고 IQ 가 {} 라 천장 0.95 에 닿는다 — 위로 죽은 갈래", top);
        assert!(T::PINCH_HIT_PROB > 0.0, "0이면 대타가 아예 안 난다");
    }

    /// 🔴 **대주자도 타순 자리를 물려받는다.**
    ///
    /// 1루 주자를 바꿔 놓고 라인업을 그대로 두면 **이미 물러난 사람이
    /// 계속 타석에 선다.** 대타와 같은 함정인데 이쪽은 주자 쪽이라
    /// 눈에 덜 띈다.
    #[test]
    fn 대주자도_타순_자리를_물려받는다() {
        let src = include_str!("match_engine.rs");
        let i = src.find("let mut pinch_run_log").expect("대주자 판정이 없다");
        let j = src[i..].find("let pre_state = pinch_state;").expect("끝을 못 찾겠다");
        let block = &src[i..i + j];
        assert!(block.contains("lineup.iter().position"),
            "라인업에서 그 사람 자리를 안 찾는다 — 물러난 사람이 또 친다");
        assert!(block.contains("BatterLineAccum"),
            "대주자 기록 줄을 안 만든다 — 득점·도루가 엉뚱한 사람에게 붙는다");
    }

    /// 🔴 **대타가 벤치를 다 먹으면 대주자가 없다.**
    ///
    /// 실측에서 대타가 매 경기 넷을 다 썼고 대주자가 팀당 0.08~0.16회로
    /// 눌렸다. 한 자리를 남기게 하니 0.16~0.25 가 됐다.
    #[test]
    fn 대타가_벤치를_다_먹지_않는다() {
        // 🔴 `include_str!` 은 **이 검사 자신도** 담는다 — 그냥 찾으면
        //   아래 문자열이 걸려서 변이를 놓친다(실제로 놓쳤다).
        //   대타 블록 안을 본다.
        let src = include_str!("match_engine.rs");
        let i = src.find("let mut pinch_state").expect("대타 판정이 없다");
        let j = src[i..].find("let mut pinch_run_log").expect("대주자 판정이 없다");
        assert!(src[i..i + j].contains("used + 1 < bench.len()"),
            "대타가 벤치를 끝까지 쓴다 — 대주자 몫이 안 남는다");
    }

    // ── 주인공 없는 경기 (2026-08-31) ───────────────────────

    /// 🔴 **리그 경기 홈 마운드에 기본값 투수가 서 있었다.**
    ///
    /// `role: "SP"` 면 `is_immediate` 로 1구부터 주인공이 던진다. 리그
    /// 시뮬은 주인공이 없어 `pitcher` 를 안 넘기니 그 자리에 50/52/55…
    /// 가 섰다. 같은 로스터끼리 붙여도 홈이 **2.2점을 더 줬고**
    /// 홈 승률이 33% 였다. 리그 타율도 .31 로 부풀었다(실측).
    #[test]
    fn 주인공이_없으면_아무도_안_들어온다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let opts = MatchStartOptions {
            no_protagonist: Some(true),
            role: Some(PitcherRole::SP),
            ..Default::default()
        };
        let st = create_initial_match_state(&opts, &mut rng);
        assert!(!st.protagonist_has_entered,
            "주인공이 없다는데 1구부터 마운드에 서 있다");
        // 🔴 시작만 막으면 `entry_trigger` 가 나중에 불러들인다 — 갈래가 둘이다
        let mut later = st.clone();
        later.inning = 5;
        later.half = HalfInning::Top;   // 우리 팀 수비
        later.outs = 0;
        later.count = MatchCount { balls: 0, strikes: 0 };
        assert!(!should_protagonist_enter(&later),
            "5회에 기본값 투수가 등판한다 — 도중 갈래가 안 막혔다");
    }

    /// ⚠ **안 넘기면 예전과 완전히 같아야 한다.**
    ///
    /// `tuning.cjs` 는 일부러 `pitcher` 없이 합성 주인공을 돌린다 —
    /// 그쪽은 기본값이 의도다. 추론으로 껐으면 그 도구가 죽는다.
    #[test]
    fn 안_넘기면_예전대로_주인공이_선다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let opts = MatchStartOptions {
            role: Some(PitcherRole::SP),
            ..Default::default()
        };
        let st = create_initial_match_state(&opts, &mut rng);
        assert!(st.protagonist_has_entered,
            "기본값이 false 여야 한다 — 예전 동작이 바뀌었다");
    }

    // ── 1.1 A② §6-1 — 리그가 정하는 넷 ────────────────────────────

    /// 규칙 파일 값이 오면 tuning 폴백을 덮고, 소프트캡은 0.75 배다. 안 오면 예전 그대로다
    #[test]
    fn 투구수_상한은_규칙값이_tuning을_덮는다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let base = MatchStartOptions { league_id: Some("LEAGUE_HIGHSCHOOL".into()), role: Some(PitcherRole::SP), ..Default::default() };
        let st0 = create_initial_match_state(&base, &mut rng);
        assert_eq!(st0.pitch_limit, T::league_pitch_limit("LEAGUE_HIGHSCHOOL"));
        assert_eq!(st0.starter_outs_factor, 1.0);
        let opts = MatchStartOptions { pitch_limit_override: Some(95.0), starter_outs_factor: Some(0.8), ..base.clone() };
        let st = create_initial_match_state(&opts, &mut rng);
        assert_eq!(st.pitch_limit, 95.0);
        assert!((st.pitch_soft - 71.25).abs() < 1e-9);
        assert_eq!(st.my_queue.pitch_limit, 95.0);
        assert_eq!(st.starter_outs_factor, 0.8);
        // 0 이면 무시 — 구 호출부·구 상태 호환
        let zero = MatchStartOptions { pitch_limit_override: Some(0.0), starter_outs_factor: Some(0.0), ..base };
        let stz = create_initial_match_state(&zero, &mut rng);
        assert_eq!(stz.pitch_limit, T::league_pitch_limit("LEAGUE_HIGHSCHOOL"));
        assert_eq!(stz.starter_outs_factor, 1.0);
    }

    /// 선발 아웃 예산에 계수가 곱해진다 — 0.80 이면 이닝이 준다
    #[test]
    fn 선발_아웃_예산에_리그_계수가_곱해진다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let mk = |f: Option<f64>| MatchStartOptions {
            role: Some(PitcherRole::SP),
            protagonist_pitcher: Some(PartialPitcherStats { stamina_cap: Some(60.0), ..Default::default() }),
            starter_outs_factor: f,
            ..Default::default()
        };
        let full = protagonist_max_outs(&create_initial_match_state(&mk(None), &mut rng));
        let cut  = protagonist_max_outs(&create_initial_match_state(&mk(Some(0.8)), &mut rng));
        assert_eq!(full, 21, "스태미나 60 → 12 + 60/99×15 = 21아웃");
        assert_eq!(cut, 17, "×0.80 → 17아웃 (불펜 10아웃이 생긴다)");
    }

    /// 마무리 문: 규칙이 오면 감독 clutchDecision 을 안 보고 그 회차로 고정된다
    #[test]
    fn 마무리_문은_규칙값이_감독_판정을_덮는다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let low_clutch = PartialManagerStats { clutch_decision: Some(30.0), ..Default::default() };
        let base = MatchStartOptions { role: Some(PitcherRole::CP), my_manager: Some(low_clutch), ..Default::default() };
        let st0 = create_initial_match_state(&base, &mut rng);
        assert!(matches!(st0.entry_trigger, EntryTrigger::CloseGame { inning_threshold: 9, .. }), "clutch 30 → 9회");
        let gated = MatchStartOptions {
            closer_gate: Some(crate::types::CloserGate { inning_threshold: 8, max_lead_diff: 3, min_lead_diff: 1 }),
            ..base
        };
        let st = create_initial_match_state(&gated, &mut rng);
        assert!(matches!(st.entry_trigger, EntryTrigger::CloseGame { inning_threshold: 8, max_lead_diff: 3, min_lead_diff: 1 }));
    }

    /// 1.1 A④ §5-c — 추천 밖 깊이만큼 진입 문턱이 늦어지고 상황이 좁아진다
    #[test]
    fn 추천_밖_깊이가_진입_문턱을_늦춘다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let gate = crate::types::CloserGate { inning_threshold: 8, max_lead_diff: 3, min_lead_diff: 1 };
        let cp = |d: Option<u32>| MatchStartOptions {
            role: Some(PitcherRole::CP), closer_gate: Some(gate.clone()), role_depth: d, ..Default::default() };
        // 🔴 대조군 — 안 넘기면 예전 그대로다
        assert!(matches!(create_initial_match_state(&cp(None), &mut rng).entry_trigger,
            EntryTrigger::CloseGame { inning_threshold: 8, max_lead_diff: 3, min_lead_diff: 1 }));
        assert!(matches!(create_initial_match_state(&cp(Some(0)), &mut rng).entry_trigger,
            EntryTrigger::CloseGame { inning_threshold: 8, max_lead_diff: 3, .. }));
        // 한 칸 밖 → 9회에 · 리드 1~2 만
        assert!(matches!(create_initial_match_state(&cp(Some(1)), &mut rng).entry_trigger,
            EntryTrigger::CloseGame { inning_threshold: 9, max_lead_diff: 2, min_lead_diff: 1 }));
        // 세 칸 밖이라도 9회를 넘지 않고 리드 폭은 최소 리드 밑으로 안 내려간다
        assert!(matches!(create_initial_match_state(&cp(Some(3)), &mut rng).entry_trigger,
            EntryTrigger::CloseGame { inning_threshold: 9, max_lead_diff: 1, min_lead_diff: 1 }));

        // 중계 — 감독 bullpenRead 50 이면 6회. 한 칸 밖이면 7회 · 점수 폭 6 → 4
        let rp = |d: Option<u32>| MatchStartOptions {
            role: Some(PitcherRole::RP), role_depth: d, ..Default::default() };
        assert!(matches!(create_initial_match_state(&rp(None), &mut rng).entry_trigger,
            EntryTrigger::MidInning { inning: 6, score_diff_cap: 6, .. }));
        assert!(matches!(create_initial_match_state(&rp(Some(1)), &mut rng).entry_trigger,
            EntryTrigger::MidInning { inning: 7, score_diff_cap: 4, .. }));
        // 선발은 이 갈래를 안 탄다 — 1회 시작 그대로다
        let sp = MatchStartOptions { role: Some(PitcherRole::SP), role_depth: Some(3), ..Default::default() };
        assert!(matches!(create_initial_match_state(&sp, &mut rng).entry_trigger,
            EntryTrigger::InningStart { inning: 1 }));
    }

    /// 의무 휴식이 안 찼으면 불펜 주인공은 못 나온다 — 선발은 검사 대상이 아니다
    #[test]
    fn 의무_휴식이_안_찼으면_불펜_주인공은_못_나온다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        // 어제 98구 → 5일 휴식(rest_rules) → 오늘은 못 나온다
        let guard = crate::types::RestGuard { last_pitched_date: "2027-05-01".into(), last_pitch_count: 98, game_date: "2027-05-02".into() };
        let rp = MatchStartOptions { role: Some(PitcherRole::RP), rest_guard: Some(guard.clone()), ..Default::default() };
        let st = create_initial_match_state(&rp, &mut rng);
        assert!(st.protagonist_rest_blocked);
        let mut later = st.clone();
        later.inning = 7; later.half = HalfInning::Top; later.outs = 0;
        later.count = MatchCount { balls: 0, strikes: 0 };
        assert!(!should_protagonist_enter(&later), "휴식이 안 찼는데 등판한다");
        // 같은 재료라도 선발은 막지 않는다 (로테이션 휴식은 다른 규칙이 본다)
        let sp = MatchStartOptions { role: Some(PitcherRole::SP), rest_guard: Some(guard.clone()), ..Default::default() };
        assert!(!create_initial_match_state(&sp, &mut rng).protagonist_rest_blocked);
        // 엿새 뒤면 나온다
        let ok = crate::types::RestGuard { game_date: "2027-05-07".into(), ..guard };
        let rp2 = MatchStartOptions { role: Some(PitcherRole::RP), rest_guard: Some(ok), ..Default::default() };
        assert!(!create_initial_match_state(&rp2, &mut rng).protagonist_rest_blocked);
    }

    /// ⚠ 대주자 확률에도 감독이 들어갈 자리가 있어야 한다 — 대타와 같다
    #[test]
    fn 대주자_확률에_감독이_들어갈_자리가_있다() {
        let top = T::PINCH_RUN_PROB * 1.5;
        assert!(top < 0.95,
            "최고 IQ 가 {} 라 천장 0.95 에 닿는다 — 위로 죽은 갈래", top);
        assert!(T::PINCH_RUN_MIN_INNING >= T::PINCH_HIT_MIN_INNING,
            "대주자가 대타보다 이르면 벤치를 먼저 먹는다");
    }

    /// ⚠ **벤치보다 문턱이 높으면 대타가 안 난다.**
    ///
    /// 처음 값(6.0 = 컨택+파워 12)은 300경기에서 벤치 8명 중 3명만 썼다.
    /// 벤치는 정의상 라인업보다 약해서 그만한 차가 잘 안 난다.
    #[test]
    fn 대타_문턱이_벤치를_죽이지_않는다() {
        assert!(T::PINCH_HIT_OVR_GAP <= 2.0,
            "{} 면 컨택+파워 {} 차라 벤치가 거의 못 들어간다",
            T::PINCH_HIT_OVR_GAP, T::PINCH_HIT_OVR_GAP * 2.0);
        assert!(T::PINCH_HIT_MIN_INNING >= 6,
            "{}회부터면 선발 타순이 초반에 무너진다", T::PINCH_HIT_MIN_INNING);
    }
}

#[cfg(test)]
mod 완급과코스 {
    use super::*;

    // ── 결정 ⑧ 완급 조절 ────────────────────────────────────

    /// 🔴 **표시식에 구종이 없어서 낙차를 못 쟀다.** 엔진 값은 구종을 본다.
    #[test]
    fn 구종마다_구속이_다르다() {
        let v = 62.0;
        let fast = T::pitch_speed(v, PitchType::Fastball, PitchPower::Normal);
        let curve = T::pitch_speed(v, PitchType::Curve, PitchPower::Normal);
        assert!(fast > curve, "직구({fast})가 커브({curve})보다 안 빠르다");
        assert!((fast - curve - 20.0).abs() < 1e-9, "커브 오프셋이 표와 다르다");
    }

    /// ⚠ **바탕은 화면 표시식과 같아야 한다** (`MatchPage.statToKmh`).
    ///   어긋나면 카드에 145 라 적히고 엔진은 딴 공을 던진다.
    #[test]
    fn 직구는_표시식과_같다() {
        for stat in [30.0, 50.0, 62.0, 99.0] {
            let shown = T::PITCH_SPEED_BASE + stat * T::PITCH_SPEED_PER_STAT;
            let engine = T::pitch_speed(stat, PitchType::Fastball, PitchPower::Normal);
            assert!((shown - engine).abs() < 1e-9, "스탯 {stat} 에서 갈렸다");
        }
    }

    /// ⚠ **직전이 없으면 0** — 첫 공은 견줄 게 없다. 0.0 을 채우면 첫 공이
    ///   늘 큰 낙차로 잡힌다.
    #[test]
    fn 첫공은_가산이_없다() {
        assert_eq!(T::speed_gap_bonus(None, 140.0), 0.0);
    }

    /// 낙차 문턱은 **계단**이다 — 10 미만 0 · 10 이상 +1 · 20 이상 +2
    #[test]
    fn 낙차가_클수록_가산이_크다() {
        assert_eq!(T::speed_gap_bonus(Some(140.0), 135.0), 0.0, "5km/h 는 가산이 없다");
        assert_eq!(T::speed_gap_bonus(Some(140.0), 129.0), T::SPEED_GAP_SMALL_BONUS);
        assert_eq!(T::speed_gap_bonus(Some(140.0), 118.0), T::SPEED_GAP_BIG_BONUS);
    }

    /// ⚠ **방향을 안 본다.** 느린 공 뒤의 빠른 공도 완급이다
    #[test]
    fn 느린공_뒤_빠른공도_같다() {
        assert_eq!(T::speed_gap_bonus(Some(120.0), 145.0), T::speed_gap_bonus(Some(145.0), 120.0));
    }

    /// 같은 구종을 이어 던지면 낙차가 0 이라 **가산 없이 페널티만** 남는다
    #[test]
    fn 같은_구종_연속은_가산이_0이다() {
        let s = T::pitch_speed(62.0, PitchType::Slider, PitchPower::Normal);
        assert_eq!(T::speed_gap_bonus(Some(s), s), 0.0);
        assert!(pitch_pattern_modifier(PitchType::Slider, &[PitchType::Slider]) < 0.0);
    }

    // ── 결정 ⑨ 코스 반복 ────────────────────────────────────

    /// 🔴 **접지 않으면 반복이 영원히 0건이다** — `target` 은 실수다
    #[test]
    fn 존_안은_아홉_칸이다() {
        let mut seen = std::collections::HashSet::new();
        for y in [-0.7, 0.0, 0.7] {
            for x in [-0.7, 0.0, 0.7] {
                seen.insert(course_cell(XY { x, y }));
            }
        }
        assert_eq!(seen.len(), 9, "아홉 칸이 안 나온다: {seen:?}");
        assert!(!seen.contains(&COURSE_CELL_OUT), "존 안이 존 밖 칸으로 갔다");
    }

    /// ⚠ `target_to_zone` 은 존 밖도 3×3 에 욱여넣는다 — 먼저 갈라야 한다
    #[test]
    fn 존_밖은_한_칸이다() {
        for (x, y) in [(1.4, 0.0), (-1.4, 0.0), (0.0, 1.4), (0.0, -1.4), (1.3, 1.3)] {
            assert_eq!(course_cell(XY { x, y }), COURSE_CELL_OUT, "({x},{y}) 가 존 안으로 잡혔다");
        }
    }

    /// 구종 페널티와 **같은 꼴**이고 크기만 작다
    #[test]
    fn 연속할수록_벌이_커진다() {
        assert_eq!(course_pattern_modifier(5, &[5]), T::COURSE_REPEAT_1);
        assert_eq!(course_pattern_modifier(5, &[5, 5]), T::COURSE_REPEAT_2);
        assert_eq!(course_pattern_modifier(5, &[5, 5, 5]), T::COURSE_REPEAT_3);
    }

    #[test]
    fn 새_칸은_가산이다() {
        assert_eq!(course_pattern_modifier(1, &[5, 6, 7]), T::COURSE_FRESH_BONUS);
        // 최근 3구 **안**에 있으면 가산이 없다 (직전은 아니라 벌도 아니다)
        assert_eq!(course_pattern_modifier(1, &[5, 1, 6]), 0.0);
        // 네 번째 앞이면 창 밖이라 다시 「새 칸」이다 — 창은 3구다
        assert_eq!(course_pattern_modifier(1, &[1, 5, 6, 7]), T::COURSE_FRESH_BONUS);
    }

    #[test]
    fn 첫공은_아무것도_안_한다() {
        assert_eq!(course_pattern_modifier(5, &[]), 0.0);
    }

    /// 🔴 **구종보다 작아야 한다** — 코스는 접은 값이라 「같은 자리」가 덜 또렷하다.
    ///
    /// ⚠ 견줄 상대가 **투수 몫 하나가 아니다**(결정 ⑩ 이후). 구종 반복의 벌은
    ///   투수 쪽(`pitch_pattern_modifier`) 절반 + 타자 쪽(`batter_read_modifier`)
    ///   절반으로 갈렸다 — 코스와 견주려면 **둘을 합친 값**이어야 한다.
    ///   합치지 않고 투수 몫만 보면 「코스 −0.5 대 구종 −0.5」로 같아져서
    ///   이 불변식이 거짓으로 깨진 것처럼 보인다.
    #[test]
    fn 코스_벌이_구종보다_작다() {
        let b = 평균타자();
        let 구종1 = pitch_pattern_modifier(PitchType::Slider, &[PitchType::Slider]).abs()
            + batter_read_modifier(PitchType::Slider, &[PitchType::Slider], &b).abs();
        let 구종3 = pitch_pattern_modifier(PitchType::Slider, &[PitchType::Slider; 3]).abs()
            + batter_read_modifier(PitchType::Slider, &[PitchType::Slider; 3], &b).abs();
        assert!(T::COURSE_REPEAT_1.abs() < 구종1, "코스 {} 대 구종 {구종1}", T::COURSE_REPEAT_1.abs());
        assert!(T::COURSE_REPEAT_3.abs() < 구종3, "코스 {} 대 구종 {구종3}", T::COURSE_REPEAT_3.abs());
        assert!(T::COURSE_FRESH_BONUS <= T::PITCH_FRESH_BONUS, "새 구종 가산보다 커졌다");
    }

    // ── 결정 ⑩ 타자 노림수 ────────────────────────────────────

    /// 계측·검사에서 같이 쓰는 **기준 타자**(전 능력 50) — 노림수 배수가 1.0 이다
    fn 평균타자() -> BatterStats {
        BatterStats {
            id: None, name: None,
            contact: 50.0, power: 50.0, eye: 50.0, discipline: 50.0,
            batting_clutch: 50.0, platoon: 50.0, speed: 50.0, base_instinct: 50.0,
            bunting: None, fielding: 50.0, arm: 50.0,
        }
    }

    /// 🔴 **이중 계산을 안 한다.** 투수 쪽 페널티가 절반으로 내려가고 그만큼이
    ///   타자 쪽으로 갔다 — 3연속의 **합**이 예전 −4.0 그대로여야 한다
    #[test]
    fn 반복_벌의_총량이_안_늘었다() {
        let b = 평균타자();
        let last = [PitchType::Slider; 3];
        let 합 = pitch_pattern_modifier(PitchType::Slider, &last)
               - batter_read_modifier(PitchType::Slider, &last, &b);
        assert_eq!(합, T::PITCH_REPEAT_3_LEGACY, "3연속 총량이 예전과 다르다");
        assert_eq!(T::PITCH_REPEAT_1, T::PITCH_REPEAT_1_LEGACY / 2.0);
        assert_eq!(T::PITCH_REPEAT_2, T::PITCH_REPEAT_2_LEGACY / 2.0);
        assert_eq!(T::PITCH_REPEAT_3, T::PITCH_REPEAT_3_LEGACY / 2.0);
        assert_eq!(T::PITCH_FRESH_BONUS, T::PITCH_FRESH_BONUS_LEGACY / 2.0);
    }

    /// 🔴 **구종 개수가 산식에 들어온다.** 둘로 번갈아 던지면 최근 3구가
    ///   [A,B,A] 라 A 가 늘 두 번이다 — 노림수가 걸린다. 다섯이면 안 걸린다
    #[test]
    fn 구종이_적으면_읽힌다() {
        use PitchType::*;
        let b = 평균타자();
        // 둘로 번갈아: 직전 [Slider, Fastball, Slider] 뒤에 Slider
        // 둘로 번갈아: …A,B 뒤에 A — 이 공까지 세면 최근 3구에 A 가 둘이다
        let 둘 = batter_read_modifier(Slider, &[Slider, Fastball], &b);
        assert_eq!(둘, T::BATTER_READ_TWICE_IN_WINDOW, "번갈아 던지기가 안 읽혔다");
        // 셋 이상을 돌리면 안 걸린다 — …A,B,C 뒤에 A
        let 셋 = batter_read_modifier(Slider, &[Slider, Fastball, Curve], &b);
        assert_eq!(셋, 0.0, "구종 셋을 돌렸는데도 읽혔다");
        let 다섯 = batter_read_modifier(Slider, &[Curve, Changeup, Fastball], &b);
        assert_eq!(다섯, 0.0, "구종을 돌렸는데도 읽혔다");
        // 투수 쪽 새 구종 가산은 **넷 이상**을 돌려야 붙는다 — 셋은 창(앞 3구)에 남는다
        assert_eq!(pitch_pattern_modifier(Slider, &[Curve, Changeup, Fastball]), T::PITCH_FRESH_BONUS);
        assert_eq!(pitch_pattern_modifier(Slider, &[Slider, Fastball, Curve]), 0.0);
    }

    /// 직전과 같은 구종이 제일 크고, 「최근 3구에 두 번」이 그 다음이다 — **안 겹친다**
    #[test]
    fn 직전이_더_크게_읽힌다() {
        use PitchType::*;
        let b = 평균타자();
        let 직전 = batter_read_modifier(Slider, &[Fastball, Curve, Slider], &b);
        // ⚠ 직전이 같으면 **직전 쪽**이다 — 둘을 더하지 않는다
        let 둘다 = batter_read_modifier(Slider, &[Slider, Slider], &b);
        let 두번만 = batter_read_modifier(Slider, &[Slider, Fastball], &b);
        assert_eq!(직전, T::BATTER_READ_SAME_AS_LAST);
        assert_eq!(둘다, T::BATTER_READ_SAME_AS_LAST, "직전이 같으면 직전 값이다");
        assert_eq!(두번만, T::BATTER_READ_TWICE_IN_WINDOW);
        assert!(두번만 < 직전);
    }

    /// 눈이 좋을수록 크게 읽는다 — **막아 둔다**(0.6~1.4)
    #[test]
    fn 눈이_좋으면_크게_읽는다() {
        let mut 약 = 평균타자(); 약.eye = 10.0; 약.discipline = 10.0;
        let mut 강 = 평균타자(); 강.eye = 95.0; 강.discipline = 95.0;
        let last = [PitchType::Slider];
        let a = batter_read_modifier(PitchType::Slider, &last, &약);
        let s = batter_read_modifier(PitchType::Slider, &last, &강);
        assert!(a < s, "눈이 결과를 안 가른다 ({a} vs {s})");
        assert_eq!(a, T::BATTER_READ_SAME_AS_LAST * 0.6);
        assert_eq!(s, T::BATTER_READ_SAME_AS_LAST * 1.4);
    }

    #[test]
    fn 첫공은_안_읽힌다() {
        assert_eq!(batter_read_modifier(PitchType::Slider, &[], &평균타자()), 0.0);
    }

    // ── 결정 ⑪ 결정구 ────────────────────────────────────

    fn 투수(arsenal: &[(PitchType, u8)]) -> PitcherStats {
        let mut p = build_pitcher(&PartialPitcherStats::default(), 60.0, 60.0, 60.0, 60.0, 60.0, 60.0, 60.0, 60.0);
        p.arsenal = arsenal.iter().map(|&(pitch_type, grade)| ArsenalPitch { pitch_type, grade }).collect();
        p
    }

    /// 🔴 **전 구종이 같은 등급이면 아무것도 결정구가 아니다.** 안 그러면
    ///   2스트라이크에 무엇을 던지든 가산이 붙어 카운트 보정이 한 번 더 붙는 꼴이다
    #[test]
    fn 등급이_같으면_결정구가_없다() {
        use PitchType::*;
        let p = 투수(&[(Fastball, 3), (Slider, 3), (Curve, 3)]);
        for t in [Fastball, Slider, Curve] {
            assert!(!is_putaway_pitch(&p, t), "{t:?} 가 결정구로 잡혔다");
        }
    }

    #[test]
    fn 제일_다듬은_공만_결정구다() {
        use PitchType::*;
        let p = 투수(&[(Fastball, 3), (Slider, 5), (Curve, 2)]);
        assert!(is_putaway_pitch(&p, Slider));
        assert!(!is_putaway_pitch(&p, Fastball));
        assert!(!is_putaway_pitch(&p, Curve));
        // 안 가진 구종은 결정구가 아니다 — `grade_of` 는 없으면 3을 주지만
        // 여기선 arsenal 에 실제로 있는지를 본다
        assert!(!is_putaway_pitch(&p, Knuckleball));
    }

    /// 구종이 하나뿐이면 「고를 것」이 없다
    #[test]
    fn 구종이_하나면_결정구가_없다() {
        assert!(!is_putaway_pitch(&투수(&[(PitchType::Fastball, 5)]), PitchType::Fastball));
    }

    /// ⚠ **겹쳐 걸린다.** 같은 구종을 같은 자리에 던지면 둘 다 맞는다
    #[test]
    fn 구종과_코스는_서로를_안_지운다() {
        let p = pitch_pattern_modifier(PitchType::Slider, &[PitchType::Slider, PitchType::Slider]);
        let c = course_pattern_modifier(5, &[5, 5]);
        assert!(p < 0.0 && c < 0.0);
        assert!((p + c) < p, "합이 한쪽보다 작지 않다 — 겹쳐 걸리는 게 아니다");
    }

    /// 🔴 **AI 가 안 피하면 벌만 AI 가 먹는다.** 볼 3개만 예외다
    #[test]
    fn ai가_직전_칸을_피한다() {
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(12345);
        let mut repeats = 0usize;
        let mut plain_repeats = 0usize;
        for i in 0..2000 {
            let last = 5u8;
            let a = pick_target_avoiding(0, 1, &[last], &mut rng);
            if course_cell(a) == last { repeats += 1; }
            let b = pick_target(0, 1, &mut rng);
            if course_cell(b) == last { plain_repeats += 1; }
            let _ = i;
        }
        assert!(repeats < plain_repeats,
            "피한 쪽({repeats})이 안 피한 쪽({plain_repeats})보다 안 줄었다");
    }

    /// ⚠ **볼 3개면 안 피한다** — 그 카운트의 자리는 한복판 하나뿐이라
    ///   피하게 만들면 볼넷을 피하려는 행동 자체가 무너진다
    #[test]
    fn 볼_셋이면_안_피한다() {
        use rand::SeedableRng;
        let mut a = rand::rngs::StdRng::seed_from_u64(777);
        let mut b = rand::rngs::StdRng::seed_from_u64(777);
        for _ in 0..200 {
            let x = pick_target_avoiding(3, 0, &[5], &mut a);
            let y = pick_target(3, 0, &mut b);
            assert!((x.x - y.x).abs() < 1e-12 && (x.y - y.y).abs() < 1e-12,
                "볼 3개인데 다시 뽑았다 — 난수가 어긋났다");
        }
    }
}
