extends GdUnitTestSuite

## 대회 배선 — 열고, 일정에 꽂고, 라운드를 올린다. B-4a.


const HS: String = "LEAGUE_HIGHSCHOOL"
const ME: String = "TEAM_HS_AEWOL"


## 고교 리그 순위표가 생기게 지난 시즌 결과를 넣어 둔다
func _state(day: int, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"day": day, "season_year": 2027, "seed": 4242,
		"season_days": Calendar.DAYS_PER_SEASON,
		"schedule": [], "protagonist": {"id": "PLY_ME", "team_id": ME},
		"world": {"rosters": _rosters()}, "pending": [], "mailbox": []}
	s.merge(over, true)
	return s


## 세계에 두 리그 팀이 다 있어야 대회가 열린다
func _rosters() -> Dictionary:
	var out: Dictionary = {}
	for league in ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY"]:
		for t in World.teams_of(league):
			out[String(t["id"])] = []
	return out


## 리그 경기 결과를 일정에 깔아 순위표를 만든다.
## 팀ID가 앞설수록 세게 — 시드가 결정적으로 나온다
func _league_history(league: String = HS, alphabetical: bool = false) -> Array:
	var teams: Array = []
	for t in World.teams_of(league):
		teams.append(String(t["id"]))
	teams.sort()
	# ⚠ **기본은 팀ID 역순으로 세게 만든다.** 알파벳 순으로 세게 두면
	# "순위표를 봤나"와 "팀ID로 정렬했나"를 구별할 수 없다
	if not alphabetical:
		teams.reverse()

	var out: Array = []
	var day: int = 1
	for i in teams.size():
		for j in range(i + 1, teams.size()):
			# 앞선 팀이 이긴다
			out.append({"id": "L_%03d_%03d" % [i, j], "day": day,
				"league_id": league, "home": String(teams[i]),
				"away": String(teams[j]),
				"result": {"home_score": 5, "away_score": 1,
					"winner_id": String(teams[i]), "loser_id": String(teams[j]),
					"player_lines": []}})
			day += 1
			if j > i + 2:
				break
	return out


func _tour_games(state: Dictionary, tournament_id: String) -> Array:
	var out: Array = []
	for g in state["schedule"]:
		if String(g["id"]).begins_with(tournament_id):
			out.append(g)
	return out


## 그 대회 미결 경기를 홈 승리로 끝낸다
func _play(state: Dictionary, tournament_id: String) -> int:
	var n: int = 0
	for g in _tour_games(state, tournament_id):
		if g.get("result", null) != null:
			continue
		g["result"] = {"home_score": 4, "away_score": 2,
			"winner_id": String(g["home"]), "loser_id": String(g["away"]),
			"player_lines": []}
		n += 1
	return n


# ── 열기 ──────────────────────────────────────────────────────

## 대회 주가 아니면 아무 일도 없다
func test_nothing_opens_outside_the_window() -> void:
	var s: Dictionary = _state(5 * 7)
	var out: Dictionary = TournamentRunner.run(s, 5 * 7)
	assert_array(out["opened"]).is_empty()
	assert_dict(TournamentRunner.all_of(s)).is_empty()


## ⚠ **선수가 없는 리그에 대회를 열지 않는다.** 팀 목록은 데이터 파일에서
## 오므로 세계를 안 만든 상태에서도 102팀이 나온다 — 그대로 열면 아무도
## 없는 대회가 일정을 채운다
func test_a_league_that_is_not_in_this_save_has_no_tournament() -> void:
	var s: Dictionary = _state(8)
	s["world"]["rosters"] = {}
	assert_array(TournamentRunner.run(s, 8)["opened"]).override_failure_message(
		"세계에 없는 리그의 대회를 열었다").is_empty()
	assert_array(s["schedule"]).is_empty()


## 개나리기는 2주에 열린다
func test_the_first_tournament_opens_in_week_two() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var out: Dictionary = TournamentRunner.run(s, 8)
	assert_array(out["opened"]).is_equal(["TOUR_HS_GAENARI"])

	var rec: Dictionary = TournamentRunner.of(s, "TOUR_HS_GAENARI")
	assert_int(rec["entrants"]["seeded_teams"].size()).override_failure_message(
		"참가팀이 %d팀이다 (32팀이어야 한다)"
		% rec["entrants"]["seeded_teams"].size()).is_equal(32)
	assert_int(int(rec["bracket"]["bracket_size"])).is_equal(32)


