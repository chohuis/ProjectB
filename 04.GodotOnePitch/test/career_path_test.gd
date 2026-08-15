extends GdUnitTestSuite

## 진로 — 학적 전이 · 대학 요건 · 입시 판정. B-6a.
##
## ⚠ **02는 요건 표를 손으로 적어 뒀는데 그중 실재하는 대학이 하나뿐이었다.**
## 나머지 49개가 `?? 9` / `?? 0`으로 떨어져 **전부 무조건 합격**이었다.
## 그래서 요건은 팀 데이터의 전력★에서 낸다 — 팀이 늘어도 따라온다.
##
## 실재 팀으로 검사한다. 04 대학 50팀의 전력★ 분포는
## ★5 하나(한류대) · ★4 일곱 · ★3 열다섯 · ★2 스물셋 · ★1 넷이다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


# ── 전력★ → 등급 ─────────────────────────────────────────────

func test_the_power_star_becomes_a_tier() -> void:
	assert_str(CareerPath.tier_of_power(5)).is_equal("S")
	assert_str(CareerPath.tier_of_power(4)).is_equal("A")
	assert_str(CareerPath.tier_of_power(3)).is_equal("B")
	assert_str(CareerPath.tier_of_power(2)).is_equal("C")
	assert_str(CareerPath.tier_of_power(1)).is_equal("D")


## ⚠ **등급 없는 대학을 만들지 않는다.** 02는 표에 없는 팀이 `?? 9`로 떨어져
## 무조건 합격이었다 — 범위 밖은 가운데(B)로 보낸다
func test_a_team_without_a_power_star_still_gets_a_tier() -> void:
	assert_str(CareerPath.tier_of_power(null)).override_failure_message(
		"전력★이 없는 팀이 등급을 못 받았다 — 02가 여기서 49개 대학을 놓쳤다"
	).is_equal("B")
	assert_str(CareerPath.tier_of_power(9)).is_equal("S")
	assert_str(CareerPath.tier_of_power(0)).is_equal("D")


func test_the_tiers_carry_their_requirements() -> void:
	assert_int(int(CareerPath.requirement_of_power(5)["min_academic_grade"])).is_equal(4)
	assert_int(int(CareerPath.requirement_of_power(5)["min_baseball_score"])).is_equal(40)
	assert_int(int(CareerPath.requirement_of_power(1)["min_academic_grade"])).is_equal(9)
	assert_int(int(CareerPath.requirement_of_power(1)["min_baseball_score"])).is_equal(0)
	assert_str(String(CareerPath.requirement_of_power(3)["tier"])).is_equal("B")


## ⚠ **C의 야구 점수 문턱이 0이 아니다.** 50팀 중 23팀이 C라 0으로 두면
## 절반이 무조건 합격이다
func test_the_c_tier_still_asks_for_something() -> void:
	assert_int(int(CareerPath.requirement_of_power(2)["min_baseball_score"])
		).override_failure_message(
		"C등급 문턱이 0이다 — 대학 절반이 무조건 합격이 된다").is_greater(0)


func test_a_higher_tier_asks_for_more() -> void:
	var prev_academic: int = 99
	var prev_baseball: int = -1
	for power in [1, 2, 3, 4, 5]:
		var req: Dictionary = CareerPath.requirement_of_power(power)
		# 학업은 등급이라 **낮을수록 어렵다**
		assert_int(int(req["min_academic_grade"])).override_failure_message(
			"전력★ %d 의 학업 문턱이 아래 등급보다 느슨하다" % power).is_less(prev_academic)
		assert_int(int(req["min_baseball_score"])).override_failure_message(
			"전력★ %d 의 야구 문턱이 아래 등급보다 낮다" % power).is_greater(prev_baseball)
		prev_academic = int(req["min_academic_grade"])
		prev_baseball = int(req["min_baseball_score"])


func test_the_tier_decides_the_scout_bonus() -> void:
	assert_int(CareerPath.scout_bonus_of_power(5)).is_equal(15)
	assert_int(CareerPath.scout_bonus_of_power(4)).is_equal(8)
	assert_int(CareerPath.scout_bonus_of_power(3)).is_equal(3)
	assert_int(CareerPath.scout_bonus_of_power(2)).is_equal(0)
	# 약한 대학에 가면 스카우트가 덜 본다 — 어디를 가든 같으면 고를 이유가 없다
	assert_int(CareerPath.scout_bonus_of_power(1)).is_less(0)


