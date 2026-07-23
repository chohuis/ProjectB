//! 학업 시스템(대화 2026-07-26) — 이 게임의 이전 Svelte+Electron 프로토타입
//! (`02.SvelteElectron/apps/ui/src/shared/utils/academicsEngine.ts` +
//! `packages/engine-native/src/week_engine.rs::calc_exam_result`)을 그대로
//! 이식. 과목 5종(국어/영어/수학/사회/과학)·주간 학습모드 4종·중간/기말고사·
//! 대학 전공 선택(영구 보너스) — 수치는 전부 원본 프로토타입 그대로 포팅.

use rand::Rng;
use serde_json::{json, Value};

pub const ACADEMIC_SUBJECTS: [&str; 5] = ["kor", "eng", "math", "soc", "sci"];
pub const STUDY_MODES: [&str; 4] = ["focus", "normal", "rest", "sleep"];
pub const UNIVERSITY_MAJORS: [&str; 3] = ["체육교육", "스포츠과학", "일반전공"];

/// 중간/기말고사가 열리는 시즌 내 주차 — `academicsEngine.ts`/캘린더
/// 이벤트(`EVT_*_W12_MIDTERM`, `EVT_*_W4x_FINAL`)의 주차를 그대로 옮김.
pub const MIDTERM_WEEK: i64 = 12;
pub const FINAL_WEEK: i64 = 42;

pub fn is_exam_week(week_of_season: i64) -> bool {
    week_of_season == MIDTERM_WEEK || week_of_season == FINAL_WEEK
}

/// 다음 시험까지 (라벨, 남은 주 수) — `academicsEngine.ts::weeksUntilNextExam`
/// 그대로(시즌을 52주로 근사하는 것까지 포함).
pub fn weeks_until_next_exam(week_of_season: i64) -> (&'static str, i64) {
    if week_of_season < MIDTERM_WEEK {
        ("중간고사", MIDTERM_WEEK - week_of_season)
    } else if week_of_season < FINAL_WEEK {
        ("기말고사", FINAL_WEEK - week_of_season)
    } else {
        ("다음 시즌 중간고사", 52 - week_of_season + MIDTERM_WEEK)
    }
}

/// 주간 학습모드 하나의 효과 — `academicsEngine.ts`의
/// `STUDY_MODE_EFFECTS` 그대로.
pub struct StudyModeEffect {
    pub exam_gain: f64,
    /// 그 주 능력치 훈련 효율에 곱해지는 배율(1.0=변화 없음, 작을수록
    /// 훈련 효율이 깎임 — 집중 수업은 0.70으로 가장 크게 깎임).
    pub efficiency_mod: f64,
    pub attendance_delta: f64,
    pub assignment_delta: f64,
    /// 석차백분율 변화 — 값이 낮을수록 성적이 좋다는 뜻이라(1=상위 1%)
    /// 음수면 성적 개선, 양수면 악화.
    pub percentile_delta: f64,
    pub warning_increment: bool,
}

pub fn study_mode_effect(mode: &str) -> StudyModeEffect {
    match mode {
        "focus" => StudyModeEffect {
            exam_gain: 8.0,
            efficiency_mod: 0.70,
            attendance_delta: 1.0,
            assignment_delta: 2.0,
            percentile_delta: -2.0,
            warning_increment: false,
        },
        "rest" => StudyModeEffect {
            exam_gain: 1.0,
            efficiency_mod: 1.00,
            attendance_delta: -3.0,
            assignment_delta: -6.0,
            percentile_delta: 4.0,
            warning_increment: false,
        },
        "sleep" => StudyModeEffect {
            exam_gain: 0.0,
            efficiency_mod: 1.05,
            attendance_delta: -8.0,
            assignment_delta: -9.0,
            percentile_delta: 7.0,
            warning_increment: true,
        },
        // "normal" 및 알 수 없는 값의 기본값.
        _ => StudyModeEffect {
            exam_gain: 4.0,
            efficiency_mod: 0.85,
            attendance_delta: 0.0,
            assignment_delta: 1.0,
            percentile_delta: -1.0,
            warning_increment: false,
        },
    }
}

