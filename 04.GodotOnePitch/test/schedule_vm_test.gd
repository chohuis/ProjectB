extends GdUnitTestSuite

## 일정 탭 ViewModel — M7-5.
##
## 원본: `pages/schedule/SchedulePage.svelte` (954줄)
##
## ⚠ **02가 여기서 겪은 결함 셋이 전부 "이름표를 화면이 따로 들고 있어서"**
## 생겼다 — 훈련 이름표가 전부 구버전 id라 화면에 `TRN_CTRL_CMD` 원문이
## 그대로 떠 있었고, 죽은 필드(`recoveryProgramId`)를 읽고 있었고, 아무도
## 안 읽는 변수가 남아 "여기서 이름이 나온다"고 오해하게 만들었다.
##
## ⚠ **일 단위로 바뀌었다.** 02는 주차로 묶었지만 우리는 날짜로 준다.


func _game(day: int, over: Dictionary = {}) -> Dictionary:
	var g: Dictionary = {
		"id": "G%d" % day, "day": day, "is_protagonist_game": true,
		"home": "TEAM_A", "away": "TEAM_B", "result": null,
		"league_id": "LEAGUE_HIGHSCHOOL",
	}
	g.merge(over, true)
	return g


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {"team_id": "TEAM_A"},
		"schedule": [],
		"team_names": {"TEAM_A": "제주 애월고", "TEAM_B": "서귀포고"},
	}
	s.merge(over, true)
	return s


func _rows(s: Dictionary) -> Array:
	return ScheduleVm.build(s)["rows"]


# ── 무엇이 보이나 ─────────────────────────────────────────────

## ⚠ **내 경기만 보인다.** 프로는 하루 83경기가 도는데 전부 보이면
## 내 등판을 못 찾는다
func test_only_my_games_are_listed() -> void:
	var s := _state({"schedule": [
		_game(11), _game(12, {"is_protagonist_game": false}), _game(13)]})
	assert_int(_rows(s).size()).is_equal(2)


func test_a_row_carries_the_date_and_the_opponent() -> void:
	var r: Dictionary = _rows(_state({"schedule": [_game(12)]}))[0]
	assert_str(r["date_label"]).is_equal("3월 12일")
	assert_str(r["weekday_label"]).is_equal("금")
	assert_str(r["opponent"]).is_equal("서귀포고")


## ⚠ **해를 바꿔야 주차 파생과 갈린다.** 2027년만 보면 1일차가 우연히
## 월요일이라 "주차의 첫날 = 월요일"로 계산해도 똑같이 나온다
func test_the_weekday_comes_from_the_real_calendar() -> void:
	assert_str(_rows(_state({"season_year": 2026, "schedule": [_game(1)]}))[0]["weekday_label"]) \
		.is_equal("일")
	assert_str(_rows(_state({"season_year": 2028, "schedule": [_game(1)]}))[0]["weekday_label"]) \
		.is_equal("수")


## ⚠ **팀 이름을 못 찾으면 id라도 보여준다.** 빈칸이면 어느 팀인지 모른다
func test_an_unknown_team_falls_back_to_its_id() -> void:
	var s := _state({"schedule": [_game(12, {"away": "TEAM_Z"})]})
	assert_str(_rows(s)[0]["opponent"]).is_equal("TEAM_Z")


## ⚠ **`team_id`가 없으면 전부 뒤집힌다.** 홈 경기가 "원정"이 되고 이긴
## 경기가 "패"로 찍힌다 — 내 팀을 모르면 홈·원정도 승패도 판단할 수 없다.
##
## 산식으로는 못 고친다. **이 검사가 하는 일은 그게 조용히 일어난다는 걸
## 다음 사람에게 알리는 것이다** — 실제로 화면 fixture에서 한 번 겪었고,
## 오류도 로그도 없이 화면을 띄워야만 보였다
func test_a_missing_team_id_flips_everything() -> void:
	var g := _game(5, {"result": {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}})
	var s := _state({"day": 20, "schedule": [g], "protagonist": {}})
	var r: Dictionary = _rows(s)[0]
	assert_str(r["location"]).is_equal("원정")       # 실제로는 홈이다
	assert_str(r["result_label"]).is_equal("패 3:1")  # 실제로는 승이다


func test_home_and_away_are_marked() -> void:
	var home: Dictionary = _rows(_state({"schedule": [_game(12)]}))[0]
	assert_str(home["location"]).is_equal("홈")
	var away: Dictionary = _rows(_state({"schedule": [
		_game(12, {"home": "TEAM_B", "away": "TEAM_A"})]}))[0]
	assert_str(away["location"]).is_equal("원정")
	assert_str(away["opponent"]).is_equal("서귀포고")


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **날짜 순이다.** 대회 라운드가 뒤에 주입되므로 목록 순서는 날짜 순이
## 아니다 — 그대로 보여주면 일정표가 뒤죽박죽이 된다
func test_rows_are_sorted_by_date() -> void:
	var s := _state({"schedule": [_game(30), _game(12), _game(22)]})
	var days: Array = []
	for r in _rows(s):
		days.append(r["day"])
	assert_array(days).is_equal([12, 22, 30])


