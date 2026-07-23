use rand::Rng;
use serde_json::{Map, Value};

/// [06_훈련_시스템](../../../02_기획/육성코어/06_훈련_시스템.md) §4 강도
/// 다이얼 3단계.
pub const INTENSITIES: [&str; 3] = ["약", "보통", "강"];

fn intensity_multiplier(intensity: &str) -> f64 {
    match intensity {
        "약" => 0.5,
        "강" => 1.5,
        _ => 1.0,
    }
}

/// 주슬롯·보조슬롯·비선택 스탯의 XP 배율 — §2 "능력치 슬롯(주슬롯1+
/// 보조슬롯2)". 정확한 주/보조 효율 차이는 §6 "주슬롯 vs 보조슬롯의 효율
/// 차이" 미확정이라 placeholder(주슬롯 3배·보조슬롯 1.5배). 비선택
/// 스탯도 완전히 0은 아니게 잡음(§1 코어루프의 "지속 설정" 취지상, 훈련
/// 슬롯 밖 스탯도 실전 경험 등으로 아주 조금씩은 큰다는 자연스러운
/// 여지 — `sim::growth`의 NPC 배경 성장과 같은 스탯 하나가 완전히
/// 멈추는 건 부자연스러움).
const PRIMARY_MULTIPLIER: f64 = 3.0;
const SECONDARY_MULTIPLIER: f64 = 1.5;
const UNFOCUSED_MULTIPLIER: f64 = 0.3;

/// 훈련 설정(§1 "훈련·접근법은 지속 설정" — 매주 다시 안 짜고 계속
/// 적용됨) 검증 + XP 배율 계산에 쓰는 얇은 뷰. 구종 슬롯은 `new_pitch`
/// ("신규 습득 중", -15%)와 `mastery_pitch`("기존 마스터리업", -5%,
/// 05_구종_시스템.md §2 5단계 마스터리 시스템과 연동, 대화 2026-07-23)
/// 둘 중 하나만 배정 가능 — 호출부(`repository::set_protagonist_training`)가
/// 이미 상호 배타를 검증한다.
pub struct TrainingConfig<'a> {
    pub primary_stat: &'a str,
    pub secondary_stats: [&'a str; 2],
    pub intensity: &'a str,
    pub new_pitch: Option<&'a str>,
    pub mastery_pitch: Option<&'a str>,
}

/// 능력치 슬롯 XP 배율 — §3 "신규 습득 중이면 능력치 슬롯 효율 -15%,
/// 기존 구종 다듬기는 -5%(거의 영향 없음)".
fn stat_focus_multiplier(stat: &str, config: &TrainingConfig) -> f64 {
    let slot_mult = if stat == config.primary_stat {
        PRIMARY_MULTIPLIER
    } else if config.secondary_stats.contains(&stat) {
        SECONDARY_MULTIPLIER
    } else {
        UNFOCUSED_MULTIPLIER
    };
    let pitch_penalty = if config.new_pitch.is_some() {
        0.85
    } else if config.mastery_pitch.is_some() {
        0.95
    } else {
        1.0
    };
    slot_mult * intensity_multiplier(config.intensity) * pitch_penalty
}

/// 주간 훈련 적용 — `sim::growth::apply_weekly_growth_with_focus`를 훈련
/// 슬롯 배율로 감싼 것. 새 구종 습득 진행도(`pitch_weeks`)도 함께
/// 반환(호출부가 임계값 도달 시 `pitches` 배열에 실제로 추가) — §6
/// "선택한 두 번째 구종은 마스터리 1단계('습작')에서 시작"과 같은 원리로,
/// 이번 스코프는 "습작 단계 진입"(=습득 완료) 판정까지만 다룬다.
pub fn apply_weekly_training(
    rng: &mut impl Rng,
    exposed: &[&str; 9],
    stats: &mut Map<String, Value>,
    xp: &mut Map<String, Value>,
    genius: f64,
    config: &TrainingConfig,
) {
    crate::sim::growth::apply_weekly_growth_with_focus(rng, exposed, stats, xp, genius, |stat| stat_focus_multiplier(stat, config));
}

