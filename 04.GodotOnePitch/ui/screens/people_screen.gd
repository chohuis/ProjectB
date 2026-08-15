extends Control
class_name PeopleScreen

## 인물(관계도) — C-2.
##
## 원본: `pages/people/PeoplePage.svelte`
##
## ⚠ **여기는 계산을 안 한다.** 가르기·정렬·이름 붙이기·효과 문장은 전부
## `PeopleVm`이 끝낸다.
##
## ⚠ **관계값 숫자를 절대 안 찍는다.** 사전에 값이 아예 없다 — 색이 곧 수치다.

const BADGE := preload("res://ui/parts/badge.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _sub: Label = $Pad/Col/Sub
@onready var _empty: Label = $Pad/Col/Empty
@onready var _cols: HBoxContainer = $Pad/Col/Cols
@onready var _left_head: Label = $Pad/Col/Cols/Left/Head
@onready var _left_empty: Label = $Pad/Col/Cols/Left/Empty
@onready var _left_body: VBoxContainer = $Pad/Col/Cols/Left/Scroll/Body
@onready var _right_head: Label = $Pad/Col/Cols/Right/Head
@onready var _right_empty: Label = $Pad/Col/Cols/Right/Empty
@onready var _right_body: VBoxContainer = $Pad/Col/Cols/Right/Scroll/Body
@onready var _note: Label = $Pad/Col/Cols/Right/Note

## ⚠ **닫기 버튼이 없다.** 이건 모달이 아니라 진행 화면의 "인물" 탭이라
## 닫을 것이 없다 — 드래프트 보드와 다르다

var _vm: Dictionary = {}
## 펼쳐 놓은 사람. **한 명만** — 서른 줄이 다 펼쳐지면 목록이 아니다
var _open_id: String = ""


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	_open_id = ""
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_rebuild()


func _rebuild() -> void:
	_sub.text = String(_vm.get("sub", ""))
	_sub.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	var has: bool = bool(_vm.get("has_data", false))
	_empty.visible = not has
	_empty.text = String(_vm.get("empty", ""))
	_empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
	_cols.visible = has
	if not has:
		_free_all(_left_body)
		_free_all(_right_body)
		return

	var left: Dictionary = _vm.get("together", {})
	var right: Dictionary = _vm.get("past", {})
	_side(_left_head, _left_empty, _left_body, left, true)
	_side(_right_head, _right_empty, _right_body, right, false)

	_note.text = String(right.get("note", ""))
	_note.visible = not right.get("rows", []).is_empty()
	_note.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
	_note.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)


func _side(head: Label, empty: Label, body: VBoxContainer, side: Dictionary,
		selectable: bool) -> void:
	head.text = "%s %d" % [String(side.get("label", "")), int(side.get("count", 0))]
	head.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	head.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)

	var rows: Array = side.get("rows", [])
	empty.visible = rows.is_empty()
	empty.text = String(side.get("empty", ""))
	empty.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	_free_all(body)
	for r in rows:
		_person_row(body, r, selectable)


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 다시 열 때마다 쌓인다 — 진행 화면에서 고아 430개가 실제로 나왔다
func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _person_row(body: VBoxContainer, r: Dictionary, selectable: bool) -> void:
	var pid: String = String(r["person_id"])
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 8)

	var name_label := Label.new()
	name_label.text = String(r["name"])
	name_label.add_theme_color_override("font_color",
		AppTheme.TEXT_MUTE if bool(r["ended"]) else AppTheme.TEXT)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(name_label)

	var kind := Label.new()
	kind.text = String(r["kind_label"])
	kind.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	kind.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	line.add_child(kind)

	# 7단계 라벨. **숫자를 안 보여주므로 이 알약이 유일한 눈금이다**
	var badge: Badge = BADGE.instantiate()
	line.add_child(badge)
	badge.setup(String(r["label"]),
		AppTheme.TONE_COLOR.get(String(r["tone"]), AppTheme.TEXT_DIM))

	if not selectable:
		body.add_child(line)
		_detail(body, r)
		return

	# 지금 함께 있는 사람만 펼친다 — 효과가 지금 걸려 있는 쪽이다
	var button := Button.new()
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(_on_row_pressed.bind(pid))
	button.add_child(line)
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.custom_minimum_size = Vector2(0, 26)
	body.add_child(button)

	if _open_id == pid:
		_detail(body, r)


func _detail(body: VBoxContainer, r: Dictionary) -> void:
	var text: String = String(r["detail"])
	if text.is_empty():
		return
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	body.add_child(l)


## ⚠ **미룬 뒤에 다시 그린다.** 지금 이 자리는 눌린 버튼이 신호를 쏘는
## 중이라 그 버튼이 잠겨 있다 — 바로 그리면 `_free_all`이 자기를 부른
## 버튼을 지우려다 실패하고, 줄이 그대로 쌓인다
func _on_row_pressed(pid: String) -> void:
	_open_id = "" if _open_id == pid else pid
	_rebuild.call_deferred()
