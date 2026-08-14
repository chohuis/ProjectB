extends GdUnitTestSuite

## 훈련 계획 화면 — M7-9b.
##
## ⚠ **미리보기와 실제가 같은 함수를 쓴다.** 두 벌이 되면 "화면엔 −8인데
## 실제로는 −12"가 된다.

const SCREEN := preload("res://ui/screens/training_screen.tscn")


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
		"protagonist": {"id": "ME", "player_type": "pitcher",
			"fatigue": 20.0, "condition": 90.0},
		"training_plan": {},
	}
	s.merge(over, true)
	return s


func _mount(state: Dictionary) -> TrainingScreen:
	var s: TrainingScreen = SCREEN.instantiate()
	s.set_view_model(TrainingVm.build(state))
	add_child(s)
	await await_idle_frame()
	return s


# ── 슬롯 ──────────────────────────────────────────────────────

## ⚠ **키 이름이 `Training._slot_ids`와 같아야 한다.** 다르면 계획을 짜도
## 조용히 아무 일도 안 일어난다
func test_the_slot_ids_match_the_engine() -> void:
	var ids: Array = []
	for s in TrainingVm.SLOTS:
		ids.append(String(s["id"]))
	assert_array(ids).is_equal(["primary", "secondary", "secondary2"])


func test_three_slots_are_shown() -> void:
	var s: TrainingScreen = await _mount(_state())
	assert_int(s.get_node("Pad/Center/Col/Slots").get_child_count()).is_equal(3)


## ⚠ **다시 그릴 때 옛 줄을 지운다.** 안 지우면 누를 때마다 세 줄씩 쌓인다
func test_redrawing_does_not_stack_rows() -> void:
	var s: TrainingScreen = await _mount(_state())
	s._on_slot("primary")
	s._on_slot("primary")
	await await_idle_frame()
	assert_int(s.get_node("Pad/Center/Col/Slots").get_child_count()).is_equal(3)


func test_an_empty_slot_says_so() -> void:
	var s: TrainingScreen = await _mount(_state())
	assert_array(_texts(s)).contains(["비움"])
	# 빈 슬롯에는 비우기 버튼이 없다 — 지울 게 없는데 버튼이 있으면 헷갈린다
	assert_int(s.get_node("Pad/Center/Col/Slots").get_child(0).get_child_count()
		).override_failure_message("빈 슬롯에 비우기가 붙었다").is_equal(2)


func test_a_filled_slot_shows_its_program() -> void:
	var s: TrainingScreen = await _mount(_state({"training_plan": {"primary": "TRN_VEL"}}))
	assert_array(_texts(s)).contains(["구속 훈련"])
	# 채운 슬롯에만 비우기가 붙는다
	assert_int(s.get_node("Pad/Center/Col/Slots").get_child(0).get_child_count()).is_equal(3)
	assert_int(s.get_node("Pad/Center/Col/Slots").get_child(1).get_child_count()).is_equal(2)


# ── 고르기 ────────────────────────────────────────────────────

## 슬롯을 눌러야 목록이 뜬다 — 늘 띄우면 화면이 시끄럽다
func test_options_appear_after_picking_a_slot() -> void:
	var s: TrainingScreen = await _mount(_state())
	assert_array(_texts(s)).contains(["슬롯을 눌러 훈련을 고릅니다"])

	s._on_slot("primary")
	await await_idle_frame()
	assert_str(s.filling_slot()).is_equal("primary")
	assert_array(_texts(s)).contains(["구속 훈련 — 구속, 스태미나  (피로 +5.5 · 컨디션 -6.0)"])

	# 같은 슬롯을 다시 누르면 접힌다 — 안 접히면 나갈 길이 없다
	s._on_slot("primary")
	await await_idle_frame()
	assert_str(s.filling_slot()).override_failure_message("다시 눌러도 안 접힌다").is_empty()
	assert_array(_texts(s)).contains(["슬롯을 눌러 훈련을 고릅니다"])


## ⚠ **투수에게 타격 훈련이 뜨면 안 된다.** `both`는 누구나 한다
func test_only_my_kind_of_training_is_offered() -> void:
	var s: TrainingScreen = await _mount(_state())
	s._on_slot("primary")
	await await_idle_frame()

	var t: PackedStringArray = _texts(s.get_node("Pad/Center/Col/Options"))
	for x in t:
		assert_str(x).not_contains("타격 훈련")
	# 공용(체력·회복)은 뜬다
	var joined: String = " ".join(t)
	assert_str(joined).contains("체력")


