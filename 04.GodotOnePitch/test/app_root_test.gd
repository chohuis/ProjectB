extends GdUnitTestSuite

## 앱 루트 — M7-4.
##
## 지금까지 만든 조각이 **실제로 이어지는 첫 지점**이다. 여기가 하는 일:
##
##   진행 버튼 → `DayRunner` → 경기 시뮬 → 주기 처리 → 새 ViewModel
##
## ⚠ **제일 위험한 자리는 주 경계다.** `DayEngine`이 세고 여기가 적용한다 —
## 둘이 어긋나면 성장이 2배가 되거나 0이 되는데 **오류도 로그도 안 난다.**
## 그래서 "센 만큼 정확히 돌렸나"를 검사가 직접 본다.


const ROOT := preload("res://ui/app_root.tscn")


func _game(day: int, mine: bool = false, id: String = "") -> Dictionary:
	return {"id": id if id != "" else "G%d" % day, "day": day,
		"is_protagonist_game": mine, "home": "TEAM_A", "away": "TEAM_B", "result": null}


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


# ── 이어져 있는가 ─────────────────────────────────────────────

func test_it_shows_the_state_on_the_screen() -> void:
	var r := await _mount(_state({"day": 10}))
	assert_str(r.screen()._date.text).is_equal("2027년 3월 10일")


## ⚠ **화면이 자기 사전을 따로 만들지 않는다.** 루트가 만든 것과 같아야
## 한다 — 두 벌이 되면 하나만 갱신되는 순간이 온다
func test_the_screen_gets_the_root_view_model() -> void:
	var st := _state({"day": 10, "schedule": [_game(15, true)]})
	var r := await _mount(st)
	assert_str(r.screen()._advance.text).is_equal(MainVm.build(st)["advance_label"])


# ── 진행 ──────────────────────────────────────────────────────

func test_pressing_advance_moves_the_day() -> void:
	var r := await _mount(_state({"day": 10, "schedule": [_game(15, true)]}))
	await r.advance(5)
	assert_int(r.state()["day"]).is_equal(15)


func test_advancing_refreshes_the_screen() -> void:
	var r := await _mount(_state({"day": 10, "schedule": [_game(15, true)]}))
	await r.advance(5)
	assert_str(r.screen()._date.text).is_equal("2027년 3월 15일")


func test_it_plays_the_games_along_the_way() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350, "schedule": [
		_game(11, false, "A"), _game(12, false, "B"), _game(20, true, "MINE")]}))
	await r.advance(10)
	assert_int(r.games_played).is_equal(2)


## ⚠ **치른 경기는 결과가 남아야 한다.** 안 남으면 다시 진행할 때 또 돌린다
func test_a_played_game_keeps_its_result() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350,
		"schedule": [_game(11, false, "A")]}))
	await r.advance(5)
	for g in r.state()["schedule"]:
		if g["id"] == "A":
			assert_object(g["result"]).is_not_null()
			return
	fail("경기 A가 없어졌다")


func test_advancing_stops_at_my_game() -> void:
	var r := await _mount(_state({"day": 10, "schedule": [_game(13, true, "MINE")]}))
	await r.advance(20)
	assert_int(r.state()["day"]).is_equal(13)
	assert_str(r.screen()._vm["stop_type"]).is_equal("game")


# ── 주 경계 (제일 위험한 자리) ────────────────────────────────

## ⚠ **센 만큼 정확히 돌린다.** 한 번 더 돌면 성장이 2배, 건너뛰면 0이다
func test_it_runs_the_weekly_pass_once_per_crossed_boundary() -> void:
	var r := await _mount(_state({"day": 1, "season_days": 350}))
	await r.advance(30)
	assert_int(r.weekly_passes).is_equal(DayEngine.week_boundaries_crossed(1, 31))
	assert_int(r.weekly_passes).is_equal(4)


