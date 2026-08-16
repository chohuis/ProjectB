extends GdUnitTestSuite

## 팀 상세 — F-4b · F-3b.
##
## ⚠ **02의 "팀 평가"는 그대로 못 옮긴다.** 02는 `prestige`(문자열 등급) ·
## `fanBase` · `facilityLevel` · `atmosphere`를 보여주는데 **04엔 그
## 데이터가 없다.** 대신 F-3에서 살린 `TeamProfile` 열두 축을 보여준다 —
## 그게 04에서 실제로 게임을 움직이는 값이고 지금 볼 방법이 없다.
##
## 원본: `features/team/ui/TeamDetailModal.svelte` (979줄)


const TEAM: String = "TEAM_KBL_SEOUL_ROYALS_1"


func _state() -> Dictionary:
	var w: Dictionary = World.build({"seed": 4242, "season_year": 2027})
	return {"season_year": 2027, "day": 10, "world": w,
		"protagonist": {"id": "ME", "team_id": "TEAM_HS_AEWOL"},
		"schedule": []}


## ⚠ **결과 키는 `Standings`가 읽는 그대로다.** 지어내면 승패가 전부 0으로
## 세어지고 검사가 "0승 0패"를 통과시킨다 — 처음에 그렇게 짰다
func _game(home: String, away: String, hr: int, ar: int) -> Dictionary:
	return {"id": "%s-%s-%d" % [home, away, hr], "day": 1,
		"league_id": "LEAGUE_KBL", "home": home, "away": away,
		"result": {"home_score": hr, "away_score": ar,
			"winner_id": home if hr > ar else away,
			"loser_id": away if hr > ar else home}}


# ── 누구의 팀인가 ─────────────────────────────────────────────

func test_it_finds_the_team() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), TEAM)
	assert_str(String(vm["name"])).is_equal(
		String(World.team_field({}, TEAM, "name", "")))
	assert_str(String(vm["league_label"])).is_equal("KBL")
	assert_str(String(vm["city"])).is_not_empty()


func test_an_unknown_team_gives_nothing() -> void:
	assert_bool(TeamDetailVm.build(_state(), "NOPE").is_empty()).is_true()
	assert_bool(TeamDetailVm.build(_state(), "").is_empty()).is_true()


## ⚠ **리그 id가 그대로 뜨면 안 된다** — 이름표를 빠뜨리면 조용히 원문이
## 샌다(F-5·F-4a에서 두 번 겪었다)
func test_the_league_gets_a_label() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), "TEAM_ABL_EMPIRE_1")
	assert_str(String(vm["league_label"])).is_equal("ABL")


func test_it_knows_my_own_team() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["team_id"] = TEAM
	assert_bool(TeamDetailVm.build(s, TEAM)["is_mine"]).is_true()
	assert_bool(TeamDetailVm.build(_state(), TEAM)["is_mine"]).is_false()


# ── 팀 평가 (F-3의 열두 축) ───────────────────────────────────

## ⚠ **F-3 전에는 아홉 축이 전부 50이었다.** 그걸 막대로 그리면 모든 팀이
## 똑같은 그림이 되어 화면이 고장난 것처럼 보인다
##
## ⚠ **`AXES.size()`와 비교하면 안 된다.** 축을 하나 지워도 기대값이 같이
## 줄어 검사가 아무것도 안 본다 — 변이가 그대로 통과했다. **열둘을 못 박는다**
func test_it_shows_the_twelve_axes() -> void:
	var rows: Array = TeamDetailVm.build(_state(), TEAM)["profile"]
	assert_int(rows.size()).override_failure_message(
		"성향 축이 %d개다 — `TeamProfile.DEFAULT`는 열둘이다" % rows.size()
		).is_equal(TeamProfile.DEFAULT.size())
	assert_int(rows.size()).is_equal(12)
	var names := PackedStringArray()
	for r in rows:
		names.append(String(r["name"]))
	assert_array(names).contains(["명성", "지갑", "성적 압박"])


## ⚠ **팀마다 달라야 한다.** 같으면 F-3이 안 돌고 있는 것이다
func test_two_teams_do_not_look_the_same() -> void:
	var s: Dictionary = _state()
	var a: Array = TeamDetailVm.build(s, "TEAM_ABL_EMPIRE_1")["profile"]
	var b: Array = TeamDetailVm.build(s, "TEAM_ABL_COASTALRAYS_1")["profile"]
	var differ: int = 0
	for i in a.size():
		if not is_equal_approx(float(a[i]["value"]), float(b[i]["value"])):
			differ += 1
	assert_int(differ).override_failure_message(
		"두 팀의 성향이 %d개만 다르다 — 팀이 구분되지 않는다" % differ).is_greater(6)


