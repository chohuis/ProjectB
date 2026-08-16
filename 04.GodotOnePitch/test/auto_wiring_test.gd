extends GdUnitTestSuite

## 자동 진행 배선 — B-11. **화면 → 루트 → 정책이 실제로 이어졌는가.**
##
## ⚠ **`AutoAdvance`는 정책만 갖고 있었다.** `run`을 부르는 곳이 검사밖에
## 없어서 "무엇 앞에서 멈추나"를 실컷 정해 놓고 게임에서는 한 번도 안 돌았다.
##
## ⚠ **`app_root_test`에서 뽑아냈다.** 그쪽이 6분 19초라 변이 검증의 90초
## 상한을 넘고, 그러면 **모든 변이가 "멈춤"으로 잡힌 것처럼 보인다** —
## 실제로 배선 변이 6건이 전부 가짜로 잡혔다. 판정을 믿으려면 검사가
## 상한 안에 들어야 한다


const ROOT := preload("res://ui/app_root.tscn")


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 1, "season_days": 350, "season_year": 2027,
		"protagonist": {
			"name": "김한결", "team_name": "제주 애월고", "team_id": "TEAM_A",
			"condition": 80.0, "fatigue": 20.0, "injury": null,
			"eligibility_blocked": false, "retired": false,
			"age": 17, "diligence": 60.0,
			"pitching": {"velocity": 70.0, "control": 68.0, "stamina": 66.0},
		},
		"schedule": [], "pending": [], "mailbox": [],
		"training_plan": {}, "training_programs": [],
	}
	s.merge(over, true)
	return s


func _mount(state: Dictionary) -> AppRoot:
	var r: AppRoot = ROOT.instantiate()
	r.set_state(state)
	add_child(r)
	await await_idle_frame()
	return r

# ── 자동 진행 (B-11) ──────────────────────────────────────────
#
# ⚠ **`AutoAdvance`는 정책만 갖고 있었다.** `run`을 부르는 곳이 검사밖에
# 없어서 "무엇 앞에서 멈추나"를 실컷 정해 놓고 게임에서는 한 번도 안 돌았다.
# 여기 검사들이 **화면 → 루트 → 정책**이 실제로 이어졌는지 본다


func test_auto_advance_actually_moves_the_day() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 30, "schedule": []}))
	var before: int = int(r.state()["day"])
	var out: Dictionary = await r.auto_advance()
	var moved: int = int(r.state()["day"]) - before
	assert_int(moved).override_failure_message(
		"자동 진행을 불렀는데 날이 하루도 안 갔다").is_greater(0)

	# ⚠ **한 걸음에 다음 정지까지 간다.** 하루씩 밟으면 걸음마다 진행기가
	# 한 번씩 도는데, 프레임을 넘기며 도는 코루틴이라 **162일짜리 구간이
	# 162번 왕복**한다 — 결과는 같고 시간만 배로 든다. 걸음 수를 안 보면
	# 이 차이가 검사에 안 잡힌다(변이가 그대로 통과했다)
	assert_int(int(out["steps"])).override_failure_message(
		"한 걸음에 하루씩만 갔다 — %d일을 %d걸음에 밟았다"
			% [moved, out["steps"]]).is_less(moved)


## ⚠ **버튼이 실제로 루트를 부르는가.** 시그널만 있고 안 이으면 눌러도
## 아무 일이 안 난다 — 이번 세션에서 그 종류로 결함 다섯을 찾았다
func test_the_auto_button_is_wired_to_the_root() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 30, "schedule": []}))
	var before: int = int(r.state()["day"])
	r.screen()._auto.pressed.emit()
	await await_millis(600)
	assert_int(int(r.state()["day"])).override_failure_message(
		"자동 진행 버튼을 눌렀는데 아무 일도 안 났다").is_greater(before)


## ⚠ **커리어가 갈리는 결정 앞에서는 멈춘다.** 대신 답하면 세계가
## 진로를 정한다 — 02가 그래서 지명받고도 고교에 남았다
func test_auto_advance_stops_at_a_career_decision() -> void:
	var s: Dictionary = _state({"day": 10})
	Pending.push(s, {"type": "fa_market"})
	var r := await _mount(s)
	var out: Dictionary = await r.auto_advance()
	assert_str(String(out["stopped"]["reason"])).is_equal("fa_market")
	assert_int(int(r.state()["day"])).override_failure_message(
		"멈춰야 하는데 날이 갔다").is_equal(10)

	# ⚠ **멈추기만 하고 안 물어보면 진행이 영영 막힌다.** 결정이 대기줄에
	# 오른 채 화면이 안 뜨고, 진행 버튼도 같은 결정 때문에 막혀 있다 —
	# 사용자는 아무것도 누를 수 없는 화면을 본다
	assert_object(r.decision_screen()).override_failure_message(
		"결정 앞에서 멈췄는데 물어보는 화면이 안 떴다").is_not_null()


