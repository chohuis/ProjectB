extends Control
class_name DecisionScreen

## 결정 화면 — 대기줄에 쌓인 결정을 사람이 답하는 자리.
##
## ⚠ **종류마다 화면을 만들지 않는다.** 결정은 "무엇을 묻고 · 고를 것이
## 무엇인가" 하나로 같다 — 종류마다 만들면 열 개가 되고 새 결정이
## 생길 때마다 또 하나가 필요해진다.
##
## ⚠ **여기는 엔진을 직접 안 부른다.** 고른 것의 id만 올린다 —
## 배선표는 `DecisionVm.apply` 하나다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _body: Label = $Pad/Center/Col/Body
## 🔴 **선택지가 스크롤 안에 있다.** 없을 때는 화면에 들어가는 만큼만
## 보여주려고 `APPLY_SHOWN = 6`으로 잘랐는데, 대학이 **50곳**이라
## **44곳은 영영 지원할 수 없었다** — 가나다순 앞에서 조용히 잘렸다
@onready var _choices: VBoxContainer = $Pad/Center/Col/Scroll/Choices

## 고른 것의 id
signal chosen(choice_id: String)
## 협상 조건이 바뀌었다 — 루트가 사전을 다시 만들어 준다 (F-2b).
##
## ⚠ **화면이 계산을 갖지 않는다.** 슬라이더를 움직이면 새 조건으로
## `DecisionVm.build`를 다시 부른다 — 여기서 확률을 직접 세면 화면에 뜬
## 값과 실제 판정이 갈린다
signal terms_changed(terms: Dictionary)

var _vm: Dictionary = {}
## 지금 고른 협상 조건. **루트가 사전을 만들 때 그대로 되돌려 준다**
var _terms: Dictionary = {}


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_rebuild()


