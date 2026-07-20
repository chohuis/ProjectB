use rand::Rng;

/// [05_히스토리_엔딩](../../../02_기획/05_히스토리_엔딩.md) §3 "노쇠·방출
/// 압박" — 정확한 위험 연령은 [05_밸런스] D그룹 미정 placeholder.
/// `sim::growth`의 하락 시작 나이(기본 30세)보다 한참 뒤로 잡아 "몇 년
/// 버티다 결국 자리가 없어진다"는 서사를 재현한다.
pub const AGING_RETIREMENT_RISK_AGE: i64 = 35;

/// `sim::injury::severity_weight`(경미1·중등3·중상8) 기준 — 중상 2회 누적
/// (8+8=16)이면 재기 불가로 판정하는 placeholder(§3 "부상으로 인한 강제
/// 은퇴", 정확한 기준은 미정).
pub const INJURY_RETIREMENT_WEIGHT_THRESHOLD: f64 = 16.0;

pub fn is_forced_retirement_from_injury(severity_weight_sum: f64) -> bool {
    severity_weight_sum >= INJURY_RETIREMENT_WEIGHT_THRESHOLD
}

/// 방출압박 은퇴 확률 — 위험연령을 넘긴 뒤로 나이가 들수록, 최근 성적이
/// 나쁠수록 상승한다. `avg_grade_score`는 06_시장_계약.md와 동일 척도
/// (F=0~S=5, 등판 기회가 없었으면 중간값 2.0=C로 취급).
pub fn decline_retirement_probability(age: i64, avg_grade_score: f64) -> f64 {
    if age < AGING_RETIREMENT_RISK_AGE {
        return 0.0;
    }
    let age_factor = ((age - AGING_RETIREMENT_RISK_AGE) as f64 * 0.15).min(0.6);
    let performance_factor = ((2.0 - avg_grade_score) / 2.0 * 0.3).max(0.0);
    (age_factor + performance_factor).clamp(0.0, 0.9)
}

pub fn is_forced_retirement_from_decline(rng: &mut impl Rng, age: i64, avg_grade_score: f64) -> bool {
    rng.gen_bool(decline_retirement_probability(age, avg_grade_score))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn injury_retirement_triggers_only_at_or_above_threshold() {
        assert!(!is_forced_retirement_from_injury(15.9));
        assert!(is_forced_retirement_from_injury(16.0));
        assert!(is_forced_retirement_from_injury(20.0));
    }

    #[test]
    fn decline_probability_is_zero_below_risk_age() {
        assert_eq!(decline_retirement_probability(34, 0.0), 0.0);
        assert_eq!(decline_retirement_probability(20, 5.0), 0.0);
    }

    #[test]
    fn decline_probability_increases_with_age_and_worse_performance() {
        let young_poor = decline_retirement_probability(AGING_RETIREMENT_RISK_AGE, 0.0);
        let old_poor = decline_retirement_probability(AGING_RETIREMENT_RISK_AGE + 10, 0.0);
        assert!(old_poor > young_poor);

        let same_age_great = decline_retirement_probability(AGING_RETIREMENT_RISK_AGE, 5.0);
        let same_age_poor = decline_retirement_probability(AGING_RETIREMENT_RISK_AGE, 0.0);
        assert!(same_age_poor > same_age_great);
    }

    #[test]
    fn decline_probability_stays_within_zero_and_one() {
        for age in 20..80 {
            for tenths in 0..=50 {
                let p = decline_retirement_probability(age, tenths as f64 / 10.0);
                assert!((0.0..=1.0).contains(&p), "age={age} p={p}");
            }
        }
    }

    #[test]
    fn is_forced_retirement_from_decline_is_deterministic_given_the_same_seed() {
        let mut rng1 = ChaCha8Rng::seed_from_u64(42);
        let mut rng2 = ChaCha8Rng::seed_from_u64(42);
        let a = is_forced_retirement_from_decline(&mut rng1, 40, 0.5);
        let b = is_forced_retirement_from_decline(&mut rng2, 40, 0.5);
        assert_eq!(a, b);
    }
}
