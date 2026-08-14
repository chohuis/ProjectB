extends GdUnitTestSuite

## 시즌 기록·수상 — M9-7b.
##
## ⚠ **02는 결산 화면이 유일한 호출부였다.** 화면을 열어야만 기록이 쌓였고
## 자동 진행에선 은퇴할 때까지 한 줄도 없었다.


func _pitcher(id: String, w: int = 5, l: int = 3, era: float = 2.45,
		ip: float = 80.0, k: int = 70) -> Dictionary:
	return {"type": "pitcher", "w": w, "l": l, "era": era, "ip": ip, "k": k,
		"g": 20, "bb": 20, "h": 60, "er": 22, "whip": 1.0}


func _batter(avg: float = 0.312, hr: int = 12, rbi: int = 55) -> Dictionary:
	return {"type": "batter", "avg": avg, "hr": hr, "rbi": rbi,
		"g": 100, "pa": 400, "ab": 360, "h": 112, "bb": 40, "k": 60,
		"obp": 0.38, "slg": 0.5, "ops": 0.88, "sb": 5}


func _player(id: String, league: String = "LEAGUE_KBL") -> Dictionary:
	return {"id": id, "league_id": league, "team_id": "TEAM_A",
		"career_history": [], "player_type": "pitcher"}


# ── 한 줄 요약 ────────────────────────────────────────────────

func test_a_pitcher_line_reads_like_a_box_score() -> void:
	var s: String = SeasonHistory.stat_line_of(_pitcher("P1"))
	assert_str(s).contains("5승")
	assert_str(s).contains("3패")
	assert_str(s).contains("2.45")
	assert_str(s).contains("80.0이닝")
	assert_str(s).contains("70K")


## ⚠ **타율은 앞의 0을 뗀다.** `.312`가 야구 표기다
func test_a_batter_line_uses_baseball_notation() -> void:
	var s: String = SeasonHistory.stat_line_of(_batter())
	assert_str(s).contains(".312")
	assert_str(s).not_contains("0.312")
	assert_str(s).contains("12홈런")
	assert_str(s).contains("55타점")


func test_no_stats_means_no_line() -> void:
	assert_str(SeasonHistory.stat_line_of({})).is_empty()


# ── 연도 기록 ─────────────────────────────────────────────────

func test_it_writes_the_year_into_the_history() -> void:
	var p: Dictionary = _player("P1")
	SeasonHistory.apply([p], {"P1": _pitcher("P1")}, 2027)

	assert_int(p["career_history"].size()).is_equal(1)
	assert_int(int(p["career_history"][0]["year"])).is_equal(2027)
	assert_str(p["career_history"][0]["stat_line"]).contains("5승")


## ⚠ **진급이 만든 줄에 성적만 채운다.** 새로 만들면 한 해가 두 줄이 되고,
## 경력 화면과 **드래프트 경로 판정**이 그 배열을 읽으므로 오작동이 된다
func test_it_fills_the_row_promotion_already_made() -> void:
	var p: Dictionary = _player("P1", "LEAGUE_HIGHSCHOOL")
	p["career_history"] = [{"year": 2027, "league_id": "LEAGUE_HIGHSCHOOL",
		"team_id": "TEAM_HS", "stat_line": "-", "highlights": []}]

	SeasonHistory.apply([p], {"P1": _pitcher("P1")}, 2027)
	assert_int(p["career_history"].size()).override_failure_message(
		"한 해가 %d줄이다" % p["career_history"].size()).is_equal(1)
	assert_str(p["career_history"][0]["stat_line"]).is_not_equal("-")
	# 진급이 적은 소속은 그대로 둔다
	assert_str(p["career_history"][0]["team_id"]).is_equal("TEAM_HS")


## 안 뛴 선수는 줄이 안 생긴다 — 0으로 채우면 안 뛴 사람이 0.00 방어율로 뜬다
func test_a_player_without_stats_gets_no_row() -> void:
	var p: Dictionary = _player("P1")
	assert_int(SeasonHistory.apply([p], {}, 2027)).is_equal(0)
	assert_array(p["career_history"]).is_empty()


