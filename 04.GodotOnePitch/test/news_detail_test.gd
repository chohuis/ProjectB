extends GdUnitTestSuite

## 소식 상세 — 🔴 **04는 본문을 어디에도 안 그렸다.**
##
## `news_vm.build`가 `preview`만 싣고 `body`는 화면까지 넘어가지도 않았다.
## 그런데 **`sim/` 여덟 파일 열여섯 자리가 여러 줄 본문을 쓴다** —
## `digest` · `coach_report` · `body_report` · `contract_decision` ·
## `military` · `national_runner` · `retirement` · `tournament_news`.
##
## 🔴 **전부 묻혀 있었다.** 지난 세션에 넣은 체육부대 후보 30인 명단
## (`Military.send_sports_candidates`)도 서른세 줄을 쓰고 아무도 못 읽었다.
## **02는 목록에서 누르면 본문이 열린다**(`NewsPage.svelte:243-258`).
##
## ⚠ **"엔진이 돈다"와 "화면이 있다"는 다른 질문이다.** 여기가 그 예다


func _msg(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "m1", "category": "news", "sender": "스포츠조선",
		"subject": "제목", "preview": "미리보기", "body": "첫 줄\n둘째 줄",
		"day": 10, "read": false, "decision": null}
	d.merge(o, true)
	return d


func _state(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"season_year": 2027, "mailbox": [_msg()]}
	d.merge(o, true)
	return d


# ── 목록이 본문을 들고 온다 ───────────────────────────────────────

## 🔴 **여기가 요점이다.** 본문이 vm까지 안 오면 화면이 그릴 수가 없다
func test_줄이_본문을_싣는다() -> void:
	var vm: Dictionary = NewsVm.build(_state())
	var rows: Array = vm.get("rows", [])
	assert_int(rows.size()).is_equal(1)
	assert_str(String(rows[0].get("body", ""))).override_failure_message(
		"목록 줄에 본문이 없다 — 열어도 그릴 게 없다").is_equal("첫 줄\n둘째 줄")


## 본문이 없는 소식도 있다 — 그때 미리보기로 때우지 않는다.
##
## ⚠ **빈칸을 미리보기로 채우면 "본문이 있다"와 "없다"를 못 가른다**
##
## ⚠ **`body`를 빈 문자열로 넣은 픽스처로는 안 잡힌다** — 키가 있으면
## 기본값이 안 쓰인다. **키를 아예 지운 소식**으로 재야 한다(변이 0/1이었다)
func test_본문이_없으면_빈다() -> void:
	var m: Dictionary = _msg()
	m.erase("body")
	assert_str(String(NewsVm.build(_state({"mailbox": [m]}))["rows"][0] \
		.get("body", "x"))).override_failure_message(
		"본문이 없는 소식을 미리보기로 때웠다").is_equal("")


# ── 열고 닫기 ─────────────────────────────────────────────────────

func test_열면_상세가_나온다() -> void:
	var s: Dictionary = _state({"news_open_id": "m1"})
	var d: Dictionary = NewsVm.build(s).get("detail", {})
	assert_bool(d.is_empty()).override_failure_message(
		"열었는데 상세가 비었다").is_false()
	assert_str(String(d.get("body", ""))).is_equal("첫 줄\n둘째 줄")
	assert_str(String(d.get("subject", ""))).is_equal("제목")
	assert_str(String(d.get("sender", ""))).is_equal("스포츠조선")


func test_안_열면_상세가_없다() -> void:
	assert_bool(NewsVm.build(_state()).get("detail", {}).is_empty()) \
		.override_failure_message("아무것도 안 눌렀는데 상세가 떠 있다").is_true()


## ⚠ **"안 열었다"를 빈 문자열로 나타내니 id 없는 소식이 걸린다.**
##
## `news_open_id`가 없으면 `""`인데 소식 id도 `m.get("id", "")`이라 `""`가
## 될 수 있다 — 앞의 가드를 빼면 **아무것도 안 눌렀는데 그 소식이 펼쳐진다.**
## 변이로 확인했다(가드를 지워도 다른 검사는 다 통과했다)
func test_id_없는_소식이_저절로_안_열린다() -> void:
	var m: Dictionary = _msg({"subject": "id가 없다"})
	m.erase("id")
	assert_bool(NewsVm.build(_state({"mailbox": [m]})).get("detail", {}).is_empty()) \
		.override_failure_message(
			"아무것도 안 눌렀는데 id 없는 소식이 펼쳐졌다").is_true()


## ⚠ **없는 id를 가리키면 조용히 빈 상세를 띄우지 않는다** — 지워진 소식을
## 가리킨 채로 남으면 화면이 빈 껍데기가 된다
func test_없는_id면_상세가_없다() -> void:
	assert_bool(NewsVm.build(_state({"news_open_id": "없다"})) \
		.get("detail", {}).is_empty()).is_true()


