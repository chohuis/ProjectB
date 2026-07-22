//! [02_스태프_능력치](../../../02_기획/육성코어/02_스태프_능력치.md) —
//! 코치 7종·구단주 3종. `sim::manager`(감독)와 같은 절차적 생성 패턴이지만
//! 이 모듈은 그 위에 **효과 계산 함수**까지 담는다 — 코치·구단주는
//! 감독과 달리 여러 지점(훈련·구종습득·평가·NPC 성장·신인생성·계약)에
//! 보정을 준다.
//!
//! **1차 축소안**(대화 2026-07-22): 기획 원안은 코치가 팀당 0~8명(자원·
//! 리그별 가변)에 적성배치·미스매치·복수배치 판정까지 있는 미니 스태프
//! 시뮬레이션이지만, 이번엔 **코치·구단주 각각 팀당 1명 고정**으로
//! 단순화했다 — 그 대신 능력치 10개 전부를 실제 효과에 연결한다(감독처럼
//! "생성만 되고 안 쓰이는" 스탯을 안 남긴다는 원칙).
//!
//! 여기 함수들은 전부 **D그룹 placeholder**(정확한 계수는 05_밸런스.md에
//! 없음) — I8 밸런스 하네스 재조정 대상.

use rand::Rng;
use serde_json::{json, Value};

use super::roster::{gen_name, pick_personality, PersonalityWeights};

/// 스태프 나이대 — 감독과 동일 근사(`sim::manager::MANAGER_AGE_RANGE`),
/// 리그별 구분 없음.
pub const STAFF_AGE_RANGE: (i64, i64) = (35, 65);

pub struct GeneratedCoach {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub age: i64,
    pub personality: Value,
    pub stats: Value,
}

pub struct GeneratedOwner {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub age: i64,
    pub personality: Value,
    pub stats: Value,
}

/// `sim::manager::generate_manager`와 대칭 — 팀당 코치 1명. `role:코치`
/// personality_rules 컨텍스트가 이미 시드돼 있음(`data/seed/personality_rules.toml`).
pub fn generate_coach(rng: &mut impl Rng, team_id: &str, kr_surnames: &[String], kr_given: &[String], weights: &PersonalityWeights) -> GeneratedCoach {
    let (age_min, age_max) = STAFF_AGE_RANGE;
    GeneratedCoach {
        id: format!("coach:{team_id}"),
        name: gen_name(rng, kr_surnames, kr_given),
        team_id: team_id.to_string(),
        age: rng.gen_range(age_min..=age_max),
        personality: pick_personality(rng, weights),
        stats: json!({
            "투수지도력": rng.gen_range(20.0..=80.0),
            "타격지도력": rng.gen_range(20.0..=80.0),
            "주루지도력": rng.gen_range(20.0..=80.0),
            "컨디셔닝": rng.gen_range(20.0..=80.0),
            "멘탈코칭": rng.gen_range(20.0..=80.0),
            "스카우팅안목": rng.gen_range(20.0..=80.0),
            "종합지도력": rng.gen_range(20.0..=80.0),
        }),
    }
}

/// 팀당 구단주 1명. `role:구단주` personality_rules 컨텍스트도 이미 시드돼
/// 있음.
pub fn generate_owner(rng: &mut impl Rng, team_id: &str, kr_surnames: &[String], kr_given: &[String], weights: &PersonalityWeights) -> GeneratedOwner {
    let (age_min, age_max) = STAFF_AGE_RANGE;
    GeneratedOwner {
        id: format!("owner:{team_id}"),
        name: gen_name(rng, kr_surnames, kr_given),
        team_id: team_id.to_string(),
        age: rng.gen_range(age_min..=age_max),
        personality: pick_personality(rng, weights),
        stats: json!({
            "재력": rng.gen_range(20.0..=80.0),
            "투자성향": rng.gen_range(20.0..=80.0),
            "인내심": rng.gen_range(20.0..=80.0),
        }),
    }
}