# ── 수상 ──────────────────────────────────────────────────────

## ⚠ **리그를 합치면 프로 MVP와 고교 MVP가 같은 저울에 올라간다**
func test_awards_are_computed_per_league() -> void:
	var players: Array = []
	var stats: Dictionary = {}
	for i in 12:
		var lid: String = "LEAGUE_KBL" if i < 6 else "LEAGUE_HIGHSCHOOL"
		players.append(_player("P%d" % i, lid))
		stats["P%d" % i] = _pitcher("P%d" % i, 10 + i, 3, 2.0 + float(i) * 0.1,
			150.0, 100 + i * 5)

	var out: Dictionary = SeasonHistory.awards_of(players, stats)
	assert_bool(out.has("LEAGUE_KBL")).override_failure_message(
		"프로 수상이 없다").is_true()
	assert_bool(out.has("LEAGUE_HIGHSCHOOL")).is_true()

	# 프로 수상자가 고교 선수면 안 된다
	for a in out["LEAGUE_KBL"]["awards"]:
		assert_int(int(String(a["player_id"]).trim_prefix("P"))).is_less(6)


## 수상이 그 해 기록에 얹힌다 — 기록이 만들어진 뒤여야 자리가 있다
func test_awards_land_on_the_year_row() -> void:
	var players: Array = []
	var stats: Dictionary = {}
	for i in 8:
		players.append(_player("P%d" % i))
		stats["P%d" % i] = _pitcher("P%d" % i, 20 - i, 3, 1.5 + float(i) * 0.3,
			180.0, 200 - i * 10)

	SeasonHistory.apply(players, stats, 2027)
	var awards: Dictionary = SeasonHistory.awards_of(players, stats)
	var n: int = SeasonHistory.attach_awards(players, awards, 2027)
	assert_int(n).override_failure_message("아무도 수상 기록을 못 받았다").is_greater(0)

	var found: bool = false
	for p in players:
		for h in p["career_history"]:
			if not h.get("highlights", []).is_empty():
				found = true
	assert_bool(found).is_true()


## 기록이 없으면 수상도 못 얹는다 — 순서가 뒤집히면 조용히 사라진다
func test_awards_need_the_row_first() -> void:
	var players: Array = [_player("P1")]
	var stats: Dictionary = {"P1": _pitcher("P1", 20, 1, 1.0, 200.0, 250)}
	var awards: Dictionary = SeasonHistory.awards_of(players, stats)
	assert_int(SeasonHistory.attach_awards(players, awards, 2027)).override_failure_message(
		"기록도 없는데 수상이 얹혔다").is_equal(0)


# ── 주인공 기록 ───────────────────────────────────────────────

func _game_state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["season_stats"] = {s["protagonist"]["id"]: _pitcher(s["protagonist"]["id"])}
	return s


func test_the_protagonist_gets_a_career_row() -> void:
	var s: Dictionary = _game_state()
	var r: Dictionary = SeasonHistory.protagonist_record(s, 2027)
	assert_bool(r.is_empty()).override_failure_message("기록이 안 생겼다").is_false()
	assert_int(int(r["year"])).is_equal(2027)
	assert_str(r["stat_line"]).contains("5승")
	assert_str(r["team_id"]).is_equal("TEAM_HS_AEWOL")


## ⚠ **한 해에 두 줄이 생기면 연도 선택·은퇴 결산이 전부 어긋난다.**
## 02는 결산 화면과 롤오버가 둘 다 불러서 실제로 그랬다
func test_the_same_year_is_recorded_once() -> void:
	var s: Dictionary = _game_state()
	SeasonHistory.protagonist_record(s, 2027)
	assert_bool(SeasonHistory.protagonist_record(s, 2027).is_empty()).is_true()
	assert_int(s["protagonist"]["career_records"].size()).is_equal(1)