## ⚠ **하루씩 간 것과 한 번에 간 것이 같아야 한다.** 여기가 갈리면
## "천천히 진행하면 더 큰다"가 된다
func test_stepping_day_by_day_runs_the_same_number_of_weekly_passes() -> void:
	var big := await _mount(_state({"day": 1, "season_days": 350}))
	await big.advance(28)

	var small := await _mount(_state({"day": 1, "season_days": 350}))
	for i in 28:
		await small.advance(1)

	assert_int(small.state()["day"]).is_equal(big.state()["day"])
	assert_int(small.weekly_passes).is_equal(big.weekly_passes)


## 멈춘 날까지만 센다 — 안 산 날의 성장이 붙으면 조용히 앞서간다
func test_a_stop_cuts_the_weekly_passes_too() -> void:
	var r := await _mount(_state({"day": 1, "schedule": [_game(10, true, "MINE")]}))
	await r.advance(30)
	assert_int(r.state()["day"]).is_equal(10)
	assert_int(r.weekly_passes).is_equal(1)   # 7일차 하나


func test_a_quiet_short_span_crosses_nothing() -> void:
	var r := await _mount(_state({"day": 8, "season_days": 350}))
	await r.advance(5)
	assert_int(r.weekly_passes).is_equal(0)


## ⚠ **주기 처리가 실제로 선수를 바꿔야 한다.** 횟수만 맞고 아무 일도
## 안 하면 검사가 통과하면서 성장이 통째로 없다
func test_the_weekly_pass_actually_changes_the_player() -> void:
	var r := await _mount(_state({"day": 1, "season_days": 350,
		"protagonist": {"fatigue": 40.0, "condition": 60.0}}))
	await r.advance(30)
	# 훈련을 안 짜도 주간 자동 회복이 붙는다 — 4주 × −5
	assert_float(r.state()["protagonist"]["fatigue"]).is_equal_approx(20.0, 0.001)
	# ⚠ **컨디션도 따로 본다.** 피로만 보면 두 값을 뒤바꿔 넣어도 통과한다
	assert_float(r.state()["protagonist"]["condition"]).is_equal_approx(80.0, 0.001)


## ⚠ **피로·컨디션이 0~100을 안 벗어난다.** 여러 주를 한 번에 진행하면
## 회복이 쌓여 음수로 간다 — 음수 피로는 성장 승수를 이상하게 만든다
func test_the_weekly_pass_keeps_values_in_range() -> void:
	var r := await _mount(_state({"day": 1, "season_days": 350,
		"protagonist": {"fatigue": 5.0, "condition": 98.0}}))
	await r.advance(80)
	assert_float(r.state()["protagonist"]["fatigue"]).is_greater_equal(0.0)
	assert_float(r.state()["protagonist"]["condition"]).is_less_equal(100.0)


# ── 겹쳐 누르기 ───────────────────────────────────────────────

## ⚠ **진행 중엔 버튼이 잠긴다.** 진행기도 막지만 화면이 먼저 말해야 한다.
##
## ⚠ **무거운 표본이어야 한다.** 가벼우면 프레임을 안 넘겨서 중간 알림이
## 아예 안 나고, 그러면 이 검사가 아무것도 안 본다
func test_the_button_locks_while_running() -> void:
	var games: Array = []
	for i in 300:
		games.append(_game(2 + i / 6, false, "G%d" % i))
	var r := await _mount(_state({"day": 1, "season_days": 350, "schedule": games}))

	var locked: Array = []
	r.runner().progress.connect(func(done: int, total: int) -> void:
		if done > 0 and done < total:
			locked.append(r.screen()._advance.disabled))
	await r.advance(60)

	assert_int(locked.size()).override_failure_message("중간 진행 알림이 없다").is_greater(0)
	for l in locked:
		assert_bool(l).is_true()