# ── 학업 등급 ─────────────────────────────────────────────────

## ⚠ **학점은 높을수록 좋고 등급은 낮을수록 좋다** — 방향이 반대다.
## 뒤집어 읽으면 만점자가 9등급이 된다.
##
## 값은 02의 두 표(석차→등급 · 석차→학점)를 합친 것이다
func test_the_gpa_becomes_a_nine_step_grade() -> void:
	assert_int(CareerPath.grade_of_gpa(4.5)).is_equal(1)
	assert_int(CareerPath.grade_of_gpa(4.49)).is_equal(2)
	assert_int(CareerPath.grade_of_gpa(4.2)).is_equal(2)
	assert_int(CareerPath.grade_of_gpa(3.8)).is_equal(3)
	assert_int(CareerPath.grade_of_gpa(3.5)).is_equal(4)
	assert_int(CareerPath.grade_of_gpa(3.0)).is_equal(5)
	assert_int(CareerPath.grade_of_gpa(2.5)).is_equal(6)
	assert_int(CareerPath.grade_of_gpa(2.0)).is_equal(7)
	assert_int(CareerPath.grade_of_gpa(1.5)).is_equal(8)
	assert_int(CareerPath.grade_of_gpa(1.49)).is_equal(9)
	assert_int(CareerPath.grade_of_gpa(0.0)).is_equal(9)


func test_a_better_gpa_never_gives_a_worse_grade() -> void:
	var prev: int = 99
	for i in range(0, 46):
		var gpa: float = float(i) / 10.0
		var g: int = CareerPath.grade_of_gpa(gpa)
		assert_int(g).override_failure_message(
			"학점 %.1f에서 등급이 거꾸로 갔다 (%d → %d)" % [gpa, prev, g]).is_less_equal(prev)
		prev = g


## 졸업 기준(2.0)이 중간 언저리다 — 그보다 못하면 대학 문이 좁아진다
func test_the_graduation_line_is_a_middling_grade() -> void:
	assert_int(CareerPath.grade_of_gpa(2.0)).is_greater(4)
	assert_int(CareerPath.grade_of_gpa(2.0)).is_less(9)


# ── 고교 야구 점수 ────────────────────────────────────────────

func _record(league: String, ps: String, awards: int = 0) -> Dictionary:
	var a: Array = []
	for i in range(awards):
		a.append({"id": "AWARD_%d" % i, "label": "상 %d" % i})
	return {"year": 2026, "league_id": league, "ps_result": ps, "awards": a}


func test_the_postseason_result_is_the_baseball_score() -> void:
	assert_int(CareerPath.hs_baseball_score([_record("LEAGUE_HIGHSCHOOL", "champion")])
		).is_equal(100)
	assert_int(CareerPath.hs_baseball_score([_record("LEAGUE_HIGHSCHOOL", "runner_up")])
		).is_equal(60)
	assert_int(CareerPath.hs_baseball_score([_record("LEAGUE_HIGHSCHOOL", "semi_final")])
		).is_equal(30)
	assert_int(CareerPath.hs_baseball_score([_record("LEAGUE_HIGHSCHOOL", "not_qualified")])
		).is_equal(10)


func test_an_award_is_worth_thirty_over_two() -> void:
	var awarded: int = CareerPath.hs_baseball_score(
		[_record("LEAGUE_HIGHSCHOOL", "not_qualified", 2)])
	assert_int(awarded).override_failure_message(
		"수상이 점수에 안 실렸다").is_equal(10 + 30)


## ⚠ **고교 기록만 센다.** 대학 우승을 고교 입시 점수에 넣으면 시간이 거꾸로 간다
func test_only_the_high_school_seasons_count() -> void:
	var mixed: Array = [
		_record("LEAGUE_HIGHSCHOOL", "not_qualified"),
		_record("LEAGUE_UNIVERSITY", "champion"),
		_record("LEAGUE_KBL", "champion"),
	]
	assert_int(CareerPath.hs_baseball_score(mixed)).override_failure_message(
		"고교 아닌 기록이 입시 점수에 섞였다").is_equal(10)


