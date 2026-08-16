extends GdUnitTestSuite

## 나 탭 ViewModel — M7-6c.
##
## 원본: `pages/status/StatusPage.svelte` (1,004줄)
##
## ⚠ **`StatusScreen`은 P1에서 이미 만들었다.** 그때는 손으로 만든 사전을
## 받았고, 여기서 **실제 상태에서 그 사전을 만든다.** 화면은 안 고친다 —
## 그게 "화면이 사전 하나만 받는다"가 값을 하는 지점이다.


func _me(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "team_id": "T1", "team_name": "제주",
		"league_id": "LEAGUE_HIGHSCHOOL", "age": 17, "position": "SP",
		"condition": 72.0, "fatigue": 20.0, "injury": null,
		"potential": 88.0, "development_rate": 65.0,
		"pitching": {"ovr": 66.0, "velocity": 70.0, "command": 62.0,
			"control": 64.0, "movement": 60.0, "stamina": 68.0,
			"mentality": 58.0, "recovery": 55.0, "clutch": 52.0,
			"hold_runners": 50.0},
		"batting": {"ovr": 30.0},
	}
	p.merge(over, true)
	return p


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 100, "season_year": 2027, "protagonist": _me(),
		"schedule": [],
	}
	s.merge(over, true)
	return s


# ── 화면이 읽는 키가 다 있는가 ────────────────────────────────

## ⚠ **화면이 읽는 키를 하나라도 빠뜨리면 그 자리가 조용히 빈다.**
## `StatusScreen`은 없는 키에 기본값을 쓰므로 오류가 안 난다
func test_the_view_model_has_every_key_the_screen_reads() -> void:
	var vm: Dictionary = StatusVm.build(_state())
	for k in ["team_name", "league_short", "injury", "injury_history",
			"contract", "pitches", "pitching", "season_title", "season_stats",
			"career"]:
		assert_bool(vm.has(k)).override_failure_message("빠진 키: %s" % k).is_true()


func test_the_team_and_league_come_along() -> void:
	var vm: Dictionary = StatusVm.build(_state())
	assert_str(vm["team_name"]).is_equal("제주")
	assert_str(vm["league_short"]).is_equal("고교")


# ── 능력치 ────────────────────────────────────────────────────

## ⚠ **화면이 이름표를 안 만든다.** 02에선 화면이 `TRN_CTRL_CMD` 같은
## 원문을 그대로 띄웠다
func test_pitching_rows_are_named_in_korean() -> void:
	var names: Array = []
	for r in StatusVm.build(_state())["pitching"]:
		names.append(r["name"])
	assert_array(names).contains(["구위", "커맨드", "제구", "스태미나"])


func test_pitching_rows_carry_values() -> void:
	for r in StatusVm.build(_state())["pitching"]:
		if r["name"] == "구위":
			assert_float(r["value"]).is_equal(70.0)


## ⚠ **모르는 능력치를 빈칸으로 두지 않는다.** 능력치가 늘었을 때
## 화면에서 안 보이면 아무도 모른다
func test_every_pitching_stat_is_shown() -> void:
	assert_int(StatusVm.build(_state())["pitching"].size()).is_equal(9)


# ── 부상 ──────────────────────────────────────────────────────

func test_no_injury_reads_as_healthy() -> void:
	assert_bool(StatusVm.build(_state())["injury"].is_empty()).is_true()


func test_an_injury_carries_its_details() -> void:
	var s: Dictionary = _state({"protagonist": _me({"injury": {
		"name": "팔꿈치 염증", "severity": "moderate", "weeks_left": 3,
		"weeks_total": 6}})})
	var inj: Dictionary = StatusVm.build(s)["injury"]
	assert_str(inj["name"]).is_equal("팔꿈치 염증")
	assert_int(inj["weeks_left"]).is_equal(3)
	# 심각도는 한국어 이름표가 붙는다 — 화면이 만들지 않는다
	assert_str(inj["severity_label"]).is_equal("중등도")


func test_an_unknown_severity_falls_back_to_its_id() -> void:
	var s: Dictionary = _state({"protagonist": _me({"injury": {
		"name": "무엇", "severity": "weird", "weeks_left": 1, "weeks_total": 1}})})
	assert_str(StatusVm.build(s)["injury"]["severity_label"]).is_equal("weird")


# ── 부상 이력 (U-1) ───────────────────────────────────────────
#
# ⚠ **`injury_history`를 아무도 안 채우고 있었다.** 화면이 그 키로 카드를
# 만드는데 상태에 쓰는 곳이 `Fixtures`뿐이라, 캡처에는 이력이 보이는데
# **진짜 게임에서는 카드가 아예 안 붙었다.** 실제 기록은 `body_log`에 있다.


func _healed(day: int, year: int, t: String, sev: String,
		penalty: Dictionary = {}) -> Dictionary:
	return {"day": day, "year": year, "kind": "healed",
		"injury_type": t, "severity": sev, "penalty": penalty}


