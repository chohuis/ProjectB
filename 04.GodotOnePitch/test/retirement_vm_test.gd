extends GdUnitTestSuite

## 은퇴 결정 · 인생 기록 — C-6.
##
## ⚠ **`retirement_ask`를 밀어넣는 코드는 있는데 받는 화면이 없었다.**
## 02가 그랬고 04도 그대로였다 — 대기줄에 올라간 채 아무도 안 받아서
## 자동 진행이 멈춘 채 안 풀리고, `Retirement.retire`도 호출부가 없어
## **커리어가 영영 안 끝났다.**

const SCREEN := preload("res://ui/screens/retirement_screen.tscn")
const APP := preload("res://ui/app_root.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		if (node as Button).visible:
			out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _joined(node: Node) -> String:
	return "\n".join(_texts(node))


func _state(reason: String = "", p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "age": 34, "team_id": "T1",
		"league_id": "LEAGUE_KBL", "career_history": [], "career_events": [],
	}
	p.merge(p_over, true)
	var s: Dictionary = {"season_year": 2038, "day": 350, "protagonist": p,
		"pending": [], "mailbox": [], "world": {}}
	if not reason.is_empty():
		Pending.push_once(s, {"type": "retirement_ask", "reason": reason,
			"label": String(Retirement.LABELS.get(reason, "")), "day": 350})
	return s


func _year(year: int, w: int = 3, k: float = 40.0,
		highlights: Array = []) -> Dictionary:
	return {"year": year, "team_id": "T1", "stat_line": "%d승" % w,
		"stats": {"type": "pitcher", "g": 20, "w": w, "sv": 1, "k": k},
		"highlights": highlights}


# ── 물어보는가 ────────────────────────────────────────────────

func test_no_question_when_nothing_was_asked() -> void:
	assert_bool(RetirementVm.is_asking(_state())).is_false()
	assert_bool(RetirementVm.build_ask(_state())["asking"]).is_false()


func test_it_finds_the_question() -> void:
	var s: Dictionary = _state(Retirement.REASON_DECLINE)
	assert_bool(RetirementVm.is_asking(s)).is_true()
	assert_str(String(RetirementVm.build_ask(s)["reason"])).is_equal("decline")


## ⚠ **사유에 따라 선택지가 다르다.** 부상(재기 불가)은 거절이 없다 —
## 설계가 "부상 강제"로 정했다
func test_an_injury_leaves_no_choice() -> void:
	var a: Dictionary = RetirementVm.build_ask(_state(Retirement.REASON_INJURY))
	assert_bool(a["forced"]).is_true()
	assert_bool(a["can_decline"]).override_failure_message(
		"재기 불가 판정인데 거절할 수 있다").is_false()
	assert_str(String(a["title"])).is_equal("재기 불가 판정")


func test_a_decline_can_be_refused() -> void:
	var a: Dictionary = RetirementVm.build_ask(_state(Retirement.REASON_DECLINE))
	assert_bool(a["forced"]).is_false()
	assert_bool(a["can_decline"]).is_true()
	assert_str(String(a["title"])).is_equal("은퇴 권고")


func test_the_question_says_the_age_and_the_seasons() -> void:
	var s: Dictionary = _state(Retirement.REASON_DECLINE,
		{"career_history": [_year(2036), _year(2037)]})
	var body: String = String(RetirementVm.build_ask(s)["body"])
	assert_str(body).contains("34세")
	assert_str(body).contains("2시즌")


## ⚠ **얼마나 급한지는 압박 판정이 안다** — 화면이 다시 재지 않는다.
## 문구가 그 값을 따라가는지를 본다(늘 같은 말이면 잰 뜻이 없다)
func test_the_wording_follows_the_urgency() -> void:
	# 급한 쪽 — 나이 하드(+40) · 가파른 하락(+20) · 과지급(+15)
	var urgent: Dictionary = {"age": 41, "salary": 200000,
		"pitching": {"ovr": 45.0}, "career_records": [
			{"ovr": 70.0}, {"ovr": 60.0}]}
	for p_over in [urgent, {"age": 27, "salary": 3000,
			"pitching": {"ovr": 82.0}}]:
		var s: Dictionary = _state(Retirement.REASON_DECLINE, p_over)
		var urgency: float = float(
			Retirement.pressure_of(s).get("urgency", 0.0))
		var body: String = String(RetirementVm.build_ask(s)["body"])
		assert_bool(body.contains("거의 없어")).override_failure_message(
			"급함 %.2f인데 문구가 안 따라간다: %s" % [urgency, body]
			).is_equal(urgency >= RetirementVm.HOPELESS)


## ⚠ **다른 결정이 앞에 있어도 은퇴 질문을 찾는다** — 그리고 다른 결정을
## 은퇴로 읽지 않는다. 대기줄에는 열 종류가 쌓인다
func test_it_does_not_mistake_another_decision_for_retirement() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "salary_negotiation", "team_id": "T1"})
	assert_bool(RetirementVm.is_asking(s)).override_failure_message(
		"연봉 협상을 은퇴 질문으로 읽는다").is_false()

	Pending.push_once(s, {"type": "retirement_ask",
		"reason": Retirement.REASON_INJURY, "day": 350})
	assert_bool(RetirementVm.is_asking(s)).is_true()
	assert_str(String(RetirementVm.ask_of(s)["reason"])).override_failure_message(
		"앞에 있는 다른 결정을 집었다").is_equal("injury")


