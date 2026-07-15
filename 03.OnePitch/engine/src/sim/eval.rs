//! [09_평가_시스템](../../../02_기획/육성코어/09_평가_시스템.md) — S~D 등급.
//! §5-2 "평가 대상 — 주인공만": NPC는 등급을 안 받고 능력치+누적 성적만으로
//! 감독 AI가 서열을 매긴다(그 감독 AI는 아직 없음 — 별도 스코프). 이 모듈은
//! 오직 주인공 등판 1회의 등급만 계산하는 **경기 단위**(§5-1) 평가만 다룬다
//! — 월/시즌 단위 종합(§5-1)은 다음 서브분 후보.

/// §3 등급 6단계 — 순서가 곧 우열.
pub const GRADES: [&str; 6] = ["S", "A", "B", "C", "D", "F"];

/// 기대 실점 — §2 "기대치 4요소" 중 **상대 타선 수준**(주 요소)과 **본인
/// 평소 실력**(가벼운 가중치, §2 "너무 가혹하면 에이스가 S를 못 받는
/// 역설")만 반영한 placeholder. **등판 상황(역할)** 요소는 이번 스코프가
/// 항상 "선발 완투"(match_session의 placeholder)라 애초에 상수라 반영할
/// 게 없고, **경기 중요도**는 포스트시즌이 아직 주인공 플로우에 연결 안
/// 돼 있어(축1 유형A는 지금 정규시즌 `schedule`에서만 옴) 상수(평범) 취급
/// — 정확한 가중치는 §6 "스탯 스케일 확정 후".
fn expected_runs(opponent_batting_avg: f64, own_skill: f64) -> f64 {
    let base = 2.0 + (opponent_batting_avg - 50.0) * 0.06;
    let skill_adjustment = (own_skill - 50.0) * 0.01;
    (base + skill_adjustment).max(0.3)
}

/// 등급 판정 — §1 "상대평가(기대치 대비)": 실점이 기대치보다 적을수록
/// 좋은 등급. `runs_allowed`는 주인공이 완투하는 이번 스코프에선 상대팀
/// 총득점과 같다(match_session이 계산해 넘겨줌). 등급 경계 자체는 §6
/// "구체 수치는 스탯 스케일 확정 후"라 placeholder.
pub fn grade_outing(runs_allowed: u32, opponent_batting_avg: f64, own_skill: f64) -> &'static str {
    let expected = expected_runs(opponent_batting_avg, own_skill);
    let ratio = runs_allowed as f64 / expected;
    if ratio <= 0.3 {
        "S"
    } else if ratio <= 0.6 {
        "A"
    } else if ratio <= 1.0 {
        "B"
    } else if ratio <= 1.5 {
        "C"
    } else if ratio <= 2.5 {
        "D"
    } else {
        "F"
    }
}

/// 등급→사기 증감 — §4 "사기에 직접 가감". 정확한 폭은 §6 미확정
/// placeholder.
pub fn morale_delta(grade: &str) -> f64 {
    match grade {
        "S" => 15.0,
        "A" => 8.0,
        "B" => 2.0,
        "C" => -2.0,
        "D" => -8.0,
        "F" => -15.0,
        _ => 0.0,
    }
}

/// 등급→주목도 증가폭 — §4 "경기별 등급이 누적되어... 리그성적 핵심
/// 입력값"([02_아마_고교](../../../02_기획/02_아마_고교.md) §D). 나쁜
/// 경기라고 주목도가 깎이진 않음(화제성은 실력과 별개라는 §4-1 명성
/// 구분과 결이 맞음 — 명성 자체 산출은 스코프 밖). 정확한 폭은 §6
/// 미확정 placeholder.
pub fn attention_gain(grade: &str) -> f64 {
    match grade {
        "S" => 10.0,
        "A" => 6.0,
        "B" => 3.0,
        "C" => 1.0,
        "D" => 0.5,
        _ => 0.2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutting_out_an_average_lineup_earns_a_top_grade() {
        let grade = grade_outing(0, 50.0, 50.0);
        assert!(matches!(grade, "S" | "A"), "shutout should grade very well, got {grade}");
    }

    #[test]
    fn allowing_far_more_than_expected_earns_a_failing_grade() {
        let grade = grade_outing(15, 50.0, 50.0);
        assert_eq!(grade, "F");
    }

    #[test]
    fn tougher_opponents_raise_the_bar_for_the_same_grade() {
        // 같은 3실점이라도 강타선 상대면 약타선 상대보다 더 후하게 평가돼야 한다.
        let vs_weak = grade_outing(3, 30.0, 50.0);
        let vs_strong = grade_outing(3, 80.0, 50.0);
        let rank = |g: &str| GRADES.iter().position(|x| *x == g).unwrap();
        assert!(rank(vs_strong) <= rank(vs_weak), "vs_strong={vs_strong} vs_weak={vs_weak}");
    }

    #[test]
    fn grade_ordering_is_monotonic_in_runs_allowed() {
        let grades: Vec<&str> = (0..20).map(|r| grade_outing(r, 50.0, 50.0)).collect();
        let rank = |g: &str| GRADES.iter().position(|x| *x == g).unwrap();
        for pair in grades.windows(2) {
            assert!(rank(pair[0]) <= rank(pair[1]), "grades should not improve as runs allowed increases: {grades:?}");
        }
    }

    #[test]
    fn morale_and_attention_move_in_the_expected_direction_across_grades() {
        for pair in GRADES.windows(2) {
            assert!(morale_delta(pair[0]) >= morale_delta(pair[1]), "morale should not increase from a better grade to a worse one");
            assert!(attention_gain(pair[0]) >= attention_gain(pair[1]), "attention should not increase from a better grade to a worse one");
        }
        assert!(attention_gain("F") > 0.0, "even a bad outing should gain some attention (exposure != skill, §4-1)");
    }
}
