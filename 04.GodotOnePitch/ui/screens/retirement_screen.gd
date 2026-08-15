extends Control
class_name RetirementScreen

## 은퇴 결정 · 인생 기록 — C-6.
##
## 원본: `RetirementAskModal.svelte` · `CareerEndScreen.svelte`
##
## ⚠ **은퇴를 누르면 이 화면이 커리어 결산으로 바뀐다.** "결산을 봤는가"
## 플래그를 세이브에 안 만들려는 것이다 — 은퇴하는 그 순간이 곧 첫 관람이고,
## 다시 보는 건 "나" 탭에서 누를 때다.
##
## ⚠ **여기는 계산을 안 한다.** 통산·문구·선택지는 `RetirementVm`이 끝낸다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _body: Label = $Pad/Center/Col/Body
@onready var _scroll: ScrollContainer = $Pad/Center/Col/Scroll
@onready var _list: VBoxContainer = $Pad/Center/Col/Scroll/List
@onready var _retire: Button = $Pad/Center/Col/Row/Retire
@onready var _decline: Button = $Pad/Center/Col/Row/Decline
@onready var _done: Button = $Pad/Center/Col/Row/Done

## 은퇴한다 — 루트가 상태를 고친다
signal retire_requested
## 한 해 더 뛴다
signal keep_playing_requested
## 결산을 닫는다
signal done_requested

var _ask: Dictionary = {}
var _summary: Dictionary = {}
## 결산을 보고 있나. **은퇴를 누른 그 순간부터다**
var _showing_summary: bool = false


## 물어보는 화면으로 연다
func set_ask(ask: Dictionary, summary: Dictionary) -> void:
	_ask = ask
	_summary = summary
	_showing_summary = not bool(ask.get("asking", false))
	if is_node_ready():
		_rebuild()


## 결산만 연다 — "나" 탭에서 다시 볼 때
func set_summary(summary: Dictionary) -> void:
	set_ask({}, summary)


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_retire.pressed.connect(_on_retire)
	_decline.pressed.connect(func() -> void:
		keep_playing_requested.emit.call_deferred())
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


## ⚠ **누른 그 자리에서 결산으로 바꾼다.** 루트가 상태를 고치고 나면
## 사전이 새로 오는데, 그때까지 화면이 질문을 그대로 띄우고 있으면
## 은퇴를 두 번 묻는 것처럼 보인다
func _on_retire() -> void:
	_showing_summary = true
	retire_requested.emit.call_deferred()
	_rebuild.call_deferred()


func _rebuild() -> void:
	if _showing_summary:
		_build_summary()
	else:
		_build_ask()


func _build_ask() -> void:
	_title.text = String(_ask.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_body.text = String(_ask.get("body", ""))
	_body.add_theme_color_override("font_color", AppTheme.TEXT)

	_scroll.visible = false
	_free_all(_list)

	_retire.visible = true
	_retire.text = String(_ask.get("retire_label", ""))
	# ⚠ **부상 강제에는 거절이 없다** — 설계가 그렇게 정했다
	_decline.visible = bool(_ask.get("can_decline", false))
	_decline.text = String(_ask.get("decline_label", ""))
	_done.visible = false


func _build_summary() -> void:
	_title.text = String(_summary.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_body.text = "%s\n%s" % [String(_summary.get("name", "")),
		String(_summary.get("closing", ""))]
	_body.add_theme_color_override("font_color", AppTheme.TEXT)

	_retire.visible = false
	_decline.visible = false
	_done.visible = true
	_done.text = "닫기"

	_scroll.visible = true
	_free_all(_list)

	for t in _summary.get("totals", []):
		_line("%s  %s" % [String(t["label"]), String(t["value"])])

	var awards: Array = _summary.get("awards", [])
	if not awards.is_empty():
		_heading("수상")
		for a in awards:
			_line("%d년  %s" % [int(a["year"]), String(a["name"])])

	var events: Array = _summary.get("events", [])
	if not events.is_empty():
		_heading("커리어")
		for e in events:
			_line("%d년  %s" % [int(e["year"]), String(e["detail"])])

	var years: Array = _summary.get("years", [])
	if years.is_empty():
		_line(String(_summary.get("empty", "")), AppTheme.TEXT_MUTE)
		return
	_heading("해마다")
	for y in years:
		_line("%d년  %s" % [int(y["year"]), String(y["stat_line"])])


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 다시 열 때마다 쌓인다
func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _line(text: String, color: Color = AppTheme.TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	_list.add_child(l)
	return l


func _heading(text: String) -> void:
	var l: Label = _line(text, AppTheme.TEXT_DIM)
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