## ⚠ **버튼을 실제로 눌러본다.** `advance()`를 직접 부르는 검사만 있으면
## **버튼과 루트를 잇는 선이 끊겨도 전부 통과한다** — 화면에선 아무 일도
## 안 일어나는데 검사는 초록불이다
func test_the_button_itself_advances() -> void:
	var r := await _mount(_state({"day": 10, "schedule": [_game(15, true)]}))
	r.screen()._advance.pressed.emit()
	await await_millis(200)
	assert_int(r.state()["day"]).is_equal(15)


# ── 터지지 않기 ───────────────────────────────────────────────

func test_it_mounts_without_any_state() -> void:
	var r: AppRoot = ROOT.instantiate()
	add_child(r)
	await await_idle_frame()
	assert_object(r.screen()).is_not_null()


## ⚠ **아예 안 돌아야 한다.** 진행기를 부르면 날짜는 그대로여도 상태에
## 진행 결과 필드가 붙어서, 다음 진행이 옛 값을 물고 시작한다
func test_advancing_zero_days_does_nothing() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350}))
	await r.advance(0)
	assert_int(r.state()["day"]).is_equal(10)
	assert_int(r.weekly_passes).is_equal(0)
	assert_bool(r.state().has("stopped_by")).is_false()


## ⚠ **은퇴하면 더 안 간다.** 안 막으면 은퇴한 선수가 계속 등판하고 나이를 먹는다
func test_a_retired_player_does_not_advance() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350,
		"protagonist": {"retired": true}}))
	await r.advance(30)
	assert_int(r.state()["day"]).is_equal(10)
	# 진행기를 아예 안 불렀다 — 불렀으면 멈춘 이유가 상태에 붙는다
	assert_bool(r.state().has("stopped_by")).is_false()


## ⚠ **진행 결과에만 있는 필드는 상태에 안 남는다.** 남으면 다음 진행이
## 지난번 `weeks_crossed`를 물고 시작해서, 화면이 옛 값을 읽는다
func test_run_only_fields_do_not_stick_to_the_state() -> void:
	var r := await _mount(_state({"day": 1, "season_days": 350,
		"schedule": [_game(3, false, "A")]}))
	await r.advance(10)
	assert_bool(r.state().has("games_today")).is_false()
	assert_bool(r.state().has("weeks_crossed")).is_false()


## ⚠ **겹쳐 누르면 아무 일도 안 일어나야 한다.** 진행기가 빈 사전을
## 돌려주는데 그걸 그대로 상태로 삼으면 **세이브가 통째로 날아간다.**
##
## ⚠ **끝나고 보면 못 잡는다.** 거절된 호출이 상태를 비워도 원래 진행이
## 나중에 제대로 된 값으로 덮어써서, 최종 상태는 멀쩡해 보인다 —
## **진행 도중에 한 번이라도 비었는지**를 봐야 한다
func test_a_rejected_run_does_not_wipe_the_state() -> void:
	var games: Array = []
	for i in 300:
		games.append(_game(2 + i / 6, false, "G%d" % i))
	var r := await _mount(_state({"day": 1, "season_days": 350, "schedule": games}))

	var wiped: Array = []
	r.runner().progress.connect(func(done: int, total: int) -> void:
		if done > 0 and done < total:
			r.advance.call_deferred(60)
			if not r.state().has("protagonist"):
				wiped.append(done))
	await r.advance(60)

	assert_int(r.runner().rejected_runs).override_failure_message(
		"겹친 호출이 아예 안 일어났다").is_greater(0)
	assert_array(wiped).override_failure_message("진행 도중 상태가 비었다").is_empty()
	assert_str(r.state()["protagonist"]["name"]).is_equal("김한결")


## ⚠ **거르기 선택은 상태가 들고 있다.** 화면이 자기 안에 들고 있으면
## 진행 뒤에 새 사전이 오면서 초기화된다 — 소식을 거르고 하루 진행하면
## 전체로 돌아가는데, 사용자는 자기가 뭘 잘못 눌렀는지 모른다
func test_the_news_filter_survives_advancing() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350, "mailbox": [
		{"id": "M1", "category": "news", "read": false, "day": 5}]}))
	r.screen().news_filter_selected.emit("unread")
	assert_str(r.state()["news_filter"]).is_equal("unread")

	await r.advance(5)
	assert_str(r.state()["news_filter"]).is_equal("unread")
	assert_str(r.screen()._vm["news"]["active_filter"]).is_equal("unread")


