extends Control
class_name NewGameScreen

## 새 게임 — M7-6d.
##
## 원본: `pages/new-game/NewGamePage.svelte`
##
## ⚠ **여기는 계산을 안 한다.** 팀 목록·시작 가능 여부는 `NewGameVm`이 만든다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _name_label: Label = $Pad/Center/Col/NameLabel
@onready var _name: LineEdit = $Pad/Center/Col/Name
@onready var _team_label: Label = $Pad/Center/Col/TeamLabel
@onready var _team: OptionButton = $Pad/Center/Col/Team
@onready var _back: Button = $Pad/Center/Col/Row/Back
@onready var _start: Button = $Pad/Center/Col/Row/Start

signal start_requested(name: String, team_id: String)
signal back_requested

var _vm: Dictionary = {}

## 이 슬롯에 세이브가 있나 — 있으면 시작이 곧 덮어쓰기다.
##
## ⚠ **`_ready` 전에 정해질 수 있다.** 루트가 씬을 만들자마자 넣으므로
## 여기 값을 들고 있다가 `_ready`에서 읽는다
var overwrite: bool = false


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_title.text = "새 게임"
	_title.add_theme_font_size_override("font_size", AppTheme.FONT_TITLE + 2)
	_name_label.text = "이름"
	_name_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_team_label.text = "학교"
	_team_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_back.text = "돌아가기"

	_vm = NewGameVm.build({"overwrite": overwrite})
	_name.text = _vm["name"]
	for t in _vm["teams"]:
		_team.add_item(t["name"])

	_name.text_changed.connect(func(_t: String) -> void: _update())
	_back.pressed.connect(func() -> void: back_requested.emit.call_deferred())
	_start.pressed.connect(_on_start)
	_update()


func current_team_id() -> String:
	var teams: Array = _vm.get("teams", [])
	var i: int = _team.selected
	if i < 0 or i >= teams.size():
		return ""
	return teams[i]["id"]


## ⚠ **시작 가능 여부를 화면이 다시 판단하지 않는다.** ViewModel에 물어본다
func _update() -> void:
	var vm: Dictionary = NewGameVm.build({
		"name": _name.text, "team_id": current_team_id(),
		"overwrite": overwrite})
	_start.disabled = not bool(vm["can_start"])
	# ⚠ **버튼이 무슨 일이 일어나는지를 말한다.** 되돌릴 수 없는 유일한
	# 동작인데 "시작"이라고만 적혀 있었다
	_start.text = String(vm["start_label"])
	_start.add_theme_color_override("font_color",
		AppTheme.WARN if bool(vm["overwrite"]) else AppTheme.TEXT)


func _on_start() -> void:
	start_requested.emit.call_deferred(_name.text, current_team_id())