## 1라운드 경기가 일정에 꽂힌다 — 안 꽂으면 아무도 안 뛴다
func test_the_first_round_reaches_the_schedule() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	var games: Array = _tour_games(s, "TOUR_HS_GAENARI")
	assert_int(games.size()).override_failure_message(
		"1라운드 경기가 %d개다 (16개여야 한다)" % games.size()).is_equal(16)
	for g in games:
		assert_bool(bool(g["is_tournament"])).is_true()
		assert_str(String(g["league_id"])).is_equal(HS)
		assert_int(Calendar.week_of(int(g["day"]))).is_equal(2)


## 두 번 불러도 두 번 안 연다
func test_opening_twice_changes_nothing() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	var before: int = s["schedule"].size()
	assert_array(TournamentRunner.run(s, 8)["opened"]).is_empty()
	assert_int(s["schedule"].size()).override_failure_message(
		"같은 대회 경기가 두 번 꽂혔다").is_equal(before)


## ⚠ **대회 경기는 리그 순위에 안 들어간다.** 들어가면 전국대회 한 판이
## 리그 승률을 흔들고 그 승률이 다음 대회 시드가 된다
func test_tournament_games_stay_out_of_the_league_table() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var before: Array = Standings.from_schedule(s["schedule"], HS)
	TournamentRunner.run(s, 8)
	_play(s, "TOUR_HS_GAENARI")
	var after: Array = Standings.from_schedule(s["schedule"], HS)
	assert_array(after).override_failure_message(
		"대회 경기가 리그 순위표를 흔들었다").is_equal(before)


## ⚠ **개나리기는 지난 시즌 순위로 시드를 낸다.** 2주엔 올해 성적이 없어서
## 올해 순위표를 보면 전 팀이 승률 0이고 시드가 팀ID 순이 된다
func test_the_early_tournament_seeds_from_last_season() -> void:
	# 올해 일정은 비었고, 지난해 순위만 있다
	var last: Array = []
	var teams: Array = []
	for t in World.teams_of(HS):
		teams.append(String(t["id"]))
	teams.sort()
	teams.reverse()
	for i in teams.size():
		last.append({"team_id": String(teams[i]),
			"win_pct": float(teams.size() - i) / float(teams.size()),
			"wins": teams.size() - i, "losses": i, "draws": 0,
			"runs_for": 100, "runs_against": 50})

	var s: Dictionary = _state(8, {"last_standings": {HS: last}})
	TournamentRunner.run(s, 8)
	var seeded: Array = TournamentRunner.of(s, "TOUR_HS_GAENARI")["entrants"]["seeded_teams"]
	# 지난해 1위(팀ID 역순의 첫 팀)가 1번 시드다
	assert_str(String(seeded[0])).override_failure_message(
		"지난 시즌 순위를 안 봤다 — 시드가 팀ID 순이다").is_equal(String(teams[0]))


## ⚠ **지난해 기록이 없으면 올해 순위표로 돈다.** 빈 표를 그대로 쓰면
## 첫 시즌 시드가 통째로 팀ID 순이 된다
func test_without_last_season_it_uses_this_one() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	var seeded: Array = TournamentRunner.of(s, "TOUR_HS_GAENARI")["entrants"]["seeded_teams"]

	var now: Array = Standings.from_schedule(s["schedule"], HS)
	var top: String = ""
	var best: float = -1.0
	for row in now:
		if float(row["win_pct"]) > best:
			best = float(row["win_pct"])
			top = String(row["team_id"])
	assert_str(String(seeded[0])).override_failure_message(
		"올해 순위표를 안 봤다 — 1번 시드가 올해 1위(%s)가 아니다" % top) \
		.is_equal(top)


## ⚠ **`prev_season`이 아닌 대회는 올해 성적을 본다.** 전부 지난해로 돌리면
## 올해 잘한 팀이 시드를 못 받는다
func test_a_midseason_tournament_reads_this_season() -> void:
	var teams: Array = []
	for t in World.teams_of(HS):
		teams.append(String(t["id"]))
	teams.sort()
	# 올해는 **팀ID 뒤쪽**이 세다(`_league_history`). 지난해는 정반대로 둔다
	var last: Array = []
	for i in teams.size():
		last.append({"team_id": String(teams[i]),
			"win_pct": float(teams.size() - i) / float(teams.size()),
			"wins": teams.size() - i, "losses": i, "draws": 0,
			"runs_for": 10, "runs_against": 5})

	var s: Dictionary = _state(14 * 7 - 6,
		{"schedule": _league_history(), "last_standings": {HS: last}})
	TournamentRunner.run(s, 14 * 7 - 6)
	var seeded: Array = TournamentRunner.of(s, "TOUR_HS_JANGMI")["entrants"]["seeded_teams"]
	assert_str(String(seeded[0])).override_failure_message(
		"장미기가 지난해 순위로 시드를 냈다 — 올해 성적이 시드에 안 닿는다") \
		.is_equal(String(teams[teams.size() - 1]))


