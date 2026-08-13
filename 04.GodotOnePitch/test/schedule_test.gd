extends GdUnitTestSuite

## 일정 — 실제 리그 일정으로 날짜에 경기를 배정한다. D2.
##
## 원본: `packages/engine-native/src/schedule_engine.rs` · `leagueScheduler.ts`
##
## ⚠ **팀별 경기 수가 02와 같아야 한다.** 기간만 실제에 맞게 압축하고 경기
## 수는 그대로 둔다 — 경기 수가 바뀌면 밸런스가 조용히 바뀌고, 02 실측값
## (리그 ERA 4점대 · 수상 자격선 · 드래프트 앵커)과 대조가 안 된다.
##
## ⚠ **해외까지 매일 풀 시뮬한다** (사용자 결정). 02는 `radiusGate`로 해외를
## 순위표 드리프트만 돌렸다.


func _teams(prefix: String, n: int) -> Array:
	var out: Array = []
	for i in n:
		out.append("%s%d" % [prefix, i])
	return out


func _games_by_team(games: Array) -> Dictionary:
	var out: Dictionary = {}
	for g in games:
		out[g["home"]] = int(out.get(g["home"], 0)) + 1
		out[g["away"]] = int(out.get(g["away"], 0)) + 1
	return out


# ── 라운드 로빈 ────────────────────────────────────────────────────

func test_a_round_covers_every_team_once() -> void:
	var rounds: Array = Schedule.round_robin(_teams("T", 10))
	assert_int(rounds.size()).is_equal(9)
	for r in rounds:
		assert_int(r.size()).is_equal(5)
		var seen: Dictionary = {}
		for pair in r:
			# ⚠ 한 라운드에 같은 팀이 두 번 나오면 그 팀만 경기가 두 배가 된다
			assert_bool(seen.has(pair[0])).is_false()
			assert_bool(seen.has(pair[1])).is_false()
			seen[pair[0]] = true
			seen[pair[1]] = true
		assert_int(seen.size()).is_equal(10)


func test_every_pair_meets_exactly_once_in_a_cycle() -> void:
	# ⚠ 한 바퀴에 어떤 짝이 두 번 만나면 다른 짝은 아예 안 만난다
	var met: Dictionary = {}
	for r in Schedule.round_robin(_teams("T", 8)):
		for pair in r:
			var key: String = "%s|%s" % [mini(pair[0].hash(), pair[1].hash()),
				maxi(pair[0].hash(), pair[1].hash())]
			assert_bool(met.has(key)).is_false()
			met[key] = true
	assert_int(met.size()).is_equal(28)  # 8팀 → 28짝


func test_nobody_plays_themselves() -> void:
	for r in Schedule.round_robin(_teams("T", 12)):
		for pair in r:
			assert_str(pair[0]).is_not_equal(pair[1])


func test_an_odd_team_count_gives_byes() -> void:
	# 홀수면 매 라운드 한 팀이 쉰다. 억지로 짝지으면 자기 자신과 붙는다
	var rounds: Array = Schedule.round_robin(_teams("T", 7))
	for r in rounds:
		assert_int(r.size()).is_equal(3)
	# ⚠ **한 바퀴는 일곱 라운드다.** 허수를 안 넣으면 여섯 라운드가 되고,
	# 고정 팀만 매 라운드 뛰어 경기 수가 팀마다 달라진다
	assert_int(rounds.size()).is_equal(7)
	var counts: Dictionary = {}
	for r in rounds:
		for pair in r:
			counts[pair[0]] = int(counts.get(pair[0], 0)) + 1
			counts[pair[1]] = int(counts.get(pair[1], 0)) + 1
	for id in _teams("T", 7):
		assert_int(counts.get(id, 0)).is_equal(6)


func test_no_pair_contains_a_phantom_team() -> void:
	# ⚠ 허수와 붙은 경기를 그대로 내보내면 **빈 이름의 팀**이 일정에 들어간다.
	# 그 경기는 아무 팀에도 안 붙고 조용히 사라진다
	for n in [7, 9, 11]:
		for r in Schedule.round_robin(_teams("T", n)):
			for pair in r:
				assert_str(pair[0]).is_not_empty()
				assert_str(pair[1]).is_not_empty()


# ── 경기 수 ────────────────────────────────────────────────────────

func test_each_team_plays_exactly_the_target() -> void:
	# ⚠ **여기가 제일 중요하다.** 경기 수가 바뀌면 밸런스가 조용히 바뀐다
	var games: Array = Schedule.build({
		"league_id": "TEST", "teams": _teams("T", 10), "games_per_team": 144,
		"season_year": 2026, "start_day": 22, "end_day": 190, "weekdays": [2, 3, 4, 5, 6, 0],
	})
	var counts: Dictionary = _games_by_team(games)
	assert_int(counts.size()).is_equal(10)
	for id in counts:
		assert_int(counts[id]).is_equal(144)
	assert_int(games.size()).is_equal(720)


func test_home_and_away_are_roughly_even() -> void:
	# 한쪽으로 쏠리면 홈 이점이 특정 팀에만 간다
	var games: Array = Schedule.build({
		"league_id": "TEST", "teams": _teams("T", 10), "games_per_team": 144,
		"season_year": 2026, "start_day": 22, "end_day": 190, "weekdays": [2, 3, 4, 5, 6, 0],
	})
	var home: Dictionary = {}
	for g in games:
		home[g["home"]] = int(home.get(g["home"], 0)) + 1
	# ⚠ **팀 목록으로 돈다.** 홈 경기가 0인 팀은 사전에 아예 없어서,
	# 나온 것만 훑으면 제일 심하게 쏠린 팀을 통째로 건너뛴다
	for id in _teams("T", 10):
		assert_bool(absi(int(home.get(id, 0)) - 72) <= 8).is_true()


