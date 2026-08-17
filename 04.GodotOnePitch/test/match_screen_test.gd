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
	assert_bool(mine.get_node("Pad/Col/Body/Left/Choose").visible).is_true()

	var theirs: MatchScreen = await _mount(_state({"pitcher": {"id": "NOT_ME"}}), _ctx())
	assert_bool(theirs.get_node("Pad/Col/Body/Left/Choose").visible).is_false()


func test_the_strike_zone_has_nine_cells() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_int(s.get_node("Pad/Col/Body/Left/Choose/Zone/Box/Grid").get_child_count()).is_equal(9)


## ⚠ **내가 던질 수 있는 공만 뜬다.** 전부 뜨면 배우지 않은 공을 던지게 되고,
## 숙련도를 올릴 이유가 사라진다
## ⚠ **빈 칸과 소모 줄이 같이 붙는다**(M-6) — 버튼만 세면 안 된다.
## 배운 둘만 **누를 수 있어야** 하고, 안 배운 공은 이름조차 안 나온다
func test_only_my_pitches_are_offered() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var host: Node = s.get_node("Pad/Col/Body/Left/Choose/Opts/Pitches")
	var buttons: Array = []
	for c in host.get_children():
		if c is Button:
			buttons.append((c as Button).text)
	assert_int(buttons.size()).override_failure_message(
		"고를 수 있는 구종이 %d개다: %s" % [buttons.size(), str(buttons)]).is_equal(2)
	assert_str(String(buttons[0])).contains("포심")
	assert_str(String(buttons[1])).contains("슬라이더")
	for x in _texts(host):
		assert_str(x).not_contains("너클볼")


## 숙련도가 버튼에 뜬다 — 어느 공이 좋은지 보여야 고를 수 있다.
##
## ⚠ **숫자가 아니라 점 다섯 칸이다**(M-6) — 02는 막대인데 04는 자리가
## 좁아 칸으로 뒀다. 4등급이면 채운 점 넷 · 빈 점 하나
func test_the_grade_is_on_the_button() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var first: String = _texts(
		s.get_node("Pad/Col/Body/Left/Choose/Opts/Pitches"))[0]
	assert_str(first).contains("●●●●○")
	assert_str(first).contains("포심")


func test_strategy_and_power_are_offered() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	assert_int(s.get_node("Pad/Col/Body/Left/Choose/Opts/Strategy").get_child_count()).is_equal(3)
	assert_int(s.get_node("Pad/Col/Body/Left/Choose/Opts/Power").get_child_count()).is_equal(3)


## ⚠ **고른 게 눌린 채로 보여야 한다.** 안 보이면 뭘 골랐는지 모르고
## 같은 걸 계속 누른다
func test_the_chosen_one_is_pressed() -> void:
	var s: MatchScreen = await _mount(_state(),
		_ctx({"selection": {"pitch_type": "slider", "zone": 7, "strategy": "safe"}}))
	var pitches: Node = s.get_node("Pad/Col/Body/Left/Choose/Opts/Pitches")
	assert_bool((pitches.get_child(0) as Button).button_pressed).is_false()
	assert_bool((pitches.get_child(1) as Button).button_pressed).is_true()

	var grid: Node = s.get_node("Pad/Col/Body/Left/Choose/Zone/Box/Grid")
	assert_bool((grid.get_child(6) as Button).button_pressed).override_failure_message(
		"7번 존을 골랐는데 안 눌려 있다").is_true()


func test_the_intentional_ball_button_can_be_chosen() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"selection": {"zone": 0}}))
	assert_bool((s.get_node("Pad/Col/Body/Left/Choose/Zone/Ball") as Button).button_pressed).is_true()
	for c in s.get_node("Pad/Col/Body/Left/Choose/Zone/Box/Grid").get_children():
		assert_bool((c as Button).button_pressed).is_false()


# ── 누르면 신호가 나가는가 ────────────────────────────────────

## ⚠ **화면이 선택을 자기 안에 들고 있으면 안 된다.** 한 구 던질 때마다 새
## 사전이 오면서 초기화된다 — 소식 거르기가 그랬다
func test_picking_a_pitch_emits_a_signal() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Body/Left/Choose/Opts/Pitches").get_child(1) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"pitch_type": "slider"}])


func test_picking_a_zone_emits_a_signal() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Body/Left/Choose/Zone/Box/Grid").get_child(2) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"zone": 3}])


func test_picking_the_ball_zone_emits_zero() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx())
	var got: Array = []
	s.selection_changed.connect(func(p: Dictionary) -> void: got.append(p))

	(s.get_node("Pad/Col/Body/Left/Choose/Zone/Ball") as Button).pressed.emit()
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


# ── 구장 (M7-6e3) ─────────────────────────────────────────────

## ⚠ **02는 프로 구장 하나가 하드코딩이었다.** 고교 경기도 대학 경기도
## 전부 프로 구장에서 열렸다
func test_the_park_image_follows_the_home_team() -> void:
	var hs: MatchScreen = await _mount(_state(),
		_ctx({"stadium_id": "STADIUM_HALLA"}))
	assert_object(hs.get_node("Pad/Col/Body/Left/Field/Park").texture) \
		.override_failure_message("구장 그림이 안 걸렸다").is_not_null()

	var pro: MatchScreen = await _mount(_state(),
		_ctx({"stadium_id": "STADIUM_SEOUL_ROYALS"}))
	assert_object(pro.get_node("Pad/Col/Body/Left/Field/Park").texture) \
		.is_not_equal(hs.get_node("Pad/Col/Body/Left/Field/Park").texture)


func test_nine_defenders_are_drawn() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	assert_int(s.get_node("Pad/Col/Body/Left/Field/Layer").get_child_count()).is_equal(9)


