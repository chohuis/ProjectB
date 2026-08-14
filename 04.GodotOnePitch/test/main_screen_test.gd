extends GdUnitTestSuite

## 진행 화면 — M7-2.
##
## `MainVm`이 만든 사전을 받아 글자를 찍고 탭을 기억하는 게 전부다.
## 계산은 여기 들어오면 안 된다 — 마지막 검사가 소스에서 막는다.


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


const MAIN := preload("res://ui/screens/main_screen.tscn")


func _mount(vm: Dictionary) -> MainScreen:
	var s: MainScreen = MAIN.instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func _game(day: int, mine: bool = false) -> Dictionary:
	return {"id": "G%d" % day, "day": day, "is_protagonist_game": mine,
		"home": "TEAM_A", "away": "TEAM_B", "result": null}


func _vm(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 10, "season_days": 350, "season_year": 2027,
		"protagonist": {"condition": 80.0, "injury": null, "eligibility_blocked": false,
			"retired": false, "team_name": "제주 애월고", "name": "김한결"},
		"schedule": [_game(15, true)], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return MainVm.build(s)


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_shows_the_date_and_the_player() -> void:
	var s := await _mount(_vm())
	var t := _texts(s)
	assert_array(t).contains(["2027년 3월 10일", "(수)", "2주차"])
	assert_array(t).contains(["김한결", "제주 애월고"])


func test_it_shows_the_next_start() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["다음 등판까지 5일"])


func test_it_shows_the_advance_button() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["5일 진행"])


func test_it_shows_every_tab() -> void:
	assert_array(_texts(await _mount(_vm()))) \
		.contains(["소식", "나", "팀", "리그", "인물", "일정"])


## ⚠ **알림은 개수까지 보여준다.** 점만 찍으면 몇 통인지 몰라 들어가 봐야 안다
func test_the_unread_count_is_on_the_tab() -> void:
	var s := await _mount(_vm({"mailbox": [
		{"id": "M1", "read": false}, {"id": "M2", "read": false}]}))
	assert_array(_texts(s)).contains(["소식 2"])


func test_no_unread_leaves_the_tab_plain() -> void:
	assert_array(_texts(await _mount(_vm()))).contains(["소식"])


# ── 진행 버튼 ─────────────────────────────────────────────────

## ⚠ **등판일엔 진행이 아니라 경기다.** "0일 진행"으로 두면 눌러도 아무
## 일이 안 일어나고 사용자는 게임이 멈춘 줄 안다
func test_a_game_day_offers_to_play_the_match() -> void:
	var s := await _mount(_vm({"day": 15}))
	assert_str(s._advance.text).is_equal("경기 시작")
	assert_bool(s._advance.disabled).is_false()


func test_pressing_it_on_a_game_day_opens_the_match() -> void:
	var s := await _mount(_vm({"day": 15}))
	var got: Array = []
	s.match_requested.connect(func() -> void: got.append(true))
	s._advance.pressed.emit()
	assert_int(got.size()).is_equal(1)


## 경기가 아닌 이유로 멈췄으면 버튼이 잠긴다
func test_the_button_is_disabled_when_stopped_by_something_else() -> void:
	var s := await _mount(_vm({"day": 10, "mailbox": [
		{"id": "M1", "read": true, "decision": {"selected": null}}]}))
	assert_bool(s._advance.disabled).is_true()


func test_the_button_is_live_on_a_normal_day() -> void:
	var s := await _mount(_vm())
	assert_bool(s._advance.disabled).is_false()


## ⚠ **며칠을 갈지 화면이 다시 계산하지 않는다.** 사전에 적힌 수를 그대로
## 내보낸다 — 화면이 자기 기준으로 세면 진행기와 갈린다
func test_pressing_advance_reports_the_span_from_the_view_model() -> void:
	var s := await _mount(_vm())
	var got: Array = []
	s.advance_requested.connect(func(d: int) -> void: got.append(d))
	s._advance.pressed.emit()
	assert_array(got).is_equal([5])


# ── 진행 중 표시 ──────────────────────────────────────────────

## ⚠ **최악의 날이 1.08초다.** 그동안 버튼이 그대로면 안 눌린 줄 알고
## 또 누른다
func test_it_shows_progress_while_running() -> void:
	var s := await _mount(_vm())
	s.set_progress(2, 5)
	assert_array(_texts(s)).contains(["진행 중  2 / 5일"])
	assert_bool(s._advance.disabled).is_true()


