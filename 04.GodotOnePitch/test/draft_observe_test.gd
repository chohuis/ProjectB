extends GdUnitTestSuite

## 드래프트 관전이 **실제로 뜨나** — 🔴 마지막 도달 불가 갈래였다.
##
## 화면(`_observe`)도 해소하는 쪽(`apply`)도 `AutoAdvance` 항목도 다 있는데
## **대기줄에 올리는 곳이 하나도 없었다** — 체육부대와 같은 모양.
##
## 02는 **W47**에 올린다(`advanceWeek.ts:948-956`) — 고교/대학 결과 주가
## 아니고 진로 대기가 없을 때. 04는 `CareerRunner.RESULT_WEEK`가 이미
## 그 주라 **주차를 새로 박지 않았다.**


func _state(applied: bool = true) -> Dictionary:
	var day: int = (CareerRunner.RESULT_WEEK - 1) * Calendar.DAYS_PER_WEEK + 1
	return {
		"day": day, "season_year": 2029, "seed": 5,
		"season_days": Calendar.DAYS_PER_SEASON,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": "highschool", "grade": 3,
			"team_id": "TEAM_HS_AEWOL", "league_id": "LEAGUE_HIGHSCHOOL",
			"pitching": {"ovr": 70.0}, "career_records": [],
			"injury": null, "retired": false, "age": 18},
		"school": {"gpa": 3.5},
		"career": {"applications": {"draft_applied": applied,
			"university_choices": [], "independent_choices": []},
			"submitted": true, "results": {}, "final_choice": ""},
		"pending": [], "mailbox": [], "world": {"rosters": {}},
	}


# ── 뜨나 ──────────────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 올리는 곳이 없으면 화면이 영영 안 뜬다
func test_결과_주에_관전이_뜬다() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, int(s["day"]))
	assert_bool(Pending.has(s, "draft_observe")).override_failure_message(
		"드래프트 주인데 관전이 안 뜬다").is_true()


## ⚠ **신청 안 한 사람에게는 남의 일이다**
func test_신청_안_했으면_안_뜬다() -> void:
	var s: Dictionary = _state(false)
	CareerRunner.run(s, int(s["day"]))
	assert_bool(Pending.has(s, "draft_observe")).override_failure_message(
		"드래프트를 안 냈는데 관전이 떴다").is_false()


## ⚠ **한 해에 한 번.** `RESULT_WEEK` 이후 매주 도는 자리라 안 막으면
## 해마다 여러 번 뜬다
func test_한_해에_한_번만_뜬다() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, int(s["day"]))
	Pending.resolve(s, "draft_observe")
	s["day"] = int(s["day"]) + Calendar.DAYS_PER_WEEK
	CareerRunner.run(s, int(s["day"]))
	assert_bool(Pending.has(s, "draft_observe")).override_failure_message(
		"같은 해에 관전이 두 번 떴다").is_false()


## 해가 바뀌면 다시 뜬다 — 영영 막으면 그것대로 결함이다
func test_해가_바뀌면_다시_뜬다() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, int(s["day"]))
	Pending.resolve(s, "draft_observe")
	s["season_year"] = 2030
	CareerRunner.run(s, int(s["day"]))
	assert_bool(Pending.has(s, "draft_observe")).override_failure_message(
		"이듬해에 다시 신청했는데 관전이 안 뜬다").is_true()


## 결과 주 전에는 안 뜬다
func test_결과_주_전에는_안_뜬다() -> void:
	var s: Dictionary = _state()
	s["day"] = (CareerRunner.RESULT_WEEK - 3) * Calendar.DAYS_PER_WEEK
	CareerRunner.run(s, int(s["day"]))
	assert_bool(Pending.has(s, "draft_observe")).is_false()


## ⚠ **결과보다 먼저 올린다** — 결과를 보여준 뒤 "오늘 드래프트가 열립니다"는
## 순서가 거꾸로다. 대기줄 앞자리에 있어야 한다
func test_결과보다_먼저_온다() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, int(s["day"]))
	var order: Array = []
	for a in s.get("pending", []):
		order.append(String(a.get("type", "")))
	var i_obs: int = order.find("draft_observe")
	var i_res: int = order.find("career_results")
	assert_int(i_obs).override_failure_message(
		"관전이 대기줄에 없다: %s" % str(order)).is_greater(-1)
	if i_res >= 0:
		assert_int(i_obs).override_failure_message(
			"결과가 관전보다 먼저다: %s" % str(order)).is_less(i_res)


## 화면이 받는다 — 갈래가 붙었는지
func test_화면이_받는다() -> void:
	var s: Dictionary = _state()
	CareerRunner.run(s, int(s["day"]))
	var d: Dictionary = DecisionVm.build(s)
	assert_str(String(d.get("type", ""))).is_equal("draft_observe")
	assert_int(String(d.get("body", "")).find("**")).is_equal(-1)