func test_three_high_school_seasons_add_up() -> void:
	var three: Array = [
		_record("LEAGUE_HIGHSCHOOL", "champion", 1),
		_record("LEAGUE_HIGHSCHOOL", "runner_up"),
		_record("LEAGUE_HIGHSCHOOL", "not_qualified"),
	]
	assert_int(CareerPath.hs_baseball_score(three)).is_equal(100 + 15 + 60 + 10)


func test_an_unknown_postseason_result_scores_nothing() -> void:
	assert_int(CareerPath.hs_baseball_score([_record("LEAGUE_HIGHSCHOOL", "")])).is_equal(0)


# ── 독립리그 컷 ───────────────────────────────────────────────

## ⚠ **팀의 전력★이 컷을 정한다.** 02 엔진은 지망 순서로만 정해서
## **1지망에 약팀을 써도 컷이 52**였다 — 어느 팀을 쓰든 같았다
func test_the_independent_cut_comes_from_the_team() -> void:
	assert_int(CareerPath.indie_cut_of_power(4)).is_equal(54)
	assert_int(CareerPath.indie_cut_of_power(3)).is_equal(49)
	assert_int(CareerPath.indie_cut_of_power(2)).is_equal(44)
	assert_int(CareerPath.indie_cut_of_power(1)).is_equal(39)
	assert_int(CareerPath.indie_cut_of_power(5)).override_failure_message(
		"전력★ 5인 독립팀이 컷을 못 받았다").is_equal(54)


func test_a_stronger_independent_team_is_harder_to_enter() -> void:
	assert_int(CareerPath.indie_cut_of_power(4)).is_greater(
		CareerPath.indie_cut_of_power(1))


## ⚠ **상무는 병역 경로다.** 안 빼면 고교생이 상무에 원서를 넣는다
func test_sangmu_is_not_a_place_you_apply_to() -> void:
	assert_bool(CareerPath.is_applicable_independent("TEAM_IND_SANGMU_PHOENIX")
		).override_failure_message("고교생이 상무에 지원할 수 있다").is_false()
	assert_bool(CareerPath.is_applicable_independent("TEAM_IND_SEOUL_RAVENS")).is_true()


# ── 학적 전이 ─────────────────────────────────────────────────

func test_a_high_schooler_can_go_anywhere_forward() -> void:
	for to in ["university", "independent", "pro_kbl", "military"]:
		assert_bool(CareerPath.can_transition("highschool", to)
			).override_failure_message("고교 → %s 가 막혔다" % to).is_true()


## ⚠ **학적은 되돌릴 수 없다.** 02는 `applyDraftDecision`이 어떤 단계든
## 검증 없이 받아서 **대학 두 번 입학**이 실제로 성립했다
func test_you_cannot_enter_a_university_twice() -> void:
	assert_bool(CareerPath.can_transition("university", "university")
		).override_failure_message("같은 단계 유지는 전이가 아니다").is_true()
	assert_bool(CareerPath.can_transition("independent", "university")
		).override_failure_message("독립 소속이 대학에 입학했다").is_false()
	assert_bool(CareerPath.can_transition("pro_kbl", "university")).is_false()


func test_nobody_goes_back_to_high_school() -> void:
	for from in ["university", "independent", "pro", "pro_kbl", "military"]:
		assert_bool(CareerPath.can_transition(from, "highschool")
			).override_failure_message("%s 에서 고교로 돌아갔다" % from).is_false()


## 프로끼리는 오간다 — 해외 진출·역수입이 그 길이다
func test_the_pro_leagues_are_open_to_each_other() -> void:
	for to in ["pro_kbl", "pro_abl", "pro_jbl", "independent"]:
		assert_bool(CareerPath.can_transition("pro_kbl", to)
			).override_failure_message("프로 → %s 가 막혔다" % to).is_true()


