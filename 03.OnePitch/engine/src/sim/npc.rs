use rand::Rng;

/// 은퇴 확률 판정 — [01_커리어_구조](../../../02_기획/01_커리어_구조.md)의
/// 갈림길(진로 선택)은 근본적으로 주인공이 선택하는 서사 이벤트라
/// I6 이후 스코프(10_구현_Phase_계획.md §6-11 참고). NPC는 그런 선택을
/// 할 수 없으므로, `sim::roster::age_range`가 이미 갖고 있는 리그별
/// 적정 연령대 상한(`league_max_age`)에 가까워질수록 은퇴 확률이 커지는
/// 단순 곡선으로 대체한다 — 정확한 계수는 미확정 placeholder(다른 D그룹
/// 항목과 동급).
pub fn check_retirement(rng: &mut impl Rng, age: i64, league_max_age: i64) -> bool {
    let eligible_from = league_max_age - 5;
    if age < eligible_from {
        return false;
    }
    let over = (age - eligible_from) as f64;
    let prob = (over * 0.15).clamp(0.0, 0.9);
    rng.gen_bool(prob)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn no_retirement_well_below_league_max_age() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..100 {
            assert!(!check_retirement(&mut rng, 20, 40));
        }
    }

    #[test]
    fn retirement_becomes_likely_at_and_past_league_max_age() {
        let trials = 200;
        let mut hits = 0;
        for seed in 0..trials {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            if check_retirement(&mut rng, 42, 40) {
                hits += 1;
            }
        }
        assert!(hits > 0, "expected some retirements at/past league max age");
    }

    #[test]
    fn same_seed_produces_identical_result() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(9);
        let mut rng_b = ChaCha8Rng::seed_from_u64(9);
        assert_eq!(check_retirement(&mut rng_a, 41, 40), check_retirement(&mut rng_b, 41, 40));
    }

    #[test]
    fn older_players_retire_more_often_than_barely_eligible_ones() {
        let trials = 300;
        let count = |age: i64| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if check_retirement(&mut rng, age, 40) {
                    hits += 1;
                }
            }
            hits
        };
        let barely = count(36);
        let ancient = count(45);
        assert!(ancient > barely, "ancient={ancient} barely={barely}");
    }
}