## 같은 대회를 두 번 열지 않는다 — 열면 대진이 통째로 새로 나온다
func test_open_is_idempotent() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var d: Dictionary = Tournament.def_of("TOUR_HS_GAENARI")
	TournamentRunner.open(s, d, 8)
	var first: String = String(
		TournamentRunner.of(s, "TOUR_HS_GAENARI")["bracket"]["matches"][0]["id"])
	var size: int = s["schedule"].size()

	assert_dict(TournamentRunner.open(s, d, 9)).override_failure_message(
		"같은 대회를 두 번 열었다").is_empty()
	assert_int(s["schedule"].size()).is_equal(size)
	assert_str(String(
		TournamentRunner.of(s, "TOUR_HS_GAENARI")["bracket"]["matches"][0]["id"])) \
		.is_equal(first)


## ⚠ **같은 경기를 두 번 안 꽂는다.** 꽂으면 치른 결과가 없는 쌍둥이가 생겨
## 그 라운드가 영영 안 끝난다
func test_the_same_match_is_never_injected_twice() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	_play(s, "TOUR_HS_GAENARI")
	TournamentRunner.run(s, 9)
	var size: int = s["schedule"].size()

	# 같은 날 또 불러도 2라운드가 다시 안 꽂힌다
	TournamentRunner.run(s, 9)
	assert_int(s["schedule"].size()).override_failure_message(
		"같은 경기가 또 꽂혔다").is_equal(size)

	var ids: Dictionary = {}
	for g in _tour_games(s, "TOUR_HS_GAENARI"):
		assert_bool(ids.has(String(g["id"]))).override_failure_message(
			"%s가 일정에 두 번 있다" % g["id"]).is_false()
		ids[String(g["id"])] = true


## ⚠ **넉아웃에 무승부는 없다.** 그렇게 들어와도 홈이 올라간다 —
## 아무도 안 올라가면 대진이 거기서 멈춘다
func test_a_draw_still_sends_someone_through() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	for g in _tour_games(s, "TOUR_HS_GAENARI"):
		g["result"] = {"home_score": 3, "away_score": 3,
			"winner_id": String(g["home"]), "loser_id": "", "player_lines": []}

	assert_int(int(TournamentRunner.run(s, 9)["advanced"])).is_greater(0)
	var pending: int = 0
	for g in _tour_games(s, "TOUR_HS_GAENARI"):
		if g.get("result", null) == null:
			pending += 1
	assert_int(pending).override_failure_message(
		"무승부라고 아무도 안 올라가서 2라운드가 안 열렸다").is_equal(8)


## 시즌이 끝날 때 그 해 순위를 남긴다
func test_the_season_end_remembers_the_table() -> void:
	var s: Dictionary = _state(360, {"schedule": _league_history()})
	TournamentRunner.remember_standings(s)
	assert_int(s["last_standings"][HS].size()).is_greater(0)
	assert_bool(s["last_standings"].has("LEAGUE_UNIVERSITY")).is_true()


# ── 진행 ──────────────────────────────────────────────────────

## 라운드가 끝나면 다음 라운드가 일정에 꽂힌다
func test_a_finished_round_opens_the_next() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	assert_int(_play(s, "TOUR_HS_GAENARI")).is_equal(16)

	var out: Dictionary = TournamentRunner.run(s, 9)
	assert_int(int(out["advanced"])).is_greater(0)
	var pending: int = 0
	for g in _tour_games(s, "TOUR_HS_GAENARI"):
		if g.get("result", null) == null:
			pending += 1
	assert_int(pending).override_failure_message(
		"2라운드 경기가 %d개다 (8개여야 한다)" % pending).is_equal(8)


