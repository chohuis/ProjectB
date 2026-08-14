extends GdUnitTestSuite

## 리그 탭 ViewModel — M7-6b.
##
## 원본: `pages/league/LeaguePage.svelte`
##
## ⚠ **순위표를 화면이 만들지 않는다.** 02에서 화면이 자기 집계를 갖던
## 자리가 결함의 뿌리였다 — 수상 집계가 결산 모달에만, 드래프트 보드가
## 자기 후보 풀을 따로.
##
## ⚠ **일정에서 매번 다시 센다.** 순위표를 상태에 들고 있으면 경기 결과와
## 어긋나는 순간이 오고, 어느 쪽이 맞는지 알 방법이 없다.


func _game(day: int, home: String, away: String, hs: int = -1, as_: int = -1,
		lid: String = "LEAGUE_KBL") -> Dictionary:
	var g: Dictionary = {"id": "%s_%d_%s_%s" % [lid, day, home, away],
		"day": day, "league_id": lid, "home": home, "away": away,
		"is_protagonist_game": false, "result": null}
	if hs >= 0:
		var winner: String = ""
		var loser = null
		if hs > as_:
			winner = home
			loser = away
		elif as_ > hs:
			winner = away
			loser = home
		else:
			winner = home
		g["result"] = {"home_score": hs, "away_score": as_,
			"winner_id": winner, "loser_id": loser, "player_lines": []}
	return g


func _state(games: Array, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 100, "season_year": 2027,
		"protagonist": {"team_id": "A", "league_id": "LEAGUE_KBL"},
		"schedule": games,
		"team_names": {"A": "제주", "B": "서울", "C": "부산"},
	}
	s.merge(over, true)
	return s


func _rows(s: Dictionary) -> Array:
	return LeagueVm.build(s)["rows"]


# ── 세는가 ────────────────────────────────────────────────────

func test_wins_and_losses_are_counted() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 5, 2),
		_game(2, "A", "B", 1, 3),
		_game(3, "A", "B", 4, 0),
	]))
	for r in rows:
		if r["team_id"] == "A":
			assert_int(r["wins"]).is_equal(2)
			assert_int(r["losses"]).is_equal(1)
		if r["team_id"] == "B":
			assert_int(r["wins"]).is_equal(1)
			assert_int(r["losses"]).is_equal(2)


## ⚠ **무승부를 패로 세면 안 된다.** 02는 승자 id가 빈 문자열로도 와서
## 전부 패로 찍혔다
func test_draws_are_counted_apart() -> void:
	var rows: Array = _rows(_state([_game(1, "A", "B", 2, 2)]))
	for r in rows:
		assert_int(r["draws"]).is_equal(1)
		assert_int(r["wins"]).is_equal(0)
		assert_int(r["losses"]).is_equal(0)


## ⚠ **안 치른 경기는 안 센다.** 세면 개막 전에 전 팀이 0승 0패가 아니라
## 승률 0으로 줄줄이 뜬다
func test_unplayed_games_are_ignored() -> void:
	var rows: Array = _rows(_state([_game(1, "A", "B"), _game(2, "A", "B", 3, 1)]))
	for r in rows:
		assert_int(int(r["wins"]) + int(r["losses"]) + int(r["draws"])).is_equal(1)


func test_win_pct_is_computed() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 5, 2), _game(2, "A", "B", 4, 1),
		_game(3, "A", "B", 0, 3),
	]))
	for r in rows:
		if r["team_id"] == "A":
			assert_float(r["win_pct"]).is_equal_approx(0.667, 0.005)


## ⚠ **무승부는 승률 분모에서 뺀다** — 야구의 관례다. 안 그러면 무승부가
## 많은 팀이 순위에서 밀린다
func test_draws_do_not_count_in_win_pct() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 5, 2), _game(2, "A", "B", 2, 2),
	]))
	for r in rows:
		if r["team_id"] == "A":
			assert_float(r["win_pct"]).is_equal_approx(1.0, 0.001)


# ── 리그를 가르는가 ───────────────────────────────────────────

## ⚠ **다른 리그 경기가 섞이면 안 된다.** 하루 83경기가 도는데 다 세면
## 순위표가 뒤죽박죽이 된다
func test_other_leagues_do_not_leak_in() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 5, 2),
		_game(2, "X", "Y", 9, 0, "LEAGUE_JBL"),
	]))
	var ids: Array = []
	for r in rows:
		ids.append(r["team_id"])
	assert_array(ids).not_contains(["X", "Y"])


