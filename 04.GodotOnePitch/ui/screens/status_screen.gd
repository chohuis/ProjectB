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
const ACTION_ROW := preload("res://ui/parts/action_row.tscn")

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


## 학업에서 고른 것. **루트가 상태에 쓴다** — 화면이 직접 안 고친다
signal study_mode_picked(mode: String)
signal major_picked(name: String)
## 재정에서 고른 것. **여기가 스폰서 계약·구독을 쓰는 쪽이다** —
## 04는 둘 다 읽는 코드만 있고 세우는 데가 없었다
signal sponsor_signed(category_id: String)
signal subscription_toggled(area_id: String)
## 인생 기록을 다시 본다 — 은퇴 뒤에도, 현역일 때도
signal life_record_requested
## 하위 탭을 옮겼다. **부모가 자리를 기억한다** — 이 화면은 상태가 바뀔
## 때마다 통째로 새로 만들어지기 때문이다
signal tab_changed(index: int)


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_rebuild()


## ⚠ **탭 목록을 사전에서 받는다.** 무대에 따라 달라지므로(학업은 학교에
## 다닐 때만) 소스에 박아 두면 화면이 "지금 어느 무대인가"를 알아야 한다
func _build_tabs() -> void:
	for c in _tabs.get_children():
		_tabs.remove_child(c)
		c.free()

	var tabs: Array = _vm.get("tabs", [])
	# ⚠ **탭이 줄면 고른 자리가 사라진다.** 학업 탭에 있다가 졸업하면
	# 없는 탭을 그리려다 빈 화면이 된다
	_tab = clampi(_tab, 0, maxi(tabs.size() - 1, 0))

	var group := ButtonGroup.new()
	for i in tabs.size():
		var b := Button.new()
		b.text = String(tabs[i].get("label", ""))
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == _tab)
		b.focus_mode = Control.FOCUS_NONE
		var idx := i
		b.pressed.connect(func() -> void: _on_tab(idx))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	tab_changed.emit(i)
	_rebuild_tab()


## 부모가 자리를 되돌려 놓는다. **넘치면 잘린다** — 무대가 바뀌어 탭이
## 줄었을 수 있다
func select_tab(i: int) -> void:
	_tab = i
	if is_node_ready():
		_build_tabs()
		_rebuild_tab()


func current_tab_id() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return String(tabs[_tab].get("id", ""))


func _rebuild() -> void:
	for c in _col.get_children():
		if c != _tabs and c != _tab_host:
			c.queue_free()
	# 탭 줄 앞에 카드 둘을 끼운다
	_col.add_child(_body_card())
	_col.move_child(_col.get_child(_col.get_child_count() - 1), 0)
	_col.add_child(_contract_card())
	_col.move_child(_col.get_child(_col.get_child_count() - 1), 1)
	var at: int = 2
	if _has_profile():
		_col.add_child(_profile_card())
		_col.move_child(_col.get_child(_col.get_child_count() - 1), at)
		at += 1
	# ⚠ **병역은 다녀왔거나 다니는 중일 때만 낀다.** 미필이 기본값이라 늘
	# 띄우면 아무 뜻이 없는 줄이 하나 붙어 있는다
	if not (_vm.get("military", {}) as Dictionary).is_empty():
		_col.add_child(_military_card())
		_col.move_child(_col.get_child(_col.get_child_count() - 1), at)
	_build_tabs()
	_rebuild_tab()


func _rebuild_tab() -> void:
	for c in _tab_host.get_children():
		_tab_host.remove_child(c)
		c.free()
	match current_tab_id():
		"attributes": _tab_host.add_child(_pitching_card())
		"season": _tab_host.add_child(_season_card())
		"career": _tab_host.add_child(_career_card())
		"academics": _build_academics()
		"finance": _build_finance()
		"achievements": _build_achievements()


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


