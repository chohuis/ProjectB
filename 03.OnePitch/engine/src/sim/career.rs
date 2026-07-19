//! [01_커리어_구조](../../../02_기획/01_커리어_구조.md) §5 갈림길A(고교
//! 졸업 — 프로 지명/대학/독립/입대) · [02_아마_고교](../../../02_기획/02_아마_고교.md)
//! §D(드래프트·주목도). 갈림길B(FA/트레이드/잔류)는 이미 `sim::market`이
//! 다룬다 — 이 모듈은 A만.

use rand::seq::SliceRandom;
use rand::Rng;

/// 고교 졸업(드래프트) 시점의 나이 — §A-1 "고교 1학년, 17세"로 시작해
/// 매 시즌 경계 +1(`process_protagonist_career_path` 참고), 3학년을
/// 마치면 20세가 된다.
pub const HS_GRADUATION_AGE: i64 = 20;

/// 드래프트 지명 확률 — §D "주목도 → 라운드·픽 순위(상위=계약금·기대↑)".
/// "라운드 수·계약금 정확한 조건은 열린 세부"(§F)라 등급 성과+주목도
/// 종합으로 근사한 단순 확률 placeholder.
pub fn draft_probability(avg_grade_score: f64, attention: f64) -> f64 {
    let performance = (avg_grade_score / 5.0).clamp(0.0, 1.0); // 0(F)~1(S)
    let attention_factor = (attention / 500.0).clamp(0.0, 1.0);
    (0.1 + performance * 0.5 + attention_factor * 0.3).clamp(0.05, 0.9)
}

pub fn is_drafted(rng: &mut impl Rng, avg_grade_score: f64, attention: f64) -> bool {
    rng.gen_bool(draft_probability(avg_grade_score, attention))
}

/// 지명 시 초기 연봉 — §F "계약금 정확한 수치는 열린 세부"라 성과·주목도
/// 비례 placeholder(06_시장_계약.md의 재계약/FA 공식과는 독립적인 신인
/// 계약 전용 산식).
pub fn draft_initial_salary(avg_grade_score: f64, attention: f64) -> i64 {
    let base = 3000.0;
    (base * (1.0 + avg_grade_score / 5.0 + attention / 1000.0)).round() as i64
}

/// 후보 팀 중 무작위 하나 — 드래프트 지명팀·대학/독립 진학 시 배정팀
/// 선택에 공용으로 쓰는 placeholder(팀별 정확한 지명 확률·니즈 기반
/// 선택은 §F "라운드·픽 조건 열린 세부"라 균등 랜덤으로 단순화).
pub fn pick_team<'a>(rng: &mut impl Rng, teams: &'a [String]) -> Option<&'a String> {
    teams.choose(rng)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn draft_probability_rises_with_performance_and_attention() {
        let low = draft_probability(0.0, 0.0);
        let high = draft_probability(5.0, 1000.0);
        assert!(high > low, "low={low} high={high}");
    }

    #[test]
    fn is_drafted_same_seed_is_deterministic() {
        let mut a = ChaCha8Rng::seed_from_u64(1);
        let mut b = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(is_drafted(&mut a, 3.0, 200.0), is_drafted(&mut b, 3.0, 200.0));
    }

    #[test]
    fn draft_initial_salary_rises_with_performance_and_attention() {
        let low = draft_initial_salary(0.0, 0.0);
        let high = draft_initial_salary(5.0, 1000.0);
        assert!(high > low, "low={low} high={high}");
    }

    #[test]
    fn pick_team_returns_none_for_an_empty_list() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let teams: Vec<String> = vec![];
        assert!(pick_team(&mut rng, &teams).is_none());
    }

    #[test]
    fn pick_team_picks_from_the_given_candidates() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let teams = vec!["team:a".to_string(), "team:b".to_string()];
        let picked = pick_team(&mut rng, &teams).unwrap();
        assert!(teams.contains(picked));
    }
}
