extends GdUnitTestSuite

## 코치 리포트 — F-8. **선택지가 든 소식을 만드는 곳이 없었다.**
##
## `mailbox`의 `decision`을 채우는 건 `fixtures.gd`뿐인데 **읽는 쪽은
## 셋이다** — `DayEngine.stop_reason`이 진행을 막고,
## `AutoAdvance.pick_choice`가 대신 답하고, `NewsVm`이 걸러 낸다.
## 셋 다 실제 게임에서 한 번도 안 돌았다.
##
## 원본: `usecases/advanceWeek.ts:1400-1484`


func _p(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "position": "SP",
		"career_stage": "highschool", "retired": false,
		"fatigue": 30.0, "condition": 70.0, "morale": 55.0,
		"pitching": {"velocity": 70.0, "command": 62.0, "control": 64.0,
			"stamina": 60.0},
	}
	p.merge(over, true)
	return p


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2027, "day": 21,
		"protagonist": _p(), "mailbox": [], "season_stats": {},
	}
	s.merge(over, true)
	return s


# ── 언제 오나 ─────────────────────────────────────────────────

## 02: `weekInYear % 3 === 0`
func test_it_comes_every_three_weeks() -> void:
	var s: Dictionary = _state()
	assert_bool(CoachReport.due(s, 3)).is_true()
	assert_bool(CoachReport.due(s, 6)).is_true()
	assert_bool(CoachReport.due(s, 4)).is_false()
	assert_bool(CoachReport.due(s, 5)).is_false()


## ⚠ **0주차엔 안 온다.** `0 % 3 == 0`이라 안 막으면 시즌이 시작하기도
## 전에 리포트가 온다
func test_week_zero_gets_nothing() -> void:
	assert_bool(CoachReport.due(_state(), 0)).is_false()


## ⚠ **복무 중엔 코치가 없다** (02 `careerStage !== "military"`)
func test_no_report_while_serving() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["career_stage"] = CoachReport.STAGE_MILITARY
	assert_bool(CoachReport.due(s, 3)).is_false()


func test_no_report_after_retiring() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["retired"] = true
	assert_bool(CoachReport.due(s, 3)).is_false()


# ── 어느 갈래인가 (02 문턱 그대로) ────────────────────────────

## ⚠ **피로가 먼저다.** 지쳐 있는데 "집중 훈련 적기"라고 하면 코치가
## 몸 상태를 안 보는 것이 된다
func test_high_fatigue_wins_over_good_condition() -> void:
	var a: Dictionary = CoachReport.advice(_p({
		"fatigue": 70.0, "condition": 90.0, "morale": 80.0}))
	assert_str(String(a["recommendation"])).contains("회복")
	assert_str(String(a["choices"][0]["id"])).is_equal("rest")


func test_the_thresholds_match_the_original() -> void:
	# 피로 65가 문턱이다
	assert_str(String(CoachReport.advice(_p({"fatigue": 65.0}))["choices"][0]["id"])
		).is_equal("rest")
	assert_str(String(CoachReport.advice(_p({"fatigue": 64.0}))["choices"][0]["id"])
		).is_not_equal("rest")
	# 컨디션 82 · 사기 68이면 집중 훈련
	assert_str(String(CoachReport.advice(_p({
		"condition": 82.0, "morale": 68.0}))["choices"][0]["id"])).is_equal("intensive")
	# 하나만 모자라도 안 된다
	assert_str(String(CoachReport.advice(_p({
		"condition": 82.0, "morale": 67.0}))["choices"][0]["id"])).is_not_equal("intensive")
	# 사기 40 이하면 멘탈
	assert_str(String(CoachReport.advice(_p({"morale": 40.0}))["choices"][0]["id"])
		).is_equal("mental")
	# 아무것도 안 걸리면 루틴 유지
	assert_str(String(CoachReport.advice(_p())["choices"][0]["id"])).is_equal("balance")


## 갈래마다 선택지가 둘이다 — 하나면 고를 게 없다
func test_every_branch_offers_two_choices() -> void:
	for over in [{"fatigue": 70.0}, {"condition": 85.0, "morale": 75.0},
			{"morale": 30.0}, {}]:
		var a: Dictionary = CoachReport.advice(_p(over))
		assert_int((a["choices"] as Array).size()).override_failure_message(
			"선택지가 둘이 아니다: %s" % a["recommendation"]).is_equal(2)


