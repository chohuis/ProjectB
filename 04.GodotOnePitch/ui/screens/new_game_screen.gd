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
@onready var _regions: ItemList = $Pad/Center/Col/Pick/Regions
@onready var _teams: ItemList = $Pad/Center/Col/Pick/Teams
@onready var _detail: VBoxContainer = $Pad/Center/Col/Pick/Detail
@onready var _preset_label: Label = $Pad/Center/Col/PresetLabel
@onready var _preset: OptionButton = $Pad/Center/Col/Preset
@onready var _preset_desc: Label = $Pad/Center/Col/PresetDesc
@onready var _preset_stats: Label = $Pad/Center/Col/PresetStats
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

## 고른 권역·학교. **화면은 고른 것만 들고 목록은 ViewModel이 만든다**
var _region_id: String = ""
var _team_id: String = ""

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

	_preset_label.text = "유형"
	_preset_label.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_preset_desc.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_preset_desc.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	_preset_stats.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
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
	_region_id = String(_vm["region_id"])
	_team_id = String(_vm["team_id"])
	for p in _vm["presets"]:
		_preset.add_item(String(p["label"]))
	for h in _vm["handedness_options"]:
		_hand.add_item(h["label"])
	for f in _vm["form_options"]:
		_form.add_item(f["label"])
	for m in 12:
		_month.add_item("%d월" % (m + 1))
	_month.selected = int(_vm["birth_month"]) - 1
	_fill_days()

	_name.text_changed.connect(func(_t: String) -> void: _update())
	_preset.item_selected.connect(func(_i: int) -> void: _fill_preset(); _update())
	_hand.item_selected.connect(func(_i: int) -> void: _update())
	_form.item_selected.connect(func(_i: int) -> void: _update())
	# ⚠ **달을 바꾸면 날 목록이 바뀐다.** 2월에 31일이 남아 있으면 안 된다
	_month.item_selected.connect(func(_i: int) -> void: _fill_days(); _update())
	_day.item_selected.connect(func(_i: int) -> void: _update())
	_regions.item_selected.connect(func(i: int) -> void: _on_region.call_deferred(i))
	_teams.item_selected.connect(func(i: int) -> void: _on_team.call_deferred(i))
	_back.pressed.connect(func() -> void: back_requested.emit.call_deferred())
	_start.pressed.connect(_on_start)
	_refresh_pick()


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
	return _team_id


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
		"preset": current_preset_id(),
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


## 권역과 학교를 다시 그린다. **2단이다** — 02가 그렇게 고르게 한 이유가
## 주석에 있다: 고교는 권역이 라이벌과 일정을 정한다.
##
## ⚠ **한 줄에 102개를 늘어놓지 않는다.** 04는 드롭다운 하나였다
func _fill_regions() -> void:
	_regions.clear()
	var list: Array = _vm.get("regions", [])
	for i in list.size():
		_regions.add_item("%s  %s" % [String(list[i]["label"]),
			String(list[i]["count_label"])])
		if String(list[i]["id"]) == _region_id:
			_regions.select(i)


func _fill_teams() -> void:
	_teams.clear()
	var list: Array = _vm.get("region_teams", [])
	for i in list.size():
		# 센 학교부터 나온다 — 전력을 같이 적어야 그 순서가 보인다
		_teams.add_item("%s  전력 %d" % [String(list[i]["name"]),
			int(list[i]["power"])])
		if String(list[i]["id"]) == _team_id:
			_teams.select(i)


## 고른 학교가 어떤 곳인가. **04에 있는 것만 낸다** — 02의 창단·예산·
## 과거 성적은 `teams.json`에 없다
func _fill_detail() -> void:
	for c in _detail.get_children():
		_detail.remove_child(c)
		c.free()
	var d: Dictionary = _vm.get("team_detail", {})
	if d.is_empty():
		return

	# 마크를 이름 옆에 — 고르는 자리라 크게 띄운다
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	_detail.add_child(top)

	var spec: Dictionary = d.get("mark", {})
	if not spec.is_empty():
		var tm := TeamMark.new()
		tm.custom_minimum_size = Vector2(40, 40)
		tm.mouse_filter = Control.MOUSE_FILTER_IGNORE
		top.add_child(tm)
		tm.setup(spec)

	var head := Label.new()
	head.text = String(d["name"])
	head.add_theme_color_override("font_color", AppTheme.ACCENT)
	head.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(head)

	for r in d.get("rows", []):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		_detail.add_child(row)

		var a := Label.new()
		a.text = String(r["label"])
		a.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		a.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(a)

		var b := Label.new()
		b.text = String(r["value"])
		b.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		row.add_child(b)


## 권역을 바꾸면 그 안의 첫 학교로 간다. **학교를 안 비운다** —
## 비우면 시작 버튼이 잠기고 왜 잠겼는지 안 보인다
func _on_region(i: int) -> void:
	var list: Array = _vm.get("regions", [])
	if i < 0 or i >= list.size():
		return
	_region_id = String(list[i]["id"])
	_team_id = ""
	_refresh_pick()


func _on_team(i: int) -> void:
	var list: Array = _vm.get("region_teams", [])
	if i < 0 or i >= list.size():
		return
	_team_id = String(list[i]["id"])
	_refresh_pick()


## 고른 것을 ViewModel에 다시 물어 그린다 — **화면이 목록을 만들지 않는다**
func _refresh_pick() -> void:
	var p: Dictionary = current_profile()
	p["overwrite"] = overwrite
	p["region_id"] = _region_id
	_vm = NewGameVm.build(p)
	_region_id = String(_vm.get("region_id", _region_id))
	_team_id = String(_vm.get("team_id", _team_id))
	_fill_regions()
	_fill_teams()
	_fill_detail()
	_fill_preset()
	_update()


## 고른 유형이 어떤 투수인가. **숫자는 ViewModel이 만든다**
func _fill_preset() -> void:
	var list: Array = _vm.get("presets", [])
	var i: int = _preset.selected
	if i < 0 or i >= list.size():
		return
	var p: Dictionary = list[i]
	_preset_desc.text = String(p["desc"])
	var parts := PackedStringArray()
	for r in p["rows"]:
		parts.append("%s %d" % [String(r["label"]), int(r["value"])])
	# 구종을 같이 적는다 — 능력치만 보면 왜 제구형이 체인지업을 받는지 안 보인다
	_preset_stats.text = "%s   구종  %s" % [" · ".join(parts),
		String(p["pitch_label"])]


func current_preset_id() -> String:
	var list: Array = _vm.get("presets", [])
	var i: int = _preset.selected
	if i < 0 or i >= list.size():
		return ""
	return String(list[i]["id"])
