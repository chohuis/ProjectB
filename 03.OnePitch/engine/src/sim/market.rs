//! [06_시장_계약](../../../02_기획/06_시장_계약.md) — 방출(§1)·재계약(§2)·
//! FA(§3)만 다룬다. 트레이드(§4)는 다음 서브분, 계약조항(§5 옵션·인센티브)
//! 은 실제 선택 UI가 필요한 별도 인터랙션이라 이번 스코프에서 협상 결과에
//! 반영 안 함(§7 "인센티브 구체 조건·금액은 스탯 스케일 확정 후"와 같은
//! 맥락의 미정 항목).

use rand::Rng;

/// 등급→점수(F=0~S=5) — §1 "종합지표"의 "평가등급 누적" 입력을 하나의
/// 숫자로 압축하는 내부 스케일. `sim::eval::GRADES`와 순서를 공유.
pub fn grade_score(grade: &str) -> f64 {
    match grade {
        "S" => 5.0,
        "A" => 4.0,
        "B" => 3.0,
        "C" => 2.0,
        "D" => 1.0,
        _ => 0.0, // F
    }
}

/// 방출 위험 확률 — §1 "종합지표"(평가등급누적+노쇠곡선+연봉대비성과+
/// 구단주인내심)의 placeholder 근사. 노쇠곡선은 스킵(주인공 나이 자체가
/// 아직 트래킹 안 됨 — 01_커리어_구조.md §5 진로 갈림길과 함께 후속
/// 스코프), 구단주 인내심은 전담 스태프 엔티티가 없어(02_스태프_능력치
/// §3, I3에서 이미 스코프아웃) `team_traits`의 **②자원**으로 대체(궁핍
/// =인내심 낮음). "경고"(§1-1, 7월말 트레이드데드라인) 단계는 캘린더에
/// 그 지점이 없어 생략 — 시즌종료 시점의 최종판정만 반영.
pub fn release_probability(avg_grade_score: f64, salary: i64, resource: &str) -> f64 {
    let performance_risk = ((2.5 - avg_grade_score) / 2.5).clamp(0.0, 1.0);
    let salary_pressure = (salary as f64 / 20000.0).clamp(0.0, 1.0);
    let resource_mult = match resource {
        "궁핍" => 1.5,
        "알뜰" => 1.2,
        "부유" => 0.6,
        _ => 1.0,
    };
    ((0.03 + performance_risk * 0.35 + salary_pressure * 0.15) * resource_mult).clamp(0.0, 0.85)
}

pub fn is_released(rng: &mut impl Rng, avg_grade_score: f64, salary: i64, resource: &str) -> bool {
    rng.gen_bool(release_probability(avg_grade_score, salary, resource))
}

/// 구단 초기 제안 연봉 — §2-1 "구단의 제안·반응은 팀특성 ②자원(부유=
/// 후하게, 궁핍=박하게) + 주인공 최근 주목도·평가 등급 흐름에 좌우".
/// 정확한 계산식은 §7 "협상 라운드 상한, 정확한 금액 계산식... 미정"
/// 이라 placeholder — 최근 연봉 기준 성과·주목도·자원 배율을 곱한다.
pub fn initial_offer(previous_salary: i64, avg_grade_score: f64, attention: f64, resource: &str) -> i64 {
    let performance_mult = 0.85 + avg_grade_score * 0.1; // 0.85(F)~1.35(S)
    let attention_mult = 1.0 + (attention / 1000.0).min(0.3);
    let resource_mult = match resource {
        "부유" => 1.3,
        "알뜰" => 0.9,
        "궁핍" => 0.75,
        _ => 1.0,
    };
    (previous_salary.max(1) as f64 * performance_mult * attention_mult * resource_mult).round() as i64
}

/// 계약 기간 — §2-2 "1~5년" 중 이번 오퍼가 제시하는 값. 정확한 분포는
/// 미정이라 1~3년 균등 placeholder(장기계약의 방출저항 등 §2-2 트레이드
/// 오프는 이번 스코프에서 기계적으로 반영 안 함 — 숫자만 존재).
pub fn offer_years(rng: &mut impl Rng) -> i64 {
    rng.gen_range(1..=3)
}

/// 역제안(카운터오퍼) 수락 여부 — §2-1 "역제안 시 구단 재제안 → 반복
/// (라운드 상한 있음)"을 **라운드 상한 1회**로 단순화(§7 "정확한 라운드
/// 상한은 미정"). 요청액이 원 제안보다 낮거나 같으면 항상 수락, 높으면
/// 격차·자원 여유에 따라 확률적으로 수락.
pub fn counter_offer_accepted(rng: &mut impl Rng, offer: i64, requested: i64, resource: &str) -> bool {
    if requested <= offer {
        return true;
    }
    let gap_ratio = (requested - offer) as f64 / offer.max(1) as f64;
    let resource_mult: f64 = match resource {
        "부유" => 1.4,
        "알뜰" => 0.8,
        "궁핍" => 0.5,
        _ => 1.0,
    };
    rng.gen_bool(((1.0 - gap_ratio).clamp(0.0, 1.0) * resource_mult).min(1.0))
}

/// FA 오퍼 개수 — §3-3 "여러 구단이 오퍼 제시". 정확한 분포는 §7 미정
/// 이라 2~4개 균등 placeholder.
pub fn fa_offer_count(rng: &mut impl Rng) -> usize {
    rng.gen_range(2..=4)
}