## ⚠ **부른 쪽 사전을 그대로 들고 있지 않는다.** 들고 있으면 호출부(세이브·
## 새 게임 화면)가 자기 사전을 고칠 때 진행 중인 게임이 모르게 바뀐다.
##
## 진행이 끝난 뒤를 보면 못 잡는다 — 어차피 새 사전으로 갈아타기 때문이다.
## **넣자마자** 원본을 고쳐서 본다
func test_it_copies_the_state_it_is_given() -> void:
	var given := _state({"day": 10, "season_days": 350})
	var r := await _mount(given)

	given["day"] = 99
	given["보이면안됨"] = true
	given["protagonist"]["name"] = "다른사람"

	assert_int(r.state()["day"]).is_equal(10)
	assert_bool(r.state().has("보이면안됨")).is_false()
	assert_str(r.state()["protagonist"]["name"]).is_equal("김한결")


# ── 루트가 계산을 갖지 않는가 ─────────────────────────────────

## 루트는 **잇는 곳**이지 계산하는 곳이 아니다. 날짜·정지 판정·주 경계는
## 전부 이미 있는 모듈에 물어본다
func test_the_root_does_not_recompute() -> void:
	var src := FileAccess.get_file_as_string("res://ui/app_root.gd")
	assert_str(src).not_contains("Calendar.")
	assert_str(src).not_contains("sort_custom")
	# 주 경계를 자기 손으로 세면 안 된다 — 세는 곳은 하나다
	assert_str(src).not_contains("% 7")
	assert_str(src).not_contains("/ 7")


# ── 저장·불러오기 ─────────────────────────────────────────────

const SAVE_TEST_PATH := "user://approot_test.sav"


func _cleanup_save() -> void:
	if FileAccess.file_exists(SAVE_TEST_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_TEST_PATH))


## 껐다 켜도 그 자리에서 이어진다
func test_a_game_survives_save_and_load() -> void:
	_cleanup_save()
	var r := await _mount(_state({"day": 10, "season_days": 350,
		"schedule": [_game(15, true)]}))
	await r.advance(5)
	assert_int(r.state()["day"]).is_equal(15)
	assert_int(r.save(SAVE_TEST_PATH)).is_equal(OK)

	# 다른 게임을 띄우고 불러온다
	var r2 := await _mount(_state({"day": 1, "season_days": 350}))
	assert_str(r2.load_from(SAVE_TEST_PATH)).is_empty()
	assert_int(r2.state()["day"]).is_equal(15)
	assert_str(r2.screen()._date.text).is_equal("2027년 3월 15일")
	_cleanup_save()


## ⚠ **불러오기가 실패하면 지금 게임을 안 건드린다.** 세이브가 상했다고
## 진행 중이던 게임까지 날아가면 안 된다
func test_a_failed_load_leaves_the_current_game_alone() -> void:
	var r := await _mount(_state({"day": 33, "season_days": 350}))
	assert_str(r.load_from("user://no_such_save.sav")).is_not_empty()
	assert_int(r.state()["day"]).is_equal(33)
	assert_str(r.screen()._date.text).is_equal("2027년 4월 2일")


