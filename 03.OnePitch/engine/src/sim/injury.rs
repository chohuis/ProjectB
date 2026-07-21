use rand::seq::SliceRandom;
use rand::Rng;

/// [08_부상_시스템](../../../02_기획/육성코어/08_부상_시스템.md) §2 부위 6종.
pub const BODY_PARTS: [&str; 6] = ["어깨", "팔꿈치", "손가락/손목", "허리/코어", "다리/무릎", "전신 피로"];

/// §2 심각도 3단계 — 순서가 곧 등급(`escalate_severity`가 다음 단계로 승격).
pub const SEVERITIES: [&str; 3] = ["경미", "중등", "중상"];

/// 같은 부위 재발 시 심각도 자동 한 단계 상승(§5, 2026-07-14 대화 설계로
/// 확정) — 이미 최고등급(중상)이면 유지.
pub fn escalate_severity(severity: &str) -> &'static str {
    match severity {
        "경미" => "중등",
        "중등" => "중상",
        _ => "중상",
    }
}

/// 이탈 기간(일) — "경미=짧은 결장·중등=몇 주~시즌 일부·중상=시즌아웃급"
/// (§2)을 가장 단순하게 수치화한 placeholder. §6 "정확한 확률·이탈기간
/// 수치는 스탯 스케일 확정 후"라 Phase I8 재조정 대상.
pub fn recovery_days(severity: &str) -> i64 {
    match severity {
        "경미" => 7,
        "중등" => 28,
        _ => 90,
    }
}

/// 노쇠 가중치 — §5 "부상 이력이 누적될수록 하락 시점이 앞당겨진다"의
/// 입력값. 심각도가 클수록 커리어에 남기는 흔적도 크다는 취지의 placeholder
/// (`sim::growth::apply_aging_decline`이 소비).
pub fn severity_weight(severity: &str) -> f64 {
    match severity {
        "경미" => 1.0,
        "중등" => 3.0,
        _ => 8.0,
    }
}

/// [08_부상_시스템](../../../02_기획/육성코어/08_부상_시스템.md) §4 치료
/// 옵션 3종 — 주인공 전용(NPC는 실제 의사결정 주체가 없어 항상 "재활"
/// 자동 확정, `data::repository::record_injury`).
pub const TREATMENTS: [&str; 3] = ["수술", "재활", "무리한 복귀"];

/// 치료법별 실제 이탈 기간 — §4 "수술=김·재활=중간·무리한 복귀=최소".
/// `recovery_days`(심각도 기준 이탈기간, "재활"과 동일한 기준점)에 배율을
/// 곱한 placeholder(§6 "정확한 수치는 스탯 스케일 확정 후").
pub fn treated_recovery_days(severity: &str, treatment: &str) -> i64 {
    let mult = match treatment {
        "수술" => 1.8,
        "무리한 복귀" => 0.3,
        _ => 1.0,
    };
    ((recovery_days(severity) as f64) * mult).round().max(1.0) as i64
}

/// 수술 성공률 — §4 "성공 시 높음, 단 성공률<100%(합병증 리스크)". 실패
/// 시 호출부(`data::repository::treat`)가 `escalate_severity`로 합병증을
/// 반영한다. 심각도가 클수록 성공률이 낮아지는 placeholder.
pub fn surgery_succeeds(rng: &mut impl Rng, severity: &str) -> bool {
    let prob = match severity {
        "경미" => 0.95,
        "중등" => 0.85,
        _ => 0.7,
    };
    rng.gen_bool(prob)
}

/// "무리한 복귀" 선택 시 즉시 악화 확률 — §4 "재발 위험 매우 높음"을
/// 장기 확률 배율 대신 치료 선택 시점의 단일 판정으로 표현(스탯 스케일이
/// 없는 지금 가장 단순하게 "재발위험 차등"을 살리는 방식). 심각도가
/// 클수록(더 무리한 상태일수록) 악화 확률도 커짐.
pub fn rushed_return_aggravates(rng: &mut impl Rng, severity: &str) -> bool {
    let prob = match severity {
        "경미" => 0.3,
        "중등" => 0.45,
        _ => 0.6,
    };
    rng.gen_bool(prob)
}

pub(crate) const FATIGUE_INJURY_THRESHOLD: f64 = 70.0;
const BASE_OVERUSE_PROB: f64 = 0.05;

/// 누적형 부상 판정 결과 — §3 "전조 경고" 2단계 모델(대화 설계
/// 2026-07-21, §6-64). `check_overuse_injury`가 이 세 상태 중 하나로
/// 귀결된다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OveruseOutcome {
    /// 피로도가 임계 미만이거나, 임계 초과라도 이번 주 확률판정에서
    /// 실제로는 안 걸림.
    None,
    /// 임계 초과 상태에 **처음** 진입 — 아직 확률판정 없이 경고만.
    Warning,
    /// 경고를 받고도 계속 임계 초과 상태로 방치(=강행)해서 실제로 부상.
    Injury(&'static str, &'static str),
}

