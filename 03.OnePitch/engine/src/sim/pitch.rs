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

/// 스트라이크존 3×3 그리드(9분할) — [07_매치_엔진](../../../02_기획/육성코어/07_매치_엔진.md)
/// §5 "코스 선택: 스트라이크존 3×3 그리드(9분할)". 주인공 등판 매치
/// 세션(§3)의 1구 조작 전용 — 기존 PA레벨 배경 시뮬(`match_sim::simulate_plate_appearance`)
/// 은 안 건드림(둘 다 남겨두는 이유는 이 파일 최상단 모듈 주석 참고).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Course {
    HighInside,
    HighCenter,
    HighOutside,
    MidInside,
    MidCenter,
    MidOutside,
    LowInside,
    LowCenter,
    LowOutside,
}

impl Course {
    pub const ALL: [Course; 9] = [
        Course::HighInside,
        Course::HighCenter,
        Course::HighOutside,
        Course::MidInside,
        Course::MidCenter,
        Course::MidOutside,
        Course::LowInside,
        Course::LowCenter,
        Course::LowOutside,
    ];

    /// 4개 구석 코스 — AI 유인구 선택(§3)이 여기서 고른다.
    pub const CORNERS: [Course; 4] = [Course::HighInside, Course::HighOutside, Course::LowInside, Course::LowOutside];

    /// 이름(예: "MidCenter")으로 코스를 찾는다 — `data::match_session`이
    /// 플레이어의 선택(문자열로 직렬화된 pending action 응답)을 파싱할 때 씀.
    pub fn parse(name: &str) -> Option<Course> {
        Course::ALL.into_iter().find(|c| format!("{c:?}") == name)
    }

    /// 몸쪽(안쪽 열) 여부 — §5 "사구 확률... 코스가 3×3 그리드의 몸쪽
    /// (안쪽 열)일수록↑".
    fn is_inside(self) -> bool {
        matches!(self, Course::HighInside | Course::MidInside | Course::LowInside)
    }