## ⚠ **진행 중에는 저장하지 않는다.** 진행기가 상태를 갈아타는 도중이라
## 반쯤 진행된 세이브가 남는다 — 불러오면 그날 경기가 사라져 있다
func test_saving_while_running_is_refused() -> void:
	_cleanup_save()
	var games: Array = []
	for i in 300:
		games.append(_game(2 + i / 6, false, "G%d" % i))
	var r := await _mount(_state({"day": 1, "season_days": 350, "schedule": games}))

	var refused: Array = []
	r.runner().progress.connect(func(done: int, total: int) -> void:
		if done > 0 and done < total:
			refused.append(r.save(SAVE_TEST_PATH)))
	await r.advance(60)

	assert_int(refused.size()).override_failure_message("진행 중 저장을 안 시도했다") \
		.is_greater(0)
	for e in refused:
		assert_int(e).is_equal(ERR_BUSY)
	_cleanup_save()


## ⚠ **고른 리그도 상태가 들고 있다.** 화면이 들면 진행 뒤에 초기화된다
func test_the_league_choice_survives_advancing() -> void:
	var r := await _mount(_state({"day": 10, "season_days": 350}))
	r.screen().league_selected.emit("LEAGUE_JBL")
	assert_str(r.state()["league_tab"]).is_equal("LEAGUE_JBL")
	await r.advance(5)
	assert_str(r.screen()._vm["league"]["league_id"]).is_equal("LEAGUE_JBL")


# ── 경기 화면 ─────────────────────────────────────────────────

func _game_day_state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		if g["is_protagonist_game"]:
			s["day"] = int(g["day"])
			break
	return s


func test_a_game_day_opens_the_match() -> void:
	var r := await _mount(_game_day_state())
	assert_str(r.open_match()).is_empty()
	assert_object(r.match_screen()).is_not_null()
	# 경기 중엔 진행 화면이 안 보인다
	assert_bool(r.screen().visible).is_false()


func test_a_quiet_day_has_no_match_to_open() -> void:
	var r := await _mount(_state({"day": 5, "season_days": 350}))
	assert_str(r.open_match()).is_not_empty()


func test_pitching_advances_the_match() -> void:
	var r := await _mount(_game_day_state())
	r.open_match()
	var before: int = int(r.match_state()["state"]["pitch_count"])
	r._on_pitch()
	assert_int(int(r.match_state()["state"]["pitch_count"])).is_greater(before)


## ⚠ **끝낸 경기만 결과를 남긴다.** 도중에 닫고 결과를 남기면 그때까지의
## 점수가 순위표에 들어간다
func test_finishing_a_match_records_the_result() -> void:
	var s: Dictionary = _game_day_state()
	var r := await _mount(s)
	r.open_match()
	var gid: String = r.match_state()["game_id"]
	r._on_auto()
	r._on_match_done()

	for g in r.state()["schedule"]:
		if g["id"] == gid:
			assert_object(g["result"]).override_failure_message(
				"끝낸 경기에 결과가 없다").is_not_null()
			return
	fail("경기를 못 찾았다")


func test_closing_an_unfinished_match_records_nothing() -> void:
	var r := await _mount(_game_day_state())
	r.open_match()
	var gid: String = r.match_state()["game_id"]
	r._on_pitch()
	r._on_match_done()

	for g in r.state()["schedule"]:
		if g["id"] == gid:
			assert_object(g["result"]).override_failure_message(
				"도중에 닫았는데 결과가 남았다").is_null()
			return
	fail("경기를 못 찾았다")


## 닫으면 진행 화면으로 돌아온다
func test_closing_the_match_returns_to_the_main_screen() -> void:
	var r := await _mount(_game_day_state())
	r.open_match()
	r._on_match_done()
	assert_object(r.match_screen()).is_null()
	assert_bool(r.screen().visible).is_true()


## ⚠ **경기를 끝내면 그날이 더 이상 정지 사유가 아니다.** 아니면 닫자마자
## 다시 "경기 시작"이 뜬다
func test_after_the_match_the_day_can_advance() -> void:
	var r := await _mount(_game_day_state())
	r.open_match()
	r._on_auto()
	r._on_match_done()
	assert_str(r.screen()._vm["stop_type"]).override_failure_message(
		"경기를 끝냈는데 아직 %s로 멈춰 있다" % r.screen()._vm["stop_type"]).is_empty()
