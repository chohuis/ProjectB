extends Control
class_name TrainingScreen

## 훈련 계획 화면 — M7-9b.
##
## 원본: `pages/training/`
##
## ⚠ **여기는 계산을 안 한다.** 피로 구간·미리보기·프로그램 목록을 전부
## `TrainingVm`이 만든다.
##
## ⚠ **고른 슬롯을 화면이 들고 있지 않는다.** 상태가 들고, 화면은 신호만
## 보낸다 — 진행 뒤 새 사전이 오면서 초기화되는 자리다(소식 거르기가 그랬다)

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _state_label: Label = $Pad/Center/Col/State
@onready var _delta: Label = $Pad/Center/Col/Delta
@onready var _projected: Label = $Pad/Center/Col/Projected
@onready var _slots: VBoxContainer = $Pad/Center/Col/Slots
@onready var _options: VBoxContainer = $Pad/Center/Col/Options
@onready var _pitch_title: Label = $Pad/Center/Col/PitchTitle
@onready var _pitches: VBoxContainer = $Pad/Center/Col/Pitches
@onready var _done: Button = $Pad/Center/Col/Row/Done

const ACTION_ROW := preload("res://ui/parts/action_row.tscn")

## 슬롯에 프로그램을 넣었다. `{slot_id, program_id}` — 빈 문자열이면 비움
signal slot_changed(patch: Dictionary)
## 어느 구종을 배울지 골랐다 — **상태에 쓰는 건 루트가 한다**
signal pitch_picked(pitch_id: String)
## 훈련 화면을 닫는다
signal done_requested

var _vm: Dictionary = {}
## 지금 무슨 슬롯을 채우는 중인가. 빈 문자열이면 고르는 중이 아니다
var _filling: String = ""


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func filling_slot() -> String:
	return _filling


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _rebuild() -> void:
	_title.text = "훈련 계획"
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)

	_state_label.text = "피로 %s · 컨디션 %s" % [_vm.get("fatigue_label", ""),
		_vm.get("condition_label", "")]
	# 지쳤으면 눈에 띄게 — 같은 훈련이 더 지치게 한다
	_state_label.add_theme_color_override("font_color",
		AppTheme.WARN if bool(_vm.get("is_tired", false)) else AppTheme.TEXT)

	_delta.text = String(_vm.get("delta_label", ""))
	_delta.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	# ⚠ **다음 주에 구간이 나빠지면 미리 말한다.** 지금 구간만 보면
	# 벼랑 바로 앞에서 아무 경고가 없다
	_projected.text = String(_vm.get("projected_label", ""))
	_projected.add_theme_color_override("font_color",
		AppTheme.WARN if bool(_vm.get("warns", false)) else AppTheme.TEXT_DIM)

	_done.text = "닫기"
	_build_slots()
	_build_options()
	_build_pitches()


func _build_slots() -> void:
	_free_all(_slots)
	for s in _vm.get("slots", []):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_slots.add_child(row)

		var name := Label.new()
		name.text = "%s  %s" % [s["label"], s["mult"]]
		name.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		name.custom_minimum_size.x = 140
		row.add_child(name)

		var pick := Button.new()
		pick.text = String(s["program_label"])
		pick.alignment = HORIZONTAL_ALIGNMENT_LEFT
		pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pick.toggle_mode = true
		pick.button_pressed = _filling == String(s["id"])
		var sid: String = String(s["id"])
		pick.pressed.connect(func() -> void: _on_slot.call_deferred(sid))
		row.add_child(pick)

		# 비우기는 따로 — 같은 버튼에 얹으면 실수로 지운다
		if not String(s["program_id"]).is_empty():
			var clear := Button.new()
			clear.text = "비움"
			clear.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
			clear.pressed.connect(func() -> void:
				slot_changed.emit.call_deferred({"slot_id": sid, "program_id": ""}))
			row.add_child(clear)


func _on_slot(slot_id: String) -> void:
	# 같은 슬롯을 다시 누르면 고르기를 접는다
	_filling = "" if _filling == slot_id else slot_id
	_rebuild()


func _build_options() -> void:
	_free_all(_options)
	if _filling.is_empty():
		var hint := Label.new()
		hint.text = "슬롯을 눌러 훈련을 고릅니다"
		hint.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		hint.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		_options.add_child(hint)
		return

	for o in _vm.get("options", []):
		var b := Button.new()
		b.text = "%s — %s  (%s)" % [o["label"], o["gains"], o["cost"]]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		var pid: String = String(o["id"])
		var slot: String = _filling
		b.pressed.connect(func() -> void:
			_filling = ""
			slot_changed.emit.call_deferred({"slot_id": slot, "program_id": pid}))
		_options.add_child(b)


## 구종 — 지금 배우는 것과 고를 수 있는 것. F-1.
##
## ⚠ **04엔 이 자리가 아예 없었다.** 성장 축 자체가 죽어 있어서
## 고를 화면도 없었다. 02는 훈련 화면에 구종 탭을 뒀다.
##
## ⚠ **못 고르는 것도 남긴다.** 빼 버리면 무엇을 올려야 열리는지 알 길이 없다
func _build_pitches() -> void:
	_free_all(_pitches)
	var pitch: Dictionary = _vm.get("pitch", {})
	if pitch.is_empty():
		_pitch_title.visible = false
		return
	_pitch_title.visible = true
	_pitch_title.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	var learning: Dictionary = pitch.get("learning", {})
	if not learning.is_empty():
		var bar: BarRow = preload("res://ui/parts/bar_row.tscn").instantiate()
		_pitches.add_child(bar)
		bar.setup("습득 중", float(learning["progress"]) / 100.0,
			String(learning["label"]), AppTheme.ACCENT)

		# ⚠ **구종만 골라 두면 진행이 안 된다.** 훈련 슬롯에 '구종 개발'이
		# 없으면 영원히 그 %에 멈춰 있는데, 화면이 침묵하면 "골랐는데 왜
		# 안 늘지"가 된다
		var note: String = String(pitch.get("note", ""))
		if not note.is_empty():
			var warn := Label.new()
			warn.text = note
			warn.add_theme_color_override("font_color", AppTheme.WARN)
			warn.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
			_pitches.add_child(warn)

	for r in pitch.get("rows", []):
		var b: ActionRow = ACTION_ROW.instantiate()
		_pitches.add_child(b)
		var action: String = "다듬기" if bool(r["owned"]) else "배우기"
		var right: String = String(r["grade_label"])
		if not bool(r["can_train"]):
			action = ""
			right = String(r["why"])
		b.setup(action, String(r["name"]), right,
			AppTheme.TEXT if bool(r["can_train"]) else AppTheme.TEXT_MUTE)
		b.disabled = not bool(r["can_train"])
		var pid: String = String(r["id"])
		b.pressed.connect(func() -> void:
			pitch_picked.emit.call_deferred(pid))