## 등판 기록이 실린다 — 결산 화면이 그걸 보여준다
func test_the_record_carries_the_game_log() -> void:
	var s: Dictionary = _game_state()
	var me: String = s["protagonist"]["id"]

	# 등판 하나를 치른 것으로 둔다
	for g in s["schedule"]:
		if g.get("is_protagonist_game", false):
			g["result"] = {"home_score": 3, "away_score": 1, "player_lines": [
				{"role": "pitcher", "player_id": me, "ip": 6.0, "er": 1.0,
					"h": 4.0, "k": 7.0, "bb": 2.0, "pc": 92}]}
			break

	var r: Dictionary = SeasonHistory.protagonist_record(s, 2027)
	assert_int(r["game_log"].size()).override_failure_message(
		"등판 기록이 비었다").is_equal(1)
	assert_float(float(r["game_log"][0]["ip"])).is_equal_approx(6.0, 0.01)
	assert_int(int(r["game_log"][0]["pc"])).is_equal(92)


## 안 치른 경기는 안 들어간다 — 예정만으로 기록이 생기면 안 된다
func test_unplayed_games_are_not_logged() -> void:
	var s: Dictionary = _game_state()
	var r: Dictionary = SeasonHistory.protagonist_record(s, 2027)
	assert_array(r["game_log"]).is_empty()


# ── 변이가 안 잡히던 자리 ─────────────────────────────────────

## ⚠ **MVP가 나와야 한다.** 02는 "아무도 두 부문을 못 채우는 해"에 MVP가
## 안 나왔고, 그래서 가장 압도적으로 1위한 선수에게 주는 폴백을 넣었다
func test_an_mvp_is_named() -> void:
	var players: Array = []
	var stats: Dictionary = {}
	for i in 10:
		players.append(_player("P%d" % i))
		stats["P%d" % i] = _pitcher("P%d" % i, 20 - i, 3, 1.2 + float(i) * 0.4,
			190.0 - float(i) * 5.0, 220 - i * 12)

	var out: Dictionary = SeasonHistory.awards_of(players, stats)
	assert_array(out["LEAGUE_KBL"]["mvp"]).override_failure_message(
		"수상자는 있는데 MVP가 0명이다").is_not_empty()


## ⚠ **수상은 그 해 줄에만 얹힌다.** 아무 해에나 얹으면 지난해 기록이
## 올해 수상으로 덮인다
func test_awards_only_touch_that_year() -> void:
	var players: Array = []
	var stats: Dictionary = {}
	for n in 8:
		var p: Dictionary = _player("P%d" % n)
		# 지난해 줄을 **먼저** 둔다 — 해를 안 보면 그쪽에 얹힌다
		p["career_history"] = [
			{"year": 2026, "league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
				"stat_line": "지난해", "highlights": []},
			{"year": 2027, "league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
				"stat_line": "올해", "highlights": []},
		]
		players.append(p)
		stats["P%d" % n] = _pitcher("P%d" % n, 20 - n, 3, 1.5 + float(n) * 0.3,
			180.0, 200 - n * 10)

	var got: int = SeasonHistory.attach_awards(players,
		SeasonHistory.awards_of(players, stats), 2027)
	assert_int(got).override_failure_message("아무도 수상을 못 받았다").is_greater(0)

	for p in players:
		assert_array(p["career_history"][0]["highlights"]).override_failure_message(
			"%s의 지난해 줄에 올해 수상이 얹혔다" % p["id"]).is_empty()


