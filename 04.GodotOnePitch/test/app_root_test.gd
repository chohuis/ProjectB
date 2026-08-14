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


# ── 시즌 성적이 쌓이는가 (M9-7a) ──────────────────────────────

func _real_game(seed_value: int = 4242) -> Dictionary:
	return World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


## ⚠ **아무도 `season_stats`를 안 채우고 있었다.** "나" 탭도 수상도 이
## 사전을 읽는데 쌓는 자리가 없어서 화면이 늘 빈칸이었다
func test_playing_games_fills_the_season_stats() -> void:
	var s: Dictionary = _real_game()
	var first: int = 999
	for g in s["schedule"]:
		first = mini(first, int(g["day"]))
	s["day"] = first

	var r: AppRoot = await _mount(s)
	await r.advance(3)

	var stats: Dictionary = r.state().get("season_stats", {})
	assert_int(stats.size()).override_failure_message(
		"경기를 치렀는데 시즌 성적이 0명이다").is_greater(0)


## ⚠ **진행기가 상태를 복사한다.** 바깥 사전에 쌓으면 진행이 끝날 때
## 통째로 덮어써진다 — 성장이 조용히 사라졌던 그 자리다
func test_the_stats_survive_the_advance() -> void:
	var s: Dictionary = _real_game()
	var first: int = 999
	for g in s["schedule"]:
		first = mini(first, int(g["day"]))
	s["day"] = first

	var r: AppRoot = await _mount(s)
	await r.advance(2)
	var after_first: int = r.state().get("season_stats", {}).size()
	assert_int(after_first).is_greater(0)

	await r.advance(2)
	assert_int(r.state().get("season_stats", {}).size()).override_failure_message(
		"두 번째 진행에서 성적이 %d → %d로 줄었다"
		% [after_first, r.state().get("season_stats", {}).size()]) \
		.is_greater_equal(after_first)


## 같은 선수의 기록이 경기마다 더해져야 한다 — 덮어쓰면 늘 1경기다
func test_the_stats_add_up_over_games() -> void:
	var s: Dictionary = _real_game()
	var first: int = 999
	for g in s["schedule"]:
		first = mini(first, int(g["day"]))
	s["day"] = first

	var r: AppRoot = await _mount(s)
	await r.advance(20)

	var most: int = 0
	for pid in r.state().get("season_stats", {}):
		most = maxi(most, int(r.state()["season_stats"][pid].get("g", 0)))
	assert_int(most).override_failure_message(
		"20일을 진행했는데 최다 출전이 %d경기다 — 덮어쓰고 있다" % most) \
		.is_greater(1)


## ⚠ **제자리로 쌓는다.** 사전을 복사하면 하루 83경기에 58만 키다
func test_the_stats_accumulate_in_place() -> void:
	var stats: Dictionary = {}
	SeasonStats.accumulate_into(stats, [
		{"player_id": "P1", "role": "pitcher", "ip": 6.0, "er": 2.0, "k": 5},
	])
	assert_int(stats.size()).override_failure_message(
		"제자리 누적인데 원본이 안 바뀐다").is_equal(1)

	SeasonStats.accumulate_into(stats, [
		{"player_id": "P1", "role": "pitcher", "ip": 7.0, "er": 1.0, "k": 8},
	])
	assert_int(int(stats["P1"]["g"])).is_equal(2)
	assert_float(float(stats["P1"]["ip"])).is_equal_approx(13.0, 0.01)
	assert_int(int(stats["P1"]["k"])).is_equal(13)


## 새 사전을 주는 쪽과 결과가 같아야 한다 — 두 정본이 갈리면 안 된다
func test_both_accumulators_agree() -> void:
	var lines: Array = [
		{"player_id": "P1", "role": "pitcher", "ip": 6.0, "er": 2.0, "k": 5},
		{"player_id": "B1", "role": "batter", "ab": 4, "h": 2, "hr": 1},
	]
	var copied: Dictionary = SeasonStats.accumulate({}, lines)
	var in_place: Dictionary = {}
	SeasonStats.accumulate_into(in_place, lines)
	assert_dict(in_place).is_equal(copied)


