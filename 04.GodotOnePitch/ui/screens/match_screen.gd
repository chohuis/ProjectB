extends Control
class_name MatchScreen

## 경기 화면 — M7-6e1. **뼈대만.**
##
## 원본: `pages/match/MatchPage.svelte` (3,220줄)
##
## ⚠ **여기는 계산을 안 한다.** 이닝·카운트·주자·이름표를 전부 `MatchVm`이
## 만든다 — 02가 3,220줄이 된 이유가 화면이 그걸 직접 읽고 만들어서다.
##
## ⚠ **아직 구장 그림이 없다**(M7-6e3). 지금은 존·구종·전략까지다 —
## **소비자 없는 자리를 미리 만들지 않는다.**

const LOG_LINES: int = 8
## 존 칸 크기. 손가락으로 누를 만해야 한다
const ZONE_CELL: Vector2 = Vector2(40, 40)

@onready var _bg: ColorRect = $Bg
@onready var _away: Label = $Pad/Col/ScoreRow/Away
@onready var _score: Label = $Pad/Col/ScoreRow/Score
@onready var _home: Label = $Pad/Col/ScoreRow/Home
@onready var _inning: Label = $Pad/Col/SituationRow/Inning
@onready var _count: Label = $Pad/Col/SituationRow/Count
@onready var _outs: Label = $Pad/Col/SituationRow/Outs
@onready var _bases: Label = $Pad/Col/SituationRow/Bases
@onready var _matchup: Label = $Pad/Col/Matchup
@onready var _pitcher_line: Label = $Pad/Col/PitcherLine
@onready var _log: VBoxContainer = $Pad/Col/Log
@onready var _result: Label = $Pad/Col/Result
@onready var _pitch: Button = $Pad/Col/Row/Pitch
@onready var _auto: Button = $Pad/Col/Row/Auto
@onready var _done: Button = $Pad/Col/Row/Done
@onready var _choose: HBoxContainer = $Pad/Col/Choose
@onready var _zone_grid: GridContainer = $Pad/Col/Choose/Zone/Grid
@onready var _ball: Button = $Pad/Col/Choose/Zone/Ball
@onready var _pitches: GridContainer = $Pad/Col/Choose/Opts/Pitches
@onready var _strategy: HBoxContainer = $Pad/Col/Choose/Opts/Strategy
@onready var _power: HBoxContainer = $Pad/Col/Choose/Opts/Power

## 한 구 던진다
signal pitch_requested
## 남은 경기를 자동으로 돌린다
signal auto_requested
## 경기 화면을 닫는다
signal done_requested
## 구종·코스·전략을 골랐다. `{pitch_type}` / `{zone}` / `{strategy}` / `{power}`
signal selection_changed(patch: Dictionary)

var _vm: Dictionary = {}


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_pitch.pressed.connect(func() -> void: pitch_requested.emit.call_deferred())
	_auto.pressed.connect(func() -> void: auto_requested.emit.call_deferred())
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


func _rebuild() -> void:
	_away.text = "%s %d" % [_vm.get("away_name", ""), int(_vm.get("away_score", 0))]
	_home.text = "%d %s" % [int(_vm.get("home_score", 0)), _vm.get("home_name", "")]
	_score.text = "—"
	_score.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	_inning.text = _vm.get("inning_label", "")
	_inning.add_theme_color_override("font_color", AppTheme.ACCENT)

	_count.text = "카운트 %s" % _vm.get("count_label", "")
	_count.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	# 2아웃이면 눈에 띄게 — 다음 아웃에 이닝이 끝난다
	var outs: int = int(_vm.get("outs", 0))
	_outs.text = "%d아웃" % outs
	_outs.add_theme_color_override("font_color",
		AppTheme.WARN if outs >= 2 else AppTheme.TEXT_DIM)

	# 주자가 있으면 눈에 띄게 — 실점 위기다
	_bases.text = _vm.get("bases_label", "")
	_bases.add_theme_color_override("font_color",
		AppTheme.TEXT if _vm.get("bases_label", "") != "주자 없음" else AppTheme.TEXT_MUTE)

	_matchup.text = "%s  vs  %s" % [_vm.get("pitcher_name", ""),
		_vm.get("batter_name", "")]

	_pitcher_line.text = _vm.get("pitcher_line_label", "")
	_pitcher_line.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_result.text = _vm.get("result_label", "")
	_result.add_theme_color_override("font_color", AppTheme.ACCENT)

	# ⚠ **누를 수 있는지도 사전이 정한다.** 화면이 "끝났으면 막자"고 다시
	# 판단하면 엔진과 갈린다
	var can: bool = bool(_vm.get("can_pitch", false))
	_pitch.text = "던지기"
	_pitch.disabled = not can
	_auto.text = "끝까지"
	_auto.disabled = not can
	_done.text = "닫기"

	_build_choice()
	_build_log()