## ⚠ **경기가 안 끝났으면 안 올린다.** 올리면 안 치른 경기의 승자가 생긴다
func test_an_unfinished_round_does_not_advance() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	# 한 경기만 남겨 둔다
	var games: Array = _tour_games(s, "TOUR_HS_GAENARI")
	for i in games.size():
		if i == 0:
			continue
		games[i]["result"] = {"home_score": 4, "away_score": 2,
			"winner_id": String(games[i]["home"]),
			"loser_id": String(games[i]["away"]), "player_lines": []}

	assert_int(int(TournamentRunner.run(s, 9)["advanced"])).override_failure_message(
		"한 경기가 남았는데 라운드를 올렸다").is_equal(0)


## 끝까지 돌리면 우승팀이 남는다
func test_a_tournament_finishes_with_a_champion() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1

	var rec: Dictionary = TournamentRunner.of(s, "TOUR_HS_GAENARI")
	assert_str(String(rec["champion"])).override_failure_message(
		"끝까지 돌렸는데 우승팀이 없다").is_not_empty()
	assert_int(s["tournament_log"].size()).is_equal(1)
	assert_str(String(s["tournament_log"][0]["name"])).is_equal("개나리기")
	assert_int(int(s["tournament_log"][0]["season_year"])).is_equal(2027)


## ⚠ **결승 결과는 대회 마지막 날에 들어온다.** 그걸 반영하는 건 그 다음
## 호출이고, 그때는 이미 기간이 지나 있다 — 주차로 고르면 **우승팀이 영영
## 안 정해진다**
func test_the_final_is_settled_after_the_window_closes() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	# 기간(2~3주) 안에서 전 라운드를 치른다
	var day: int = 8
	for i in 10:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	assert_str(String(TournamentRunner.of(s, "TOUR_HS_GAENARI")["champion"])) \
		.is_not_empty()

	# 이번엔 결승만 남긴 채 기간을 넘긴다
	var s2: Dictionary = _state(8, {"schedule": _league_history()})
	var day2: int = 8
	for i in 10:
		TournamentRunner.run(s2, day2)
		var bracket: Dictionary = TournamentRunner.of(s2, "TOUR_HS_GAENARI")["bracket"]
		if not Tournament.round_schedule(bracket,
				int(bracket["total_rounds"])).is_empty():
			break
		_play(s2, "TOUR_HS_GAENARI")
		day2 += 1
	# 결승을 치르고 **4주로 넘어간 뒤** 부른다
	_play(s2, "TOUR_HS_GAENARI")
	TournamentRunner.run(s2, 4 * 7 + 1)
	assert_str(String(TournamentRunner.of(s2, "TOUR_HS_GAENARI")["champion"])) \
		.override_failure_message("기간이 지나자 결승 결과를 안 읽었다") \
		.is_not_empty()


## 우승팀은 1번 시드다 — 홈이 다 이기게 했으니
func test_the_top_seed_wins_when_the_home_side_always_wins() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	var rec: Dictionary = TournamentRunner.of(s, "TOUR_HS_GAENARI")
	assert_str(String(rec["champion"])).is_equal(
		String(rec["entrants"]["seeded_teams"][0]))


## 끝난 대회를 또 안 돌린다
func test_a_finished_tournament_stays_finished() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	var before: int = s["schedule"].size()
	TournamentRunner.run(s, day + 1)
	assert_int(s["schedule"].size()).is_equal(before)
	assert_int(s["tournament_log"].size()).override_failure_message(
		"끝난 대회를 두 번 적었다").is_equal(1)

	# 직접 불러도 마찬가지다 — 두 번 적으면 우승 기록이 부풀려진다
	assert_int(TournamentRunner.advance(s,
		Tournament.def_of("TOUR_HS_GAENARI"))).override_failure_message(
		"끝난 대회를 또 밀었다").is_equal(0)
	assert_int(s["tournament_log"].size()).is_equal(1)


## ⚠ **기록이 쌓인다.** 매번 새 배열을 만들면 지난 대회 우승이 지워진다
func test_the_log_accumulates() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 120:
		TournamentRunner.run(s, day)
		_play(s, "TOUR_HS_GAENARI")
		_play(s, "TOUR_HS_JANGMI")
		day += 1
	assert_int(s["tournament_log"].size()).override_failure_message(
		"대회 둘을 끝냈는데 기록이 %d건이다" % s["tournament_log"].size()) \
		.is_equal(2)
	var names: Array = []
	for e in s["tournament_log"]:
		names.append(String(e["name"]))
	assert_array(names).is_equal(["개나리기", "장미기"])