## ⚠ **왜 멈췄는지가 화면에 떠야 한다.** 안 뜨면 "눌렀는데 조금 가다
## 섰다"가 되고 사용자는 게임이 고장 난 줄 안다
func test_the_stop_reason_shows_on_the_screen() -> void:
	var s: Dictionary = _state({"day": 10})
	Pending.push(s, {"type": "retirement_ask"})
	var r := await _mount(s)
	await r.auto_advance()
	var lab: Label = r.screen()._auto_stop
	assert_bool(lab.visible).override_failure_message(
		"멈춘 이유를 화면이 안 띄운다").is_true()
	assert_str(lab.text).contains(AutoAdvance.label_of("retirement_ask"))


## 다음에 다시 그리면 사라진다 — 지난번 이유가 남아 있으면 방금 멈춘 것처럼 읽힌다
func test_the_stop_reason_clears_on_the_next_advance() -> void:
	var r := await _mount(_state({"day": 10}))
	r.screen().set_auto_stop("연봉 협상")
	await r.advance(1)
	assert_bool(r.screen()._auto_stop.visible).override_failure_message(
		"지난번 정지 사유가 화면에 남았다").is_false()


## ⚠ **한 걸음도 못 갈 때는 버튼이 막혀야 한다.** 살아 있으면 눌러도
## 그 자리에서 되돌아와 "아무 일도 안 났다"가 된다
func test_the_auto_button_is_blocked_when_it_cannot_move() -> void:
	var s: Dictionary = _state({"day": 10})
	s["protagonist"]["retired"] = true
	var r := await _mount(s)
	assert_bool(r.screen()._auto.disabled).override_failure_message(
		"은퇴했는데 자동 진행 버튼이 살아 있다").is_true()


## ⚠ **자동 진행이 내 등판을 넘기면 성적이 쌓여야 한다.** 손으로 던진
## 경기와 다른 길로 기록되면 자동으로 넘긴 등판만 기록이 빈다
func test_auto_advance_records_my_start() -> void:
	var s: Dictionary = World.new_game({"seed": 909, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	# ⚠ **첫 등판 직전에 세운다.** 시즌을 통째로 굴리면 이 검사 하나가
	# 몇 분을 먹고, 그러면 변이 판정의 상한이 통째로 못 믿을 것이 된다
	var first: int = -1
	for g in s.get("schedule", []):
		if not g.get("is_protagonist_game", false):
			continue
		var d: int = int(g.get("day", -1))
		if first < 0 or d < first:
			first = d
	assert_int(first).override_failure_message(
		"주인공 등판이 일정에 하나도 없다 — 이 검사가 아무것도 안 본다").is_greater(0)
	s["day"] = first
	# 그 경기가 끝나면 시즌 끝으로 멈춘다 — 더 굴리지 않는다
	s["season_days"] = first + 1

	var r: AppRoot = await _mount(s)
	await r.auto_advance()

	var played: int = 0
	for g in r.state().get("schedule", []):
		if g.get("is_protagonist_game", false) and g.get("result", null) != null:
			played += 1
	assert_int(played).override_failure_message(
		"자동 진행이 등판일에 멈춰 서서 경기를 안 돌렸다").is_greater(0)
	assert_dict(r.state().get("season_stats", {})).override_failure_message(
		"자동 진행이 등판을 넘겼는데 성적이 안 쌓였다").is_not_empty()


## ⚠ **상태 참조가 바뀌면 안 된다.** 한 걸음마다 루트가 새 사전으로
## 갈아타면 자동 진행은 옛 사전을 보게 되어 날이 안 가는 것처럼 보이고
## 상한까지 헛돈다 — **원인을 찾기 어려운 형태다**
func test_the_state_dictionary_is_not_swapped_out() -> void:
	var r := await _mount(_state({"day": 10}))
	var held: Dictionary = r.state()
	await r.advance(3)
	assert_bool(is_same(held, r.state())).override_failure_message(
		"진행하면서 상태 사전을 갈아치웠다 — 자동 진행이 옛 사전을 본다").is_true()
	assert_int(int(held["day"])).is_equal(13)
