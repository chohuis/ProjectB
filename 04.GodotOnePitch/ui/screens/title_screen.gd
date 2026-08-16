extends Control
class_name TitleScreen

## 타이틀 — M7-6d. **게임을 켜는 자리.**
##
## ⚠ **진입점이 비어 있었다.** 지금까지는 코드로만 시작할 수 있었다.
##
## ⚠ **여기는 계산을 안 한다.** 슬롯 목록은 `Slots`가 만들고 새 게임은
## `NewGameVm`이 만든다.

const NEW_GAME_SCREEN := preload("res://ui/screens/new_game_screen.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _slots: VBoxContainer = $Pad/Center/Col/Slots
@onready var _status: Label = $Pad/Center/Col/Status
@onready var _settings: Button = $Pad/Center/Col/Settings

## 슬롯을 골라 이어한다
signal continue_requested(slot: int)
## 새 게임을 시작한다
signal new_game_requested(slot: int)
## 설정을 연다 — **창 크기가 여기 말고는 바꿀 데가 없다** (U-4)
signal settings_requested


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_title.text = "OnePitch"
	_title.add_theme_font_size_override("font_size", AppTheme.FONT_TITLE + 6)
	_status.text = ""
	_status.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
	_settings.pressed.connect(func() -> void:
		settings_requested.emit.call_deferred())
	refresh()


func set_status(text: String) -> void:
	_status.text = text


func refresh() -> void:
	for c in _slots.get_children():
		_slots.remove_child(c)
		c.free()

	for row in Slots.list():
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 6)
		_slots.add_child(line)

		var num := Label.new()
		num.text = "%d." % row["slot"]
		num.custom_minimum_size = Vector2(24, 0)
		num.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		line.add_child(num)

		var label := Label.new()
		label.text = row["label"]
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.clip_text = true
		# ⚠ **깨진 슬롯을 빈 슬롯처럼 보이면 안 된다.** 그러면 사용자가
		# 세이브가 사라진 줄 알고 그 위에 덮어쓴다
		label.add_theme_color_override("font_color",
			AppTheme.BAD if row["broken"] else
			(AppTheme.TEXT_MUTE if row["empty"] else AppTheme.TEXT))
		line.add_child(label)

		var slot: int = row["slot"]
		if not row["empty"] and not row["broken"]:
			var go := Button.new()
			go.text = "이어하기"
			go.pressed.connect(func() -> void:
				continue_requested.emit.call_deferred(slot))
			line.add_child(go)

		var fresh := Button.new()
		fresh.text = "새 게임" if row["empty"] else "덮어쓰기"
		fresh.pressed.connect(func() -> void:
			new_game_requested.emit.call_deferred(slot))
		line.add_child(fresh)
