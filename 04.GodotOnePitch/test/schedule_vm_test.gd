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


# ── 상대 팀 마크 (U-1) ───────────────────────────────────────────

## 일정에서도 상대가 마크로 갈린다 — 이름만 보면 비슷한 학교가 섞인다
func test_상대_마크가_줄에_실린다() -> void:
	var rows: Array = _rows(_state({"schedule": [
		{"id": "G1", "day": 12, "home": "TEAM_A", "away": "TEAM_B",
			"is_protagonist_game": true, "result": null}]}))
	assert_int(rows.size()).is_equal(1)
	var mark: Dictionary = rows[0]["mark"]
	# 상대 팀이다 — 내 팀이 아니다
	assert_str(String(mark["team_id"])).is_equal("TEAM_B")
	assert_array(TeamMarkVm.SHELLS).contains([String(mark["shell"])])


## 진짜 팀이면 그 팀 색이 온다 — 화면이 색을 고르지 않는다
func test_마크_색이_팀_데이터에서_온다() -> void:
	var rows: Array = _rows(_state({"schedule": [
		{"id": "G1", "day": 12, "home": "TEAM_HS_AEWOL",
			"away": "TEAM_HS_HALLA", "is_protagonist_game": true,
			"result": null}], "protagonist": {"team_id": "TEAM_HS_AEWOL"}}))
	var colors: Array = World.team_field({}, "TEAM_HS_HALLA", "colors", [])
	assert_str(String(rows[0]["mark"]["primary"])).is_equal(String(colors[0]))


# ── 보기 (G-3b) ───────────────────────────────────────────────
#
# 🔴 **처음 쓴 검사는 4/7만 잡았다.** `_state()`에 경기가 몇 개뿐이라
# **주간이든 시즌이든 결과가 같았다** — "보기로 안 거른다" 변이가 통과했다.
# **경기를 여러 달에 흩어 놓고, 줄어드는 것을 수로 본다.**


## 열두 주에 걸쳐 한 주에 하나씩 — 주간·월간·시즌이 확실히 갈린다
func _spread_state(view: String = "season", cursor: int = 0) -> Dictionary:
	var games: Array = []
	for i in 12:
		games.append({"id": "G%d" % i, "day": 3 + i * 7,
			"home": "TEAM_A", "away": "TEAM_B",
			"is_protagonist_game": true})
	var s: Dictionary = _state({"schedule": games})
	s["schedule_view"] = view
	if cursor > 0:
		s["schedule_cursor_day"] = cursor
	return s


## 🔴 **04는 시즌 전체 하나만 보여 줬다.** 프로 144경기가 한 줄로 늘어서면
## 이번 주에 뭐가 있는지 못 찾는다 — 02는 범위를 좁혀 본다
func test_보기가_셋이다() -> void:
	var vm: Dictionary = ScheduleVm.build(_state())
	assert_int(vm["views"].size()).is_equal(3)
	assert_str(String(vm["view"])).is_equal("season")
	assert_bool(bool(vm["can_move"])).override_failure_message(
		"시즌 보기인데 앞뒤로 넘길 수 있다").is_false()


## ⚠ **02의 `year`는 안 만든다** — 04는 한 해가 한 시즌이라 `season`과 같다
func test_연간_보기는_안_만든다() -> void:
	for v in ScheduleVm.build(_state())["views"]:
		assert_str(String(v["id"])).is_not_equal("year")


## 🔴 **주간은 한 주만 남는다.** 열두 주에 하나씩 있으면 주간 보기엔 하나다
func test_주간_보기가_한_주만_남긴다() -> void:
	var full: int = ScheduleVm.build(_spread_state("season"))["rows"].size()
	assert_int(full).override_failure_message(
		"fixture에 경기가 안 깔렸다 — 검사가 헛돈다").is_equal(12)

	var vm: Dictionary = ScheduleVm.build(_spread_state("week", 3))
	assert_int(vm["rows"].size()).override_failure_message(
		"주간인데 %d경기가 나온다" % vm["rows"].size()).is_equal(1)
	assert_str(String(vm["span_label"])).contains("–")
	assert_bool(bool(vm["can_move"])).is_true()


## 월간은 그 달만 — 한 달에 넷 안팎이다
func test_월간_보기가_한_달만_남긴다() -> void:
	var vm: Dictionary = ScheduleVm.build(_spread_state("month", 10))
	var n: int = vm["rows"].size()
	assert_int(n).override_failure_message(
		"월간인데 %d경기다 — 시즌 전체가 나온다" % n).is_less(12)
	assert_int(n).is_greater(0)
	assert_str(String(vm["span_label"])).contains("월")


