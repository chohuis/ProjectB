extends Control
class_name SeasonEndScreen

## 시즌 결산 — M7-7.
##
## 원본: `features/season-end/ui/SeasonEndModal.svelte` (1,195줄)
##
## ⚠ **여기는 계산을 안 한다.** 순위·수상·개인 기록을 전부 `SeasonEndVm`이
## 만든다 — 02가 1,195줄이 된 이유가 화면이 그걸 직접 모아서다.

@onready var _bg: ColorRect = $Bg
@onready var _title: Label = $Pad/Center/Col/Title
@onready var _tabs: HBoxContainer = $Pad/Center/Col/Tabs
@onready var _body: VBoxContainer = $Pad/Center/Col/Body
@onready var _invest: VBoxContainer = $Pad/Center/Col/Invest
@onready var _done: Button = $Pad/Center/Col/Row/Done

## 결산을 닫는다
signal done_requested

## 시즌말 투자를 골랐다 — 정산은 `Finance.apply_investment`가 한다
signal invest_requested(option_id: String, amount: int)

var _vm: Dictionary = {}
var _tab: int = 0
# 기본은 1/4이다 — 전액을 기본으로 두면 실수로 다 넣는다
var _amount_id: String = "quarter"


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	_tab = 0
	if is_node_ready():
		_rebuild()


func current_tab_id() -> String:
	var tabs: Array = _vm.get("tabs", [])
	if _tab < 0 or _tab >= tabs.size():
		return ""
	return String(tabs[_tab].get("id", ""))


func _ready() -> void:
	theme = AppTheme.build()
	_bg.color = AppTheme.BG
	_done.pressed.connect(func() -> void: done_requested.emit.call_deferred())
	_rebuild()


func _rebuild() -> void:
	_title.text = String(_vm.get("title", ""))
	_title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_done.text = "다음 시즌으로"

	_build_tabs()
	_build_body()
	_build_invest()


## ⚠ **떼고 나서 곧바로 지운다.** `queue_free`는 다음 프레임까지 살아 있어서
## 탭을 오갈 때마다 쌓인다 — 진행 화면에서 고아 430개가 실제로 나왔다
func _free_all(parent: Node) -> void:
	for c in parent.get_children():
		parent.remove_child(c)
		c.free()


func _build_tabs() -> void:
	_free_all(_tabs)
	var group := ButtonGroup.new()
	var tabs: Array = _vm.get("tabs", [])
	for i in tabs.size():
		var b := Button.new()
		b.text = String(tabs[i].get("label", ""))
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (i == _tab)
		b.pressed.connect(func() -> void: _on_tab.call_deferred(i))
		_tabs.add_child(b)


func _on_tab(i: int) -> void:
	_tab = i
	_build_body()


func _build_body() -> void:
	_free_all(_body)
	if not bool(_vm.get("has_data", false)):
		_line("결산할 시즌이 없습니다", AppTheme.TEXT_MUTE)
		return

	match current_tab_id():
		"season":
			_build_season()
		"team":
			_build_team()
		"personal":
			_build_personal()


func _line(text: String, color: Color = AppTheme.TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	_body.add_child(l)
	return l


func _pair(left: String, right: String, color: Color = AppTheme.TEXT) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_body.add_child(row)

	var a := Label.new()
	a.text = left
	a.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(a)

	var b := Label.new()
	b.text = right
	b.add_theme_color_override("font_color", color)
	row.add_child(b)


func _heading(text: String) -> void:
	var l: Label = _line(text, AppTheme.TEXT_DIM)
	l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)


func _build_season() -> void:
	_heading("한 해에 있었던 일")
	var rows: Array = _vm.get("summary_rows", [])
	if rows.is_empty():
		_line("기록이 없습니다", AppTheme.TEXT_MUTE)
	for r in rows:
		_pair(String(r["label"]), String(r["value"]))

	# 🔴 **그 해 대회** (G-1b). `tournament_log`가 쌓이는데 결산이 안 읽었다.
	# ⚠ **못 나간 해엔 절 자체가 없다** — "대회 없음"이 해마다 뜨면
	# 정작 나간 해가 안 도드라진다(요약 행과 같은 규칙이다)
	var tours: Array = _vm.get("tournament_rows", [])
	if not tours.is_empty():
		_heading("대회")
		for t in tours:
			_pair(String(t["label"]), String(t["value"]))

	_heading("수상")
	var awards: Array = _vm.get("award_rows", [])
	if awards.is_empty():
		# ⚠ **왜 비었는지를 말한다** (U-9). "수상자가 없습니다"만 있으면
		# 버그인지 아직인지를 못 가른다 — `awards.gd:149`가 "아무도 두 부문을
		# 못 채우는 해가 있다"고 적어 뒀듯 **이게 정상인 해가 실제로 있다**
		_line("자격선을 넘은 선수가 없습니다", AppTheme.TEXT_MUTE)
	for a in awards:
		var right: String = String(a["player_id"])
		if not String(a["value"]).is_empty():
			right += "  " + String(a["value"])
		_pair(String(a["label"]), right)


