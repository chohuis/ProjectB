extends GdUnitTestSuite

## 시즌 결산 화면 — M7-7.
##
## 원본: `features/season-end/ui/SeasonEndModal.svelte` (1,195줄)
##
## ⚠ **1,195줄이 된 이유가 화면이 계산을 가져서다.** 여기는 사전을 찍기만
## 하고, 마지막 검사가 소스에서 계산을 막는다.

const SCREEN := preload("res://ui/screens/season_end_screen.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _digest(over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"year": 2027,
		"summary": {"graduated": 1420, "drafted": 110, "retired": 0,
			"freshmen": 1420, "placed": 400, "gave_up": 900,
			"demoted": 110, "released": 110},
		"league_id": "LEAGUE_HIGHSCHOOL",
		"team_id": "TEAM_A", "team_name": "애월고",
		"my_record": {"year": 2027, "stat_line": "7승 2패 ERA 2.31 88.0이닝 91K",
			"ovr": 63, "game_log": [
				{"day": 69, "opponent_id": "TEAM_B", "my_score": 5, "opp_score": 2,
					"ip": 6.0, "er": 2.0, "h": 5.0, "k": 7.0, "bb": 1.0, "pc": 95},
				{"day": 78, "opponent_id": "TEAM_C", "my_score": 1, "opp_score": 4,
					"ip": 5.0, "er": 4.0, "h": 8.0, "k": 3.0, "bb": 3.0, "pc": 88},
			]},
		"my_awards": ["MVP"],
		"awards": {"awards": [
			{"label": "다승", "player_id": "P1", "value_text": "18"},
			{"label": "방어율", "player_id": "P2", "value_text": "1.87"},
		], "mvp": ["P1"]},
		"standings": {"rows": [
			{"team_id": "TEAM_X", "team_name": "유성고", "wins": 15, "losses": 5,
				"draws": 0, "pct_label": ".750"},
			{"team_id": "TEAM_A", "team_name": "애월고", "wins": 12, "losses": 8,
				"draws": 0, "pct_label": ".600"},
		]},
	}
	d.merge(over, true)
	return d


func _mount(digest: Dictionary) -> SeasonEndScreen:
	var s: SeasonEndScreen = SCREEN.instantiate()
	s.set_view_model(SeasonEndVm.build(digest))
	add_child(s)
	await await_idle_frame()
	return s


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_shows_the_year() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s)).contains(["2027년 시즌 결산"])


## 02와 같은 탭 셋 — 시즌 · 팀 · 개인
func test_it_has_three_tabs() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s.get_node("Pad/Center/Col/Tabs"))) \
		.is_equal(["시즌", "팀", "개인"])


func test_it_opens_on_the_season_tab() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_str(s.current_tab_id()).is_equal("season")


# ── 시즌 탭 ───────────────────────────────────────────────────

func test_the_season_tab_shows_what_happened() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["졸업", "1420명"])
	assert_array(t).contains(["지명", "110명"])


## ⚠ **0인 항목은 안 보여준다.** "은퇴 0명"이 줄줄이 뜨면 정작 일어난 일이
## 안 보인다
func test_zero_rows_are_hidden() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s)).not_contains(["0명"])


func test_the_season_tab_shows_awards() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["다승"])
	assert_array(t).contains(["MVP"])


# ── 팀 탭 ─────────────────────────────────────────────────────

func test_the_team_tab_shows_the_rank() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(1)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["애월고"])
	# 2팀 중 2위
	assert_array(t).contains(["2위 / 2팀"])
	assert_array(t).contains(["12승 0무 8패"])


## ⚠ **순위가 0이면 "미정"이다.** 0위로 찍으면 꼴찌보다 나쁜 등수가 뜬다
func test_an_unranked_team_says_so() -> void:
	var d: Dictionary = _digest()
	d["team_id"] = "TEAM_MISSING"
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(1)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["순위 없음"])


# ── 개인 탭 ───────────────────────────────────────────────────

func test_the_personal_tab_shows_my_line() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(2)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["7승 2패 ERA 2.31 88.0이닝 91K"])
	assert_array(t).contains(["MVP"])


## 등판 기록이 한 줄씩 뜬다 — 결산에서 제일 먼저 보는 것이다
func test_the_personal_tab_lists_my_starts() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(2)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["69일차 TEAM_B 5 : 2"])
	assert_array(t).contains(["6.0이닝 7K 1BB 2자책 95구"])


## ⚠ **이닝은 소수가 아니라 아웃 수다.** 20아웃은 6.67이 아니라 6.2이고,
## 엔진도 그 표기로 저장한다 — 화면이 다시 계산하면 6.7로 뜬다
func test_innings_use_baseball_notation() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["game_log"] = [{"day": 1, "opponent_id": "T", "my_score": 1,
		"opp_score": 0, "ip": 6.2, "er": 0.0, "h": 3.0, "k": 5.0, "bb": 1.0,
		"pc": 90}]
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["6.2이닝 5K 1BB 0자책 90구"])


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_digest_does_not_break() -> void:
	var s: SeasonEndScreen = await _mount({})
	assert_array(_texts(s)).contains(["결산할 시즌이 없습니다"])


func test_no_starts_says_so() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["game_log"] = []
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["등판이 없습니다"])


func test_the_done_button_emits() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var got: Array = []
	s.done_requested.connect(func() -> void: got.append(true))
	(s.get_node("Pad/Center/Col/Row/Done") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([true])


func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/season_end_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 탭 목록도 화면이 안 갖는다
	assert_str(src).not_contains("\"season\", \"team\", \"personal\"")
