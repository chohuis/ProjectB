extends HBoxContainer
class_name BarRow

## 왼쪽 라벨 · 가운데 막대 · 오른쪽 값.
##
## 회복 진행바와 능력치 줄이 같은 모양이라 하나로 쓴다.
##
## ⚠ **색이 값을 말한다.** 숫자만 보면 70이 좋은지 나쁜지 모른다 —
## 원본도 등급 색을 쓴다.

@onready var _name: Label = $Name
@onready var _bar: ProgressBar = $Bar
@onready var _right: Label = $Right


func setup(label: String, ratio: float, right_text: String, c: Color) -> void:
	if _name == null:
		_name = get_node_or_null("Name")
		_bar = get_node_or_null("Bar")
		_right = get_node_or_null("Right")
	if _name:
		_name.text = label
	if _right:
		_right.text = right_text
	if _bar:
		_bar.value = clampf(ratio, 0.0, 1.0)
		var fill := StyleBoxFlat.new()
		fill.bg_color = c
		fill.set_corner_radius_all(5)
		var back := StyleBoxFlat.new()
		back.bg_color = AppTheme.CARD_EDGE
		back.set_corner_radius_all(5)
		_bar.add_theme_stylebox_override("fill", fill)
		_bar.add_theme_stylebox_override("background", back)


## 능력치 줄 — 값에서 비율과 색을 함께 정한다
func setup_stat(label: String, value: float, max_value: float = 99.0) -> void:
	setup(label, value / max_value, "%d" % roundi(value), grade_color(value))


## 능력치 색 — 절대 기준이다. 고교 평균이 68 근처라 그 언저리가 "보통"이 되게 잡는다
static func grade_color(v: float) -> Color:
	if v >= 85.0: return AppTheme.ACCENT
	if v >= 75.0: return AppTheme.OK
	if v >= 60.0: return AppTheme.TEXT
	return AppTheme.TEXT_DIM
