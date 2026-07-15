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

/// 강제입영 나이 — [03_병역](../../../02_기획/03_병역.md) §9 "일정 시점
/// (만 28세 상당)까지 세 경로(면제/상무/현역) 중 하나를 선택하지 않으면
/// 강제 이벤트... 현역 복무로 자동 편입". NPC는 §1 "타이밍 = 플레이어
/// 유연 선택"을 할 수 없어(면제·상무는 각각 국대 발탁·성적 상위 선발이
/// 필요한 특별 경로라 감독 AI·평가 시스템이 갖춰진 뒤로 미룸 —
/// 10_구현_Phase_계획.md §6-12) §9의 강제편입 기본 경로(현역)만 재현한다.
/// 정확한 나이는 §9 "스탯 스케일 확정 후"라 placeholder.
pub const MILITARY_MIN_AGE: i64 = 28;

/// 복무 기간(일) — §2 "현역/사회복무... ~1.5~2년 공백"의 중간값 placeholder
/// (1시즌=364일 기준 약 1.7년). §10 "정확한 하락률·회복 기간은 스탯 스케일
/// 확정 후".
pub const MILITARY_SERVICE_DAYS: i64 = 630;

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