## 구종·코스·전략. **주인공이 마운드에 있을 때만 보인다** — 상대가 던질 땐
## 고를 게 없는데 선택 화면이 뜨면 내가 던지는 줄 안다
func _build_choice() -> void:
	var pick: Dictionary = _vm.get("pitch", {})
	_choose.visible = bool(_vm.get("is_my_pitch", false))
	if not _choose.visible:
		return

	_build_zone(int(pick.get("zone", 5)))

	_fill(_pitches, pick.get("pitches", []), pick.get("pitch_type", ""),
		func(id: String) -> void: selection_changed.emit({"pitch_type": id}),
		func(x: Dictionary) -> String: return "%s %d" % [x["label"], int(x["grade"])])
	_fill(_strategy, pick.get("strategies", []), pick.get("strategy", ""),
		func(id: String) -> void: selection_changed.emit({"strategy": id}))
	_fill(_power, pick.get("powers", []), pick.get("power", ""),
		func(id: String) -> void: selection_changed.emit({"power": id}))


## 스트라이크존 3×3. **위가 1~3이다** — 야구 존 번호가 그렇다
func _build_zone(chosen: int) -> void:
	for c in _zone_grid.get_children():
		_zone_grid.remove_child(c)
		c.free()

	for z in range(1, 10):
		var b := Button.new()
		b.text = str(z)
		b.custom_minimum_size = ZONE_CELL
		b.toggle_mode = true
		b.button_pressed = z == chosen
		var zone: int = z
		b.pressed.connect(func() -> void:
			selection_changed.emit.call_deferred({"zone": zone}))
		_zone_grid.add_child(b)

	# ⚠ **의도적 볼임을 화면이 말해야 한다.** 존 밖을 골라 놓고 왜
	# 스트라이크가 안 들어오는지 모르면 안 된다
	_ball.text = "존 밖 (거르기)"
	_ball.toggle_mode = true
	_ball.button_pressed = chosen == PitchVm.BALL_ZONE
	if not _ball.pressed.is_connected(_on_ball):
		_ball.pressed.connect(_on_ball)


func _on_ball() -> void:
	selection_changed.emit.call_deferred({"zone": PitchVm.BALL_ZONE})


## 고를 것 한 줄. **목록도 고른 것도 사전이 정한다** — 화면이 기억을 갖지 않는다
func _fill(box: Container, items: Array, chosen: String, on_pick: Callable,
		label_of: Callable = Callable()) -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.free()

	for x in items:
		var b := Button.new()
		b.text = String(label_of.call(x)) if label_of.is_valid() else String(x["label"])
		b.toggle_mode = true
		b.button_pressed = String(x["id"]) == chosen
		b.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		var id: String = String(x["id"])
		b.pressed.connect(func() -> void: on_pick.call_deferred(id))
		box.add_child(b)


## ⚠ **최근 것만 보여준다.** 경기 하나가 300구라 다 쌓으면 화면이 밀린다
func _build_log() -> void:
	for c in _log.get_children():
		_log.remove_child(c)
		c.free()

	var lines: Array = _vm.get("log", [])
	var start: int = maxi(lines.size() - LOG_LINES, 0)
	for i in range(start, lines.size()):
		var l := Label.new()
		l.text = String(lines[i])
		# 마지막 줄이 방금 일어난 일이다
		l.add_theme_color_override("font_color",
			AppTheme.TEXT if i == lines.size() - 1 else AppTheme.TEXT_MUTE)
		l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		_log.add_child(l)
