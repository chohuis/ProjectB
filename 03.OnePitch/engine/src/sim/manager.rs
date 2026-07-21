use rand::Rng;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::roster::{gen_name, pick_personality, PersonalityWeights};

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

/// 02_스태프_능력치.md §1 감독 나이대 — placeholder(리그별 구분 없음, 감독은
/// 어느 리그든 비슷한 연령대라는 단순화).
pub const MANAGER_AGE_RANGE: (i64, i64) = (40, 65);

/// `sim::roster::generate_team`과 대칭 — 팀당 감독 1명을 절차적으로 생성.
/// DB 접근 없는 순수 함수(단위 테스트 가능). `콘텐츠/01_캐릭터.md` §2
/// "완전 절차적, 직접 저작 없음"·§3 "역할·소속 가중 랜덤" 원칙을 그대로
/// 따른다 — `role:감독` personality_rules 컨텍스트가 팀 철학/위상 가중치와
/// 함께 `weights`에 이미 병합돼 들어온다는 전제(호출부 책임).
pub struct GeneratedManager {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub age: i64,
    pub personality: Value,
    pub stats: Value,
}

pub fn generate_manager(rng: &mut impl Rng, team_id: &str, kr_surnames: &[String], kr_given: &[String], weights: &PersonalityWeights) -> GeneratedManager {
    let (age_min, age_max) = MANAGER_AGE_RANGE;
    GeneratedManager {
        id: format!("manager:{team_id}"),
        name: gen_name(rng, kr_surnames, kr_given),
        team_id: team_id.to_string(),
        age: rng.gen_range(age_min..=age_max),
        personality: pick_personality(rng, weights),
        stats: json!({
            "전술력": rng.gen_range(20.0..=80.0),
            "신뢰형성력": rng.gen_range(20.0..=80.0),
            "육성안목": rng.gen_range(20.0..=80.0),
            "카리스마": rng.gen_range(20.0..=80.0),
        }),
    }
}

/// 관계도(-100~100) 변화 — 등급 평가 결과가 감독↔주인공 관계에 미치는
/// 영향(04_프로_커리어.md §Phase3 "좋은 성적이 관계도를 올리고"). 사기
/// 변화(`eval::morale_delta`)와 형태는 같지만 관계도 스케일에 맞춰 폭을
/// 훨씬 작게 잡았다 — 매 경기 결과가 관계를 급변시키면 안 됨. D그룹
/// placeholder, 정확한 폭은 I8 밸런스 하네스에서 재조정 대상.
pub fn relationship_delta_from_grade(grade: &str) -> i64 {
    match grade {
        "S" => 6,
        "A" => 3,
        "B" => 1,
        "C" => -1,
        "D" => -3,
        "F" => -6,
        _ => 0,
    }
}

/// 관계도 변화 — 감독 개입(§8) 투수 교체 판단에 플레이어가 동의/반대했을
/// 때("맡기기"는 반대가 아니므로 이 함수 호출 대상이 아님 — 호출부에서
/// 이미 제외).
pub fn relationship_delta_from_pull_agreement(agreed: bool) -> i64 {
    if agreed {
        2
    } else {
        -2
    }
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

    fn names() -> (Vec<String>, Vec<String>) {
        (vec!["김".to_string(), "이".to_string()], vec!["민준".to_string(), "서준".to_string()])
    }

    #[test]
    fn generate_manager_is_deterministic_given_the_same_seed() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng1 = ChaCha8Rng::seed_from_u64(42);
        let a = generate_manager(&mut rng1, "team:x", &surnames, &given, &weights);
        let mut rng2 = ChaCha8Rng::seed_from_u64(42);
        let b = generate_manager(&mut rng2, "team:x", &surnames, &given, &weights);
        assert_eq!(a.name, b.name);
        assert_eq!(a.stats, b.stats);
        assert_eq!(a.age, b.age);
    }

    #[test]
    fn generate_manager_id_is_stable_per_team() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let m = generate_manager(&mut rng, "team:seoul_sharks", &surnames, &given, &weights);
        assert_eq!(m.id, "manager:team:seoul_sharks");
        assert_eq!(m.team_id, "team:seoul_sharks");
    }

    #[test]
    fn generate_manager_stats_and_age_stay_within_documented_bands() {
        let (surnames, given) = names();
        let weights = PersonalityWeights::merge(&[]);
        let mut rng = ChaCha8Rng::seed_from_u64(7);
        for i in 0..50 {
            let m = generate_manager(&mut rng, &format!("team:{i}"), &surnames, &given, &weights);
            assert!((MANAGER_AGE_RANGE.0..=MANAGER_AGE_RANGE.1).contains(&m.age));
            for key in ["전술력", "신뢰형성력", "육성안목", "카리스마"] {
                let v = m.stats[key].as_f64().unwrap();
                assert!((20.0..=80.0).contains(&v), "{key}={v} out of band");
            }
        }
    }

    #[test]
    fn relationship_delta_from_grade_moves_in_the_expected_direction() {
        for pair in ["S", "A", "B", "C", "D", "F"].windows(2) {
            assert!(
                relationship_delta_from_grade(pair[0]) >= relationship_delta_from_grade(pair[1]),
                "relationship should not improve from a better grade to a worse one"
            );
        }
        assert!(relationship_delta_from_grade("S") > 0);
        assert!(relationship_delta_from_grade("F") < 0);
    }

    #[test]
    fn relationship_delta_from_pull_agreement_rewards_agreement() {
        assert!(relationship_delta_from_pull_agreement(true) > 0);
        assert!(relationship_delta_from_pull_agreement(false) < 0);
    }
}
