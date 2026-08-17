extends Control
class_name MatchScreen

## 경기 화면 — M7-6e1~e3 · M7-8b.
##
## 원본: `pages/match/MatchPage.svelte` (3,220줄)
##
## ⚠ **여기는 계산을 안 한다.** 이닝·카운트·주자·이름표를 전부 `MatchVm`이
## 만든다 — 02가 3,220줄이 된 이유가 화면이 그걸 직접 읽고 만들어서다.
##
## ⚠ **02와 같은 좌7/우5다.** `MatchPage.svelte`의 `.engine-grid`가 12칸을
## `1/8`(구장·중계)과 나머지로 갈랐다. 04는 한동안 세로 한 줄이었는데,
## 그건 스크린샷 도구가 480×900(모바일)을 강제한 걸 기준으로 삼았기 때문이다

const LOG_LINES: int = 8
## 존 칸 크기. 손가락으로 누를 만해야 한다
const ZONE_CELL: Vector2 = Vector2(40, 40)

## 부품은 씬으로 쓴다 — 화면이 색을 직접 고르지 않게 하려는 것이다
const BAR_ROW := preload("res://ui/parts/bar_row.tscn")

@onready var _bg: ColorRect = $Bg
@onready var _away: Label = $Pad/Col/ScoreRow/Away
@onready var _score: Label = $Pad/Col/ScoreRow/Score
@onready var _home: Label = $Pad/Col/ScoreRow/Home
@onready var _inning: Label = $Pad/Col/SituationRow/Inning
@onready var _count: Label = $Pad/Col/SituationRow/Count
@onready var _outs: Label = $Pad/Col/SituationRow/Outs
@onready var _bases: Label = $Pad/Col/SituationRow/Bases
@onready var _briefing: VBoxContainer = $Pad/Col/Body/Right/Briefing
@onready var _matchup: Label = $Pad/Col/Body/Right/Matchup
@onready var _pitcher_line: Label = $Pad/Col/Body/Right/PitcherLine
@onready var _situation: HBoxContainer = $Pad/Col/Body/Right/Situation
@onready var _vitals: VBoxContainer = $Pad/Col/Body/Right/Vitals
@onready var _away_lineup: VBoxContainer = $Pad/Col/Body/Right/Lineups/Away
@onready var _home_lineup: VBoxContainer = $Pad/Col/Body/Right/Lineups/Home
@onready var _log: VBoxContainer = $Pad/Col/Body/Right/LogScroll/Log
@onready var _result: Label = $Pad/Col/Body/Right/Result
@onready var _pitch: Button = $Pad/Col/Row/Pitch
@onready var _auto: Button = $Pad/Col/Row/Auto
@onready var _done: Button = $Pad/Col/Row/Done
@onready var _field: BaseballField = $Pad/Col/Body/Left/Field
@onready var _choose: HBoxContainer = $Pad/Col/Body/Left/Choose
@onready var _zone_grid: GridContainer = $Pad/Col/Body/Left/Choose/Zone/Grid
@onready var _ball: Button = $Pad/Col/Body/Left/Choose/Zone/Ball
@onready var _pitches: GridContainer = $Pad/Col/Body/Left/Choose/Opts/Pitches
@onready var _strategy: HBoxContainer = $Pad/Col/Body/Left/Choose/Opts/Strategy
@onready var _power: HBoxContainer = $Pad/Col/Body/Left/Choose/Opts/Power

## 한 구 던진다
signal pitch_requested
## 남은 경기를 자동으로 돌린다
signal auto_requested
## 경기 화면을 닫는다
signal done_requested
## 구종·코스·전략을 골랐다. `{pitch_type}` / `{zone}` / `{strategy}` / `{power}`
signal selection_changed(patch: Dictionary)

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
	_build_briefing()
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

	_field.set_view_model(_vm.get("park", {}))

	_build_situation()
	_build_vitals()
	_build_lineups()
	_build_choice()
	_build_log()


