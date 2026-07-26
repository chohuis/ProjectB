use rand::seq::SliceRandom;
use rand::Rng;

use crate::sim::match_sim::{fatigue_effective, platoon_edge_for_pitcher, resolve_in_play_result, BatterStats, GameConditions, PaOutcome, PitcherStats};

/// 구종 마스터리 항목(05_구종_시스템.md §2) — `repository::pitch_mastery_entries`가
/// `protagonist.pitches`(`{name, stage, weeks}` JSON)에서 만들어 넘긴다.
/// `stage`는 1(습작)~5(필살기).
#[derive(Debug, Clone)]
pub struct PitchMastery {
    pub name: String,
    pub stage: u8,
}

/// 구종 3계열(05_구종_시스템.md §1 카탈로그) — 레퍼토리 다양성 보너스
/// (§4 "3계열 골고루 보유가 유리")와 좌우 상성 등 구종별 분기에 재사용.
/// 너클볼은 3계열 어디에도 안 속하는 특수구라 다양성 판정에선 안 셈.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PitchFamily {
    Fastball,
    Breaking,
    Offspeed,
    Special,
}

fn pitch_family(name: &str) -> PitchFamily {
    match name {
        "포심 패스트볼" | "투심 패스트볼" | "커터" => PitchFamily::Fastball,
        "슬라이더" | "커브" | "스위퍼" => PitchFamily::Breaking,
        "체인지업" | "포크볼" | "싱커" => PitchFamily::Offspeed,
        _ => PitchFamily::Special,
    }
}

/// 레퍼토리 다양성 보너스 발동 조건(§4 "3계열 골고루 보유") — 패스트볼·
/// 브레이킹볼·오프스피드 3계열을 전부 갖췄는지. 보유 구종 상한이 5개뿐이라
/// (05_구종_시스템.md §3) 최소 3개 이상부터나 성립.
pub fn repertoire_is_diverse(pitches: &[PitchMastery]) -> bool {
    let has_fastball = pitches.iter().any(|p| pitch_family(&p.name) == PitchFamily::Fastball);
    let has_breaking = pitches.iter().any(|p| pitch_family(&p.name) == PitchFamily::Breaking);
    let has_offspeed = pitches.iter().any(|p| pitch_family(&p.name) == PitchFamily::Offspeed);
    has_fastball && has_breaking && has_offspeed
}

/// 위기상황 판정 함수 자체는 `sim::match_sim`으로 옮겼다(Phase 1, 배경
/// 시뮬도 재사용하기 위해) — 기존 호출부(`data::match_session` 등)가 계속
/// `pitch::is_high_leverage_situation`으로 부를 수 있게 재노출.
pub use crate::sim::match_sim::is_high_leverage_situation;

/// 투구 위치 연속좌표(대화 2026-07-25, 매치 화면 재설계) — x,y는 스트라이크존
/// 기준 -1.0~1.0(존 경계), 그 밖(절댓값 1.0 초과)은 "볼 영역"으로 자연스럽게
/// 확장된다. 예전 3×3 그리드(9칸) 시절엔 `Course` enum이었지만, 실제로
/// 판정식이 그 9칸에서 뽑아 쓰던 값은 딱 둘 — "존 중심에서 얼마나 먼가"
/// (`edge_level`)와 "몸쪽 여부"(`is_inside`) — 뿐이었다. 옛 9칸의 edge_level
/// (중앙 0.0·컴퍼스 4칸 0.5·모서리 4칸 1.0)을 좌표로 환산하면 정확히
/// `(|x|+|y|)/2` 공식과 같아, 이 공식으로 바꿔도 기존 밸런스 수치가
/// 그대로 재현되면서 볼 영역까지 자연 확장된다(별도 "고의 볼" 분기 불필요
/// — edge가 1.0을 넘어갈수록 `in_zone_base`가 0에 수렴해 저절로 볼이 됨).
fn edge_level(x: f64, y: f64) -> f64 {
    (x.abs() + y.abs()) / 2.0
}

