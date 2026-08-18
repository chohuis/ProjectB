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
	# ⚠ **`not_contains`로는 못 본다** (D-8) — 대소문자를 무시하고 주석까지
	# 코드로 본다. 사전 키 `"label"`이 `Label` 노드로 잡혀 거짓 실패가 난다
	for node in ["Control", "Label"]:
		assert_bool(CodeText.lacks("res://ui/league_vm.gd", node)) \
			.override_failure_message("ViewModel이 화면 노드를 안다: %s" % node) \
			.is_true()


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


# ── 스탯 순위 ────────────────────────────────────────────────────

## 진짜 세계에 진짜 성적을 넣는다 — 손으로 만든 사전이면 로스터·리그가
## 안 맞아 표가 통째로 빈다(다이제스트에서 그 함정을 세 번 밟았다)
func _played_world(games: int = 120) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var n: int = 0
	for g in s["schedule"]:
		if String(g.get("league_id", "")) != "LEAGUE_HIGHSCHOOL":
			continue
		GameSim.play(g, s)
		n += 1
		if n >= games:
			break
	s["league_tab"] = "LEAGUE_HIGHSCHOOL"
	return s


## 🔴 **`Leaderboard` 147줄을 아무도 안 불렀다** — 리그 1위가 누구인지
## 볼 방법이 없었다(형태 ② — 일곱 번째)
func test_스탯_순위가_나온다() -> void:
	var lb: Dictionary = LeagueVm.build(_played_world())["leaderboard"]
	var rows: Array = lb["rows"]
	assert_int(rows.size()).override_failure_message(
		"경기를 치렀는데 스탯 순위가 비었다").is_greater(0)
	assert_str(String(rows[0]["name"])).is_not_empty()
	assert_str(String(rows[0]["team"])).is_not_empty()
	assert_str(String(rows[0]["value"])).is_not_empty()
	assert_int(int(rows[0]["rank"])).is_equal(1)


## 부문을 고를 수 있다 — 투수·타자 양쪽
func test_투수와_타자를_가른다() -> void:
	var s: Dictionary = _played_world()
	s["league_stat_side"] = "batter"
	var lb: Dictionary = LeagueVm.build(s)["leaderboard"]
	assert_str(String(lb["side"])).is_equal("batter")
	var keys: Array = []
	for c in lb["categories"]:
		keys.append(String(c["key"]))
	assert_array(keys).contains(["hr"])
	assert_array(keys).override_failure_message(
		"타자 부문에 투수 부문이 섞였다").not_contains(["era"])


## 고른 부문으로 정렬된다 — 탈삼진 1위가 진짜 1위여야 한다
func test_고른_부문으로_줄_세운다() -> void:
	var s: Dictionary = _played_world()
	s["league_stat_key"] = "k"
	var rows: Array = LeagueVm.build(s)["leaderboard"]["rows"]
	assert_int(rows.size()).is_greater(1)
	for i in range(1, rows.size()):
		assert_bool(int(rows[i - 1]["value"]) >= int(rows[i]["value"])) \
			.override_failure_message("탈삼진이 %s 다음에 %s다"
				% [rows[i - 1]["value"], rows[i]["value"]]).is_true()


## 평균자책점은 낮은 쪽이 위다 — 방향이 부문마다 다르다
func test_평균자책점은_낮은_쪽이_위다() -> void:
	var s: Dictionary = _played_world()
	s["league_stat_key"] = "era"
	var rows: Array = LeagueVm.build(s)["leaderboard"]["rows"]
	assert_int(rows.size()).is_greater(1)
	assert_bool(float(rows[0]["value"]) <= float(rows[1]["value"])) \
		.override_failure_message("1위 %s가 2위 %s보다 높다"
			% [rows[0]["value"], rows[1]["value"]]).is_true()


## ⚠ **자격을 같이 적는다** — 1이닝 던진 신인이 0.00으로 1위가 되면
## 왜 빠졌는지 설명할 방법이 없다
func test_비율_부문은_자격을_말한다() -> void:
	var s: Dictionary = _played_world()
	s["league_stat_key"] = "era"
	assert_str(String(LeagueVm.build(s)["leaderboard"]["note"])) \
		.contains("규정")
	# 누적 부문은 자격이 없다 — 그 문구도 없어야 한다
	s["league_stat_key"] = "k"
	assert_str(String(LeagueVm.build(s)["leaderboard"]["note"])).is_empty()