## 양 팀 타순 — M-2. **투구 중에 다음 타자를 볼 수 있어야 한다** —
## 브리핑(F-5)은 첫 공 전에만 뜨고 사라진다.
##
## ⚠ **02는 구장 양옆에 둔다.** 04는 구장 그림이 폭을 다 쓰므로 오른쪽 열에
## 나란히 놓았다 — **픽셀이 아니라 구조를 맞춘다**(CLAUDE.md 이주 원칙)
func _build_lineups() -> void:
	_fill_lineup(_away_lineup, String(_vm.get("away_lineup_title", "")),
		_vm.get("away_lineup", []))
	_fill_lineup(_home_lineup, String(_vm.get("home_lineup_title", "")),
		_vm.get("home_lineup", []))


func _fill_lineup(host: VBoxContainer, title: String, rows: Array) -> void:
	for c in host.get_children():
		host.remove_child(c)
		c.free()
	if rows.is_empty():
		return

	var head := Label.new()
	head.text = title
	head.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	head.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	host.add_child(head)

	for r in rows:
		var l := Label.new()
		l.text = "%d. %s" % [int(r.get("no", 0)), String(r.get("name", ""))]
		l.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		# ⚠ **지금 타석이 제일 눈에 띄어야 한다.** 다음 타자는 그 다음이고,
		# 나머지는 배경이다 — 셋을 같은 색으로 두면 목록이 벽이 된다
		if bool(r.get("is_at_bat", false)):
			l.text = "▸ " + l.text
			l.add_theme_color_override("font_color", AppTheme.ACCENT)
		elif bool(r.get("is_on_deck", false)):
			l.add_theme_color_override("font_color", AppTheme.TEXT)
		else:
			l.add_theme_color_override("font_color", AppTheme.TEXT_MUTE)
		host.add_child(l)


## 주자와 카운트 — M-3. **한 상황의 두 축이라 한 판에 둔다**(02 주석).
## 글자로만 두면 "2사 만루"를 읽는 데 눈이 두 번 움직인다
func _build_situation() -> void:
	for c in _situation.get_children():
		_situation.remove_child(c)
		c.free()
	var board := SituationBoard.new()
	_situation.add_child(board)
	board.setup(_vm)


## 투수 체력·멘탈 — M-1. **교체 판단의 입력이다.**
##
## ⚠ **축이 없으면 줄을 안 만든다.** 0으로 그리면 "모르는 것"이 "바닥"으로
## 보인다 — 옛 세이브가 그렇다.
##
## ⚠ **색은 `AppTheme`가 고른다.** 화면은 단계 이름만 넘긴다
func _build_vitals() -> void:
	# ⚠ **`queue_free`가 아니라 `free`다.** 검사는 프레임을 안 돌리므로
	# 큐에 넣은 것이 처리되지 않고 **고아로 남는다** — 24개가 그렇게 났다.
	# 이 저장소의 다른 화면도 전부 `remove_child` + `free`다
	for c in _vitals.get_children():
		_vitals.remove_child(c)
		c.free()
	if not bool(_vm.get("has_pitcher_vitals", false)):
		return

	for row in [
		["체력", "pitcher_stamina", "pitcher_stamina_level"],
		["멘탈", "pitcher_mental", "pitcher_mental_level"],
	]:
		var v: float = float(_vm.get(row[1], 0.0))
		var bar: BarRow = BAR_ROW.instantiate()
		_vitals.add_child(bar)
		bar.setup(String(row[0]), v / 100.0, "%d" % roundi(v),
			AppTheme.vital_color(String(_vm.get(row[2], ""))))


## 구종·코스·전략. **주인공이 마운드에 있을 때만 보인다** — 상대가 던질 땐
## 고를 게 없는데 선택 화면이 뜨면 내가 던지는 줄 안다
func _build_choice() -> void:
	var pick: Dictionary = _vm.get("pitch", {})
	_choose.visible = bool(_vm.get("is_my_pitch", false))
	if not _choose.visible:
		return

	_build_zone(int(pick.get("zone", 5)))

	_fill(_pitches, pick.get("pitches", []), pick.get("pitch_type", ""),
		func(id: String) -> void: selection_changed.emit({"pitch_type": id}),
		func(x: Dictionary) -> String: return "%s %d" % [x["label"], int(x["grade"])])
	_fill(_strategy, pick.get("strategies", []), pick.get("strategy", ""),
		func(id: String) -> void: selection_changed.emit({"strategy": id}))
	_fill(_power, pick.get("powers", []), pick.get("power", ""),
		func(id: String) -> void: selection_changed.emit({"power": id}))