## ⚠ **전역은 이 표를 안 탄다.** 입대 전 단계를 복원하는 별도 경로다 —
## 표에 넣으면 "군인 → 대학"이 열린다
func test_discharge_does_not_go_through_the_table() -> void:
	for to in ["highschool", "university", "independent", "pro_kbl"]:
		assert_bool(CareerPath.can_transition("military", to)
			).override_failure_message("군 복무 중에 %s 로 전이됐다" % to).is_false()


func test_the_refusal_says_why() -> void:
	assert_str(CareerPath.transition_reason("highschool", "university")).is_empty()
	assert_str(CareerPath.transition_reason("university", "highschool")
		).override_failure_message("거부 이유가 비어 있다").is_not_empty()
	assert_str(CareerPath.transition_reason("independent", "university")
		).contains("대학")
	assert_str(CareerPath.transition_reason("military", "pro_kbl")).contains("전역")


func test_only_a_high_schooler_applies_to_a_university() -> void:
	assert_bool(CareerPath.can_apply_university("highschool")).is_true()
	assert_bool(CareerPath.can_apply_university("university")).is_false()
	assert_bool(CareerPath.can_apply_university("independent")).is_false()


func test_a_student_can_apply_to_the_independent_league() -> void:
	assert_bool(CareerPath.can_apply_independent("highschool")).is_true()
	assert_bool(CareerPath.can_apply_independent("university")).is_true()
	# 프로는 방출 경로로 따로 간다
	assert_bool(CareerPath.can_apply_independent("pro_kbl")).is_false()


# ── 대학 학년 ─────────────────────────────────────────────────

## ⚠ **정본은 재학 주차다.** 02는 `grade`와 `universityWeek` 둘이 각자 계산했고,
## `grade`는 진학할 때 지워져 늘 null이었다 — 화면만 주차로 버텨서
## **헤드리스는 7년째 "계속"을 눌렀다**(실측 29세 대학생)
func test_the_university_grade_comes_from_the_week_counter() -> void:
	assert_int(CareerPath.university_grade_of(0, 1)).is_equal(1)
	assert_int(CareerPath.university_grade_of(0, 52)).is_equal(1)
	assert_int(CareerPath.university_grade_of(0, 53)).is_equal(2)
	assert_int(CareerPath.university_grade_of(0, 157)).is_equal(4)


## 주차가 있으면 `grade`는 안 본다 — 둘이 어긋나도 주차가 이긴다
func test_the_week_counter_wins_over_the_grade_field() -> void:
	assert_int(CareerPath.university_grade_of(1, 157)).override_failure_message(
		"주차와 학년이 어긋났는데 학년 필드가 이겼다").is_equal(4)


func test_there_is_no_fifth_year() -> void:
	assert_int(CareerPath.university_grade_of(0, 520)).override_failure_message(
		"대학 10년차가 나왔다 — 5학년은 없다").is_equal(4)
	assert_int(CareerPath.university_grade_of(9, 0)).is_equal(4)


## 계수기가 없는 옛 세이브만 `grade`를 본다
func test_an_old_save_falls_back_to_the_grade_field() -> void:
	assert_int(CareerPath.university_grade_of(3, 0)).is_equal(3)
	assert_int(CareerPath.university_grade_of(0, 0)).is_equal(1)


func test_the_final_year_is_the_fourth() -> void:
	assert_bool(CareerPath.is_university_final_year(0, 157)).is_true()
	assert_bool(CareerPath.is_university_final_year(0, 156)).is_false()
	assert_bool(CareerPath.is_university_final_year(4, 0)).is_true()


# ── 입시 확률 ─────────────────────────────────────────────────

## ⚠ **요건을 둘 다 넘으면 대개 붙는다.** 넘겨도 자주 떨어지면 요건이
## 요건이 아니다
func test_meeting_both_requirements_usually_passes() -> void:
	# 전력★ 2 (C: 학업 7등급 · 야구 4점) — 학업 1등급 · 야구 100점
	var c: float = CareerPath.university_chance(2, 1, 100.0)
	assert_float(c).override_failure_message(
		"요건을 다 넘었는데 합격률이 %.1f%%다" % c).is_greater(70.0)