func test_a_healed_injury_becomes_a_history_row() -> void:
	var s: Dictionary = _state({"body_log": [
		_healed(120, 2027, "BLISTER", "moderate")]})
	var rows: Array = StatusVm.build(s)["injury_history"]
	assert_int(rows.size()).is_equal(1)
	assert_int(rows[0]["year"]).is_equal(2027)
	assert_int(rows[0]["week"]).is_equal(Calendar.week_of(120))
	assert_str(rows[0]["severity_label"]).is_equal(
		Injury.severity_label("moderate"))
	# 이름은 id가 아니라 사람이 읽는 말이어야 한다
	assert_str(rows[0]["name"]).is_equal(Injury.label_of("BLISTER"))


## ⚠ **경고는 이력이 아니다.** `body_log`엔 `warning`도 쌓이는데 그건
## "다칠 뻔했다"이지 다친 게 아니다 — 섞으면 이력이 부풀어 오른다
func test_a_fatigue_warning_is_not_a_history_row() -> void:
	var s: Dictionary = _state({"body_log": [
		{"day": 100, "year": 2027, "kind": "warning", "fatigue": 90.0, "risk": 0.3},
		_healed(120, 2027, "ARM_FATIGUE", "light")]})
	var rows: Array = StatusVm.build(s)["injury_history"]
	assert_int(rows.size()).is_equal(1)
	assert_str(rows[0]["name"]).is_equal(Injury.label_of("ARM_FATIGUE"))


## ⚠ **최근 것이 위다.** 로그는 시간 순으로 쌓이므로 그대로 쓰면 제일 오래된
## 부상이 맨 위에 온다
func test_the_newest_injury_comes_first() -> void:
	var s: Dictionary = _state({"body_log": [
		_healed(40, 2026, "ARM_FATIGUE", "light"),
		_healed(120, 2027, "BLISTER", "moderate")]})
	var rows: Array = StatusVm.build(s)["injury_history"]
	assert_int(rows[0]["year"]).is_equal(2027)
	assert_int(rows[1]["year"]).is_equal(2026)


## ⚠ **해가 로그에 있어야 한다.** 날짜는 시즌마다 1로 돌아가므로 `day`만으로는
## 몇 해 것인지 알 수 없다 — 지금 연도로 채우면 옛 부상이 전부 올해가 된다
func test_the_year_comes_from_the_log_not_from_today() -> void:
	var s: Dictionary = _state({"season_year": 2030, "body_log": [
		_healed(40, 2026, "ARM_FATIGUE", "light")]})
	assert_int(StatusVm.build(s)["injury_history"][0]["year"]).is_equal(2026)


## ⚠ **나은 게 곧 원래대로는 아니다.** 후유증이 남았는지가 이력의 요점이다
func test_a_lasting_penalty_is_marked() -> void:
	var s: Dictionary = _state({"body_log": [
		_healed(40, 2026, "ARM_FATIGUE", "light"),
		_healed(120, 2027, "MUSCLE_TIGHTNESS", "surgery", {"velocity": -3.0})]})
	var rows: Array = StatusVm.build(s)["injury_history"]
	assert_bool(rows[0]["has_penalty"]).is_true()
	assert_bool(rows[1]["has_penalty"]).is_false()


func test_no_body_log_is_an_empty_history() -> void:
	assert_array(StatusVm.build(_state())["injury_history"]).is_empty()


# ── 병역 (U-2) ────────────────────────────────────────────────
#
# ⚠ **`sim/military.gd`가 매주 도는데 볼 자리가 하나도 없었다.**
# 02는 네 자리에서 보여줬다(병역 카드 · 상시 패널 · 사이드바 카운트다운 ·
# 우측 패널). 04는 넷 다 없어서 **입대하면 전역이 언제인지 알 길이 없었다.**
#
# ⚠ 02가 이 자리에서 크게 데었다 — 전역 분기가 도달할 수 없는 자리에 있어서
# **입대하면 영원히 군대에 있었다**(실측 700주 · 13.5년). 04는 그 결함을
# 고쳤지만 화면을 안 옮겼다. 같은 증상이 다시 나면 알아볼 방법이 없다.


## 안 다녀왔으면 카드를 안 만든다 — 미필은 대부분의 커리어에서 기본값이라
## 늘 띄우면 아무 뜻이 없는 줄이 하나 붙어 있는다
func test_an_unserved_player_has_no_military_card() -> void:
	assert_bool(StatusVm.build(_state())["military"].is_empty()).is_true()