## ⚠ **주는 일요일에서 시작한다** — 02 `startOfWeek`.
## 커서 날부터 세면 **같은 주의 앞쪽 경기가 빠진다.**
##
## ⚠ **개수로 보면 못 잡는다** — 범위가 7일로 같아서 커서를 어디 두든
## 세어지는 수가 같을 수 있다. **커서보다 앞선 경기가 나오는지**를 본다
func test_주는_일요일에서_시작한다() -> void:
	var year: int = 2027
	# 주 중간 날을 커서로 — 하필 일요일이면 차이가 안 난다
	var cursor: int = 0
	for d in range(4, 12):
		if Calendar.weekday(year, d) >= 2:
			cursor = d
			break
	assert_int(cursor).override_failure_message(
		"주 중간 날을 못 찾았다 — 검사가 헛돈다").is_greater(0)

	# 그 주의 **첫날**에 경기를 하나 둔다
	var first: int = cursor - Calendar.weekday(year, cursor)
	var s: Dictionary = _state({"schedule": [
		{"id": "EARLY", "day": maxi(first, 1), "home": "TEAM_A",
			"away": "TEAM_B", "is_protagonist_game": true},
		{"id": "LATE", "day": cursor, "home": "TEAM_A",
			"away": "TEAM_B", "is_protagonist_game": true},
	]})
	s["schedule_view"] = "week"
	s["schedule_cursor_day"] = cursor

	var ids: Array = []
	for r in ScheduleVm.build(s)["rows"]:
		ids.append(String(r["id"]))
	assert_array(ids).override_failure_message(
		"커서(%d일) 앞의 같은 주 경기가 빠졌다 — 주는 일요일에서 시작한다"
		% cursor).contains(["EARLY"])
	assert_array(ids).contains(["LATE"])


## ⚠ **성적은 시즌 전체로 센다** — 주간 보기라고 승패가 줄면
## "이번 주 성적"인지 "올해 성적"인지 못 가린다
func test_성적은_보기와_무관하다() -> void:
	var done: Array = []
	for i in 6:
		done.append({"id": "G%d" % i, "day": 3 + i * 7,
			"home": "TEAM_A", "away": "TEAM_B", "is_protagonist_game": true,
			"result": {"home_score": 5, "away_score": 2}})
	var s: Dictionary = _state({"schedule": done})
	var full: String = String(ScheduleVm.build(s)["record_label"])
	assert_str(full).override_failure_message(
		"fixture에 끝난 경기가 없다 — 검사가 헛돈다").contains("승")

	s["schedule_view"] = "week"
	s["schedule_cursor_day"] = 3
	var vm: Dictionary = ScheduleVm.build(s)
	assert_int(vm["rows"].size()).is_equal(1)
	assert_str(String(vm["record_label"])).override_failure_message(
		"주간 보기에서 성적이 달라졌다 — 시즌 전체로 세야 한다") 		.is_equal(full)


## 커서를 옮기면 범위가 따라온다
func test_커서가_범위를_옮긴다() -> void:
	var a: String = String(
		ScheduleVm.build(_spread_state("month", 10))["span_label"])
	var b: String = String(
		ScheduleVm.build(_spread_state("month", 100))["span_label"])
	assert_str(a).override_failure_message(
		"커서를 90일 옮겼는데 같은 달이다").is_not_equal(b)


## **비었을 때 왜 비었는지 말한다** — 주간은 경기 없는 주가 흔하다
func test_빈_주는_이유를_말한다() -> void:
	var s: Dictionary = _state()
	s["schedule_view"] = "week"
	assert_str(String(ScheduleVm.build(s)["empty"])).contains("주")


## 🔴 **화면에 실제로 뜬다.** vm만 채우고 안 그리면 없는 것과 같다 —
## 이 저장소에서 "엔진만 있고 호출 0"이 아홉 번 나왔다
func test_보기_단추가_화면에_뜬다() -> void:
	var screen: MainScreen = auto_free(
		preload("res://ui/screens/main_screen.tscn").instantiate())
	add_child(screen)
	screen.set_view_model({
		"tabs": [{"id": "schedule", "label": "일정", "badge": ""}],
		"schedule": ScheduleVm.build(_spread_state("week", 3)),
	})

	var labels: PackedStringArray = []
	_texts(screen, labels)
	var joined: String = "\n".join(labels)
	assert_str(joined).override_failure_message(
		"보기 단추가 화면에 없다").contains("주간")
	assert_str(joined).contains("월간")
	assert_str(joined).override_failure_message(
		"어느 주인지 화면에 안 뜬다").contains("–")


func _texts(node: Node, out: PackedStringArray) -> void:
	if node is Label and node.visible:
		out.append((node as Label).text)
	elif node is Button and node.visible:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