/// 주인공 훈련 genius 보정(투수지도력+종합지도력) — `sim::training`을
/// 안 건드리고 호출부(`process_protagonist_week`)가 `genius` 입력값에
/// 이 델타를 더해서 넘긴다.
pub fn coach_genius_bonus(specialized: f64, general: f64) -> f64 {
    ((specialized - 50.0) * 0.15 + (general - 50.0) * 0.1).clamp(-10.0, 15.0)
}

/// NPC 주간 성장(`process_week`)의 focus 배율 — 포지션에 맞는 전문 능력치
/// (투수면 투수지도력, 타자면 타격지도력)를 `specialized`로 받고,
/// `stat=="스피드"`일 때만 주루지도력을 추가 반영한다("타자 스피드 성장"
/// 은 주루코치 전담, 02_스태프_능력치.md §2-1).
pub fn coach_growth_focus(stat: &str, specialized: f64, general: f64, running: f64) -> f64 {
    let base = 1.0 + (specialized - 50.0) * 0.006 + (general - 50.0) * 0.003;
    let extra = if stat == "스피드" { (running - 50.0) * 0.006 } else { 0.0 };
    (base + extra).clamp(0.6, 1.6)
}

/// 신규 구종 습득 소요 주수 감산(0~3주) — 코치 없음/평균 이하는 0(불이익
/// 없음, "하드락 아님" 05_구종_시스템.md §3), 우수한 코치만 단축.
pub fn coach_pitch_learning_bonus(투수지도력: f64) -> i64 {
    (((투수지도력 - 50.0) / 15.0).floor().max(0.0) as i64).min(3)
}

/// 경기 평가(`grade_outing`)의 `own_skill` 가산치.
pub fn coach_eval_bonus(투수지도력: f64) -> f64 {
    ((투수지도력 - 50.0) * 0.1).clamp(-5.0, 5.0)
}

/// 부상 확률 계산 전 `fatigue`에 곱하는 컨디셔닝 배율 — 좋은 컨디셔닝
/// 코치는 <1.0(체감 피로도 감소), 나쁘면 >1.0.
pub fn coach_conditioning_factor(컨디셔닝: f64) -> f64 {
    (1.0 - (컨디셔닝 - 50.0) * 0.006).clamp(0.7, 1.3)
}

/// 사기 하락폭 완화 배율 — 평균 이상 멘탈코칭만 나쁜 등급의 사기 하락을
/// 줄여준다(호출부가 델타가 음수일 때만 곱함). 평균 이하는 증폭 없이
/// 1.0(추가 불이익 없음).
pub fn coach_mental_dampening(멘탈코칭: f64) -> f64 {
    (1.0 - (멘탈코칭 - 50.0).max(0.0) * 0.01).clamp(0.5, 1.0)
}

/// 신인 생성 스탯 구간(`stat_min`/`stat_max`) 가산치 — 평균 이상
/// 스카우팅안목만 유망주 풀을 넓힌다(하한 상향 없음, 나쁜 스카우트가
/// 풀을 좁히진 않음).
pub fn scouting_stat_bonus(스카우팅안목: f64) -> f64 {
    ((스카우팅안목 - 50.0) * 0.1).clamp(0.0, 3.0)
}

/// 방출 확률(`sim::market::release_probability`) 곱셈 계수 — 인내심
/// 높을수록 <1.0(방출 덜 함).
pub fn owner_patience_factor(인내심: f64) -> f64 {
    (1.0 - (인내심 - 50.0) * 0.006).clamp(0.7, 1.3)
}