# ── 학업 탭 (C-3) ──────────────────────────────────────────────────
#
# ⚠ **이 탭이 `study_mode`와 `major`를 쓰는 쪽이다.** 04는 둘 다 읽는
# 코드만 있고 세우는 데가 없어서 전 커리어가 "normal" 고정이었다.
# 화면은 고른 것을 신호로만 내고, 상태에 쓰는 건 루트가 한다.

## ⚠ **"학교에 다니나"를 여기서 다시 묻지 않는다.** 학업 탭 자체가
## 학교에 다닐 때만 생기므로(`StatusVm._tabs`), 여기 가드를 두면
## 영영 안 도는 갈래가 하나 남는다
func _build_academics() -> void:
	var a: Dictionary = _vm.get("academics", {})
	_tab_host.add_child(_academic_summary_card(a))
	# 아직 안 고른 전공을 제일 앞에 세운다 — 되돌릴 수 없는 선택이다
	if bool(a.get("major", {}).get("selectable", false)):
		_tab_host.add_child(_major_card(a["major"]))
	_tab_host.add_child(_study_card(a["study"]))
	if not a.get("semesters", []).is_empty():
		_tab_host.add_child(_semester_card(a["semesters"]))
	if not a.get("campus", []).is_empty():
		_tab_host.add_child(_campus_card(a["campus"]))


func _academic_summary_card(a: Dictionary) -> Card:
	var c := _card("%s 학업" % String(a.get("stage", "")))
	var gpa: Dictionary = a.get("gpa", {})
	var warn: Dictionary = a.get("warning", {})

	c.body.add_child(_row("누적 학점", String(gpa.get("label", "")),
		AppTheme.OK if bool(gpa.get("graduates", false)) else AppTheme.TEXT))
	if not String(gpa.get("note", "")).is_empty():
		c.body.add_child(_row("졸업 자격", String(gpa["note"]),
			AppTheme.OK if bool(gpa.get("graduates", false)) else AppTheme.WARN))

	var major: Dictionary = a.get("major", {})
	c.body.add_child(_row("전공", String(major.get("name", "")),
		AppTheme.TEXT if bool(major.get("picked", false)) else AppTheme.TEXT_DIM))
	if not String(major.get("effect", "")).is_empty():
		c.body.add_child(_row("전공 효과", String(major["effect"]), AppTheme.TEXT_DIM))

	# 경고가 훈련을 깎는 것이 학사의 무게다 — 몇 %인지 같이 보여준다
	if int(warn.get("level", 0)) > 0:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", AppTheme.GAP)
		row.add_child(_badge(String(warn.get("label", "")),
			AppTheme.BAD if bool(warn.get("blocked", false)) else AppTheme.WARN))
		var t := Label.new()
		t.text = String(warn.get("training_label", ""))
		t.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		row.add_child(t)
		c.body.add_child(row)
	else:
		c.body.add_child(_row("학업 상태", "정상", AppTheme.OK))

	c.body.add_child(_row("다음 시험", String(a.get("exam", {}).get("line", "")),
		AppTheme.TEXT_DIM))
	return c


func _major_card(major: Dictionary) -> Card:
	var c := _card("전공 선택")
	c.body.add_child(_row("", String(major.get("hint", "")), AppTheme.TEXT_DIM))
	for m in major.get("options", []):
		var b := Button.new()
		b.text = "%s   %s" % [String(m["name"]), String(m["desc"])]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.focus_mode = Control.FOCUS_NONE
		# ⚠ **미뤄서 보낸다.** 루트가 상태를 고치면 이 화면이 다시 그려지는데,
		# 바로 보내면 자기를 부른 버튼을 지우려다 잠긴 객체가 된다
		b.pressed.connect(func() -> void:
			major_picked.emit.call_deferred(String(m["name"])))
		c.body.add_child(b)
	return c


