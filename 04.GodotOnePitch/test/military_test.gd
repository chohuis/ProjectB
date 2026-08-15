extends GdUnitTestSuite

## 병역 — 입대 · 복무 · 전역. B-6c.
##
## ⚠ **02는 입대 처리를 네 곳에 복제해 뒀고 서로 달랐다.** 오프시즌을 빠뜨린
## 두 경로에서는 복무 2년 동안 세계가 2년치 정체됐다. 그리고 전역 분기는
## **도달할 수 없는 자리에 있어서** 입대하면 영원히 군대에 있었다 —
## 실측 2029년 입대 → 2036년 복무 700주(13.5년), 26세.


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 300, "season_year": 2030, "seed": 1,
		"protagonist": {
			"id": "ME", "name": "김한결",
			"career_stage": "highschool", "league_id": "LEAGUE_HIGHSCHOOL",
			"team_id": "TEAM_HS_AEWOL", "grade": 3, "age": 18,
			"career_events": [],
		},
		"pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _pro_state() -> Dictionary:
	var s: Dictionary = _state()
	var p: Dictionary = s["protagonist"]
	p["career_stage"] = "pro_kbl"
	p["league_id"] = "LEAGUE_KBL"
	p["team_id"] = "TEAM_KBL_A"
	p["salary"] = 5000
	p["contract_years"] = 3
	p.erase("grade")
	return s


func _serve_out(s: Dictionary) -> void:
	for i in range(Military.SERVICE_WEEKS):
		Military.advance_week(s)


# ── 입대 ──────────────────────────────────────────────────────

func test_enlisting_moves_you_out_of_the_league() -> void:
	var s: Dictionary = _state()
	assert_bool(Military.enlist(s, "general", 300)).is_true()
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["career_stage"])).is_equal("military")
	assert_str(String(p["league_id"])).override_failure_message(
		"입대했는데 소속 리그가 그대로다 — 군인이 고교 경기를 뛴다"
	).is_equal(Military.LEAGUE)
	assert_str(String(p["team_id"])).is_empty()


## ⚠ **미필만 입대한다.** 02는 화면에만 가드를 뒀고, 다른 호출부가 그대로
## 통과해서 **군 복무를 세 번 하는 커리어**가 실제로 나왔다
func test_you_only_serve_once() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	assert_bool(Military.enlist(s, "general", 500)).override_failure_message(
		"군 복무를 두 번 한다").is_false()


func test_enlisting_leaves_a_career_event() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "sports", 300)
	var events: Array = s["protagonist"]["career_events"]
	assert_int(events.size()).is_equal(1)
	assert_str(String(events[0]["type"])).is_equal("military_enlist")
	assert_int(int(events[0]["year"])).is_equal(2030)
	assert_str(String(events[0]["from_team_id"])).override_failure_message(
		"어디서 입대했는지가 안 남았다").is_equal("TEAM_HS_AEWOL")


func test_enlisting_tells_you_about_it() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	assert_int(s["mailbox"].size()).override_failure_message(
		"입대했는데 아무 말이 없다").is_greater(0)


## ⚠ **어디서 입대했는지를 남긴다.** 안 남기면 프로가 전역할 때 돌아갈
## 곳을 잃는다
func test_the_place_you_left_is_remembered() -> void:
	var s: Dictionary = _pro_state()
	Military.enlist(s, "general", 300)
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["military_hiatus_stage"])).is_equal("pro_kbl")
	assert_str(String(p["military_hiatus_team_id"])).is_equal("TEAM_KBL_A")
	assert_str(String(p["military_hiatus_league_id"])).is_equal("LEAGUE_KBL")


## ⚠ **유효한 계약은 복무 기간만큼 늘어난다.** 안 늘리면 군대에서 계약이
## 만료되고 전역하자마자 무소속이다
func test_a_live_contract_waits_for_you() -> void:
	var s: Dictionary = _pro_state()
	Military.enlist(s, "general", 300)
	assert_int(int(s["protagonist"]["contract_years"])).override_failure_message(
		"계약이 군 복무 동안 그냥 흘렀다").is_equal(5)


func test_an_expired_contract_is_not_extended() -> void:
	var s: Dictionary = _pro_state()
	s["protagonist"]["contract_years"] = 0
	Military.enlist(s, "general", 300)
	assert_int(int(s["protagonist"]["contract_years"])).override_failure_message(
		"이미 만료된 계약이 되살아났다").is_equal(0)


func test_a_student_has_no_contract_to_extend() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	assert_int(int(s["protagonist"].get("contract_years", 0))).is_equal(0)


# ── 복무 ──────────────────────────────────────────────────────

func test_the_weeks_add_up() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	Military.advance_week(s)
	Military.advance_week(s)
	assert_int(int(s["protagonist"]["military_service_weeks"])).is_equal(2)


## 복무 중이 아니면 아무 일도 안 일어난다 — 민간인의 주차를 세면 안 된다
func test_a_civilian_week_is_not_a_service_week() -> void:
	var s: Dictionary = _state()
	Military.advance_week(s)
	assert_int(int(s["protagonist"].get("military_service_weeks", 0))).is_equal(0)


## ⚠ **복무는 100주다** — 52주 시즌 두 번에 나눠 흐른다. 02는 100주짜리
## 시즌 하나로 열어서 **복무 2년 동안 세계는 1년만 흘렀다**(연도도 나이도
## 한 번만 올랐다)
func test_the_service_spans_two_seasons() -> void:
	assert_int(Military.SERVICE_WEEKS).is_greater(52)


# ── 전역 ──────────────────────────────────────────────────────

