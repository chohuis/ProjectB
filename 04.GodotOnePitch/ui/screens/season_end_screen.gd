extends Control
class_name SeasonEndScreen

## 시즌 결산 — M7-7.
##
## 원본: `features/season-end/ui/SeasonEndModal.svelte` (1,195줄)
##
## ⚠ **여기는 계산을 안 한다.** 순위·수상·개인 기록을 전부 `SeasonEndVm`이
## 만든다 — 02가 1,195줄이 된 이유가 화면이 그걸 직접 모아서다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _tabs: HBoxContainer = $Pad/Center/Col/Tabs
@onready var _body: VBoxContainer = $Pad/Center/Col/Body
@onready var _done: Button = $Pad/Center/Col/Row/Done

## 결산을 닫는다
signal done_requested

var _vm: Dictionary = {}
var _tab: int = 0


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	_tab = 0
	if is_node_ready():
		_rebuild()


func current_tab_id() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return String(tabs[_tab].get("id", ""))


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


func _rebuild() -> void:
	_title.text = String(_vm.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_done.text = "다음 시즌으로"

	_build_tabs()
	_build_body()


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 탭을 오갈 때마다 쌓인다 — 진행 화면에서 고아 430개가 실제로 나왔다
func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _build_tabs() -> void:
	_free_all(_tabs)
	var group := ButtonGroup.new()
	var tabs: Array = _vm.get("tabs", [])
	for i in tabs.size():
		var b := Button.new()
		b.text = String(tabs[i].get("label", ""))
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == _tab)
		b.pressed.connect(func() -> void: _on_tab.call_deferred(i))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	_build_body()


func _build_body() -> void:
	_free_all(_body)
	if not bool(_vm.get("has_data", false)):
		_line("결산할 시즌이 없습니다", AppTheme.TEXT_MUTE)
		return

	match current_tab_id():
		"season":
			_build_season()
		"team":
			_build_team()
		"personal":
			_build_personal()


func _line(text: String, color: Color = AppTheme.TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	_body.add_child(l)
	return l


func _pair(left: String, right: String, color: Color = AppTheme.TEXT) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_body.add_child(row)

	var a := Label.new()
	a.text = left
	a.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(a)

	var b := Label.new()
	b.text = right
	b.add_theme_color_override("font_color", color)
	row.add_child(b)


func _heading(text: String) -> void:
	var l: Label = _line(text, AppTheme.TEXT_DIM)
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)


func _build_season() -> void:
	_heading("한 해에 있었던 일")
	var rows: Array = _vm.get("summary_rows", [])
	if rows.is_empty():
		_line("기록이 없습니다", AppTheme.TEXT_MUTE)
	for r in rows:
		_pair(String(r["label"]), String(r["value"]))

	_heading("수상")
	var awards: Array = _vm.get("award_rows", [])
	if awards.is_empty():
		# ⚠ **왜 비었는지를 말한다** (U-9). "수상자가 없습니다"만 있으면
		# 버그인지 아직인지를 못 가른다 — `awards.gd:149`가 "아무도 두 부문을
		# 못 채우는 해가 있다"고 적어 뒀듯 **이게 정상인 해가 실제로 있다**
		_line("자격선을 넘은 선수가 없습니다", AppTheme.TEXT_MUTE)
	for a in awards:
		var right: String = String(a["player_id"])
		if not String(a["value"]).is_empty():
			right += "  " + String(a["value"])
		_pair(String(a["label"]), right)


func _build_team() -> void:
	_pair("소속", String(_vm.get("team_name", "")))
	_pair("순위", String(_vm.get("my_rank_label", "")), AppTheme.ACCENT)

	var row: Dictionary = _vm.get("team_row", {})
	if row.is_empty():
		_line("팀 성적이 없습니다", AppTheme.TEXT_MUTE)
		return
	_pair("성적", "%d승 %d무 %d패" % [int(row.get("wins", 0)),
		int(row.get("draws", 0)), int(row.get("losses", 0))])
	_pair("승률", String(row.get("pct_label", "")))


func _build_personal() -> void:
	var line: String = String(_vm.get("my_line", ""))
	_pair("올해 성적", line if not line.is_empty() else "기록 없음",
		AppTheme.TEXT if not line.is_empty() else AppTheme.TEXT_MUTE)
	_pair("OVR", str(int(_vm.get("my_ovr", 0))))

	var mine: Array = _vm.get("my_awards", [])
	if not mine.is_empty():
		_pair("수상", ", ".join(PackedStringArray(mine)), AppTheme.ACCENT)

	_heading("등판 기록")
	var log: Array = _vm.get("game_log", [])
	if log.is_empty():
		_line("등판이 없습니다", AppTheme.TEXT_MUTE)
		return
	for e in log:
		# 이긴 경기를 눈에 띄게 — 결산에서 제일 먼저 보는 것이다
		_pair("%d일차 %s %s" % [int(e["day"]), String(e["opponent_id"]),
			String(e["score_label"])], String(e["line_label"]),
			AppTheme.ACCENT if bool(e["won"]) else AppTheme.TEXT_DIM)
