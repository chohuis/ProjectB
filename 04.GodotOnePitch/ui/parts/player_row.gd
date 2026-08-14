extends HBoxContainer
class_name PlayerRow

## 선수 한 줄.

@onready var _pos: Label = $Pos
@onready var _name: Label = $Name
@onready var _age: Label = $Age
@onready var _ovr: Label = $Ovr

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
	if _row.is_empty():
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
