extends Control
class_name MainScreen

## 진행 화면 — M7-2.
##
## 원본: `pages/main/MainPage.svelte`의 껍데기 (헤더 · 탭 · 진행 버튼)
##
## ⚠ **여기는 계산을 안 한다.** 날짜 문자열도 "다음 등판까지 5일"도
## `MainVm`이 만든다. 이 파일이 하는 일은 사전의 글자를 붙이고 눌린 탭을
## 기억하는 것뿐이다 — `main_screen_test.gd`가 소스에서 계산을 막는다.
##
## ⚠ 골격(배경·헤더·탭 줄·진행 버튼)은 `main_screen.tscn`에 있다.
## 여기서는 **탭 버튼과 내용만 만들어 붙인다.**

const SCHEDULE_ROW := preload("res://ui/parts/schedule_row.tscn")
const NEWS_ROW := preload("res://ui/parts/news_row.tscn")
const STANDING_ROW := preload("res://ui/parts/standing_row.tscn")
const PLAYER_ROW := preload("res://ui/parts/player_row.tscn")
const STATUS_SCREEN := preload("res://ui/screens/status_screen.tscn")
const PEOPLE_SCREEN := preload("res://ui/screens/people_screen.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _date: Label = $Pad/Col/Header/DateRow/Date
@onready var _weekday: Label = $Pad/Col/Header/DateRow/Weekday
@onready var _week: Label = $Pad/Col/Header/DateRow/Week
@onready var _player: Label = $Pad/Col/Header/WhoRow/Player
@onready var _team: Label = $Pad/Col/Header/WhoRow/Team
# ⚠ **02와 같은 3단이다.** `MainPage.svelte`의 `.body`가
# `170px | minmax(0,1fr) | 220px` — 왼쪽 세로 탭, 가운데 내용, 오른쪽 패널.
# 04는 한동안 세로 한 줄이었는데, 그건 스크린샷 도구가 480×900(모바일)을
# 강제한 걸 기준으로 삼았기 때문이다. PC(Steam)가 1차 목표다
@onready var _tabs: VBoxContainer = $Pad/Col/Body/Nav/Tabs
@onready var _tab_host: VBoxContainer = $Pad/Col/Body/Main/TabHost
@onready var _training: Button = $Pad/Col/Body/Right/Training
@onready var _next_game: Label = $Pad/Col/Body/Right/Footer/NextGame
@onready var _advance: Button = $Pad/Col/Body/Right/Footer/Advance
@onready var _progress: ProgressBar = $Pad/Col/Body/Right/Footer/Progress

## 진행 버튼을 눌렀다. 며칠을 갈지는 사전에 있다
signal advance_requested(days: int)
## 탭을 골랐다
signal tab_selected(tab_id: String)
## 소식 거르기를 골랐다. **어느 것이 켜졌는지는 상태가 들고 있다** —
## 화면이 들고 있으면 진행 뒤에 사전이 새로 오면서 초기화된다
signal news_filter_selected(filter_id: String)
## 리그를 골랐다
signal league_selected(league_id: String)
## 오늘 등판 경기를 연다
signal match_requested
## 시즌을 끝내고 다음 해로 넘어간다
signal season_end_requested
## 훈련 계획을 짠다
signal training_requested
## 학업에서 고른 것 — "나" 탭 안의 학업 탭에서 올라온다.
## **상태에 쓰는 건 루트가 한다**
signal study_mode_picked(mode: String)
signal major_picked(name: String)
## 재정에서 고른 것 — 스폰서 계약·개인 트레이닝 구독
signal sponsor_signed(category_id: String)
signal subscription_toggled(area_id: String)
## 인생 기록을 다시 본다
signal life_record_requested

var _vm: Dictionary = {}
var _tab: int = 0
## "나" 탭 안에서 어느 하위 탭을 보고 있었나. **`StatusScreen`은 상태가
## 바뀔 때마다 통째로 새로 만들어지므로 자리를 여기가 들고 있어야 한다**
var _me_tab: int = 0


## 진행 중임을 보인다. `DayRunner.progress`에 그대로 이어 붙인다.
##
## ⚠ **최악의 날이 1.08초다.** 그동안 버튼이 그대로면 안 눌린 줄 알고
## 또 누른다 — 진행기가 겹친 호출을 막긴 하지만 화면이 먼저 말해야 한다.
##
## ⚠ **한 번에 162일까지 간다.** 다음 등판까지 진행하면 2,095경기 · 24초다
## (실측 `bench:season`). 글자만 바뀌면 24초 동안 숫자만 오르는 화면이라
## 얼마나 남았는지가 안 보인다 — 막대가 그걸 말한다
func set_progress(done: int, total: int) -> void:
	# 끝났으면 다시 그린다 — 막대는 `_rebuild`가 치운다
	if total <= 0 or done >= total:
		_rebuild()
		return
	_advance.disabled = true
	_advance.text = "진행 중  %d / %d일" % [done, total]
	_progress.visible = true
	_progress.max_value = total
	_progress.value = done


## 사전을 넣는다. `_ready` 전후 어느 때든 부를 수 있다
func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func current_tab_id() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return tabs[_tab].get("id", "")


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_advance.pressed.connect(_on_advance)
	_training.pressed.connect(func() -> void: training_requested.emit.call_deferred())
	_rebuild()


func _on_advance() -> void:
	match _vm.get("stop_type", ""):
		"game":
			match_requested.emit()
		"season_end":
			season_end_requested.emit()
		_:
			advance_requested.emit(int(_vm.get("advance_days", 0)))


func _rebuild() -> void:
	# ⚠ **진행 중이 아니면 막대를 치운다.** 남아 있으면 "아직 도는 중"으로
	# 읽힌다 — 다시 그리는 이유는 진행 말고도 여럿이다
	_progress.visible = false
	_date.text = _vm.get("date_label", "")
	_weekday.text = "(%s)" % _vm.get("weekday_label", "") if _vm.has("weekday_label") else ""
	_weekday.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_week.text = _vm.get("week_label", "")
	_week.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_player.text = _vm.get("player_name", "")
	_team.text = _vm.get("team_name", "")
	_team.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_training.text = "훈련 계획"
	_next_game.text = _vm.get("next_game_label", "")
	# 오늘 등판이면 눈에 띄게 — 사용자가 기다린 날이다
	_next_game.add_theme_color_override("font_color",
		AppTheme.ACCENT if int(_vm.get("next_game_in", -1)) == 0 else AppTheme.TEXT_DIM)

	# ⚠ **등판일엔 진행이 아니라 경기고, 시즌 마지막 날엔 시즌 종료다.**
	# 같은 버튼에 "0일 진행"을 두면 눌러도 아무 일이 안 일어나고, 사용자는
	# 게임이 멈춘 줄 안다
	var stop: String = _vm.get("stop_type", "")
	if stop == "game" or stop == "season_end":
		_advance.text = "경기 시작" if stop == "game" else "시즌 종료"
		_advance.disabled = false
		_build_tabs()
		_build_body()
		return

	_advance.text = _vm.get("advance_label", "")
	# ⚠ **누를 수 있는지도 사전이 정한다.** 화면이 "0일이면 막자"고 다시
	# 판단하면 진행기와 갈린다
	_advance.disabled = not bool(_vm.get("can_advance", false))

	_build_tabs()
	_build_body()


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 같은 프레임에 여러 번 다시 그리면 그만큼 쌓인다 — 실측으로 검사 한 번에
## 고아 노드 430개가 남았다. 탭을 오갈 때마다 다시 그리므로 실제로 쌓인다.
##
## ⚠ **즉시 해제는 "자기 시그널 안에서 자신을 지우는" 경우에 위험하다.**
## 그래서 버튼들은 시그널을 **미뤄서** 보낸다 (`call_deferred`) — 다시 그리기가
## 시그널 밖에서 일어나야 이게 안전하다
func _free_child(parent: Node, child: Node) -> void:
	parent.remove_child(child)
	child.free()


## 목록을 담을 스크롤 상자.
##
## ⚠ **탭 호스트 자체는 스크롤하지 않는다.** 02도 `.tab-content`가
## `overflow: hidden`이고 각 페이지가 자기 안에서 스크롤한다. 호스트를
## 스크롤로 두면 "나" 탭처럼 **앵커로 크기를 잡는 화면이 높이 0으로 남아
## 통째로 빈다** — 실제로 그렇게 나왔다
func _list_box() -> VBoxContainer:
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tab_host.add_child(scroll)

	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 2)
	scroll.add_child(box)
	return box


