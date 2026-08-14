extends GdUnitTestSuite

## 나 탭 ViewModel — M7-6c.
##
## 원본: `pages/status/StatusPage.svelte` (1,004줄)
##
## ⚠ **`StatusScreen`은 P1에서 이미 만들었다.** 그때는 손으로 만든 사전을
## 받았고, 여기서 **실제 상태에서 그 사전을 만든다.** 화면은 안 고친다 —
## 그게 "화면이 사전 하나만 받는다"가 값을 하는 지점이다.


func _me(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "team_id": "T1", "team_name": "제주",
		"league_id": "LEAGUE_HIGHSCHOOL", "age": 17, "position": "SP",
		"condition": 72.0, "fatigue": 20.0, "injury": null,
		"potential": 88.0, "development_rate": 65.0,
		"pitching": {"ovr": 66.0, "velocity": 70.0, "command": 62.0,
			"control": 64.0, "movement": 60.0, "stamina": 68.0,
			"mentality": 58.0, "recovery": 55.0, "clutch": 52.0,
			"hold_runners": 50.0},
		"batting": {"ovr": 30.0},
	}
	p.merge(over, true)
	return p


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 100, "season_year": 2027, "protagonist": _me(),
		"schedule": [],
	}
	s.merge(over, true)
	return s


# ── 화면이 읽는 키가 다 있는가 ────────────────────────────────

## ⚠ **화면이 읽는 키를 하나라도 빠뜨리면 그 자리가 조용히 빈다.**
## `StatusScreen`은 없는 키에 기본값을 쓰므로 오류가 안 난다
func test_the_view_model_has_every_key_the_screen_reads() -> void:
	var vm: Dictionary = StatusVm.build(_state())
	for k in ["team_name", "league_short", "injury", "injury_history",
			"contract", "pitches", "pitching", "season_title", "season_stats",
			"career"]:
		assert_bool(vm.has(k)).override_failure_message("빠진 키: %s" % k).is_true()


func test_the_team_and_league_come_along() -> void:
	var vm: Dictionary = StatusVm.build(_state())
	assert_str(vm["team_name"]).is_equal("제주")
	assert_str(vm["league_short"]).is_equal("고교")


# ── 능력치 ────────────────────────────────────────────────────

## ⚠ **화면이 이름표를 안 만든다.** 02에선 화면이 `TRN_CTRL_CMD` 같은
## 원문을 그대로 띄웠다
func test_pitching_rows_are_named_in_korean() -> void:
	var names: Array = []
	for r in StatusVm.build(_state())["pitching"]:
		names.append(r["name"])
	assert_array(names).contains(["구위", "커맨드", "제구", "스태미나"])


func test_pitching_rows_carry_values() -> void:
	for r in StatusVm.build(_state())["pitching"]:
		if r["name"] == "구위":
			assert_float(r["value"]).is_equal(70.0)


## ⚠ **모르는 능력치를 빈칸으로 두지 않는다.** 능력치가 늘었을 때
## 화면에서 안 보이면 아무도 모른다
func test_every_pitching_stat_is_shown() -> void:
	assert_int(StatusVm.build(_state())["pitching"].size()).is_equal(9)


# ── 부상 ──────────────────────────────────────────────────────

func test_no_injury_reads_as_healthy() -> void:
	assert_bool(StatusVm.build(_state())["injury"].is_empty()).is_true()


func test_an_injury_carries_its_details() -> void:
	var s: Dictionary = _state({"protagonist": _me({"injury": {
		"name": "팔꿈치 염증", "severity": "moderate", "weeks_left": 3,
		"weeks_total": 6}})})
	var inj: Dictionary = StatusVm.build(s)["injury"]
	assert_str(inj["name"]).is_equal("팔꿈치 염증")
	assert_int(inj["weeks_left"]).is_equal(3)
	# 심각도는 한국어 이름표가 붙는다 — 화면이 만들지 않는다
	assert_str(inj["severity_label"]).is_equal("중등도")


func test_an_unknown_severity_falls_back_to_its_id() -> void:
	var s: Dictionary = _state({"protagonist": _me({"injury": {
		"name": "무엇", "severity": "weird", "weeks_left": 1, "weeks_total": 1}})})
	assert_str(StatusVm.build(s)["injury"]["severity_label"]).is_equal("weird")


# ── 시즌 기록 ─────────────────────────────────────────────────

func test_the_season_title_shows_the_year() -> void:
	assert_str(StatusVm.build(_state())["season_title"]).is_equal("2027년 시즌 누적")


## ⚠ **기록이 없으면 빈 목록이다.** 0으로 채우면 안 뛴 선수가 0.00 방어율로
## 뜬다
func test_no_stats_yet_is_an_empty_list() -> void:
	assert_array(StatusVm.build(_state())["season_stats"]).is_empty()


## 시즌 기록은 상태에 쌓인 것을 읽는다 — 화면이 다시 세지 않는다
func test_season_stats_come_from_the_state() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": {
		"g": 11, "ip": 52.3, "era": 4.83, "k": 47, "bb": 19, "w": 5, "l": 3}}})
	var rows: Array = StatusVm.build(s)["season_stats"]
	var by: Dictionary = {}
	for r in rows:
		by[r["name"]] = r["value"]
	assert_str(by["등판"]).is_equal("11경기")
	assert_str(by["평균자책"]).is_equal("4.83")
	assert_str(by["승-패"]).is_equal("5승 3패")


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = StatusVm.build({})
	assert_bool(vm.has("pitching")).is_true()
	assert_array(vm["career"]).is_empty()


## ⚠ **화면이 그 사전으로 실제로 떠야 한다.** 키 이름이 하나만 달라도
## 그 자리가 조용히 빈다 — 검사가 화면을 띄워서 본다
func test_the_screen_renders_this_view_model() -> void:
	var screen: StatusScreen = preload("res://ui/screens/status_screen.tscn").instantiate()
	screen.set_view_model(StatusVm.build(_state()))
	add_child(screen)
	await await_idle_frame()

	var texts := PackedStringArray()
	_collect(screen, texts)
	assert_array(texts).contains(["제주", "구위", "신체 상태"])


func _collect(node: Node, out: PackedStringArray) -> void:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_collect(c, out)


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/status_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("preload")
