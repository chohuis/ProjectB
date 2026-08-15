extends GdUnitTestSuite

## 결정 화면 — 대기줄에 쌓인 결정을 사람이 답하는 자리.
##
## ⚠ **열 종류가 쌓이는데 받는 화면이 은퇴 하나뿐이었다.** 나머지는
## 밀어넣는 코드만 있고 받는 자리가 없어서 `AutoAdvance`가 그 자리에서
## 안 풀린다 — 프로 커리어가 실제로 막힌다.

const SCREEN := preload("res://ui/screens/decision_screen.tscn")
const APP := preload("res://ui/app_root.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _state(p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "name": "김한결", "age": 18,
		"team_id": "T1", "league_id": "LEAGUE_HIGHSCHOOL",
		"career_history": [], "career_events": [], "money": 0}
	p.merge(p_over, true)
	return {"season_year": 2030, "day": 300, "protagonist": p,
		"pending": [], "mailbox": [], "world": {}}


func _ids(vm: Dictionary) -> Array:
	var out: Array = []
	for c in vm["choices"]:
		out.append(String(c["id"]))
	return out


# ── 무엇을 받나 ───────────────────────────────────────────────

func test_nothing_pending_means_no_question() -> void:
	assert_bool(DecisionVm.is_asking(_state())).is_false()
	assert_bool(DecisionVm.build(_state()).is_empty()).is_true()


## ⚠ **아직 화면이 없는 결정을 받았다고 하면 안 된다** — 답을 못 하는
## 화면이 뜨고 대기줄은 그대로 남는다
func test_an_unhandled_decision_is_not_claimed() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	assert_bool(DecisionVm.is_asking(s)).override_failure_message(
		"아직 안 만든 결정을 받는다고 한다").is_false()


## 받는 목록은 `AutoAdvance`가 멈추는 목록 안에 있어야 한다 —
## 멈추지도 않는 결정에 화면을 띄우면 진행이 이유 없이 끊긴다
func test_every_handled_type_is_a_stopping_one() -> void:
	for t in DecisionVm.HANDLED:
		assert_bool(AutoAdvance.is_stopping(String(t))).override_failure_message(
			"%s는 자동 진행이 안 멈추는 결정이다" % t).is_true()


## 앞에 다른 결정이 있어도 받을 수 있는 것을 찾는다
func test_it_finds_a_handled_one_behind_others() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	Pending.push_once(s, {"type": "draft_observe"})
	assert_str(String(DecisionVm.build(s)["type"])).is_equal("draft_observe")


# ── 지명 통보 ─────────────────────────────────────────────────

func _drafted(s: Dictionary) -> void:
	Pending.push_once(s, {"type": "draft_notification", "team_id": "TEAM_KBL_A",
		"league_id": "LEAGUE_KBL", "round": 2, "pick": 14,
		"signing_bonus": 8000, "salary": 3000})


func test_a_draft_notice_says_who_and_how_much() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var vm: Dictionary = DecisionVm.build(s)
	assert_str(String(vm["title"])).is_equal("지명 통보")
	assert_str(String(vm["body"])).contains("2라운드")
	assert_str(String(vm["body"])).contains("14순위")
	assert_str(String(vm["body"])).contains("8000만")


## ⚠ **거부할 수 있다.** 02는 지명 통보가 알림이라 거부가 없었고,
## 그래서 지명을 받고도 계약 없이 고교에 남는 상태가 생겼다
func test_a_draft_notice_can_be_refused() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	assert_array(_ids(DecisionVm.build(s))).contains(["accept", "reject"])


func test_accepting_a_draft_moves_the_player() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	assert_bool(DecisionVm.apply(s, "accept", 300)).is_true()
	assert_str(String(s["protagonist"]["league_id"])).is_equal("LEAGUE_KBL")
	assert_bool(DecisionVm.is_asking(s)).override_failure_message(
		"계약했는데 통보가 대기줄에 남았다").is_false()


func test_refusing_a_draft_clears_the_queue() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	DecisionVm.apply(s, "reject", 300)
	assert_bool(Pending.has(s, "draft_notification")).override_failure_message(
		"거부했는데 통보가 남았다").is_false()
	assert_str(String(s["protagonist"]["league_id"])).override_failure_message(
		"거부했는데 프로로 갔다").is_not_equal("LEAGUE_KBL")


# ── 트레이드 ──────────────────────────────────────────────────

func _traded(s: Dictionary) -> void:
	Pending.push_once(s, {"type": "trade", "to_team_id": "TEAM_KBL_B",
		"to_league_id": "LEAGUE_KBL", "reason": "선발 보강"})


## ⚠ **거부는 노트레이드 조항이 있을 때만이다** — 없으면 선택지를
## 안 만든다. 누를 수 없는 버튼을 띄우면 "왜 안 눌리지"가 된다
func test_a_trade_cannot_be_refused_without_the_clause() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_array(_ids(DecisionVm.build(s))).is_equal(["accept"])


func test_a_no_trade_clause_adds_the_refusal() -> void:
	var s: Dictionary = _state({"no_trade": true})
	_traded(s)
	assert_array(_ids(DecisionVm.build(s))).contains(["reject"])


