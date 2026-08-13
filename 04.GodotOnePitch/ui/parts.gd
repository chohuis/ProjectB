extends RefCounted
class_name Parts

## 화면 부품 — **카드·정보행·진행바·배지.**
##
## 원본(`StatusPage.svelte`)이 쓰는 것과 같은 것들이다. 화면 56개가 전부
## 이 조합이라, 여기서 한 번 정하면 나머지는 배치만 다르다.
##
## ⚠ **코드로 만든다 — 지금은 그렇다.** `.tscn`으로 만들면 에디터에서 시각
## 편집이 되지만, 표·행이 많은 화면은 코드가 훨씬 짧고 검사하기 쉽다.
## 슬라이스를 보고 어느 쪽이 나은지 정하면 된다.


## 제목 붙은 카드 — 원본의 `<article class="card">`
static func card(title: String = "") -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", AppTheme.card_style())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", AppTheme.GAP)
	v.name = "Body"
	p.add_child(v)
	if title != "":
		var l := Label.new()
		l.text = title
		l.add_theme_font_size_override("font_size", AppTheme.FONT_TITLE)
		l.add_theme_color_override("font_color", AppTheme.TEXT)
		v.add_child(l)
	return p


## 카드 안쪽 — 자식을 여기 붙인다
static func body(c: PanelContainer) -> VBoxContainer:
	return c.get_node("Body") as VBoxContainer


## 이름 / 값 한 줄 — 원본의 `.info-row`
##
## 화면 전체에서 제일 많이 쓰는 모양이다. 값이 오른쪽에 붙는다
static func info_row(label: String, value: String, value_color: Color = AppTheme.TEXT) -> HBoxContainer:
	var h := HBoxContainer.new()
	var l := Label.new()
	l.text = label
	l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v := Label.new()
	v.text = value
	v.add_theme_color_override("font_color", value_color)
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	h.add_child(l)
	h.add_child(v)
	return h


## 작은 알약 표시 — 부상 심각도·치료 방식 등
static func badge(text: String, c: Color) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", AppTheme.pill_style(c))
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	l.add_theme_color_override("font_color", c)
	p.add_child(l)
	return p


## 왼쪽 라벨 · 가운데 막대 · 오른쪽 값 — 원본의 회복 진행바
static func bar_row(label: String, ratio: float, right_text: String, c: Color) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", AppTheme.GAP)

	var l := Label.new()
	l.text = label
	l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	l.custom_minimum_size.x = 44
	h.add_child(l)

	var bar := ProgressBar.new()
	bar.min_value = 0.0
	bar.max_value = 1.0
	bar.value = clampf(ratio, 0.0, 1.0)
	bar.show_percentage = false
	bar.custom_minimum_size.y = 10
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var fill := StyleBoxFlat.new()
	fill.bg_color = c
	fill.set_corner_radius_all(5)
	var back := StyleBoxFlat.new()
	back.bg_color = AppTheme.CARD_EDGE
	back.set_corner_radius_all(5)
	bar.add_theme_stylebox_override("fill", fill)
	bar.add_theme_stylebox_override("background", back)
	h.add_child(bar)

	var r := Label.new()
	r.text = right_text
	r.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	r.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	h.add_child(r)
	return h


## 능력치 한 줄 — 이름·막대·숫자.
##
## ⚠ 색이 값을 말한다. 숫자만 보면 70이 좋은지 나쁜지 모른다 —
## 원본도 등급 색을 쓴다
static func stat_row(name: String, value: float, max_value: float = 99.0) -> HBoxContainer:
	return bar_row(name, value / max_value, "%d" % roundi(value), grade_color(value))


## 능력치 색 — 리그 기준이 아니라 절대 기준이다.
## 고교 평균이 68 근처라 그 언저리가 "보통"이 되게 잡는다
static func grade_color(v: float) -> Color:
	if v >= 85.0: return AppTheme.ACCENT
	if v >= 75.0: return AppTheme.OK
	if v >= 60.0: return AppTheme.TEXT
	return AppTheme.TEXT_DIM


## 탭 줄 — 누르면 `on_change.call(index)`
static func tabs(labels: PackedStringArray, on_change: Callable) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 4)
	var group := ButtonGroup.new()
	for i in labels.size():
		var b := Button.new()
		b.text = labels[i]
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == 0)
		b.focus_mode = Control.FOCUS_NONE
		var idx := i
		b.pressed.connect(func() -> void: on_change.call(idx))
		h.add_child(b)
	return h