## ⚠ **성향이 없는 팀은 빈 목록이다.** 학교엔 구단이 없는데 50 막대 열둘을
## 그리면 "특징이 없는 구단"으로 읽힌다
func test_a_school_team_has_no_profile_section() -> void:
	assert_array(TeamDetailVm.build(_state(), "TEAM_HS_AEWOL")["profile"]
		).is_empty()


# ── 이번 시즌 ─────────────────────────────────────────────────

## ⚠ **한 경기도 안 치렀으면 빈 사전이다.** 0승 0패 1위로 뜨면 시즌이
## 시작된 것처럼 보인다
func test_no_games_means_no_standing() -> void:
	assert_bool((TeamDetailVm.build(_state(), TEAM)["standing"] as Dictionary)
		.is_empty()).is_true()


func test_it_shows_this_seasons_record() -> void:
	var s: Dictionary = _state()
	var other: String = "TEAM_KBL_BUSAN_WAVES_1"
	s["schedule"] = [_game(TEAM, other, 5, 3), _game(TEAM, other, 2, 4),
		_game(TEAM, other, 7, 1)]
	var st: Dictionary = TeamDetailVm.build(s, TEAM)["standing"]
	assert_int(int(st["wins"])).is_equal(2)
	assert_int(int(st["losses"])).is_equal(1)
	assert_int(int(st["rank"])).is_equal(1)
	assert_int(int(st["total"])).is_equal(2)


## ⚠ **순위는 `Standings`가 정본이다.** 화면이 일정에서 다시 세면 리그
## 표와 갈린다
func test_the_rank_matches_the_standings() -> void:
	var s: Dictionary = _state()
	var other: String = "TEAM_KBL_BUSAN_WAVES_1"
	s["schedule"] = [_game(TEAM, other, 1, 9), _game(TEAM, other, 0, 8)]
	var st: Dictionary = TeamDetailVm.build(s, TEAM)["standing"]
	assert_int(int(st["rank"])).override_failure_message(
		"두 번 크게 진 팀이 1위다").is_equal(2)


# ── 로스터 ────────────────────────────────────────────────────

## ⚠ **팀 탭과 같은 것을 봐야 한다.** 두 벌로 두면 같은 팀이 두 화면에서
## 다르게 정렬되고 OVR도 갈린다
func test_the_roster_comes_from_the_team_tab() -> void:
	var s: Dictionary = _state()
	var mine: String = String(s["protagonist"]["team_id"])
	s["protagonist"]["team_id"] = TEAM
	assert_array(TeamDetailVm.build(s, TEAM)["roster"]).is_equal(
		TeamVm.build(s)["rows"])
	s["protagonist"]["team_id"] = mine


func test_the_roster_is_not_empty() -> void:
	assert_array(TeamDetailVm.build(_state(), TEAM)["roster"]).is_not_empty()


# ── 화면에 실제로 뜨는가 ──────────────────────────────────────

func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _mount(vm: Dictionary) -> TeamDetailScreen:
	var s: TeamDetailScreen = preload(
		"res://ui/screens/team_detail_screen.tscn").instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func test_the_screen_shows_the_team() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), TEAM)
	var joined: String = " ".join(_texts(await _mount(vm)))
	assert_str(joined).contains(String(vm["name"]))
	assert_str(joined).contains("구단 성향")
	assert_str(joined).contains("명성")
	assert_str(joined).contains("선수단")


## 학교 팀엔 구단 성향 카드가 없다 — 50 막대 열둘은 "특징 없는 구단"으로 읽힌다
func test_the_screen_omits_an_empty_profile() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), "TEAM_HS_AEWOL")
	assert_array(_texts(await _mount(vm))).not_contains(["구단 성향"])


func test_the_screen_survives_an_empty_view_model() -> void:
	assert_str(" ".join(_texts(await _mount({})))).contains("찾을 수 없습니다")


# ── 눌러서 열리는가 ───────────────────────────────────────────

const ROOT := preload("res://ui/app_root.tscn")


