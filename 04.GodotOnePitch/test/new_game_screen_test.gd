extends GdUnitTestSuite

## 새 게임 화면의 방향 · 폼 · 생년월일 입력 — F-6b.
##
## ⚠ **화면에서 고른 것이 세이브까지 가는지를 본다.** ViewModel만 검사하면
## 위젯이 안 붙어 있어도 통과한다 — 지금까지 죽은 배선을 열두 개 찾았는데
## 절반이 그 모양이었다.

const NEW_GAME := preload("res://ui/screens/new_game_screen.tscn")


func _mount() -> NewGameScreen:
	var n: NewGameScreen = NEW_GAME.instantiate()
	add_child(n)
	await await_idle_frame()
	return n


func _opts(b: OptionButton) -> PackedStringArray:
	var out := PackedStringArray()
	for i in b.item_count:
		out.append(b.get_item_text(i))
	return out


func test_방향과_폼_고르는_자리가_있다() -> void:
	var n: NewGameScreen = await _mount()
	assert_array(_opts(n._hand)).is_equal(["우투", "좌투"])
	assert_array(_opts(n._form)).is_equal(["오버핸드", "사이드암", "언더스로"])


func test_고른_폼의_설명이_바뀐다() -> void:
	var n: NewGameScreen = await _mount()
	# 02 `formOptions`의 설명 그대로
	assert_str(n._form_desc.text).contains("표준 릴리스")
	n._form.selected = 2
	n._update()
	assert_str(n._form_desc.text).contains("타이밍 파괴형")


func test_달을_바꾸면_없는_날이_사라진다() -> void:
	var n: NewGameScreen = await _mount()
	n._month.selected = 0  # 1월
	n._fill_days()
	assert_int(n._day.item_count).is_equal(31)
	n._month.selected = 1  # 2월 — 2010은 평년이다
	n._fill_days()
	assert_int(n._day.item_count).is_equal(28)


## ⚠ **31일을 고른 채 2월로 옮기면 28일로 당겨져야 한다.**
## 02가 그렇게 한다 — 안 하면 2월 31일이 저장된다
func test_넘치는_날은_그_달_마지막으로_당긴다() -> void:
	var n: NewGameScreen = await _mount()
	n._month.selected = 0
	n._fill_days()
	n._day.selected = 30  # 31일
	n._month.selected = 1
	n._fill_days()
	assert_int(n._day.selected).is_equal(27)  # 28일
	assert_int(int(n.current_profile()["birth_day"])).is_equal(28)


## 배선의 끝 — 고른 것이 실제 세이브에 들어가나
func test_고른_것이_주인공에게_간다() -> void:
	var n: NewGameScreen = await _mount()
	n._name.text = "박한별"
	n._hand.selected = 1        # 좌투
	n._form.selected = 1        # 사이드암
	n._month.selected = 6       # 7월
	n._fill_days()
	n._day.selected = 8         # 9일

	var p: Dictionary = n.current_profile()
	p["seed"] = 4242
	var me: Dictionary = NewGameVm.start(p).get("protagonist", {})
	assert_str(String(me["name"])).is_equal("박한별")
	assert_str(String(me["handedness"])).is_equal("L")
	assert_str(String(me["pitching_form"])).is_equal("sidearm")
	assert_str(String(me["birthday"])).is_equal("2010-07-09")


## 화면이 만든 사전 그대로 신호가 나가나 — 두 벌이면 요약과 세이브가 갈린다
func test_시작_신호가_고른_것을_그대로_들고_간다() -> void:
	var n: NewGameScreen = await _mount()
	n._hand.selected = 1
	n._month.selected = 11
	n._fill_days()
	var got: Array = []
	n.start_requested.connect(func(profile: Dictionary) -> void: got.append(profile))
	n._on_start()
	await await_idle_frame()
	assert_int(got.size()).is_equal(1)
	assert_str(String(got[0]["handedness"])).is_equal("L")
	assert_int(int(got[0]["birth_month"])).is_equal(12)


# ── 권역 2단 ─────────────────────────────────────────────────────

## 🔴 **드롭다운 하나에 102개가 들어 있었다.** 02는 권역을 먼저 고르게 한다
func test_권역과_학교를_따로_고른다() -> void:
	var n: NewGameScreen = await _mount()
	assert_int(n._regions.item_count).override_failure_message(
		"권역 목록이 %d칸이다 — 8칸이어야 한다" % n._regions.item_count).is_equal(8)
	assert_bool(n._teams.item_count > 0).is_true()
	assert_bool(n._teams.item_count < 102).override_failure_message(
		"학교 목록에 102개가 다 들어 있다 — 권역으로 안 갈렸다").is_true()