## 자격 미달은 비율 부문에서 빠진다.
##
## ⚠ **첫 검사는 이걸 못 잡았다** — 두 부문 다 열 명으로 잘려서 크기가
## 같았다. **아무도 자격이 안 되는 시즌 초반**을 세워야 갈린다
func test_자격_미달은_비율_부문에_안_낀다() -> void:
	var s: Dictionary = _played_world(6)
	s["league_stat_key"] = "era"
	var era_rows: Array = LeagueVm.build(s)["leaderboard"]["rows"]
	s["league_stat_key"] = "k"
	var k_rows: Array = LeagueVm.build(s)["leaderboard"]["rows"]

	assert_int(k_rows.size()).override_failure_message(
		"여섯 경기를 치렀는데 탈삼진 순위가 비었다").is_greater(0)
	assert_int(era_rows.size()).override_failure_message(
		"규정 이닝을 못 채운 시즌 초반인데 평균자책점 순위에 %d명이 있다"
		% era_rows.size()).is_less(k_rows.size())

## 몇 명까지만 — 표가 리그 전체가 되면 못 읽는다
func test_열_명까지만_보여준다() -> void:
	assert_int((LeagueVm.build(_played_world())["leaderboard"]["rows"] as Array)
		.size()).is_less_equal(LeagueVm.STAT_ROWS)


## 아직 아무도 안 뛰었으면 그렇게 말한다 — 빈 칸은 고장으로 보인다
func test_기록이_없으면_그렇게_말한다() -> void:
	var lb: Dictionary = LeagueVm.build(_state([]))["leaderboard"]
	assert_int((lb["rows"] as Array).size()).is_equal(0)
	assert_str(String(lb["empty_note"])).is_not_empty()


## 그 리그 선수만 든다 — `season_stats`엔 리그가 없어서 로스터로 가른다.
##
## ⚠ **첫 검사가 이걸 못 잡았다.** 고교 경기만 돌린 픽스처라 다른 리그엔
## 성적이 아예 없었고, 무대를 섞어도 섞일 것이 없었다 —
## **모든 리그를 돌린 상태**라야 갈린다
func test_그_리그_선수만_든다() -> void:
	var s: Dictionary = Fixtures.played_state(30)
	# ⚠ **대학으로 본다.** KBL로 보면 섞이는 쪽도 KBL이라 표가 그대로고,
	# 고교는 이 픽스처 30일 안에 경기가 한 판도 없다(찍어서 확인했다 —
	# 30일에 대학 100 · ABL 96 · KBL 60이고 고교는 0이다)
	s["league_tab"] = "LEAGUE_UNIVERSITY"
	# 누적 부문으로 본다 — 30일이면 규정 이닝을 채운 선수가 적다
	s["league_stat_key"] = "k"
	var names: Array = []
	for t in World.teams_of("LEAGUE_UNIVERSITY"):
		names.append(String(t["name"]))

	var rows: Array = LeagueVm.build(s)["leaderboard"]["rows"]
	assert_int(rows.size()).override_failure_message(
		"30일을 돌렸는데 스탯 순위가 비었다 — 픽스처가 게임 경로를 안 탄다") \
		.is_greater(0)
	for r in rows:
		assert_bool(names.has(String(r["team"]))).override_failure_message(
			"대학 순위에 %s 소속 %s가 있다" % [r["team"], r["name"]]).is_true()


# ── 포스트시즌 · 대회 ────────────────────────────────────────────

## 시리즈 한 칸 — `Bracket`이 쓰는 모양 그대로
func _series(id: String, round_label: String, home: String, away: String,
		hw: int = 0, aw: int = 0, winner: String = "",
		next_id: String = "") -> Dictionary:
	return {"id": id, "round": round_label, "best_of": 5,
		"home_team_id": home, "away_team_id": away,
		"home_wins": hw, "away_wins": aw, "winner": winner,
		"next_series_id": next_id, "next_series_slot": "home"}


func _ps_state(series: Array, league: String = "LEAGUE_KBL") -> Dictionary:
	return {"season_year": 2027, "day": 100,
		"protagonist": {"team_id": "A", "league_id": league},
		"schedule": [], "league_tab": league,
		"team_names": {"A": "제주", "B": "서울", "C": "부산"},
		"postseason": {league: series}}


