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

@onready var _bg: ColorRect = $Bg
@onready var _date: Label = $Pad/Col/Header/DateRow/Date
@onready var _weekday: Label = $Pad/Col/Header/DateRow/Weekday
@onready var _week: Label = $Pad/Col/Header/DateRow/Week
@onready var _player: Label = $Pad/Col/Header/WhoRow/Player
@onready var _team: Label = $Pad/Col/Header/WhoRow/Team
@onready var _tabs: HBoxContainer = $Pad/Col/Tabs
@onready var _tab_host: VBoxContainer = $Pad/Col/TabHost
@onready var _next_game: Label = $Pad/Col/Footer/NextGame
@onready var _advance: Button = $Pad/Col/Footer/Advance

## 진행 버튼을 눌렀다. 며칠을 갈지는 사전에 있다
signal advance_requested(days: int)
## 탭을 골랐다
signal tab_selected(tab_id: String)

var _vm: Dictionary = {}
var _tab: int = 0


## 진행 중임을 보인다. `DayRunner.progress`에 그대로 이어 붙인다.
##
## ⚠ **최악의 날이 1.08초다.** 그동안 버튼이 그대로면 안 눌린 줄 알고
## 또 누른다 — 진행기가 겹친 호출을 막긴 하지만 화면이 먼저 말해야 한다
func set_progress(done: int, total: int) -> void:
	if total <= 0 or done >= total:
		_rebuild()
		return
	_advance.disabled = true
	_advance.text = "진행 중  %d / %d일" % [done, total]


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
	_rebuild()


func _on_advance() -> void:
	advance_requested.emit(int(_vm.get("advance_days", 0)))


func _rebuild() -> void:
	_date.text = _vm.get("date_label", "")
	_weekday.text = "(%s)" % _vm.get("weekday_label", "") if _vm.has("weekday_label") else ""
	_weekday.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_week.text = _vm.get("week_label", "")
	_week.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_player.text = _vm.get("player_name", "")
	_team.text = _vm.get("team_name", "")
	_team.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_next_game.text = _vm.get("next_game_label", "")
	# 오늘 등판이면 눈에 띄게 — 사용자가 기다린 날이다
	_next_game.add_theme_color_override("font_color",
		AppTheme.ACCENT if int(_vm.get("next_game_in", -1)) == 0 else AppTheme.TEXT_DIM)

	_advance.text = _vm.get("advance_label", "")
	# ⚠ **누를 수 있는지도 사전이 정한다.** 화면이 "0일이면 막자"고 다시
	# 판단하면 진행기와 갈린다
	_advance.disabled = not bool(_vm.get("can_advance", false))

	_build_tabs()
	_build_body()


func _build_tabs() -> void:
	# ⚠ **떼고 나서 지운다.** `queue_free`만 하면 다음 프레임까지 자식으로
	# 남아서, 같은 프레임에 다시 만들면 탭이 두 줄로 찍힌다
	for c in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()

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
		b.pressed.connect(_on_tab.bind(i))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	tab_selected.emit(current_tab_id())
	_build_body()


func _build_body() -> void:
	for c in _tab_host.get_children():
		_tab_host.remove_child(c)
		c.queue_free()

	# 탭 내용은 M7-3에서 붙인다. 지금은 어느 탭인지만 보여준다 —
	# **소비자 없는 자리를 미리 만들지 않는다**
	var l := Label.new()
	l.text = _tab_label()
	l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_tab_host.add_child(l)


func _tab_label() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return tabs[_tab].get("label", "")
