extends Control
class_name StatusScreen

## 선수 상태 화면 — **P5 화면 55개의 규약을 정하는 슬라이스.**
##
## 원본: `02.SvelteElectron/apps/ui/src/pages/status/StatusPage.svelte` (1,004줄)
##
## 여기서 정하는 것:
##   ① 화면은 **표시만 한다.** 계산·판정은 안 한다
##   ② 데이터는 **`ViewModel` 사전 하나**로 받는다. 스토어를 직접 안 읽는다
##   ③ 부품은 `Parts`에서만 가져온다. 색·여백은 `AppTheme`에서만
##
## ⚠ **②가 제일 중요하다.** 이전 프로젝트의 결함 상당수가 "화면이 계산을
## 갖고 있어서" 생겼다 — 수상 집계가 결산 모달에만 있었고, 드래프트 보드가
## 자기 후보 풀을 따로 만들었고, 경력 기록 조립이 모달 안에만 있었다.
## 화면이 사전 하나만 받으면 그런 게 구조적으로 불가능하다.
##
## 그래서 이 화면은 **게임 상태를 몰라도 뜬다.** 검사가 가짜 사전으로 띄운다.

var _vm: Dictionary = {}
var _tab: int = 0
var _tab_host: VBoxContainer


func _init(vm: Dictionary = {}) -> void:
	_vm = vm


func _ready() -> void:
	theme = AppTheme.build()

	# ⚠ **`Control`을 `Window`에 직접 붙이면 앵커가 자동으로 안 먹는다.**
	# 처음엔 `set_anchors_preset(PRESET_FULL_RECT)`만 걸었는데 루트 크기가
	# 0×0으로 남아 **회색 판만 찍혔다** — 안쪽 `col`은 420×629로 멀쩡했다.
	# 뷰포트 크기를 직접 받고, 창이 바뀌면 따라가게 붙인다.
	_fit_to_viewport()
	get_viewport().size_changed.connect(_fit_to_viewport)

	var bg := ColorRect.new()
	bg.color = AppTheme.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var scroll := ScrollContainer.new()
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scroll)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", AppTheme.GAP)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.custom_minimum_size.x = 420
	scroll.add_child(col)

	col.add_child(_body_card())
	col.add_child(_contract_card())
	col.add_child(Parts.tabs(PackedStringArray(["능력치", "기록", "커리어"]), _on_tab))
	_tab_host = VBoxContainer.new()
	_tab_host.add_theme_constant_override("separation", AppTheme.GAP)
	col.add_child(_tab_host)
	_rebuild_tab()


func _fit_to_viewport() -> void:
	var vp := get_viewport()
	if vp:
		size = vp.get_visible_rect().size
		position = Vector2.ZERO


func _on_tab(i: int) -> void:
	_tab = i
	_rebuild_tab()


func _rebuild_tab() -> void:
	if _tab_host == null:
		return
	for c in _tab_host.get_children():
		c.queue_free()
	match _tab:
		0: _tab_host.add_child(_pitching_card())
		1: _tab_host.add_child(_season_card())
		2: _tab_host.add_child(_career_card())


# ── 카드 ───────────────────────────────────────────────────────────

## 신체 상태 — 부상 여부·회복·이력
func _body_card() -> PanelContainer:
	var c := Parts.card("신체 상태")
	var v := Parts.body(c)
	var inj: Dictionary = _vm.get("injury", {})

	if inj.is_empty():
		v.add_child(Parts.badge("이상 없음", AppTheme.OK))
	else:
		var sev: String = inj.get("severity", "light")
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", AppTheme.GAP)
		row.add_child(Parts.badge(inj.get("severity_label", sev), AppTheme.SEV_COLOR.get(sev, AppTheme.WARN)))
		var nm := Label.new()
		nm.text = inj.get("name", "")
		row.add_child(nm)
		v.add_child(row)

		var left: int = inj.get("weeks_left", 0)
		var total: int = maxi(1, inj.get("weeks_total", 1))
		v.add_child(Parts.bar_row("회복", 1.0 - float(left) / float(total), "%d주 남음" % left, AppTheme.OK))

	var history: Array = _vm.get("injury_history", [])
	if not history.is_empty():
		var t := Label.new()
		t.text = "부상 이력"
		t.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		t.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		v.add_child(t)
		for h in history:
			v.add_child(Parts.info_row(
				"%d년 %d주  %s" % [h.get("year", 0), h.get("week", 0), h.get("name", "")],
				h.get("severity_label", ""),
				AppTheme.SEV_COLOR.get(h.get("severity", "light"), AppTheme.TEXT_DIM),
			))
	return c


func _contract_card() -> PanelContainer:
	var c := Parts.card("계약 정보")
	var v := Parts.body(c)
	var ct: Dictionary = _vm.get("contract", {})
	if ct.is_empty():
		v.add_child(Parts.info_row("소속", _vm.get("team_name", "-")))
		return c
	v.add_child(Parts.info_row("소속", "%s · %s" % [_vm.get("team_name", "-"), _vm.get("league_short", "")]))
	v.add_child(Parts.info_row("연봉", ct.get("salary_text", "-")))
	v.add_child(Parts.info_row("잔여 기간", ct.get("remaining_text", "-")))
	v.add_child(Parts.info_row("FA 자격", ct.get("fa_text", "-")))
	return c


func _pitching_card() -> PanelContainer:
	var c := Parts.card("투구 능력치")
	var v := Parts.body(c)
	var pitches: Array = _vm.get("pitches", [])
	if not pitches.is_empty():
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		for p in pitches:
			row.add_child(Parts.badge("%s %d" % [p.get("name", ""), p.get("grade", 0)], AppTheme.ACCENT))
		v.add_child(row)
	for s in _vm.get("pitching", []):
		v.add_child(Parts.stat_row(s.get("name", ""), s.get("value", 0.0)))
	return c


func _season_card() -> PanelContainer:
	var c := Parts.card(_vm.get("season_title", "시즌 누적"))
	var v := Parts.body(c)
	for r in _vm.get("season_stats", []):
		v.add_child(Parts.info_row(r.get("name", ""), r.get("value", "")))
	return c


func _career_card() -> PanelContainer:
	var c := Parts.card("시즌별 성적")
	var v := Parts.body(c)
	var rows: Array = _vm.get("career", [])
	if rows.is_empty():
		var l := Label.new()
		l.text = "아직 기록이 없습니다"
		l.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		v.add_child(l)
		return c
	for r in rows:
		v.add_child(Parts.info_row(
			"%d  %s" % [r.get("year", 0), r.get("team", "")],
			r.get("stat_line", ""),
		))
		var awards: Array = r.get("awards", [])
		if not awards.is_empty():
			var h := HBoxContainer.new()
			h.add_theme_constant_override("separation", 4)
			for a in awards:
				h.add_child(Parts.badge(a, AppTheme.WARN))
			v.add_child(h)
	return c