## ⚠ **주인공 성적은 경기 화면을 거쳐야 쌓인다.** 등판일엔 진행이 멈추므로
## 자동 시뮬이 그 경기를 안 돈다 — 자동 쪽에만 누적을 붙이면 **주인공만
## 영영 기록이 없다.** 실제로 "나" 탭이 빈칸이었다.
##
## ⚠ **"오늘 등판"이 곧 실제 등판은 아니다.** `is_my_start`는 불펜을 확률로
## 내보내는데 경기 엔진은 그걸 모른다 — M3-2의 미완성이라 여기서는
## **주인공이 실제로 마운드에 서는 경기**를 찾아서 본다
func _find_my_real_start(s: Dictionary) -> Dictionary:
	var me: String = s["protagonist"]["id"]
	for g in s["schedule"]:
		if not g.get("is_protagonist_game", false):
			continue
		var probe: Dictionary = LiveMatch.open(s, g)
		if not probe["ok"]:
			continue
		if String(probe["state"].get("pitcher", {}).get("id", "")) == me:
			return g
		var other: String = "away_pitcher" if probe["ctx"]["my_side"] == "away" \
			else "home_pitcher"
		if String(probe["state"].get(other, {}).get("id", "")) == me:
			return g
	return {}


func test_a_hand_pitched_game_fills_my_stats() -> void:
	# ⚠ **씨앗 777은 주인공이 선발이다.** 불펜이면 실제로 등판을 못 한다 —
	# 투수 교체가 아직 경기에 안 붙어 있어서다(별도 결함)
	var s: Dictionary = _real_game(777)
	var me: String = s["protagonist"]["id"]
	var g: Dictionary = _find_my_real_start(s)
	assert_bool(g.is_empty()).override_failure_message(
		"주인공이 선발로 나오는 경기가 하나도 없다").is_false()
	s["day"] = int(g["day"])

	var r: AppRoot = await _mount(s)
	assert_str(r.open_match()).override_failure_message("등판 경기를 못 열었다").is_empty()

	var m: Dictionary = r.match_state()
	LiveMatch.finish(m["state"], m["ctx"], m["rng"])
	r._on_match_done()

	var stats: Dictionary = r.state().get("season_stats", {})
	assert_bool(stats.has(me)).override_failure_message(
		"손으로 던졌는데 주인공 기록이 없다 (%d명 기록됨)" % stats.size()).is_true()


## 안 끝낸 경기를 닫으면 기록도 안 남는다 — 점수를 안 남기는 것과 같은 이유다
func test_an_unfinished_game_leaves_no_stats() -> void:
	var s: Dictionary = _real_game(777)
	var me: String = s["protagonist"]["id"]
	var g: Dictionary = _find_my_real_start(s)
	s["day"] = int(g["day"])

	var r: AppRoot = await _mount(s)
	r.open_match()
	var m: Dictionary = r.match_state()
	for i in 10:
		LiveMatch.pitch(m["state"], m["ctx"], m["rng"])
	r._on_match_done()

	assert_bool(r.state().get("season_stats", {}).has(me)).override_failure_message(
		"안 끝낸 경기가 기록에 들어갔다").is_false()


# ── 훈련이 실제로 능력치를 올리는가 (M7-9a) ───────────────────