## ⚠ **위를 자른다.** 안 자르면 좋은 성적 하나로 합격이 확정이 된다
func test_the_chance_is_capped() -> void:
	assert_float(CareerPath.university_chance(1, 1, 10000.0)
		).override_failure_message("합격이 확정으로 굳었다").is_less_equal(92.0)


func test_missing_a_requirement_makes_it_a_long_shot() -> void:
	# 전력★ 5 (S: 학업 4등급 · 야구 40점)
	var academic_only: float = CareerPath.university_chance(5, 1, 0.0)
	var baseball_only: float = CareerPath.university_chance(5, 9, 100.0)
	var neither: float = CareerPath.university_chance(5, 9, 0.0)

	assert_float(academic_only).is_less(40.0)
	assert_float(baseball_only).is_less(40.0)
	assert_float(neither).override_failure_message(
		"둘 다 미달인데 한쪽만 미달보다 잘 붙는다").is_less(baseball_only)
	# 학업이 야구보다 조금 세다 — 대학이니까
	assert_float(academic_only).is_greater(baseball_only)


func test_a_better_record_helps_within_the_same_tier() -> void:
	var plain: float = CareerPath.university_chance(2, 7, 4.0)
	var strong: float = CareerPath.university_chance(2, 1, 300.0)
	assert_float(strong).override_failure_message(
		"성적을 더 쌓아도 합격률이 안 올랐다").is_greater(plain)


## 야구 점수 보탬에도 상한이 있다 — 없으면 학업이 뜻을 잃는다.
##
## ⚠ **합격률 상한(92)에 가려지지 않는 자리에서 재야 한다.** 둘 다 상한에
## 걸리는 값을 넣으면 이 검사는 아무것도 안 본다
func test_the_baseball_bonus_has_a_ceiling() -> void:
	# 전력★1(D: 야구 문턱 0점) — 200점이면 보탬이 천장(10)에 닿는다
	var at_cap: float = CareerPath.university_chance(1, 9, 200.0)
	var way_over: float = CareerPath.university_chance(1, 9, 400.0)
	assert_float(at_cap).override_failure_message(
		"이 자리가 합격률 상한에 가려졌다 — 검사가 천장을 못 본다").is_less(92.0)
	assert_float(way_over).override_failure_message(
		"야구 점수만 쌓으면 합격률이 계속 오른다 (%.1f → %.1f)" % [at_cap, way_over]
	).is_equal_approx(at_cap, 0.001)


## ⚠ **한참 모자라면 아예 안 붙는다.** 흔들림만으로 뚫리면 컷이 의미가 없다
func test_a_hopeless_gap_never_passes_the_independent_league() -> void:
	# 전력★ 4 → 컷 54. 1지망은 보탬이 없다
	assert_float(CareerPath.independent_chance(4, 43.0, 0)
		).override_failure_message("컷보다 11 낮은데 입단 가능성이 있다").is_equal(0.0)
	assert_float(CareerPath.independent_chance(4, 45.0, 0)).is_greater(0.0)


## ⚠ **02의 주석과 코드가 어긋난다.** 주석은 "위로 지원할수록 조금 어렵다"인데
## 코드(`cut = min_ovr - order_penalty`, `penalty = [0, -2, -4]`)는 **뒤 지망이
## 더 어렵다**. 밸런스가 동결이라 **코드 쪽을 그대로 옮기고 여기에 못 박는다** —
## 고치려면 실측 대조를 다시 해야 한다
func test_a_later_choice_is_a_little_harder() -> void:
	var first: float = CareerPath.independent_chance(3, 50.0, 0)
	var third: float = CareerPath.independent_chance(3, 50.0, 2)
	assert_float(third).override_failure_message(
		"지망 순서가 합격률을 안 바꾼다").is_less(first)


func test_a_weaker_independent_team_is_easier() -> void:
	assert_float(CareerPath.independent_chance(1, 50.0, 0)).is_greater(
		CareerPath.independent_chance(4, 50.0, 0))


func test_the_independent_chance_stays_in_its_band() -> void:
	assert_float(CareerPath.independent_chance(1, 99.0, 0)).is_less_equal(96.0)
	assert_float(CareerPath.independent_chance(4, 45.0, 0)).is_greater_equal(12.0)


# ── 입시 판정 ─────────────────────────────────────────────────