## 우리 팀이 몇 라운드까지 갔는지 남긴다 — 안 세면 "몇 강까지 갔나"가 없다
func test_it_records_how_far_i_got() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	# 올해 1위 팀을 내 팀으로 — 약팀이면 32강에 못 들어 0이 나온다
	var top: Array = []
	for t in World.teams_of(HS):
		top.append(String(t["id"]))
	top.sort()
	s["protagonist"]["team_id"] = String(top[-1])

	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	var log: Dictionary = s["tournament_log"][0]
	assert_int(int(log["protagonist_reached"])).override_failure_message(
		"우승까지 했는데 몇 라운드까지 갔는지가 0이다").is_greater(0)


## ⚠ **건네받은 날짜로 본다.** `state.day`만 보면 여러 날을 한 번에 넘길 때
## 대회가 열리는 날을 지나친다
func test_it_uses_the_day_it_is_given() -> void:
	# 상태의 날짜는 대회 밖(5주)인데 2주 날짜를 건넨다
	var s: Dictionary = _state(5 * 7, {"schedule": _league_history()})
	assert_array(TournamentRunner.run(s, 8)["opened"]).override_failure_message(
		"건네받은 날짜(2주)를 안 보고 state.day(5주)를 봤다") \
		.is_equal(["TOUR_HS_GAENARI"])


# ── 소식 ──────────────────────────────────────────────────────

func _mail(state: Dictionary, prefix: String) -> Array:
	var out: Array = []
	for m in state.get("mailbox", []):
		if String(m["id"]).begins_with(prefix):
			out.append(m)
	return out


## ⚠ **02는 대회가 데이터로만 돌았다.** 우승해도 아무 말이 없었다
func test_the_opening_reaches_the_mailbox() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	assert_int(_mail(s, "msg-tour-open-TOUR_HS_GAENARI").size()) \
		.override_failure_message("개막 소식이 안 왔다").is_equal(1)


## 같은 소식이 두 번 안 온다 — 소식 목록이 id를 키로 잡아 겹치면 화면이 죽는다
func test_a_message_is_never_sent_twice() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	TournamentRunner.run(s, day + 1)

	var seen: Dictionary = {}
	for m in s["mailbox"]:
		assert_bool(seen.has(String(m["id"]))).override_failure_message(
			"%s가 소식함에 두 번 있다" % m["id"]).is_false()
		seen[String(m["id"])] = true


## 우승 소식이 온다
func test_the_champion_reaches_the_mailbox() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	TournamentRunner.run(s, day + 1)

	var champ_mail: Array = _mail(s, "msg-tour-champ-TOUR_HS_GAENARI")
	var my_mail: Array = _mail(s, "msg-tour-my-TOUR_HS_GAENARI")
	assert_int(champ_mail.size() + my_mail.size()).override_failure_message(
		"대회가 끝났는데 우승 소식도 내 경기 소식도 없다").is_greater(0)


## 내가 나간 대회는 내 경기 소식이 온다
func test_my_round_reaches_the_mailbox() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	# 올해 1위 팀을 내 팀으로 — 약팀이면 32강에 못 든다
	var top: Array = []
	for t in World.teams_of(HS):
		top.append(String(t["id"]))
	top.sort()
	s["protagonist"]["team_id"] = String(top[-1])

	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	TournamentRunner.run(s, day + 1)

	assert_int(_mail(s, "msg-tour-my-TOUR_HS_GAENARI").size()) \
		.override_failure_message("대회에 나갔는데 내 경기 소식이 한 통도 없다") \
		.is_greater(0)


## ⚠ **소식 날짜가 그 주 경계다.** `state.day`를 쓰면 여러 날을 한 번에
## 넘길 때 소식이 도착한 날짜로 몰린다
func test_the_message_day_is_the_boundary() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	TournamentRunner.run(s, 8)
	_play(s, "TOUR_HS_GAENARI")
	# 상태의 날짜는 그대로 두고 다른 날짜를 건넨다
	TournamentRunner.run(s, 13)

	for m in _mail(s, "msg-tour-round-TOUR_HS_GAENARI"):
		assert_int(int(m["day"])).override_failure_message(
			"소식 날짜가 %d다 (건네받은 13이어야 한다)" % m["day"]).is_equal(13)


