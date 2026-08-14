extends GdUnitTestSuite

## 독립 생존리그 — 4단계로 좁혀 간다. B-4c.


func _teams(n: int) -> Array:
	var out: Array = []
	for i in n:
		out.append("IND_%02d" % i)
	return out


## 그 단계 경기에 결과를 넣는다. `winners`에 든 팀이 이긴다
func _play(games: Array, stage: int, winners: Array) -> void:
	var prefix: String = Survival.match_prefix(stage)
	for g in games:
		if not String(g["id"]).begins_with(prefix):
			continue
		var home_wins: bool = winners.has(String(g["home"]))
		g["result"] = {"home_score": 5 if home_wins else 1,
			"away_score": 1 if home_wins else 5,
			"winner_id": String(g["home"]) if home_wins else String(g["away"]),
			"loser_id": String(g["away"]) if home_wins else String(g["home"]),
			"player_lines": []}


func _standing(id: String, w: int, l: int, rf: int = 10,
		ra: int = 10) -> Dictionary:
	var decided: int = w + l
	return {"team_id": id, "wins": w, "losses": l, "draws": 0,
		"win_pct": float(w) / float(decided) if decided > 0 else 0.0,
		"runs_for": rf, "runs_against": ra}


# ── 단계 정의 ─────────────────────────────────────────────────

func test_the_stages_are_loaded() -> void:
	assert_int(Survival.stages().size()).is_equal(3)
	assert_str(Survival.league_id()).is_equal("LEAGUE_INDEPENDENT")
	assert_int(Survival.last_regular_stage()).is_equal(3)

	# 10 → 8 → 4로 좁혀진다
	assert_int(int(Survival.stage_def(1)["team_count"])).is_equal(10)
	assert_int(int(Survival.stage_def(1)["advance_count"])).is_equal(8)
	assert_int(int(Survival.stage_def(2)["team_count"])).is_equal(8)
	assert_int(int(Survival.stage_def(2)["advance_count"])).is_equal(4)
	assert_int(int(Survival.stage_def(3)["team_count"])).is_equal(4)


## 단계가 겹치지 않고 이어진다 — 겹치면 한 팀이 하루에 두 리그를 뛴다
func test_the_stages_do_not_overlap() -> void:
	var last_end: int = 0
	for s in Survival.stages():
		assert_int(int(s["start_week"])).override_failure_message(
			"%s가 앞 단계와 겹친다" % s["name"]).is_greater(last_end)
		assert_int(int(s["end_week"])).is_greater_equal(int(s["start_week"]))
		last_end = int(s["end_week"])
	# 사다리는 마지막 단계 뒤다
	assert_int(int(Survival.ladder_rules()["start_week"])).is_greater(last_end)


func test_it_finds_the_stage_starting_this_week() -> void:
	assert_int(Survival.stage_starting_at(10)).is_equal(1)
	assert_int(Survival.stage_starting_at(18)).is_equal(2)
	assert_int(Survival.stage_starting_at(24)).is_equal(3)
	assert_int(Survival.stage_starting_at(11)).override_failure_message(
		"단계 중간에 또 시작했다").is_equal(0)


## 경기 id 앞머리가 단계마다 다르다 — 그게 "그 단계만" 세는 근거다
func test_each_stage_has_its_own_prefix() -> void:
	assert_str(Survival.match_prefix(1)).is_not_equal(Survival.match_prefix(2))
	assert_str(Survival.match_prefix(1)).is_equal("INDS1_")


# ── 단계 일정 ─────────────────────────────────────────────────

## ⚠ **JSON 숫자는 float로 온다.** `Array.has()`는 형이 다르면 안 맞아서
## (`[2.0].has(2)`가 false다) 경기일이 0일이 되고 "기간이 모자라다"로만 보인다
func test_the_weekdays_come_out_as_ints() -> void:
	var wk: PackedInt32Array = Survival.weekdays()
	assert_int(wk.size()).is_equal(3)
	for w in wk:
		assert_int(typeof(w)).override_failure_message(
			"요일이 정수가 아니다 — 경기일 판정이 통째로 어긋난다") \
			.is_equal(TYPE_INT)
	# 실제로 경기일이 잡히는지까지 본다
	assert_int(Schedule.playable_days(2027, 64, 119, Array(wk)).size()) \
		.override_failure_message("이 요일로는 경기일이 안 잡힌다") \
		.is_greater_equal(18)