# ── 상태 ──────────────────────────────────────────────────────

func test_a_future_game_is_upcoming() -> void:
	assert_str(_rows(_state({"day": 10, "schedule": [_game(12)]}))[0]["status"]) \
		.is_equal("upcoming")


func test_todays_game_stands_out() -> void:
	assert_str(_rows(_state({"day": 10, "schedule": [_game(10)]}))[0]["status"]) \
		.is_equal("today")


## ⚠ **지나갔는데 결과가 없는 경기가 있다.** 진행이 멈춘 사이 넘어간
## 것들이다 — "예정"으로 두면 영영 안 오는 경기를 기다리게 된다
func test_a_passed_game_without_a_result_is_missed() -> void:
	assert_str(_rows(_state({"day": 20, "schedule": [_game(12)]}))[0]["status"]) \
		.is_equal("missed")


## ⚠ **시즌 일차는 1부터다.** 0을 그대로 쓰면 1일차 경기가 "오늘"이 아니라
## "예정"이 되어, 새 게임 첫날에 오늘 경기가 안 보인다
func test_a_day_below_one_is_pulled_up() -> void:
	assert_str(_rows(_state({"day": 0, "schedule": [_game(1)]}))[0]["status"]) \
		.is_equal("today")
	assert_str(_rows(_state({"day": -3, "schedule": [_game(1)]}))[0]["status"]) \
		.is_equal("today")


func test_a_played_game_is_done() -> void:
	var g := _game(5, {"result": {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}})
	assert_str(_rows(_state({"day": 20, "schedule": [g]}))[0]["status"]).is_equal("done")


# ── 결과 ──────────────────────────────────────────────────────

func test_a_win_reads_as_a_win() -> void:
	var g := _game(5, {"result": {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}})
	var r: Dictionary = _rows(_state({"day": 20, "schedule": [g]}))[0]
	assert_str(r["result_label"]).is_equal("승 3:1")
	assert_bool(r["won"]).is_true()


func test_a_loss_reads_as_a_loss() -> void:
	var g := _game(5, {"result": {"home_score": 1, "away_score": 3, "winner": "TEAM_B"}})
	var r: Dictionary = _rows(_state({"day": 20, "schedule": [g]}))[0]
	assert_str(r["result_label"]).is_equal("패 1:3")
	assert_bool(r["won"]).is_false()


## ⚠ **무승부에 승패를 붙이지 않는다.** 02는 승자 id가 빈 문자열로도 와서
## `winner == my_team`이 거짓 → 전부 "패"로 찍혔다
func test_a_draw_is_neither() -> void:
	var g := _game(5, {"result": {"home_score": 2, "away_score": 2, "winner": ""}})
	var r: Dictionary = _rows(_state({"day": 20, "schedule": [g]}))[0]
	assert_str(r["result_label"]).is_equal("무 2:2")
	assert_bool(r["won"]).is_false()


func test_a_null_winner_is_also_a_draw() -> void:
	var g := _game(5, {"result": {"home_score": 2, "away_score": 2, "winner": null}})
	assert_str(_rows(_state({"day": 20, "schedule": [g]}))[0]["result_label"]) \
		.is_equal("무 2:2")


## 아직 안 치른 경기엔 결과 글자가 없다
func test_an_unplayed_game_has_no_result_text() -> void:
	assert_str(_rows(_state({"day": 10, "schedule": [_game(12)]}))[0]["result_label"]) \
		.is_empty()


# ── 요약 ──────────────────────────────────────────────────────

## ⚠ **전적은 무승부를 따로 센다.** 승·패로만 나누면 무승부가 패에 섞인다
func test_the_summary_counts_wins_losses_and_draws() -> void:
	var s := _state({"day": 30, "schedule": [
		_game(1, {"result": {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}}),
		_game(2, {"result": {"home_score": 1, "away_score": 3, "winner": "TEAM_B"}}),
		_game(3, {"result": {"home_score": 2, "away_score": 2, "winner": ""}}),
		_game(4, {"result": {"home_score": 5, "away_score": 0, "winner": "TEAM_A"}}),
		_game(40),
	]})
	var vm: Dictionary = ScheduleVm.build(s)
	assert_str(vm["record_label"]).is_equal("2승 1무 1패")
	assert_int(vm["remaining"]).is_equal(1)


func test_no_games_yet_says_so() -> void:
	var vm: Dictionary = ScheduleVm.build(_state())
	assert_str(vm["record_label"]).is_equal("기록 없음")
	assert_array(vm["rows"]).is_empty()


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = ScheduleVm.build({})
	assert_array(vm["rows"]).is_empty()
	assert_bool(vm.has("record_label")).is_true()


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/schedule_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
