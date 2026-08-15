extends GdUnitTestSuite

## 진로 배선 — 지원이 열리고 결과가 나온다. B-6f.
##
## ⚠ **이게 없으면 `CareerDecision`은 아무도 안 부르는 코드다.** 02가 겪은
## 결함 대부분이 "코드는 있는데 한 번도 안 돈 곳"이었다.


func _day_of(week: int) -> int:
	return (week - 1) * Calendar.DAYS_PER_WEEK + 1


func _state(stage: String = "highschool", grade: int = 3) -> Dictionary:
	return {
		"day": 300, "season_year": 2030, "seed": 7,
		"protagonist": {
			"id": "ME", "name": "김한결",
			"career_stage": stage, "league_id": "LEAGUE_HIGHSCHOOL",
			"team_id": "TEAM_HS_AEWOL", "grade": grade, "age": 18,
			"player_type": "pitcher", "position": "SP",
			"pitching": {"ovr": 70.0}, "batting": {},
			"scout_score": 30.0, "money": 0, "retired": false,
			"career_records": [], "career_events": [],
		},
		"school": {"gpa": 3.5, "major": "체육교육"},
		"world": {"rosters": {"TEAM_HS_AEWOL": []}},
		"body_log": [], "pending": [], "mailbox": [],
	}


# ── 지원이 열린다 ─────────────────────────────────────────────

## ⚠ **무대마다 시즌이 끝나는 때가 다르다** — 한 주차로 뭉치면 대학·독립은
## 아직 시즌 중인데 진로를 정하게 된다
func test_each_stage_opens_at_its_own_week() -> void:
	for stage in CareerRunner.HUB_WEEK:
		var s: Dictionary = _state(stage)
		CareerRunner.run(s, _day_of(int(CareerRunner.HUB_WEEK[stage])))
		assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
			"%s 무대의 진로 지원이 W%d에 안 열렸다"
			% [stage, CareerRunner.HUB_WEEK[stage]]).is_true()


## ⚠ **남의 주차에는 안 열린다.** 한 주로 뭉치면 대학·독립이 아직 시즌
## 중인데 진로를 정하게 된다
func test_a_stage_is_not_asked_at_another_stages_week() -> void:
	for stage in CareerRunner.HUB_WEEK:
		for other in CareerRunner.HUB_WEEK:
			if other == stage:
				continue
			var s: Dictionary = _state(stage)
			CareerRunner.run(s, _day_of(int(CareerRunner.HUB_WEEK[other])))
			assert_bool(Pending.has(s, "career_choice_hub")
				).override_failure_message(
				"%s 무대가 %s 주차(W%d)에 진로를 정했다"
				% [stage, other, CareerRunner.HUB_WEEK[other]]).is_false()


func test_an_ordinary_week_opens_nothing() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, _day_of(20))
	assert_array(Pending.all(s)).is_empty()


## 고교는 졸업반만이다 — 1·2학년은 그냥 진급한다
func test_an_underclassman_is_not_asked() -> void:
	var s: Dictionary = _state("highschool", 2)
	CareerRunner.run(s, _day_of(44))
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"2학년이 진로를 정하라는 말을 들었다").is_false()


## ⚠ **이미 물어본 것을 또 묻지 않는다.** 02는 이 확인이 흩어져 있었고
## 빠뜨린 자리에서 같은 주가 무한 반복됐다
func test_the_question_is_asked_only_once() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, _day_of(44))
	CareerRunner.run(s, _day_of(44))
	assert_int(Pending.all(s).size()).override_failure_message(
		"같은 진로 질문이 두 번 쌓였다").is_equal(1)


func test_a_submitted_application_is_not_asked_again() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	CareerRunner.run(s, _day_of(44))
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"원서를 냈는데 또 물어본다").is_false()


## ⚠ **결과가 이미 나와 있으면 안 묻는다.** 진학·입단으로 지원 표시만
## 내려간 채 결과가 남아 있는 해가 있다 — 거기서 또 물으면 이미 정해진
## 진로를 두 번 고르게 된다
func test_a_decided_result_blocks_a_new_question() -> void:
	var s: Dictionary = _state()
	CareerDecision.of(s)["results"] = {"drafted": false,
		"university_passed": [], "independent_passed": []}
	CareerRunner.run(s, _day_of(44))
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"결과가 이미 나왔는데 진로를 또 물어본다").is_false()


func test_a_pending_career_decision_blocks_a_new_question() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "career_choice"})
	CareerRunner.run(s, _day_of(44))
	assert_bool(Pending.has(s, "career_choice_hub")).is_false()