func test_a_stage_plays_its_target_games() -> void:
	var games: Array = Survival.stage_schedule(1, _teams(10), 2027, "IND_00")
	var per_team: Dictionary = {}
	for g in games:
		per_team[String(g["home"])] = int(per_team.get(String(g["home"]), 0)) + 1
		per_team[String(g["away"])] = int(per_team.get(String(g["away"]), 0)) + 1
	assert_int(per_team.size()).is_equal(10)
	for t in per_team:
		assert_int(int(per_team[t])).override_failure_message(
			"%s가 %d경기다 (18경기여야 한다)" % [t, per_team[t]]).is_equal(18)


## 단계 기간 안에서만 친다
func test_a_stage_stays_in_its_weeks() -> void:
	for stage in [1, 2, 3]:
		var d: Dictionary = Survival.stage_def(stage)
		var games: Array = Survival.stage_schedule(stage,
			_teams(int(d["team_count"])), 2027, "IND_00")
		assert_array(games).override_failure_message(
			"%d차 일정이 비었다" % stage).is_not_empty()
		for g in games:
			var w: int = Calendar.week_of(int(g["day"]))
			assert_int(w).override_failure_message(
				"%d차 경기가 W%d에 잡혔다 (%d~%d주여야 한다)"
				% [stage, w, d["start_week"], d["end_week"]]) \
				.is_between(int(d["start_week"]), int(d["end_week"]))


## 경기 id에 단계가 들어간다
func test_the_stage_is_in_the_match_id() -> void:
	for g in Survival.stage_schedule(2, _teams(8), 2027, "IND_00"):
		assert_str(String(g["id"])).starts_with("INDS2_")
		assert_int(int(g["survival_stage"])).is_equal(2)
		assert_str(String(g["league_id"])).is_equal("LEAGUE_INDEPENDENT")


## 내 경기를 표시한다 — 표시가 없으면 진행이 안 멈춘다
func test_my_games_are_marked() -> void:
	var games: Array = Survival.stage_schedule(1, _teams(10), 2027, "IND_03")
	var mine: int = 0
	for g in games:
		var involved: bool = String(g["home"]) == "IND_03" \
			or String(g["away"]) == "IND_03"
		assert_bool(bool(g["is_protagonist_game"])).is_equal(involved)
		if involved:
			mine += 1
	assert_int(mine).is_equal(18)


## 대회 경기가 아니다 — 리그 순위에서 안 빠져야 한다
func test_a_stage_game_is_not_a_tournament_game() -> void:
	for g in Survival.stage_schedule(1, _teams(10), 2027, "IND_00"):
		assert_bool(bool(g["is_tournament"])).is_false()


func test_a_stage_with_one_team_has_no_games() -> void:
	assert_array(Survival.stage_schedule(1, ["ONLY"], 2027, "")).is_empty()
	assert_array(Survival.stage_schedule(9, _teams(10), 2027, "")).is_empty()


# ── 단계 순위 ─────────────────────────────────────────────────

## ⚠ **단계마다 순위표를 리셋한다.** 누적을 쓰면 1차에서 벌어놓은 승수로
## 3차 순위가 정해져 "매 단계 새 승부"가 무의미해진다
func test_each_stage_counts_only_its_own_games() -> void:
	var teams: Array = _teams(4)
	var s1: Array = Survival.stage_schedule(1, teams, 2027, "")
	var s3: Array = Survival.stage_schedule(3, teams, 2027, "")
	# 1차는 IND_00이 다 이기고, 3차는 IND_03이 다 이긴다
	_play(s1, 1, ["IND_00"])
	_play(s3, 3, ["IND_03"])
	var schedule: Array = s1 + s3

	var t1: Array = Survival.stage_standings(1, teams, schedule)
	var t3: Array = Survival.stage_standings(3, teams, schedule)
	assert_str(String(Survival.rank(t1)[0])).is_equal("IND_00")
	assert_str(String(Survival.rank(t3)[0])).override_failure_message(
		"3차 순위가 1차 성적에 끌려갔다").is_equal("IND_03")