    /// 존 중앙에서 얼마나 먼가(0.0=정중앙, 1.0=구석) — 존 판정 난이도·
    /// 컨택 난이도 둘 다에 쓰는 placeholder 축.
    fn edge_level(self) -> f64 {
        match self {
            Course::MidCenter => 0.0,
            Course::HighCenter | Course::LowCenter | Course::MidInside | Course::MidOutside => 0.5,
            _ => 1.0,
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
/// 더한다.
#[allow(clippy::too_many_arguments)]
pub fn throw_pitch(
    rng: &mut impl Rng,
    pitcher: &PitcherStats,
    batter: &BatterStats,
    course: Course,
    high_leverage: bool,
    mastery_stage: u8,
    repertoire_diverse: bool,
    conditions: &GameConditions,
) -> PitchResult {
    let edge = course.edge_level();
    let effective_control = fatigue_effective(pitcher.control, pitcher.fatigue) + conditions.weather_control_mod;
    let effective_stuff = fatigue_effective(pitcher.stuff, pitcher.fatigue);

    // 사구 — §5 "제구 낮을수록↑, 몸쪽일수록↑".
    let control_deficit = (50.0 - effective_control).max(0.0) * 0.0006;
    let inside_bonus = if course.is_inside() { 0.01 } else { 0.0 };
    let hbp_prob = (0.01 + control_deficit + inside_bonus).clamp(0.0, 0.15);
    if rng.gen::<f64>() < hbp_prob {
        return PitchResult::HitByPitch;
    }

    // 스트라이크존 통과 여부 — 구석일수록 존 밖으로 빠질 확률↑, 제구
    // 좋을수록 원하는 위치(존 안)에 더 잘 넣음. 경기운영도 소폭 거든다
    // (§10 "경기운영 = 적은 구수로 아웃 잡는 능력"의 일부로 해석).
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
        let whiff_prob = clamp01(0.4 + edge * 0.3 - (batter.contact - 50.0) * 0.003 + (pitcher.velocity - 50.0) * 0.001);
        return if rng.gen::<f64>() < whiff_prob { PitchResult::Strike } else { PitchResult::Foul };
    }

    // 존 안 — 구석에 걸칠수록(edge↑) 맞히기 어려움. 구속은 구위와 별개로
    // 순수 헛스윙 유발력을 더한다. 위기상황에선 클러치 대결. 마스터리
    // 단계(Phase 4)는 3(실전)을 기준점으로 단계당 ±2.5, 좌우 상성(Phase 4)은
    // `platoon_edge_for_pitcher` 공유 계산. D그룹 placeholder(계수는 I8
    // 재조정 대상).
    let mastery_bonus = (mastery_stage as f64 - 3.0) * 2.5;
    let mut contact_edge = (effective_stuff + edge * 20.0 + (pitcher.velocity - 50.0) * 0.3) - batter.contact + mastery_bonus;
    contact_edge += platoon_edge_for_pitcher(pitcher.handedness, batter.handedness);
    if high_leverage {
        contact_edge += (pitcher.clutch - batter.clutch) * 3.0;
    }
    // 레퍼토리 다양성 보너스(Phase 4, §4) — 3계열 골고루 보유한 투수는
    // 타자가 다음 구종을 예측하기 어려워 코스와 무관하게 헛스윙 확률이
    // 소폭 오른다.
    let diversity_bonus = if repertoire_diverse { 0.02 } else { 0.0 };
    let whiff_prob = clamp01(0.15 + contact_edge * 0.004 + diversity_bonus);
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

/// 자동 모드(§3) AI의 구종·코스 대리 선택 — "가벼운 휴리스틱... 위기상황
/// 일수록 유인구(구석 코스) 비중↑, 강타자 상대일수록 정면승부 비중↓"를
/// 그대로 반영. 구종은 보유 구종 중 균등 랜덤(마스터리에 따른 가중 선구는
/// 스코프 밖 — 어떤 구종을 던지든 `throw_pitch`가 그 구종의 마스터리
/// 단계를 실제로 반영하는 게 이번 Phase 4의 핵심이라, "어떤 구종을 고를지"
/// 자체는 안 건드림).
pub fn choose_pitch_and_course(rng: &mut impl Rng, pitches: &[PitchMastery], batter: &BatterStats, high_leverage: bool) -> (PitchMastery, Course) {
    let pitch = pitches.choose(rng).cloned().unwrap_or(PitchMastery { name: "포심 패스트볼".to_string(), stage: 1 });

    let strong_batter = batter.power >= 60.0;
    let lure_bias = (if high_leverage { 0.3 } else { 0.0 }) + (if strong_batter { 0.2 } else { 0.0 });
    let course = if rng.gen::<f64>() < lure_bias {
        *Course::CORNERS.choose(rng).unwrap()
    } else {
        *Course::ALL.choose(rng).unwrap()
    };
    (pitch, course)
}

/// 완전 자동(§3 "자동" 모드) 방식으로 한 타석을 끝까지 진행 — 매 구
/// `choose_pitch_and_course`로 AI가 구종·코스를 고르고 `throw_pitch`로
/// 판정, `apply_pitch_result`로 카운트에 반영해 삼진/볼넷/사구/인플레이
/// 중 하나가 나올 때까지 반복(인플레이면 `resolve_in_play_result`로 세분화
/// 까지 마침). 반환 타입을 `match_sim::PaOutcome`으로 통일해 호출부가
/// 배경 시뮬과 같은 결과 처리 로직(주자 진루 등)을 그대로 재사용하게 한다.
/// 수동·반자동 모드(플레이어가 직접/가끔 구종·코스를 고름)는 `throw_pitch`
/// ·`apply_pitch_result`를 그대로 재사용하되 세션 상태를 slot.db에 유지해야
/// 해서 별도 서브분 스코프(10_구현_Phase_계획.md 참고). `bases`·`outs`·
/// `team_defense`(Phase 2)·`tactics`·`conditions`(Phase 5)는 인플레이로
/// 이어질 때 `resolve_in_play_result`에 그대로 전달.
#[allow(clippy::too_many_arguments)]
pub fn simulate_at_bat_automatically(
    rng: &mut impl Rng,
    pitches: &[PitchMastery],
    pitcher: &PitcherStats,
    batter: &BatterStats,
    bases: [bool; 3],
    outs: u32,
    team_defense: f64,
    tactics: f64,
    high_leverage: bool,
    conditions: &GameConditions,
) -> (PaOutcome, u32) {
    let mut count = Count::default();
    let mut pitch_count = 0u32;
    let diverse = repertoire_is_diverse(pitches);
    loop {
        let (pitch, course) = choose_pitch_and_course(rng, pitches, batter, high_leverage);
        let result = throw_pitch(rng, pitcher, batter, course, high_leverage, pitch.stage, diverse, conditions);
        pitch_count += 1;
        match apply_pitch_result(&mut count, result) {
            AtBatOutcome::InProgress => continue,
            AtBatOutcome::Strikeout => return (PaOutcome::Strikeout, pitch_count),
            AtBatOutcome::Walk => return (PaOutcome::Walk, pitch_count),
            AtBatOutcome::HitByPitch => return (PaOutcome::HitByPitch, pitch_count),
            AtBatOutcome::InPlay => {
                return (
                    resolve_in_play_result(rng, batter, pitcher, bases, outs, team_defense, tactics, high_leverage, conditions),
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
            throw_pitch(&mut rng_a, &avg_pitcher(), &avg_batter(), Course::MidCenter, false, 3, false, &GameConditions::default()),
            throw_pitch(&mut rng_b, &avg_pitcher(), &avg_batter(), Course::MidCenter, false, 3, false, &GameConditions::default())
        );
    }

    #[test]
    fn inside_courses_raise_hit_by_pitch_rate_for_wild_pitchers() {
        let wild = PitcherStats { id: "p".to_string(), control: 20.0, stuff: 50.0, fatigue: 0.0, velocity: 50.0, game_management: 50.0, clutch: 50.0, composure: 50.0, handedness: crate::sim::match_sim::Handedness::Right };
        let trials = 3000;
        let count_hbp = |course: Course| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if throw_pitch(&mut rng, &wild, &avg_batter(), course, false, 3, false, &GameConditions::default()) == PitchResult::HitByPitch {
                    hits += 1;
                }
            }
            hits
        };
        let inside = count_hbp(Course::MidInside);
        let outside = count_hbp(Course::MidOutside);
        assert!(inside > outside, "inside={inside} outside={outside}");
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
                simulate_at_bat_automatically(&mut rng, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, 50.0, 50.0, false, &GameConditions::default());
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
        let a = simulate_at_bat_automatically(&mut rng_a, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, 50.0, 50.0, false, &GameConditions::default());
        let b = simulate_at_bat_automatically(&mut rng_b, &pitches, &avg_pitcher(), &avg_batter(), [false; 3], 0, 50.0, 50.0, false, &GameConditions::default());
        assert_eq!(a, b);
    }

    #[test]
    fn throw_pitch_clutch_only_shifts_outcomes_when_high_leverage_is_true() {
        let clutch_pitcher = PitcherStats { clutch: 80.0, ..avg_pitcher() };
        for seed in 0..30u64 {
            let mut rng_a = ChaCha8Rng::seed_from_u64(seed);
            let mut rng_b = ChaCha8Rng::seed_from_u64(seed);
            let a = throw_pitch(&mut rng_a, &clutch_pitcher, &avg_batter(), Course::MidCenter, false, 3, false, &GameConditions::default());
            let b = throw_pitch(&mut rng_b, &avg_pitcher(), &avg_batter(), Course::MidCenter, false, 3, false, &GameConditions::default());
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
                if throw_pitch(&mut rng, pitcher, &avg_batter(), Course::HighInside, false, 3, false, &GameConditions::default()) == PitchResult::Ball {
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
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), Course::MidCenter, false, stage, false, &GameConditions::default()) == PitchResult::Strike {
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
                if throw_pitch(&mut rng, &avg_pitcher(), &avg_batter(), Course::MidCenter, false, 3, diverse, &GameConditions::default()) == PitchResult::Strike {
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
                if throw_pitch(&mut rng, &lefty_pitcher, &batter, Course::MidCenter, false, 3, false, &GameConditions::default()) == PitchResult::Strike {
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
}