func test_the_league_can_be_chosen() -> void:
	var s: Dictionary = _state([
		_game(1, "A", "B", 5, 2),
		_game(2, "X", "Y", 9, 0, "LEAGUE_JBL"),
	], {"league_tab": "LEAGUE_JBL"})
	var ids: Array = []
	for r in _rows(s):
		ids.append(r["team_id"])
	assert_array(ids).contains(["X", "Y"])
	assert_array(ids).not_contains(["A"])


## 안 고르면 주인공 리그다
func test_it_defaults_to_my_league() -> void:
	assert_str(LeagueVm.build(_state([]))["league_id"]).is_equal("LEAGUE_KBL")


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **승률 순이다.** 안 정렬하면 팀 id 순으로 뜬다
func test_rows_are_sorted_by_win_pct() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 1, 9),
		_game(2, "A", "C", 0, 5),
		_game(3, "B", "C", 7, 0),
	]))
	for i in range(1, rows.size()):
		assert_bool(float(rows[i - 1]["win_pct"]) >= float(rows[i]["win_pct"])) \
			.override_failure_message("순위가 승률 순이 아니다").is_true()
	assert_str(rows[0]["team_id"]).is_equal("B")


func test_rows_carry_their_rank() -> void:
	var rows: Array = _rows(_state([
		_game(1, "A", "B", 1, 9), _game(2, "A", "C", 0, 5), _game(3, "B", "C", 7, 0),
	]))
	for i in rows.size():
		assert_int(rows[i]["rank"]).is_equal(i + 1)


# ── 이름·강조 ─────────────────────────────────────────────────

func test_rows_carry_team_names() -> void:
	var rows: Array = _rows(_state([_game(1, "A", "B", 5, 2)]))
	var names: Array = []
	for r in rows:
		names.append(r["name"])
	assert_array(names).contains(["제주", "서울"])


func test_an_unknown_team_falls_back_to_its_id() -> void:
	var rows: Array = _rows(_state([_game(1, "A", "Z", 5, 2)]))
	var names: Array = []
	for r in rows:
		names.append(r["name"])
	assert_array(names).contains(["Z"])


## ⚠ **내 팀이 어디인지 보여야 한다.** 10팀이면 찾기 어렵다
func test_my_team_is_marked() -> void:
	var rows: Array = _rows(_state([_game(1, "A", "B", 5, 2)]))
	var mine: int = 0
	for r in rows:
		if r["is_mine"]:
			mine += 1
			assert_str(r["team_id"]).is_equal("A")
	assert_int(mine).is_equal(1)


## 다른 리그를 보면 내 팀이 없다
func test_another_league_marks_nothing() -> void:
	var s: Dictionary = _state([_game(1, "X", "Y", 5, 2, "LEAGUE_JBL")],
		{"league_tab": "LEAGUE_JBL"})
	for r in _rows(s):
		assert_bool(r["is_mine"]).is_false()


# ── 고를 수 있는 리그 ─────────────────────────────────────────

## 화면이 리그 목록을 따로 만들지 않는다
func test_the_league_list_comes_from_the_view_model() -> void:
	var vm: Dictionary = LeagueVm.build(_state([]))
	var ids: Array = []
	for t in vm["leagues"]:
		ids.append(t["id"])
	assert_array(ids).contains(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"])
	for t in vm["leagues"]:
		assert_str(t["label"]).is_not_empty()


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = LeagueVm.build({})
	assert_array(vm["rows"]).is_empty()
	assert_bool(vm.has("leagues")).is_true()


func test_a_season_with_no_games_yet_is_empty() -> void:
	assert_array(_rows(_state([_game(1, "A", "B")]))).is_empty()


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/league_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")


## ⚠ **패자 표기가 둘이다** — 옛 세이브는 `null`, 이주한 코드는 빈 문자열.
## 한쪽만 보면 무승부가 조용히 홈 승리로 기록된다
func test_an_empty_string_loser_is_also_a_draw() -> void:
	var g: Dictionary = _game(1, "A", "B")
	g["result"] = {"home_score": 2, "away_score": 2,
		"winner_id": "A", "loser_id": "", "player_lines": []}
	for r in _rows(_state([g])):
		assert_int(r["draws"]).override_failure_message(
			"빈 문자열 패자를 무승부로 안 봤다").is_equal(1)
		assert_int(r["wins"]).is_equal(0)


## ⚠ **무승부만 한 팀은 승패가 0이다.** 그대로 나누면 NaN이 나와서
## 정렬이 무너지고 화면에 `nan`이 뜬다
func test_a_team_with_only_draws_has_zero_win_pct() -> void:
	for r in _rows(_state([_game(1, "A", "B", 2, 2)])):
		assert_float(r["win_pct"]).override_failure_message(
			"승패 0인데 승률이 %s다" % r["win_pct"]).is_equal(0.0)
		assert_bool(is_nan(r["win_pct"])).is_false()
