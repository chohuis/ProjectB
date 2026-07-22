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

/// §3 효과 대상 9종 중 이번 배치가 쓰는 4종 — 주목도는 live_state의
/// 한 필드일 뿐이라 별도 target 없이 `LiveState`로 표현된다. `Finance`는
/// `08_개인_재정.md` §5 "잔액" 골격만(세금·개인트레이너·투자성향은 이월,
/// 이월 부채 정리 대화 2026-07-22). 부상 진행·계약/시장 상태·후속 이벤트
/// 플래그는 여전히 이미 전용 시스템이 있거나 이번 배치가 안 씀 — 새
/// target을 추가할 때 이 문서(§3)를 그대로 따라가면 된다.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "target")]
pub enum EventEffect {
    #[serde(rename = "live_state")]
    LiveState { field: String, delta: f64 },
    #[serde(rename = "xp")]
    Xp { stat: String, delta: f64 },
    #[serde(rename = "manager_relationship")]
    ManagerRelationship { delta: i64 },
    #[serde(rename = "finance")]
    Finance { delta: i64 },
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub effects: Vec<EventEffect>,
}

/// 선택지 버튼 색상용 — `effects`의 부호만 보고 판정(메시지함 UI가 굳이
/// 손으로 저작된 힌트 문자열을 파싱하지 않고 이미 구조화된 데이터에서
/// 바로 뽑아 쓰게, 대화 2026-07-22).
pub fn effect_tone(effects: &[EventEffect]) -> &'static str {
    let (mut pos, mut neg) = (false, false);
    for e in effects {
        let delta = match e {
            EventEffect::LiveState { delta, .. } | EventEffect::Xp { delta, .. } => *delta,
            EventEffect::ManagerRelationship { delta } | EventEffect::Finance { delta } => *delta as f64,
        };
        if delta > 0.0 {
            pos = true;
        }
        if delta < 0.0 {
            neg = true;
        }
    }
    match (pos, neg) {
        (true, true) => "mixed",
        (true, false) => "positive",
        (false, true) => "negative",
        (false, false) => "neutral",
    }
}

/// 선택지 버튼 아래 표시할 요약 문구(예: "사기 +10, 잔액 -500원").
pub fn effect_hint(effects: &[EventEffect]) -> String {
    effects
        .iter()
        .map(|e| match e {
            EventEffect::LiveState { field, delta } => format!("{field} {delta:+}"),
            EventEffect::Xp { stat, delta } => format!("{stat} {delta:+}"),
            EventEffect::ManagerRelationship { delta } => format!("감독 관계 {delta:+}"),
            EventEffect::Finance { delta } => format!("잔액 {delta:+}원"),
        })
        .collect::<Vec<_>>()
        .join(", ")
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

    #[test]
    fn finance_effect_deserializes_from_the_expected_json_shape() {
        let raw = r#"{"target":"finance","delta":-500}"#;
        let effect: EventEffect = serde_json::from_str(raw).unwrap();
        assert!(matches!(effect, EventEffect::Finance { delta: -500 }));
    }

    #[test]
    fn effect_tone_classifies_by_sign() {
        assert_eq!(effect_tone(&[EventEffect::LiveState { field: "사기".to_string(), delta: 10.0 }]), "positive");
        assert_eq!(effect_tone(&[EventEffect::Finance { delta: -500 }]), "negative");
        assert_eq!(
            effect_tone(&[EventEffect::LiveState { field: "사기".to_string(), delta: 10.0 }, EventEffect::Finance { delta: -500 }]),
            "mixed"
        );
        assert_eq!(effect_tone(&[]), "neutral");
    }

    #[test]
    fn effect_hint_joins_a_human_readable_summary() {
        let effects = vec![
            EventEffect::LiveState { field: "사기".to_string(), delta: 10.0 },
            EventEffect::Finance { delta: -500 },
        ];
        assert_eq!(effect_hint(&effects), "사기 +10, 잔액 -500원");
    }
}