## ⚠ **고른 슬롯을 화면이 들고 있지 않는다.** 상태가 들고, 화면은 신호만
## 보낸다 — 진행 뒤 새 사전이 오면서 초기화되는 자리다
func test_picking_a_program_emits_a_signal() -> void:
	var s: TrainingScreen = await _mount(_state())
	var got: Array = []
	s.slot_changed.connect(func(p: Dictionary) -> void: got.append(p))

	s._on_slot("secondary")
	await await_idle_frame()
	(s.get_node("Pad/Center/Col/Options").get_child(0) as Button).pressed.emit()
	await await_idle_frame()

	assert_int(got.size()).is_equal(1)
	assert_str(String(got[0]["slot_id"])).is_equal("secondary")
	assert_str(String(got[0]["program_id"])).is_not_empty()
	# 고르고 나면 목록을 접는다 — 열린 채로 두면 두 번 고른 줄 안다
	assert_str(s.filling_slot()).override_failure_message(
		"고른 뒤에도 목록이 열려 있다").is_empty()


func test_clearing_a_slot_emits_an_empty_program() -> void:
	var s: TrainingScreen = await _mount(_state({"training_plan": {"primary": "TRN_VEL"}}))
	var got: Array = []
	s.slot_changed.connect(func(p: Dictionary) -> void: got.append(p))

	# 슬롯 줄의 마지막 버튼이 "비움"이다
	var row: Node = s.get_node("Pad/Center/Col/Slots").get_child(0)
	(row.get_child(row.get_child_count() - 1) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([{"slot_id": "primary", "program_id": ""}])


# ── 미리보기 ──────────────────────────────────────────────────

func test_it_shows_the_current_state() -> void:
	var s: TrainingScreen = await _mount(_state())
	assert_array(_texts(s)).contains(["피로 20 (괜찮음) · 컨디션 90"])


## ⚠ **다음 주 예상이 화면에 있어야 한다.** 없으면 벼랑을 넘고 나서 안다
func test_it_shows_next_week() -> void:
	var s: TrainingScreen = await _mount(_state())
	assert_array(_texts(s)).contains(["다음 주 피로 15 (괜찮음) · 컨디션 95"])


## 훈련을 넣으면 다음 주 예상이 나빠진다 — 공짜로 크면 고를 이유가 없다
func test_a_plan_costs_something() -> void:
	var s: TrainingScreen = await _mount(_state({"training_plan": {
		"primary": "TRN_VEL", "secondary": "TRN_STAMINA"}}))

	# 빈 계획은 자동 회복만: 피로 −5.0. 계획을 넣으면 그보다 나빠진다
	assert_array(_texts(await _mount(_state()))).contains(["이번 주 피로 -5.0 · 컨디션 +5.0"])
	assert_array(_texts(s)).contains(["이번 주 피로 +3.0 · 컨디션 -3.5"])


## ⚠ **다음 주에 구간이 나빠지면 미리 말한다.** 지금 구간만 보면
## 벼랑 바로 앞에서 아무 경고가 없다
func test_it_warns_before_the_cliff() -> void:
	# 피로 68 — 지금은 "괜찮음"이지만 무거운 훈련 둘이 70을 넘긴다
	var vm: Dictionary = TrainingVm.build(_state({
		"protagonist": {"id": "ME", "player_type": "pitcher",
			"fatigue": 68.0, "condition": 90.0},
		"training_plan": {"primary": "TRN_VEL", "secondary": "TRN_STAMINA"}}))
	assert_bool(vm["is_tired"]).override_failure_message(
		"아직 지치지 않았는데 지쳤다고 한다").is_false()
	assert_bool(vm["warns"]).override_failure_message(
		"다음 주 %s인데 경고가 없다" % vm["projected_label"]).is_true()


## 이미 지쳐 있으면 그 자체를 알린다
func test_a_tired_player_is_flagged() -> void:
	var vm: Dictionary = TrainingVm.build(_state({
		"protagonist": {"id": "ME", "player_type": "pitcher",
			"fatigue": 85.0, "condition": 60.0}}))
	assert_bool(vm["is_tired"]).is_true()
	assert_str(String(vm["fatigue_label"])).contains("매우 피곤")


# ── 계산을 갖지 않는가 ────────────────────────────────────────

func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/training_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 프로그램 목록도 슬롯 이름도 화면이 안 갖는다
	assert_str(src).not_contains("TRN_")
	assert_str(src).not_contains("\"primary\"")


func test_the_done_button_emits() -> void:
	var s: TrainingScreen = await _mount(_state())
	var got: Array = []
	s.done_requested.connect(func() -> void: got.append(true))
	(s.get_node("Pad/Center/Col/Row/Done") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([true])