## ⚠ **새 게임 첫날엔 순위표가 비어 있다.** 치른 경기가 없으면
## `Standings.from_schedule`이 빈 배열을 주고 리그 탭에 줄이 하나도 안 뜬다 —
## 그러면 "눌러서 열리는가"를 볼 수가 없다. 결과를 몇 개 꽂아 둔다
func _mount_root() -> AppRoot:
	var s: Dictionary = World.new_game({"seed": 5150, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	# ⚠ **리그 탭이 보는 리그의 경기여야 한다.** 아무 경기나 꽂으면
	# `from_schedule`이 리그로 걸러서 순위표가 그대로 빈다
	var lid: String = String(s.get("protagonist", {}).get(
		"league_id", "LEAGUE_HIGHSCHOOL"))
	var done: int = 0
	for g in s.get("schedule", []):
		if done >= 6:
			break
		if String(g.get("league_id", "")) != lid:
			continue
		if g.get("is_tournament", false) or g.get("result", null) != null:
			continue
		g["result"] = {"home_score": 5, "away_score": 3,
			"winner_id": g["home"], "loser_id": g["away"]}
		done += 1
	assert_int(done).override_failure_message(
		"일정에 치를 수 있는 경기가 없다 — 순위표가 빌 수밖에 없다").is_greater(0)

	var r: AppRoot = ROOT.instantiate()
	r.set_state(s)
	add_child(r)
	await await_idle_frame()
	return r


func _rows(node: Node, out: Array = []) -> Array:
	if node is StandingRow:
		out.append(node)
	for c in node.get_children():
		_rows(c, out)
	return out


## ⚠ **순위표 줄이 눌려야 한다.** 예전엔 `HBoxContainer`라 아무것도 안
## 눌렸다 — 다른 팀이 어떤 구단인지 볼 입구가 없었다
func test_pressing_a_standings_row_opens_the_team() -> void:
	var r: AppRoot = await _mount_root()
	r.screen().show_tab("league")
	await await_idle_frame()

	var all: Array = _rows(r.screen())
	assert_array(all).override_failure_message(
		"순위표에 누를 수 있는 줄이 하나도 없다").is_not_empty()
	all[0].pressed.emit()
	await await_idle_frame()
	assert_object(r.team_detail_screen()).override_failure_message(
		"순위표 줄을 눌렀는데 팀 상세가 안 열렸다").is_not_null()


func test_closing_the_team_returns_to_the_main_screen() -> void:
	var r: AppRoot = await _mount_root()
	r.screen().show_tab("league")
	await await_idle_frame()
	_rows(r.screen())[0].pressed.emit()
	await await_idle_frame()

	r.team_detail_screen().closed.emit()
	await await_idle_frame()
	assert_object(r.team_detail_screen()).is_null()
	assert_bool(r.screen().visible).override_failure_message(
		"팀 상세를 닫았는데 진행 화면이 안 돌아왔다").is_true()


## ⚠ **팀에서 사람으로 들어가고 되돌아온다.** 진행 화면으로 튕기면 보던
## 팀을 다시 찾아 들어가야 한다
func test_a_player_opens_over_the_team_and_returns_to_it() -> void:
	var r: AppRoot = await _mount_root()
	r.screen().show_tab("league")
	await await_idle_frame()
	_rows(r.screen())[0].pressed.emit()
	await await_idle_frame()

	var team: TeamDetailScreen = r.team_detail_screen()
	var pid: String = String(TeamDetailVm.build(r.state(),
		String(team._vm["id"]))["roster"][0]["id"])
	team.player_selected.emit(pid)
	await await_idle_frame()
	assert_object(r.player_detail_screen()).override_failure_message(
		"팀 로스터에서 선수를 눌렀는데 상세가 안 열렸다").is_not_null()
	assert_bool(team.visible).is_false()

	r.player_detail_screen().closed.emit()
	await await_idle_frame()
	assert_object(r.team_detail_screen()).override_failure_message(
		"선수 상세를 닫았는데 팀 상세로 안 돌아왔다").is_not_null()
	assert_bool(r.team_detail_screen().visible).is_true()


## ⚠ **국내 182팀의 구장이 전부 `STADIUM_SEOUL_ROYALS` 꼴이다** — 이름
## 데이터가 아예 없다. 그대로 쓰면 화면에 원문이 샌다(**캡처에서 실제로
## 그렇게 찍혔다** — F-5·F-4a에 이어 세 번째다)
func test_a_raw_stadium_id_does_not_leak() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), TEAM)
	assert_str(String(vm["stadium"])).override_failure_message(
		"구장이 원문 id로 샌다: %s" % vm["stadium"]).is_empty()


## 해외 팀은 이름이 있으니 보여준다 — 있는 것까지 감추면 안 된다
func test_a_real_stadium_name_is_kept() -> void:
	var vm: Dictionary = TeamDetailVm.build(_state(), "TEAM_ABL_EMPIRE_1")
	assert_str(String(vm["stadium"])).is_equal(
		String(World.team_field({}, "TEAM_ABL_EMPIRE_1", "stadium", "")))
	assert_str(String(vm["stadium"])).is_not_empty()