## ⚠ **좌표를 화면 크기로 옮긴다.** 그림만 늘이고 좌표를 안 늘이면
## 수비수가 베이스에서 벗어난다
func test_the_coordinates_scale_with_the_field() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var f: BaseballField = s.get_node("Pad/Col/Body/Left/Field")
	# 그림 비율과 같은 크기 — 여백이 없다
	f.size = Vector2(500, 460)
	assert_vector(f.to_screen(Vector2(1000, 920))).is_equal(Vector2(500, 460))
	assert_vector(f.to_screen(Vector2(500, 460))).is_equal(Vector2(250, 230))


## ⚠ **그림은 비율을 지켜 가운데 놓인다.** 남는 여백을 안 빼면 그림은
## 가운데 좁게 있는데 수비수만 넓게 퍼져서 외야수가 관중석에 선다 —
## 실제로 화면에서 그렇게 나왔다
func test_the_letterbox_margin_is_taken_out() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var f: BaseballField = s.get_node("Pad/Col/Body/Left/Field")

	# 옆으로 넓은 자리 — 그림은 세로에 맞춰 283×260이 되고 좌우에 여백이 생긴다
	# ⚠ 씬이 최소 높이를 갖는다 — 그보다 작게 주면 안 줄어들고 검사가 헛돈다
	f.size = Vector2(1600, 400)
	var r: Rect2 = f.image_rect()
	assert_float(r.size.y).is_equal_approx(400.0, 0.5)
	assert_float(r.size.x).is_equal_approx(400.0 * 1000.0 / 920.0, 0.5)
	assert_float(r.position.x).override_failure_message(
		"여백이 0이다 — 그림 폭을 Control 폭으로 잡고 있다").is_greater(1.0)

	# 그림 한가운데는 그림 사각형의 한가운데다
	assert_vector(f.to_screen(Vector2(500, 460))) \
		.is_equal_approx(r.position + r.size * 0.5, Vector2(0.5, 0.5))
	# 그림 왼쪽 끝은 여백 다음이다 — 0이 아니다
	assert_float(f.to_screen(Vector2(0, 0)).x).is_equal_approx(r.position.x, 0.5)


## 수비수가 **그림 안**에 있어야 한다. Control 안에 있어도 그림 밖이면
## 잔디가 아니라 여백 위에 선다
func test_the_defenders_stand_on_the_picture() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var f: BaseballField = s.get_node("Pad/Col/Body/Left/Field")
	f.size = Vector2(1600, 400)
	f.set_view_model(f._vm)
	await await_idle_frame()

	var r: Rect2 = f.image_rect()
	for c in f.get_node("Layer").get_children():
		var p: Vector2 = (c as Control).position + (c as Control).size
		assert_bool(r.has_point(p)).override_failure_message(
			"수비수가 그림 밖에 있다: %s (그림 %s)" % [p, r]).is_true()


## 수비수가 화면 안에 있어야 한다 — 밖으로 나가면 안 보인다
func test_the_defenders_stay_on_screen() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var f: Node = s.get_node("Pad/Col/Body/Left/Field")
	for c in f.get_node("Layer").get_children():
		var p: Vector2 = (c as Control).position
		assert_float(p.x).is_between(-40.0, f.size.x)
		assert_float(p.y).is_between(-60.0, f.size.y)


## ⚠ **모르는 구장도 화면이 비면 안 된다.** 해외는 구장을 한글 이름으로
## 참조하고 정의가 없다
func test_an_unknown_stadium_still_draws() -> void:
	var s: MatchScreen = await _mount(_state(),
		_ctx({"stadium_id": "엠파이어 스타디움"}))
	assert_object(s.get_node("Pad/Col/Body/Left/Field/Park").texture).is_not_null()
	assert_int(s.get_node("Pad/Col/Body/Left/Field/Layer").get_child_count()).is_equal(9)


## ⚠ **발밑이 좌표에 온다.** 가운데를 맞추면 선수가 베이스 위에 떠 있다
func test_the_sprites_stand_on_their_spot() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var f: BaseballField = s.get_node("Pad/Col/Body/Left/Field")
	var by_pos: Dictionary = {}
	for d in f._vm["defense"]:
		by_pos[d["pos"]] = d["point"]

	var kids: Array = f.get_node("Layer").get_children()
	assert_int(kids.size()).is_equal(9)
	for i in kids.size():
		var c: Control = kids[i]
		var want: Vector2 = f.to_screen(by_pos[f._vm["defense"][i]["pos"]])
		# 아래 끝이 좌표, 가로는 가운데
		assert_float(c.position.y + c.size.y).override_failure_message(
			"발밑이 %.1f인데 좌표는 %.1f다" % [c.position.y + c.size.y, want.y]) \
			.is_equal_approx(want.y, 0.6)
		assert_float(c.position.x + c.size.x * 0.5).is_equal_approx(want.x, 0.6)


## ⚠ **포지션마다 그림이 다르다.** 하나로 통일하면 아홉 명이 전부 투수로
## 서 있는데, 어디가 어느 자리인지 화면에서 못 읽는다
func test_each_position_has_its_own_sprite() -> void:
	var s: MatchScreen = await _mount(_state(), _ctx({"stadium_id": "STADIUM_HALLA"}))
	var seen: Array = []
	for c in s.get_node("Pad/Col/Body/Left/Field/Layer").get_children():
		var t: Texture2D = (c as TextureRect).texture
		assert_object(t).is_not_null()
		assert_bool(seen.has(t.resource_path)).override_failure_message(
			"같은 그림이 두 번 쓰였다: %s" % t.resource_path).is_false()
		seen.append(t.resource_path)
	assert_int(seen.size()).is_equal(9)