/// 대학 전공별 영구 보너스 — (훈련 효율 보너스, 시험 점수 획득 배율).
/// `academicsEngine.ts`의 `UNIVERSITY_MAJORS`/`getUniversityEffBonus`/
/// `getUniversityExamGainMult` 그대로 — 체육교육/스포츠과학은 훈련 효율,
/// 일반전공만 시험 점수 획득 +50%(효율 보너스는 없음).
pub fn university_major_effects(major: &str) -> (f64, f64) {
    match major {
        "체육교육" => (0.05, 1.0),
        "스포츠과학" => (0.08, 1.0),
        "일반전공" => (0.00, 1.5),
        _ => (0.0, 1.0),
    }
}

fn clamp_round1(v: f64, lo: f64, hi: f64) -> f64 {
    (v.clamp(lo, hi) * 10.0).round() / 10.0
}

/// 고교 입학 시 초기 과목 성적 — `game.ts:170-174` 그대로.
pub fn initial_hs_subject_scores() -> Value {
    json!({
        "kor": {"percentile": 13.0, "attendance": 96.0, "assignment": 90.0},
        "eng": {"percentile": 18.0, "attendance": 93.0, "assignment": 84.0},
        "math": {"percentile": 29.0, "attendance": 89.0, "assignment": 81.0},
        "soc": {"percentile": 34.0, "attendance": 95.0, "assignment": 92.0},
        "sci": {"percentile": 41.0, "attendance": 87.0, "assignment": 79.0},
    })
}

/// 대학 진학 시 과목 성적 리셋 — `game.ts:1116-1122` 그대로.
pub fn initial_university_subject_scores() -> Value {
    json!({
        "kor": {"percentile": 28.0, "attendance": 93.0, "assignment": 85.0},
        "eng": {"percentile": 32.0, "attendance": 90.0, "assignment": 82.0},
        "math": {"percentile": 45.0, "attendance": 87.0, "assignment": 78.0},
        "soc": {"percentile": 38.0, "attendance": 91.0, "assignment": 80.0},
        "sci": {"percentile": 50.0, "attendance": 85.0, "assignment": 76.0},
    })
}

/// 주간 학습모드 효과를 과목 5개 전부에 적용 — 출석률·과제이행률
/// [0,100], 석차백분율 [1,100]로 클램프(1자리 반올림). 시험 누적점수
/// 획득분(전공 배율 적용 후, 100 상한)을 반환해서 호출부가
/// `exam_accum_score`에 더하게 한다.
pub fn apply_weekly_study(subject_scores: &mut Value, mode: &str, exam_gain_mult: f64, current_accum: f64) -> f64 {
    let effect = study_mode_effect(mode);
    if !subject_scores.is_object() {
        *subject_scores = json!({});
    }
    let obj = subject_scores.as_object_mut().expect("just ensured object");
    for subject in ACADEMIC_SUBJECTS {
        let entry = obj.entry(subject).or_insert_with(|| json!({"percentile": 50.0, "attendance": 100.0, "assignment": 100.0}));
        let percentile = entry.get("percentile").and_then(|v| v.as_f64()).unwrap_or(50.0);
        let attendance = entry.get("attendance").and_then(|v| v.as_f64()).unwrap_or(100.0);
        let assignment = entry.get("assignment").and_then(|v| v.as_f64()).unwrap_or(100.0);
        *entry = json!({
            "percentile": clamp_round1(percentile + effect.percentile_delta, 1.0, 100.0),
            "attendance": clamp_round1(attendance + effect.attendance_delta, 0.0, 100.0),
            "assignment": clamp_round1(assignment + effect.assignment_delta, 0.0, 100.0),
        });
    }
    let raw_gain = effect.exam_gain * exam_gain_mult;
    raw_gain.min((100.0 - current_accum).max(0.0)).max(0.0)
}