func _rebuild() -> void:
	_title.text = String(_vm.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_body.text = String(_vm.get("body", ""))
	_body.add_theme_color_override("font_color", AppTheme.TEXT)

	# ⚠ **떼고 나서 곧바로 지운다** — 다시 열 때마다 쌓인다
	for c in _choices.get_children():
		_choices.remove_child(c)
		c.free()

	# ⚠ **모양은 둘뿐이다.** 하나 고르기(`one`)와 여러 개 켜고 제출하기
	# (`many`) — 결정 종류가 늘어도 화면은 이 둘을 안 넘는다
	var kind: String = String(_vm.get("kind", "one"))
	if kind == "many":
		_build_many()
		return
	# 협상은 고르기 전에 조건을 만진다 — 버튼 위에 붙인다 (F-2b)
	if kind == "negotiate":
		_build_negotiation()
	for ch in _vm.get("choices", []):
		var b := Button.new()
		b.text = String(ch["label"])
		b.focus_mode = Control.FOCUS_NONE
		# ⚠ **못 누르는 선택지는 막는다.** 역제안이 문턱을 넘었는데 눌리면
		# 아무 일도 안 일어나고 사용자는 왜인지 모른다
		b.disabled = not bool(ch.get("enabled", true))
		# ⚠ **미뤄서 보낸다.** 루트가 상태를 고치면 이 화면이 다시 그려지는데,
		# 바로 보내면 자기를 부른 버튼을 지우려다 잠긴 객체가 된다
		b.pressed.connect(func() -> void:
			chosen.emit.call_deferred(String(ch["id"])))
		_choices.add_child(b)


## 여러 개를 켜고 한 번에 낸다. **고른 것을 id에 담아 올린다** —
## 화면이 상태를 들고 있지 않게 하려는 것이다
func _build_many() -> void:
	var boxes: Array = []
	for ch in _vm.get("choices", []):
		var c := CheckBox.new()
		c.text = String(ch["label"])
		c.focus_mode = Control.FOCUS_NONE
		c.set_meta("choice_id", String(ch["id"]))
		_choices.add_child(c)
		boxes.append(c)

	var submit := Button.new()
	submit.text = String(_vm.get("submit_label", "제출"))
	submit.focus_mode = Control.FOCUS_NONE
	submit.pressed.connect(func() -> void:
		var picked: Array = []
		for c in boxes:
			if (c as CheckBox).button_pressed:
				picked.append(String((c as CheckBox).get_meta("choice_id")))
		chosen.emit.call_deferred("submit:%s" % ",".join(PackedStringArray(picked))))
	_choices.add_child(submit)


## 협상 조건 — 연봉 슬라이더 · 기간 · 노트레이드 · 옵션 · 수락 가능성 (F-2b).
##
## ⚠ **여기서 숫자를 계산하지 않는다.** 조건이 바뀌면 `terms_changed`를
## 올리고 루트가 `DecisionVm.build`로 새 사전을 준다 — 화면이 자기 산식을
## 가지면 뜬 확률과 실제 판정이 갈린다
func _build_negotiation() -> void:
	var n: Dictionary = _vm.get("negotiation", {})
	if n.is_empty():
		return

	_row("요청 연봉", "%+d%%" % roundi(float(n.get("ratio", 0.0)) * 100.0))
	var slider := HSlider.new()
	slider.min_value = Negotiation.RATIO_MIN
	slider.max_value = Negotiation.RATIO_MAX
	slider.step = Negotiation.RATIO_STEP
	slider.value = float(n.get("ratio", 0.0))
	slider.focus_mode = Control.FOCUS_NONE
	slider.custom_minimum_size = Vector2(0, 20)
	slider.value_changed.connect(func(v: float) -> void: _set_term("ratio", v))
	_choices.add_child(slider)

	_stepper("계약 기간", "duration_years", int(n.get("duration_years", 1)),
		int(n.get("min_duration_years", 1)), int(n.get("max_duration_years", 3)),
		"%d년")
	_stepper("구단 옵션", "team_option", int(n.get("team_option", 0)),
		0, Negotiation.OPTION_MAX, "%d년")
	_stepper("선수 옵션", "player_option", int(n.get("player_option", 0)),
		0, Negotiation.OPTION_MAX, "%d년")

	var nt := CheckBox.new()
	nt.text = "노트레이드 조항 (연봉이 깎인다)"
	nt.button_pressed = bool(n.get("no_trade", false))
	nt.focus_mode = Control.FOCUS_NONE
	nt.toggled.connect(func(on: bool) -> void: _set_term("no_trade", on))
	_choices.add_child(nt)

	# ⚠ **왜 못 받는지를 말한다.** 막대만 있으면 "왜 0%인지"를 모른다
	var chance: int = int(n.get("accept_chance", 0))
	var bar: BarRow = preload("res://ui/parts/bar_row.tscn").instantiate()
	_choices.add_child(bar)
	bar.setup("팀 수락 가능성", float(chance) / 100.0, "%d%%" % chance,
		AppTheme.OK if chance >= 60 else (
		AppTheme.TEXT if chance > 0 else AppTheme.WARN))

	if not bool(n.get("can_counter", true)):
		_row("", "요청이 팀의 허용 범위를 넘었습니다. 조건을 낮추세요.", AppTheme.WARN)
	_row("시장가 대비", "%d%%" % int(n.get("market_ratio_pct", 100)))


## 값을 하나 바꾸고 루트에 알린다
func _set_term(key: String, value) -> void:
	_terms[key] = value
	terms_changed.emit.call_deferred(_terms.duplicate())


## −/+ 로 정수를 고른다. **슬라이더를 넷 두면 화면이 안 읽힌다**
func _stepper(label: String, key: String, value: int, lo: int, hi: int,
		fmt: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_choices.add_child(row)

	var name_label := Label.new()
	name_label.text = label
	name_label.custom_minimum_size = Vector2(96, 0)
	name_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	row.add_child(name_label)

	var minus := Button.new()
	minus.text = "−"
	minus.focus_mode = Control.FOCUS_NONE
	minus.disabled = value <= lo
	minus.pressed.connect(func() -> void: _set_term(key, maxi(value - 1, lo)))
	row.add_child(minus)

	var value_label := Label.new()
	value_label.text = fmt % value
	value_label.custom_minimum_size = Vector2(44, 0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row.add_child(value_label)

	var plus := Button.new()
	plus.text = "+"
	plus.focus_mode = Control.FOCUS_NONE
	plus.disabled = value >= hi
	plus.pressed.connect(func() -> void: _set_term(key, mini(value + 1, hi)))
	row.add_child(plus)


func _row(label: String, value: String, color: Color = AppTheme.TEXT) -> void:
	var row: InfoRow = preload("res://ui/parts/info_row.tscn").instantiate()
	_choices.add_child(row)
	row.setup(label, value, color)