## 상세는 **거른 목록이 아니라 소식함 전체**에서 찾는다.
##
## ⚠ 거른 목록에서 찾으면 "뉴스"를 열어 둔 채 거르개를 "시스템"으로
## 바꾸는 순간 **읽던 글이 사라진다**
func test_거르개와_무관하게_열린다() -> void:
	var s: Dictionary = _state({"news_open_id": "m1", "news_filter": "system"})
	assert_bool(NewsVm.build(s).get("detail", {}).is_empty()) \
		.override_failure_message(
			"거르개를 바꾸니 읽던 소식이 사라졌다").is_false()


## ⚠ **상세에서도 답할 수 있어야 한다.** 목록으로 나가야만 답할 수 있으면
## 열어 본 사람이 길을 잃는다 — 04는 소식 선택지가 **답하는 유일한 입구**다
## (코치 리포트는 날을 안 막아 자동 진행이 볼 일이 없다)
func _ask() -> Dictionary:
	# ⚠ **`options`가 아니라 `choices`다.** 처음에 지어냈다가 틀렸다
	return _msg({"decision": {"prompt": "무엇을 잡을까",
		"choices": [{"id": "cmd", "label": "제구"}, {"id": "vel", "label": "구속"}],
		"selected": null}})


func test_상세에서도_답할_수_있다() -> void:
	var s: Dictionary = _state({"news_open_id": "m1", "mailbox": [_ask()]})
	var d: Dictionary = NewsVm.build(s).get("detail", {})
	assert_bool(d.get("pending", false)).override_failure_message(
		"상세가 미결정을 모른다").is_true()
	assert_int(int(d.get("choices", []).size())).override_failure_message(
		"상세에 선택지가 없다 — 열어 본 사람은 답할 방법이 없다").is_equal(2)


## 화면에도 실제로 버튼이 서야 한다
func test_상세_화면에_선택지_버튼이_선다() -> void:
	var s: MainScreen = await _mount({
		"news_open_id": "m1", "mailbox": [_ask()]})
	var out: Array = []
	_texts(s, out)
	var joined: String = "\n".join(PackedStringArray(out))
	assert_int(joined.find("제구")).override_failure_message(
		"상세에 선택지 버튼이 없다").is_greater(-1)


# ── 화면 ──────────────────────────────────────────────────────────

## ⚠ **API 이름을 지어내지 마라.** 처음에 `render()`로 썼는데 없는 함수였다 —
## 진짜는 `set_view_model` + `MainVm.build`다(`main_screen_test.gd:22`)
func _mount(over: Dictionary = {}) -> MainScreen:
	var st: Dictionary = {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {"condition": 80.0, "injury": null,
			"eligibility_blocked": false, "retired": false,
			"team_name": "제주 애월고", "name": "김한결"},
		"schedule": [], "pending": [], "mailbox": [_msg()],
	}
	st.merge(over, true)
	var s: MainScreen = preload("res://ui/screens/main_screen.tscn").instantiate()
	s.set_view_model(MainVm.build(st))
	add_child(s)
	await await_idle_frame()
	s.show_tab("news")
	await await_idle_frame()
	return s


func _texts(n: Node, out: Array) -> void:
	if n is Label:
		out.append((n as Label).text)
	if n is Button:
		out.append((n as Button).text)
	for c in n.get_children():
		_texts(c, out)


## 🔴 **본문이 실제로 글자로 찍히나.** vm까지만 오고 안 그리면 같은 결함이다
func test_화면이_본문을_그린다() -> void:
	var s: MainScreen = await _mount({"news_open_id": "m1"})
	var out: Array = []
	_texts(s, out)
	var joined: String = "\n".join(PackedStringArray(out))
	assert_int(joined.find("둘째 줄")).override_failure_message(
		"본문 둘째 줄이 화면에 없다 — 열어도 안 보인다").is_greater(-1)


## 여러 줄이 **줄째로** 보여야 한다 — 한 줄로 뭉치면 명단이 못 읽힌다
func test_여러_줄이_줄째로_나온다() -> void:
	var body: String = ""
	for i in 30:
		body += "%d위  선수%d  OVR %d\n" % [i + 1, i, 90 - i]
	var s: MainScreen = await _mount({
		"news_open_id": "m1", "mailbox": [_msg({"body": body})]})

	# ⚠ **글자가 다 있는지로만 재면 안 된다.** 본문을 통째로 한 `Label`에
	# 넣어도 글자는 다 있어서 **변이가 살아남았다**(0/2).
	# **줄이 줄로 서 있는지**를 본다
	var bx: VBoxContainer = _find_body(s)
	assert_object(bx).override_failure_message("본문 상자가 없다").is_not_null()
	assert_int(bx.get_child_count()).override_failure_message(
		"본문 %d줄인데 화면에 %d줄이다 — 뭉쳤거나 잘렸다"
		% [body.split("\n").size(), bx.get_child_count()]) \
		.is_equal(body.split("\n").size())
	assert_str((bx.get_child(29) as Label).text).override_failure_message(
		"서른째 줄이 제 자리에 없다").is_equal("30위  선수29  OVR 61")