/// 새 구종 습득까지 필요한 주 수 — §6 "정확한 습득 임계값은 스탯 스케일
/// 확정 후"라 placeholder. 강도가 높을수록 더 빨리 습득.
pub fn weeks_required_to_learn_pitch(intensity: &str) -> u32 {
    match intensity {
        "강" => 8,
        "약" => 16,
        _ => 12,
    }
}

/// 기존 구종 마스터리 한 단계(예: 연마→실전) 올리는 데 필요한 주 수 —
/// 06_훈련_시스템.md §3 "기존 구종 다듬기는 거의 영향 없음"에 맞춰
/// `weeks_required_to_learn_pitch`의 절반 수준 D그룹 placeholder(대화
/// 2026-07-23). 정확한 수치는 마찬가지로 스탯 스케일 확정 후.
pub fn weeks_required_to_master_pitch(intensity: &str) -> u32 {
    match intensity {
        "강" => 4,
        "약" => 10,
        _ => 6,
    }
}

/// 등판 예정 주엔 "강하게" 선택 불가 — §4-1. 위반 시 "보통"으로
/// 자동 하향(플레이어가 강행하려 해도 시스템이 막는다는 문서 취지 —
/// "매주 슬롯 배분을 다시 짤 필요 없음"과 함께, 강도만 그 주에 한해
/// 자동 캡).
pub fn effective_intensity(requested: &str, has_upcoming_start: bool) -> &'static str {
    if has_upcoming_start && requested == "강" {
        "보통"
    } else {
        match requested {
            "약" => "약",
            "강" => "강",
            _ => "보통",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;
    use serde_json::json;

    fn stats_at(value: f64, exposed: &[&str; 9]) -> Map<String, Value> {
        exposed.iter().map(|s| (s.to_string(), json!(value))).collect()
    }
    fn zero_xp(exposed: &[&str; 9]) -> Map<String, Value> {
        exposed.iter().map(|s| (s.to_string(), json!(0.0))).collect()
    }

    #[test]
    fn primary_slot_grows_faster_than_unfocused_stats() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
        let mut xp = zero_xp(&PITCHER_EXPOSED);
        let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity: "보통", new_pitch: None, mastery_pitch: None };

        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..30 {
            apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
        }

        let primary = stats.get("구속").unwrap().as_f64().unwrap();
        let unfocused = stats.get("클러치").unwrap().as_f64().unwrap();
        assert!(primary > unfocused, "primary={primary} unfocused={unfocused}");
    }

    #[test]
    fn secondary_slot_grows_faster_than_unfocused_but_slower_than_primary() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
        let mut xp = zero_xp(&PITCHER_EXPOSED);
        let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity: "보통", new_pitch: None, mastery_pitch: None };

        let mut rng = ChaCha8Rng::seed_from_u64(2);
        for _ in 0..30 {
            apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
        }

        let primary = stats.get("구속").unwrap().as_f64().unwrap();
        let secondary = stats.get("구위").unwrap().as_f64().unwrap();
        let unfocused = stats.get("클러치").unwrap().as_f64().unwrap();
        assert!(primary >= secondary, "primary={primary} secondary={secondary}");
        assert!(secondary > unfocused, "secondary={secondary} unfocused={unfocused}");
    }

    #[test]
    fn stronger_intensity_grows_the_primary_slot_faster() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let run = |intensity: &str, seed: u64| -> f64 {
            let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
            let mut xp = zero_xp(&PITCHER_EXPOSED);
            let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity, new_pitch: None, mastery_pitch: None };
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            for _ in 0..15 {
                apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
            }
            stats.get("구속").unwrap().as_f64().unwrap()
        };
        let mut weak_total = 0.0;
        let mut strong_total = 0.0;
        for seed in 0..20 {
            weak_total += run("약", seed);
            strong_total += run("강", seed);
        }
        assert!(strong_total > weak_total, "strong={strong_total} weak={weak_total}");
    }

    #[test]
    fn learning_a_new_pitch_slows_down_stat_growth() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let run = |new_pitch: Option<&str>, seed: u64| -> f64 {
            let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
            let mut xp = zero_xp(&PITCHER_EXPOSED);
            let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity: "보통", new_pitch, mastery_pitch: None };
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            for _ in 0..15 {
                apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
            }
            stats.get("구속").unwrap().as_f64().unwrap()
        };
        let mut without_total = 0.0;
        let mut with_total = 0.0;
        for seed in 0..20 {
            without_total += run(None, seed);
            with_total += run(Some("슬라이더"), seed);
        }
        assert!(without_total >= with_total, "without={without_total} with={with_total}");
    }

    #[test]
    fn stat_growth_never_exceeds_hard_cap() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
        let mut xp = zero_xp(&PITCHER_EXPOSED);
        let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity: "강", new_pitch: None, mastery_pitch: None };
        let mut rng = ChaCha8Rng::seed_from_u64(3);
        for _ in 0..500 {
            apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
        }
        for stat in PITCHER_EXPOSED {
            assert!(stats.get(stat).unwrap().as_f64().unwrap() <= 80.0);
        }
    }

    #[test]
    fn effective_intensity_downgrades_strong_training_on_start_weeks() {
        assert_eq!(effective_intensity("강", true), "보통");
        assert_eq!(effective_intensity("강", false), "강");
        assert_eq!(effective_intensity("약", true), "약");
    }

    #[test]
    fn weeks_required_to_learn_pitch_decreases_with_intensity() {
        assert!(weeks_required_to_learn_pitch("강") < weeks_required_to_learn_pitch("보통"));
        assert!(weeks_required_to_learn_pitch("보통") < weeks_required_to_learn_pitch("약"));
    }

    #[test]
    fn weeks_required_to_master_pitch_is_lighter_than_learning_a_new_pitch() {
        for intensity in INTENSITIES {
            assert!(
                weeks_required_to_master_pitch(intensity) < weeks_required_to_learn_pitch(intensity),
                "{intensity}: mastery should take fewer weeks than learning a brand-new pitch"
            );
        }
        assert!(weeks_required_to_master_pitch("강") < weeks_required_to_master_pitch("보통"));
        assert!(weeks_required_to_master_pitch("보통") < weeks_required_to_master_pitch("약"));
    }

    #[test]
    fn mastering_an_existing_pitch_slows_stat_growth_less_than_learning_a_new_one() {
        use crate::sim::growth::PITCHER_EXPOSED;
        let run = |new_pitch: Option<&str>, mastery_pitch: Option<&str>, seed: u64| -> f64 {
            let mut stats = stats_at(20.0, &PITCHER_EXPOSED);
            let mut xp = zero_xp(&PITCHER_EXPOSED);
            let config = TrainingConfig { primary_stat: "구속", secondary_stats: ["구위", "제구"], intensity: "보통", new_pitch, mastery_pitch };
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            for _ in 0..15 {
                apply_weekly_training(&mut rng, &PITCHER_EXPOSED, &mut stats, &mut xp, 80.0, &config);
            }
            stats.get("구속").unwrap().as_f64().unwrap()
        };
        let mut new_pitch_total = 0.0;
        let mut mastery_total = 0.0;
        for seed in 0..20 {
            new_pitch_total += run(Some("슬라이더"), None, seed);
            mastery_total += run(None, Some("슬라이더"), seed);
        }
        assert!(mastery_total >= new_pitch_total, "mastery={mastery_total} new_pitch={new_pitch_total}");
    }
}
