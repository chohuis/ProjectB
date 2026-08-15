extends GdUnitTestSuite

## 자동 진행 정책 — 무엇을 대신 답하고 무엇 앞에서 멈추나. B-11.
##
## ⚠ **02가 여기서 결정을 조용히 버렸다.** 정지 목록에 없는 종류를
## `default:`가 그냥 해소해서, 지명을 받고도 계약 없이 고교에 남았고
## 2031년에 만료된 계약이 2038년까지 남았으며 트레이드는 통보만 사라졌다.


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 10, "season_days": 364, "season_year": 2030,
		"protagonist": {"id": "ME", "retired": false, "fatigue": 50.0},
		"pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _choice(id: String, label: String) -> Dictionary:
	return {"id": id, "label": label}


# ── 멈추는 결정 ───────────────────────────────────────────────

## ⚠ **커리어가 갈리는 지점은 자동 진행이 대신 결정하면 안 된다.**
## 02는 지명 통보가 목록에 없어서 그냥 해소했고, **지명을 받고도 계약이
## 안 된 채 고교에 남았다**
func test_the_career_forks_stop_the_world() -> void:
	for t in ["career_choice_hub", "career_results", "career_choice",
			"draft_observe", "draft_notification", "retirement_ask"]:
		assert_bool(AutoAdvance.is_stopping(t)).override_failure_message(
			"%s 가 자동 진행을 안 멈춘다" % t).is_true()


## ⚠ **계약 셋도 같은 계열이다.** 예전엔 "dev 도구"라며 그냥 버렸다 —
## 자동 진행으로 지나가면 재계약 제안이 사라지고 계약이 만료된 채 남는다
func test_the_contract_decisions_stop_the_world() -> void:
	for t in ["salary_negotiation", "option_clause", "fa_market"]:
		assert_bool(AutoAdvance.is_stopping(t)).override_failure_message(
			"%s 가 자동 진행을 안 멈춘다 — 계약이 조용히 버려진다" % t).is_true()


## ⚠ **트레이드는 소속이 바뀐다.** 02는 "결과가 상태에 남지 않는 알림성"으로
## 분류해 그냥 해소했고, 통보만 사라지고 팀은 그대로였다
func test_a_trade_stops_the_world() -> void:
	assert_bool(AutoAdvance.is_stopping("trade")).override_failure_message(
		"트레이드 통보가 조용히 버려진다 — 팀이 그대로 남는다").is_true()


## 경기·소식은 대신 답할 수 있다 — 그건 결과가 상태에 남는 결정이 아니다
func test_a_routine_notice_does_not_stop_the_world() -> void:
	for t in ["game", "message", "event", "injury_treatment"]:
		assert_bool(AutoAdvance.is_stopping(t)).override_failure_message(
			"%s 때문에 자동 진행이 멈춘다" % t).is_false()


## ⚠ **알림 뒤에 숨은 결정을 찾는다.** 줄의 맨 앞만 보면 경기 뒤에 있는
## 지명 통보를 못 본다
func test_the_blocking_one_is_found_behind_routine_notices() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "schedule_id": "G1"})
	Pending.push(s, {"type": "message", "message_id": "M1"})
	Pending.push(s, {"type": "draft_notification", "team_id": "T"})
	assert_str(String(AutoAdvance.blocking(s)["type"])).override_failure_message(
		"알림 뒤에 숨은 결정을 못 찾는다").is_equal("draft_notification")


func test_nothing_blocks_when_there_is_only_routine() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "schedule_id": "G1"})
	assert_dict(AutoAdvance.blocking(s)).is_empty()


## 사람이 읽을 이름 — 자동 진행이 "왜 멈췄는지"를 적는다
func test_a_stopping_decision_has_its_own_name() -> void:
	assert_str(AutoAdvance.label_of("draft_notification")).is_not_empty()
	assert_str(AutoAdvance.label_of("draft_notification")
		).override_failure_message(
		"두 결정의 이름이 같다 — 어느 것 때문에 멈췄는지 못 가린다"
	).is_not_equal(AutoAdvance.label_of("salary_negotiation"))


## 이름이 없는 종류도 무언가는 돌려준다 — 빈 문자열이면 "정지: "만 뜬다
func test_an_unnamed_decision_still_says_something() -> void:
	assert_str(AutoAdvance.label_of("something_new")).is_not_empty()


# ── 정지 주차 ─────────────────────────────────────────────────

## ⚠ **지나쳤는지를 본다.** "지금이 40주인가"로 물으면 한 번에 여러 주를
## 건너뛸 때 그 자리를 그냥 지나간다
func test_a_skipped_stop_week_is_still_caught() -> void:
	assert_int(AutoAdvance.stop_week_between(38, 45)).override_failure_message(
		"38주에서 45주로 건너뛰며 40주를 그냥 지나쳤다").is_equal(40)