## 프로는 진로 지원이 없다 — 그쪽은 계약이 무대를 정한다
func test_a_pro_is_not_asked_about_a_career_path() -> void:
	var s: Dictionary = _state("pro_kbl")
	for week in [39, 42, 44]:
		CareerRunner.run(s, _day_of(week))
	assert_array(Pending.all(s)).is_empty()


func test_a_retired_player_is_left_alone() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["retired"] = true
	CareerRunner.run(s, _day_of(44))
	assert_array(Pending.all(s)).is_empty()


# ── 결과가 나온다 ─────────────────────────────────────────────

## ⚠ **결과 주차가 지원 주차보다 뒤다.** 앞이면 지원도 안 한 사람의
## 결과가 나온다
func test_the_result_week_comes_after_every_hub_week() -> void:
	for stage in CareerRunner.HUB_WEEK:
		assert_int(CareerRunner.RESULT_WEEK).override_failure_message(
			"%s 지원(W%d)보다 결과(W%d)가 이르다"
			% [stage, CareerRunner.HUB_WEEK[stage], CareerRunner.RESULT_WEEK]
		).is_greater(int(CareerRunner.HUB_WEEK[stage]))


func test_the_result_arrives_at_the_result_week() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	var out: Dictionary = CareerRunner.run(s, _day_of(CareerRunner.RESULT_WEEK))
	assert_dict(out["results"]).override_failure_message(
		"결과 주차인데 결과가 안 나왔다").is_not_empty()
	assert_bool(Pending.has(s, "career_results")).is_true()


func test_no_application_means_no_result() -> void:
	var s: Dictionary = _state()
	var out: Dictionary = CareerRunner.run(s, _day_of(CareerRunner.RESULT_WEEK))
	assert_dict(out["results"]).is_empty()
	assert_array(Pending.all(s)).is_empty()


## ⚠ **한 번만 정한다.** 매주 다시 뽑으면 결과 화면을 못 연 채 순위가 바뀐다
func test_the_result_is_decided_once() -> void:
	var s: Dictionary = _state()
	CareerDecision.submit_applications(s, {"draft": true})
	var first: Dictionary = CareerRunner.run(s, _day_of(47))["results"]
	CareerRunner.run(s, _day_of(48))
	assert_dict(CareerDecision.of(s)["results"]).is_equal(first)


## ⚠ **씨앗을 연도와 섞는다.** 하나로 두면 어느 해에 지원하든 같은 결과다
func test_a_different_year_gives_a_different_draw() -> void:
	var seen: Array = []
	for year in range(2030, 2050):
		var s: Dictionary = _state()
		s["season_year"] = year
		s["protagonist"]["pitching"] = {"ovr": 55.0}
		CareerDecision.submit_applications(s, {"draft": false,
			"university_choices": ["TEAM_UNIV_HALLYU"]})
		var r: Dictionary = CareerRunner.run(s, _day_of(47))["results"]
		seen.append(r["university_passed"].size())
	var same: bool = true
	for n in seen:
		if n != seen[0]:
			same = false
			break
	assert_bool(same).override_failure_message(
		"스무 해 내내 같은 결과가 나온다 — 씨앗에 연도가 안 섞였다").is_false()


# ── 복무 ──────────────────────────────────────────────────────

## ⚠ **군인은 진로를 정할 자리에 없다.** 복무 중에 진로 지원이 열리면
## 전역도 안 한 사람이 대학에 원서를 낸다
func test_a_soldier_is_not_asked_about_a_career_path() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 1)
	CareerRunner.run(s, _day_of(44))
	assert_bool(Pending.has(s, "career_choice_hub")).is_false()


func test_the_service_weeks_tick() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 1)
	CareerRunner.run(s, _day_of(10))
	CareerRunner.run(s, _day_of(11))
	assert_int(int(s["protagonist"]["military_service_weeks"])).override_failure_message(
		"복무 주차가 안 흐른다 — 영원히 군대에 있게 된다").is_equal(2)


## ⚠ **02는 전역 분기에 도달할 수가 없었다** — 실측 복무 700주(13.5년)
func test_the_service_ends_by_itself() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 1)
	var discharged: bool = false
	for i in range(Military.SERVICE_WEEKS + 2):
		var out: Dictionary = CareerRunner.run(s, _day_of(1))
		if out.get("military", {}).get("discharged", false):
			discharged = true
			break
	assert_bool(discharged).override_failure_message(
		"복무 기간을 다 채웠는데 전역이 안 온다").is_true()
	assert_str(String(s["protagonist"]["career_stage"])).is_equal("independent")


func test_the_service_does_not_end_early() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 1)
	for i in range(Military.SERVICE_WEEKS - 1):
		CareerRunner.run(s, _day_of(1))
	assert_str(String(s["protagonist"]["career_stage"])).override_failure_message(
		"복무가 안 끝났는데 전역했다").is_equal("military")