func test_you_do_not_leave_early() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	for i in range(Military.SERVICE_WEEKS - 1):
		Military.advance_week(s)
	assert_bool(Military.discharge(s, 400)).override_failure_message(
		"복무가 안 끝났는데 전역했다").is_false()
	assert_str(String(s["protagonist"]["career_stage"])).is_equal("military")


func test_a_civilian_cannot_be_discharged() -> void:
	var s: Dictionary = _state()
	assert_bool(Military.discharge(s, 400)).is_false()


## ⚠ **학교로는 안 돌아간다.** 02는 입대 전 학적을 그대로 복구해서
## **2년 복무한 21세가 고등학교로 돌아갔다**
func test_a_student_comes_back_to_the_independent_league() -> void:
	for stage in ["highschool", "university"]:
		var s: Dictionary = _state()
		s["protagonist"]["career_stage"] = stage
		Military.enlist(s, "general", 300)
		_serve_out(s)
		assert_bool(Military.discharge(s, 400)).is_true()
		var p: Dictionary = s["protagonist"]
		assert_str(String(p["career_stage"])).override_failure_message(
			"%s 에서 입대했더니 %s 로 돌아갔다" % [stage, p["career_stage"]]
		).is_equal("independent")
		assert_str(String(p["league_id"])).is_equal("LEAGUE_INDEPENDENT")


## ⚠ **상무는 복무 중인 선수의 자리다** — 전역자가 갈 팀이 아니다.
## 목록에서 걸러야 한다. 지금 데이터로는 정렬 첫 자리가 아니지만,
## 팀이 바뀌면 첫 자리로 올라올 수 있다
func test_sangmu_is_not_a_discharge_destination() -> void:
	var dest: Array = Military.discharge_teams()
	assert_array(dest).is_not_empty()
	assert_bool(dest.has(CareerPath.sangmu_team_id())).override_failure_message(
		"상무가 전역자의 행선지 목록에 들어 있다").is_false()


## 전역할 때 두 번은 없다 — 복무 주차가 0으로 돌아가는 것이 그 자물쇠다
func test_you_are_discharged_only_once() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	assert_bool(Military.discharge(s, 400)).is_true()
	assert_bool(Military.discharge(s, 401)).override_failure_message(
		"두 번 전역했다 — 복무 주차가 안 되돌아간다").is_false()


func test_a_discharged_player_does_not_join_sangmu() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"전역하자마자 상무에 들어갔다").is_not_equal(CareerPath.sangmu_team_id())
	assert_str(String(s["protagonist"]["team_id"])).is_not_empty()


func test_a_pro_comes_back_to_the_team_that_waited() -> void:
	var s: Dictionary = _pro_state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["career_stage"])).is_equal("pro_kbl")
	assert_str(String(p["team_id"])).is_equal("TEAM_KBL_A")
	assert_str(String(p["league_id"])).is_equal("LEAGUE_KBL")


## ⚠ **학년은 학생일 때만 뜻이 있다.** 안 지우면 독립리그 선수가 `3학년`을
## 달고 다니고 결산 화면 머리글이 그걸 먼저 읽는다
func test_the_school_grade_is_dropped() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	assert_int(int(s["protagonist"].get("grade", 0))).override_failure_message(
		"전역자가 학년을 달고 있다").is_equal(0)


## ⚠ **다녀온 부대는 남긴다.** 지우면 전역 뒤에 상무·현역 구분이 사라져
## 인생 기록에 못 적는다
func test_the_unit_you_served_in_is_remembered() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "sports", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["military_served_unit"])).is_equal("sports")
	assert_str(String(p.get("military_unit", ""))).is_empty()
	assert_str(String(p["military_status"])).is_equal("군필")


## 체육부대는 실전 감각을 유지한다 — 복귀 적응이 짧다
func test_the_sports_unit_comes_back_faster() -> void:
	var sports: Dictionary = _state()
	Military.enlist(sports, "sports", 300)
	_serve_out(sports)
	Military.discharge(sports, 400)

	var general: Dictionary = _state()
	Military.enlist(general, "general", 300)
	_serve_out(general)
	Military.discharge(general, 400)

	assert_int(int(sports["protagonist"]["military_recovery_weeks"])
		).override_failure_message("체육부대와 현역의 복귀 적응이 같다").is_less(
		int(general["protagonist"]["military_recovery_weeks"]))


func test_discharge_leaves_a_career_event() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	var kinds: Array = []
	for e in s["protagonist"]["career_events"]:
		kinds.append(String(e["type"]))
	assert_array(kinds).contains(["military_discharge"])


func test_discharge_tells_you_about_it() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	var before: int = s["mailbox"].size()
	Military.discharge(s, 400)
	assert_int(s["mailbox"].size()).override_failure_message(
		"전역했는데 아무 말이 없다").is_greater(before)


# ── 복귀 계약 ─────────────────────────────────────────────────

## ⚠ **전역하면 계약을 다시 확인한다.** 잔여 계약이 있으면 그 팀과,
## 없으면 FA 시장으로 — 안 밀어 주면 무소속인 채로 다음 주가 온다
func test_a_remaining_contract_becomes_a_negotiation() -> void:
	var s: Dictionary = _pro_state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	assert_dict(a).override_failure_message(
		"잔여 계약이 있는데 협상이 안 열렸다").is_not_empty()
	assert_str(String(a["context"])).is_equal("military_return")
	assert_str(String(a["team_id"])).is_equal("TEAM_KBL_A")


func test_no_contract_means_the_fa_market() -> void:
	var s: Dictionary = _state()
	Military.enlist(s, "general", 300)
	_serve_out(s)
	Military.discharge(s, 400)
	assert_bool(Pending.has(s, "fa_market")).override_failure_message(
		"계약도 없고 시장도 안 열렸다 — 무소속으로 남는다").is_true()
	assert_bool(Pending.has(s, "salary_negotiation")).is_false()