# ── 날짜 배정 ──────────────────────────────────────────────────────

func test_games_land_only_on_allowed_weekdays() -> void:
	# ⚠ 고교는 주말리그다. 요일을 안 보면 평일에 경기가 잡힌다
	var games: Array = Schedule.build({
		"league_id": "HS", "teams": _teams("H", 20), "games_per_team": 20,
		"season_year": 2026, "start_day": 64, "end_day": 200, "weekdays": [6, 0],
	})
	for g in games:
		var w: int = Calendar.weekday(2026, g["day"])
		assert_bool(w == 6 or w == 0).is_true()


func test_games_stay_inside_the_season_window() -> void:
	var games: Array = Schedule.build({
		"league_id": "TEST", "teams": _teams("T", 10), "games_per_team": 40,
		"season_year": 2026, "start_day": 30, "end_day": 120, "weekdays": [2, 3, 4, 5, 6, 0],
	})
	for g in games:
		assert_bool(g["day"] >= 30 and g["day"] <= 120).is_true()


func test_a_team_never_plays_twice_in_a_day() -> void:
	# ⚠ 하루 두 경기면 그 팀만 피로가 두 배로 쌓이고 로테이션이 어긋난다
	var games: Array = Schedule.build({
		"league_id": "TEST", "teams": _teams("T", 12), "games_per_team": 60,
		"season_year": 2026, "start_day": 22, "end_day": 190, "weekdays": [2, 3, 4, 5, 6, 0],
	})
	var by_day: Dictionary = {}
	for g in games:
		var key: int = g["day"]
		if not by_day.has(key):
			by_day[key] = {}
		assert_bool(by_day[key].has(g["home"])).is_false()
		assert_bool(by_day[key].has(g["away"])).is_false()
		by_day[key][g["home"]] = true
		by_day[key][g["away"]] = true


func test_games_are_spread_not_bunched() -> void:
	# 한 날에 몰리면 그 날만 오래 걸리고 나머지가 빈다
	var games: Array = Schedule.build({
		"league_id": "TEST", "teams": _teams("T", 10), "games_per_team": 144,
		"season_year": 2026, "start_day": 22, "end_day": 190, "weekdays": [2, 3, 4, 5, 6, 0],
	})
	var by_day: Dictionary = {}
	for g in games:
		by_day[g["day"]] = int(by_day.get(g["day"], 0)) + 1
	var most: int = 0
	for d in by_day:
		most = maxi(most, int(by_day[d]))
	# 10팀이면 하루 최대 5경기다
	assert_int(most).is_less_equal(5)


func test_too_many_games_for_the_window_is_reported() -> void:
	# ⚠ **조용히 잘라내면 안 된다.** 경기가 사라지면 팀별 경기 수가 어긋나고
	# 그게 밸런스를 바꾼다 — 오류로 알린다
	var games: Array = Schedule.build({
		"league_id": "TIGHT", "teams": _teams("T", 10), "games_per_team": 200,
		"season_year": 2026, "start_day": 22, "end_day": 60, "weekdays": [6],
	})
	assert_array(games).is_empty()


# ── 리그 정의 ──────────────────────────────────────────────────────

func test_the_league_table_matches_02s_game_counts() -> void:
	# ⚠ **경기 수는 02 그대로다.** 기간만 실제에 맞게 압축한다
	var expected: Dictionary = {
		"LEAGUE_KBL": 144, "LEAGUE_KBL_FARM": 99,
		"LEAGUE_ABL": 135, "LEAGUE_ABL_FARM": 165,
		"LEAGUE_JBL": 110, "LEAGUE_JBL_FARM": 121,
		"LEAGUE_HIGHSCHOOL": 20, "LEAGUE_UNIVERSITY": 9, "LEAGUE_INDEPENDENT": 30,
	}
	for lid in expected:
		assert_int(Schedule.LEAGUES[lid]["games_per_team"]).is_equal(expected[lid])


func test_every_league_window_fits_its_games() -> void:
	# ⚠ 기간이 모자라면 경기가 잘려나가고 팀별 경기 수가 어긋난다.
	# **리그를 하나 추가할 때 여기가 먼저 빨간불이 되게 둔다**
	for lid in Schedule.LEAGUES:
		var d: Dictionary = Schedule.LEAGUES[lid]
		var days: int = Schedule.playable_days(2026, d["start_day"], d["end_day"], d["weekdays"]).size()
		assert_bool(days >= d["games_per_team"]).is_true()


func test_pro_leagues_play_six_days_a_week() -> void:
	# 실제 KBO·NPB·MLB가 월요일에 쉰다
	for lid in ["LEAGUE_KBL", "LEAGUE_JBL", "LEAGUE_ABL"]:
		assert_bool(Schedule.LEAGUES[lid]["weekdays"].has(1)).is_false()
		assert_int(Schedule.LEAGUES[lid]["weekdays"].size()).is_equal(6)


func test_high_school_plays_on_weekends() -> void:
	var wd: Array = Schedule.LEAGUES["LEAGUE_HIGHSCHOOL"]["weekdays"]
	assert_int(wd.size()).is_equal(2)
	for w in wd:
		assert_bool(w == 6 or w == 0).is_true()
