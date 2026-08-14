extends GdUnitTestSuite

## 학사 — B-1.
##
## ⚠ **02는 대학 시험 트리거가 없어 학기 확정이 죽은 코드였다.** `EVT_HS_*`가
## 고교 전용이라 대학에서는 아예 안 떴고, 학점 확정 경로가 **영영 실행되지
## 않았다.**


func _school(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"major": "체육교육", "study_mode": "normal",
		"warning_level": 0}
	s.merge(over, true)
	return s


## n주 동안 그 방식으로 공부한다
func _study(school: Dictionary, weeks: int, mode: String) -> void:
	school["study_mode"] = mode
	for i in weeks:
		Academics.study_week(school)


# ── 규칙 파일 ─────────────────────────────────────────────────

## ⚠ **수치를 코드에 다시 적지 않는다.** 02 Phase 7에서 "표가 두 곳"으로
## 시작한 결함만 15건 나왔다
func test_the_rules_are_loaded() -> void:
	assert_bool(Academics.rules().is_empty()).override_failure_message(
		"학사 규칙이 비었다").is_false()
	assert_float(float(Academics.university()["gpa_max"])).is_equal(4.5)
	assert_float(float(Academics.university()["graduation_gpa"])).is_equal(2.0)
	assert_float(float(Academics.university()["warning_gpa"])).is_equal(1.75)
	assert_int(Academics.university()["warning_effects"].size()).is_equal(3)


## 시험 주는 고교·대학이 같다 — 02의 `week_eq` 값 그대로
func test_the_exam_weeks_match_02() -> void:
	assert_int(Academics.midterm_week()).is_equal(11)
	assert_int(Academics.final_week()).is_equal(38)
	assert_str(Academics.exam_at(11)).is_equal("midterm")
	assert_str(Academics.exam_at(38)).is_equal("final")
	assert_str(Academics.exam_at(12)).is_empty()

	# ⚠ **부르는 쪽이 주차를 세지 않게 한다.** 루트가 자기 손으로 세면
	# 그게 두 번째 정본이 되고 언젠가 달력과 갈라진다
	assert_str(Academics.exam_at_day(77)).override_failure_message(
		"77일차는 11주차다").is_equal("midterm")
	assert_str(Academics.exam_at_day(71)).is_equal("midterm")
	assert_str(Academics.exam_at_day(70)).is_empty()
	assert_str(Academics.exam_at_day(266)).is_equal("final")


# ── 주간 학업 ─────────────────────────────────────────────────

## 공부 방식이 품질을 가른다 — 안 가르면 고를 이유가 없다
func test_the_study_mode_sets_the_quality() -> void:
	assert_float(Academics.study_quality("focus")).is_equal(0.85)
	assert_float(Academics.study_quality("normal")).is_equal(0.55)
	assert_float(Academics.study_quality("rest")).is_equal(0.3)
	assert_float(Academics.study_quality("sleep")).is_equal(0.05)
	# 모르는 방식은 보통으로 본다 — 0으로 보면 옛 세이브가 통째로 유급된다
	assert_float(Academics.study_quality("몰라")).is_equal(0.55)


## ⚠ **주차 수도 같이 센다.** 합계만 쌓으면 기말(38주)이 중간(11주)보다
## 무조건 높은 학점이 된다
func test_it_counts_the_weeks_too() -> void:
	var s: Dictionary = _school()
	_study(s, 3, "focus")
	assert_int(int(s["study_weeks"])).is_equal(3)
	assert_float(float(s["study_quality_sum"])).is_equal_approx(2.55, 0.001)


func test_a_long_semester_is_not_worth_more() -> void:
	var short_term: Dictionary = _school()
	_study(short_term, 11, "focus")
	var long_term: Dictionary = _school()
	_study(long_term, 38, "focus")
	assert_float(Academics.semester_gpa(short_term)).override_failure_message(
		"학기가 길다고 학점이 높아진다").is_equal_approx(
		Academics.semester_gpa(long_term), 0.001)


# ── 학기 학점 ─────────────────────────────────────────────────

## 평균 품질 × 만점 × 전공 배수
func test_the_semester_gpa_is_the_average_quality() -> void:
	var s: Dictionary = _school()
	_study(s, 10, "focus")
	# 0.85 × 4.5 × 1.0 = 3.825
	assert_float(Academics.semester_gpa(s)).is_equal_approx(3.825, 0.001)