## ⚠ **남의 등판을 내 기록에 넣으면 안 된다.** 상대 투수 줄이 같은 경기에
## 들어 있다 — 첫 줄을 그냥 집으면 상대 성적이 내 경력이 된다
func test_only_my_line_goes_into_my_log() -> void:
	var s: Dictionary = _game_state()
	var me: String = s["protagonist"]["id"]

	for g in s["schedule"]:
		if g.get("is_protagonist_game", false):
			g["result"] = {"home_score": 2, "away_score": 5, "player_lines": [
				# 상대 투수가 먼저 온다
				{"role": "pitcher", "player_id": "ENEMY", "ip": 9.0, "er": 2.0,
					"h": 5.0, "k": 3.0, "bb": 1.0, "pc": 110},
				{"role": "pitcher", "player_id": me, "ip": 5.0, "er": 4.0,
					"h": 8.0, "k": 2.0, "bb": 3.0, "pc": 88},
			]}
			break

	var r: Dictionary = SeasonHistory.protagonist_record(s, 2027)
	assert_int(r["game_log"].size()).is_equal(1)
	assert_float(float(r["game_log"][0]["ip"])).override_failure_message(
		"상대 투수 줄(9이닝)이 내 기록에 들어갔다").is_equal_approx(5.0, 0.01)
	assert_int(int(r["game_log"][0]["pc"])).is_equal(88)


## ⚠ **홈·원정을 가른다.** 안 가르면 내 점수와 상대 점수가 뒤집혀
## 이긴 경기가 진 경기로 남는다
func test_the_log_knows_home_from_away() -> void:
	var s: Dictionary = _game_state()
	var me: String = s["protagonist"]["id"]
	var my_team: String = s["protagonist"]["team_id"]

	# 원정 경기 하나를 만든다 — 홈 3 : 원정 7이면 내가 7점이다
	var found: bool = false
	for g in s["schedule"]:
		if not g.get("is_protagonist_game", false):
			continue
		if g.get("away", "") != my_team:
			continue
		g["result"] = {"home_score": 3, "away_score": 7, "player_lines": [
			{"role": "pitcher", "player_id": me, "ip": 7.0, "er": 3.0,
				"h": 6.0, "k": 5.0, "bb": 2.0, "pc": 100}]}
		found = true
		break
	assert_bool(found).override_failure_message("원정 등판이 없다 — 검사가 헛돈다").is_true()

	# ⚠ **홈 경기도 같이 본다.** 원정만 보면 `is_home = false` 고정과
	# 결과가 같아서 변이가 안 잡힌다 — 실제로 안 잡혔다
	var home_found: bool = false
	for g in s["schedule"]:
		if not g.get("is_protagonist_game", false) or g.get("result", null) != null:
			continue
		if g.get("home", "") != my_team:
			continue
		g["result"] = {"home_score": 9, "away_score": 2, "player_lines": [
			{"role": "pitcher", "player_id": me, "ip": 6.0, "er": 2.0,
				"h": 5.0, "k": 4.0, "bb": 1.0, "pc": 90}]}
		home_found = true
		break
	assert_bool(home_found).override_failure_message("홈 등판이 없다").is_true()

	var r: Dictionary = SeasonHistory.protagonist_record(s, 2027)
	assert_int(r["game_log"].size()).is_equal(2)

	for e in r["game_log"]:
		var mine: int = int(e["my_score"])
		var opp: int = int(e["opp_score"])
		# 원정 3:7 → 내 7 · 홈 9:2 → 내 9. 둘 다 내가 더 많다
		assert_int(mine).override_failure_message(
			"내 점수 %d · 상대 %d — 홈·원정을 안 가른다" % [mine, opp]).is_greater(opp)
		assert_str(String(e["opponent_id"])).is_not_equal(my_team)


## ⚠ **이미 있는 줄에 성적을 채운다.** 안 채우면 영영 "-"로 남는다
func test_an_existing_row_gets_its_stat_line() -> void:
	var p: Dictionary = _player("P1")
	p["career_history"] = [{"year": 2027, "league_id": "LEAGUE_KBL",
		"team_id": "TEAM_A", "stat_line": "-", "highlights": []}]
	SeasonHistory.apply([p], {"P1": _pitcher("P1")}, 2027)
	assert_str(p["career_history"][0]["stat_line"]).override_failure_message(
		"진급이 만든 줄이 '-' 그대로다").contains("5승")