func test_finishing_puts_the_button_back() -> void:
	var s := await _mount(_vm())
	s.set_progress(2, 5)
	s.set_progress(5, 5)
	assert_array(_texts(s)).contains(["5일 진행"])
	assert_bool(s._advance.disabled).is_false()


## 0일짜리 진행에 나누기가 들어가면 안 된다
func test_a_zero_total_does_not_break() -> void:
	var s := await _mount(_vm())
	s.set_progress(0, 0)
	assert_object(s).is_not_null()


# ── 탭 ────────────────────────────────────────────────────────

func test_the_first_tab_is_selected() -> void:
	var s := await _mount(_vm())
	assert_str(s.current_tab_id()).is_equal("news")


func test_selecting_a_tab_switches_the_body() -> void:
	var s := await _mount(_vm())
	s._on_tab(3)
	await await_idle_frame()
	assert_str(s.current_tab_id()).is_equal("league")
	assert_array(_texts(s)).contains(["리그"])


func test_selecting_a_tab_announces_it() -> void:
	var s := await _mount(_vm())
	var got: Array = []
	s.tab_selected.connect(func(id: String) -> void: got.append(id))
	s._on_tab(2)
	await await_idle_frame()
	assert_array(got).is_equal(["team"])


## ⚠ **다시 그려도 탭이 두 줄로 안 찍힌다.** `queue_free`만 하면 다음
## 프레임까지 자식으로 남는다
func test_rebuilding_does_not_duplicate_the_tabs() -> void:
	var s := await _mount(_vm())
	var before: int = s._tabs.get_child_count()
	s.set_view_model(_vm())
	assert_int(s._tabs.get_child_count()).is_equal(before)


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_dictionary_does_not_break() -> void:
	var s := await _mount({})
	assert_object(s).is_not_null()
	assert_str(s.current_tab_id()).is_empty()


func test_a_state_with_no_schedule_does_not_break() -> void:
	var s := await _mount(_vm({"schedule": []}))
	assert_array(_texts(s)).contains(["남은 등판 없음"])


# ── 일정 탭 ───────────────────────────────────────────────────

func _open_schedule(s: MainScreen) -> void:
	s._on_tab(5)
	await await_idle_frame()


func test_the_schedule_tab_lists_my_games() -> void:
	var s := await _mount(_vm({"day": 10, "schedule": [
		_game(12, true), _game(20, true), _game(13, false)]}))
	await _open_schedule(s)
	var t := _texts(s)
	assert_array(t).contains(["3월 12일 (금)", "3월 20일 (토)"])
	# NPC 경기는 안 보인다
	assert_array(t).not_contains(["3월 13일 (토)"])


func test_the_schedule_tab_shows_the_record() -> void:
	var g := _game(5, true)
	g["result"] = {"home_score": 3, "away_score": 1, "winner": "TEAM_A"}
	var s := await _mount(_vm({"day": 20, "schedule": [g],
		"protagonist": {"team_id": "TEAM_A"}}))
	await _open_schedule(s)
	assert_array(_texts(s)).contains(["1승 0무 0패 · 남은 경기 0", "승 3:1"])


func test_an_empty_schedule_says_so() -> void:
	var s := await _mount(_vm({"schedule": []}))
	await _open_schedule(s)
	assert_array(_texts(s)).contains(["아직 잡힌 경기가 없습니다"])


## ⚠ **탭을 오갈 때 줄이 쌓이면 안 된다.** 떼고 나서 지워야 한다
func test_leaving_and_returning_does_not_duplicate_rows() -> void:
	var s := await _mount(_vm({"day": 10, "schedule": [_game(12, true)]}))
	await _open_schedule(s)
	var before: int = s._tab_host.get_child_count()
	s._on_tab(0)
	await await_idle_frame()
	await _open_schedule(s)
	assert_int(s._tab_host.get_child_count()).is_equal(before)


## 색이 등급을 말한다 — 숫자만 보면 어느 게 오늘인지 모른다
func test_the_row_color_marks_the_state() -> void:
	assert_object(ScheduleRow.status_color("today", false)).is_equal(AppTheme.ACCENT)
	assert_object(ScheduleRow.status_color("missed", false)).is_equal(AppTheme.WARN)
	assert_object(ScheduleRow.status_color("done", true)).is_equal(AppTheme.OK)
	assert_object(ScheduleRow.status_color("done", false)).is_equal(AppTheme.TEXT_DIM)
	assert_object(ScheduleRow.status_color("upcoming", false)).is_equal(AppTheme.TEXT_DIM)


