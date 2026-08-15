extends GdUnitTestSuite

## 학업 탭 — C-3. "나" 탭의 하위 탭이다.
##
## ⚠ **이 탭이 `study_mode`와 `major`를 쓰는 쪽이다.** 04는 둘 다 읽는
## 코드만 있고 세우는 데가 없어서 전 커리어가 "normal" 고정이었다.

const STATUS := preload("res://ui/screens/status_screen.tscn")
const APP := preload("res://ui/app_root.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _joined(node: Node) -> String:
	return "\n".join(_texts(node))


func _state(school: Dictionary = {}, league: String = "LEAGUE_UNIVERSITY",
		over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 7, "season_year": 2030,
		"protagonist": {"id": "ME", "league_id": league, "pitching": {}},
		"school": school,
	}
	s.merge(over, true)
	return s


func _open(s: Dictionary) -> StatusScreen:
	var screen: StatusScreen = STATUS.instantiate()
	screen.set_view_model(StatusVm.build(s))
	add_child(screen)
	await await_idle_frame()
	return screen


func _tab_index(s: Dictionary, id: String) -> int:
	var tabs: Array = StatusVm.build(s)["tabs"]
	for i in tabs.size():
		if String(tabs[i]["id"]) == id:
			return i
	return -1


func _open_academics(s: Dictionary) -> StatusScreen:
	var screen: StatusScreen = await _open(s)
	screen._on_tab(_tab_index(s, "academics"))
	await await_idle_frame()
	return screen


# ── 탭이 무대를 따른다 ────────────────────────────────────────

## ⚠ **학업은 학교에 다닐 때만 뜬다.** 02도 그랬다 —
## 프로에게 학점 탭을 띄우면 은퇴할 때까지 빈 화면이 하나 붙어 있는다
func test_a_student_gets_the_academics_tab() -> void:
	assert_int(_tab_index(_state(), "academics")).is_greater(-1)
	assert_str(_joined(await _open(_state()))).contains("학업")


func test_a_pro_has_no_academics_tab() -> void:
	var s: Dictionary = _state({}, "LEAGUE_KBL")
	assert_int(_tab_index(s, "academics")).override_failure_message(
		"프로인데 학업 탭이 있다").is_equal(-1)


func test_the_other_tabs_are_still_there() -> void:
	var text: String = _joined(await _open(_state({}, "LEAGUE_KBL")))
	for label in ["능력치", "기록", "커리어"]:
		assert_str(text).contains(String(label))


## ⚠ **탭이 줄면 고른 자리가 사라진다.** 학업 탭에 있다가 졸업하면
## 없는 탭을 그리려다 빈 화면이 된다
func test_leaving_school_falls_back_to_a_real_tab() -> void:
	var screen: StatusScreen = await _open_academics(_state())
	screen.set_view_model(StatusVm.build(_state({}, "LEAGUE_KBL")))
	await await_idle_frame()
	# ⚠ **빈 문자열도 실패다.** 자리를 안 자르면 없는 탭을 가리켜
	# 내용이 통째로 안 그려진다 — 화면만 보면 "커리어"는 탭 이름으로 남아 있다
	assert_str(screen.current_tab_id()).override_failure_message(
		"졸업했는데 없는 탭(\"%s\")을 가리키고 있다" % screen.current_tab_id()
		).is_equal("career")


## ⚠ **탭을 다시 만들 때 옛 버튼을 지운다.** 진행할 때마다 사전이 새로 오는데
## 안 지우면 "능력치 능력치 능력치…"가 쌓인다
func test_redrawing_does_not_pile_up_tab_buttons() -> void:
	var screen: StatusScreen = await _open(_state())
	var tabs: HBoxContainer = screen.get_node("Scroll/Col/Tabs")
	var before: int = tabs.get_child_count()
	screen.set_view_model(StatusVm.build(_state()))
	await await_idle_frame()
	assert_int(tabs.get_child_count()).override_failure_message(
		"다시 그렸더니 탭이 %d → %d로 쌓였다" % [before, tabs.get_child_count()]
		).is_equal(before)


## ⚠ **보고 있던 탭에 표시가 남아야 한다.** 진행 뒤에 사전이 새로 오면서
## 눌린 자리가 "능력치"로 돌아가면 어디를 보고 있는지 알 수 없다
func test_the_open_tab_stays_marked_after_a_redraw() -> void:
	var screen: StatusScreen = await _open_academics(_state())
	screen.set_view_model(StatusVm.build(_state()))
	await await_idle_frame()

	var tabs: HBoxContainer = screen.get_node("Scroll/Col/Tabs")
	var idx: int = _tab_index(_state(), "academics")
	assert_bool((tabs.get_child(idx) as Button).button_pressed
		).override_failure_message("학업 탭을 보고 있는데 표시가 다른 탭에 있다"
		).is_true()


# ── 무엇이 보이나 ─────────────────────────────────────────────

func test_it_shows_the_gpa_and_the_next_exam() -> void:
	var text: String = _joined(await _open_academics(
		_state({"gpa": 3.21, "gpa_terms": 2})))
	assert_str(text).contains("3.21")
	assert_str(text).contains("D-10")


## ⚠ **"훈련 효율"만 찾으면 안 된다.** 전공 선택 안내 문구에도 그 말이
## 있어서, 훈련 효율을 안 찍어도 검사가 통과했다 — 실제로 그랬다.
## 전공을 골라 안내를 치우고 **숫자까지** 본다
func test_a_warning_is_visible() -> void:
	var text: String = _joined(await _open_academics(_state(
		{"major": "체육교육", "warning_level": 2, "gpa": 1.2, "gpa_terms": 1})))
	assert_str(text).contains("출전 정지")
	# 경고 2단계(0.85) + 체육교육(+0.03) = 88%
	assert_str(text).override_failure_message(
		"경고가 훈련을 얼마나 깎는지가 안 뜬다").contains("훈련 효율 88%")


func test_the_semester_log_is_listed() -> void:
	var text: String = _joined(await _open_academics(_state({}, "LEAGUE_UNIVERSITY",
		{"academic_log": [{"day": 77, "year": 2029, "exam": "midterm",
			"gpa": 2.4, "warning_level": 0, "label": ""}]})))
	assert_str(text).contains("2029년 중간고사")


## **안 뽑힌 것도 결과다** — 빈칸으로 두면 무대가 없는 것처럼 보인다
func test_the_campus_log_is_listed() -> void:
	var text: String = _joined(await _open_academics(_state({}, "LEAGUE_UNIVERSITY",
		{"campus_log": [{"day": 224, "kind": "showcase", "selected": false}]})))
	assert_str(text).contains("쇼케이스")
	assert_str(text).contains("미선발")


# ── 고른 것이 상태에 닿는가 ───────────────────────────────────

func _app(s: Dictionary) -> AppRoot:
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	r.screen()._on_tab(1)
	await await_idle_frame()
	var status: StatusScreen = r.screen().find_children(
		"*", "StatusScreen", true, false)[0]
	status._on_tab(_tab_index(s, "academics"))
	await await_idle_frame()
	return r


func _press(r: AppRoot, needle: String) -> void:
	for b in r.find_children("*", "Button", true, false):
		if String((b as Button).text).contains(needle):
			(b as Button).pressed.emit()
			await await_idle_frame()
			await await_idle_frame()
			return
	fail("'%s' 버튼을 못 찾았다" % needle)


## ⚠ **04는 `study_mode`를 세우는 데가 없었다.** 읽는 코드만 있어서
## 전 커리어가 "normal" 고정이었고 나머지 셋은 도달 불가였다
func test_picking_a_study_mode_reaches_the_state() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = await _app(s)
	await _press(r, "집중 수업")
	assert_str(String(r.state().get("school", {}).get("study_mode", ""))
		).override_failure_message("집중 수업을 골랐는데 상태가 그대로다"
		).is_equal("focus")


## ⚠ **`major`도 세우는 데가 없었다** — 전공 표 셋이 통째로 도달 불가였다
func test_picking_a_major_reaches_the_state() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["protagonist"]["league_id"] = "LEAGUE_UNIVERSITY"
	var r: AppRoot = await _app(s)
	await _press(r, "스포츠과학")
	assert_str(String(r.state().get("school", {}).get("major", ""))
		).is_equal("스포츠과학")


## 한 번뿐이다 — 고르고 나면 선택 카드가 사라진다
func test_a_major_cannot_be_changed() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["protagonist"]["league_id"] = "LEAGUE_UNIVERSITY"
	s["school"] = {"major": "체육교육", "study_mode": "normal", "warning_level": 0}
	var r: AppRoot = await _app(s)
	assert_str(_joined(r)).override_failure_message(
		"전공을 이미 골랐는데 또 고르라고 한다").not_contains("전공 선택")
	assert_str(String(r.state()["school"]["major"])).is_equal("체육교육")


## ⚠ **고르고 나서도 학업 탭에 남아 있어야 한다.** 상태가 바뀌면
## `StatusScreen`이 통째로 새로 만들어지는데, 자리를 안 되돌려 놓으면
## 한 번 고를 때마다 "능력치"로 튕겨 나간다
func test_picking_keeps_me_on_the_academics_tab() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = await _app(s)
	await _press(r, "집중 수업")
	assert_str(_joined(r)).override_failure_message(
		"학업에서 뭘 고르자 다른 탭으로 튕겨 나갔다").contains("주간 학업")


## ⚠ **다시 그려도 줄이 안 쌓인다.** 고를 때마다 사전이 새로 온다
func test_picking_twice_does_not_pile_up_rows() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = await _app(s)
	await _press(r, "집중 수업")
	var before: int = r.find_children("*", "Button", true, false).size()
	await _press(r, "수업 중 휴식")
	assert_int(r.find_children("*", "Button", true, false).size()
		).override_failure_message("고를 때마다 버튼이 쌓인다").is_equal(before)


# ── 화면이 계산을 갖지 않는다 ─────────────────────────────────

func test_the_screen_holds_no_academic_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/status_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 학사 규칙을 화면이 직접 읽지 않는다 — `AcademicsVm`이 끝낸다
	assert_str(src).not_contains("Academics.")