## ⚠ **일반전공은 학점이 1.5배다.** 전공이 전부 훈련효율만 주면 고를 이유가 없다
func test_the_major_changes_the_gpa() -> void:
	var plain: Dictionary = _school({"major": "일반전공"})
	var sport: Dictionary = _school({"major": "체육교육"})
	_study(plain, 10, "normal")
	_study(sport, 10, "normal")
	assert_float(Academics.semester_gpa(plain)).override_failure_message(
		"일반전공이 학점 이득을 못 본다").is_greater(Academics.semester_gpa(sport))


func test_no_weeks_is_no_gpa() -> void:
	assert_float(Academics.semester_gpa(_school())).is_equal(0.0)


# ── 경고 ──────────────────────────────────────────────────────

## 못 넘으면 +1, 넘으면 −1
func test_the_warning_goes_both_ways() -> void:
	assert_int(Academics.next_warning_level(0, 1.0)).is_equal(1)
	assert_int(Academics.next_warning_level(1, 1.0)).is_equal(2)
	assert_int(Academics.next_warning_level(2, 3.0)).is_equal(1)


## ⚠ **내려가는 길이 있어야 한다.** 한 번 받으면 영영 안 풀리면 한 학기
## 실수로 커리어가 끝난다
func test_a_good_semester_lifts_the_warning() -> void:
	assert_int(Academics.next_warning_level(1, 4.0)).is_equal(0)
	# 0 아래로는 안 간다
	assert_int(Academics.next_warning_level(0, 4.0)).is_equal(0)


## 경계는 1.75다 — 딱 맞으면 안 걸린다
func test_the_line_is_one_seventy_five() -> void:
	assert_int(Academics.next_warning_level(0, 1.75)).is_equal(0)
	assert_int(Academics.next_warning_level(0, 1.74)).is_equal(1)


func test_the_effects_stack_by_level() -> void:
	assert_str(String(Academics.warning_effect(1)["label"])).is_equal("학사 경고")
	assert_str(String(Academics.warning_effect(2)["label"])).is_equal("출전 정지")
	assert_str(String(Academics.warning_effect(3)["label"])).is_equal("유급")
	# 단계를 넘어가도 마지막 것이 남는다 — 4단계가 없다고 효과가 사라지면 안 된다
	assert_str(String(Academics.warning_effect(5)["label"])).is_equal("유급")
	# 0단계는 아무 효과가 없다
	assert_bool(Academics.warning_effect(0).is_empty()).is_true()


## ⚠ **경고가 훈련을 깎는다.** 그게 학사의 무게다 — 안 깎으면 공부를
## 아예 안 하는 게 늘 최선이 된다
func test_a_warning_costs_training() -> void:
	assert_float(Academics.training_mod(_school({"warning_level": 1,
		"major": "일반전공"}))).is_equal_approx(0.9, 0.001)
	assert_float(Academics.training_mod(_school({"warning_level": 2,
		"major": "일반전공"}))).is_equal_approx(0.85, 0.001)
	assert_float(Academics.training_mod(_school({"major": "일반전공"}))) \
		.is_equal_approx(1.0, 0.001)


## 전공 보너스는 경고와 별개 축이다
func test_the_major_bonus_is_a_separate_axis() -> void:
	assert_float(Academics.training_mod(_school({"major": "스포츠과학"}))) \
		.is_equal_approx(1.03, 0.001)
	assert_float(Academics.training_mod(_school({"major": "스포츠과학",
		"warning_level": 1}))).is_equal_approx(0.93, 0.001)


## 2단계부터 경기에 못 나간다
func test_games_are_blocked_from_level_two() -> void:
	assert_bool(Academics.blocks_games(_school({"warning_level": 1}))).is_false()
	assert_bool(Academics.blocks_games(_school({"warning_level": 2}))).is_true()
	assert_bool(Academics.blocks_games(_school({"warning_level": 3}))).is_true()


# ── 학기 확정 ─────────────────────────────────────────────────

func test_closing_a_semester_records_everything() -> void:
	var s: Dictionary = _school()
	_study(s, 10, "focus")
	var r: Dictionary = Academics.close_semester(s)

	assert_float(float(r["gpa"])).is_equal_approx(3.825, 0.001)
	assert_int(int(r["warning_level"])).is_equal(0)
	assert_float(float(s["gpa"])).is_equal_approx(3.825, 0.001)
	assert_int(int(s["gpa_terms"])).is_equal(1)