func test_serving_shows_how_much_is_left() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"military_status": "현역", "military_unit": "sports",
		"military_service_weeks": 40, "military_enlist_year": 2033})})
	var m: Dictionary = StatusVm.build(s)["military"]
	assert_str(m["status"]).is_equal("현역")
	assert_int(m["weeks_served"]).is_equal(40)
	# **남은 주가 이 카드의 요점이다** — 전역이 언제인지를 못 보던 자리다
	assert_int(m["weeks_left"]).is_equal(Military.SERVICE_WEEKS - 40)
	assert_int(m["enlist_year"]).is_equal(2033)


## ⚠ **총 기간을 화면에 다시 적지 않는다.** `Military.SERVICE_WEEKS`가 정본이다
func test_the_total_comes_from_the_rule() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"military_status": "현역", "military_service_weeks": 0})})
	assert_int(StatusVm.build(s)["military"]["weeks_total"]).is_equal(
		Military.SERVICE_WEEKS)


## ⚠ **복무를 채우고도 안 넘기면 남은 주가 음수가 된다** — 0에서 멈춘다
func test_an_overrun_does_not_go_negative() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"military_status": "현역",
		"military_service_weeks": Military.SERVICE_WEEKS + 5})})
	assert_int(StatusVm.build(s)["military"]["weeks_left"]).is_equal(0)


## ⚠ **복무 중엔 팀이 없다** (U-2b). `Military.enlist`가 `team_id`를 비우는데
## `team_name`은 안 지운다 — 계약 카드가 옛 소속을 그대로 띄웠다
func test_serving_does_not_show_the_old_team() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"team_name": "제주 애월고", "military_status": "현역",
		"military_unit": "sports", "military_service_weeks": 10})})
	assert_str(StatusVm.build(s)["team_name"]).is_equal("체육부대")


## ⚠ **이름을 상태에서 지우지 않는다.** 전역할 때 돌아갈 곳의 이름이 사라진다
func test_a_discharged_player_shows_the_team_again() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"team_name": "제주 애월고", "military_status": "군필"})})
	assert_str(StatusVm.build(s)["team_name"]).is_equal("제주 애월고")


## ⚠ **복무 리그에도 이름표가 있어야 한다** — 없으면 `LEAGUE_MILITARY`가
## 원문 그대로 뜬다
func test_the_military_league_has_a_label() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"league_id": "LEAGUE_MILITARY", "military_status": "현역"})})
	assert_str(StatusVm.build(s)["league_short"]).is_equal("복무")


## 다녀온 뒤에도 카드가 남는다 — "군필"은 커리어의 사실이다
func test_a_finished_service_still_shows() -> void:
	var s: Dictionary = _state({"protagonist": _me({
		"military_status": "군필", "military_served_unit": "general",
		"military_enlist_year": 2033})})
	var m: Dictionary = StatusVm.build(s)["military"]
	assert_str(m["status"]).is_equal("군필")
	# 다녀왔으면 남은 주를 안 보여준다 — 0주 남았다고 뜨면 아직 복무 중 같다
	assert_bool(m["serving"]).is_false()


# ── 시즌 기록 ─────────────────────────────────────────────────

func test_the_season_title_shows_the_year() -> void:
	assert_str(StatusVm.build(_state())["season_title"]).is_equal("2027년 시즌 누적")


## ⚠ **기록이 없으면 빈 목록이다.** 0으로 채우면 안 뛴 선수가 0.00 방어율로
## 뜬다
func test_no_stats_yet_is_an_empty_list() -> void:
	assert_array(StatusVm.build(_state())["season_stats"]).is_empty()


## 시즌 기록은 상태에 쌓인 것을 읽는다 — 화면이 다시 세지 않는다
func test_season_stats_come_from_the_state() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": {
		"g": 11, "ip": 52.3, "era": 4.83, "k": 47, "bb": 19, "w": 5, "l": 3}}})
	var rows: Array = StatusVm.build(s)["season_stats"]
	var by: Dictionary = {}
	for r in rows:
		by[r["name"]] = r["value"]
	assert_str(by["등판"]).is_equal("11경기")
	assert_str(by["평균자책"]).is_equal("4.83")
	assert_str(by["승-패"]).is_equal("5승 3패")


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = StatusVm.build({})
	assert_bool(vm.has("pitching")).is_true()
	assert_array(vm["career"]).is_empty()


## ⚠ **화면이 그 사전으로 실제로 떠야 한다.** 키 이름이 하나만 달라도
## 그 자리가 조용히 빈다 — 검사가 화면을 띄워서 본다
func test_the_screen_renders_this_view_model() -> void:
	var screen: StatusScreen = preload("res://ui/screens/status_screen.tscn").instantiate()
	screen.set_view_model(StatusVm.build(_state()))
	add_child(screen)
	await await_idle_frame()

	var texts := PackedStringArray()
	_collect(screen, texts)
	assert_array(texts).contains(["제주", "구위", "신체 상태"])


func _collect(node: Node, out: PackedStringArray) -> void:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_collect(c, out)


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/status_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("preload")