## ⚠ **효과 수치가 02 그대로여야 한다**
func test_the_effect_numbers_match_the_original() -> void:
	var rest: Dictionary = CoachReport.advice(_p({"fatigue": 70.0}))["choices"][0]
	assert_float(float(rest["fatigue_delta"])).is_equal(-8.0)
	assert_float(float(rest["condition_delta"])).is_equal(4.0)

	var hard: Dictionary = CoachReport.advice(_p({
		"condition": 85.0, "morale": 75.0}))["choices"][0]
	assert_float(float(hard["fatigue_delta"])).is_equal(4.0)
	assert_float(float(hard["xp"]["command"])).is_equal(3.0)

	var mental: Dictionary = CoachReport.advice(_p({"morale": 30.0}))["choices"][0]
	assert_float(float(mental["morale_delta"])).is_equal(6.0)

	var recover: Dictionary = CoachReport.advice(_p())["choices"][1]
	assert_float(float(recover["fatigue_delta"])).is_equal(-4.0)
	assert_float(float(recover["condition_delta"])).is_equal(2.0)


# ── 소식이 되는가 ─────────────────────────────────────────────

## ⚠ **`decision`이 붙어야 진행을 막는다.** 안 붙이면 그냥 읽는 소식이라
## `DayEngine`이 그대로 지나간다
func test_the_message_carries_a_decision() -> void:
	var s: Dictionary = _state()
	assert_bool(CoachReport.push(s, 3, 21)).is_true()
	var m: Dictionary = s["mailbox"][0]
	assert_dict(m["decision"]).is_not_empty()
	assert_object(m["decision"]["selected"]).is_null()
	assert_int((m["decision"]["choices"] as Array).size()).is_equal(2)

	# ⚠ **진행은 안 막는다.** 02도 코치 리포트로는 pendingAction을 안 민다 —
	# 답을 안 해도 다음 주가 온다. 막게 두면 04는 주간 처리가 진행 뒤에
	# 몰려 돌아서 **같은 28일이 22일과 29일로 갈린다**
	s["schedule"] = []
	s["season_days"] = 350
	assert_object(DayEngine.stop_reason(s)).override_failure_message(
		"코치 리포트가 진행을 막는다 — 답할 화면이 없어 게임이 멈춘다").is_null()


## ⚠ **같은 주에 두 번 안 넣는다.** 두 개가 쌓이면 진행이 두 번 막힌다
func test_it_does_not_push_twice_in_a_week() -> void:
	var s: Dictionary = _state()
	assert_bool(CoachReport.push(s, 3, 21)).is_true()
	assert_bool(CoachReport.push(s, 3, 21)).is_false()
	assert_int((s["mailbox"] as Array).size()).is_equal(1)


## 안 오는 주엔 아무것도 안 넣는다
func test_it_pushes_nothing_on_a_quiet_week() -> void:
	var s: Dictionary = _state()
	assert_bool(CoachReport.push(s, 4, 28)).is_false()
	assert_array(s["mailbox"]).is_empty()


## 본문에 상태가 있다 — 권고만 있으면 왜 그런지 모른다
func test_the_body_shows_the_numbers() -> void:
	var s: Dictionary = _state()
	CoachReport.push(s, 3, 21)
	var body: String = String(s["mailbox"][0]["body"])
	assert_str(body).contains("커맨드 62")
	assert_str(body).contains("피로 30")
	assert_str(body).contains("사기 55")


## ⚠ **한 이닝도 안 던졌으면 방어율 줄이 없다.** 0.00으로 뜨면 최상위권으로 읽힌다
func test_no_innings_means_no_era_line() -> void:
	var s: Dictionary = _state()
	CoachReport.push(s, 3, 21)
	assert_str(String(s["mailbox"][0]["body"])).not_contains("평균자책")

	var s2: Dictionary = _state({"season_stats": {
		"ME": {"ip": 60.0, "era": 2.10, "whip": 1.0, "k": 55}}})
	CoachReport.push(s2, 3, 21)
	assert_str(String(s2["mailbox"][0]["body"])).contains("평균자책 2.10")


# ── 고른 것이 실제로 걸리는가 ─────────────────────────────────

## ⚠ **효과를 적용하는 자리가 하나여야 한다.** 화면이 직접 상태를 고치면
## 자동 진행이 고른 답은 효과가 안 걸린다
func test_choosing_applies_the_effect() -> void:
	var s: Dictionary = _state({"protagonist": _p({"fatigue": 70.0})})
	CoachReport.push(s, 3, 21)
	var mid: String = String(s["mailbox"][0]["id"])

	assert_bool(CoachReport.apply(s, mid, "rest")).is_true()
	assert_float(float(s["protagonist"]["fatigue"])).is_equal(62.0)
	assert_float(float(s["protagonist"]["condition"])).is_equal(74.0)
	assert_str(String(s["mailbox"][0]["decision"]["selected"])).is_equal("rest")