## ⚠ **다음 학기를 위해 비운다.** 안 비우면 평균이 학기마다 희석돼서
## 나중 학기의 공부가 점점 의미를 잃는다
func test_the_next_semester_starts_clean() -> void:
	var s: Dictionary = _school()
	_study(s, 10, "focus")
	Academics.close_semester(s)
	assert_int(int(s["study_weeks"])).is_equal(0)
	assert_float(float(s["study_quality_sum"])).is_equal(0.0)

	# 두 번째 학기를 놀면 그 학기 학점만 낮아야 한다
	_study(s, 10, "sleep")
	assert_float(Academics.semester_gpa(s)).is_less(1.0)


## ⚠ **누적 학점을 쌓는다.** 학기 학점만 두면 마지막 학기만 잘 봐도 졸업한다
func test_the_gpa_accumulates_across_semesters() -> void:
	var s: Dictionary = _school()
	_study(s, 10, "sleep")
	Academics.close_semester(s)
	_study(s, 10, "focus")
	Academics.close_semester(s)

	assert_int(int(s["gpa_terms"])).is_equal(2)
	# 두 학기 평균 — 마지막 학기 값(3.825)보다 낮아야 한다
	assert_float(float(s["gpa"])).override_failure_message(
		"마지막 학기만 보고 있다").is_less(3.0)


## 두 학기를 못 넘기면 출전 정지까지 간다
func test_two_bad_semesters_stop_the_games() -> void:
	var s: Dictionary = _school()
	for i in 2:
		_study(s, 10, "sleep")
		Academics.close_semester(s)
	assert_int(int(s["warning_level"])).is_equal(2)
	assert_bool(Academics.blocks_games(s)).is_true()


func test_the_close_reports_the_label() -> void:
	var s: Dictionary = _school()
	_study(s, 10, "sleep")
	var r: Dictionary = Academics.close_semester(s)
	assert_str(String(r["label"])).is_equal("학사 경고")
	assert_bool(bool(r["blocked"])).is_false()


# ── 졸업 ──────────────────────────────────────────────────────

## 누적 2.0을 넘어야 졸업이다
func test_graduation_needs_the_cumulative_gpa() -> void:
	var good: Dictionary = _school()
	_study(good, 10, "normal")
	Academics.close_semester(good)
	assert_bool(Academics.can_graduate(good)).is_true()

	var bad: Dictionary = _school()
	_study(bad, 10, "sleep")
	Academics.close_semester(bad)
	assert_bool(Academics.can_graduate(bad)).override_failure_message(
		"학점 %.2f로 졸업했다" % bad["gpa"]).is_false()


# ── 전공 ──────────────────────────────────────────────────────

func test_the_three_majors_are_there() -> void:
	assert_array(Academics.majors()).is_equal(["스포츠과학", "일반전공", "체육교육"])


## ⚠ **전공마다 다른 축을 준다.** 전부 훈련효율만 주면 고를 이유가 없다
func test_each_major_gives_a_different_axis() -> void:
	assert_bool(Academics.major_of("체육교육")["xp_bonus"].has("mentality")).is_true()
	assert_bool(Academics.major_of("스포츠과학")["xp_bonus"].has("recovery")).is_true()
	assert_float(float(Academics.major_of("스포츠과학")["injury_mod"])).is_less(1.0)
	assert_float(float(Academics.major_of("일반전공")["gpa_gain_mult"])).is_greater(1.0)

	# ⚠ **읽는 함수까지 본다.** 규칙 파일만 보면 값이 있어도 **아무도 안 읽는**
	# 상태를 못 잡는다 — 02가 구단 성향에서 겪은 것이 정확히 그 형태다
	assert_float(Academics.injury_mod(_school({"major": "스포츠과학"}))) \
		.override_failure_message("스포츠과학의 부상 배수를 안 읽는다").is_less(1.0)
	assert_float(Academics.injury_mod(_school({"major": "체육교육"}))).is_equal(1.0)


func test_an_unknown_major_is_neutral() -> void:
	assert_float(Academics.training_mod(_school({"major": "없는전공"}))).is_equal(1.0)
	assert_float(Academics.injury_mod(_school({"major": "없는전공"}))).is_equal(1.0)
	assert_bool(Academics.xp_bonus(_school({"major": "없는전공"})).is_empty()).is_true()