## 같은 해가 두 줄이어도 한 시즌이다 — 줄 수로 세면 안 된다
func test_two_rows_in_one_year_are_one_season() -> void:
	# ⚠ **두 줄을 다르게 만든다** — 내용이 같으면 사전 키로 세도 하나라서
	# "줄 수로 센다"는 실수가 안 걸린다
	var s: Dictionary = _state("", {"career_history": [
		_year(2036, 3), _year(2036, 7)]})
	var totals: Dictionary = {}
	for t in RetirementVm.build_summary(s)["totals"]:
		totals[String(t["label"])] = String(t["value"])
	assert_str(String(totals["통산 시즌"])).override_failure_message(
		"같은 해가 두 시즌으로 세어졌다").is_equal("1시즌")


# ── 인생 기록 ─────────────────────────────────────────────────

## ⚠ **통산의 정본은 연도 기록이다** — C-5에서 숫자를 남기게 고쳤다
func test_the_summary_adds_up_the_career() -> void:
	var s: Dictionary = _state("", {"career_history": [
		_year(2036, 3, 40.0), _year(2037, 5, 60.0)]})
	var totals: Dictionary = {}
	for t in RetirementVm.build_summary(s)["totals"]:
		totals[String(t["label"])] = String(t["value"])
	assert_str(String(totals["통산 시즌"])).is_equal("2시즌")
	assert_str(String(totals["승"])).is_equal("8승")
	assert_str(String(totals["탈삼진"])).is_equal("100K")


## 아직 현역이면 그렇게 말한다 — "나" 탭에서도 열리는 화면이다
func test_an_active_player_gets_a_summary_too() -> void:
	var sm: Dictionary = RetirementVm.build_summary(_state())
	assert_bool(sm["retired"]).is_false()
	assert_str(String(sm["closing"])).contains("현역")


func test_a_retired_player_says_when_and_why() -> void:
	var s: Dictionary = _state("", {"retired": true,
		"retirement": {"year": 2038, "reason": "decline",
			"label": "노쇠·계약 불발"}})
	var sm: Dictionary = RetirementVm.build_summary(s)
	assert_bool(sm["retired"]).is_true()
	assert_str(String(sm["closing"])).contains("2038년")
	assert_str(String(sm["closing"])).contains("노쇠")


## **최근이 위다** — 마지막 시즌이 제일 궁금하다
func test_the_newest_year_is_first() -> void:
	var s: Dictionary = _state("", {"career_history": [
		_year(2036), _year(2037)]})
	assert_int(int(RetirementVm.build_summary(s)["years"][0]["year"])
		).is_equal(2037)


func test_awards_are_gathered_from_the_years() -> void:
	var s: Dictionary = _state("", {"career_history": [
		_year(2036, 3, 40.0, ["다승왕"])]})
	var awards: Array = RetirementVm.build_summary(s)["awards"]
	assert_int(awards.size()).is_equal(1)
	assert_str(String(awards[0]["name"])).is_equal("다승왕")