func _build_team() -> void:
	_pair("소속", String(_vm.get("team_name", "")))
	_pair("순위", String(_vm.get("my_rank_label", "")), AppTheme.ACCENT)

	var row: Dictionary = _vm.get("team_row", {})
	if row.is_empty():
		_line("팀 성적이 없습니다", AppTheme.TEXT_MUTE)
	else:
		_pair("성적", "%d승 %d무 %d패" % [int(row.get("wins", 0)),
			int(row.get("draws", 0)), int(row.get("losses", 0))])
		_pair("승률", String(row.get("pct_label", "")))

	# 🔴 **팀 내 베스트** (G-1c). ⚠ **여기서 돌아가면 안 된다** — 팀 성적이
	# 없어도(2군·독립) 잘 던진 동료는 있다. 예전엔 위에서 `return`했다
	var best: Array = _vm.get("team_best", [])
	if not best.is_empty():
		_heading("팀 내 베스트")
		for b in best:
			_pair(String(b["label"]), String(b["value"]))

	# 🔴 **팀이 치른 경기** (G-1d). `game_log`는 내가 던진 경기만이라,
	# 불펜으로 열 번 나온 해엔 팀이 뭘 했는지 볼 자리가 없었다
	var games: Array = _vm.get("team_games", [])
	if not games.is_empty():
		_heading("팀 경기 기록  %s" % String(_vm.get("team_games_label", "")))
		for g in games:
			_pair(String(g["label"]), String(g["value"]),
				AppTheme.ACCENT if bool(g["won"]) else AppTheme.TEXT_DIM)


func _build_personal() -> void:
	var line: String = String(_vm.get("my_line", ""))
	_pair("올해 성적", line if not line.is_empty() else "기록 없음",
		AppTheme.TEXT if not line.is_empty() else AppTheme.TEXT_MUTE)
	_pair("OVR", str(int(_vm.get("my_ovr", 0))))

	var mine: Array = _vm.get("my_awards", [])
	if not mine.is_empty():
		_pair("수상", ", ".join(PackedStringArray(mine)), AppTheme.ACCENT)

	_heading("등판 기록")
	var log: Array = _vm.get("game_log", [])
	if log.is_empty():
		_line("등판이 없습니다", AppTheme.TEXT_MUTE)
		return
	for e in log:
		# 이긴 경기를 눈에 띄게 — 결산에서 제일 먼저 보는 것이다
		_pair("%d일차 %s %s" % [int(e["day"]), String(e["opponent_id"]),
			String(e["score_label"])], String(e["line_label"]),
			AppTheme.ACCENT if bool(e["won"]) else AppTheme.TEXT_DIM)


## 시즌말 투자 — **탭 밖에 둔다.**
##
## ⚠ 한 해에 한 번뿐인 선택을 탭 안에 숨기면 못 보고 결산을 넘긴다.
## 02는 모달이 한 줄 스크롤이라 자연히 보였는데 04는 탭이 셋이다
func _build_invest() -> void:
	_free_all(_invest)
	var v: Dictionary = _vm.get("investment", {})
	if not bool(v.get("show", false)):
		return

	if bool(v.get("done", false)):
		var head := Label.new()
		head.text = "투자 결과"
		head.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		head.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		_invest.add_child(head)

		var line := Label.new()
		line.text = "%s  %s" % [String(v.get("name", "")),
			String(v.get("result_label", ""))]
		line.add_theme_color_override("font_color",
			AppTheme.ACCENT if bool(v.get("gain", true)) else AppTheme.BAD)
		_invest.add_child(line)

		var note := Label.new()
		note.text = String(v.get("note", ""))
		note.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		note.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		_invest.add_child(note)
		return

	var title := Label.new()
	title.text = String(v.get("title", ""))
	title.add_theme_color_override("font_color", AppTheme.ACCENT)
	_invest.add_child(title)

	var lead := Label.new()
	lead.text = "보유 현금 %s원 중 %s원을 굴립니다.  %s" % [
		String(v.get("cash_label", "")), _amount_label(), String(v.get("warn", ""))]
	lead.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	lead.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_invest.add_child(lead)

	var amounts := HBoxContainer.new()
	amounts.add_theme_constant_override("separation", 6)
	_invest.add_child(amounts)
	var group := ButtonGroup.new()
	for a in v.get("amounts", []):
		var b := Button.new()
		b.text = String(a["label"])
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = (String(a["id"]) == _amount_id)
		var id: String = String(a["id"])
		b.pressed.connect(func() -> void: _on_amount.call_deferred(id))
		amounts.add_child(b)

	var opts := HBoxContainer.new()
	opts.add_theme_constant_override("separation", 6)
	_invest.add_child(opts)
	for o in v.get("options", []):
		var col := VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		opts.add_child(col)

		var b := Button.new()
		b.text = String(o["name"])
		var oid: String = String(o["id"])
		b.pressed.connect(func() -> void: _on_invest.call_deferred(oid))
		col.add_child(b)

		var stat := Label.new()
		stat.text = String(o["stat_label"])
		stat.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		stat.add_theme_color_override("font_color", AppTheme.TEXT)
		col.add_child(stat)

		var desc := Label.new()
		desc.text = String(o["desc"])
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		desc.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
		col.add_child(desc)


## 지금 고른 금액. **화면은 고른 것만 들고 계산은 안 한다** — 금액은
## `Finance.investment_amounts`가 이미 만들어 뒀다
func _current_amount() -> int:
	for a in _vm.get("investment", {}).get("amounts", []):
		if String(a["id"]) == _amount_id:
			return int(a["amount"])
	return 0


func _amount_label() -> String:
	return FinanceVm.won(_current_amount())


func _on_amount(id: String) -> void:
	_amount_id = id
	_build_invest()


func _on_invest(option_id: String) -> void:
	var amount: int = _current_amount()
	if amount <= 0:
		return
	invest_requested.emit(option_id, amount)