/// 누적형(과사용) 부상 판정 — §3 "피로도가 임계 초과 상태에서 계속 등판·
/// 훈련 강행". 팀 철학(부상방지/재활특화=완화, 스파르타(혹독훈련)=가중,
/// [05_팀_특성_시스템](../../../02_기획/리그팀/05_팀_특성_시스템.md) §1)이
/// 확률을 보정한다. 매주 체크(§3에서 이미 확정). `already_warned`는
/// 호출부(주인공은 `protagonist.live_state.부상경고`, NPC는 실제 의사결정
/// 주체가 없어 항상 `true`로 넘겨 경고 단계를 건너뜀)가 관리하는 상태 —
/// 이 함수 자체는 순수 판정만 한다. 확률 계수 자체는 §6 "정확한 확률...
/// 스탯 스케일 확정 후"라 placeholder.
pub fn check_overuse_injury(rng: &mut impl Rng, fatigue: f64, philosophy: &str, already_warned: bool) -> OveruseOutcome {
    if fatigue < FATIGUE_INJURY_THRESHOLD {
        return OveruseOutcome::None;
    }
    if !already_warned {
        return OveruseOutcome::Warning;
    }
    let philosophy_mult = match philosophy {
        "부상방지/재활특화" => 0.5,
        "스파르타(혹독훈련)" => 1.5,
        _ => 1.0,
    };
    let excess = (fatigue - FATIGUE_INJURY_THRESHOLD) / 30.0;
    let prob = ((BASE_OVERUSE_PROB + excess * 0.15) * philosophy_mult).clamp(0.0, 0.9);
    if !rng.gen_bool(prob) {
        return OveruseOutcome::None;
    }

    let part = *BODY_PARTS.choose(rng).unwrap();
    // 과사용은 경미~중등 위주, 중상은 드묾 — §2 심각도 가중 추첨 placeholder.
    let roll: f64 = rng.gen_range(0.0..1.0);
    let severity = if roll < 0.6 {
        "경미"
    } else if roll < 0.95 {
        "중등"
    } else {
        "중상"
    };
    OveruseOutcome::Injury(part, severity)
}

/// 투구당 급성 부상 기본 확률·피로도 가산 계수 — §3 "경기 중 특정 순간의
/// 낮은 확률 랜덤 이벤트"·"피로가 높을수록 급성 부상 확률도 소폭 가산".
/// 밸런스 하네스 대량 실행(10_구현_Phase_계획.md §6-62)으로 이 확률이
/// "투구 1개당"이라는 노출 단위에 안 맞게 잡혀 있었음을 발견 — 목표
/// 커리어(15~20시즌, 총 투구 약 4.5~5만 개) 동안 부상 이벤트가 6~10회
/// 나오게 역산해 재조정(대화 설계 2026-07-21). 예전 값(0.0006/0.00002)은
/// 같은 커리어 규모에서 부상 이벤트가 20건을 훌쩍 넘겨 사실상 매번 부상
/// 은퇴로 끝났다.
const ACUTE_BASE_PROB: f64 = 0.0001;
const ACUTE_FATIGUE_COEF: f64 = 0.000003;