func test_career_events_are_listed() -> void:
	var s: Dictionary = _state("", {"career_events": [
		{"year": 2030, "type": "drafted", "detail": "3라운드 지명"}]})
	assert_str(String(RetirementVm.build_summary(s)["events"][0]["detail"])
		).contains("3라운드")


func test_an_empty_career_says_so() -> void:
	assert_str(String(RetirementVm.build_summary(_state())["empty"])
		).is_not_empty()


# ── 화면 ──────────────────────────────────────────────────────

func _open(s: Dictionary) -> RetirementScreen:
	var screen: RetirementScreen = SCREEN.instantiate()
	screen.set_ask(RetirementVm.build_ask(s), RetirementVm.build_summary(s))
	add_child(screen)
	await await_idle_frame()
	return screen


func test_the_screen_asks() -> void:
	var text: String = _joined(await _open(_state(Retirement.REASON_DECLINE)))
	assert_str(text).contains("은퇴 권고")
	assert_str(text).contains("은퇴한다")
	assert_str(text).contains("한 해 더")


func test_a_forced_retirement_hides_the_refusal() -> void:
	var screen: RetirementScreen = await _open(
		_state(Retirement.REASON_INJURY))
	assert_bool((screen.get_node("Pad/Center/Col/Row/Decline") as Button).visible
		).override_failure_message("재기 불가인데 거절 버튼이 뜬다").is_false()


## ⚠ **은퇴를 누르면 이 화면이 결산으로 바뀐다.** "결산을 봤는가" 플래그를
## 세이브에 안 만들려는 것이다 — 그 순간이 곧 첫 관람이다
func test_retiring_turns_the_screen_into_the_summary() -> void:
	var screen: RetirementScreen = await _open(
		_state(Retirement.REASON_DECLINE))
	(screen.get_node("Pad/Center/Col/Row/Retire") as Button).pressed.emit()
	await await_idle_frame()
	await await_idle_frame()

	var text: String = _joined(screen)
	assert_str(text).contains("인생 기록")
	assert_str(text).override_failure_message(
		"결산으로 바뀌었는데 아직 은퇴를 묻고 있다").not_contains("은퇴 권고")


func test_the_summary_opens_on_its_own() -> void:
	var screen: RetirementScreen = SCREEN.instantiate()
	screen.set_summary(RetirementVm.build_summary(
		_state("", {"career_history": [_year(2036)]})))
	add_child(screen)
	await await_idle_frame()
	assert_str(_joined(screen)).contains("인생 기록")


## ⚠ **다시 열어도 줄이 안 쌓인다**
func test_reopening_does_not_pile_up_rows() -> void:
	var s: Dictionary = _state("", {"career_history": [_year(2036)]})
	var screen: RetirementScreen = await _open(s)
	var list: VBoxContainer = screen.get_node("Pad/Center/Col/Scroll/List")
	var before: int = list.get_child_count()
	screen.set_summary(RetirementVm.build_summary(s))
	await await_idle_frame()
	assert_int(list.get_child_count()).is_equal(before)


# ── 배선 ──────────────────────────────────────────────────────

func _app(s: Dictionary) -> AppRoot:
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	r._open_retirement()
	await await_idle_frame()
	return r


## ⚠ **`Retirement.retire`에 호출부가 없었다** — 커리어가 영영 안 끝났다
func test_retiring_reaches_the_state() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_DECLINE))
	r.retirement_screen().retire_requested.emit()
	await await_idle_frame()
	await await_idle_frame()

	assert_bool(r.state()["protagonist"].get("retired", false)
		).override_failure_message("은퇴를 눌렀는데 커리어가 안 끝났다").is_true()
	assert_str(String(r.state()["protagonist"]["retirement"]["reason"])
		).is_equal("decline")


## 물어본 것을 치운다 — 안 치우면 자동 진행이 계속 그 자리에서 멈춘다
func test_retiring_clears_the_question() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_DECLINE))
	r.retirement_screen().retire_requested.emit()
	await await_idle_frame()
	await await_idle_frame()
	assert_bool(RetirementVm.is_asking(r.state())).override_failure_message(
		"은퇴했는데 아직 묻고 있다").is_false()


