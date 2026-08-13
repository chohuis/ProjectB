extends GdUnitTestSuite

## 진행 화면 — M7-2.
##
## `MainVm`이 만든 사전을 받아 글자를 찍고 탭을 기억하는 게 전부다.
## 계산은 여기 들어오면 안 된다 — 마지막 검사가 소스에서 막는다.


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


const MAIN := preload("res://ui/screens/main_screen.tscn")


func _mount(vm: Dictionary) -> MainScreen:
	var s: MainScreen = MAIN.instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func _game(day: int, mine: bool = false) -> Dictionary:
	return {"id": "G%d" % day, "day": day, "is_protagonist_game": mine,
		"home": "TEAM_A", "away": "TEAM_B", "result": null}


func _vm(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {"condition": 80.0, "injury": null, "eligibility_blocked": false,
			"retired": false, "team_name": "제주 애월고", "name": "김한결"},
		"schedule": [_game(15, true)], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return MainVm.build(s)


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_shows_the_date_and_the_player() -> void:
	var s := await _mount(_vm())
	var t := _texts(s)
	assert_array(t).contains(["2027년 3월 10일", "(수)", "2주차"])
	assert_array(t).contains(["김한결", "제주 애월고"])


func test_it_shows_the_next_start() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["다음 등판까지 5일"])


func test_it_shows_the_advance_button() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["5일 진행"])


func test_it_shows_every_tab() -> void:
	assert_array(_texts(await _mount(_vm()))) \
		.contains(["소식", "나", "팀", "리그", "인물", "일정"])


## ⚠ **알림은 개수까지 보여준다.** 점만 찍으면 몇 통인지 몰라 들어가 봐야 안다
func test_the_unread_count_is_on_the_tab() -> void:
	var s := await _mount(_vm({"mailbox": [
		{"id": "M1", "read": false}, {"id": "M2", "read": false}]}))
	assert_array(_texts(s)).contains(["소식 2"])


func test_no_unread_leaves_the_tab_plain() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["소식"])


# ── 진행 버튼 ─────────────────────────────────────────────────

func test_the_button_is_disabled_when_stopped() -> void:
	var s := await _mount(_vm({"day": 15}))
	assert_bool(s._advance.disabled).is_true()


func test_the_button_is_live_on_a_normal_day() -> void:
	var s := await _mount(_vm())
	assert_bool(s._advance.disabled).is_false()


## ⚠ **며칠을 갈지 화면이 다시 계산하지 않는다.** 사전에 적힌 수를 그대로
## 내보낸다 — 화면이 자기 기준으로 세면 진행기와 갈린다
func test_pressing_advance_reports_the_span_from_the_view_model() -> void:
	var s := await _mount(_vm())
	var got: Array = []
	s.advance_requested.connect(func(d: int) -> void: got.append(d))
	s._advance.pressed.emit()
	assert_array(got).is_equal([5])


# ── 탭 ────────────────────────────────────────────────────────

func test_the_first_tab_is_selected() -> void:
	var s := await _mount(_vm())
	assert_str(s.current_tab_id()).is_equal("news")


func test_selecting_a_tab_switches_the_body() -> void:
	var s := await _mount(_vm())
	s._on_tab(3)
	await await_idle_frame()
	assert_str(s.current_tab_id()).is_equal("league")
	assert_array(_texts(s)).contains(["리그"])


func test_selecting_a_tab_announces_it() -> void:
	var s := await _mount(_vm())
	var got: Array = []
	s.tab_selected.connect(func(id: String) -> void: got.append(id))
	s._on_tab(2)
	await await_idle_frame()
	assert_array(got).is_equal(["team"])


## ⚠ **다시 그려도 탭이 두 줄로 안 찍힌다.** `queue_free`만 하면 다음
## 프레임까지 자식으로 남는다
func test_rebuilding_does_not_duplicate_the_tabs() -> void:
	var s := await _mount(_vm())
	var before: int = s._tabs.get_child_count()
	s.set_view_model(_vm())
	assert_int(s._tabs.get_child_count()).is_equal(before)


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_dictionary_does_not_break() -> void:
	var s := await _mount({})
	assert_object(s).is_not_null()
	assert_str(s.current_tab_id()).is_empty()


func test_a_state_with_no_schedule_does_not_break() -> void:
	var s := await _mount(_vm({"schedule": []}))
	assert_array(_texts(s)).contains(["남은 등판 없음"])


# ── 화면이 계산을 갖지 않는가 ─────────────────────────────────

## ⚠ **이게 이 검사 묶음에서 제일 중요하다.** 02 결함 상당수가 "화면이
## 계산을 갖고 있어서" 생겼다 — 수상 집계가 결산 모달에만, 드래프트 보드가
## 자기 후보 풀을 따로, 경력 기록 조립이 모달 안에만.
##
## 원본 `MainPage.svelte`는 859줄이고 그중 상당수가 계산이었다
func test_the_screen_does_not_compute() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/main_screen.gd")
	# 집계·정렬·필터는 ViewModel이 할 일이다
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains("filter(")
	# 날짜·주차를 화면이 다시 파면 안 된다
	assert_str(src).not_contains("Calendar.")
	# 진행 판단도 마찬가지 — 사전에 이미 답이 있다
	assert_str(src).not_contains("DayEngine.")
	# 스토어를 직접 읽으면 안 된다
	assert_str(src).not_contains("NpcStore")


## ⚠ **`MainVm`은 반대로 화면을 몰라야 한다.** 알면 두 방향 의존이 생겨
## ViewModel을 검사만으로 못 돌린다
func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/main_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
	assert_str(src).not_contains("preload")
