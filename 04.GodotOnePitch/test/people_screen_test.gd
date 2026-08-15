extends GdUnitTestSuite

## 인물(관계도) 화면 — C-2.
##
## ⚠ **화면은 사전을 찍기만 한다.** 가르기·정렬·이름 붙이기·효과 문장은
## `PeopleVm`이 끝낸다.
##
## ⚠ **관계값 숫자가 화면 어디에도 안 뜬다.** 이 화면의 원칙이다.

const SCREEN := preload("res://ui/screens/people_screen.tscn")


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


func _row(pid: String, kind: String, value: int,
		contact: String = Relationship.CONTACT_TOGETHER,
		specialty: String = "") -> Dictionary:
	return {"person_id": pid, "kind": kind, "value": value,
		"contact": contact, "specialty": specialty, "met_season": 2029,
		"met_team": "T1", "last_team": "T1", "memories": [], "updated_day": 1}


func _state(rows: Array) -> Dictionary:
	return {
		"season_year": 2032,
		"protagonist": {"id": "ME", "team_id": "T1"},
		"relationships": rows,
		"world": {"staff": {"T1": [
			{"id": "S1", "name": "박감독", "role": "manager"},
			{"id": "S2", "name": "최코치", "role": "coach"},
		]}, "rosters": {"T1": [{"id": "N1", "name": "이동료"}]}},
	}


func _rows() -> Array:
	# ⚠ **만난 해(2029)와 겹치는 숫자를 피한다** — 70·20은 "2029"에도 있어서
	# "숫자가 샜다" 검사가 만난 해를 보고 잡는다
	return [
		_row("S1", Relationship.KIND_MANAGER, 73),
		_row("S2", Relationship.KIND_COACH, -66, Relationship.CONTACT_TOGETHER,
			"투수"),
		_row("N1", Relationship.KIND_TEAMMATE, 51),
		_row("GONE", Relationship.KIND_OWNER, 44, Relationship.CONTACT_ENDED),
	]


func _mount(vm: Dictionary) -> PeopleScreen:
	var s: PeopleScreen = SCREEN.instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func _open() -> PeopleScreen:
	return await _mount(PeopleVm.build(_state(_rows())))


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_lists_the_people() -> void:
	var text: String = _joined(await _open())
	assert_str(text).contains("박감독")
	assert_str(text).contains("최코치")
	assert_str(text).contains("이동료")


func test_it_shows_the_role_of_each_person() -> void:
	var text: String = _joined(await _open())
	assert_str(text).contains("감독")
	assert_str(text).contains("동료")


## 코치가 여덟 명까지 붙는다 — 전문 분야가 없으면 누가 누군지 못 가린다
func test_a_coach_shows_the_specialty() -> void:
	assert_str(_joined(await _open())).contains("투수")


func test_it_shows_the_seven_step_label() -> void:
	var text: String = _joined(await _open())
	assert_str(text).contains("각별")
	assert_str(text).contains("적대")


func test_both_columns_have_a_heading() -> void:
	var s: PeopleScreen = await _open()
	assert_str((s.get_node("Pad/Col/Cols/Left/Head") as Label).text
		).contains("지금 함께")
	assert_str((s.get_node("Pad/Col/Cols/Right/Head") as Label).text
		).contains("지난 인연")


func test_the_headings_count_their_rows() -> void:
	var s: PeopleScreen = await _open()
	assert_str((s.get_node("Pad/Col/Cols/Left/Head") as Label).text).contains("3")
	assert_str((s.get_node("Pad/Col/Cols/Right/Head") as Label).text).contains("1")


## 지난 인연은 옅어진다 — 그 규칙을 화면이 말해 준다
func test_the_past_column_explains_fading() -> void:
	assert_str(_joined(await _open())).contains("옅어")


func test_the_fading_note_hides_when_nobody_left() -> void:
	var s: PeopleScreen = await _mount(PeopleVm.build(_state(
		[_row("N1", Relationship.KIND_TEAMMATE, 20)])))
	assert_bool((s.get_node("Pad/Col/Cols/Right/Note") as Label).visible
		).override_failure_message("헤어진 사람이 없는데 감쇠 안내가 뜬다").is_false()


# ── 숫자를 안 보여준다 ────────────────────────────────────────

## ⚠ **이 화면의 원칙이다.** 숫자가 보이면 플레이어가 그 숫자를
## 최적화하기 시작하고, 라벨로 하는 판정과 어긋나 보인다
func test_no_relation_value_reaches_the_screen() -> void:
	var text: String = _joined(await _open())
	for n in ["73", "66", "51", "44"]:
		assert_str(text).override_failure_message(
			"관계값 %s가 화면에 찍혔다" % n).not_contains(n)


# ── 펼치기 ────────────────────────────────────────────────────