## 라운드 명단이 온다 — 우리가 안 나간 대회도 누가 올라갔는지 보인다
func test_the_round_list_reaches_the_mailbox() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	# 내 팀을 대회 밖 팀으로 둔다
	s["protagonist"]["team_id"] = "TEAM_NOBODY"
	var day: int = 8
	for i in 20:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_HS_GAENARI") == 0:
			break
		day += 1
	TournamentRunner.run(s, day + 1)

	assert_int(_mail(s, "msg-tour-round-TOUR_HS_GAENARI").size()) \
		.override_failure_message(
			"안 나간 대회의 라운드 명단이 한 통도 안 왔다").is_greater(0)


# ── 조별예선 ──────────────────────────────────────────────────

func _univ_state() -> Dictionary:
	var s: Dictionary = _state(14 * 7 - 6,
		{"schedule": _league_history("LEAGUE_UNIVERSITY")})
	s["protagonist"]["team_id"] = "TEAM_UNIV_ASAN"
	return s


## 은하기는 예선부터 연다
func test_the_group_tournament_opens_with_qualifying() -> void:
	var s: Dictionary = _univ_state()
	var out: Dictionary = TournamentRunner.run(s, 14 * 7 - 6)
	# 14주엔 고교 장미기도 같이 열린다 — 리그마다 따로 돈다
	assert_array(out["opened"]).contains(["TOUR_UNIV_EUNHA"])

	var rec: Dictionary = TournamentRunner.of(s, "TOUR_UNIV_EUNHA")
	assert_int(rec["stage"]["groups"].size()).is_equal(8)
	assert_bool(rec["bracket"].is_empty()).override_failure_message(
		"예선도 안 치렀는데 본선 대진이 있다").is_true()
	assert_int(_tour_games(s, "TOUR_UNIV_EUNHA").size()).is_greater(0)


## ⚠ **예선이 다 끝나야 본선을 만든다.** 안 그러면 조 순위가 안 정해진 채로
## 진출팀이 정해진다
func test_the_final_bracket_waits_for_the_groups() -> void:
	var s: Dictionary = _univ_state()
	TournamentRunner.run(s, 14 * 7 - 6)
	var games: Array = _tour_games(s, "TOUR_UNIV_EUNHA")
	# 한 경기만 남긴다
	for i in games.size():
		if i == 0:
			continue
		games[i]["result"] = {"home_score": 3, "away_score": 1,
			"winner_id": String(games[i]["home"]),
			"loser_id": String(games[i]["away"]), "player_lines": []}
	TournamentRunner.run(s, 14 * 7)
	assert_bool(TournamentRunner.of(s, "TOUR_UNIV_EUNHA")["bracket"].is_empty()) \
		.override_failure_message("예선 한 경기가 남았는데 본선을 만들었다").is_true()


## 예선이 끝나면 8팀이 본선에 오른다.
##
## ⚠ **예선 결과가 조 순위에 실려야 한다.** 안 실으면 전 팀이 0승이라
## 진출팀이 **팀ID 순**으로 정해진다
func test_the_qualifiers_reach_the_final_bracket() -> void:
	var s: Dictionary = _univ_state()
	TournamentRunner.run(s, 14 * 7 - 6)

	# 조마다 마지막 팀만 이기게 한다 — 팀ID 순이면 절대 안 뽑히는 팀이다
	var rec0: Dictionary = TournamentRunner.of(s, "TOUR_UNIV_EUNHA")
	var winners: Array = []
	for g in rec0["stage"]["groups"]:
		winners.append(String((g["teams"] as Array)[-1]))
	for m in _tour_games(s, "TOUR_UNIV_EUNHA"):
		var home_wins: bool = winners.has(String(m["home"]))
		m["result"] = {"home_score": 9 if home_wins else 0,
			"away_score": 0 if home_wins else 9,
			"winner_id": String(m["home"]) if home_wins else String(m["away"]),
			"loser_id": String(m["away"]) if home_wins else String(m["home"]),
			"player_lines": []}
	TournamentRunner.run(s, 16 * 7)

	var rec: Dictionary = TournamentRunner.of(s, "TOUR_UNIV_EUNHA")
	assert_bool(rec["bracket"].is_empty()).override_failure_message(
		"예선이 끝났는데 본선이 없다").is_false()
	assert_int(int(rec["bracket"]["bracket_size"])).is_equal(8)
	assert_bool(rec.has("group_ranks")).is_true()

	var qualified: Dictionary = {}
	for m in rec["bracket"]["matches"]:
		if int(m["round"]) != 1:
			continue
		qualified[String(m["home"])] = true
		qualified[String(m["away"])] = true
	for w in winners:
		assert_bool(qualified.has(String(w))).override_failure_message(
			"조에서 다 이긴 %s가 본선에 못 갔다 — 예선 결과를 안 봤다" % w).is_true()

	# 본선 경기가 일정에 꽂혔다
	var pending: int = 0
	for g in _tour_games(s, "TOUR_UNIV_EUNHA"):
		if g.get("result", null) == null:
			pending += 1
	assert_int(pending).is_equal(4)