/// 몸쪽(안쪽) 여부 — §5 "사구 확률... 코스가 몸쪽일수록↑". 타자 타석
/// 방향은 안 따진다(9칸 그리드 시절과 동일한 단순화, 정확한 좌우 상성은
/// `platoon_edge_for_pitcher`가 별도로 처리).
fn is_inside(x: f64) -> bool {
    x < 0.0
}

/// 구위 다이얼 3단계(대화 2026-07-25, 매치 화면 재설계) — "얼마나 세게
/// 던지는가"의 즉석 트레이드오프(위력↔제구). 피로도는 게임당 1회 값이라
/// (경기 중 구 단위로 누적되지 않음) "강하게 던질수록 피로 누적"은 세션
/// 상태를 새로 추적해야 하는 별도 스코프 — 대신 그 자리에서 바로 나는
/// 위력·제구 트레이드오프로 설계했다(실제 투구 상식 그대로: 전력투구는
/// 위력은 늘지만 커맨드가 흔들림).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Power {
    Low,
    Normal,
    High,
}

impl Power {
    pub const ALL: [Power; 3] = [Power::Low, Power::Normal, Power::High];

    /// 훈련 강도 다이얼(`sim::training::INTENSITIES`)과 같은 3라벨("약"/
    /// "보통"/"강")을 재사용 — UI 관례 통일, 의미상으로는 별개 다이얼.
    pub fn parse(name: &str) -> Option<Power> {
        match name {
            "약" => Some(Power::Low),
            "보통" => Some(Power::Normal),
            "강" => Some(Power::High),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Power::Low => "약",
            Power::Normal => "보통",
            Power::High => "강",
        }
    }