func test_accepting_a_trade_moves_the_team() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_bool(DecisionVm.apply(s, "accept", 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).is_equal("TEAM_KBL_B")
	assert_bool(DecisionVm.is_asking(s)).is_false()


func test_a_trade_says_where_i_am_going() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_str(String(DecisionVm.build(s)["body"])).override_failure_message(
		"어디로 가는지가 안 뜬다").contains("TEAM_KBL_B")


## ⚠ **거부를 골랐는데 팀이 바뀌면 안 된다** — 고른 것과 상관없이
## 수락하면 노트레이드 조항이 뜻이 없다
func test_refusing_a_trade_keeps_the_team() -> void:
	var s: Dictionary = _state({"no_trade": true})
	_traded(s)
	assert_bool(DecisionVm.apply(s, "reject", 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"거부했는데 팀이 바뀌었다").is_equal("T1")
	assert_bool(DecisionVm.is_asking(s)).is_false()


# ── 확인만 하는 것 ────────────────────────────────────────────

## ⚠ **진로 결과를 확인하면 최종 선택으로 넘어간다** — 안 넘어가면
## 졸업반이 결과만 보고 아무 데도 못 간다
func test_confirming_the_results_moves_to_the_choice() -> void:
	var s: Dictionary = _state()
	s["career"] = {"results": {"university_passed": ["U1"],
		"independent_passed": [], "draft_eligible": true}}
	Pending.push_once(s, {"type": "career_results"})

	assert_str(String(DecisionVm.build(s)["body"])).contains("대학 합격")
	assert_bool(DecisionVm.apply(s, "ok", 300)).is_true()
	assert_bool(Pending.has(s, "career_results")).override_failure_message(
		"확인했는데 결과가 대기줄에 남았다").is_false()
	assert_bool(Pending.has(s, "career_choice")).override_failure_message(
		"결과를 확인했는데 최종 선택으로 안 넘어간다").is_true()


func test_observing_the_draft_clears_itself() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	assert_int(DecisionVm.build(s)["choices"].size()).is_equal(1)
	DecisionVm.apply(s, "ok", 300)
	assert_bool(DecisionVm.is_asking(s)).is_false()


# ── 화면 ──────────────────────────────────────────────────────

func _open(s: Dictionary) -> DecisionScreen:
	var screen: DecisionScreen = SCREEN.instantiate()
	screen.set_view_model(DecisionVm.build(s))
	add_child(screen)
	await await_idle_frame()
	return screen


func test_the_screen_shows_the_choices() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var text: String = "\n".join(_texts(await _open(s)))
	assert_str(text).contains("지명 통보")
	assert_str(text).contains("계약한다")
	assert_str(text).contains("거부한다")


## ⚠ **다시 그려도 버튼이 안 쌓인다** — 결정은 줄줄이 온다
func test_redrawing_does_not_pile_up_buttons() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var screen: DecisionScreen = await _open(s)
	var box: VBoxContainer = screen.get_node("Pad/Center/Col/Choices")
	var before: int = box.get_child_count()
	screen.set_view_model(DecisionVm.build(s))
	await await_idle_frame()
	assert_int(box.get_child_count()).is_equal(before)


func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string(
		"res://ui/screens/decision_screen.gd")
	# 배선표는 `DecisionVm.apply` 하나다
	assert_str(src).not_contains("CareerDecision")
	assert_str(src).not_contains("ContractDecision")
	assert_str(src).not_contains("Pending.")


# ── 배선 ──────────────────────────────────────────────────────

func _app(s: Dictionary) -> AppRoot:
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	r._open_decision()
	await await_idle_frame()
	return r


func _press(r: Node, needle: String) -> void:
	for b in r.find_children("*", "Button", true, false):
		if String((b as Button).text).contains(needle):
			(b as Button).pressed.emit()
			await await_idle_frame()
			await await_idle_frame()
			return
	fail("'%s' 버튼을 못 찾았다" % needle)


func test_choosing_reaches_the_state() -> void:
	var s: Dictionary = _state()
	_traded(s)
	var r: AppRoot = await _app(s)
	await _press(r, "받아들인다")
	assert_str(String(r.state()["protagonist"]["team_id"])).is_equal("TEAM_KBL_B")


## ⚠ **결정은 줄줄이 온다.** 하나 답하고 화면을 닫으면 다음 것이 대기줄에
## 남은 채로 진행이 막힌다 — 남아 있으면 그 자리에서 다음 것을 묻는다
func test_the_next_decision_takes_over_the_same_screen() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	_drafted(s)
	var r: AppRoot = await _app(s)

	await _press(r, "지켜본다")
	assert_object(r.decision_screen()).override_failure_message(
		"다음 결정이 남았는데 화면을 닫았다").is_not_null()
	assert_str("\n".join(_texts(r))).contains("지명 통보")


func test_the_screen_closes_when_the_queue_empties() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	var r: AppRoot = await _app(s)
	await _press(r, "지켜본다")
	assert_object(r.decision_screen()).override_failure_message(
		"다 답했는데 화면이 안 닫혔다").is_null()


## ⚠ **진행하다 결정이 생기면 그때 뜬다** — 띄우는 자리가 없으면
## 자동 진행이 그 자리에서 영영 안 풀린다
func test_advancing_opens_the_decision() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	Pending.push_once(s, {"type": "draft_observe"})

	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	assert_object(r.decision_screen()).is_null()

	await r.advance(1)
	await await_idle_frame()
	assert_object(r.decision_screen()).override_failure_message(
		"결정이 생겼는데 화면이 안 떴다").is_not_null()