## ⚠ **안 치른 경기는 안 센다.** 세면 개막 전에 전 팀이 득실 0으로 뜨고
## 순위가 팀ID 순으로 굳는다
func test_unplayed_games_are_not_counted() -> void:
	var games: Array = Survival.stage_schedule(1, _teams(4), 2027, "")
	# 두 경기만 치른다
	games[0]["result"] = {"home_score": 7, "away_score": 2,
		"winner_id": String(games[0]["home"]), "loser_id": String(games[0]["away"])}
	var rows: Array = Survival.stage_standings(1, _teams(4), games)
	var total: int = 0
	for row in rows:
		total += int(row["wins"]) + int(row["losses"]) + int(row["draws"])
	assert_int(total).override_failure_message(
		"경기 하나만 치렀는데 %d경기가 셌다" % total).is_equal(2)


## ⚠ **홈·원정 득실을 각자 칸에 넣는다.** 뒤바꾸면 진 팀이 다득점으로
## 올라가 탈락 팀이 바뀐다
func test_the_runs_go_to_the_right_side() -> void:
	var games: Array = [{"id": "INDS1_Y2027_000", "day": 70, "home": "A",
		"away": "B", "result": {"home_score": 7, "away_score": 2,
			"winner_id": "A", "loser_id": "B"}}]
	for r in Survival.stage_standings(1, ["A", "B"], games):
		if String(r["team_id"]) == "A":
			assert_int(int(r["runs_for"])).is_equal(7)
			assert_int(int(r["runs_against"])).is_equal(2)
		else:
			assert_int(int(r["runs_for"])).override_failure_message(
				"원정팀 득점이 뒤바뀌었다").is_equal(2)
			assert_int(int(r["runs_against"])).is_equal(7)


## ⚠ **이 단계에 없는 팀은 안 센다.** 세면 잘린 팀이 순위표에 되살아난다
func test_a_team_outside_the_stage_is_ignored() -> void:
	var games: Array = [{"id": "INDS2_Y2027_000", "day": 130, "home": "A",
		"away": "GONE", "result": {"home_score": 5, "away_score": 1,
			"winner_id": "A", "loser_id": "GONE"}}]
	var rows: Array = Survival.stage_standings(2, ["A", "B"], games)
	assert_int(rows.size()).is_equal(2)
	for r in rows:
		assert_int(int(r["wins"]) + int(r["losses"])).override_failure_message(
			"이 단계에 없는 팀과의 경기를 셌다").is_equal(0)


## 무승부는 승률 분모에서 뺀다 — 리그 순위표와 같은 규칙이다
func test_a_draw_is_out_of_the_denominator() -> void:
	var teams: Array = ["A", "B"]
	# 1승 1무 — 분모에 무승부가 들어가면 5할이 된다
	var games: Array = [
		{"id": "INDS1_Y2027_000", "day": 70, "home": "A", "away": "B",
			"result": {"home_score": 3, "away_score": 3,
				"winner_id": "A", "loser_id": ""}},
		{"id": "INDS1_Y2027_001", "day": 72, "home": "A", "away": "B",
			"result": {"home_score": 5, "away_score": 1,
				"winner_id": "A", "loser_id": "B"}}]
	for r in Survival.stage_standings(1, teams, games):
		assert_int(int(r["draws"])).is_equal(1)
		if String(r["team_id"]) == "A":
			assert_float(float(r["win_pct"])).override_failure_message(
				"1승 1무가 %.3f다 — 무승부가 분모에 들어갔다" % r["win_pct"]) \
				.is_equal(1.0)
		else:
			assert_float(float(r["win_pct"])).is_equal(0.0)


## 순위는 승률 → 다득점 → 실점 적은 순 → 팀ID
func test_the_ranking_breaks_ties_all_the_way_down() -> void:
	assert_array(Survival.rank([_standing("A", 1, 2), _standing("B", 2, 1)])) \
		.is_equal(["B", "A"])
	# 승률 동률 — 다득점
	assert_array(Survival.rank([
		_standing("A", 1, 1, 5, 5), _standing("B", 1, 1, 20, 5)])) \
		.override_failure_message("동률에서 다득점을 안 봤다").is_equal(["B", "A"])
	# 다득점까지 같으면 실점 적은 쪽
	assert_array(Survival.rank([
		_standing("A", 1, 1, 10, 20), _standing("B", 1, 1, 10, 3)])) \
		.override_failure_message("동률에서 실점을 안 봤다").is_equal(["B", "A"])
	# ⚠ **완전 동률에서 순서가 흔들리면 탈락 팀이 바뀐다**
	assert_array(Survival.rank([
		_standing("Z", 1, 1, 10, 10), _standing("A", 1, 1, 10, 10)])) \
		.is_equal(["A", "Z"])