func _build_tabs() -> void:
	for c in _tabs.get_children():
		_free_child(_tabs, c)

	var group := ButtonGroup.new()
	var tabs: Array = _vm.get("tabs", [])
	for i in tabs.size():
		var t: Dictionary = tabs[i]
		var b := Button.new()
		# 알림은 **개수까지** 보여준다 — 점만 찍으면 몇 통인지 몰라
		# 들어가 봐야 안다
		var badge: int = int(t.get("badge", 0))
		b.text = "%s %d" % [t.get("label", ""), badge] if badge > 0 else t.get("label", "")
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == _tab)
		# 세로 탭이라 글자를 왼쪽에 붙인다 — 가운데 정렬이면 줄마다 들쭉날쭉하다
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.pressed.connect(func() -> void: _on_tab.call_deferred(i))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	tab_selected.emit(current_tab_id())
	_build_body()


func _build_body() -> void:
	for c in _tab_host.get_children():
		_free_child(_tab_host, c)

	match current_tab_id():
		"schedule":
			_build_schedule()
		"news":
			_build_news()
		"league":
			_build_league()
		"team":
			_build_team()
		"me":
			_build_me()
		"people":
			_build_people()
		_:
			# 아직 안 옮긴 탭. **소비자 없는 자리를 미리 만들지 않는다**
			var l := Label.new()
			l.text = _tab_label()
			l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
			_tab_host.add_child(l)