func _study_card(study: Dictionary) -> Card:
	var c := _card("주간 학업")
	c.body.add_child(_row("", String(study.get("hint", "")), AppTheme.TEXT_DIM))
	for o in study.get("options", []):
		var b := Button.new()
		b.text = "%s%s   %s" % ["▸ " if bool(o["current"]) else "   ",
			String(o["name"]), String(o["effect"])]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.focus_mode = Control.FOCUS_NONE
		b.disabled = bool(o["current"])
		b.pressed.connect(func() -> void:
			study_mode_picked.emit.call_deferred(String(o["id"])))
		c.body.add_child(b)
	return c


func _semester_card(semesters: Array) -> Card:
	var c := _card("학기 기록")
	for s in semesters:
		c.body.add_child(_row("%s%s" % [String(s["title"]),
			"  %s" % String(s["label"]) if not String(s["label"]).is_empty() else ""],
			String(s["gpa_label"]),
			AppTheme.WARN if bool(s["warned"]) else AppTheme.TEXT))
	return c


func _campus_card(campus: Array) -> Card:
	var c := _card("대학 무대")
	for e in campus:
		c.body.add_child(_row(String(e["title"]), String(e["line"]),
			AppTheme.OK if bool(e["selected"]) else AppTheme.TEXT_MUTE))
	return c


# ── 재정 탭 (C-4) ──────────────────────────────────────────────────
#
# ⚠ **여기서 계산하지 않는다.** 02는 이 화면이 OVR·사기로 수입을 즉석
# 계산했고 그 숫자가 실제 `money`와 아무 관계가 없었다.
#
# ⚠ **가계부·예산 배분이 없다** (02 설계 §7.3). 지출은 구독 토글과
# 이벤트 선택으로만 한다.

func _build_finance() -> void:
	var f: Dictionary = _vm.get("finance", {})
	_tab_host.add_child(_finance_overview_card(f))
	_tab_host.add_child(_ledger_card(f["ledger"]))
	_tab_host.add_child(_sponsor_card(f["sponsor"]))
	_tab_host.add_child(_subscription_card(f["training"]))
	if bool(f.get("trend", {}).get("has", false)):
		_tab_host.add_child(_trend_card(f["trend"]))


func _finance_overview_card(f: Dictionary) -> Card:
	var c := _card("%s · 보유 자산 %s" % [String(f.get("stage_label", "")),
		String(f.get("money_label", ""))])
	for k in f.get("kpi", []):
		var tone: String = String(k.get("tone", ""))
		c.body.add_child(_row(String(k["label"]), String(k["value"]),
			AppTheme.OK if tone == "up" else \
			(AppTheme.BAD if tone == "down" else AppTheme.TEXT)))
	return c


func _ledger_card(l: Dictionary) -> Card:
	var c := _card("주간 수입 · 지출")
	c.body.add_child(_row("", String(l.get("note", "")), AppTheme.TEXT_DIM))
	var income: Array = l.get("income", [])
	if income.is_empty():
		c.body.add_child(_row(String(l["income_empty"]), "-", AppTheme.TEXT_MUTE))
	for i in income:
		c.body.add_child(_row(String(i["label"]), String(i["value"]), AppTheme.OK))
	var expense: Array = l.get("expense", [])
	if expense.is_empty():
		c.body.add_child(_row(String(l["expense_empty"]), "-", AppTheme.TEXT_MUTE))
	for e in expense:
		c.body.add_child(_row(String(e["label"]), String(e["value"]), AppTheme.BAD))
	return c


func _sponsor_card(sp: Dictionary) -> Card:
	var c := _card("스폰서")
	c.body.add_child(_row("", String(sp.get("annual_label", "")), AppTheme.TEXT_DIM))
	var active: Array = sp.get("active", [])
	if active.is_empty():
		c.body.add_child(_row(String(sp["active_empty"]), "-", AppTheme.TEXT_MUTE))
	for s in active:
		c.body.add_child(_row(String(s["name"]), String(s["value"])))

	c.body.add_child(_row("", String(sp.get("note", "")), AppTheme.TEXT_DIM))
	for o in sp.get("offers", []):
		# ⚠ **글자를 한 문자열로 이어 붙이지 않는다.** 이름 길이가 다르면
		# 금액이 줄마다 다른 자리에서 시작한다 — 제안 셋이 그렇게 어긋나 있었다
		var b: ActionRow = ACTION_ROW.instantiate()
		c.body.add_child(b)
		b.setup("계약", String(o["name"]), String(o["value"]))
		# ⚠ **미뤄서 보낸다.** 루트가 상태를 고치면 이 화면이 다시 그려지는데,
		# 바로 보내면 자기를 부른 버튼을 지우려다 잠긴 객체가 된다
		b.pressed.connect(func() -> void:
			sponsor_signed.emit.call_deferred(String(o["category_id"])))
	return c


