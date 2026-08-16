extends Button
class_name ActionRow

## 누를 수 있는 한 줄 — 왼쪽 동작 · 가운데 이름 · 오른쪽 값.
##
## ⚠ **글자를 한 문자열로 이어 붙이면 칸이 안 맞는다.** 예전엔
## `"계약   %s   %s"`처럼 공백으로 붙였는데, 이름 길이가 다르면 금액이 줄마다
## 다른 자리에서 시작한다 — 스폰서 제안 셋이 실제로 그렇게 어긋나 있었다.
##
## ⚠ **자식은 클릭을 안 먹는다.** `mouse_filter`를 무시로 두지 않으면 라벨이
## 눌림을 가로채 버튼이 안 눌린다.

@onready var _action: Label = $Pad/Row/Action
@onready var _name: Label = $Pad/Row/Name
@onready var _value: Label = $Pad/Row/Value


func setup(action: String, name_text: String, value: String,
		value_color: Color = AppTheme.TEXT) -> void:
	if _action == null:
		_action = get_node_or_null("Pad/Row/Action")
		_name = get_node_or_null("Pad/Row/Name")
		_value = get_node_or_null("Pad/Row/Value")
	if _action:
		_action.text = action
		_action.add_theme_color_override("font_color", AppTheme.ACCENT)
	if _name:
		_name.text = name_text
	if _value:
		_value.text = value
		_value.add_theme_color_override("font_color", value_color)