/// 급성형(우발) 부상 판정 — §3 "무리한 투구 동작·강한 타구 피격·주루
/// 충돌 등". 팀 철학은 이 표에서 누적형 행에만 연결돼 있어(§3 표) 급성형
/// 확률에는 반영하지 않음 — 누적형(`check_overuse_injury`)과의 유일한
/// 차이점. **심각도 분포의 중상 비중을 20%→5%로 재조정**(§6-62) —
/// 은퇴 임계값(16 = 중상 2회 상당)까지 쌓일 확률을 "커리어 100번 중
/// 6~7번" 수준으로 낮추기 위한 결정(대화 설계 2026-07-21). 과사용
/// (`check_overuse_injury`)의 중상 비중(5%)과도 이제 일치.
pub fn check_acute_injury(rng: &mut impl Rng, fatigue: f64) -> Option<(&'static str, &'static str)> {
    let prob = (ACUTE_BASE_PROB + fatigue * ACUTE_FATIGUE_COEF).clamp(0.0, 1.0);
    if !rng.gen_bool(prob) {
        return None;
    }

    let part = *BODY_PARTS.choose(rng).unwrap();
    let roll: f64 = rng.gen_range(0.0..1.0);
    let severity = if roll < 0.4 {
        "경미"
    } else if roll < 0.95 {
        "중등"
    } else {
        "중상"
    };
    Some((part, severity))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn no_injury_below_fatigue_threshold() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..100 {
            assert_eq!(check_overuse_injury(&mut rng, 69.9, "전통/정통", true), OveruseOutcome::None);
        }
    }

    #[test]
    fn first_time_over_threshold_only_warns_regardless_of_rng() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..100 {
            assert_eq!(check_overuse_injury(&mut rng, 100.0, "전통/정통", false), OveruseOutcome::Warning);
        }
    }

    #[test]
    fn same_seed_produces_identical_result() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(42);
        let mut rng_b = ChaCha8Rng::seed_from_u64(42);
        let a = check_overuse_injury(&mut rng_a, 100.0, "전통/정통", true);
        let b = check_overuse_injury(&mut rng_b, 100.0, "전통/정통", true);
        assert_eq!(a, b);
    }

    #[test]
    fn sparta_philosophy_injures_more_often_than_injury_prevention() {
        let trials = 500;
        let count = |philosophy: &str| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if matches!(check_overuse_injury(&mut rng, 100.0, philosophy, true), OveruseOutcome::Injury(..)) {
                    hits += 1;
                }
            }
            hits
        };
        let sparta = count("스파르타(혹독훈련)");
        let prevention = count("부상방지/재활특화");
        assert!(sparta > prevention, "sparta={sparta} prevention={prevention}");
    }

    #[test]
    fn escalate_severity_progresses_and_caps_at_worst() {
        assert_eq!(escalate_severity("경미"), "중등");
        assert_eq!(escalate_severity("중등"), "중상");
        assert_eq!(escalate_severity("중상"), "중상");
    }

    #[test]
    fn recovery_days_and_severity_weight_increase_with_severity() {
        assert!(recovery_days("경미") < recovery_days("중등"));
        assert!(recovery_days("중등") < recovery_days("중상"));
        assert!(severity_weight("경미") < severity_weight("중등"));
        assert!(severity_weight("중등") < severity_weight("중상"));
    }

    #[test]
    fn acute_injury_is_rare_but_not_impossible_over_many_pas() {
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        let mut hits = 0;
        for _ in 0..20_000 {
            if check_acute_injury(&mut rng, 30.0).is_some() {
                hits += 1;
            }
        }
        assert!(hits > 0, "expected at least one acute injury across 20,000 PAs");
        assert!(hits < 100, "acute injuries should stay rare, got {hits} in 20,000 PAs");
    }

    #[test]
    fn higher_fatigue_increases_acute_injury_probability() {
        // §6-62 재조정 이후 확률이 훨씬 작아져(0.0001~0.0004대) 2,000회로는
        // 둘 다 0건이 나올 수 있음 — 신뢰성 있게 갈리도록 시행 수 확대.
        let trials = 50_000;
        let count = |fatigue: f64| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if check_acute_injury(&mut rng, fatigue).is_some() {
                    hits += 1;
                }
            }
            hits
        };
        let low = count(0.0);
        let high = count(100.0);
        assert!(high > low, "high fatigue={high} low fatigue={low}");
    }

    #[test]
    fn acute_same_seed_produces_identical_result() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(7);
        let mut rng_b = ChaCha8Rng::seed_from_u64(7);
        assert_eq!(check_acute_injury(&mut rng_a, 80.0), check_acute_injury(&mut rng_b, 80.0));
    }

    #[test]
    fn treated_recovery_days_matches_documented_tradeoffs() {
        for severity in SEVERITIES {
            let surgery = treated_recovery_days(severity, "수술");
            let rehab = treated_recovery_days(severity, "재활");
            let rushed = treated_recovery_days(severity, "무리한 복귀");
            assert!(rushed < rehab, "severity={severity} rushed={rushed} rehab={rehab}");
            assert!(rehab < surgery, "severity={severity} rehab={rehab} surgery={surgery}");
        }
    }

    #[test]
    fn treated_recovery_days_rehab_matches_baseline_recovery_days() {
        for severity in SEVERITIES {
            assert_eq!(treated_recovery_days(severity, "재활"), recovery_days(severity));
        }
    }

    #[test]
    fn surgery_success_rate_decreases_with_severity() {
        let trials = 2000;
        let count = |severity: &str| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if surgery_succeeds(&mut rng, severity) {
                    hits += 1;
                }
            }
            hits
        };
        let minor = count("경미");
        let severe = count("중상");
        assert!(minor > severe, "minor={minor} severe={severe}");
    }

    #[test]
    fn rushed_return_aggravation_is_more_likely_for_worse_severity_and_deterministic() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(11);
        let mut rng_b = ChaCha8Rng::seed_from_u64(11);
        assert_eq!(rushed_return_aggravates(&mut rng_a, "중상"), rushed_return_aggravates(&mut rng_b, "중상"));

        let trials = 2000;
        let count = |severity: &str| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if rushed_return_aggravates(&mut rng, severity) {
                    hits += 1;
                }
            }
            hits
        };
        let minor = count("경미");
        let severe = count("중상");
        assert!(severe > minor, "minor={minor} severe={severe}");
    }
}