/// 누적점수(0~100)를 9등급 상대평가로 — `week_engine.rs::calc_exam_result`
/// 의 등급 커트라인 그대로.
pub fn raw_to_grade(raw: u32) -> u32 {
    if raw >= 90 {
        1
    } else if raw >= 80 {
        2
    } else if raw >= 65 {
        3
    } else if raw >= 50 {
        4
    } else if raw >= 38 {
        5
    } else if raw >= 28 {
        6
    } else if raw >= 18 {
        7
    } else if raw >= 10 {
        8
    } else {
        9
    }
}

pub fn risk_level_for_grade(grade: u32) -> &'static str {
    if grade <= 6 {
        "ok"
    } else if grade == 7 {
        "warn"
    } else {
        "danger"
    }
}

pub fn morale_delta_for_grade(grade: u32) -> i32 {
    match grade {
        1 => 12,
        2 => 8,
        3 | 4 => 4,
        5 | 6 => 0,
        7 => -8,
        _ => -15,
    }
}

pub struct ExamResult {
    pub grade: u32,
    pub raw: u32,
    pub risk_level: &'static str,
    pub morale_delta: i32,
    /// 9등급(최하)이면 그 주 출전 자격 정지 — `eligibility_blocked = grade >= 9`.
    pub eligibility_blocked: bool,
}