## ⚠ **빈 줄도 자리를 남겨야 한다.** 빈 `Label`은 높이가 0이라 사라지고,
## 그러면 문단 사이가 붙어 명단이 안 읽힌다. 변이로 잡힌 자리다
func test_빈_줄도_자리를_남긴다() -> void:
	var s: MainScreen = await _mount({"news_open_id": "m1",
		"mailbox": [_msg({"body": "머리\n\n본문"})]})
	var bx: VBoxContainer = _find_body(s)
	assert_int(bx.get_child_count()).is_equal(3)
	assert_str((bx.get_child(1) as Label).text).override_failure_message(
		"빈 줄이 높이 0으로 사라진다 — 문단이 붙는다").is_equal(" ")


func _find_body(n: Node) -> VBoxContainer:
	if n.name == "NewsBody":
		return n as VBoxContainer
	for c in n.get_children():
		var got: VBoxContainer = _find_body(c)
		if got != null:
			return got
	return null


## 목록으로 돌아가는 길이 있어야 한다 — 없으면 갇힌다
func test_목록으로_돌아가는_버튼이_있다() -> void:
	var s: MainScreen = await _mount({"news_open_id": "m1"})
	var got: Array = []
	s.news_closed.connect(func() -> void: got.append(true))
	var back: Button = null
	var stack: Array = [s]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is Button and String((n as Button).text).contains("목록"):
			back = n
		for c in n.get_children():
			stack.append(c)
	assert_object(back).override_failure_message(
		"목록으로 돌아가는 버튼이 없다 — 상세에 갇힌다").is_not_null()
	back.pressed.emit()
	await get_tree().process_frame
	assert_int(got.size()).is_greater(0)


## 목록에서 줄을 누르면 열자는 신호가 나가나
func test_줄을_누르면_신호가_나간다() -> void:
	var s: MainScreen = await _mount()
	var got: Array = []
	s.news_opened.connect(func(id: String) -> void: got.append(id))
	var stack: Array = [s]
	var hit: Button = null
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is Button and String((n as Button).text).contains("제목"):
			hit = n
		for c in n.get_children():
			stack.append(c)
	assert_object(hit).override_failure_message(
		"목록 줄을 누를 수가 없다 — 본문을 영영 못 연다").is_not_null()
	hit.pressed.emit()
	await get_tree().process_frame
	assert_array(got).is_equal(["m1"])


# ── 배선 ──────────────────────────────────────────────────────────

## ⚠ **화면이 신호만 내고 아무도 안 받으면 같은 결함이다**(`retirement_ask` 선례)
func test_앱이_받는다() -> void:
	var src := CodeText.of("res://ui/app_root.gd")
	assert_int(src.find("news_opened")).override_failure_message(
		"소식을 여는 신호를 아무도 안 받는다").is_greater(-1)
	assert_int(src.find("news_closed")).override_failure_message(
		"소식을 닫는 신호를 아무도 안 받는다").is_greater(-1)


## 열면 읽음으로 바뀌어야 한다 — 02도 연 글은 읽음이다
func test_열면_읽음이_된다() -> void:
	var st: Dictionary = {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {"name": "김한결", "team_name": "제주 애월고",
			"team_id": "TEAM_A", "condition": 80.0, "fatigue": 20.0,
			"injury": null, "eligibility_blocked": false, "retired": false,
			"age": 17, "diligence": 60.0,
			"pitching": {"velocity": 70.0, "control": 68.0, "stamina": 66.0}},
		"schedule": [], "pending": [], "mailbox": [_msg()],
	}
	var root: AppRoot = preload("res://ui/app_root.tscn").instantiate()
	root.set_state(st)
	add_child(root)
	await await_idle_frame()
	root.screen().news_opened.emit("m1")
	await await_idle_frame()
	assert_bool(bool(root.state()["mailbox"][0].get("read", false))) \
		.override_failure_message("열었는데 안읽음으로 남는다").is_true()
	assert_str(String(root.state().get("news_open_id", ""))) \
		.override_failure_message("연 소식을 상태가 안 들고 있다") \
		.is_equal("m1")

	# 닫으면 지워야 한다 — 안 지우면 다음에 소식함을 열 때 그 글이 펼쳐진다
	root.screen().news_closed.emit()
	await await_idle_frame()
	assert_bool(root.state().has("news_open_id")).override_failure_message(
		"닫았는데 상태에 남아 있다").is_false()