## 권역을 바꾸면 학교 목록이 따라 바뀐다
func test_권역을_바꾸면_학교가_바뀐다() -> void:
	var n: NewGameScreen = await _mount()
	var before: String = n._teams.get_item_text(0)
	var before_team: String = n.current_team_id()

	# 첫 권역이 아닌 칸을 고른다
	n._on_region(1)
	await await_idle_frame()
	assert_str(n._teams.get_item_text(0)).override_failure_message(
		"권역을 바꿨는데 학교 목록이 그대로다").is_not_equal(before)
	assert_str(n.current_team_id()).override_failure_message(
		"권역을 바꿨는데 고른 학교가 그대로다").is_not_equal(before_team)


## 학교를 고르면 상세가 따라온다 — **04에 있는 것만 낸다**
func test_학교를_고르면_상세가_나온다() -> void:
	var n: NewGameScreen = await _mount()
	var joined: String = ""
	for l in n._detail.find_children("*", "Label", true, false):
		joined += (l as Label).text + "\n"
	assert_str(joined).override_failure_message(
		"상세가 비었다").contains("연고")
	assert_str(joined).contains("전력")
	assert_str(joined).contains("권역")


## 고른 학교가 세이브까지 간다 — 목록에서 고른 것이 그대로 시작 신호에 실린다
func test_고른_학교가_시작까지_간다() -> void:
	var n: NewGameScreen = await _mount()
	n._on_team(1)
	await await_idle_frame()
	var picked: String = n.current_team_id()
	assert_str(picked).is_not_empty()

	var got: Array = []
	n.start_requested.connect(func(p: Dictionary) -> void: got.append(p))
	n._on_start()
	await await_millis(50)
	assert_int(got.size()).is_equal(1)
	assert_str(String(got[0]["team_id"])).override_failure_message(
		"고른 학교가 시작 신호에 안 실렸다").is_equal(picked)

	var s: Dictionary = NewGameVm.start({"seed": 7, "season_year": 2027,
		"name": "김한결", "team_id": picked})
	assert_str(String(s["protagonist"]["team_id"])).is_equal(picked)


# ── 능력치 프리셋 ────────────────────────────────────────────────

## 🔴 **고르는 자리가 통째로 없었다** — 04는 무작위 능력치로 시작했다
func test_유형_고르는_자리가_있다() -> void:
	var n: NewGameScreen = await _mount()
	assert_array(_opts(n._preset)).is_equal(["균형형", "파워피처", "제구형", "체력형"])


## 고른 유형의 능력치와 구종이 화면에 나온다 — 숫자 없이 못 고른다
func test_고른_유형의_근거가_보인다() -> void:
	var n: NewGameScreen = await _mount()
	n._preset.selected = 1
	n._fill_preset()
	await await_idle_frame()
	assert_str(n._preset_desc.text).contains("속도")
	assert_str(n._preset_stats.text).override_failure_message(
		"능력치가 안 보인다: %s" % n._preset_stats.text).contains("구위 78")
	assert_str(n._preset_stats.text).override_failure_message(
		"구종이 안 보인다: %s" % n._preset_stats.text).contains("커터")


## 유형을 바꾸면 설명도 바뀐다
func test_유형을_바꾸면_설명이_바뀐다() -> void:
	var n: NewGameScreen = await _mount()
	n._preset.selected = 0
	n._fill_preset()
	var first: String = n._preset_stats.text
	n._preset.selected = 2
	n._fill_preset()
	await await_idle_frame()
	assert_str(n._preset_stats.text).override_failure_message(
		"유형을 바꿨는데 능력치가 그대로다").is_not_equal(first)


## 고른 유형이 세이브까지 간다
func test_고른_유형이_시작까지_간다() -> void:
	var n: NewGameScreen = await _mount()
	n._preset.selected = 1
	n._fill_preset()
	await await_idle_frame()

	var got: Array = []
	n.start_requested.connect(func(p: Dictionary) -> void: got.append(p))
	n._on_start()
	await await_millis(50)
	assert_str(String(got[0]["preset"])).is_equal("power")

	var s: Dictionary = NewGameVm.start(got[0])
	assert_float(float(s["protagonist"]["pitching"]["velocity"])).is_equal(78.0)
