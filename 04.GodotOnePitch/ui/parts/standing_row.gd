extends HBoxContainer
class_name StandingRow

## 순위표 한 줄.
##
## ⚠ **색을 여기서 고르지 않는다.** `AppTheme`에서 가져온다.

@onready var _rank: Label = $Rank
@onready var _name: Label = $Name
@onready var _record: Label = $Record
@onready var _pct: Label = $Pct

var _row: Dictionary = {}


## 내 팀은 눈에 띄어야 한다 — 10팀이면 찾기 어렵다
static func row_color(is_mine: bool) -> Color:
	return AppTheme.ACCENT if is_mine else AppTheme.TEXT


func setup(row: Dictionary) -> void:
	_row = row
	if is_node_ready():
		_apply()


func _ready() -> void:
	_apply()


func _apply() -> void:
	if _row.is_empty():
		return
	var mine: bool = _row.get("is_mine", false)
	var c: Color = row_color(mine)

	_rank.text = str(_row.get("rank", 0))
	_rank.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	_name.text = _row.get("name", "")
	_name.add_theme_color_override("font_color", c)

	_record.text = "%d승 %d무 %d패" % [
		int(_row.get("wins", 0)), int(_row.get("draws", 0)), int(_row.get("losses", 0))]
	_record.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	# 승률은 관례대로 소수 셋째 자리까지, 앞 0을 뗀다 (.667)
	_pct.text = ("%.3f" % float(_row.get("win_pct", 0.0))).trim_prefix("0")
	_pct.add_theme_color_override("font_color", c)
