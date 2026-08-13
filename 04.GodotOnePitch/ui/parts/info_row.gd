extends HBoxContainer
class_name InfoRow

## 이름 / 값 한 줄 — 화면 전체에서 제일 많이 쓰는 모양이다.
## 원본 `StatusPage.svelte`의 `.info-row`와 같다.

@onready var _name: Label = $Name
@onready var _value: Label = $Value


func setup(label: String, value: String, value_color: Color = AppTheme.TEXT) -> void:
	if _name == null:
		_name = get_node_or_null("Name")
		_value = get_node_or_null("Value")
	if _name:
		_name.text = label
	if _value:
		_value.text = value
		_value.add_theme_color_override("font_color", value_color)
