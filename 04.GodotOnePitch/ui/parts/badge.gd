extends PanelContainer
class_name Badge

## 작은 알약 표시 — 부상 심각도·구종 등급·수상 이름.
##
## 씬으로 만들어 에디터에서 볼 수 있게 한다. 값은 `setup()`으로 넣는다 —
## 화면이 색을 직접 고르지 않게 하려는 것이다.

@onready var _label: Label = $Label


func setup(text: String, c: Color) -> void:
	# ⚠ `_ready` 전에 불릴 수 있다 — 인스턴스화 직후에 값을 넣는 게 보통이다
	if _label == null:
		_label = get_node_or_null("Label")
	if _label:
		_label.text = text
		_label.add_theme_color_override("font_color", c)
	add_theme_stylebox_override("panel", AppTheme.pill_style(c))