# ── 자르기 ────────────────────────────────────────────────────

func test_the_cutoff_splits_the_field() -> void:
	var standings: Array = []
	for i in 10:
		standings.append(_standing("IND_%02d" % i, 10 - i, i))
	var out: Dictionary = Survival.cutoff(standings, 8)

	assert_int(out["survivors"].size()).is_equal(8)
	assert_int(out["eliminated"].size()).override_failure_message(
		"하위 2팀이 안 잘렸다").is_equal(2)
	assert_int(out["ranked"].size()).is_equal(10)
	# 꼴찌 둘이 잘린다
	assert_array(out["eliminated"]).is_equal(["IND_08", "IND_09"])
	assert_str(String(out["survivors"][0])).is_equal("IND_00")


## ⚠ **참가팀보다 많이 올릴 수 없다.** 넘치면 없는 팀이 다음 단계에 선다
func test_the_cutoff_cannot_advance_more_than_it_has() -> void:
	var out: Dictionary = Survival.cutoff(
		[_standing("A", 1, 0), _standing("B", 0, 1)], 8)
	assert_int(out["survivors"].size()).override_failure_message(
		"두 팀뿐인데 %d팀이 올라갔다" % out["survivors"].size()).is_equal(2)
	assert_array(out["eliminated"]).is_empty()
	for t in out["survivors"]:
		assert_str(String(t)).is_not_empty()


# ── 사다리 ────────────────────────────────────────────────────

## ⚠ **4팀 사다리다.** 02의 구 코드는 "1위 vs 2위 단판" 하나뿐이라
## 4팀을 표현 못 했다
func test_the_ladder_is_three_series() -> void:
	var ladder: Array = Survival.build_ladder(["T1", "T2", "T3", "T4"])
	assert_int(ladder.size()).is_equal(3)

	var semi: Dictionary = ladder[0]
	assert_str(String(semi["round"])).is_equal("준PO")
	assert_str(String(semi["home_team_id"])).override_failure_message(
		"준PO 홈이 3위가 아니다").is_equal("T3")
	assert_str(String(semi["away_team_id"])).is_equal("T4")
	assert_int(int(semi["best_of"])).is_equal(1)

	var po: Dictionary = ladder[1]
	assert_str(String(po["home_team_id"])).is_equal("T2")
	assert_str(String(po["away_team_id"])).override_failure_message(
		"PO 원정 자리가 미리 채워졌다").is_empty()
	assert_str(String(po["away_from"])).is_equal("IND_SEMIPO")

	var final_series: Dictionary = ladder[2]
	assert_str(String(final_series["home_team_id"])).is_equal("T1")
	assert_str(String(final_series["away_from"])).is_equal("IND_PO")
	assert_int(int(final_series["best_of"])).override_failure_message(
		"챔피언결정전이 단판이다").is_equal(3)


## 사다리가 `Bracket`이 읽는 모양이다 — 두 벌로 두면 화면이 못 읽는다
func test_the_ladder_is_a_bracket() -> void:
	var ladder: Array = Survival.build_ladder(["T1", "T2", "T3", "T4"])
	var rounds: Array = Bracket.to_rounds(ladder)
	assert_int(rounds.size()).override_failure_message(
		"사다리가 3라운드로 안 풀린다").is_equal(3)
	# 제일 먼저 하는 경기가 앞이다
	assert_str(String(rounds[0]["label"])).is_equal("준PO")
	assert_str(String(rounds[2]["label"])).is_equal("챔피언결정전")
	assert_str(Bracket.champion(ladder)).is_empty()


## 4팀이 안 되면 사다리가 없다 — 없는 팀을 세우면 안 된다
func test_a_short_field_has_no_ladder() -> void:
	assert_array(Survival.build_ladder(["T1", "T2", "T3"])).is_empty()
	assert_array(Survival.build_ladder([])).is_empty()