func _apply(univ: Array, indie: Array, seed_value: int = 1,
		ovr: float = 60.0, gpa: float = 3.5, bb: float = 120.0) -> Dictionary:
	return CareerPath.admissions({
		"ovr": ovr, "gpa": gpa, "hs_baseball_score": bb,
		"university_choices": univ, "independent_choices": indie,
	}, _rng(seed_value))


## 남악대는 ★1(D: 9등급 / 0점) — 안전 지원이다
func test_a_safe_university_takes_a_good_player() -> void:
	var passed: int = 0
	for s in range(40):
		if not _apply(["TEAM_UNIV_NAMAK"], [], s + 1)["university_passed"].is_empty():
			passed += 1
	assert_int(passed).override_failure_message(
		"안전 지원 40번에 %d번밖에 안 붙었다" % passed).is_greater(28)


## 한류대는 ★5(S: 4등급 / 40점) — 밑도 끝도 없는 지원은 거의 떨어진다
func test_the_top_university_turns_away_a_weak_application() -> void:
	var passed: int = 0
	for s in range(40):
		# 학점 1.0(9등급) · 야구 0점 — 둘 다 미달
		if not _apply(["TEAM_UNIV_HALLYU"], [], s + 1, 60.0, 1.0, 0.0
			)["university_passed"].is_empty():
			passed += 1
	assert_int(passed).override_failure_message(
		"요건 둘 다 미달인데 한류대에 40번 중 %d번 붙었다" % passed).is_less(10)


## ⚠ **어느 대학에 쓰느냐가 달라야 한다.** 판정이 팀을 안 보면 안전 지원과
## 상향 지원이 같은 확률이 된다 — 02가 정확히 그 상태였다
func test_a_top_university_is_much_harder_than_a_safe_one() -> void:
	var safe: int = 0
	var top: int = 0
	for s in range(60):
		if not _apply(["TEAM_UNIV_NAMAK"], [], s + 1, 60.0, 3.5, 30.0
			)["university_passed"].is_empty():
			safe += 1
		if not _apply(["TEAM_UNIV_HALLYU"], [], s + 1, 60.0, 3.5, 30.0
			)["university_passed"].is_empty():
			top += 1
	assert_int(safe - top).override_failure_message(
		"남악대(★1)와 한류대(★5)의 합격 수가 %d vs %d다 — 판정이 팀을 안 본다"
		% [safe, top]).is_greater(20)


## ⚠ **결과가 지원한 팀에서만 나온다.** 안 그러면 원서를 안 낸 대학에 붙는다
func test_only_the_teams_you_applied_to_come_back() -> void:
	var out: Dictionary = _apply(["TEAM_UNIV_NAMAK", "TEAM_UNIV_OKCHEON"], [])
	assert_array(out["university_passed"]).is_not_empty()
	for t in out["university_passed"]:
		assert_bool(["TEAM_UNIV_NAMAK", "TEAM_UNIV_OKCHEON"].has(String(t))
			).override_failure_message("지원 안 한 %s 에 붙었다" % t).is_true()


func test_nobody_gets_into_sangmu_by_applying() -> void:
	for s in range(30):
		var out: Dictionary = _apply([], ["TEAM_IND_SANGMU_PHOENIX"], s + 1, 99.0)
		assert_array(out["independent_passed"]).override_failure_message(
			"상무에 원서로 들어갔다").is_empty()


## ⚠ **상무를 뺀 뒤에 지망 순서를 센다.** 빼기 전에 세면 상무를 1지망에 쓴
## 사람만 나머지 지망이 한 칸씩 밀린다.
##
## 대전(★3 · 컷 49)에 OVR 52로 쓴다 — 한 칸 밀리면 확률이 6.4%p 떨어지는
## 중간 지대라 밀림이 숫자로 보인다
func test_sangmu_does_not_shift_the_other_choices() -> void:
	var without: int = 0
	var with_sangmu: int = 0
	for s in range(200):
		if not _apply([], ["TEAM_IND_DAEJEON_BLAZE"], s + 1, 52.0
			)["independent_passed"].is_empty():
			without += 1
		if not _apply([], ["TEAM_IND_SANGMU_PHOENIX", "TEAM_IND_DAEJEON_BLAZE"],
			s + 1, 52.0)["independent_passed"].is_empty():
			with_sangmu += 1
	assert_int(with_sangmu).override_failure_message(
		"상무를 1지망에 쓰면 뒤 지망이 한 칸 밀린다 (%d vs %d)" % [without, with_sangmu]
	).is_equal(without)