/// 일반(선수대선수) 트레이드 발생 확률 — §4-1 "NPC간 캐던스는 연 2회
/// (트레이드 데드라인+오프시즌)"를 캘린더에 그 지점이 없어 **시즌 1회**
/// 판정으로 단순화. 낮은 기본확률 + 궁핍한 팀일수록 로스터 정리 동기로
/// 소폭 상승(§7류 정확한 수치 미정 placeholder).
pub fn trade_probability(resource: &str) -> f64 {
    let resource_mult: f64 = match resource {
        "궁핍" => 1.4,
        "알뜰" => 1.15,
        "부유" => 0.7,
        _ => 1.0,
    };
    (0.06 * resource_mult).clamp(0.0, 0.3)
}

/// 현금 트레이드 발생 확률 — §4-2 "발생 조건: 팀특성 ②자원=궁핍 + 주인공이
/// 말년(노쇠기)이라 연봉 대비 가치가 떨어졌을 때". 주인공 나이 자체가
/// 아직 트래킹 안 돼(01_커리어_구조.md §5 진로 갈림길과 함께 후속 스코프,
/// §6-19에서 이미 확정한 것과 동일한 제약) "노쇠기" 조건은 반영 못 함 —
/// 연봉 부담만으로 근사(`release_probability`와 같은 축). §4-2가 명시한
/// 발생 조건 자체가 "②자원=궁핍"뿐이라 그 외 자원 축에선 0.
pub fn cash_trade_probability(salary: i64, resource: &str) -> f64 {
    if resource != "궁핍" {
        return 0.0;
    }
    let salary_pressure = (salary as f64 / 20000.0).clamp(0.0, 1.0);
    (0.03 + salary_pressure * 0.12).clamp(0.0, 0.2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn release_probability_rises_as_performance_and_pay_worsen() {
        let good = release_probability(5.0, 1000, "안정");
        let bad = release_probability(0.0, 20000, "안정");
        assert!(bad > good, "good={good} bad={bad}");
    }

    #[test]
    fn release_probability_is_harsher_for_poor_teams() {
        let rich = release_probability(1.0, 10000, "부유");
        let poor = release_probability(1.0, 10000, "궁핍");
        assert!(poor > rich, "rich={rich} poor={poor}");
    }

    #[test]
    fn is_released_same_seed_is_deterministic() {
        let mut a = ChaCha8Rng::seed_from_u64(5);
        let mut b = ChaCha8Rng::seed_from_u64(5);
        assert_eq!(is_released(&mut a, 1.0, 10000, "궁핍"), is_released(&mut b, 1.0, 10000, "궁핍"));
    }

    #[test]
    fn initial_offer_is_higher_for_richer_teams_and_better_performance() {
        let base = initial_offer(5000, 2.0, 0.0, "안정");
        let rich = initial_offer(5000, 2.0, 0.0, "부유");
        let poor = initial_offer(5000, 2.0, 0.0, "궁핍");
        assert!(rich > base && base > poor, "rich={rich} base={base} poor={poor}");

        let strong_perf = initial_offer(5000, 5.0, 0.0, "안정");
        let weak_perf = initial_offer(5000, 0.0, 0.0, "안정");
        assert!(strong_perf > weak_perf, "strong={strong_perf} weak={weak_perf}");
    }

    #[test]
    fn counter_offer_at_or_below_the_original_is_always_accepted() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        assert!(counter_offer_accepted(&mut rng, 5000, 5000, "궁핍"));
        assert!(counter_offer_accepted(&mut rng, 5000, 3000, "궁핍"));
    }

    #[test]
    fn counter_offer_acceptance_rate_is_higher_for_richer_teams() {
        let trials = 500;
        let accept_rate = |resource: &str| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if counter_offer_accepted(&mut rng, 5000, 6500, resource) {
                    hits += 1;
                }
            }
            hits
        };
        let rich = accept_rate("부유");
        let poor = accept_rate("궁핍");
        assert!(rich > poor, "rich={rich} poor={poor}");
    }

    #[test]
    fn fa_offer_count_stays_within_documented_range() {
        let mut rng = ChaCha8Rng::seed_from_u64(9);
        for _ in 0..100 {
            let n = fa_offer_count(&mut rng);
            assert!((2..=4).contains(&n), "n={n}");
        }
    }

    #[test]
    fn offer_years_stays_within_documented_range() {
        let mut rng = ChaCha8Rng::seed_from_u64(9);
        for _ in 0..100 {
            let n = offer_years(&mut rng);
            assert!((1..=3).contains(&n), "n={n}");
        }
    }

    #[test]
    fn trade_probability_is_higher_for_poor_teams_than_rich_teams() {
        let poor = trade_probability("궁핍");
        let rich = trade_probability("부유");
        assert!(poor > rich, "poor={poor} rich={rich}");
    }

    #[test]
    fn cash_trade_probability_is_zero_outside_poor_teams() {
        assert_eq!(cash_trade_probability(20000, "안정"), 0.0);
        assert_eq!(cash_trade_probability(20000, "부유"), 0.0);
        assert_eq!(cash_trade_probability(20000, "알뜰"), 0.0);
    }

    #[test]
    fn cash_trade_probability_rises_with_salary_for_poor_teams() {
        let low = cash_trade_probability(0, "궁핍");
        let high = cash_trade_probability(20000, "궁핍");
        assert!(high > low, "low={low} high={high}");
        assert!(high > 0.0);
    }
}
