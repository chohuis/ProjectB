extends Button
class_name StandingRow

## 순위표 한 줄. **누르면 팀 상세가 열린다** (F-4b).
##
## ⚠ **색을 여기서 고르지 않는다.** `AppTheme`에서 가져온다.
##
## ⚠ **자식은 클릭을 안 먹는다.** `mouse_filter`를 무시로 두지 않으면
## 라벨이 눌림을 가로채 버튼이 안 눌린다(`action_row.gd`가 같은 함정을 적어 뒀다).

@onready var _rank: Label = $Pad/Row/Rank
@onready var _name: Label = $Pad/Row/Name
@onready var _record: Label = $Pad/Row/Record
@onready var _pct: Label = $Pad/Row/Pct

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
	if _rank == null:
		_rank = get_node_or_null("Pad/Row/Rank")
		_name = get_node_or_null("Pad/Row/Name")
		_record = get_node_or_null("Pad/Row/Record")
		_pct = get_node_or_null("Pad/Row/Pct")
	if _row.is_empty() or _rank == null:
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