## ⚠ **본선을 한 번만 만든다.** 매번 다시 만들면 이미 치른 본선 결과가
## 통째로 날아간다
func test_the_final_bracket_is_built_once() -> void:
	var s: Dictionary = _univ_state()
	TournamentRunner.run(s, 14 * 7 - 6)
	_play(s, "TOUR_UNIV_EUNHA")
	TournamentRunner.run(s, 16 * 7)

	# 예선 성적을 적어 둔다 — 한 팀이 몇 경기를 치렀나
	var rec: Dictionary = TournamentRunner.of(s, "TOUR_UNIV_EUNHA")
	var team: String = String(rec["stage"]["groups"][0]["standings"][0]["team_id"])
	var played: int = _played_of(rec["stage"], team)
	assert_int(played).is_equal(2)

	# 본선 1라운드를 치르고 다시 부른다
	_play(s, "TOUR_UNIV_EUNHA")
	TournamentRunner.run(s, 16 * 7 + 1)
	rec = TournamentRunner.of(s, "TOUR_UNIV_EUNHA")
	var decided: int = 0
	for m in rec["bracket"]["matches"]:
		if int(m["round"]) == 1 and not String(m["winner"]).is_empty():
			decided += 1
	assert_int(decided).override_failure_message(
		"본선을 다시 만들어 1라운드 결과가 날아갔다").is_equal(4)

	# ⚠ **예선 성적이 두 번 쌓이면 안 된다.** 다시 만들면 조 순위가
	# 부풀려지고 진출팀이 달라진다
	assert_int(_played_of(rec["stage"], team)).override_failure_message(
		"예선 성적이 두 번 쌓였다 (%d경기 → %d경기)"
		% [played, _played_of(rec["stage"], team)]).is_equal(played)


func _played_of(stage: Dictionary, team_id: String) -> int:
	for g in stage["groups"]:
		for st in g["standings"]:
			if String(st["team_id"]) == team_id:
				return int(st["wins"]) + int(st["losses"]) + int(st["draws"])
	return -1


## 예선을 거쳐도 끝까지 가면 우승팀이 남는다
func test_a_group_tournament_also_finishes() -> void:
	var s: Dictionary = _univ_state()
	var day: int = 14 * 7 - 6
	for i in 30:
		TournamentRunner.run(s, day)
		if _play(s, "TOUR_UNIV_EUNHA") == 0:
			break
		day += 1
	assert_str(String(TournamentRunner.of(s, "TOUR_UNIV_EUNHA")["champion"])) \
		.override_failure_message("예선·본선을 다 치렀는데 우승팀이 없다") \
		.is_not_empty()


# ── 하루 진행에 이어졌나 ──────────────────────────────────────

## ⚠ **날마다 돌아야 한다.** 라운드가 대회 기간에 퍼져 있어서 주 경계에서만
## 보면 뒤 라운드가 경기 날짜를 지나친 뒤에 일정에 들어간다
func test_the_day_engine_opens_the_tournament() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_bool(TournamentRunner.of(out, "TOUR_HS_GAENARI").is_empty()) \
		.override_failure_message("하루 진행이 대회를 안 열었다").is_false()


## 오늘 열린 대회의 오늘 경기가 오늘 잡힌다 — 하루 늦으면 안 된다
func test_todays_matches_are_played_today() -> void:
	var s: Dictionary = _state(8, {"schedule": _league_history()})
	var out: Dictionary = DayEngine.advance_day(s)
	var tour_today: int = 0
	for g in out["games_today"]:
		if bool(g.get("is_tournament", false)):
			tour_today += 1
	assert_int(tour_today).override_failure_message(
		"오늘 연 대회 경기가 오늘 안 잡혔다").is_greater(0)
