extends Control
class_name TeamDetailScreen

## 팀 상세 화면 — F-4b · F-3b.
##
## 원본: `features/team/ui/TeamDetailModal.svelte`
##
## ⚠ **화면은 사전만 받아 글자를 찍는다.** 순위·성향·로스터 정렬은 전부
## ViewModel이 정한다.
##
## ⚠ **로스터 줄을 누르면 선수 상세로 간다** — 팀에서 사람으로 들어가는
## 길이 없으면 로스터가 다시 "이름과 숫자"가 된다.

const CARD := preload("res://ui/parts/card.tscn")
const BAR_ROW := preload("res://ui/parts/bar_row.tscn")
const INFO_ROW := preload("res://ui/parts/info_row.tscn")
const PLAYER_ROW := preload("res://ui/parts/player_row.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _name: Label = $Pad/Col/Head/Name
@onready var _sub: Label = $Pad/Col/Head/Sub
@onready var _body: VBoxContainer = $Pad/Col/Scroll/Body
@onready var _close: Button = $Pad/Col/Close

signal closed
## 로스터에서 선수를 눌렀다
signal player_selected(player_id: String)

var _vm: Dictionary = {}


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_close.pressed.connect(func() -> void: closed.emit())
	_rebuild()


## ⚠ **`Esc`로도 닫힌다.** 열고 못 빠져나오면 진행이 막힌 것처럼 보인다
func _unhandled_key_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	if key.keycode == KEY_ESCAPE:
		closed.emit()
		get_viewport().set_input_as_handled()


func _rebuild() -> void:
	for c in _body.get_children():
		c.queue_free()
	_close.text = "닫기"

	if _vm.is_empty():
		_name.text = "팀을 찾을 수 없습니다"
		_sub.text = ""
		return

	_name.text = String(_vm.get("name", ""))
	_sub.text = _head_line()
	_sub.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_build_standing()
	_build_profile()
	_build_roster()


func _head_line() -> String:
	var parts := PackedStringArray()
	var league: String = String(_vm.get("league_label", ""))
	if not league.is_empty():
		parts.append(league)
	var city: String = String(_vm.get("city", ""))
	if not city.is_empty():
		parts.append(city)
	var stadium: String = String(_vm.get("stadium", ""))
	if not stadium.is_empty():
		# 구장 성향을 이름 옆에 붙인다 — 02 `NewGamePage:644`와 같은 자리다.
		# **없으면 이름만** (해외 구장은 성향이 없다)
		var factor: String = String(_vm.get("park_factor", ""))
		parts.append(stadium if factor.is_empty() else "%s(%s)" % [stadium, factor])
	if bool(_vm.get("is_mine", false)):
		parts.append("내 팀")
	return "  ·  ".join(parts)


func _card(title: String) -> Card:
	var c: Card = CARD.instantiate()
	_body.add_child(c)
	c.setup(title)
	return c


func _build_standing() -> void:
	var st: Dictionary = _vm.get("standing", {})
	if st.is_empty():
		return
	var c: Card = _card("이번 시즌")
	_info(c, "성적", "%d승 %d패 %d무" % [int(st.get("wins", 0)),
		int(st.get("losses", 0)), int(st.get("draws", 0))])
	_info(c, "승률", "%.3f" % float(st.get("win_pct", 0.0)))
	_info(c, "순위", "%d위 / %d팀" % [int(st.get("rank", 0)), int(st.get("total", 0))])


## 구단 성향 열두 축 — F-3에서 살린 것.
##
## ⚠ **02는 이 자리에 다른 걸 보여줬다**(명성 등급·팬덤·시설·분위기).
## 04엔 그 데이터가 없고, 대신 이 열두 축이 FA 입찰·트레이드·승강·방출을
## 실제로 움직인다 — 지금 어디에서도 볼 방법이 없었다
func _build_profile() -> void:
	var rows: Array = _vm.get("profile", [])
	if rows.is_empty():
		return
	var c: Card = _card("구단 성향")
	for r in rows:
		var row: BarRow = BAR_ROW.instantiate()
		c.body.add_child(row)
		row.setup_stat(String(r["name"]), float(r["value"]))


func _build_roster() -> void:
	var rows: Array = _vm.get("roster", [])
	if rows.is_empty():
		return
	var c: Card = _card("선수단 %d명" % rows.size())
	for r in rows:
		var row: PlayerRow = PLAYER_ROW.instantiate()
		c.body.add_child(row)
		row.setup(r)
		var pid: String = String(r.get("id", ""))
		row.pressed.connect(func() -> void: player_selected.emit(pid))


func _info(c: Card, label: String, value: String,
		color: Color = AppTheme.TEXT) -> void:
	var row: InfoRow = INFO_ROW.instantiate()
	c.body.add_child(row)
	row.setup(label, value, color)