    /// (제구 보정, 구위 보정, 구속 보정) — 강할수록 위력·구속은 오르지만
    /// 제구가 깎인다.
    fn deltas(self) -> (f64, f64, f64) {
        match self {
            Power::Low => (3.0, -3.0, -3.0),
            Power::Normal => (0.0, 0.0, 0.0),
            Power::High => (-3.0, 3.0, 3.0),
        }
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PitchResult {
    Ball,
    Strike,
    Foul,
    HitByPitch,
    InPlay,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// 1구 판정 — §5 "판정 = 선택 구종 마스터리 단계 + 관련 능력치(제구·구위)
/// vs 타자 능력치(컨택·선구안·파워) + 상황 보정". `high_leverage`(Phase 1)
/// — true면 클러치·침착함이 개입한다(§5 "상황 보정... 클러치"). 피로도는
/// `fatigue_effective`로 제구·구위 실효치를 미리 깎아서 씀(투수가 지칠수록
/// 코스가 흔들린다는 자연스러운 결과). `mastery_stage`(Phase 4, 1~5)는
/// 지금 던진 그 구종의 마스터리 단계 — 3(실전)을 기준점으로 삼아 단계당
/// 소폭 가감(§4 "개별 구종 위력... 마스터리 단계가 피안타율·헛스윙에
/// 직결"). `repertoire_diverse`(Phase 4)는 3계열 골고루 보유 시 발동하는
/// 레퍼토리 다양성 보너스(§4) — 코스 상관없이 항상 소폭 헛스윙 유도력을
/// 더한다. 좌우 상성(Phase 4, 신규 설계)은 `platoon_edge_for_pitcher`로
/// `simulate_plate_appearance`(배경)와 같은 계산을 공유. `conditions`
/// (Phase 5)의 `weather_control_mod`(비=제구 하락, §10-1)를 실효 제구에
/// 더한다. `power`(대화 2026-07-25)는 구위 다이얼 트레이드오프를 실효
/// 제구·구위·구속에 얹는다.
#[allow(clippy::too_many_arguments)]
pub fn throw_pitch(
    rng: &mut impl Rng,
    pitcher: &PitcherStats,
    batter: &BatterStats,
    target_x: f64,
    target_y: f64,
    power: Power,
    high_leverage: bool,
    mastery_stage: u8,
    repertoire_diverse: bool,
    conditions: &GameConditions,
) -> PitchResult {
    let edge = edge_level(target_x, target_y);
    let (control_delta, stuff_delta, velocity_delta) = power.deltas();
    let effective_control = fatigue_effective(pitcher.control, pitcher.fatigue) + conditions.weather_control_mod + control_delta;
    let effective_stuff = fatigue_effective(pitcher.stuff, pitcher.fatigue) + stuff_delta;
    let effective_velocity = pitcher.velocity + velocity_delta;

    // 사구 — §5 "제구 낮을수록↑, 몸쪽일수록↑".
    let control_deficit = (50.0 - effective_control).max(0.0) * 0.0006;
    let inside_bonus = if is_inside(target_x) { 0.01 } else { 0.0 };
    let hbp_prob = (0.01 + control_deficit + inside_bonus).clamp(0.0, 0.15);
    if rng.gen::<f64>() < hbp_prob {
        return PitchResult::HitByPitch;
    }

    // 스트라이크존 통과 여부 — 구석일수록(볼 영역이면 더더욱) 존 밖으로
    // 빠질 확률↑, 제구 좋을수록 원하는 위치(존 안)에 더 잘 넣음. 경기운영도
    // 소폭 거든다(§10 "경기운영 = 적은 구수로 아웃 잡는 능력"의 일부로 해석).
    let in_zone_base = clamp01(0.75 - edge * 0.5);
    let control_bonus = (effective_control - 50.0) * 0.002 + (pitcher.game_management - 50.0) * 0.001;
    let in_zone = rng.gen::<f64>() < clamp01(in_zone_base + control_bonus);

    if !in_zone {
        // 유인구에 속아 스윙하는지 — §5 "선구안 스탯이 그 역할을 흡수".
        // 위기상황에선 침착한 타자일수록 덜 낚임.
        let mut chase_prob = clamp01(0.25 - (batter.eye - 50.0) * 0.003 + edge * 0.1);
        if high_leverage {
            chase_prob = clamp01(chase_prob - (batter.composure - 50.0) * 0.001);
        }
        if rng.gen::<f64>() >= chase_prob {
            return PitchResult::Ball;
        }
        let whiff_prob = clamp01(0.4 + edge * 0.3 - (batter.contact - 50.0) * 0.003 + (effective_velocity - 50.0) * 0.001);
        return if rng.gen::<f64>() < whiff_prob { PitchResult::Strike } else { PitchResult::Foul };
    }

    // 존 안 — 구석에 걸칠수록(edge↑) 맞히기 어려움. 구속은 구위와 별개로
    // 순수 헛스윙 유발력을 더한다. 위기상황에선 클러치 대결. 마스터리
    // 단계(Phase 4)는 3(실전)을 기준점으로 단계당 ±2.5, 좌우 상성(Phase 4)은
    // `platoon_edge_for_pitcher` 공유 계산. D그룹 placeholder(계수는 I8
    // 재조정 대상).
    let mastery_bonus = (mastery_stage as f64 - 3.0) * 2.5;
    let mut contact_edge = (effective_stuff + edge * 20.0 + (effective_velocity - 50.0) * 0.3) - batter.contact + mastery_bonus;
    contact_edge += platoon_edge_for_pitcher(pitcher.handedness, batter.handedness);
    if high_leverage {
        contact_edge += (pitcher.clutch - batter.clutch) * 3.0;
    }
    // 레퍼토리 다양성 보너스(Phase 4, §4) — 3계열 골고루 보유한 투수는
    // 타자가 다음 구종을 예측하기 어려워 코스와 무관하게 헛스윙 확률이
    // 소폭 오른다.
    let diversity_bonus = if repertoire_diverse { 0.02 } else { 0.0 };
    let whiff_prob = clamp01(0.19 + contact_edge * 0.004 + diversity_bonus);
    if rng.gen::<f64>() < whiff_prob {
        return PitchResult::Strike;
    }
    if rng.gen::<f64>() < 0.35 {
        return PitchResult::Foul;
    }
    PitchResult::InPlay
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Count {
    pub balls: u32,
    pub strikes: u32,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum AtBatOutcome {
    InProgress,
    Strikeout,
    Walk,
    HitByPitch,
    InPlay,
}

/// 카운트에 1구 판정을 반영 — §5 "3스트라이크=삼진, 4볼=볼넷, 사구=즉시
/// 진루, 인플레이 발생 시 타석 종료". 2스트라이크 이후 파울은 스트라이크로
/// 안 늘어남(실제 야구 규칙 재사용).
pub fn apply_pitch_result(count: &mut Count, result: PitchResult) -> AtBatOutcome {
    match result {
        PitchResult::Ball => {
            count.balls += 1;
            if count.balls >= 4 {
                AtBatOutcome::Walk
            } else {
                AtBatOutcome::InProgress
            }
        }
        PitchResult::Strike => {
            count.strikes += 1;
            if count.strikes >= 3 {
                AtBatOutcome::Strikeout
            } else {
                AtBatOutcome::InProgress
            }
        }
        PitchResult::Foul => {
            if count.strikes < 2 {
                count.strikes += 1;
            }
            AtBatOutcome::InProgress
        }
        PitchResult::HitByPitch => AtBatOutcome::HitByPitch,
        PitchResult::InPlay => AtBatOutcome::InPlay,
    }
}

/// 자동 모드(§3) AI의 구종·위치·구위 대리 선택 — "가벼운 휴리스틱... 위기상황
/// 일수록 유인구(구석 근처) 비중↑, 강타자 상대일수록 정면승부 비중↓"를
/// 그대로 반영(대화 2026-07-25, 좌표 기반으로 재작성). 구종은 보유 구종 중
/// 균등 랜덤(마스터리에 따른 가중 선구는 스코프 밖 — 어떤 구종을 던지든
/// `throw_pitch`가 그 구종의 마스터리 단계를 실제로 반영하는 게 이번
/// Phase 4의 핵심이라, "어떤 구종을 고를지" 자체는 안 건드림). 구위는
/// 위기상황에서만 가끔 "강"을 섞는 정도로 소박하게.
pub fn choose_pitch_and_target(rng: &mut impl Rng, pitches: &[PitchMastery], batter: &BatterStats, high_leverage: bool) -> (PitchMastery, f64, f64, Power) {
    let pitch = pitches.choose(rng).cloned().unwrap_or(PitchMastery { name: "포심 패스트볼".to_string(), stage: 1 });

    let strong_batter = batter.power >= 60.0;
    let lure_bias = (if high_leverage { 0.3 } else { 0.0 }) + (if strong_batter { 0.2 } else { 0.0 });
    let (x, y) = if rng.gen::<f64>() < lure_bias {
        // 유인구 — 존 구석 근처(옛 CORNERS 대응)를 랜덤 샘플.
        let sx = if rng.gen_bool(0.5) { 1.0 } else { -1.0 };
        let sy = if rng.gen_bool(0.5) { 1.0 } else { -1.0 };
        (sx * rng.gen_range(0.7..=1.1), sy * rng.gen_range(0.7..=1.1))
    } else {
        (rng.gen_range(-1.0..=1.0), rng.gen_range(-1.0..=1.0))
    };
    let power = if high_leverage && rng.gen_bool(0.35) { Power::High } else { Power::Normal };
    (pitch, x, y, power)
}

/// 완전 자동(§3 "자동" 모드) 방식으로 한 타석을 끝까지 진행 — 매 구
/// `choose_pitch_and_target`로 AI가 구종·위치·구위를 고르고 `throw_pitch`로
/// 판정, `apply_pitch_result`로 카운트에 반영해 삼진/볼넷/사구/인플레이
/// 중 하나가 나올 때까지 반복(인플레이면 `resolve_in_play_result`로 세분화
/// 까지 마침). 반환 타입을 `match_sim::PaOutcome`으로 통일해 호출부가
/// 배경 시뮬과 같은 결과 처리 로직(주자 진루 등)을 그대로 재사용하게 한다.
/// 수동 모드(플레이어가 직접 구종·위치·구위를 고름)는
/// `throw_pitch`·`apply_pitch_result`를 그대로 재사용하되 세션 상태를
/// slot.db에 유지해야 해서 별도 서브분 스코프(10_구현_Phase_계획.md 참고).
/// `bases`·`outs`·`team_defense`(Phase 2)·`tactics`·`conditions`(Phase 5)는
/// 인플레이로 이어질 때 `resolve_in_play_result`에 그대로 전달.
///
/// `data::match_session`은 세션 상태(부상 기록·강판 판정·season_stats
/// upsert 등)를 같이 엮어야 해서 이 함수를 직접 호출하는 대신 같은
/// 원시 함수(`choose_pitch_and_target`·`throw_pitch`·`resolve_in_play_result`)
/// 를 자기 루프 안에서 다시 조합해 쓴다 — 그래서 프로덕션 경로에서는 이
/// 함수 자체가 호출되지 않는다(Phase 7 정합성 점검에서 확인, 실제
/// 판정 로직은 원시 함수 레벨에서 공유되므로 갈라질 위험은 없음). 대신
/// "DB 세션 없이 순수하게 몇 트라이얼 돌려서 분포를 비교"하는 용도로
/// 유용해, 배경 엔진(`match_sim::simulate_plate_appearance`)과의 결과
/// 분포 회귀 테스트(`match_sim::tests::background_and_interactive_engines_agree_within_a_reasonable_tolerance`)
/// 가 이 함수를 그 목적으로 재사용한다.
#[allow(clippy::too_many_arguments)]
pub fn simulate_at_bat_automatically(
    rng: &mut impl Rng,
    pitches: &[PitchMastery],
    pitcher: &PitcherStats,
    batter: &BatterStats,
    bases: [bool; 3],
    outs: u32,
    fielding_lineup: &[BatterStats],
    tactics: f64,
    high_leverage: bool,
    conditions: &GameConditions,
) -> (PaOutcome, u32) {
    let mut count = Count::default();
    let mut pitch_count = 0u32;
    let diverse = repertoire_is_diverse(pitches);
    loop {
        let (pitch, x, y, power) = choose_pitch_and_target(rng, pitches, batter, high_leverage);
        let result = throw_pitch(rng, pitcher, batter, x, y, power, high_leverage, pitch.stage, diverse, conditions);
        pitch_count += 1;
        match apply_pitch_result(&mut count, result) {
            AtBatOutcome::InProgress => continue,
            AtBatOutcome::Strikeout => return (PaOutcome::Strikeout, pitch_count),
            AtBatOutcome::Walk => return (PaOutcome::Walk, pitch_count),
            AtBatOutcome::HitByPitch => return (PaOutcome::HitByPitch, pitch_count),
            AtBatOutcome::InPlay => {
                return (
                    resolve_in_play_result(rng, batter, pitcher, bases, outs, fielding_lineup, tactics, high_leverage, conditions).outcome,
                    pitch_count,
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn avg_batter() -> BatterStats {
        BatterStats {
            id: "b".to_string(),
            contact: 50.0,
            eye: 50.0,
            power: 50.0,
            fatigue: 0.0,
            clutch: 50.0,
            composure: 50.0,
            defense: 50.0,
            speed: 50.0,
            handedness: crate::sim::match_sim::Handedness::Right,
            position: "유격수".to_string(),
        }
    }
    fn avg_pitcher() -> PitcherStats {
        PitcherStats {
            id: "p".to_string(),
            control: 50.0,
            stuff: 50.0,
            fatigue: 0.0,
            velocity: 50.0,
            game_management: 50.0,
            clutch: 50.0,
            composure: 50.0,
            handedness: crate::sim::match_sim::Handedness::Right,
        }
    }

    #[test]
    fn same_seed_produces_identical_pitch_result() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(1);
        let mut rng_b = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(
            throw_pitch(&mut rng_a, &avg_pitcher(), &avg_batter(), 0.0, 0.0, Power::Normal, false, 3, false, &GameConditions::default()),
            throw_pitch(&mut rng_b, &avg_pitcher(), &avg_batter(), 0.0, 0.0, Power::Normal, false, 3, false, &GameConditions::default())
        );
    }

    #[test]
    fn inside_courses_raise_hit_by_pitch_rate_for_wild_pitchers() {
        let wild = PitcherStats { id: "p".to_string(), control: 20.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: crate::sim::match_sim::Handedness::Right };
        let trials = 3000;
        let count_hbp = |x: f64, y: f64| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &wild, &avg_batter(), x, y, Power::Normal, false, 3, false, &GameConditions::default()) == PitchResult::HitByPitch {
                    hits += 1;
                }
            }
            hits
        };
        let inside = count_hbp(-1.0, 0.0);
        let outside = count_hbp(1.0, 0.0);
        assert!(inside > outside, "inside={inside} outside={outside}");
    }

    #[test]
    fn ball_zone_targets_beyond_the_strike_box_are_rarely_put_in_play() {
        // 볼 영역(|x|=|y|=1.8, 존 경계 훌쩍 넘음)을 노리면 존 진입 확률이
        // 거의 0에 수렴해(별도 "고의 볼" 분기 없이 edge_level 공식만으로)
        // 타자가 실제로 맞혀 인플레이가 되는 일이 한가운데를 노릴 때보다
        // 훨씬 드물어야 한다. 유인구에 헛스윙하는 것 자체는(PitchResult::
        // Strike) 존 밖에서도 실제 야구처럼 일어날 수 있어 그건 이 테스트의
        // 기준이 아니다 — "맞혀서 인플레이가 되는가"만 본다.
        let trials = 3000;
        let count_in_play = |x: f64, y: f64| -> usize {
            let mut in_play = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), x, y, Power::Normal, false, 3, false, &GameConditions::default()) == PitchResult::InPlay {
                    in_play += 1;
                }
            }
            in_play
        };
        let center = count_in_play(0.0, 0.0);
        let ball_zone = count_in_play(1.8, 1.8);
        assert!(ball_zone < center / 5, "center={center} ball_zone={ball_zone} (볼 영역이 훨씬 적어야 함)");
    }

    #[test]
    fn apply_pitch_result_resolves_strikeout_at_three_strikes() {
        let mut count = Count::default();
        assert_eq!(apply_pitch_result(&mut count, PitchResult::Strike), AtBatOutcome::InProgress);
        assert_eq!(apply_pitch_result(&mut count, PitchResult::Strike), AtBatOutcome::InProgress);
        assert_eq!(apply_pitch_result(&mut count, PitchResult::Strike), AtBatOutcome::Strikeout);
    }

    #[test]
    fn apply_pitch_result_resolves_walk_at_four_balls() {
        let mut count = Count::default();
        for _ in 0..3 {
            assert_eq!(apply_pitch_result(&mut count, PitchResult::Ball), AtBatOutcome::InProgress);
        }
        assert_eq!(apply_pitch_result(&mut count, PitchResult::Ball), AtBatOutcome::Walk);
    }

    #[test]
    fn foul_never_completes_the_third_strike() {
        let mut count = Count { balls: 0, strikes: 2 };
        for _ in 0..20 {
            assert_eq!(apply_pitch_result(&mut count, PitchResult::Foul), AtBatOutcome::InProgress);
        }
        assert_eq!(count.strikes, 2);
    }

    #[test]
    fn hit_by_pitch_and_in_play_resolve_immediately() {
        let mut count = Count { balls: 1, strikes: 1 };
        assert_eq!(apply_pitch_result(&mut count, PitchResult::HitByPitch), AtBatOutcome::HitByPitch);
        let mut count2 = Count { balls: 1, strikes: 1 };
        assert_eq!(apply_pitch_result(&mut count2, PitchResult::InPlay), AtBatOutcome::InPlay);
    }

    #[test]
    fn high_leverage_situation_flags_bases_loaded_or_late_and_close() {
        assert!(is_high_leverage_situation(true, 5, 1));
        assert!(is_high_leverage_situation(false, 0, 8));
        assert!(is_high_leverage_situation(false, 1, 9));
        assert!(!is_high_leverage_situation(false, 5, 3));
    }

    #[test]
    fn automatic_at_bat_terminates_and_produces_a_valid_outcome() {
        let pitches = vec![PitchMastery { name: "포심 패스트볼".to_string(), stage: 3 }, PitchMastery { name: "슬라이더".to_string(), stage: 3 }];
        for seed in 0..100u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let (outcome, pitch_count) =
                simulate_at_bat_automatically(&mut rng, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, &[], 50.0, false, &GameConditions::default());
            assert!((1..50).contains(&pitch_count), "unreasonable pitch count: {pitch_count}");
            assert!(matches!(
                outcome,
                PaOutcome::Strikeout
                    | PaOutcome::Walk
                    | PaOutcome::HitByPitch
                    | PaOutcome::Out
                    | PaOutcome::DoublePlay
                    | PaOutcome::SacFly
                    | PaOutcome::ReachOnError
                    | PaOutcome::Single
                    | PaOutcome::Double
                    | PaOutcome::Triple
                    | PaOutcome::HomeRun
            ));
        }
    }

    #[test]
    fn automatic_at_bat_is_deterministic_given_the_same_seed() {
        let pitches = vec![PitchMastery { name: "포심 패스트볼".to_string(), stage: 3 }];
        let mut rng_a = ChaCha8Rng::seed_from_u64(42);
        let mut rng_b = ChaCha8Rng::seed_from_u64(42);
        let a = simulate_at_bat_automatically(&mut rng_a, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, &[], 50.0, false, &GameConditions::default());
        let b = simulate_at_bat_automatically(&mut rng_b, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, &[], 50.0, false, &GameConditions::default());
        assert_eq!(a, b);
    }

    #[test]
    fn throw_pitch_clutch_only_shifts_outcomes_when_high_leverage_is_true() {
        let clutch_pitcher = PitcherStats { clutch: 80.0, ..avg_pitcher() };
        for seed in 0..30u64 {
            let mut rng_a = ChaCha8Rng::seed_from_u64(seed);
            let mut rng_b = ChaCha8Rng::seed_from_u64(seed);
            let a = throw_pitch(&mut rng_a, &clutch_pitcher, &avg_batter(), 0.0, 0.0, Power::Normal, false, 3, false, &GameConditions::default());
            let b = throw_pitch(&mut rng_b, &avg_pitcher(), &avg_batter(), 0.0, 0.0, Power::Normal, false, 3, false, &GameConditions::default());
            assert_eq!(a, b, "seed={seed}: high_leverage=false면 클러치가 결과에 개입하면 안 됨");
        }
    }

    #[test]
    fn a_fatigued_pitcher_walks_the_batter_more_often_than_a_fresh_one() {
        let fresh = PitcherStats { fatigue: 0.0, control: 30.0, ..avg_pitcher() };
        let tired = PitcherStats { fatigue: 100.0, control: 30.0, ..avg_pitcher() };
        let count_balls = |pitcher: &PitcherStats| -> u32 {
            let mut balls = 0;
            for seed in 0..2000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, pitcher, &avg_batter(), -1.0, 1.0, Power::Normal, false, 3, false, &GameConditions::default()) == PitchResult::Ball {
                    balls += 1;
                }
            }
            balls
        };
        let fresh_balls = count_balls(&fresh);
        let tired_balls = count_balls(&tired);
        assert!(tired_balls >= fresh_balls, "tired={tired_balls} fresh={fresh_balls}");
    }

    /// Phase 4 — 마스터리 단계가 높을수록(필살기=5) 습작(1)보다 헛스윙을
    /// 더 잘 유도해야 한다(§4 "개별 구종 위력... 피안타율·헛스윙에 직결").
    #[test]
    fn higher_mastery_stage_induces_more_whiffs() {
        let count_strikes = |stage: u8| -> u32 {
            let mut strikes = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), 0.0, 0.0, Power::Normal, false, stage, false, &GameConditions::default()) == PitchResult::Strike {
                    strikes += 1;
                }
            }
            strikes
        };
        let novice = count_strikes(1);
        let signature = count_strikes(5);
        assert!(signature > novice, "novice={novice} signature={signature}");
    }

    /// Phase 4 — 레퍼토리 다양성 보너스가 켜지면(3계열 골고루) 꺼졌을 때보다
    /// 헛스윙 확률이 소폭 더 높아야 한다(§4 "레퍼토리 조합 효과").
    #[test]
    fn repertoire_diversity_bonus_induces_more_whiffs() {
        let count_strikes = |diverse: bool| -> u32 {
            let mut strikes = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), 0.0, 0.0, Power::Normal, false, 3, diverse, &GameConditions::default()) == PitchResult::Strike {
                    strikes += 1;
                }
            }
            strikes
        };
        let without = count_strikes(false);
        let with = count_strikes(true);
        assert!(with > without, "without={without} with={with}");
    }

    #[test]
    fn repertoire_is_diverse_requires_all_three_pitch_families() {
        let two_families = vec![
            PitchMastery { name: "포심 패스트볼".to_string(), stage: 1 },
            PitchMastery { name: "슬라이더".to_string(), stage: 1 },
        ];
        assert!(!repertoire_is_diverse(&two_families));

        let three_families = vec![
            PitchMastery { name: "포심 패스트볼".to_string(), stage: 1 },
            PitchMastery { name: "슬라이더".to_string(), stage: 1 },
            PitchMastery { name: "체인지업".to_string(), stage: 1 },
        ];
        assert!(repertoire_is_diverse(&three_families));
    }

    /// Phase 4 좌우 상성(신규 설계) — 동타(투수·타자 같은 손)일수록
    /// 투수가 유리해 헛스윙을 더 잘 유도해야 한다.
    #[test]
    fn same_handed_matchup_favors_the_pitcher() {
        use crate::sim::match_sim::Handedness;
        let lefty_pitcher = PitcherStats { handedness: Handedness::Left, ..avg_pitcher() };
        let count_strikes = |batter_handedness: Handedness| -> u32 {
            let batter = BatterStats { handedness: batter_handedness, ..avg_batter() };
            let mut strikes = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &lefty_pitcher, &batter, 0.0, 0.0, Power::Normal, false, 3, false, &GameConditions::default()) == PitchResult::Strike {
                    strikes += 1;
                }
            }
            strikes
        };
        let same_side = count_strikes(Handedness::Left);
        let opposite_side = count_strikes(Handedness::Right);
        let switch = count_strikes(Handedness::Switch);
        assert!(same_side > opposite_side, "same={same_side} opposite={opposite_side}");
        assert!(same_side > switch, "same={same_side} switch={switch}");
    }

    /// 대화 2026-07-25 — 구위(강)는 위력↑ 대신 제구↓ 트레이드오프라 존
    /// 안에서 맞았을 때 헛스윙을 더 잘 유도해야 한다.
    #[test]
    fn high_power_induces_more_whiffs_than_low_power_when_in_zone() {
        let count_strikes = |power: Power| -> u32 {
            let mut strikes = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), 0.0, 0.0, power, false, 3, false, &GameConditions::default()) == PitchResult::Strike {
                    strikes += 1;
                }
            }
            strikes
        };
        let low = count_strikes(Power::Low);
        let high = count_strikes(Power::High);
        assert!(high > low, "low={low} high={high}");
    }

    /// 대화 2026-07-25 — 구위(약)는 제구↑ 대신 위력↓라 제구 나쁜 투수가
    /// 약하게 던지면 몸에 맞는 공이 줄어야 한다.
    #[test]
    fn low_power_reduces_hit_by_pitch_rate_for_a_control_challenged_pitcher() {
        let wild = PitcherStats { control: 20.0, ..avg_pitcher() };
        let count_hbp = |power: Power| -> u32 {
            let mut hits = 0;
            for seed in 0..3000u64 {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &wild, &avg_batter(), -1.0, 0.0, power, false, 3, false, &GameConditions::default()) == PitchResult::HitByPitch {
                    hits += 1;
                }
            }
            hits
        };
        let high = count_hbp(Power::High);
        let low = count_hbp(Power::Low);
        assert!(low <= high, "low={low} high={high}");
    }

    #[test]
    fn power_parse_round_trips_all_three_labels() {
        for power in Power::ALL {
            assert_eq!(Power::parse(power.label()), Some(power));
        }
        assert_eq!(Power::parse("모름"), None);
    }
}
