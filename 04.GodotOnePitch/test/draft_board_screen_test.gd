extends GdUnitTestSuite

## 드래프트 보드 화면 — C-1.
##
## ⚠ **화면은 사전을 찍기만 한다.** 라운드 묶기·순번 정렬·팀 이름 붙이기는
## `DraftBoardVm`이 끝낸다 — 02는 이 모달이 자기 후보 풀까지 만들어서
## 화면에서 본 지명과 실제 소속이 어긋났다.

const SCREEN := preload("res://ui/screens/draft_board_screen.tscn")


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


func _cand(id: String, ovr: float, league: String = "LEAGUE_HIGHSCHOOL",
		mine: bool = false) -> Dictionary:
	return {"id": id, "name": "선수%s" % id, "position": "SP",
		"player_type": "pitcher", "pitching": {"ovr": ovr}, "batting": {},
		"age": 19, "league_id": league, "is_protagonist": mine}


func _state(mine: bool = false) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2030,
		"protagonist": {"id": "ME"},
		"team_names": {"T1": "제주 드래곤스", "T2": "서울 코메츠"},
	}
	var by_id: Dictionary = {
		"A": _cand("A", 80.0), "B": _cand("B", 75.0, "LEAGUE_UNIVERSITY"),
		"E": _cand("E", 60.0), "ME": _cand("ME", 72.0, "LEAGUE_HIGHSCHOOL", mine),
	}
	DraftLog.record(s, 2030, [
		{"round": 1, "pick": 1, "team_id": "T1", "npc_id": "A"},
		{"round": 1, "pick": 2, "team_id": "T2", "npc_id": "B"},
		{"round": 2, "pick": 3, "team_id": "T1", "npc_id": "ME" if mine else "E"},
	], ["A", "B", "E", "ME"], ["E"] if mine else ["ME"], by_id)
	return s


func _mount(vm: Dictionary) -> DraftBoardScreen:
	var s: DraftBoardScreen = SCREEN.instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func _open(mine: bool = false) -> DraftBoardScreen:
	return await _mount(DraftBoardVm.build(_state(mine), 2030))


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_shows_the_year() -> void:
	var s: DraftBoardScreen = await _open()
	assert_array(_texts(s)).contains(["2030 신인 드래프트"])


## **"몇 명 중 몇 명"이 보드의 뜻이다** — 지명만 보여주면 경쟁이 안 보인다
func test_it_shows_the_competition() -> void:
	var s: DraftBoardScreen = await _open()
	assert_str(_joined(s)).contains("후보")


func test_it_lists_the_rounds() -> void:
	var s: DraftBoardScreen = await _open()
	var text: String = _joined(s)
	assert_str(text).contains("1라운드")
	assert_str(text).contains("2라운드")


func test_it_lists_the_picks() -> void:
	var s: DraftBoardScreen = await _open()
	var text: String = _joined(s)
	assert_str(text).contains("1순위")
	assert_str(text).contains("선수A")
	assert_str(text).contains("제주 드래곤스")


## ⚠ **어디서 왔는지가 뜬다.** 02는 이 기록이 없어 국내 신인과 구분을 못 했다
func test_it_shows_where_they_came_from() -> void:
	var s: DraftBoardScreen = await _open()
	var text: String = _joined(s)
	assert_str(text).contains("고교")
	assert_str(text).contains("대학")


## **보드에 올랐지만 안 뽑힌 사람**도 보여준다
func test_it_shows_the_missed_candidates() -> void:
	var s: DraftBoardScreen = await _open()
	assert_str(_joined(s)).contains("미지명")


## ⚠ **내가 어디서 뽑혔는지가 제일 먼저 보여야 한다.** 백 명 넘는 명단에서
## 자기 줄을 찾게 만들면 안 된다
func test_my_pick_is_pinned_to_the_top() -> void:
	var s: DraftBoardScreen = await _open(true)
	var head: Label = s.get_node("Pad/Center/Col/MyPick")
	assert_bool(head.visible).override_failure_message(
		"내가 지명됐는데 머리글이 안 뜬다").is_true()
	assert_str(head.text).contains("나")
	assert_str(head.text).contains("제주 드래곤스")


func test_the_pinned_line_hides_when_i_was_not_drafted() -> void:
	var s: DraftBoardScreen = await _open()
	assert_bool((s.get_node("Pad/Center/Col/MyPick") as Label).visible
		).override_failure_message(
		"내가 안 뽑혔는데 내 줄이 뜬다").is_false()


func test_an_unopened_draft_says_so() -> void:
	var s: DraftBoardScreen = await _mount(DraftBoardVm.build(
		{"season_year": 2030, "protagonist": {}}, 2030))
	assert_str(_joined(s)).contains("아직")


func test_the_done_button_emits() -> void:
	var s: DraftBoardScreen = await _open()
	var got: Array = []
	s.done_requested.connect(func() -> void: got.append(true))
	(s.get_node("Pad/Center/Col/Row/Done") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([true])


## ⚠ **다시 열어도 줄이 안 쌓인다.** `queue_free`는 다음 프레임까지 살아
## 있어서 진행 화면에서 고아 430개가 실제로 나왔다
func test_reopening_does_not_pile_up_rows() -> void:
	var s: DraftBoardScreen = await _open()
	var body: VBoxContainer = s.get_node("Pad/Center/Col/Scroll/Body")
	var before: int = body.get_child_count()
	s.set_view_model(DraftBoardVm.build(_state(), 2030))
	await await_idle_frame()
	assert_int(body.get_child_count()).override_failure_message(
		"다시 열었더니 줄이 %d → %d로 쌓였다" % [before, body.get_child_count()]
	).is_equal(before)


# ── 화면이 계산을 갖지 않는다 ─────────────────────────────────

func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/draft_board_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 후보 풀도 화면이 안 만든다 — 02가 그래서 어긋났다
	assert_str(src).not_contains("NpcDraft")
	assert_str(src).not_contains("DraftLog")