## 🔴 **`Postseason.run_background`가 시즌말마다 도는데 볼 자리가 없었다**
## (형태 ③). `Bracket.to_rounds`가 화면용 모양까지 내주는데 아무도 안 불렀다
func test_포스트시즌_대진이_나온다() -> void:
	var ps: Dictionary = LeagueVm.build(_ps_state([
		_series("S1", "플레이오프", "B", "C", 3, 1, "B", "S2"),
		_series("S2", "한국시리즈", "A", "B", 4, 2, "A"),
	]))["postseason"]
	assert_bool(bool(ps["has"])).is_true()
	# 먼저 하는 라운드가 앞이다
	var labels: Array = []
	for r in ps["rounds"]:
		labels.append(String(r["label"]))
	assert_array(labels).is_equal(["플레이오프", "한국시리즈"])
	assert_str(String(ps["champion"])).override_failure_message(
		"우승 팀이 이름으로 안 나온다: %s" % ps["champion"]).is_equal("제주")


## 아직 안 붙은 시리즈는 "대기"다 — 0-0으로 찍으면 이미 진 것처럼 보인다
func test_안_붙은_시리즈는_대기다() -> void:
	var ps: Dictionary = LeagueVm.build(_ps_state([
		_series("S1", "플레이오프", "B", "", 0, 0, ""),
	]))["postseason"]
	var row: Dictionary = ps["rounds"][0]["rows"][0]
	assert_str(String(row["value"])).is_equal("대기")
	assert_bool(bool(row["done"])).is_false()


## 내 팀이 낀 시리즈는 표시된다 — 그게 이 표를 여는 이유다
func test_내_시리즈를_가른다() -> void:
	var ps: Dictionary = LeagueVm.build(_ps_state([
		_series("S1", "플레이오프", "B", "C", 3, 0, "B", "S2"),
		_series("S2", "한국시리즈", "A", "B", 1, 2, ""),
	]))["postseason"]
	var mine: int = 0
	for r in ps["rounds"]:
		for row in r["rows"]:
			if bool(row["is_mine"]):
				mine += 1
	assert_int(mine).override_failure_message(
		"내 팀이 낀 시리즈를 안 가른다").is_equal(1)


## 시리즈 형식을 적는다 — 단판인지 5전 3선승인지가 결과를 읽는 기준이다
func test_시리즈_형식을_적는다() -> void:
	var ps: Dictionary = LeagueVm.build(_ps_state([
		_series("S1", "한국시리즈", "A", "B", 4, 2, "A"),
	]))["postseason"]
	assert_str(String(ps["rounds"][0]["rows"][0]["note"])).is_equal("5전 3선승")


## 포스트시즌이 없으면 왜 없는지 말한다 — 빈 칸은 고장으로 보인다
func test_포스트시즌이_없으면_그렇게_말한다() -> void:
	var ps: Dictionary = LeagueVm.build(_ps_state([]))["postseason"]
	assert_bool(bool(ps["has"])).is_false()
	assert_str(String(ps["note"])).is_not_empty()


## 🔴 **`tournament_log`에 쌓이는데 읽는 곳이 없었다**
func test_대회_기록이_나온다() -> void:
	var s: Dictionary = _ps_state([])
	s["tournament_log"] = [
		{"tournament_id": "T1", "name": "봄철리그", "season_year": 2026,
			"champion": "B", "protagonist_reached": "8강"},
		{"tournament_id": "T2", "name": "황금사자기", "season_year": 2027,
			"champion": "A", "protagonist_reached": "우승"},
	]
	var rows: Array = LeagueVm.build(s)["tournaments"]["rows"]
	assert_int(rows.size()).is_equal(2)
	# 최근 것이 위로
	assert_str(String(rows[0]["label"])).contains("2027")
	assert_str(String(rows[0]["label"])).contains("황금사자기")
	assert_str(String(rows[0]["value"])).contains("제주")
	# ⚠ **우리가 어디까지 갔는지가 요점이다** — 우승 팀만 적으면 남의 기록이다
	assert_str(String(rows[0]["note"])).contains("우승")
	assert_str(String(rows[1]["note"])).contains("8강")


## 기록이 없으면 그렇게 말한다
func test_대회_기록이_없으면_그렇게_말한다() -> void:
	var t: Dictionary = LeagueVm.build(_ps_state([]))["tournaments"]
	assert_int((t["rows"] as Array).size()).is_equal(0)
	assert_str(String(t["empty_note"])).is_not_empty()


## 길어도 몇 줄만 — 20해를 돌리면 표가 화면을 넘는다
func test_대회_기록은_몇_줄만() -> void:
	var s: Dictionary = _ps_state([])
	var log: Array = []
	for i in 30:
		log.append({"tournament_id": "T%d" % i, "name": "대회",
			"season_year": 2000 + i, "champion": "A", "protagonist_reached": ""})
	s["tournament_log"] = log
	assert_int((LeagueVm.build(s)["tournaments"]["rows"] as Array).size()) \
		.is_equal(LeagueVm.TOURNAMENT_ROWS)
