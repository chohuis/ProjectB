use rand::Rng;
use sha2::{Digest, Sha256};

/// 팀별 감독 전술력·신뢰형성력(02_스태프_능력치.md §1) — 투수 교체 판단에
/// 쓰이는 2개만, 정식 스태프 시스템(content.db 시딩)이 생기기 전까지
/// team_id 해시 기반으로 결정론적으로 근사(20~80 스케일, 01_선수_능력치.md
/// §7 표준). 같은 팀은 게임 내내(그리고 재실행해도) 항상 같은 값 — 별도
/// 시드·DB 접근 불필요.
pub struct ManagerStats {
    pub tactics: f64,
    pub trust: f64,
}

pub fn manager_stats(team_id: &str) -> ManagerStats {
    ManagerStats { tactics: hashed_stat(team_id, "tactics"), trust: hashed_stat(team_id, "trust") }
}

fn hashed_stat(team_id: &str, salt: &str) -> f64 {
    let mut hasher = Sha256::new();
    hasher.update(team_id.as_bytes());
    hasher.update(salt.as_bytes());
    let digest = hasher.finalize();
    let raw = u32::from_le_bytes(digest[0..4].try_into().unwrap());
    20.0 + (raw % 61) as f64 // 20~80
}

/// 투수 교체 판단(07_매치_엔진.md §8) — 정교한 확률식이 아니라 소프트캡·
/// 하드캡 사이를 선형 보간하는 임계값 로직(정확한 계수는 다른 D그룹
/// 상수들처럼 I8 밸런스 하네스에서 확정 예정, 지금은 placeholder).
/// tactics가 높을수록(적극적 운영) 캡을 살짝 당기고, trust가 높을수록
/// (신뢰) 살짝 늦춘다. 하드캡 이상은 항상 강판.
const SOFT_CAP: f64 = 90.0;
const HARD_CAP: f64 = 120.0;

/// 강판 확률(0.0~1.0) — 소프트캡 미만은 0.0(고려 대상조차 아님), 하드캡
/// 이상은 1.0(무조건). 수동 모드(§8 "이닝 종료마다 판단 기회")가 "AI라면
/// 지금 고려라도 해볼 구간인가"를 RNG 없이 물을 수 있도록 `should_pull_pitcher`
/// 에서 분리했다 — 이 함수 자체는 순수 계산, 굴리는 건 호출부 책임.
pub fn pull_probability(pitches_thrown: u32, fatigue: f64, tactics: f64, trust: f64) -> f64 {
    let cap_shift = (tactics - 50.0) * -0.15 + (trust - 50.0) * 0.1;
    let fatigue_shift = -(fatigue - 30.0).max(0.0) * 0.3;
    let soft = (SOFT_CAP + cap_shift + fatigue_shift).max(60.0);
    let hard = (HARD_CAP + cap_shift + fatigue_shift).max(soft + 10.0);

    let pitches = pitches_thrown as f64;
    if pitches >= hard {
        return 1.0;
    }
    if pitches < soft {
        return 0.0;
    }
    ((pitches - soft) / (hard - soft)).clamp(0.0, 1.0)
}

pub fn should_pull_pitcher(rng: &mut impl Rng, pitches_thrown: u32, fatigue: f64, tactics: f64, trust: f64) -> bool {
    let p = pull_probability(pitches_thrown, fatigue, tactics, trust);
    if p >= 1.0 {
        return true;
    }
    if p <= 0.0 {
        return false;
    }
    rng.gen_bool(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn manager_stats_are_deterministic_and_in_range() {
        let a = manager_stats("team:hs:001");
        let b = manager_stats("team:hs:001");
        assert_eq!(a.tactics, b.tactics);
        assert_eq!(a.trust, b.trust);
        assert!((20.0..=80.0).contains(&a.tactics));
        assert!((20.0..=80.0).contains(&a.trust));
    }

    #[test]
    fn different_teams_usually_get_different_stats() {
        let a = manager_stats("team:hs:001");
        let b = manager_stats("team:hs:002");
        assert!(a.tactics != b.tactics || a.trust != b.trust);
    }

    #[test]
    fn below_soft_cap_never_pulls() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..100 {
            assert!(!should_pull_pitcher(&mut rng, 50, 20.0, 50.0, 50.0));
        }
    }

    #[test]
    fn at_or_above_hard_cap_always_pulls() {
        let mut rng = ChaCha8Rng::seed_from_u64(2);
        for _ in 0..100 {
            assert!(should_pull_pitcher(&mut rng, 130, 20.0, 50.0, 50.0));
        }
    }

    #[test]
    fn pull_probability_is_zero_below_soft_cap() {
        assert_eq!(pull_probability(50, 20.0, 50.0, 50.0), 0.0);
    }

    #[test]
    fn pull_probability_is_one_at_or_above_hard_cap() {
        assert_eq!(pull_probability(130, 20.0, 50.0, 50.0), 1.0);
        assert_eq!(pull_probability(200, 20.0, 50.0, 50.0), 1.0);
    }

    #[test]
    fn pull_probability_increases_monotonically_between_caps() {
        let at_95 = pull_probability(95, 20.0, 50.0, 50.0);
        let at_110 = pull_probability(110, 20.0, 50.0, 50.0);
        assert!(at_95 > 0.0 && at_95 < 1.0);
        assert!(at_110 > at_95, "at_95={at_95} at_110={at_110}");
    }

    #[test]
    fn higher_tactics_pulls_more_often_between_caps() {
        let trials = |tactics: f64| -> usize {
            let mut rng = ChaCha8Rng::seed_from_u64(3);
            (0..500).filter(|_| should_pull_pitcher(&mut rng, 100, 20.0, tactics, 50.0)).count()
        };
        let aggressive = trials(80.0);
        let passive = trials(20.0);
        assert!(aggressive > passive, "aggressive={aggressive} passive={passive}");
    }
}
