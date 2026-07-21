//! [02_이벤트](../../../02_기획/콘텐츠/02_이벤트.md) — content.db `events`
//! 테이블의 `trigger`/`choices` JSON을 판정·적용하는 순수 로직만 담는다
//! (DB 조회·삽입은 `data::repository` 소관, §1 "폴링은 이벤트 시스템 자신이
//! 조건 평가"를 이 모듈이, "콜백은 호출부가 이미 판단"이므로 이 모듈을 안
//! 거치고 `data::repository`가 직접 발동시킨다).

use rand::Rng;
use serde::Deserialize;

/// §1 폴링 5변수 중 콜백형을 뺀 4종 + 확률. content.db `events.trigger`
/// JSON이 `{"var":"...", ...}` 형태로 이 태그를 매칭한다. "동료 상태"는
/// 아직 팀동료 관계 데이터가 없어(관계도는 감독만 추적, §6-59) 감독
/// 관계도로 근사(D그룹 placeholder).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "var")]
pub enum EventTrigger {
    #[serde(rename = "피로도")]
    Fatigue { op: String, value: f64 },
    #[serde(rename = "사기")]
    Morale { op: String, value: f64 },
    #[serde(rename = "연패")]
    LosingStreak { op: String, value: i64 },
    #[serde(rename = "감독관계도")]
    ManagerRelationship { op: String, value: i64 },
    #[serde(rename = "확률")]
    Probability { chance: f64 },
}

/// 폴링 판정에 필요한 현재 상태 스냅샷 — `data::repository`가 조립해서
/// 넘긴다(주인공 live_state·팀 연패 스트릭·감독 관계도).
#[derive(Debug, Clone, Default)]
pub struct EventContext {
    pub fatigue: f64,
    pub morale: f64,
    pub losing_streak: i64,
    pub manager_relationship: i64,
}

fn compare(actual: f64, op: &str, threshold: f64) -> bool {
    match op {
        ">=" => actual >= threshold,
        "<=" => actual <= threshold,
        ">" => actual > threshold,
        "<" => actual < threshold,
        _ => false,
    }
}

pub fn evaluate_trigger(trigger: &EventTrigger, ctx: &EventContext, rng: &mut impl Rng) -> bool {
    match trigger {
        EventTrigger::Fatigue { op, value } => compare(ctx.fatigue, op, *value),
        EventTrigger::Morale { op, value } => compare(ctx.morale, op, *value),
        EventTrigger::LosingStreak { op, value } => compare(ctx.losing_streak as f64, op, *value as f64),
        EventTrigger::ManagerRelationship { op, value } => compare(ctx.manager_relationship as f64, op, *value as f64),
        EventTrigger::Probability { chance } => rng.gen_bool(chance.clamp(0.0, 1.0)),
    }
}

/// §3 효과 대상 9종 중 이번 1차 배치가 실제로 쓰는 3종 — 주목도는
/// live_state의 한 필드일 뿐이라 별도 target 없이 `LiveState`로 표현된다.
/// 부상 진행·계약/시장 상태·재정·후속 이벤트 플래그는 이미 전용 시스템이
/// 있거나(부상·계약) 검증된 기존 헬퍼가 없어(재정) 이번 배치가 안 씀 —
/// 새 target을 추가할 때 이 문서(§3)를 그대로 따라가면 된다.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "target")]
pub enum EventEffect {
    #[serde(rename = "live_state")]
    LiveState { field: String, delta: f64 },
    #[serde(rename = "xp")]
    Xp { stat: String, delta: f64 },
    #[serde(rename = "manager_relationship")]
    ManagerRelationship { delta: i64 },
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub effects: Vec<EventEffect>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn fatigue_trigger_matches_op() {
        let ctx = EventContext { fatigue: 75.0, ..Default::default() };
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let trigger = EventTrigger::Fatigue { op: ">=".to_string(), value: 70.0 };
        assert!(evaluate_trigger(&trigger, &ctx, &mut rng));
        let trigger = EventTrigger::Fatigue { op: ">=".to_string(), value: 80.0 };
        assert!(!evaluate_trigger(&trigger, &ctx, &mut rng));
    }

    #[test]
    fn losing_streak_and_manager_relationship_triggers_compare_correctly() {
        let ctx = EventContext { losing_streak: 4, manager_relationship: 55, ..Default::default() };
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        assert!(evaluate_trigger(&EventTrigger::LosingStreak { op: ">=".to_string(), value: 4 }, &ctx, &mut rng));
        assert!(!evaluate_trigger(&EventTrigger::LosingStreak { op: ">=".to_string(), value: 5 }, &ctx, &mut rng));
        assert!(evaluate_trigger(&EventTrigger::ManagerRelationship { op: ">=".to_string(), value: 50 }, &ctx, &mut rng));
    }

    #[test]
    fn probability_trigger_is_deterministic_for_a_given_seed() {
        let ctx = EventContext::default();
        let mut a = ChaCha8Rng::seed_from_u64(42);
        let mut b = ChaCha8Rng::seed_from_u64(42);
        let trigger = EventTrigger::Probability { chance: 0.5 };
        assert_eq!(evaluate_trigger(&trigger, &ctx, &mut a), evaluate_trigger(&trigger, &ctx, &mut b));
    }

    #[test]
    fn trigger_deserializes_from_the_expected_json_shape() {
        let raw = r#"{"var":"사기","op":"<=","value":30.0}"#;
        let trigger: EventTrigger = serde_json::from_str(raw).unwrap();
        assert!(matches!(trigger, EventTrigger::Morale { .. }));

        let raw = r#"{"var":"확률","chance":0.02}"#;
        let trigger: EventTrigger = serde_json::from_str(raw).unwrap();
        assert!(matches!(trigger, EventTrigger::Probability { .. }));
    }

    #[test]
    fn choice_deserializes_with_nested_effects() {
        let raw = r#"[{"id":"a","label":"A","effects":[{"target":"live_state","field":"사기","delta":10.0}]}]"#;
        let choices: Vec<EventChoice> = serde_json::from_str(raw).unwrap();
        assert_eq!(choices.len(), 1);
        assert_eq!(choices[0].effects.len(), 1);
        assert!(matches!(choices[0].effects[0], EventEffect::LiveState { .. }));
    }
}