func _subscription_card(t: Dictionary) -> Card:
	var c := _card("개인 트레이닝")
	for r in t.get("rows", []):
		var b: ActionRow = ACTION_ROW.instantiate()
		c.body.add_child(b)
		var right: String = String(r["tier_label"])
		if not String(r["effect"]).is_empty():
			right += "  %s" % String(r["effect"])
		b.setup(String(r["action"]), String(r["name"]), right)
		b.pressed.connect(func() -> void:
			subscription_toggled.emit.call_deferred(String(r["area_id"])))
	c.body.add_child(_row(String(t.get("weekly_cost", "")),
		String(t.get("note", "")), AppTheme.TEXT_DIM))
	var facility: String = String(t.get("facility_note", ""))
	if not facility.is_empty():
		c.body.add_child(_row("", facility, AppTheme.TEXT_DIM))
	return c


## `finance_log`를 읽는 자리는 여기뿐이다 — 매주 쌓기만 하고 아무도 안 봤다
func _trend_card(tr: Dictionary) -> Card:
	var c := _card("자산 추이")
	c.body.add_child(_row("", String(tr.get("note", "")), AppTheme.TEXT_DIM))
	for r in tr.get("rows", []):
		c.body.add_child(_row("%d주" % int(r["week"]),
			"%s  →  %s" % [String(r["net"]), String(r["money"])],
			AppTheme.BAD if bool(r["down"]) else AppTheme.TEXT))
	return c


# ── 업적 탭 (C-5) ──────────────────────────────────────────────────
#
# ⚠ **화면이 달성 판정을 안 한다.** 판정은 주 경계에서 끝난다 — 02는 이
# 화면이 지표를 직접 계산해서, 화면을 안 열면 진행도가 낡은 채로 남았다.

func _build_achievements() -> void:
	var a: Dictionary = _vm.get("achievements", {})
	if int(a.get("unlocked", 0)) == 0:
		var head := _card(String(a.get("summary", "")))
		head.body.add_child(_row("", String(a.get("empty", "")), AppTheme.TEXT_MUTE))
		_tab_host.add_child(head)
	else:
		var head2 := _card(String(a.get("summary", "")))
		head2.body.add_child(_bar("달성", float(a.get("unlocked", 0))
			/ maxf(float(a.get("total", 1)), 1.0),
			"%d / %d" % [int(a.get("unlocked", 0)), int(a.get("total", 0))],
			AppTheme.OK))
		_tab_host.add_child(head2)

	for g in a.get("groups", []):
		var c := _card(String(g["label"]))
		for r in g["rows"]:
			c.body.add_child(_achievement_row(r))
		_tab_host.add_child(c)


func _achievement_row(r: Dictionary) -> Control:
	var done: bool = bool(r["unlocked"])
	# 딴 것은 언제 땄는지가, 못 딴 것은 얼마나 남았는지가 오른쪽에 온다
	var right: String = String(r["detail"])
	if done and not String(r["reward"]).is_empty():
		right = "%s · %s" % [right, String(r["reward"])]
	return _row(String(r["title"]), right,
		AppTheme.OK if done else AppTheme.TEXT_DIM)


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
			# ⚠ **후유증이 남았는지를 같이 말한다.** 나은 게 곧 원래대로는
			# 아니다 — 능력치가 영구히 깎였는데 화면이 침묵하면 왜 약해졌는지
			# 알 길이 없다
			var right: String = String(h.get("severity_label", ""))
			if bool(h.get("has_penalty", false)):
				right += " · 후유증"
			c.body.add_child(_row(
				"%d년 %d주  %s" % [h.get("year", 0), h.get("week", 0), h.get("name", "")],
				right,
				AppTheme.SEV_COLOR.get(h.get("severity", "light"), AppTheme.TEXT_DIM),
			))
	return c