## 효과는 눌러야 보인다 — 서른 줄이 다 펼쳐지면 목록이 아니다
func test_the_effect_is_hidden_until_the_row_is_pressed() -> void:
	var s: PeopleScreen = await _open()
	assert_str(_joined(s)).not_contains("출전 기회")

	var body: VBoxContainer = s.get_node("Pad/Col/Cols/Left/Scroll/Body")
	(body.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	assert_str(_joined(s)).contains("출전 기회")


func test_pressing_the_same_row_again_folds_it() -> void:
	var s: PeopleScreen = await _open()
	var body: VBoxContainer = s.get_node("Pad/Col/Cols/Left/Scroll/Body")
	(body.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	(body.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	assert_str(_joined(s)).not_contains("출전 기회")


## ⚠ **한 명만 펼친다.** 다 펼치면 목록이 아니다
func test_only_one_row_is_open_at_a_time() -> void:
	var s: PeopleScreen = await _open()
	var body: VBoxContainer = s.get_node("Pad/Col/Cols/Left/Scroll/Body")
	(body.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	# 펼친 줄 아래에 설명이 하나 끼었으므로 두 번째 사람은 인덱스 2다
	(body.get_child(2) as Button).pressed.emit()
	await await_idle_frame()
	var text: String = _joined(s)
	assert_str(text).not_contains("출전 기회")
	assert_str(text).contains("훈련 효율")


## 지난 인연은 언제 만났는지가 접지 않고 바로 보인다
func test_the_past_shows_when_we_met() -> void:
	assert_str(_joined(await _open())).contains("2029년에 만남")


# ── 빈 상태 ───────────────────────────────────────────────────

func test_an_empty_relation_book_says_so() -> void:
	var s: PeopleScreen = await _mount(PeopleVm.build(_state([])))
	var empty: Label = s.get_node("Pad/Col/Empty")
	# ⚠ **글자를 넣은 것과 띄운 것은 다르다.** `text`만 보면 숨겨 놓아도 통과한다
	assert_bool(empty.visible).override_failure_message(
		"관계가 없는데 안내가 안 뜬다").is_true()
	assert_str(empty.text).contains("아직")
	assert_bool((s.get_node("Pad/Col/Cols") as HBoxContainer).visible
		).override_failure_message("관계가 없는데 빈 두 칸이 뜬다").is_false()


func test_an_empty_column_says_so() -> void:
	var s: PeopleScreen = await _mount(PeopleVm.build(_state(
		[_row("N1", Relationship.KIND_TEAMMATE, 20)])))
	assert_bool((s.get_node("Pad/Col/Cols/Right/Empty") as Label).visible
		).is_true()
	assert_bool((s.get_node("Pad/Col/Cols/Left/Empty") as Label).visible
		).is_false()


# ── 다시 열기 ─────────────────────────────────────────────────

## ⚠ **다시 열어도 줄이 안 쌓인다.** `queue_free`는 다음 프레임까지 살아
## 있어서 진행 화면에서 고아 430개가 실제로 나왔다
func test_reopening_does_not_pile_up_rows() -> void:
	var s: PeopleScreen = await _open()
	var body: VBoxContainer = s.get_node("Pad/Col/Cols/Left/Scroll/Body")
	var before: int = body.get_child_count()
	s.set_view_model(PeopleVm.build(_state(_rows())))
	await await_idle_frame()
	assert_int(body.get_child_count()).override_failure_message(
		"다시 열었더니 줄이 %d → %d로 쌓였다" % [before, body.get_child_count()]
		).is_equal(before)


func test_reopening_folds_what_was_open() -> void:
	var s: PeopleScreen = await _open()
	var body: VBoxContainer = s.get_node("Pad/Col/Cols/Left/Scroll/Body")
	(body.get_child(0) as Button).pressed.emit()
	await await_idle_frame()
	s.set_view_model(PeopleVm.build(_state(_rows())))
	await await_idle_frame()
	assert_str(_joined(s)).override_failure_message(
		"다시 열었는데 지난번에 펼친 줄이 펼쳐진 채다").not_contains("출전 기회")


# ── 진행 화면의 탭이다 ───────────────────────────────────────

## ⚠ **탭 자리가 먼저 있었고 안내 문구만 떠 있었다.** 화면을 만들어 놓고
## 안 이으면 "인물"을 눌러도 그 문구가 그대로 뜬다
func test_the_people_tab_shows_this_screen() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	RelationshipRunner.reconcile(s, 7)

	var main: MainScreen = preload("res://ui/screens/main_screen.tscn").instantiate()
	main.set_view_model(MainVm.build(s))
	add_child(main)
	await await_idle_frame()

	var tab: int = -1
	for i in MainVm.TABS.size():
		if String(MainVm.TABS[i]["id"]) == "people":
			tab = i
	main._on_tab(tab)
	await await_idle_frame()

	assert_array(main.find_children("*", "PeopleScreen", true, false)
		).override_failure_message("인물 탭에 관계도 화면이 안 붙었다").is_not_empty()
	assert_str(_joined(main)).contains("지금 함께")


# ── 화면이 계산을 갖지 않는다 ─────────────────────────────────

func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/people_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 관계 엔진을 직접 읽지 않는다 — 02는 화면이 스토어를 직접 뒤졌다
	assert_str(src).not_contains("RelationshipRunner")
	assert_str(src).not_contains("Staff.")
