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
@onready var _choices: VBoxContainer = $Pad/Center/Col/Choices

## 고른 것의 id
signal chosen(choice_id: String)

var _vm: Dictionary = {}


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

	for ch in _vm.get("choices", []):
		var b := Button.new()
		b.text = String(ch["label"])
		b.focus_mode = Control.FOCUS_NONE
		# ⚠ **미뤄서 보낸다.** 루트가 상태를 고치면 이 화면이 다시 그려지는데,
		# 바로 보내면 자기를 부른 버튼을 지우려다 잠긴 객체가 된다
		b.pressed.connect(func() -> void:
			chosen.emit.call_deferred(String(ch["id"])))
		_choices.add_child(b)