## 한 해 더 뛰면 질문만 치우고 커리어는 이어진다
func test_keeping_playing_clears_the_question_only() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_DECLINE))
	# ⚠ **버튼을 누른다.** 신호를 직접 쏘면 화면이 자기 신호 안에서
	# 지워져 잠긴 객체가 된다 — 실제 경로는 미뤄서 보낸다
	(r.retirement_screen().get_node("Pad/Center/Col/Row/Decline") as Button
		).pressed.emit()
	await await_idle_frame()
	await await_idle_frame()

	assert_bool(RetirementVm.is_asking(r.state())).is_false()
	assert_bool(r.state()["protagonist"].get("retired", false)
		).override_failure_message("한 해 더 뛴다고 했는데 은퇴했다").is_false()


## ⚠ **은퇴가 확정된 뒤에 결산을 만든다** — 마지막 시즌과 사유가 빠진
## 채로 나오면 인생 기록이 아니다
func test_the_summary_knows_the_retirement_that_just_happened() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_INJURY))
	r.retirement_screen().retire_requested.emit()
	await await_idle_frame()
	await await_idle_frame()
	assert_str(_joined(r.retirement_screen())).override_failure_message(
		"방금 은퇴했는데 결산이 아직 현역이라고 한다").contains("2038년")


## ⚠ **진행하다 물어보면 그때 뜬다.** 띄우는 자리가 없으면 자동 진행이
## "은퇴 여부 결정"에서 멈춘 채 영영 안 풀린다 — 02가 그 상태였다
func test_advancing_opens_the_question() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2038,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	Pending.push_once(s, {"type": "retirement_ask",
		"reason": Retirement.REASON_DECLINE, "day": 1})

	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	assert_object(r.retirement_screen()).is_null()

	await r.advance(1)
	await await_idle_frame()
	assert_object(r.retirement_screen()).override_failure_message(
		"물어봤는데 화면이 안 떴다 — 자동 진행이 여기서 안 풀린다").is_not_null()


## 두 번 띄우지 않는다 — 겹치면 뒤엣것만 신호가 이어진다
func test_the_screen_opens_only_once() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_DECLINE))
	r._open_retirement()
	await await_idle_frame()
	assert_int(r.find_children("*", "RetirementScreen", true, false).size()
		).override_failure_message("은퇴 화면이 두 개 떴다").is_equal(1)


## ⚠ **사유를 그대로 남긴다** — 부상으로 그만뒀는데 기록이 노쇠라고
## 하면 인생 기록이 거짓말이 된다
func test_the_recorded_reason_matches_the_question() -> void:
	var r: AppRoot = await _app(_state(Retirement.REASON_INJURY))
	r.retirement_screen().retire_requested.emit()
	await await_idle_frame()
	await await_idle_frame()
	assert_str(String(r.state()["protagonist"]["retirement"]["reason"])
		).override_failure_message("부상으로 그만뒀는데 사유가 다르게 남았다"
		).is_equal("injury")


## ⚠ **은퇴 뒤에도 다시 볼 수 있어야 한다.** 은퇴하는 순간이 첫 관람이고
## 그 뒤로는 "나" 탭의 커리어가 유일한 입구다 — 없으면 결산을 한 번 보고
## 못 본다
func test_the_life_record_can_be_reopened_from_the_me_tab() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()

	r.screen()._on_tab(1)
	await await_idle_frame()
	var status: StatusScreen = r.screen().find_children(
		"*", "StatusScreen", true, false)[0]
	for i in StatusVm.TABS.size():
		if String(StatusVm.TABS[i]["id"]) == "career":
			status._on_tab(i)
	await await_idle_frame()

	var pressed: bool = false
	for b in r.find_children("*", "Button", true, false):
		if String((b as Button).text) == "인생 기록":
			(b as Button).pressed.emit()
			pressed = true
			break
	assert_bool(pressed).override_failure_message(
		"커리어 탭에 인생 기록을 여는 자리가 없다").is_true()

	await await_idle_frame()
	await await_idle_frame()
	assert_object(r.retirement_screen()).override_failure_message(
		"눌렀는데 인생 기록이 안 열렸다").is_not_null()
	assert_str(_joined(r.retirement_screen())).contains("인생 기록")


func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string(
		"res://ui/screens/retirement_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 은퇴 판정을 화면이 하지 않는다
	assert_str(src).not_contains("Retirement.")
	assert_str(src).not_contains("Pending.")