## ⚠ **훈련해도 능력치가 안 올랐다.** `_apply_one_week`가 `Training.plan_load`만
## 불러 **피로만 움직였다** — 훈련 화면에서 뭘 짜든 결과가 같았다
func test_training_actually_raises_the_stats() -> void:
	var s: Dictionary = _real_game(777)
	# 구속 훈련을 1슬롯에
	s["training_plan"] = {"primary": "TRN_VEL"}
	# 천장에 여유를 준다 — 여기서 보려는 건 배선이지 천장 감쇠가 아니다
	s["protagonist"]["potential_hidden"] = 95.0
	var before: float = float(s["protagonist"]["pitching"]["velocity"])

	var r: AppRoot = await _mount(s)
	# 여러 주를 돌려야 레벨업 문턱을 넘는다
	for i in 8:
		r._apply_one_week()

	assert_float(float(r.state()["protagonist"]["pitching"]["velocity"])) \
		.override_failure_message("여덟 주를 훈련했는데 구속이 %.1f 그대로다" % before) \
		.is_greater(before)


## ⚠ **훈련 프로그램이 실려야 한다.** 없으면 `_find`가 아무것도 못 찾아
## 조용히 아무 일도 안 일어난다
func test_the_training_programs_are_loaded() -> void:
	assert_int(Training.programs().size()).override_failure_message(
		"훈련 프로그램이 0개다").is_equal(12)
	for p in Training.programs():
		assert_str(String(p.get("id", ""))).is_not_empty()
		assert_float(float(p.get("base_xp", 0.0))).is_greater_equal(0.0)


## 투수는 투수 훈련만 — `both`는 누구나 한다
func test_programs_are_filtered_by_player_type() -> void:
	var pit: Array = Training.programs_for("pitcher")
	assert_int(pit.size()).is_greater(0)
	for p in pit:
		assert_bool(String(p["player_type"]) in ["pitcher", "both"]) \
			.override_failure_message("투수에게 %s 훈련이 떴다" % p["id"]).is_true()

	var bat: Array = Training.programs_for("batter")
	for p in bat:
		assert_bool(String(p["player_type"]) in ["batter", "both"]).is_true()


## 계획이 비어도 주간 회복(−5)은 돈다 — 안 그러면 아무 훈련도 안 짠 주에
## 피로가 안 빠진다
func test_an_empty_plan_still_recovers() -> void:
	var s: Dictionary = _real_game(777)
	s["protagonist"]["fatigue"] = 50.0
	s["training_plan"] = {}

	var r: AppRoot = await _mount(s)
	r._apply_one_week()
	assert_float(float(r.state()["protagonist"]["fatigue"])).override_failure_message(
		"빈 계획인데 피로가 안 빠졌다").is_less(50.0)


## 훈련하면 지친다 — 공짜로 크면 훈련을 고를 이유가 없다
func test_training_costs_fatigue() -> void:
	var s: Dictionary = _real_game(777)
	s["protagonist"]["fatigue"] = 20.0
	s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_STAMINA"}

	var r: AppRoot = await _mount(s)
	r._apply_one_week()
	assert_float(float(r.state()["protagonist"]["fatigue"])).override_failure_message(
		"두 칸을 훈련했는데 피로가 안 늘었다").is_greater(20.0)


## 무엇이 올랐는지 기록에 남는다 — 소식이 그걸 읽는다
func test_the_gains_are_logged() -> void:
	var s: Dictionary = _real_game(777)
	s["training_plan"] = {"primary": "TRN_VEL"}
	s["protagonist"]["potential_hidden"] = 95.0

	var r: AppRoot = await _mount(s)
	for i in 8:
		r._apply_one_week()

	assert_bool(r.state().get("training_log", []).is_empty()).override_failure_message(
		"능력치가 올랐는데 기록이 없다").is_false()


# ── 훈련 화면 배선 (M7-9b) ────────────────────────────────────

## ⚠ **계획은 상태가 들고 있다.** 화면이 들면 진행 뒤에 새 사전이 오면서
## 초기화된다 — 소식 거르기가 그랬다
func test_the_plan_lands_in_the_state() -> void:
	var r: AppRoot = await _mount(_real_game(777))
	r._on_training()
	await await_idle_frame()
	assert_object(r.training_screen()).is_not_null()

	r._on_training_slot({"slot_id": "primary", "program_id": "TRN_VEL"})
	assert_str(String(r.state().get("training_plan", {}).get("primary", ""))
		).is_equal("TRN_VEL")

	# 진행해도 남아 있어야 한다
	r._apply_one_week()
	assert_str(String(r.state().get("training_plan", {}).get("primary", ""))
		).override_failure_message("한 주 지나자 계획이 사라졌다").is_equal("TRN_VEL")


