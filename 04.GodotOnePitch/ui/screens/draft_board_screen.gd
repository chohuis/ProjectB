extends Control
class_name DraftBoardScreen

## 드래프트 보드 — C-1.
##
## 원본: `features/career/ui/DraftBoardModal.svelte`
##
## ⚠ **여기는 계산을 안 한다.** 라운드 묶기·순번 정렬·팀 이름 붙이기는
## 전부 `DraftBoardVm`이 끝낸다 — 02는 이 모달이 자기 후보 풀까지 만들어서
## **화면에서 본 지명과 실제 소속이 어긋났다.**

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _summary: Label = $Pad/Center/Col/Summary
@onready var _my_pick: Label = $Pad/Center/Col/MyPick
@onready var _body: VBoxContainer = $Pad/Center/Col/Scroll/Body
@onready var _done: Button = $Pad/Center/Col/Row/Done

## 보드를 닫는다
signal done_requested

var _vm: Dictionary = {}


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


func _rebuild() -> void:
	_title.text = String(_vm.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_summary.text = String(_vm.get("summary", ""))
	_summary.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_done.text = "닫기"

	# ⚠ **내가 어디서 뽑혔는지가 제일 먼저 보여야 한다.** 백 명 넘는 명단에서
	# 자기 줄을 찾게 만들면 안 된다
	var mine: Dictionary = _vm.get("my_pick", {})
	if mine.is_empty():
		_my_pick.text = ""
		_my_pick.visible = false
	else:
		_my_pick.visible = true
		_my_pick.text = "나 — %s %s · %s" % [String(mine["team_name"]),
			String(mine["pick_label"]), "%d라운드" % int(mine["round"])]
		_my_pick.add_theme_color_override("font_color", AppTheme.ACCENT)

	_build_body()


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 다시 열 때마다 쌓인다 — 진행 화면에서 고아 430개가 실제로 나왔다
func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _build_body() -> void:
	_free_all(_body)
	if not bool(_vm.get("has_data", false)):
		_line("아직 드래프트가 열리지 않았습니다", AppTheme.TEXT_MUTE)
		return

	for r in _vm.get("rounds", []):
		_heading(String(r["label"]))
		for p in r["picks"]:
			_pick_row(p)

	var missed: Array = _vm.get("missed", [])
	if missed.is_empty():
		return
	# **보드에 올랐지만 안 뽑힌 사람** — "몇 명 중 몇 명"이 보드의 뜻이다
	_heading("미지명 %d명" % missed.size())
	for m in missed:
		_pick_row(m)


func _line(text: String, color: Color = AppTheme.TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	_body.add_child(l)
	return l


func _heading(text: String) -> void:
	var l: Label = _line(text, AppTheme.TEXT_DIM)
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)


## 한 줄. **내 줄은 눈에 띄게** — 나머지는 조용히
func _pick_row(p: Dictionary) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_body.add_child(row)

	var mine: bool = bool(p.get("is_mine", false))
	var color: Color = AppTheme.ACCENT if mine else AppTheme.TEXT

	var left := Label.new()
	left.text = "%s  %s" % [String(p["pick_label"]), String(p["name"])]
	left.add_theme_color_override("font_color", color)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)

	var right := Label.new()
	right.text = "%s · %s · %s · OVR %d" % [String(p["team_name"]),
		String(p["origin"]), String(p["position"]), int(p["ovr"])]
	right.add_theme_color_override("font_color",
		color if mine else AppTheme.TEXT_DIM)
	row.add_child(right)
