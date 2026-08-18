extends HBoxContainer
class_name ScheduleRow

## 일정 한 줄.
##
## ⚠ **색을 여기서 고르지 않는다.** 상태 이름을 받아 `AppTheme`에서 가져온다 —
## 화면 55개에 색을 흩으면 톤을 바꿀 때 반드시 몇 개는 빠진다.

@onready var _date: Label = $Date
@onready var _mark: Control = $Mark
@onready var _opponent: Label = $Opponent
@onready var _location: Label = $Location
@onready var _status: Label = $Status

var _row: Dictionary = {}


## 상태별 글자. **ViewModel이 상태 이름만 주고 표기는 여기서** —
## 사전에 한국어를 넣으면 나중에 언어를 바꿀 자리가 두 곳이 된다
const STATUS_LABEL: Dictionary = {
	"today": "오늘", "upcoming": "예정", "missed": "미실시", "done": "",
}


static func status_color(status: String, won: bool) -> Color:
	match status:
		"today":
			return AppTheme.ACCENT
		"missed":
			return AppTheme.WARN
		"done":
			return AppTheme.OK if won else AppTheme.TEXT_DIM
		_:
			return AppTheme.TEXT_DIM


func setup(row: Dictionary) -> void:
	_row = row
	if is_node_ready():
		_apply()


func _ready() -> void:
	_apply()


func _apply() -> void:
	if _row.is_empty():
		return
	var status: String = _row.get("status", "")
	var won: bool = _row.get("won", false)

	_date.text = "%s (%s)" % [_row.get("date_label", ""), _row.get("weekday_label", "")]
	_date.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	# 상대 팀 마크 — U-1. **사전이 없으면 안 그린다**
	if _mark != null:
		for c in _mark.get_children():
			_mark.remove_child(c)
			c.free()
		var spec: Dictionary = _row.get("mark", {})
		if not spec.is_empty():
			var tm := TeamMark.new()
			tm.set_anchors_preset(Control.PRESET_FULL_RECT)
			tm.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_mark.add_child(tm)
			tm.setup(spec)

	_opponent.text = _row.get("opponent", "")

	_location.text = _row.get("location", "")
	_location.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)

	# 치른 경기는 결과가 상태를 대신한다 — 둘 다 찍으면 "승 3:1 완료"가 된다
	var result: String = _row.get("result_label", "")
	_status.text = result if not result.is_empty() else STATUS_LABEL.get(status, "")
	_status.add_theme_color_override("font_color", status_color(status, won))
