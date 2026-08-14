extends GdUnitTestSuite

## 경기 화면 — M7-6e1·e2.
##
## `MatchVm`이 만든 사전을 받아 찍고, 누른 걸 신호로 내보내는 게 전부다.
## 계산은 여기 들어오면 안 된다 — 마지막 검사가 소스에서 막는다.

const MATCH := preload("res://ui/screens/match_screen.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"inning": 3, "half": "bottom", "outs": 1,
		"count": {"balls": 2, "strikes": 1},
		"runners": {"first": {"id": "R1"}, "second": {}, "third": {}},
		"score": {"home": 2, "away": 1}, "is_finished": false,
		"batter": {"id": "B1"}, "pitcher": {"id": "ME"},
		"pitcher_line": {"outs": 7, "pc": 44, "k": 3, "bb": 1, "h": 2, "er": 1},
	}
	s.merge(over, true)
	return s


func _ctx(over: Dictionary = {}) -> Dictionary:
	var c: Dictionary = {
		"home_name": "제주", "away_name": "서울",
		"names": {"B1": "김타자", "ME": "나투수"},
		"my_id": "ME",
		"me": {"id": "ME", "pitches": [
			{"id": "fastball", "grade": 4}, {"id": "slider", "grade": 2}]},
		"log": ["1구 포심 볼", "2구 슬라이더 헛스윙"],
	}
	c.merge(over, true)
	return c


func _mount(state: Dictionary, ctx: Dictionary) -> MatchScreen:
	var s: MatchScreen = MATCH.instantiate()
	s.set_view_model(MatchVm.build(state, ctx))
	add_child(s)
	await await_idle_frame()
	return s


# ── 찍는가 ────────────────────────────────────────────────────

func test_it_shows_the_situation() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["3회말", "카운트 2-1", "1아웃", "1루"])


func test_it_shows_the_pitcher_line() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_array(_texts(s)).contains(["2.1이닝 3K 1BB 2H 1자책"])


func test_the_log_is_shown() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_array(_texts(s)).contains(["2구 슬라이더 헛스윙"])


## ⚠ **끝난 경기에 던지면 기록이 계속 쌓인다**
func test_a_finished_game_disables_pitching() -> void:
	var s: MatchScreen = await _mount(_state({"is_finished": true}), _ctx())
	assert_bool(s.get_node("Pad/Col/Row/Pitch").disabled).is_true()
	assert_bool(s.get_node("Pad/Col/Row/Auto").disabled).is_true()
	assert_bool(s.get_node("Pad/Col/Row/Done").disabled).is_false()


# ── 고르는가 (M7-6e2) ─────────────────────────────────────────

## ⚠ **내가 던질 때만 고를 게 뜬다.** 상대가 던질 땐 고를 게 없는데
## 선택 화면이 뜨면 내가 던지는 줄 안다
func test_the_choices_only_show_on_my_turn() -> void:
	var mine: MatchScreen = await _mount(_state(), _ctx())
	assert_bool(mine.get_node("Pad/Col/Choose").visible).is_true()

	var theirs: MatchScreen = await _mount(_state({"pitcher": {"id": "NOT_ME"}}), _ctx())
	assert_bool(theirs.get_node("Pad/Col/Choose").visible).is_false()


func test_the_strike_zone_has_nine_cells() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_int(s.get_node("Pad/Col/Choose/Zone/Grid").get_child_count()).is_equal(9)


## ⚠ **내가 던질 수 있는 공만 뜬다.** 전부 뜨면 배우지 않은 공을 던지게 되고,
## 숙련도를 올릴 이유가 사라진다
func test_only_my_pitches_are_offered() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var t: PackedStringArray = _texts(s.get_node("Pad/Col/Choose/Opts/Pitches"))
	assert_int(t.size()).is_equal(2)
	assert_str(t[0]).contains("포심")
	assert_str(t[1]).contains("슬라이더")
	for x in t:
		assert_str(x).not_contains("너클볼")


## 숙련도가 버튼에 뜬다 — 어느 공이 좋은지 보여야 고를 수 있다
func test_the_grade_is_on_the_button() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_str(_texts(s.get_node("Pad/Col/Choose/Opts/Pitches"))[0]).contains("4")


func test_strategy_and_power_are_offered() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_int(s.get_node("Pad/Col/Choose/Opts/Strategy").get_child_count()).is_equal(3)
	assert_int(s.get_node("Pad/Col/Choose/Opts/Power").get_child_count()).is_equal(3)


## ⚠ **고른 게 눌린 채로 보여야 한다.** 안 보이면 뭘 골랐는지 모르고
## 같은 걸 계속 누른다
func test_the_chosen_one_is_pressed() -> void:
	var s: MatchScreen = await _mount(_state(),
		_ctx({"selection": {"pitch_type": "slider", "zone": 7, "strategy": "safe"}}))
	var pitches: Node = s.get_node("Pad/Col/Choose/Opts/Pitches")
	assert_bool((pitches.get_child(0) as Button).button_pressed).is_false()
	assert_bool((pitches.get_child(1) as Button).button_pressed).is_true()

	var grid: Node = s.get_node("Pad/Col/Choose/Zone/Grid")
	assert_bool((grid.get_child(6) as Button).button_pressed).override_failure_message(
		"7번 존을 골랐는데 안 눌려 있다").is_true()


func test_the_intentional_ball_button_can_be_chosen() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"selection": {"zone": 0}}))
	assert_bool((s.get_node("Pad/Col/Choose/Zone/Ball") as Button).button_pressed).is_true()
	for c in s.get_node("Pad/Col/Choose/Zone/Grid").get_children():
		assert_bool((c as Button).button_pressed).is_false()


# ── 누르면 신호가 나가는가 ────────────────────────────────────

## ⚠ **화면이 선택을 자기 안에 들고 있으면 안 된다.** 한 구 던질 때마다 새
## 사전이 오면서 초기화된다 — 소식 거르기가 그랬다
func test_picking_a_pitch_emits_a_signal() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Choose/Opts/Pitches").get_child(1) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"pitch_type": "slider"}])


func test_picking_a_zone_emits_a_signal() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Choose/Zone/Grid").get_child(2) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"zone": 3}])


func test_picking_the_ball_zone_emits_zero() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Choose/Zone/Ball") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"zone": 0}])


func test_the_buttons_emit_their_signals() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.pitch_requested.connect(func() -> void: got.append("pitch"))
	s.auto_requested.connect(func() -> void: got.append("auto"))
	s.done_requested.connect(func() -> void: got.append("done"))

	(s.get_node("Pad/Col/Row/Pitch") as Button).pressed.emit()
	(s.get_node("Pad/Col/Row/Auto") as Button).pressed.emit()
	(s.get_node("Pad/Col/Row/Done") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal(["pitch", "auto", "done"])


# ── 계산을 갖지 않는가 ────────────────────────────────────────

func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/match_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 목록도 화면이 갖지 않는다 — 사전이 준 걸 찍는다
	assert_str(src).not_contains("fastball")
	assert_str(src).not_contains("aggressive")