## 일정 탭. 사전은 `ScheduleVm`이 만들어 `_vm["schedule"]`에 실려 온다 —
## 화면이 일정을 다시 훑지 않는다
func _build_schedule() -> void:
	var vm: Dictionary = _vm.get("schedule", {})

	var head := Label.new()
	head.text = "%s · 남은 경기 %d" % [vm.get("record_label", "기록 없음"),
		int(vm.get("remaining", 0))]
	head.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_tab_host.add_child(head)

	var rows: Array = vm.get("rows", [])
	if rows.is_empty():
		var empty := Label.new()
		empty.text = "아직 잡힌 경기가 없습니다"
		empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		_tab_host.add_child(empty)
		return

	var box: VBoxContainer = _list_box()
	for r in rows:
		var row: ScheduleRow = SCHEDULE_ROW.instantiate()
		box.add_child(row)
		row.setup(r)


## 나 탭. **`StatusScreen`을 통째로 끼운다** — P1에서 만든 화면을 안 고친다.
## 사전 하나만 받는 화면이라 그대로 붙는다
func _build_me() -> void:
	var screen: StatusScreen = STATUS_SCREEN.instantiate()
	screen.size_flags_vertical = Control.SIZE_EXPAND_FILL
	# 학업에서 고른 것을 루트까지 올린다 — 상태에 쓰는 건 루트가 한다.
	#
	# ⚠ **여기서도 미뤄서 보낸다.** 루트가 상태를 고치면 이 화면이 다시
	# 그려지면서 방금 신호를 쏜 `StatusScreen`을 지운다 — 그대로 이으면
	# 자기 신호 안에서 자신이 지워져 잠긴 객체가 된다
	screen.study_mode_picked.connect(
		func(m: String) -> void: study_mode_picked.emit.call_deferred(m))
	screen.major_picked.connect(
		func(n: String) -> void: major_picked.emit.call_deferred(n))
	screen.sponsor_signed.connect(
		func(c: String) -> void: sponsor_signed.emit.call_deferred(c))
	screen.subscription_toggled.connect(
		func(a: String) -> void: subscription_toggled.emit.call_deferred(a))
	screen.life_record_requested.connect(
		func() -> void: life_record_requested.emit.call_deferred())
	# ⚠ **하위 탭 자리를 여기서 기억한다.** 학업에서 뭘 고르면 상태가
	# 바뀌고 이 화면이 통째로 새로 만들어지는데, 안 되돌려 놓으면
	# 고를 때마다 "능력치"로 튕겨 나간다
	screen.tab_changed.connect(func(i: int) -> void: _me_tab = i)
	_tab_host.add_child(screen)
	screen.set_view_model(_vm.get("me", {}))
	screen.select_tab(_me_tab)


