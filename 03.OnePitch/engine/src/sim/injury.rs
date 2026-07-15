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

const FATIGUE_INJURY_THRESHOLD: f64 = 70.0;
const BASE_OVERUSE_PROB: f64 = 0.05;

/// 누적형(과사용) 부상 판정 — §3 "피로도가 임계 초과 상태에서 계속 등판·
/// 훈련 강행". 팀 철학(부상방지/재활특화=완화, 스파르타(혹독훈련)=가중,
/// [05_팀_특성_시스템](../../../02_기획/리그팀/05_팀_특성_시스템.md) §1)이
/// 확률을 보정한다. 매주 체크(§3에서 이미 확정)하되, "전조 경고" 단계는
/// 인박스·알림 시스템과 엮여야 해서 이번 스코프 밖 — 임계 초과 시 곧바로
/// 확률 판정으로 단순화(다음 서브분 후보). 확률 계수 자체는 §6 "정확한
/// 확률... 스탯 스케일 확정 후"라 placeholder.
pub fn check_overuse_injury(rng: &mut impl Rng, fatigue: f64, philosophy: &str) -> Option<(&'static str, &'static str)> {
    if fatigue < FATIGUE_INJURY_THRESHOLD {
        return None;
    }
    let philosophy_mult = match philosophy {
        "부상방지/재활특화" => 0.5,
        "스파르타(혹독훈련)" => 1.5,
        _ => 1.0,
    };
    let excess = (fatigue - FATIGUE_INJURY_THRESHOLD) / 30.0;
    let prob = ((BASE_OVERUSE_PROB + excess * 0.15) * philosophy_mult).clamp(0.0, 0.9);
    if !rng.gen_bool(prob) {
        return None;
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
            assert!(check_overuse_injury(&mut rng, 69.9, "전통/정통").is_none());
        }
    }

    #[test]
    fn same_seed_produces_identical_result() {
        let mut rng_a = ChaCha8Rng::seed_from_u64(42);
        let mut rng_b = ChaCha8Rng::seed_from_u64(42);
        let a = check_overuse_injury(&mut rng_a, 100.0, "전통/정통");
        let b = check_overuse_injury(&mut rng_b, 100.0, "전통/정통");
        assert_eq!(a, b);
    }

    #[test]
    fn sparta_philosophy_injures_more_often_than_injury_prevention() {
        let trials = 500;
        let count = |philosophy: &str| -> usize {
            let mut hits = 0;
            for seed in 0..trials {
                let mut rng = ChaCha8Rng::seed_from_u64(seed);
                if check_overuse_injury(&mut rng, 100.0, philosophy).is_some() {
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
}