func test_the_stop_week_triggers_on_arrival() -> void:
	assert_int(AutoAdvance.stop_week_between(39, 40)).is_equal(40)


func test_an_ordinary_stretch_does_not_stop() -> void:
	assert_int(AutoAdvance.stop_week_between(10, 20)).is_equal(0)


## 이미 지난 주차는 다시 안 잡는다 — 안 그러면 40주 뒤로 못 나아간다
func test_a_passed_stop_week_is_not_caught_again() -> void:
	assert_int(AutoAdvance.stop_week_between(41, 50)).is_equal(0)


func test_the_late_season_stop_is_separate() -> void:
	assert_int(AutoAdvance.stop_week_between(45, 52)).is_equal(51)


# ── 선택지 고르기 ─────────────────────────────────────────────

func test_no_choice_answers_ok() -> void:
	assert_str(AutoAdvance.pick_choice([], 50.0)).is_equal("ok")


func test_a_single_choice_is_taken() -> void:
	assert_str(AutoAdvance.pick_choice([_choice("only", "확인")], 50.0)).is_equal("only")


## ⚠ **지쳤으면 쉬는 쪽.** 늘 첫 번째를 고르면 자동 진행이 피로를 무시하고
## 부상으로 간다
func test_a_tired_player_rests() -> void:
	var choices: Array = [_choice("go", "특별 훈련 참가"), _choice("rest", "휴식")]
	assert_str(AutoAdvance.pick_choice(choices, 90.0)).override_failure_message(
		"탈진인데 훈련을 고른다").is_equal("rest")


func test_a_fresh_player_takes_the_chance() -> void:
	var choices: Array = [_choice("rest", "휴식"), _choice("go", "특별 훈련 참가")]
	assert_str(AutoAdvance.pick_choice(choices, 10.0)).override_failure_message(
		"팔팔한데 쉬는 쪽을 고른다").is_equal("go")


## 어중간하면 첫 번째 — 억지로 한쪽으로 몰지 않는다
func test_a_middling_player_takes_the_first() -> void:
	var choices: Array = [_choice("a", "휴식"), _choice("b", "훈련")]
	assert_str(AutoAdvance.pick_choice(choices, 50.0)).is_equal("a")


## 맞는 말이 없으면 첫 번째로 떨어진다
func test_an_unmatched_label_falls_back() -> void:
	var choices: Array = [_choice("a", "가만히 있는다"), _choice("b", "생각해 본다")]
	assert_str(AutoAdvance.pick_choice(choices, 90.0)).is_equal("a")


# ── 다음에 무엇을 하나 ────────────────────────────────────────

## ⚠ **은퇴하면 더 안 간다.** 안 막으면 은퇴한 선수가 계속 등판하고
## 나이를 먹는다
func test_a_retired_player_stops_everything() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["retired"] = true
	Pending.push(s, {"type": "game", "schedule_id": "G1"})
	var step: Dictionary = AutoAdvance.next_step(s)
	assert_str(String(step["kind"])).is_equal("stop")
	assert_str(String(step["reason"])).is_equal("retired")


func test_the_season_end_stops_everything() -> void:
	var s: Dictionary = _state({"day": 364})
	var step: Dictionary = AutoAdvance.next_step(s)
	assert_str(String(step["kind"])).is_equal("stop")
	assert_str(String(step["reason"])).is_equal("season_end")


## ⚠ **은퇴가 시즌 끝보다 먼저다.** 순서가 반대면 은퇴한 해에 시즌 종료로
## 읽혀 다음 해가 열린다
func test_retirement_outranks_the_season_end() -> void:
	var s: Dictionary = _state({"day": 364})
	s["protagonist"]["retired"] = true
	assert_str(String(AutoAdvance.next_step(s)["reason"])).is_equal("retired")


func test_a_blocking_decision_stops_the_run() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "game", "schedule_id": "G1"})
	Pending.push(s, {"type": "fa_market"})
	var step: Dictionary = AutoAdvance.next_step(s)
	assert_str(String(step["kind"])).is_equal("stop")
	assert_str(String(step["reason"])).is_equal("fa_market")
	assert_str(String(step["label"])).is_not_empty()


## ⚠ **멈추는 결정이 알림보다 먼저다.** 알림을 먼저 답하다 보면 그 사이에
## 결정이 밀려 영영 안 물어보는 해가 생긴다
func test_a_decision_outranks_a_routine_notice() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "message", "message_id": "M1"})
	Pending.push(s, {"type": "trade", "to_team_id": "T"})
	assert_str(String(AutoAdvance.next_step(s)["reason"])).is_equal("trade")