/// 재계약 오퍼(`sim::market::initial_offer`) 곱셈 계수 — 재력·투자성향이
/// 높을수록 더 공격적인 오퍼.
pub fn owner_offer_multiplier(재력: f64, 투자성향: f64) -> f64 {
    (1.0 + (재력 - 50.0) * 0.004 + (투자성향 - 50.0) * 0.003).clamp(0.85, 1.25)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn names() -> (Vec<String>, Vec<String>) {
        (vec!["김".to_string(), "이".to_string()], vec!["민준".to_string(), "서준".to_string()])
    }

    #[test]
    fn generate_coach_is_deterministic_given_the_same_seed() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng1 = ChaCha8Rng::seed_from_u64(42);
        let a = generate_coach(&mut rng1, "team:x", &surnames, &given, &weights);
        let mut rng2 = ChaCha8Rng::seed_from_u64(42);
        let b = generate_coach(&mut rng2, "team:x", &surnames, &given, &weights);
        assert_eq!(a.name, b.name);
        assert_eq!(a.stats, b.stats);
        assert_eq!(a.age, b.age);
    }

    #[test]
    fn generate_coach_id_is_stable_per_team_and_stats_within_band() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let c = generate_coach(&mut rng, "team:seoul_sharks", &surnames, &given, &weights);
        assert_eq!(c.id, "coach:team:seoul_sharks");
        for key in ["투수지도력", "타격지도력", "주루지도력", "컨디셔닝", "멘탈코칭", "스카우팅안목", "종합지도력"] {
            let v = c.stats[key].as_f64().unwrap();
            assert!((20.0..=80.0).contains(&v), "{key}={v} out of band");
        }
    }

    #[test]
    fn generate_owner_id_is_stable_per_team_and_stats_within_band() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let o = generate_owner(&mut rng, "team:seoul_sharks", &surnames, &given, &weights);
        assert_eq!(o.id, "owner:team:seoul_sharks");
        for key in ["재력", "투자성향", "인내심"] {
            let v = o.stats[key].as_f64().unwrap();
            assert!((20.0..=80.0).contains(&v), "{key}={v} out of band");
        }
    }

    #[test]
    fn coach_genius_bonus_increases_with_specialized_and_general() {
        let low = coach_genius_bonus(20.0, 20.0);
        let high = coach_genius_bonus(80.0, 80.0);
        assert!(high > low);
    }

    #[test]
    fn coach_growth_focus_gives_speed_extra_boost_only_for_speed_stat() {
        let speed = coach_growth_focus("스피드", 50.0, 50.0, 80.0);
        let other = coach_growth_focus("파워", 50.0, 50.0, 80.0);
        assert!(speed > other, "speed={speed} other={other}");
    }

    #[test]
    fn coach_pitch_learning_bonus_never_penalizes_below_average_coaches() {
        assert_eq!(coach_pitch_learning_bonus(20.0), 0);
        assert_eq!(coach_pitch_learning_bonus(50.0), 0);
        assert!(coach_pitch_learning_bonus(80.0) > 0);
        assert!(coach_pitch_learning_bonus(80.0) <= 3);
    }

    #[test]
    fn coach_conditioning_factor_reduces_effective_fatigue_for_good_coaching() {
        assert!(coach_conditioning_factor(80.0) < 1.0);
        assert!(coach_conditioning_factor(20.0) > 1.0);
    }

    #[test]
    fn coach_mental_dampening_only_helps_above_average_and_never_amplifies() {
        assert_eq!(coach_mental_dampening(20.0), 1.0);
        assert_eq!(coach_mental_dampening(50.0), 1.0);
        assert!(coach_mental_dampening(80.0) < 1.0);
    }

    #[test]
    fn scouting_stat_bonus_never_shrinks_the_pool() {
        assert_eq!(scouting_stat_bonus(20.0), 0.0);
        assert!(scouting_stat_bonus(80.0) > 0.0);
    }

    #[test]
    fn owner_patience_factor_reduces_release_probability_for_patient_owners() {
        assert!(owner_patience_factor(80.0) < 1.0);
        assert!(owner_patience_factor(20.0) > 1.0);
    }

    #[test]
    fn owner_offer_multiplier_increases_with_wealth_and_aggressiveness() {
        let low = owner_offer_multiplier(20.0, 20.0);
        let high = owner_offer_multiplier(80.0, 80.0);
        assert!(high > low);
    }
}
