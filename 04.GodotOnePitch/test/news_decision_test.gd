extends GdUnitTestSuite

## 소식 화면에서 답하기 — F-8b.
##
## ⚠ **F-8로 선택지가 든 소식이 생겼는데 답할 자리가 없었다.**
## `NewsVm`이 `pending`이라고 표시만 하고 **선택지 자체를 안 실었다** —
## 화면엔 "답해야 하는 소식이 있다"만 뜨고 누를 게 없다.
##
## ⚠ **자동 진행도 못 답한다.** 코치 리포트는 날을 안 막으므로
## (`blocking: false`) `AutoAdvance`가 볼 일이 없다 — **여기가 유일한 입구다.**


const ROOT := preload("res://ui/app_root.tscn")


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 21, "season_days": 350, "season_year": 2027,
		"protagonist": {
			"id": "ME", "name": "김한결", "team_id": "TEAM_A",
			"team_name": "제주 애월고", "career_stage": "highschool",
			"condition": 70.0, "fatigue": 70.0, "morale": 55.0,
			"injury": null, "eligibility_blocked": false, "retired": false,
			"age": 17, "diligence": 60.0,
			"pitching": {"velocity": 70.0, "control": 68.0, "stamina": 66.0,
				"command": 62.0},
		},
		"schedule": [], "pending": [], "mailbox": [],
		"training_plan": {}, "training_programs": [], "season_stats": {},
	}
	s.merge(over, true)
	CoachReport.push(s, 3, 21)
	return s


# ── 사전이 선택지를 싣는가 ────────────────────────────────────

## ⚠ **`pending` 표시만으론 못 누른다.** 화면이 그릴 것이 있어야 한다
func test_the_row_carries_the_choices() -> void:
	var vm: Dictionary = NewsVm.build(_state())
	var row: Dictionary = vm["rows"][0]
	assert_bool(row["pending"]).is_true()
	assert_str(String(row.get("prompt", ""))).override_failure_message(
		"물음이 안 실렸다").is_not_empty()
	assert_int((row.get("choices", []) as Array).size()).override_failure_message(
		"선택지가 안 실렸다 — 화면이 그릴 게 없다").is_equal(2)
	assert_str(String(row["choices"][0].get("label", ""))).is_not_empty()


## 답한 소식은 고른 것을 보여준다 — 뭘 골랐는지 나중에 알 수 있어야 한다
func test_a_decided_row_shows_what_was_chosen() -> void:
	var s: Dictionary = _state()
	CoachReport.apply(s, String(s["mailbox"][0]["id"]), "rest")
	var row: Dictionary = NewsVm.build(s)["rows"][0]
	assert_bool(row["decided"]).is_true()
	assert_str(String(row.get("selected_label", ""))).override_failure_message(
		"고른 것이 안 보인다").is_not_empty()


## 선택지가 없는 소식은 빈 목록이다 — 없는 버튼을 그리면 안 된다
func test_a_plain_message_has_no_choices() -> void:
	var s: Dictionary = _state()
	s["mailbox"].append({"id": "plain", "category": "news", "sender": "구단",
		"subject": "안내", "preview": "", "body": "", "day": 20, "read": true,
		"decision": null})
	for row in NewsVm.build(s)["rows"]:
		if String(row["id"]) == "plain":
			assert_array(row.get("choices", [])).is_empty()
			return
	fail("일반 소식이 목록에 없다")


# ── 화면에 버튼이 뜨는가 ──────────────────────────────────────

func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _mount(s: Dictionary) -> AppRoot:
	var r: AppRoot = ROOT.instantiate()
	r.set_state(s)
	add_child(r)
	await await_idle_frame()
	r.screen().show_tab("news")
	await await_idle_frame()
	return r


func test_the_screen_shows_the_choice_buttons() -> void:
	var r: AppRoot = await _mount(_state())
	var joined: String = " ".join(_texts(r.screen()))
	assert_str(joined).contains("코치 리포트")
	assert_str(joined).override_failure_message(
		"소식에 선택지 버튼이 없다 — 답할 방법이 없다").contains("회복에 집중한다")


## ⚠ **누르면 실제로 답이 되고 효과가 걸린다.** 화면이 상태를 직접 고치면
## 자동 진행이 고른 답과 다른 일이 벌어진다
func test_pressing_a_choice_answers_and_applies() -> void:
	var s: Dictionary = _state()
	var r: AppRoot = await _mount(s)
	var before: float = float(r.state()["protagonist"]["fatigue"])

	r.screen().news_decision_picked.emit(
		String(r.state()["mailbox"][0]["id"]), "rest")
	await await_idle_frame()

	assert_str(String(r.state()["mailbox"][0]["decision"]["selected"])
		).override_failure_message("눌렀는데 답이 안 남았다").is_equal("rest")
	assert_float(float(r.state()["protagonist"]["fatigue"])
		).override_failure_message(
		"답했는데 피로가 안 움직였다 (%f)" % before).is_equal(before - 8.0)


func _buttons(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_buttons(c, out)
	return out


## ⚠ **답한 뒤엔 누를 수 있는 버튼이 사라진다.** 두 번 누르면 회복이
## 공짜가 된다.
##
## ⚠ **글자로만 보면 안 된다.** 답한 소식은 "→ 회복에 집중한다"로 고른
## 것을 보여주므로 같은 글자가 라벨로 남는다 — **버튼인지를 봐야 한다**
func test_the_buttons_disappear_after_answering() -> void:
	var s: Dictionary = _state()
	var r: AppRoot = await _mount(s)
	assert_str(" ".join(_buttons(r.screen()))).contains("회복에 집중한다")

	r.screen().news_decision_picked.emit(
		String(r.state()["mailbox"][0]["id"]), "rest")
	# `queue_free`는 프레임 뒤에 지워진다 — 한 프레임으로는 옛 버튼이 남는다
	await await_idle_frame()
	await await_idle_frame()

	assert_str(" ".join(_buttons(r.screen()))).override_failure_message(
		"답했는데 누를 수 있는 선택지가 남았다").not_contains("회복에 집중한다")
	# 고른 것은 글자로 남는다 — 나중에 뭘 골랐는지 알 수 있어야 한다
	assert_str(" ".join(_texts(r.screen()))).contains("회복에 집중한다")
