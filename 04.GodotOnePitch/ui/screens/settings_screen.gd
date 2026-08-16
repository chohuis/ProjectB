extends Control
class_name SettingsScreen

## 설정 화면 — 창 크기와 전체화면. U-4.
##
## ⚠ **여기는 값을 안 들고 있다.** `Settings`가 정본이고 화면은 물어봐서
## 그린다 — 화면이 들고 있으면 창틀을 끌어 크기를 바꿨을 때 갈린다.
##
## ⚠ **넣지 않은 것**: 테마 · 언어 · 연출 속도 · 모션 줄이기.
## 04는 한국어 단일이고 톤이 하나이며 **연출 속도가 볼 값이 어디에도 없다** —
## 스위치만 만들면 그게 죽은 배선이다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _size_label: Label = $Pad/Center/Col/SizeLabel
@onready var _sizes: VBoxContainer = $Pad/Center/Col/Sizes
@onready var _fullscreen: CheckBox = $Pad/Center/Col/Fullscreen
@onready var _back: Button = $Pad/Center/Col/Back

signal back_requested


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_title.add_theme_font_size_override("font_size", AppTheme.FONT_TITLE + 4)
	_size_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_back.pressed.connect(func() -> void: back_requested.emit.call_deferred())
	_fullscreen.toggled.connect(func(on: bool) -> void:
		Settings.set_fullscreen(on)
		_rebuild.call_deferred())
	_rebuild()


func _rebuild() -> void:
	var now: Dictionary = Settings.of()

	for c in _sizes.get_children():
		_sizes.remove_child(c)
		c.free()

	var group := ButtonGroup.new()
	for size in Settings.SIZES:
		var b := Button.new()
		b.text = Settings.size_label(size)
		b.toggle_mode = true
		b.button_group = group
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.focus_mode = Control.FOCUS_NONE
		# 전체화면일 땐 어느 크기도 안 켜진다 — 지금 보이는 것과 맞춘다
		b.button_pressed = not bool(now["fullscreen"]) and size == now["size"]
		# ⚠ **미뤄서 보낸다.** 누르면 목록을 다시 그리는데, 바로 하면
		# 자기를 부른 버튼을 지우려다 잠긴 객체가 된다
		b.pressed.connect(func() -> void:
			Settings.set_size(size)
			_rebuild.call_deferred())
		_sizes.add_child(b)

	_fullscreen.set_pressed_no_signal(bool(now["fullscreen"]))
