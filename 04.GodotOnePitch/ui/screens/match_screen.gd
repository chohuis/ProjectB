extends Control
class_name MatchScreen

## 경기 화면 — M7-6e1. **뼈대만.**
##
## 원본: `pages/match/MatchPage.svelte` (3,220줄)
##
## ⚠ **여기는 계산을 안 한다.** 이닝·카운트·주자·이름표를 전부 `MatchVm`이
## 만든다 — 02가 3,220줄이 된 이유가 화면이 그걸 직접 읽고 만들어서다.
##
## ⚠ **아직 스트라이크존도 구종 선택도 없다**(M7-6e2·e3). 지금은 한 구씩
## 던지고 결과를 보는 것까지다 — **소비자 없는 자리를 미리 만들지 않는다.**

const LOG_LINES: int = 8

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

## 한 구 던진다
signal pitch_requested
## 남은 경기를 자동으로 돌린다
signal auto_requested
## 경기 화면을 닫는다
signal done_requested

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

	_build_log()


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