# ── 소식 탭 ───────────────────────────────────────────────────

func _mail(id: String, over: Dictionary = {}) -> Dictionary:
	var m: Dictionary = {"id": id, "category": "news", "sender": "스포츠조선",
		"subject": "제목 %s" % id, "preview": "미리보기", "day": 8,
		"read": false, "decision": null}
	m.merge(over, true)
	return m


func test_the_news_tab_lists_messages() -> void:
	var s := await _mount(_vm({"mailbox": [_mail("A"), _mail("B")]}))
	var t := _texts(s)
	assert_array(t).contains(["· 제목 A", "· 제목 B"])
	assert_array(t).contains(["전체 2", "안읽음 2"])


func test_an_empty_mailbox_says_so() -> void:
	var s := await _mount(_vm({"mailbox": []}))
	assert_array(_texts(s)).contains(["소식이 없습니다"])


## ⚠ **답을 안 한 결정은 표시가 붙는다.** 목록에서 바로 찾을 수 있어야
## 진행이 왜 막혔는지 안다
func test_an_undecided_message_is_marked() -> void:
	var s := await _mount(_vm({"mailbox": [
		_mail("A"), _mail("B", {"decision": {"selected": null}})]}))
	assert_array(_texts(s)).contains(["● 제목 B"])


## 거르기를 누르면 루트에 알린다 — 화면이 자기 안에 안 들고 있다.
##
## ⚠ **알림이 한 프레임 미뤄진다.** 칩이 자기 시그널 안에서 다시 그려지면
## 자기 자신을 지우게 되므로 미뤄서 보낸다 — 검사도 기다려야 한다
func test_a_filter_chip_announces_its_choice() -> void:
	var s := await _mount(_vm({"mailbox": [_mail("A")]}))
	var got: Array = []
	s.news_filter_selected.connect(func(id: String) -> void: got.append(id))
	# 칩 줄의 두 번째가 "안읽음"
	var chips: HBoxContainer = s._tab_host.get_child(0)
	(chips.get_child(1) as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal(["unread"])


func test_the_row_color_marks_pending_and_unread() -> void:
	assert_object(NewsRow.row_color(true, false)).is_equal(AppTheme.WARN)
	assert_object(NewsRow.row_color(false, true)).is_equal(AppTheme.TEXT)
	assert_object(NewsRow.row_color(false, false)).is_equal(AppTheme.TEXT_DIM)


# ── 화면이 계산을 갖지 않는가 ─────────────────────────────────

## ⚠ **이게 이 검사 묶음에서 제일 중요하다.** 02 결함 상당수가 "화면이
## 계산을 갖고 있어서" 생겼다 — 수상 집계가 결산 모달에만, 드래프트 보드가
## 자기 후보 풀을 따로, 경력 기록 조립이 모달 안에만.
##
## 원본 `MainPage.svelte`는 859줄이고 그중 상당수가 계산이었다
func test_the_screen_does_not_compute() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/main_screen.gd")
	# 집계·정렬·필터는 ViewModel이 할 일이다
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains("filter(")
	# 날짜·주차를 화면이 다시 파면 안 된다
	assert_str(src).not_contains("Calendar.")
	# 진행 판단도 마찬가지 — 사전에 이미 답이 있다
	assert_str(src).not_contains("DayEngine.")
	# 스토어를 직접 읽으면 안 된다
	assert_str(src).not_contains("NpcStore")


## ⚠ **`MainVm`은 반대로 화면을 몰라야 한다.** 알면 두 방향 의존이 생겨
## ViewModel을 검사만으로 못 돌린다
func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/main_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
	assert_str(src).not_contains("preload")


# ── 리그 탭 ───────────────────────────────────────────────────

func _standing_game(day: int, home: String, away: String, hs: int, as_: int) -> Dictionary:
	var winner: String = home if hs >= as_ else away
	var loser = null if hs == as_ else (away if hs > as_ else home)
	return {"id": "G%d" % day, "day": day, "league_id": "LEAGUE_KBL",
		"home": home, "away": away, "is_protagonist_game": false,
		"result": {"home_score": hs, "away_score": as_,
			"winner_id": winner, "loser_id": loser, "player_lines": []}}


func _open_league(s: MainScreen) -> void:
	s._on_tab(3)
	await await_idle_frame()


func test_the_league_tab_shows_the_standings() -> void:
	var s := await _mount(_vm({"day": 50, "schedule": [
		_standing_game(1, "TEAM_A", "TEAM_B", 5, 2),
		_standing_game(2, "TEAM_A", "TEAM_B", 4, 1),
		_standing_game(3, "TEAM_A", "TEAM_B", 0, 3),
	], "protagonist": {"team_id": "TEAM_A", "league_id": "LEAGUE_KBL"},
		"team_names": {"TEAM_A": "제주", "TEAM_B": "서울"}}))
	await _open_league(s)
	var t := _texts(s)
	assert_array(t).contains(["제주", "서울"])
	assert_array(t).contains(["2승 0무 1패", "1승 0무 2패"])
	# 승률은 앞 0을 떼고 셋째 자리까지
	assert_array(t).contains([".667", ".333"])


func test_the_league_tab_offers_every_league() -> void:
	var s := await _mount(_vm({"protagonist": {"team_id": "TEAM_A",
		"league_id": "LEAGUE_KBL"}}))
	await _open_league(s)
	assert_array(_texts(s)).contains(["KBL", "ABL", "JBL", "고교", "대학", "독립"])


func test_a_league_with_no_games_says_so() -> void:
	var s := await _mount(_vm({"protagonist": {"team_id": "TEAM_A",
		"league_id": "LEAGUE_KBL"}, "schedule": []}))
	await _open_league(s)
	assert_array(_texts(s)).contains(["아직 치른 경기가 없습니다"])


## 내 팀은 눈에 띄어야 한다 — 10팀이면 찾기 어렵다
func test_my_row_is_highlighted() -> void:
	assert_object(StandingRow.row_color(true)).is_equal(AppTheme.ACCENT)
	assert_object(StandingRow.row_color(false)).is_equal(AppTheme.TEXT)


# ── 팀 탭 ─────────────────────────────────────────────────────

func test_the_team_tab_lists_the_roster() -> void:
	var roster: Array = [
		{"id": "P1", "name": "김투수", "position": "SP", "age": 17,
			"pitching": {"ovr": 72.0}, "batting": {"ovr": 20.0}, "potential_hidden": 85.0},
		{"id": "B1", "name": "이타자", "position": "SS", "age": 18,
			"pitching": {"ovr": 10.0}, "batting": {"ovr": 66.0}, "potential_hidden": 80.0},
	]
	var s := await _mount(_vm({"protagonist": {"id": "P1", "team_id": "T1",
		"team_name": "제주"}, "world": {"rosters": {"T1": roster}}}))
	s._on_tab(2)
	await await_idle_frame()

	var t := _texts(s)
	assert_array(t).contains(["김투수", "이타자"])
	assert_array(t).contains(["제주 · 2명 · 투수 1 · 야수 1"])
	# 투수는 투구 OVR, 야수는 타격 OVR
	assert_array(t).contains(["72", "66"])


func test_an_empty_roster_says_so() -> void:
	var s := await _mount(_vm({"protagonist": {"team_id": "T1"},
		"world": {"rosters": {}}}))
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["로스터가 비어 있습니다"])


func test_i_am_highlighted_in_my_roster() -> void:
	assert_object(PlayerRow.row_color(true)).is_equal(AppTheme.ACCENT)
	assert_object(PlayerRow.row_color(false)).is_equal(AppTheme.TEXT)


# ── 나 탭 ─────────────────────────────────────────────────────

## ⚠ **P1에서 만든 `StatusScreen`을 안 고치고 그대로 끼운다.** 사전 하나만
## 받는 화면이라 그게 된다 — 그 규약이 값을 하는 지점이다
func test_the_me_tab_mounts_the_status_screen() -> void:
	var s := await _mount(_vm({"protagonist": {"id": "ME", "name": "김한결",
		"team_id": "T1", "team_name": "제주", "league_id": "LEAGUE_HIGHSCHOOL",
		"pitching": {"velocity": 70.0, "command": 62.0}}}))
	s._on_tab(1)
	await await_idle_frame()

	var t := _texts(s)
	assert_array(t).contains(["신체 상태", "투구 능력치", "구위", "커맨드"])
	assert_array(t).contains(["제주"])
