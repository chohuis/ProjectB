extends Control
class_name StatusScreen

## 선수 상태 화면 — **P5 화면 55개의 규약을 정하는 슬라이스.**
##
## 원본: `02.SvelteElectron/apps/ui/src/pages/status/StatusPage.svelte` (1,004줄)
##
## 여기서 정하는 것:
##   ① 화면은 **표시만 한다.** 계산·판정은 안 한다
##   ② 데이터는 **`ViewModel` 사전 하나**로 받는다. 스토어를 직접 안 읽는다
##   ③ 부품은 **씬을 인스턴스화**해서 쓴다. 색·여백은 `AppTheme`에서만
##
## ⚠ **②가 제일 중요하다.** 이전 프로젝트의 결함 상당수가 "화면이 계산을
## 갖고 있어서" 생겼다 — 수상 집계가 결산 모달에만 있었고, 드래프트 보드가
## 자기 후보 풀을 따로 만들었고, 경력 기록 조립이 모달 안에만 있었다.
## 화면이 사전 하나만 받으면 그런 게 구조적으로 불가능하다.
##
## 그래서 이 화면은 **게임 상태를 몰라도 뜬다.** 검사가 가짜 사전으로 띄운다.
##
## ⚠ 골격(배경·스크롤·탭)은 `status_screen.tscn`에 있다. 여기서는 **카드만
## 만들어 붙인다** — 레이아웃을 코드로 다시 짜면 씬을 만든 의미가 없다.

const CARD := preload("res://ui/parts/card.tscn")
const INFO_ROW := preload("res://ui/parts/info_row.tscn")
const BADGE := preload("res://ui/parts/badge.tscn")
const BAR_ROW := preload("res://ui/parts/bar_row.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _col: VBoxContainer = $Scroll/Col
@onready var _tabs: HBoxContainer = $Scroll/Col/Tabs
@onready var _tab_host: VBoxContainer = $Scroll/Col/TabHost

var _vm: Dictionary = {}
var _tab: int = 0


## 사전을 넣는다. `_ready` 전후 어느 때든 부를 수 있다
func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG

	_build_tabs()
	_rebuild()


func _build_tabs() -> void:
	var group := ButtonGroup.new()
	var labels := PackedStringArray(["능력치", "기록", "커리어"])
	for i in labels.size():
		var b := Button.new()
		b.text = labels[i]
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == 0)
		b.focus_mode = Control.FOCUS_NONE
		var idx := i
		b.pressed.connect(func() -> void: _on_tab(idx))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	_rebuild_tab()


func _rebuild() -> void:
	for c in _col.get_children():
		if c != _tabs and c != _tab_host:
			c.queue_free()
	# 탭 줄 앞에 카드 둘을 끼운다
	_col.add_child(_body_card())
	_col.move_child(_col.get_child(_col.get_child_count() - 1), 0)
	_col.add_child(_contract_card())
	_col.move_child(_col.get_child(_col.get_child_count() - 1), 1)
	_rebuild_tab()


func _rebuild_tab() -> void:
	for c in _tab_host.get_children():
		c.queue_free()
	match _tab:
		0: _tab_host.add_child(_pitching_card())
		1: _tab_host.add_child(_season_card())
		2: _tab_host.add_child(_career_card())


# ── 부품 만들기 ────────────────────────────────────────────────────

func _card(title: String) -> Card:
	var c: Card = CARD.instantiate()
	c.setup(title)
	return c


func _row(label: String, value: String, c: Color = AppTheme.TEXT) -> InfoRow:
	var r: InfoRow = INFO_ROW.instantiate()
	r.setup(label, value, c)
	return r


func _badge(text: String, c: Color) -> Badge:
	var b: Badge = BADGE.instantiate()
	b.setup(text, c)
	return b


func _bar(label: String, ratio: float, right: String, c: Color) -> BarRow:
	var b: BarRow = BAR_ROW.instantiate()
	b.setup(label, ratio, right, c)
	return b


# ── 카드 ───────────────────────────────────────────────────────────

func _body_card() -> Card:
	var c := _card("신체 상태")
	var inj: Dictionary = _vm.get("injury", {})

	if inj.is_empty():
		c.body.add_child(_badge("이상 없음", AppTheme.OK))
	else:
		var sev: String = inj.get("severity", "light")
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", AppTheme.GAP)
		row.add_child(_badge(inj.get("severity_label", sev), AppTheme.SEV_COLOR.get(sev, AppTheme.WARN)))
		var nm := Label.new()
		nm.text = inj.get("name", "")
		row.add_child(nm)
		c.body.add_child(row)

		var left: int = inj.get("weeks_left", 0)
		var total: int = maxi(1, inj.get("weeks_total", 1))
		c.body.add_child(_bar("회복", 1.0 - float(left) / float(total), "%d주 남음" % left, AppTheme.OK))

	var history: Array = _vm.get("injury_history", [])
	if not history.is_empty():
		var t := Label.new()
		t.text = "부상 이력"
		t.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		t.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		c.body.add_child(t)
		for h in history:
			c.body.add_child(_row(
				"%d년 %d주  %s" % [h.get("year", 0), h.get("week", 0), h.get("name", "")],
				h.get("severity_label", ""),
				AppTheme.SEV_COLOR.get(h.get("severity", "light"), AppTheme.TEXT_DIM),
			))
	return c


func _contract_card() -> Card:
	var c := _card("계약 정보")
	var ct: Dictionary = _vm.get("contract", {})
	if ct.is_empty():
		c.body.add_child(_row("소속", _vm.get("team_name", "-")))
		return c
	c.body.add_child(_row("소속", "%s · %s" % [_vm.get("team_name", "-"), _vm.get("league_short", "")]))
	c.body.add_child(_row("연봉", ct.get("salary_text", "-")))
	c.body.add_child(_row("잔여 기간", ct.get("remaining_text", "-")))
	c.body.add_child(_row("FA 자격", ct.get("fa_text", "-")))
	return c


func _pitching_card() -> Card:
	var c := _card("투구 능력치")
	var pitches: Array = _vm.get("pitches", [])
	if not pitches.is_empty():
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		for p in pitches:
			row.add_child(_badge("%s %d" % [p.get("name", ""), p.get("grade", 0)], AppTheme.ACCENT))
		c.body.add_child(row)
	for s in _vm.get("pitching", []):
		var b: BarRow = BAR_ROW.instantiate()
		b.setup_stat(s.get("name", ""), s.get("value", 0.0))
		c.body.add_child(b)
	return c


func _season_card() -> Card:
	var c := _card(_vm.get("season_title", "시즌 누적"))
	for r in _vm.get("season_stats", []):
		c.body.add_child(_row(r.get("name", ""), r.get("value", "")))
	return c


func _career_card() -> Card:
	var c := _card("시즌별 성적")
	var rows: Array = _vm.get("career", [])
	if rows.is_empty():
		var l := Label.new()
		l.text = "아직 기록이 없습니다"
		l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		c.body.add_child(l)
		return c
	for r in rows:
		c.body.add_child(_row("%d  %s" % [r.get("year", 0), r.get("team", "")], r.get("stat_line", "")))
		var awards: Array = r.get("awards", [])
		if not awards.is_empty():
			var h := HBoxContainer.new()
			h.add_theme_constant_override("separation", 4)
			for a in awards:
				h.add_child(_badge(a, AppTheme.WARN))
			c.body.add_child(h)
	return c
