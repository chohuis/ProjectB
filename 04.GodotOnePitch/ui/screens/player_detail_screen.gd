extends Control
class_name PlayerDetailScreen

## 선수 상세 화면 — F-4.
##
## 원본: `features/player/ui/PlayerDetailModal.svelte`
##
## ⚠ **화면은 사전만 받아 글자를 찍는다.** 능력치 색·관계 이름·병역 문구는
## 전부 부품과 ViewModel이 정한다 — 여기서 다시 고르면 같은 값이 화면마다
## 다르게 뜬다.
##
## ⚠ **02는 모달이었지만 04는 화면이다.** 04의 다른 상세(결산·결정·훈련)가
## 전부 화면 전환이라 여기만 모달이면 닫는 법이 하나 더 생긴다.

const CARD := preload("res://ui/parts/card.tscn")
const BAR_ROW := preload("res://ui/parts/bar_row.tscn")
const INFO_ROW := preload("res://ui/parts/info_row.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _name: Label = $Pad/Col/Head/Name
@onready var _sub: Label = $Pad/Col/Head/Sub
@onready var _body: VBoxContainer = $Pad/Col/Scroll/Body
@onready var _close: Button = $Pad/Col/Close

## 닫는다
signal closed

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


## ⚠ **`Esc`로도 닫힌다.** 상세를 열고 못 빠져나오면 진행이 막힌 것처럼 보인다
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
		_name.text = "선수를 찾을 수 없습니다"
		_sub.text = ""
		return

	_name.text = String(_vm.get("name", ""))
	_sub.text = _head_line()
	_sub.add_theme_color_override("font_color", AppTheme.TEXT_DIM)

	_build_stats()
	_build_contract()
	_build_military()
	_build_season()
	_build_relation()


## 포지션 · 소속 · 나이 · OVR 한 줄. **OVR을 여기 둔다** — 상세를 여는
## 이유의 절반이 "이 선수가 얼마나 좋은가"다
func _head_line() -> String:
	var parts := PackedStringArray()
	var pos: String = String(_vm.get("position", ""))
	if not pos.is_empty():
		parts.append(pos)
	var team: String = String(_vm.get("team_name", ""))
	if not team.is_empty():
		parts.append(team)
	var league: String = String(_vm.get("league_label", ""))
	if not league.is_empty():
		parts.append(league)
	var age: int = int(_vm.get("age", 0))
	if age > 0:
		parts.append("%d세" % age)
	var hand: String = String(_vm.get("handedness", ""))
	if not hand.is_empty():
		parts.append(hand)
	parts.append("OVR %d" % int(_vm.get("ovr", 0)))
	return "  ·  ".join(parts)


func _card(title: String) -> Card:
	var c: Card = CARD.instantiate()
	_body.add_child(c)
	c.setup(title)
	return c


func _build_stats() -> void:
	var rows: Array = _vm.get("stats", [])
	if rows.is_empty():
		return
	var c: Card = _card("투구 능력치" if _vm.get("is_pitcher", false) else "타격 능력치")
	for r in rows:
		var row: BarRow = BAR_ROW.instantiate()
		c.body.add_child(row)
		row.setup_stat(String(r["name"]), float(r["value"]))


func _build_contract() -> void:
	var con: Dictionary = _vm.get("contract", {})
	if con.is_empty():
		return
	var c: Card = _card("계약")
	# ⚠ **금액 표기는 `FinanceVm.won`이 정본이다** — 여기서 따로 찍으면
	# 재정 화면과 같은 연봉이 다른 모양으로 뜬다(1억 vs 10,000만원)
	_info(c, "연봉", FinanceVm.won(int(con.get("salary", 0))))
	var left: int = int(con.get("years_left", 0))
	_info(c, "남은 계약", "%d년" % left if left > 0 else "만료")
	if bool(con.get("fa_eligible", false)):
		_info(c, "FA", "자격 보유", AppTheme.ACCENT)


func _build_military() -> void:
	var m: Dictionary = _vm.get("military", {})
	if m.is_empty():
		return
	var c: Card = _card("병역")
	_info(c, "상태", String(m.get("status", "")))
	var unit: String = String(m.get("unit_label", ""))
	if not unit.is_empty():
		_info(c, "복무", unit)
	if bool(m.get("serving", false)):
		_info(c, "남은 복무", "%d주" % int(m.get("weeks_left", 0)))


func _build_season() -> void:
	var rows: Array = _vm.get("season", [])
	if rows.is_empty():
		return
	var c: Card = _card("이번 시즌")
	for r in rows:
		_info(c, String(r["name"]), String(r["value"]))


func _build_relation() -> void:
	var rel: Dictionary = _vm.get("relation", {})
	if rel.is_empty():
		return
	var c: Card = _card("관계")
	_info(c, String(rel.get("label", "")), "%d" % int(rel.get("value", 0)),
		AppTheme.TONE_COLOR.get(String(rel.get("tone", "")), AppTheme.TEXT_DIM))


func _info(c: Card, label: String, value: String,
		color: Color = AppTheme.TEXT) -> void:
	var row: InfoRow = INFO_ROW.instantiate()
	c.body.add_child(row)
	row.setup(label, value, color)