## 비우면 슬롯이 지워진다 — 빈 문자열이 남으면 `_find`가 헛돈다
func test_clearing_a_slot_removes_it() -> void:
	var s: Dictionary = _real_game(777)
	s["training_plan"] = {"primary": "TRN_VEL"}
	var r: AppRoot = await _mount(s)

	r._on_training_slot({"slot_id": "primary", "program_id": ""})
	assert_bool(r.state().get("training_plan", {}).has("primary")).is_false()


## 화면이 고른 것이 실제 성장에 닿는가 — 화면과 엔진 사이가 끊기면
## 계획을 짜도 아무 일도 안 일어난다
func test_what_the_screen_picks_reaches_the_engine() -> void:
	var s: Dictionary = _real_game(777)
	s["protagonist"]["potential_hidden"] = 95.0
	var before: float = float(s["protagonist"]["pitching"]["velocity"])

	var r: AppRoot = await _mount(s)
	r._on_training()
	await await_idle_frame()
	# 화면 버튼을 실제로 누른다
	r.training_screen()._on_slot("primary")
	await await_idle_frame()
	var opts: Node = r.training_screen().get_node("Pad/Center/Col/Options")
	(opts.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	r._on_training_done()

	for i in 8:
		r._apply_one_week()
	assert_float(float(r.state()["protagonist"]["pitching"]["velocity"])) \
		.override_failure_message("화면에서 고른 훈련이 엔진에 안 닿았다").is_greater(before)


# ── NPC 주간 성장 배선 (M9-8) ────────────────────────────────

## ⚠ **주인공만 매주 자라고 있었다.** 몇 시즌 뒤 주인공이 세계에서 혼자
## 뛰어오르고, 드래프트 앵커·수상 자격선이 그 어긋난 분포 위에 선다
func test_the_world_grows_with_the_weeks() -> void:
	var s: Dictionary = _real_game(777)
	var r: AppRoot = await _mount(s)
	var npc: Dictionary = _some_npc(r.state())
	var before: float = float(npc["pitching"]["ovr"])

	for i in 30:
		r._apply_one_week()

	assert_float(float(npc["pitching"]["ovr"])).override_failure_message(
		"30주를 진행했는데 NPC가 하나도 안 자랐다").is_greater(before)


## 고교생 투수 하나 — 나이 계수가 제일 큰 구간이라 눈에 띈다.
##
## ⚠ **선수는 `pitching`·`batting`을 **둘 다** 들고 있다.** 타자를 집어
## `pitching.ovr`을 보면 영영 안 움직인다 — 성장이 자기 쪽만 만지기 때문이다
func _some_npc(state: Dictionary) -> Dictionary:
	for p in SeasonRunner.all_players(state):
		if p.get("is_protagonist", false):
			continue
		if String(p.get("league_id", "")) != "LEAGUE_HIGHSCHOOL":
			continue
		if String(p.get("player_type", "")) == "pitcher":
			return p
	return {}


## ⚠ **하루씩 N번과 N일 한 번이 같아야 한다.** 주 경계마다 도착 날짜를 쓰면
## 같은 주를 N번 사는 것이 되어 조용히 갈라진다
func test_walking_day_by_day_matches_one_big_step() -> void:
	var a: AppRoot = await _mount(_real_game(777))
	var b: AppRoot = await _mount(_real_game(777))

	for i in 21:
		await a.advance(1)
	await b.advance(21)

	assert_int(a.state()["day"]).is_equal(b.state()["day"])
	var an: Dictionary = _some_npc(a.state())
	var bn: Dictionary = _some_npc(b.state())
	assert_str(String(an["id"])).is_equal(String(bn["id"]))
	assert_dict(an.get("pitching_xp", {})).override_failure_message(
		"하루씩 간 것과 한 번에 간 것이 다르다").is_equal(bn.get("pitching_xp", {}))
	assert_bool(an.get("pitching_xp", {}).is_empty()).override_failure_message(
		"둘 다 빈 사전이라 비교가 아무것도 안 봤다").is_false()


# ── 학사 배선 (B-1) ──────────────────────────────────────────

## ⚠ **학교에 다니는 동안만 돈다.** 프로에 학사가 붙으면 은퇴할 때까지
## 시험을 본다
func test_school_only_runs_at_school() -> void:
	var s: Dictionary = _real_game(777)
	var r: AppRoot = await _mount(s)
	for i in 3:
		r._apply_one_week()
	assert_bool(r.state().has("school")).override_failure_message(
		"고교생인데 학사가 안 돈다").is_true()

	var pro: Dictionary = _real_game(777)
	pro["protagonist"]["league_id"] = "LEAGUE_KBL"
	var r2: AppRoot = await _mount(pro)
	for i in 3:
		r2._apply_one_week()
	assert_bool(r2.state().has("school")).override_failure_message(
		"프로인데 학사가 돈다").is_false()


## ⚠ **시험 주에 학기가 확정된다.** 02는 대학 시험 트리거가 없어 학점이
## 영영 안 매겨졌다 — 학기 확정이 죽은 코드였다
func test_the_exam_week_closes_the_semester() -> void:
	var r: AppRoot = await _mount(_real_game(777))
	# 1~10주는 공부만 쌓인다
	for w in range(1, 11):
		r._apply_one_week(w * 7)
	assert_bool(r.state().get("academic_log", []).is_empty()).override_failure_message(
		"시험 전인데 학기가 확정됐다").is_true()
	assert_int(int(r.state()["school"]["study_weeks"])).is_equal(10)

	# 11주 = 중간고사
	r._apply_one_week(11 * 7)
	var log: Array = r.state().get("academic_log", [])
	assert_int(log.size()).override_failure_message(
		"시험 주인데 학기가 안 끝났다").is_equal(1)
	assert_str(String(log[0]["exam"])).is_equal("midterm")
	assert_int(int(r.state()["school"]["study_weeks"])).override_failure_message(
		"학기를 비우지 않았다").is_equal(0)


## ⚠ **출전 정지가 경기 판정에 닿아야 한다.** 안 이으면 경고가 훈련만 깎고
## 경기에는 아무 일도 안 일어난다
func test_a_suspension_reaches_the_game_gate() -> void:
	var s: Dictionary = _real_game(777)
	s["school"] = {"major": "체육교육", "study_mode": "sleep", "warning_level": 1}
	var r: AppRoot = await _mount(s)

	# 자면서 한 학기를 보내면 2단계 = 출전 정지
	for w in range(1, 12):
		r._apply_one_week(w * 7)

	assert_int(int(r.state()["school"]["warning_level"])).is_equal(2)
	assert_bool(r.state()["protagonist"].get("eligibility_blocked", false)) \
		.override_failure_message("출전 정지인데 경기 판정이 모른다").is_true()
	assert_str(DayEngine.appearance_gate(r.state()["protagonist"])) \
		.is_equal("skip_academic")


## ⚠ **대학 무대는 주인공이 없어도 선다.** 세계의 일이고, 주인공이 안
## 불렸다는 것도 결과다 — 주인공 검사 뒤로 내리면 그게 통째로 사라진다
func test_the_campus_stage_runs_without_a_protagonist() -> void:
	var r: AppRoot = await _mount(_real_game(777))
	r.state()["protagonist"] = {}
	r._apply_one_week(32 * 7)

	var log: Array = r.state().get("campus_log", [])
	assert_int(log.size()).override_failure_message(
		"주인공이 없다고 대학 쇼케이스가 안 열렸다").is_equal(1)
	assert_str(String(log[0]["kind"])).is_equal("showcase")


# ── 부상이 실제로 닿는가 (B-3) ────────────────────────────────

## ⚠ **다치면 훈련이 안 된다.** 배수만 상태에 두고 아무도 안 읽으면
## 수술 중에도 평소처럼 큰다
func test_an_injury_throttles_the_training() -> void:
	var grown: Array = []
	for hurt in [false, true]:
		var s: Dictionary = _real_game(777)
		s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD"}
		s["protagonist"]["potential_hidden"] = 95.0
		if hurt:
			# 수술은 배수 0 — 60주짜리라 검사 내내 안 낫는다
			s["protagonist"]["injury"] = {"type": "UCL_FULL",
				"severity": "surgery", "weeks_left": 60, "total_weeks": 60,
				"since_day": 1}
		var before: float = float(s["protagonist"]["pitching"]["velocity"])

		var r: AppRoot = await _mount(s)
		for w in range(1, 16):
			r._apply_one_week(w * 7)
		grown.append(float(r.state()["protagonist"]["pitching"]["velocity"])
			- before)

	assert_float(grown[0]).override_failure_message(
		"멀쩡한데 열다섯 주를 훈련해도 안 늘었다").is_greater(0.0)
	assert_float(grown[1]).override_failure_message(
		"수술 중인데 멀쩡할 때(%.1f)만큼 늘었다(%.1f)" % [grown[0], grown[1]]) \
		.is_less(grown[0])


## 다치면 등판을 못 한다 — 판정이 이미 그 자리를 읽는다
func test_a_hurt_protagonist_does_not_pitch() -> void:
	var s: Dictionary = _real_game(777)
	s["protagonist"]["fatigue"] = 99.0
	s["protagonist"]["consecutive_high_fatigue_weeks"] = 5
	var r: AppRoot = await _mount(s)

	for w in range(1, 20):
		r._apply_one_week(w * 7)
		if r.state()["protagonist"].get("injury", null) != null:
			assert_str(DayEngine.appearance_gate(r.state()["protagonist"])) \
				.override_failure_message("다쳤는데 경기 판정이 모른다") \
				.is_equal("skip_injury")
			return
	assert_bool(false).override_failure_message(
		"피로 99로 열아홉 주를 살았는데 한 번도 안 다쳤다").is_true()


# ── 관계도가 실제로 도는가 (B-2) ──────────────────────────────

## ⚠ **02는 주 인덱스를 하나 어긋나게 읽어 관계가 전 커리어에 걸쳐 한 번도
## 안 움직였다.** 이 검사가 02의 게이트(`measure:relations`)를 대신한다 —
## 관계가 전원 중립이면 실패한다
## ⚠ **주인공 팀 경기는 진행만으로는 안 치러진다** — 정지가 걸리고 사용자가
## 던져야 한다. 여기서는 이긴 것으로 결과를 꽂아 두고 주 경계만 돌린다.
## 관계 배선이 보는 것은 **일정에 꽂힌 결과**이므로 그게 정본이다
func _win_the_teams_games(s: Dictionary) -> Array:
	var team: String = String(s["protagonist"]["team_id"])
	var me: String = String(s["protagonist"]["id"])
	var days: Array = []
	for g in s["schedule"]:
		var home: String = String(g["home"])
		var away: String = String(g["away"])
		if home != team and away != team:
			continue
		g["result"] = {
			"home_score": 5 if home == team else 1,
			"away_score": 1 if home == team else 5,
			"winner_id": team, "loser_id": away if home == team else home,
			"player_lines": [{"role": "pitcher", "player_id": me,
				"ip": 7.0, "er": 1.0}],
		}
		days.append(int(g["day"]))
	days.sort()
	return days


func test_relationships_move_over_a_career() -> void:
	var s: Dictionary = _real_game(777)
	s["training_plan"] = {"primary": "TRN_VEL"}
	var days: Array = _win_the_teams_games(s)
	assert_array(days).override_failure_message("주인공 팀 경기가 없다").is_not_empty()

	var r: AppRoot = await _mount(s)
	var seed_value: int = int(s.get("seed", 0))
	# 경기가 든 주 경계를 넘긴다 — 고교는 한 시즌 20경기뿐이라 연속 넉 주로는
	# 표본이 안 된다
	for d in days:
		r._apply_one_week((d - 1) / 7 * 7 + 7)

	var rows: Array = RelationshipRunner.rows_of(r.state())
	assert_int(rows.size()).override_failure_message(
		"한 시즌을 살았는데 아는 사람이 하나도 없다").is_greater(0)

	# 초기값은 성향에서 결정적으로 나온다 — 그대로면 한 번도 안 움직인 것이다
	var moved: int = 0
	for row in rows:
		var init_v: int = int(Relationship.init_values(seed_value,
			[{"person_id": row["person_id"], "kind": row["kind"]}])[0]["value"])
		if int(row["value"]) != init_v:
			moved += 1
	assert_int(moved).override_failure_message(
		"한 시즌이 지나도 관계가 초기값 그대로다 — 02가 커리어 내내 그랬다") \
		.is_greater(0)


## ⚠ **주인공의 OVR이 생성값에 고정돼 있었다.** 개별 능력치만 오르고
## `ovr`은 안 바뀌어서, 몇 년을 훈련해도 드래프트·계약·트레이드가 보는 숫자는
## **1학년 때 값** 그대로였다. NPC는 `NpcGrowth`가 다시 냈으니 주인공만 그랬다
func test_the_protagonist_ovr_follows_the_training() -> void:
	var s: Dictionary = _real_game(777)
	s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD"}
	s["protagonist"]["potential_hidden"] = 95.0
	var before: float = Contract.core_ovr(s["protagonist"])

	var r: AppRoot = await _mount(s)
	for w in range(1, 31):
		r._apply_one_week(w * 7)

	assert_float(Contract.core_ovr(r.state()["protagonist"])) \
		.override_failure_message(
			"서른 주를 훈련했는데 OVR이 %.0f 그대로다 — 02가 커리어 내내 그랬다"
			% before).is_greater(before)


## 성장한 주는 관계에 실린다 — 훈련 뒤에 돌아야 잡힌다
func test_growth_reaches_the_relationship_context() -> void:
	var s: Dictionary = _real_game(777)
	s["training_plan"] = {"primary": "TRN_VEL", "secondary": "TRN_CTRL_CMD"}
	s["protagonist"]["potential_hidden"] = 95.0
	var r: AppRoot = await _mount(s)

	# 관계 행을 먼저 만들어 두고, 감독 자리를 손으로 넣는다
	# (스태프는 아직 없다 — QUEUE B-2b)
	r._apply_one_week(7)
	var rows: Array = RelationshipRunner.rows_of(r.state())
	rows.append({"person_id": "MGR_TEST", "kind": "manager", "value": 0,
		"contact": "together", "specialty": "", "last_team": "", "memories": []})

	for w in range(2, 32):
		r._apply_one_week(w * 7)
	assert_int(int(RelationshipRunner.row_of(r.state(), "MGR_TEST")["value"])) \
		.override_failure_message("훈련으로 성장했는데 감독이 모른다").is_greater(0)


## 닫으면 본화면이 돌아온다 — 안 돌아오면 게임이 멈춘 것처럼 보인다
func test_closing_training_returns_to_main() -> void:
	var r: AppRoot = await _mount(_real_game(777))
	r._on_training()
	await await_idle_frame()
	assert_bool(r.get_node("Main").visible).is_false()

	r._on_training_done()
	await await_idle_frame()
	assert_bool(r.get_node("Main").visible).is_true()
	assert_object(r.training_screen()).is_null()
