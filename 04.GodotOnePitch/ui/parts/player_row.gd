extends Button
class_name PlayerRow

## 선수 한 줄. **누르면 상세가 열린다** (F-4).
##
## ⚠ **예전엔 `HBoxContainer`라 아무것도 안 눌렸다.** 로스터에 서른 줄이
## 뜨는데 한 줄이 주는 게 포지션·이름·나이·OVR 넷이라, **누가 어떤
## 선수인지를 알 방법이 없었다.**
##
## ⚠ **자식은 클릭을 안 먹는다.** `mouse_filter`를 무시로 두지 않으면
## 라벨이 눌림을 가로채 버튼이 안 눌린다(`action_row.gd`가 같은 함정을 적어 뒀다).

@onready var _pos: Label = $Pad/Row/Pos
@onready var _name: Label = $Pad/Row/Name
@onready var _age: Label = $Pad/Row/Age
@onready var _ovr: Label = $Pad/Row/Ovr

var _row: Dictionary = {}


## 내가 어디 있는지 보여야 한다 — 30명이면 못 찾는다
static func row_color(is_me: bool) -> Color:
	return AppTheme.ACCENT if is_me else AppTheme.TEXT


func setup(row: Dictionary) -> void:
	_row = row
	if is_node_ready():
		_apply()


func _ready() -> void:
	_apply()


func _apply() -> void:
	if _pos == null:
		_pos = get_node_or_null("Pad/Row/Pos")
		_name = get_node_or_null("Pad/Row/Name")
		_age = get_node_or_null("Pad/Row/Age")
		_ovr = get_node_or_null("Pad/Row/Ovr")
	if _row.is_empty() or _pos == null:
		return
	var c: Color = row_color(_row.get("is_me", false))

	_pos.text = _row.get("position", "")
	_pos.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	_name.text = _row.get("name", "")
	_name.add_theme_color_override("font_color", c)

	_age.text = "%d세" % int(_row.get("age", 0))
	_age.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_ovr.text = "%d" % int(round(float(_row.get("ovr", 0.0))))
	_ovr.add_theme_color_override("font_color", BarRow.grade_color(_row.get("ovr", 0.0)))