/// 중간/기말고사 채점 — 누적 시험점수에서 경고 횟수×8점을 깎고 0~24점
/// 랜덤을 더한 뒤 0~100으로 클램프한 게 최종 원점수(`week_engine.rs`
/// 그대로).
pub fn calc_exam_result(rng: &mut impl Rng, accum_score: f64, warning_count: i64) -> ExamResult {
    let penalty = warning_count * 8;
    let rand_val: i64 = rng.gen_range(0..25);
    let raw = (accum_score as i64 - penalty + rand_val).clamp(0, 100) as u32;
    let grade = raw_to_grade(raw);
    ExamResult {
        grade,
        raw,
        risk_level: risk_level_for_grade(grade),
        morale_delta: morale_delta_for_grade(grade),
        eligibility_blocked: grade >= 9,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn study_mode_effects_match_the_prototype_exactly() {
        let focus = study_mode_effect("focus");
        assert_eq!((focus.exam_gain, focus.efficiency_mod, focus.attendance_delta, focus.assignment_delta, focus.percentile_delta), (8.0, 0.70, 1.0, 2.0, -2.0));
        assert!(!focus.warning_increment);

        let normal = study_mode_effect("normal");
        assert_eq!((normal.exam_gain, normal.efficiency_mod, normal.attendance_delta, normal.assignment_delta, normal.percentile_delta), (4.0, 0.85, 0.0, 1.0, -1.0));

        let rest = study_mode_effect("rest");
        assert_eq!((rest.exam_gain, rest.efficiency_mod, rest.attendance_delta, rest.assignment_delta, rest.percentile_delta), (1.0, 1.00, -3.0, -6.0, 4.0));

        let sleep = study_mode_effect("sleep");
        assert_eq!((sleep.exam_gain, sleep.efficiency_mod, sleep.attendance_delta, sleep.assignment_delta, sleep.percentile_delta), (0.0, 1.05, -8.0, -9.0, 7.0));
        assert!(sleep.warning_increment, "sleep is the only mode that increments the warning count");
    }

    #[test]
    fn university_major_effects_match_the_prototype_exactly() {
        assert_eq!(university_major_effects("체육교육"), (0.05, 1.0));
        assert_eq!(university_major_effects("스포츠과학"), (0.08, 1.0));
        assert_eq!(university_major_effects("일반전공"), (0.00, 1.5));
    }

    #[test]
    fn apply_weekly_study_updates_all_five_subjects_and_clamps() {
        let mut scores = initial_hs_subject_scores();
        // sleep 모드로 여러 주 반복하면 출석률·과제이행률이 0 밑으로 못 내려감.
        for _ in 0..20 {
            apply_weekly_study(&mut scores, "sleep", 1.0, 0.0);
        }
        for subject in ACADEMIC_SUBJECTS {
            let e = &scores[subject];
            assert!(e["attendance"].as_f64().unwrap() >= 0.0);
            assert!(e["assignment"].as_f64().unwrap() >= 0.0);
            assert!(e["percentile"].as_f64().unwrap() <= 100.0);
        }
    }

    #[test]
    fn apply_weekly_study_exam_gain_is_capped_at_the_hundred_point_ceiling() {
        let mut scores = initial_hs_subject_scores();
        let gain = apply_weekly_study(&mut scores, "focus", 1.0, 97.0);
        assert_eq!(gain, 3.0, "97 누적 + 8점 획득분은 100을 넘으니 3만 인정돼야 함");
    }

    #[test]
    fn raw_to_grade_matches_the_documented_cutoffs() {
        assert_eq!(raw_to_grade(100), 1);
        assert_eq!(raw_to_grade(90), 1);
        assert_eq!(raw_to_grade(89), 2);
        assert_eq!(raw_to_grade(80), 2);
        assert_eq!(raw_to_grade(79), 3);
        assert_eq!(raw_to_grade(65), 3);
        assert_eq!(raw_to_grade(64), 4);
        assert_eq!(raw_to_grade(50), 4);
        assert_eq!(raw_to_grade(49), 5);
        assert_eq!(raw_to_grade(38), 5);
        assert_eq!(raw_to_grade(37), 6);
        assert_eq!(raw_to_grade(28), 6);
        assert_eq!(raw_to_grade(27), 7);
        assert_eq!(raw_to_grade(18), 7);
        assert_eq!(raw_to_grade(17), 8);
        assert_eq!(raw_to_grade(10), 8);
        assert_eq!(raw_to_grade(9), 9);
        assert_eq!(raw_to_grade(0), 9);
    }

    #[test]
    fn risk_level_and_eligibility_follow_grade() {
        assert_eq!(risk_level_for_grade(6), "ok");
        assert_eq!(risk_level_for_grade(7), "warn");
        assert_eq!(risk_level_for_grade(8), "danger");
        assert_eq!(risk_level_for_grade(9), "danger");
    }

    #[test]
    fn calc_exam_result_applies_warning_penalty_and_stays_in_range() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        // 경고 3회 * 8점 = 24점 페널티 — 누적 100점이어도 최대 raw는 100(랜덤 0~24 더해도 클램프).
        let result = calc_exam_result(&mut rng, 100.0, 3);
        assert!(result.raw <= 100);
        assert_eq!(result.eligibility_blocked, result.grade >= 9);

        // 누적 0점 + 경고 있으면 raw는 항상 0(음수 클램프).
        let mut rng2 = ChaCha8Rng::seed_from_u64(2);
        let zero_result = calc_exam_result(&mut rng2, 0.0, 5);
        assert_eq!(zero_result.raw, 0);
        assert_eq!(zero_result.grade, 9);
        assert!(zero_result.eligibility_blocked);
    }

    #[test]
    fn is_exam_week_only_matches_midterm_and_final() {
        assert!(is_exam_week(MIDTERM_WEEK));
        assert!(is_exam_week(FINAL_WEEK));
        assert!(!is_exam_week(1));
        assert!(!is_exam_week(30));
        assert!(!is_exam_week(52));
    }

    #[test]
    fn weeks_until_next_exam_counts_down_to_whichever_is_next() {
        // `w < MIDTERM`/`w < FINAL` 경계 그대로(`academicsEngine.ts` 원본과
        // 동일) — 시험 당일(w == 주차)엔 이미 그 시험을 지난 걸로 치고 다음
        // 시험으로 넘어간다.
        assert_eq!(weeks_until_next_exam(1), ("중간고사", MIDTERM_WEEK - 1));
        assert_eq!(weeks_until_next_exam(MIDTERM_WEEK - 1), ("중간고사", 1));
        assert_eq!(weeks_until_next_exam(MIDTERM_WEEK), ("기말고사", FINAL_WEEK - MIDTERM_WEEK));
        assert_eq!(weeks_until_next_exam(FINAL_WEEK - 1), ("기말고사", 1));
        assert_eq!(weeks_until_next_exam(FINAL_WEEK), ("다음 시즌 중간고사", 52 - FINAL_WEEK + MIDTERM_WEEK));
    }
}