## 인물 탭. **`PeopleScreen`을 통째로 끼운다** — "나" 탭과 같은 방식이다
func _build_people() -> void:
	var screen: PeopleScreen = PEOPLE_SCREEN.instantiate()
	screen.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tab_host.add_child(screen)
	screen.set_view_model(_vm.get("people", {}))


## 팀 탭. 로스터는 `TeamVm`이 정렬해 온다
func _build_team() -> void:
	var vm: Dictionary = _vm.get("team", {})

	var head := Label.new()
	head.text = "%s · %s" % [vm.get("team_name", ""), vm.get("summary", "")]
	head.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_tab_host.add_child(head)

	var rows: Array = vm.get("rows", [])
	if rows.is_empty():
		var empty := Label.new()
		empty.text = "로스터가 비어 있습니다"
		empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		_tab_host.add_child(empty)
		return

	var box: VBoxContainer = _list_box()
	for r in rows:
		var row: PlayerRow = PLAYER_ROW.instantiate()
		box.add_child(row)
		row.setup(r)


## 리그 탭. 순위표는 `LeagueVm`이 일정에서 매번 다시 센다 —
## 화면이 자기 집계를 들면 경기 결과와 어긋나는 순간이 온다
func _build_league() -> void:
	var vm: Dictionary = _vm.get("league", {})

	var chips := HBoxContainer.new()
	chips.add_theme_constant_override("separation", 4)
	_tab_host.add_child(chips)

	var active: String = vm.get("league_id", "")
	for l in vm.get("leagues", []):
		var b := Button.new()
		b.text = l.get("label", "")
		b.toggle_mode = true
		b.button_pressed = (l["id"] == active)
		b.pressed.connect(func() -> void:
			league_selected.emit.call_deferred(String(l["id"])))
		chips.add_child(b)

	var rows: Array = vm.get("rows", [])
	if rows.is_empty():
		var empty := Label.new()
		empty.text = "아직 치른 경기가 없습니다"
		empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		_tab_host.add_child(empty)
		return

	var box: VBoxContainer = _list_box()
	for r in rows:
		var row: StandingRow = STANDING_ROW.instantiate()
		box.add_child(row)
		row.setup(r)


## 소식 탭. 거르기 칩은 **누르면 루트에 알린다** — 어느 거르기가 켜졌는지는
## 상태에 있고, 화면이 자기 안에 들고 있으면 진행 뒤에 초기화된다
func _build_news() -> void:
	var vm: Dictionary = _vm.get("news", {})

	var chips := HBoxContainer.new()
	chips.add_theme_constant_override("separation", 4)
	_tab_host.add_child(chips)

	var active: String = vm.get("active_filter", "all")
	for f in vm.get("filters", []):
		var b := Button.new()
		var n: int = int(f.get("count", 0))
		b.text = "%s %d" % [f.get("label", ""), n] if n > 0 else f.get("label", "")
		b.toggle_mode = true
		b.button_pressed = (f["id"] == active)
		b.pressed.connect(func() -> void:
			news_filter_selected.emit.call_deferred(String(f["id"])))
		chips.add_child(b)

	var rows: Array = vm.get("rows", [])
	if rows.is_empty():
		var empty := Label.new()
		empty.text = "소식이 없습니다"
		empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		_tab_host.add_child(empty)
		return

	var box: VBoxContainer = _list_box()
	for r in rows:
		var row: NewsRow = NEWS_ROW.instantiate()
		box.add_child(row)
		row.setup(r)


func _tab_label() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return tabs[_tab].get("label", "")