## ⚠ **같은 씨앗이면 같은 결과다.** 안 그러면 세이브를 다시 열 때마다
## 진로가 바뀐다
func test_the_same_seed_gives_the_same_answer() -> void:
	var a: Dictionary = _apply(["TEAM_UNIV_HALLYU", "TEAM_UNIV_ASAN"],
		["TEAM_IND_SEOUL_RAVENS"], 7)
	var b: Dictionary = _apply(["TEAM_UNIV_HALLYU", "TEAM_UNIV_ASAN"],
		["TEAM_IND_SEOUL_RAVENS"], 7)
	assert_array(a["university_passed"]).is_equal(b["university_passed"])
	assert_array(a["independent_passed"]).is_equal(b["independent_passed"])


## ⚠ **실력이 낮으면 독립도 못 간다.** 전부 붙으면 컷이 죽은 값이다
func test_a_weak_player_is_turned_away_by_the_independent_league() -> void:
	var passed: int = 0
	for s in range(40):
		var out: Dictionary = _apply([], ["TEAM_IND_SEOUL_RAVENS"], s + 1, 35.0)
		if not out["independent_passed"].is_empty():
			passed += 1
	assert_int(passed).override_failure_message(
		"OVR 35로 강팀(★4) 독립리그에 %d/40 붙었다" % passed).is_equal(0)


func test_a_strong_player_gets_into_the_independent_league() -> void:
	var passed: int = 0
	for s in range(40):
		var out: Dictionary = _apply([], ["TEAM_IND_SEOUL_COMETS"], s + 1, 70.0)
		if not out["independent_passed"].is_empty():
			passed += 1
	assert_int(passed).override_failure_message(
		"OVR 70인데 약팀(★1) 독립리그에 %d/40밖에 못 붙었다" % passed).is_greater(30)


## ⚠ **두 판정이 같은 난수 흐름을 쓴다.** 각자 새 난수를 만들면 대학 지원이
## 몇 개든 독립 결과가 늘 같아진다 — 그건 흐름이 둘이라는 뜻이다
func test_the_admissions_share_one_stream() -> void:
	var differed: bool = false
	for s in range(1, 30):
		var a: Dictionary = _apply([], ["TEAM_IND_DAEJEON_BLAZE"], s, 52.0)
		var b: Dictionary = _apply(
			["TEAM_UNIV_NAMAK", "TEAM_UNIV_OKCHEON", "TEAM_UNIV_TONGYEONG"],
			["TEAM_IND_DAEJEON_BLAZE"], s, 52.0)
		if a["independent_passed"] != b["independent_passed"]:
			differed = true
			break
	assert_bool(differed).override_failure_message(
		"대학 판정이 독립 판정의 난수에 영향을 안 준다 — 흐름이 둘이다").is_true()


## 요건이 팀 데이터에서 온다 — 같은 대학에 성적만 바꿔 넣어 본다.
## 백제대는 ★4(A: 5등급 / 25점)
func test_a_real_university_uses_its_own_power_star() -> void:
	var weak: int = 0
	var strong: int = 0
	for s in range(60):
		if not _apply(["TEAM_UNIV_BAEKJE"], [], s + 1, 60.0, 3.0, 20.0
			)["university_passed"].is_empty():
			weak += 1
		if not _apply(["TEAM_UNIV_BAEKJE"], [], s + 1, 60.0, 4.5, 300.0
			)["university_passed"].is_empty():
			strong += 1
	assert_int(strong).override_failure_message(
		"성적이 좋아도 합격 수가 안 늘었다 (%d → %d)" % [weak, strong]).is_greater(weak)


func test_no_choices_means_no_results() -> void:
	var out: Dictionary = _apply([], [])
	assert_array(out["university_passed"]).is_empty()
	assert_array(out["independent_passed"]).is_empty()