## 답할 수 있고, 답한 뒤에도 진행은 그대로다
## ⚠ **갈래마다 선택지 id가 다르다.** 기본 상태는 `balance`/`recover`이고
## `push`는 피로 갈래에만 있다 — 엉뚱한 id를 넣으면 `apply`가 조용히
## 실패하고 검사는 "안 풀렸다"만 말한다(실제로 그렇게 짰다)
func test_answering_unblocks_the_day() -> void:
	var s: Dictionary = _state({"schedule": [], "season_days": 350})
	CoachReport.push(s, 3, 21)
	var picked: String = String(s["mailbox"][0]["decision"]["choices"][0]["id"])
	assert_bool(CoachReport.apply(s, String(s["mailbox"][0]["id"]), picked)
		).override_failure_message("답이 안 먹혔다 (%s)" % picked).is_true()
	assert_object(DayEngine.stop_reason(s)).override_failure_message(
		"답했는데 진행이 계속 막힌다").is_null()


## 효과가 없는 선택지도 답이다 — 줄은 풀리고 상태는 그대로
func test_a_no_effect_choice_still_answers() -> void:
	var s: Dictionary = _state({"protagonist": _p({"fatigue": 70.0})})
	CoachReport.push(s, 3, 21)
	# 피로 갈래의 두 번째가 "훈련을 유지한다" — 효과가 없는 쪽이다
	assert_bool(CoachReport.apply(s, String(s["mailbox"][0]["id"]), "push")).is_true()
	assert_float(float(s["protagonist"]["fatigue"])).is_equal(70.0)


## ⚠ **두 번 답할 수 없다.** 되면 회복 선택지를 눌러 피로를 계속 깎는다
func test_it_cannot_be_answered_twice() -> void:
	var s: Dictionary = _state({"protagonist": _p({"fatigue": 70.0})})
	CoachReport.push(s, 3, 21)
	var mid: String = String(s["mailbox"][0]["id"])
	assert_bool(CoachReport.apply(s, mid, "rest")).is_true()
	assert_bool(CoachReport.apply(s, mid, "rest")).override_failure_message(
		"같은 결정을 두 번 답할 수 있다").is_false()
	assert_float(float(s["protagonist"]["fatigue"])).is_equal(62.0)


func test_an_unknown_choice_does_nothing() -> void:
	var s: Dictionary = _state()
	CoachReport.push(s, 3, 21)
	assert_bool(CoachReport.apply(s, String(s["mailbox"][0]["id"]), "nope")).is_false()
	assert_object(s["mailbox"][0]["decision"]["selected"]).is_null()


## ⚠ **범위를 벗어나지 않는다.** 피로가 음수면 그 뒤 판정이 전부 뒤집힌다
func test_the_effects_stay_in_range() -> void:
	var s: Dictionary = _state({"protagonist": _p({
		"fatigue": 66.0, "condition": 99.0})})
	CoachReport.push(s, 3, 21)
	CoachReport.apply(s, String(s["mailbox"][0]["id"]), "rest")
	assert_float(float(s["protagonist"]["condition"])).is_less_equal(100.0)


## 경험치는 `TrainingGrowth`가 읽는 그릇에 들어간다 — 따로 두면 아무도 안 읽는다
func test_the_xp_goes_into_the_training_bank() -> void:
	var s: Dictionary = _state({"protagonist": _p({
		"condition": 85.0, "morale": 75.0})})
	CoachReport.push(s, 3, 21)
	CoachReport.apply(s, String(s["mailbox"][0]["id"]), "intensive")
	assert_float(float(s["protagonist"]["pitching_xp"].get("command", 0.0))
		).override_failure_message("커맨드 경험치가 안 쌓였다").is_equal(3.0)


# ── 자동 진행이 답할 수 있는가 ────────────────────────────────

## ⚠ **`AutoAdvance.pick_choice`가 이걸 기다렸다.** 생산처가 없어서 그
## 갈래가 실제 게임에서 한 번도 안 돌았다 — 지친 상태면 쉬는 쪽을 고른다
func test_auto_advance_picks_the_resting_choice_when_tired() -> void:
	var choices: Array = CoachReport.advice(_p({"fatigue": 70.0}))["choices"]
	assert_str(AutoAdvance.pick_choice(choices, 80.0)).override_failure_message(
		"지쳤는데 쉬는 쪽을 안 고른다").is_equal("rest")


## 팔팔하면 나서는 쪽을 고른다
func test_auto_advance_picks_the_active_choice_when_fresh() -> void:
	var choices: Array = CoachReport.advice(_p({
		"condition": 85.0, "morale": 75.0}))["choices"]
	assert_str(AutoAdvance.pick_choice(choices, 10.0)).override_failure_message(
		"팔팔한데 나서는 쪽을 안 고른다").is_equal("intensive")


# ── 배선이 실제로 이어졌는가 ──────────────────────────────────