func test_a_routine_notice_is_answered() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "message", "message_id": "M1"})
	var step: Dictionary = AutoAdvance.next_step(s)
	assert_str(String(step["kind"])).is_equal("answer")
	assert_str(String(step["action"]["type"])).is_equal("message")


func test_an_empty_queue_just_advances() -> void:
	assert_str(String(AutoAdvance.next_step(_state())["kind"])).is_equal("advance")


## ⚠ **헛도는 것을 막는 상한이 있다.** 없으면 세이브 하나 때문에 게임이 멈춘다
func test_there_is_a_step_limit() -> void:
	assert_int(AutoAdvance.MAX_STEPS).is_greater(0)


# ── 돌린다 ────────────────────────────────────────────────────

## 하루씩 민다
func _step_a_day(s: Dictionary) -> void:
	s["day"] = int(s["day"]) + 1


## 알림 하나를 답한다 — 줄에서 뺀다
func _answer(s: Dictionary, action: Dictionary) -> void:
	Pending.resolve(s, String(action.get("type", "")))


## 답한 척만 한다 — 줄이 안 줄어든다
func _answer_nothing(_s: Dictionary, _action: Dictionary) -> void:
	pass


func test_it_runs_until_the_season_ends() -> void:
	var s: Dictionary = _state({"day": 360, "season_days": 364})
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	assert_str(String(out["stopped"]["reason"])).is_equal("season_end")
	assert_int(int(s["day"])).is_equal(364)


## 알림은 대신 답하고 계속 간다
func test_it_answers_the_routine_and_keeps_going() -> void:
	var s: Dictionary = _state({"day": 360, "season_days": 364})
	Pending.push(s, {"type": "message", "message_id": "M1"})
	Pending.push(s, {"type": "message", "message_id": "M2"})
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	assert_array(Pending.all(s)).override_failure_message(
		"알림이 줄에 남았다").is_empty()
	assert_str(String(out["stopped"]["reason"])).is_equal("season_end")

	# ⚠ **답한 걸음은 날을 안 민다.** 답하고 그 자리에서 또 진행하면
	# 소식 하나에 하루가 딸려 사라진다 — 답 2 + 진행 4
	assert_int(int(out["steps"])).override_failure_message(
		"답하면서 날까지 밀었다 (걸음 %d)" % out["steps"]).is_equal(6)


## ⚠ **결정 앞에서는 멈춘다.** 대신 답하면 커리어가 갈리는 지점을 세계가 정한다
func test_it_stops_at_a_decision() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "message", "message_id": "M1"})
	Pending.push(s, {"type": "draft_notification", "team_id": "T"})
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	assert_str(String(out["stopped"]["reason"])).is_equal("draft_notification")
	assert_bool(Pending.has(s, "draft_notification")).override_failure_message(
		"멈췄다면서 결정을 치웠다").is_true()


## ⚠ **정지 주차를 지나치면 멈춘다.** 시즌이 끝나 가는 자리를 그냥
## 지나가면 사용자가 손쓸 데가 없다
func test_it_stops_at_a_stop_week() -> void:
	var s: Dictionary = _state({"day": 39 * 7, "season_days": 364})
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	assert_str(String(out["stopped"]["reason"])).override_failure_message(
		"정지 주차를 그냥 지나쳤다").is_equal("stop_week")
	assert_int(int(out["stopped"]["week"])).is_equal(40)


## 같은 자리에서 두 번은 안 멈춘다 — 그러면 그 주 뒤로 못 나아간다
func test_it_moves_past_a_stop_week() -> void:
	var s: Dictionary = _state({"day": 39 * 7, "season_days": 364})
	AutoAdvance.run(s, _step_a_day, _answer)
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	# 다음 정지 주차(51)까지는 간다 — 40주에 다시 걸리면 못 나아간다
	assert_int(int(out["stopped"].get("week", 0))).override_failure_message(
		"같은 정지 주차(40)에 다시 걸려 못 나아간다").is_not_equal(40)
	assert_int(int(s["day"])).is_greater(41 * 7)


## ⚠ **줄이 안 줄어도 영원히 안 돈다.** 세이브 하나 때문에 게임이
## 멈추면 안 된다
func test_a_stuck_queue_hits_the_limit() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "message", "message_id": "M1"})
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer_nothing, 20)
	assert_str(String(out["stopped"]["reason"])).is_equal("max_steps")
	assert_int(int(out["steps"])).is_equal(20)


func test_a_retired_player_stops_the_run_immediately() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["retired"] = true
	var out: Dictionary = AutoAdvance.run(s, _step_a_day, _answer)
	assert_str(String(out["stopped"]["reason"])).is_equal("retired")
	assert_int(int(out["steps"])).override_failure_message(
		"은퇴했는데 하루라도 갔다").is_equal(0)
