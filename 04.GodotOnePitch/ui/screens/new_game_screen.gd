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
@onready var _hand_label: Label = $Pad/Center/Col/HandLabel
@onready var _hand: OptionButton = $Pad/Center/Col/Hand
@onready var _form_label: Label = $Pad/Center/Col/FormLabel
@onready var _form: OptionButton = $Pad/Center/Col/Form
@onready var _form_desc: Label = $Pad/Center/Col/FormDesc
@onready var _birth_label: Label = $Pad/Center/Col/BirthLabel
@onready var _month: OptionButton = $Pad/Center/Col/BirthRow/Month
@onready var _day: OptionButton = $Pad/Center/Col/BirthRow/Day
@onready var _back: Button = $Pad/Center/Col/Row/Back
@onready var _start: Button = $Pad/Center/Col/Row/Start

signal start_requested(profile: Dictionary)
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

	_hand_label.text = "투구 방향"
	_hand_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_form_label.text = "투구 폼"
	_form_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_form_desc.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_form_desc.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	_birth_label.text = "생년월일"
	_birth_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_vm = NewGameVm.build({"overwrite": overwrite})
	_name.text = _vm["name"]
	for t in _vm["teams"]:
		_team.add_item(t["name"])
	for h in _vm["handedness_options"]:
		_hand.add_item(h["label"])
	for f in _vm["form_options"]:
		_form.add_item(f["label"])
	for m in 12:
		_month.add_item("%d월" % (m + 1))
	_month.selected = int(_vm["birth_month"]) - 1
	_fill_days()

	_name.text_changed.connect(func(_t: String) -> void: _update())
	_hand.item_selected.connect(func(_i: int) -> void: _update())
	_form.item_selected.connect(func(_i: int) -> void: _update())
	# ⚠ **달을 바꾸면 날 목록이 바뀐다.** 2월에 31일이 남아 있으면 안 된다
	_month.item_selected.connect(func(_i: int) -> void: _fill_days(); _update())
	_day.item_selected.connect(func(_i: int) -> void: _update())
	_back.pressed.connect(func() -> void: back_requested.emit.call_deferred())
	_start.pressed.connect(_on_start)
	_update()


## 그 달에 있는 날만 남긴다. **고른 날이 넘치면 마지막 날로 당긴다** —
## `NewGameVm`이 같은 판단을 하므로 여기서는 목록만 만든다
func _fill_days() -> void:
	var want: int = _day.selected + 1 if _day.selected >= 0 else int(_vm["birth_day"])
	var last: int = NewGameVm.days_in_month(_month.selected + 1)
	_day.clear()
	for d in last:
		_day.add_item("%d일" % (d + 1))
	_day.selected = mini(want, last) - 1


func current_team_id() -> String:
	var teams: Array = _vm.get("teams", [])
	var i: int = _team.selected
	if i < 0 or i >= teams.size():
		return ""
	return teams[i]["id"]


## 화면이 고른 것 전부. **`start_requested`와 `_update`가 같은 사전을 쓴다** —
## 둘이 갈리면 요약에 뜬 것과 저장된 것이 달라진다
func current_profile() -> Dictionary:
	var hands: Array = _vm.get("handedness_options", [])
	var forms: Array = _vm.get("form_options", [])
	return {
		"name": _name.text,
		"team_id": current_team_id(),
		"handedness": String(hands[_hand.selected]["value"]) \
			if _hand.selected >= 0 and _hand.selected < hands.size() else "R",
		"pitching_form": String(forms[_form.selected]["value"]) \
			if _form.selected >= 0 and _form.selected < forms.size() else "overhand",
		"birth_month": _month.selected + 1,
		"birth_day": _day.selected + 1,
	}


## ⚠ **시작 가능 여부를 화면이 다시 판단하지 않는다.** ViewModel에 물어본다
func _update() -> void:
	var p: Dictionary = current_profile()
	p["overwrite"] = overwrite
	var vm: Dictionary = NewGameVm.build(p)
	_start.disabled = not bool(vm["can_start"])
	# 폼 설명은 고른 것에 따라 바뀐다 — 02도 선택지마다 한 줄을 붙인다
	var forms: Array = vm.get("form_options", [])
	_form_desc.text = String(forms[_form.selected]["desc"]) \
		if _form.selected >= 0 and _form.selected < forms.size() else ""
	# ⚠ **버튼이 무슨 일이 일어나는지를 말한다.** 되돌릴 수 없는 유일한
	# 동작인데 "시작"이라고만 적혀 있었다
	_start.text = String(vm["start_label"])
	_start.add_theme_color_override("font_color",
		AppTheme.WARN if bool(vm["overwrite"]) else AppTheme.TEXT)


func _on_start() -> void:
	start_requested.emit.call_deferred(current_profile())