## ⚠ **주간 처리가 리포트를 넣어야 한다.** 만들어 놓고 안 부르면
## `decision`이 든 소식이 또 0건이 된다
func test_the_week_runner_pushes_the_report() -> void:
	var s: Dictionary = World.new_game({"seed": 7070, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["training_plan"] = {"primary": "TRN_VEL"}
	# 3주차 마지막 날 — `Calendar.week_of`가 3을 준다
	var day: int = 21
	assert_int(Calendar.week_of(day)).is_equal(3)

	WeekRunner.run(s, day)

	var found: bool = false
	for m in s.get("mailbox", []):
		if String(m.get("category", "")) == "coach" \
				and m.get("decision", null) != null:
			found = true
	assert_bool(found).override_failure_message(
		"주간 처리를 돌렸는데 코치 리포트가 안 왔다").is_true()


## ⚠ **자동 진행이 답하면 효과도 걸려야 한다.** `selected`만 쓰면
## 자동으로 지나간 주는 조언이 공짜가 된다
func test_auto_answering_applies_the_effect() -> void:
	var s: Dictionary = _state({"protagonist": _p({"fatigue": 70.0})})
	CoachReport.push(s, 3, 21)
	var mid: String = String(s["mailbox"][0]["id"])

	# 자동 진행이 고르는 그 답을 그대로 적용한다
	var picked: String = AutoAdvance.pick_choice(
		s["mailbox"][0]["decision"]["choices"], 70.0)
	assert_bool(CoachReport.apply(s, mid, picked)).is_true()
	assert_float(float(s["protagonist"]["fatigue"])).override_failure_message(
		"자동으로 답했는데 피로가 안 움직였다").is_not_equal(70.0)


## ⚠ **효과 표가 없는 소식도 답할 수 있어야 한다.** `apply`가 거짓을 주면
## 자동 진행이 그 자리에서 상한까지 헛돈다
func test_a_message_without_effects_still_gets_answered() -> void:
	var s: Dictionary = _state()
	s["mailbox"] = [{
		"id": "plain", "category": "news", "sender": "구단", "subject": "안내",
		"body": "", "day": 1, "read": false,
		"decision": {"prompt": "?", "choices": [{"id": "ok", "label": "확인"}],
			"selected": null},
	}]
	# `CoachReport.apply`는 효과 키가 없어도 선택은 남긴다
	assert_bool(CoachReport.apply(s, "plain", "ok")).is_true()
	assert_str(String(s["mailbox"][0]["decision"]["selected"])).is_equal("ok")


## ⚠ **피로가 이미 낮을 때 회복을 고르면 음수로 간다.** 안 가두면 그 뒤
## 판정이 전부 뒤집힌다 — 지친 선수가 더 잘 크는 꼴이 된다
func test_a_recovery_choice_cannot_push_fatigue_below_zero() -> void:
	var s: Dictionary = _state({"protagonist": _p({
		"fatigue": 2.0, "condition": 60.0, "morale": 55.0})})
	CoachReport.push(s, 3, 21)
	# 기본 갈래의 두 번째가 "회복 세션을 더한다"(−4)다
	assert_bool(CoachReport.apply(s, String(s["mailbox"][0]["id"]), "recover")
		).is_true()
	assert_float(float(s["protagonist"]["fatigue"])).override_failure_message(
		"피로가 %f다 — 범위를 안 가뒀다" % s["protagonist"]["fatigue"]
		).is_equal(0.0)


## 사기도 마찬가지다 — 100을 넘으면 안 된다
func test_morale_cannot_exceed_the_ceiling() -> void:
	var s: Dictionary = _state({"protagonist": _p({"morale": 40.0})})
	s["protagonist"]["morale"] = 40.0
	CoachReport.push(s, 3, 21)
	# 사기 갈래 — 먼저 값을 끌어올린 뒤 적용해 상한을 시험한다
	s["protagonist"]["morale"] = 97.0
	CoachReport.apply(s, String(s["mailbox"][0]["id"]), "mental")
	assert_float(float(s["protagonist"]["morale"])).is_less_equal(100.0)


## ⚠ **기록 사전은 있는데 이닝이 0인 해가 있다.** 다치거나 2군에 있던
## 해가 그렇다 — `is_empty()`만 보면 방어율 0.00이 "최상위권"으로 뜬다
func test_a_zero_inning_record_still_hides_the_era() -> void:
	var s: Dictionary = _state({"season_stats": {
		"ME": {"ip": 0.0, "era": 0.0, "whip": 0.0, "k": 0, "g": 0}}})
	CoachReport.push(s, 3, 21)
	assert_str(String(s["mailbox"][0]["body"])).override_failure_message(
		"한 이닝도 안 던졌는데 방어율이 적혔다").not_contains("평균자책")