## 스트라이크존 3×3. **위가 1~3이다** — 야구 존 번호가 그렇다
func _build_zone(chosen: int) -> void:
	for c in _zone_grid.get_children():
		_zone_grid.remove_child(c)
		c.free()

	for z in range(1, 10):
		var b := Button.new()
		b.text = str(z)
		b.custom_minimum_size = ZONE_CELL
		b.toggle_mode = true
		b.button_pressed = z == chosen
		var zone: int = z
		b.pressed.connect(func() -> void:
			selection_changed.emit.call_deferred({"zone": zone}))
		_zone_grid.add_child(b)

	# ⚠ **의도적 볼임을 화면이 말해야 한다.** 존 밖을 골라 놓고 왜
	# 스트라이크가 안 들어오는지 모르면 안 된다
	_ball.text = "존 밖 (거르기)"
	_ball.toggle_mode = true
	_ball.button_pressed = chosen == PitchVm.BALL_ZONE
	if not _ball.pressed.is_connected(_on_ball):
		_ball.pressed.connect(_on_ball)


func _on_ball() -> void:
	selection_changed.emit.call_deferred({"zone": PitchVm.BALL_ZONE})


## 고를 것 한 줄. **목록도 고른 것도 사전이 정한다** — 화면이 기억을 갖지 않는다
func _fill(box: Container, items: Array, chosen: String, on_pick: Callable,
		label_of: Callable = Callable()) -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.free()

	for x in items:
		var b := Button.new()
		b.text = String(label_of.call(x)) if label_of.is_valid() else String(x["label"])
		b.toggle_mode = true
		b.button_pressed = String(x["id"]) == chosen
		b.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
		var id: String = String(x["id"])
		b.pressed.connect(func() -> void: on_pick.call_deferred(id))
		box.add_child(b)


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


## 경기 전 브리핑 — 상대 선발과 타선. F-5.
##
## ⚠ **04는 "누구를 상대하는가"를 못 보여줬다.** 점수·이닝·카운트·주자는
## 다 뜨는데 상대 타자가 이름 한 줄이라 승부처인지 아닌지를 알 수가 없었다.
##
## ⚠ **첫 공을 던지면 사라진다.** 사전이 그때 빈 사전을 준다 — 화면이
## "이제 지울까"를 다시 판정하지 않는다
func _build_briefing() -> void:
	for c in _briefing.get_children():
		_briefing.remove_child(c)
		c.free()

	var b: Dictionary = _vm.get("briefing", {})
	if b.is_empty():
		_briefing.visible = false
		return
	_briefing.visible = true

	var st: Dictionary = b.get("starter", {})
	var head := Label.new()
	head.text = "상대 선발  %s (%s)  OVR %d" % [st.get("name", ""),
		st.get("position", ""), int(st.get("ovr", 0))]
	head.add_theme_color_override("font_color", AppTheme.ACCENT)
	_briefing.add_child(head)

	var stat := Label.new()
	stat.text = "구위 %d · 무브먼트 %d · 커맨드 %d" % [int(st.get("velocity", 0)),
		int(st.get("movement", 0)), int(st.get("command", 0))]
	stat.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	stat.add_theme_font_size_override("font_size", AppTheme.FONT_SMALL)
	_briefing.add_child(stat)

	var title := Label.new()
	title.text = "상대 타선"
	title.add_theme_color_override("font_color", AppTheme.TEXT_DIM)
	_briefing.add_child(title)

	for r in b.get("lineup", []):
		var row: InfoRow = preload("res://ui/parts/info_row.tscn").instantiate()
		_briefing.add_child(row)
		var right: String = "%d" % int(r["ovr"])
		if not String(r["note"]).is_empty():
			right = "%s  %s" % [String(r["note"]), right]
		# 위험한 타자를 눈에 띄게 — 문구만 있으면 표를 다 읽어야 안다
		var threat: int = int(r["threat"])
		var c: Color = AppTheme.TEXT
		if threat == 2:
			c = AppTheme.BAD
		elif threat == 1:
			c = AppTheme.WARN
		row.setup("%d. %s %s" % [int(r["order"]), String(r["position"]),
			String(r["name"])], right, c)