## 선수 정보 — F-6b. 02는 `PlayerDetailModal:590-596`에서 이름 밑에
## 생일과 투구 방향을 붙인다.
##
## ⚠ **빈 줄은 안 만든다.** 옛 세이브엔 축이 없다 — 없는 것과 고른 것이
## 구분돼야 한다. 셋 다 비면 카드 자체가 안 뜬다
func _profile_card() -> Card:
	var c := _card("선수 정보")
	var birthday: String = String(_vm.get("birthday", ""))
	if not birthday.is_empty():
		c.body.add_child(_row("생년월일", birthday))
	var hand: String = String(_vm.get("handedness", ""))
	var form: String = String(_vm.get("pitching_form", ""))
	if not hand.is_empty() or not form.is_empty():
		var parts := PackedStringArray()
		if not hand.is_empty():
			parts.append(hand)
		if not form.is_empty():
			parts.append(form)
		c.body.add_child(_row("투구", " · ".join(parts)))
	return c


## 보여줄 게 하나라도 있나. **빈 카드를 띄우면 데이터가 없는 건지
## 안 온 건지 알 수 없다**
func _has_profile() -> bool:
	return not (String(_vm.get("birthday", "")).is_empty()
		and String(_vm.get("handedness", "")).is_empty()
		and String(_vm.get("pitching_form", "")).is_empty())


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


## 병역 카드 — U-2.
##
## ⚠ **`sim/military.gd`가 매주 도는데 볼 자리가 하나도 없었다.** 입대하면
## 전역이 언제인지 알 길이 없었다. 02는 네 자리에서 보여줬다.
##
## ⚠ **02가 이 자리에서 크게 데었다** — 전역 분기가 도달할 수 없는 자리에
## 있어서 입대하면 영원히 군대에 있었다(실측 700주 · 13.5년). 04는 그 결함을
## 고쳤지만 화면이 없어서, 같은 증상이 다시 나도 알아볼 방법이 없었다
func _military_card() -> Card:
	var m: Dictionary = _vm.get("military", {})
	var c := _card("병역")

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", AppTheme.GAP)
	head.add_child(_badge(String(m.get("status", "")),
		AppTheme.WARN if bool(m.get("serving", false)) else AppTheme.OK))
	var unit: String = String(m.get("unit_label", ""))
	if not unit.is_empty():
		var u := Label.new()
		u.text = unit
		u.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		head.add_child(u)
	c.body.add_child(head)

	if int(m.get("enlist_year", 0)) > 0:
		c.body.add_child(_row("입대", "%d년" % int(m["enlist_year"])))

	# ⚠ **남은 주가 이 카드의 요점이다.** 다녀온 뒤엔 안 보여준다 —
	# "0주 남음"이 뜨면 아직 복무 중처럼 읽힌다
	if bool(m.get("serving", false)):
		var served: int = int(m.get("weeks_served", 0))
		var total: int = maxi(1, int(m.get("weeks_total", 1)))
		c.body.add_child(_bar("복무", float(served) / float(total),
			"%d주 남음" % int(m.get("weeks_left", 0)), AppTheme.WARN))
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

	# ⚠ **인생 기록을 다시 볼 길을 둔다.** 은퇴하는 그 순간이 첫 관람이고,
	# 그 뒤로는 여기가 유일한 입구다 — 없으면 결산을 한 번 보고 못 본다
	var life := Button.new()
	life.text = "인생 기록"
	life.focus_mode = Control.FOCUS_NONE
	life.pressed.connect(func() -> void: life_record_requested.emit.call_deferred())
	c.body.add_child(life)

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
